// Global variables
let uploadedFiles = [];
let analysisData = null; 

// Palettes and Scales for vibrant charts
const VIBRANT_CATEGORICAL_PALETTE = ['#2ECC71', '#F1C40F', '#3498DB', '#E74C3C', '#9B59B6', '#34495E', '#1ABC9C', '#E67E22', '#BDC3C7', '#27AE60'];
const VIBRANT_SEQUENTIAL_SCALE = 'Viridis';
const DIVERGING_COLOR_SCALE = 'RdYlGn'; // Red-Yellow-Green for performance metrics

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
    font: { ...plotlyLayoutConfig.font, color: '#E2E8F0' }, // Dark theme text for PDF
    paper_bgcolor: '#2D3748', // Dark card background for PDF
    plot_bgcolor: '#2D3748',  // Dark card background for PDF
     xaxis: {
        gridcolor: '#4A5568',
        zerolinecolor: '#4A5568'
    },
    yaxis: {
        gridcolor: '#4A5568',
        zerolinecolor: '#4A5568'
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
    if (charts && charts.tipster_market_share && charts.tipster_market_share.labels.length > 0) {
        createPlotCard('tipster-market-share', 'Tipster Market Share', 'grid-col-4 min-h-500');
        setTimeout(() => {
            renderPieChart(charts.tipster_market_share, 'tipster-market-share', {hole: 0.4, showlegend: true});
        }, 0);
    }
    if (charts && charts.tipster_vs_market && charts.tipster_vs_market.labels.length > 0) {
        createPlotCard('tipster-vs-market', 'Tipster Avg. Odds vs. Market BSP', 'grid-col-12 min-h-400');
        setTimeout(() => {
            renderGroupedBarChart(charts.tipster_vs_market, 'tipster-vs-market', {yaxis: {title: 'Average Odds'}});
        }, 0);
    }

    // --- Market Movers Split Charts ---
    if (charts && charts.market_movers && charts.market_movers.labels_drifters.length > 0) {
        createPlotCard('market-drifters', 'Biggest Market Drifters (Price Increased)', 'grid-col-6 min-h-400');
        setTimeout(() => {
            const driftersData = {
                labels: charts.market_movers.labels_drifters,
                data: charts.market_movers.data_drifters
            };
            renderBarChart(driftersData, 'market-drifters', { 
                xaxis: { title: 'Odds Change (%)' },
                yaxis: { automargin: true },
                orientation: 'h',
                color: '#E74C3C' // Red for negative movement (price drift)
            });
        }, 0);
    }
    if (charts && charts.market_movers && charts.market_movers.labels_steamers.length > 0) {
        createPlotCard('market-steamers', 'Biggest Market Steamers (Price Decreased)', 'grid-col-6 min-h-400');
        setTimeout(() => {
            const steamersData = {
                labels: charts.market_movers.labels_steamers,
                data: charts.market_movers.data_steamers
            };
            renderBarChart(steamersData, 'market-steamers', { 
                xaxis: { title: 'Odds Change (%)' },
                yaxis: { automargin: true },
                orientation: 'h',
                color: '#2ECC71' // Green for positive movement (price steam)
            });
        }, 0);
    }
    
    if (charts && charts.most_traded_races && charts.most_traded_races.labels.length > 0) {
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

    // --- Jockey Analysis Charts (Updated Logic) ---
    if (tables && tables.jockey_performance && tables.jockey_performance.length > 0) {
        // Chart 1: Top Jockeys by Number of Rides
        const sortedByRides = [...tables.jockey_performance].sort((a, b) => a.num_rides - b.num_rides);
        if (sortedByRides.length > 0) {
            createPlotCard('jockeys-by-rides', 'Busiest Jockeys (by # of Rides)', 'grid-col-6 min-h-400');
            setTimeout(() => {
                const ridesData = {
                    labels: sortedByRides.map(j => j.JockeyName),
                    data: sortedByRides.map(j => j.num_rides)
                };
                renderBarChart(ridesData, 'jockeys-by-rides', {
                    xaxis: { title: '# of Rides' },
                    yaxis: { automargin: true },
                    orientation: 'h',
                    color: '#3498DB'
                });
            }, 0);
        }

        // Chart 2: Top Jockeys by Traded Volume
        const sortedByVolume = [...tables.jockey_performance]
            .filter(j => j.total_traded_volume > 0)
            .sort((a, b) => a.total_traded_volume - b.total_traded_volume);
        
        if (sortedByVolume.length > 0) {
            createPlotCard('jockeys-by-volume', 'Top Jockeys by Traded Volume', 'grid-col-6 min-h-400');
            setTimeout(() => {
                const volumeData = {
                    labels: sortedByVolume.map(j => j.JockeyName),
                    data: sortedByVolume.map(j => j.total_traded_volume)
                };
                renderBarChart(volumeData, 'jockeys-by-volume', {
                    xaxis: { title: 'Total Traded Volume ($)' },
                    yaxis: { automargin: true },
                    orientation: 'h',
                    color: '#9B59B6'
                });
            }, 0);
        }
    }

    // --- Factor Analysis ---
    if (charts && charts.top_jockeys_by_tips && charts.top_jockeys_by_tips.labels.length > 0) {
        createPlotCard('top-jockeys-by-tips', 'Top Jockeys by Tip Frequency', 'grid-col-6 min-h-400');
        setTimeout(() => {
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
                orientation: 'h',
                color: '#F1C40F'
            });
        }, 0);
    }
    if (charts && charts.tips_by_track && charts.tips_by_track.labels.length > 0) {
        createPlotCard('tips-by-track', 'Tip Distribution by Track', 'grid-col-6 min-h-400');
        setTimeout(() => {
            renderPieChart(charts.tips_by_track, 'tips-by-track', {hole: 0.5, showlegend: true});
        }, 0);
    }
    
    // Remaining charts...
    if (charts && charts.avg_prize_by_track && charts.avg_prize_by_track.labels.length > 0) {
        createPlotCard('avg-prize-by-track', 'Average Prize Money by Track', 'grid-col-8 min-h-500');
        setTimeout(() => {
            renderBarChart(charts.avg_prize_by_track, 'avg-prize-by-track', { 
                yaxis: { title: 'Average Prize Money ($)' },
                color: VIBRANT_CATEGORICAL_PALETTE
            });
        }, 0);
    }
     if (charts && charts.prize_money_distribution && charts.prize_money_distribution.labels.length > 0) {
        createPlotCard('prize-money-distribution', 'Prize Money Distribution', 'grid-col-4 min-h-500');
        setTimeout(() => {
            renderPieChart(charts.prize_money_distribution, 'prize-money-distribution', {showlegend: true});
        }, 0);
    }
    if (charts && charts.barrier_performance && charts.barrier_performance.labels.length > 0) {
        createPlotCard('barrier-performance', 'Barrier Performance (Win Rate %)', 'grid-col-6 min-h-400');
        setTimeout(() => {
            renderBarChart(charts.barrier_performance, 'barrier-performance', { yaxis: { title: 'Win Rate (%)' }, color: VIBRANT_CATEGORICAL_PALETTE });
        }, 0);
    }
    if (charts && charts.odds_performance && charts.odds_performance.labels.length > 0) {
        createPlotCard('odds-performance', 'Odds vs. Performance (Win Rate %)', 'grid-col-6 min-h-400');
        setTimeout(() => {
            renderBarChart(charts.odds_performance, 'odds-performance', { yaxis: { title: 'Win Rate (%)' }, color: VIBRANT_CATEGORICAL_PALETTE });
        }, 0);
    }
    if (charts && charts.field_size_distribution && charts.field_size_distribution.labels.length > 0) {
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
        if (config.format === 'currency') formattedValue = `$${(value/1000).toFixed(1)}k`;
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
    if (!data || !data.labels || data.labels.length === 0) return;
    const sortedData = (options.orientation === 'h')
        ? data.labels.map((label, i) => ({ label, value: data.data[i] })).sort((a, b) => a.value - b.value)
        : { labels: data.labels, data: data.data };

    const plotData = [{
        x: options.orientation === 'h' ? sortedData.map(d => d.value) : sortedData.labels,
        y: options.orientation === 'h' ? sortedData.map(d => d.label) : sortedData.data,
        type: 'bar',
        orientation: options.orientation || 'v',
        marker: { 
            color: options.color || '#2ECC71',
            line: { color: 'rgba(0,0,0,0.1)', width: 1 }
        }
    }];
    const layout = { ...plotlyLayoutConfig, ...options, title: '' };
    Plotly.newPlot(elementId, plotData, layout, {responsive: true});
}

