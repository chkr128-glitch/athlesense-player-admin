import { STATE } from './state.js';
import * as logic from './logic.js';

// --- 👤 ログイン・ヘッダー系 ---
export function updateLoginSelect() {
    const select = document.getElementById('login-player-select'); 
    if(!select) return; 
    select.innerHTML = '<option value="" disabled selected>名前を選択してください ▼</option>'; 
    STATE.players.forEach(p => { 
        const opt = document.createElement('option'); 
        opt.value = p.name; 
        opt.textContent = p.name; 
        select.appendChild(opt); 
    });
}

export function updateHeaderStreak() {
    const iconEl = document.getElementById('header-streak-icon'); 
    const countEl = document.getElementById('header-streak-count'); 
    const textEl = document.getElementById('streak-text');
    
    const streak = logic.calculateStreak(STATE.logs, STATE.currentUser);
    
    let icon = streak >= 181 ? '🏵' : streak >= 91 ? '🎖' : streak >= 31 ? '💎' : streak >= 15 ? '❤️‍🔥' : streak >= 1 ? '🔥' : '🌱';
    if(iconEl) iconEl.textContent = icon; 
    if(countEl) countEl.textContent = streak; 
    if(textEl) textEl.innerHTML = `${icon} <b>${streak}</b> 日連続！`;
}

// --- 🎯 目標・大会カウントダウン ---
export function renderPlayerGoal() {
    const container = document.getElementById('goal-container'); 
    if (!STATE.currentUser || !container) { 
        if(container) container.style.display = 'none'; 
        return; 
    } 
    container.style.display = 'block'; 
    const goalData = STATE.goals[STATE.currentUser] || {}; 
    const sText = document.getElementById('season-goal-text'); 
    if(sText) sText.textContent = goalData.seasonGoal || "目標を設定しよう！"; 
    const mText = document.getElementById('month-goal-text'); 
    if(mText) mText.textContent = goalData.monthGoal || "今月のテーマを設定しよう！"; 
}

