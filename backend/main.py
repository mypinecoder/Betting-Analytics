import pandas as pd
import numpy as np
from fastapi import FastAPI, File, UploadFile, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from typing import List, Dict, Optional
import io
import re
import traceback
import math
from datetime import datetime
import os
import logging

# Setup logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(title="Advanced Betting Performance Analyzer API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

def clean_for_json(data):
    """Recursively cleans a data structure to make it JSON-compliant."""
    if isinstance(data, list):
        return [clean_for_json(item) for item in data]
    if isinstance(data, dict):
        return {key: clean_for_json(value) for key, value in data.items()}
    if isinstance(data, float) and (math.isnan(data) or math.isinf(data)):
        return None
    if pd.isna(data):
        return None
    return data

def parse_odds_string(odds_str):
    """Parse odds from string format to float"""
    if pd.isna(odds_str) or odds_str == 'N/A':
        return None
    try:
        return float(str(odds_str))
    except (ValueError, TypeError):
        return None

def parse_prize_money(prize_str):
    """Parse prize money from string format to float"""
    if pd.isna(prize_str):
        return 0
    prize_str = str(prize_str).replace('$', '').replace(',', '').replace('k', '000')
    try:
        return float(prize_str)
    except (ValueError, TypeError):
        return 0

def clean_and_standardize_data(dataframes: Dict) -> Dict:
    """Cleans and standardizes each individual DataFrame."""
    track_name_map = {
        "Ladbrokes Cannon Park": "Cairns",
        "Sportsbet-Ballarat Synthetic": "Ballarat Synthetic"
    }

    if 'tips' in dataframes:
        tips_df = dataframes['tips'].copy()
        
        new_cols = {}
        for col in tips_df.columns:
            if 'Selection' in col:
                parts = col.split(' ')
                if len(parts) > 1:
                    pos = parts[0]
                    stub = ' '.join(parts[1:])
                    new_cols[col] = f"{stub} {pos}"
        tips_df.rename(columns=new_cols, inplace=True)

        id_vars = ['Tip Website', 'Scrape Date', 'Track', 'Race']
        
        for var in id_vars:
            if var not in tips_df.columns:
                tips_df[var] = f'Unknown {var}'

        stubnames = ['Selection', 'Selection Name']
        if any(any(s in col for col in tips_df.columns) for s in stubnames):
            tips_long = pd.wide_to_long(
                tips_df,
                stubnames=stubnames,
                i=id_vars,
                j='PositionStr',
                sep=' ',
                suffix=r'\w+'
            ).reset_index()

            pos_map = {'First': 1, 'Second': 2, 'Third': 3, 'Fourth': 4}
            tips_long['Position'] = tips_long['PositionStr'].map(pos_map)
            
            tips_long.dropna(subset=['Position'], inplace=True)
            tips_long['Position'] = tips_long['Position'].astype(int)

            tips_long = tips_long.rename(columns={'Selection Name': 'Horse Name', 'Selection': 'Selection Number'})
            
            tips_long.drop(columns=['PositionStr'], inplace=True)
            tips_long['Track'] = tips_long['Track'].replace(track_name_map)
            dataframes['tips'] = tips_long
        else:
            dataframes['tips'] = pd.DataFrame(columns=id_vars + ['Position', 'Horse Name', 'Selection Number'])

    if 'race_data' in dataframes:
        race_data_df = dataframes['race_data'].copy()
        race_data_df = race_data_df.rename(columns={
            'HorseName': 'Horse Name', 'RaceTrack': 'Track', 'RaceNum': 'Race'
        })
        if 'Race' in race_data_df.columns:
            race_data_df['Race'] = race_data_df['Race'].astype(str).str.replace('R', '', regex=False).astype(int)
        race_data_df['Track'] = race_data_df['Track'].replace(track_name_map)
        
        race_data_df['BestOdds'] = race_data_df['BestOdds'].apply(parse_odds_string)
        race_data_df['Prize_Numeric'] = race_data_df['Prize'].apply(parse_prize_money)
        
        dataframes['race_data'] = race_data_df

    for price_type in ['win_prices', 'place_prices']:
        if price_type in dataframes:
            prices_df = dataframes[price_type].copy()
            if 'menu_hint' in prices_df.columns:
                prices_df['Track'] = prices_df['menu_hint'].str.split(r' \(').str[0]
            prices_df = prices_df.rename(columns={'selection_name': 'Horse Name'})
            
            if 'event_name' in prices_df.columns:
                prices_df['Race'] = prices_df['event_name'].str.extract(r'R(\d+)').astype(float)
            
            numeric_cols = ['bsp', 'ppwap', 'morningwap', 'ppmax', 'ppmin', 'morningtradedvol', 'pptradedvol', 'iptradedvol']
            for col in numeric_cols:
                if col in prices_df.columns:
                    prices_df[col] = pd.to_numeric(prices_df[col], errors='coerce')
            
            dataframes[price_type] = prices_df
            
    return dataframes

