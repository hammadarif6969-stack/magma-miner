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
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        res.status(200).end();
        return;
    }

    try {
        // Try Vercel KV
        const list = await handleKV(["LRANGE", "magma_miner_all_scores", "0", "-1"]);
        
        let records = [];
        if (list && Array.isArray(list)) {
            records = list.map(item => JSON.parse(item));
        } else {
            // Local fallback reading from /tmp/leaderboard_all_time.csv
            const localCSV = path.join('/tmp', 'leaderboard_all_time.csv');
            if (fs.existsSync(localCSV)) {
                const content = fs.readFileSync(localCSV, 'utf-8');
                const lines = content.trim().split('\n');
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
            }
        }

        // Sort descending by score
        records.sort((a, b) => b.score - a.score);
        const top10 = records.slice(0, 10);

        res.status(200).json({ top10, total_records: records.length });
    } catch (e) {
        res.status(500).json({ error: 'Internal Server Error', message: e.message });
    }
};
