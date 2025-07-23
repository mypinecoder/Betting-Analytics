// Global variables
let uploadedFiles = [];
let analysisData = null; 

// Palettes and Scales for vibrant charts
const VIBRANT_CATEGORICAL_PALETTE = ['#2ECC71', '#F1C40F', '#3498DB', '#E74C3C', '#9B59B6', '#34495E', '#1ABC9C', '#E67E22', '#BDC3C7', '#27AE60'];
const VIBRANT_SEQUENTIAL_SCALE = 'Viridis';

// Plotly default layout settings for a consistent theme
const plotlyLayoutConfig = {
    font: {
        family: 'Poppins, sans-serif',
        color: '#E2E8F0' // Dark theme text
    },
    paper_bgcolor: 'rgba(0,0,0,0)',
    plot_bgcolor: 'rgba(0,0,0,0)',
    margin: { l: 60, r: 40, b: 50, t: 50 },
    xaxis: {
        gridcolor: '#4A5568',
        zerolinecolor: '#4A5568'
    },
    yaxis: {
        gridcolor: '#4A5568',
        zerolinecolor: '#4A5568'
    },
    legend: {
        orientation: 'h',
        yanchor: 'bottom',
        y: 1.02,
        xanchor: 'right',
        x: 1
    }
};

const pdfPlotlyLayoutConfig = {
    ...plotlyLayoutConfig,
    font: { ...plotlyLayoutConfig.font, color: '#1A202C' }, // Light theme text for PDF
    paper_bgcolor: '#FFFFFF',
    plot_bgcolor: '#FFFFFF',
     xaxis: {
        gridcolor: '#dee2e6',
        zerolinecolor: '#dee2e6'
    },
    yaxis: {
        gridcolor: '#dee2e6',
        zerolinecolor: '#dee2e6'
    },
};


// --- Event Listeners & UI ---
document.addEventListener('DOMContentLoaded', () => {
    initializeUploadArea();
    const analyzeBtn = document.getElementById('analyze-btn');
    if(analyzeBtn) analyzeBtn.addEventListener('click', analyzeData);

    const downloadBtn = document.getElementById('download-pdf-btn');
    if(downloadBtn) downloadBtn.addEventListener('click', downloadPDF);
});

function initializeUploadArea() {
    const uploadArea = document.getElementById('upload-area');
    const fileInput = document.getElementById('file-input');

    if(!uploadArea || !fileInput) return;

    uploadArea.addEventListener('click', () => fileInput.click());
    uploadArea.addEventListener('dragover', (e) => { e.preventDefault(); uploadArea.classList.add('drag-over'); });
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
        if ((file.type === 'text/csv' || file.name.endsWith('.csv')) && !uploadedFiles.find(f => f.name === file.name)) {
            uploadedFiles.push(file);
        }
    });
    fileList.innerHTML = '';
    uploadedFiles.forEach((file, index) => {
        const fileItem = document.createElement('div');
        fileItem.className = 'file-item';
        fileItem.innerHTML = `<span><i class="fas fa-file-csv"></i> ${file.name}</span><button onclick="removeFile(${index})" style="background:none;border:none;color:#e74c3c;cursor:pointer;"><i class="fas fa-times"></i></button>`;
        fileList.appendChild(fileItem);
    });
    analyzeBtn.disabled = uploadedFiles.length < 3;
}

function removeFile(index) {
    uploadedFiles.splice(index, 1);
    handleFiles([]);
}


// --- Data Analysis and Dashboard Population ---
async function analyzeData() {
    document.getElementById('loading-spinner').classList.remove('hidden');
    document.getElementById('dashboard').classList.add('hidden');

    const formData = new FormData();
    uploadedFiles.forEach(file => formData.append('files', file));

    try {
        const response = await fetch('/analyze/', { method: 'POST', body: formData });
        if (!response.ok) {
            const error = await response.json().catch(() => ({ detail: 'An unknown error occurred during analysis.' }));
            throw new Error(error.detail || `Server responded with status: ${response.status}`);
        }
        const data = await response.json();
        
        analysisData = data;
        populateDashboard(data);

        document.getElementById('upload-section').classList.add('hidden');
        document.getElementById('dashboard').classList.remove('hidden');

    } catch (error) {
        console.error('Analysis error:', error);
        alert(`Analysis failed: ${error.message}`);
    } finally {
        document.getElementById('loading-spinner').classList.add('hidden');
    }
}

