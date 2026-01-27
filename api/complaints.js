import db, { generateId, now } from './db.js';
import { verifyAuth, jsonResponse, corsHeaders } from './auth.js';

export const config = { runtime: 'edge' };

// Generate ticket ID like Firebase version
function generateTicketId() {
    return 'TK-' + Date.now().toString(36).toUpperCase() + Math.random().toString(36).substring(2, 6).toUpperCase();
}

export default async function handler(req) {
    if (req.method === 'OPTIONS') {
        return new Response(null, { headers: corsHeaders() });
    }

    const url = new URL(req.url);
    const id = url.searchParams.get('id');
    const ticketId = url.searchParams.get('ticketId');

    try {
        if (req.method === 'GET') {
            // Search by ticket ID
            if (ticketId) {
                const result = await db.execute({
                    sql: 'SELECT * FROM complaints WHERE ticket_id = ? COLLATE NOCASE',
                    args: [ticketId]
                });
                return jsonResponse(result.rows[0] || null);
            }
            if (id) {
                const result = await db.execute({
                    sql: 'SELECT * FROM complaints WHERE id = ?',
                    args: [id]
                });
                return jsonResponse(result.rows[0] || null);
            }
            const result = await db.execute('SELECT * FROM complaints ORDER BY timestamp DESC');
            const data = {};
            result.rows.forEach(row => { data[row.id] = row; });
            return jsonResponse(data);
        }

        // POST - Create new complaint (no auth required for public submission)
        if (req.method === 'POST') {
            const body = await req.json();
            const id = generateId();
            const ticket = '#' + generateTicketId();
            const timestamp = now();

            await db.execute({
                sql: `INSERT INTO complaints (id, ticket_id, topic, name, detail, status, response, timestamp, created_at) 
                      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                args: [
                    id,
                    ticket,
                    body.topic || '',
                    body.name || 'Anonymous',
                    body.detail || '',
                    'Pending',
                    '',
                    timestamp,
                    new Date().toISOString()
                ]
            });

            return jsonResponse({ id, ticketId: ticket, created_at: timestamp }, 201);
        }

        // PUT - Update complaint status/response (requires auth)
        if (req.method === 'PUT') {
            const auth = await verifyAuth(req);
            if (auth.error) return jsonResponse({ error: auth.error }, auth.status);

            if (!id) return jsonResponse({ error: 'ID required' }, 400);

            const body = await req.json();
            const updates = [];
            const args = [];

            ['status', 'response'].forEach(field => {
                if (body[field] !== undefined) {
                    updates.push(`${field} = ?`);
                    args.push(body[field]);
                }
            });
            args.push(id);

            if (updates.length > 0) {
                await db.execute({
                    sql: `UPDATE complaints SET ${updates.join(', ')} WHERE id = ?`,
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
                sql: 'DELETE FROM complaints WHERE id = ?',
                args: [id]
            });

            return jsonResponse({ success: true });
        }

        return jsonResponse({ error: 'Method not allowed' }, 405);
    } catch (error) {
        console.error('Complaints API error:', error);
        return jsonResponse({ error: error.message }, 500);
    }
}
