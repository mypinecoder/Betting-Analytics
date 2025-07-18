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
from collections import defaultdict
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
    except:
        return None

def parse_prize_money(prize_str):
    """Parse prize money from string format to float"""
    if pd.isna(prize_str):
        return 0
    prize_str = str(prize_str).replace('$', '').replace(',', '').replace('k', '000')
    try:
        return float(prize_str)
    except:
        return 0

def clean_and_standardize_data(dataframes: Dict) -> Dict:
    """Cleans and standardizes each individual DataFrame."""
    track_name_map = {
        "Ladbrokes Cannon Park": "Cairns", 
        "Sportsbet-Ballarat Synthetic": "Ballarat Synthetic"
    }

    if 'tips' in dataframes:
        tips_df = dataframes['tips']
        # Melt the tips data to long format
        id_vars = ['Tip Website', 'Scrape Date', 'Track', 'Race']
        
        # Get all selection columns
        selection_cols = []
        name_cols = []
        for col in tips_df.columns:
            if 'Selection Name' in col:
                name_cols.append(col)
            elif 'Selection' in col and 'Name' not in col:
                selection_cols.append(col)
        
        # Create separate dataframes for selections and names
        tips_long = []
        for idx, row in tips_df.iterrows():
            for i, (sel_col, name_col) in enumerate(zip(selection_cols, name_cols)):
                if pd.notna(row[name_col]):
                    tips_long.append({
                        'Tip Website': row['Tip Website'],
                        'Scrape Date': row['Scrape Date'],
                        'Track': row['Track'],
                        'Race': row['Race'],
                        'Selection Position': i + 1,
                        'Selection Number': row[sel_col],
                        'Horse Name': row[name_col]
                    })
        
        tips_df = pd.DataFrame(tips_long)
        tips_df['Track'] = tips_df['Track'].replace(track_name_map)
        dataframes['tips'] = tips_df

    if 'race_data' in dataframes:
        race_data_df = dataframes['race_data']
        race_data_df = race_data_df.rename(columns={
            'HorseName': 'Horse Name', 
            'RaceTrack': 'Track', 
            'RaceNum': 'Race'
        })
        race_data_df['Race'] = race_data_df['Race'].str.replace('R', '', regex=False).astype(int)
        race_data_df['Track'] = race_data_df['Track'].replace(track_name_map)
        
        # Parse numeric fields
        race_data_df['BestOdds'] = race_data_df['BestOdds'].apply(parse_odds_string)
        race_data_df['Prize_Numeric'] = race_data_df['Prize'].apply(parse_prize_money)
        
        dataframes['race_data'] = race_data_df

    for price_type in ['win_prices', 'place_prices']:
        if price_type in dataframes:
            prices_df = dataframes[price_type]
            prices_df['Track'] = prices_df['menu_hint'].str.split(r' \(').str[0]
            prices_df = prices_df.rename(columns={'selection_name': 'Horse Name'})
            
            # Extract race number from event_name
            prices_df['Race'] = prices_df['event_name'].str.extract(r'R(\d+)').astype(float)
            
            # Parse numeric columns
            numeric_cols = ['bsp', 'ppwap', 'morningwap', 'ppmax', 'ppmin', 
                          'morningtradedvol', 'pptradedvol', 'iptradedvol']
            for col in numeric_cols:
                if col in prices_df.columns:
                    prices_df[col] = pd.to_numeric(prices_df[col], errors='coerce')
            
            dataframes[price_type] = prices_df
            
    return dataframes

