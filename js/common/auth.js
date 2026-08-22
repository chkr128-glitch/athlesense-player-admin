// ==========================================
// 📌 認証・セッション管理 (Auth)
// アプリケーション内のログイン状態を管理します
// ==========================================

/**
 * 現在のログインユーザーを取得します
 * @returns {string|null} ユーザー名、未ログイン時はnull
 */
export function getCurrentUser() {
    return localStorage.getItem('currentUser');
}

/**
 * ユーザーのログイン処理を行います
 * @param {string} playerName - 選択された選手名
 * @returns {boolean} 成功したかどうか
 */
export function login(playerName) {
    if (!playerName) {
        if (window.UI) window.UI.showToast("名前を選択してください。", "warning");
        return false;
    }
    
    if (window.HAPTIC) window.HAPTIC.medium(); 
    localStorage.setItem('currentUser', playerName);
    
    if (window.UI) window.UI.showToast(`${playerName} さん、こんにちは！`, "success");
    return true;
}

/**
 * ログアウト処理を行います（確認ダイアログ付き）
 * @param {Function} onLogoutSuccess - ログアウト完了後に実行するコールバック（リロードなど）
 */
export function logout(onLogoutSuccess) {
    if (window.UI) {
        window.UI.showConfirm("ログアウトしますか？", () => { 
            localStorage.removeItem('currentUser'); 
            if (onLogoutSuccess) onLogoutSuccess();
            else location.reload(); 
        });
    } else {
        // UIが読み込まれていない場合のフォールバック
        if (confirm("ログアウトしますか？")) {
            localStorage.removeItem('currentUser');
            if (onLogoutSuccess) onLogoutSuccess();
            else location.reload();
        }
    }
}