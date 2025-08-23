// Global variables
let uploadedFiles = [];
let analysisData = null; 

// Palettes and Scales for vibrant charts
const VIBRANT_CATEGORICAL_PALETTE = ['#2ECC71', '#F1C40F', '#3498DB', '#E74C3C', '#9B59B6', '#34495E', '#1ABC9C', '#E67E22', '#BDC3C7', '#27AE60'];

// Plotly default layout settings for a consistent theme
const plotlyLayoutConfig = {
    font: { family: 'Poppins, sans-serif', color: '#E2E8F0' },
    paper_bgcolor: 'rgba(0,0,0,0)',
    plot_bgcolor: 'rgba(0,0,0,0)',
    margin: { l: 60, r: 40, b: 50, t: 60 },
    xaxis: { gridcolor: '#4A5568', zerolinecolor: '#4A5568', type: 'category' },
    yaxis: { gridcolor: '#4A5568', zerolinecolor: '#4A5568', automargin: true },
    legend: { orientation: 'h', yanchor: 'bottom', y: 1.02, xanchor: 'right', x: 1 }
};

document.addEventListener('DOMContentLoaded', () => {
    initializeUploadArea();
    document.getElementById('analyze-btn')?.addEventListener('click', analyzeData);
    document.getElementById('download-pdf-btn')?.addEventListener('click', downloadPDFReport);
    // --- NEW: Event listener for the clear history button ---
    document.getElementById('clear-db-btn')?.addEventListener('click', clearDatabaseHistory);
});

function initializeUploadArea() {
    const uploadArea = document.getElementById('upload-area');
    const fileInput = document.getElementById('file-input');
    if(!uploadArea || !fileInput) return;

    uploadArea.addEventListener('click', () => fileInput.click());
    uploadArea.addEventListener('dragover', e => { e.preventDefault(); uploadArea.classList.add('drag-over'); });
    uploadArea.addEventListener('dragleave', () => uploadArea.classList.remove('drag-over'));
    uploadArea.addEventListener('drop', (e) => {
        e.preventDefault();
        uploadArea.classList.remove('drag-over');
        handleFiles(e.dataTransfer.files);
    });
    fileInput.addEventListener('change', (e) => handleFiles(e.target.files));
}

function handleFiles(files) {
    const fileList = document.getElementById('file-list');
    const analyzeBtn = document.getElementById('analyze-btn');
    Array.from(files).forEach(file => {
        // Allow csv and excel files
        if ((file.type === 'text/csv' || file.name.endsWith('.csv') || file.name.endsWith('.xlsx')) && !uploadedFiles.find(f => f.name === file.name)) {
            uploadedFiles.push(file);
        }
    });
    fileList.innerHTML = '';
    uploadedFiles.forEach((file, index) => {
        const fileItem = document.createElement('div');
        fileItem.className = 'file-item';
        fileItem.innerHTML = `<span><i class="fas fa-file-csv"></i> ${file.name}</span>
            <button onclick="removeFile(${index})" style="background:none;border:none;color:#e74c3c;cursor:pointer;"><i class="fas fa-times"></i></button>`;
        fileList.appendChild(fileItem);
    });
    // Allow analysis with any number of files since backend handles it
    analyzeBtn.disabled = uploadedFiles.length === 0;
}

function removeFile(index) {
    uploadedFiles.splice(index, 1);
    handleFiles([]); // Re-render list
}

// --- Data Analysis and Dashboard Population ---
async function analyzeData() {
    if (uploadedFiles.length === 0) {
        alert("Please select files to analyze.");
        return;
    }
    document.getElementById('loading-spinner').classList.remove('hidden');
    document.getElementById('dashboard').classList.add('hidden');

    const formData = new FormData();
    uploadedFiles.forEach(file => formData.append('files', file));

    try {
        const response = await fetch('/analyze/', { method: 'POST', body: formData });
        if (!response.ok) {
            const error = await response.json().catch(() => ({ detail: 'An unknown server error occurred.' }));
            throw new Error(error.detail);
        }
        analysisData = await response.json();
        populateDashboard(analysisData);
        document.getElementById('upload-section').classList.add('hidden');
        document.getElementById('dashboard').classList.remove('hidden');
    } catch (error) {
        console.error('Analysis error:', error);
        alert(`Analysis failed: ${error.message}`);
    } finally {
        document.getElementById('loading-spinner').classList.add('hidden');
    }
}

