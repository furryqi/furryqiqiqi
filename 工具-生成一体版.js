const fs = require('fs');
const path = require('path');
const ROOT = __dirname;
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

let html = read(fs.existsSync(path.join(ROOT, '游戏源.html')) ? '游戏源.html' : 'index.html');
if (html.indexOf('id="landing"') !== -1) {
  console.error('✗ index.html 里已经含下载页，先还原成拆分版再构建（否则会重复插入）');
  process.exit(1);
}
if (html.indexOf('href="css/style.css') === -1) {
  console.error('✗ index.html 不像拆分版（缺少外链 css），请检查');
  process.exit(1);
}
if (html.indexOf('id="btnStart"') === -1) {
  console.error('✗ 源文件里没有开始页（id="btnStart"），构建会丢掉开始页');
  process.exit(1);
}

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

  /* ---- 竖屏时挡一层「请横屏」 ---- */
  #rotateHint { display: none; }
  @media (max-width: 900px) and (orientation: portrait) {
    body.mj-need-landscape #rotateHint {
      display: flex; position: fixed; inset: 0; z-index: 99998;
      flex-direction: column; align-items: center; justify-content: center; gap: 18px;
      background: radial-gradient(ellipse at 50% 30%, #2c6795 0%, #16374f 55%, #08131c 100%);
      color: #eaf3fb; text-align: center; padding: 24px;
      font-family: -apple-system, BlinkMacSystemFont, "PingFang SC", "Microsoft YaHei", system-ui, sans-serif;
    }
    body.mj-need-landscape #app { display: none !important; }
  }
  #rotateHint .rh-icon { font-size: 54px; line-height: 1; transform: rotate(90deg); }
  #rotateHint .rh-title { font-size: 21px; font-weight: 800; letter-spacing: 2px; color: #ffe08a; }
  #rotateHint .rh-text { font-size: 14px; color: #bcd6e8; line-height: 1.8; }
  #rotateHint .rh-btn {
    margin-top: 6px; border: 1px solid rgba(200, 230, 255, .35);
    background: rgba(255, 255, 255, .08); color: #dff1ff;
    border-radius: 12px; padding: 10px 18px; font-size: 14px; font-family: inherit;
  }
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
      <div class="dl-status" id="dlStatus">装好后桌面会出现图标，点开即玩</div>
    </div>

    <div class="dl-card" id="dlInApp" style="display:none">
      <h2 style="color:#ffb4a8">要在微信/QQ 里打开？装不了</h2>
      <div class="dl-tips">
        内置浏览器不支持安装桌面图标。请点右上角 <b>···</b> →
        <b>在浏览器打开</b>，再按下面的步骤安装。
      </div>
      <a class="dl-link ghost" id="dlCopy" href="#" style="margin-top:10px">复制网址（粘贴到 Chrome / Safari）</a>
    </div>

    <div class="dl-card" id="dlSteps">
      <h2 id="dlStepsTitle">安装步骤</h2>
      <div class="dl-tips" id="dlStepsBody"></div>
    </div>

    <div class="dl-card">
      <h2>安卓安装包</h2>
      <a class="dl-link" id="dlApk" href="app-debug.apk" download>下载 APK（约 4MB，安装后桌面有图标）</a>
      <div class="dl-foot" style="margin-top:8px;text-align:left">
        点开装上，弹出「未知来源」时允许一次即可。
        装好后是独立 App，不是浏览器，断网也能玩。
      </div>
    </div>

    <div class="dl-card">
      <a class="dl-link ghost" id="dlFile" href="#" download="双人麻将.html">下载网页版文件（.html，约 200KB）</a>
      <div class="dl-foot" style="margin-top:8px;text-align:left">
        下载得到 <b>双人麻将.html</b>：电脑上双击就能玩；
        手机上需要 <b>Firefox / 夸克 / Edge</b> 这类允许打开本地网页的浏览器（Chrome 会拒绝）。
      </div>
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

  // 自救开关：?nosw=1 一次性注销旧 Service Worker 并清空缓存
  if (/[?&]nosw=1/.test(location.search)) {
    try {
      if (navigator.serviceWorker && navigator.serviceWorker.getRegistrations) {
        navigator.serviceWorker.getRegistrations().then(function (rs) {
          rs.forEach(function (r) { r.unregister(); });
        });
      }
      if (window.caches && caches.keys) {
        caches.keys().then(function (ks) {
          ks.forEach(function (k) { caches.delete(k); });
        });
      }
    } catch (e) {}
  }

  window.__MJ_IS_IOS = isIOS;
  window.__MJ_IS_ANDROID = isAndroid;
  window.__MJ_STANDALONE = standalone;
  window.__MJ_IN_APP = /MicroMessenger|Weibo|DingTalk|AlipayClient/i.test(ua) || ua.indexOf('QQ/') !== -1;

  // 提前接住安装事件（它可能比下载页脚本更早触发）
  window.__MJ_BIP = null;
  window.addEventListener('beforeinstallprompt', function (e) {
    e.preventDefault();
    window.__MJ_BIP = e;
    document.documentElement.classList.add('mj-can-install');
  });
  window.addEventListener('appinstalled', function () {
    document.documentElement.classList.add('mj-installed');
  });

  if (showLanding) document.documentElement.classList.add('landing');
})();
</script>
`;

/* ---------- 6) 下载页交互（放 body 末尾） ---------- */
const landingJs = `
<script>
(function () {
  if (!document.documentElement.classList.contains('landing')) return;

  var isIOS = window.__MJ_IS_IOS;
  var isAndroid = window.__MJ_IS_ANDROID;
  var inApp = window.__MJ_IN_APP;

  var btn = document.getElementById('dlInstall');
  var status = document.getElementById('dlStatus');
  var stepsBody = document.getElementById('dlStepsBody');
  var stepsTitle = document.getElementById('dlStepsTitle');
  var stepsCard = document.getElementById('dlSteps');
  var inAppCard = document.getElementById('dlInApp');
  var copyBtn = document.getElementById('dlCopy');
  var dlFile = document.getElementById('dlFile');
  var deferred = window.__MJ_BIP;

  // 按平台生成步骤（始终显示，不依赖安装事件）
  var steps;
  if (inApp) {
    stepsTitle.textContent = '先在浏览器里打开';
    steps = '<ol>' +
      '<li>点右上角 <b>···</b></li>' +
      '<li>选 <b>在浏览器打开</b></li>' +
      '<li>在 Chrome / Safari 里再点安装</li>' +
      '</ol>';
    inAppCard.style.display = '';
    status.textContent = '当前是微信/QQ 内置浏览器，无法安装';
    status.className = 'dl-status warn';
  } else if (isIOS) {
    stepsTitle.textContent = 'iPhone 安装步骤';
    steps = '<ol>' +
      '<li>点底部中间的 <b>分享</b> 按钮（方框带箭头）</li>' +
      '<li>下滑，选择 <b>添加到主屏幕</b></li>' +
      '<li>右上角点 <b>添加</b></li>' +
      '<li>回桌面就有了麻将图标</li>' +
      '</ol>';
    status.textContent = 'iOS 只能用「添加到主屏幕」，按下面 3 步即可';
  } else if (isAndroid) {
    stepsTitle.textContent = 'Android 安装步骤';
    steps = '<ol>' +
      '<li>点上面的 <b>安装到桌面</b> → 弹窗选 <b>安装</b></li>' +
      '<li>没弹窗就点浏览器右上角 <b>⋮</b> 菜单</li>' +
      '<li>选 <b>安装应用</b> 或 <b>添加到主屏幕</b></li>' +
      '<li>回桌面就有了麻将图标</li>' +
      '</ol>';
    status.textContent = '点上面的按钮；没弹窗就按下面 3 步操作';
  } else {
    stepsTitle.textContent = '安装到桌面（电脑）';
    steps = '<ol>' +
      '<li>地址栏右侧点 <b>安装</b> 图标</li>' +
      '<li>或菜单 → <b>应用</b> → <b>安装此站点</b></li>' +
      '</ol>';
  }
  stepsBody.innerHTML = steps;

  // 复制网址（微信里用得上）
  copyBtn.addEventListener('click', function (ev) {
    ev.preventDefault();
    var url = location.origin + location.pathname;
    function done() { status.textContent = '网址已复制，粘贴到 Chrome / Safari 打开'; status.className = 'dl-status'; }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(url).then(done, function () { prompt('复制这个网址：', url); });
    } else {
      prompt('复制这个网址：', url);
    }
  });

  // 安装按钮
  btn.addEventListener('click', function () {
    if (inApp) {
      status.textContent = '微信/QQ 里不能安装：点右上角 ··· → 在浏览器打开';
      status.className = 'dl-status warn';
      inAppCard.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }
    if (deferred) {
      status.textContent = '正在唤起安装窗口…';
      status.className = 'dl-status';
      deferred.prompt();
      deferred.userChoice.then(function (r) {
        if (r.outcome === 'accepted') {
          status.textContent = '正在安装，稍等，回桌面就能看到图标';
        } else {
          status.textContent = '已取消安装；也可以按下面的步骤手动添加';
          status.className = 'dl-status warn';
        }
        deferred = null;
        window.__MJ_BIP = null;
      });
      return;
    }
    // 没有安装事件：给明确反馈 + 滚到步骤
    status.textContent = isIOS
      ? 'iOS 请点底部「分享」→「添加到主屏幕」'
      : (isAndroid ? '没弹出安装窗口，请按下面步骤手动添加' : '请用浏览器菜单里的「安装」');
    status.className = 'dl-status warn';
    stepsCard.scrollIntoView({ behavior: 'smooth', block: 'center' });
  });

  // 安装事件晚到时，更新提示
  window.addEventListener('beforeinstallprompt', function (e) {
    e.preventDefault();
    deferred = e;
    window.__MJ_BIP = e;
    if (!inApp) { status.textContent = '可以安装了，点上面的按钮'; status.className = 'dl-status'; }
  });
  window.addEventListener('appinstalled', function () {
    status.textContent = '安装完成！回桌面看看麻将图标';
    status.className = 'dl-status';
    btn.disabled = true;
    btn.textContent = '已 安 装';
  });

  // APK 不在仓库里就隐藏按钮（免得点出 404）
  var apkBtn = document.getElementById('dlApk');
  fetch('app-debug.apk', { method: 'HEAD' })
    .then(function (r) { if (!r.ok) throw new Error('404'); })
    .catch(function () {
      if (apkBtn) {
        apkBtn.style.display = 'none';
        var tip = apkBtn.nextElementSibling;
        if (tip) tip.textContent = 'APK 还没上传到仓库，先用下面的网页版或直接安装到桌面。';
      }
    });

  // 下载按钮：用 Blob 生成完整单文件，文件名固定
  dlFile.setAttribute('href', '#');
  dlFile.addEventListener('click', function (ev) {
    ev.preventDefault();
    var html = '<!DOCTYPE html>' + String.fromCharCode(10) + document.documentElement.outerHTML;
    var blob = new Blob([html], { type: 'text/html;charset=utf-8' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = '双人麻将.html';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 5000);
    status.textContent = '已开始下载「双人麻将.html」';
    status.className = 'dl-status';
    setTimeout(function () {
      status.textContent = '下载后请用 Firefox / 夸克 / Edge 打开（Chrome 不允许打开本地网页）';
      status.className = 'dl-status warn';
    }, 2500);
  });

  // 装成 App 之后，Service Worker 就绪时再踢一次安装判定
  if (navigator.serviceWorker && navigator.serviceWorker.ready) {
    navigator.serviceWorker.ready.then(function (reg) {
      if (reg && reg.update) reg.update();
    }).catch(function () {});
  }
})();
</script>
`;

/* ---------- 7) 组装 ---------- */
html = html.replace('</head>', landingCss + decideScript + '</head>');
const rotateHintHtml = `
<div id="rotateHint">
  <div class="rh-icon">📱</div>
  <div class="rh-title">请把手机横过来</div>
  <div class="rh-text">这个游戏是横屏操作的<br />横过来后会自动进入牌桌</div>
  <button class="rh-btn" id="rhIgnore">继续竖屏游玩</button>
