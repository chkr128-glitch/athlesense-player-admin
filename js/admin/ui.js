import { STATE } from './state.js';
import * as logic from './logic.js';

// ==========================================
// 📌 管理者用 UIコントローラー (UI)
// DOMの操作、テーブルの描画、ビューの切り替えを担当します
// ==========================================

/**
 * メインタブの切り替え
 */
export function switchTab(tabId, btn) {
    document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active'));
    document.querySelectorAll('.tab-btn').forEach(el => el.classList.remove('active'));
    document.getElementById(`tab-${tabId}`).classList.add('active');
    if (btn) btn.classList.add('active');
    if(tabId === 'history') backToHistoryMenu();
}

/**
 * 過去ログの各詳細ビューを開く
 */
export function openHistoryView(viewId, onOpenCallback) {
    document.getElementById('history-menu').style.display = 'none';
    document.querySelectorAll('.history-view').forEach(el => el.style.display = 'none');
    const targetView = document.getElementById(`view-${viewId}`);
    if (targetView) targetView.style.display = 'block';
    
    // 開いたビューに応じた更新処理を実行
    if (onOpenCallback) onOpenCallback(viewId);
}

/**
 * 過去ログメニューに戻る
 */
export function backToHistoryMenu() {
    document.querySelectorAll('.history-view').forEach(el => el.style.display = 'none');
    const historyMenu = document.getElementById('history-menu');
    if (historyMenu) historyMenu.style.display = 'grid';
}

/**
 * 月別アーカイブフィルターの選択肢を更新
 */
export function updatePeriodFilterOptions(logs) {
    const monthlyOptions = document.getElementById('monthly-options');
    if (!monthlyOptions) return;
    monthlyOptions.innerHTML = '';
    const months = new Set();
    
    logs.forEach(log => { 
        if (log.date) { 
            const ym = log.date.substring(0, 7); 
            if(ym.length === 7) months.add(ym); 
        } 
    });
    
    const sortedMonths = Array.from(months).sort().reverse();
    sortedMonths.forEach(ym => {
        const parts = ym.split('-');
        const option = document.createElement('option');
        option.value = ym; 
        option.textContent = `${parts[0]}年 ${parseInt(parts[1])}月`;
        monthlyOptions.appendChild(option);
    });
}

/**
 * グラフ用の選手選択プルダウンを更新
 */
export function updatePlayerSelect(players) {
    const select = document.getElementById('chart-player-select'); 
    if (!select) return;
    const currentVal = select.value; 
    select.innerHTML = '<option value="">選手を選択</option>';
    
    players.forEach(p => {
        const option = document.createElement('option');
        option.value = p.name; 
        option.textContent = p.name;
        if(p.name === currentVal) option.selected = true;
        select.appendChild(option);
    });
    if (!select.value && players.length > 0) select.value = players[0].name;
}

/**
 * 📅 指定日(本日)タブのダッシュボードを更新
 */
