export const CONSTANTS = {
    FIREBASE_CONFIG: {
        apiKey: "AIzaSyAQoESOlZIGJfOgfIwpkL0r0YcYu4tl8ZQ",
        authDomain: "team-conditioning-controling.firebaseapp.com",
        projectId: "team-conditioning-controling",
        storageBucket: "team-conditioning-controling.firebasestorage.app",
        messagingSenderId: "330203393971",
        appId: "1:330203393971:web:f47b8e66137d0fce8b65c6"
    },
    THRESHOLDS: { 
        HIGH_FATIGUE: 8, 
        LOW_SLEEP_HOURS: 6, 
        LOW_SLEEP_QUALITY: 2, 
        MONOTONY_WARNING: 2.0,
        ACWR_DANGER: 1.5,
        ACWR_SWEET_SPOT_MIN: 0.8,
        ACWR_SWEET_SPOT_MAX: 1.3,
        FV_FORCE_DEFICIT: 2.15,
        FV_VELOCITY_DEFICIT: 1.95,
        IRS_WEIGHTS: { 
            FATIGUE_SEVERE: { threshold: 8, score: 15 }, 
            FATIGUE_HIGH: { threshold: 6, score: 5 }, 
            STRESS_HIGH: { threshold: 8, score: 5 }, 
            SLEEP_SHORT: { threshold: 6, score: 10 }, 
            SLEEP_MED: { threshold: 7, score: 5 }, 
            QUALITY_LOW: { threshold: 2, score: 5 }, 
            LOAD_HIGH: { threshold: 600, score: 10 }, 
            RPE_HIGH: { threshold: 8, score: 10 }, 
            CRITICAL_PARTS: ['ハムストリングス', 'カーフ', 'アキレス腱', '腸腰筋', '大腿四頭筋', '腰'], 
            SORENESS_HAMSTRING: 20, SORENESS_CALF_ACHILLES: 10, SORENESS_QUAD_HIP_LOWER: 10, SORENESS_OTHER: 3 
        }
    },
    COLORS: { 
        CHART_LOAD: '#0ea5e9', 
        CHART_FATIGUE: '#8b5cf6', 
        TEXT_MUTED: '#6b7280', 
        GRID_LINE: '#e5e7eb' 
    },
    DEFAULT_CARES: [
        "🍚 栄養補給(30分以内)", "🧊 アイシング", "🛁 交代浴", 
        "🧘‍♂️ 静的ストレッチ", "💆‍♂️ フォームローラー", "✋ マッサージ/ガン", 
        "🧦 圧縮ウエア/挙上", "💤 8時間以上の睡眠"
    ],
    LEVELS: { 
        info: { bgClass: 'b-info', label: 'お知らせ' }, 
        warning: { bgClass: 'b-warning', label: '重要' }, 
        danger: { bgClass: 'b-danger', label: '緊急' } 
    }
};

// 互換性維持のためのエイリアス
CONSTANTS.FV_THRESHOLDS = CONSTANTS.THRESHOLDS;