# --- Analysis Functions ---

def analyze_market_movers(win_prices_df):
    df = win_prices_df[['Horse Name', 'morningwap', 'bsp']].copy()
    df.dropna(subset=['morningwap', 'bsp'], inplace=True)
    df = df[df['morningwap'] > 0]
    if df.empty: return None
    df['change_pct'] = ((df['bsp'] - df['morningwap']) / df['morningwap']) * 100
    drifters = df.nlargest(5, 'change_pct')
    steamers = df.nsmallest(5, 'change_pct')
    market_movers = pd.concat([drifters, steamers]).sort_values('change_pct', ascending=False)
    return {'labels': market_movers['Horse Name'].tolist(), 'data': market_movers['change_pct'].tolist()}

def analyze_most_traded(win_prices_df):
    races_df = win_prices_df.groupby('event_name')['pptradedvol'].sum().nlargest(5).sort_values()
    most_traded_races = {'labels': races_df.index.tolist(), 'data': races_df.values.tolist()}
    horses_df = win_prices_df.nlargest(10, 'pptradedvol')[['Horse Name', 'event_name', 'pptradedvol']]
    most_traded_horses = horses_df.to_dict(orient='records')
    return most_traded_races, most_traded_horses

def analyze_best_odds_provider(race_data_df):
    if 'OddsSource' not in race_data_df.columns: return None
    provider_counts = race_data_df['OddsSource'].value_counts()
    return {'labels': provider_counts.index.tolist(), 'data': provider_counts.values.tolist()}

def analyze_jockey_performance(race_data_df):
    if 'JockeyName' not in race_data_df.columns or 'BestOdds' not in race_data_df.columns: return None
    jockey_stats = race_data_df.groupby('JockeyName').agg(
        num_rides=('JockeyName', 'count'),
        avg_odds=('BestOdds', 'mean')
    ).reset_index().sort_values('num_rides', ascending=False).head(20)
    return jockey_stats.to_dict(orient='records')

def analyze_tipster_strategy(tips_df, race_data_df):
    first_selections = tips_df[tips_df['Position'] == 1].copy()
    merged = pd.merge(first_selections, race_data_df[['Horse Name', 'Track', 'BestOdds']], on=['Horse Name', 'Track'], how='left')
    merged.dropna(subset=['BestOdds'], inplace=True)
    if merged.empty: return None
    tipster_avg_odds = merged.groupby('Tip Website')['BestOdds'].mean().sort_values(ascending=False)
    return {'labels': tipster_avg_odds.index.tolist(), 'data': tipster_avg_odds.values.tolist()}

def calculate_roi(merged_df):
    """Calculate ROI for tipsters if win/loss data is available."""
    merged_df['win_lose'] = pd.to_numeric(merged_df['win_lose'], errors='coerce')
    merged_df['bsp'] = pd.to_numeric(merged_df['bsp'], errors='coerce')
    
    valid_bets = merged_df.dropna(subset=['win_lose', 'bsp'])
    if valid_bets.empty: return None

    roi_data = []
    for tipster in valid_bets['Tip Website'].unique():
        tipster_tips = valid_bets[valid_bets['Tip Website'] == tipster]
        total_bets = len(tipster_tips)
        if total_bets == 0: continue

        wins = tipster_tips[tipster_tips['win_lose'] == 1]
        total_return = wins['bsp'].sum()
        profit = total_return - total_bets
        roi = (profit / total_bets * 100) if total_bets > 0 else 0
        
        roi_data.append({
            'Tipster': tipster, 'Total Tips': total_bets, 'Winners': len(wins),
            'Strike Rate': len(wins) / total_bets * 100, 'Profit/Loss': profit, 'ROI': roi
        })
    
    return sorted(roi_data, key=lambda x: x['ROI'], reverse=True)