</div>
`;
html = html.replace(/<body>/, '<body>\n' + landingHtml + rotateHintHtml);
const rotateJs = `
<script>
(function () {
  var ua = navigator.userAgent || '';
  var mobile = /Android|iPhone|iPad|iPod|Mobile/i.test(ua);
  var isFile = location.protocol === 'file:';
  var standalone = (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) ||
    window.navigator.standalone === true;
  var force = /[?&]rotate=1/.test(location.search);
  // 只在「打开本地文件」或「装成 App」时强制横屏；网页版桌面/手机不受影响
  if (!(mobile && (isFile || standalone)) && !force) return;

  var body = document.body;
  function check() {
    if (body.classList.contains('mj-ignore-rotate')) return;
    var portrait = window.innerHeight > window.innerWidth;
    body.classList.toggle('mj-need-landscape', portrait);
  }
  check();
  window.addEventListener('resize', check);
  window.addEventListener('orientationchange', function () { setTimeout(check, 120); });
  var btn = document.getElementById('rhIgnore');
  if (btn) btn.addEventListener('click', function () {
    body.classList.add('mj-ignore-rotate');
    body.classList.remove('mj-need-landscape');
  });
})();
</script>
`;
html = html.replace('</body>', landingJs + rotateJs + '\n</body>');

const out = '上传这个-index.html';
fs.writeFileSync(path.join(ROOT, out), html, 'utf8');
console.log(out + ' 已生成：' + Math.round(fs.statSync(path.join(ROOT, out)).size / 1024) + ' KB');

// 纯游戏单文件（给手机当附件发）
let plain = read(fs.existsSync(path.join(ROOT, '游戏源.html')) ? '游戏源.html' : 'index.html');
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
