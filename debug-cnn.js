const https = require('https');

const URL = 'https://www.youtube.com/@CNNbrasil/streams';
const HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept': 'text/html',
    'Cache-Control': 'no-cache'
};

function fetchUrl(url) {
    return new Promise((resolve, reject) => {
        https.get(url, { headers: HEADERS }, (res) => {
            let data = '';
            res.on('data', (chunk) => data += chunk);
            res.on('end', () => resolve(data));
        }).on('error', reject);
    });
}

function findKey(obj, key) {
    let results = [];
    if (!obj) return results;
    if (obj[key]) results.push(obj[key]);
    if (typeof obj === 'object') {
        for (const k in obj) {
            if (typeof obj[k] === 'object') results = results.concat(findKey(obj[k], key));
        }
    }
    return results;
}

async function debug() {
    try {
        const html = await fetchUrl(URL);
        const jsonStart = html.indexOf('var ytInitialData = ');
        if (jsonStart === -1) return console.log('NO DATA');

        let jsonStr = html.substring(jsonStart + 20);
        jsonStr = jsonStr.substring(0, jsonStr.indexOf(';</script>'));
        const data = JSON.parse(jsonStr);

        const items = findKey(data, 'richItemRenderer');
        const videos = items.map(item => {
            const v = item.content?.videoRenderer;
            if (!v) return null;
            return {
                id: v.videoId,
                title: v.title?.runs?.[0]?.text,
                style: v.badges?.[0]?.metadataBadgeRenderer?.style,
                label: v.badges?.[0]?.metadataBadgeRenderer?.label,
                overlay: v.thumbnailOverlays?.map(o => o.thumbnailOverlayTimeStatusRenderer?.text?.simpleText).join(','),
                upcoming: v.upcomingEventData !== undefined
            };
        }).filter(Boolean);

        console.log(JSON.stringify(videos, null, 2));

    } catch (e) {
        console.log(e.message);
    }
}

debug();
