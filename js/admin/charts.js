import { STATE } from './state.js';
import * as logic from './logic.js';

// 大会日を示す破線を描画するChart.jsプラグイン
export const targetDateLinePlugin = {
    id: 'targetDateLinePlugin',
    afterDraw: (chart) => {
        if (!STATE.settings || !STATE.settings.targetEventDate) return;
        const targetObj = new Date(STATE.settings.targetEventDate + 'T00:00:00');
        const targetLabel = String(targetObj.getMonth()+1).padStart(2,'0') + '/' + String(targetObj.getDate()).padStart(2,'0');
        const index = chart.data.labels.findIndex(l => l === targetLabel);
        
        if (index !== -1) {
            const ctx = chart.ctx, meta = chart.getDatasetMeta(0);
            if (!meta.data[index]) return;
            const x = meta.data[index].x, topY = chart.chartArea.top, bottomY = chart.chartArea.bottom;
            ctx.save(); 
            ctx.beginPath(); 
            ctx.moveTo(x, topY); 
            ctx.lineTo(x, bottomY);
            ctx.lineWidth = 2; 
            ctx.strokeStyle = '#f97316'; 
            ctx.setLineDash([5, 5]); 
            ctx.stroke();
            ctx.fillStyle = '#f97316'; 
            ctx.textAlign = 'center'; 
            ctx.textBaseline = 'bottom';
            ctx.font = 'bold 12px -apple-system, sans-serif';
            ctx.fillText('🏆 ' + (STATE.settings.targetEventName || '大会日'), x, topY - 5);
            ctx.restore();
        }
    }
};

/**
 * チーム全体の推移グラフを描画・更新します
 */
export function drawTeamTrendChart(logs) {
    const ascLogs = [...logs].reverse();
    const dailyData = {};
    
    ascLogs.forEach(log => {
        if(!dailyData[log.date]) dailyData[log.date] = { loads: [], fatigues: [] };
        if(log.trainingLoad && log.trainingLoad !== '-') dailyData[log.date].loads.push(parseFloat(log.trainingLoad));
        if(log.fatigue) dailyData[log.date].fatigues.push(parseInt(log.fatigue));
    });
    
    const labels = []; 
    const avgLoads = []; 
    const avgFatigues = [];
    const sortedDates = Object.keys(dailyData).sort();
    
    sortedDates.forEach(date => {
        labels.push(`${date.split('-')[1]}/${date.split('-')[2]}`);
        const loads = dailyData[date].loads; 
        const fatigues = dailyData[date].fatigues;
        avgLoads.push(loads.length ? loads.reduce((a,b)=>a+b,0)/loads.length : 0);
        avgFatigues.push(fatigues.length ? fatigues.reduce((a,b)=>a+b,0)/fatigues.length : 0);
    });

    const ctx = document.getElementById('teamTrendChart')?.getContext('2d');
    if(!ctx) return;
    
    const isDark = document.body.classList.contains('dark-mode');
    const tickColor = isDark ? '#94a3b8' : '#6b7280'; 
    const gridColor = isDark ? '#333333' : '#e5e7eb';
    const constColors = window.CONSTANTS.COLORS;

    if (STATE.charts.teamTrend) {
        STATE.charts.teamTrend.data.labels = labels;
        STATE.charts.teamTrend.data.datasets[0].data = avgLoads;
        STATE.charts.teamTrend.data.datasets[1].data = avgFatigues;
        STATE.charts.teamTrend.options.scales.x.ticks.color = tickColor; 
        STATE.charts.teamTrend.options.scales.x.grid.color = gridColor;
        STATE.charts.teamTrend.options.scales.y.ticks.color = tickColor; 
        STATE.charts.teamTrend.options.scales.y.grid.color = gridColor;
        STATE.charts.teamTrend.options.scales.y1.ticks.color = tickColor;
        STATE.charts.teamTrend.update();
    } else {
        STATE.charts.teamTrend = new Chart(ctx, {
            type: 'line',
            data: {
                labels: labels,
                datasets: [
                    { label: '平均 Load', data: avgLoads, backgroundColor: constColors.CHART_LOAD, yAxisID: 'y', type: 'bar', borderRadius:4 },
                    { label: '平均 疲労度', data: avgFatigues, borderColor: constColors.CHART_FATIGUE, type: 'line', borderDash: [5, 5], yAxisID: 'y1', tension: 0.2, borderWidth: 3 }
                ]
            },
            options: { 
                responsive: true, maintainAspectRatio: false, 
                scales: { 
                    x: { ticks: { color: tickColor }, grid: { color: gridColor } },
                    y: { beginAtZero: true, ticks: { color: tickColor }, grid: { color: gridColor } }, 
                    y1: { position: 'right', min: 0, max: 10, grid: { drawOnChartArea: false }, ticks: { color: tickColor } } 
                },
                plugins: { legend: { labels: { color: tickColor } } }
            }
        });
    }
}

