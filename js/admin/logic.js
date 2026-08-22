// ==========================================
// 📌 管理者用 計算・分析ロジック (Logic)
// DOMに依存しない純粋なデータ集計・フィルタリング関数群です
// ==========================================

/**
 * 選手の一定期間のログから、Total Load, Monotony(単調さ), Strain(負担)を計算します
 * @param {Array} logs - 選手のログ配列
 * @returns {Object} { totalLoad, monotony, strain }
 */
export function calculateMonotony(logs) {
    const loads = logs.map(l => parseFloat(l.trainingLoad) || 0);
    const totalLoad = loads.reduce((a, b) => a + b, 0);
    const mean = loads.length > 0 ? totalLoad / loads.length : 0;
    
    // 分散と標準偏差の計算
    const variance = loads.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / (loads.length || 1);
    const sd = Math.sqrt(variance);
    
    // 単調さ (平均 ÷ 標準偏差)
    const monotony = sd > 0 ? (mean / sd) : 0;
    
    return { 
        totalLoad, 
        monotony, 
        strain: totalLoad * monotony 
    };
}

/**
 * ACWR (Acute:Chronic Workload Ratio) を計算します
 * @param {string} playerName - 対象選手名
 * @param {Date} targetDateObj - 基準となる日付オブジェクト
 * @param {Array} allLogs - 全ログデータ
 * @returns {Object} { ratio, acute, chronic }
 */
export function calculateACWR(playerName, targetDateObj, allLogs) {
    const playerLogs = allLogs.filter(l => l.playerName === playerName && l.date);
    if (playerLogs.length === 0) return { ratio: 0, acute: 0, chronic: 0 };

    let acuteLoadSum = 0; 
    let chronicLoadSum = 0;

    playerLogs.forEach(l => {
        const logDateObj = new Date(l.date + 'T00:00:00');
        const diffDays = (targetDateObj - logDateObj) / (1000 * 60 * 60 * 24);
        const load = parseFloat(l.trainingLoad) || 0;
        
        if (diffDays >= 0 && diffDays < 7) acuteLoadSum += load;
        if (diffDays >= 0 && diffDays < 28) chronicLoadSum += load;
    });

    const acuteAvg = acuteLoadSum / 7;
    const chronicAvg = chronicLoadSum / 28;
    const ratio = chronicAvg > 0 ? (acuteAvg / chronicAvg) : 0;
    
    return { ratio, acute: acuteAvg, chronic: chronicAvg };
}

/**
 * データから動的に IRS (Injury Risk Score) を計算します
 * @param {Object} log - 対象のログデータ1件
 * @param {string} type - 'pre'(朝) または 'post'(夜)
 * @param {Object} weights - CONSTANTS.THRESHOLDS.IRS_WEIGHTS
 * @returns {string} 計算されたIRSスコア（例: "15%"）または "-"
 */
