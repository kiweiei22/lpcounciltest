
const urls = [
    'https://lpcounciltest.vercel.app/api/health',
    'https://lpcounciltest.vercel.app/api/sync'
];

console.log('🔍 Checking API Connectivity...\n');

urls.forEach(url => {
    console.log(`Checking: ${url}`);

    fetch(url)
        .then(res => {
            console.log(`[${res.status}] ${res.statusText}`);
            return res.text();
        })
        .then(text => {
            try {
                const json = JSON.parse(text);
                console.log('Response:', JSON.stringify(json, null, 2).substring(0, 200) + '...');
                if (url.includes('health')) {
                    if (json.env) console.log('Environment:', json.env);
                }
            } catch (e) {
                console.log('Response (Raw):', text.substring(0, 200) + '...');
            }
            console.log('----------------------------------\n');
        })
        .catch(err => {
            console.error('❌ Connection Failed:', err.message);
            console.log('----------------------------------\n');
        });
});
