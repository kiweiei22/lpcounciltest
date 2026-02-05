// --- Admin.js (Turso Version) ---
// Uses Turso API instead of Firebase Realtime Database
// Keeps Firebase Auth for authentication

import { signInWithEmailAndPassword, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { auth } from "./config.js";
import {
    polling,
    startPolling,
    setAuthToken,
    onValue,
    policies as policiesApi,
    members as membersApi,
    complaints as complaintsApi,
    activities as activitiesApi,
    qa as qaApi,
    events as eventsApi,
    settings as settingsApi
} from "./turso-api.js";

let policiesData = {};
let qaData = {};
let membersData = {};
let eventsData = {};
let complaintsData = {};

// --- SECURITY: XSS Sanitization ---
function sanitizeHTML(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

// --- UTILITY FUNCTIONS ---

function showSkeleton(containerId, count = 3, type = 'card') {
    const container = document.getElementById(containerId);
    if (!container) return;

    container.innerHTML = '';
    for (let i = 0; i < count; i++) {
        if (type === 'card') {
            container.innerHTML += `<div class="skeleton-card"></div>`;
        } else if (type === 'table') {
            container.innerHTML += `
                <tr class="animate-pulse">
                    <td class="px-6 py-4"><div class="skeleton-text w-24"></div></td>
                    <td class="px-6 py-4"><div class="skeleton-text"></div></td>
                    <td class="px-6 py-4"><div class="skeleton-text w-32"></div></td>
                    <td class="px-6 py-4"><div class="skeleton-text w-20"></div></td>
                </tr>`;
        } else if (type === 'grid') {
            container.innerHTML += `
                <div class="glass-card animate-pulse rounded-[2rem] p-6">
                    <div class="skeleton-title mb-4"></div>
                    <div class="skeleton-text mb-2"></div>
                    <div class="skeleton-text w-3/4"></div>
                </div>`;
        }
    }
}

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
    }

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
    }

    return isValid;
}

// --- AUTH & SESSION (Firebase Authentication) ---

window.checkLogin = async () => {
    const emailInput = document.getElementById('emailInput');
    const passwordInput = document.getElementById('passwordInput');
    const loginBtn = document.getElementById('loginBtn');
    const loginBtnText = document.getElementById('loginBtnText');
    const loginError = document.getElementById('loginError');

    const email = emailInput.value.trim();
    const password = passwordInput.value;

    if (!email || !password) {
        loginError.textContent = 'กรุณากรอก Email และ Password';
        loginError.classList.remove('hidden');
        return;
    }

    loginBtn.disabled = true;
    loginBtnText.innerHTML = '<i class="fas fa-circle-notch fa-spin mr-2"></i>Signing in...';
    loginError.classList.add('hidden');

    try {
        const userCredential = await signInWithEmailAndPassword(auth, email, password);
        // Get ID token for API calls
        const token = await userCredential.user.getIdToken();
        setAuthToken(token);

        const Toast = Swal.mixin({ toast: true, position: 'top-end', showConfirmButton: false, timer: 1500 });
        Toast.fire({ icon: 'success', title: 'เข้าสู่ระบบสำเร็จ' });
    } catch (error) {
        console.error('Login error:', error);

        let errorMsg = 'เกิดข้อผิดพลาด กรุณาลองใหม่';
        if (error.code === 'auth/user-not-found' || error.code === 'auth/wrong-password' || error.code === 'auth/invalid-credential') {
            errorMsg = 'Email หรือ Password ไม่ถูกต้อง';
        } else if (error.code === 'auth/too-many-requests') {
            errorMsg = 'ลองผิดหลายครั้งเกินไป กรุณารอสักครู่';
        } else if (error.code === 'auth/invalid-email') {
            errorMsg = 'รูปแบบ Email ไม่ถูกต้อง';
        }

        loginError.textContent = errorMsg;
        loginError.classList.remove('hidden');

        loginBtn.disabled = false;
        loginBtnText.innerHTML = 'Sign In';
    }
};

window.checkSession = () => {
    onAuthStateChanged(auth, async (user) => {
        if (user) {
            // Get and set auth token
            const token = await user.getIdToken();
            setAuthToken(token);

            document.getElementById('loginScreen').classList.add('hidden');
            document.getElementById('dashboard').classList.remove('hidden');
            document.getElementById('dashboard').classList.add('flex');
            initRealtimeListeners();
            window.switchTab('overview');

            const welcomeEl = document.querySelector('#view-overview h2');
            if (welcomeEl) {
                welcomeEl.innerHTML = `สวัสดี <span class="text-brand-500">${user.email.split('@')[0]}</span>`;
            }
        } else {
            document.getElementById('loginScreen').classList.remove('hidden');
            document.getElementById('dashboard').classList.add('hidden');
            document.getElementById('dashboard').classList.remove('flex');
        }
    });
};

window.logout = async () => {
    try {
        await signOut(auth);
        setAuthToken(null);
        const Toast = Swal.mixin({ toast: true, position: 'top-end', showConfirmButton: false, timer: 1500 });
        Toast.fire({ icon: 'info', title: 'ออกจากระบบแล้ว' });
    } catch (error) {
        console.error('Logout error:', error);
        showToast('เกิดข้อผิดพลาดในการออกจากระบบ', 'error');
    }
};