export function updateTodayDashboard(targetDateStr, todayLogs, expectedPlayers, allLogs) {
    const targetPlayers = [...new Set(todayLogs.map(l => l.playerName))];
    const missingPlayers = expectedPlayers.filter(p => !targetPlayers.includes(p));
    
    // 未入力
    document.getElementById('summary-missing-count').textContent = `${missingPlayers.length} 名`;
    document.getElementById('summary-missing-list').textContent = missingPlayers.length > 0 ? missingPlayers.join(', ') : '全員完了！✨';
    
    const thresholds = window.CONSTANTS.THRESHOLDS;
    
    // 疲労度高
    const highFatigue = todayLogs.filter(log => parseInt(log.fatigue) >= thresholds.HIGH_FATIGUE);
    document.getElementById('summary-fatigue').textContent = `${highFatigue.length} 名`;
    document.getElementById('summary-fatigue-list').textContent = highFatigue.map(l => l.playerName).join(', ');
    
    // 睡眠要注意
    const badSleep = todayLogs.filter(log => {
        const h = parseFloat(log.sleep); 
        const q = parseInt(log.sleepQuality);
        return (h > 0 && h < thresholds.LOW_SLEEP_HOURS) || (q > 0 && q <= thresholds.LOW_SLEEP_QUALITY);
    });
    document.getElementById('summary-sleep').textContent = `${badSleep.length} 名`;
    document.getElementById('summary-sleep-list').textContent = badSleep.map(l => l.playerName).join(', ');

    // Monotony & ACWR
    let highMonotonyPlayers = []; 
    let dangerACWRPlayers = [];
    const targetDateObj = new Date(targetDateStr + 'T00:00:00');
    
    expectedPlayers.forEach(pName => {
        const pLogs = allLogs.filter(l => {
            if (l.playerName !== pName || !l.date) return false;
            const logDateObj = new Date(l.date + 'T00:00:00');
            const diffDays = (targetDateObj - logDateObj) / (1000 * 60 * 60 * 24);
            return diffDays >= 0 && diffDays < 7; 
        });
        const metrics = logic.calculateMonotony(pLogs);
        if (metrics.monotony >= thresholds.MONOTONY_WARNING && metrics.totalLoad > 0) highMonotonyPlayers.push(pName);
        
        const acwr = logic.calculateACWR(pName, targetDateObj, allLogs);
        if (acwr.ratio >= thresholds.ACWR_DANGER) dangerACWRPlayers.push(pName);
    });
    
    document.getElementById('summary-monotony-count').textContent = `${highMonotonyPlayers.length} 名`;
    document.getElementById('summary-monotony-list').textContent = highMonotonyPlayers.length > 0 ? highMonotonyPlayers.join(', ') : '該当なし';
    
    document.getElementById('summary-acwr-count').textContent = `${dangerACWRPlayers.length} 名`;
    document.getElementById('summary-acwr-list').textContent = dangerACWRPlayers.length > 0 ? dangerACWRPlayers.join(', ') : '該当なし';
}

/**
 * ログデータをテーブルに描画する
 */
