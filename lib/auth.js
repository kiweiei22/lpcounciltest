import admin from 'firebase-admin';

// Initialize Firebase Admin
let firebaseApp;

function getFirebaseAdmin() {
    if (!firebaseApp && process.env.FIREBASE_SERVICE_ACCOUNT_KEY) {
        try {
            const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY);
            // Check if already initialized to prevent errors in hot reload environments
            if (admin.apps.length === 0) {
                firebaseApp = admin.initializeApp({
                    credential: admin.credential.cert(serviceAccount)
                });
            } else {
                firebaseApp = admin.apps[0];
            }
        } catch (e) {
            console.warn('Firebase Admin init failed:', e.message);
        }
    }
    return firebaseApp ? admin.auth() : null;
}

// Helper: Verify Auth
export async function verifyAuth(req, res) {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
        return { error: 'Unauthorized', status: 401 };
    }

    const token = authHeader.split('Bearer ')[1];
    const auth = getFirebaseAdmin();

    if (!auth) {
        console.warn('Firebase Admin not configured, skipping auth verification (Dev Mode)');
        return { user: { uid: 'dev-user' } };
    }

    try {
        const decodedToken = await auth.verifyIdToken(token);
        return { user: decodedToken };
    } catch (error) {
        return { error: 'Invalid token', status: 401 };
    }
}

// Helper: Standard JSON Response (wraps res)
export function jsonResponse(res, data, status = 200) {
    return res.status(status).json(data);
}

// Helper: Allow CORS (Vercel handles this via vercel.json generally, but good for local)
export function allowCors(req, res) {
    res.setHeader('Access-Control-Allow-Credentials', true);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
    res.setHeader(
        'Access-Control-Allow-Headers',
        'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization'
    );
    if (req.method === 'OPTIONS') {
        res.status(200).end();
        return true;
    }
    return false;
}