function populateDashboard(data) {
    renderKPIs(data.kpis);
    
    const dashboardGrid = document.getElementById('dashboard-grid');
    dashboardGrid.innerHTML = '';

    const { charts, tables } = data;

    // --- Performance Overview ---
    if (tables && tables.tipster_roi && tables.tipster_roi.length > 0) {
        createPlotCard('tipster-roi-leaderboard', 'Tipster ROI Leaderboard', 'grid-col-8 min-h-500');
        setTimeout(() => {
            const roiData = { labels: tables.tipster_roi.map(t => t.Tipster), data: tables.tipster_roi.map(t => t.ROI) };
            renderBarChart(roiData, 'tipster-roi-leaderboard', { yaxis: { title: 'ROI (%)' }, color: VIBRANT_CATEGORICAL_PALETTE });
        }, 0);
    }
    if (charts && charts.tipster_market_share && charts.tipster_market_share.labels && charts.tipster_market_share.labels.length > 0) {
        createPlotCard('tipster-market-share', 'Tipster Market Share', 'grid-col-4 min-h-500');
        setTimeout(() => {
            renderPieChart(charts.tipster_market_share, 'tipster-market-share', {hole: 0.4, showlegend: true});
        }, 0);
    }
    if (charts && charts.tipster_vs_market && charts.tipster_vs_market.labels && charts.tipster_vs_market.labels.length > 0) {
        createPlotCard('tipster-vs-market', 'Tipster Avg. Odds vs. Market BSP', 'grid-col-12 min-h-400');
        setTimeout(() => {
            renderGroupedBarChart(charts.tipster_vs_market, 'tipster-vs-market', {yaxis: {title: 'Average Odds'}});
        }, 0);
    }
    if (charts && charts.tipster_strategy && charts.tipster_strategy.labels && charts.tipster_strategy.labels.length > 0) {
        createPlotCard('tipster-strategy', 'Tipster Selection Strategy (Avg. Tipped Odds)', 'grid-col-6 min-h-400');
        setTimeout(() => {
            renderLollipopChart(charts.tipster_strategy, 'tipster-strategy', { xaxis: {title: 'Average Odds'} });
        }, 0);
    }
    if (charts && charts.best_odds_provider && charts.best_odds_provider.labels && charts.best_odds_provider.labels.length > 0) {
        createPlotCard('best-odds-provider', 'Best Odds Provider Frequency', 'grid-col-6 min-h-400');
        setTimeout(() => {
            renderPieChart(charts.best_odds_provider, 'best-odds-provider', {showlegend: true});
        }, 0);
    }

    // --- Market Analysis ---
    if (charts && charts.market_movers && charts.market_movers.labels_drifters && charts.market_movers.labels_steamers && (charts.market_movers.labels_drifters.length > 0 || charts.market_movers.labels_steamers.length > 0)) {
        createPlotCard('market-movers', 'Biggest Market Movers', 'grid-col-12 min-h-500');
        setTimeout(() => {
            renderTornadoChart(charts.market_movers, 'market-movers');
        }, 0);
    }
    if (charts && charts.most_traded_races && charts.most_traded_races.labels && charts.most_traded_races.labels.length > 0) {
        createPlotCard('most-traded-races', 'Top 5 Most Traded Races', 'grid-col-6 min-h-400');
        setTimeout(() => {
             renderDotPlot(charts.most_traded_races, 'most-traded-races', { xaxis: { title: 'Traded Volume ($)' }});
        }, 0);
    }
    if (tables && tables.most_traded_horses && tables.most_traded_horses.length > 0) {
        createPlotCard('most-traded-horses', 'Top 10 Most Traded Horses', 'grid-col-6 min-h-400');
        setTimeout(() => {
            const chartData = {
                labels: tables.most_traded_horses.map(h => h['Horse Name']),
                data: tables.most_traded_horses.map(h => h.pptradedvol)
            };
            renderLollipopChart(chartData, 'most-traded-horses', { xaxis: { title: 'Traded Volume ($)' }});
        }, 0);
    }

    // --- Factor Analysis ---
    if (tables && tables.jockey_performance && tables.jockey_performance.length > 0) {
            createPlotCard('jockey-performance', 'Jockey Performance (Rides & Avg. Odds)', 'grid-col-12 min-h-500');
            setTimeout(() => {
                const jPerformanceData = {
                    labels: tables.jockey_performance.map(j => j.JockeyName),
                    x: tables.jockey_performance.map(j => j.avg_odds),
                    // The original 'y' axis used Math.random(). It is now replaced with a metric from the backend.
                    y: tables.jockey_performance.map(j => j.num_rides), 
                    size: tables.jockey_performance.map(j => j.num_rides),
                    color: tables.jockey_performance.map(j => j.num_rides)
                };
                // The renderBubbleChart function now uses 'Number of Rides' for the y-axis.
                // The y-axis title in the layout config within renderBubbleChart should be updated to reflect this change.
                renderBubbleChart(jPerformanceData, 'jockey-performance');
            }, 0);
        }
    // --- UPDATED: Top Jockeys by Tip Frequency ---
    if (charts && charts.top_jockeys_by_tips && charts.top_jockeys_by_tips.labels && charts.top_jockeys_by_tips.labels.length > 0) {
        createPlotCard('top-jockeys-by-tips', 'Top Jockeys by Tip Frequency', 'grid-col-6 min-h-400');
        setTimeout(() => {
            // Sort data ascending so the top jockey appears at the top of the horizontal bar chart
            const sortedData = charts.top_jockeys_by_tips.labels
                .map((label, i) => ({ label, value: charts.top_jockeys_by_tips.data[i] }))
                .sort((a, b) => a.value - b.value);

            const chartData = {
                labels: sortedData.map(d => d.label),
                data: sortedData.map(d => d.value)
            };
            renderBarChart(chartData, 'top-jockeys-by-tips', { 
                xaxis: { title: '# of Tips' }, 
                yaxis: { automargin: true },
                index_axis: 'y',
                color: '#2ECC71'
            });
        }, 0);
    }
    if (charts && charts.tips_by_track && charts.tips_by_track.labels && charts.tips_by_track.labels.length > 0) {
        createPlotCard('tips-by-track', 'Tip Distribution by Track', 'grid-col-6 min-h-400');
        setTimeout(() => {
            renderPieChart(charts.tips_by_track, 'tips-by-track', {hole: 0.5, showlegend: true});
        }, 0);
    }
    // --- UPDATED: Average Prize Money by Track ---
    if (charts && charts.avg_prize_by_track && charts.avg_prize_by_track.labels && charts.avg_prize_by_track.labels.length > 0) {
        createPlotCard('avg-prize-by-track', 'Average Prize Money by Track', 'grid-col-8 min-h-500');
        setTimeout(() => {
            // Data is already sorted descending from the backend, perfect for a bar chart
            renderBarChart(charts.avg_prize_by_track, 'avg-prize-by-track', { 
                yaxis: { title: 'Average Prize Money ($)' },
                color: VIBRANT_CATEGORICAL_PALETTE // Use a color palette for visual distinction
            });
        }, 0);
    }
     if (charts && charts.prize_money_distribution && charts.prize_money_distribution.labels && charts.prize_money_distribution.labels.length > 0) {
        createPlotCard('prize-money-distribution', 'Prize Money Distribution', 'grid-col-4 min-h-500');
        setTimeout(() => {
            renderPieChart(charts.prize_money_distribution, 'prize-money-distribution', {showlegend: true});
        }, 0);
    }
    if (charts && charts.barrier_performance && charts.barrier_performance.labels && charts.barrier_performance.labels.length > 0) {
        createPlotCard('barrier-performance', 'Barrier Performance (Win Rate %)', 'grid-col-6 min-h-400');
        setTimeout(() => {
            renderBarChart(charts.barrier_performance, 'barrier-performance', { yaxis: { title: 'Win Rate (%)' }, color: VIBRANT_CATEGORICAL_PALETTE });
        }, 0);
    }
    if (charts && charts.odds_performance && charts.odds_performance.labels && charts.odds_performance.labels.length > 0) {
        createPlotCard('odds-performance', 'Odds vs. Performance (Win Rate %)', 'grid-col-6 min-h-400');
        setTimeout(() => {
            renderBarChart(charts.odds_performance, 'odds-performance', { yaxis: { title: 'Win Rate (%)' }, color: VIBRANT_CATEGORICAL_PALETTE });
        }, 0);
    }
    if (charts && charts.field_size_distribution && charts.field_size_distribution.labels && charts.field_size_distribution.labels.length > 0) {
        createPlotCard('field-size-distribution', 'Field Size Distribution', 'grid-col-12 min-h-400');
        setTimeout(() => {
            renderAreaChart(charts.field_size_distribution, 'field-size-distribution', { yaxis: { title: 'Number of Races' } });
        }, 0);
    }
}

