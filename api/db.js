import { createClient } from '@libsql/client';

// Initialize Turso client
// ⚠️ ใส่ credentials ของคุณใน Environment Variables บน Vercel:
// TURSO_DATABASE_URL และ TURSO_AUTH_TOKEN

const url = process.env.TURSO_DATABASE_URL;
const authToken = process.env.TURSO_AUTH_TOKEN;

let db = null;

if (url) {
    try {
        db = createClient({ url, authToken });
        console.log('Turso client initialized');
    } catch (e) {
        console.error('Failed to init Turso client:', e);
    }
} else {
    console.warn('TURSO_DATABASE_URL is missing');
}

// Helper to generate unique IDs
export function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substring(2, 8);
}

// Helper to get current timestamp
export function now() {
    return Date.now();
}

export default db;