/**
 * 個別詳細分析画面のテキストスタッツとグラフを更新します
 */
export function updateIndividualAnalysis(playerName, filteredLogs, allLogs) {
    if (!playerName) return;
    
    const playerLogs = filteredLogs.filter(log => log.playerName === playerName);
    const recent7Logs = playerLogs.slice(0, 7); 
    const metrics = logic.calculateMonotony([...recent7Logs].reverse());
    
    // テキストスタッツの更新
    document.getElementById('stat-total-load').textContent = Math.round(metrics.totalLoad);
    const monEl = document.getElementById('stat-monotony');
    monEl.textContent = metrics.monotony.toFixed(2);
    monEl.style.color = metrics.monotony >= window.CONSTANTS.THRESHOLDS.MONOTONY_WARNING ? 'var(--color-danger)' : 'var(--text-main)';
    document.getElementById('stat-strain').textContent = Math.round(metrics.strain);

    const todayObj = new Date(); 
    todayObj.setHours(0,0,0,0);
    const acwrMetrics = logic.calculateACWR(playerName, todayObj, allLogs);
    const acwrEl = document.getElementById('stat-acwr');
    acwrEl.textContent = acwrMetrics.ratio.toFixed(2);
    
    if (acwrMetrics.ratio >= window.CONSTANTS.THRESHOLDS.ACWR_DANGER) acwrEl.style.color = 'var(--color-danger)';
    else if (acwrMetrics.ratio >= window.CONSTANTS.THRESHOLDS.ACWR_SWEET_SPOT_MIN && acwrMetrics.ratio <= window.CONSTANTS.THRESHOLDS.ACWR_SWEET_SPOT_MAX) acwrEl.style.color = 'var(--color-success)';
    else acwrEl.style.color = 'var(--text-main)';

    // 直近のケガリスト
    const recentInjuryList = document.getElementById('player-injury-list');
    recentInjuryList.innerHTML = ''; 
    let hasInjury = false;
    
    recent7Logs.forEach(log => {
        if(log.injuryPre || log.injury) {
            hasInjury = true;
            let text = `<li style="margin-bottom:8px;"><span style="font-weight:900; color:var(--text-muted); margin-right:8px;">${log.date.split('-').slice(1).join('/')}</span>`;
            if(log.injuryPre) text += `<span style="color:var(--secondary); font-size:12px;"><b>[朝]</b> ${log.injuryPre}</span><br>`;
            if(log.injury) text += `<span style="color:var(--color-danger); font-size:12px;"><b>[夜]</b> ${log.injury}</span>`;
            text += `</li>`;
            recentInjuryList.innerHTML += text;
        }
    });
    if(!hasInjury) recentInjuryList.innerHTML = '<li style="list-style:none; color:var(--text-muted); text-align:center;">ケガ・痛みの報告なし</li>';

    // 直近の張りリスト
    const pSorenessCounts = {};
    recent7Logs.forEach(log => {
        const combinedSoreness = new Set();
        if(log.soreness) log.soreness.split(',').forEach(p => { if(p.trim()) combinedSoreness.add(p.trim()); });
        if(log.sorenessPost) log.sorenessPost.split(',').forEach(p => { if(p.trim()) combinedSoreness.add(p.trim()); });
        combinedSoreness.forEach(part => { pSorenessCounts[part] = (pSorenessCounts[part] || 0) + 1; });
    });
    
    const pRankingBody = document.getElementById('player-soreness-list'); 
    pRankingBody.innerHTML = '';
    const pSorted = Object.entries(pSorenessCounts).sort((a, b) => b[1] - a[1]);
    
    if(pSorted.length === 0) pRankingBody.innerHTML = '<li style="list-style:none; color:var(--text-muted); margin-left:-20px; text-align:center;">直近の訴えなし</li>';
    else pSorted.forEach(item => { pRankingBody.innerHTML += `<li style="margin-bottom:4px;"><span style="font-weight:900; color:var(--text-main); margin-right:8px;">${item[0]}</span> <span style="color:var(--primary);">(${item[1]}回)</span></li>`; });

    // グラフの描画呼び出し (直近30件)
    const chartLogs = playerLogs.slice(0, 30).reverse();
    drawLoadChart(chartLogs); 
    drawRsiChart(chartLogs);
}

/**
 * 個人用の Load & 疲労度 グラフを描画
 */