def calculate_roi(tips_df, win_prices_df):
    """Calculate ROI for each tipster based on $1 level stakes"""
    roi_data = []
    
    for tipster in tips_df['Tip Website'].unique():
        tipster_tips = tips_df[tips_df['Tip Website'] == tipster]
        
        # Merge with win prices
        merged = pd.merge(
            tipster_tips, 
            win_prices_df[['Track', 'Horse Name', 'Race', 'win_lose', 'bsp']], 
            on=['Track', 'Horse Name', 'Race'], 
            how='left'
        )
        
        total_bets = len(merged)
        wins = merged[merged['win_lose'] == 1]
        total_return = wins['bsp'].sum()
        profit = total_return - total_bets
        roi = (profit / total_bets * 100) if total_bets > 0 else 0
        
        roi_data.append({
            'Tipster': tipster,
            'Total Tips': total_bets,
            'Winners': len(wins),
            'Strike Rate': len(wins) / total_bets * 100 if total_bets > 0 else 0,
            'Total Invested': total_bets,
            'Total Return': total_return,
            'Profit/Loss': profit,
            'ROI %': roi
        })
    
    return pd.DataFrame(roi_data)

def analyze_by_position(tips_df, win_prices_df):
    """Analyze performance by selection position (1st, 2nd, 3rd, 4th)"""
    position_data = []
    
    for position in tips_df['Selection Position'].unique():
        position_tips = tips_df[tips_df['Selection Position'] == position]
        
        merged = pd.merge(
            position_tips, 
            win_prices_df[['Track', 'Horse Name', 'Race', 'win_lose', 'bsp']], 
            on=['Track', 'Horse Name', 'Race'], 
            how='left'
        )
        
        total_tips = len(merged)
        wins = merged[merged['win_lose'] == 1]
        
        position_data.append({
            'Position': f'Selection {position}',
            'Total Tips': total_tips,
            'Winners': len(wins),
            'Strike Rate': len(wins) / total_tips * 100 if total_tips > 0 else 0,
            'Avg Win Odds': wins['bsp'].mean() if len(wins) > 0 else 0
        })
    
    return pd.DataFrame(position_data)

def analyze_market_movements(merged_df):
    """Analyze market movements between morning and BSP"""
    market_data = merged_df[merged_df['morningwap'].notna() & merged_df['bsp'].notna()].copy()
    
    if len(market_data) == 0:
        return pd.DataFrame()
    
    market_data['price_movement'] = ((market_data['bsp'] - market_data['morningwap']) / 
                                    market_data['morningwap'] * 100)
    
    # Categorize movements
    market_data['movement_category'] = pd.cut(
        market_data['price_movement'], 
        bins=[-float('inf'), -20, -10, 0, 10, 20, float('inf')],
        labels=['Strong Shortening', 'Moderate Shortening', 'Slight Shortening', 
                'Slight Drifting', 'Moderate Drifting', 'Strong Drifting']
    )
    
    return market_data

