const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const OUT = path.join(ROOT, '手机下载版');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const write = (p, s) => fs.writeFileSync(path.join(OUT, p), s, 'utf8');

fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });

/* 1) 游戏：单文件版，作为 game.html */
let html = read('index.html');
html = html.replace(/<link rel="stylesheet" href="([^"?]+)(\?[^"]*)?"\s*\/?>/g, (m, href) => (
  '<style>\n/* ' + href + ' */\n' + read(href) + '\n</style>'
));
html = html.replace(/<script src="([^"?]+)(\?[^"]*)?"><\/script>/g, (m, src) => (
  '<script>\n/* ' + src + ' */\n' + read(src) + '\n</script>'
));
write('game.html', html);

/* 2) 下载页：把入口改成 game.html */
let dl = read('download.html');
dl = dl.replace(/href="index.html"/g, 'href="game.html"');
dl = dl.replace(
  'href="双人麻将-单文件版.html" download',
  'href="game.html" download="双人麻将.html"'
);
dl = dl.replace(
  "fetch('双人麻将-单文件版.html', { method: 'HEAD' })",
  "fetch('game.html', { method: 'HEAD' })"
);
dl = dl.replace(
  "下载单文件版（.html，可离线保存）",
  "下载游戏文件（.html，约 200KB）"
);
write('index.html', dl);

/* 3) manifest：安装后直接打开 game.html，并强制横屏 */
let mf = JSON.parse(read('manifest.webmanifest'));
mf.start_url = './game.html';
mf.orientation = 'landscape';
write('manifest.webmanifest', JSON.stringify(mf, null, 2) + '\n');

/* 4) sw.js：缓存这两个页面 */
let sw = read('sw.js');
sw = sw.replace("const CACHE = 'mj2p-v2';", "const CACHE = 'mj2p-v3';");
sw = sw.replace(
  `const ASSETS = [
  './',
  './index.html',`,
  `const ASSETS = [
  './',
  './index.html',
  './game.html',`
);
write('sw.js', sw);

/* 5) 图标 */
['icon-192.png', 'icon-512.png'].forEach((f) => {
  fs.copyFileSync(path.join(ROOT, f), path.join(OUT, f));
});

/* 6) 说明 */
fs.writeFileSync(path.join(OUT, '说明.txt'),
  '手机下载版\n\n' +
  'index.html   下载 / 安装落地页（把这个网址发给手机）\n' +
  'game.html    游戏本体（单文件，样式脚本全内联）\n' +
  'manifest.webmanifest  PWA 清单（安装后直接打开 game.html，横屏）\n' +
  'sw.js        离线缓存\n' +
  'icon-192.png / icon-512.png  桌面图标\n\n' +
  '部署：把这些文件全部上传到同一个目录即可（GitHub Pages / Netlify 都行）。\n',
  'utf8');

const list = fs.readdirSync(OUT);
list.forEach((f) => {
  const kb = Math.round(fs.statSync(path.join(OUT, f)).size / 1024);
  console.log('  ' + (f + '                         ').slice(0, 26) + kb + ' KB');
});
console.log('已生成目录：手机下载版/');