function drawLoadChart(logs) {
    const ctx = document.getElementById('loadChart')?.getContext('2d');
    if(!ctx) return;
    
    const labels = logs.map(l => l.date.substring(5)); 
    const loadData = logs.map(l => parseFloat(l.trainingLoad) || 0);
    const fatigueData = logs.map(l => parseInt(l.fatigue) || 0);
    
    const isDark = document.body.classList.contains('dark-mode');
    const tickColor = isDark ? '#94a3b8' : '#6b7280'; 
    const gridColor = isDark ? '#333333' : '#e5e7eb';
    const constColors = window.CONSTANTS.COLORS;

    if (STATE.charts.load) {
        STATE.charts.load.data.labels = labels; 
        STATE.charts.load.data.datasets[0].data = loadData; 
        STATE.charts.load.data.datasets[1].data = fatigueData;
        STATE.charts.load.options.scales.x.ticks.color = tickColor; 
        STATE.charts.load.options.scales.x.grid.color = gridColor;
        STATE.charts.load.options.scales.y.ticks.color = tickColor; 
        STATE.charts.load.options.scales.y.grid.color = gridColor;
        STATE.charts.load.options.scales.y1.ticks.color = tickColor;
        STATE.charts.load.options.plugins.title.color = tickColor; 
        STATE.charts.load.options.plugins.legend.labels.color = tickColor;
        STATE.charts.load.update();
    } else {
        STATE.charts.load = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [
                    { label: 'Training Load', data: loadData, backgroundColor: constColors.CHART_LOAD, yAxisID: 'y', order: 2, borderRadius:4 },
                    { label: '疲労度', data: fatigueData, borderColor: constColors.CHART_FATIGUE, backgroundColor: constColors.CHART_FATIGUE, type: 'line', borderDash: [5, 5], yAxisID: 'y1', tension: 0.1, order: 1, borderWidth:3 }
                ]
            },
            plugins: [targetDateLinePlugin],
            options: {
                responsive: true, maintainAspectRatio: false, layout: { padding: { top: 20 } },
                plugins: { title: { display: true, text: 'Training Load と 疲労度の推移 (直近30回)', color: tickColor, font:{weight:'bold'} }, legend: { labels: { color: tickColor } } },
                scales: {
                    x: { ticks: { color: tickColor }, grid: { color: gridColor } },
                    y: { beginAtZero: true, ticks: { color: tickColor }, grid: { color: gridColor } },
                    y1: { position: 'right', min: 0, max: 10, grid: { drawOnChartArea: false }, ticks: { color: tickColor } }
                }
            }
        });
    }
}

/**
 * 個人用の RSI グラフを描画
 */
function drawRsiChart(logs) {
    const ctx = document.getElementById('rsiChart')?.getContext('2d');
    if(!ctx) return;
    
    const labels = logs.map(l => l.date.substring(5));
    const rsiRawData = logs.map(l => parseFloat(l.rsi));
    const validRsiData = rsiRawData.filter(v => !isNaN(v) && v > 0);
    const rsiAvg = validRsiData.length > 0 ? validRsiData.reduce((a,b)=>a+b,0) / validRsiData.length : 0;
    
    const rsiData = rsiRawData.map(v => (isNaN(v) || v <= 0) ? null : v);
    const rsiAvgLine = labels.map(() => rsiAvg);

    const isDark = document.body.classList.contains('dark-mode');
    const tickColor = isDark ? '#94a3b8' : '#6b7280'; 
    const gridColor = isDark ? '#333333' : '#e5e7eb';
    const constColors = window.CONSTANTS.COLORS;

    if (STATE.charts.rsi) {
        STATE.charts.rsi.data.labels = labels; 
        STATE.charts.rsi.data.datasets[0].data = rsiData; 
        STATE.charts.rsi.data.datasets[1].data = rsiAvgLine;
        STATE.charts.rsi.options.scales.x.ticks.color = tickColor; 
        STATE.charts.rsi.options.scales.x.grid.color = gridColor;
        STATE.charts.rsi.options.scales.y.ticks.color = tickColor; 
        STATE.charts.rsi.options.scales.y.grid.color = gridColor;
        STATE.charts.rsi.options.plugins.title.color = tickColor; 
        STATE.charts.rsi.options.plugins.legend.labels.color = tickColor;
        STATE.charts.rsi.update();
    } else {
        STATE.charts.rsi = new Chart(ctx, {
            type: 'line',
            data: {
                labels: labels,
                datasets: [
                    { label: 'RSI', data: rsiData, borderColor: constColors.CHART_FATIGUE, backgroundColor: constColors.CHART_FATIGUE, tension: 0.2, spanGaps: true, borderWidth:3 },
                    { label: 'RSI 平均', data: rsiAvgLine, borderColor: '#d1d5db', borderDash: [5, 5], pointRadius: 0, borderWidth: 2 }
                ]
            },
            plugins: [targetDateLinePlugin],
            options: {
                responsive: true, maintainAspectRatio: false, layout: { padding: { top: 20 } },
                plugins: { title: { display: true, text: '神経筋疲労: RSI の推移と平均', color: tickColor, font:{weight:'bold'} }, legend: { labels: { color: tickColor } } },
                scales: { x: { ticks: { color: tickColor }, grid: { color: gridColor } }, y: { beginAtZero: true, ticks: { color: tickColor }, grid: { color: gridColor } } }
            }
        });
    }
}