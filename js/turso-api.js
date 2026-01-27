// Turso API Client Wrapper
// ใช้แทน Firebase Realtime Database

// API Base URL - เปลี่ยนเป็น production URL หลัง deploy
const API_BASE = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
    ? '/api'
    : '/api';

// ==================== AUTH TOKEN ====================
let currentAuthToken = null;

export function setAuthToken(token) {
    currentAuthToken = token;
}

export function getAuthToken() {
    return currentAuthToken;
}

// ==================== API HELPERS ====================

async function apiCall(endpoint, method = 'GET', data = null, requireAuth = false) {
    const headers = {
        'Content-Type': 'application/json'
    };

    if (requireAuth && currentAuthToken) {
        headers['Authorization'] = `Bearer ${currentAuthToken}`;
    }

    const options = { method, headers };
    if (data && method !== 'GET') {
        options.body = JSON.stringify(data);
    }

    try {
        const response = await fetch(`${API_BASE}${endpoint}`, options);
        const json = await response.json();

        if (!response.ok) {
            throw new Error(json.error || 'API Error');
        }

        return json;
    } catch (error) {
        console.error(`API Error [${method} ${endpoint}]:`, error);
        throw error;
    }
}

// ==================== CRUD FUNCTIONS ====================

// --- Policies ---
export const policies = {
    getAll: () => apiCall('/policies'),
    get: (id) => apiCall(`/policies?id=${id}`),
    create: (data) => apiCall('/policies', 'POST', data, true),
    update: (id, data) => apiCall(`/policies?id=${id}`, 'PUT', data, true),
    delete: (id) => apiCall(`/policies?id=${id}`, 'DELETE', null, true)
};

// --- Members ---
export const members = {
    getAll: () => apiCall('/members'),
    get: (id) => apiCall(`/members?id=${id}`),
    create: (data) => apiCall('/members', 'POST', data, true),
    update: (id, data) => apiCall(`/members?id=${id}`, 'PUT', data, true),
    delete: (id) => apiCall(`/members?id=${id}`, 'DELETE', null, true)
};

// --- Complaints ---
export const complaints = {
    getAll: () => apiCall('/complaints'),
    get: (id) => apiCall(`/complaints?id=${id}`),
    getByTicket: (ticketId) => apiCall(`/complaints?ticketId=${encodeURIComponent(ticketId)}`),
    create: (data) => apiCall('/complaints', 'POST', data), // No auth for public submission
    update: (id, data) => apiCall(`/complaints?id=${id}`, 'PUT', data, true),
    delete: (id) => apiCall(`/complaints?id=${id}`, 'DELETE', null, true)
};

// --- Activities ---
export const activities = {
    getAll: () => apiCall('/activities'),
    get: (id) => apiCall(`/activities?id=${id}`),
    create: (data) => apiCall('/activities', 'POST', data, true),
    update: (id, data) => apiCall(`/activities?id=${id}`, 'PUT', data, true),
    delete: (id) => apiCall(`/activities?id=${id}`, 'DELETE', null, true)
};

// --- Q&A ---
export const qa = {
    getAll: (limit = 50) => apiCall(`/qa?limit=${limit}`),
    get: (id) => apiCall(`/qa?id=${id}`),
    create: (data) => apiCall('/qa', 'POST', data), // No auth for public submission
    update: (id, data) => apiCall(`/qa?id=${id}`, 'PUT', data, true),
    delete: (id) => apiCall(`/qa?id=${id}`, 'DELETE', null, true)
};

// --- Events ---
export const events = {
    getAll: () => apiCall('/events'),
    get: (id) => apiCall(`/events?id=${id}`),
    create: (data) => apiCall('/events', 'POST', data, true),
    update: (id, data) => apiCall(`/events?id=${id}`, 'PUT', data, true),
    delete: (id) => apiCall(`/events?id=${id}`, 'DELETE', null, true)
};

// --- Settings ---
export const settings = {
    get: (key) => apiCall(`/settings?key=${key}`),
    getAll: () => apiCall('/settings'),
    set: (key, value) => apiCall(`/settings?key=${key}`, 'PUT', value, true)
};

// ==================== POLLING MANAGER ====================

class PollingManager {
    constructor() {
        this.interval = null;
        this.callbacks = new Map();
        this.lastData = null;
        this.pollRate = 3000; // 3 seconds
    }

    start(collections = 'all') {
        if (this.interval) return;

        const poll = async () => {
            try {
                const data = await apiCall(`/sync?collections=${collections}`);

                // Check each collection for changes and call callbacks
                this.callbacks.forEach((callback, key) => {
                    const collection = key.split('/')[0];
                    if (data[collection] !== undefined) {
                        // Simple change detection by comparing JSON
                        const newData = JSON.stringify(data[collection]);
                        const oldData = this.lastData ? JSON.stringify(this.lastData[collection]) : null;

                        if (newData !== oldData) {
                            callback(data[collection]);
                        }
                    }
                });

                this.lastData = data;
            } catch (error) {
                console.error('Polling error:', error);
            }
        };

        // Initial fetch
        poll();

        // Start polling
        this.interval = setInterval(poll, this.pollRate);
    }

    stop() {
        if (this.interval) {
            clearInterval(this.interval);
            this.interval = null;
        }
    }

    setPollRate(ms) {
        this.pollRate = ms;
        if (this.interval) {
            this.stop();
            this.start();
        }
    }

    // Register a callback for data changes (similar to Firebase onValue)
    onValue(path, callback) {
        this.callbacks.set(path, callback);

        // If we have cached data, call immediately
        if (this.lastData) {
            const collection = path.split('/')[0];
            if (this.lastData[collection]) {
                callback(this.lastData[collection]);
            }
        }

        // Return unsubscribe function
        return () => {
            this.callbacks.delete(path);
        };
    }

    // Get current cached data
    getData(collection) {
        return this.lastData?.[collection] || null;
    }
}

export const polling = new PollingManager();

// ==================== FIREBASE-LIKE HELPERS ====================

// Mimics Firebase ref + onValue pattern
export function onValue(path, callback) {
    return polling.onValue(path, callback);
}

// Start polling when module loads
export function startPolling() {
    polling.start();
}

// Stop polling (when leaving page)
export function stopPolling() {
    polling.stop();
}
