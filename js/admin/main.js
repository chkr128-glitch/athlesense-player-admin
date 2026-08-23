import { STATE } from './state.js';
import * as logic from './logic.js';
import * as ui from './ui.js';
import * as charts from './charts.js';
import * as auth from '../common/auth.js';

// --- 共通モジュールのインポート ---
import { CONSTANTS } from '../common/constants.js';
import { HAPTIC, UI } from '../common/utils.js';
import { initFirebase, db, colRefs } from '../common/firebase-init.js';

// グローバルスコープへ紐付け
window.CONSTANTS = CONSTANTS;
window.HAPTIC = HAPTIC;
window.UI = UI;

let isAppInitialized = false;

// 💡 アーカイブ用のログ保持配列
STATE.archivedLogs = [];

// ==========================================
// 初期化プロセス
// ==========================================
async function initApp() {
    setDefaultDates();
    if (localStorage.getItem('theme') === 'dark') { 
        document.body.classList.add('dark-mode'); 
        document.getElementById('theme-toggle').innerHTML = '☀️';
    }

    const isFirebaseInitialized = await initFirebase(CONSTANTS);
    if (isFirebaseInitialized) {
        window.db = db;
        window.colRefs = colRefs;
        
        // 認証状態の監視開始
        auth.onAuthChange(user => {
            checkAdminStatus(user);
        });
    } else {
        window.UI.showToast("通信エラー: Firebaseが初期化できませんでした", "error");
        showScreen('auth-screen');
    }
}

function setDefaultDates() {
    const today = new Date().toISOString().split('T')[0];
    const targetDateEl = document.getElementById('target-date');
    if (targetDateEl) targetDateEl.value = today;
    const ym = today.substring(0, 7);
    const reportMonthEl = document.getElementById('report-month-select');
    if (reportMonthEl) reportMonthEl.value = ym;
}

// ==========================================
// 認証・ルーティング・キーコード検証
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
}

async function checkAdminStatus(user) {
    if (!user) {
        showScreen('auth-screen');
        return;
    }
    
    showScreen('loading-screen');
    
    try {
        // 管理者名簿(admin_users)に登録されているか確認
        const doc = await window.colRefs.adminUsers.doc(user.uid).get();
        if (doc.exists) {
            // 登録済み -> ダッシュボードへ
            showScreen('main-app');
            if (!isAppInitialized) {
                initMainApp();
                isAppInitialized = true;
            }
        } else {
            // 未登録 -> キーコード入力画面へ
            showScreen('setup-screen');
        }
    } catch(e) {
        console.error(e);
        window.UI.showToast("権限の確認に失敗しました", "error");
        showScreen('auth-screen');
    }
}

async function handleVerifyKeyCode() {
    if(window.HAPTIC) window.HAPTIC.medium();
    const inputCode = document.getElementById('admin-keycode').value;
    if (!inputCode) {
        window.UI.showToast("キーコードを入力してください", "warning");
        return;
    }
    
    const user = auth.getCurrentUser();
    if (!user) return;
    
    try {
        // Firebaseから正解のキーコードを取得
        const secretDoc = await window.colRefs.settings.doc('secrets').get();
        const correctCode = secretDoc.exists ? secretDoc.data().adminKeyCode : null;
        
        if (!correctCode) {
            window.UI.showToast("システムエラー: データベースにキーコードが設定されていません", "error");
            return;
        }
        
        if (inputCode === correctCode) {
            // 正解: 管理者名簿に登録
            await window.colRefs.adminUsers.doc(user.uid).set({
                email: user.email,
                createdAt: new Date().toISOString()
            });
            window.UI.showToast("管理者権限を取得しました！🚀", "success");
            
            showScreen('main-app');
            if (!isAppInitialized) {
                initMainApp();
                isAppInitialized = true;
            }
        } else {
            window.UI.showToast("キーコードが間違っています", "error");
            document.getElementById('admin-keycode').value = '';
        }
    } catch(e) {
        window.UI.showToast("エラーが発生しました: " + e.message, "error");
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
    if(!res.success) window.UI.showToast(getAuthErrorMessage(res.error), 'error');
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
        // onAuthChangeにより自動で auth-screen へ遷移します
    }); 
}

// ==========================================
// データフロー・Firebase購読
// ==========================================
function initMainApp() {
    document.getElementById('connection-status').textContent = 'クラウド同期中';
    document.getElementById('connection-status').className = 'status-badge status-cloud';
    setupListeners();
}

