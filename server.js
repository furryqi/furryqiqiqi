const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');

const ROOT = __dirname;
const PORT = process.env.PORT || 8080;
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.md': 'text/markdown; charset=utf-8',
  '.svg': 'image/svg+xml',
};

const server = http.createServer((req, res) => {
  const url = decodeURIComponent(req.url.split('?')[0]);
  let file = path.join(ROOT, url === '/' ? 'index.html' : url);
  if (!file.startsWith(ROOT)) {
    res.writeHead(403).end('forbidden');
    return;
  }
  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) {
      res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' }).end('not found');
      return;
    }
    res.writeHead(200, {
      'content-type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream',
      'cache-control': 'no-cache',
    });
    fs.createReadStream(file).pipe(res);
  });
});

function lanIps() {
  const out = [];
  Object.values(os.networkInterfaces()).forEach((list) => {
    (list || []).forEach((n) => {
      if (n.family === 'IPv4' && !n.internal) out.push(n.address);
    });
  });
  return out;
}

server.on('error', (e) => {
  if (e.code === 'EADDRINUSE') {
    console.log('');
    console.log('端口 ' + PORT + ' 已被占用（可能已经在运行了）。');
    console.log('如果是之前开着的窗口，直接用那个就行；否则关掉旧的再试。');
    console.log('');
  } else {
    console.log('启动失败：' + e.message);
  }
});

server.listen(PORT, '0.0.0.0', () => {
  const ips = lanIps();
  console.log('');
  console.log('  电脑上打开：  http://localhost:' + PORT + '/');
  console.log('');
  if (ips.length) {
    ips.forEach((ip) => console.log('  ★ 手机上打开：http://' + ip + ':' + PORT + '/'));
  } else {
    console.log('  ★ 没找到局域网 IP，请确认电脑已连上 Wi-Fi / 网线');
  }
  console.log('');
  console.log('  说明：手机要和电脑连同一个 Wi-Fi，输入上面带 ★ 的那一行地址。');
  console.log('  这个窗口不要关，关了服务就停了。');
  console.log('');
});
