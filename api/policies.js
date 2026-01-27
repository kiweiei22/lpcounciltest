import db, { generateId, now } from './db.js';
import { verifyAuth, jsonResponse, corsHeaders } from './auth.js';



export default async function handler(req) {
    // Handle CORS preflight
    if (req.method === 'OPTIONS') {
        return new Response(null, { headers: corsHeaders() });
    }

    const url = new URL(req.url);
    const id = url.searchParams.get('id');

    try {
        // GET - List all or get by ID
        if (req.method === 'GET') {
            if (id) {
                const result = await db.execute({
                    sql: 'SELECT * FROM policies WHERE id = ?',
                    args: [id]
                });
                return jsonResponse(result.rows[0] || null);
            }
            const result = await db.execute('SELECT * FROM policies ORDER BY created_at DESC');
            // Convert to object format like Firebase
            const data = {};
            result.rows.forEach(row => {
                data[row.id] = row;
            });
            return jsonResponse(data);
        }

        // POST - Create new policy (requires auth)
        if (req.method === 'POST') {
            const auth = await verifyAuth(req);
            if (auth.error) return jsonResponse({ error: auth.error }, auth.status);

            const body = await req.json();
            const id = generateId();
            const timestamp = now();

            await db.execute({
                sql: `INSERT INTO policies (id, title, detail, status, percent, image, created_at, updated_at) 
                      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
                args: [id, body.title, body.detail || '', body.status || 'Pending', body.percent || 0, body.image || '', timestamp, timestamp]
            });

            return jsonResponse({ id, ...body, created_at: timestamp }, 201);
        }

        // PUT - Update policy (requires auth)
        if (req.method === 'PUT') {
            const auth = await verifyAuth(req);
            if (auth.error) return jsonResponse({ error: auth.error }, auth.status);

            if (!id) return jsonResponse({ error: 'ID required' }, 400);

            const body = await req.json();
            const updates = [];
            const args = [];

            ['title', 'detail', 'status', 'percent', 'image'].forEach(field => {
                if (body[field] !== undefined) {
                    updates.push(`${field} = ?`);
                    args.push(body[field]);
                }
            });
            updates.push('updated_at = ?');
            args.push(now());
            args.push(id);

            await db.execute({
                sql: `UPDATE policies SET ${updates.join(', ')} WHERE id = ?`,
                args
            });

            return jsonResponse({ success: true });
        }

        // DELETE - Remove policy (requires auth)
        if (req.method === 'DELETE') {
            const auth = await verifyAuth(req);
            if (auth.error) return jsonResponse({ error: auth.error }, auth.status);

            if (!id) return jsonResponse({ error: 'ID required' }, 400);

            await db.execute({
                sql: 'DELETE FROM policies WHERE id = ?',
                args: [id]
            });

            return jsonResponse({ success: true });
        }

        return jsonResponse({ error: 'Method not allowed' }, 405);
    } catch (error) {
        console.error('Policies API error:', error);
        return jsonResponse({ error: error.message }, 500);
    }
}