export function renderTableData(logsToRender, tbodyId, showDate, playersList, onDeleteClick, onCommentClick, onDetailClick) {
    const tableBody = document.getElementById(tbodyId);
    if (!tableBody) return;
    
    tableBody.innerHTML = '';
    if (!logsToRender || logsToRender.length === 0) {
         const colspan = showDate ? 18 : 17;
         tableBody.innerHTML = `<tr><td colspan="${colspan}" style="text-align:center; font-weight:800; color:var(--text-muted); padding:30px;">記録が見つかりません。</td></tr>`; 
         return;
    }
    
    const displayLogs = [...logsToRender];
    if (showDate) displayLogs.sort((a, b) => new Date(b.date) - new Date(a.date));

    displayLogs.forEach(log => {
        const tr = document.createElement('tr');
        const thres = window.CONSTANTS.THRESHOLDS;
        const weights = thres.IRS_WEIGHTS;
        
        const fatigueText = (parseInt(log.fatigue) >= thres.HIGH_FATIGUE) ? `<span style="color:var(--color-danger);font-weight:900; background:var(--color-danger-light); padding:2px 6px; border-radius:6px;">${log.fatigue} ⚠️</span>` : `<span style="font-weight:800;">${log.fatigue || '-'}</span>`;
        const stressText = (parseInt(log.stress) >= thres.HIGH_FATIGUE) ? `<span style="color:var(--color-danger);font-weight:900; background:var(--color-danger-light); padding:2px 6px; border-radius:6px;">${log.stress} ⚠️</span>` : `<span style="font-weight:800;">${log.stress || '-'}</span>`;
        
        let sorenessHtml = log.soreness ? log.soreness.split(',').map(p => p.trim() ? `<span class="tag-text">${p.trim()}</span><br>` : '').join('') : '-';
        let sorenessPostHtml = log.sorenessPost ? log.sorenessPost.split(',').map(p => p.trim() ? `<span class="tag-text-post">${p.trim()}</span><br>` : '').join('') : '-';

        let injuryPreHtml = log.injuryPre ? `<div style="color:var(--secondary); font-size:12px; margin-bottom:4px;"><b>[朝]</b> ${log.injuryPre}</div>` : '';
        let injuryPostHtml = log.injury ? `<div style="color:var(--color-danger); font-size:12px;"><b>[夜]</b> ${log.injury}</div>` : '';
        const injuryCombined = (injuryPreHtml || injuryPostHtml) ? (injuryPreHtml + injuryPostHtml) : '-';

        const sq = Number(log.sleepQuality) || 0;
        const sleepStars = sq > 0 ? '★'.repeat(sq) : '';
        const sleepText = log.sleep ? `<b>${log.sleep}h</b> <span style="color:var(--color-warning); font-size:12px;">(${sleepStars})</span>` : '-';

        let sprintHtml = '';
        let sLogs = log.sprintLogs ? [...log.sprintLogs] : [];
        if (log.sprintDistance && log.sprintDistance !== '未計測' && log.sprintTime) { sLogs.push({ distance: log.sprintDistance, time: log.sprintTime }); }
        if (sLogs.length > 0) {
            sLogs.forEach(s => { sprintHtml += `<span style="color:var(--accent); font-weight:900; display:block; margin-bottom: 2px;">${s.distance}m : ${s.time}s</span>`; });
        } else { sprintHtml = '-'; }

        // 動的IRS計算
        const irsPreVal = log.irsPre || logic.calcLogIrs(log, 'pre', weights);
        const irsPostVal = log.irsPost || logic.calcLogIrs(log, 'post', weights);
        const irsPre = getIrsBadgeHtml(irsPreVal);
        const irsPost = getIrsBadgeHtml(irsPostVal);

        // カテゴリバッジ
        const player = playersList.find(p => p.name === log.playerName);
        const category = player ? (player.category || 'BLUE') : 'BLUE';
        const catBadge = getCategoryBadge(category);

        let safeCare = String(log.care || '').replace(/null/g, '').split('/').map(s => s.trim()).filter(s => s !== '').join(' / ');

        const commentBtnClass = log.coachComment ? 'btn-success' : 'btn-info';
        const commentBtnText = log.coachComment ? '💬 編集' : '💬 コメント';

        let html = showDate ? `<td style="font-size:13px; font-weight:800; color:var(--text-muted);">${log.date || ''}</td>` : '';
        html += `
            <td style="font-weight:900; font-size:15px; white-space:nowrap;">${catBadge}${log.playerName || ''}</td>
            <td>${irsPre}</td>
            <td>${irsPost}</td>
            <td>${fatigueText} / ${stressText}</td>
            <td style="font-weight:900; color:var(--primary); font-size:16px;">${log.trainingLoad || ''}</td>
            <td>${sprintHtml}</td>
            <td style="font-weight:800;">${log.rsi || ''}</td>
            <td style="font-weight:800;">${log.fvResult || ''}</td>
            <td>${sorenessHtml}</td>
            <td>${sorenessPostHtml}</td>
            <td style="max-width:200px; white-space:normal; line-height:1.4;">${injuryCombined}</td>
            <td style="font-weight:800;">${log.weight ? log.weight + 'kg' : '-'}</td>
            <td style="font-weight:800;">${log.heartRate || '-'}</td>
            <td style="font-weight:800;">${log.steps || '-'}</td>
            <td>${sleepText}</td>
            <td style="color:var(--accent); max-width:150px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; font-weight:700;" title="${safeCare}">${safeCare || '-'}</td>
            <td style="text-align:center; min-width:90px;">
                <button class="btn btn-info w-full mb-2 detail-btn" style="padding:6px; font-size:12px; background:var(--text-muted); box-shadow:none;" data-name="${log.playerName}" data-date="${log.date}">📋 詳細</button>
                <button class="btn ${commentBtnClass} w-full mb-2 comment-btn" style="padding:6px; font-size:12px; box-shadow:none;" data-name="${log.playerName}" data-date="${log.date}">${commentBtnText}</button>
                <button class="btn btn-danger w-full delete-btn" style="padding:6px; font-size:12px; box-shadow:none;" data-name="${log.playerName}" data-date="${log.date}">削除</button>
            </td>
        `;
        tr.innerHTML = html;
        
        // イベントバインディング
        tr.querySelector('.detail-btn').addEventListener('click', (e) => onDetailClick(e.target.dataset.name, e.target.dataset.date));
        tr.querySelector('.comment-btn').addEventListener('click', (e) => onCommentClick(e.target.dataset.name, e.target.dataset.date));
        tr.querySelector('.delete-btn').addEventListener('click', (e) => onDeleteClick(e.target.dataset.name, e.target.dataset.date));
        
        tableBody.appendChild(tr);
    });
}

