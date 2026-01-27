
export const config = { runtime: 'nodejs' };

export default function handler(req, res) {
    const envCheck = {
        TURSO_URL: process.env.TURSO_DATABASE_URL ? 'OK' : 'MISSING',
        TURSO_TOKEN: process.env.TURSO_AUTH_TOKEN ? 'OK' : 'MISSING',
        NODE_VERSION: process.version
    };

    return new Response(JSON.stringify({
        status: 'online',
        env: envCheck,
        message: 'API is working'
    }), {
        status: 200,
        headers: {
            'Content-Type': 'application/json'
        }
    });
}
