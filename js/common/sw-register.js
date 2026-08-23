export function registerServiceWorker() {
    // ブラウザがService Workerに対応しているかチェック
    if ('serviceWorker' in navigator) {
        window.addEventListener('load', () => {
            // Service Workerを登録（スコープはアプリ全体）
            navigator.serviceWorker.register('./sw.js').then(registration => {
                console.log('Service Worker 登録完了:', registration.scope);

                // 💡 [Step 2] 更新が見つかった場合の処理（新しいプログラムがダウンロードされた時）
                registration.addEventListener('updatefound', () => {
                    const newWorker = registration.installing;
                    
                    newWorker.addEventListener('statechange', () => {
                        // 新しいワーカーのインストールが完了し、かつ古いワーカーが存在する（＝更新である）場合
                        if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                            showUpdatePrompt(newWorker);
                        }
                    });
                });
            }).catch(error => {
                console.error('Service Worker 登録失敗:', error);
            });
        });

        // 💡 新しいService Workerがアクティブ（更新完了）になったら、画面を自動リロードして最新版を適用
        let refreshing = false;
        navigator.serviceWorker.addEventListener('controllerchange', () => {
            if (refreshing) return;
            refreshing = true;
            window.location.reload();
        });
    }
}

/**
 * 画面に「新しいバージョンがあります」という通知と更新ボタンを表示する
 * @param {ServiceWorker} newWorker - インストール済みの新しいService Worker
 */
function showUpdatePrompt(newWorker) {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const toast = document.createElement('div');
    // 通知用UIのスタイリング
    toast.style.backgroundColor = 'var(--primary, #1e3a8a)';
    toast.style.color = 'white';
    toast.style.padding = '16px 20px';
    toast.style.borderRadius = '16px';
    toast.style.boxShadow = 'var(--shadow-md)';
    toast.style.fontSize = '14px';
    toast.style.fontWeight = '800';
    toast.style.display = 'flex';
    toast.style.flexDirection = 'column';
    toast.style.gap = '12px';
    // 通常のトーストと違い、ボタンを押せるようにする
    toast.style.pointerEvents = 'auto'; 
    toast.style.animation = 'popIn 0.5s var(--ease-out-expo)';

    toast.innerHTML = `
        <div style="display:flex; align-items:center; gap:8px;">
            <span style="font-size:20px;">✨</span> 
            <span>アプリの新しいバージョンがあります</span>
        </div>
        <button id="sw-update-btn" style="padding: 12px; border-radius: 8px; border: none; background: white; color: var(--primary, #1e3a8a); font-weight: 900; cursor: pointer; transition: background 0.2s;">
            今すぐ更新する
        </button>
    `;

    container.appendChild(toast);

    // 「更新」ボタンが押されたら、待機中のワーカーに「古いものを強制終了して切り替えて！」と命令を送る
    document.getElementById('sw-update-btn').addEventListener('click', () => {
        toast.innerHTML = '<div style="text-align:center; padding:10px;">更新しています...</div>';
        newWorker.postMessage('SKIP_WAITING'); // sw.js 側の message イベントが受け取る
    });
}