def perform_full_analysis(dataframes: Dict) -> Dict:
    """Performs a comprehensive analysis on the provided data."""
    response = {
        "kpis": {},
        "tipster_analysis": {},
        "market_analysis": {},
        "factor_analysis": {},
        "position_analysis": {},
        "track_analysis": {},
        "time_analysis": {},
        "raw_data": {}
    }
    
    # Get base dataframes
    tips_df = dataframes.get('tips', pd.DataFrame())
    race_data_df = dataframes.get('race_data', pd.DataFrame())
    win_prices_df = dataframes.get('win_prices', pd.DataFrame())
    place_prices_df = dataframes.get('place_prices', pd.DataFrame())
    
    if tips_df.empty:
        return response
    
    # Create merged dataset
    merged_df = tips_df.copy()
    
    if not race_data_df.empty:
        merged_df = pd.merge(
            merged_df, 
            race_data_df, 
            on=['Track', 'Race', 'Horse Name'], 
            how='left'
        )
    
    if not win_prices_df.empty:
        win_subset = win_prices_df[['Track', 'Race', 'Horse Name', 'win_lose', 'bsp', 
                                   'ppwap', 'morningwap', 'ppmax', 'ppmin',
                                   'morningtradedvol', 'pptradedvol', 'iptradedvol']]
        merged_df = pd.merge(merged_df, win_subset, on=['Track', 'Race', 'Horse Name'], how='left')
    
    if not place_prices_df.empty:
        place_subset = place_prices_df[['Track', 'Race', 'Horse Name', 'win_lose']].rename(
            columns={'win_lose': 'place_result'}
        )
        merged_df = pd.merge(merged_df, place_subset, on=['Track', 'Race', 'Horse Name'], how='left')
    
    # Calculate KPIs
    response['kpis'] = {
        'total_tips': len(tips_df),
        'unique_tipsters': tips_df['Tip Website'].nunique(),
        'unique_tracks': tips_df['Track'].nunique(),
        'unique_races': len(tips_df.groupby(['Track', 'Race'])),
        'total_prize_money': race_data_df['Prize_Numeric'].sum() if 'Prize_Numeric' in race_data_df.columns else 0,
        'avg_field_size': race_data_df.groupby(['Track', 'Race'])['Horse Name'].count().mean() if not race_data_df.empty else 0
    }
    
    # Tipster Performance Analysis
    if not win_prices_df.empty:
        roi_analysis = calculate_roi(tips_df, win_prices_df)
        response['tipster_analysis']['roi_summary'] = roi_analysis.to_dict(orient='records')
        
        # Best and worst performers
        response['tipster_analysis']['best_roi'] = roi_analysis.nlargest(5, 'ROI %').to_dict(orient='records')
        response['tipster_analysis']['best_strike_rate'] = roi_analysis.nlargest(5, 'Strike Rate').to_dict(orient='records')
    
    # Position Analysis
    if not win_prices_df.empty:
        position_analysis = analyze_by_position(tips_df, win_prices_df)
        response['position_analysis'] = position_analysis.to_dict(orient='records')
    
    # Market Analysis
    if 'bsp' in merged_df.columns and 'morningwap' in merged_df.columns:
        market_movements = analyze_market_movements(merged_df)
        if not market_movements.empty:
            movement_summary = market_movements['movement_category'].value_counts().to_dict()
            response['market_analysis']['movement_categories'] = movement_summary
            
            # Average movements by tipster
            tipster_movements = market_movements.groupby('Tip Website')['price_movement'].agg(['mean', 'std']).reset_index()
            response['market_analysis']['tipster_movements'] = tipster_movements.to_dict(orient='records')
    
    # Track Analysis
    track_performance = merged_df.groupby('Track').agg({
        'Horse Name': 'count',
        'win_lose': 'sum' if 'win_lose' in merged_df.columns else lambda x: 0
    }).reset_index()
    track_performance.columns = ['Track', 'Total Tips', 'Winners']
    track_performance['Strike Rate'] = (track_performance['Winners'] / 
                                       track_performance['Total Tips'] * 100)
    response['track_analysis'] = track_performance.to_dict(orient='records')
    
    # Time-based Analysis
    if 'RaceTime' in merged_df.columns:
        merged_df['Hour'] = pd.to_datetime(merged_df['RaceTime'], format='%H:%M:%S', errors='coerce').dt.hour
        hourly_performance = merged_df.groupby('Hour').agg({
            'Horse Name': 'count',
            'win_lose': 'sum' if 'win_lose' in merged_df.columns else lambda x: 0
        }).reset_index()
        hourly_performance.columns = ['Hour', 'Total Tips', 'Winners']
        response['time_analysis']['hourly'] = hourly_performance.to_dict(orient='records')
    
    # Factor Analysis
    if 'JockeyName' in merged_df.columns:
        jockey_tips = merged_df['JockeyName'].value_counts().head(20)
        response['factor_analysis']['top_jockeys'] = {
            'labels': jockey_tips.index.tolist(),
            'data': jockey_tips.values.tolist()
        }
    
    if 'Barrier' in merged_df.columns:
        barrier_analysis = merged_df.groupby('Barrier').agg({
            'Horse Name': 'count',
            'win_lose': 'sum' if 'win_lose' in merged_df.columns else lambda x: 0
        }).reset_index()
        response['factor_analysis']['barrier_analysis'] = barrier_analysis.to_dict(orient='records')
    
    if 'Distance' in merged_df.columns:
        # Group distances into categories
        merged_df['Distance_Numeric'] = merged_df['Distance'].str.replace('m', '').astype(float)
        merged_df['Distance_Category'] = pd.cut(
            merged_df['Distance_Numeric'],
            bins=[0, 1200, 1600, 2000, float('inf')],
            labels=['Sprint', 'Mile', 'Middle', 'Staying']
        )
        distance_analysis = merged_df.groupby('Distance_Category').size()
        response['factor_analysis']['distance_distribution'] = {
            'labels': distance_analysis.index.tolist(),
            'data': distance_analysis.values.tolist()
        }
    
    # Odds Analysis
    if 'BestOdds' in merged_df.columns:
        odds_ranges = pd.cut(
            merged_df['BestOdds'].dropna(),
            bins=[0, 3, 5, 10, 20, float('inf')],
            labels=['Favs (< $3)', 'Short ($3-5)', 'Medium ($5-10)', 'Long ($10-20)', 'Outsiders ($20+)']
        )
        odds_distribution = odds_ranges.value_counts()
        response['factor_analysis']['odds_distribution'] = {
            'labels': odds_distribution.index.tolist(),
            'data': odds_distribution.values.tolist()
        }
    
    # Volume Analysis
    if 'pptradedvol' in merged_df.columns:
        volume_by_tipster = merged_df.groupby('Tip Website')['pptradedvol'].sum().sort_values(ascending=False)
        response['market_analysis']['volume_by_tipster'] = {
            'labels': volume_by_tipster.index.tolist(),
            'data': volume_by_tipster.values.tolist()
        }
    
    # Raw data samples for tables
    response['raw_data']['recent_tips'] = merged_df.head(100).to_dict(orient='records')
    response['raw_data']['summary_stats'] = {
        'total_selections': len(merged_df),
        'winning_selections': merged_df['win_lose'].sum() if 'win_lose' in merged_df.columns else 0,
        'avg_odds': merged_df['BestOdds'].mean() if 'BestOdds' in merged_df.columns else 0,
        'data_date': tips_df['Scrape Date'].iloc[0] if 'Scrape Date' in tips_df.columns else 'Unknown'
    }
    
    return clean_for_json(response)