export function getIrsBadgeHtml(irsStr) {
    if (!irsStr || irsStr === '-' || irsStr === '未計測') return '<span style="color:var(--text-muted); font-weight:800;">-</span>';
    const val = parseInt(irsStr.replace('%', ''));
    if (isNaN(val)) return irsStr;
    let bg = 'var(--color-success)';
    if (val > 75) bg = 'var(--color-danger)';
    else if (val > 50) bg = 'var(--secondary)';
    else if (val > 30) bg = 'var(--color-warning)';
    return `<span style="background-color: ${bg}; color: #fff; padding: 4px 10px; border-radius: 8px; font-size: 13px; font-weight: 900; box-shadow:var(--shadow-sm);">${val}%</span>`;
}

export function getCategoryBadge(category) {
    let color = 'var(--info)';
    if (category === 'RED') color = 'var(--color-danger)'; 
    if (category === 'YELLOW') color = 'var(--color-warning)';
    return `<span style="display:inline-block; width:10px; height:10px; border-radius:50%; background-color:${color}; margin-right:6px; box-shadow:0 1px 3px rgba(0,0,0,0.2);"></span>`;
}

export function renderPlayersList(players, onDeleteClick) {
    const list = document.getElementById('registered-players-list'); 
    if(!list) return;
    list.innerHTML = `
        <div class="mb-4"><span style="font-size: 13px; font-weight: 900; color: var(--info); display: block; margin-bottom: 8px;">🟦 BLUE</span><div class="roster-container" id="roster-blue"></div></div>
        <div class="mb-4"><span style="font-size: 13px; font-weight: 900; color: var(--color-danger); display: block; margin-bottom: 8px;">🟥 RED</span><div class="roster-container" id="roster-red"></div></div>
        <div class="mb-2"><span style="font-size: 13px; font-weight: 900; color: var(--color-warning); display: block; margin-bottom: 8px;">🟨 YELLOW</span><div class="roster-container" id="roster-yellow"></div></div>
    `;
    
    if (players.length === 0) return;
    
    players.forEach(p => {
        const tag = document.createElement('div');
        let targetContainer = document.getElementById('roster-blue');
        if (p.category === 'RED') targetContainer = document.getElementById('roster-red');
        else if (p.category === 'YELLOW') targetContainer = document.getElementById('roster-yellow');
        
        tag.className = `player-tag`;
        tag.innerHTML = `${p.name} <button class="delete-player-btn" data-id="${p.id}">×</button>`;
        tag.querySelector('.delete-player-btn').addEventListener('click', (e) => onDeleteClick(e.target.dataset.id));
        
        targetContainer.appendChild(tag);
    });
}

export function renderCareOptions(careOptions, onDeleteClick) {
    const container = document.getElementById('care-options-container'); 
    if(!container) return;
    container.innerHTML = '';
    careOptions.forEach((opt, idx) => {
        const div = document.createElement('div');
        div.className = 'tag-text';
        div.style.cssText = 'display:flex;align-items:center;gap:8px;padding:10px 14px;font-size:14px; background:var(--card-bg);';
        div.innerHTML = `<span>${opt}</span><span style="color:var(--color-danger);cursor:pointer;font-weight:900;font-size:20px;line-height:1;">×</span>`;
        div.querySelector('span:last-child').addEventListener('click', () => onDeleteClick(idx));
        container.appendChild(div);
    });
}

