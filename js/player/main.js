import { STATE } from './state.js';
import * as logic from './logic.js';
import * as ui from './ui.js';
import * as auth from '../common/auth.js';
import * as form from './form.js';

import { CONSTANTS } from '../common/constants.js';
import { HAPTIC, UI } from '../common/utils.js';
import { initFirebase, db, colRefs } from '../common/firebase-init.js';

window.CONSTANTS = CONSTANTS;
window.HAPTIC = HAPTIC;
window.UI = UI;

let playersLoaded = false;
let mainAppInitialized = false;
let isListenersSetup = false;

// 💡 アーカイブ用のログ保持配列 (過去データ読み込み用)
STATE.archivedLogs = [];

// ==========================================
// 初期化プロセス
// ==========================================
async function initApp() {
    if (localStorage.getItem('theme') === 'dark') { 
        document.body.classList.add('dark-mode'); 
        document.getElementById('theme-toggle').innerHTML = '☀️'; 
    } else { 
        document.getElementById('theme-toggle').innerHTML = '🌙'; 
    }
    
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

    const isFirebaseInitialized = await initFirebase(CONSTANTS);
    if (isFirebaseInitialized) {
        window.db = db;
        window.colRefs = colRefs;
        
        auth.onAuthChange(user => {
            if (user) {
                if (!isListenersSetup) {
                    setupFirebaseListeners();
                    isListenersSetup = true;
                } else {
                    if(playersLoaded) checkUserLink(user);
                }
            } else {
                checkUserLink(null);
            }
        });
    } else {
        window.UI.showToast("通信エラー: Firebaseが初期化できませんでした", "error");
        showScreen('auth-screen');
    }
}

// ==========================================
// 認証・ルーティング・紐付け
// ==========================================
function showScreen(screenId) {
    const screens = ['loading-screen', 'auth-screen', 'setup-screen', 'main-app'];
    screens.forEach(id => {
        const el = document.getElementById(id);
        if(el) {
            if(id === screenId) {
                el.classList.remove('hidden');
                el.style.display = (id === 'main-app') ? 'block' : 'flex';
            } else {
                el.classList.add('hidden');
                el.style.display = 'none';
            }
        }
    });

    if(screenId === 'main-app') {
        window.UI.toggleDisplay('logout-btn', 'flex');
        window.UI.toggleDisplay('notification-btn', 'flex');
        window.UI.toggleDisplay('header-streak-badge', 'flex');
    } else {
        window.UI.hideDisplay('logout-btn');
        window.UI.hideDisplay('notification-btn');
        window.UI.hideDisplay('header-streak-badge');
    }
}

function checkUserLink(user) {
    if (!user) {
        STATE.currentUser = null;
        showScreen('auth-screen');
        return;
    }

    const linkedPlayer = STATE.players.find(p => p.uid === user.uid);
    
    if (linkedPlayer) {
        STATE.currentUser = linkedPlayer.name;
        STATE.currentUserCategory = linkedPlayer.category || 'BLUE';
        
        document.querySelectorAll('.display-player-name').forEach(el => el.textContent = STATE.currentUser);
        showScreen('main-app');
        
        if (!mainAppInitialized) {
            initMainAppUI();
            mainAppInitialized = true;
        } else {
            updateGlobalNotifications();
            ui.renderPlayerHistory();
        }
    } else {
        STATE.currentUser = null;
        updateSetupSelect();
        showScreen('setup-screen');
    }
}

function updateSetupSelect() {
    const select = document.getElementById('setup-player-select');
    if(!select) return;
    
    select.innerHTML = '<option value="" disabled selected>自分の名前を選択 ▼</option>';
    
    const availablePlayers = STATE.players.filter(p => !p.uid);
    availablePlayers.forEach(p => {
        const opt = document.createElement('option');
        opt.value = p.name;
        opt.textContent = p.name;
        select.appendChild(opt);
    });
    
    if(availablePlayers.length === 0) {
        select.innerHTML = '<option value="" disabled selected>紐付け可能な名前がありません（監督に確認してください）</option>';
    }
}