function setupListeners() {
    // 💡 取得するデータの期間を「過去60日分」に制限
    const limitDate = new Date();
    limitDate.setDate(limitDate.getDate() - 60);
    const dateLimitStr = `${limitDate.getFullYear()}-${String(limitDate.getMonth()+1).padStart(2,'0')}-${String(limitDate.getDate()).padStart(2,'0')}`;
    const timeLimitStr = limitDate.toISOString();

    if(window.colRefs.players) {
        window.colRefs.players.onSnapshot(snapshot => {
            STATE.players = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            STATE.players.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
            ui.renderPlayersList(STATE.players, deletePlayer);
            updateAdminUI();
        });
    }

    // 💡 ログデータの取得: 過去60日間に制限 ＋ 過去データとの結合
    if(window.colRefs.logs) {
        const logsQuery = window.colRefs.logs.where("date", ">=", dateLimitStr);
        logsQuery.onSnapshot(snapshot => {
            const liveLogs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            
            // アーカイブ(過去)データと、リアルタイム(直近)データをマージして重複を排除
            const allLogsMap = new Map();
            (STATE.archivedLogs || []).forEach(log => allLogsMap.set(log.id, log));
            liveLogs.forEach(log => allLogsMap.set(log.id, log));
            
            // 降順(新しい順)にソートしてSTATEに保存
            STATE.logs = Array.from(allLogsMap.values()).sort((a, b) => new Date(b.date) - new Date(a.date));
            
            updateAdminUI();
        });
    }
    
    // お知らせの取得: 過去60日間に制限
    if(window.colRefs.broadcasts) {
        const broadcastQuery = window.colRefs.broadcasts.where("createdAt", ">=", timeLimitStr);
        broadcastQuery.onSnapshot(snapshot => {
            STATE.broadcasts = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            STATE.broadcasts.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
            const modal = document.getElementById('broadcast-list-modal');
            if (modal && modal.style.display === 'flex') ui.renderBroadcastList(STATE.broadcasts, STATE.players, deleteBroadcast);
        });
    }
    
    if(window.colRefs.settings) {
        window.colRefs.settings.doc('general').onSnapshot(doc => {
            if(doc.exists) {
                STATE.settings = doc.data();
                STATE.careOptions = STATE.settings.careOptions || window.CONSTANTS.DEFAULT_CARES;
                const viewCare = document.getElementById('view-careSettings');
                if (viewCare && viewCare.style.display === 'block') ui.renderCareOptions(STATE.careOptions, deleteCareOption);
                updateCountdownUI();
            } else {
                STATE.careOptions = window.CONSTANTS.DEFAULT_CARES;
            }
        });
    }

    if(window.colRefs.goals) {
        window.colRefs.goals.onSnapshot(snapshot => {
            STATE.goals = {}; 
            snapshot.forEach(doc => { STATE.goals[doc.id] = doc.data(); });
            const viewGoals = document.getElementById('view-goals');
            if (viewGoals && viewGoals.style.display === 'block') renderGoalsTable();
        });
    }
    
    if(window.colRefs.edu) {
        window.colRefs.edu.onSnapshot(snapshot => {
            STATE.education = []; 
            snapshot.forEach(doc => { STATE.education.push({ id: doc.id, ...doc.data() }); });
            STATE.education.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
            const viewEdu = document.getElementById('view-education');
            if (viewEdu && viewEdu.style.display === 'block') renderEducationTable();
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
        STATE.archivedLogs = [...(STATE.archivedLogs || []), ...olderLogs];
        
        // ログの再構築
        const allLogsMap = new Map();
        STATE.archivedLogs.forEach(log => allLogsMap.set(log.id, log));
        STATE.logs.forEach(log => allLogsMap.set(log.id, log));
        STATE.logs = Array.from(allLogsMap.values()).sort((a, b) => new Date(b.date) - new Date(a.date));
        
        // UI（グラフや表）の更新
        updateAdminUI();
        
        window.UI.showToast(`${olderLogs.length}件の過去データを読み込みました`, "success");
        if(btn) { btn.disabled = false; btn.textContent = '📥 さらに過去のデータをクラウドから読み込む'; }
    } catch(e) {
        console.error(e);
        window.UI.showToast("データの読み込みに失敗しました", "error");
        if(btn) { btn.disabled = false; btn.textContent = '📥 さらに過去のデータをクラウドから読み込む'; }
    }
}

function loadLocalData() {
    STATE.players = JSON.parse(localStorage.getItem('team_players') || '[]');
    STATE.logs = JSON.parse(localStorage.getItem('team_condition_logs') || '[]');
    STATE.logs.sort((a, b) => new Date(b.date) - new Date(a.date));
    STATE.settings = JSON.parse(localStorage.getItem('team_settings') || '{}');
    STATE.broadcasts = JSON.parse(localStorage.getItem('team_broadcasts') || '[]');
    STATE.goals = JSON.parse(localStorage.getItem('team_goals') || '{}');
    STATE.education = JSON.parse(localStorage.getItem('team_education') || '[]');
    
    ui.renderPlayersList(STATE.players, deletePlayer); 
    updateAdminUI(); 
    updateCountdownUI();
}

function updateCountdownUI() {
    const banner = document.getElementById('countdown-banner');
    if (!banner) return;
    if (!STATE.settings || !STATE.settings.targetEventDate) {
        banner.style.display = 'none'; return;
    }
    const today = new Date(); today.setHours(0,0,0,0);
    const target = new Date(STATE.settings.targetEventDate + 'T00:00:00'); target.setHours(0,0,0,0);
    const diffDays = Math.ceil((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

    // 管理者画面でのデザイン崩れを防止するためのスタイル補正
    banner.style.display = 'flex';
    banner.style.alignItems = 'center';
    banner.style.justifyContent = 'center';
    banner.style.gap = '12px';
    banner.style.padding = '16px';
    banner.style.borderRadius = '12px';
    banner.style.color = 'white';
    banner.style.fontWeight = '900';
    banner.style.fontSize = '18px';
    banner.style.marginBottom = '20px';
    banner.style.boxShadow = '0 4px 12px rgba(249, 115, 22, 0.3)';

    if (diffDays > 0) {
        banner.style.background = 'linear-gradient(135deg, var(--secondary, #f97316), var(--secondary-dark, #ea580c))';
        banner.innerHTML = `🏆 ${STATE.settings.targetEventName || '大会'}まで あと <span class="days" style="font-size:32px; font-weight:900; background:white; color:var(--secondary-dark, #ea580c); padding:4px 12px; border-radius:8px; margin: 0 4px; box-shadow:inset 0 2px 4px rgba(0,0,0,0.2);">${diffDays}</span> 日！`;
    } else if (diffDays === 0) {
        banner.style.background = 'linear-gradient(135deg, #10b981, #059669)';
        banner.innerHTML = `🔥 本日は ${STATE.settings.targetEventName || '大会'} 当日です！健闘を祈ります！`;
    } else {
        banner.style.display = 'none'; 
    }
}

function updateAdminUI() {
    ui.updatePeriodFilterOptions(STATE.logs); 
    ui.updatePlayerSelect(STATE.players); 
    filterAndRenderTable(); 
    updateTodayView();
}

// ==========================================
// データの描画と操作
// ==========================================
function filterAndRenderTable() {
    const periodFilter = document.getElementById('period-filter') ? document.getElementById('period-filter').value : 'all';
    const searchInput = document.getElementById('search-input') ? document.getElementById('search-input').value.toLowerCase() : '';
    
    STATE.filteredLogs = logic.filterLogs(STATE.logs, periodFilter, searchInput);
    
    ui.renderTableData(STATE.filteredLogs, 'history-table-body', true, STATE.players, deleteLog, openCommentModal, openDetailModal);
    
    const viewIndividual = document.getElementById('view-individual'); 
    if (viewIndividual && viewIndividual.style.display === 'block') updateCharts();
    
    const viewTeamTrend = document.getElementById('view-teamTrend'); 
    if (viewTeamTrend && viewTeamTrend.style.display === 'block') charts.drawTeamTrendChart(STATE.filteredLogs);
    
    const viewHeatmap = document.getElementById('view-heatmap'); 
    if (viewHeatmap && viewHeatmap.style.display === 'block') ui.updateHeatmap(STATE.filteredLogs);
    
    const viewSprint = document.getElementById('view-sprint'); 
    if (viewSprint && viewSprint.style.display === 'block') ui.updateSprintRanking(STATE.filteredLogs, STATE.players);
    
    const viewFv = document.getElementById('view-fv'); 
    if (viewFv && viewFv.style.display === 'block') ui.updateFvGrouping(STATE.filteredLogs);
}

function updateTodayView() {
    const targetDateEl = document.getElementById('target-date');
    if (!targetDateEl) return;
    const targetDateStr = targetDateEl.value;
    const todayLogs = STATE.logs.filter(log => log.date === targetDateStr);
    const expectedPlayers = STATE.players.map(p => p.name);
    
    ui.updateTodayDashboard(targetDateStr, todayLogs, expectedPlayers, STATE.logs);
    ui.renderTableData(todayLogs, 'today-table-body', false, STATE.players, deleteLog, openCommentModal, openDetailModal);
}

function updateCharts() {
    const selectEl = document.getElementById('chart-player-select');
    if(selectEl) {
        charts.updateIndividualAnalysis(selectEl.value, STATE.filteredLogs, STATE.logs);
    }
}

async function addCareOption() {
    const val = document.getElementById('new-care-input').value.trim();
    if(!val) return;
    const newOptions = [...STATE.careOptions, val];
    if(window.colRefs && window.colRefs.settings) await window.colRefs.settings.doc('general').set({ careOptions: newOptions }, { merge: true });
    document.getElementById('new-care-input').value = '';
}

function deleteCareOption(index) {
    if(window.UI) {
        window.UI.showConfirm("削除しますか？", async () => {
            const newOptions = [...STATE.careOptions]; 
            newOptions.splice(index, 1);
            if(window.colRefs && window.colRefs.settings) await window.colRefs.settings.doc('general').set({ careOptions: newOptions }, { merge: true });
            window.UI.showToast("削除しました", "success");
        });
    }
}

function addPlayer() {
    const input = document.getElementById('new-player-name'); 
    const catInput = document.getElementById('new-player-category');
    const name = input.value.trim(); 
    if (!name) return;
    if (STATE.players.some(p => p.name === name)) { 
        if(window.UI) window.UI.showToast('登録済みです', 'warning'); 
        return; 
    }
    const data = { name: name, category: catInput.value, createdAt: new Date().toISOString() };
    if (window.colRefs && window.colRefs.players) window.colRefs.players.add(data);
    input.value = ''; 
    if(window.UI) window.UI.showToast("選手を追加しました", "success");
}

function deletePlayer(id) { 
    if(window.UI) {
        window.UI.showConfirm("削除しますか？", () => { 
            if (window.colRefs && window.colRefs.players) window.colRefs.players.doc(id).delete(); 
            window.UI.showToast("削除しました", "success"); 
        }); 
    }
}

function renderGoalsTable() {
    const tbody = document.getElementById('goals-table-body'); 
    if (!tbody) return; 
    tbody.innerHTML = '';
    if (STATE.players.length === 0) { 
        tbody.innerHTML = '<tr><td colspan="3" style="text-align:center; font-weight:800; color:var(--text-muted); padding:30px;">選手が登録されていません。</td></tr>'; 
        return; 
    }

    STATE.players.forEach(player => {
        const tr = document.createElement('tr');
        const catBadge = ui.getCategoryBadge(player.category || 'BLUE');
        const goalData = STATE.goals[player.name] || {};
        const seasonGoal = goalData.seasonGoal || '<span style="color:var(--text-muted);">未設定</span>';
        const monthGoal = goalData.monthGoal || '<span style="color:var(--text-muted);">未設定</span>';

        tr.innerHTML = `
            <td style="font-weight:900; font-size:15px; display:flex; align-items:center;">${catBadge}${player.name}</td>
            <td><div class="flex-between"><div style="white-space:pre-wrap; font-size:14px; font-weight:800; color:var(--secondary);">${seasonGoal}</div><button onclick="editGoalAdmin('${player.name}', 'season')" style="background:none; border:none; color:var(--primary); cursor:pointer; font-size:18px; padding:0; transition:transform 0.2s;">✎</button></div></td>
            <td><div class="flex-between"><div style="white-space:pre-wrap; font-size:14px; font-weight:800; color:var(--primary);">${monthGoal}</div><button onclick="editGoalAdmin('${player.name}', 'month')" style="background:none; border:none; color:var(--secondary); cursor:pointer; font-size:18px; padding:0; transition:transform 0.2s;">✎</button></div></td>
        `;
        tbody.appendChild(tr);
    });
}

function editGoalAdmin(playerName, type) {
    const goalData = STATE.goals[playerName] || {};
    const currentGoal = type === 'season' ? (goalData.seasonGoal || "") : (goalData.monthGoal || "");
    const title = type === 'season' ? "今シーズンの目標" : "今月の目標・テーマ";
    
    if(window.UI) {
        window.UI.showPrompt(`【${playerName}】選手の ${title} を設定：`, "", currentGoal, async (newGoal) => {
            const updateData = { updatedAt: new Date().toISOString() };
            if (type === 'season') updateData.seasonGoal = newGoal; else updateData.monthGoal = newGoal;
            try {
                if (window.colRefs && window.colRefs.goals) await window.colRefs.goals.doc(playerName).set(updateData, { merge: true });
                window.UI.showToast("目標を更新しました", "success");
            } catch (e) { 
                window.UI.showToast("保存に失敗しました。", "error"); 
            }
        });
    }
}

async function saveTeamSettings() {
    const name = document.getElementById('target-event-name').value.trim();
    const dateStr = document.getElementById('target-event-date').value;
    const updateData = { targetEventName: name, targetEventDate: dateStr, updatedAt: new Date().toISOString() };
    try {
        if (window.colRefs && window.colRefs.settings) await window.colRefs.settings.doc('general').set(updateData, { merge: true });
        if(window.UI) window.UI.showToast('チームの目標大会を設定しました！', "success");
    } catch(e) { 
        if(window.UI) window.UI.showToast('保存に失敗しました。', "error"); 
    }
}

async function addEducation() {
    const title = document.getElementById('edu-title').value.trim(); 
    const category = document.getElementById('edu-category').value;
    const url = document.getElementById('edu-url').value.trim(); 
    const desc = document.getElementById('edu-desc').value.trim();
    
    if (!title) { 
        if(window.UI) window.UI.showToast('タイトルを入力してください。', "warning"); 
        return; 
    }
    const data = { title: title, category: category, url: url, description: desc, createdAt: new Date().toISOString() };
    try {
        if (window.colRefs && window.colRefs.edu) await window.colRefs.edu.add(data);
        document.getElementById('edu-title').value = ''; 
        document.getElementById('edu-url').value = ''; 
        document.getElementById('edu-desc').value = '';
        if(window.UI) window.UI.showToast('コンテンツを追加しました！', "success");
    } catch (e) { 
        if(window.UI) window.UI.showToast('追加に失敗しました。', "error"); 
    }
}

function renderEducationTable() {
    const tbody = document.getElementById('education-table-body'); 
    if(!tbody) return; 
    tbody.innerHTML = '';
    
    if (STATE.education.length === 0) { 
        tbody.innerHTML = '<tr><td colspan="3" style="text-align:center; font-weight:800; color:var(--text-muted); padding:30px;">コンテンツがありません。</td></tr>'; 
        return; 
    }
    STATE.education.forEach(item => {
        const tr = document.createElement('tr');
        const ytLink = item.url ? `<a href="${item.url}" target="_blank" style="color:var(--primary); font-size:13px; display:inline-block; margin-top:8px; font-weight:900;">🔗 リンクを開く</a>` : '';
        tr.innerHTML = `
            <td><span class="status-badge" style="background:var(--secondary-alpha); color:var(--secondary); margin:0;">${item.category}</span></td>
            <td><strong style="color:var(--secondary); font-size:15px;">${item.title}</strong><br><span style="font-size:13px; color:var(--text-main); white-space:pre-wrap; font-weight:600; display:block; margin-top:4px;">${item.description}</span>${ytLink}</td>
            <td style="text-align:center;"><button class="btn btn-danger" style="padding: 8px 12px; font-size:12px; box-shadow:none;" onclick="deleteEducation('${item.id}')">削除</button></td>
        `;
        tbody.appendChild(tr);
    });
}

function deleteEducation(id) {
    if(window.UI) {
        window.UI.showConfirm("このコンテンツを削除しますか？", async () => {
            try { 
                if (window.colRefs && window.colRefs.edu) await window.colRefs.edu.doc(id).delete(); 
                window.UI.showToast('削除しました', 'success'); 
            } catch (e) { 
                window.UI.showToast('削除に失敗しました。', 'error'); 
            }
        });
    }
}

// ==========================================
// コミュニケーション機能・モーダル制御
// ==========================================
function openBroadcastModal() { document.getElementById('broadcast-modal').style.display = 'flex'; }
function closeBroadcastModal() { document.getElementById('broadcast-modal').style.display = 'none'; }

function sendBroadcast() {
    const title = document.getElementById('bc-title').value.trim();
    const message = document.getElementById('bc-message').value.trim();
    const level = document.getElementById('bc-level').value;
    const target = document.getElementById('bc-target').value;
    
    if(!title || !message) { 
        if(window.UI) window.UI.showToast('タイトルとメッセージを入力してください', 'warning'); 
        return; 
    }
    
    if(window.UI) {
        window.UI.showConfirm(`この内容で【${target === 'ALL' ? '全員' : target}】へ送信しますか？`, async () => {
            const data = { title, message, level, target, readBy: [], createdAt: new Date().toISOString() };
            try {
                if(window.colRefs && window.colRefs.broadcasts) { 
                    await window.colRefs.broadcasts.add(data); 
                } else {
                    STATE.broadcasts.push({id: Date.now().toString(), ...data});
                    localStorage.setItem('team_broadcasts', JSON.stringify(STATE.broadcasts));
                }
                window.UI.showToast('🚀 お知らせを送信しました！', 'success');
                document.getElementById('bc-title').value = ''; 
                document.getElementById('bc-message').value = '';
                closeBroadcastModal();
            } catch(e) { 
                window.UI.showToast('送信失敗: ' + e.message, 'error'); 
            }
        });
    }
}

function openBroadcastListModal() { 
    ui.renderBroadcastList(STATE.broadcasts, STATE.players, deleteBroadcast); 
    document.getElementById('broadcast-list-modal').style.display = 'flex'; 
}
function closeBroadcastListModal() { document.getElementById('broadcast-list-modal').style.display = 'none'; }

function deleteBroadcast(id) {
    if(window.UI) {
        window.UI.showConfirm("このお知らせを削除しますか？<br><span style='font-size:13px; font-weight:600;'>（選手の画面からも消えます）</span>", async () => {
            if(window.colRefs && window.colRefs.broadcasts) {
                await window.colRefs.broadcasts.doc(id).delete();
            } else {
                STATE.broadcasts = STATE.broadcasts.filter(b => b.id !== id);
                localStorage.setItem('team_broadcasts', JSON.stringify(STATE.broadcasts));
                ui.renderBroadcastList(STATE.broadcasts, STATE.players, deleteBroadcast);
            }
            window.UI.showToast("削除しました", "success");
        });
    }
}

let currentCommentTarget = null;
function openCommentModal(playerName, date) {
    currentCommentTarget = { playerName, date };
    const log = STATE.logs.find(l => l.playerName === playerName && l.date === date);
    
    document.getElementById('cm-player').textContent = playerName;
    document.getElementById('cm-date').textContent = `(${date.split('-').slice(1).join('/')})`;
    document.getElementById('cm-good').textContent = log.good || '未入力';
    document.getElementById('cm-bad').textContent = log.bad || '未入力';
    
    document.querySelectorAll('.stamp-btn').forEach(btn => btn.classList.remove('selected'));
    document.getElementById('cm-text').value = '';
    
    if(log.coachComment) {
        document.getElementById('cm-text').value = log.coachComment.text || '';
        if(log.coachComment.stamp) {
            const stampBtn = Array.from(document.querySelectorAll('.stamp-btn')).find(b => b.textContent === log.coachComment.stamp);
            if(stampBtn) stampBtn.classList.add('selected');
        }
    }
    document.getElementById('comment-modal').style.display = 'flex';
}

function closeCommentModal() {
    document.getElementById('comment-modal').style.display = 'none'; 
    currentCommentTarget = null;
}

function selectStamp(btn) {
    document.querySelectorAll('.stamp-btn').forEach(b => b.classList.remove('selected'));
    btn.classList.add('selected');
}

async function saveCoachComment() {
    if(!currentCommentTarget) return;
    const { playerName, date } = currentCommentTarget;
    const selectedStampBtn = document.querySelector('.stamp-btn.selected');
    const stamp = selectedStampBtn ? selectedStampBtn.textContent : '';
    const text = document.getElementById('cm-text').value.trim();
    
    if(!stamp && !text) { 
        if(window.UI) window.UI.showToast('スタンプかメッセージのどちらかを入力してください', 'warning'); 
        return; 
    }
    
    const docId = `${playerName}_${date}`;
    const coachComment = { stamp, text, updatedAt: new Date().toISOString() };
    
    try {
        if(window.colRefs && window.colRefs.logs) {
            await window.colRefs.logs.doc(docId).set({ coachComment, playerReadComment: false }, { merge: true });
        } else {
            const idx = STATE.logs.findIndex(l => l.playerName === playerName && l.date === date);
            if(idx > -1) {
                STATE.logs[idx].coachComment = coachComment; 
                STATE.logs[idx].playerReadComment = false;
                localStorage.setItem('team_condition_logs', JSON.stringify(STATE.logs)); 
                updateAdminUI();
            }
        }
        if(window.UI) window.UI.showToast("フィードバックを送信しました！", "success"); 
        closeCommentModal();
    } catch(e) { 
        if(window.UI) window.UI.showToast('保存失敗: ' + e.message, 'error'); 
    }
}

function openDetailModal(playerName, date) {
    const log = STATE.logs.find(l => l.playerName === playerName && l.date === date);
    if (!log) return;
    document.getElementById('detail-menu').textContent = log.menu || '未入力';
    document.getElementById('detail-good').textContent = log.good || '未入力';
    document.getElementById('detail-bad').textContent = log.bad || '未入力';
    document.getElementById('detail-modal').style.display = 'flex';
}
function closeDetailModal() {
    document.getElementById('detail-modal').style.display = 'none';
}

function deleteLog(playerName, date) {
    if(window.UI) {
        window.UI.showConfirm(`本当に削除しますか？`, async () => {
            const docId = `${playerName}_${date}`;
            if (window.colRefs && window.colRefs.logs) { 
                await window.colRefs.logs.doc(docId).delete(); 
                window.UI.showToast('削除しました', 'success'); 
            }
        });
    }
}

function clearAllData() {
    if(window.UI) {
        window.UI.showConfirm("全データを削除しますか？<br><span style='font-size:13px; color:var(--color-danger);'>※この操作は取り消せません。</span>", async () => {
            if (window.colRefs && window.colRefs.logs) {
                const snapshot = await window.colRefs.logs.get(); 
                snapshot.docs.forEach(doc => doc.ref.delete()); 
                window.UI.showToast('全データを削除しました', 'success');
            }
        });
    }
}

function downloadCSV() {
    const logs = STATE.filteredLogs || [];
    if (logs.length === 0) { 
        if(window.UI) window.UI.showToast("ダウンロードするデータがありません。", "warning"); 
        return; 
    }
    let csvContent = '\uFEFF'; 
    const headers = ['日付', '選手名', 'IRS(朝)', 'IRS(夜)', '疲労度', 'ストレス', 'TrainingLoad', 'スプリント1_距離', 'スプリント1_タイム', 'スプリント2_距離', 'スプリント2_タイム', 'スプリント3_距離', 'スプリント3_タイム', 'RSI', 'F-v診断', '朝の筋肉痛・張り', '夜の筋肉痛・張り', '体重(kg)', '心拍数', '歩数', '睡眠時間', '睡眠の質', '朝のケガ詳細', '夜のケガ詳細', 'メニュー', 'できたこと', '課題', '実施したケア', 'コーチコメント'];
    csvContent += headers.join(',') + '\n';

    const exportLogs = [...logs].reverse();
    exportLogs.forEach(log => {
        let sLogs = log.sprintLogs ? [...log.sprintLogs] : [];
        if (log.sprintDistance && log.sprintDistance !== '未計測' && log.sprintTime) {
            sLogs.push({ distance: log.sprintDistance, time: log.sprintTime });
        }
        const s1 = sLogs[0] || { distance: '', time: '' }; 
        const s2 = sLogs[1] || { distance: '', time: '' }; 
        const s3 = sLogs[2] || { distance: '', time: '' };
        const coachCommentText = log.coachComment ? `${log.coachComment.stamp} ${log.coachComment.text}` : '';

        const W = window.CONSTANTS ? window.CONSTANTS.THRESHOLDS.IRS_WEIGHTS : null;
        const irsPreVal = log.irsPre || logic.calcLogIrs(log, 'pre', W);
        const irsPostVal = log.irsPost || logic.calcLogIrs(log, 'post', W);

        let safeCare = String(log.care || '').replace(/null/g, '').split('/').map(s => s.trim()).filter(s => s !== '').join(' / ');

        const row = [
            log.date, log.playerName, irsPreVal, irsPostVal, log.fatigue, log.stress, log.trainingLoad, 
            s1.distance, s1.time, s2.distance, s2.time, s3.distance, s3.time,
            log.rsi, log.fvResult, log.soreness, log.sorenessPost, log.weight, log.heartRate, log.steps, log.sleep, log.sleepQuality, 
            log.injuryPre || '', log.injury || '', log.menu, log.good, log.bad, safeCare, coachCommentText
        ].map(item => {
            let text = String(item || '').replace(/"/g, '""').replace(/\n/g, ' '); 
            text = text.replace(/<[^>]*>?/gm, ''); 
            return `"${text}"`;
        });
        csvContent += row.join(',') + '\n';
    });

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a"); 
    link.href = URL.createObjectURL(blob); 
    link.download = `AthleSense_Logs.csv`;
    link.style.display = "none"; 
    document.body.appendChild(link); 
    link.click(); 
    document.body.removeChild(link);
}

function generateMonthlyReport() {
    if(window.UI) window.UI.showToast("PDFレポート作成機能は現在準備中です。今後のアップデートをお待ちください！", "info");
}

function toggleTheme() {
    const body = document.body; body.classList.toggle('dark-mode');
    const isDark = body.classList.contains('dark-mode');
    localStorage.setItem('theme', isDark ? 'dark' : 'light');
    document.getElementById('theme-toggle').innerHTML = isDark ? '☀️' : '🌙';
    
    if(STATE.charts.teamTrend) STATE.charts.teamTrend.update();
    if(STATE.charts.load) STATE.charts.load.update();
    if(STATE.charts.rsi) STATE.charts.rsi.update();
}

// ==========================================
// グローバル空間へのエクスポート (インラインイベント用)
// ==========================================
window.handleEmailLogin = handleEmailLogin;
window.handleEmailRegister = handleEmailRegister;
window.handleGoogleLogin = handleGoogleLogin;
window.handleLogout = handleLogout;
window.handleVerifyKeyCode = handleVerifyKeyCode;
window.handleLoadOlderData = handleLoadOlderData; // 💡 追加

window.toggleTheme = toggleTheme;
window.switchTab = ui.switchTab;
window.openHistoryView = (viewId) => ui.openHistoryView(viewId, (id) => {
    if(id === 'individual') updateCharts();
    if(id === 'goals') renderGoalsTable();
    if(id === 'education') renderEducationTable();
    if(id === 'teamTrend') charts.drawTeamTrendChart(STATE.filteredLogs);
    if(id === 'careSettings') ui.renderCareOptions(STATE.careOptions, deleteCareOption);
    if(id === 'heatmap') ui.updateHeatmap(STATE.filteredLogs);
    if(id === 'sprint') ui.updateSprintRanking(STATE.filteredLogs, STATE.players);
    if(id === 'fv') ui.updateFvGrouping(STATE.filteredLogs);
});
window.backToHistoryMenu = ui.backToHistoryMenu;

window.updateTodayView = updateTodayView;
window.filterAndRenderTable = filterAndRenderTable;
window.updateCharts = updateCharts;
window.updateSprintRanking = () => ui.updateSprintRanking(STATE.filteredLogs, STATE.players);

window.addCareOption = addCareOption;
window.addPlayer = addPlayer;
window.editGoalAdmin = editGoalAdmin;
window.saveTeamSettings = saveTeamSettings;
window.addEducation = addEducation;
window.deleteEducation = deleteEducation;

window.openBroadcastModal = openBroadcastModal;
window.closeBroadcastModal = closeBroadcastModal;
window.sendBroadcast = sendBroadcast;
window.openBroadcastListModal = openBroadcastListModal;
window.closeBroadcastListModal = closeBroadcastListModal;

window.closeCommentModal = closeCommentModal;
window.selectStamp = selectStamp;
window.saveCoachComment = saveCoachComment;

window.closeDetailModal = closeDetailModal;
window.clearAllData = clearAllData;
window.downloadCSV = downloadCSV;
window.generateMonthlyReport = generateMonthlyReport;

// 起動
document.addEventListener('DOMContentLoaded', initApp);