window.toggleSidebar = () => {
    const sb = document.getElementById('sidebar');
    const overlay = document.getElementById('sidebarOverlay');
    if (sb.classList.contains('-translate-x-[110%]')) {
        sb.classList.remove('-translate-x-[110%]');
        overlay.classList.remove('hidden');
    } else {
        sb.classList.add('-translate-x-[110%]');
        overlay.classList.add('hidden');
    }
};

window.switchTab = (tab) => {
    ['overview', 'complaints', 'policies', 'qa', 'announcement', 'activities', 'members', 'calendar'].forEach(t => {
        const el = document.getElementById('view-' + t);
        const btn = document.getElementById('btn-' + t);
        if (el) el.classList.add('hidden');
        if (btn) { btn.classList.remove('active', 'bg-blue-50', 'text-blue-600'); btn.classList.add('text-slate-500'); }
    });

    document.getElementById('view-' + tab).classList.remove('hidden');
    const activeBtn = document.getElementById('btn-' + tab);
    if (activeBtn) {
        activeBtn.classList.add('active', 'bg-blue-50', 'text-blue-600');
        activeBtn.classList.remove('text-slate-500');
    }

    if (window.innerWidth < 768) {
        const sb = document.getElementById('sidebar');
        if (!sb.classList.contains('-translate-x-[110%]')) {
            window.toggleSidebar();
        }
    }
};

window.toggleDarkMode = () => {
    document.documentElement.classList.toggle('dark');
    const isDark = document.documentElement.classList.contains('dark');
    localStorage.theme = isDark ? 'dark' : 'light';

    const btn = document.getElementById('darkModeBtn');
    if (btn) {
        btn.innerHTML = isDark
            ? '<i class="fas fa-sun w-5 text-center text-yellow-400"></i> <span>Light Mode</span>'
            : '<i class="fas fa-moon w-5 text-center"></i> <span>Dark Mode</span>';
    }
};

