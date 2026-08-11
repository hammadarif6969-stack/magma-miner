const path = require('path');
const fs = require('fs');

async function handleKV(command) {
    if (!process.env.KV_REST_API_URL || !process.env.KV_REST_API_TOKEN) {
        return null;
    }
    const res = await fetch(process.env.KV_REST_API_URL, {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${process.env.KV_REST_API_TOKEN}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(command)
    });
    const data = await res.json();
    return data.result;
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
        const list = await handleKV(["LRANGE", "magma_miner_all_scores", "0", "-1"]);
        
        let csvContent = 'timestamp,player_name,score,wave_reached,bosses_defeated,duration_sec\n';

        if (list !== null) {
            const records = list.map(item => JSON.parse(item));
            records.forEach(rec => {
                csvContent += `${rec.timestamp},${rec.player_name},${rec.score},${rec.wave_reached},${rec.bosses_defeated},${rec.duration_sec.toFixed(1)}\n`;
            });
        } else {
            // Local fallback reading from /tmp/leaderboard_all_time.csv
            const localCSV = path.join('/tmp', 'leaderboard_all_time.csv');
            if (fs.existsSync(localCSV)) {
                csvContent = fs.readFileSync(localCSV, 'utf-8');
            }
        }

        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', 'attachment; filename="magma_miner_leaderboard_all_time.csv"');
        res.status(200).send(csvContent);
    } catch (e) {
        res.status(500).json({ error: 'Internal Server Error', message: e.message });
    }
};
