const express = require('express');
const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');
const app = express();

// Разрешаем большие JSON
app.use(express.json({ limit: '5mb' }));

const API_SECRET = process.env.API_SECRET || 'apa-secret-2026-xyz';

// Находим Chrome-headless-shell динамически в папке проекта
function findChromeExecutable() {
    const searchDirs = [
        path.join(__dirname, '.cache', 'puppeteer'),
        path.join(__dirname, 'node_modules', 'puppeteer', '.local-chromium'),
        '/opt/render/project/src/.cache/puppeteer',
        '/opt/render/.cache/puppeteer',
    ];
    
    for (const dir of searchDirs) {
        if (!fs.existsSync(dir)) continue;
        try {
            const files = fs.readdirSync(dir, { recursive: true });
            const chromeFile = files.find(f => 
                typeof f === 'string' && 
                f.includes('chrome-headless-shell') && 
                !f.endsWith('.zip') &&
                !f.includes('.tar')
            );
            if (chromeFile) {
                const fullPath = path.join(dir, chromeFile);
                if (fs.existsSync(fullPath)) return fullPath;
            }
        } catch (e) {}
    }
    return null;
}

const CHROME_PATH = findChromeExecutable();
console.log('Chrome found at:', CHROME_PATH || 'NOT FOUND - will use default');

// Защита от чужих запросов
app.use((req, res, next) => {
    if (req.path === '/health') return next();
    
    const secret = req.headers['x-api-secret'];
    if (secret !== API_SECRET) {
        return res.status(401).json({ error: 'Unauthorized' });
    }
    next();
});

// Главный endpoint
app.post('/render', async (req, res) => {
    const { html, width = 1200, quality = 85 } = req.body;
    
    if (!html) {
        return res.status(400).json({ error: 'HTML is required' });
    }

    let browser;
    try {
        const launchOptions = {
            headless: 'new',
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-gpu',
                '--disable-software-rasterizer',
                '--disable-extensions',
                '--disable-background-networking',
                '--disable-background-timer-throttling',
                '--disable-backgrounding-occluded-windows',
                '--disable-renderer-backgrounding'
            ]
        };

        // Если нашли Chrome явно — используем его
        if (CHROME_PATH) {
            launchOptions.executablePath = CHROME_PATH;
        }

        browser = await puppeteer.launch(launchOptions);

        const page = await browser.newPage();
        await page.setViewport({ width: parseInt(width), height: 800 });

        const fullHtml = `<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <style>
        body { 
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif;
            margin: 0; 
            padding: 24px; 
            background: #ffffff;
            color: #1a1a1a;
        }
        table { 
            border-collapse: collapse; 
            width: 100%; 
            max-width: 900px;
            margin: 0 auto;
        }
        th, td { 
            border: 1px solid #e0e0e0; 
            padding: 12px 16px; 
            text-align: left;
            font-size: 14px;
        }
        th { 
            background: #f8f9fa; 
            font-weight: 600;
            color: #333;
        }
        tr:nth-child(even) { background: #fafafa; }
        code { 
            background: #f1f3f4; 
            padding: 2px 6px; 
            border-radius: 4px;
            font-family: 'SF Mono', Monaco, monospace;
            font-size: 13px;
        }
        h2 { margin-top: 0; color: #2c3e50; }
        .callout {
            background: #e8f4f8;
            border-left: 4px solid #2196F3;
            padding: 16px;
            margin: 16px 0;
            border-radius: 4px;
        }
    </style>
</head>
<body>${html}</body>
</html>`;

        await page.setContent(fullHtml, { waitUntil: 'networkidle0' });
        
        const bodyHeight = await page.evaluate(() => document.body.scrollHeight);
        await page.setViewport({ width: parseInt(width), height: bodyHeight + 40 });

        const screenshot = await page.screenshot({
            type: 'webp',
            quality: parseInt(quality),
            fullPage: true
        });

        res.type('image/webp').send(screenshot);

    } catch (err) {
        console.error('Render error:', err.message);
        res.status(500).json({ error: err.message });
    } finally {
        if (browser) await browser.close();
    }
});

// Healthcheck
app.get('/health', (req, res) => {
    res.json({ 
        status: 'ok', 
        service: 'apa-renderer',
        chrome_found: !!CHROME_PATH,
        chrome_path: CHROME_PATH,
        timestamp: new Date().toISOString() 
    });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`APA Renderer running on port ${PORT}`);
    console.log(`Chrome found: ${CHROME_PATH || 'NOT FOUND'}`);
});