// --- NEW: Function to clear the database history ---
async function clearDatabaseHistory() {
    if (!confirm('Are you sure you want to permanently delete all historical data? This action cannot be undone.')) {
        return;
    }
    try {
        const response = await fetch('/clear_history', { method: 'POST' });
        if (!response.ok) {
            const error = await response.json().catch(() => ({ detail: 'An unknown error occurred.' }));
            throw new Error(error.detail);
        }
        const result = await response.json();
        alert(result.message);
        // Reload the page to reset the state and go back to the upload screen
        window.location.reload();
    } catch (error) {
        console.error('Clear history error:', error);
        alert(`Failed to clear history: ${error.message}`);
    }
}


function populateDashboard(data) {
    renderDailySummary(data.daily_summary);
    const dashboardGrid = document.getElementById('dashboard-grid');
    dashboardGrid.innerHTML = '';
    document.getElementById('kpi-grid').innerHTML = '';

    const { charts } = data;
    if (!charts) return;

    createPlotCard('cumulative-profit', 'Cumulative Profit Over Time', 'grid-col-6 min-h-400');
    renderLineChart(charts.cumulative_profit, 'cumulative-profit', { yaxis: { title: 'Profit (Units)' } });
    
    createPlotCard('rolling-roi', '30-Day Rolling ROI Over Time', 'grid-col-6 min-h-400');
    renderLineChart(charts.rolling_roi, 'rolling-roi', { yaxis: { title: 'ROI (%)' } });
    
    createPlotCard('roi-by-tipster', 'ROI by Tipster', 'grid-col-6 min-h-400');
    renderBarChart(charts.roi_by_tipster, 'roi-by-tipster', { yaxis: { title: 'ROI (%)' }, xaxis: { type: 'category' } });
    
    createPlotCard('roi-by-odds', 'ROI by Odds Band', 'grid-col-6 min-h-400');
    renderBarChart(charts.roi_by_odds, 'roi-by-odds', { yaxis: { title: 'ROI (%)' }, xaxis: { type: 'category' } });
    
    createPlotCard('price-movement-histogram', 'Price Movement Distribution', 'grid-col-6 min-h-400');
    renderBarChart(charts.price_movement_histogram, 'price-movement-histogram', { xaxis: { title: 'Price Movement (%)', type: 'category' }, yaxis: { title: 'Count' } });
    
    createPlotCard('clv-trend', 'CLV Trend Over Time', 'grid-col-6 min-h-400');
    renderLineChart(charts.clv_trend, 'clv-trend', { yaxis: { title: 'CLV (%)' } });
    
    createPlotCard('win-rate-vs-field-size', 'Win Rate vs Field Size', 'grid-col-12 min-h-400');
    renderBarChart(charts.win_rate_vs_field_size, 'win-rate-vs-field-size', { xaxis: { title: 'Field Size', type: 'category' }, yaxis: { title: 'Win Rate (%)' } });
}

function renderDailySummary(summaryData) {
    const tableContainer = document.getElementById('daily-summary-table');
    if (!summaryData || summaryData.length === 0) { 
        tableContainer.innerHTML = '<h3>Daily Summary</h3><p>No daily summary data available.</p>'; 
        return; 
    }
    let tableHTML = `<h3>Daily Summary</h3><div style="overflow-x:auto;"><table><thead><tr>
        <th>Date</th><th>Bets Placed</th><th>Units Staked</th><th>Units Returned</th><th>ROI %</th>
        <th>Win Rate %</th><th>Avg Odds</th><th>CLV %</th><th>Drifters %</th><th>Steamers %</th>
        </tr></thead><tbody>`;
    summaryData.sort((a, b) => new Date(b.Date) - new Date(a.Date)).forEach(day => {
        tableHTML += `<tr>
            <td>${day.Date || 'N/A'}</td>
            <td>${day['Bets Placed'] ?? 0}</td>
            <td>${day['Units Staked'] ?? 0}</td>
            <td>${(day['Units Returned'] ?? 0).toFixed(2)}</td>
            <td>${(day['ROI %'] ?? 0).toFixed(2)}</td>
            <td>${(day['Win Rate %'] ?? 0).toFixed(2)}</td>
            <td>${(day['Avg Odds'] ?? 0).toFixed(2)}</td>
            <td>${(day['CLV %'] ?? 0).toFixed(2)}</td>
            <td>${(day['Drifters %'] ?? 0).toFixed(2)}</td>
            <td>${(day['Steamers %'] ?? 0).toFixed(2)}</td>
        </tr>`;
    });
    tableHTML += '</tbody></table></div>';
    tableContainer.innerHTML = tableHTML;
}

