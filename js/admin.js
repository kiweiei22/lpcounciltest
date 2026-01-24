import { ref, push, set, onValue, remove, update } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";
import { db } from "./config.js";

let policiesData = {};
let qaData = {};
let membersData = {};
let complaintsData = {}; // Promote to global used for filtering/export

const ADMIN_PASSWORD = 'admin';
const SESSION_KEY = 'sc_admin_session';
const SESSION_DURATION = 24 * 60 * 60 * 1000; // 24 Hours

// --- UTILITY FUNCTIONS ---

// Skeleton Loader Helper
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

// Toast Notification
// Toast Notification
function showToast(message, type = 'success') {
    // Create or get toast container
    let container = document.getElementById('toast-container');
    if (!container) {
        container = document.createElement('div');
        container.id = 'toast-container';
        container.className = 'toast-container';
        document.body.appendChild(container);
    }

    // Create toast
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;

    // Icon mapping
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

    // Auto remove after 3 seconds
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
    } else if (rules.min !== undefined && parseFloat(value) < rules.min) {
        isValid = false;
        errorMsg = `ค่าต้องไม่น้อยกว่า ${rules.min}`;
    } else if (rules.max !== undefined && parseFloat(value) > rules.max) {
        isValid = false;
        errorMsg = `ค่าต้องไม่เกิน ${rules.max}`;
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


// --- AUTH & SESSION ---
window.checkLogin = () => {
    // ดึงค่ารหัสผ่าน
    const input = document.getElementById('passwordInput');

    if (input.value === ADMIN_PASSWORD) {
        // 1. บันทึก Session
        localStorage.setItem(SESSION_KEY, Date.now());

        // 2. แสดง UI ทันที (ไม่ต้องรอรีโหลด)
        document.getElementById('loginScreen').classList.add('hidden');
        document.getElementById('dashboard').classList.remove('hidden');
        document.getElementById('dashboard').classList.add('flex'); // สำคัญ: ต้องใส่ flex ไม่งั้นจอขาว

        // 3. เริ่มดึงข้อมูล
        initRealtimeListeners();
        window.switchTab('overview');

        // 4. แจ้งเตือนมุมขวาบน
        const Toast = Swal.mixin({ toast: true, position: 'top-end', showConfirmButton: false, timer: 1500 });
        Toast.fire({ icon: 'success', title: 'เข้าสู่ระบบสำเร็จ' });

    } else {
        Swal.fire({
            icon: 'error',
            title: 'รหัสผ่านไม่ถูกต้อง',
            text: 'กรุณาลองใหม่อีกครั้ง',
            confirmButtonColor: '#ef4444'
        });
        input.value = ''; // ล้างช่องรหัส
        input.focus();    // เอาเมาส์ไปวางรอพิมพ์ใหม่
    }
};

window.checkSession = () => {
    const lastLogin = localStorage.getItem(SESSION_KEY);
    // เช็คว่าเคยล็อกอินไหม และหมดเวลาหรือยัง (24 ชม.)
    if (lastLogin && (Date.now() - parseInt(lastLogin) < SESSION_DURATION)) {
        // ผ่าน: โชว์หน้าจอ Admin
        document.getElementById('loginScreen').classList.add('hidden');
        document.getElementById('dashboard').classList.remove('hidden');
        document.getElementById('dashboard').classList.add('flex');
        initRealtimeListeners();
        window.switchTab('overview');
    } else {
        // ไม่ผ่าน: โชว์หน้า Login
        document.getElementById('loginScreen').classList.remove('hidden');
        document.getElementById('dashboard').classList.add('hidden');
        document.getElementById('dashboard').classList.remove('flex');
    }
};

window.logout = () => {
    localStorage.removeItem(SESSION_KEY);
    location.reload();
};

window.toggleSidebar = () => {
    const sb = document.getElementById('sidebar');
    const overlay = document.getElementById('sidebarOverlay');
    // Check using the new class from admin.html
    if (sb.classList.contains('-translate-x-[110%]')) {
        sb.classList.remove('-translate-x-[110%]'); // Open
        overlay.classList.remove('hidden');
    } else {
        sb.classList.add('-translate-x-[110%]'); // Close
        overlay.classList.add('hidden');
    }
};

window.switchTab = (tab) => {
    ['overview', 'complaints', 'policies', 'qa', 'announcement', 'activities', 'members'].forEach(t => {
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

    // Auto close sidebar on mobile if open
    if (window.innerWidth < 768) {
        const sb = document.getElementById('sidebar');
        if (!sb.classList.contains('-translate-x-[110%]')) {
            window.toggleSidebar();
        }
    }
};

// ... (Realtime Listeners & Actions preserved) ...

window.toggleDarkMode = () => {
    document.documentElement.classList.toggle('dark');
    const isDark = document.documentElement.classList.contains('dark');
    localStorage.theme = isDark ? 'dark' : 'light'; // Use 'theme' to match main.js

    const btn = document.getElementById('darkModeBtn');
    if (btn) {
        btn.innerHTML = isDark
            ? '<i class="fas fa-sun w-5 text-center text-yellow-400"></i> <span>Light Mode</span>'
            : '<i class="fas fa-moon w-5 text-center"></i> <span>Dark Mode</span>';
    }
};

// Check Dark Mode on Load
if (localStorage.theme === 'dark' || (!('theme' in localStorage) && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
    document.documentElement.classList.add('dark');
    const btn = document.getElementById('darkModeBtn');
    if (btn) btn.innerHTML = '<i class="fas fa-sun w-5 text-center text-yellow-400"></i> <span>Light Mode</span>';
}

// --- REALTIME LISTENERS ---
function initRealtimeListeners() {
    // ... (ส่วน Listeners อื่นๆ เหมือนเดิม ไม่ต้องแก้) ...
    // Complaints, Policies, QA, Announcement, Activities, Members โค้ดเดิม...

    // Copy Listeners เดิมมาใส่ตรงนี้ได้เลยครับ หรือใช้ไฟล์เต็มด้านล่าง
    // เพื่อความชัวร์ ผมใส่ให้ครบเลยครับ

    // 1. Complaints
    // Show initial skeleton
    const complaintTbody = document.getElementById('complaintTable');
    if (complaintTbody) showSkeleton('complaintTable', 5, 'table');

    onValue(ref(db, 'complaints'), (snapshot) => {
        const data = snapshot.val();
        complaintsData = data || {};

        // Update Stats Only
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

        // Render Table based on current filter
        window.renderComplaintsTable(window.currentComplaintFilter || 'All');
    });

    window.renderComplaintsTable = (filterStatus) => {
        const tbody = document.getElementById('complaintTable');
        const loadingEl = document.getElementById('complaintLoading');
        if (loadingEl) loadingEl.classList.add('hidden');

        // Clear skeleton FIRST, then fade
        tbody.innerHTML = '';
        tbody.style.opacity = '0';

        const data = complaintsData;
        if (!data || Object.keys(data).length === 0) {
            tbody.innerHTML = '<tr><td colspan="7" class="p-8 text-center text-slate-400">ไม่มีข้อมูลร้องเรียน</td></tr>';
            tbody.style.opacity = '1';
            return;
        }

        let keys = Object.keys(data).reverse();

        // Filter Logic
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
                    <td class="p-6 font-mono text-brand-600 dark:text-brand-400 font-bold text-xs">#${item.ticketId || '-'}</td>
                    <td class="p-6 font-bold text-slate-800 dark:text-white">${item.topic}</td>
                    <td class="p-6"><span class="bg-slate-100 dark:bg-white/10 text-slate-600 dark:text-slate-300 px-3 py-1.5 rounded-lg text-xs font-bold">${item.name || 'Anonymous'}</span></td>
                    <td class="p-6"><select onchange="window.updateStatus('complaints/${key}', this.value)" class="${badgeClass} px-3 py-1.5 rounded-lg text-xs font-bold border-none cursor-pointer outline-none appearance-none hover:opacity-80 transition"><option value="Pending" ${item.status === 'Pending' ? 'selected' : ''}>Wait</option><option value="In Progress" ${item.status === 'In Progress' ? 'selected' : ''}>Doing</option><option value="Done" ${item.status === 'Done' ? 'selected' : ''}>Done</option><option value="Completed" ${item.status === 'Completed' ? 'selected' : ''}>Completed</option></select></td>
                    <td class="p-6 flex items-center gap-2">
                         <button onclick="window.showDetail('${key}', '${item.topic}', '${(item.detail || '').replace(/'/g, "\\'")}', '${(item.response || '').replace(/'/g, "\\'")}')" class="w-8 h-8 rounded-lg bg-brand-50 text-brand-600 dark:bg-brand-500/20 dark:text-brand-400 hover:bg-brand-100 dark:hover:bg-brand-500/30 flex items-center justify-center transition"><i class="fas fa-eye"></i></button>
                         <button onclick="window.deleteItem('complaints/${key}')" class="w-8 h-8 rounded-lg bg-slate-50 text-slate-400 dark:bg-white/5 dark:text-slate-500 hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-500/20 dark:hover:text-red-400 flex items-center justify-center transition"><i class="fas fa-trash-alt"></i></button>
                    </td>
                </tr>`;
        });

        // Fade in after rendering
        setTimeout(() => {
            tbody.style.opacity = '1';
            tbody.style.transition = 'opacity 0.3s ease-in-out';
        }, 50);
    };

    // 2. Policies
    const policyGrid = document.getElementById('policyGrid');
    if (policyGrid) showSkeleton('policyGrid', 6, 'grid');

    onValue(ref(db, 'policies'), (snapshot) => {
        const data = snapshot.val();
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
                        <button onclick="window.deleteItem('policies/${key}')" class="w-8 h-8 flex items-center justify-center text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 rounded-lg transition"><i class="fas fa-trash-alt"></i></button>
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

    onValue(ref(db, 'qa'), (snapshot) => {
        const data = snapshot.val();
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

        let keys = Object.keys(data).reverse();

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
                        <button onclick="window.deleteItem('qa/${key}')" class="w-8 h-8 rounded-lg bg-slate-50 text-slate-400 dark:bg-white/5 dark:text-slate-500 hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-500/20 dark:hover:text-red-400 flex items-center justify-center transition"><i class="fas fa-trash-alt"></i></button>
                    </td>
                </tr>`;
        });

        setTimeout(() => {
            tbody.style.opacity = '1';
            tbody.style.transition = 'opacity 0.3s ease-in-out';
        }, 50);
    };

    // 4. Announcement
    onValue(ref(db, 'announcement'), (snapshot) => {
        const data = snapshot.val() || {};
        document.getElementById('annoActive').checked = data.active || false;
        document.getElementById('annoTitle').value = data.title || '';
        document.getElementById('annoDetail').value = data.detail || '';
        document.getElementById('annoImage').value = data.image || '';
    });

    // 5. Activities
    const activityGrid = document.getElementById('activityGrid');
    if (activityGrid) showSkeleton('activityGrid', 6, 'grid');

    onValue(ref(db, 'activities'), (snapshot) => {
        const data = snapshot.val();
        const grid = document.getElementById('activityGrid');

        grid.innerHTML = '';
        grid.style.opacity = '0';

        if (!data) { grid.innerHTML = '<div class="col-span-full text-center text-slate-400 py-10">ว่างเปล่า</div>'; grid.style.opacity = '1'; return; }
        Object.keys(data).forEach(key => {
            const item = data[key];
            grid.innerHTML += `
                <div class="bg-white dark:bg-slate-800 rounded-3xl shadow-sm overflow-hidden group relative border border-slate-100 dark:border-white/5 hover:shadow-lg transition-all duration-300">
                    <button onclick="window.deleteItem('activities/${key}')" class="absolute top-3 right-3 bg-white/90 dark:bg-slate-900/90 backdrop-blur rounded-xl w-10 h-10 text-slate-400 hover:text-red-500 shadow-sm opacity-0 group-hover:opacity-100 transition z-10 flex items-center justify-center"><i class="fas fa-trash-alt"></i></button>
                    <div class="h-48 bg-slate-100 dark:bg-slate-700/50 relative overflow-hidden">
                        <img src="${item.image}" class="w-full h-full object-cover group-hover:scale-105 transition duration-500">
                        <div class="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent opacity-60"></div>
                        <span class="absolute bottom-3 left-3 text-[10px] font-bold bg-white/90 dark:bg-black/80 text-slate-900 dark:text-white px-2 py-1 rounded-lg uppercase tracking-wider backdrop-blur-sm shadow-sm">${item.category}</span>
                    </div>
                    <div class="p-5">
                        <h3 class="font-bold text-slate-800 dark:text-white line-clamp-1 text-lg">${item.title}</h3>
                    </div>
                </div>`;
        });

        setTimeout(() => {
            grid.style.opacity = '1';
            grid.style.transition = 'opacity 0.3s ease-in-out';
        }, 50);
    });

    // 6. Members
    const memberGrid = document.getElementById('memberGrid');
    if (memberGrid) showSkeleton('memberGrid', 6, 'grid');

    onValue(ref(db, 'members'), (snapshot) => {
        const data = snapshot.val();
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
                        <button onclick="window.deleteItem('members/${key}')" class="text-slate-400 hover:text-red-500 w-8 h-8 rounded-lg hover:bg-slate-50 dark:hover:bg-white/5 transition"><i class="fas fa-trash-alt"></i></button>
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

    });

    // 7. Maintenance (ปรับปรุงแล้ว: อัปเดต UI จากฐานข้อมูล)
    onValue(ref(db, 'maintenance'), (snapshot) => {
        const status = snapshot.val();
        document.getElementById('maintenanceToggle').checked = status;
        const text = document.getElementById('maintenanceStatusText');
        text.innerText = status ? 'ON' : 'OFF';
        text.className = status ? 'ml-3 text-sm font-bold text-red-500' : 'ml-3 text-sm font-bold text-slate-400';
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
        preConfirm: () => {
            const response = document.getElementById('swal-input-response').value;
            if (!response || response.trim().length < 5) {
                Swal.showValidationMessage('คำตอบต้องมีอย่างน้อย 5 ตัวอักษร');
                return false;
            }
            return update(ref(db, 'complaints/' + key), { response: response });
        }
    }).then((result) => {
        if (result.isConfirmed) {
            showToast('บันทึกการตอบกลับแล้ว!', 'success');
        }
    });
}

