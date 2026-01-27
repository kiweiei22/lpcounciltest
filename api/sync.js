import db from '../lib/db.js';
import { allowCors } from '../lib/auth.js';

export default async function handler(req, res) {
    if (allowCors(req, res)) return;

    // Optimize for polling: Cache for 1s, allow stale for 2s
    res.setHeader('Cache-Control', 's-maxage=1, stale-while-revalidate=2');

    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    // req.query is automatically parsed in Vercel Node functions
    let { collections } = req.query;
    collections = collections ? collections.split(',') : ['all'];

    try {
        const result = {};
        const timestamp = Date.now();
        const fetchAll = collections.includes('all');

        // Helper
        const toObject = (rows) => {
            const data = {};
            rows.forEach(row => { data[row.id] = row; });
            return data;
        };

        if (fetchAll || collections.includes('policies')) {
            const r = await db.execute('SELECT * FROM policies ORDER BY created_at DESC');
            result.policies = toObject(r.rows);
        }
        if (fetchAll || collections.includes('members')) {
            const r = await db.execute('SELECT * FROM members ORDER BY created_at DESC');
            result.members = toObject(r.rows);
        }
        if (fetchAll || collections.includes('complaints')) {
            const r = await db.execute('SELECT * FROM complaints ORDER BY timestamp DESC');
            result.complaints = toObject(r.rows);
        }
        if (fetchAll || collections.includes('activities')) {
            const r = await db.execute('SELECT * FROM activities ORDER BY created_at DESC');
            result.activities = toObject(r.rows);
        }
        if (fetchAll || collections.includes('qa')) {
            const r = await db.execute('SELECT * FROM qa ORDER BY timestamp DESC LIMIT 50');
            result.qa = toObject(r.rows);
        }
        if (fetchAll || collections.includes('events')) {
            const r = await db.execute('SELECT * FROM events ORDER BY date ASC');
            result.events = toObject(r.rows);
        }
        if (fetchAll || collections.includes('settings')) {
            try {
                const r = await db.execute('SELECT * FROM settings');
                result.announcement = null;
                result.maintenance = false;
                r.rows.forEach(row => {
                    if (row.key === 'announcement') {
                        try { result.announcement = JSON.parse(row.value); } catch { result.announcement = row.value; }
                    } else if (row.key === 'maintenance') {
                        result.maintenance = row.value === 'true' || row.value === true;
                    }
                });
            } catch (e) {
                // Ignore settings error if table not exists yet
            }
        }

        result._timestamp = timestamp;
        return res.status(200).json(result);

    } catch (error) {
        console.error('Sync API error:', error);
        return res.status(500).json({ error: error.message });
    }
}
