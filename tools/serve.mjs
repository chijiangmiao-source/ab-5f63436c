// 零依赖静态服务器：仅用于本地开发与无容器环境下的冒烟验证。
// 生产部署使用 nginx 镜像（见 Dockerfile.web / nginx.conf）。
import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'web');
const PORT = Number(process.env.PORT || 8080);

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '': 'text/plain; charset=utf-8',
};

function send(res, code, body, type) {
  res.writeHead(code, {
    'content-type': type || 'text/plain; charset=utf-8',
    'cache-control': 'no-store',
  });
  res.end(body);
}

const server = http.createServer(async (req, res) => {
  try {
    // req.url 是 origin-form（以 / 开头）；不要用 new URL(req.url, base)
    // 解析，否则 "//healthz" 会被误当成协议相对 URL（authority=healthz）。
    const rawPath = (req.url || '/').split('?')[0].split('#')[0];
    let pathname = decodeURIComponent(rawPath);
    // 与 nginx 默认 merge_slashes 行为一致：折叠重复斜杠
    pathname = pathname.replace(/\/{2,}/g, '/');
    if (pathname === '/healthz') {
      send(res, 200, 'ok\n');
      return;
    }
    if (pathname === '/') pathname = '/index.html';

    const filePath = path.join(ROOT, path.normalize(pathname));
    if (!filePath.startsWith(ROOT)) { send(res, 403, 'forbidden'); return; }
    const st = await stat(filePath).catch(() => null);
    if (!st || !st.isFile()) { send(res, 404, 'not found'); return; }
    const body = await readFile(filePath);
    send(res, 200, body, MIME[path.extname(filePath)] || 'application/octet-stream');
  } catch (e) {
    send(res, 500, `server error: ${e.message}`);
  }
});

server.listen(PORT, () => {
  console.log(`静态页面: http://localhost:${PORT}/  健康路径: http://localhost:${PORT}/healthz`);
});
