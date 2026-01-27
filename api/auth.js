import admin from 'firebase-admin';

// Initialize Firebase Admin SDK (for verifying tokens)
// ⚠️ Add FIREBASE_SERVICE_ACCOUNT_KEY as environment variable on Vercel
// ถ้าไม่ต้องการ verify token ฝั่ง server สามารถ skip middleware นี้ได้

let firebaseApp;

function getFirebaseAdmin() {
    if (!firebaseApp && process.env.FIREBASE_SERVICE_ACCOUNT_KEY) {
        try {
            const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY);
            firebaseApp = admin.initializeApp({
                credential: admin.credential.cert(serviceAccount)
            });
        } catch (e) {
            console.warn('Firebase Admin init failed:', e.message);
        }
    }
    return firebaseApp ? admin.auth() : null;
}

// Middleware to verify Firebase ID token
export async function verifyAuth(req) {
    const authHeader = req.headers.get('authorization');
    if (!authHeader?.startsWith('Bearer ')) {
        return { error: 'Unauthorized', status: 401 };
    }

    const token = authHeader.split('Bearer ')[1];
    const auth = getFirebaseAdmin();

    if (!auth) {
        // If Firebase Admin is not configured, skip verification (dev mode)
        console.warn('Firebase Admin not configured, skipping auth verification');
        return { user: { uid: 'dev-user' } };
    }

    try {
        const decodedToken = await auth.verifyIdToken(token);
        return { user: decodedToken };
    } catch (error) {
        return { error: 'Invalid token', status: 401 };
    }
}

// CORS headers helper
export function corsHeaders() {
    return {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    };
}

// JSON response helper
export function jsonResponse(data, status = 200) {
    return new Response(JSON.stringify(data), {
        status,
        headers: {
            'Content-Type': 'application/json',
            ...corsHeaders()
        }
    });
}