// --- Chart rendering functions ---
function createPlotCard(id, title, gridClass) {
    const card = document.createElement('div');
    card.className = `plot-card ${gridClass}`;
    card.innerHTML = `<h3 class="plot-title">${title}</h3><div id="${id}" class="chart-container"></div>`;
    document.getElementById('dashboard-grid').appendChild(card);
}

function renderBarChart(chartData, elementId, options = {}) {
    const plotDiv = document.getElementById(elementId);
    if (!chartData || !chartData.labels || chartData.labels.length === 0 || chartData.labels[0] === "No Data Available") {
        plotDiv.innerHTML = `<div class="no-data-msg">No data to display.</div>`;
        return;
    }
    const plotData = chartData.datasets.map((dataset, i) => ({
        x: chartData.labels,
        y: dataset.data,
        name: dataset.name,
        type: 'bar',
        marker: { color: VIBRANT_CATEGORICAL_PALETTE }
    }));
    const layout = { ...plotlyLayoutConfig, ...options, title: '' };
    Plotly.newPlot(elementId, plotData, layout, { responsive: true, displayModeBar: false });
}

function renderLineChart(chartData, elementId, options = {}) {
    const plotDiv = document.getElementById(elementId);
    if (!chartData || !chartData.labels || chartData.labels.length === 0 || chartData.labels[0] === "No Data Available") {
        plotDiv.innerHTML = `<div class="no-data-msg">No data to display.</div>`;
        return;
    }
    const datasets = chartData.datasets || [{ name: 'Value', data: chartData.data }];
    const plotData = datasets.map((dataset, i) => ({
        x: chartData.labels,
        y: dataset.data,
        name: dataset.name,
        type: 'scatter',
        mode: 'lines+markers',
        line: { color: VIBRANT_CATEGORICAL_PALETTE[i % VIBRANT_CATEGORICAL_PALETTE.length] }
    }));
    const layout = { ...plotlyLayoutConfig, ...options, title: '' };
    Plotly.newPlot(elementId, plotData, layout, { responsive: true, displayModeBar: false });
}

// PDF Export Function
async function downloadPDFReport() {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF('p', 'pt', 'a4');
    let yPos = 40;

    doc.setFontSize(22);
    doc.text("Betting Insights Performance Report", 40, yPos);
    yPos += 30;
    doc.setFontSize(12);
    doc.text(`Generated: ${new Date().toLocaleString()}`, 40, yPos);
    
    const tableElement = document.getElementById("daily-summary-table");
    if(tableElement && tableElement.innerHTML.includes('tbody')) {
        doc.addPage();
        yPos = 40;
        const summaryCanvas = await html2canvas(tableElement, { scale: 2 });
        const summaryImgData = summaryCanvas.toDataURL("image/png");
        const summaryImgProps = doc.getImageProperties(summaryImgData);
        const summaryPdfWidth = 555;
        const summaryPdfHeight = (summaryImgProps.height * summaryPdfWidth) / summaryImgProps.width;
        doc.text("Daily Summary", 40, yPos);
        yPos += 20;
        doc.addImage(summaryImgData, 'PNG', 40, yPos, summaryPdfWidth, summaryPdfHeight);
        yPos += summaryPdfHeight + 40;
    }
    
    const chartIds = ["cumulative-profit", "rolling-roi", "roi-by-tipster", "roi-by-odds", "price-movement-histogram", "clv-trend", "win-rate-vs-field-size"];

    for (const id of chartIds) {
        const chartDiv = document.getElementById(id);
        if (chartDiv && !chartDiv.querySelector('.no-data-msg')) {
            const chartCanvas = await Plotly.toImage(chartDiv, { format: 'png', width: 800, height: 400 });
            const chartImgProps = doc.getImageProperties(chartCanvas);
            const pdfChartWidth = 555;
            const pdfChartHeight = (chartImgProps.height * pdfChartWidth) / chartImgProps.width;

            if (yPos + pdfChartHeight > doc.internal.pageSize.height - 40) {
                doc.addPage();
                yPos = 40;
            }
            doc.addImage(chartCanvas, 'PNG', 20, yPos, pdfChartWidth, pdfChartHeight);
            yPos += pdfChartHeight + 30;
        }
    }
    doc.save(`BettingInsights_Report_${new Date().toISOString().split('T')[0]}.pdf`);
}