async function handleLinkPlayer() {
    if(window.HAPTIC) window.HAPTIC.medium(); 
    const select = document.getElementById('setup-player-select');
    const playerName = select.value;
    const user = auth.getCurrentUser();
    
    if(!playerName) { 
        alert("▼ リストから自分の名前を選択してください"); 
        return; 
    }
    if(!user) {
        alert("エラー: ログイン状態が確認できません。再度ログインしてください。");
        return;
    }
    
    const playerDoc = STATE.players.find(p => p.name === playerName);
    if(!playerDoc) {
        alert("エラー: 選手データが見つかりません。");
        return;
    }

    const isOk = confirm(`【確認】\n「${playerName}」としてアカウントを登録しますか？\n\n※この操作は後からやり直せません。`);
    
    if (isOk) {
        try {
            if (window.colRefs && window.colRefs.players) {
                await window.colRefs.players.doc(playerDoc.id).update({ uid: user.uid });
            }
            playerDoc.uid = user.uid;
            if(window.UI) window.UI.showToast(`${playerName} さん、ようこそ！`, "success");
            checkUserLink(user);
        } catch (error) {
            alert("紐付けに失敗しました:\n" + error.message);
            console.error("Link Error:", error);
        }
    }
}

function getAuthErrorMessage(error) {
    const code = error.code;
    if (code === 'auth/invalid-credential' || code === 'auth/user-not-found' || code === 'auth/wrong-password') return "メールアドレスかパスワードが間違っています。";
    if (code === 'auth/email-already-in-use') return "このメールアドレスは既に登録されています。";
    if (code === 'auth/weak-password') return "パスワードは6文字以上にしてください。";
    if (code === 'auth/invalid-email') return "メールアドレスの形式が正しくありません。";
    return "認証エラーが発生しました: " + error.message;
}

async function handleEmailLogin() {
    if(window.HAPTIC) window.HAPTIC.light();
    const email = document.getElementById('auth-email').value.trim();
    const pass = document.getElementById('auth-password').value;
    if(!email || !pass) { window.UI.showToast('メールアドレスとパスワードを入力してください', 'warning'); return; }
    
    const res = await auth.loginWithEmail(email, pass);
    if(!res.success) window.UI.showToast(getAuthErrorMessage(res.error), 'error');
}

async function handleEmailRegister() {
    if(window.HAPTIC) window.HAPTIC.light();
    const email = document.getElementById('auth-email').value.trim();
    const pass = document.getElementById('auth-password').value;
    if(!email || !pass) { window.UI.showToast('登録するメールアドレスとパスワードを入力してください', 'warning'); return; }
    
    const res = await auth.registerWithEmail(email, pass);
    if(res.success) {
        window.UI.showToast('アカウントを作成しました！', 'success');
    } else {
        window.UI.showToast(getAuthErrorMessage(res.error), 'error');
    }
}

async function handleGoogleLogin() {
    if(window.HAPTIC) window.HAPTIC.light();
    const res = await auth.loginWithGoogle();
    if(!res.success && res.error.code !== 'auth/popup-closed-by-user') {
        window.UI.showToast(getAuthErrorMessage(res.error), 'error');
    }
}

async function handleLogout() { 
    window.UI.showConfirm("ログアウトしますか？", async () => { 
        await auth.logoutUser();
    }); 
}

