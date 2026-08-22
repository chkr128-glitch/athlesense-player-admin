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
        
        // 🚨 修正: 以前の signInAnonymously() (匿名ログイン) を削除しました
        // 今後は auth.js を通じて明示的にログインを行います。
        
        // 共通で利用するコレクション群
        colRefs = {
            logs: db.collection('team_condition_logs'),
            players: db.collection('team_players'),
            goals: db.collection('team_goals'),
            settings: db.collection('team_settings'),
            edu: db.collection('team_education'),
            broadcasts: db.collection('team_broadcasts'),
            kudos: db.collection('team_kudos'),
            adminUsers: db.collection('admin_users') // 👔 追加: 管理者名簿
        };

        return true;
    } catch (error) {
        console.warn("Firebase Init Error:", error);
        return false;
    }
}