window.updateStatus = (path, status) => {
    update(ref(db, path), { status: status }).then(() => {
        showToast('อัปเดตสถานะแล้ว!', 'success');
    });
}

// ✅ NEW: TOGGLE MAINTENANCE WITH CONFIRMATION
window.toggleMaintenance = (checkbox) => {
    const isTurningOn = checkbox.checked;

    // ถามยืนยันก่อน
    Swal.fire({
        title: 'ยืนยันการเปลี่ยนสถานะ?',
        text: isTurningOn ? "คุณกำลังจะเปิดโหมดปิดปรับปรุง (ผู้ใช้ทั่วไปจะเข้าไม่ได้)" : "คุณกำลังจะปิดโหมดปิดปรับปรุง (เว็บไซต์จะออนไลน์ปกติ)",
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: isTurningOn ? '#ef4444' : '#3b82f6',
        cancelButtonColor: '#94a3b8',
        confirmButtonText: isTurningOn ? 'ใช่, ปิดปรับปรุงเลย' : 'ใช่, เปิดใช้งานเว็บ',
        cancelButtonText: 'ยกเลิก'
    }).then((result) => {
        if (result.isConfirmed) {
            // ถ้ายืนยัน -> อัปเดต Database
            set(ref(db, 'maintenance'), isTurningOn)
                .then(() => {
                    const Toast = Swal.mixin({ toast: true, position: 'top-end', showConfirmButton: false, timer: 1500 });
                    Toast.fire({ icon: 'success', title: 'บันทึกการตั้งค่าแล้ว' });
                });
        } else {
            // ถ้ายกเลิก -> ดีดสวิตช์กลับที่เดิม
            checkbox.checked = !isTurningOn;
        }
    });
}