def perform_full_analysis(dataframes: Dict) -> Dict:
    """Performs a comprehensive analysis, dynamically including visuals based on available data."""
    response = {"kpis": {}, "charts": {}, "tables": {}, "raw_data": {}}
    
    win_prices_df = dataframes.get('win_prices', pd.DataFrame())
    race_data_df = dataframes.get('race_data', pd.DataFrame())
    tips_df = dataframes.get('tips', pd.DataFrame())

    # --- Merged DataFrame ---
    merged_df = pd.DataFrame()
    if not tips_df.empty:
        merged_df = tips_df.copy()
        lenient_keys = ['Track', 'Horse Name']
        if not race_data_df.empty and all(k in merged_df.columns and k in race_data_df.columns for k in lenient_keys):
            merged_df = pd.merge(merged_df, race_data_df, on=lenient_keys, how='left', suffixes=('', '_race'))
        if not win_prices_df.empty and all(k in merged_df.columns and k in win_prices_df.columns for k in lenient_keys):
            merged_df = pd.merge(merged_df, win_prices_df, on=lenient_keys, how='left', suffixes=('', '_win'))

    # --- KPIs (only if data exists) ---
    if not tips_df.empty:
        response["kpis"]["total_tips"] = len(tips_df)
        response["kpis"]["total_tipsters"] = tips_df['Tip Website'].nunique()
    if not race_data_df.empty:
        response["kpis"]["total_races"] = race_data_df.groupby(['Track', 'Race']).ngroups
        response["kpis"]["total_tracks"] = race_data_df['Track'].nunique()
    if not win_prices_df.empty and 'pptradedvol' in win_prices_df.columns:
        response["kpis"]["total_traded_volume"] = win_prices_df['pptradedvol'].sum()

    # --- Standalone Analysis (from individual files) ---
    if not win_prices_df.empty:
        if 'morningwap' in win_prices_df.columns and 'bsp' in win_prices_df.columns:
            response["charts"]["market_movers"] = analyze_market_movers(win_prices_df)
        if 'pptradedvol' in win_prices_df.columns:
            races, horses = analyze_most_traded(win_prices_df)
            response["charts"]["most_traded_races"] = races
            response["tables"]["most_traded_horses"] = horses
    if not race_data_df.empty:
        if 'OddsSource' in race_data_df.columns:
            response["charts"]["best_odds_provider"] = analyze_best_odds_provider(race_data_df)
        if 'JockeyName' in race_data_df.columns:
            response["tables"]["jockey_performance"] = analyze_jockey_performance(race_data_df)
    if not tips_df.empty and not race_data_df.empty and 'BestOdds' in race_data_df.columns:
        response["charts"]["tipster_strategy"] = analyze_tipster_strategy(tips_df, race_data_df)

    # --- Merged Analysis (only if overlapping data exists) ---
    if not merged_df.empty:
        if 'win_lose' in merged_df.columns and 'bsp' in merged_df.columns and merged_df['bsp'].notna().any():
            response["tables"]["tipster_roi"] = calculate_roi(merged_df)

        if 'Barrier' in merged_df.columns and 'win_lose' in merged_df.columns and merged_df['win_lose'].notna().any():
            barrier_stats = merged_df.groupby('Barrier').agg(tips=('Barrier', 'size'), wins=('win_lose', 'sum')).reset_index()
            barrier_stats['strike_rate'] = (barrier_stats['wins'] / barrier_stats['tips'] * 100).fillna(0)
            response["charts"]["barrier_performance"] = {'labels': barrier_stats['Barrier'].astype(str).tolist(), 'data': barrier_stats['strike_rate'].tolist()}
        
        if 'BestOdds' in merged_df.columns and 'win_lose' in merged_df.columns and merged_df['win_lose'].notna().any():
            merged_df['odds_bin'] = pd.cut(merged_df['BestOdds'], bins=[0, 3, 5, 10, 20, 50, 1000], labels=['$1-3', '$3-5', '$5-10', '$10-20', '$20-50', '$50+'])
            odds_perf = merged_df.groupby('odds_bin')['win_lose'].value_counts(normalize=True).unstack().fillna(0)
            if 1 in odds_perf.columns:
                 response["charts"]["odds_performance"] = {'labels': odds_perf.index.astype(str).tolist(), 'data': (odds_perf[1] * 100).tolist()}

        if 'BestOdds' in merged_df.columns and 'bsp' in merged_df.columns and merged_df['bsp'].notna().any():
            tipster_market = merged_df.groupby('Tip Website').agg(avg_tip_odds=('BestOdds', 'mean'), avg_bsp=('bsp', 'mean')).dropna().reset_index()
            if not tipster_market.empty:
                response["charts"]["tipster_vs_market"] = {
                    'labels': tipster_market['Tip Website'].tolist(),
                    'datasets': [{'label': 'Avg Tipped Odds', 'data': tipster_market['avg_tip_odds'].tolist()},
                                 {'label': 'Avg BSP', 'data': tipster_market['avg_bsp'].tolist()}]}

        if 'JockeyName' in merged_df.columns:
            jockey_tips = merged_df['JockeyName'].value_counts().head(20)
            response['charts']['top_jockeys_by_tips'] = {'labels': jockey_tips.index.tolist(), 'data': jockey_tips.values.tolist()}
        
        if 'BestOdds' in merged_df.columns:
            odds_ranges = pd.cut(merged_df['BestOdds'].dropna(), bins=[0, 3, 5, 10, 20, float('inf')], labels=['Favs (< $3)', 'Short ($3-5)', 'Medium ($5-10)', 'Long ($10-20)', 'Outsiders ($20+)'])
            odds_distribution = odds_ranges.value_counts()
            response['charts']['odds_distribution'] = {'labels': odds_distribution.index.astype(str).tolist(), 'data': odds_distribution.values.tolist()}

    if not race_data_df.empty:
        field_sizes = race_data_df.groupby(['Track', 'Race'])['Horse Name'].count()
        response['charts']['field_size_distribution'] = {'labels': field_sizes.value_counts().sort_index().index.astype(str).tolist(), 'data': field_sizes.value_counts().sort_index().values.tolist()}
        if 'Prize_Numeric' in race_data_df.columns:
            prize_bins = pd.cut(race_data_df['Prize_Numeric'], bins=[0, 10000, 25000, 50000, 100000, float('inf')], labels=['<10k', '10-25k', '25-50k', '50-100k', '100k+'])
            response['charts']['prize_money_distribution'] = {'labels': prize_bins.value_counts().sort_index().index.astype(str).tolist(), 'data': prize_bins.value_counts().sort_index().values.tolist()}

    # Raw data sample
    if not merged_df.empty:
        raw_cols = {'Tip Website': 'Tipster', 'Track': 'Track', 'Race': 'Race', 'Position': 'Position', 'Horse Name': 'Horse', 'JockeyName': 'Jockey', 'Barrier': 'Barrier', 'BestOdds': 'Best Odds', 'bsp': 'BSP', 'win_lose': 'Result'}
        final_cols = [col for col in raw_cols.keys() if col in merged_df.columns]
        response['raw_data']['recent_tips'] = merged_df[final_cols].rename(columns=raw_cols).head(200).to_dict(orient='records')

    return clean_for_json(response)


