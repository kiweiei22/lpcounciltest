import db, { generateId, now } from './db.js';
import { verifyAuth, jsonResponse, corsHeaders } from './auth.js';

export const config = { runtime: 'edge' };

export default async function handler(req) {
    if (req.method === 'OPTIONS') {
        return new Response(null, { headers: corsHeaders() });
    }

    const url = new URL(req.url);
    const id = url.searchParams.get('id');

    try {
        if (req.method === 'GET') {
            if (id) {
                const result = await db.execute({
                    sql: 'SELECT * FROM events WHERE id = ?',
                    args: [id]
                });
                return jsonResponse(result.rows[0] || null);
            }
            const result = await db.execute('SELECT * FROM events ORDER BY date ASC');
            const data = {};
            result.rows.forEach(row => { data[row.id] = row; });
            return jsonResponse(data);
        }

        if (req.method === 'POST') {
            const auth = await verifyAuth(req);
            if (auth.error) return jsonResponse({ error: auth.error }, auth.status);

            const body = await req.json();
            const id = generateId();
            const timestamp = now();

            await db.execute({
                sql: `INSERT INTO events (id, title, date, time, location, description, category, created_at, updated_at) 
                      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                args: [
                    id,
                    body.title,
                    body.date || '',
                    body.time || '',
                    body.location || '',
                    body.description || '',
                    body.category || 'GENERAL',
                    timestamp,
                    timestamp
                ]
            });

            return jsonResponse({ id, ...body, created_at: timestamp }, 201);
        }

        if (req.method === 'PUT') {
            const auth = await verifyAuth(req);
            if (auth.error) return jsonResponse({ error: auth.error }, auth.status);

            if (!id) return jsonResponse({ error: 'ID required' }, 400);

            const body = await req.json();
            const updates = [];
            const args = [];

            ['title', 'date', 'time', 'location', 'description', 'category'].forEach(field => {
                if (body[field] !== undefined) {
                    updates.push(`${field} = ?`);
                    args.push(body[field]);
                }
            });
            updates.push('updated_at = ?');
            args.push(now());
            args.push(id);

            await db.execute({
                sql: `UPDATE events SET ${updates.join(', ')} WHERE id = ?`,
                args
            });

            return jsonResponse({ success: true });
        }

        if (req.method === 'DELETE') {
            const auth = await verifyAuth(req);
            if (auth.error) return jsonResponse({ error: auth.error }, auth.status);

            if (!id) return jsonResponse({ error: 'ID required' }, 400);

            await db.execute({
                sql: 'DELETE FROM events WHERE id = ?',
                args: [id]
            });

            return jsonResponse({ success: true });
        }

        return jsonResponse({ error: 'Method not allowed' }, 405);
    } catch (error) {
        console.error('Events API error:', error);
        return jsonResponse({ error: error.message }, 500);
    }
}
