# -----------------------------
# main.py (Definitive Final Version)
# -----------------------------
from typing import Dict, List
from fastapi import FastAPI, File, UploadFile, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
import pandas as pd
import numpy as np
import io, math, os, logging, traceback, re, unicodedata, sqlite3
from datetime import timedelta

# ---------- FastAPI Setup ----------
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)
app = FastAPI(title="Advanced Betting Performance Analyzer API")
app.add_middleware(
    CORSMiddleware, allow_origins=["*"], allow_credentials=True, allow_methods=["*"], allow_headers=["*"]
)

# ---------- DATABASE SETUP ----------
DATABASE_FILE = "betting_history.db"
HISTORY_TABLE = "betting_history"

def create_database():
    with sqlite3.connect(DATABASE_FILE) as conn:
        conn.execute(f"""
        CREATE TABLE IF NOT EXISTS {HISTORY_TABLE} (
            Date TEXT,
            Tip_Website TEXT,
            Track TEXT,
            Horse_Name TEXT,
            Race_Num REAL,
            bsp REAL,
            morningwap REAL,
            win_lose INTEGER,
            Profit REAL,
            BestOdds REAL,
            field_size REAL,
            upload_timestamp TEXT,
            UNIQUE(Date, Tip_Website, Track, Horse_Name, Race_Num)
        )
        """)

@app.on_event("startup")
def on_startup():
    create_database()

# ---------- UTILITIES ----------
def clean_for_json(data):
    if isinstance(data, (np.int64, np.int32)): return int(data)
    if isinstance(data, (np.float64, np.float32)):
        return float(data) if not (math.isnan(data) or math.isinf(data)) else 0
    if isinstance(data, list): return [clean_for_json(x) for x in data]
    if isinstance(data, dict): return {k: clean_for_json(v) for k, v in data.items()}
    if pd.isna(data): return None
    return data

def standardize_text(s, words_to_remove):
    if not isinstance(s, str): return ""
    s = unicodedata.normalize("NFKD", s).encode('ascii', 'ignore').decode('utf-8')
    s = s.lower().strip()
    s = re.sub(r"\s*\((?:[a-z]{2,3})\)\s*$", "", s)
    s = re.sub(r"[^\w\s]", " ", s)
    s = re.sub(r"^\d+\.?\s*", "", s)
    tokens = [t for t in s.split() if t not in words_to_remove]
    return " ".join(sorted(tokens))

def standardize_track(name):
    s = name.lower()
    s = re.sub(r'sportsbet-ballarat', 'ballarat', s)
    s = re.sub(r'royal randwick', 'randwick', s)
    return standardize_text(s, {"ladbrokes", "sportsbet", "bet365", "tabtouch", "tab"})

def standardize_horse(name):
    return standardize_text(name, set())

def extract_race_num(x):
    if pd.isna(x): return np.nan
    m = re.search(r'\d+', str(x))
    return float(m.group(0)) if m else np.nan

def as_numeric_safe(series):
    return pd.to_numeric(series, errors="coerce").replace([np.inf, -np.inf], np.nan)