// --- KPI Rendering ---
function renderKPIs(kpis) {
    if (!kpis) return;
    const kpiGrid = document.getElementById('kpi-grid');
    kpiGrid.innerHTML = '';
    const kpiMapping = { 
        total_tips: { label: 'Total Tips', icon: 'fas fa-list-ol', format: 'number' }, 
        total_tipsters: { label: 'Unique Tipsters', icon: 'fas fa-user-secret' }, 
        total_races: { label: 'Total Races', icon: 'fas fa-flag-checkered' },
        total_tracks: { label: 'Unique Tracks', icon: 'fas fa-map-marker-alt' },
        total_traded_volume: { label: 'Total Traded Volume', icon: 'fas fa-dollar-sign', format: 'currency' },
        average_field_size: { label: 'Avg Field Size', icon: 'fas fa-users' },
        drifters_percent: { label: 'Price Drifters', icon: 'fas fa-arrow-trend-up', format: 'percent'},
    };

    for (const [key, config] of Object.entries(kpiMapping)) {
        const value = kpis[key];
        if (value === null || value === undefined) continue;
        
        let formattedValue = value;
        if (config.format === 'currency') formattedValue = `$${(value/1000000).toFixed(2)}M`;
        if (config.format === 'percent') formattedValue = `${value.toFixed(1)}%`;
        if (config.format === 'number') formattedValue = value.toLocaleString();
        
        const card = document.createElement('div');
        card.className = 'kpi-card';
        card.innerHTML = `<div class="kpi-label"><i class="${config.icon}"></i> ${config.label}</div><div class="kpi-value">${formattedValue}</div>`;
        kpiGrid.appendChild(card);
    }
}

