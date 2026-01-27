import { createClient } from '@libsql/client/web';

// Initialize Turso client
// ⚠️ ใส่ credentials ของคุณใน Environment Variables บน Vercel:
// TURSO_DATABASE_URL และ TURSO_AUTH_TOKEN

const url = "libsql://lpdatabase-kiwzy.aws-ap-northeast-1.turso.io";
const authToken = "eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9.eyJhIjoicnciLCJpYXQiOjE3Njk1MTQzMTcsImlkIjoiZmZmOGVhODctZmI2NS00ZGFlLWExMTEtYThmMGYzYzYwZDdlIiwicmlkIjoiZmY1MjU2YzgtYTdhNy00NTA3LThiOTAtYjQ3N2Y1ZTExZjBhIn0.CA6PVopCDHcLknro-X0_cZsPZKy3648jC60lp5hVzFndjPtrSzh1r5cJLQtN--vAWaovJ0RrT6hDhu-3FVO_DQ";

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