# ---------- DATA PROCESSING ----------
async def load_and_clean_files(files: List[UploadFile]) -> Dict:
    file_map = {"tips": [], "race_data": [], "prices": []}
    market_type = "win"
    for file in files:
        content = await file.read()
        df = pd.read_csv(io.BytesIO(content)) if file.filename.endswith('.csv') else pd.read_excel(io.BytesIO(content))
        cols = {c.strip().lower() for c in df.columns}
        if "first selection name" in cols or "tip website" in cols: file_map["tips"].append(df)
        elif "racetrack" in cols and "jockeyname" in cols: file_map["race_data"].append(df)
        elif "bsp" in cols and "win_lose" in cols:
            file_map["prices"].append(df)
            if "place" in file.filename.lower(): market_type = "place"
    
    if not file_map["tips"]: raise HTTPException(status_code=400, detail="A tips file is required.")

    tips_df = pd.concat(file_map["tips"], ignore_index=True).rename(columns=str.strip)
    tips_df.rename(columns={"First Selection Name": "Horse Name", "Scrape Date": "Date", "Tip Website": "Tip_Website"}, inplace=True)
    tips_df["Date"] = pd.to_datetime(tips_df["Date"], errors='coerce').dt.normalize()
    tips_df["Track_std"] = tips_df["Track"].astype(str).map(standardize_track)
    tips_df["Horse_std"] = tips_df["Horse Name"].astype(str).map(standardize_horse)
    tips_df["Race_Num"] = tips_df["Race"].apply(extract_race_num)
    
    cleaned_dfs = {"tips": tips_df, "market_type": market_type}

    if file_map["race_data"]:
        race_df = pd.concat(file_map["race_data"], ignore_index=True).rename(columns=str.strip)
        race_df.rename(columns={"RaceTrack": "Track", "HorseName": "Horse Name", "RaceNum": "Race"}, inplace=True)
        race_df["Track_std"] = race_df["Track"].astype(str).map(standardize_track)
        race_df["Horse_std"] = race_df["Horse Name"].astype(str).map(standardize_horse)
        race_df["Race_Num"] = race_df["Race"].apply(extract_race_num)
        race_df["BestOdds"] = as_numeric_safe(race_df.get("BestOdds"))
        if "Track_std" in race_df and "Race_Num" in race_df and "Horse_std" in race_df:
            race_df["field_size"] = race_df.groupby(["Track_std", "Race_Num"])["Horse_std"].transform('count')
        cleaned_dfs["race_data"] = race_df
        
    if file_map["prices"]:
        prices_df = pd.concat(file_map["prices"], ignore_index=True).rename(columns=str.strip)
        prices_df.rename(columns={"selection_name": "Horse Name", "event_dt": "Date"}, inplace=True)
        prices_df["Date"] = pd.to_datetime(prices_df["Date"], errors='coerce', dayfirst=True).dt.normalize()
        prices_df["Track"] = prices_df["menu_hint"].str.split(r" \(").str[0]
        prices_df["Track_std"] = prices_df["Track"].astype(str).map(standardize_track)
        prices_df["Horse_std"] = prices_df["Horse Name"].astype(str).map(standardize_horse)
        prices_df["Race_Num"] = prices_df["event_name"].apply(extract_race_num)
        for col in ["bsp", "morningwap", "win_lose"]: prices_df[col] = as_numeric_safe(prices_df.get(col))
        if 'win_lose' in prices_df.columns: prices_df["win_lose"] = prices_df["win_lose"].fillna(0).astype(int)
        cleaned_dfs["prices"] = prices_df
        
    return cleaned_dfs

def merge_data(cleaned_dfs: Dict) -> pd.DataFrame:
    tips_df = cleaned_dfs["tips"].dropna(subset=['Date', 'Track_std', 'Horse_std', 'Race_Num'])
    
    merged = tips_df
    if "race_data" in cleaned_dfs:
        race_df = cleaned_dfs["race_data"]
        merged = pd.merge(merged, race_df[['Track_std', 'Race_Num', 'Horse_std', 'BestOdds', 'field_size']],
                          on=['Track_std', 'Race_Num', 'Horse_std'], how='left')

    if "prices" in cleaned_dfs:
        prices_df = cleaned_dfs["prices"].dropna(subset=['Date'])
        merged = pd.merge_asof(
            merged.sort_values('Date'),
            prices_df.sort_values('Date'),
            on='Date', by=['Track_std', 'Horse_std', 'Race_Num'],
            direction='nearest', tolerance=pd.Timedelta(days=1)
        )
    else:
        for col in ["bsp", "morningwap", "win_lose"]: merged[col] = np.nan
    
    merged["win_lose"] = merged["win_lose"].fillna(0)
    profit = np.where(merged["win_lose"] == 1, merged.get("bsp", 1) - 1, -1)
    profit[merged["bsp"].isna()] = -1
    merged["Profit"] = pd.Series(profit, index=merged.index)
    return merged

@app.post("/analyze/")
async def analyze_betting_files(files: List[UploadFile] = File(...)):
    try:
        cleaned_dfs = await load_and_clean_files(files)
        new_data_df = merge_data(cleaned_dfs)
        new_data_df["upload_timestamp"] = pd.Timestamp.now().strftime("%Y-%m-%d %H:%M:%S")

        with sqlite3.connect(DATABASE_FILE) as conn:
            try:
                historical_df = pd.read_sql(f"SELECT * FROM {HISTORY_TABLE}", conn, parse_dates=['Date'])
                combined_df = pd.concat([historical_df, new_data_df], ignore_index=True)
            except Exception:
                combined_df = new_data_df
            
            key_cols = ["Date", "Tip_Website", "Track", "Horse_Name", "Race_Num"]
            combined_df.drop_duplicates(subset=key_cols, keep='last', inplace=True)
            
            cols_to_save = [col for col in ['Date', 'Tip_Website', 'Track', 'Horse_Name', 'Race_Num', 'bsp', 'morningwap', 'win_lose', 'Profit', 'BestOdds', 'field_size', 'upload_timestamp'] if col in combined_df.columns]
            
            # --- DATABASE TIMESTAMP FIX ---
            df_to_save = combined_df[cols_to_save].copy()
            df_to_save['Date'] = pd.to_datetime(df_to_save['Date']).dt.strftime('%Y-%m-%d %H:%M:%S')
            df_to_save.to_sql(HISTORY_TABLE, conn, if_exists='replace', index=False)
            
            full_history_df = pd.read_sql(f"SELECT * FROM {HISTORY_TABLE}", conn, parse_dates=['Date'])

        return perform_full_analysis(full_history_df)
    except Exception as e:
        logger.error(f"Analysis error: {e}\n{traceback.format_exc()}")
        raise HTTPException(status_code=500, detail=f"Error during analysis: {str(e)}")