export function updateHeatmap(logs) {
    const sorenessCounts = { "頭部":0, "肩":0, "背中":0, "腰":0, "腹筋":0, "胸部":0, "腕":0, "腸腰筋":0, "臀部":0, "大腿四頭筋":0, "ハムストリングス":0, "カーフ":0, "アキレス腱":0, "足裏":0, "首":0, "胸筋":0, "臀部(お尻)":0, "ふくらはぎ":0 };
    logs.forEach(log => {
        const combinedSoreness = new Set();
        if(log.soreness) log.soreness.split(',').forEach(p => { if(p.trim()) combinedSoreness.add(p.trim()); });
        if(log.sorenessPost) log.sorenessPost.split(',').forEach(p => { if(p.trim()) combinedSoreness.add(p.trim()); });
        combinedSoreness.forEach(part => { if(sorenessCounts[part] !== undefined) sorenessCounts[part]++; });
    });

    // 表記揺れの吸収
    if(sorenessCounts["首"] > 0) sorenessCounts["頭部"] += sorenessCounts["首"];
    if(sorenessCounts["胸筋"] > 0) sorenessCounts["胸部"] += sorenessCounts["胸筋"];
    if(sorenessCounts["臀部(お尻)"] > 0) sorenessCounts["臀部"] += sorenessCounts["臀部(お尻)"];
    if(sorenessCounts["ふくらはぎ"] > 0) sorenessCounts["カーフ"] += sorenessCounts["ふくらはぎ"];

    const displayKeys = ["頭部", "肩", "背中", "腰", "腹筋", "胸部", "腕", "腸腰筋", "臀部", "大腿四頭筋", "ハムストリングス", "カーフ", "アキレス腱", "足裏"];
    const maxCount = Math.max(...displayKeys.map(k => sorenessCounts[k]), 0);

    const updateHeatSpot = (id, count) => {
        const el = document.getElementById(id);
        if(el) el.setAttribute('opacity', maxCount > 0 ? (count / maxCount) * 0.85 : 0);
    };

    updateHeatSpot('heat-head-f', sorenessCounts['頭部']); updateHeatSpot('heat-chest', sorenessCounts['胸部']);
    updateHeatSpot('heat-abs', sorenessCounts['腹筋']); updateHeatSpot('heat-arm-l-f', sorenessCounts['腕']); updateHeatSpot('heat-arm-r-f', sorenessCounts['腕']);
    updateHeatSpot('heat-hip-l', sorenessCounts['腸腰筋']); updateHeatSpot('heat-hip-r', sorenessCounts['腸腰筋']);
    updateHeatSpot('heat-quads-l', sorenessCounts['大腿四頭筋']); updateHeatSpot('heat-quads-r', sorenessCounts['大腿四頭筋']);
    updateHeatSpot('heat-head-b', sorenessCounts['頭部']); updateHeatSpot('heat-shoulder-l', sorenessCounts['肩']); updateHeatSpot('heat-shoulder-r', sorenessCounts['肩']);
    updateHeatSpot('heat-back', sorenessCounts['背中']); updateHeatSpot('heat-lower-back', sorenessCounts['腰']); 
    updateHeatSpot('heat-arm-l-b', sorenessCounts['腕']); updateHeatSpot('heat-arm-r-b', sorenessCounts['腕']);
    updateHeatSpot('heat-glutes-l', sorenessCounts['臀部']); updateHeatSpot('heat-glutes-r', sorenessCounts['臀部']);
    updateHeatSpot('heat-hams-l', sorenessCounts['ハムストリングス']); updateHeatSpot('heat-hams-r', sorenessCounts['ハムストリングス']);
    updateHeatSpot('heat-calves-l', sorenessCounts['カーフ']); updateHeatSpot('heat-calves-r', sorenessCounts['カーフ']);
    updateHeatSpot('heat-achilles-l', sorenessCounts['アキレス腱']); updateHeatSpot('heat-achilles-r', sorenessCounts['アキレス腱']);
    updateHeatSpot('heat-sole-l', sorenessCounts['足裏']); updateHeatSpot('heat-sole-r', sorenessCounts['足裏']);

    const rankingBody = document.getElementById('soreness-ranking-body'); 
    if(!rankingBody) return;
    rankingBody.innerHTML = '';
    const sortedSoreness = Object.entries(sorenessCounts).filter(item => item[1] > 0 && displayKeys.includes(item[0])).sort((a, b) => b[1] - a[1]); 
    
    if(sortedSoreness.length === 0) {
        rankingBody.innerHTML = '<tr><td colspan="3" style="text-align:center; color:var(--text-muted); padding: 20px; font-weight:800;">期間中に訴えのある部位はありません</td></tr>';
    } else {
        sortedSoreness.forEach((item, index) => {
            let badge = (index === 0 && item[1] >= 3) ? '<br><span style="color:var(--color-danger); font-size:10px; font-weight:900;">⚠️多発</span>' : '';
            rankingBody.innerHTML += `<tr><td style="font-weight:900; color:var(--text-muted);">${index + 1}</td><td style="font-weight:900; font-size:13px;">${item[0]}${badge}</td><td style="font-weight:900; color:var(--primary); font-size:16px;">${item[1]}</td></tr>`;
        });
    }
}