// ==========================================
// データフロー・Firebase購読
// ==========================================
function setupFirebaseListeners() {
    // 💡 取得するデータの期間を「過去60日分」に制限
    const limitDate = new Date();
    limitDate.setDate(limitDate.getDate() - 60);
    const dateLimitStr = `${limitDate.getFullYear()}-${String(limitDate.getMonth()+1).padStart(2,'0')}-${String(limitDate.getDate()).padStart(2,'0')}`;
    const timeLimitStr = limitDate.toISOString();

    if(window.colRefs.players) { 
        window.colRefs.players.onSnapshot(snapshot => { 
            STATE.players = snapshot.docs.map(doc => ({id: doc.id, ...doc.data()})); 
            playersLoaded = true;
            updateSetupSelect();
            
            const user = auth.getCurrentUser();
            if (user) checkUserLink(user); 
        }); 
    }
    if(window.colRefs.settings) { 
        window.colRefs.settings.doc('general').onSnapshot(doc => { 
            if(doc.exists) { 
                STATE.settings = doc.data(); 
                ui.renderCareTags(); 
                ui.updateCountdownUI(); 
            } else { ui.renderCareTags(); } 
        }); 
    }
    if(window.colRefs.goals) {
        window.colRefs.goals.onSnapshot(snapshot => {
            STATE.goals = {}; snapshot.forEach(doc => { STATE.goals[doc.id] = doc.data(); });
            if(STATE.currentUser) ui.renderPlayerGoal();
        });
    }
    if(window.colRefs.edu) {
        window.colRefs.edu.onSnapshot(snapshot => {
            STATE.education = [];
            snapshot.forEach(doc => { STATE.education.push({ id: doc.id, ...doc.data() }); });
            STATE.education.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
            const eduTab = document.getElementById('tab-education');
            if(eduTab && eduTab.classList.contains('active')) window.renderEducationList();
        });
    }
    
    // 💡 ログデータの取得: 過去60日間に制限 ＋ 過去データとの結合
    if(window.colRefs.logs) { 
        const logsQuery = window.colRefs.logs.where("date", ">=", dateLimitStr);
        logsQuery.onSnapshot(snapshot => { 
            const liveLogs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })); 
            
            // アーカイブ(過去)データと、リアルタイム(直近)データをマージして重複を排除
            const allLogsMap = new Map();
            STATE.archivedLogs.forEach(log => allLogsMap.set(log.id, log));
            liveLogs.forEach(log => allLogsMap.set(log.id, log));
            
            // 降順(新しい順)にソートしてSTATEに保存
            STATE.logs = Array.from(allLogsMap.values()).sort((a, b) => new Date(b.date) - new Date(a.date));
            
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
        const kudosQuery = window.colRefs.kudos.where("createdAt", ">=", timeLimitStr);
        kudosQuery.onSnapshot(snapshot => { 
            STATE.kudos = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })); 
            if (STATE.currentUser) { 
                updateGlobalNotifications(); ui.renderTeamActivities(handleSendKudos); 
            } 
        }); 
    }
    if(window.colRefs.broadcasts) { 
        const broadcastQuery = window.colRefs.broadcasts.where("createdAt", ">=", timeLimitStr);
        broadcastQuery.onSnapshot(snapshot => { 
            STATE.broadcasts = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)); 
            if (STATE.currentUser) { updateGlobalNotifications(); updateBroadcastBanner(); } 
        }); 
    }
}

// 💡 追加: 過去データをさらに読み込む機能
async function handleLoadOlderData() {
    if(window.HAPTIC) window.HAPTIC.light();
    const btn = document.getElementById('load-more-btn');
    if(btn) { btn.disabled = true; btn.textContent = '読み込み中...'; }
    
    // 現在持っているログの中で最も古い日付を取得
    let oldestDateStr = '';
    if(STATE.logs && STATE.logs.length > 0) {
        oldestDateStr = STATE.logs[STATE.logs.length - 1].date;
    } else {
        const d = new Date(); d.setDate(d.getDate() - 60);
        oldestDateStr = d.toISOString().split('T')[0];
    }
    
    // さらに60日前を計算
    const oldestDate = new Date(oldestDateStr);
    const targetDate = new Date(oldestDate);
    targetDate.setDate(targetDate.getDate() - 60);
    const targetDateStr = targetDate.toISOString().split('T')[0];
    
    try {
        if(!window.colRefs.logs) throw new Error("Database not initialized");
        
        // 過去60日分の範囲を指定して1度だけ取得 (get)
        const snapshot = await window.colRefs.logs
            .where("date", "<", oldestDateStr)
            .where("date", ">=", targetDateStr)
            .get();
            
        if(snapshot.empty) {
            window.UI.showToast("これ以上過去のデータはありません", "info");
            if(btn) { btn.style.display = 'none'; }
            return;
        }
        
        const olderLogs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        STATE.archivedLogs = [...STATE.archivedLogs, ...olderLogs];
        
        // ログの再構築
        const allLogsMap = new Map();
        STATE.archivedLogs.forEach(log => allLogsMap.set(log.id, log));
        STATE.logs.forEach(log => allLogsMap.set(log.id, log));
        STATE.logs = Array.from(allLogsMap.values()).sort((a, b) => new Date(b.date) - new Date(a.date));
        
        // UI更新
        ui.renderCalendar(handleDateSelect);
        const historyTab = document.getElementById('tab-history'); 
        if(historyTab && historyTab.classList.contains('active')) { 
            ui.renderPlayerHistory(); 
        }
        
        window.UI.showToast(`${olderLogs.length}件の過去データを読み込みました`, "success");
        if(btn) { btn.disabled = false; btn.textContent = '📥 さらに過去のデータを読み込む'; }
    } catch(e) {
        console.error(e);
        window.UI.showToast("データの読み込みに失敗しました", "error");
        if(btn) { btn.disabled = false; btn.textContent = '📥 さらに過去のデータを読み込む'; }
    }
}

