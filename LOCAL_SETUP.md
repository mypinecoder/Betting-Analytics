# Local Development Setup

## Prerequisites
- Python 3.8+
- Node.js (optional, for serving frontend)

## Backend Setup
1. Install Python dependencies:
```bash
pip install fastapi uvicorn pandas numpy python-multipart
```

2. Start the FastAPI server:
```bash
cd backend
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

## Frontend Setup
1. Serve the frontend (choose one method):

**Method A: Python HTTP Server**
```bash
cd frontend
python -m http.server 3000
```

**Method B: Node.js (if you have it)**
```bash
cd frontend
npx serve -p 3000
```

**Method C: Open directly in browser**
- Open `frontend/index.html` in your browser
- Note: File uploads may not work due to CORS

## Access the Application
- Frontend: http://localhost:3000
- Backend API: http://localhost:8000

## Upload Your CSV Files
1. Tips data (format: YYYY-MM-DD.csv)
2. Race data files
3. Win/Place price files
4. Click "Analyze Data" to process

The full application will analyze your actual CSV files and generate real insights!