@app.post("/analyze/")
async def analyze_betting_files(files: List[UploadFile] = File(...)):
    """Analyze uploaded betting CSV files"""
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
            else:
                # Try to identify by content
                df = pd.read_csv(io.BytesIO(content))
                if 'Tip Website' in df.columns:
                    dataframes["tips"] = df
                elif 'HorseName' in df.columns or 'RaceTrack' in df.columns:
                    dataframes["race_data"] = df
                elif 'bsp' in df.columns and 'win_lose' in df.columns:
                    if 'place' in filename:
                        dataframes["place_prices"] = df
                    else:
                        dataframes["win_prices"] = df
                        
        except Exception as e:
            raise HTTPException(
                status_code=400, 
                detail=f"Could not parse file: {file.filename}. Error: {str(e)}"
            )

    if not dataframes:
        raise HTTPException(status_code=400, detail="No valid data files were recognized.")

    try:
        cleaned_dataframes = clean_and_standardize_data(dataframes)
        analysis_results = perform_full_analysis(cleaned_dataframes)
        return analysis_results
    except Exception as e:
        tb_str = traceback.format_exc()
        raise HTTPException(
            status_code=500, 
            detail=f"An error occurred during data processing: {str(e)}\nTraceback: {tb_str}"
        )

@app.get("/health")
async def health_check():
    """Health check endpoint"""
    return {"status": "healthy", "timestamp": datetime.now().isoformat()}

# Static Files
script_dir = os.path.dirname(__file__)
frontend_dir = os.path.join(os.path.dirname(script_dir), "frontend")

if os.path.exists(frontend_dir):
    app.mount("/", StaticFiles(directory=frontend_dir, html=True), name="frontend")
else:
    logger.error(f"Frontend directory not found at: {frontend_dir}")