// --- Chart Rendering Functions ---
function createPlotCard(id, title, gridClass) {
    const dashboardGrid = document.getElementById('dashboard-grid');
    const card = document.createElement('div');
    card.className = `plot-card ${gridClass}`;
    card.innerHTML = `<h3 class="plot-title">${title}</h3><div id="${id}" style="height: calc(100% - 40px);"></div>`;
    dashboardGrid.appendChild(card);
}

function renderBarChart(data, elementId, options = {}) {
    const plotData = [{
        x: options.index_axis === 'y' ? data.data : data.labels,
        y: options.index_axis === 'y' ? data.labels : data.data,
        type: 'bar',
        orientation: options.index_axis || 'v',
        marker: { 
            color: options.color || '#2ECC71',
            line: { color: 'rgba(0,0,0,0.1)', width: 1 }
        }
    }];
    const layout = { ...plotlyLayoutConfig, ...options, title: '' };
    Plotly.newPlot(elementId, plotData, layout, {responsive: true});
}

function renderPieChart(data, elementId, options = {}) {
    const plotData = [{
        labels: data.labels,
        values: data.data,
        type: 'pie',
        hole: options.hole || 0,
        textinfo: 'percent', 
        hoverinfo: 'label+value+percent',
        automargin: true,
        marker: {
            colors: VIBRANT_CATEGORICAL_PALETTE,
            line: { color: '#ffffff', width: 2 }
        }
    }];
    const layout = { ...plotlyLayoutConfig, ...options, title: '', margin: {l: 30, r: 30, b: 30, t: 30} };
    Plotly.newPlot(elementId, plotData, layout, {responsive: true});
}

function renderBubbleChart(data, elementId) {
    const plotData = [{
        x: data.x, y: data.y, text: data.labels, mode: 'markers',
        marker: {
            size: data.size, 
            color: data.color,
            colorscale: VIBRANT_SEQUENTIAL_SCALE,
            showscale: true,
            colorbar: { title: 'Ride Count' }
        }
    }];
    const layout = { ...plotlyLayoutConfig, title: '', xaxis: {title: 'Average Tipped Odds'}, yaxis: {title: 'Win Rate (%)'} };
    Plotly.newPlot(elementId, plotData, layout, {responsive: true});
}