@app.post("/analyze/")
async def analyze_betting_files(files: List[UploadFile] = File(...)):
    if not files:
        raise HTTPException(status_code=400, detail="No files uploaded.")
        
    dataframes = {}
    for file in files:
        filename = file.filename.lower()
        content = await file.read()
        try:
            df = pd.read_csv(io.BytesIO(content))
            if "race_data" in filename: dataframes["race_data"] = df
            elif "dwbfpricesauswin" in filename: dataframes["win_prices"] = df
            elif "dwbfpricesausplace" in filename: dataframes["place_prices"] = df
            elif re.search(r'\d{4}-\d{2}-\d{2}\.csv$', filename): dataframes["tips"] = df
            elif 'Tip Website' in df.columns: dataframes["tips"] = df
            elif 'HorseName' in df.columns and 'RaceTrack' in df.columns: dataframes["race_data"] = df
            elif 'bsp' in df.columns and 'win_lose' in df.columns:
                dataframes["win_prices"] = df if 'place' not in filename else dataframes.get("win_prices")
                dataframes["place_prices"] = df if 'place' in filename else dataframes.get("place_prices")
        except Exception as e:
            logger.error(f"Error parsing {file.filename}: {e}")
            continue

    if not dataframes:
        raise HTTPException(status_code=400, detail="No valid data files recognized.")

    try:
        cleaned_dataframes = clean_and_standardize_data(dataframes)
        analysis_results = perform_full_analysis(cleaned_dataframes)
        return analysis_results
    except Exception as e:
        tb_str = traceback.format_exc()
        logger.error(f"Analysis error: {e}\n{tb_str}")
        raise HTTPException(status_code=500, detail=f"An error occurred during data processing: {str(e)}")

@app.get("/health")
async def health_check():
    return {"status": "healthy", "timestamp": datetime.now().isoformat()}

# Static Files
script_dir = os.path.dirname(__file__)
frontend_dir = os.path.join(os.path.dirname(script_dir), "frontend")
if os.path.exists(frontend_dir):
    app.mount("/", StaticFiles(directory=frontend_dir, html=True), name="frontend")
else:
    logger.error(f"Frontend directory not found at: {frontend_dir}")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="localhost", port=8000)