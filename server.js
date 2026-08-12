const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');

const PORT = 8080;
const ROOT_DIR = __dirname;
const CSV_PATH = path.join(ROOT_DIR, 'leaderboard_all_time.csv');

// Initialize CSV file if it doesn't exist (skip on Vercel read-only filesystem)
if (!process.env.VERCEL) {
    if (!fs.existsSync(CSV_PATH)) {
        fs.writeFileSync(CSV_PATH, 'timestamp,player_name,score,wave_reached,bosses_defeated,duration_sec\n', 'utf-8');
    }
}

// MIME types for static file serving
const MIME_TYPES = {
    '.html': 'text/html',
    '.js': 'text/javascript',
    '.css': 'text/css',
    '.json': 'application/json',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.gif': 'image/gif',
    '.ico': 'image/x-icon',
    '.mp3': 'audio/mpeg',
    '.wav': 'audio/wav',
    '.csv': 'text/csv'
};

function parseCSV() {
    if (!fs.existsSync(CSV_PATH)) return [];
    const content = fs.readFileSync(CSV_PATH, 'utf-8');
    const lines = content.trim().split('\n');
    if (lines.length <= 1) return [];

    const headers = lines[0].split(',');
    const records = [];

    for (let i = 1; i < lines.length; i++) {
        if (!lines[i].trim()) continue;
        const cols = lines[i].split(',');
        records.push({
            timestamp: cols[0] || '',
            player_name: cols[1] || 'Anonymous',
            score: parseInt(cols[2], 10) || 0,
            wave_reached: parseInt(cols[3], 10) || 1,
            bosses_defeated: parseInt(cols[4], 10) || 0,
            duration_sec: parseFloat(cols[5]) || 0
        });
    }
    return records;
}

function getTop10() {
    const records = parseCSV();
    records.sort((a, b) => b.score - a.score);
    return records.slice(0, 10);
}

const server = http.createServer((req, res) => {
    const parsedUrl = url.parse(req.url, true);
    const pathname = parsedUrl.pathname;

    // CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        res.writeHead(200);
        res.end();
        return;
    }

    // API Route: Submit new score
    if (pathname === '/api/scores' && req.method === 'POST') {
        let body = '';
        req.on('data', chunk => { body += chunk.toString(); });
        req.on('end', () => {
            try {
                const data = JSON.parse(body);
                const timestamp = new Date().toISOString();
                const playerName = (data.player_name || 'Miner').replace(/,/g, '');
                const score = parseInt(data.score, 10) || 0;
                const wave = parseInt(data.wave_reached, 10) || 1;
                const bosses = parseInt(data.bosses_defeated, 10) || 0;
                const duration = parseFloat(data.duration_sec) || 0;

                const csvLine = `${timestamp},${playerName},${score},${wave},${bosses},${duration.toFixed(1)}\n`;
                fs.appendFileSync(CSV_PATH, csvLine, 'utf-8');

                console.log(`[SCORE RECORDED] ${playerName}: ${score} pts (Wave ${wave}, Bosses ${bosses}) at ${timestamp}`);

                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: true, timestamp, top10: getTop10() }));
            } catch (e) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Invalid JSON data' }));
            }
        });
        return;
    }

    // API Route: Fetch Top 10 Leaderboard
    if (pathname === '/api/leaderboard' && req.method === 'GET') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ top10: getTop10(), total_records: parseCSV().length }));
        return;
    }

    // API Route: Export full CSV file
    if ((pathname === '/api/export' || pathname === '/api/leaderboard/export') && req.method === 'GET') {
        if (fs.existsSync(CSV_PATH)) {
            const stat = fs.statSync(CSV_PATH);
            res.writeHead(200, {
                'Content-Type': 'text/csv',
                'Content-Length': stat.size,
                'Content-Disposition': 'attachment; filename="magma_miner_leaderboard_all_time.csv"'
            });
            fs.createReadStream(CSV_PATH).pipe(res);
        } else {
            res.writeHead(404, { 'Content-Type': 'text/plain' });
            res.end('CSV Leaderboard file not found.');
        }
        return;
    }

    // Static File Server
    const decodedPath = decodeURIComponent(pathname);
    let filePath = path.join(ROOT_DIR, decodedPath === '/' ? 'index.html' : decodedPath);
    
    // Prevent directory traversal
    if (!filePath.startsWith(ROOT_DIR)) {
        res.writeHead(403, { 'Content-Type': 'text/plain' });
        res.end('Forbidden');
        return;
    }

    fs.stat(filePath, (err, stats) => {
        if (err || !stats.isFile()) {
            res.writeHead(404, { 'Content-Type': 'text/plain' });
            res.end('File Not Found');
            return;
        }

        const ext = path.extname(filePath).toLowerCase();
        const contentType = MIME_TYPES[ext] || 'application/octet-stream';

        res.writeHead(200, { 'Content-Type': contentType, 'Content-Length': stats.size });
        fs.createReadStream(filePath).pipe(res);
    });
});

if (!process.env.VERCEL) {
    server.listen(PORT, () => {
        console.log(`🚀 MAGMA MINER SERVER ACTIVE ON HTTP://LOCALHOST:${PORT}`);
        console.log(`📊 ALL-TIME LEADERBOARD CSV PATH: ${CSV_PATH}`);
    });
}
