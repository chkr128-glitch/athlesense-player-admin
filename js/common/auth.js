/**
 * ログイン状態の変更を監視します
 */
export function onAuthChange(callback) {
    return firebase.auth().onAuthStateChanged(callback);
}

/**
 * 現在ログインしているFirebaseユーザーオブジェクトを取得します
 */
export function getCurrentUser() {
    return firebase.auth().currentUser;
}

/**
 * メールアドレスとパスワードでログインします
 */
export async function loginWithEmail(email, password) {
    try {
        const userCredential = await firebase.auth().signInWithEmailAndPassword(email, password);
        return { success: true, user: userCredential.user };
    } catch (error) {
        return { success: false, error: error };
    }
}

/**
 * メールアドレスとパスワードで新規登録します
 */
export async function registerWithEmail(email, password) {
    try {
        const userCredential = await firebase.auth().createUserWithEmailAndPassword(email, password);
        return { success: true, user: userCredential.user };
    } catch (error) {
        return { success: false, error: error };
    }
}

/**
 * Googleアカウントでログイン（ポップアップ）します
 */
export async function loginWithGoogle() {
    try {
        const provider = new firebase.auth.GoogleAuthProvider();
        const userCredential = await firebase.auth().signInWithPopup(provider);
        return { success: true, user: userCredential.user };
    } catch (error) {
        return { success: false, error: error };
    }
}

/**
 * ログアウト処理を行います
 */
export async function logoutUser() {
    try {
        await firebase.auth().signOut();
        return true;
    } catch (error) {
        console.error("Logout Error:", error);
        return false;
    }
}