window.saveAnnouncement = (e) => {
    e.preventDefault();
    const formData = new FormData(e.target);
    const data = Object.fromEntries(formData.entries());
    data.active = document.getElementById('annoActive').checked;

    set(ref(db, 'announcement'), data).then(() => {
        showToast('บันทึกประกาศเรียบร้อย!', 'success');
    }).catch(err => {
        showToast('เกิดข้อผิดพลาด', 'error');
        console.error(err);
    });
}

// Search Function
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

window.submitReply = (e) => {
    e.preventDefault();
    const formData = new FormData(e.target);
    const answer = formData.get('answer');

    // Basic validation
    if (!answer || answer.trim().length < 5) {
        showToast('คำตอบต้องมีอย่างน้อย 5 ตัวอักษร', 'error');
        return;
    }

    const btn = e.target.querySelector('button[type="submit"]');
    const original = btn.innerHTML;

    btn.innerHTML = '<i class="fas fa-circle-notch fa-spin"></i> กำลังส่ง...';
    btn.disabled = true;
    btn.classList.add('opacity-75');

    update(ref(db, 'qa/' + formData.get('key')), {
        answer: answer,
        status: 'Answered'
    })
        .then(() => {
            btn.innerHTML = '<i class="fas fa-check-circle animate-checkmark"></i> สำเร็จ!';
            btn.classList.add('bg-green-600');
            showToast('ตอบกลับเรียบร้อย!', 'success');

            setTimeout(() => {
                window.closeModal('qaModal');
            }, 500);
        })
        .catch(err => {
            showToast('เกิดข้อผิดพลาด', 'error');
            console.error(err);
        })
        .finally(() => {
            setTimeout(() => {
                btn.innerHTML = original;
                btn.disabled = false;
                btn.classList.remove('opacity-75', 'bg-green-600');
            }, 800);
        });
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

window.handleFirebaseSubmit = (e, collection, modalId) => {
    e.preventDefault();
    const btn = e.target.querySelector('button[type="submit"]');
    const original = btn.innerHTML;

    // Loading state
    btn.innerHTML = '<i class="fas fa-circle-notch fa-spin"></i> กำลังบันทึก...';
    btn.disabled = true;
    btn.classList.add('opacity-75');

    const formData = new FormData(e.target);
    const data = Object.fromEntries(formData.entries());
    const key = data.key;
    delete data.key;

    let promise;
    if (key && key.trim() !== "") {
        promise = update(ref(db, collection + '/' + key), data);
    } else {
        data.timestamp = Date.now();
        promise = push(ref(db, collection), data);
    }

    promise.then(() => {
        // Success animation
        btn.innerHTML = '<i class="fas fa-check-circle animate-checkmark"></i> สำเร็จ!';
        btn.classList.remove('opacity-75');
        btn.classList.add('bg-green-600');

        showToast('บันทึกสำเร็จ!', 'success');

        setTimeout(() => {
            window.closeModal(modalId);
            e.target.reset();

            // Reset validation states if any
            e.target.querySelectorAll('input, textarea, select').forEach(input => {
                input.classList.remove('valid', 'invalid');
            });
        }, 500);
    })
        .catch(err => {
            showToast('เกิดข้อผิดพลาด: ' + err.message, 'error');
            console.error(err);
        })
        .finally(() => {
            setTimeout(() => {
                btn.innerHTML = original;
                btn.disabled = false;
                btn.classList.remove('opacity-75', 'bg-green-600');
            }, 800);
        });
}

window.deleteItem = (path) => {
    Swal.fire({
        title: 'ยืนยันลบ?', text: "ไม่สามารถกู้คืนได้นะ", icon: 'warning',
        showCancelButton: true, confirmButtonColor: '#ef4444', cancelButtonColor: '#cbd5e1',
        confirmButtonText: 'ลบเลย', cancelButtonText: 'ยกเลิก'
    }).then((result) => {
        if (result.isConfirmed) { remove(ref(db, path)); }
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

    // Header
    let csvContent = "data:text/csv;charset=utf-8,Date,Ticket ID,Topic,Reporter,Detail,Status,Response\n";

    Object.values(complaintsData).forEach(item => {
        const date = new Date(item.timestamp).toLocaleDateString('th-TH');
        const row = [
            date,
            item.ticketId || '-',
            `"${(item.topic || '').replace(/"/g, '""')}"`, // Escape quotes
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

window.toggleDarkMode = () => {
    document.documentElement.classList.toggle('dark');
    const isDark = document.documentElement.classList.contains('dark');
    localStorage.setItem('darkMode', isDark);

    const btn = document.getElementById('darkModeBtn');
    if (btn) {
        btn.innerHTML = isDark
            ? '<i class="fas fa-sun w-5 text-center text-yellow-400"></i> <span>Light Mode</span>'
            : '<i class="fas fa-moon w-5 text-center"></i> <span>Dark Mode</span>';
    }

    // Update Graphs/Colors if needed globally
};

// Check Dark Mode on Load
if (localStorage.getItem('darkMode') === 'true') {
    window.toggleDarkMode();
}

// Start Check Session
window.addEventListener('load', window.checkSession);