function initMainAppUI() {
    ui.renderPlayerGoal(); 
    ui.renderCalendar(handleDateSelect); 
    ui.updateHeaderStreak();
    
    setTimeout(() => { 
        const dInput = document.getElementById('date'); 
        if (dInput) loadFormData(dInput.value); 
    }, 100);
    
    updateGlobalNotifications();
}

// ==========================================
// フォーム入力・UIイベント
// ==========================================
function setupEventListeners() {
    const elFatigue = document.getElementById('fatigue'); const elStress = document.getElementById('stress'); const elRpe = document.getElementById('rpe'); const elDuration = document.getElementById('duration');
    
    if(elFatigue) elFatigue.addEventListener('input', () => { if(window.HAPTIC) window.HAPTIC.light(); ui.updateFaceMeter('fatigue-display', elFatigue.value, 'fatigue'); refreshAdvicePre(); });
    if(elStress) elStress.addEventListener('input', () => { if(window.HAPTIC) window.HAPTIC.light(); ui.updateFaceMeter('stress-display', elStress.value, 'stress'); refreshAdvicePre(); });
    if(elRpe) elRpe.addEventListener('input', () => { if(window.HAPTIC) window.HAPTIC.light(); refreshLoadAndAdvicePost(); });
    if(elDuration) elDuration.addEventListener('input', refreshLoadAndAdvicePost);
    
    document.querySelectorAll('input[name="sleep-quality"], #sleep, #weight').forEach(el => { el.addEventListener('change', refreshAdvicePre); });
    const preInj = document.getElementById('injury-pre'); if(preInj) preInj.addEventListener('input', refreshAdvicePre); 
    const postInj = document.getElementById('injury'); if(postInj) postInj.addEventListener('input', refreshAdvicePostOnly); 
    const badInp = document.getElementById('bad'); if(badInp) badInp.addEventListener('input', refreshAdvicePostOnly);
    
    document.querySelectorAll('.tag-btn-pre').forEach(btn => {
        btn.addEventListener('click', function() { 
            if(window.HAPTIC) window.HAPTIC.light(); const part = this.getAttribute('data-part'); 
            if (STATE.sorenessPre.includes(part)) { STATE.sorenessPre = STATE.sorenessPre.filter(p => p !== part); this.classList.remove('selected'); } else { STATE.sorenessPre.push(part); this.classList.add('selected'); } 
            refreshAdvicePre(); 
        });
    });

    document.querySelectorAll('.tag-btn-post').forEach(btn => {
        btn.addEventListener('click', function() { 
            if(window.HAPTIC) window.HAPTIC.light(); const part = this.getAttribute('data-part'); 
            if (STATE.sorenessPost.includes(part)) { STATE.sorenessPost = STATE.sorenessPost.filter(p => p !== part); this.classList.remove('selected'); } else { STATE.sorenessPost.push(part); this.classList.add('selected'); } 
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
    const dur = parseFloat(document.getElementById('duration')?.value || 0); const rpe = parseFloat(document.getElementById('rpe')?.value || 0);
    ui.updateFaceMeter('rpe-display', rpe, 'rpe'); 
    const loadRes = document.getElementById('load-result'); if(loadRes) loadRes.textContent = (dur > 0 && rpe > 0) ? (dur * rpe).toFixed(1) : '-'; 
    refreshAdvicePostOnly();
}

function refreshAdvicePostOnly() {
    const loadRes = document.getElementById('load-result'); 
    const load = loadRes && loadRes.textContent !== '-' ? parseFloat(loadRes.textContent) : 0;
    
    const data = {
        load: load, rpe: parseFloat(document.getElementById('rpe')?.value || 0),
        injury: document.getElementById('injury')?.value || '', bad: document.getElementById('bad')?.value || ''
    };
    
    const score = logic.calcIrsScore('post', data, STATE.sorenessPost);
    ui.updateIRSUIDisplay('post', score);
    
    const sprintCount = document.querySelectorAll('.sprint-row').length;
    const advices = logic.generateAIAdvicePost(data, STATE.sorenessPost, sprintCount);
    ui.renderAIAdvice('post', advices);
}

function handleDateSelect(dateStr) {
    if(window.HAPTIC) window.HAPTIC.light(); 
    const dInput = document.getElementById('date'); if(dInput) dInput.value = dateStr; 
    ui.renderCalendar(handleDateSelect); 
    
    const parts = dateStr.split('-'); const displayStr = `${parts[1]}/${parts[2]}`; 
    const dispPre = document.getElementById('display-date-pre'); const dispPost = document.getElementById('display-date-post'); 
    if(dispPre) dispPre.textContent = `[ ${displayStr} ]`; if(dispPost) dispPost.textContent = `[ ${displayStr} ]`; 
    
    const log = STATE.logs.find(l => l.playerName === STATE.currentUser && l.date === dateStr); 
    ui.showDailySummary(dateStr, log, markCommentAsRead);
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
            document.querySelectorAll('.tag-btn-pre').forEach(btn => { if (STATE.sorenessPre.includes(btn.getAttribute('data-part'))) btn.classList.add('selected'); }); 
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
            document.querySelectorAll('.tag-btn-post').forEach(btn => { if (STATE.sorenessPost.includes(btn.getAttribute('data-part'))) btn.classList.add('selected'); }); 
        }
        
        if (log.care) { 
            const cares = log.care.split(' / ').map(c => c.trim()).filter(c => c !== 'null' && c !== ''); 
            document.querySelectorAll('.care-tag').forEach(btn => { if (cares.includes(btn.textContent)) { btn.classList.add('selected'); cares.splice(cares.indexOf(btn.textContent), 1); } }); 
            if (cares.length > 0 && cares[0] !== "") { const careEl = document.getElementById('care'); if(careEl) careEl.value = cares.join(' / '); } 
        }
    }
    
    if(fat) ui.updateFaceMeter('fatigue-display', fat.value, 'fatigue'); 
    if(str) ui.updateFaceMeter('stress-display', str.value, 'stress'); 
    if(rpe) ui.updateFaceMeter('rpe-display', rpe.value, 'rpe'); 
    calcLoad(); calcFv(); refreshAdvicePre(); refreshAdvicePostOnly();
}

function calcLoad() { 
    const durEl = document.getElementById('duration'); const rpeEl = document.getElementById('rpe'); 
    if(!durEl || !rpeEl) return; 
    const d = parseFloat(durEl.value) || 0; const r = parseFloat(rpeEl.value) || 0; 
    ui.updateFaceMeter('rpe-display', r, 'rpe'); 
    const loadRes = document.getElementById('load-result'); if(loadRes) loadRes.textContent = (d > 0 && r > 0) ? (d * r).toFixed(1) : '-'; 
    refreshAdvicePostOnly(); 
}

function calcFv() { 
    const t30El = document.getElementById('time-30m'); const t20El = document.getElementById('time-fly20m'); 
    if(!t30El || !t20El) return; 
    const t30 = parseFloat(t30El.value); const t20 = parseFloat(t20El.value); 
    const display = document.getElementById('fv-display'); const hiddenInput = document.getElementById('fv-result'); 
    
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
        const dInput = clone.querySelector('.sprint-dist-input'); const tInput = clone.querySelector('.sprint-time-input');
        if(dInput) dInput.value = dist;
        if(tInput) { tInput.value = time; setTimeout(() => checkSprintRank(tInput), 50); }
    }
    container.appendChild(clone);
}

function checkSprintRank(el) {
    refreshAdvicePostOnly();
    const row = el.closest('.sprint-row'); if (!row) return;
    const distInput = row.querySelector('.sprint-dist-input'); const timeInput = row.querySelector('.sprint-time-input'); const badgeEl = row.querySelector('.sprint-rank-badge');
    if(!distInput || !timeInput || !badgeEl) return;

    const dist = distInput.value; const time = parseFloat(timeInput.value);
    const rankInfo = logic.evaluateSprintRank(dist, time, STATE.logs, STATE.currentUser);
    if(rankInfo) {
        badgeEl.textContent = rankInfo.badge; badgeEl.title = rankInfo.title;
        if(rankInfo.isBest && window.HAPTIC) window.HAPTIC.success();
    } else {
        badgeEl.textContent = ''; badgeEl.title = '';
    }
}

// ==========================================
// コミュニケーション・通知系
// ==========================================
async function handleSendKudos(target, stamp, logDate) {
    if(window.HAPTIC) window.HAPTIC.medium(); 
    const sender = STATE.currentUser; if (!sender) return;
    const existingIndex = STATE.kudos.findIndex(k => k.logDate === logDate && k.target === target && k.sender === sender);
    const kudoData = { sender, target, stamp, logDate, isRead: false, createdAt: new Date().toISOString() };
    
    try {
        if (window.colRefs && window.colRefs.kudos) {
            if (existingIndex > -1) { 
                const docId = STATE.kudos[existingIndex].id; await window.colRefs.kudos.doc(docId).update({ stamp, isRead: false, createdAt: new Date().toISOString() }); 
            } else { await window.colRefs.kudos.add(kudoData); }
        }
        if(window.UI) window.UI.showToast(`${target}さんにエールを送りました！`, 'success'); 
        ui.renderTeamActivities(handleSendKudos);
    } catch(e) { if(window.UI) window.UI.showToast('送信に失敗しました', 'error'); }
}

function getMyBroadcasts() { return STATE.broadcasts.filter(b => b.target === 'ALL' || b.target === STATE.currentUserCategory); }
function getUnreadBroadcasts() { const myBroadcasts = getMyBroadcasts(); return myBroadcasts.filter(b => !(b.readBy && b.readBy.includes(STATE.currentUser))); }
function getUnreadComments() { return STATE.logs.filter(log => log.playerName === STATE.currentUser && log.coachComment && !log.playerReadComment); }

function updateGlobalNotifications() {
    const unreadBroadcasts = getUnreadBroadcasts();
    const unreadComments = getUnreadComments();
    const unreadKudos = STATE.kudos.filter(k => k.target === STATE.currentUser && !k.isRead);
    
    const totalUnread = unreadBroadcasts.length + unreadComments.length + unreadKudos.length;
    ui.updateNotificationBadge(totalUnread);
}

function updateBroadcastBanner() {
    const unreadBroadcasts = getUnreadBroadcasts(); 
    const banner = document.getElementById('broadcast-banner'); 
    if(!banner) return;
    
    if (unreadBroadcasts.length === 0) { banner.style.display = 'none'; return; }
    
    unreadBroadcasts.sort((a, b) => { 
        const lScore = { 'danger': 3, 'warning': 2, 'info': 1 }; 
        const scoreA = lScore[a.level || 'info'] || 1; 
        const scoreB = lScore[b.level || 'info'] || 1; 
        if (scoreA !== scoreB) return scoreB - scoreA; 
        return new Date(b.createdAt) - new Date(a.createdAt); 
    });
    
    const topMsg = unreadBroadcasts[0]; 
    const levelDef = window.CONSTANTS.LEVELS[topMsg.level || 'info'];
    banner.className = `broadcast-banner ${levelDef.bgClass}`; 
    const bBadge = document.getElementById('broadcast-level-badge'); 
    if(bBadge) { bBadge.className = `b-badge ${levelDef.bgClass}`; bBadge.textContent = levelDef.label; }
    const bTitle = document.getElementById('broadcast-title'); if(bTitle) bTitle.textContent = topMsg.title; 
    const bMsg = document.getElementById('broadcast-message'); if(bMsg) bMsg.textContent = topMsg.message;
    const btn = document.getElementById('broadcast-confirm-btn'); if(btn) btn.onclick = () => markBroadcastAsRead(topMsg.id);
    banner.style.display = 'block';
}

async function markBroadcastAsRead(broadcastId) { 
    const banner = document.getElementById('broadcast-banner'); 
    if(banner) banner.style.display = 'none'; 
    if (!window.colRefs.broadcasts) return; 
    try { await window.colRefs.broadcasts.doc(broadcastId).update({ readBy: firebase.firestore.FieldValue.arrayUnion(STATE.currentUser) }); } catch (e) { console.error(e); } 
}

async function markCommentAsRead(dateStr) { 
    if (!window.colRefs.logs) return; 
    const docId = `${STATE.currentUser}_${dateStr}`; 
    try { await window.colRefs.logs.doc(docId).update({ playerReadComment: true }); } catch (e) { console.error(e); } 
}

async function markKudosAsRead() {
    const unread = STATE.kudos.filter(k => k.target === STATE.currentUser && !k.isRead);
    unread.forEach(async k => {
        if(window.colRefs.kudos) { try { await window.colRefs.kudos.doc(k.id).update({ isRead: true }); } catch(e){} } 
    });
}

function renderNotifications() {
    const broadcastContainer = document.getElementById('notification-broadcast-list'); const commentContainer = document.getElementById('notification-comment-list'); const kudosContainer = document.getElementById('notification-kudos-list');
    
    if(broadcastContainer) {
        broadcastContainer.innerHTML = ''; const myBroadcasts = getMyBroadcasts();
        if (myBroadcasts.length === 0) { broadcastContainer.innerHTML = '<div style="font-size:14px; color:var(--text-muted); text-align:center; font-weight:bold;">お知らせはありません</div>'; } 
        else { myBroadcasts.forEach(b => { 
            const isRead = b.readBy && b.readBy.includes(STATE.currentUser); 
            const div = document.createElement('div'); div.className = `noti-item ${isRead ? '' : 'unread'}`; 
            const d = new Date(b.createdAt); const timeStr = `${d.getMonth()+1}/${d.getDate()} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`; 
            const levelDef = window.CONSTANTS.LEVELS[b.level || 'info']; 
            div.innerHTML = `<div class="flex-between mb-2"><span class="b-badge ${levelDef.bgClass}" style="margin:0; font-size:11px; padding:3px 8px;">${levelDef.label}</span><span style="font-size:12px; font-weight:bold; color:var(--text-muted);">${timeStr}</span></div><h4 style="margin:0 0 6px 0; font-size:16px; color:var(--text-main); font-weight:900;">${b.title}</h4><p style="margin:0; font-size:14px; color:var(--text-main); white-space:pre-wrap; font-weight:500;">${b.message}</p>${!isRead ? `<button class="btn-sync mt-3 w-full justify-center" onclick="markBroadcastAsRead('${b.id}'); setTimeout(()=>renderNotifications(), 500);">確認済みにする</button>` : ''}`; 
            broadcastContainer.appendChild(div); 
        }); }
    }
    
    if(commentContainer) {
        commentContainer.innerHTML = ''; const myLogsWithComments = STATE.logs.filter(log => log.playerName === STATE.currentUser && log.coachComment);
        if (myLogsWithComments.length === 0) { commentContainer.innerHTML = '<div style="font-size:14px; color:var(--text-muted); text-align:center; font-weight:bold;">フィードバックはまだありません</div>'; } 
        else { myLogsWithComments.sort((a, b) => { const dateA = a.coachComment.updatedAt ? new Date(a.coachComment.updatedAt) : new Date(a.date); const dateB = b.coachComment.updatedAt ? new Date(b.coachComment.updatedAt) : new Date(b.date); return dateB - dateA; }); 
        myLogsWithComments.forEach(log => { 
            const div = document.createElement('div'); div.className = `noti-item`; const parts = log.date.split('-'); const dateStr = `${parts[1]}/${parts[2]}`; 
            div.innerHTML = `<div class="flex-between" style="border-bottom:1px dashed var(--border-color); padding-bottom:8px; margin-bottom:12px;"><span style="font-size:13px; font-weight:900; color:var(--primary);">${dateStr} の記録について</span><button style="background:var(--card-bg); border:1px solid var(--border-color); border-radius:6px; font-size:12px; padding:4px 8px; cursor:pointer; color:var(--text-muted); font-weight:bold;" onclick="closeNotificationModal(); handleDateSelect('${log.date}');">詳細を見る</button></div><div style="display:flex; gap:14px; align-items:flex-start;"><div style="font-size:36px; line-height:1; text-shadow:0 2px 4px rgba(0,0,0,0.1);">${log.coachComment.stamp || ''}</div><div style="font-size:14px; color:var(--text-main); font-weight:600; white-space:pre-wrap; padding-top:6px;">${log.coachComment.text || ''}</div></div>`; 
            commentContainer.appendChild(div); 
        }); }
    }
    
    if(kudosContainer) { 
        kudosContainer.innerHTML = ''; const myKudos = STATE.kudos.filter(k => k.target === STATE.currentUser); 
        if (myKudos.length === 0) { kudosContainer.innerHTML = '<div style="font-size:14px; color:var(--text-muted); text-align:center; font-weight:bold;">もらったKudosはまだありません</div>'; } 
        else { myKudos.sort((a,b) => new Date(b.createdAt) - new Date(a.createdAt)).forEach(k => { 
            const div = document.createElement('div'); div.className = `noti-item ${k.isRead ? '' : 'unread'}`; 
            const d = new Date(k.createdAt); const timeStr = `${d.getMonth()+1}/${d.getDate()} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`; 
            div.innerHTML = `<div class="flex-between mb-2"><span style="font-size:14px; font-weight:900; color:var(--primary);">👏 Kudos!</span><span style="font-size:12px; font-weight:bold; color:var(--text-muted);">${timeStr}</span></div><div style="font-size:15px; color:var(--text-main); font-weight:800; display:flex; align-items:center; gap:8px;"><span style="font-size:24px;">${k.stamp}</span> <span>${k.sender} さんからエールが届きました！</span></div>`; 
            kudosContainer.appendChild(div); 
        }); } 
    }
}

function openNotificationModal() { 
    const mod = document.getElementById('notification-modal'); 
    if(mod) mod.style.display = 'flex'; 
    renderNotifications(); 
    const unreadComments = getUnreadComments(); 
    unreadComments.forEach(log => markCommentAsRead(log.date)); 
    markKudosAsRead(); 
    const badge = document.getElementById('notification-badge'); 
    if(badge) badge.style.display = 'none'; 
}

function closeNotificationModal() { 
    const mod = document.getElementById('notification-modal'); 
    if(mod) mod.style.display = 'none'; 
    updateGlobalNotifications(); 
    updateBroadcastBanner(); 
}

function handleEditGoal(type) {
    const playerName = STATE.currentUser; 
    if (!playerName) { window.UI.showToast("ログインし直してください！", "error"); return; }
    const goalData = STATE.goals[playerName] || {}; 
    const currentGoal = type === 'season' ? (goalData.seasonGoal || "") : (goalData.monthGoal || ""); 
    const title = type === 'season' ? "今シーズンの目標" : "今月の目標・テーマ"; 
    const desc = "目標を設定してモチベーションを高めよう！";
    window.UI.showPrompt(title, desc, currentGoal, async (newGoal) => {
        const updateData = { updatedAt: new Date().toISOString() }; 
        if (type === 'season') updateData.seasonGoal = newGoal; 
        else updateData.monthGoal = newGoal;
        try { 
            if (window.colRefs.goals) { 
                await window.colRefs.goals.doc(playerName).set(updateData, { merge: true }); 
            } else { 
                STATE.goals[playerName] = { ...goalData, ...updateData }; 
                localStorage.setItem('team_goals', JSON.stringify(STATE.goals)); 
                ui.renderPlayerGoal(); 
            } 
            window.UI.showToast("目標を更新しました！", "success"); 
        } catch (e) { window.UI.showToast("目標の保存に失敗しました。", "error"); }
    });
}

// ==========================================
// 天気・リマインダー
// ==========================================
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

function toggleNotifications(checkbox) {
    const statusText = document.getElementById('notification-status'); 
    if(!statusText) return;
    if(checkbox.checked) {
        statusText.style.display = 'block'; 
        if (!("Notification" in window)) { 
            window.UI.showToast("ブラウザが通知非対応です。", "error"); 
            checkbox.checked = false; return; 
        }
        Notification.requestPermission().then(permission => {
            if (permission === "granted") { 
                statusText.textContent = "✅ 通知が許可されました！"; 
                localStorage.setItem('reminder_enabled', 'true'); 
                new Notification("AthleSense", { body: "通知設定が完了しました！", icon: "icon.png" }); 
            } else { 
                statusText.textContent = "❌ 通知がブロックされました。"; 
                checkbox.checked = false; 
            }
        });
    } else { 
        statusText.style.display = 'none'; 
        localStorage.setItem('reminder_enabled', 'false'); 
    }
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
window.handleEmailLogin = handleEmailLogin;
window.handleEmailRegister = handleEmailRegister;
window.handleGoogleLogin = handleGoogleLogin;
window.handleLinkPlayer = handleLinkPlayer;
window.handleLogout = handleLogout;
window.handleLoadOlderData = handleLoadOlderData; // 💡 追加
window.saveData = form.saveData;
window.switchTab = switchTab;
window.toggleTheme = toggleTheme;
window.addSprintRow = addSprintRow;
window.checkSprintRank = checkSprintRank;
window.handleDateSelect = handleDateSelect;
window.calcFv = calcFv;
window.handleSyncDeviceData = (name) => { if(window.UI) window.UI.showToast(`${name}の自動取得は開発準備中です。`, "warning"); };

window.filterEducation = ui.filterEducation;
window.renderPlayerHistory = ui.renderPlayerHistory;
window.changeMonth = (step) => ui.changeMonth(step, handleDateSelect);
window.closeDailySummary = ui.closeDailySummary;
window.editDailyData = () => ui.editDailyData(loadFormData);
window.handleEditGoal = handleEditGoal;
window.openNotificationModal = openNotificationModal;
window.closeNotificationModal = closeNotificationModal;
window.toggleNotifications = toggleNotifications;
window.refreshAdvicePostOnly = refreshAdvicePostOnly;
window.markBroadcastAsRead = markBroadcastAsRead;
window.renderNotifications = renderNotifications;
window.renderEducationList = ui.renderEducationList;

// 起動
document.addEventListener('DOMContentLoaded', initApp);
