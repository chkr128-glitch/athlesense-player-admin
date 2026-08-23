export let db = null; 
export let colRefs = {};

/**
 * Firebaseを初期化し、Firestoreのコレクション参照をセットアップする
 * @param {Object} CONSTANTS - 共通定数オブジェクト (FIREBASE_CONFIGを含む)
 * @returns {Promise<boolean>} 成功した場合はtrue、失敗した場合はfalse
 */
export async function initFirebase(CONSTANTS) {
    try {
        if (!firebase.apps.length) {
            firebase.initializeApp(CONSTANTS.FIREBASE_CONFIG);
        }
        
        db = firebase.firestore();
        db.settings({ experimentalForceLongPolling: true });
        
        // 💡 修正: ローカルキャッシュ（オフライン永続化）を有効にして読み取り回数を大幅削減
        try {
            await db.enablePersistence();
            console.log("Firebase Cache Enabled");
        } catch (err) {
            if (err.code == 'failed-precondition') {
                console.warn('複数タブが開かれているため、キャッシュが有効になりませんでした。');
            } else if (err.code == 'unimplemented') {
                console.warn('このブラウザはキャッシュをサポートしていません。');
            }
        }
        
        // 共通で利用するコレクション群
        colRefs = {
            logs: db.collection('team_condition_logs'),
            players: db.collection('team_players'),
            goals: db.collection('team_goals'),
            settings: db.collection('team_settings'),
            edu: db.collection('team_education'),
            broadcasts: db.collection('team_broadcasts'),
            kudos: db.collection('team_kudos'),
            adminUsers: db.collection('admin_users') // 管理者名簿
        };

        return true;
    } catch (error) {
        console.warn("Firebase Init Error:", error);
        return false;
    }
}
