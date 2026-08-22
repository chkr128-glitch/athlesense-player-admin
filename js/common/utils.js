// ==========================================
// 📌 共通ユーティリティ (Haptic & UI)
// ==========================================
export const HAPTIC = {
    light: () => { if (navigator.vibrate) navigator.vibrate(10); },
    medium: () => { if (navigator.vibrate) navigator.vibrate(30); },
    success: () => { if (navigator.vibrate) navigator.vibrate([20, 40, 20, 40, 50]); }
};

export const UI = {
    toggleDisplay: (id, displayStyle) => { 
        const el = document.getElementById(id); 
        if (el) { el.classList.remove('hidden'); el.style.display = displayStyle; } 
    },
    hideDisplay: (id) => { 
        const el = document.getElementById(id); 
        if (el) { el.classList.add('hidden'); el.style.display = ''; } 
    },
    showToast: (message, type = 'info') => {
        const container = document.getElementById('toast-container');
        if (!container) return;
        
        const toast = document.createElement('div');
        const bgColors = { 
            info: 'var(--info, var(--color-info, #3b82f6))', 
            success: 'var(--good-text, var(--color-success, #10b981))', 
            warning: 'var(--secondary, var(--color-warning, #f59e0b))', 
            error: 'var(--warning-text, var(--color-danger, #ef4444))' 
        };
        
        toast.style.backgroundColor = bgColors[type] || bgColors.info;
        toast.style.color = 'white'; 
        toast.style.padding = '16px 20px'; 
        toast.style.borderRadius = '16px'; 
        toast.style.boxShadow = 'var(--shadow-md)'; 
        toast.style.fontSize = '15px'; 
        toast.style.fontWeight = '800'; 
        toast.style.opacity = '0'; 
        toast.style.display = 'flex'; 
        toast.style.alignItems = 'center'; 
        toast.style.gap = '12px';
        
        const isTop = container.style.top !== '';
        toast.style.transform = isTop ? 'translateY(-20px)' : 'translateY(20px)';
        toast.style.transition = 'all 0.4s var(--ease-out-expo)';
        
        let icon = type === 'success' ? '✅' : type === 'warning' ? '⚠️' : type === 'error' ? '🚨' : 'ℹ️';
        toast.innerHTML = `<span style="font-size:20px;">${icon}</span> <span>${message}</span>`;
        container.appendChild(toast);

        requestAnimationFrame(() => { 
            toast.style.opacity = '1'; 
            toast.style.transform = 'translateY(0)'; 
        });
        
        setTimeout(() => { 
            toast.style.opacity = '0'; 
            toast.style.transform = isTop ? 'translateY(-20px)' : 'translateY(20px)'; 
            setTimeout(() => toast.remove(), 400); 
        }, 3500);
    },
    showConfirm: (message, onConfirm) => {
        if (typeof navigator !== 'undefined' && navigator.vibrate) navigator.vibrate(30);
        const modal = document.getElementById('confirm-modal');
        if (!modal) return;
        
        document.getElementById('confirm-message').innerHTML = message;
        modal.style.display = 'flex';
        
        const okBtn = document.getElementById('confirm-ok-btn'); 
        const cancelBtn = document.getElementById('confirm-cancel-btn');
        const newOkBtn = okBtn.cloneNode(true); 
        const newCancelBtn = cancelBtn.cloneNode(true);
        okBtn.parentNode.replaceChild(newOkBtn, okBtn); 
        cancelBtn.parentNode.replaceChild(newCancelBtn, cancelBtn);

        newOkBtn.onclick = () => { 
            if (typeof navigator !== 'undefined' && navigator.vibrate) navigator.vibrate(10);
            modal.style.display = 'none'; 
            if(onConfirm) onConfirm(); 
        };
        newCancelBtn.onclick = () => { 
            if (typeof navigator !== 'undefined' && navigator.vibrate) navigator.vibrate(10);
            modal.style.display = 'none'; 
        };
    },
    showPrompt: (title, desc, initialValue, onSave) => {
        if (typeof navigator !== 'undefined' && navigator.vibrate) navigator.vibrate(30);
        const modal = document.getElementById('prompt-modal');
        if (!modal) return;
        
        document.getElementById('prompt-title').textContent = title;
        document.getElementById('prompt-desc').textContent = desc;
        
        const input = document.getElementById('prompt-input'); 
        input.value = initialValue;
        modal.style.display = 'flex'; 
        input.focus();
        
        const okBtn = document.getElementById('prompt-ok-btn'); 
        const cancelBtn = document.getElementById('prompt-cancel-btn');
        const newOkBtn = okBtn.cloneNode(true); 
        const newCancelBtn = cancelBtn.cloneNode(true);
        okBtn.parentNode.replaceChild(newOkBtn, okBtn); 
        cancelBtn.parentNode.replaceChild(newCancelBtn, cancelBtn);

        newOkBtn.onclick = () => { 
            if (typeof navigator !== 'undefined' && navigator.vibrate) navigator.vibrate(10);
            modal.style.display = 'none'; 
            if(onSave) onSave(input.value); 
        };
        newCancelBtn.onclick = () => { 
            if (typeof navigator !== 'undefined' && navigator.vibrate) navigator.vibrate(10);
            modal.style.display = 'none'; 
        };
    }
};
