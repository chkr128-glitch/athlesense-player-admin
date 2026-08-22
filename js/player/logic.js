export function calculateStreak(logs, currentUser) {
    const myLogs = logs.filter(l => l.playerName === currentUser);
    if (myLogs.length === 0) return 0;

    const dates = myLogs.map(l => l.date).sort((a, b) => new Date(b) - new Date(a));
    let streak = 0; 
    let checkDate = new Date(); 
    checkDate.setHours(0, 0, 0, 0);
    
    const todayStr = checkDate.toISOString().split('T')[0];
    const yesterdayDate = new Date(checkDate); 
    yesterdayDate.setDate(yesterdayDate.getDate() - 1); 
    const yesterdayStr = yesterdayDate.toISOString().split('T')[0];
    
    let hasToday = dates.includes(todayStr); 
    let hasYesterday = dates.includes(yesterdayStr);
    
    if (!hasToday && !hasYesterday) { 
        streak = 0; 
    } else {
        let current = hasToday ? new Date(todayStr) : new Date(yesterdayStr);
        while (true) { 
            const cStr = current.toISOString().split('T')[0]; 
            if (dates.includes(cStr)) { 
                streak++; 
                current.setDate(current.getDate() - 1); 
            } else {
                break; 
            }
        }
    }
    return streak;
}

/**
 * スプリントタイムの自己ベスト更新状況を判定します
 */
export function evaluateSprintRank(distance, time, logs, currentUser) {
    if (!distance || isNaN(time) || time <= 0 || !currentUser) return null;
    
    const myLogs = logs.filter(l => l.playerName === currentUser); 
    let allTimes = [];
    myLogs.forEach(log => { 
        if (log.sprintLogs) { 
            log.sprintLogs.forEach(s => { 
                if (s.distance === distance && s.time) { 
                    const t = parseFloat(s.time); 
                    if (t > 0) allTimes.push(t); 
                } 
            }); 
        } 
    });
    
    if (allTimes.length === 0) return { rank: 1, title: '初記録！', badge: '🥇', isBest: true };
    
    allTimes.sort((a, b) => a - b);
    const pb = allTimes[0]; 
    const sb = allTimes[1] !== undefined ? allTimes[1] : 999; 
    const tb = allTimes[2] !== undefined ? allTimes[2] : 999;
    
    if (time <= pb) return { rank: 1, title: '自己ベスト!', badge: '🥇', isBest: true };
    if (time <= sb) return { rank: 2, title: 'セカンドベスト!', badge: '🥈', isBest: false };
    if (time <= tb) return { rank: 3, title: 'サードベスト!', badge: '🥉', isBest: false };
    
    return null;
}

/**
 * F-vプロファイルを計算・診断します
 */
export function calcFvProfile(time30m, timeFly20m) {
    if (time30m > 0 && timeFly20m > 0) {
        const ratio = time30m / timeFly20m;
        const forceThreshold = window.CONSTANTS.FV_THRESHOLDS.FORCE_DEFICIT;
        const veloThreshold = window.CONSTANTS.FV_THRESHOLDS.VELOCITY_DEFICIT;
        
        let result = ratio >= forceThreshold ? '力不足' : ratio <= veloThreshold ? '速度不足' : 'バランス型';
        return { ratio, result };
    }
    return null;
}

/**
 * 保存時に全スプリント記録の自己ベスト更新をチェックします
 */
export function checkPersonalBestAll(newSprints, playerName, otherLogs) {
    let isBest = false; 
    let pbList = []; 
    const bestTimes = {};
    
    otherLogs.forEach(log => { 
        let sLogs = log.sprintLogs || []; 
        sLogs.forEach(s => { 
            const t = parseFloat(s.time); 
            if (t > 0 && (!bestTimes[s.distance] || t < bestTimes[s.distance])) {
                bestTimes[s.distance] = t; 
            }
        }); 
    });
    
    newSprints.forEach(ns => { 
        const t = parseFloat(ns.time); 
        if (t > 0) { 
            if (!bestTimes[ns.distance] || t < bestTimes[ns.distance]) { 
                isBest = true; 
                if(!pbList.includes(ns.distance)) pbList.push(ns.distance); 
            } 
        } 
    });
    return { isBest, pbList };
}

/**
 * Injury Risk Score (IRS) を計算します
 */
