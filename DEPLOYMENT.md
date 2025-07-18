# Deployment Instructions

## GitHub Pages Setup

To deploy this Betting Analytics Dashboard to GitHub Pages:

### 1. Repository Settings
1. Go to your GitHub repository
2. Click on **Settings** tab
3. Scroll down to **Pages** section
4. Under **Source**, select **GitHub Actions**

### 2. Enable Workflow Permissions
1. In your repository, go to **Settings** → **Actions** → **General**
2. Under **Workflow permissions**, select **Read and write permissions**
3. Check **Allow GitHub Actions to create and approve pull requests**

### 3. Push Changes
```bash
git add .
git commit -m "Add GitHub Pages deployment workflow"
git push origin main
```

### 4. Monitor Deployment
1. Go to **Actions** tab in your repository
2. Watch the "Deploy to GitHub Pages" workflow
3. Once complete, your site will be available at: `https://[username].github.io/[repository-name]/`

## Local Development

### Backend Setup
```bash
# Install dependencies
pip install fastapi uvicorn pandas numpy python-multipart

# Run the backend
cd backend
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

### Frontend Setup
```bash
# Serve the frontend
cd frontend
python -m http.server 3000
```

Visit `http://localhost:3000` to use the full application with file upload capabilities.

## Demo vs Production

- **GitHub Pages**: Runs in demo mode with mock data for demonstration
- **Local**: Full functionality with CSV file uploads and real analysis

## File Structure
```
.github/workflows/deploy.yml  # GitHub Actions workflow
frontend/                    # Frontend application files
backend/                     # FastAPI backend (for local use)
Data/                       # Sample CSV files
README.md                   # Project documentation
```

## Troubleshooting

1. **Workflow fails**: Check Actions tab for error details
2. **Site not accessible**: Ensure GitHub Pages is enabled in settings
3. **Styling issues**: Check browser console for CSS loading errors

The deployment workflow automatically:
- Sets up the build environment
- Copies frontend files
- Creates mock backend for demo
- Deploys to GitHub Pages
