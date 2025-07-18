import pandas as pd
import numpy as np
from fastapi import FastAPI, File, UploadFile, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from typing import List, Dict
import io
import re
import traceback
import math

app = FastAPI(title="Advanced Tipster Performance Analyzer API")

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
    return data

def clean_and_standardize_data(dataframes: Dict) -> Dict:
    """Cleans and standardizes each individual DataFrame."""
    track_name_map = {"Ladbrokes Cannon Park": "Cairns", "Sportsbet-Ballarat Synthetic": "Ballarat Synthetic"}

    if 'tips' in dataframes:
        tips_df = dataframes['tips']
        id_vars = ['Tip Website', 'Track', 'Race']
        value_vars = [col for col in tips_df.columns if 'Selection Name' in col]
        tips_df = pd.melt(tips_df, id_vars=id_vars, value_vars=value_vars, value_name='Horse Name').dropna(subset=['Horse Name'])
        tips_df['Track'] = tips_df['Track'].replace(track_name_map)
        dataframes['tips'] = tips_df

    if 'race_data' in dataframes:
        race_data_df = dataframes['race_data'].rename(columns={'HorseName': 'Horse Name', 'RaceTrack': 'Track', 'RaceNum': 'Race'})
        race_data_df['Race'] = race_data_df['Race'].str.replace('R', '', regex=False).astype(int)
        race_data_df['Track'] = race_data_df['Track'].replace(track_name_map)
        dataframes['race_data'] = race_data_df

    for price_type in ['win_prices', 'place_prices']:
        if price_type in dataframes:
            prices_df = dataframes[price_type]
            prices_df['Track'] = prices_df['menu_hint'].str.split(r' \(').str[0]
            prices_df = prices_df.rename(columns={'selection_name': 'Horse Name'})
            dataframes[price_type] = prices_df
            
    return dataframes