export function updateSprintRanking(filteredLogs, playersList) {
    const distEl = document.getElementById('sprint-ranking-distance');
    if(!distEl) return;
    const distance = distEl.value;
    const rankingBody = document.getElementById('sprint-ranking-body');
    if(!rankingBody) return;
    rankingBody.innerHTML = ''; 
    const bestTimes = {};

    filteredLogs.forEach(log => {
        let sLogs = log.sprintLogs ? [...log.sprintLogs] : [];
        if (log.sprintDistance && log.sprintDistance !== '未計測' && log.sprintTime) {
            sLogs.push({ distance: log.sprintDistance, time: log.sprintTime });
        }
        sLogs.forEach(s => {
            if (s.distance === distance && s.time) {
                const time = parseFloat(s.time);
                if (!isNaN(time) && time > 0) {
                    if (!bestTimes[log.playerName] || time < bestTimes[log.playerName]) bestTimes[log.playerName] = time;
                }
            }
        });
    });

    const sortedPlayers = Object.entries(bestTimes).sort((a, b) => a[1] - b[1]);
    if (sortedPlayers.length === 0) { 
        rankingBody.innerHTML = '<tr><td colspan="3" style="text-align:center; color:var(--text-muted); padding: 20px; font-weight:800;">この距離の記録はありません</td></tr>'; 
        return; 
    }

    let currentRank = 1, displayRank = 1, previousTime = -1;
    sortedPlayers.forEach((item) => {
        const playerName = item[0], time = item[1];
        if (time !== previousTime) displayRank = currentRank;
        const player = playersList.find(p => p.name === playerName);
        const catBadge = getCategoryBadge(player ? player.category : 'BLUE');
        rankingBody.innerHTML += `<tr><td style="font-weight:900; color:var(--text-muted);">${displayRank}</td><td style="font-weight:900; font-size:14px; text-align:left; padding-left:24px; display:flex; align-items:center;">${catBadge}${playerName}</td><td style="font-weight:900; color:var(--secondary); font-size:16px;">${time.toFixed(2)}</td></tr>`;
        previousTime = time; 
        currentRank++;
    });
}

