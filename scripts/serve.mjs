import http from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
const root = process.cwd();
http.createServer(async (request, response) => {
    const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
    const file = path.resolve(root, `.${pathname.endsWith('/') ? pathname + 'index.html' : pathname}`);
    if (!file.startsWith(root + path.sep)) {
        response.writeHead(403).end();
        return;
    }
    try {
        const body = await readFile(file);
        const types = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.jpg': 'image/jpeg', '.png': 'image/png' };
        response.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'text/plain' }).end(body);
    } catch {
        response.writeHead(404).end('Not found');
    }
}).listen(4173, '127.0.0.1', () => console.log('Local: http://127.0.0.1:4173'));