def perform_full_analysis(dataframes: Dict) -> Dict:
    """Performs a full, multi-faceted analysis on the provided data."""
    response = {"analyses": {}, "raw_data": {}, "kpis": {}}
    
    # --- MERGE DATA ---
    # Start with tips, then progressively merge other data onto it.
    merged_df = dataframes.get('tips', pd.DataFrame())
    if merged_df.empty:
        return response # Not much to do without tips

    if 'race_data' in dataframes:
        merged_df = pd.merge(merged_df, dataframes['race_data'], on=['Track', 'Race', 'Horse Name'], how='left')
    if 'win_prices' in dataframes:
        win_prices_subset = dataframes['win_prices'].add_suffix('_win').rename(columns={'Track_win': 'Track', 'Horse Name_win': 'Horse Name'})
        merged_df = pd.merge(merged_df, win_prices_subset, on=['Track', 'Horse Name'], how='left')
    if 'place_prices' in dataframes:
        place_prices_subset = dataframes['place_prices'].add_suffix('_place').rename(columns={'Track_place': 'Track', 'Horse Name_place': 'Horse Name'})
        merged_df = pd.merge(merged_df, place_prices_subset, on=['Track', 'Horse Name'], how='left')

    # --- POPULATE RESPONSE ---
    
    # Raw Data for Tables
    response['raw_data']['tips'] = dataframes.get('tips', pd.DataFrame()).to_dict(orient='records')
    response['raw_data']['races'] = dataframes.get('race_data', pd.DataFrame()).to_dict(orient='records')
    response['raw_data']['merged'] = merged_df.to_dict(orient='records')
    
    # KPIs
    if 'JockeyName' in merged_df.columns:
        response['kpis']['most_tipped_jockey'] = merged_df['JockeyName'].mode().iloc[0] if not merged_df['JockeyName'].mode().empty else "N/A"
    if 'bsp_win' in merged_df.columns:
        response['kpis']['avg_tipped_bsp'] = merged_df['bsp_win'].mean()
    if 'Prize' in merged_df.columns:
        merged_df['Prize_numeric'] = merged_df['Prize'].str.replace(r'[$,k]', '', regex=True).astype(float) * 1000
        response['kpis']['total_prize_money'] = merged_df.drop_duplicates(subset=['Track', 'Race'])['Prize_numeric'].sum()

    # Tipster Analysis
    tip_counts = merged_df['Tip Website'].value_counts()
    response['analyses']['tip_counts'] = {"labels": tip_counts.index.tolist(), "data": tip_counts.values.tolist()}
    
    # Factor Analysis (Jockey, Barrier)
    if 'JockeyName' in merged_df.columns:
        jockey_tips = merged_df['JockeyName'].value_counts().nlargest(15)
        response['analyses']['jockey_analysis'] = {"labels": jockey_tips.index.tolist(), "data": jockey_tips.values.tolist()}
    if 'Barrier' in merged_df.columns:
        barrier_tips = merged_df['Barrier'].value_counts().sort_index()
        response['analyses']['barrier_analysis'] = {"labels": barrier_tips.index.tolist(), "data": barrier_tips.values.tolist()}
    
    # Conditional analyses that require successful merges
    has_win_results = 'win_lose_win' in merged_df.columns and merged_df['win_lose_win'].notna().any()
    if has_win_results:
        stats_df = merged_df.groupby('Tip Website').agg(
            total_tips=('Horse Name', 'count'),
            winning_tips=('win_lose_win', 'sum'),
            placing_tips=('win_lose_place', 'sum'),
            avg_win_bsp=('bsp_win', 'mean'),
            avg_morning_wap=('morningwap_win', 'mean'),
            total_win_volume=('pptradedvol_win', 'sum'),
        ).reset_index()
        stats_df['win_strike_rate'] = (stats_df['winning_tips'] / stats_df['total_tips'] * 100)
        stats_df['place_strike_rate'] = (stats_df['placing_tips'] / stats_df['total_tips'] * 100)
        stats_df['bsp_vs_morning_diff'] = stats_df['avg_win_bsp'] - stats_df['avg_morning_wap']

        response['analyses']['tipster_performance'] = stats_df[['Tip Website', 'total_tips', 'win_strike_rate', 'place_strike_rate']].to_dict(orient='records')
        response['analyses']['market_drift'] = stats_df[['Tip Website', 'bsp_vs_morning_diff']].to_dict(orient='records')
        response['analyses']['market_volume'] = stats_df[['Tip Website', 'total_win_volume']].to_dict(orient='records')

    return clean_for_json(response)

@app.post("/analyze/")
async def analyze_betting_files(files: List[UploadFile] = File(...)):
    # ... (this function remains the same as the previous version)
    if not files:
        raise HTTPException(status_code=400, detail="No files uploaded.")
        
    dataframes = {}
    for file in files:
        filename = file.filename.lower()
        content = await file.read()
        try:
            if "race_data" in filename:
                dataframes["race_data"] = pd.read_csv(io.BytesIO(content))
            elif "dwbfpricesauswin" in filename:
                dataframes["win_prices"] = pd.read_csv(io.BytesIO(content))
            elif "dwbfpricesausplace" in filename:
                dataframes["place_prices"] = pd.read_csv(io.BytesIO(content))
            elif re.match(r'^\d{4}-\d{2}-\d{2}\.csv$', filename):
                dataframes["tips"] = pd.read_csv(io.BytesIO(content))
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"Could not parse file: {file.filename}. Error: {e}")

    if not dataframes:
        raise HTTPException(status_code=400, detail="No valid data files were recognized.")

    try:
        cleaned_dataframes = clean_and_standardize_data(dataframes)
        analysis_results = perform_full_analysis(cleaned_dataframes)
        return analysis_results
    except Exception as e:
        tb_str = traceback.format_exc()
        raise HTTPException(status_code=500, detail=f"An error occurred during data processing: {e}\nTraceback: {tb_str}")