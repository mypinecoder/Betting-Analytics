document.addEventListener('DOMContentLoaded', () => {
    const uploadForm = document.getElementById('upload-form');
    const filesInput = document.getElementById('csv-files');
    const dashboardResults = document.getElementById('dashboard-results');
    const loadingSpinner = document.getElementById('loading-spinner');
    
    let charts = {};
    let dataTables = {};

    uploadForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        if (filesInput.files.length === 0) return alert('Please select files.');

        loadingSpinner.style.display = 'block';
        document.querySelectorAll('.analysis-section').forEach(el => el.classList.add('hidden'));

        const formData = new FormData();
        for (const file of filesInput.files) formData.append('files', file);

        try {
            const response = await fetch('http://127.0.0.1:8000/analyze/', { method: 'POST', body: formData });
            if (!response.ok) throw new Error((await response.json()).detail || 'Analysis failed.');
            
            const data = await response.json();
            populateDashboard(data);
            dashboardResults.classList.remove('hidden');
        } catch (error) {
            console.error('Error during analysis:', error);
            alert(`Analysis Failed: ${error.message}`);
        } finally {
            loadingSpinner.style.display = 'none';
        }
    });

    const createChart = (id, config) => {
        if (charts[id]) charts[id].destroy();
        const ctx = document.getElementById(id);
        if(ctx) charts[id] = new Chart(ctx, config);
    };

    const createHtmlTable = (containerId, data, headers) => {
        const container = document.getElementById(containerId);
        if (!container || !data || data.length === 0) return;
        
        let table = '<table class="simple-table">';
        table += '<thead><tr>' + headers.map(h => `<th>${h.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}</th>`).join('') + '</tr></thead>';
        table += '<tbody>';
        data.forEach(row => {
            table += '<tr>' + headers.map(h => `<td>${row[h] === null ? 'N/A' : row[h]}</td>`).join('') + '</tr>';
        });
        table += '</tbody></table>';
        container.innerHTML = table;
    };

    function populateDashboard(data) {
        const { kpis, analyses, raw_data } = data;

        // KPIs
        if (kpis) {
            document.getElementById('kpi-section').classList.remove('hidden');
            document.getElementById('kpi-jockey').textContent = kpis.most_tipped_jockey || 'N/A';
            document.getElementById('kpi-bsp').textContent = kpis.avg_tipped_bsp ? kpis.avg_tipped_bsp.toFixed(2) : 'N/A';
            document.getElementById('kpi-prize').textContent = kpis.total_prize_money ? `$${kpis.total_prize_money.toLocaleString()}` : 'N/A';
        }

        // Performance Table
        if (analyses.tipster_performance) {
            document.getElementById('performance-section').classList.remove('hidden');
            createHtmlTable('performance-summary-table', analyses.tipster_performance, ['Tip Website', 'total_tips', 'win_strike_rate', 'place_strike_rate']);
        }
        
        // Market Analysis
        if (analyses.market_drift && analyses.market_volume) {
            document.getElementById('market-analysis-section').classList.remove('hidden');
            createChart('marketDriftChart', { type: 'bar', data: { labels: analyses.market_drift.map(d => d['Tip Website']), datasets: [{ label: 'Avg BSP vs Morning Odds Difference', data: analyses.market_drift.map(d => d.bsp_vs_morning_diff), backgroundColor: d => d.bsp_vs_morning_diff > 0 ? '#28a745' : '#dc3545' }] }, options: { indexAxis: 'y', plugins: { title: { display: true, text: 'Market Drift (BSP vs. Morning WAP)' } } } });
            createChart('marketVolumeChart', { type: 'bar', data: { labels: analyses.market_volume.map(d => d['Tip Website']), datasets: [{ label: 'Total Pre-Post Traded Volume ($)', data: analyses.market_volume.map(d => d.total_win_volume), backgroundColor: '#ffc107' }] }, options: { indexAxis: 'y', plugins: { title: { display: true, text: 'Market Volume on Tipped Horses' } } } });
        }

        // Factor Analysis
        if (analyses.jockey_analysis || analyses.barrier_analysis) {
             document.getElementById('factor-analysis-section').classList.remove('hidden');
            if(analyses.jockey_analysis) createChart('jockeyAnalysisChart', { type: 'bar', data: { labels: analyses.jockey_analysis.labels, datasets: [{ label: 'Number of Tips', data: analyses.jockey_analysis.data, backgroundColor: '#17a2b8' }] }, options: { indexAxis: 'y', plugins: { title: { display: true, text: 'Most Tipped Jockeys' } } } });
            if(analyses.barrier_analysis) createChart('barrierAnalysisChart', { type: 'bar', data: { labels: analyses.barrier_analysis.labels, datasets: [{ label: 'Number of Tips', data: analyses.barrier_analysis.data, backgroundColor: '#6f42c1' }] }, options: { plugins: { title: { display: true, text: 'Tip Distribution by Barrier' } } } });
        }

        // Detailed Merged Table
        if (raw_data.merged) {
            document.getElementById('raw-data-section').classList.remove('hidden');
            const columns = ['Tip Website', 'Track', 'Race', 'Horse Name', 'JockeyName', 'Barrier', 'Distance', 'TrackCond', 'bsp_win', 'win_lose_win'];
            if(dataTables['merged-table']) dataTables['merged-table'].destroy();
            dataTables['merged-table'] = $('#merged-table').DataTable({
                data: raw_data.merged,
                columns: columns.map(c => ({ data: c, title: c.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()), defaultContent: "N/A" })),
                responsive: true, pageLength: 10, destroy: true,
            });
        }
    }
});