export function calcIrsScore(type, data, sorenessList) {
    let score = 5; 
    const W = window.CONSTANTS.IRS_WEIGHTS;
    if (!W) return 0;
    
    if (type === 'pre') {
        const fatigue = data.fatigue || 1;
        const stress = data.stress || 1;
        const sleep = data.sleep || 0;
        const sleepQuality = data.sleepQuality || 5;
        
        if (fatigue >= W.FATIGUE_SEVERE.threshold) score += W.FATIGUE_SEVERE.score; 
        else if (fatigue >= W.FATIGUE_HIGH.threshold) score += W.FATIGUE_HIGH.score; 
        
        if (stress >= W.STRESS_HIGH.threshold) score += W.STRESS_HIGH.score; 
        
        if (sleep > 0 && sleep < W.SLEEP_SHORT.threshold) score += W.SLEEP_SHORT.score; 
        else if (sleep > 0 && sleep < W.SLEEP_MED.threshold) score += W.SLEEP_MED.score; 
        
        if (sleepQuality <= W.QUALITY_LOW.threshold) score += W.QUALITY_LOW.score;
        
        sorenessList.forEach(part => { 
            if (part === 'ハムストリングス') score += W.SORENESS_HAMSTRING; 
            else if (part === 'カーフ' || part === 'アキレス腱') score += W.SORENESS_CALF_ACHILLES; 
            else if (part === '腸腰筋' || part === '大腿四頭筋' || part === '腰') score += W.SORENESS_QUAD_HIP_LOWER; 
            else if (!W.CRITICAL_PARTS.includes(part)) score += W.SORENESS_OTHER; 
        });
        
    } else if (type === 'post') {
        const rpe = data.rpe || 0;
        const load = data.load || 0;
        
        if (rpe >= W.RPE_HIGH.threshold) score += W.RPE_HIGH.score; 
        if (load > W.LOAD_HIGH.threshold) score += W.LOAD_HIGH.score;
        
        sorenessList.forEach(part => { 
            if (part === 'ハムストリングス') score += W.SORENESS_HAMSTRING; 
            else if (part === 'カーフ' || part === 'アキレス腱') score += W.SORENESS_CALF_ACHILLES + 5; 
            else if (part === '腸腰筋' || part === '大腿四頭筋' || part === '腰') score += W.SORENESS_QUAD_HIP_LOWER; 
            else if (!W.CRITICAL_PARTS.includes(part)) score += W.SORENESS_OTHER; 
        });
    }
    
    return Math.min(score, 95);
}

/**
 * 🌅 朝のAIアドバイス用テキストを生成します
 */
export function generateAIAdvicePre(data, sorenessList) {
    const fatigue = data.fatigue || 1; 
    const sleep = data.sleep || 0; 
    const sleepQuality = data.sleepQuality || 5; 
    const injuryPreText = data.injuryPre || ''; 
    let advices = [];
    
    if (sleep > 0 && sleep < 7) advices.push("💤 <b>【睡眠不足アラート】</b><br>睡眠が7時間未満の場合、<b>ケガのリスクが約1.7倍</b>に跳ね上がり、反応速度も低下します。今日の練習は集中力を高め、終了後は早めに寝るよう計画してください。"); 
    else if (sleepQuality <= 2) advices.push("💤 <b>【睡眠の質低下】</b><br>長く寝ても質が悪いと神経系の疲労が抜けません。アップでは「リラックス」を意識してください。");
    
    if (sorenessList.includes('ハムストリングス')) advices.push("💡 <b>【ハムの張り】</b><br>練習前に仰向けで足を上げ、無理のない範囲で静的な収縮を入れて痛みの度合いをチェックしてください。"); 
    if (sorenessList.includes('腸腰筋') || sorenessList.includes('大腿四頭筋')) advices.push("💡 <b>【前ももの張り】</b><br>ブレーキ動作が多くなっているか、骨盤が後傾気味です。アップで大臀筋（お尻）にスイッチを入れるドリルを多めに行いましょう。"); 
    if (sorenessList.includes('カーフ') || sorenessList.includes('アキレス腱') || sorenessList.includes('足裏')) advices.push("💡 <b>【足部・下腿の疲労】</b><br>接地時のバネ組織が疲労しています。今日は過度な跳躍や反発ドリルは控えめにするのが無難です。"); 
    if (sorenessList.includes('腕')) advices.push("💡 <b>【腕の張り】</b><br>スプリント時の腕振りやウエイトの影響が考えられます。肩甲骨周りのストレッチを行い、上半身の連動性を保ちましょう。"); 
    if (sorenessList.includes('腰')) advices.push("💡 <b>【腰の張り】</b><br>体幹の疲労や衝撃吸収の低下が考えられます。アップでは股関節の可動域を広げ、腰に過度な負担をかけない動きを意識してください。");
    
    if (fatigue >= 8) advices.push("⚠️ <b>【過労警告】</b><br>起床時から強い疲労があります。高強度のスプリントは避け、回復走や技術確認に留める勇気を持つことも重要です。"); 
    if (injuryPreText.length > 0) advices.push("🚑 <b>【痛み・ケガの報告あり】</b><br>具体的な痛みの報告があります。今日の練習は無理をせず、まずは監督やコーチに状態を相談してください。");
    
    return advices;
}

