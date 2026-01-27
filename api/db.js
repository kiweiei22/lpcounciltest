import { createClient } from '@libsql/client';

// Initialize Turso client
// ⚠️ ใส่ credentials ของคุณใน Environment Variables บน Vercel:
// TURSO_DATABASE_URL และ TURSO_AUTH_TOKEN

const db = createClient({
    url: process.env.TURSO_DATABASE_URL,
    authToken: process.env.TURSO_AUTH_TOKEN,
});

// Helper to generate unique IDs
export function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substring(2, 8);
}

// Helper to get current timestamp
export function now() {
    return Date.now();
}

export default db;
