const express = require('express');
const { chromium } = require('playwright-chromium');
const app = express();

app.use(express.json({ limit: '5mb' }));

const API_SECRET = process.env.API_SECRET || 'apa-secret-2026-xyz';

app.use((req, res, next) => {
    if (req.path === '/health') return next();
    const secret = req.headers['x-api-secret'];
    if (secret !== API_SECRET) return res.status(401).json({ error: 'Unauthorized' });
    next();
});

app.post('/render', async (req, res) => {
    const { html, width = 1200 } = req.body;
    if (!html) return res.status(400).json({ error: 'HTML is required' });

    let browser;
    try {
        browser = await chromium.launch({
            headless: true,
            args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
        });

        const page = await browser.newPage();
        await page.setViewportSize({ width: parseInt(width), height: 800 });

        const fullHtml = `<!DOCTYPE html>
<html><head><meta charset="UTF-8">
<style>
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;margin:0;padding:24px;background:#fff;color:#1a1a1a}
table{border-collapse:collapse;width:100%;max-width:900px;margin:0 auto}
th,td{border:1px solid #e0e0e0;padding:12px 16px;text-align:left;font-size:14px}
th{background:#f8f9fa;font-weight:600;color:#333}
tr:nth-child(even){background:#fafafa}
code{background:#f1f3f4;padding:2px 6px;border-radius:4px;font-family:'SF Mono',monospace;font-size:13px}
h2{margin-top:0;color:#2c3e50}
</style></head><body>${html}</body></html>`;

        await page.setContent(fullHtml, { waitUntil: 'networkidle' });
        
        const bodyHeight = await page.evaluate(() => document.body.scrollHeight);
        await page.setViewportSize({ width: parseInt(width), height: bodyHeight + 40 });

        const screenshot = await page.screenshot({ type: 'png', fullPage: true });
        res.type('image/png').send(screenshot);

    } catch (err) {
        console.error('Render error:', err.message);
        res.status(500).json({ error: err.message });
    } finally {
        if (browser) await browser.close();
    }
});

app.get('/health', (req, res) => {
    res.json({ status: 'ok', service: 'DataRoutine-renderer', timestamp: new Date().toISOString() });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`DataRoutine Renderer on port ${PORT}`));
