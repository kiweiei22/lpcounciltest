import db from '../lib/db.js';
import { allowCors } from '../lib/auth.js';

export default async function handler(req, res) {
    if (allowCors(req, res)) return;

    // Only allow POST
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Use POST to initialize database' });
    }

    const { secret } = req.body || {};

    if (secret !== process.env.INIT_SECRET && secret !== 'init-turso-db-2024') {
        return res.status(401).json({ error: 'Invalid secret' });
    }

    if (!db) {
        return res.status(500).json({
            error: 'Database connection failed. Check TURSO_DATABASE_URL/TOKEN.',
            env_url: !!process.env.TURSO_DATABASE_URL,
            env_token: !!process.env.TURSO_AUTH_TOKEN
        });
    }

    try {
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

        const indexes = [
            'CREATE INDEX IF NOT EXISTS idx_complaints_ticket ON complaints(ticket_id)',
            'CREATE INDEX IF NOT EXISTS idx_complaints_status ON complaints(status)',
            'CREATE INDEX IF NOT EXISTS idx_qa_status ON qa(status)',
            'CREATE INDEX IF NOT EXISTS idx_events_date ON events(date)'
        ];

        for (const sql of indexes) {
            await db.execute(sql);
        }

        return res.status(200).json({
            success: true,
            message: 'Database initialized successfully!',
            tables: ['policies', 'members', 'complaints', 'activities', 'qa', 'events', 'settings']
        });
    } catch (error) {
        console.error('Init DB error:', error);
        return res.status(500).json({ error: error.message });
    }
}