export function updateCountdownUI() {
    const banner = document.getElementById('countdown-banner'); 
    if (!banner) return;
    if (!STATE.settings || !STATE.settings.targetEventDate) { 
        banner.style.display = 'none'; return; 
    }
    const today = new Date(); 
    today.setHours(0,0,0,0); 
    const target = new Date(STATE.settings.targetEventDate + 'T00:00:00'); 
    target.setHours(0,0,0,0); 
    const diffDays = Math.ceil((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
    
    if (diffDays > 0) { 
        banner.style.display = 'flex'; 
        banner.innerHTML = `🏆 ${STATE.settings.targetEventName || '大会'}まで あと <span class="days">${diffDays}</span> 日！`; 
    } else if (diffDays === 0) { 
        banner.style.display = 'flex'; 
        banner.style.background = 'linear-gradient(135deg, #10b981, #059669)'; 
        banner.innerHTML = `🔥 本日は ${STATE.settings.targetEventName || '大会'} 当日です！健闘を祈ります！`; 
    } else { 
        banner.style.display = 'none'; 
    }
}

// --- 📝 フォームUI制御 ---
export function updateFaceMeter(id, value, type) { 
    const el = document.getElementById(id); 
    if(!el) return; 
    let emoji = ""; 
    const v = parseFloat(value); 
    if (type === 'fatigue') emoji = v <= 2 ? "😆" : v <= 4 ? "🙂" : v <= 6 ? "😐" : v <= 8 ? "🥵" : "💀"; 
    else if (type === 'stress') emoji = v <= 2 ? "😌" : v <= 4 ? "🙂" : v <= 6 ? "😐" : v <= 8 ? "😫" : "🤯"; 
    else if (type === 'rpe') emoji = v <= 2 ? "🚶‍♂️" : v <= 4 ? "🏃‍♂️" : v <= 6 ? "💦" : v <= 8 ? "🥵" : "🤮"; 
    el.textContent = `${emoji} ${type === 'rpe' ? v.toFixed(1) : v}`; 
}

export function renderCareTags() { 
    const container = document.getElementById('care-tags'); 
    if (!container) return; 
    container.innerHTML = ''; 
    const cares = STATE.settings.careOptions || window.CONSTANTS.DEFAULT_CARES;
    cares.forEach(careText => { 
        const btn = document.createElement('button'); 
        btn.type = 'button'; 
        btn.className = 'tag-btn care-tag'; 
        btn.textContent = careText; 
        btn.onclick = () => { 
            if(window.HAPTIC) window.HAPTIC.light(); 
            btn.classList.toggle('selected'); 
        }; 
        container.appendChild(btn); 
    }); 
}

export function updateIRSUIDisplay(type, rawScore) {
    let score = Math.min(rawScore, 95); 
    const fillEl = document.getElementById(`irs-bar-${type}`); 
    const valEl = document.getElementById(`irs-value-${type}`); 
    const statusEl = document.getElementById(`irs-status-${type}`);
    if(!fillEl || !valEl || !statusEl) return;
    
    valEl.textContent = `${score}%`; 
    fillEl.style.width = `${score}%`;
    if (score <= 30) { 
        fillEl.style.backgroundColor = "var(--good-text)"; 
        statusEl.style.color = "var(--good-text)"; 
        statusEl.textContent = "🟢 安全圏 (Normal)"; 
    } else if (score <= 50) { 
        fillEl.style.backgroundColor = "#f59e0b"; 
        statusEl.style.color = "#f59e0b"; 
        statusEl.textContent = "🟡 注意 (Caution)"; 
    } else if (score <= 75) { 
        fillEl.style.backgroundColor = "#ea580c"; 
        statusEl.style.color = "#ea580c"; 
        statusEl.textContent = "🟠 警戒 (Warning)"; 
    } else { 
        fillEl.style.backgroundColor = "var(--warning-text)"; 
        statusEl.style.color = "var(--warning-text)"; 
        statusEl.textContent = "🔴 危険 (Danger)"; 
    }
}

export function renderAIAdvice(type, advices) {
    const box = document.getElementById(`ai-advice-${type}`); 
    if (!box) return;
    if (advices.length === 0) { 
        const defaultMsg = type === 'pre' 
            ? "✨ <b>【Good!】</b> 起床時の状態は良好です。天候に合わせたウォームアップを行い、今日の目標にフォーカスしましょう！"
            : "✨ <b>【お疲れ様でした】</b><br>適度な負荷の練習でした。入力した「実施するケア」を必ず実行し、明日に備えてしっかり睡眠を取りましょう！";
        box.innerHTML = defaultMsg; 
        box.style.borderLeftColor = "#10b981"; 
    } else { 
        box.innerHTML = advices.join("<hr style='border-top:1px dashed var(--border-color); margin:12px 0;'>"); 
        box.style.borderLeftColor = type === 'pre' ? "#f59e0b" : "#3b82f6"; 
    }
}

// --- 📅 カレンダー ---
export function renderCalendar(onDateSelect) {
    if(!STATE.currentUser) return;
    const gridEl = document.getElementById('calendar-grid'); 
    if(!gridEl) return; 
    gridEl.innerHTML = ''; 
    const calMY = document.getElementById('calendar-month-year'); 
    if(calMY) calMY.textContent = `${STATE.calYear}年 ${STATE.calMonth + 1}月`;
    
    const firstDay = new Date(STATE.calYear, STATE.calMonth, 1).getDay(); 
    const daysInMonth = new Date(STATE.calYear, STATE.calMonth + 1, 0).getDate(); 
    const todayObj = new Date();
    const todayStr = `${todayObj.getFullYear()}-${String(todayObj.getMonth()+1).padStart(2,'0')}-${String(todayObj.getDate()).padStart(2,'0')}`; 
    const dInput = document.getElementById('date'); 
    const selectedDateStr = dInput ? dInput.value : '';

    for (let i = 0; i < firstDay; i++) { 
        const emptyDiv = document.createElement('div'); 
        emptyDiv.className = 'calendar-day empty'; 
        gridEl.appendChild(emptyDiv); 
    }
    for (let i = 1; i <= daysInMonth; i++) {
        const dayDiv = document.createElement('div'); 
        const currentDateStr = `${STATE.calYear}-${String(STATE.calMonth+1).padStart(2,'0')}-${String(i).padStart(2,'0')}`; 
        dayDiv.className = 'calendar-day'; 
        dayDiv.textContent = i;
        if (currentDateStr === todayStr) dayDiv.classList.add('today'); 
        if (currentDateStr === selectedDateStr) dayDiv.classList.add('selected');
        
        const log = STATE.logs.find(l => l.playerName === STATE.currentUser && l.date === currentDateStr);
        if (log) {
            const fatigue = parseInt(log.fatigue) || 1; 
            if (fatigue >= 7) dayDiv.classList.add('bg-red'); 
            else if (fatigue >= 4) dayDiv.classList.add('bg-yellow'); 
            else dayDiv.classList.add('bg-green');
            
            if (log.injuryPre || log.injury) { 
                dayDiv.classList.add('has-injury'); 
                const icon = document.createElement('div'); 
                icon.className = 'injury-icon'; 
                icon.textContent = '⚠️'; 
                dayDiv.appendChild(icon); 
            }
            if (log.coachComment) { 
                const commentIcon = document.createElement('div'); 
                commentIcon.className = 'comment-icon'; 
                commentIcon.textContent = '💬'; 
                dayDiv.appendChild(commentIcon); 
            }
        }
        dayDiv.onclick = () => onDateSelect(currentDateStr); 
        gridEl.appendChild(dayDiv);
    }
}

export function changeMonth(step, onDateSelect) { 
    STATE.calMonth += step; 
    if (STATE.calMonth < 0) { 
        STATE.calMonth = 11; 
        STATE.calYear--; 
    } else if (STATE.calMonth > 11) { 
        STATE.calMonth = 0; 
        STATE.calYear++; 
    } 
    renderCalendar(onDateSelect); 
}

// --- 📋 日次サマリーモーダル ---
export function showDailySummary(dateStr, log, onCommentRead) {
    const parts = dateStr.split('-'); 
    const sumModalDate = document.getElementById('summary-modal-date'); 
    if(sumModalDate) sumModalDate.textContent = `${parts[1]}/${parts[2]} の記録`; 
    const content = document.getElementById('summary-modal-content'); 
    const editBtn = document.getElementById('edit-daily-btn');
    if(!content || !editBtn) return;
    
    if (!log) { 
        content.innerHTML = '<p class="text-center" style="color:var(--text-muted); margin: 40px 0; font-weight:800; font-size:16px;">この日の記録はまだありません。</p>'; 
        editBtn.textContent = '新規入力する'; 
    } else {
        editBtn.textContent = 'この日のデータを編集する'; 
        let sprintHtml = ''; 
        if(log.sprintLogs && log.sprintLogs.length > 0) { 
            sprintHtml = log.sprintLogs.map(s => `<span style="background:var(--primary); color:white; padding:4px 10px; border-radius:8px; font-size:12px; font-weight:bold; display:inline-block; margin-right:6px; box-shadow:var(--shadow-sm);">🏃‍♂️ ${s.distance}m: ${s.time}s</span>`).join(' '); 
        }
        const sorenessPre = log.soreness ? `<div style="font-size:14px; color:var(--secondary); font-weight:800; margin-bottom:6px;">[朝の張り] ${log.soreness}</div>` : ''; 
        const sorenessPost = log.sorenessPost ? `<div style="font-size:14px; color:var(--primary); font-weight:800;">[夜の張り] ${log.sorenessPost}</div>` : ''; 
        const injuryPre = log.injuryPre ? `<div style="margin-top:12px; background:var(--input-bg); border:1px solid var(--warning-text); padding:14px; border-radius:12px;"><b style="color:var(--warning-text); font-size:13px;">⚠️ 朝のケガ詳細:</b><div style="font-size:14px; color:var(--text-main); white-space:pre-wrap; margin-top:6px; font-weight:600;">${log.injuryPre}</div></div>` : ''; 
        const injuryPost = log.injury ? `<div style="margin-top:12px; background:var(--input-bg); border:1px solid var(--warning-text); padding:14px; border-radius:12px;"><b style="color:var(--warning-text); font-size:13px;">⚠️ 夜のケガ詳細:</b><div style="font-size:14px; color:var(--text-main); white-space:pre-wrap; margin-top:6px; font-weight:600;">${log.injury}</div></div>` : '';
        let coachFeedbackHtml = '';
        if (log.coachComment) { 
            coachFeedbackHtml = `<div style="margin-bottom:24px; background:linear-gradient(135deg, var(--secondary-light), var(--primary-light)); border:1px solid var(--primary-alpha); padding:18px; border-radius:16px; box-shadow: var(--shadow-sm);"><div style="font-size:14px; color:var(--primary-dark); font-weight:900; margin-bottom:10px; display:flex; align-items:center; gap:6px;">💬 コーチからのフィードバック</div><div style="display:flex; gap:12px; align-items:flex-start;"><div style="font-size:36px; line-height:1; text-shadow:0 2px 4px rgba(0,0,0,0.2);">${log.coachComment.stamp || ''}</div><div style="font-size:15px; color:var(--text-main); font-weight:700; white-space:pre-wrap; padding-top:6px;">${log.coachComment.text || ''}</div></div></div>`; 
            if (!log.playerReadComment && onCommentRead) onCommentRead(log.date); 
        }
        content.innerHTML = `${coachFeedbackHtml}<div style="display:grid; grid-template-columns: 1fr 1fr; gap:16px; margin-bottom:24px;"><div style="background:var(--input-bg); border:1px solid var(--border-color); padding:16px; border-radius:14px; text-align:center; box-shadow:var(--shadow-sm);"><div style="font-size:13px; color:var(--text-muted); font-weight:800; margin-bottom:4px;">疲労度 (朝)</div><div style="font-size:26px; font-weight:900; color:var(--text-main);">${log.fatigue || '-'} <span style="font-size:14px; font-weight:bold; color:var(--text-muted);">/10</span></div></div><div style="background:var(--input-bg); border:1px solid var(--border-color); padding:16px; border-radius:14px; text-align:center; box-shadow:var(--shadow-sm);"><div style="font-size:13px; color:var(--text-muted); font-weight:800; margin-bottom:4px;">Training Load</div><div style="font-size:26px; font-weight:900; color:var(--secondary);">${log.trainingLoad || '-'}</div></div></div><div style="margin-bottom:24px; background:var(--input-bg); border:1px solid var(--border-color); padding:18px; border-radius:16px;"><div style="font-size:14px; color:var(--primary); font-weight:900; margin-bottom:10px;">🏃‍♂️ スプリント・特殊計測</div><div style="margin-bottom:10px;">${sprintHtml || '<span style="font-size:14px; color:var(--text-muted); font-weight:600;">データなし</span>'}</div><div style="font-size:14px; font-weight:700; color:var(--text-main);">RSI: <b style="font-size:16px;">${log.rsi || '-'}</b> <span style="color:var(--border-color); margin:0 8px;">|</span> F-v: <b style="font-size:16px;">${log.fvResult || '-'}</b></div></div><div style="margin-bottom:24px; border-top:2px dashed var(--border-color); padding-top:24px;"><div style="font-size:15px; color:var(--text-main); font-weight:900; margin-bottom:10px;">⚡ 筋肉痛・張り</div>${sorenessPre}${sorenessPost}${!sorenessPre && !sorenessPost ? '<span style="font-size:14px; color:var(--text-muted); font-weight:600;">なし</span>' : ''}${injuryPre}${injuryPost}</div><div style="margin-bottom:24px; border-top:2px dashed var(--border-color); padding-top:24px;"><div style="font-size:15px; color:var(--text-main); font-weight:900; margin-bottom:10px;">💤 睡眠・体調</div><div style="font-size:15px; font-weight:600; margin-bottom:6px; color:var(--text-main);">時間: <b>${log.sleep || '-'}h</b> / 質: <b style="color:var(--secondary);">${log.sleepQuality ? '★'.repeat(log.sleepQuality) : '-'}</b></div><div style="font-size:15px; font-weight:600; color:var(--text-main);">体重: <b>${log.weight ? log.weight+'kg' : '-'}</b> / 心拍: <b>${log.heartRate || '-'}</b></div></div><div style="border-top:2px dashed var(--border-color); padding-top:24px; padding-bottom:10px;"><div style="font-size:15px; color:var(--text-main); font-weight:900; margin-bottom:12px;">📝 練習振り返り・ケア</div><div style="font-size:15px; background:var(--card-bg); color:var(--text-main); border:1px solid var(--border-color); padding:14px; border-radius:12px; margin-bottom:12px; white-space:pre-wrap; font-weight:600; box-shadow:var(--shadow-sm);"><b style="color:var(--primary); font-size:13px; display:block; margin-bottom:4px;">メニュー:</b>${log.menu || '-'}</div><div style="font-size:15px; background:var(--card-bg); color:var(--text-main); border:1px solid var(--border-color); padding:14px; border-radius:12px; margin-bottom:12px; white-space:pre-wrap; font-weight:600; box-shadow:var(--shadow-sm);"><b style="color:var(--good-text); font-size:13px; display:block; margin-bottom:4px;">👍 できたこと:</b>${log.good || '-'}</div><div style="font-size:15px; background:var(--card-bg); color:var(--text-main); border:1px solid var(--border-color); padding:14px; border-radius:12px; margin-bottom:12px; white-space:pre-wrap; font-weight:600; box-shadow:var(--shadow-sm);"><b style="color:var(--warning-text); font-size:13px; display:block; margin-bottom:4px;">👎 課題・できなかったこと:</b>${log.bad || '-'}</div><div style="font-size:15px; background:var(--card-bg); color:var(--text-main); border:1px solid var(--border-color); padding:14px; border-radius:12px; white-space:pre-wrap; font-weight:600; box-shadow:var(--shadow-sm);"><b style="color:var(--primary); font-size:13px; display:block; margin-bottom:4px;">🛁 ケア:</b>${log.care || '-'}</div></div>`;
    }
    editBtn.setAttribute('data-date', dateStr); 
    const dModal = document.getElementById('daily-summary-modal'); 
    if(dModal) dModal.style.display = 'flex';
}

export function closeDailySummary() {
    const dModal = document.getElementById('daily-summary-modal'); 
    if(dModal) dModal.style.display = 'none';
}

export function editDailyData(onLoadFormData) {
    const btn = document.getElementById('edit-daily-btn'); 
    if(!btn) return;
    const dateStr = btn.getAttribute('data-date'); 
    const dInput = document.getElementById('date'); 
    if(dInput) dInput.value = dateStr; 
    
    const parts = dateStr.split('-'); 
    const displayStr = `${parts[1]}/${parts[2]}`; 
    const preDisp = document.getElementById('display-date-pre'); 
    if(preDisp) preDisp.textContent = `[ ${displayStr} ]`; 
    const postDisp = document.getElementById('display-date-post'); 
    if(postDisp) postDisp.textContent = `[ ${displayStr} ]`; 
    
    closeDailySummary(); 
    if(onLoadFormData) onLoadFormData(dateStr);
    
    const preTab = document.querySelector('.tab-btn[onclick="switchTab(\'pre\', this)"]');
    if (preTab && window.switchTab) window.switchTab('pre', preTab); 
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

// --- 🏆 履歴・チャート ---
export function renderPlayerHistory() {
    const playerName = STATE.currentUser; 
    if(!playerName) return;
    const histSec = document.getElementById('history-section'); 
    if(histSec) histSec.style.display = 'block'; 
    const myLogs = STATE.logs.filter(log => log.playerName === playerName);
    
    const distEl = document.getElementById('my-sprint-distance'); 
    if(!distEl) return; 
    const dist = distEl.value; 
    const bestTimes = {};
    
    STATE.logs.forEach(log => { 
        let sLogs = log.sprintLogs || []; 
        sLogs.forEach(s => { 
            if(s.distance === dist && s.time) { 
                const t = parseFloat(s.time); 
                if(t > 0 && (!bestTimes[log.playerName] || t < bestTimes[log.playerName])) {
                    bestTimes[log.playerName] = t; 
                }
            } 
        }); 
    });
    
    const sorted = Object.entries(bestTimes).sort((a,b)=>a[1]-b[1]); 
    const myBest = bestTimes[playerName];
    const mbTime = document.getElementById('my-best-time'); 
    const mtRank = document.getElementById('my-team-rank');
    
    if(myBest) { 
        if(mbTime) mbTime.textContent = myBest.toFixed(2) + ' 秒'; 
        let rank = 1, prev = -1, dispRank = 1, myRank=1; 
        sorted.forEach(i => { 
            if(i[1] !== prev) dispRank = rank; 
            if(i[0] === playerName) myRank = dispRank; 
            prev = i[1]; rank++; 
        }); 
        if(mtRank) mtRank.textContent = myRank + ' 位'; 
    } else { 
        if(mbTime) mbTime.textContent = '- 秒'; 
        if(mtRank) mtRank.textContent = '- 位'; 
    }

    if (typeof Chart !== 'undefined') {
        const ctx = document.getElementById('player-chart');
        if (ctx) {
            const recentLogs = [...myLogs].slice(0, 7).reverse(); 
            const labels = recentLogs.map(log => log.date ? log.date.split('-').slice(1).join('/') : '不明'); 
            const loadData = recentLogs.map(log => parseFloat(log.trainingLoad) || 0); 
            const fatigueData = recentLogs.map(log => parseInt(log.fatigue) || 0);
            
            const isDark = document.body.classList.contains('dark-mode'); 
            const tickColor = isDark ? '#94a3b8' : '#6b7280'; 
            const gridColor = isDark ? '#333333' : '#e5e7eb';
            
            if (STATE.chartInstance) { 
                STATE.chartInstance.data.labels = labels; 
                STATE.chartInstance.data.datasets[0].data = loadData; 
                STATE.chartInstance.data.datasets[1].data = fatigueData; 
                STATE.chartInstance.options.scales.x.ticks.color = tickColor; 
                STATE.chartInstance.options.scales.x.grid.color = gridColor; 
                STATE.chartInstance.options.scales.y.ticks.color = tickColor; 
                STATE.chartInstance.options.scales.y.grid.color = gridColor; 
                STATE.chartInstance.options.scales.y1.ticks.color = tickColor; 
                STATE.chartInstance.options.plugins.title.color = tickColor; 
                STATE.chartInstance.options.plugins.legend.labels.color = tickColor; 
                STATE.chartInstance.update(); 
            } else {
                STATE.chartInstance = new Chart(ctx, { 
                    type: 'line', 
                    data: { 
                        labels: labels, 
                        datasets: [ 
                            { label: 'Training Load', data: loadData, borderColor: '#f97316', backgroundColor: '#f97316', yAxisID: 'y', tension: 0.4 }, 
                            { label: '疲労度', data: fatigueData, borderColor: '#ec4899', backgroundColor: '#ec4899', borderDash: [5, 5], yAxisID: 'y1', tension: 0.4 } 
                        ] 
                    }, 
                    options: { 
                        responsive: true, 
                        plugins: { title: { display: true, text: '最近のコンディション推移 (最大7日間)', color: tickColor }, legend: { labels: { color: tickColor } } }, 
                        scales: { 
                            x: { ticks: { color: tickColor }, grid: { color: gridColor } }, 
                            y: { beginAtZero: true, position: 'left', ticks: { color: tickColor }, grid: { color: gridColor } }, 
                            y1: { beginAtZero: true, min: 0, max: 10, position: 'right', grid: { drawOnChartArea: false }, ticks: { color: tickColor } } 
                        } 
                    } 
                });
            }
        }
    }
}

// --- 📖 学び (Education) ---
export function filterEducation(cat, btn) { 
    document.querySelectorAll('.edu-cat-btn').forEach(b => b.classList.remove('active')); 
    if(btn) btn.classList.add('active'); 
    STATE.currentEduCat = cat; 
    renderEducationList(); 
}

function getYouTubeEmbedUrl(url) { 
    if(!url) return null; 
    const match = url.match(/^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/); 
    return (match && match[2].length === 11) ? `https://www.youtube.com/embed/${match[2]}` : null; 
}

export function renderEducationList() {
    const container = document.getElementById('education-list-container'); 
    if(!container) return; 
    container.innerHTML = '';
    
    const filtered = STATE.currentEduCat === 'すべて' 
        ? STATE.education 
        : STATE.education.filter(item => 
            item.category === STATE.currentEduCat || 
            (STATE.currentEduCat === 'ケア' && item.category === 'ケア・リカバリー') || 
            (STATE.currentEduCat === '理論' && item.category === 'トレーニング理論') || 
            (STATE.currentEduCat === '栄養' && item.category === '栄養・食事') || 
            (STATE.currentEduCat === 'メンタル' && item.category === 'メンタル')
        );
        
    if (filtered.length === 0) { 
        container.innerHTML = '<div class="text-center" style="padding: 40px; color: var(--text-muted); font-size: 15px; font-weight:bold;">このカテゴリのコンテンツはまだありません。</div>'; 
        return; 
    }
    
    filtered.forEach(item => { 
        const card = document.createElement('div'); 
        card.className = 'edu-card'; 
        const embedUrl = getYouTubeEmbedUrl(item.url); 
        const ytHtml = embedUrl 
            ? `<div class="yt-container" style="position:relative; padding-bottom:56.25%; height:0; overflow:hidden; margin-top:14px; border-radius:12px; box-shadow:var(--shadow-sm);"><iframe style="position:absolute; top:0; left:0; width:100%; height:100%; border:none;" src="${embedUrl}" allowfullscreen></iframe></div>` 
            : (item.url ? `<a href="${item.url}" target="_blank" style="display:inline-block; margin-top:14px; color:var(--primary); font-weight:800; font-size:14px; background:var(--primary-light); padding:8px 16px; border-radius:12px; transition:transform 0.2s;">🔗 リンクを開く</a>` : ''); 
        
        const isDark = document.body.classList.contains('dark-mode'); 
        const bg = isDark ? '#3a1523' : '#ffedd5'; 
        const col = isDark ? '#fbcfe8' : '#c2410c'; 
        
        card.innerHTML = `<span style="background:${bg}; color:${col}; font-size:12px; padding:4px 12px; border-radius:14px; font-weight:900; display:inline-block; margin-bottom:12px; letter-spacing:0.5px;">${item.category}</span><h3 style="font-size: 18px; font-weight: 900; color: var(--primary); margin: 0 0 12px 0;">${item.title}</h3><div style="font-size: 14px; color: var(--text-main); white-space: pre-wrap; line-height: 1.6; font-weight:500;">${item.description}</div>${ytHtml}`; 
        container.appendChild(card); 
    });
}

// --- 🔔 通知バッジ・バナー ---
export function updateNotificationBadge(unreadCount) {
    const badge = document.getElementById('notification-badge'); 
    if(!badge) return;
    if (unreadCount > 0) { 
        badge.textContent = unreadCount > 9 ? '9+' : unreadCount; 
        window.UI.toggleDisplay('notification-badge', 'flex'); 
    } else { 
        window.UI.hideDisplay('notification-badge'); 
    }
}

export function renderTeamActivities(onKudosClick) {
    const container = document.getElementById('team-activity-list'); 
    if (!container) return; 
    container.innerHTML = '';
    
    const otherLogs = STATE.logs.filter(l => l.playerName !== STATE.currentUser && l.trainingLoad).slice(0, 15);
    if (otherLogs.length === 0) { 
        container.innerHTML = '<div class="text-center" style="color:var(--text-muted); padding:20px; font-size:14px; font-weight:bold;">まだチームメイトの活動がありません</div>'; 
        return; 
    }
    
    otherLogs.forEach(log => {
        const div = document.createElement('div'); 
        div.className = 'glass-card'; 
        div.style.padding = '18px'; 
        div.style.marginBottom = '14px';
        
        let titleHtml = `<strong style="color:var(--primary);">${log.playerName}</strong> さんが練習を完了しました！`;
        if (log.pbDistances && log.pbDistances.length > 0) { 
            titleHtml = `🎉 <strong style="color:var(--primary);">${log.playerName}</strong> さんが <b>${log.pbDistances.join(', ')}m</b> で自己ベストを更新しました！`; 
        }
        
        const sentKudos = STATE.kudos.filter(k => k.logDate === log.date && k.target === log.playerName && k.sender === STATE.currentUser);
        const mySentStamp = sentKudos.length > 0 ? sentKudos[0].stamp : null;
        
        div.innerHTML = `
            <div style="font-size:13px; color:var(--text-muted); margin-bottom:6px; font-weight:bold;">${log.date.replace(/-/g, '/')}</div>
            <div style="font-size:15px; color:var(--text-main); margin-bottom:14px; line-height:1.5;">${titleHtml}</div>
            <div class="flex-row-gap">
                <span style="font-size:13px; color:var(--text-muted); font-weight:bold; margin-right:6px;">エールを送る:</span>
                <button class="kudos-btn ${mySentStamp === '👏' ? 'selected' : ''}" data-stamp="👏">👏</button>
                <button class="kudos-btn ${mySentStamp === '🔥' ? 'selected' : ''}" data-stamp="🔥">🔥</button>
                <button class="kudos-btn ${mySentStamp === '💪' ? 'selected' : ''}" data-stamp="💪">💪</button>
            </div>
        `;
        
        div.querySelectorAll('.kudos-btn').forEach(btn => {
            btn.onclick = () => onKudosClick(log.playerName, btn.getAttribute('data-stamp'), log.date);
        });
        
        container.appendChild(div);
    });
}
