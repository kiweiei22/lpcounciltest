import db, { now } from './db.js';
import { verifyAuth, jsonResponse, corsHeaders } from './auth.js';

export const config = { runtime: 'edge' };

export default async function handler(req) {
    if (req.method === 'OPTIONS') {
        return new Response(null, { headers: corsHeaders() });
    }

    const url = new URL(req.url);
    const key = url.searchParams.get('key');

    try {
        if (req.method === 'GET') {
            if (key) {
                const result = await db.execute({
                    sql: 'SELECT value FROM settings WHERE key = ?',
                    args: [key]
                });
                if (result.rows[0]) {
                    try {
                        return jsonResponse(JSON.parse(result.rows[0].value));
                    } catch {
                        return jsonResponse(result.rows[0].value);
                    }
                }
                return jsonResponse(null);
            }
            // Get all settings
            const result = await db.execute('SELECT * FROM settings');
            const data = {};
            result.rows.forEach(row => {
                try {
                    data[row.key] = JSON.parse(row.value);
                } catch {
                    data[row.key] = row.value;
                }
            });
            return jsonResponse(data);
        }

        if (req.method === 'PUT' || req.method === 'POST') {
            const auth = await verifyAuth(req);
            if (auth.error) return jsonResponse({ error: auth.error }, auth.status);

            if (!key) return jsonResponse({ error: 'Key required' }, 400);

            const body = await req.json();
            const value = typeof body === 'object' ? JSON.stringify(body) : String(body);

            // Upsert
            await db.execute({
                sql: `INSERT INTO settings (key, value) VALUES (?, ?) 
                      ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
                args: [key, value]
            });

            return jsonResponse({ success: true });
        }

        return jsonResponse({ error: 'Method not allowed' }, 405);
    } catch (error) {
        console.error('Settings API error:', error);
        return jsonResponse({ error: error.message }, 500);
    }
}