function renderTornadoChart(data, elementId) {
    const drifters = { y: data.labels_drifters, x: data.data_drifters, name: 'Drifters', type: 'bar', orientation: 'h', marker: { color: 'rgba(231, 76, 60, 0.8)' }};
    const steamers = { y: data.labels_steamers, x: data.data_steamers, name: 'Steamers', type: 'bar', orientation: 'h', marker: { color: 'rgba(46, 204, 113, 0.8)' }};
    const layout = { ...plotlyLayoutConfig, title: '', barmode: 'relative', yaxis: { automargin: true }, xaxis: { title: 'Odds Change (%)' } };
    Plotly.newPlot(elementId, [drifters, steamers], layout, {responsive: true});
}

function renderGroupedBarChart(data, elementId, options = {}) {
    const trace1 = { x: data.labels, y: data.data1, name: data.name1, type: 'bar', marker: {color: VIBRANT_CATEGORICAL_PALETTE[0]}};
    const trace2 = { x: data.labels, y: data.data2, name: data.name2, type: 'bar', marker: {color: VIBRANT_CATEGORICAL_PALETTE[1]}};
    const plotData = [trace1, trace2];
    const layout = { ...plotlyLayoutConfig, ...options, barmode: 'group', title: '' };
    Plotly.newPlot(elementId, plotData, layout, {responsive: true});
}

function renderAreaChart(data, elementId, options = {}) {
    const plotData = [{
        x: data.labels,
        y: data.data,
        type: 'scatter',
        mode: 'lines',
        fill: 'tozeroy',
        fillcolor: 'rgba(46, 204, 113, 0.2)',
        line: { color: 'rgba(46, 204, 113, 1)', width: 2 }
    }];
    const layout = { ...plotlyLayoutConfig, ...options, title: '' };
    Plotly.newPlot(elementId, plotData, layout, {responsive: true});
}

// --- NEW & FRESH VISUALS ---

function renderLollipopChart(data, elementId, options = {}) {
    const sortedData = data.labels.map((label, i) => ({ label, value: data.data[i] })).sort((a, b) => a.value - b.value);
    
    const plotData = [{
        x: sortedData.map(d => d.value),
        y: sortedData.map(d => d.label),
        type: 'scatter',
        mode: 'markers',
        marker: {
            color: VIBRANT_CATEGORICAL_PALETTE,
            size: 10
        }
    }];
    const shapes = sortedData.map(d => ({
        type: 'line',
        x0: 0,
        y0: d.label,
        x1: d.value,
        y1: d.label,
        line: {
            color: 'rgba(255,255,255,0.2)',
            width: 2
        }
    }));
    const layout = { ...plotlyLayoutConfig, ...options, title: '', shapes: shapes, yaxis: {automargin: true}, showlegend: false };
    Plotly.newPlot(elementId, plotData, layout, {responsive: true});
}

function renderDotPlot(data, elementId, options = {}) {
    const sortedData = data.labels.map((label, i) => ({ label, value: data.data[i] })).sort((a, b) => a.value - b.value);

    const plotData = [{
        x: sortedData.map(d => d.value),
        y: sortedData.map(d => d.label),
        type: 'scatter',
        mode: 'markers',
        marker: {
            color: VIBRANT_CATEGORICAL_PALETTE,
            size: 15,
            symbol: 'diamond'
        }
    }];
    const layout = { ...plotlyLayoutConfig, ...options, title: '', yaxis: {automargin: true}, showlegend: false };
    Plotly.newPlot(elementId, plotData, layout, {responsive: true});
}

function renderRadialBarChart(data, elementId) {
    const plotData = [{
        type: 'barpolar',
        r: data.data,
        theta: data.labels,
        marker: {
            color: VIBRANT_CATEGORICAL_PALETTE,
            line: {
                color: '#fff',
                width: 1
            }
        }
    }];
    const layout = {
        title: '',
        font: plotlyLayoutConfig.font,
        showlegend: false,
        polar: {
            bargap: 0.2,
            radialaxis: {
                showticklabels: false,
                ticks: '',
                gridcolor: 'rgba(255,255,255,0.2)'
            },
            angularaxis: {
                gridcolor: 'rgba(255,255,255,0.2)'
            }
        }
    };
    Plotly.newPlot(elementId, plotData, layout, {responsive: true});
}

