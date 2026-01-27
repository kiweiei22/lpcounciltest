
const url = 'https://lpcounciltest.vercel.app/api/init';
const secret = 'init-turso-db-2024';

console.log('🔄 Initializing Database at:', url);

async function init() {
    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ secret })
        });

        const data = await response.json();

        if (response.ok) {
            console.log('\n✅ SUCCESS!');
            console.log('Message:', data.message);
            console.log('Tables Created:', data.tables);
        } else {
            console.error('\n❌ FAILED:', response.status);
            console.error('Error:', data.error);
        }
    } catch (error) {
        console.error('\n❌ NETWORK ERROR:', error.message);
    }
}

init();
