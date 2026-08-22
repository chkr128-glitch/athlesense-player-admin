import { STATE } from './state.js';
import * as logic from './logic.js';
import * as ui from './ui.js';
import * as auth from '../common/auth.js';
import * as form from './form.js';

// --- 共通モジュールのインポート ---
import { CONSTANTS } from '../common/constants.js';
import { HAPTIC, UI } from '../common/utils.js';
import { initFirebase, db, colRefs } from '../common/firebase-init.js';

// グローバルスコープへ紐付け (他モジュールやインラインイベントから参照するため)
window.CONSTANTS = CONSTANTS;
window.HAPTIC = HAPTIC;
window.UI = UI;

// ==========================================
// 初期化プロセス
// ==========================================
async function initApp() {
    // テーマの復元
    if (localStorage.getItem('theme') === 'dark') { 
        document.body.classList.add('dark-mode'); 
        document.getElementById('theme-toggle').innerHTML = '☀️'; 
    } else { 
        document.getElementById('theme-toggle').innerHTML = '🌙'; 
    }
    
    // 日付の初期設定
    const today = new Date();
    const dateInput = document.getElementById('date');
    if (dateInput) {
        dateInput.value = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}-${String(today.getDate()).padStart(2,'0')}`;
    }
    STATE.calYear = today.getFullYear(); 
    STATE.calMonth = today.getMonth();
    
    setupEventListeners();
    fetchWeather();
    checkReminders();

    // Firebaseの初期化をここで明示的に待機
    const isFirebaseInitialized = await initFirebase(CONSTANTS);
    if (isFirebaseInitialized) {
        window.db = db;
        window.colRefs = colRefs;
    }

    try {
        if(window.colRefs && Object.keys(window.colRefs).length > 0) {
            setupFirebaseListeners(); 
            checkLoginStatus(); 
        } else {
            throw new Error("Firebase is not initialized");
        }
    } catch (error) {
        console.warn("ローカルモードで起動します", error); 
        window.UI.showToast("ローカルモードで起動します。", "warning");
        loadLocalData(); 
        checkLoginStatus(); 
    }
}

// ==========================================
// 認証・セッション管理
// ==========================================
function checkLoginStatus() {
    const savedUser = auth.getCurrentUser();
    if (savedUser) {
        STATE.currentUser = savedUser;
        window.UI.hideDisplay('login-screen'); 
        window.UI.toggleDisplay('main-app', 'block');
        window.UI.toggleDisplay('logout-btn', 'flex'); 
        window.UI.toggleDisplay('notification-btn', 'flex'); 
        window.UI.toggleDisplay('header-streak-badge', 'flex');
        
        document.querySelectorAll('.display-player-name').forEach(el => el.textContent = STATE.currentUser);
        const me = STATE.players.find(p => p.name === STATE.currentUser); 
        if (me) STATE.currentUserCategory = me.category || 'BLUE';
        
        ui.renderPlayerGoal(); 
        ui.renderCalendar(handleDateSelect); 
        ui.updateHeaderStreak();
        
        setTimeout(() => { 
            const dInput = document.getElementById('date'); 
            if (dInput) loadFormData(dInput.value); 
        }, 100);
        
        const historyTab = document.getElementById('tab-history');
        if(historyTab && historyTab.classList.contains('active')) { 
            ui.renderPlayerHistory(); 
            ui.renderTeamActivities(handleSendKudos); 
        }
        updateGlobalNotifications();
    } else {
        window.UI.toggleDisplay('login-screen', 'flex'); 
        window.UI.hideDisplay('main-app');
        window.UI.hideDisplay('logout-btn'); 
        window.UI.hideDisplay('notification-btn'); 
        window.UI.hideDisplay('header-streak-badge'); 
        window.UI.hideDisplay('streak-badge-container');
    }
}

function handleLogin() {
    const selectEl = document.getElementById('login-player-select');
    const selectedPlayer = selectEl ? selectEl.value : null;
    if (auth.login(selectedPlayer)) {
        checkLoginStatus();
    }
}

function handleLogout() { 
    auth.logout(() => {
        checkLoginStatus(); 
    }); 
}

// ==========================================
// データフロー・Firebase購読
// ==========================================
function setupFirebaseListeners() {
    if(window.colRefs.players) { 
        window.colRefs.players.onSnapshot(snapshot => { 
            STATE.players = snapshot.docs.map(doc => ({id: doc.id, ...doc.data()})); 
            ui.updateLoginSelect(); 
            if (STATE.currentUser) { 
                const me = STATE.players.find(p => p.name === STATE.currentUser); 
                if (me) STATE.currentUserCategory = me.category || 'BLUE'; 
            } 
        }); 
    }
    if(window.colRefs.settings) { 
        window.colRefs.settings.doc('general').onSnapshot(doc => { 
            if(doc.exists) { 
                STATE.settings = doc.data(); 
                ui.renderCareTags(); 
                ui.updateCountdownUI(); 
            } else { 
                ui.renderCareTags(); 
            } 
        }); 
    }
    // 💡 修正: goals, edu のリスナーを復活
    if(window.colRefs.goals) {
        window.colRefs.goals.onSnapshot(snapshot => {
            STATE.goals = {}; 
            snapshot.forEach(doc => { STATE.goals[doc.id] = doc.data(); });
            if(STATE.currentUser) ui.renderPlayerGoal();
        });
    }
    if(window.colRefs.edu) {
        window.colRefs.edu.onSnapshot(snapshot => {
            STATE.education = [];
            snapshot.forEach(doc => { STATE.education.push({ id: doc.id, ...doc.data() }); });
            STATE.education.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
            // 必要な場合は再レンダリング処理を呼ぶ
            const eduTab = document.getElementById('tab-education');
            if(eduTab && eduTab.classList.contains('active') && window.renderEducationList) {
                window.renderEducationList();
            }
        });
    }
    if(window.colRefs.logs) { 
        window.colRefs.logs.onSnapshot(snapshot => { 
            STATE.logs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })).sort((a, b) => new Date(b.date) - new Date(a.date)); 
            if(STATE.currentUser) { 
                ui.renderCalendar(handleDateSelect); 
                const dInput = document.getElementById('date'); 
                if(dInput) loadFormData(dInput.value); 
                ui.updateHeaderStreak(); 
                
                const historyTab = document.getElementById('tab-history'); 
                if(historyTab && historyTab.classList.contains('active')) { 
                    ui.renderPlayerHistory(); 
                    ui.renderTeamActivities(handleSendKudos); 
                } 
                updateGlobalNotifications(); 
            } 
        }); 
    }
    if(window.colRefs.kudos) { 
        window.colRefs.kudos.onSnapshot(snapshot => { 
            STATE.kudos = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })); 
            if (STATE.currentUser) { 
                updateGlobalNotifications(); 
                ui.renderTeamActivities(handleSendKudos); 
            } 
        }); 
    }
    if(window.colRefs.broadcasts) { 
        window.colRefs.broadcasts.onSnapshot(snapshot => { 
            STATE.broadcasts = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)); 
            if (STATE.currentUser) { updateGlobalNotifications(); } 
        }); 
    }
}

function loadLocalData() {
    STATE.players = JSON.parse(localStorage.getItem('team_players') || '[]'); 
    ui.updateLoginSelect();
    STATE.logs = JSON.parse(localStorage.getItem('team_condition_logs') || '[]').sort((a, b) => new Date(b.date) - new Date(a.date));
    STATE.settings = JSON.parse(localStorage.getItem('team_settings') || '{}'); 
    STATE.kudos = JSON.parse(localStorage.getItem('team_kudos') || '[]'); 
    STATE.goals = JSON.parse(localStorage.getItem('team_goals') || '{}'); // ローカル用も追加
    
    ui.renderCareTags(); 
    ui.updateCountdownUI(); 
    if(STATE.currentUser) { 
        ui.renderPlayerGoal(); 
        ui.renderCalendar(handleDateSelect); 
        ui.updateHeaderStreak(); 
    }
}

// ==========================================
// フォーム入力・UIイベント
// ==========================================
function setupEventListeners() {
    const elFatigue = document.getElementById('fatigue'); 
    const elStress = document.getElementById('stress'); 
    const elRpe = document.getElementById('rpe'); 
    const elDuration = document.getElementById('duration');
    
    if(elFatigue) elFatigue.addEventListener('input', () => { 
        if(window.HAPTIC) window.HAPTIC.light(); 
        ui.updateFaceMeter('fatigue-display', elFatigue.value, 'fatigue'); 
        refreshAdvicePre(); 
    });
    if(elStress) elStress.addEventListener('input', () => { 
        if(window.HAPTIC) window.HAPTIC.light(); 
        ui.updateFaceMeter('stress-display', elStress.value, 'stress'); 
        refreshAdvicePre(); 
    });
    if(elRpe) elRpe.addEventListener('input', () => { 
        if(window.HAPTIC) window.HAPTIC.light(); 
        refreshLoadAndAdvicePost(); 
    });
    if(elDuration) elDuration.addEventListener('input', refreshLoadAndAdvicePost);
    
    document.querySelectorAll('input[name="sleep-quality"], #sleep, #weight').forEach(el => { 
        el.addEventListener('change', refreshAdvicePre); 
    });
    const preInj = document.getElementById('injury-pre'); 
    if(preInj) preInj.addEventListener('input', refreshAdvicePre); 
    const postInj = document.getElementById('injury'); 
    if(postInj) postInj.addEventListener('input', refreshAdvicePostOnly); 
    const badInp = document.getElementById('bad'); 
    if(badInp) badInp.addEventListener('input', refreshAdvicePostOnly);
    
    // 朝の張りボタン
    document.querySelectorAll('.tag-btn-pre').forEach(btn => {
        btn.addEventListener('click', function() { 
            if(window.HAPTIC) window.HAPTIC.light(); 
            const part = this.getAttribute('data-part'); 
            if (STATE.sorenessPre.includes(part)) { 
                STATE.sorenessPre = STATE.sorenessPre.filter(p => p !== part); 
                this.classList.remove('selected'); 
            } else { 
                STATE.sorenessPre.push(part); 
                this.classList.add('selected'); 
            } 
            refreshAdvicePre(); 
        });
    });

    // 💡 修正: 夜の張りボタンのイベントリスナーを追加
    document.querySelectorAll('.tag-btn-post').forEach(btn => {
        btn.addEventListener('click', function() { 
            if(window.HAPTIC) window.HAPTIC.light(); 
            const part = this.getAttribute('data-part'); 
            if (STATE.sorenessPost.includes(part)) { 
                STATE.sorenessPost = STATE.sorenessPost.filter(p => p !== part); 
                this.classList.remove('selected'); 
            } else { 
                STATE.sorenessPost.push(part); 
                this.classList.add('selected'); 
            } 
            refreshAdvicePostOnly(); 
        });
    });
}

function refreshAdvicePre() {
    const data = {
        fatigue: parseInt(document.getElementById('fatigue')?.value || 1),
        stress: parseInt(document.getElementById('stress')?.value || 1),
        sleep: parseFloat(document.getElementById('sleep')?.value || 0),
        sleepQuality: parseInt(document.querySelector('input[name="sleep-quality"]:checked')?.value || 5),
        injuryPre: document.getElementById('injury-pre')?.value || ''
    };
    
    const score = logic.calcIrsScore('pre', data, STATE.sorenessPre);
    ui.updateIRSUIDisplay('pre', score);
    
    const advices = logic.generateAIAdvicePre(data, STATE.sorenessPre);
    ui.renderAIAdvice('pre', advices);
}

function refreshLoadAndAdvicePost() {
    const dur = parseFloat(document.getElementById('duration')?.value || 0);
    const rpe = parseFloat(document.getElementById('rpe')?.value || 0);
    ui.updateFaceMeter('rpe-display', rpe, 'rpe'); 
    
    const loadRes = document.getElementById('load-result'); 
    if(loadRes) loadRes.textContent = (dur > 0 && rpe > 0) ? (dur * rpe).toFixed(1) : '-'; 
    
    refreshAdvicePostOnly();
}

function refreshAdvicePostOnly() {
    const loadRes = document.getElementById('load-result'); 
    const load = loadRes && loadRes.textContent !== '-' ? parseFloat(loadRes.textContent) : 0;
    
    const data = {
        load: load,
        rpe: parseFloat(document.getElementById('rpe')?.value || 0),
        injury: document.getElementById('injury')?.value || '',
        bad: document.getElementById('bad')?.value || ''
    };
    
    const score = logic.calcIrsScore('post', data, STATE.sorenessPost);
    ui.updateIRSUIDisplay('post', score);
    
    const sprintCount = document.querySelectorAll('.sprint-row').length;
    const advices = logic.generateAIAdvicePost(data, STATE.sorenessPost, sprintCount);
    ui.renderAIAdvice('post', advices);
}

function handleDateSelect(dateStr) {
    if(window.HAPTIC) window.HAPTIC.light(); 
    const dInput = document.getElementById('date'); 
    if(dInput) dInput.value = dateStr; 
    ui.renderCalendar(handleDateSelect); 
    
    const parts = dateStr.split('-'); 
    const displayStr = `${parts[1]}/${parts[2]}`; 
    const dispPre = document.getElementById('display-date-pre'); 
    const dispPost = document.getElementById('display-date-post'); 
    if(dispPre) dispPre.textContent = `[ ${displayStr} ]`; 
    if(dispPost) dispPost.textContent = `[ ${displayStr} ]`; 
    
    loadFormData(dateStr);
}

function loadFormData(dateStr) {
    const log = STATE.logs.find(l => l.playerName === STATE.currentUser && l.date === dateStr); 
    const fPre = document.getElementById('form-pre'); if(fPre) fPre.reset(); 
    const fPost = document.getElementById('form-post'); if(fPost) fPost.reset(); 
    document.querySelectorAll('.tag-btn, .care-tag').forEach(el => el.classList.remove('selected')); 
    const srCont = document.getElementById('sprint-rows-container'); if(srCont) srCont.innerHTML = ''; 
    const fvDisp = document.getElementById('fv-display'); if(fvDisp) fvDisp.textContent = '-'; 
    const lRes = document.getElementById('load-result'); if(lRes) lRes.textContent = '-'; 
    
    const fat = document.getElementById('fatigue'); if(fat) fat.value = 1; 
    const str = document.getElementById('stress'); if(str) str.value = 1; 
    const rpe = document.getElementById('rpe'); if(rpe) rpe.value = 5; 
    STATE.sorenessPre = []; STATE.sorenessPost = [];

    if (log) {
        const slp = document.getElementById('sleep'); if (slp && log.sleep) slp.value = log.sleep; 
        if (log.sleepQuality) { const sq = document.getElementById(`star${log.sleepQuality}-pre`); if (sq) sq.checked = true; } 
        const wt = document.getElementById('weight'); if (wt && log.weight) wt.value = log.weight; 
        const hr = document.getElementById('heart-rate'); if (hr && log.heartRate) hr.value = log.heartRate; 
        if (fat && log.fatigue) fat.value = log.fatigue; 
        if (str && log.stress) str.value = log.stress; 
        const injPre = document.getElementById('injury-pre'); if (injPre && log.injuryPre) injPre.value = log.injuryPre;
        
        if (log.soreness) { 
            STATE.sorenessPre = log.soreness.split(',').map(p => p.trim()); 
            document.querySelectorAll('.tag-btn-pre').forEach(btn => { 
                if (STATE.sorenessPre.includes(btn.getAttribute('data-part'))) btn.classList.add('selected'); 
            }); 
        }
        
        const dur = document.getElementById('duration'); if (dur && log.duration) dur.value = log.duration; 
        if (rpe && log.rpe) rpe.value = log.rpe; 
        const rsi = document.getElementById('rsi'); if (rsi && log.rsi) rsi.value = log.rsi; 
        const t30 = document.getElementById('time-30m'); if (t30 && log.time30m) t30.value = log.time30m; 
        const t20 = document.getElementById('time-fly20m'); if (t20 && log.timeFly20m) t20.value = log.timeFly20m; 
        const injPost = document.getElementById('injury'); if (injPost && log.injury) injPost.value = log.injury; 
        const menu = document.getElementById('menu'); if (menu && log.menu) menu.value = log.menu; 
        const steps = document.getElementById('steps'); if (steps && log.steps) steps.value = log.steps; 
        const good = document.getElementById('good'); if (good && log.good) good.value = log.good; 
        const bad = document.getElementById('bad'); if (bad && log.bad) bad.value = log.bad;
        
        if (log.sprintLogs) { log.sprintLogs.forEach(s => addSprintRow(s.distance, s.time)); }
        
        if (log.sorenessPost) { 
            STATE.sorenessPost = log.sorenessPost.split(',').map(p => p.trim()); 
            document.querySelectorAll('.tag-btn-post').forEach(btn => { 
                if (STATE.sorenessPost.includes(btn.getAttribute('data-part'))) btn.classList.add('selected'); 
            }); 
        }
        
        if (log.care) { 
            const cares = log.care.split(' / ').map(c => c.trim()).filter(c => c !== 'null' && c !== ''); 
            document.querySelectorAll('.care-tag').forEach(btn => { 
                if (cares.includes(btn.textContent)) { btn.classList.add('selected'); cares.splice(cares.indexOf(btn.textContent), 1); } 
            }); 
            if (cares.length > 0 && cares[0] !== "") { 
                const careEl = document.getElementById('care'); if(careEl) careEl.value = cares.join(' / '); 
            } 
        }
    }
    
    if(fat) ui.updateFaceMeter('fatigue-display', fat.value, 'fatigue'); 
    if(str) ui.updateFaceMeter('stress-display', str.value, 'stress'); 
    if(rpe) ui.updateFaceMeter('rpe-display', rpe.value, 'rpe'); 
    
    calcLoad(); 
    calcFv(); 
    refreshAdvicePre(); 
    refreshAdvicePostOnly();
}

function calcLoad() { 
    const durEl = document.getElementById('duration'); 
    const rpeEl = document.getElementById('rpe'); 
    if(!durEl || !rpeEl) return; 
    const d = parseFloat(durEl.value) || 0; 
    const r = parseFloat(rpeEl.value) || 0; 
    ui.updateFaceMeter('rpe-display', r, 'rpe'); 
    const loadRes = document.getElementById('load-result'); 
    if(loadRes) loadRes.textContent = (d > 0 && r > 0) ? (d * r).toFixed(1) : '-'; 
    refreshAdvicePostOnly(); 
}

function calcFv() { 
    const t30El = document.getElementById('time-30m'); 
    const t20El = document.getElementById('time-fly20m'); 
    if(!t30El || !t20El) return; 
    const t30 = parseFloat(t30El.value); 
    const t20 = parseFloat(t20El.value); 
    const display = document.getElementById('fv-display'); 
    const hiddenInput = document.getElementById('fv-result'); 
    
    const fvInfo = logic.calcFvProfile(t30, t20);
    if (fvInfo) { 
        if(display) display.textContent = `${fvInfo.result} (${fvInfo.ratio.toFixed(2)})`; 
        if(hiddenInput) hiddenInput.value = fvInfo.result; 
    } else { 
        if(display) display.textContent = '-'; 
        if(hiddenInput) hiddenInput.value = ''; 
    } 
}

function addSprintRow(dist = '', time = '') {
    if(window.HAPTIC) window.HAPTIC.light();
    const container = document.getElementById('sprint-rows-container');
    const template = document.getElementById('sprint-row-template');
    if(!container || !template) return;
    const clone = template.content.cloneNode(true);
    if(dist) {
        const dInput = clone.querySelector('.sprint-dist-input');
        const tInput = clone.querySelector('.sprint-time-input');
        if(dInput) dInput.value = dist;
        if(tInput) {
            tInput.value = time;
            setTimeout(() => checkSprintRank(tInput), 50);
        }
    }
    container.appendChild(clone);
}

function checkSprintRank(el) {
    refreshAdvicePostOnly();
    const row = el.closest('.sprint-row');
    if (!row) return;
    const distInput = row.querySelector('.sprint-dist-input');
    const timeInput = row.querySelector('.sprint-time-input');
    const badgeEl = row.querySelector('.sprint-rank-badge');
    if(!distInput || !timeInput || !badgeEl) return;

    const dist = distInput.value;
    const time = parseFloat(timeInput.value);

    const rankInfo = logic.evaluateSprintRank(dist, time, STATE.logs, STATE.currentUser);
    if(rankInfo) {
        badgeEl.textContent = rankInfo.badge;
        badgeEl.title = rankInfo.title;
        if(rankInfo.isBest && window.HAPTIC) window.HAPTIC.success();
    } else {
        badgeEl.textContent = '';
        badgeEl.title = '';
    }
}

async function handleSendKudos(target, stamp, logDate) {
    if(window.HAPTIC) window.HAPTIC.medium(); 
    const sender = STATE.currentUser; 
    if (!sender) return;
    const existingIndex = STATE.kudos.findIndex(k => k.logDate === logDate && k.target === target && k.sender === sender);
    const kudoData = { sender, target, stamp, logDate, isRead: false, createdAt: new Date().toISOString() };
    
    try {
        if (window.colRefs && window.colRefs.kudos) {
            if (existingIndex > -1) { 
                const docId = STATE.kudos[existingIndex].id; 
                await window.colRefs.kudos.doc(docId).update({ stamp, isRead: false, createdAt: new Date().toISOString() }); 
            } else { 
                await window.colRefs.kudos.add(kudoData); 
            }
        } else {
            if (existingIndex > -1) { 
                STATE.kudos[existingIndex].stamp = stamp; 
                STATE.kudos[existingIndex].isRead = false; 
            } else { 
                STATE.kudos.push({ id: Date.now().toString(), ...kudoData }); 
            }
            localStorage.setItem('team_kudos', JSON.stringify(STATE.kudos));
        }
        if(window.UI) window.UI.showToast(`${target}さんにエールを送りました！`, 'success'); 
        ui.renderTeamActivities(handleSendKudos);
    } catch(e) { 
        if(window.UI) window.UI.showToast('送信に失敗しました', 'error'); 
    }
}

function updateGlobalNotifications() {
    const unreadBroadcasts = STATE.broadcasts.filter(b => (b.target === 'ALL' || b.target === STATE.currentUserCategory) && !(b.readBy && b.readBy.includes(STATE.currentUser)));
    const unreadComments = STATE.logs.filter(log => log.playerName === STATE.currentUser && log.coachComment && !log.playerReadComment);
    const unreadKudos = STATE.kudos.filter(k => k.target === STATE.currentUser && !k.isRead);
    
    const totalUnread = unreadBroadcasts.length + unreadComments.length + unreadKudos.length;
    ui.updateNotificationBadge(totalUnread);
}

function fetchWeather() {
    const locText = document.getElementById('location-text'), tempText = document.getElementById('temp-text'), adviceBox = document.getElementById('weather-advice');
    if (!navigator.geolocation) { 
        if(locText) locText.textContent = "GPS未対応"; 
        if(adviceBox) adviceBox.innerHTML = "※天候アドバイスを利用できません。"; 
        return; 
    }
    if(locText) locText.textContent = "取得中...";
    
    navigator.geolocation.getCurrentPosition(position => {
        const lat = position.coords.latitude, lon = position.coords.longitude;
        fetch(`https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lon}&localityLanguage=ja`)
            .then(res => res.json())
            .then(geo => { if(locText) locText.textContent = `${geo.locality || geo.city || "現在地"} 付近の天候`; })
            .catch(() => { if(locText) locText.textContent = "現在地の天候"; });
            
        fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current_weather=true`)
            .then(res => res.json())
            .then(data => {
                const temp = data.current_weather.temperature; 
                const code = data.current_weather.weathercode;
                let weatherCategory = "晴れ"; let weatherIcon = "☀️";
                if (code <= 1) { weatherCategory = "晴れ"; weatherIcon = "☀️"; } 
                else if (code <= 3 || code === 45 || code === 48) { weatherCategory = "くもり"; weatherIcon = "☁️"; } 
                else if ((code >= 51 && code <= 67) || (code >= 80 && code <= 82) || (code >= 95)) { weatherCategory = "雨"; weatherIcon = "🌧️"; } 
                else if ((code >= 71 && code <= 77) || (code >= 85 && code <= 86)) { weatherCategory = "雪"; weatherIcon = "❄️"; }
                
                let tempCategory = "あたたか";
                if (temp >= 35) tempCategory = "猛暑"; 
                else if (temp >= 25) tempCategory = "夏日"; 
                else if (temp >= 15) tempCategory = "あたたか"; 
                else if (temp >= 5) tempCategory = "寒い"; 
                else tempCategory = "激寒";
                
                const overlay = document.getElementById('weather-overlay');
                if(overlay) {
                    overlay.className = 'weather-overlay';
                    if (weatherCategory === '晴れ') overlay.classList.add('w-sunny'); 
                    else if (weatherCategory === 'くもり') overlay.classList.add('w-cloudy'); 
                    else if (weatherCategory === '雨') overlay.classList.add('w-rainy'); 
                    else if (weatherCategory === '雪') overlay.classList.add('w-snowy');
                    
                    if (tempCategory === '猛暑' || tempCategory === '夏日') overlay.classList.add('t-hot'); 
                    else if (tempCategory === '寒い' || tempCategory === '激寒') overlay.classList.add('t-cold');
                }
                
                if(tempText) tempText.innerHTML = `<span style="font-size:18px; margin-right:6px;">${weatherIcon}</span>${temp} ℃`;
                let advice = "";
                if(tempCategory === "猛暑") advice = "🥵 <b>【猛暑・熱中症警戒】</b>危険な暑さです。練習前・中・後の水分と塩分補給を徹底し、日陰での休憩を！"; 
                else if(tempCategory === "夏日") advice = "💦 <b>【夏日・脱水注意】</b>発汗量が増え、水分を失うと出力が落ちます。喉が渇く前に水分補給を。"; 
                else if(tempCategory === "あたたか") advice = "😊 <b>【あたたか・適温】</b>スプリントに適した良い気候です。質の高い出力にフォーカスしましょう。"; 
                else if(tempCategory === "寒い") advice = "🧥 <b>【寒い・ウォーミングアップ】</b>体が温まるまで時間がかかります。動的ストレッチを長めに取りましょう。"; 
                else if(tempCategory === "激寒") advice = "🥶 <b>【激寒・肉離れ警戒】</b>筋肉が硬直しやすいです。急激な出力は危険！アップを念入りに、保温を徹底！";
                
                if(adviceBox) adviceBox.innerHTML = advice;
            }).catch(() => { if(adviceBox) adviceBox.innerHTML = "※通信エラーのため天気情報が取得できませんでした。"; });
    }, () => { 
        if(locText) locText.textContent = "GPS未許可"; 
        if(adviceBox) adviceBox.innerHTML = "※位置情報を許可すると対策アドバイスが表示されます。"; 
    });
}