if (localStorage.theme === 'dark' || (!('theme' in localStorage) && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
    document.documentElement.classList.add('dark');
    const btn = document.getElementById('darkModeBtn');
    if (btn) btn.innerHTML = '<i class="fas fa-sun w-5 text-center text-yellow-400"></i> <span>Light Mode</span>';
}

// --- OPEN NEWS DETAIL ---
window.openNewsDetail = (key) => {
    const item = window.newsData ? window.newsData[key] : null;
    if (!item) return;

    document.getElementById('news-modal-img').src = item.image;
    document.getElementById('news-modal-cat').innerText = item.category;
    document.getElementById('news-modal-title').innerText = item.title;

    let detailHtml = item.detail || 'ไม่มีรายละเอียด';
    detailHtml = detailHtml.replace(/\\n/g, '<br>');
    detailHtml = detailHtml.replace(/\n/g, '<br>');
    detailHtml = detailHtml.replace(/(https?:\/\/[^\s<]+|www\.[^\s<]+)/g, (match) => {
        let url = match;
        if (!url.startsWith('http')) url = 'https://' + url;
        return `<a href="${url}" target="_blank" class="text-blue-500 hover:underline underline-offset-2">${match}</a>`;
    });

    document.getElementById('news-modal-detail').innerHTML = detailHtml;
    document.getElementById('news-modal').classList.remove('hidden');
}

// --- REALTIME LISTENERS VIA POLLING ---
function initRealtimeListeners() {

    // Start polling
    startPolling();

    // 1. Complaints
    const complaintTbody = document.getElementById('complaintTable');
    if (complaintTbody) showSkeleton('complaintTable', 5, 'table');

    onValue('complaints', (data) => {
        complaintsData = data || {};

        let pendingCount = 0; let doneCount = 0;
        if (data) {
            Object.values(data).forEach(item => {
                if (item.status === 'Pending') pendingCount++;
                if (item.status === 'Done' || item.status === 'Completed') doneCount++;
            });
        }

        if (document.getElementById('stat-pending-c')) document.getElementById('stat-pending-c').innerText = pendingCount;
        if (document.getElementById('stat-done-c')) document.getElementById('stat-done-c').innerText = doneCount;

        const badge = document.getElementById('badge-complaints');
        if (badge) {
            if (pendingCount > 0) {
                badge.innerText = pendingCount;
                badge.classList.remove('hidden');
            } else {
                badge.classList.add('hidden');
            }
        }

        window.renderComplaintsTable(window.currentComplaintFilter || 'All');
        renderRecentComplaints();
    });

    window.renderComplaintsTable = (filterStatus) => {
        const tbody = document.getElementById('complaintTable');
        const loadingEl = document.getElementById('complaintLoading');
        if (loadingEl) loadingEl.classList.add('hidden');

        tbody.innerHTML = '';
        tbody.style.opacity = '0';

        const data = complaintsData;
        if (!data || Object.keys(data).length === 0) {
            tbody.innerHTML = '<tr><td colspan="7" class="p-8 text-center text-slate-400">ไม่มีข้อมูลร้องเรียน</td></tr>';
            tbody.style.opacity = '1';
            return;
        }

        let keys = Object.keys(data).reverse();

        if (filterStatus !== 'All') {
            keys = keys.filter(key => data[key].status === filterStatus);
        }

        if (keys.length === 0) {
            tbody.innerHTML = '<tr><td colspan="7" class="p-8 text-center text-slate-400">ไม่พบข้อมูลตามเงื่อนไข</td></tr>';
            return;
        }

        keys.forEach(key => {
            const item = data[key];
            let badgeClass = item.status === 'Pending' ? 'bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-400' :
                (item.status === 'In Progress' ? 'bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-400' :
                    'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-400');

            tbody.innerHTML += `
                <tr class="hover:bg-slate-50 dark:hover:bg-white/5 transition border-b border-slate-50 dark:border-white/5 last:border-0 group">
                    <td class="p-6 font-mono text-slate-400 text-xs">${new Date(item.timestamp).toLocaleDateString('th-TH')}</td>
                    <td class="p-6 font-mono text-brand-600 dark:text-brand-400 font-bold text-xs">${item.ticket_id || item.ticketId || '-'}</td>
                    <td class="p-6 font-bold text-slate-800 dark:text-white">${sanitizeHTML(item.topic)}</td>
                    <td class="p-6"><span class="bg-slate-100 dark:bg-white/10 text-slate-600 dark:text-slate-300 px-3 py-1.5 rounded-lg text-xs font-bold">${sanitizeHTML(item.name) || 'Anonymous'}</span></td>
                    <td class="p-6"><select onchange="window.updateStatus('${key}', 'complaints', this.value)" class="${badgeClass} px-3 py-1.5 rounded-lg text-xs font-bold border-none cursor-pointer outline-none appearance-none hover:opacity-80 transition"><option value="Pending" ${item.status === 'Pending' ? 'selected' : ''}>Wait</option><option value="In Progress" ${item.status === 'In Progress' ? 'selected' : ''}>Doing</option><option value="Done" ${item.status === 'Done' ? 'selected' : ''}>Done</option><option value="Completed" ${item.status === 'Completed' ? 'selected' : ''}>Completed</option></select></td>
                    <td class="p-6 flex items-center gap-2">
                         <button onclick="window.showDetail('${key}', '${item.topic}', '${(item.detail || '').replace(/'/g, "\\'")}', '${(item.response || '').replace(/'/g, "\\'")}')" class="w-8 h-8 rounded-lg bg-brand-50 text-brand-600 dark:bg-brand-500/20 dark:text-brand-400 hover:bg-brand-100 dark:hover:bg-brand-500/30 flex items-center justify-center transition"><i class="fas fa-eye"></i></button>
                         <button onclick="window.deleteItem('${key}', 'complaints')" class="w-8 h-8 rounded-lg bg-slate-50 text-slate-400 dark:bg-white/5 dark:text-slate-500 hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-500/20 dark:hover:text-red-400 flex items-center justify-center transition"><i class="fas fa-trash-alt"></i></button>
                    </td>
                </tr>`;
        });

        setTimeout(() => {
            tbody.style.opacity = '1';
            tbody.style.transition = 'opacity 0.3s ease-in-out';
        }, 50);
    };

    // 2. Policies
    const policyGrid = document.getElementById('policyGrid');
    if (policyGrid) showSkeleton('policyGrid', 6, 'grid');

    onValue('policies', (data) => {
        policiesData = data || {};
        const grid = document.getElementById('policyGrid');

        grid.innerHTML = '';
        grid.style.opacity = '0';

        if (document.getElementById('stat-policy')) document.getElementById('stat-policy').innerText = data ? Object.keys(data).length : 0;
        if (!data) { grid.innerHTML = '<div class="col-span-full text-center text-slate-400 py-10">ว่างเปล่า</div>'; grid.style.opacity = '1'; return; }

        Object.keys(data).forEach(key => {
            const item = data[key];
            let color = item.status === 'Completed' ? 'bg-green-500' : (item.status === 'In Progress' ? 'bg-blue-500' : 'bg-yellow-500');
            let imgHtml = item.image ? `<img src="${item.image}" class="w-full h-32 object-cover rounded-xl mb-3 border border-slate-100">` : '';
            grid.innerHTML += `
                <div class="bg-white dark:bg-slate-800 p-6 rounded-3xl shadow-sm border border-slate-100 dark:border-white/5 hover:shadow-lg hover:-translate-y-1 transition-all duration-300 relative group">
                    <div class="absolute top-4 right-4 flex gap-2 opacity-0 group-hover:opacity-100 transition bg-white/80 dark:bg-slate-900/80 backdrop-blur rounded-xl p-1.5 shadow-sm z-10">
                        <button onclick="window.openEditPolicy('${key}')" class="w-8 h-8 flex items-center justify-center text-slate-400 hover:text-amber-500 hover:bg-amber-50 dark:hover:bg-amber-500/10 rounded-lg transition"><i class="fas fa-edit"></i></button>
                        <button onclick="window.deleteItem('${key}', 'policies')" class="w-8 h-8 flex items-center justify-center text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 rounded-lg transition"><i class="fas fa-trash-alt"></i></button>
                    </div>
                    ${imgHtml}
                    <span class="text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-md bg-slate-100 dark:bg-white/10 text-slate-500 dark:text-slate-300">${item.status}</span>
                    <h3 class="font-bold text-lg text-slate-800 dark:text-white mt-3 mb-2 line-clamp-1">${item.title}</h3>
                    <div class="h-12 overflow-hidden text-sm text-slate-500 dark:text-slate-400 mb-4 line-clamp-2 leading-relaxed">${item.detail}</div>
                    <div class="flex items-center gap-3">
                        <div class="flex-1 h-2 bg-slate-100 dark:bg-white/10 rounded-full overflow-hidden"><div class="h-full ${color}" style="width:${item.percent}%"></div></div>
                        <span class="text-xs font-bold text-slate-600 dark:text-slate-300 min-w-[2rem] text-right">${item.percent}%</span>
                    </div>
                </div>`;
        });

        setTimeout(() => {
            grid.style.opacity = '1';
            grid.style.transition = 'opacity 0.3s ease-in-out';
        }, 50);
    });

    // 3. QA  
    const qaTable = document.getElementById('qaTable');
    if (qaTable) showSkeleton('qaTable', 4, 'table');

    onValue('qa', (data) => {
        qaData = data || {};

        let waitCount = 0;
        if (data) waitCount = Object.values(data).filter(i => i.status !== 'Answered').length;
        if (document.getElementById('stat-qa')) document.getElementById('stat-qa').innerText = waitCount;

        window.renderQATable(window.currentQAFilter || 'All');
    });

    window.renderQATable = (filterStatus) => {
        const tbody = document.getElementById('qaTable');
        tbody.innerHTML = '';
        tbody.style.opacity = '0';
        const data = qaData;

        if (!data || Object.keys(data).length === 0) {
            tbody.innerHTML = '<tr><td colspan="4" class="p-8 text-center text-slate-400">ยังไม่มีคำถาม</td></tr>';
            return;
        }

        let keys = Object.keys(data);

        if (filterStatus === 'Wait') {
            keys = keys.filter(key => data[key].status !== 'Answered');
        } else if (filterStatus === 'Answered') {
            keys = keys.filter(key => data[key].status === 'Answered');
        }

        if (keys.length === 0) {
            tbody.innerHTML = '<tr><td colspan="4" class="p-8 text-center text-slate-400">ไม่พบข้อมูลตามเงื่อนไข</td></tr>';
            return;
        }

        keys.forEach(key => {
            const item = data[key];
            let answerHtml = item.answer ? `<span class="text-green-600 font-medium"><i class="fas fa-check-circle mr-1"></i> ${item.answer}</span>` : `<span class="text-slate-400 italic">รอการตอบกลับ...</span>`;

            tbody.innerHTML += `
                <tr class="hover:bg-slate-50 dark:hover:bg-white/5 transition border-b border-slate-50 dark:border-white/5 last:border-0 align-top">
                    <td class="p-6 font-mono text-slate-400 text-xs">${new Date(item.timestamp).toLocaleDateString('th-TH')}</td>
                    <td class="p-6 font-medium text-slate-800 dark:text-slate-200">"${item.question}"</td>
                    <td class="p-6 text-sm leading-relaxed">${answerHtml}</td>
                    <td class="p-6 flex gap-2">
                        <button onclick="window.openReplyQA('${key}')" class="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 dark:bg-blue-500/20 dark:text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-500/30 flex items-center justify-center transition"><i class="fas fa-reply"></i></button>
                        <button onclick="window.deleteItem('${key}', 'qa')" class="w-8 h-8 rounded-lg bg-slate-50 text-slate-400 dark:bg-white/5 dark:text-slate-500 hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-500/20 dark:hover:text-red-400 flex items-center justify-center transition"><i class="fas fa-trash-alt"></i></button>
                    </td>
                </tr>`;
        });

        setTimeout(() => {
            tbody.style.opacity = '1';
            tbody.style.transition = 'opacity 0.3s ease-in-out';
        }, 50);
    };

    // 4. Announcement
    onValue('announcement', (data) => {
        if (!data) data = {};
        const annoActive = document.getElementById('annoActive');
        const annoTitle = document.getElementById('annoTitle');
        const annoDetail = document.getElementById('annoDetail');
        const annoImage = document.getElementById('annoImage');

        if (annoActive) annoActive.checked = data.active || false;
        if (annoTitle) annoTitle.value = data.title || '';
        if (annoDetail) annoDetail.value = data.detail || '';
        if (annoImage) annoImage.value = data.image || '';
    });

    // 5. Activities (News)
    const activityGrid = document.getElementById('activityGrid');
    if (activityGrid) showSkeleton('activityGrid', 6, 'grid');

    onValue('activities', (data) => {
        const grid = document.getElementById('activityGrid');

        grid.innerHTML = '';
        grid.style.opacity = '0';

        if (!data) { grid.innerHTML = '<div class="col-span-full text-center text-slate-400 py-10">ไม่พบข่าวสาร</div>'; grid.style.opacity = '1'; return; }

        const keys = Object.keys(data).reverse();

        keys.forEach(key => {
            const item = data[key];

            grid.innerHTML += `
                <div onclick="window.openNewsDetail('${key}')" class="bg-white dark:bg-slate-800 rounded-3xl shadow-sm overflow-hidden group relative border border-slate-100 dark:border-white/5 hover:shadow-lg transition-all duration-300 cursor-pointer">
                    <div class="absolute top-3 right-3 flex gap-2 opacity-0 group-hover:opacity-100 transition bg-white/80 dark:bg-slate-900/80 backdrop-blur rounded-xl p-1.5 shadow-sm z-10">
                        <button onclick="event.stopPropagation(); window.openEditActivity('${key}')" class="w-8 h-8 flex items-center justify-center text-slate-400 hover:text-amber-500 hover:bg-amber-50 dark:hover:bg-amber-500/10 rounded-lg transition"><i class="fas fa-edit"></i></button>
                        <button onclick="event.stopPropagation(); window.deleteItem('${key}', 'activities')" class="w-8 h-8 flex items-center justify-center text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 rounded-lg transition"><i class="fas fa-trash-alt"></i></button>
                    </div>
                    <div class="h-48 bg-slate-100 dark:bg-slate-700/50 relative overflow-hidden">
                        <img src="${item.image}" class="w-full h-full object-cover group-hover:scale-105 transition duration-500">
                        <div class="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent opacity-60"></div>
                        <span class="absolute bottom-3 left-3 text-[10px] font-bold bg-white/90 dark:bg-black/80 text-slate-900 dark:text-white px-2 py-1 rounded-lg uppercase tracking-wider backdrop-blur-sm shadow-sm">${item.category}</span>
                    </div>
                    <div class="p-5">
                        <h3 class="font-bold text-slate-800 dark:text-white line-clamp-2 text-lg mb-2 group-hover:text-blue-600 transition-colors">${item.title}</h3>
                        <p class="text-sm text-slate-500 dark:text-slate-400 line-clamp-2">${item.detail || 'คลิกเพื่ออ่านรายละเอียด...'}</p>
                    </div>
                </div>`;
        });

        window.newsData = data;

        setTimeout(() => {
            grid.style.opacity = '1';
            grid.style.transition = 'opacity 0.3s ease-in-out';
        }, 50);

        updateAdditionalStats();
    });

    // 6. Members
    const memberGrid = document.getElementById('memberGrid');
    if (memberGrid) showSkeleton('memberGrid', 6, 'grid');

    onValue('members', (data) => {
        membersData = data || {};
        const grid = document.getElementById('memberGrid');

        grid.innerHTML = '';
        grid.style.opacity = '0';

        if (!data) { grid.innerHTML = '<div class="col-span-full text-center text-slate-400 py-10">ว่างเปล่า</div>'; grid.style.opacity = '1'; return; }
        Object.keys(data).forEach(key => {
            const item = data[key];
            grid.innerHTML += `
                <div class="bg-white dark:bg-slate-800 rounded-3xl p-6 shadow-sm border border-slate-100 dark:border-white/5 hover:shadow-lg hover:-translate-y-1 transition relative group text-center">
                    <div class="absolute top-3 right-3 flex gap-1 opacity-0 group-hover:opacity-100 transition bg-white/80 dark:bg-slate-900/80 backdrop-blur p-1 rounded-xl shadow-sm z-10">
                        <button onclick="window.openEditMember('${key}')" class="text-slate-400 hover:text-brand-500 w-8 h-8 rounded-lg hover:bg-slate-50 dark:hover:bg-white/5 transition"><i class="fas fa-edit"></i></button>
                        <button onclick="window.deleteItem('${key}', 'members')" class="text-slate-400 hover:text-red-500 w-8 h-8 rounded-lg hover:bg-slate-50 dark:hover:bg-white/5 transition"><i class="fas fa-trash-alt"></i></button>
                    </div>
                    
                    <div class="relative w-24 h-24 mx-auto mb-4">
                        <div class="absolute inset-0 bg-brand-500 rounded-full blur-lg opacity-20"></div>
                        <img src="${item.image}" class="w-full h-full rounded-full object-cover shadow-lg border-4 border-white dark:border-slate-700 relative z-10" onerror="this.src='data:image/svg+xml;charset=UTF-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22150%22%20height%3D%22150%22%20viewBox%3D%220%200%20150%20150%22%3E%3Crect%20fill%3D%22%23cbd5e1%22%20width%3D%22150%22%20height%3D%22150%22%2F%3E%3Ctext%20fill%3D%22%2364748b%22%20font-family%3D%22sans-serif%22%20font-size%3D%2224%22%20dy%3D%228%22%20font-weight%3D%22bold%22%20x%3D%2250%25%22%20y%3D%2250%25%22%20text-anchor%3D%22middle%22%3EUser%3C%2Ftext%3E%3C%2Fsvg%3E'">
                    </div>
                    
                    <h3 class="font-bold text-slate-800 dark:text-white text-lg line-clamp-1 mb-1">${item.name}</h3>
                    <p class="text-xs text-brand-500 font-bold uppercase tracking-wider line-clamp-1">${item.role}</p>
                </div>`;
        });

        setTimeout(() => {
            grid.style.opacity = '1';
            grid.style.transition = 'opacity 0.3s ease-in-out';
        }, 50);

        updateAdditionalStats();
    });

    // 7. Maintenance
    onValue('maintenance', (status) => {
        const toggle = document.getElementById('maintenanceToggle');
        const text = document.getElementById('maintenanceStatusText');
        const dot = document.getElementById('maintenanceDot');

        if (toggle) toggle.checked = status;
        if (text) {
            text.innerText = status ? 'ON' : 'OFF';
            text.className = status ? 'font-bold text-xl text-red-500' : 'font-bold text-xl text-slate-400';
        }
        if (dot) {
            dot.className = status
                ? 'w-3 h-3 bg-red-500 rounded-full animate-pulse'
                : 'w-3 h-3 bg-slate-500 rounded-full';
        }
    });

    // 8. Events (Calendar)
    onValue('events', (data) => {
        eventsData = data || {};
        const container = document.getElementById('adminEventList');
        if (!container) return;

        container.innerHTML = '';
        if (!data) {
            container.innerHTML = '<div class="text-center text-slate-400 py-4">ไม่มีกิจกรรมที่กำลังจะมาถึง</div>';
            updateAdditionalStats();
            return;
        }

        const sorted = Object.keys(data).sort((a, b) => data[a].date.localeCompare(data[b].date));

        sorted.forEach(key => {
            const item = data[key];
            let colorClass = 'bg-blue-100 text-blue-600';
            if (item.category === 'ACADEMIC') colorClass = 'bg-orange-100 text-orange-600';
            else if (item.category === 'HOLIDAY') colorClass = 'bg-red-100 text-red-600';
            else if (item.category === 'IMPORTANT') colorClass = 'bg-purple-100 text-purple-600';

            container.innerHTML += `
                <div class="flex items-center justify-between p-4 bg-slate-50 dark:bg-slate-900/50 rounded-xl border border-slate-100 dark:border-white/5">
                    <div class="flex items-center gap-4">
                        <div class="text-center min-w-[3rem]">
                            <div class="text-xs font-bold text-slate-400 uppercase">${new Date(item.date).toLocaleDateString('en-US', { month: 'short' })}</div>
                            <div class="text-xl font-bold text-slate-800 dark:text-white">${new Date(item.date).getDate()}</div>
                        </div>
                        <div>
                            <h4 class="font-bold text-slate-900 dark:text-white text-sm">${item.title}</h4>
                            <span class="${colorClass} text-[10px] font-bold px-2 py-0.5 rounded uppercase tracking-wider">${item.category}</span>
                            <span class="text-xs text-slate-400 ml-2"><i class="far fa-clock"></i> ${item.time || 'All Day'}</span>
                        </div>
                    </div>
                    <button onclick="window.deleteItem('${key}', 'events')" class="w-8 h-8 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 transition flex items-center justify-center"><i class="fas fa-trash-alt"></i></button>
                </div>
            `;
        });

        updateAdditionalStats();
    });
}

// --- ACTIONS ---

window.showDetail = (key, topic, detail, currentResponse) => {
    Swal.fire({
        title: topic,
        html: `
            <div class="text-left">
                <p class="text-sm text-slate-500 mb-2">รายละเอียด:</p>
                <div class="bg-slate-50 dark:bg-slate-900/50 p-4 rounded-xl text-slate-700 dark:text-slate-300 mb-6 text-sm border border-slate-100 dark:border-white/5 italic">"${detail}"</div>
                <p class="text-xs font-bold text-slate-400 uppercase mb-2">My Response</p>
                <textarea id="swal-input-response" class="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 p-4 rounded-xl outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 transition dark:text-white text-sm" rows="4" placeholder="Type your reply here...">${currentResponse}</textarea>
            </div>
        `,
        confirmButtonText: 'บันทึกการตอบกลับ',
        confirmButtonColor: '#2563eb',
        showCancelButton: true,
        cancelButtonText: 'ปิด',
        preConfirm: async () => {
            const response = document.getElementById('swal-input-response').value;
            if (!response || response.trim().length < 5) {
                Swal.showValidationMessage('คำตอบต้องมีอย่างน้อย 5 ตัวอักษร');
                return false;
            }
            await complaintsApi.update(key, { response: response });
            return true;
        }
    }).then((result) => {
        if (result.isConfirmed) {
            showToast('บันทึกการตอบกลับแล้ว!', 'success');
        }
    });
}

window.updateStatus = async (key, collection, status) => {
    try {
        if (collection === 'complaints') {
            await complaintsApi.update(key, { status });
        } else if (collection === 'policies') {
            await policiesApi.update(key, { status });
        }
        showToast('อัปเดตสถานะแล้ว!', 'success');
    } catch (error) {
        showToast('เกิดข้อผิดพลาด', 'error');
    }
}

window.toggleMaintenance = async (checkbox) => {
    const isTurningOn = checkbox.checked;

    Swal.fire({
        title: 'ยืนยันการเปลี่ยนสถานะ?',
        text: isTurningOn ? "คุณกำลังจะเปิดโหมดปิดปรับปรุง (ผู้ใช้ทั่วไปจะเข้าไม่ได้)" : "คุณกำลังจะปิดโหมดปิดปรับปรุง (เว็บไซต์จะออนไลน์ปกติ)",
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: isTurningOn ? '#ef4444' : '#3b82f6',
        cancelButtonColor: '#94a3b8',
        confirmButtonText: isTurningOn ? 'ใช่, ปิดปรับปรุงเลย' : 'ใช่, เปิดใช้งานเว็บ',
        cancelButtonText: 'ยกเลิก'
    }).then(async (result) => {
        if (result.isConfirmed) {
            try {
                await settingsApi.set('maintenance', isTurningOn);
                const Toast = Swal.mixin({ toast: true, position: 'top-end', showConfirmButton: false, timer: 1500 });
                Toast.fire({ icon: 'success', title: 'บันทึกการตั้งค่าแล้ว' });
            } catch (error) {
                showToast('เกิดข้อผิดพลาด', 'error');
                checkbox.checked = !isTurningOn;
            }
        } else {
            checkbox.checked = !isTurningOn;
        }
    });
}

window.saveAnnouncement = async (e) => {
    e.preventDefault();
    const formData = new FormData(e.target);
    const data = Object.fromEntries(formData.entries());
    data.active = document.getElementById('annoActive').checked;

    try {
        await settingsApi.set('announcement', data);
        showToast('บันทึกประกาศเรียบร้อย!', 'success');
    } catch (err) {
        showToast('เกิดข้อผิดพลาด', 'error');
        console.error(err);
    }
}

window.searchTable = (tableId, text) => {
    const filter = text.toLowerCase();
    const rows = document.getElementById(tableId).getElementsByTagName('tr');
    for (let i = 0; i < rows.length; i++) {
        const textContent = rows[i].textContent.toLowerCase();
        rows[i].style.display = textContent.includes(filter) ? "" : "none";
    }
};

window.openReplyQA = (key) => {
    const item = qaData[key];
    if (item) {
        document.getElementById('qaKey').value = key;
        document.getElementById('qaQuestionDisplay').innerText = `"${item.question}"`;
        document.getElementById('qaAnswer').value = item.answer || '';
        window.openModal('qaModal');
    }
}

window.submitReply = async (e) => {
    e.preventDefault();
    const formData = new FormData(e.target);
    const answer = formData.get('answer');
    const key = formData.get('key');

    if (!answer || answer.trim().length < 5) {
        showToast('คำตอบต้องมีอย่างน้อย 5 ตัวอักษร', 'error');
        return;
    }

    const btn = e.target.querySelector('button[type="submit"]');
    const original = btn.innerHTML;

    btn.innerHTML = '<i class="fas fa-circle-notch fa-spin"></i> กำลังส่ง...';
    btn.disabled = true;
    btn.classList.add('opacity-75');

    try {
        await qaApi.update(key, { answer, status: 'Answered' });
        btn.innerHTML = '<i class="fas fa-check-circle animate-checkmark"></i> สำเร็จ!';
        btn.classList.add('bg-green-600');
        showToast('ตอบกลับเรียบร้อย!', 'success');

        setTimeout(() => {
            window.closeModal('qaModal');
        }, 500);
    } catch (err) {
        showToast('เกิดข้อผิดพลาด', 'error');
        console.error(err);
    } finally {
        setTimeout(() => {
            btn.innerHTML = original;
            btn.disabled = false;
            btn.classList.remove('opacity-75', 'bg-green-600');
        }, 800);
    }
}

window.openCreatePolicy = () => {
    document.getElementById('policyForm').reset();
    document.getElementById('policyKey').value = '';
    document.getElementById('policyModalTitle').innerText = 'เพิ่มนโยบายใหม่';
    window.openModal('policyModal');
}

window.openEditPolicy = (key) => {
    const item = policiesData[key];
    if (item) {
        document.getElementById('policyKey').value = key;
        document.getElementById('policyTitle').value = item.title;
        document.getElementById('policyDetail').value = item.detail;
        document.getElementById('policyStatus').value = item.status;
        document.getElementById('policyPercent').value = item.percent;
        document.getElementById('policyImage').value = item.image || '';
        document.getElementById('policyModalTitle').innerText = 'แก้ไขนโยบาย';
        window.openModal('policyModal');
    }
}

window.openCreateMember = () => {
    document.getElementById('memberForm').reset();
    document.getElementById('memberKey').value = '';
    document.getElementById('memberModalTitle').innerText = 'เพิ่มสมาชิก';
    window.openModal('memberModal');
}

window.openEditMember = (key) => {
    const item = membersData[key];
    if (item) {
        document.getElementById('memberKey').value = key;
        document.getElementById('memberName').value = item.name;
        document.getElementById('memberRole').value = item.role;
        document.getElementById('memberImage').value = item.image;
        document.getElementById('memberLink').value = item.link || '';
        document.getElementById('memberMotto').value = item.motto || '';
        document.getElementById('memberBio').value = item.bio || '';
        document.getElementById('memberModalTitle').innerText = 'แก้ไขข้อมูลสมาชิก';
        window.openModal('memberModal');
    }
}

window.openEditActivity = (key) => {
    const item = window.newsData ? window.newsData[key] : null;
    if (item) {
        document.getElementById('activityKey').value = key;
        document.getElementById('activityTitle').value = item.title;
        document.getElementById('activityCategory').value = item.category;
        document.getElementById('activityImage').value = item.image;
        document.getElementById('activityDetail').value = item.detail || '';
        document.getElementById('activityModalTitle').innerText = 'แก้ไขข่าวสาร';
        window.openModal('activityModal');
    }
}

window.handleFirebaseSubmit = async (e, collection, modalId) => {
    e.preventDefault();
    const btn = e.target.querySelector('button[type="submit"]');
    const original = btn.innerHTML;

    btn.innerHTML = '<i class="fas fa-circle-notch fa-spin"></i> กำลังบันทึก...';
    btn.disabled = true;
    btn.classList.add('opacity-75');

    const formData = new FormData(e.target);
    const data = Object.fromEntries(formData.entries());
    const key = data.key;
    delete data.key;

    try {
        let api;
        if (collection === 'policies') api = policiesApi;
        else if (collection === 'members') api = membersApi;
        else if (collection === 'activities') api = activitiesApi;
        else if (collection === 'events') api = eventsApi;

        if (key && key.trim() !== "") {
            await api.update(key, data);
        } else {
            await api.create(data);
        }

        btn.innerHTML = '<i class="fas fa-check-circle animate-checkmark"></i> สำเร็จ!';
        btn.classList.remove('opacity-75');
        btn.classList.add('bg-green-600');

        showToast('บันทึกสำเร็จ!', 'success');

        setTimeout(() => {
            window.closeModal(modalId);
            e.target.reset();
            e.target.querySelectorAll('input, textarea, select').forEach(input => {
                input.classList.remove('valid', 'invalid');
            });
        }, 500);
    } catch (err) {
        showToast('เกิดข้อผิดพลาด: ' + err.message, 'error');
        console.error(err);
    } finally {
        setTimeout(() => {
            btn.innerHTML = original;
            btn.disabled = false;
            btn.classList.remove('opacity-75', 'bg-green-600');
        }, 800);
    }
}

window.deleteItem = (key, collection) => {
    Swal.fire({
        title: 'ยืนยันลบ?', text: "ไม่สามารถกู้คืนได้นะ", icon: 'warning',
        showCancelButton: true, confirmButtonColor: '#ef4444', cancelButtonColor: '#cbd5e1',
        confirmButtonText: 'ลบเลย', cancelButtonText: 'ยกเลิก'
    }).then(async (result) => {
        if (result.isConfirmed) {
            try {
                let api;
                if (collection === 'policies') api = policiesApi;
                else if (collection === 'members') api = membersApi;
                else if (collection === 'complaints') api = complaintsApi;
                else if (collection === 'activities') api = activitiesApi;
                else if (collection === 'qa') api = qaApi;
                else if (collection === 'events') api = eventsApi;

                await api.delete(key);
                showToast('ลบสำเร็จ!', 'success');
            } catch (error) {
                showToast('เกิดข้อผิดพลาด', 'error');
            }
        }
    });
}

window.openModal = (id) => document.getElementById(id).classList.remove('hidden');
window.closeModal = (id) => document.getElementById(id).classList.add('hidden');

// --- NEW FEATURES ---

window.filterComplaints = (status) => {
    window.currentComplaintFilter = status;
    window.renderComplaintsTable(status);
};

window.filterQA = (status) => {
    window.currentQAFilter = status;
    window.renderQATable(status);
};

window.exportComplaintsCSV = () => {
    if (!complaintsData) return;

    let csvContent = "data:text/csv;charset=utf-8,Date,Ticket ID,Topic,Reporter,Detail,Status,Response\n";

    Object.values(complaintsData).forEach(item => {
        const date = new Date(item.timestamp).toLocaleDateString('th-TH');
        const row = [
            date,
            item.ticket_id || item.ticketId || '-',
            `"${(item.topic || '').replace(/"/g, '""')}"`,
            `"${(item.name || 'Anonymous').replace(/"/g, '""')}"`,
            `"${(item.detail || '').replace(/"/g, '""')}"`,
            item.status,
            `"${(item.response || '').replace(/"/g, '""')}"`
        ];
        csvContent += row.join(",") + "\n";
    });

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", "complaints_export_" + new Date().toISOString().split('T')[0] + ".csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
};

// Check Dark Mode on Load
if (localStorage.getItem('darkMode') === 'true') {
    window.toggleDarkMode();
}

// Start Check Session
window.addEventListener('load', () => {
    window.checkSession();
    updateDateTime();
    setInterval(updateDateTime, 60000);
});

function updateDateTime() {
    const el = document.getElementById('currentDateTime');
    if (el) {
        const now = new Date();
        const options = {
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        };
        el.innerText = now.toLocaleDateString('th-TH', options);
    }
}

function renderRecentComplaints() {
    const container = document.getElementById('recentComplaintsList');
    if (!container || !complaintsData) return;

    const items = Object.entries(complaintsData)
        .map(([key, value]) => ({ key, ...value }))
        .sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0))
        .slice(0, 5);

    if (items.length === 0) {
        container.innerHTML = `
            <div class="text-center py-8 text-slate-400">
                <i class="fas fa-check-circle text-4xl mb-2 opacity-50"></i>
                <p class="text-sm">ไม่มีเรื่องร้องเรียน</p>
            </div>`;
        return;
    }

    container.innerHTML = items.map(item => {
        const statusColors = {
            'Pending': 'bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-400',
            'In Progress': 'bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-400',
            'Done': 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-400',
            'Completed': 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-400'
        };
        const statusClass = statusColors[item.status] || statusColors['Pending'];
        const date = item.timestamp ? new Date(item.timestamp).toLocaleDateString('th-TH', { day: 'numeric', month: 'short' }) : '-';

        return `
            <div onclick="window.switchTab('complaints')" class="flex items-center gap-4 p-3 bg-slate-50 dark:bg-slate-900/50 rounded-xl cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-700/50 transition group">
                <div class="w-10 h-10 rounded-xl ${item.status === 'Pending' ? 'bg-amber-100 text-amber-600' : 'bg-slate-100 text-slate-400'} dark:bg-slate-700 flex items-center justify-center flex-shrink-0">
                    <i class="fas ${item.status === 'Pending' ? 'fa-clock' : 'fa-inbox'}"></i>
                </div>
                <div class="flex-1 min-w-0">
                    <p class="font-bold text-sm text-slate-800 dark:text-white truncate group-hover:text-brand-600 transition">${sanitizeHTML(item.topic) || 'ไม่มีหัวข้อ'}</p>
                    <p class="text-xs text-slate-400 truncate">${sanitizeHTML(item.name) || 'Anonymous'} • ${date}</p>
                </div>
                <span class="${statusClass} text-[10px] font-bold px-2 py-1 rounded-lg flex-shrink-0">${item.status}</span>
            </div>`;
    }).join('');
}

function updateAdditionalStats() {
    const membersCount = Object.keys(membersData || {}).length;
    const membersEl = document.getElementById('stat-members');
    if (membersEl) membersEl.innerText = membersCount;

    const newsEl = document.getElementById('stat-news');
    if (newsEl && window.newsData) {
        newsEl.innerText = Object.keys(window.newsData).length;
    }

    const eventsEl = document.getElementById('stat-events');
    if (eventsEl && eventsData) {
        eventsEl.innerText = Object.keys(eventsData).length;
    }
}