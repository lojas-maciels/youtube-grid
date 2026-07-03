const https = require('https');

const URL = 'https://www.youtube.com/@CNNbrasil/live';
const HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept': 'text/html',
    'Cache-Control': 'no-cache'
};

https.get(URL, { headers: HEADERS }, (res) => {
    let data = '';
    res.on('data', c => data += c);
    res.on('end', () => {
        // Try Canonical
        const canonical = data.match(/<link rel="canonical" href="https:\/\/www\.youtube\.com\/watch\?v=([^"]+)">/);

        // Try JSON
        const jsonMatch = data.match(/"videoId":"([^"]+)"/);

        console.log('Canonical ID:', canonical ? canonical[1] : 'None');
        console.log('JSON ID:', jsonMatch ? jsonMatch[1] : 'None');
    });
});
