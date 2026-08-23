const CACHE_NAME = 'athlesense-cache-v2';

// 💡 起動を爆速にするため、インストール時にあらかじめダウンロードしておくファイル
const PRECACHE_URLS = [
    './index.html',
    './admin.html',
    './css/common.css',
    './css/index.css',
    './css/admin.css',
    './icon-index.png',
    './icon-admin.png'
];

// インストール時：基本ファイルをキャッシュしつつ、ユーザーの更新許可を待機
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            console.log('Opened cache and precaching core assets');
            return cache.addAll(PRECACHE_URLS).catch(err => console.warn('Precache error:', err));
        })
    );
});

// アクティベート時：古いバージョンのキャッシュを削除する
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames.map((cacheName) => {
                    if (cacheName !== CACHE_NAME) {
                        return caches.delete(cacheName);
                    }
                })
            );
        })
    );
    self.clients.claim();
});

// ユーザーが「更新」ボタンを押したときの処理
self.addEventListener('message', (event) => {
    if (event.data === 'SKIP_WAITING') {
        self.skipWaiting();
    }
});

self.addEventListener('fetch', (event) => {
    // GETリクエスト、かつ自ドメインのファイルのみをキャッシュ対象にする
    if (event.request.method !== 'GET' || !event.request.url.startsWith(self.location.origin)) {
        return;
    }

    event.respondWith(
        caches.match(event.request).then((cachedResponse) => {
            // 💡 Stale-While-Revalidate 戦略:
            // 1. キャッシュがあれば、まず「爆速」でそれを返す
            // 2. 同時に裏側でサーバーへ最新を取りに行き、次回の起動のためにキャッシュを上書き更新する
            const fetchPromise = fetch(event.request).then((networkResponse) => {
                return caches.open(CACHE_NAME).then((cache) => {
                    cache.put(event.request, networkResponse.clone());
                    return networkResponse;
                });
            }).catch(() => {
                // 完全にオフライン(圏外)の場合は何もしない（キャッシュが使われる）
            });

            // キャッシュが存在すればそれを返し、なければ通信結果を待つ
            return cachedResponse || fetchPromise;
        })
    );
});
