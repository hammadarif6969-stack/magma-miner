const path = require('path');
const fs = require('fs');

const https = require('https');

function handleKV(command) {
    return new Promise((resolve) => {
        if (!process.env.KV_REST_API_URL || !process.env.KV_REST_API_TOKEN) {
            resolve(null);
            return;
        }
        try {
            const url = new URL(process.env.KV_REST_API_URL);
            const options = {
                hostname: url.hostname,
                port: 443,
                path: url.pathname + url.search,
                method: 'POST',
                headers: {
                    'Authorization': 'Bearer ' + process.env.KV_REST_API_TOKEN,
                    'Content-Type': 'application/json'
                }
            };

            const req = https.request(options, (res) => {
                let body = '';
                res.on('data', (chunk) => { body += chunk; });
                res.on('end', () => {
                    try {
                        const data = JSON.parse(body);
                        resolve(data.result);
                    } catch (e) {
                        resolve(null);
                    }
                });
            });

            req.on('error', () => {
                resolve(null);
            });

            req.write(JSON.stringify(command));
            req.end();
        } catch (err) {
            resolve(null);
        }
    });
}

module.exports = async (req, res) => {
    // CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        res.status(200).end();
        return;
    }

    if (req.method !== 'POST') {
        res.status(405).json({ error: 'Method Not Allowed' });
        return;
    }

    try {
        const data = req.body;
        const timestamp = new Date().toISOString();
        const playerName = (data.player_name || 'Miner').replace(/,/g, '');
        const score = parseInt(data.score, 10) || 0;
        const wave = parseInt(data.wave_reached, 10) || 1;
        const bosses = parseInt(data.bosses_defeated, 10) || 0;
        const duration = parseFloat(data.duration_sec) || 0;

        const record = {
            timestamp,
            player_name: playerName,
            score,
            wave_reached: wave,
            bosses_defeated: bosses,
            duration_sec: duration
        };

        // Try Vercel KV
        const kvResult = await handleKV(["RPUSH", "magma_miner_all_scores", JSON.stringify(record)]);

        if (kvResult !== null && kvResult !== undefined && typeof kvResult === 'number') {
            res.status(200).json({ success: true, db: 'kv', timestamp });
        } else {
            // Local fallback (works for session but not persistent on serverless)
            const csvLine = `${timestamp},${playerName},${score},${wave},${bosses},${duration.toFixed(1)}\n`;
            const localCSV = path.join('/tmp', 'leaderboard_all_time.csv');
            fs.appendFileSync(localCSV, csvLine, 'utf-8');
            res.status(200).json({ success: true, db: 'local_tmp', timestamp });
        }
    } catch (e) {
        res.status(400).json({ error: 'Invalid Request Data', message: e.message });
    }
};
