const https = require('https');

const URL = 'https://www.youtube.com/@CNNbrasil/live';
const HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept': 'text/html',
    'Cache-Control': 'no-cache'
};

https.get(URL, { headers: HEADERS }, (res) => {
    console.log('Status:', res.statusCode);
    console.log('Location:', res.headers.location);

    let data = '';
    res.on('data', c => data += c);
    res.on('end', () => {
        const idMatch = data.match(/<meta itemprop="videoId" content="([^"]+)">/);
        const titleMatch = data.match(/<meta name="title" content="([^"]+)">/);
        const isLive = data.includes('"isLive":true');

        console.log('HTML extraction:');
        console.log('Video ID:', idMatch ? idMatch[1] : 'Not Found');
        console.log('Title:', titleMatch ? titleMatch[1] : 'Not Found');
        console.log('IsLive JSON:', isLive);
    });
});
