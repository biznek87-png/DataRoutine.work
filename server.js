const express = require('express');
const puppeteer = require('puppeteer');
const app = express();

// Разрешаем большие JSON (HTML таблицы могут быть большими)
app.use(express.json({ limit: '5mb' }));

// API Secret из переменных окружения Render
const API_SECRET = process.env.API_SECRET || 'apa-secret-2026-xyz';

// Путь к Chrome-headless-shell на Render (из Build Logs)
const CHROME_PATH = process.env.PUPPETEER_EXECUTABLE_PATH || 
    '/tmp/puppeteer/chrome-headless-shell/linux-121.0.6167.85/chrome-headless-shell-linux64/chrome-headless-shell';

// Защита от чужих запросов
app.use((req, res, next) => {
    if (req.path === '/health') return next(); // healthcheck без авторизации
    
    const secret = req.headers['x-api-secret'];
    if (secret !== API_SECRET) {
        return res.status(401).json({ error: 'Unauthorized' });
    }
    next();
});

// Главный endpoint: получает HTML, возвращает WebP скриншот
app.post('/render', async (req, res) => {
    const { html, width = 1200, quality = 85 } = req.body;
    
    if (!html) {
        return res.status(400).json({ error: 'HTML is required' });
    }

    let browser;
    try {
        browser = await puppeteer.launch({
            headless: 'new',
            executablePath: CHROME_PATH, // <-- ЯВНЫЙ ПУТЬ К CHROME
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-gpu',
                '--disable-software-rasterizer'
            ]
        });

        const page = await browser.newPage();
        await page.setViewport({ width: parseInt(width), height: 800 });

        // Вставляем HTML с базовыми стилями для таблиц
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
        
        // Подстраиваем высоту под контент
        const bodyHeight = await page.evaluate(() => document.body.scrollHeight);
        await page.setViewport({ width: parseInt(width), height: bodyHeight + 40 });

        // Делаем скриншот сразу в WebP
        const screenshot = await page.screenshot({
            type: 'webp',
            quality: parseInt(quality),
            fullPage: true
        });

        res.type('image/webp').send(screenshot);

    } catch (err) {
        console.error('Render error:', err);
        res.status(500).json({ error: err.message });
    } finally {
        if (browser) await browser.close();
    }
});

// Healthcheck для Render (чтобы сервис не выключили)
app.get('/health', (req, res) => {
    res.json({ status: 'ok', service: 'apa-renderer', timestamp: new Date().toISOString() });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`APA Renderer running on port ${PORT}`);
    console.log(`Chrome path: ${CHROME_PATH}`);
});
