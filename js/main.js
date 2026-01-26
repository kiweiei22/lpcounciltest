import { ref, push, onValue, query, limitToLast, get, orderByChild, equalTo } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";
import { db } from "./config.js";

// --- CACHED DATA (Optimization: Reduces redundant DB calls) ---
let membersData = {};
let eventsData = {};
let policiesData = {};
let complaintsData = {};
let currentCalendarDate = new Date();

// --- FORM SUBMISSION STATE (Prevents double submissions) ---
let isSubmittingComplaint = false;

// --- SECURITY: XSS Sanitization ---
function sanitizeHTML(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}
let isSubmittingQA = false;

// --- UTILITY FUNCTIONS ---

// Skeleton Loader Helper
function showSkeleton(containerId, count = 3, type = 'card') {
    const container = document.getElementById(containerId);
    if (!container) return;

    let html = '';
    for (let i = 0; i < count; i++) {
        if (type === 'card') {
            html += `<div class="skeleton-card"></div>`;
        } else if (type === 'policy') {
            html += `
                <div class="glass-card p-10 rounded-[3rem] animate-pulse">
                    <div class="skeleton-title mb-4"></div>
                    <div class="skeleton-text mb-2"></div>
                    <div class="skeleton-text w-3/4"></div>
                </div>`;
        } else if (type === 'qa') {
            html += `
                <div class="glass-card p-8 rounded-[2.5rem] animate-pulse">
                    <div class="skeleton-text mb-4"></div>
                    <div class="skeleton-title w-2/3"></div>
                </div>`;
        }
    }
    container.innerHTML = html;
}

