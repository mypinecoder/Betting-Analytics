// Global variables
let uploadedFiles = [];
let chartInstances = {};
let tableInstances = {};

// Chart.js defaults
Chart.defaults.font.family = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
Chart.defaults.color = '#2c3e50';
Chart.defaults.plugins.legend.position = 'top';

document.addEventListener('DOMContentLoaded', () => {
    initializeUploadArea();
});

function initializeUploadArea() {
    const uploadArea = document.getElementById('upload-area');
    const fileInput = document.getElementById('file-input');
    const analyzeBtn = document.getElementById('analyze-btn');

    uploadArea.addEventListener('click', () => fileInput.click());
    uploadArea.addEventListener('dragover', (e) => { e.preventDefault(); uploadArea.classList.add('drag-over'); });
    uploadArea.addEventListener('dragleave', () => uploadArea.classList.remove('drag-over'));
    uploadArea.addEventListener('drop', (e) => {
        e.preventDefault();
        uploadArea.classList.remove('drag-over');
        handleFiles(e.dataTransfer.files);
    });
    fileInput.addEventListener('change', (e) => handleFiles(e.target.files));
    analyzeBtn.addEventListener('click', analyzeData);
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

    analyzeBtn.disabled = uploadedFiles.length === 0;
}

function removeFile(index) {
    uploadedFiles.splice(index, 1);
    handleFiles([]);
}

async function analyzeData() {
    const spinner = document.getElementById('loading-spinner');
    const dashboard = document.getElementById('dashboard');
    spinner.classList.remove('hidden');

    const formData = new FormData();
    uploadedFiles.forEach(file => formData.append('files', file));

    try {
        const response = await fetch('/analyze/', { method: 'POST', body: formData });
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

function populateDashboard(data) {
    // Clear previous results
    document.getElementById('kpi-section-container').innerHTML = '';
    document.getElementById('tabs-container').innerHTML = '';
    document.getElementById('tab-content-container').innerHTML = '';
    
    renderKPIs(data.kpis);
    
    const visualMapping = {
        'Performance Overview': [
            { type: 'table', key: 'tipster_roi', title: 'Tipster ROI Leaderboard', id: 'tipster-roi-table' },
            { type: 'chart', key: 'tipster_strategy', title: 'Tipster Selection Strategy', id: 'tipster-strategy-chart' },
            { type: 'chart', key: 'tipster_vs_market', title: 'Tipster Odds vs. Market (BSP)', id: 'tipster-vs-market-chart' },
            { type: 'chart', key: 'best_odds_provider', title: 'Best Odds Provider', id: 'best-odds-provider-chart' }
        ],
        'Market Analysis': [
            { type: 'chart', key: 'market_movers', title: 'Market Movers (Steamers vs. Drifters)', id: 'market-movers-chart' },
            { type: 'chart', key: 'most_traded_races', title: 'Top 5 Most Traded Races', id: 'most-traded-races-chart' },
            { type: 'table', key: 'most_traded_horses', title: 'Top 10 Most Traded Horses', id: 'most-traded-horses-table' }
        ],
        'Factor Analysis': [
            { type: 'table', key: 'jockey_performance', title: 'Jockey Performance (Rides & Avg. Odds)', id: 'jockey-performance-table' },
            { type: 'chart', key: 'top_jockeys_by_tips', title: 'Top Jockeys by Tip Frequency', id: 'jockey-tips-chart' },
            { type: 'chart', key: 'barrier_performance', title: 'Barrier Performance (by Strike Rate)', id: 'barrier-performance-chart' },
            { type: 'chart', key: 'odds_performance', title: 'Odds vs. Performance (Win Rate %)', id: 'odds-performance-chart' },
            { type: 'chart', key: 'field_size_distribution', title: 'Field Size Distribution', id: 'fieldsize-chart' },
            { type: 'chart', key: 'prize_money_distribution', title: 'Prize Money Distribution', id: 'prizemoney-chart' }
        ],
        'Raw Data': [
            { type: 'table', key: 'recent_tips', title: 'Detailed Merged Data', id: 'raw-data-table' }
        ]
    };

    const tabsContainer = document.getElementById('tabs-container');
    const tabContentContainer = document.getElementById('tab-content-container');
    const tabsWrapper = document.createElement('div');
    tabsWrapper.className = 'tabs';
    
    let isFirstTab = true;

    for (const tabName in visualMapping) {
        const visuals = visualMapping[tabName];
        let hasDataForTab = false;
        
        for (const visual of visuals) {
            const dataSet = visual.type === 'chart' ? data.charts[visual.key] : data.tables[visual.key] || (visual.key === 'recent_tips' ? data.raw_data[visual.key] : null);
            if (dataSet && (Array.isArray(dataSet) ? dataSet.length > 0 : Object.keys(dataSet).length > 0)) {
                hasDataForTab = true;
                break;
            }
        }
        
        if (hasDataForTab) {
            const tabId = tabName.toLowerCase().replace(/\s+/g, '-');
            
            const tabButton = document.createElement('button');
            tabButton.className = `tab ${isFirstTab ? 'active' : ''}`;
            tabButton.dataset.tab = tabId;
            tabButton.innerHTML = tabName;
            tabsWrapper.appendChild(tabButton);

            const tabContent = document.createElement('div');
            tabContent.id = tabId;
            tabContent.className = `tab-content ${isFirstTab ? 'active' : ''}`;
            
            visuals.forEach(visual => {
                const dataSet = visual.type === 'chart' ? data.charts[visual.key] : data.tables[visual.key] || (visual.key === 'recent_tips' ? data.raw_data[visual.key] : null);
                if (dataSet && (Array.isArray(dataSet) ? dataSet.length > 0 : Object.keys(dataSet).length > 0)) {
                    tabContent.appendChild(createVisualContainer(visual.type, visual.id, visual.title));
                }
            });
            tabContentContainer.appendChild(tabContent);
            isFirstTab = false;
        }
    }
    
    tabsContainer.appendChild(tabsWrapper);
    initializeTabs();
    renderAllVisuals(data);
}

function initializeTabs() {
    const tabs = document.querySelectorAll('.tab');
    const tabContents = document.querySelectorAll('.tab-content');
    if (!tabs.length) return;

    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            const targetTab = tab.dataset.tab;
            tabs.forEach(t => t.classList.remove('active'));
            tabContents.forEach(tc => tc.classList.remove('active'));
            tab.classList.add('active');
            document.getElementById(targetTab).classList.add('active');
        });
    });
}