function checkReminders() {
    const isEnabled = localStorage.getItem('reminder_enabled') === 'true'; 
    const toggle = document.getElementById('notification-toggle'); 
    if(toggle) toggle.checked = isEnabled;
    const check = () => {
        if(localStorage.getItem('reminder_enabled') === 'true' && window.Notification && Notification.permission === "granted") {
            const now = new Date(); const hour = now.getHours(); const today = now.getDate().toString(); 
            const lastRemindedPre = localStorage.getItem('last_reminder_pre');
            if(hour >= 7 && hour < 12 && lastRemindedPre !== today) { 
                new Notification("AthleSense", { body: "🌅 おはようございます！朝のコンディションを入力しましょう！", icon: "icon.png" }); 
                localStorage.setItem('last_reminder_pre', today); 
            }
            const lastRemindedPost = localStorage.getItem('last_reminder_post');
            if(hour >= 20 && lastRemindedPost !== today) { 
                new Notification("AthleSense", { body: "🌙 夜になりました。今日の記録とケアを入力しましょう！", icon: "icon.png" }); 
                localStorage.setItem('last_reminder_post', today); 
            }
        }
    };
    check(); 
    if(!window.reminderInterval) { window.reminderInterval = setInterval(check, 60000); }
}

function toggleTheme() {
    if(window.HAPTIC) window.HAPTIC.light();
    document.body.classList.toggle('dark-mode');
    const isDark = document.body.classList.contains('dark-mode');
    localStorage.setItem('theme', isDark ? 'dark' : 'light');
    const tToggle = document.getElementById('theme-toggle');
    if(tToggle) tToggle.innerHTML = isDark ? '☀️' : '🌙';
}

function switchTab(tabId, btn) {
    if(window.HAPTIC) window.HAPTIC.light();
    document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active'));
    document.querySelectorAll('.tab-btn').forEach(el => el.classList.remove('active'));
    const targetTab = document.getElementById(`tab-${tabId}`);
    if(targetTab) targetTab.classList.add('active');
    if(btn) btn.classList.add('active');
    if(tabId === 'history') {
        ui.renderPlayerHistory();
        ui.renderTeamActivities(handleSendKudos);
    }
}

// ==========================================
// グローバル空間へのエクスポート (インラインイベント用)
// ==========================================
window.handleLogin = handleLogin;
window.handleLogout = handleLogout;
window.saveData = form.saveData;
window.switchTab = switchTab;
window.toggleTheme = toggleTheme;
window.addSprintRow = addSprintRow;
window.checkSprintRank = checkSprintRank;
window.handleDateSelect = handleDateSelect;
window.calcFv = calcFv;
window.handleSyncDeviceData = (name) => { if(window.UI) window.UI.showToast(`${name}の自動取得は開発準備中です。`, "warning"); };

// 起動
document.addEventListener('DOMContentLoaded', initApp);
