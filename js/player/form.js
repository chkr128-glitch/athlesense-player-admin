// ==========================================
// 📌 選手用 フォーム制御 (Form)
// 朝・夜の入力データのバリデーションとDB保存処理を担当します
// ==========================================

import { STATE } from './state.js';
import * as logic from './logic.js';
import * as ui from './ui.js';

// --- バリデーション ---

export function validatePreData() {
    const sleepEl = document.getElementById('sleep'); 
    if(!sleepEl) return true;
    
    const sleep = parseFloat(sleepEl.value);
    if (isNaN(sleep) || sleep < 0 || sleep > 24) { 
        if(window.UI) window.UI.showToast('睡眠時間は0〜24の範囲で入力してください', 'error'); 
        return false; 
    }
    if (!document.querySelector('input[name="sleep-quality"]:checked')) { 
        if(window.UI) window.UI.showToast('「睡眠の質」の星を選択してください', 'error'); 
        return false; 
    }
    
    const weightEl = document.getElementById('weight'); 
    if(weightEl && weightEl.value !== "") { 
        const weight = parseFloat(weightEl.value); 
        if (!isNaN(weight) && (weight < 20 || weight > 200)) { 
            if(window.UI) window.UI.showToast('体重は正しい数値を入力してください', 'error'); 
            return false; 
        } 
    }
    
    const hrEl = document.getElementById('heart-rate'); 
    if(hrEl && hrEl.value !== "") { 
        const hr = parseInt(hrEl.value); 
        if (!isNaN(hr) && (hr < 30 || hr > 220)) { 
            if(window.UI) window.UI.showToast('心拍数は正しい数値を入力してください', 'error'); 
            return false; 
        } 
    }
    return true;
}

export function validatePostData() {
    const durEl = document.getElementById('duration'); 
    if(!durEl) return true;
    
    const duration = parseFloat(durEl.value);
    if (isNaN(duration) || duration <= 0 || duration > 1440) { 
        if(window.UI) window.UI.showToast('Loadを計算するため、正しい「運動時間(分)」を入力してください', 'error'); 
        return false; 
    }
    return true;
}

// --- 保存処理 ---

/**
 * フォームの入力データをFirestore (またはローカル) に保存します
 * @param {string} type - 'pre' (朝) または 'post' (夜)
 */
export async function saveData(type) {
    if(window.HAPTIC) window.HAPTIC.medium(); 
    
    const playerName = STATE.currentUser; 
    const dateInput = document.getElementById('date');
    
    if(!playerName || !dateInput) { 
        if(window.UI) window.UI.showToast("ログイン状態か日付を確認してください", "error"); 
        return; 
    }
    
    const date = dateInput.value;
    if (type === 'pre' && !validatePreData()) return; 
    if (type === 'post' && !validatePostData()) return;
    
    const btn = document.querySelector(`#form-${type} .btn-primary`); 
    if(btn) { 
        btn.disabled = true; 
        btn.textContent = '保存中...'; 
    }

    const docId = `${playerName}_${date}`; 
    let partialData = { 
        playerName: playerName, 
        date: date, 
        updatedAt: new Date().toISOString() 
    }; 
    
    let isPB = false; // 自己ベスト更新フラグ

    try {
        if(type === 'pre') {
            const sqNode = document.querySelector('input[name="sleep-quality"]:checked'); 
            partialData.sleep = document.getElementById('sleep').value; 
            partialData.sleepQuality = sqNode ? sqNode.value : ''; 
            partialData.weight = document.getElementById('weight').value; 
            partialData.heartRate = document.getElementById('heart-rate').value; 
            partialData.fatigue = document.getElementById('fatigue').value; 
            partialData.stress = document.getElementById('stress').value; 
            partialData.soreness = STATE.sorenessPre.join(', '); 
            partialData.injuryPre = document.getElementById('injury-pre').value; 
        } else {
            partialData.duration = document.getElementById('duration').value; 
            partialData.rpe = document.getElementById('rpe').value; 
            
            const loadRes = document.getElementById('load-result');
            partialData.trainingLoad = loadRes ? loadRes.textContent : '-'; 
            
            partialData.sprintLogs = getSprintDataFromDOM(); 
            partialData.rsi = document.getElementById('rsi').value; 
            partialData.time30m = document.getElementById('time-30m').value; 
            partialData.timeFly20m = document.getElementById('time-fly20m').value; 
            partialData.fvResult = document.getElementById('fv-result').value; 
            partialData.menu = document.getElementById('menu').value; 
            partialData.steps = document.getElementById('steps').value; 
            partialData.good = document.getElementById('good').value; 
            partialData.bad = document.getElementById('bad').value; 
            partialData.injury = document.getElementById('injury').value; 
            partialData.sorenessPost = STATE.sorenessPost.join(', ');
            
            let selectedCares = []; 
            document.querySelectorAll('.care-tag.selected').forEach(el => selectedCares.push(el.textContent)); 
            const freeTextCare = document.getElementById('care').value; 
            partialData.care = selectedCares.length > 0 ? selectedCares.join(' / ') + (freeTextCare ? ' / ' + freeTextCare : '') : freeTextCare;
            
            // 自己ベスト判定
            const myLogs = STATE.logs.filter(l => l.playerName === playerName && l.date !== date); 
            const pbResult = logic.checkPersonalBestAll(partialData.sprintLogs, playerName, myLogs); 
            isPB = pbResult.isBest; 
            partialData.pbDistances = isPB ? pbResult.pbList : [];
        }

        // DBへ保存
        if(window.colRefs && window.colRefs.logs) { 
            await window.colRefs.logs.doc(docId).set(partialData, { merge: true }); 
        } else {
            // ローカルフォールバック
            let savedLogs = JSON.parse(localStorage.getItem('team_condition_logs') || '[]'); 
            let existingIndex = savedLogs.findIndex(log => log.playerName === playerName && log.date === date);
            if (existingIndex > -1) savedLogs[existingIndex] = { ...savedLogs[existingIndex], ...partialData }; 
            else savedLogs.push(partialData);
            
            localStorage.setItem('team_condition_logs', JSON.stringify(savedLogs)); 
            // window.loadLocalData() が必要ですが、ここではイベント発火による自動更新を期待
        }

        if(window.UI) {
            if(type === 'pre') { 
                window.UI.showToast('🌅 朝のデータを保存しました！', 'success'); 
                if(window.HAPTIC) window.HAPTIC.success(); 
            } else { 
                window.UI.showToast('🌙 夜のデータを保存しました！', 'success'); 
                if (isPB) { 
                    if(typeof confetti !== 'undefined') confetti(); 
                    window.UI.showToast('🎉 自己ベスト更新おめでとうございます！！', 'success'); 
                } 
                if(window.HAPTIC) window.HAPTIC.success(); 
            }
        }
        
    } catch (error) { 
        console.error(error);
        if(window.UI) window.UI.showToast("保存に失敗しました", "error"); 
    } finally { 
        if(btn) { 
            btn.disabled = false; 
            btn.textContent = type === 'pre' ? '選択した日の「朝」を保存' : '選択した日の「夜」を保存'; 
        } 
    }
}

// ヘルパー関数: DOMからスプリントデータを取得
function getSprintDataFromDOM() { 
    const arr = []; 
    document.querySelectorAll('.sprint-row').forEach(row => { 
        const distInput = row.querySelector('.sprint-dist-input');
        const timeInput = row.querySelector('.sprint-time-input');
        if(distInput && timeInput) {
            const dist = distInput.value; 
            const time = timeInput.value; 
            if (dist && time) arr.push({ distance: dist, time: time }); 
        }
    }); 
    return arr; 
}