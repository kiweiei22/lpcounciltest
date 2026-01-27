import db, { generateId, now } from './db.js';
import { verifyAuth, jsonResponse, corsHeaders } from './auth.js';



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
                    sql: 'SELECT * FROM members WHERE id = ?',
                    args: [id]
                });
                return jsonResponse(result.rows[0] || null);
            }
            const result = await db.execute('SELECT * FROM members ORDER BY created_at DESC');
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
                sql: `INSERT INTO members (id, name, role, image, bio, created_at, updated_at) 
                      VALUES (?, ?, ?, ?, ?, ?, ?)`,
                args: [id, body.name, body.role || '', body.image || '', body.bio || '', timestamp, timestamp]
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

            ['name', 'role', 'image', 'bio'].forEach(field => {
                if (body[field] !== undefined) {
                    updates.push(`${field} = ?`);
                    args.push(body[field]);
                }
            });
            updates.push('updated_at = ?');
            args.push(now());
            args.push(id);

            await db.execute({
                sql: `UPDATE members SET ${updates.join(', ')} WHERE id = ?`,
                args
            });

            return jsonResponse({ success: true });
        }

        if (req.method === 'DELETE') {
            const auth = await verifyAuth(req);
            if (auth.error) return jsonResponse({ error: auth.error }, auth.status);

            if (!id) return jsonResponse({ error: 'ID required' }, 400);

            await db.execute({
                sql: 'DELETE FROM members WHERE id = ?',
                args: [id]
            });

            return jsonResponse({ success: true });
        }

        return jsonResponse({ error: 'Method not allowed' }, 405);
    } catch (error) {
        console.error('Members API error:', error);
        return jsonResponse({ error: error.message }, 500);
    }
}
