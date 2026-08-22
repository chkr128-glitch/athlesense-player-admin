// ==========================================
// 📌 状態管理 (STATE)
// 選手用画面のすべてのリアクティブなデータを保持します
// ==========================================

export const STATE = {
    logs: [],
    players: [],
    goals: {},
    settings: {},
    education: [],
    broadcasts: [],
    kudos: [],
    
    sorenessPre: [], 
    sorenessPost: [], 
    chartInstance: null, 
    currentEduCat: 'すべて',
    
    currentUser: null, 
    currentUserCategory: 'BLUE', 
    calYear: new Date().getFullYear(), 
    calMonth: new Date().getMonth()
};
