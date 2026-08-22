// ... existing code ...
import { STATE } from './state.js';
import * as logic from './logic.js';
import * as ui from './ui.js';
import * as auth from '../common/auth.js';
import * as form from './form.js';

// ==========================================
// 初期化プロセス
// ==========================================
// ... existing code ...
// ==========================================
// 認証・セッション管理
// ==========================================
function checkLoginStatus() {
    const savedUser = auth.getCurrentUser();
    if (savedUser) {
        STATE.currentUser = savedUser;
        window.UI.hideDisplay('login-screen'); 
// ... existing code ...
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
    auth.logout(); 
}

// ==========================================
// データフロー・Firebase購読
// ==========================================
// ... existing code ...
// グローバル空間へのエクスポート
// (HTML内の onclick 等から呼び出せるようにする)
// ==========================================
window.handleLogin = handleLogin;
window.handleLogout = handleLogout;
window.saveData = form.saveData;
// 他にも必要に応じて switchTab, toggleTheme などをバインドします

// 初期化処理の実行
document.addEventListener('DOMContentLoaded', initApp);