function createVisualContainer(type, id, title) {
    const section = document.createElement('div');
    section.className = 'analysis-section';
    section.innerHTML = `
        <div class="section-header">
            <h3 class="section-title"><i class="section-icon fas fa-chart-bar"></i> ${title}</h3>
        </div>
        ${type === 'chart' ? `<div class="chart-container"><canvas id="${id}"></canvas></div>` : ''}
        ${type === 'table' ? `<div class="table-container"><table id="${id}" class="display"></table></div>` : ''}
    `;
    return section;
}

function renderAllVisuals(data) {
    // Charts
    renderChart(data.charts.tipster_strategy, 'tipster-strategy-chart', 'bar', { index_axis: 'y', data_label: 'Average Tipped Odds', x_label: 'Average BestOdds', single_color: '#f39c12' });
    renderChart(data.charts.tipster_vs_market, 'tipster-vs-market-chart', 'bar', { data_label: 'Average Odds', x_label: 'Tipster', is_grouped: true });
    renderChart(data.charts.best_odds_provider, 'best-odds-provider-chart', 'pie', { multi_color: true });
    renderChart(data.charts.market_movers, 'market-movers-chart', 'bar', { data_label: '% Change (Morning to BSP)', x_label: 'Percentage Change', colors: (d) => d.map(v => v > 0 ? '#e74c3c' : '#27ae60') });
    renderChart(data.charts.most_traded_races, 'most-traded-races-chart', 'bar', { index_axis: 'y', data_label: 'Traded Volume ($)', x_label: 'Volume ($)', single_color: '#3498db' });
    renderChart(data.charts.top_jockeys_by_tips, 'jockey-tips-chart', 'bar', { index_axis: 'y', data_label: '# of Tips', single_color: '#3498db' });
    renderChart(data.charts.barrier_performance, 'barrier-performance-chart', 'bar', { data_label: 'Strike Rate %', x_label: 'Barrier Number', single_color: '#9b59b6' });
    renderChart(data.charts.odds_performance, 'odds-performance-chart', 'bar', { data_label: 'Win Rate %', x_label: 'Odds Bracket', single_color: '#e67e22' });
    renderChart(data.charts.field_size_distribution, 'fieldsize-chart', 'bar', { data_label: '# of Races', single_color: '#1abc9c' });
    renderChart(data.charts.prize_money_distribution, 'prizemoney-chart', 'pie', { multi_color: true });
    
    // Tables
    renderTable('tipster-roi-table', data.tables.tipster_roi, [
        { data: 'Tipster', title: 'Tipster' }, { data: 'Total Tips', title: 'Total Tips' }, { data: 'Winners', title: 'Winners' },
        { data: 'Strike Rate', title: 'Strike Rate (%)', render: (d) => d ? d.toFixed(2) : '0.00' },
        { data: 'Profit/Loss', title: 'P/L ($)', render: (d) => d ? `$${d.toFixed(2)}` : '$0.00' },
        { data: 'ROI', title: 'ROI (%)', render: (d) => d ? d.toFixed(2) : '0.00' }
    ], { pageLength: 10, order: [[5, 'desc']] });
    renderTable('most-traded-horses-table', data.tables.most_traded_horses, [
        { data: 'Horse Name', title: 'Horse Name' }, { data: 'event_name', title: 'Race' },
        { data: 'pptradedvol', title: 'Traded Volume', render: (d) => d ? `$${d.toLocaleString(undefined, {minimumFractionDigits:2, maximumFractionDigits:2})}` : '-' }
    ], { pageLength: 5, searching: false, lengthChange: false, info: false, order: [[2, 'desc']] });
    renderTable('jockey-performance-table', data.tables.jockey_performance, [
        { data: 'JockeyName', title: 'Jockey Name' }, { data: 'num_rides', title: 'Rides' }, { data: 'avg_odds', title: 'Average Odds', render: (d) => d ? d.toFixed(2) : '-' }
    ], { pageLength: 10, order: [[1, 'desc']] });
    renderTable('raw-data-table', data.raw_data.recent_tips, [
        { data: 'Tipster', title: 'Tipster' }, { data: 'Track', title: 'Track' }, { data: 'Race', title: 'Race' }, { data: 'Position', title: 'Pos' },
        { data: 'Horse', title: 'Horse' }, { data: 'Jockey', title: 'Jockey' }, { data: 'Barrier', title: 'Barrier' },
        { data: 'Best Odds', title: 'Best Odds', render: (d) => d ? d.toFixed(2) : '-' },
        { data: 'BSP', title: 'BSP', render: (d) => d ? d.toFixed(2) : '-' },
        { data: 'Result', title: 'Result', render: (d) => d === 1 ? 'Win' : (d === 0 ? 'Loss' : '-') }
    ], { pageLength: 25, order: [[1, 'asc'], [2, 'asc']] });
}

