import { ref, push, onValue, query, limitToLast, get, orderByChild, equalTo } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";
import { db } from "./config.js";

let membersData = {};

// --- UTILITY FUNCTIONS ---

// Skeleton Loader Helper
function showSkeleton(containerId, count = 3, type = 'card') {
    const container = document.getElementById(containerId);
    if (!container) return;

    container.innerHTML = '';
    for (let i = 0; i < count; i++) {
        if (type === 'card') {
            container.innerHTML += `<div class="skeleton-card"></div>`;
        } else if (type === 'policy') {
            container.innerHTML += `
                <div class="glass-card p-10 rounded-[3rem] animate-pulse">
                    <div class="skeleton-title mb-4"></div>
                    <div class="skeleton-text mb-2"></div>
                    <div class="skeleton-text w-3/4"></div>
                </div>`;
        } else if (type === 'qa') {
            container.innerHTML += `
                <div class="glass-card p-8 rounded-[2.5rem] animate-pulse">
                    <div class="skeleton-text mb-4"></div>
                    <div class="skeleton-title w-2/3"></div>
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

// --- REALTIME DATA (OPTIMIZED) ---

// 1. Stats
onValue(ref(db), (snapshot) => {
    const data = snapshot.val() || {};
    const policies = data.policies || {};
    const members = data.members || {};
    const complaints = data.complaints || {};

    const totalPolicies = Object.keys(policies).length;
    const donePolicies = Object.values(policies).filter(p => p.status === 'Completed').length;
    const successRate = totalPolicies > 0 ? Math.round((donePolicies / totalPolicies) * 100) : 0;
    const memberCount = Object.keys(members).length;
    const activeComplaints = Object.values(complaints).filter(c => c.status !== 'Done').length;

    if (document.getElementById("statSuccess")) {
        animateValue("statSuccess", parseInt(document.getElementById("statSuccess").innerText), successRate, 1000);
        animateValue("statMember", parseInt(document.getElementById("statMember").innerText), memberCount, 1000);
        animateValue("statActive", parseInt(document.getElementById("statActive").innerText), activeComplaints, 1000);
        document.getElementById('barSuccess').style.width = successRate + '%';
    }
});

// 2. Activities (ดึงแค่ 20 อันล่าสุด เพื่อไม่ให้เครื่องค้าง)
const activityGallery = document.getElementById('activityGallery');
if (activityGallery) showSkeleton('activityGallery', 6, 'card');

onValue(query(ref(db, 'activities'), limitToLast(20)), (snapshot) => {
    const data = snapshot.val();
    const gallery = document.getElementById('activityGallery');
    if (!gallery) return;

    if (!data) {
        gallery.innerHTML = '<div class="col-span-full text-center py-20 opacity-50"><i class="fas fa-images text-6xl text-slate-300 mb-4 block"></i><p class="text-slate-400">ยังไม่มีกิจกรรม</p></div>';
        return;
    }

    // Clear skeleton and add fade-in effect
    gallery.innerHTML = '';
    gallery.style.opacity = '0';
    setTimeout(() => {
        Object.values(data).reverse().forEach(item => {
            let color = item.category === 'SPORTS' ? 'bg-green-500' : (item.category === 'ACADEMIC' ? 'bg-blue-500' : 'bg-purple-500');
            gallery.innerHTML += `
                <div class="glass-card h-80 rounded-[2.5rem] overflow-hidden group relative cursor-pointer hover:shadow-2xl transition-all duration-500 border-0 card-lift">
                    <img src="${item.image}" class="w-full h-full object-cover transition duration-700 group-hover:scale-110" onerror="this.src='data:image/svg+xml;charset=UTF-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22600%22%20height%3D%22400%22%20viewBox%3D%220%200%20600%20400%22%3E%3Crect%20fill%3D%22%23cbd5e1%22%20width%3D%22600%22%20height%3D%22400%22%2F%3E%3Ctext%20fill%3D%22%2364748b%22%20font-family%3D%22sans-serif%22%20font-size%3D%2230%22%20dy%3D%2210.5%22%20font-weight%3D%22bold%22%20x%3D%2250%25%22%20y%3D%2250%25%22%20text-anchor%3D%22middle%22%3ENo%20Image%3C%2Ftext%3E%3C%2Fsvg%3E'">
                    <div class="absolute inset-0 bg-gradient-to-t from-slate-900/90 via-slate-900/20 to-transparent flex flex-col justify-end p-8 translate-y-4 group-hover:translate-y-0 transition-transform duration-500">
                        <span class="${color} text-white text-[10px] font-bold px-3 py-1 rounded-full w-fit mb-3 uppercase tracking-wider shadow-lg">${item.category}</span>
                        <h3 class="text-white font-display font-bold text-2xl leading-snug drop-shadow-md group-hover:text-blue-300 transition-colors">${item.title}</h3>
                    </div>
                </div>`;
        });
        gallery.style.opacity = '1';
        gallery.style.transition = 'opacity 0.5s ease-in-out';
    }, 100);
});

// 3. Policies
const policyList = document.getElementById('policyList');
if (policyList) showSkeleton('policyList', 3, 'policy');

onValue(ref(db, 'policies'), (snapshot) => {
    const data = snapshot.val();
    const container = document.getElementById('policyList');
    if (!container) return;

    if (!data) {
        container.innerHTML = '<div class="text-center py-20 text-slate-400">ยังไม่มีนโยบาย</div>';
        return;
    }

    container.innerHTML = '';
    container.style.opacity = '0';

    let idx = 0;
    Object.values(data).forEach(item => {
        idx++;
        let theme = item.status === 'Completed' ? { c: 'bg-green-500', b: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300' } : (item.status === 'In Progress' ? { c: 'bg-blue-500', b: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300' } : { c: 'bg-yellow-400', b: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-300' });
        let imgHtml = item.image ? `<img src="${item.image}" class="w-full h-56 object-cover rounded-3xl mb-6 shadow-md hover:shadow-xl transition-shadow duration-500">` : '';

        container.innerHTML += `
            <div class="glass-card p-10 rounded-[3rem] hover:border-blue-400/50 transition-all duration-500 hover:shadow-2xl group">
                ${imgHtml}
                <div class="flex flex-col md:flex-row justify-between items-start mb-8 gap-4">
                    <div class="flex items-start gap-6">
                        <div class="w-16 h-16 rounded-3xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center font-black text-3xl text-slate-300 dark:text-slate-600 group-hover:text-blue-500 transition-colors">${idx}</div>
                        <div>
                            <h3 class="text-3xl font-display font-bold text-slate-900 dark:text-white leading-tight mb-2">${item.title}</h3>
                            <span class="${theme.b} px-4 py-1.5 rounded-full text-xs font-bold uppercase tracking-wider shadow-sm inline-block">${item.status}</span>
                        </div>
                    </div>
                </div>
                <div class="md:pl-24">
                    <div class="flex justify-between text-xs font-bold text-slate-400 uppercase mb-2"><span>Progress</span><span>${item.percent}%</span></div>
                    <div class="w-full bg-slate-100 dark:bg-slate-700/50 h-3 rounded-full overflow-hidden mb-6"><div id="prog-${idx}" class="${theme.c} h-full transition-all duration-[1500ms] ease-out shadow-[0_0_15px_rgba(0,0,0,0.2)]" style="width:0%"></div></div>
                    <p class="text-slate-600 dark:text-slate-400 text-lg leading-relaxed">${item.detail}</p>
                </div>
            </div>`;
        setTimeout(() => { if (document.getElementById(`prog-${idx}`)) document.getElementById(`prog-${idx}`).style.width = item.percent + '%'; }, 200 + (idx * 100));
    });

    container.style.opacity = '1';
    container.style.transition = 'opacity 0.5s ease-in-out';
});

// 4. Members
const teamGrid = document.getElementById('teamGrid');
if (teamGrid) showSkeleton('teamGrid', 6, 'card');

onValue(ref(db, 'members'), (snapshot) => {
    const data = snapshot.val();
    membersData = data || {};
    const container = document.getElementById('teamGrid');
    if (!container) return;

    container.innerHTML = '';
    container.style.opacity = '0';

    Object.keys(data).forEach(key => {
        const item = data[key];
        container.innerHTML += `
            <div onclick="window.openMemberDetail('${key}')" class="glass-card rounded-[3rem] overflow-hidden group hover:-translate-y-3 transition-all duration-500 cursor-pointer border-0 shadow-lg hover:shadow-2xl">
                <div class="h-96 bg-slate-200 dark:bg-slate-800 overflow-hidden relative">
                    <img src="${item.image}" class="w-full h-full object-cover transition duration-700 group-hover:scale-105" onerror="this.src='data:image/svg+xml;charset=UTF-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22400%22%20height%3D%22500%22%20viewBox%3D%220%200%20400%20500%22%3E%3Crect%20fill%3D%22%23cbd5e1%22%20width%3D%22400%22%20height%3D%22500%22%2F%3E%3Ctext%20fill%3D%22%2364748b%22%20font-family%3D%22sans-serif%22%20font-size%3D%2230%22%20dy%3D%2210.5%22%20font-weight%3D%22bold%22%20x%3D%2250%25%22%20y%3D%2250%25%22%20text-anchor%3D%22middle%22%3EUser%3C%2Ftext%3E%3C%2Fsvg%3E'">
                    <div class="absolute bottom-0 left-0 w-full p-8 bg-gradient-to-t from-slate-900 via-slate-900/80 to-transparent pt-32">
                        <span class="text-blue-400 text-xs font-bold tracking-widest uppercase mb-1 block">${item.role}</span>
                        <h4 class="text-2xl font-display font-bold text-white leading-tight drop-shadow-md group-hover:text-blue-200 transition-colors">${item.name}</h4>
                    </div>
                </div>
                <div class="p-6 bg-white dark:bg-slate-800 flex justify-between items-center relative z-10">
                    <span class="text-xs font-bold text-slate-400 tracking-wider">ดูประวัติ</span>
                    <div class="w-10 h-10 rounded-full bg-slate-100 dark:bg-slate-700 hover:bg-blue-600 hover:text-white dark:hover:bg-blue-500 dark:hover:text-white flex items-center justify-center transition-all duration-300 text-slate-400 dark:text-slate-300"><i class="fas fa-arrow-right"></i></div>
                </div>
            </div>`;
    });

    container.style.opacity = '1';
    container.style.transition = 'opacity 0.5s ease-in-out';
});

// 5. Q&A (ดึง 50 อันล่าสุด)
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

    container.innerHTML = '';
    container.style.opacity = '0';

    Object.values(data).reverse().forEach(item => {
        let statusBadge = item.status === 'Answered'
            ? '<span class="bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 text-[10px] font-bold px-2 py-1 rounded-full"><i class="fas fa-check-circle mr-1"></i> ตอบแล้ว</span>'
            : '<span class="bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400 text-[10px] font-bold px-2 py-1 rounded-full"><i class="fas fa-clock mr-1"></i> รอคำตอบ</span>';

        let answerHtml = item.answer
            ? `<div class="mt-6 pt-6 border-t border-slate-100 dark:border-slate-700/50">
                <div class="flex gap-4">
                    <div class="w-10 h-10 rounded-xl bg-blue-600 flex-shrink-0 flex items-center justify-center text-white text-sm font-bold shadow-lg shadow-blue-500/30">SC</div>
                    <div>
                        <p class="text-xs font-bold text-slate-400 uppercase tracking-wide mb-1">คำตอบจากสภา</p>
                        <p class="text-slate-700 dark:text-slate-300 text-base leading-relaxed">${item.answer}</p>
                    </div>
                </div>
               </div>`
            : '';

        container.innerHTML += `
            <div class="glass-card p-8 rounded-[2.5rem] hover:border-blue-300/30 transition-all duration-300 group">
                <div class="flex justify-between items-start mb-4">
                    <span class="text-xs text-slate-400 font-mono flex items-center gap-2"><i class="far fa-calendar-alt"></i> ${new Date(item.timestamp).toLocaleDateString('th-TH')}</span>
                    ${statusBadge}
                </div>
                <h4 class="font-bold text-xl text-slate-900 dark:text-white mb-2 group-hover:text-blue-500 transition-colors">"${item.question}"</h4>
                ${answerHtml}
            </div>`;
    });

    container.style.opacity = '1';
    container.style.transition = 'opacity 0.5s ease-in-out';
});

// 6. Announcement (Popup Image Logic)
onValue(ref(db, 'announcement'), (snapshot) => {
    const data = snapshot.val();
    const popup = document.getElementById('announcement-popup');
    if (popup && data && data.active) {
        document.getElementById('anno-title').innerText = data.title;
        document.getElementById('anno-detail').innerText = data.detail;

        // Image Logic: Show full image
        const imgContainer = document.getElementById('anno-img-container');
        const img = document.getElementById('anno-img');
        if (data.image) {
            imgContainer.classList.remove('hidden');
            img.src = data.image;
        } else {
            imgContainer.classList.add('hidden');
        }
        popup.classList.remove('hidden');
    } else if (popup) {
        popup.classList.add('hidden');
    }
});

// 7. Maintenance
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

// --- INTERACTIONS ---


window.submitComplaint = (e) => {
    e.preventDefault();

    // Validate required fields - name is optional (Anonymous)
    const name = e.target.querySelector('[name="name"]');
    const detail = e.target.querySelector('[name="detail"]');

    if (!detail) return;

    const detailValid = validateInput(detail, { required: true });

    if (!detailValid) {
        showToast('กรุณากรอกรายละเอียดปัญหา', 'error');
        return;
    }

    const btn = document.getElementById('btnSubmit');
    const original = btn.innerHTML;
    btn.innerHTML = '<i class="fas fa-circle-notch fa-spin"></i> \u0e01\u0e33\u0e25\u0e31\u0e07\u0e2a\u0e48\u0e07...';
    btn.disabled = true;
    btn.classList.add('opacity-75', 'cursor-not-allowed');

    const formData = new FormData(e.target);
    const data = Object.fromEntries(formData.entries());

    // Generate Ticket ID
    const ticketId = '#TK-' + Math.floor(100000 + Math.random() * 900000); // 6 digit random
    data.status = 'Pending';
    data.timestamp = Date.now();
    data.ticketId = ticketId;

    push(ref(db, 'complaints'), data)
        .then(() => {
            // Success animation
            btn.innerHTML = '<i class="fas fa-check-circle animate-checkmark"></i> \u0e2a\u0e33\u0e40\u0e23\u0e47\u0e08!';
            btn.classList.remove('opacity-75');
            btn.classList.add('bg-green-600');


            setTimeout(() => {
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
                e.target.reset();
                if (name) name.classList.remove('valid', 'invalid');
                detail.classList.remove('valid', 'invalid');
            }, 500);
        })
        .catch(err => {
            showToast('\u0e40\u0e01\u0e34\u0e14\u0e02\u0e49\u0e2d\u0e1c\u0e34\u0e14\u0e1e\u0e25\u0e32\u0e14: ' + err.message, 'error');
            console.error(err);
        })
        .finally(() => {
            setTimeout(() => {
                btn.innerHTML = original;
                btn.disabled = false;
                btn.classList.remove('opacity-75', 'cursor-not-allowed', 'bg-green-600');
            }, 800);
        });
};

window.checkTicket = () => {
    let input = document.getElementById('trackInput').value.trim().toUpperCase();
    if (!input) {
        showToast('กรุณากรอก Ticket ID', 'error');
        return;
    }
    if (!input.startsWith('#')) input = '#' + input; // Auto add # if missing

    const btn = document.querySelector('#complaint-track-view button');
    const original = btn.innerHTML;
    btn.innerHTML = '<i class="fas fa-circle-notch fa-spin"></i> ตรวจสอบ...';
    btn.disabled = true;
    btn.classList.add('opacity-75');

    const resultBox = document.getElementById('trackResult');
    resultBox.classList.add('hidden');

    // Query by ticketId (client side filter as simple solution for now, better to queryIndex in prod)
    get(query(ref(db, 'complaints'), orderByChild('ticketId'), equalTo(input)))
        .then((snapshot) => {
            const data = snapshot.val();
            resultBox.classList.remove('hidden');
            resultBox.style.animation = 'fadeInScale 0.5s ease-out';

            if (data) {
                const item = Object.values(data)[0];
                const iconEl = document.getElementById('trackStatusIcon');
                const titleEl = document.getElementById('trackStatusTitle');
                const descEl = document.getElementById('trackStatusDesc');
                const respEl = document.getElementById('trackResponse');

                if (item.status === 'Pending') {
                    iconEl.innerHTML = '<i class="fas fa-clock text-orange-500"></i>';
                    titleEl.innerText = '\u0e01\u0e33\u0e25\u0e31\u0e07\u0e14\u0e33\u0e40\u0e19\u0e34\u0e19\u0e01\u0e32\u0e23 (Pending)';
                    descEl.innerText = '\u0e40\u0e23\u0e37\u0e48\u0e2d\u0e07\u0e02\u0e2d\u0e07\u0e04\u0e38\u0e13\u0e44\u0e14\u0e49\u0e23\u0e31\u0e1a\u0e40\u0e02\u0e49\u0e32\u0e23\u0e30\u0e1a\u0e1a\u0e41\u0e25\u0e49\u0e27 \u0e01\u0e33\u0e25\u0e31\u0e07\u0e23\u0e2d\u0e01\u0e32\u0e23\u0e15\u0e23\u0e27\u0e08\u0e2a\u0e2d\u0e1a';
                } else if (item.status === 'In Progress') {
                    iconEl.innerHTML = '<i class="fas fa-tools text-blue-500 animate-pulse"></i>';
                    titleEl.innerText = '\u0e01\u0e33\u0e25\u0e31\u0e07\u0e41\u0e01\u0e49\u0e44\u0e02 (In Progress)';
                    descEl.innerText = '\u0e2a\u0e20\u0e32\u0e19\u0e31\u0e01\u0e40\u0e23\u0e35\u0e22\u0e19\u0e01\u0e33\u0e25\u0e31\u0e07\u0e14\u0e33\u0e40\u0e19\u0e34\u0e19\u0e07\u0e32\u0e19\u0e40\u0e23\u0e37\u0e48\u0e2d\u0e07\u0e19\u0e35\u0e49\u0e2d\u0e22\u0e39\u0e48';
                } else if (item.status === 'Completed' || item.status === 'Done') {
                    iconEl.innerHTML = '<i class="fas fa-check-circle text-green-500"></i>';
                    titleEl.innerText = '\u0e14\u0e33\u0e40\u0e19\u0e34\u0e19\u0e01\u0e32\u0e23\u0e40\u0e2a\u0e23\u0e47\u0e08\u0e2a\u0e34\u0e49\u0e19 (Completed)';
                    descEl.innerText = '\u0e40\u0e23\u0e37\u0e48\u0e2d\u0e07\u0e23\u0e49\u0e2d\u0e07\u0e40\u0e23\u0e35\u0e22\u0e19\u0e19\u0e35\u0e49\u0e44\u0e14\u0e49\u0e23\u0e31\u0e1a\u0e01\u0e32\u0e23\u0e41\u0e01\u0e49\u0e44\u0e02\u0e41\u0e25\u0e49\u0e27';
                }

                respEl.innerHTML = item.response ? `"${item.response}"` : `<span class="text-slate-400 italic">\u0e22\u0e31\u0e07\u0e44\u0e21\u0e48\u0e21\u0e35\u0e01\u0e32\u0e23\u0e15\u0e2d\u0e1a\u0e01\u0e25\u0e31\u0e1a\u0e08\u0e32\u0e01\u0e40\u0e08\u0e49\u0e32\u0e2b\u0e19\u0e49\u0e32\u0e17\u0e35\u0e48</span>`;
                showToast('\u0e1e\u0e1a\u0e02\u0e49\u0e2d\u0e21\u0e39\u0e25\u0e41\u0e25\u0e49\u0e27!', 'success');
            } else {
                document.getElementById('trackStatusIcon').innerHTML = '<i class="fas fa-times-circle text-red-500"></i>';
                document.getElementById('trackStatusTitle').innerText = 'ไม่พบข้อมูล';
                document.getElementById('trackStatusDesc').innerText = 'ไม่พบ Ticket ID นี้ในระบบ โปรดตรวจสอบความถูกต้อง';
                document.getElementById('trackResponse').innerText = '-';
                showToast('Ticket ไม่พบในระบบ', 'error');
            }
        })
        .catch(err => {
            console.error(err);
            showToast('เกิดข้อผิดพลาด', 'error');
        })
        .finally(() => {
            btn.innerHTML = original;
            btn.disabled = false;
            btn.classList.remove('opacity-75');
        });
}

window.switchComplaintMode = (mode) => {
    document.getElementById('btn-mode-submit').className = mode === 'submit' ? 'px-6 py-2.5 rounded-xl font-bold text-sm bg-white dark:bg-slate-700 text-blue-600 dark:text-blue-400 shadow-sm transition-all duration-300' : 'px-6 py-2.5 rounded-xl font-bold text-sm text-slate-500 dark:text-slate-400 hover:bg-white/50 dark:hover:bg-slate-700/50 transition-all duration-300';
    document.getElementById('btn-mode-track').className = mode === 'track' ? 'px-6 py-2.5 rounded-xl font-bold text-sm bg-white dark:bg-slate-700 text-blue-600 dark:text-blue-400 shadow-sm transition-all duration-300' : 'px-6 py-2.5 rounded-xl font-bold text-sm text-slate-500 dark:text-slate-400 hover:bg-white/50 dark:hover:bg-slate-700/50 transition-all duration-300';

    if (mode === 'submit') {
        document.getElementById('complaint-submit-view').classList.remove('hidden');
        document.getElementById('complaint-track-view').classList.add('hidden');
    } else {
        document.getElementById('complaint-submit-view').classList.add('hidden');
        document.getElementById('complaint-track-view').classList.remove('hidden');
    }
}

window.submitQa = (e) => {
    e.preventDefault();

    // Validate question field
    const question = e.target.querySelector('[name="question"]');
    if (!question) return;

    const questionValid = validateInput(question, { required: true });

    if (!questionValid) {
        showToast('กรุณากรอกคำถามอย่างน้อย 5 ตัวอักษร', 'error');
        return;
    }

    const btn = document.getElementById('btnQaSubmit');
    const original = btn.innerHTML;
    btn.innerHTML = '<i class="fas fa-circle-notch fa-spin"></i> กำลังส่ง...';
    btn.disabled = true;
    btn.classList.add('opacity-75');

    const formData = new FormData(e.target);
    const data = Object.fromEntries(formData.entries());
    data.status = 'Pending';
    data.timestamp = Date.now();

    push(ref(db, 'qa'), data)
        .then(() => {
            btn.innerHTML = '<i class="fas fa-check-circle animate-checkmark"></i> สำเร็จ!';
            btn.classList.add('bg-green-600');
            showToast('ส่งคำถามเรียบร้อยแล้ว!', 'success');
            setTimeout(() => {
                e.target.reset();
                question.classList.remove('valid', 'invalid');
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
};

window.switchPage = (pageId) => {
    document.querySelectorAll('.page-section').forEach(el => el.classList.remove('active'));
    document.getElementById('page-' + pageId).classList.add('active');
    document.querySelectorAll('.nav-btn').forEach(btn => btn.classList.remove('active'));
    const navBtn = document.getElementById('nav-' + pageId);
    if (navBtn) navBtn.classList.add('active');
    window.scrollTo(0, 0);
};

// Close complaint/QA modal screens
window.closeComplaintScreen = () => {
    const screens = ['complaint-screen', 'qa-screen', 'track-screen'];
    screens.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.classList.add('hidden');
    });
};

window.toggleTheme = () => {
    const html = document.documentElement;
    const icon = document.getElementById('theme-icon');
    if (html.classList.contains('dark')) {
        html.classList.remove('dark'); localStorage.theme = 'light';
        icon.className = 'fas fa-moon text-lg transition-transform duration-500';
    } else {
        html.classList.add('dark'); localStorage.theme = 'dark';
        icon.className = 'fas fa-sun text-lg transition-transform duration-500';
    }
};

window.toggleMobileMenu = () => document.getElementById('mobile-menu').classList.toggle('hidden');

window.openMemberDetail = (key) => {
    const item = membersData[key];
    if (item) {
        document.getElementById('modal-name').innerText = item.name;
        document.getElementById('modal-role').innerText = item.role;
        document.getElementById('modal-member-img').src = item.image;

        const mottoEl = document.getElementById('modal-motto');
        if (item.motto) { mottoEl.innerText = `"${item.motto}"`; mottoEl.parentElement.classList.remove('hidden'); } else { mottoEl.parentElement.classList.add('hidden'); }

        const bioEl = document.getElementById('modal-bio');
        const bioContainer = document.getElementById('modal-bio-container');
        if (item.bio) { bioEl.innerText = item.bio; bioContainer.classList.remove('hidden'); } else { bioContainer.classList.add('hidden'); }

        document.getElementById('member-detail-modal').classList.remove('hidden');
        document.getElementById('member-detail-modal').classList.add('flex');
        document.body.style.overflow = 'hidden';
    }
}

window.closeMemberDetail = () => {
    document.getElementById('member-detail-modal').classList.add('hidden');
    document.getElementById('member-detail-modal').classList.remove('flex');
    document.body.style.overflow = '';
}

function animateValue(id, start, end, duration) {
    if (start === end) return;
    let obj = document.getElementById(id); let startTimestamp = null;
    const step = (timestamp) => {
        if (!startTimestamp) startTimestamp = timestamp;
        const progress = Math.min((timestamp - startTimestamp) / duration, 1);
        obj.innerHTML = Math.floor(progress * (end - start) + start);
        if (progress < 1) window.requestAnimationFrame(step);
    };
    window.requestAnimationFrame(step);
}

// Initial Load
if (localStorage.theme === 'dark' || (!('theme' in localStorage) && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
    document.documentElement.classList.add('dark');
    document.getElementById('theme-icon').className = 'fas fa-sun text-lg transition-transform duration-500';
}
window.addEventListener('load', () => window.switchPage('home'));