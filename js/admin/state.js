// ==========================================
// 📌 管理者用 状態管理 (STATE)
// ダッシュボードや集計に必要なリアクティブデータを保持します
// ==========================================

export const STATE = {
    logs: [],
    filteredLogs: [],
    players: [],
    settings: {},
    goals: {},
    education: [],
    careOptions: [],
    broadcasts: [],
    
    // グラフインスタンスの保持
    charts: { 
        load: null, 
        rsi: null, 
        teamTrend: null, 
        reportRadar: null, 
        reportLine: null 
    }
};