/**
 * 🌙 夜のAIアドバイス用テキストを生成します
 */
export function generateAIAdvicePost(data, sorenessList, sprintCount) {
    const load = data.load || 0; 
    const rpe = data.rpe || 0; 
    let advices = [];
    
    if (load > 600) advices.push("🔥 <b>【ハイロード警告】</b><br>今日の負荷は非常に高いです。筋肉のグリコーゲンが枯渇しているため、練習後30分以内に炭水化物とタンパク質を必ず摂取してください。"); 
    if (rpe >= 8) advices.push("🥵 <b>【高RPEへの対応】</b><br>かなりキツイ練習でした。神経系が興奮しているため、今夜はぬるめのお湯に浸かり、副交感神経を優位にしてリラックスしましょう。"); 
    if (sprintCount >= 3) advices.push("🏃‍♂️ <b>【スプリント過多注意】</b><br>複数回のスプリント計測を行いました。脳へのダメージが大きいため、明日は爆発的なメニューを避けるのが理想的です。");
    
    if (sorenessList.includes('ハムストリングス')) advices.push("💡 <b>【ハムのケア】</b><br>スプリントで最も酷使される部位です。強い張りがある場合は無理にストレッチせず、アイシング等で熱を抜き、その後交代浴やお風呂で血流を促しましょう。"); 
    if (sorenessList.includes('腸腰筋') || sorenessList.includes('大腿四頭筋')) advices.push("💡 <b>【前もも・股関節のケア】</b><br>ブレーキ動作で疲労しています。お風呂上がりに股関節の前側をゆっくり伸ばす静的ストレッチや、フォームローラーが有効です。"); 
    if (sorenessList.includes('カーフ') || sorenessList.includes('アキレス腱') || sorenessList.includes('足裏')) advices.push("💡 <b>【足部・下腿のケア】</b><br>衝撃でふくらはぎや足底が硬くなっています。テニスボール等で足裏をほぐし、ふくらはぎは下から上へ優しくマッサージしてください。"); 
    if (sorenessList.includes('臀部')) advices.push("💡 <b>【お尻のケア】</b><br>推進力を生む大きな筋肉が疲労しています。ボールをお尻の下に置いて自重でリリースしたり、仰向けで膝を抱えるストレッチで張りをとりましょう。"); 
    if (sorenessList.includes('背中') || sorenessList.includes('肩') || sorenessList.includes('腕')) advices.push("💡 <b>【上半身のケア】</b><br>腕振りや体幹の固定による疲労です。胸椎の伸展や、肩甲骨周りのストレッチを行い、上半身の力みをリセットしましょう。"); 
    if (sorenessList.includes('腰')) advices.push("💡 <b>【腰のケア】</b><br>着地衝撃やウエイトで腰背部に負担がかかっています。両膝を抱えるストレッチや、湯船でしっかり温めて血流を良くしましょう。");
    
    const injuryText = data.injury || ''; 
    const badText = data.bad || ''; 
    if(injuryText.length > 0 || badText.includes('痛') || badText.includes('違和感')) advices.push("🚑 <b>【痛みへの対処】</b><br>痛みを伴う違和感がある場合、無理なストレッチはかえって炎症を悪化させます。様子を見て安静にしてください。");
    
    return advices;
}