// Toast Notification
function showToast(message, type = 'success') {
    let container = document.getElementById('toast-container');
    if (!container) {
        container = document.createElement('div');
        container.id = 'toast-container';
        container.className = 'toast-container';
        document.body.appendChild(container);
    }

    const toast = document.createElement('div');
    toast.className = `toast ${type}`;

    const icons = {
        success: 'fa-check-circle',
        error: 'fa-exclamation-circle',
        info: 'fa-info-circle',
        warning: 'fa-exclamation-triangle'
    };

    toast.innerHTML = `
        <i class="fas ${icons[type]} toast-icon"></i>
        <span class="toast-message">${message}</span>
    `;

    container.appendChild(toast);

    setTimeout(() => {
        toast.classList.add('removing');
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

// Form Validation Helper
function validateInput(input, rules = {}) {
    const value = input.value.trim();
    let isValid = true;
    let errorMsg = '';

    if (rules.required && !value) {
        isValid = false;
        errorMsg = 'กรุณากรอกข้อมูลนี้';
    } else if (rules.minLength && value.length < rules.minLength) {
        isValid = false;
        errorMsg = `ต้องมีอย่างน้อย ${rules.minLength} ตัวอักษร`;
    } else if (rules.maxLength && value.length > rules.maxLength) {
        isValid = false;
        errorMsg = `ต้องไม่เกิน ${rules.maxLength} ตัวอักษร`;
    } else if (rules.pattern && !rules.pattern.test(value)) {
        isValid = false;
        errorMsg = rules.patternMsg || 'รูปแบบไม่ถูกต้อง';
    }

    // Update UI
    if (isValid && value) {
        input.classList.remove('invalid');
        input.classList.add('valid');
        const errorEl = input.parentElement.querySelector('.input-error');
        if (errorEl) errorEl.remove();
    } else if (!isValid) {
        input.classList.remove('valid');
        input.classList.add('invalid');
        let errorEl = input.parentElement.querySelector('.input-error');
        if (!errorEl) {
            errorEl = document.createElement('div');
            errorEl.className = 'input-error';
            input.parentElement.appendChild(errorEl);
        }
        errorEl.textContent = errorMsg;
    } else {
        input.classList.remove('valid', 'invalid');
        const errorEl = input.parentElement.querySelector('.input-error');
        if (errorEl) errorEl.remove();
    }

    return isValid;
}

// --- COMPLAINT FORM FUNCTIONS ---

// Switch between submit and track modes
window.switchComplaintMode = (mode) => {
    const submitView = document.getElementById('complaint-submit-view');
    const trackView = document.getElementById('complaint-track-view');
    const btnSubmit = document.getElementById('btn-mode-submit');
    const btnTrack = document.getElementById('btn-mode-track');

    if (!submitView || !trackView || !btnSubmit || !btnTrack) return;

    if (mode === 'submit') {
        submitView.classList.remove('hidden');
        trackView.classList.add('hidden');
        btnSubmit.className = 'px-6 py-2.5 rounded-xl font-bold text-sm bg-white dark:bg-slate-700 text-blue-600 dark:text-blue-400 shadow-sm transition-all duration-300';
        btnTrack.className = 'px-6 py-2.5 rounded-xl font-bold text-sm text-slate-500 dark:text-slate-400 hover:bg-white/50 dark:hover:bg-slate-700/50 transition-all duration-300';
    } else {
        submitView.classList.add('hidden');
        trackView.classList.remove('hidden');
        btnTrack.className = 'px-6 py-2.5 rounded-xl font-bold text-sm bg-white dark:bg-slate-700 text-blue-600 dark:text-blue-400 shadow-sm transition-all duration-300';
        btnSubmit.className = 'px-6 py-2.5 rounded-xl font-bold text-sm text-slate-500 dark:text-slate-400 hover:bg-white/50 dark:hover:bg-slate-700/50 transition-all duration-300';
    }
};

// Generate unique Ticket ID
function generateTicketId() {
    return 'TK-' + Date.now().toString(36).toUpperCase() + Math.random().toString(36).substring(2, 6).toUpperCase();
}

// --- SECURITY: Enhanced Cooldown System ---
// Uses both localStorage AND a hash-based fingerprint to prevent bypass
const COMPLAINT_COOLDOWN_MS = 10 * 60 * 1000; // 10 minutes

// Generate a simple browser fingerprint hash
function getBrowserFingerprint() {
    const data = [
        navigator.userAgent,
        navigator.language,
        screen.width + 'x' + screen.height,
        new Date().getTimezoneOffset(),
        navigator.hardwareConcurrency || 'unknown'
    ].join('|');

    // Simple hash function
    let hash = 0;
    for (let i = 0; i < data.length; i++) {
        const char = data.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash; // Convert to 32bit integer
    }
    return 'fp_' + Math.abs(hash).toString(36);
}

function checkComplaintCooldown() {
    const fingerprint = getBrowserFingerprint();
    const storageKey = 'lastComplaintSubmit_' + fingerprint;
    const lastSubmit = localStorage.getItem(storageKey);

    // Also check the generic key (backwards compatibility)
    const genericLastSubmit = localStorage.getItem('lastComplaintSubmit');

    // Use the most recent timestamp from either source
    const timestamps = [lastSubmit, genericLastSubmit]
        .filter(Boolean)
        .map(t => parseInt(t))
        .filter(t => !isNaN(t));

    if (timestamps.length === 0) return { canSubmit: true };

    const mostRecent = Math.max(...timestamps);
    const elapsed = Date.now() - mostRecent;
    const remaining = COMPLAINT_COOLDOWN_MS - elapsed;

    if (remaining > 0) {
        const minutes = Math.floor(remaining / 60000);
        const seconds = Math.ceil((remaining % 60000) / 1000);
        return { canSubmit: false, remainingMinutes: minutes, remainingSeconds: seconds };
    }
    return { canSubmit: true };
}

// Save cooldown with fingerprint
function saveCooldownTimestamp() {
    const fingerprint = getBrowserFingerprint();
    const now = Date.now().toString();
    // Save to both fingerprinted and generic keys
    localStorage.setItem('lastComplaintSubmit_' + fingerprint, now);
    localStorage.setItem('lastComplaintSubmit', now);
}


// Submit complaint form (Single consolidated function)
window.submitComplaint = async (e) => {
    e.preventDefault();

    // Prevent double submission
    if (isSubmittingComplaint) return;

    const form = e.target;
    const btn = document.getElementById('btnSubmit');
    if (!btn) return;

    const detail = form.querySelector('[name="detail"]');
    if (!detail) return;

    const detailValid = validateInput(detail, { required: true });

    if (!detailValid) {
        showToast('กรุณากรอกรายละเอียดปัญหา', 'error');
        return;
    }

    // Check cooldown
    const cooldown = checkComplaintCooldown();
    if (!cooldown.canSubmit) {
        const timeStr = cooldown.remainingMinutes > 0
            ? `${cooldown.remainingMinutes} นาที ${cooldown.remainingSeconds} วินาที`
            : `${cooldown.remainingSeconds} วินาที`;
        Swal.fire({
            icon: 'warning',
            title: 'กรุณารอสักครู่',
            html: `คุณสามารถส่งเรื่องร้องเรียนใหม่ได้ในอีก <strong>${timeStr}</strong><br><small class="text-slate-500">ระบบจำกัดการส่ง 1 เรื่อง 10 นาที</small>`,
            confirmButtonColor: '#3B82F6'
        });
        return;
    }

    isSubmittingComplaint = true;
    const originalText = btn.innerHTML;
    btn.innerHTML = '<i class="fas fa-circle-notch fa-spin mr-2"></i>กำลังส่ง...';
    btn.disabled = true;

    const formData = new FormData(form);
    const ticketId = '#' + generateTicketId();

    const data = {
        ticketId: ticketId,
        topic: formData.get('topic'),
        name: formData.get('name') || 'Anonymous',
        detail: formData.get('detail'),
        status: 'Pending',
        timestamp: Date.now(),
        createdAt: new Date().toISOString()
    };

    try {
        await push(ref(db, 'complaints'), data);

        Swal.fire({
            icon: 'success',
            title: 'ส่งเรื่องเรียบร้อย',
            html:
                '<p style="margin-bottom: 1rem;">โปรดจดจำ Ticket ID ของคุณเพื่อติดตามสถานะ</p>' +
                '<div style="background: #eff6ff; padding: 1.5rem; border-radius: 1rem; margin-bottom: 1rem;">' +
                '<div style="font-size: 2rem; font-weight: bold; color: #2563eb; margin-bottom: 1rem;" id="ticketDisplay">' + ticketId + '</div>' +
                '<button onclick="navigator.clipboard.writeText(\'' + ticketId + '\'); this.innerHTML=\'✓ คัดลอกแล้ว!\'; setTimeout(() => this.innerHTML=\'📋 คัดลอก Ticket ID\', 2000)" ' +
                'style="padding: 0.5rem 1rem; background: #2563eb; color: white; border: none; border-radius: 0.5rem; cursor: pointer; font-weight: 500;">' +
                '📋 คัดลอก Ticket ID' +
                '</button>' +
                '</div>' +
                '<p style="font-size: 0.875rem; color: #64748b;">*แคปภาพหน้าจอนี้ไว้เป็นหลักฐาน</p>',
            confirmButtonColor: '#2563eb',
            confirmButtonText: 'OK',
            allowOutsideClick: false
        }).then(() => {
            window.closeComplaintScreen();
        });

        form.reset();
        detail.classList.remove('valid', 'invalid');

        // Save cooldown timestamp using fingerprint
        saveCooldownTimestamp();
    } catch (error) {
        console.error('Error submitting complaint:', error);
        Swal.fire({
            icon: 'error',
            title: 'เกิดข้อผิดพลาด',
            text: 'ไม่สามารถส่งข้อมูลได้ กรุณาลองใหม่',
            confirmButtonColor: '#3B82F6'
        });
    } finally {
        btn.innerHTML = originalText;
        btn.disabled = false;
        isSubmittingComplaint = false;
    }
};

// Check ticket status
window.checkTicket = async () => {
    const input = document.getElementById('trackInput');
    const resultDiv = document.getElementById('trackResult');
    if (!input) return;

    let ticketId = input.value.trim().toUpperCase();

    // Clean up the ticket ID - remove # and ensure TK- prefix
    ticketId = ticketId.replace(/^#/, ''); // Remove leading #

    // If user just typed the code part, add TK- prefix
    if (!ticketId.startsWith('TK-')) {
        ticketId = 'TK-' + ticketId;
    }

    // Add # prefix to match Firebase storage format (#TK-XXXXX)
    ticketId = '#' + ticketId;

    if (!ticketId || ticketId === '#TK-') {
        showToast('กรุณากรอก Ticket ID', 'error');
        return;
    }

    const btn = document.querySelector('#complaint-track-view button');
    if (!btn) return;

    const original = btn.innerHTML;
    btn.innerHTML = '<i class="fas fa-circle-notch fa-spin"></i> ตรวจสอบ...';
    btn.disabled = true;

    if (resultDiv) {
        resultDiv.classList.add('hidden');
    }

    try {
        const snapshot = await get(query(ref(db, 'complaints'), orderByChild('ticketId'), equalTo(ticketId)));

        if (resultDiv) {
            resultDiv.classList.remove('hidden');
            resultDiv.style.animation = 'fadeInScale 0.5s ease-out';
        }

        if (!snapshot.exists()) {
            if (resultDiv) {
                resultDiv.innerHTML = `
                    <div class="glass-card p-6 rounded-2xl text-center border-l-4 border-red-500 mt-6">
                        <i class="fas fa-times-circle text-4xl text-red-500 mb-3"></i>
                        <h4 class="font-bold text-lg text-slate-800 dark:text-white">ไม่พบข้อมูล</h4>
                        <p class="text-slate-500 text-sm">ไม่พบ Ticket ID นี้ในระบบ</p>
                    </div>`;
            }
            showToast('Ticket ไม่พบในระบบ', 'error');
            return;
        }

        const data = Object.values(snapshot.val())[0];
        const statusConfig = {
            'Pending': { icon: 'fa-clock', color: 'yellow', text: 'รอดำเนินการ' },
            'In Progress': { icon: 'fa-cog fa-spin', color: 'blue', text: 'กำลังดำเนินการ' },
            'Done': { icon: 'fa-check-circle', color: 'green', text: 'แก้ไขแล้ว' },
            'Completed': { icon: 'fa-check-circle', color: 'green', text: 'แก้ไขแล้ว' }
        };
        const status = statusConfig[data.status] || statusConfig['Pending'];

        // Update result display
        const iconEl = document.getElementById('trackStatusIcon');
        const titleEl = document.getElementById('trackStatusTitle');
        const descEl = document.getElementById('trackStatusDesc');
        const respEl = document.getElementById('trackResponse');

        if (iconEl) iconEl.innerHTML = `<i class="fas ${status.icon} text-${status.color}-500"></i>`;
        if (titleEl) titleEl.innerText = `${status.text} (${data.status})`;
        if (descEl) descEl.innerText = data.status === 'Pending'
            ? 'เรื่องของคุณได้รับเข้าระบบแล้ว กำลังรอการตรวจสอบ'
            : data.status === 'In Progress'
                ? 'สภานักเรียนกำลังดำเนินงานเรื่องนี้อยู่'
                : 'เรื่องร้องเรียนนี้ได้รับการแก้ไขแล้ว';
        if (respEl) {
            respEl.innerHTML = data.response
                ? `"${data.response}"`
                : `<span class="text-slate-400 italic">ยังไม่มีการตอบกลับจากเจ้าหน้าที่</span>`;
        }

        showToast('พบข้อมูลแล้ว!', 'success');
    } catch (error) {
        console.error('Error checking ticket:', error);
        showToast('เกิดข้อผิดพลาด', 'error');
    } finally {
        btn.innerHTML = original;
        btn.disabled = false;
    }
};

// --- OPEN NEWS DETAIL ---
window.openNewsDetail = (key) => {
    const item = window.newsData ? window.newsData[key] : null;
    if (!item) {
        console.error('News item not found for key:', key);
        return;
    }

    const modal = document.getElementById('news-modal');
    if (!modal) {
        alert(item.title + '\n\n' + (item.detail || 'ไม่มีรายละเอียด'));
        return;
    }

    const imgEl = document.getElementById('news-modal-img');
    const catEl = document.getElementById('news-modal-cat');
    const titleEl = document.getElementById('news-modal-title');
    const detailEl = document.getElementById('news-modal-detail');

    if (imgEl) imgEl.src = item.image;
    if (catEl) catEl.innerText = item.category;
    if (titleEl) titleEl.innerText = item.title;

    let detailHtml = item.detail || 'ไม่มีรายละเอียด';
    detailHtml = detailHtml.replace(/\\n/g, '<br>');
    detailHtml = detailHtml.replace(/\n/g, '<br>');
    detailHtml = detailHtml.replace(/(https?:\/\/[^\s<]+|www\.[^\s<]+)/g, (match) => {
        let url = match;
        if (!url.startsWith('http')) url = 'https://' + url;
        return `<a href="${url}" target="_blank" class="text-blue-500 hover:underline underline-offset-2">${match}</a>`;
    });

    if (detailEl) detailEl.innerHTML = detailHtml;

    modal.classList.remove('hidden');
};

// --- OPTIMIZED STATS CALCULATION ---
function updateStats() {
    const totalPolicies = Object.keys(policiesData).length;
    const donePolicies = Object.values(policiesData).filter(p => p.status === 'Completed').length;
    const successRate = totalPolicies > 0 ? Math.round((donePolicies / totalPolicies) * 100) : 0;
    const memberCount = Object.keys(membersData).length;
    const activeComplaints = Object.values(complaintsData).filter(c => c.status !== 'Done' && c.status !== 'Completed').length;

    // Update main stats
    if (document.getElementById("statSuccess")) {
        animateValue("statSuccess", parseInt(document.getElementById("statSuccess").innerText) || 0, successRate, 1000);
        animateValue("statMember", parseInt(document.getElementById("statMember").innerText) || 0, memberCount, 1000);
        animateValue("statActive", parseInt(document.getElementById("statActive").innerText) || 0, activeComplaints, 1000);
        const barEl = document.getElementById('barSuccess');
        if (barEl) barEl.style.width = successRate + '%';
    }

    // Update hero card stats
    if (document.getElementById("heroStatSuccess")) {
        document.getElementById("heroStatSuccess").innerText = successRate;
    }
    if (document.getElementById("heroStatMember")) {
        document.getElementById("heroStatMember").innerText = memberCount;
    }
    if (document.getElementById("heroStatActive")) {
        document.getElementById("heroStatActive").innerText = activeComplaints;
    }
}

// --- OPTIMIZED REALTIME LISTENERS (Targeted paths instead of root) ---

// 1. Policies Listener
const policyList = document.getElementById('policyList');
if (policyList) showSkeleton('policyList', 3, 'policy');

onValue(ref(db, 'policies'), (snapshot) => {
    const data = snapshot.val();
    policiesData = data || {};
    const container = document.getElementById('policyList');
    if (!container) {
        updateStats();
        return;
    }

    if (!data) {
        container.innerHTML = '<div class="text-center py-20 text-slate-400">ยังไม่มีนโยบาย</div>';
        updateStats();
        return;
    }

    // Build HTML in one go (optimized DOM manipulation)
    const htmlParts = [];
    let idx = 0;
    Object.values(data).forEach(item => {
        idx++;
        let theme = item.status === 'Completed'
            ? { c: 'bg-green-500', b: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300' }
            : (item.status === 'In Progress'
                ? { c: 'bg-blue-500', b: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300' }
                : { c: 'bg-yellow-400', b: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-300' });
        let imgHtml = item.image ? `<img src="${item.image}" class="w-full h-56 object-cover rounded-3xl mb-6 shadow-md hover:shadow-xl transition-shadow duration-500" loading="lazy">` : '';

        htmlParts.push(`
            <div class="glass-card p-10 rounded-[3rem] hover:border-blue-400/50 transition-all duration-500 hover:shadow-2xl group reveal">
                ${imgHtml}
                <div class="flex flex-col md:flex-row justify-between items-start mb-8 gap-4">
                    <div class="flex items-start gap-6">
                        <div class="w-16 h-16 rounded-3xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center font-black text-3xl text-slate-300 dark:text-slate-600 group-hover:text-blue-500 transition-colors">${idx}</div>
                        <div>
                            <h3 class="text-3xl font-display font-bold text-slate-900 dark:text-white leading-tight mb-2">${sanitizeHTML(item.title)}</h3>
                            <span class="${theme.b} px-4 py-1.5 rounded-full text-xs font-bold uppercase tracking-wider shadow-sm inline-block">${sanitizeHTML(item.status)}</span>
                        </div>
                    </div>
                </div>
                <div class="md:pl-24">
                    <div class="flex justify-between text-xs font-bold text-slate-400 uppercase mb-2"><span>Progress</span><span>${item.percent}%</span></div>
                    <div class="w-full bg-slate-100 dark:bg-slate-700/50 h-3 rounded-full overflow-hidden mb-6"><div id="prog-${idx}" class="${theme.c} h-full transition-all duration-[1500ms] ease-out shadow-[0_0_15px_rgba(0,0,0,0.2)]" style="width:0%"></div></div>
                    <p class="text-slate-600 dark:text-slate-400 text-lg leading-relaxed">${sanitizeHTML(item.detail)}</p>
                </div>
            </div>`);
    });

    container.innerHTML = htmlParts.join('');
    container.style.opacity = '0';

    // Animate progress bars
    idx = 0;
    Object.values(data).forEach(item => {
        idx++;
        setTimeout(() => {
            const progEl = document.getElementById(`prog-${idx}`);
            if (progEl) progEl.style.width = item.percent + '%';
        }, 200 + (idx * 100));
    });

    setTimeout(() => {
        container.style.opacity = '1';
        container.style.transition = 'opacity 0.5s ease-in-out';
    }, 50);

    updateStats();
});

// 2. Members Listener
const teamGrid = document.getElementById('teamGrid');
if (teamGrid) showSkeleton('teamGrid', 6, 'card');

onValue(ref(db, 'members'), (snapshot) => {
    const data = snapshot.val();
    membersData = data || {};
    const container = document.getElementById('teamGrid');
    if (!container) {
        updateStats();
        return;
    }

    if (!data) {
        container.innerHTML = '<div class="col-span-full text-center text-slate-400 py-10">ไม่พบข้อมูลสมาชิก</div>';
        updateStats();
        return;
    }

    const htmlParts = Object.keys(data).map(key => {
        const item = data[key];
        return `
            <div onclick="window.openMemberDetail('${key}')" class="glass-card rounded-[3rem] overflow-hidden group hover:-translate-y-3 transition-all duration-500 cursor-pointer border-0 shadow-lg hover:shadow-2xl reveal">
                <div class="h-96 bg-slate-200 dark:bg-slate-800 overflow-hidden relative">
                    <img src="${item.image}" class="w-full h-full object-cover transition duration-700 group-hover:scale-105" loading="lazy" onerror="this.src='data:image/svg+xml;charset=UTF-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22400%22%20height%3D%22500%22%20viewBox%3D%220%200%20400%20500%22%3E%3Crect%20fill%3D%22%23cbd5e1%22%20width%3D%22400%22%20height%3D%22500%22%2F%3E%3Ctext%20fill%3D%22%2364748b%22%20font-family%3D%22sans-serif%22%20font-size%3D%2230%22%20dy%3D%2210.5%22%20font-weight%3D%22bold%22%20x%3D%2250%25%22%20y%3D%2250%25%22%20text-anchor%3D%22middle%22%3EUser%3C%2Ftext%3E%3C%2Fsvg%3E'">
                    <div class="absolute bottom-0 left-0 w-full p-8 bg-gradient-to-t from-slate-900 via-slate-900/80 to-transparent pt-32">
                        <span class="text-blue-400 text-xs font-bold tracking-widest uppercase mb-1 block">${sanitizeHTML(item.role)}</span>
                        <h4 class="text-2xl font-display font-bold text-white leading-tight drop-shadow-md group-hover:text-blue-200 transition-colors">${sanitizeHTML(item.name)}</h4>
                    </div>
                </div>
                <div class="p-6 bg-white dark:bg-slate-800 flex justify-between items-center relative z-10">
                    <span class="text-xs font-bold text-slate-400 tracking-wider">ดูประวัติ</span>
                    <div class="w-10 h-10 rounded-full bg-slate-100 dark:bg-slate-700 hover:bg-blue-600 hover:text-white dark:hover:bg-blue-500 dark:hover:text-white flex items-center justify-center transition-all duration-300 text-slate-400 dark:text-slate-300"><i class="fas fa-arrow-right"></i></div>
                </div>
            </div>`;
    });

    container.innerHTML = htmlParts.join('');
    container.style.opacity = '0';

    setTimeout(() => {
        container.style.opacity = '1';
        container.style.transition = 'opacity 0.5s ease-in-out';
    }, 50);

    updateStats();
});

// 3. Complaints Listener (for stats only on main page)
onValue(ref(db, 'complaints'), (snapshot) => {
    complaintsData = snapshot.val() || {};
    updateStats();
});

// 4. Activities (News) Listener
const activityGallery = document.getElementById('activityGallery');
if (activityGallery) showSkeleton('activityGallery', 6, 'card');

onValue(ref(db, 'activities'), (snapshot) => {
    const data = snapshot.val();
    const grid = document.getElementById('activityGallery');
    if (!grid) return;

    window.newsData = data || {};

    if (!data) {
        grid.innerHTML = '<div class="col-span-full text-center text-slate-400 py-10">ไม่พบข่าวสาร</div>';
        grid.style.opacity = '1';
        return;
    }

    const items = Object.entries(data).map(([key, value]) => ({ key, ...value })).reverse();

    const htmlParts = items.map(item => `
        <div onclick="window.openNewsDetail('${item.key}')" class="bg-white dark:bg-slate-800 rounded-3xl shadow-sm overflow-hidden group relative border border-slate-100 dark:border-white/5 hover:shadow-lg transition-all duration-300 cursor-pointer">
            <div class="h-48 bg-slate-100 dark:bg-slate-700/50 relative overflow-hidden">
                <img src="${item.image}" class="w-full h-full object-cover group-hover:scale-105 transition duration-500" loading="lazy" onerror="this.src='data:image/svg+xml;charset=UTF-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22600%22%20height%3D%22400%22%20viewBox%3D%220%200%20600%20400%22%3E%3Crect%20fill%3D%22%23cbd5e1%22%20width%3D%22600%22%20height%3D%22400%22%2F%3E%3Ctext%20fill%3D%22%2364748b%22%20font-family%3D%22sans-serif%22%20font-size%3D%2230%22%20dy%3D%2210.5%22%20font-weight%3D%22bold%22%20x%3D%2250%25%22%20y%3D%2250%25%22%20text-anchor%3D%22middle%22%3ENo%20Image%3C%2Ftext%3E%3C%2Fsvg%3E'">
                <div class="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent opacity-60"></div>
                <span class="absolute bottom-3 left-3 text-[10px] font-bold bg-white/90 dark:bg-black/80 text-slate-900 dark:text-white px-2 py-1 rounded-lg uppercase tracking-wider backdrop-blur-sm shadow-sm">${sanitizeHTML(item.category)}</span>
            </div>
            <div class="p-5">
                <h3 class="font-bold text-slate-800 dark:text-white line-clamp-2 text-lg mb-2 group-hover:text-blue-600 transition-colors">${sanitizeHTML(item.title)}</h3>
                <p class="text-sm text-slate-500 dark:text-slate-400 line-clamp-2 mb-3">${sanitizeHTML(item.detail) || '...'}</p>
                <button onclick="event.stopPropagation(); window.openNewsDetail('${item.key}')" class="text-xs font-bold text-blue-600 bg-blue-50 dark:bg-blue-900/30 px-3 py-1.5 rounded-lg hover:bg-blue-100 dark:hover:bg-blue-900/50 transition-colors">
                    อ่านรายละเอียด <i class="fas fa-arrow-right ml-1"></i>
                </button>
            </div>
        </div>`);

    grid.innerHTML = htmlParts.join('');
    grid.style.opacity = '0';

    setTimeout(() => {
        grid.style.opacity = '1';
        grid.style.transition = 'opacity 0.3s ease-in-out';
    }, 50);
});

// 5. Q&A Listener (limit to 50)
const qaList = document.getElementById('qaList');
if (qaList) showSkeleton('qaList', 4, 'qa');

onValue(query(ref(db, 'qa'), limitToLast(50)), (snapshot) => {
    const data = snapshot.val();
    const container = document.getElementById('qaList');
    if (!container) return;

    if (!data) {
        container.innerHTML = '<div class="p-8 text-center text-slate-400 border border-dashed border-slate-300 rounded-3xl">ยังไม่มีคำถาม เป็นคนแรกเลย!</div>';
        return;
    }

    const htmlParts = Object.values(data).reverse().map(item => {
        let statusBadge = item.status === 'Answered'
            ? '<span class="bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 text-[10px] font-bold px-2 py-1 rounded-full"><i class="fas fa-check-circle mr-1"></i> ตอบแล้ว</span>'
            : '<span class="bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400 text-[10px] font-bold px-2 py-1 rounded-full"><i class="fas fa-clock mr-1"></i> รอคำตอบ</span>';

        let answerHtml = item.answer
            ? `<div class="mt-6 pt-6 border-t border-slate-100 dark:border-slate-700/50">
                <div class="flex gap-4">
                    <div class="w-10 h-10 rounded-xl bg-blue-600 flex-shrink-0 flex items-center justify-center text-white text-sm font-bold shadow-lg shadow-blue-500/30">SC</div>
                    <div>
                        <p class="text-xs font-bold text-slate-400 uppercase tracking-wide mb-1">คำตอบจากสภา</p>
                        <p class="text-slate-700 dark:text-slate-300 text-base leading-relaxed">${sanitizeHTML(item.answer)}</p>
                    </div>
                </div>
               </div>`
            : '';

        const timestamp = item.timestamp || item.createdAt;
        const dateStr = timestamp ? new Date(timestamp).toLocaleDateString('th-TH') : '-';

        return `
            <div class="glass-card p-8 rounded-[2.5rem] hover:border-blue-300/30 transition-all duration-300 group reveal">
                <div class="flex justify-between items-start mb-4">
                    <span class="text-xs text-slate-400 font-mono flex items-center gap-2"><i class="far fa-calendar-alt"></i> ${dateStr}</span>
                    ${statusBadge}
                </div>
                <h4 class="font-bold text-xl text-slate-900 dark:text-white mb-2 group-hover:text-blue-500 transition-colors">"${sanitizeHTML(item.question)}"</h4>
                ${answerHtml}
            </div>`;
    });

    container.innerHTML = htmlParts.join('');
    container.style.opacity = '0';

    setTimeout(() => {
        container.style.opacity = '1';
        container.style.transition = 'opacity 0.5s ease-in-out';
    }, 50);
});

// 6. Calendar Logic
function renderCalendar() {
    const grid = document.getElementById('calendarGrid');
    const header = document.getElementById('calendarMonthYear');
    if (!grid || !header) return;

    const year = currentCalendarDate.getFullYear();
    const month = currentCalendarDate.getMonth();

    const monthNames = ["มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน", "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม"];
    header.innerText = `${monthNames[month]} ${year + 543}`;

    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    const htmlParts = [];

    // Empty cells for previous month
    for (let i = 0; i < firstDay; i++) {
        htmlParts.push(`<div class="calendar-day empty"></div>`);
    }

    const today = new Date();
    const isCurrentMonth = today.getMonth() === month && today.getFullYear() === year;

    for (let day = 1; day <= daysInMonth; day++) {
        let className = 'calendar-day';
        if (isCurrentMonth && day === today.getDate()) className += ' today';

        let dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

        let daysEvents = [];
        if (eventsData) {
            daysEvents = Object.values(eventsData).filter(e => e.date === dateStr);
        }

        let dotsHtml = '<div class="event-dots">';
        daysEvents.slice(0, 3).forEach(e => {
            let colorClass = 'bg-blue-500';
            if (e.category === 'ACADEMIC') colorClass = 'bg-orange-500';
            else if (e.category === 'HOLIDAY') colorClass = 'bg-red-500';
            else if (e.category === 'IMPORTANT') colorClass = 'bg-purple-500';
            dotsHtml += `<div class="event-dot ${colorClass}"></div>`;
        });
        dotsHtml += '</div>';

        htmlParts.push(`
            <div class="${className}" onclick="window.openDayEvents('${dateStr}')">
                <span class="text-slate-700 dark:text-slate-300 font-bold z-10">${day}</span>
                ${dotsHtml}
            </div>
        `);
    }

    grid.innerHTML = htmlParts.join('');
}

window.changeMonth = (delta) => {
    currentCalendarDate.setMonth(currentCalendarDate.getMonth() + delta);
    renderCalendar();
};

window.openDayEvents = (dateStr) => {
    const events = Object.values(eventsData).filter(e => e.date === dateStr);

    if (events.length === 0) {
        showToast('ไม่มีกิจกรรมในวันนี้', 'info');
        return;
    }

    window.openEventDetail(events[0]);
};

window.openEventDetail = (event) => {
    const titleEl = document.getElementById('event-modal-title');
    const timeEl = document.getElementById('event-modal-time');
    const locEl = document.getElementById('event-modal-loc');
    const descEl = document.getElementById('event-modal-desc');
    const badge = document.getElementById('event-modal-badge');

    if (titleEl) titleEl.innerText = event.title;
    if (timeEl) timeEl.innerText = event.time || 'All Day';
    if (locEl) locEl.innerText = event.location || '-';
    if (descEl) descEl.innerText = event.description || '-';

    if (badge) {
        badge.innerText = event.category;
        badge.className = 'inline-block px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest mb-3 ';

        if (event.category === 'ACADEMIC') badge.classList.add('bg-orange-100', 'text-orange-600');
        else if (event.category === 'HOLIDAY') badge.classList.add('bg-red-100', 'text-red-600');
        else if (event.category === 'IMPORTANT') badge.classList.add('bg-purple-100', 'text-purple-600');
        else badge.classList.add('bg-blue-100', 'text-blue-600');
    }

    const modal = document.getElementById('event-modal');
    if (modal) modal.classList.remove('hidden');
};

// 7. Events Listener
onValue(ref(db, 'events'), (snapshot) => {
    eventsData = snapshot.val() || {};
    renderCalendar();

    const upcomingContainer = document.getElementById('upcomingList');
    if (!upcomingContainer) return;

    const todayStr = new Date().toISOString().split('T')[0];
    const upcomingEvents = Object.values(eventsData)
        .filter(e => e.date >= todayStr)
        .sort((a, b) => a.date.localeCompare(b.date))
        .slice(0, 4);

    if (upcomingEvents.length === 0) {
        upcomingContainer.innerHTML = '<p class="text-white/70 text-sm">ไม่มีกิจกรรมเร็วๆ นี้</p>';
        return;
    }

    const htmlParts = upcomingEvents.map(e => {
        let dateObj = new Date(e.date);
        let day = dateObj.getDate();
        let month = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."][dateObj.getMonth()];

        return `
            <div class="bg-white/10 backdrop-blur-md p-3 rounded-xl flex items-center gap-4 cursor-pointer hover:bg-white/20 transition" onclick='window.openEventDetail(${JSON.stringify(e)})'>
                <div class="bg-white text-blue-600 rounded-lg p-2 min-w-[50px] text-center">
                    <div class="text-xs font-bold uppercase">${month}</div>
                    <div class="text-xl font-bold leading-none">${day}</div>
                </div>
                <div>
                    <h4 class="font-bold text-sm leading-tight mb-1 text-white">${e.title}</h4>
                    <p class="text-xs text-blue-100">${e.category}</p>
                </div>
            </div>
        `;
    });

    upcomingContainer.innerHTML = htmlParts.join('');
});

// 8. Announcement Popup
onValue(ref(db, 'announcement'), (snapshot) => {
    const data = snapshot.val();
    const popup = document.getElementById('announcement-popup');
    if (popup && data && data.active) {
        const titleEl = document.getElementById('anno-title');
        const detailEl = document.getElementById('anno-detail');
        const imgContainer = document.getElementById('anno-img-container');
        const img = document.getElementById('anno-img');

        if (titleEl) titleEl.innerText = data.title;
        if (detailEl) detailEl.innerText = data.detail;

        if (data.image && imgContainer && img) {
            imgContainer.classList.remove('hidden');
            img.src = data.image;
        } else if (imgContainer) {
            imgContainer.classList.add('hidden');
        }
        popup.classList.remove('hidden');
    } else if (popup && !popup.classList.contains('hidden')) {
        const content = popup.children[0];
        if (content) {
            content.classList.add('animate-popout');
            setTimeout(() => {
                popup.classList.add('hidden');
                content.classList.remove('animate-popout');
            }, 300);
        }
    }
});

// 9. Maintenance Mode
onValue(ref(db, 'maintenance'), (snapshot) => {
    const isMaintenance = snapshot.val();
    const screen = document.getElementById('maintenance-screen');
    const urlParams = new URLSearchParams(window.location.search);
    const isBypass = urlParams.get('mode') === 'admin';

    if (screen && isMaintenance && !isBypass) {
        screen.classList.remove('hidden');
        screen.classList.add('flex');
        document.body.style.overflow = 'hidden';
    } else if (screen) {
        screen.classList.add('hidden');
        screen.classList.remove('flex');
        document.body.style.overflow = '';
    }
});

// --- Q&A FUNCTIONS ---

// Thai Profanity Filter
const BANNED_WORDS = [
    'ควย', 'หี', 'เหี้ย', 'สัตว์', 'แม่ง', 'มึง', 'กู', 'เย็ด', 'สันดาน', 'อีดอก',
    'อีสัตว์', 'ไอ้บ้า', 'อีบ้า', 'ชาติหมา', 'ส้นตีน', 'อีควาย', 'ไอ้ควาย', 'หน้าหี',
    'เงี่ยน', 'อมควย', 'fuck', 'shit', 'bitch', 'dick', 'pussy', 'asshole',
    'แตด', 'จิ๋ม', 'ดอ', 'ไอ้สัส', 'ไอ้เหี้ย', 'อีเหี้ย', 'เย็ดแม่', 'เย็ดเป็ด', 'เย็ดเข้',
    'กะหรี่', 'แมงดา', 'ดอกทอง', 'ระยำ', 'จัญไร', 'เสนียด', 'สวะ', 'เสือก', 'ถุย',
    'พ่อง', 'แม่ง', 'ไอ้เวร', 'อีเวร', 'สารเลว', 'หน้าตัวเมีย', 'ลูกกะหรี่', 'พ่อมึงตาย',
    'แม่มึงตาย', 'ไอ้หน้าโง่', 'ปัญญาอ่อน', 'สมองหมา', 'ต่ำตม', 'แรด', 'ร่าน', 'หน้าด้าน',
    'ตอแหล', 'ขยะสังคม', 'เปรต', 'นรก', 'ชิงหมาเกิด', 'ไอ้ขี้', 'ขี้', 'cunt', 'whore',
    'slut', 'bastard', 'motherfucker', 'cock', 'sucker', 'wanker', 'twat', 'retard', 'faggot',
    'nigger', 'dyke', 'bollocks', 'bugger', 'prick', 'bullshit', 'douchebag', 'idiot', 'moron', 'scum'
];

function containsProfanity(text) {
    const lowerText = text.toLowerCase();
    return BANNED_WORDS.some(word => lowerText.includes(word.toLowerCase()));
}

// Cooldown Check (1 hour)
const QA_COOLDOWN_MS = 60 * 60 * 1000;

function checkQaCooldown() {
    const lastSubmit = localStorage.getItem('lastQaSubmit');
    if (!lastSubmit) return { canSubmit: true };

    const elapsed = Date.now() - parseInt(lastSubmit);
    const remaining = QA_COOLDOWN_MS - elapsed;

    if (remaining > 0) {
        const minutes = Math.ceil(remaining / 60000);
        return { canSubmit: false, remainingMinutes: minutes };
    }
    return { canSubmit: true };
}

// Submit Q&A (Single consolidated function with validation)
window.submitQa = async (e) => {
    e.preventDefault();

    if (isSubmittingQA) return;

    const form = e.target;
    const btn = document.getElementById('btnQaSubmit');
    if (!btn) return;

    const formData = new FormData(form);
    const question = formData.get('question');

    if (!question || question.trim() === '') {
        showToast('กรุณากรอกคำถาม', 'error');
        return;
    }

    if (containsProfanity(question)) {
        Swal.fire({
            icon: 'error',
            title: 'ไม่อนุญาต',
            text: 'คำถามของคุณมีคำไม่เหมาะสม กรุณาแก้ไขก่อนส่ง',
            confirmButtonColor: '#3B82F6'
        });
        return;
    }

    const cooldown = checkQaCooldown();
    if (!cooldown.canSubmit) {
        Swal.fire({
            icon: 'warning',
            title: 'กรุณารอสักครู่',
            html: `คุณสามารถส่งคำถามใหม่ได้ในอีก <strong>${cooldown.remainingMinutes} นาที</strong><br><small class="text-slate-500">ระบบจำกัดการส่ง 1 คำถาม/ชั่วโมง เพื่อป้องกัน Spam</small>`,
            confirmButtonColor: '#3B82F6'
        });
        return;
    }

    isSubmittingQA = true;
    const originalText = btn.innerHTML;
    btn.innerHTML = '<i class="fas fa-circle-notch fa-spin mr-2"></i>กำลังส่ง...';
    btn.disabled = true;

    const data = {
        question: question.trim(),
        answer: '',
        status: 'pending',
        timestamp: Date.now(),
        createdAt: new Date().toISOString()
    };

    try {
        await push(ref(db, 'qa'), data);
        localStorage.setItem('lastQaSubmit', Date.now().toString());

        Swal.fire({
            icon: 'success',
            title: 'ส่งคำถามสำเร็จ!',
            text: 'คำถามของคุณถูกส่งแล้ว รอคำตอบจากสภานักเรียน',
            confirmButtonColor: '#3B82F6'
        });
        form.reset();
    } catch (error) {
        console.error('Error submitting Q&A:', error);
        showToast('เกิดข้อผิดพลาด กรุณาลองใหม่', 'error');
    } finally {
        btn.innerHTML = originalText;
        btn.disabled = false;
        isSubmittingQA = false;
    }
};

// --- THEME & MENU TOGGLE FUNCTIONS ---

window.toggleTheme = () => {
    const html = document.documentElement;
    const icon = document.getElementById('theme-icon');

    if (html.classList.contains('dark')) {
        html.classList.remove('dark');
        localStorage.theme = 'light';
        if (icon) icon.className = 'fas fa-moon text-lg transition-transform duration-500';
    } else {
        html.classList.add('dark');
        localStorage.theme = 'dark';
        if (icon) icon.className = 'fas fa-sun text-lg transition-transform duration-500';
    }
};

window.toggleMobileMenu = () => {
    const menu = document.getElementById('mobile-menu');
    if (menu) menu.classList.toggle('hidden');
};

// --- PAGE SWITCHING ---

window.switchPage = (pageId) => {
    const currentResults = document.querySelectorAll('.page-section.active');
    const targetPage = document.getElementById('page-' + pageId);

    // Update nav immediately
    document.querySelectorAll('.nav-btn').forEach(btn => btn.classList.remove('active'));
    const navBtn = document.getElementById('nav-' + pageId);
    if (navBtn) navBtn.classList.add('active');

    window.scrollTo({ top: 0, behavior: 'smooth' });

    if (currentResults.length > 0) {
        currentResults.forEach(page => {
            page.classList.add('fading-out');
            page.classList.remove('active');

            setTimeout(() => {
                page.classList.remove('fading-out');
                page.style.display = 'none';
            }, 400);
        });

        setTimeout(() => {
            document.querySelectorAll('.page-section').forEach(el => el.style.display = 'none');
            if (targetPage) {
                targetPage.style.display = 'block';
                void targetPage.offsetWidth;
                targetPage.classList.add('active');
            }
        }, 400);
    } else {
        if (targetPage) {
            targetPage.style.display = 'block';
            setTimeout(() => targetPage.classList.add('active'), 50);
        }
    }
};

// --- SCROLL REVEAL ---

const observerOptions = {
    threshold: 0.1,
    rootMargin: "0px 0px -50px 0px"
};

const scrollObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
        if (entry.isIntersecting) {
            entry.target.classList.add('active');
            scrollObserver.unobserve(entry.target);
        }
    });
}, observerOptions);

function initScrollReveal() {
    document.querySelectorAll('.reveal').forEach(el => scrollObserver.observe(el));
}

// --- MODAL FUNCTIONS ---

window.closeComplaintScreen = () => {
    const screens = ['complaint-screen', 'qa-screen', 'track-screen'];
    screens.forEach(id => {
        const el = document.getElementById(id);
        if (el && !el.classList.contains('hidden')) {
            const content = el.children[0];
            if (content) {
                content.classList.add('animate-popout');
                setTimeout(() => {
                    el.classList.add('hidden');
                    content.classList.remove('animate-popout');
                }, 300);
            }
        }
    });
};

window.openMemberDetail = (key) => {
    const item = membersData[key];
    if (!item) return;

    const nameEl = document.getElementById('modal-name');
    const roleEl = document.getElementById('modal-role');
    const imgEl = document.getElementById('modal-member-img');
    const mottoEl = document.getElementById('modal-motto');
    const bioEl = document.getElementById('modal-bio');
    const bioContainer = document.getElementById('modal-bio-container');

    if (nameEl) nameEl.innerText = item.name;
    if (roleEl) roleEl.innerText = item.role;
    if (imgEl) imgEl.src = item.image;

    if (mottoEl && mottoEl.parentElement) {
        if (item.motto) {
            mottoEl.innerText = `"${item.motto}"`;
            mottoEl.parentElement.classList.remove('hidden');
        } else {
            mottoEl.parentElement.classList.add('hidden');
        }
    }

    if (bioEl && bioContainer) {
        if (item.bio) {
            bioEl.innerText = item.bio;
            bioContainer.classList.remove('hidden');
        } else {
            bioContainer.classList.add('hidden');
        }
    }

    const modal = document.getElementById('member-detail-modal');
    if (modal) {
        const modalContent = modal.querySelector('.glass-card');
        if (modalContent) {
            modalContent.classList.remove('animate-popout');
            modalContent.classList.add('animate-popup');
        }

        modal.classList.remove('hidden');
        modal.classList.add('flex');
        document.body.style.overflow = 'hidden';
    }
};

window.closeMemberDetail = () => {
    const modal = document.getElementById('member-detail-modal');
    if (!modal) return;

    const modalContent = modal.querySelector('.glass-card');
    if (modalContent) {
        modalContent.classList.add('animate-popout');

        setTimeout(() => {
            modal.classList.add('hidden');
            modal.classList.remove('flex');
            modalContent.classList.remove('animate-popout');
            document.body.style.overflow = '';
        }, 300);
    }
};

// --- ANIMATION HELPER ---

function animateValue(id, start, end, duration) {
    if (start === end) return;
    const obj = document.getElementById(id);
    if (!obj) return;

    let startTimestamp = null;
    const step = (timestamp) => {
        if (!startTimestamp) startTimestamp = timestamp;
        const progress = Math.min((timestamp - startTimestamp) / duration, 1);
        obj.innerHTML = Math.floor(progress * (end - start) + start);
        if (progress < 1) window.requestAnimationFrame(step);
    };
    window.requestAnimationFrame(step);
}

// --- INITIALIZATION ---

// Check and apply theme
if (localStorage.theme === 'dark' || (!('theme' in localStorage) && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
    document.documentElement.classList.add('dark');
    const icon = document.getElementById('theme-icon');
    if (icon) icon.className = 'fas fa-sun text-lg transition-transform duration-500';
}

// On page load
window.addEventListener('load', () => {
    window.scrollTo(0, 0);
    window.switchPage('home');
    initScrollReveal();
});

// MutationObserver for dynamic content
const contentObserver = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
        if (mutation.addedNodes.length) {
            initScrollReveal();
        }
    });
});

contentObserver.observe(document.body, { childList: true, subtree: true });

// --- CONNECTION STATE MONITORING ---
onValue(ref(db, '.info/connected'), (snap) => {
    // Only show toast after initial load to avoid showing on page load
    if (window._connectionInitialized) {
        if (snap.val() === true) {
            showToast('เชื่อมต่อสำเร็จ', 'success');
        } else {
            showToast('ขาดการเชื่อมต่อ กำลังเชื่อมต่อใหม่...', 'warning');
        }
    } else {
        window._connectionInitialized = true;
    }
});