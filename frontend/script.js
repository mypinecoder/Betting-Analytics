// Global variables
let uploadedFiles = [];
let chartInstances = {};
let tableInstances = {};

// Chart.js defaults
Chart.defaults.font.family = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
Chart.defaults.color = '#2c3e50';

// Initialize on DOM load
document.addEventListener('DOMContentLoaded', () => {
    initializeUploadArea();
    initializeTabs();
});

// Upload functionality
function initializeUploadArea() {
    const uploadArea = document.getElementById('upload-area');
    const fileInput = document.getElementById('file-input');
    const analyzeBtn = document.getElementById('analyze-btn');

    // Click to upload
    uploadArea.addEventListener('click', () => fileInput.click());

    // Drag and drop
    uploadArea.addEventListener('dragover', (e) => {
        e.preventDefault();
        uploadArea.classList.add('drag-over');
    });

    uploadArea.addEventListener('dragleave', () => {
        uploadArea.classList.remove('drag-over');
    });

    uploadArea.addEventListener('drop', (e) => {
        e.preventDefault();
        uploadArea.classList.remove('drag-over');
        handleFiles(e.dataTransfer.files);
    });

    // File input change
    fileInput.addEventListener('change', (e) => {
        handleFiles(e.target.files);
    });

    // Analyze button
    analyzeBtn.addEventListener('click', analyzeData);
}

// Handle file uploads
function handleFiles(files) {
    const fileList = document.getElementById('file-list');
    const analyzeBtn = document.getElementById('analyze-btn');

    // Add new files
    Array.from(files).forEach(file => {
        if (file.type === 'text/csv' || file.name.endsWith('.csv')) {
            // Check if file already exists
            if (!uploadedFiles.find(f => f.name === file.name)) {
                uploadedFiles.push(file);
            }
        }
    });

    // Update UI
    fileList.innerHTML = '';
    uploadedFiles.forEach((file, index) => {
        const fileItem = document.createElement('div');
        fileItem.className = 'file-item';
        fileItem.innerHTML = `
            <span><i class="fas fa-file-csv"></i> ${file.name}</span>
            <button onclick="removeFile(${index})" style="background: none; border: none; color: #e74c3c; cursor: pointer;">
                <i class="fas fa-times"></i>
            </button>
        `;
        fileList.appendChild(fileItem);
    });

    // Enable/disable analyze button
    analyzeBtn.disabled = uploadedFiles.length === 0;
}

// Remove file from list
function removeFile(index) {
    uploadedFiles.splice(index, 1);
    handleFiles([]);
}

// Tab functionality
function initializeTabs() {
    const tabs = document.querySelectorAll('.tab');
    const tabContents = document.querySelectorAll('.tab-content');

    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            const targetTab = tab.getAttribute('data-tab');

            // Update active states
            tabs.forEach(t => t.classList.remove('active'));
            tabContents.forEach(tc => tc.classList.remove('active'));

            tab.classList.add('active');
            document.getElementById(targetTab).classList.add('active');
        });
    });
}

// Analyze data
async function analyzeData() {
    const spinner = document.getElementById('loading-spinner');
    const dashboard = document.getElementById('dashboard');

    // Show spinner
    spinner.classList.remove('hidden');

    // Prepare form data
    const formData = new FormData();
    uploadedFiles.forEach(file => {
        formData.append('files', file);
    });

    try {
        const response = await fetch('http://localhost:8000/analyze/', {
            method: 'POST',
            body: formData
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.detail || 'Analysis failed');
        }

        const data = await response.json();
        populateDashboard(data);
        dashboard.classList.remove('hidden');

    } catch (error) {
        console.error('Analysis error:', error);
        alert(`Analysis failed: ${error.message}`);
    } finally {
        spinner.classList.add('hidden');
    }
}

// Populate dashboard with analysis results
function populateDashboard(data) {
    // Update KPIs
    updateKPIs(data.kpis);

    // Update charts and tables for each analysis type
    if (data.tipster_analysis) {
        updateTipsterAnalysis(data.tipster_analysis);
    }

    if (data.market_analysis) {
        updateMarketAnalysis(data.market_analysis);
    }

    if (data.factor_analysis) {
        updateFactorAnalysis(data.factor_analysis);
    }

    if (data.track_analysis) {
        updateTrackAnalysis(data.track_analysis);
    }

    if (data.position_analysis) {
        updatePositionAnalysis(data.position_analysis);
    }

    if (data.time_analysis) {
        updateTimeAnalysis(data.time_analysis);
    }

    if (data.raw_data) {
        updateRawDataTable(data.raw_data);
    }
}

