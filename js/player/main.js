// ==========================================
// 📌 選手用 メインコントローラー (Main)
// 初期化、イベント連携、全体のデータフローを制御します
// ==========================================

import { STATE } from './state.js';
import * as logic from './logic.js';
import * as ui from './ui.js';

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
    fetchWeather(); // HTML内のfetchWeather関数を呼び出し(既存のHTMLにベタ書きされているか、別途移行を推奨)
    checkReminders(); // 通知チェック

    try {
        // firebase-init.js で定義された初期化処理が実行済みであることを想定
        if(window.colRefs) {
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
    const savedUser = localStorage.getItem('currentUser');
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
    if(window.HAPTIC) window.HAPTIC.medium(); 
    const selectEl = document.getElementById('login-player-select');
    const selectedPlayer = selectEl ? selectEl.value : null;
    if (!selectedPlayer) { 
        window.UI.showToast("名前を選択してください。", "warning"); return; 
    }
    localStorage.setItem('currentUser', selectedPlayer);
    window.UI.showToast(`${selectedPlayer} さん、こんにちは！`, "success"); 
    checkLoginStatus();
}

function handleLogout() { 
    window.UI.showConfirm("ログアウトしますか？", () => { 
        localStorage.removeItem('currentUser'); 
        location.reload(); 
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
    // 残りのリスナー(goals, edu, broadcasts, kudos)も同様にSTATEへ反映する処理をバインド
}

function loadLocalData() {
    STATE.players = JSON.parse(localStorage.getItem('team_players') || '[]'); 
    ui.updateLoginSelect();
    STATE.logs = JSON.parse(localStorage.getItem('team_condition_logs') || '[]').sort((a, b) => new Date(b.date) - new Date(a.date));
    STATE.settings = JSON.parse(localStorage.getItem('team_settings') || '{}'); 
    
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
    
    // タグ選択のバインディング
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
    
    // スプリント行の数を取得
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
    
    const log = STATE.logs.find(l => l.playerName === STATE.currentUser && l.date === dateStr); 
    // showDailySummary(dateStr, log); // 元のHTMLにあったモーダル表示関数
}

async function handleSendKudos(target, stamp, logDate) {
    if(window.HAPTIC) window.HAPTIC.medium(); 
    const sender = STATE.currentUser; 
    if (!sender) return;
    const existingIndex = STATE.kudos.findIndex(k => k.logDate === logDate && k.target === target && k.sender === sender);
    const kudoData = { sender, target, stamp, logDate, isRead: false, createdAt: new Date().toISOString() };
    
    try {
        if (window.colRefs.kudos) {
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
        window.UI.showToast(`${target}さんにエールを送りました！`, 'success'); 
        ui.renderTeamActivities(handleSendKudos);
    } catch(e) { 
        window.UI.showToast('送信に失敗しました', 'error'); 
    }
}

// 通知更新のユーティリティ
function updateGlobalNotifications() {
    // 未読件数を計算して ui.updateNotificationBadge() を呼ぶなどの処理
    // 省略：元HTMLのロジックに準拠
}

// ==========================================
// グローバル空間へのエクスポート
// (HTML内の onclick 等から呼び出せるようにする)
// ==========================================
window.handleLogin = handleLogin;
window.handleLogout = handleLogout;
// 他にも必要に応じて saveData, switchTab, toggleTheme などをバインドします

// 初期化処理の実行
document.addEventListener('DOMContentLoaded', initApp);
