import db, { generateId, now } from './db.js';
import { verifyAuth, jsonResponse, corsHeaders } from './auth.js';



export default async function handler(req) {
    if (req.method === 'OPTIONS') {
        return new Response(null, { headers: corsHeaders() });
    }

    const url = new URL(req.url);
    const id = url.searchParams.get('id');
    const limit = url.searchParams.get('limit');

    try {
        if (req.method === 'GET') {
            if (id) {
                const result = await db.execute({
                    sql: 'SELECT * FROM qa WHERE id = ?',
                    args: [id]
                });
                return jsonResponse(result.rows[0] || null);
            }

            let sql = 'SELECT * FROM qa ORDER BY timestamp DESC';
            if (limit) sql += ` LIMIT ${parseInt(limit)}`;

            const result = await db.execute(sql);
            const data = {};
            result.rows.forEach(row => { data[row.id] = row; });
            return jsonResponse(data);
        }

        // POST - Create new question (no auth required for public submission)
        if (req.method === 'POST') {
            const body = await req.json();
            const id = generateId();
            const timestamp = now();

            await db.execute({
                sql: `INSERT INTO qa (id, question, answer, status, timestamp, created_at) 
                      VALUES (?, ?, ?, ?, ?, ?)`,
                args: [id, body.question, '', 'Pending', timestamp, new Date().toISOString()]
            });

            return jsonResponse({ id, created_at: timestamp }, 201);
        }

        // PUT - Answer question (requires auth)
        if (req.method === 'PUT') {
            const auth = await verifyAuth(req);
            if (auth.error) return jsonResponse({ error: auth.error }, auth.status);

            if (!id) return jsonResponse({ error: 'ID required' }, 400);

            const body = await req.json();
            const updates = [];
            const args = [];

            if (body.answer !== undefined) {
                updates.push('answer = ?');
                args.push(body.answer);
                updates.push('status = ?');
                args.push('Answered');
            }
            if (body.status !== undefined) {
                updates.push('status = ?');
                args.push(body.status);
            }
            args.push(id);

            if (updates.length > 0) {
                await db.execute({
                    sql: `UPDATE qa SET ${updates.join(', ')} WHERE id = ?`,
                    args
                });
            }

            return jsonResponse({ success: true });
        }

        if (req.method === 'DELETE') {
            const auth = await verifyAuth(req);
            if (auth.error) return jsonResponse({ error: auth.error }, auth.status);

            if (!id) return jsonResponse({ error: 'ID required' }, 400);

            await db.execute({
                sql: 'DELETE FROM qa WHERE id = ?',
                args: [id]
            });

            return jsonResponse({ success: true });
        }

        return jsonResponse({ error: 'Method not allowed' }, 405);
    } catch (error) {
        console.error('QA API error:', error);
        return jsonResponse({ error: error.message }, 500);
    }
}
