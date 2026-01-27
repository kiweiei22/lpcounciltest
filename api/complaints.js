import db, { generateId, now } from './db.js';
import { verifyAuth, allowCors } from './auth.js';

function generateTicketId() {
    return 'TK-' + Date.now().toString(36).toUpperCase() + Math.random().toString(36).substring(2, 6).toUpperCase();
}

export default async function handler(req, res) {
    if (allowCors(req, res)) return;

    const { id, ticketId } = req.query;

    try {
        if (req.method === 'GET') {
            if (ticketId) {
                const result = await db.execute({
                    sql: 'SELECT * FROM complaints WHERE ticket_id = ? COLLATE NOCASE',
                    args: [ticketId]
                });
                return res.status(200).json(result.rows[0] || null);
            }
            if (id) {
                const result = await db.execute({
                    sql: 'SELECT * FROM complaints WHERE id = ?',
                    args: [id]
                });
                return res.status(200).json(result.rows[0] || null);
            }
            const result = await db.execute('SELECT * FROM complaints ORDER BY timestamp DESC');
            const data = {};
            result.rows.forEach(row => { data[row.id] = row; });
            return res.status(200).json(data);
        }

        // POST (No Auth)
        if (req.method === 'POST') {
            const body = req.body;
            const newId = generateId();
            const ticket = '#' + generateTicketId();
            const timestamp = now();

            await db.execute({
                sql: `INSERT INTO complaints (id, ticket_id, topic, name, detail, status, response, timestamp, created_at) 
                      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                args: [
                    newId,
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

            return res.status(201).json({ id: newId, ticketId: ticket, created_at: timestamp });
        }

        // PUT (Auth Required)
        if (req.method === 'PUT') {
            const auth = await verifyAuth(req, res);
            if (auth.error) return res.status(auth.status).json({ error: auth.error });
            if (!id) return res.status(400).json({ error: 'ID required' });

            const body = req.body;
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

            return res.status(200).json({ success: true });
        }

        if (req.method === 'DELETE') {
            const auth = await verifyAuth(req, res);
            if (auth.error) return res.status(auth.status).json({ error: auth.error });
            if (!id) return res.status(400).json({ error: 'ID required' });

            await db.execute({
                sql: 'DELETE FROM complaints WHERE id = ?',
                args: [id]
            });

            return res.status(200).json({ success: true });
        }

        return res.status(405).json({ error: 'Method not allowed' });
    } catch (error) {
        console.error('Complaints API error:', error);
        return res.status(500).json({ error: error.message });
    }
}
