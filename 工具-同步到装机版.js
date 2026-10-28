/* 把当前仓库的代码同步到「装机版」（桌面快捷方式实际打开的那一份）
 *   装机目录：%LOCALAPPDATA%\Programs\mahjong2p
 *   快捷方式：Edge --app=file:///.../index.html --user-data-dir=...\profile
 *
 * 用法：node 工具-同步到装机版.js
 * 说明：只覆盖 js / css / sw.js，并就地升级 index.html 里的 ?v= 版本号
 *       （index.html 的页面结构保留原样，避免覆盖掉装机版自己的入口改动）
 */
const fs = require('fs');
const path = require('path');
const os = require('os');

const REPO = __dirname;
const INST = path.join(process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local'),
  'Programs', 'mahjong2p');

if (!fs.existsSync(path.join(INST, 'index.html'))) {
  console.error('✗ 没找到装机目录：' + INST);
  process.exit(1);
}

/* 1) 代码与样式（整文件覆盖，这些文件在装机版里没有本地改动） */
const COPY = [
  'js/engine.js', 'js/game.js', 'js/ai.js', 'js/ui.js',
  'css/style.css',
  'sw.js', 'manifest.webmanifest',
];
let copied = 0;
for (const rel of COPY) {
  const from = path.join(REPO, rel);
  const to = path.join(INST, rel);
  if (!fs.existsSync(from)) { console.log('跳过（仓库里没有）: ' + rel); continue; }
  fs.mkdirSync(path.dirname(to), { recursive: true });
  fs.copyFileSync(from, to);
  copied++;
  console.log('  ✓ ' + rel);
}

/* 2) index.html：只升级缓存版本号，并补上版本标签（结构不动） */
const idxPath = path.join(INST, 'index.html');
let idx = fs.readFileSync(idxPath, 'utf8');
const verMatch = idx.match(/[?&]v=(\d{8})/);
const newVer = (() => {
  const repoIdx = fs.readFileSync(path.join(REPO, 'index.html'), 'utf8');
  const m = repoIdx.match(/[?&]v=(\d{8})/);
  return m ? m[1] : (verMatch ? verMatch[1] : null);
})();

let before = idx;
if (verMatch && newVer && verMatch[1] !== newVer) {
  idx = idx.split(verMatch[1]).join(newVer);
  console.log('  ✓ index.html 版本号 ' + verMatch[1] + ' -> ' + newVer);
}

if (newVer && !idx.includes('class="buildtag"')) {
  idx = idx.replace(/(<button class="ghost" id="logClear">)/,
    '<span class="buildtag">v' + newVer + '</span>$1');
  if (!idx.includes('class="buildtag"')) console.log('  · 装机版牌谱弹窗结构不同，未加版本标签');
}
if (newVer && !idx.includes('class="start-ver"')) {
  idx = idx.replace(/(<button class="start-item" id="btnStartLog">[^<]*<\/button>\s*<\/div>)/,
    '$1\n    <div class="start-ver">v' + newVer + '</div>');
}

if (idx !== before) {
  fs.writeFileSync(idxPath, idx, 'utf8');
  console.log('  ✓ index.html 已更新');
}

/* 3) 校验 */
const crypto = require('crypto');
const md5 = (p) => crypto.createHash('md5').update(fs.readFileSync(p)).digest('hex').slice(0, 8);
console.log('\n校验：');
let bad = 0;
for (const rel of COPY) {
  const a = path.join(REPO, rel), b = path.join(INST, rel);
  if (!fs.existsSync(a) || !fs.existsSync(b)) continue;
  const same = md5(a) === md5(b);
  if (!same) bad++;
  console.log('  ' + (same ? '一致 ✓' : '不一致 ✗') + '  ' + rel);
}
const stillOld = /[?&]v=(?!'?\d{8})/.test(idx) && idx.includes(verMatch ? verMatch[1] : '###');
console.log('  index.html 版本号：' + ((idx.match(/[?&]v=(\d{8})/g) || []).join(' ') || '无'));
console.log(bad === 0 ? '\n装机版已同步 ✅（关掉游戏窗口，重新双击桌面快捷方式即可）'
  : '\n有 ' + bad + ' 个文件没同步成功 ❌');
