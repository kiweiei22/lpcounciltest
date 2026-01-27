import db from '../lib/db.js';
import { verifyAuth, allowCors } from '../lib/auth.js';

export default async function handler(req, res) {
    if (allowCors(req, res)) return;

    const { key } = req.query;

    try {
        if (req.method === 'GET') {
            if (key) {
                const result = await db.execute({
                    sql: 'SELECT value FROM settings WHERE key = ?',
                    args: [key]
                });
                if (result.rows[0]) {
                    try {
                        return res.status(200).json(JSON.parse(result.rows[0].value));
                    } catch {
                        return res.status(200).json(result.rows[0].value);
                    }
                }
                return res.status(200).json(null);
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
            return res.status(200).json(data);
        }

        if (req.method === 'PUT' || req.method === 'POST') {
            const auth = await verifyAuth(req, res);
            if (auth.error) return res.status(auth.status).json({ error: auth.error });
            if (!key) return res.status(400).json({ error: 'Key required' });

            const body = req.body;
            const value = typeof body === 'object' ? JSON.stringify(body) : String(body);

            await db.execute({
                sql: `INSERT INTO settings (key, value) VALUES (?, ?) 
                      ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
                args: [key, value]
            });

            return res.status(200).json({ success: true });
        }

        return res.status(405).json({ error: 'Method not allowed' });
    } catch (error) {
        console.error('Settings API error:', error);
        return res.status(500).json({ error: error.message });
    }
}
