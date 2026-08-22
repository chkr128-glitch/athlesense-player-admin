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
