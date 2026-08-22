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
        await firebase.auth().signInAnonymously();
        
        // 共通で利用するコレクション群
        colRefs = {
            logs: db.collection('team_condition_logs'),
            players: db.collection('team_players'),
            goals: db.collection('team_goals'),
            settings: db.collection('team_settings'),
            edu: db.collection('team_education'),
            broadcasts: db.collection('team_broadcasts'),
            kudos: db.collection('team_kudos')
        };

        return true;
    } catch (error) {
        console.warn("Firebase Init Error:", error);
        return false;
    }
}