function renderPieChart(data, elementId, options = {}) {
    if (!data || !data.labels || data.labels.length === 0) return;
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

function renderGroupedBarChart(data, elementId, options = {}) {
    if (!data || !data.labels || data.labels.length === 0) return;
    const trace1 = { x: data.labels, y: data.data1, name: data.name1, type: 'bar', marker: {color: VIBRANT_CATEGORICAL_PALETTE[0]}};
    const trace2 = { x: data.labels, y: data.data2, name: data.name2, type: 'bar', marker: {color: VIBRANT_CATEGORICAL_PALETTE[1]}};
    const plotData = [trace1, trace2];
    const layout = { ...plotlyLayoutConfig, ...options, barmode: 'group', title: '' };
    Plotly.newPlot(elementId, plotData, layout, {responsive: true});
}

function renderAreaChart(data, elementId, options = {}) {
    if (!data || !data.labels || data.labels.length === 0) return;
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

function renderLollipopChart(data, elementId, options = {}) {
    if (!data || !data.labels || data.labels.length === 0) return;
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
    if (!data || !data.labels || data.labels.length === 0) return;
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

// --- PDF Download Functionality (Updated) ---
async function downloadPDF() {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ orientation: 'p', unit: 'mm', format: 'a4' });
    const spinner = document.getElementById('loading-spinner');
    spinner.classList.remove('hidden');

    let yPos = 15;
    const pageHeight = doc.internal.pageSize.height;
    const margin = 10;
    const renderedTables = new Set();

    const checkPageBreak = (spaceNeeded) => {
        if (yPos + spaceNeeded > pageHeight - margin) {
            doc.addPage();
            yPos = 15;
        }
    };

    doc.setFillColor('#1A202C');
    doc.rect(0, 0, doc.internal.pageSize.width, doc.internal.pageSize.height, 'F');

    doc.setFontSize(22);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor('#2ECC71');
    doc.text('Betting Performance Analysis Report', doc.internal.pageSize.width / 2, yPos, { align: 'center' });
    yPos += 10;

    doc.setDrawColor('#4A5568');
    doc.setLineWidth(0.5);
    doc.line(margin, yPos, doc.internal.pageSize.width - margin, yPos);
    yPos += 10;
    
    doc.setFontSize(11);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor('#E2E8F0');
    const introText = 'This report provides a comprehensive analysis of the uploaded betting data, covering key performance indicators, tipster performance, and market dynamics.';
    const splitIntro = doc.splitTextToSize(introText, doc.internal.pageSize.width - margin * 2);
    doc.text(splitIntro, margin, yPos);
    yPos += (splitIntro.length * 5) + 10;

    doc.setFontSize(16);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor('#2ECC71');
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
            styles: {
                fillColor: '#2D3748',
                textColor: '#E2E8F0',
                lineColor: '#4A5568'
            },
            headStyles: { 
                fillColor: '#2ECC71',
                textColor: '#1A202C',
                fontStyle: 'bold'
            },
        });
        yPos = doc.autoTable.previous.finalY + 10;
    }

    const plotCards = document.querySelectorAll('.plot-card');
    
    for (const card of plotCards) {
        const title = card.querySelector('.plot-title').innerText;
        
        if (title === 'Average Prize Money by Track') {
            continue; // Skip this chart
        }

        const plotDivId = card.querySelector('div[id]').id;
        const plotDiv = document.getElementById(plotDivId);

        if (!plotDiv || !plotDiv.data || plotDiv.data.length === 0) {
            continue;
        }

        checkPageBreak(80); 

        doc.setFontSize(14);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor('#2ECC71');
        doc.text(title, margin, yPos);
        yPos += 8;
        
        let pdfLayout = { ...pdfPlotlyLayoutConfig };
        if (plotDiv.layout.orientation === 'h') {
            pdfLayout.margin = { l: 120, r: 20, b: 40, t: 40 };
            pdfLayout.yaxis = { ...pdfLayout.yaxis, automargin: false };
        }

        try {
            await Plotly.update(plotDivId, {}, pdfLayout);
            const imgData = await Plotly.toImage(plotDivId, { format: 'jpeg', quality: 0.7, width: 800, height: 450 });
            const imgWidth = doc.internal.pageSize.width - margin * 2;
            const imgHeight = (imgWidth * 450) / 800;
            
            checkPageBreak(imgHeight + 5);
            doc.addImage(imgData, 'JPEG', margin, yPos, imgWidth, imgHeight);
            yPos += imgHeight + 5;

        } catch (err) {
            console.error(`Could not render chart ${title} to PDF:`, err);
            doc.setFont('helvetica', 'italic');
            doc.text('Chart could not be rendered.', margin, yPos);
            yPos += 10;
        } finally {
            await Plotly.update(plotDivId, {}, plotlyLayoutConfig);
        }

        let tableData = null;
        let tableKey = null;

        if (title === 'Tipster ROI Leaderboard' && analysisData.tables.tipster_roi) {
            tableData = analysisData.tables.tipster_roi;
            tableKey = 'tipster_roi';
        } else if (title === 'Top 10 Most Traded Horses' && analysisData.tables.most_traded_horses) {
            tableData = analysisData.tables.most_traded_horses;
            tableKey = 'most_traded_horses';
        } else if (title.includes('Jockeys') && analysisData.tables.jockey_performance) {
            tableData = analysisData.tables.jockey_performance;
            tableKey = 'jockey_performance';
        }

        if (tableData && tableData.length > 0 && !renderedTables.has(tableKey)) {
            const head = [Object.keys(tableData[0])];
            const body = tableData.map(row => 
                Object.values(row).map(val => {
                    if (typeof val === 'number') return val.toFixed(2);
                    return val !== null && val !== undefined ? val : '';
                })
            );

            checkPageBreak((body.length + 1) * 7 + 10);
            
            doc.autoTable({
                startY: yPos,
                head: head,
                body: body,
                theme: 'striped',
                styles: {
                    fillColor: '#2D3748',
                    textColor: '#E2E8F0',
                    lineColor: '#4A5568'
                },
                headStyles: { 
                    fillColor: '#2ECC71',
                    textColor: '#1A202C',
                    fontStyle: 'bold'
                },
            });
            yPos = doc.autoTable.previous.finalY + 10;
            renderedTables.add(tableKey);
        }
    }
    
    // Add Footer
    const pageCount = doc.internal.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
        doc.setPage(i);
        doc.setFontSize(10);
        doc.setTextColor('#A0AEC0');
        doc.text('Betting Insights © 2025 Pinecoder.in', margin, pageHeight - 10);
        doc.text(`Page ${i} of ${pageCount}`, doc.internal.pageSize.width - margin, pageHeight - 10, { align: 'right' });
    }

    doc.save('Betting-Performance-Report.pdf');
    spinner.classList.add('hidden');
}