// Update KPIs
function updateKPIs(kpis) {
    document.getElementById('kpi-total-tips').textContent = kpis.total_tips || 0;
    document.getElementById('kpi-tipsters').textContent = kpis.unique_tipsters || 0;
    document.getElementById('kpi-races').textContent = kpis.unique_races || 0;
    document.getElementById('kpi-tracks').textContent = kpis.unique_tracks || 0;
    document.getElementById('kpi-field-size').textContent = 
        kpis.avg_field_size ? kpis.avg_field_size.toFixed(1) : 0;
    document.getElementById('kpi-prize-money').textContent = 
        kpis.total_prize_money ? `$${kpis.total_prize_money.toLocaleString()}` : '$0';
}

// Update tipster analysis
function updateTipsterAnalysis(analysis) {
    // ROI Table
    if (analysis.roi_summary) {
        if (tableInstances.roiTable) {
            tableInstances.roiTable.destroy();
        }

        tableInstances.roiTable = $('#roi-table').DataTable({
            data: analysis.roi_summary,
            columns: [
                { data: 'Tipster' },
                { data: 'Total Tips' },
                { data: 'Winners' },
                { 
                    data: 'Strike Rate',
                    render: (data) => data ? data.toFixed(2) + '%' : '0%'
                },
                { 
                    data: 'Total Invested',
                    render: (data) => '$' + data
                },
                { 
                    data: 'Total Return',
                    render: (data) => '$' + data.toFixed(2)
                },
                { 
                    data: 'Profit/Loss',
                    render: (data) => {
                        const color = data >= 0 ? 'text-success' : 'text-danger';
                        return `<span class="${color}">$${data.toFixed(2)}</span>`;
                    }
                },
                { 
                    data: 'ROI %',
                    render: (data) => {
                        const color = data >= 0 ? 'text-success' : 'text-danger';
                        return `<span class="${color}">${data.toFixed(2)}%</span>`;
                    }
                }
            ],
            order: [[7, 'desc']], // Sort by ROI
            responsive: true
        });

        // Strike Rate Chart
        const strikeRateData = analysis.roi_summary.sort((a, b) => b['Strike Rate'] - a['Strike Rate']).slice(0, 10);
        createChart('strike-rate-chart', {
            type: 'bar',
            data: {
                labels: strikeRateData.map(d => d.Tipster),
                datasets: [{
                    label: 'Strike Rate %',
                    data: strikeRateData.map(d => d['Strike Rate']),
                    backgroundColor: '#3498db'
                }]
            },
            options: {
                indexAxis: 'y',
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false }
                },
                scales: {
                    x: {
                        beginAtZero: true,
                        max: 100
                    }
                }
            }
        });

        // ROI Chart
        const roiData = analysis.roi_summary.sort((a, b) => b['ROI %'] - a['ROI %']).slice(0, 20);;
        createChart('roi-chart', {
            type: 'bar',
            data: {
                labels: roiData.map(d => d.Tipster),
                datasets: [{
                    label: 'ROI %',
                    data: roiData.map(d => d['ROI %']),
                    backgroundColor: roiData.map(d => d['ROI %'] >= 0 ? '#27ae60' : '#e74c3c')
                }]
            },
            options: {
                indexAxis: 'y',
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false }
                }
            }
        });
    }
}

// Update market analysis
function updateMarketAnalysis(analysis) {
    // Market movement categories
    if (analysis.movement_categories) {
        const labels = Object.keys(analysis.movement_categories);
        const data = Object.values(analysis.movement_categories);

        createChart('market-movement-chart', {
            type: 'doughnut',
            data: {
                labels: labels,
                datasets: [{
                    data: data,
                    backgroundColor: [
                        '#3498db', '#2ecc71', '#f1c40f', '#e67e22', '#e74c3c', '#9b59b6'
                    ]
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        position: 'bottom'
                    }
                }
            }
        });
    }

    // Tipster movements
    if (analysis.tipster_movements) {
        const movementData = analysis.tipster_movements.sort((a, b) => Math.abs(b.mean) - Math.abs(a.mean)).slice(0, 20);;
        
        createChart('tipster-movement-chart', {
            type: 'bar',
            data: {
                labels: movementData.map(d => d['Tip Website']),
                datasets: [{
                    label: 'Avg Price Movement %',
                    data: movementData.map(d => d.mean),
                    backgroundColor: movementData.map(d => d.mean > 0 ? '#e74c3c' : '#27ae60')
                }]
            },
            options: {
                indexAxis: 'y',
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        callbacks: {
                            label: (context) => {
                                const value = context.parsed.x;
                                return `${value > 0 ? 'Drifted' : 'Shortened'}: ${Math.abs(value).toFixed(2)}%`;
                            }
                        }
                    }
                }
            }
        });
    }

    // Volume analysis
    if (analysis.volume_by_tipster) {
        createChart('volume-chart', {
            type: 'bar',
            data: {
                labels: analysis.volume_by_tipster.labels,
                datasets: [{
                    label: 'Pre-Post Traded Volume ($)',
                    data: analysis.volume_by_tipster.data,
                    backgroundColor: '#f39c12'
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    y: {
                        beginAtZero: true,
                        ticks: {
                            callback: (value) => ' + value.toLocaleString()'
                        }
                    }
                },
                plugins: {
                    tooltip: {
                        callbacks: {
                            label: (context) => ' + context.parsed.y.toLocaleString()'
                        }
                    }
                }
            }
        });
    }
}

