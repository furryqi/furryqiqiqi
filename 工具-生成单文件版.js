const fs = require('fs');
const path = require('path');
const ROOT = __dirname;
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

function build(opts) {
  let html = read('index.html');

  // 内联 CSS
  html = html.replace(/<link rel="stylesheet" href="([^"?]+)(\?[^"]*)?"\s*\/?>/g, (m, href) => (
    '<style>\n/* ' + href + ' */\n' + read(href) + '\n</style>'
  ));

  // 内联 JS（保持 engine → game → ai → ui 顺序）
  html = html.replace(/<script src="([^"?]+)(\?[^"]*)?"><\/script>/g, (m, src) => (
    '<script>\n/* ' + src + ' */\n' + read(src) + '\n</script>'
  ));

  if (!opts.keepPwa) {
    html = html.replace(/<link rel="manifest"[^>]*>\n?/g, '');
    html = html.split("navigator.serviceWorker.register('sw.js')")
      .join("void 0 /* 单文件版不注册 SW */");
  }

  fs.writeFileSync(path.join(ROOT, opts.out), html, 'utf8');
  const kb = Math.round(fs.statSync(path.join(ROOT, opts.out)).size / 1024);
  console.log((opts.out + '                                   ').slice(0, 34) + kb + ' KB');
}

// 1) 独立单文件（发给手机、直接双击打开）
build({ out: '双人麻将-单文件版.html', keepPwa: false });

// 2) 直接替换仓库 index.html 用（保留 manifest + sw，装到桌面后可离线）
build({ out: '上传这个-index.html', keepPwa: true });