// --- PDF Download Functionality ---
async function downloadPDF() {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ orientation: 'p', unit: 'mm', format: 'a4' });
    const spinner = document.getElementById('loading-spinner');
    spinner.classList.remove('hidden');

    let yPos = 15;
    const pageHeight = doc.internal.pageSize.height;
    const margin = 10;

    // --- Helper function to add new page if content overflows ---
    const checkPageBreak = (spaceNeeded) => {
        if (yPos + spaceNeeded > pageHeight - margin) {
            doc.addPage();
            yPos = 15;
        }
    };

    // --- Title ---
    doc.setFontSize(22);
    doc.setFont('helvetica', 'bold');
    doc.text('Betting Performance Analysis Report', doc.internal.pageSize.width / 2, yPos, { align: 'center' });
    yPos += 10;
    doc.setLineWidth(0.5);
    doc.line(margin, yPos, doc.internal.pageSize.width - margin, yPos);
    yPos += 10;

    // --- Introduction Text ---
    doc.setFontSize(11);
    doc.setFont('helvetica', 'normal');
    const introText = 'This report provides a comprehensive analysis of the uploaded betting data. It covers key performance indicators, tipster performance, market dynamics, and various factor analyses to uncover actionable insights.';
    const splitIntro = doc.splitTextToSize(introText, doc.internal.pageSize.width - margin * 2);
    doc.text(splitIntro, margin, yPos);
    yPos += (splitIntro.length * 5) + 10;


    // --- KPIs Section ---
    doc.setFontSize(16);
    doc.setFont('helvetica', 'bold');
    doc.text('Key Performance Indicators', margin, yPos);
    yPos += 8;

    const kpiCards = document.querySelectorAll('#kpi-grid .kpi-card');
    const kpiBody = [];
    kpiCards.forEach(card => {
        const label = card.querySelector('.kpi-label').innerText.trim();
        const value = card.querySelector('.kpi-value').innerText.trim();
        kpiBody.push([label, value]);
    });

    if (kpiBody.length > 0) {
        doc.autoTable({
            startY: yPos,
            head: [['Metric', 'Value']],
            body: kpiBody,
            theme: 'grid',
            headStyles: { fillColor: [44, 62, 80] },
            didDrawPage: (data) => { yPos = data.cursor.y + 5; }
        });
    }

    // --- Charts and Tables Section ---
    const plotCards = document.querySelectorAll('.plot-card');
    
    for (const card of plotCards) {
        const title = card.querySelector('.plot-title').innerText;
        const plotDivId = card.querySelector('div[id]').id;
        const plotDiv = document.getElementById(plotDivId);

        checkPageBreak(80); // Estimate space for title + chart

        doc.setFontSize(14);
        doc.setFont('helvetica', 'bold');
        doc.text(title, margin, yPos);
        yPos += 8;

        try {
            // Use light theme for PDF charts
            await Plotly.update(plotDiv, {}, pdfPlotlyLayoutConfig);

            const imgData = await Plotly.toImage(plotDiv, { format: 'png', width: 800, height: 450 });
            const imgWidth = doc.internal.pageSize.width - margin * 2;
            const imgHeight = (imgWidth * 450) / 800;
            
            checkPageBreak(imgHeight + 10);
            doc.addImage(imgData, 'PNG', margin, yPos, imgWidth, imgHeight);
            yPos += imgHeight + 15;

            // Revert chart to dark theme for the UI
            await Plotly.update(plotDiv, {}, plotlyLayoutConfig);

        } catch (err) {
            console.error(`Could not render chart ${title} to PDF:`, err);
            doc.setFont('helvetica', 'italic');
            doc.text('Chart could not be rendered.', margin, yPos);
            yPos += 15;
        }

        // Add corresponding table data if available
        if (title === 'Tipster ROI Leaderboard' && analysisData.tables.tipster_roi) {
            checkPageBreak(40);
             doc.autoTable({
                startY: yPos,
                head: [Object.keys(analysisData.tables.tipster_roi[0])],
                body: analysisData.tables.tipster_roi.map(row => Object.values(row).map(val => typeof val === 'number' ? val.toFixed(2) : val)),
                theme: 'striped',
                headStyles: { fillColor: [44, 62, 80] },
                didDrawPage: (data) => { yPos = data.cursor.y + 10; }
            });
        }
    }
    
    doc.save('Betting-Performance-Report.pdf');
    spinner.classList.add('hidden');
}