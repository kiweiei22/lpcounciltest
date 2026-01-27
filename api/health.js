
export default function handler(req, res) {
    const envCheck = {
        TURSO_URL: process.env.TURSO_DATABASE_URL ? 'OK' : 'MISSING',
        TURSO_TOKEN: process.env.TURSO_AUTH_TOKEN ? 'OK' : 'MISSING',
        NODE_VERSION: process.version
    };

    res.status(200).json({
        status: 'online',
        env: envCheck,
        message: 'API is working (Node.js Runtime)'
    });
}
