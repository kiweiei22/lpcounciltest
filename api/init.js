import db from './db.js';
import { jsonResponse, corsHeaders } from './auth.js';



// Database schema initialization endpoint
// Run this once to create all tables
export default async function handler(req) {
    if (req.method === 'OPTIONS') {
        return new Response(null, { headers: corsHeaders() });
    }

    // Only allow POST with secret key
    if (req.method !== 'POST') {
        return jsonResponse({ error: 'Use POST to initialize database' }, 405);
    }

    const body = await req.json().catch(() => ({}));
    if (body.secret !== process.env.INIT_SECRET && body.secret !== 'init-turso-db-2024') {
        return jsonResponse({ error: 'Invalid secret' }, 401);
    }

    if (!db) {
        return jsonResponse({
            error: 'Database connection failed. Please check TURSO_DATABASE_URL and TURSO_AUTH_TOKEN env vars in Vercel.',
            debug_url: process.env.TURSO_DATABASE_URL ? 'URL Set' : 'URL Missing',
            debug_token: process.env.TURSO_AUTH_TOKEN ? 'Token Set' : 'Token Missing'
        }, 500);
    }

    try {
        // Create all tables
        const queries = [
            `CREATE TABLE IF NOT EXISTS policies (
                id TEXT PRIMARY KEY,
                title TEXT NOT NULL,
                detail TEXT,
                status TEXT DEFAULT 'Pending',
                percent INTEGER DEFAULT 0,
                image TEXT,
                created_at INTEGER,
                updated_at INTEGER
            )`,
            `CREATE TABLE IF NOT EXISTS members (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                role TEXT,
                image TEXT,
                bio TEXT,
                created_at INTEGER,
                updated_at INTEGER
            )`,
            `CREATE TABLE IF NOT EXISTS complaints (
                id TEXT PRIMARY KEY,
                ticket_id TEXT UNIQUE,
                topic TEXT NOT NULL,
                name TEXT,
                detail TEXT,
                status TEXT DEFAULT 'Pending',
                response TEXT,
                timestamp INTEGER,
                created_at TEXT
            )`,
            `CREATE TABLE IF NOT EXISTS activities (
                id TEXT PRIMARY KEY,
                title TEXT NOT NULL,
                detail TEXT,
                category TEXT,
                image TEXT,
                created_at INTEGER,
                updated_at INTEGER
            )`,
            `CREATE TABLE IF NOT EXISTS qa (
                id TEXT PRIMARY KEY,
                question TEXT NOT NULL,
                answer TEXT,
                status TEXT DEFAULT 'Pending',
                timestamp INTEGER,
                created_at TEXT
            )`,
            `CREATE TABLE IF NOT EXISTS events (
                id TEXT PRIMARY KEY,
                title TEXT NOT NULL,
                date TEXT,
                time TEXT,
                location TEXT,
                description TEXT,
                category TEXT,
                created_at INTEGER,
                updated_at INTEGER
            )`,
            `CREATE TABLE IF NOT EXISTS settings (
                key TEXT PRIMARY KEY,
                value TEXT
            )`
        ];

        for (const sql of queries) {
            await db.execute(sql);
        }

        // Create indexes for better performance
        const indexes = [
            'CREATE INDEX IF NOT EXISTS idx_complaints_ticket ON complaints(ticket_id)',
            'CREATE INDEX IF NOT EXISTS idx_complaints_status ON complaints(status)',
            'CREATE INDEX IF NOT EXISTS idx_qa_status ON qa(status)',
            'CREATE INDEX IF NOT EXISTS idx_events_date ON events(date)'
        ];

        for (const sql of indexes) {
            await db.execute(sql);
        }

        return jsonResponse({
            success: true,
            message: 'Database initialized successfully!',
            tables: ['policies', 'members', 'complaints', 'activities', 'qa', 'events', 'settings']
        });
    } catch (error) {
        console.error('Init DB error:', error);
        return jsonResponse({ error: error.message }, 500);
    }
}