export function updateFvGrouping(filteredLogs) {
    const latestFvData = {};
    filteredLogs.forEach(log => {
        if(log.time30m && log.timeFly20m && parseFloat(log.time30m) > 0 && parseFloat(log.timeFly20m) > 0) {
            if (!latestFvData[log.playerName]) {
                latestFvData[log.playerName] = { t20: parseFloat(log.timeFly20m), t30: parseFloat(log.time30m) };
            }
        }
    });

    const lists = { 
        force: document.getElementById('fv-list-force'), 
        balanced: document.getElementById('fv-list-balanced'), 
        velocity: document.getElementById('fv-list-velocity') 
    };
    if(!lists.force) return;
    
    Object.values(lists).forEach(el => el.innerHTML = '');
    let counts = { f: 0, b: 0, v: 0 };
    const thresholds = window.CONSTANTS.THRESHOLDS;

    Object.entries(latestFvData).forEach(([playerName, times]) => {
        const ratio = times.t30 / times.t20;
        const tagHtml = `<div class="fv-player-tag">${playerName} <span class="fv-player-ratio">${ratio.toFixed(2)}</span></div>`;
        if (ratio >= thresholds.FV_FORCE_DEFICIT) { lists.force.innerHTML += tagHtml; counts.f++; } 
        else if (ratio <= thresholds.FV_VELOCITY_DEFICIT) { lists.velocity.innerHTML += tagHtml; counts.v++; } 
        else { lists.balanced.innerHTML += tagHtml; counts.b++; }
    });
    
    const emptyMsg = '<div style="color:var(--text-muted); font-size:13px; font-weight:800; padding: 10px;">該当なし</div>';
    if (counts.f === 0) lists.force.innerHTML = emptyMsg; 
    if (counts.b === 0) lists.balanced.innerHTML = emptyMsg; 
    if (counts.v === 0) lists.velocity.innerHTML = emptyMsg;
}

export function renderBroadcastList(broadcasts, playersList, onDeleteClick) {
    const container = document.getElementById('broadcast-list-container');
    if(!container) return;
    container.innerHTML = '';
    
    if(broadcasts.length === 0) {
        container.innerHTML = '<p class="text-center" style="color:var(--text-muted); margin-top:40px; font-weight:800;">送信履歴がありません</p>'; 
        return;
    }
    
    broadcasts.forEach(b => {
        let targetPlayers = [];
        if(b.target === 'ALL') targetPlayers = playersList.map(p => p.name);
        else targetPlayers = playersList.filter(p => p.category === b.target).map(p => p.name);
        
        const readCount = (b.readBy || []).filter(name => targetPlayers.includes(name)).length;
        const totalCount = targetPlayers.length;
        const unreadPlayers = targetPlayers.filter(name => !(b.readBy || []).includes(name));
        
        const div = document.createElement('div');
        div.style.cssText = "background:var(--input-bg); padding:20px; border-radius:16px; margin-bottom:16px; border:1px solid var(--border-color); box-shadow:var(--shadow-sm);";
        div.innerHTML = `
            <div class="flex-between mb-3" style="align-items:flex-start;">
                <div>
                    <span class="status-badge" style="margin-left:0; margin-right:8px; background:var(--card-bg); color:var(--text-main); border:1px solid var(--border-color); box-shadow:none;">${b.target}宛</span>
                    <span style="font-weight:900; color:var(--primary); font-size:16px;">${b.title}</span>
                </div>
                <span style="font-size:12px; color:var(--text-muted); font-weight:800;">${new Date(b.createdAt).toLocaleString()}</span>
            </div>
            <div style="font-size:14px; margin-bottom:16px; color:var(--text-main); white-space:pre-wrap; background:var(--card-bg); padding:14px; border-radius:12px; font-weight:600; box-shadow:var(--shadow-sm);">${b.message}</div>
            <div class="flex-between" style="align-items:flex-end;">
                <div>
                    <div style="font-size:15px; font-weight:900; color:var(--accent);">👀 既読: ${readCount} / ${totalCount} 人</div>
                    ${unreadPlayers.length > 0 ? `<div style="font-size:12px; color:var(--color-danger); margin-top:6px; font-weight:700;"><b>未読:</b> ${unreadPlayers.join(', ')}</div>` : `<div style="font-size:12px; color:var(--color-success); margin-top:6px; font-weight:900;">✅ 全員が確認しました！</div>`}
                </div>
                <button class="btn btn-danger delete-bc-btn" style="padding:6px 12px; font-size:12px; box-shadow:none;" data-id="${b.id}">削除</button>
            </div>
        `;
        div.querySelector('.delete-bc-btn').addEventListener('click', (e) => onDeleteClick(e.target.dataset.id));
        container.appendChild(div);
    });
}