export function calcLogIrs(log, type, weights) {
    let score = 5; 
    if (!weights) return '-';

    if (type === 'pre') {
        if (!log.fatigue && !log.sleep) return '-';
        
        const fatigue = parseInt(log.fatigue) || 1;
        const stress = parseInt(log.stress) || 1;
        const sleep = parseFloat(log.sleep) || 0;
        const sleepQuality = parseInt(log.sleepQuality) || 5;

        if (fatigue >= weights.FATIGUE_SEVERE.threshold) score += weights.FATIGUE_SEVERE.score; 
        else if (fatigue >= weights.FATIGUE_HIGH.threshold) score += weights.FATIGUE_HIGH.score; 
        
        if (stress >= weights.STRESS_HIGH.threshold) score += weights.STRESS_HIGH.score; 
        
        if (sleep > 0 && sleep < weights.SLEEP_SHORT.threshold) score += weights.SLEEP_SHORT.score; 
        else if (sleep > 0 && sleep < weights.SLEEP_MED.threshold) score += weights.SLEEP_MED.score; 
        
        if (sleepQuality <= weights.QUALITY_LOW.threshold) score += weights.QUALITY_LOW.score;

        const sorenessArr = log.soreness ? log.soreness.split(',').map(s => s.trim()).filter(s => s) : [];
        sorenessArr.forEach(part => { 
            if (part === 'ハムストリングス') score += weights.SORENESS_HAMSTRING; 
            else if (part === 'カーフ' || part === 'アキレス腱') score += weights.SORENESS_CALF_ACHILLES; 
            else if (part === '腸腰筋' || part === '大腿四頭筋' || part === '腰') score += weights.SORENESS_QUAD_HIP_LOWER; 
            else if (!weights.CRITICAL_PARTS.includes(part)) score += weights.SORENESS_OTHER; 
        });
        return `${Math.min(score, 95)}%`;
        
    } else if (type === 'post') {
        if (!log.rpe && !log.trainingLoad) return '-';

        const rpe = parseFloat(log.rpe) || 0;
        const load = parseFloat(log.trainingLoad) || 0;

        if (rpe >= weights.RPE_HIGH.threshold) score += weights.RPE_HIGH.score; 
        if (load > weights.LOAD_HIGH.threshold) score += weights.LOAD_HIGH.score;

        const sorenessPostArr = log.sorenessPost ? log.sorenessPost.split(',').map(s => s.trim()).filter(s => s) : [];
        sorenessPostArr.forEach(part => { 
            if (part === 'ハムストリングス') score += weights.SORENESS_HAMSTRING; 
            else if (part === 'カーフ' || part === 'アキレス腱') score += weights.SORENESS_CALF_ACHILLES + 5; 
            else if (part === '腸腰筋' || part === '大腿四頭筋' || part === '腰') score += weights.SORENESS_QUAD_HIP_LOWER; 
            else if (!weights.CRITICAL_PARTS.includes(part)) score += weights.SORENESS_OTHER; 
        });
        return `${Math.min(score, 95)}%`;
    }
    return '-';
}

/**
 * ログデータを期間および検索文字列でフィルタリングします
 * @param {Array} logs - 全ログデータ
 * @param {string} periodFilter - 'all', 'this_week', 'this_month' または 'YYYY-MM'
 * @param {string} searchInput - 検索ボックスの入力文字列（小文字化済みを推奨）
 * @returns {Array} フィルタリングされたログ配列
 */
export function filterLogs(logs, periodFilter, searchInput) {
    const now = new Date();
    
    // 指定した日付の「月曜日」を取得するヘルパー
    const getMonday = (date) => {
        const d = new Date(date); 
        const day = d.getDay() || 7; 
        d.setHours(0,0,0,0); 
        d.setDate(d.getDate() - day + 1); 
        return d;
    };

    return logs.filter(log => {
        const matchName = (log.playerName || '').toLowerCase().includes(searchInput);
        const matchSoreness = (log.soreness || '').toLowerCase().includes(searchInput) || (log.sorenessPost || '').toLowerCase().includes(searchInput);
        if (!matchName && !matchSoreness) return false;

        if (periodFilter === 'all') return true;
        if (!log.date) return false;
        
        const d = new Date(log.date + 'T00:00:00');
        
        if (periodFilter === 'this_week') {
            const monday = getMonday(now);
            const nextMonday = new Date(monday); 
            nextMonday.setDate(nextMonday.getDate() + 7);
            return d >= monday && d < nextMonday;
        }
        if (periodFilter === 'last_week') {
            const thisMonday = getMonday(now);
            const lastMonday = new Date(thisMonday); 
            lastMonday.setDate(lastMonday.getDate() - 7);
            return d >= lastMonday && d < thisMonday;
        }
        if (periodFilter === 'this_month') {
            return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
        }
        if (periodFilter === 'last_month') {
            let lastMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
            return d.getFullYear() === lastMonthDate.getFullYear() && d.getMonth() === lastMonthDate.getMonth();
        }
        if (periodFilter.match(/^\d{4}-\d{2}$/)) {
            return log.date.startsWith(periodFilter);
        }
        return true;
    });
}