function renderKPIs(kpis) {
    const kpiContainer = document.getElementById('kpi-section-container');
    if (!kpis || Object.keys(kpis).length === 0) return;

    const kpiSection = document.createElement('div');
    kpiSection.className = 'analysis-section';
    kpiSection.innerHTML = `<div class="section-header"><h3 class="section-title"><i class="fas fa-tachometer-alt section-icon"></i>Key Performance Indicators</h3></div><div id="kpi-grid" class="kpi-grid"></div>`;
    kpiContainer.appendChild(kpiSection);

    const kpiGrid = document.getElementById('kpi-grid');
    const kpiMapping = {
        total_tips: { label: 'Total Tips', icon: 'fas fa-list-ol' },
        total_tipsters: { label: 'Unique Tipsters', icon: 'fas fa-user-secret' },
        total_races: { label: 'Total Races', icon: 'fas fa-flag-checkered' },
        total_tracks: { label: 'Unique Tracks', icon: 'fas fa-map-marker-alt' },
        total_traded_volume: { label: 'Total Traded Volume', icon: 'fas fa-dollar-sign', format: 'currency' }
    };

    for (const [key, value] of Object.entries(kpis)) {
        if (value === null || value === undefined) continue;
        const config = kpiMapping[key];
        if (!config) continue;

        let formattedValue = value.toLocaleString();
        if (config.format === 'currency') formattedValue = `$${(value/1000000).toFixed(2)}M`;

        const card = document.createElement('div');
        card.className = 'kpi-card';
        card.innerHTML = `<div class="kpi-label"><i class="${config.icon}"></i> ${config.label}</div><div class="kpi-value">${formattedValue}</div>`;
        kpiGrid.appendChild(card);
    }
}

function renderChart(data, canvasId, type, options = {}) {
    const canvas = document.getElementById(canvasId);
    if (!canvas || !data || (!data.labels && !data.datasets)) return;

    const colorPalette = ['#3498db', '#2ecc71', '#f1c40f', '#e74c3c', '#9b59b6', '#1abc9c', '#e67e22'];
    let datasets;
    if (options.is_grouped && data.datasets) {
        datasets = data.datasets.map((ds, i) => ({ ...ds, backgroundColor: colorPalette[i % colorPalette.length] }));
    } else {
        let backgroundColors = options.single_color || colorPalette[0];
        if (options.colors) backgroundColors = options.colors(data.data);
        else if (options.multi_color) backgroundColors = colorPalette;
        datasets = [{ label: options.data_label || '', data: data.data, backgroundColor: backgroundColors }];
    }

    const config = {
        type: type,
        data: { labels: data.labels, datasets: datasets },
        options: {
            responsive: true, maintainAspectRatio: false,
            indexAxis: options.index_axis || 'x',
            plugins: { title: { display: false }, legend: { display: type === 'pie' || options.is_grouped ? true : !!options.data_label } },
            scales: {
                x: { title: { display: !!options.x_label, text: options.x_label || '' } },
                y: { title: { display: !!options.y_label, text: options.y_label || '' } }
            }
        }
    };
    if (chartInstances[canvasId]) chartInstances[canvasId].destroy();
    chartInstances[canvasId] = new Chart(canvas.getContext('2d'), config);
}

function renderTable(tableId, data, columns, options = {}) {
    const table = document.getElementById(tableId);
    if (!table || !data || data.length === 0) return;
    
    if (tableInstances[tableId]) tableInstances[tableId].destroy();
    tableInstances[tableId] = $(`#${tableId}`).DataTable({
        data: data,
        columns: columns,
        responsive: true,
        ...options
    });
}