// Update factor analysis
function updateFactorAnalysis(analysis) {
    // Jockey analysis
    if (analysis.top_jockeys) {
        createChart('jockey-chart', {
            type: 'bar', // Change type to 'bar'
            data: {
                labels: analysis.top_jockeys.labels,
                datasets: [{
                    label: 'Number of Tips',
                    data: analysis.top_jockeys.data,
                    backgroundColor: '#3498db'
                }]
            },
            options: {
                indexAxis: 'y', // Add this line to make the bar chart horizontal
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false }
                },
                scales: {
                    x: {
                        beginAtZero: true
                    }
                }
            }
        });
    }
    // Barrier analysis
    if (analysis.barrier_analysis) {
        const barrierData = analysis.barrier_analysis.sort((a, b) => a.Barrier - b.Barrier);
        createChart('barrier-chart', {
            type: 'line',
            data: {
                labels: barrierData.map(d => `Barrier ${d.Barrier}`),
                datasets: [{
                    label: 'Tips Count',
                    data: barrierData.map(d => d['Horse Name']),
                    borderColor: '#3498db',
                    backgroundColor: 'rgba(52, 152, 219, 0.1)',
                    tension: 0.3
                }, {
                    label: 'Winners',
                    data: barrierData.map(d => d.win_lose || 0),
                    borderColor: '#27ae60',
                    backgroundColor: 'rgba(39, 174, 96, 0.1)',
                    tension: 0.3
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    y: {
                        beginAtZero: true
                    }
                }
            }
        });
    }

    // Distance distribution
    if (analysis.distance_distribution) {
        createChart('distance-chart', {
            type: 'pie',
            data: {
                labels: analysis.distance_distribution.labels,
                datasets: [{
                    data: analysis.distance_distribution.data,
                    backgroundColor: ['#3498db', '#2ecc71', '#f39c12', '#e74c3c']
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        position: 'right'
                    }
                }
            }
        });
    }

    // Odds distribution
    if (analysis.odds_distribution) {
        createChart('odds-chart', {
            type: 'bar',
            data: {
                labels: analysis.odds_distribution.labels,
                datasets: [{
                    label: 'Number of Tips',
                    data: analysis.odds_distribution.data,
                    backgroundColor: ['#27ae60', '#3498db', '#f39c12', '#e67e22', '#e74c3c']
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    y: {
                        beginAtZero: true
                    }
                }
            }
        });
    }
}

// Update track analysis
function updateTrackAnalysis(analysis) {
    if (analysis && analysis.length > 0) {
        if (tableInstances.trackTable) {
            tableInstances.trackTable.destroy();
        }

        tableInstances.trackTable = $('#track-table').DataTable({
            data: analysis,
            columns: [
                { data: 'Track' },
                { data: 'Total Tips' },
                { data: 'Winners' },
                { 
                    data: 'Strike Rate',
                    render: (data) => data ? data.toFixed(2) + '%' : '0%'
                }
            ],
            order: [[3, 'desc']],
            responsive: true
        });
    }
}

// Update time analysis
function updateTimeAnalysis(analysis) {
    if (analysis.hourly) {
        const hourlyData = analysis.hourly.sort((a, b) => a.Hour - b.Hour);
        
        createChart('hourly-chart', {
            type: 'line',
            data: {
                labels: hourlyData.map(d => `${d.Hour}:00`),
                datasets: [{
                    label: 'Total Tips',
                    data: hourlyData.map(d => d['Total Tips']),
                    borderColor: '#3498db',
                    backgroundColor: 'rgba(52, 152, 219, 0.1)',
                    yAxisID: 'y',
                    tension: 0.3
                }, {
                    label: 'Winners',
                    data: hourlyData.map(d => d.Winners),
                    borderColor: '#27ae60',
                    backgroundColor: 'rgba(39, 174, 96, 0.1)',
                    yAxisID: 'y1',
                    tension: 0.3
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                interaction: {
                    mode: 'index',
                    intersect: false,
                },
                scales: {
                    y: {
                        type: 'linear',
                        display: true,
                        position: 'left',
                        title: {
                            display: true,
                            text: 'Total Tips'
                        }
                    },
                    y1: {
                        type: 'linear',
                        display: true,
                        position: 'right',
                        title: {
                            display: true,
                            text: 'Winners'
                        },
                        grid: {
                            drawOnChartArea: false,
                        }
                    }
                }
            }
        });
    }
}

// Update position analysis
function updatePositionAnalysis(analysis) {
    if (analysis && analysis.length > 0) {
        // Update stat cards
        analysis.forEach((pos, index) => {
            const card = document.getElementById(`position-${index + 1}`);
            if (card) {
                card.querySelector('.stat-card-value').textContent = 
                    pos['Strike Rate'] ? pos['Strike Rate'].toFixed(2) + '%' : '0%';
            }
        });

        // Create comparison chart
        createChart('position-chart', {
            type: 'bar',
            data: {
                labels: analysis.map(d => d.Position),
                datasets: [{
                    label: 'Strike Rate %',
                    data: analysis.map(d => d['Strike Rate']),
                    backgroundColor: ['#f39c12', '#3498db', '#cd7f32', '#95a5a6']
                }, {
                    label: 'Avg Win Odds',
                    data: analysis.map(d => d['Avg Win Odds']),
                    backgroundColor: ['rgba(243, 156, 18, 0.5)', 'rgba(52, 152, 219, 0.5)', 
                                     'rgba(205, 127, 50, 0.5)', 'rgba(149, 165, 166, 0.5)'],
                    yAxisID: 'y1'
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    y: {
                        beginAtZero: true,
                        title: {
                            display: true,
                            text: 'Strike Rate %'
                        }
                    },
                    y1: {
                        beginAtZero: true,
                        position: 'right',
                        title: {
                            display: true,
                            text: 'Avg Win Odds'
                        },
                        grid: {
                            drawOnChartArea: false
                        }
                    }
                }
            }
        });
    }
}

// Update raw data table
function updateRawDataTable(rawData) {
    if (rawData.recent_tips && rawData.recent_tips.length > 0) {
        if (tableInstances.rawDataTable) {
            tableInstances.rawDataTable.destroy();
        }

        tableInstances.rawDataTable = $('#raw-data-table').DataTable({
            data: rawData.recent_tips,
            columns: [
                { data: 'Tip Website', defaultContent: '-' },
                { data: 'Track', defaultContent: '-' },
                { data: 'Race', defaultContent: '-' },
                { data: 'Selection Position', defaultContent: '-' },
                { data: 'Horse Name', defaultContent: '-' },
                { data: 'JockeyName', defaultContent: '-' },
                { data: 'Barrier', defaultContent: '-' },
                { 
                    data: 'BestOdds', 
                    defaultContent: '-',
                    render: (data) => data ? data.toFixed(2) : '-'
                },
                { 
                    data: 'bsp', 
                    defaultContent: '-',
                    render: (data) => data ? data.toFixed(2) : '-'
                },
                { 
                    data: 'win_lose', 
                    defaultContent: '-',
                    render: (data) => {
                        if (data === 1) return '<span class="text-success">WIN</span>';
                        if (data === 0) return '<span class="text-danger">LOSE</span>';
                        return '-';
                    }
                }
            ],
            pageLength: 25,
            responsive: true,
            order: [[0, 'asc'], [1, 'asc'], [2, 'asc']]
        });
    }
}

// Helper function to create/update charts
function createChart(canvasId, config) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;

    // Destroy existing chart
    if (chartInstances[canvasId]) {
        chartInstances[canvasId].destroy();
    }

    // Create new chart
    const ctx = canvas.getContext('2d');
    chartInstances[canvasId] = new Chart(ctx, config);
}

// Export data functionality (optional)
function exportToCSV(data, filename) {
    const csv = convertToCSV(data);
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    window.URL.revokeObjectURL(url);
}

function convertToCSV(data) {
    if (!data || data.length === 0) return '';
    
    const headers = Object.keys(data[0]);
    const csvHeaders = headers.join(',');
    
    const csvRows = data.map(row => {
        return headers.map(header => {
            const value = row[header];
            return typeof value === 'string' && value.includes(',') 
                ? `"${value}"` 
                : value;
        }).join(',');
    });
    
    return [csvHeaders, ...csvRows].join('\n');
}