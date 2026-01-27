
export default function handler(req, res) {
    const envCheck = {
        TURSO_URL: process.env.TURSO_DATABASE_URL ? 'OK' : 'MISSING',
        TURSO_TOKEN: process.env.TURSO_AUTH_TOKEN ? 'OK' : 'MISSING',
        NODE_VERSION: process.version,
        // List ONLY keys to see if vars are even injected (Security: NO VALUES)
        AVAILABLE_KEYS: Object.keys(process.env).filter(k => !k.startsWith('npm_') && !k.startsWith('VERCEL_'))
    };

    res.status(200).json({
        status: 'online',
        debug: 'env_vars_check',
        env: envCheck,
        message: 'Checking Environment Variables Availability'
    });
}
