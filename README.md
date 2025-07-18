# Betting Analytics Dashboard

A comprehensive betting performance analyzer with advanced data visualization and statistical analysis capabilities.

## 🎯 Live Demo

Visit the live demo: [https://mypinecoder.github.io/Betting-Analytics/](https://mypinecoder.github.io/Betting-Analytics/)

## ✨ Features

- **Comprehensive Analytics**: Tipster performance, ROI analysis, strike rates
- **Market Analysis**: Price movements, volume analysis, market trends
- **Factor Analysis**: Jockey performance, barrier analysis, distance and odds distributions
- **Track & Time Analysis**: Track-specific performance, hourly betting patterns
- **Interactive Visualizations**: Charts, tables, and KPI dashboards
- **Responsive Design**: Works on desktop, tablet, and mobile devices

## 🏗️ Architecture

### Frontend
- **HTML5**: Modern semantic structure
- **CSS3**: Responsive design with CSS Grid and Flexbox
- **JavaScript (ES6+)**: Modern JavaScript with async/await
- **Chart.js**: Interactive data visualizations
- **DataTables**: Advanced table functionality

### Backend (Local Development)
- **FastAPI**: High-performance Python web framework
- **Pandas**: Data analysis and manipulation
- **NumPy**: Numerical computing
- **CORS middleware**: Cross-origin resource sharing

## 🚀 Getting Started

### Prerequisites
- Python 3.8+
- Node.js (for local development)
- Git

### Local Development Setup

1. **Clone the repository**
   ```bash
   git clone https://github.com/mypinecoder/Betting-Analytics.git
   cd Betting-Analytics
   ```

2. **Install Python dependencies**
   ```bash
   pip install fastapi uvicorn pandas numpy python-multipart
   ```

3. **Start the backend server**
   ```bash
   cd backend
   python -m uvicorn main:app --reload --host 0.0.0.0 --port 8000
   ```

4. **Serve the frontend**
   ```bash
   cd frontend
   # Using Python's built-in server
   python -m http.server 3000
   
   # Or using Node.js (if you have it installed)
   npx serve . -p 3000
   ```

5. **Open your browser**
   Navigate to `http://localhost:3000`

### Data Format

The application expects CSV files with the following columns:
- `Tip Website`: Source of the tip
- `Track`: Race track name
- `Race`: Race identifier
- `Selection Position`: Position in tipster's selections
- `Horse Name`: Name of the horse
- `JockeyName`: Jockey name
- `Barrier`: Starting barrier position
- `BestOdds`: Best available odds
- `bsp`: Betfair Starting Price
- `win_lose`: Result (1 for win, 0 for loss)

## 📊 Sample Data

Sample CSV files are included in the `Data/` directory for testing purposes.

## 🚀 GitHub Pages Deployment

This project is automatically deployed to GitHub Pages using GitHub Actions:

1. **Automatic Deployment**: Every push to the `main` branch triggers deployment
2. **Demo Mode**: The GitHub Pages version runs in demo mode with sample data
3. **No Backend Required**: Uses mock data for demonstration

### Manual Deployment Setup

1. **Enable GitHub Pages**
   - Go to your repository settings
   - Navigate to "Pages" section
   - Source: "GitHub Actions"

2. **Workflow Permissions**
   - Go to Settings → Actions → General
   - Set "Workflow permissions" to "Read and write permissions"

3. **Push Changes**
   ```bash
   git add .
   git commit -m "Add GitHub Pages deployment"
   git push origin main
   ```

## 🛠️ Development

### Project Structure
```
Betting-Analytics/
├── .github/
│   └── workflows/
│       └── deploy.yml          # GitHub Actions workflow
├── backend/
│   └── main.py                 # FastAPI backend
├── frontend/
│   ├── index.html              # Main HTML file
│   ├── script.js               # JavaScript functionality
│   └── style.css               # Styles
├── Data/                       # Sample CSV files
├── Vis/                        # Generated visualizations
└── README.md                   # This file
```

### Key Components

1. **Data Processing**: Handles CSV parsing, cleaning, and validation
2. **Analytics Engine**: Calculates KPIs, ROI, strike rates, and statistical measures
3. **Visualization Layer**: Creates interactive charts and tables
4. **Responsive UI**: Mobile-first design with modern CSS

### Adding New Features

1. **Backend**: Add new analysis functions in `backend/main.py`
2. **Frontend**: Update visualization logic in `frontend/script.js`
3. **Styling**: Modify appearance in `frontend/style.css`

## 📈 Analytics Capabilities

- **Tipster Performance**: ROI, strike rates, profit/loss analysis
- **Market Impact**: Price movement analysis post-tip publication
- **Factor Analysis**: Jockey, barrier, distance, and odds impact
- **Temporal Patterns**: Time-based betting pattern analysis
- **Track Performance**: Venue-specific success rates

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- Chart.js for beautiful visualizations
- DataTables for advanced table functionality
- FastAPI for the robust backend framework
- GitHub Actions for seamless deployment

## 📞 Support

If you have any questions or need help with setup, please open an issue in the GitHub repository.

---

**Built with ❤️ for the betting analytics community**
