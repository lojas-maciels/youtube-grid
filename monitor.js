const https = require('https');
const fs = require('fs');
const path = require('path');

// Configuração
const CHECK_INTERVAL = 5 * 60 * 1000; // Verificar a cada 5 minutos
const DATA_FILE = path.join(__dirname, 'lives.json');
const CHANNELS_FILE = path.join(__dirname, 'channels.json');

const FIXED_VIDEO = 'VayOrXlERHs';

const HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept': 'text/html',
    'Cache-Control': 'no-cache'
};

function loadChannels() {
    try {
        const data = fs.readFileSync(CHANNELS_FILE, 'utf8');
        return JSON.parse(data);
    } catch (e) {
        console.error('Erro ao ler channels.json:', e.message);
        return [];
    }
}

function fetchUrl(url) {
    return new Promise((resolve, reject) => {
        https.get(url, { headers: HEADERS }, (res) => {
            // Se for redirecionamento (301, 302, 303, 307...)
            if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                // Se a URL original era /live e redirecionou para watch?v=..., pode ser a live!
                return resolve(fetchUrl(res.headers.location));
            }
            let data = '';
            res.on('data', (chunk) => data += chunk);
            res.on('end', () => resolve(data));
        }).on('error', reject);
    });
}

function extractLivesFromHtml(html) {
    const lives = [];
    try {
        const jsonStart = html.indexOf('var ytInitialData = ');
        if (jsonStart > -1) {
            let jsonStr = html.substring(jsonStart + 20);
            const jsonEnd = jsonStr.indexOf(';</script>');
            if (jsonEnd > -1) {
                jsonStr = jsonStr.substring(0, jsonEnd);
                const data = JSON.parse(jsonStr);
                const items = findKey(data, 'richItemRenderer');

                for (const item of items) {
                    const videoContent = item.content?.videoRenderer;
                    if (!videoContent) continue;

                    const videoId = videoContent.videoId;
                    const badges = videoContent.badges || [];
                    const thumbnailOverlays = videoContent.thumbnailOverlays || [];

                    const hasLiveBadge = badges.some(b =>
                        b.metadataBadgeRenderer?.style === 'BADGE_STYLE_TYPE_LIVE_NOW' ||
                        b.metadataBadgeRenderer?.label === 'AO VIVO'
                    );

                    const hasLiveOverlay = thumbnailOverlays.some(o =>
                        o.thumbnailOverlayTimeStatusRenderer?.style === 'LIVE' ||
                        o.thumbnailOverlayTimeStatusRenderer?.text?.simpleText === 'AO VIVO'
                    );

                    const isUpcoming = videoContent.upcomingEventData !== undefined;

                    if ((hasLiveBadge || hasLiveOverlay) && !isUpcoming) {
                        lives.push({
                            title: videoContent.title?.runs?.[0]?.text || '',
                            videoId: videoId,
                            viewCount: videoContent.viewCountText?.simpleText || '0'
                        });
                    }
                }
            }
        }
    } catch (e) {
        console.log('Erro parse:', e.message);
    }
    return lives;
}

function extractLiveFromWatchPage(html) {
    try {
        // 1. Tenta pegar pelo Link Canônico (Mais confiável)
        const canonicalMatch = html.match(/<link rel="canonical" href="https:\/\/www\.youtube\.com\/watch\?v=([^"]+)">/);

        // 2. Tenta pegar direto do JSON
        const jsonMatch = html.match(/"videoId":"([^"]+)"/);

        const videoId = canonicalMatch ? canonicalMatch[1] : (jsonMatch ? jsonMatch[1] : null);

        if (!videoId) return null;

        const isLive = html.includes('"isLive":true') ||
            html.includes('BADGE_STYLE_TYPE_LIVE_NOW') ||
            html.includes('itemprop="isLiveBroadcast" content="True"');

        if (isLive) {
            const titleMatch = html.match(/<meta name="title" content="([^"]+)">/);
            return {
                title: titleMatch ? titleMatch[1] : 'Live Stream',
                videoId: videoId
            };
        }
    } catch (e) { }
    return null;
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

async function getLiveFromChannel(channel) {
    try {
        // 1. Tenta varredura padrão na tab /streams
        const html = await fetchUrl(channel.url);
        const lives = extractLivesFromHtml(html);

        if (lives.length > 0) {
            return {
                name: channel.name,
                videoId: lives[0].videoId,
                title: lives[0].title
            };
        }

        // 2. Fallback: Tenta acessar a URL canônica de live (/live)
        if (channel.url.includes('/streams')) {
            const liveUrl = channel.url.replace('/streams', '/live');

            const liveHtml = await fetchUrl(liveUrl);
            const liveData = extractLiveFromWatchPage(liveHtml);

            if (liveData) {
                return {
                    name: channel.name,
                    videoId: liveData.videoId,
                    title: liveData.title
                };
            }
        }

    } catch (error) {
        // console.error(`Erro em ${channel.name}: ${error.message}`);
    }
    return null;
}

async function updateData() {
    console.log(`[${new Date().toLocaleTimeString()}] 🔄 Buscando atualizações...`);

    const channels = loadChannels();
    const activeLives = [];

    for (const channel of channels) {
        const result = await getLiveFromChannel(channel);
        if (result) {
            activeLives.push(result);
            process.stdout.write(`✅ ${channel.name} `);
        }
        await new Promise(r => setTimeout(r, 200));
    }
    console.log(''); // Newline

    let gridIds = activeLives.map(l => l.videoId);

    // Fallbacks conhecidos se faltar vídeo
    const FALLBACKS = ['6N3JR_LupSM', FIXED_VIDEO, 'pHswEkH19uE', 'x4GNTjPe6_s', 'F7r7RvxaQv8'];
    let fallbackIndex = 0;
    while (gridIds.length < 4) {
        const next = FALLBACKS[fallbackIndex++] || FIXED_VIDEO;
        if (!gridIds.includes(next)) gridIds.push(next);
    }

    // Corta para 4 slots
    gridIds = gridIds.slice(0, 4);

    const data = {
        updatedAt: new Date().toISOString(),
        videos: gridIds,
        activeLives: activeLives,
        allChannels: channels
    };

    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
    console.log(`💾 JSON salvo. ${activeLives.length} transmissões ativas.`);
}

console.log('📡 Monitor de Lives iniciado (versão Otimizada)...');
if (process.env.GITHUB_ACTIONS === 'true') {
    updateData().then(() => {
        console.log('✅ Atualização concluída no GitHub Actions. Encerrando processo.');
        process.exit(0);
    }).catch(err => {
        console.error('❌ Erro na atualização:', err);
        process.exit(1);
    });
} else {
    updateData();
    setInterval(updateData, CHECK_INTERVAL);
}
