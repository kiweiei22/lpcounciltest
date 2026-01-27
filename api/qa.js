import db, { generateId, now } from './db.js';
import { verifyAuth, allowCors } from './auth.js';

export default async function handler(req, res) {
    if (allowCors(req, res)) return;

    const { id, limit } = req.query;

    try {
        if (req.method === 'GET') {
            if (id) {
                const result = await db.execute({
                    sql: 'SELECT * FROM qa WHERE id = ?',
                    args: [id]
                });
                return res.status(200).json(result.rows[0] || null);
            }

            let sql = 'SELECT * FROM qa ORDER BY timestamp DESC';
            if (limit) sql += ` LIMIT ${parseInt(limit)}`;

            const result = await db.execute(sql);
            const data = {};
            result.rows.forEach(row => { data[row.id] = row; });
            return res.status(200).json(data);
        }

        if (req.method === 'POST') {
            const body = req.body;
            const newId = generateId();
            const timestamp = now();

            await db.execute({
                sql: `INSERT INTO qa (id, question, answer, status, timestamp, created_at) 
                      VALUES (?, ?, ?, ?, ?, ?)`,
                args: [newId, body.question, '', 'Pending', timestamp, new Date().toISOString()]
            });

            return res.status(201).json({ id: newId, created_at: timestamp });
        }

        if (req.method === 'PUT') {
            const auth = await verifyAuth(req, res);
            if (auth.error) return res.status(auth.status).json({ error: auth.error });
            if (!id) return res.status(400).json({ error: 'ID required' });

            const body = req.body;
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

            return res.status(200).json({ success: true });
        }

        if (req.method === 'DELETE') {
            const auth = await verifyAuth(req, res);
            if (auth.error) return res.status(auth.status).json({ error: auth.error });
            if (!id) return res.status(400).json({ error: 'ID required' });

            await db.execute({
                sql: 'DELETE FROM qa WHERE id = ?',
                args: [id]
            });

            return res.status(200).json({ success: true });
        }

        return res.status(405).json({ error: 'Method not allowed' });
    } catch (error) {
        console.error('QA API error:', error);
        return res.status(500).json({ error: error.message });
    }
}
