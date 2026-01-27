import db, { generateId, now } from '../lib/db.js';
import { verifyAuth, allowCors } from '../lib/auth.js';

export default async function handler(req, res) {
    if (allowCors(req, res)) return;

    const { id } = req.query;

    try {
        if (req.method === 'GET') {
            if (id) {
                const result = await db.execute({
                    sql: 'SELECT * FROM policies WHERE id = ?',
                    args: [id]
                });
                return res.status(200).json(result.rows[0] || null);
            }
            const result = await db.execute('SELECT * FROM policies ORDER BY created_at DESC');
            const data = {};
            result.rows.forEach(row => { data[row.id] = row; });
            return res.status(200).json(data);
        }

        if (req.method === 'POST') {
            const auth = await verifyAuth(req, res);
            if (auth.error) return res.status(auth.status).json({ error: auth.error });

            const body = req.body;
            const newId = generateId();
            const timestamp = now();

            await db.execute({
                sql: `INSERT INTO policies (id, title, detail, status, percent, image, created_at, updated_at) 
                      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
                args: [newId, body.title, body.detail || '', body.status || 'Pending', body.percent || 0, body.image || '', timestamp, timestamp]
            });

            return res.status(201).json({ id: newId, ...body, created_at: timestamp });
        }

        if (req.method === 'PUT') {
            const auth = await verifyAuth(req, res);
            if (auth.error) return res.status(auth.status).json({ error: auth.error });
            if (!id) return res.status(400).json({ error: 'ID required' });

            const body = req.body;
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

            return res.status(200).json({ success: true });
        }

        if (req.method === 'DELETE') {
            const auth = await verifyAuth(req, res);
            if (auth.error) return res.status(auth.status).json({ error: auth.error });
            if (!id) return res.status(400).json({ error: 'ID required' });

            await db.execute({
                sql: 'DELETE FROM policies WHERE id = ?',
                args: [id]
            });

            return res.status(200).json({ success: true });
        }

        return res.status(405).json({ error: 'Method not allowed' });
    } catch (error) {
        console.error('Policies API error:', error);
        return res.status(500).json({ error: error.message });
    }
}
