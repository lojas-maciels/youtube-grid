const https = require('https');
const fs = require('fs');
const path = require('path');

// Lista de canais para monitorar
const CHANNELS = [
    { name: 'CNN Brasil', url: 'https://www.youtube.com/@CNNbrasil/streams' },
    { name: 'Revista Oeste', url: 'https://www.youtube.com/@RevistaOeste/streams' },
    { name: 'Gazeta do Povo', url: 'https://www.youtube.com/@gazetadopovo/streams' },
    { name: 'BandNews FM', url: 'https://www.youtube.com/@RadioBandNewsFM/streams' },
    { name: 'Record News', url: 'https://www.youtube.com/@recordnews/streams' },
    { name: 'Jovem Pan News', url: 'https://www.youtube.com/@JovemPanNews/streams' },
];

const FIXED_VIDEO = 'VayOrXlERHs';

const HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept': 'text/html',
    'Cache-Control': 'no-cache',
    'Pragma': 'no-cache'
};

function fetchUrl(url) {
    return new Promise((resolve, reject) => {
        https.get(url, { headers: HEADERS }, (res) => {
            let data = '';
            if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                return resolve(fetchUrl(res.headers.location));
            }
            res.on('data', (chunk) => data += chunk);
            res.on('end', () => resolve(data));
        }).on('error', reject);
    });
}

function extractLivesFromHtml(html) {
    const lives = [];

    // O Youtube envia um JSON gigante dentro da variável ytInitialData
    // Vamos tentar extrair esse JSON para analisar com precisão em vez de usar Regex solta
    try {
        const jsonStart = html.indexOf('var ytInitialData = ');
        if (jsonStart > -1) {
            let jsonStr = html.substring(jsonStart + 20);
            const jsonEnd = jsonStr.indexOf(';</script>');
            if (jsonEnd > -1) {
                jsonStr = jsonStr.substring(0, jsonEnd);
                const data = JSON.parse(jsonStr);

                // Navegar na estrutura do JSON do YouTube (tabs -> richGridRenderer -> contents)
                // A estrutura exata varia, vamos buscar recursivamente objetos que pareçam videos
                const items = findKey(data, 'richItemRenderer');

                for (const item of items) {
                    const videoContent = item.content?.videoRenderer;
                    if (!videoContent) continue;

                    const videoId = videoContent.videoId;
                    const badges = videoContent.badges || [];
                    const thumbnailOverlays = videoContent.thumbnailOverlays || [];

                    // Verificação 1: Badge explícito "AO VIVO"
                    const hasLiveBadge = badges.some(b =>
                        b.metadataBadgeRenderer?.style === 'BADGE_STYLE_TYPE_LIVE_NOW' ||
                        b.metadataBadgeRenderer?.label === 'AO VIVO'
                    );

                    // Verificação 2: Overlay "AO VIVO" na thumbnail (vermelho)
                    const hasLiveOverlay = thumbnailOverlays.some(o =>
                        o.thumbnailOverlayTimeStatusRenderer?.style === 'LIVE' ||
                        o.thumbnailOverlayTimeStatusRenderer?.text?.simpleText === 'AO VIVO'
                    );

                    // CRUCIAL: Ignorar "Em breve" (Upcoming)
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
        console.log('Erro ao parsear JSON do YouTube:', e.message);
    }

    // Fallback: Regex mais rigorosa se o parse falhar
    if (lives.length === 0) {
        // Procura blocos que tenham "BADGE_STYLE_TYPE_LIVE_NOW" E NÃO tenham "upcomingEventData" perto
        const regex = /"videoId":"([^"]+)".*?"style":"BADGE_STYLE_TYPE_LIVE_NOW"/g;
        let match;
        while ((match = regex.exec(html)) !== null) {
            // Verifica se não é upcoming olhando os caracteres ao redor (heurística)
            const snippet = html.substring(match.index, match.index + 500);
            if (!snippet.includes('upcomingEventData')) {
                lives.push({ videoId: match[1], title: 'Regex Match' });
            }
        }
    }

    return lives;
}

// Função auxiliar para achar chaves em objeto profundo
function findKey(obj, key) {
    let results = [];
    if (!obj) return results;

    if (obj[key]) {
        results.push(obj[key]);
    }

    if (typeof obj === 'object') {
        for (const k in obj) {
            if (typeof obj[k] === 'object') {
                results = results.concat(findKey(obj[k], key));
            }
        }
    }
    return results;
}

async function getLiveFromChannel(channel) {
    try {
        process.stdout.write(`🔎 Verificando ${channel.name}... `);
        const html = await fetchUrl(channel.url);
        const lives = extractLivesFromHtml(html);

        if (lives.length > 0) {
            console.log(`✅ ${lives[0].videoId} (AO VIVO REAL)`);
            return { name: channel.name, videoId: lives[0].videoId };
        }

        console.log(`⚪ Offline (sem transmissão ativa)`);
        return null;

    } catch (error) {
        console.log(`❌ Erro: ${error.message}`);
        return null;
    }
}

async function updateHTML(liveStreams) {
    let finalIds = liveStreams.map(l => l.videoId);

    // GARANTIA: Se tiver MENOS de 4 lives REAIS, completamos APENAS com o vídeo fixo ou fallbacks CONHECIDOS
    const FALLBACK_NEWS_LIVE_NOW = [
        FIXED_VIDEO,   // O vídeo que você pediu explicitamente
        'pHswEkH19uE', // Record News 24h (quase sempre on)
        'x4GNTjPe6_s', // BandNews 24h
        'F7r7RvxaQv8'  // Jovem Pan 24h
    ];

    let fallbackIndex = 0;
    while (finalIds.length < 4) {
        const nextFallback = FALLBACK_NEWS_LIVE_NOW[fallbackIndex++];
        if (nextFallback && !finalIds.includes(nextFallback)) {
            finalIds.push(nextFallback);
        } else if (!nextFallback) {
            // Se acabaram os fallbacks, repete o primeiro vídeo que é o mais importante
            finalIds.push(finalIds[0] || FIXED_VIDEO);
        }
    }

    const selectedIds = finalIds.slice(0, 4);

    const htmlPath = path.join(__dirname, 'index.html');
    let html = fs.readFileSync(htmlPath, 'utf8');

    const newVideoIds = `const videoIds = ['${selectedIds.join("', '")}'];`;
    html = html.replace(/const videoIds = \[.*?\];/s, newVideoIds);

    for (let i = 0; i < 4; i++) {
        const videoId = selectedIds[i];
        const iframeRegex = new RegExp(`(id="player-${i + 1}"[^>]*src=")[^"]*(")`);
        html = html.replace(
            iframeRegex,
            `$1https://www.youtube-nocookie.com/embed/${videoId}?autoplay=1&mute=1&rel=0&modestbranding=1&playsinline=1$2`
        );
    }

    fs.writeFileSync(htmlPath, html);
    console.log('\n💾 Grid atualizado!');
    console.log('📺 IDs:', selectedIds.join(', '));
}

async function main() {
    console.log('🔄 Buscando APENAS transmissões ativas agora...\n');
    const confirmedLives = [];

    for (const channel of CHANNELS) {
        const result = await getLiveFromChannel(channel);
        if (result) confirmedLives.push(result);
        await new Promise(r => setTimeout(r, 500));
    }

    await updateHTML(confirmedLives);
}

main();
