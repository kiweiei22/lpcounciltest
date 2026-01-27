import db from './db.js';
import { jsonResponse, corsHeaders } from './auth.js';

export const config = { runtime: 'edge' };

// Single endpoint to fetch all data for polling - optimized for realtime sync
export default async function handler(req) {
    if (req.method === 'OPTIONS') {
        return new Response(null, { headers: corsHeaders() });
    }

    if (req.method !== 'GET') {
        return jsonResponse({ error: 'Method not allowed' }, 405);
    }

    const url = new URL(req.url);
    // Optional: only fetch specific collections
    const collections = url.searchParams.get('collections')?.split(',') || ['all'];
    const since = url.searchParams.get('since'); // Timestamp for delta updates (future enhancement)

    try {
        const result = {};
        const timestamp = Date.now();

        // Helper to convert rows to Firebase-like object
        const toObject = (rows) => {
            const data = {};
            rows.forEach(row => { data[row.id] = row; });
            return data;
        };

        const fetchAll = collections.includes('all');

        // Policies
        if (fetchAll || collections.includes('policies')) {
            const r = await db.execute('SELECT * FROM policies ORDER BY created_at DESC');
            result.policies = toObject(r.rows);
        }

        // Members
        if (fetchAll || collections.includes('members')) {
            const r = await db.execute('SELECT * FROM members ORDER BY created_at DESC');
            result.members = toObject(r.rows);
        }

        // Complaints
        if (fetchAll || collections.includes('complaints')) {
            const r = await db.execute('SELECT * FROM complaints ORDER BY timestamp DESC');
            result.complaints = toObject(r.rows);
        }

        // Activities
        if (fetchAll || collections.includes('activities')) {
            const r = await db.execute('SELECT * FROM activities ORDER BY created_at DESC');
            result.activities = toObject(r.rows);
        }

        // Q&A
        if (fetchAll || collections.includes('qa')) {
            const r = await db.execute('SELECT * FROM qa ORDER BY timestamp DESC LIMIT 50');
            result.qa = toObject(r.rows);
        }

        // Events
        if (fetchAll || collections.includes('events')) {
            const r = await db.execute('SELECT * FROM events ORDER BY date ASC');
            result.events = toObject(r.rows);
        }

        // Settings
        if (fetchAll || collections.includes('settings')) {
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
        }

        result._timestamp = timestamp;

        return jsonResponse(result);
    } catch (error) {
        console.error('Sync API error:', error);
        return jsonResponse({ error: error.message }, 500);
    }
}
