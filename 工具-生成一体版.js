const fs = require('fs');
const path = require('path');
const ROOT = __dirname;
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

let html = read('index.html');

/* ---------- 1) 内联 CSS ---------- */
html = html.replace(/<link rel="stylesheet" href="([^"?]+)(\?[^"]*)?"\s*\/?>/g, (m, href) => (
  '<style>\n/* ' + href + ' */\n' + read(href) + '\n</style>'
));

/* ---------- 2) 内联 JS，并整体套上「非下载页才运行」的守卫 ---------- */
const GUARD = "document.documentElement.classList.contains('landing')";
html = html.replace(/<script src="([^"?]+)(\?[^"]*)?"><\/script>/g, (m, src) => (
  '<script>\n/* ' + src + ' */\nif (!' + GUARD + ') {\n' + read(src) + '\n}\n</script>'
));

/* ---------- 3) 下载页样式（全部 #landing 作用域，避免和游戏冲突） ---------- */
const landingCss = `
<style>
  html.landing, html.landing body { overflow: hidden; background: #08131c; }
  html.landing #app { display: none !important; }
  html:not(.landing) #landing { display: none !important; }

  #landing {
    position: fixed; inset: 0; z-index: 99999;
    overflow-y: auto; -webkit-overflow-scrolling: touch;
    background: radial-gradient(ellipse at 50% 0%, #2c6795 0%, #16374f 45%, #08131c 100%);
    color: #eaf3fb;
    font-family: -apple-system, BlinkMacSystemFont, "PingFang SC", "Microsoft YaHei", system-ui, sans-serif;
    padding: max(24px, env(safe-area-inset-top)) 18px max(24px, env(safe-area-inset-bottom));
    -webkit-tap-highlight-color: transparent;
  }
  #landing * { box-sizing: border-box; }
  #landing .dl-wrap { max-width: 560px; margin: 0 auto; }
  #landing .dl-head { text-align: center; margin-bottom: 20px; }
  #landing .dl-logo {
    width: 96px; height: 96px; border-radius: 22px;
    box-shadow: 0 12px 30px rgba(0,0,0,.45), 0 0 0 1px rgba(232,201,106,.35) inset;
    background: #0d2136;
  }
  #landing h1 { margin: 14px 0 6px; font-size: 25px; letter-spacing: 2px; color: #ffe08a; }
  #landing .dl-sub { font-size: 13.5px; color: #9fc0d8; line-height: 1.7; }
  #landing .dl-card {
    background: linear-gradient(180deg, rgba(23,58,88,.92), rgba(12,32,50,.92));
    border: 1px solid rgba(232,201,106,.22);
    border-radius: 18px; padding: 16px; margin-bottom: 14px;
    box-shadow: 0 10px 30px rgba(0,0,0,.35);
  }
  #landing .dl-install {
    width: 100%; border: 0; border-radius: 16px; padding: 18px;
    font-size: 19px; font-weight: 800; letter-spacing: 2px; color: #2a1c00;
    background: linear-gradient(180deg, #ffe9a8 0%, #e2bd5c 55%, #bf9436 100%);
    box-shadow: 0 10px 24px rgba(0,0,0,.4), inset 0 -3px 6px rgba(0,0,0,.18);
    font-family: inherit; cursor: pointer;
  }
  #landing .dl-install:active { transform: translateY(1px); }
  #landing .dl-status { margin-top: 10px; font-size: 12.5px; color: #7fd1a0; min-height: 16px; }
  #landing .dl-status.warn { color: #ffc46b; }
  #landing .dl-link {
    display: block; text-align: center; text-decoration: none;
    border-radius: 14px; padding: 14px; font-size: 15.5px; font-weight: 700; letter-spacing: 1px;
    color: #dff1ff;
    background: linear-gradient(180deg, rgba(120,190,240,.35), rgba(50,110,165,.5));
    border: 1px solid rgba(150,210,255,.45);
  }
  #landing .dl-link.ghost { color: #cfe2f2; background: rgba(255,255,255,.06); border-color: rgba(200,230,255,.25); font-weight: 600; font-size: 14.5px; }
  #landing h2 { font-size: 13.5px; margin: 0 0 8px; color: #ffe08a; letter-spacing: 1px; }
  #landing .dl-tips { font-size: 13px; line-height: 1.9; color: #c8ddec; }
  #landing .dl-tips b { color: #ffe08a; }
  #landing .dl-tips ol { margin: 4px 0 0; padding-left: 20px; }
  #landing .dl-foot { text-align: center; font-size: 11.5px; color: #6f92aa; margin-top: 16px; line-height: 1.8; }
</style>
`;

/* ---------- 4) 下载页标记 ---------- */
const landingHtml = `
<div id="landing">
  <div class="dl-wrap">
    <div class="dl-head">
      <img class="dl-logo" src="icon-192.png" alt="双人麻将" onerror="this.style.display='none'" />
      <h1>双人麻将 · 癞子万能</h1>
      <div class="dl-sub">癞子万能 · 花牌补花 · 梗番彩蛋<br />装上后全屏横屏运行，断网也能玩</div>
    </div>

    <div class="dl-card">
      <button class="dl-install" id="dlInstall">安 装 到 桌 面</button>
      <div class="dl-status" id="dlStatus">点上面的按钮，装到手机桌面</div>
    </div>

    <div class="dl-card" id="dlIos" style="display:none">
      <h2>iPhone / iPad 安装方法</h2>
      <div class="dl-tips">
        <ol>
          <li>点底部中间的 <b>分享</b> 按钮</li>
          <li>下滑找到 <b>添加到主屏幕</b></li>
          <li>右上角点 <b>添加</b></li>
          <li>回桌面就有了麻将图标，点开即玩</li>
        </ol>
      </div>
    </div>

    <div class="dl-card" id="dlAnd" style="display:none">
      <h2>Android 安装方法</h2>
      <div class="dl-tips">
        <ol>
          <li>点上面的 <b>安装到桌面</b>，弹窗选 <b>安装</b></li>
          <li>没弹窗的话：点浏览器右上角 <b>⋮</b></li>
          <li>选 <b>安装应用</b> 或 <b>添加到主屏幕</b></li>
        </ol>
      </div>
    </div>

    <div class="dl-card">
      <a class="dl-link ghost" id="dlFile" href="#" download="双人麻将.html">下载游戏文件（.html，约 200KB）</a>
      <div class="dl-foot" style="margin-top:8px">下载后可直接用浏览器打开，也能发到电脑上玩</div>
    </div>

    <div class="dl-card">
      <a class="dl-link" id="dlPlay" href="#">直接开始玩（不安装）</a>
    </div>

    <div class="dl-foot">数据只保存在你自己的设备上 · 不需要联网对战</div>
  </div>
</div>
`;

/* ---------- 5) 决策脚本（放 head，首帧就定好显示哪一屏） ---------- */
const decideScript = `
<script>
(function () {
  var ua = navigator.userAgent || '';
  var isIOS = /iPad|iPhone|iPod/.test(ua) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  var isAndroid = /Android/i.test(ua);
  var standalone = (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) ||
    window.navigator.standalone === true;
  var isFile = location.protocol === 'file:';
  var mobile = isIOS || isAndroid || /Mobile/i.test(ua);
  var forcePlay = /[?&]play=1/.test(location.search);
  var forceLanding = /[?&]landing=1/.test(location.search);
  var showLanding = forceLanding || (mobile && !standalone && !isFile && !forcePlay);

  window.__MJ_IS_IOS = isIOS;
  window.__MJ_IS_ANDROID = isAndroid;
  window.__MJ_STANDALONE = standalone;
  if (showLanding) document.documentElement.classList.add('landing');
})();
</script>
`;

/* ---------- 6) 下载页交互（放 body 末尾） ---------- */
const landingJs = `
<script>
(function () {
  if (!document.documentElement.classList.contains('landing')) return;
  var isIOS = window.__MJ_IS_IOS, isAndroid = window.__MJ_IS_ANDROID;
  var btn = document.getElementById('dlInstall');
  var status = document.getElementById('dlStatus');
  var iosCard = document.getElementById('dlIos');
  var andCard = document.getElementById('dlAnd');
  var dlFile = document.getElementById('dlFile');
  var dlPlay = document.getElementById('dlPlay');
  var deferred = null;

  if (isIOS) { iosCard.style.display = ''; status.textContent = 'iOS 需要「添加到主屏幕」，看下面步骤'; }
  else if (isAndroid) { andCard.style.display = ''; }

  // 下载按钮：把当前这个 html 原样保存
  dlFile.href = location.pathname;
  dlPlay.addEventListener('click', function (ev) {
    ev.preventDefault();
    location.href = location.pathname + '?play=1';
  });

  window.addEventListener('beforeinstallprompt', function (e) {
    e.preventDefault();
    deferred = e;
    status.textContent = '可以安装，点按钮即可';
    status.className = 'dl-status';
  });
  window.addEventListener('appinstalled', function () {
    status.textContent = '安装成功，回桌面看看图标吧';
    btn.disabled = true;
  });

  btn.addEventListener('click', function () {
    if (deferred) {
      deferred.prompt();
      deferred.userChoice.then(function (r) {
        if (r.outcome === 'accepted') status.textContent = '正在安装…稍等，回桌面就能看到图标';
        else { status.textContent = '已取消，也可以用下面的「添加到主屏幕」'; status.className = 'dl-status warn'; }
        deferred = null;
      });
      return;
    }
    if (isIOS) { status.textContent = '点底部「分享」→「添加到主屏幕」'; }
    else if (isAndroid) { status.textContent = '用浏览器菜单里的「安装应用 / 添加到主屏幕」'; }
    else { status.textContent = '地址栏右侧有安装图标，或用浏览器菜单里的「安装」'; }
    status.className = 'dl-status warn';
  });
})();
</script>
`;

/* ---------- 7) 组装 ---------- */
html = html.replace('</head>', landingCss + decideScript + '</head>');
html = html.replace(/<body>/, '<body>\n' + landingHtml);
html = html.replace('</body>', landingJs + '\n</body>');

const out = '上传这个-index.html';
fs.writeFileSync(path.join(ROOT, out), html, 'utf8');
console.log(out + ' 已生成：' + Math.round(fs.statSync(path.join(ROOT, out)).size / 1024) + ' KB');

// 纯游戏单文件（给手机当附件发）
let plain = read('index.html');
plain = plain.replace(/<link rel="stylesheet" href="([^"?]+)(\?[^"]*)?"\s*\/?>/g, (m, href) => (
  '<style>\n' + read(href) + '\n</style>'
));
plain = plain.replace(/<script src="([^"?]+)(\?[^"]*)?"><\/script>/g, (m, src) => (
  '<script>\n' + read(src) + '\n</script>'
));
plain = plain.replace(/<link rel="manifest"[^>]*>\n?/g, '');
plain = plain.split("navigator.serviceWorker.register('sw.js')").join('void 0');
fs.writeFileSync(path.join(ROOT, '双人麻将-单文件版.html'), plain, 'utf8');
console.log('双人麻将-单文件版.html 已生成：' +
  Math.round(fs.statSync(path.join(ROOT, '双人麻将-单文件版.html')).size / 1024) + ' KB');