@app.post("/clear_history")
async def clear_history():
    try:
        if os.path.exists(DATABASE_FILE):
            os.remove(DATABASE_FILE)
            create_database()
            return JSONResponse(content={"message": "Database history cleared successfully."})
        return JSONResponse(content={"message": "No history to clear."})
    except Exception as e:
        logger.error(f"Could not clear database: {e}\n{traceback.format_exc()}")
        raise HTTPException(status_code=500, detail=f"Could not clear database: {e}")

# ---------- Main Analysis Function ----------
def perform_full_analysis(merged: pd.DataFrame) -> Dict:
    response = {"daily_summary": [], "charts": {}}
    chart_keys = ["cumulative_profit", "rolling_roi", "roi_by_tipster", "roi_by_odds",
                  "price_movement_histogram", "clv_trend", "win_rate_vs_field_size"]
    for k in chart_keys:
        response["charts"][k] = {"labels": ["No Data Available"], "datasets": []}

    merged['Date'] = pd.to_datetime(merged['Date'])
    
    if 'Date' in merged.columns and not merged['Date'].isna().all():
        for d, g in merged.groupby(merged['Date'].dt.date):
            bets, rtn = len(g), g.loc[g["win_lose"] == 1, 'bsp'].sum() if 'bsp' in g else 0.0
            valid_morning = g["bsp"].notna() & g["morningwap"].notna() & (g["morningwap"] > 0)
            response["daily_summary"].append({
                "Date": str(d), "Bets Placed": bets, "Units Staked": bets, "Units Returned": float(rtn),
                "ROI %": ((rtn - bets) / bets) * 100 if bets > 0 else 0, "Win Rate %": g["win_lose"].mean() * 100,
                "Avg Odds": g["bsp"].mean() if g["bsp"].notna().any() else 0, "CLV %": 0,
                "Drifters %": (g.loc[valid_morning, "bsp"] > g.loc[valid_morning, "morningwap"]).mean() * 100 if valid_morning.any() else 0,
                "Steamers %": (g.loc[valid_morning, "bsp"] < g.loc[valid_morning, "morningwap"]).mean() * 100 if valid_morning.any() else 0,
            })
    
    try:
        if 'Profit' in merged.columns and merged['Profit'].notna().any():
            dp = merged.groupby(["Tip_Website", merged['Date'].dt.date])["Profit"].sum().reset_index()
            pivot = dp.pivot_table(index="Date", columns="Tip_Website", values="Profit").fillna(0).sort_index().cumsum()
            if not pivot.empty and len(pivot.index.unique()) < 3:
                start_date = pivot.index.min() - timedelta(days=1)
                zero_row = pd.DataFrame(0, index=[start_date], columns=pivot.columns)
                pivot = pd.concat([zero_row, pivot]).sort_index()
            if not pivot.empty:
                response["charts"]["cumulative_profit"] = {"labels": [d.strftime("%Y-%m-%d") for d in pivot.index], "datasets": [{"name": c, "data": pivot[c].round(2).tolist()} for c in pivot.columns]}
    except Exception: pass

    try:
        if 'Profit' in merged.columns and merged['Profit'].notna().any() and len(merged['Date'].dropna().unique()) > 1:
            agg = merged.groupby([merged['Date'].dt.date, 'Tip_Website']).agg(Profit=('Profit', 'sum'), Bets=('Profit', 'size')).reset_index()
            agg['Date'] = pd.to_datetime(agg['Date'])
            if not agg.empty:
                full_idx = pd.date_range(start=agg['Date'].min(), end=agg['Date'].max(), freq='D')
                profit_pivot = agg.pivot_table(index='Date', columns='Tip_Website', values='Profit').reindex(full_idx, fill_value=0)
                bets_pivot = agg.pivot_table(index='Date', columns='Tip_Website', values='Bets').reindex(full_idx, fill_value=0)
                rolling_profit = profit_pivot.rolling('30D', min_periods=1).sum()
                rolling_bets = bets_pivot.rolling('30D', min_periods=1).sum()
                rolling_roi = (rolling_profit / rolling_bets.replace(0, np.nan)).fillna(0) * 100
                if len(rolling_roi.index) < 3:
                     start_date = rolling_roi.index.min() - timedelta(days=1)
                     zero_row = pd.DataFrame(0, index=[start_date], columns=rolling_roi.columns)
                     rolling_roi = pd.concat([zero_row, rolling_roi]).sort_index()
                response["charts"]["rolling_roi"] = {"labels": [d.strftime("%Y-%m-%d") for d in rolling_roi.index], "datasets": [{"name": c, "data": rolling_roi[c].round(2).tolist()} for c in rolling_roi.columns]}
    except Exception: pass
    
    try:
        rbt = merged.groupby("Tip_Website")["Profit"].mean().fillna(0) * 100
        response["charts"]["roi_by_tipster"] = {"labels": rbt.index.tolist(), "datasets": [{"name": "ROI", "data": rbt.round(2).tolist()}]}
    except Exception: pass

    try:
        if 'bsp' in merged.columns and merged['bsp'].notna().any():
            valid_data = merged.dropna(subset=['bsp', 'Profit']).copy()
            if not valid_data.empty:
                valid_data["odds_bin"] = pd.cut(valid_data["bsp"], bins=[1, 3, 5, 10, 20, 50, 1000], labels=["$1-3", "$3-5", "$5-10", "$10-20", "$20-50", "$50+"], right=False)
                rob = valid_data.groupby("odds_bin", observed=False)["Profit"].mean().fillna(0) * 100
                response["charts"]["roi_by_odds"] = {"labels": rob.index.astype(str).tolist(), "datasets": [{"name": "ROI", "data": rob.round(2).tolist()}]}
    except Exception: pass
    
    try:
        if 'morningwap' in merged.columns and merged['morningwap'].notna().any():
            valid_data = merged.dropna(subset=['bsp', 'morningwap'])
            valid_data = valid_data[valid_data['morningwap'] > 0]
            if len(valid_data) > 1:
                pmv = (valid_data["bsp"] - valid_data["morningwap"]) / valid_data["morningwap"]
                counts, bin_edges = np.histogram(pmv.dropna(), bins=20)
                if counts.sum() > 0:
                    labels = [f"{bin_edges[i]:.0%} to {bin_edges[i+1]:.0%}" for i in range(len(bin_edges) - 1)]
                    response["charts"]["price_movement_histogram"] = {"labels": labels, "datasets": [{"name": "Count", "data": counts.tolist()}]}
    except Exception: pass

    try:
        if 'BestOdds' in merged.columns and merged['BestOdds'].notna().any():
            valid_data = merged.dropna(subset=['bsp', 'BestOdds', 'Date'])
            valid_data = valid_data[(valid_data['bsp'] > 1) & (valid_data['BestOdds'] > 1)]
            if not valid_data.empty:
                valid_data['clv_metric'] = ((valid_data['bsp'] / valid_data['BestOdds']) - 1) * 100
                clvt = valid_data.groupby(valid_data['Date'].dt.date)['clv_metric'].mean()
                response["charts"]["clv_trend"] = {"labels": [d.strftime("%Y-%m-%d") for d in clvt.index], "datasets": [{"name": "CLV", "data": clvt.round(2).tolist()}]}
    except Exception: pass

    try:
        if 'field_size' in merged.columns and merged['field_size'].notna().any():
            valid_fs = merged.dropna(subset=['field_size', 'win_lose'])
            if not valid_fs.empty:
                grp = valid_fs.groupby(valid_fs["field_size"].round(0).astype(int))["win_lose"].mean().fillna(0) * 100
                response["charts"]["win_rate_vs_field_size"] = {"labels": [str(i) for i in grp.index], "datasets": [{"name": "Win Rate", "data": grp.round(2).tolist()}]}
    except Exception: pass

    return clean_for_json(response)

# ---------- Health & static frontend ----------
@app.get("/health")
async def health(): return {"status":"healthy"}

script_dir = os.path.dirname(__file__)
frontend_dir = os.path.join(os.path.dirname(script_dir), "frontend")
if os.path.exists(frontend_dir):
    favicon_path = os.path.join(frontend_dir, 'favicon_io', 'favicon.ico')
    if os.path.exists(favicon_path):
        @app.get("/favicon.ico", include_in_schema=False)
        async def favicon(): return FileResponse(favicon_path)
        
    app.mount("/", StaticFiles(directory=frontend_dir, html=True), name="frontend")
    
    @app.get("/", response_class=FileResponse)
    async def root(): return FileResponse(os.path.join(frontend_dir, 'index.html'))

# ---------- Run ----------
if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="127.0.0.1", port=8000, reload=True)