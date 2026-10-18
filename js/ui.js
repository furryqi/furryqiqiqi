/* ============================================================================
 *  双人麻将 · 界面逻辑  ui.js
 * ==========================================================================*/
(function () {
  'use strict';
  const E = window.MJEngine;
  const G = window.MJGame;
  const A = window.MJAI;
  const HUMAN = 0, AI = 1;

  const $ = (id) => document.getElementById(id);

  const game = new G.Game({
    onChange: () => { render(); scheduleAI(); },
  });

  const AI_DELAY = 2000;       // 电脑每步固定 2 秒
  let aiTimer = null;
  let busy = false;
  let resultShown = false;
  let riichiPick = null;       // 进入「选宣言牌」状态时存放可打的牌
  let tianhuRound = -1;        // 哪一局走了「天胡延迟」
  let tianhuDeadline = 0;      // 延迟结束时间戳

  /* ------------------------------------------------------------ 定时驱动 AI */
  function scheduleAI() {
    clearTimeout(aiTimer);
    const st = game.state;
    if (!st || st.result) return;
    if (game.opts.testMode) {
      // 测试模式：AI 不动，但自己报听后要继续自动摸切，直到胡牌或摸完牌墙
      const autoRiichi = st.phase === 'discard' && st.turn === HUMAN &&
        st.players[HUMAN].riichi && !st.selfWin && st.drawn != null;
      if (autoRiichi) aiTimer = setTimeout(aiStep, AI_DELAY);
      return;
    }
    const needAI = (st.phase === 'claim' && st.claim && st.claim.player === AI) ||
      (st.phase === 'discard' && st.turn === AI) ||
      (st.phase === 'discard' && st.turn === HUMAN && st.players[HUMAN].riichi && !st.selfWin && st.drawn != null);
    if (!needAI) return;
    aiTimer = setTimeout(aiStep, AI_DELAY);   // 电脑出牌/鸣牌的固定思考时间
  }

  function aiStep() {
    const st = game.state;
    if (!st || st.result || busy) return;
    // 发牌/理牌动画还没播完，先不要动（否则动画中途手牌会变，看起来像重播一遍）
    if (dealAnim) { scheduleAI(); return; }
    busy = true;
    try {
      if (st.phase === 'claim' && st.claim && st.claim.player === AI) {
        const d = A.decideClaim(game);
        if (!game.claim(d.action, d.chiPair)) game.claim('pass');
        return;
      }
      if (st.phase === 'discard' && st.turn === AI) {
        if (st.selfWin) { game.declareSelfWin(AI); return; }
        const k = A.decideSelfKan(game, AI);
        if (k) { game.selfKan(AI, k.type, k.tile); return; }
        if (A.maybeRiichi(game, AI)) return;   // 已经宣言报听并打出宣言牌
        const idx = A.decideDiscard(game, AI);
        game.discard(AI, idx);
        return;
      }
      if (st.phase === 'discard' && st.turn === HUMAN && st.players[HUMAN].riichi && !st.selfWin) {
        const p = st.players[HUMAN];
        const i = p.hand.indexOf(st.drawn);
        if (i >= 0) game.discard(HUMAN, i);
      }
    } finally {
      busy = false;
    }
  }

  /* ------------------------------------------------------------ 牌面渲染 */
  // 牌面：万字=上数字下「萬」，字牌=单字，白板=空框，花牌=圆章
  // 手牌展示排序：癞子放最左边，其余从小到大
  function wildFirst(t) { return t === E.WILD ? -1 : t; }
  function sortedTiles(arr) { return arr.slice().sort((a, b) => wildFirst(a) - wildFirst(b)); }
  function sortedObjs(arr) { return arr.slice().sort((a, b) => wildFirst(a.t) - wildFirst(b.t)); }

  // 分数 / 番数显示：无穷大显示成 ∞
  function fmtScore(n) {
    return (typeof n === 'number' && !isFinite(n)) ? '∞' : n;
  }
  function fmtFan(n) {
    return (typeof n === 'number' && !isFinite(n)) ? '∞' : n;
  }

  function tileEl(t, cls) {
    const d = document.createElement('div');
    d.className = 'tile' + (cls ? ' ' + cls : '');
    if (t === E.WILD) {
      d.classList.add('joker');
      d.innerHTML = '<span class="jz">癞</span><span class="wtag">万能</span>';
    } else if (t < 9) {
      d.innerHTML = '<span class="rank">' + E.CN_NUM[t] + '</span><span class="suit">萬</span>';
    } else if (t < 16) {
      const idx = t - 9;
      d.classList.add('h' + idx);
      if (idx !== 6) d.innerHTML = '<span class="honor">' + E.CN_HONOR[idx] + '</span>';
    } else {
      d.classList.add('flower', t - 16 < 4 ? 'season' : 'plant');
      d.innerHTML = '<span class="fl">' + E.CN_FLOWER[t - 16] + '</span>';
    }
    return d;
  }

  function meldEl(m, size, reveal) {
    const cls = size === true ? 'small' : (typeof size === 'string' ? size : '');
    const box = document.createElement('div');
    box.className = 'meld' + (m.kind === 'ankan' ? ' concealed' : '');
    if (m.kind === 'ankan' && !reveal) {
      const w = cls === 'tiny' ? 20 : 26;
      const h = cls === 'tiny' ? 28 : 36;
      for (let i = 0; i < 4; i++) {
        const b = document.createElement('div');
        b.className = 'back';
        if (cls) { b.style.width = w + 'px'; b.style.height = h + 'px'; }
        box.appendChild(b);
      }
      return box;
    }
    m.tiles.forEach((t) => box.appendChild(tileEl(t, cls)));
    if (m.kind === 'ankan') box.classList.add('ankan-open');
    return box;
  }

  let lastDropKey = null;
  // 开局发牌动画：4 张 4 张地进场，结束后排序
  let dealAnim = null;        // { round, n, shown, order, phase }
  let lastDealRound = -1;
  function beginDeal(st) {
    if (!document.body || !document.createElement) return;   // 无 DOM（测试环境）直接跳过
    const hand = st.players[HUMAN].hand;
    const n = hand.length;
    if (n < 4) return;
    // 庄家 14 张时，最后摸进来的那张不参与理牌
    let extra = -1;
    if (n % 3 === 2 && st.drawn != null) {
      for (let i = n - 1; i >= 0; i--) if (hand[i] === st.drawn) { extra = i; break; }
    }
    const order = hand.map((t, i) => i).filter((i) => i !== extra);
    for (let i = order.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const tmp = order[i]; order[i] = order[j]; order[j] = tmp;
    }
    dealAnim = {
      round: st.seq != null ? st.seq : st.roundNo, n: order.length,
      shown: 0, order: order, extra: extra, phase: 'dealing',
    };
    const tick = () => {
      if (!dealAnim || dealAnim.round !== (st.seq != null ? st.seq : st.roundNo)) return;
      dealAnim.shown = Math.min(dealAnim.n, dealAnim.shown + 3);
      if (dealAnim.shown >= dealAnim.n) {
        // 13 张到手 -> 水平平移到各自排序后的位置
        dealAnim.phase = 'sliding';
        render();
        setTimeout(() => {
          if (!dealAnim) return;
          if (dealAnim.extra >= 0) {
            dealAnim.phase = 'extra';        // 理完牌，最后一张落下
            render();
            setTimeout(() => { if (dealAnim) { dealAnim = null; render(); } }, 420);
          } else {
            dealAnim = null;
            render();
          }
        }, 1300);
        return;
      }
      render();
      setTimeout(tick, 300);        // 每批之间的间隔（放慢）
    };
    setTimeout(tick, 220);          // 第一批的等待
  }
  function dealingNow() { return !!dealAnim; }

  function fillHand(el, p, isHuman) {
    el.innerHTML = '';
    const st = game.state;
    if (!isHuman) {
      // 开局发牌动画中：对手一点点亮出牌背（测试模式没有对手，不放动画）
      if (dealAnim && dealAnim.phase === 'dealing') {
        if (game.opts.testMode) { el.innerHTML = ''; return; }
        const shown = Math.min(dealAnim.shown, 13);
        for (let k = 0; k < shown; k++) {
          const b = document.createElement('div');
          b.className = 'back';
          el.appendChild(b);
        }
        return;
      }
      // 透视模式；报听亮牌默认关闭，需要在设置里勾选「报听看牌」
      const riichiReveal = game.opts.revealOnRiichi === true &&
        game.state.players[HUMAN] && game.state.players[HUMAN].riichi;
      // 只有「查看牌桌」（结算面板收起、且已经弹过结算）时才亮牌；胡牌那一刻仍然盖着
      const overReveal = !!(game.state.result && resultShown && $('modal') && $('modal').hidden);
      // 电脑摸牌 / 电脑胡牌时，那张牌单独放在摸牌位
      const aiWon = !!st.result && st.result.winner === AI;
      const oppDrawn = st.drawn != null && (st.result ? aiWon : st.turn === AI);
      if (game.opts.peekMode || riichiReveal || overReveal) {
        const list = sortedTiles(p.hand);
        if (oppDrawn) {
          for (let k = list.length - 1; k >= 0; k--) {
            if (list[k] === st.drawn) { list.push(list.splice(k, 1)[0]); break; }
          }
        }
        list.forEach((t, k) => {
          const cls = 'peek' + (oppDrawn && k === list.length - 1 ? ' drawn' : '');
          el.appendChild(tileEl(t, cls));
        });
        return;
      }
      const n = p.hand.length;
      for (let i = 0; i < n; i++) {
        const b = document.createElement('div');
        // 电脑摸牌时，摸到的那张和原有手牌隔开一点
        b.className = 'back' + (oppDrawn && i === n - 1 ? ' drawn' : '');
        el.appendChild(b);
      }
      return;
    }
    // 排序阶段：每张牌从「发牌时的位置」水平滑到「排序后的位置」
    if (dealAnim && dealAnim.phase === 'sliding') {
      const slotOf = {};
      dealAnim.order.forEach((idx, k) => { slotOf[idx] = k; });
      const list = sortedObjs(dealAnim.order.map((i) => ({ t: p.hand[i], i: i })));
      const STEP = 56;                        // 牌宽 54 + 间距 2
      list.forEach((o, d) => {
        const el2 = tileEl(o.t, 'slidein');
        el2.style.setProperty('--dx', ((slotOf[o.i] - d) * STEP) + 'px');
        el2.style.zIndex = String(30 - Math.abs(slotOf[o.i] - d));
        el.appendChild(el2);
      });
      return;
    }

    // 理牌结束：最后一张（庄家摸的）才落下
    if (dealAnim && dealAnim.phase === 'extra') {
      const list = sortedObjs(dealAnim.order.map((i) => ({ t: p.hand[i], i: i })));
      list.forEach((o) => el.appendChild(tileEl(o.t, '')));
      if (dealAnim.extra >= 0) {
        el.appendChild(tileEl(p.hand[dealAnim.extra], 'drop drawn'));
        // 记下这次已经播过落牌动画，下一次正常渲染不要重播
        const dcount = st.players.reduce((a, q) => a + q.discards.length, 0);
        lastDropKey = st.round + '|' + st.turn + '|' + dcount + '|' + p.hand.length + '|' + st.drawn;
      }
      return;
    }

    // 开局发牌动画中：只显示到手的牌（未排序）
    if (dealAnim && dealAnim.phase === 'dealing') {
      const shown = dealAnim.shown;
      const from = Math.max(0, shown - 3);          // 只有最新落下的 3 张做落牌动画
      dealAnim.order.slice(0, shown).forEach((i, k) => {
        const t = p.hand[i];
        if (t != null) el.appendChild(tileEl(t, k >= from ? 'drop' : ''));
      });
      return;
    }

    const riichiLocked = !!(p.riichi || st.players[HUMAN].riichi);
    // 报听中手牌锁定；但如果摸到了能胡的牌，允许把这张打出去（见逃）
    const canDiscard = st.phase === 'discard' && st.turn === HUMAN && !st.claim &&
      !st.result && !dealingNow() && (!riichiLocked || !!st.selfWin);

    const order = sortedObjs(p.hand.map((t, i) => ({ t: t, i: i })));
    // 轮到自己在打牌时就显示摸牌位；一局结束时，只有自己胡了才显示（那张就是胡的牌）
    const humanWon = !!st.result && st.result.winner === HUMAN;
    const drawnShown = st.drawn != null && (st.result ? humanWon : st.turn === HUMAN);
    if (drawnShown) {
      let di = -1;
      for (let k = order.length - 1; k >= 0; k--) if (order[k].t === st.drawn) { di = k; break; }
      if (di >= 0) { const x = order.splice(di, 1)[0]; order.push(x); }
    }
    order.forEach((o, k) => {
      const isDrawn = drawnShown && k === order.length - 1 && o.t === st.drawn;
      let extra = '';
      let pickable = false;
      if (riichiPick) {
        pickable = riichiPick.some((x) => x.tile === o.t);
        const info = riichiPick.find((x) => x.tile === o.t);
        extra = pickable ? (' pick' + (info && info.best ? ' pick-best' : '')) : ' dim';
      }
      // 报听后手牌压暗；但刚摸到的那张保持正常亮度，能胡 / 一局结束时整手牌也恢复亮度
      const locked = (st.players[HUMAN].riichi || p.riichi) && !st.selfWin && !st.result;
      // 只有「真的刚摸到」才播放下落动画（同一张牌不重复播）
      let drop = false;
      if (isDrawn) {
        const st2 = game.state;
        const dcount = st2.players.reduce((a, q) => a + q.discards.length, 0);
        const key = st2.round + '|' + st2.turn + '|' + dcount + '|' + p.hand.length + '|' + st2.drawn;
        if (key !== lastDropKey) { lastDropKey = key; drop = true; }
      }
      // 报听锁定后只有刚摸的那张可以点（胡了也可以选择打出去）
      const clickable = canDiscard && (!riichiLocked || isDrawn);
      const cls = ((isDrawn ? ' drawn' : '') + (drop ? ' drop' : '') + (clickable ? '' : ' disabled') +
        (locked && !isDrawn ? ' riichi-dim' : '') + extra).trim();
      const el2 = tileEl(o.t, cls);
      if (clickable) {
        if (riichiPick && !pickable) {
          el2.addEventListener('click', () => { riichiPick = null; render(); });   // 点暗牌取消
        } else if (riichiPick && pickable) {
          el2.addEventListener('click', () => {
            if (busy) return;
            const idx = o.i;
            riichiPick = null;
            hideTilePreview();
            game.riichi(HUMAN, idx);
          });
          el2.addEventListener('mouseenter', () => showTilePreview(el2, o));
          el2.addEventListener('mouseleave', hideTilePreview);
          el2.addEventListener('touchstart', () => showTilePreview(el2, o), { passive: true });
        } else {
          el2.addEventListener('click', () => {
            if (busy) return;
            game.discard(HUMAN, o.i);
          });
        }
      }
      el.appendChild(el2);
    });
  }

  /* ------------------------------------------------- 听牌候选：番数×剩余张数 */
  // 已现的牌（牌河 + 副露 + 自己手牌）
  function seenCounts() {
    const st = game.state;
    const seen = {};
    st.players.forEach((q) => {
      (q.discards || []).forEach((t) => { seen[t] = (seen[t] || 0) + 1; });
      (q.jokerDiscards || []).forEach((t) => { seen[t] = (seen[t] || 0) + 1; });
      (q.melds || []).forEach((m) => m.tiles.forEach((t) => { seen[t] = (seen[t] || 0) + 1; }));
    });
    st.players[HUMAN].hand.forEach((t) => { if (t < 16) seen[t] = (seen[t] || 0) + 1; });
    return seen;
  }

  function buildRiichiPick() {
    const st = game.state;
    const p = st.players[HUMAN];
    const seen = seenCounts();
    const opts = game.riichiOptions(HUMAN).map((o) => {
      const rest = p.hand.slice();
      rest.splice(rest.indexOf(o.tile), 1);
      const waits = E.waits(rest, p.melds);
      let score = 0;
      const detail = waits.map((w) => {
        const res = E.evaluateWin(rest.concat([w]), p.melds, {
          winTile: w, tsumo: true, baoting: true, flowerCount: (p.flowers || []).length,
        });
        const left = Math.max(0, 4 - (seen[w] || 0));
        const ok = res.fan >= (res.minFan != null ? res.minFan : E.getMinFan());
        if (ok) score += res.fan * left;
        return { tile: w, fan: res.fan, left: left, ok: ok };
      });

      // 癞子当胡牌张：只要听得见，摸到癞子也能胡（牌墙里还有癞子才算）
      if (waits.length) {
        const wildTotal = game.opts.jokerCount == null ? 4 : game.opts.jokerCount;
        const wildLeft = Math.max(0, wildTotal - (seen[E.WILD] || 0));
        if (wildLeft > 0) {
          const rw = E.evaluateWin(rest.concat([E.WILD]), p.melds, {
            winTile: E.WILD, tsumo: true, baoting: true, flowerCount: (p.flowers || []).length,
          });
          const ok = rw.fan >= (rw.minFan != null ? rw.minFan : E.getMinFan());
          if (ok) score += rw.fan * wildLeft;
          detail.push({ tile: E.WILD, fan: rw.fan, left: wildLeft, ok: ok });
        }
      }
      return { tile: o.tile, score: score, detail: detail };
    });
    let best = -1;
    opts.forEach((o) => { if (o.score > best) best = o.score; });
    opts.forEach((o) => { o.best = o.score === best && best > 0; });
    return opts;
  }

  /* ------------------------------------------------- 听牌选牌时的悬停预览 */
  let previewEl = null;
  function hideTilePreview() {
    if (previewEl && previewEl.parentNode) previewEl.parentNode.removeChild(previewEl);
    previewEl = null;
  }

  function showTilePreview(anchor, o) {
    hideTilePreview();
    const info = (riichiPick || []).find((x) => x.tile === o.t);
    if (!info) return;

    const box = document.createElement('div');
    box.className = 'tileprev';

    // 只保留「牌 / 剩余张数 / 番数」三列；不够起胡番的番数标红
    info.detail.forEach((d) => {
      const row = document.createElement('div');
      row.className = 'tp-row';
      row.innerHTML = '<span class="tp-tile">' + E.tileLabel(d.tile) + '</span>' +
        '<span class="tp-left">剩 ' + d.left + ' 张</span>' +
        '<span class="tp-fan' + (d.ok ? '' : ' low') + '">' + d.fan + ' 番</span>';
      box.appendChild(row);
    });

    document.body.appendChild(box);
    const r = anchor.getBoundingClientRect();
    const bw = box.getBoundingClientRect().width;
    let left = r.left + r.width / 2 - bw / 2;
    left = Math.max(8, Math.min(window.innerWidth - bw - 8, left));
    const top = Math.max(8, r.top - box.getBoundingClientRect().height - 10);
    box.style.left = left + 'px';
    box.style.top = top + 'px';
    previewEl = box;
  }

  /* -------------------------------------------------- 花牌区 & 补花动画 */
  let flowerAnimating = false;
  let flowerRoundNo = -1;
  const flowerSeen = [0, 0];

  function flowerEl(pi) { return pi === 0 ? $('flowersMe') : $('flowersOpp'); }

  function fillFlowers(pi) {
    const arr = game.state.players[pi].flowers || [];
    const el = flowerEl(pi);
    if (!arr.length) el.classList.remove('showing');
    el.innerHTML = '';
    for (let i = 0; i < arr.length; i++) {
      const t = tileEl(arr[i], 'small' + (i >= flowerSeen[pi] ? ' land' : ''));
      el.appendChild(t);
    }
    flowerSeen[pi] = arr.length;
  }

  // 引擎摸到花牌会停在 phase === 'flower'；这里播完动画再让它继续摸下一张，
  // 所以连摸两张花牌时，第一张落进花牌区之后才会出现第二张。
  function maybeFlowerAnim() {
    const st = game.state;
    if (!st || st.phase !== 'flower' || !st.pendingFlower || flowerAnimating) return;
    const f = st.pendingFlower;
    flowerAnimating = true;
    flyFlower(f.player, f.tile, () => {
      flowerAnimating = false;
      game.resolveFlower();
    });
  }

  // 花牌先在摸牌位置停一下，再飘进花牌区
  function flyFlower(pi, tile, done) {
    const anchorEl = pi === 0 ? $('handMe') : $('handOpp');
    const targetEl = flowerEl(pi);
    if (!anchorEl || !targetEl || !document.body ||
        typeof anchorEl.getBoundingClientRect !== 'function' ||
        typeof targetEl.getBoundingClientRect !== 'function') {
      done();
      return;
    }
    // 以「手里最后一张牌」为准，定位真正的摸牌位（容器可能被换行拉高）
    const kids = anchorEl.children;
    const lastTile = kids && kids.length ? kids[kids.length - 1] : null;
    const ar = (lastTile && typeof lastTile.getBoundingClientRect === 'function')
      ? lastTile.getBoundingClientRect()
      : anchorEl.getBoundingClientRect();
    const b = targetEl.getBoundingClientRect();
    const ghost = tileEl(tile, 'small ghost');
    const x = ar.right + 3;
    const y = ar.top - 22;
    ghost.style.left = x + 'px';
    ghost.style.top = y + 'px';
    document.body.appendChild(ghost);

    const HOLD = 520;
    const FLY = 480;
    setTimeout(() => {
      const tx = (b.left + b.width / 2) - (x + 17);
      const ty = (b.top + b.height / 2) - (y + 23);
      ghost.style.transform = 'translate(' + tx + 'px,' + ty + 'px) scale(.9)';
      ghost.style.opacity = '.92';
      setTimeout(() => {
        ghost.remove();
        done();
      }, FLY);
    }, HOLD);
  }

  function fillMelds(el, p, reveal) {
    el.innerHTML = '';
    p.melds.forEach((m) => el.appendChild(meldEl(m, true, reveal)));
  }

  // 听牌提示：13 张时算出在等哪些牌，并标出剩余张数
  function renderWaits() {
    const box = $('waitsMe');
    const st = game.state;
    if (!box) return;
    const p = st.players[HUMAN];
    const need = 4 - p.melds.length;
    const hand = p.hand.slice();
    if (st.result || st.phase === 'flower') {
      box.hidden = true;
      box.innerHTML = '';
      return;
    }
    // 13 张（等牌中）直接用；14 张（自己回合）按「打掉摸到的那张」后的手牌算
    let probe = hand;
    if (hand.length === 3 * need + 2) {
      probe = hand.slice();
      const di = st.drawn != null ? probe.lastIndexOf(st.drawn) : -1;
      if (di >= 0) probe.splice(di, 1); else probe.pop();
    } else if (hand.length !== 3 * need + 1) {
      box.hidden = true;
      box.innerHTML = '';
      return;
    }
    const w = E.waits(probe, p.melds);
    if (!w.length) {
      box.hidden = true;
      box.innerHTML = '';
      return;
    }
    // 计算每张牌还剩几张（扣除牌河、副露、自己的手牌）
    const seen = {};
    for (let i = 0; i < 16; i++) seen[i] = 0;
    st.players.forEach((q) => {
      q.discards.forEach((t) => { seen[t] = (seen[t] || 0) + 1; });
      (q.jokerDiscards || []).forEach((t) => { seen[t] = (seen[t] || 0) + 1; });
      (q.melds || []).forEach((m) => m.tiles.forEach((t) => { seen[t] = (seen[t] || 0) + 1; }));
    });
    hand.forEach((t) => { if (t < 16) seen[t] = (seen[t] || 0) + 1; });

    box.hidden = false;
    box.innerHTML = '';
    // 右侧一个感叹号标记，鼠标移上去才显示在等哪些牌
    const mark = document.createElement('span');
    mark.className = 'waitmark';
    mark.textContent = '!';
    box.appendChild(mark);
    mark.addEventListener('mouseenter', () => showWaitsTip(mark, w, seen, probe));
    mark.addEventListener('mouseleave', () => {
      if (!mark.dataset.pinned) hideTilePreview();
    });
    // 触屏：点一下固定显示 / 再点关闭
    mark.addEventListener('click', (ev) => {
      ev.stopPropagation();
      if (mark.dataset.pinned) {
        delete mark.dataset.pinned;
        hideTilePreview();
        return;
      }
      mark.dataset.pinned = '1';
      showWaitsTip(mark, w, seen, probe);
    });
  }

  // 悬停感叹号：列出在等哪些牌 + 各剩几张
  function showWaitsTip(anchor, waits, seen, probe) {
    hideTilePreview();
    const st = game.state;
    const p = st.players[HUMAN];
    const box = document.createElement('div');
    box.className = 'tileprev';
    const base = (probe || p.hand).slice();
    let fanMax = 0;
    waits.forEach((t) => {
      const left = Math.max(0, 4 - (seen[t] || 0));
      const res = E.evaluateWin(base.concat([t]), p.melds, {
        winTile: t, tsumo: true, baoting: true, flowerCount: (p.flowers || []).length,
      });
      fanMax = Math.max(fanMax, res.fan);
      const ok = res.fan >= (res.minFan != null ? res.minFan : E.getMinFan());
      const row = document.createElement('div');
      row.className = 'tp-row';
      row.innerHTML = '<span class="tp-tile">' + E.tileLabel(t) + '</span>' +
        '<span class="tp-left">剩 ' + left + ' 张</span>' +
        '<span class="tp-fan' + (ok ? '' : ' low') + '">' + res.fan + ' 番</span>';
      box.appendChild(row);
    });

    // 癞子也能当胡牌张（牌墙里还有癞子才列）
    if (waits.length) {
      const jokerTotal = game.opts.jokerCount == null ? 4 : game.opts.jokerCount;
      let wildSeen = 0;
      st.players.forEach((q) => {
        (q.discards || []).concat(q.jokerDiscards || []).forEach((x) => { if (x === E.WILD) wildSeen++; });
        (q.melds || []).forEach((m) => m.tiles.forEach((x) => { if (x === E.WILD) wildSeen++; }));
      });
      (p.hand || []).forEach((x) => { if (x === E.WILD) wildSeen++; });
      const jokerLeft = Math.max(0, jokerTotal - wildSeen);
      if (jokerLeft > 0) {
        const rw = E.evaluateWin(base.concat([E.WILD]), p.melds, {
          winTile: E.WILD, tsumo: true, baoting: true, flowerCount: (p.flowers || []).length,
        });
        // 癞子当任意牌：番数取「其它等牌里最高的」与自身计算值的较大者
        const wildFan = Math.max(rw.fan, fanMax);
        const okw = wildFan >= (rw.minFan != null ? rw.minFan : E.getMinFan());
        const row = document.createElement('div');
        row.className = 'tp-row';
        row.innerHTML = '<span class="tp-tile">' + E.tileLabel(E.WILD) + '</span>' +
          '<span class="tp-left">剩 ' + jokerLeft + ' 张</span>' +
          '<span class="tp-fan' + (okw ? '' : ' low') + '">' + wildFan + ' 番</span>';
        box.appendChild(row);
      }
    }
    document.body.appendChild(box);
    const r = anchor.getBoundingClientRect();
    const bw = box.getBoundingClientRect().width;
    let left = r.right - bw;
    left = Math.max(8, Math.min(window.innerWidth - bw - 8, left));
    const top = Math.max(8, r.top - box.getBoundingClientRect().height - 12);
    box.style.left = left + 'px';
    box.style.top = top + 'px';
    previewEl = box;
  }

  // 打出的癞子单独摆在自己的癞子区
  function fillJokerTray(pi) {
    const p = game.state.players[pi];
    const el = pi === 0 ? $('jokerMe') : $('jokerOpp');
    const arr = p.jokerDiscards || [];
    el.hidden = arr.length === 0;
    el.innerHTML = '';
    arr.forEach((t) => el.appendChild(tileEl(t, 'small')));
  }

  function fillRiver(el, p) {
    el.innerHTML = '';
    p.discards.forEach((t, i) => {
      const last = (i === p.discards.length - 1) &&
        game.state.lastDiscard && game.state.lastDiscard.player === (p === game.state.players[1] ? 1 : 0);
      el.appendChild(tileEl(t, 'small' + (last ? ' last' : '')));
    });
  }

  /* ------------------------------------------------------------ 主渲染 */
  let kanTimer = null;
  // 加杠后停顿 0.7 秒再摸牌
  function scheduleKanDraw(st) {
    if (!st || st.pendingKanDraw == null || kanTimer) return;
    kanTimer = setTimeout(() => {
      kanTimer = null;
      if (game.state && game.state.pendingKanDraw != null) game.finishKanDraw();
    }, 700);
  }

  function render() {
    const st = game.state;
    if (!st) return;
    scheduleKanDraw(st);
    // 新一局：先播发牌动画（有结算时直接跳过）
    const dealKey = st.seq != null ? st.seq : st.roundNo;
    if (dealKey !== lastDealRound) {
      lastDealRound = dealKey;
      if (!st.result && !game.over) beginDeal(st);
    }
    const sub = $('subInfo');
    if (sub) sub.textContent = '癞子万能 · 花牌补花 · ' + E.getMinFan() + ' 番起胡';
    const me = st.players[HUMAN], opp = st.players[AI];
    if (document.body && document.body.classList) {
      document.body.classList.toggle('test-mode', !!game.opts.testMode);
    }

    // 天胡：先在牌桌停留 3 秒再弹结算（停留期间比分也先不动）
    if (st.result && st.result.flags && st.result.flags.tianhu && !resultShown &&
        tianhuRound !== st.roundNo) {
      tianhuRound = st.roundNo;
      tianhuDeadline = Date.now() + 3000;
      setTimeout(() => render(), 3050);
    }

    if (st.roundNo !== flowerRoundNo) {      // 新一局：起手的花牌不播落位动画
      flowerRoundNo = st.roundNo;
      flowerSeen[0] = (me.flowers || []).length;
      flowerSeen[1] = (opp.flowers || []).length;
    }

    const maxR = (game.opts && game.opts.maxRounds) || 8;
    $('roundNo').textContent = '第 ' + st.roundNo + ' / ' + maxR + ' 局';
    $('dealerInfo').textContent = st.dealer === HUMAN ? '你坐庄' : '电脑坐庄';
    $('wallInfo').textContent = '牌墙 ' + st.wall.length + ' 张';
    const streak = (st.mulFlags && st.mulFlags.drawStreak) || 0;
    const si = $('streakInfo');
    si.hidden = streak <= 0;
    if (streak > 0) si.textContent = '连续流局 ' + streak + ' 局 ×' + Math.pow(2, streak);
    checkWallWarn(st);
    checkRiichiToast(st);
    checkMeldBanner(st);

    // 天胡停留的 3 秒里先显示结算前的比分，避免提前剧透
    const inTianhuPause = st.result && st.result.flags && st.result.flags.tianhu &&
      Date.now() < tianhuDeadline && st.result.scoreBefore;
    $('scoreMe').textContent = fmtScore(inTianhuPause ? st.result.scoreBefore[0] : me.score);
    $('scoreOpp').textContent = fmtScore(inTianhuPause ? st.result.scoreBefore[1] : opp.score);
    $('riichiMe').hidden = !me.riichi;
    $('riichiOpp').hidden = !opp.riichi;
    const jm = me.jokersDiscarded || 0, jo = opp.jokersDiscarded || 0;
    $('bonusMe').hidden = jm <= 0;
    if (jm > 0) $('bonusMe').textContent = '癞子 ×' + Math.pow(2, jm);
    $('bonusOpp').hidden = jo <= 0;
    if (jo > 0) $('bonusOpp').textContent = '癞子 ×' + Math.pow(2, jo);

    fillHand($('handMe'), me, true);
    fillHand($('handOpp'), opp, false);
    fillMelds($('meldsMe'), me, true);          // 自己的暗杠自己看得到
    fillMelds($('meldsOpp'), opp, !!(st.result && resultShown && $('modal') && $('modal').hidden));
    fillFlowers(0);
    fillFlowers(1);
    fillRiver($('riverMe'), me);
    fillRiver($('riverOpp'), opp);
    fillJokerTray(HUMAN);
    fillJokerTray(AI);
    renderWaits();

    $('hint').innerHTML = hintText();
    $('lastev').textContent = lastEventText();

    const isOver = !!st.result;
    const oppSeat = document.querySelector('.seat-opp');
    const meSeat = document.querySelector('.seat-me');
    if (oppSeat && meSeat) {
      oppSeat.classList.toggle('active', !isOver && st.turn === AI);
      meSeat.classList.toggle('active', !isOver && st.turn === HUMAN);
    }

    renderActs();
    renderStatus();
    maybeFlowerAnim();
    if (st.result) {
      // 天胡：停留期还没结束就先不弹
      const isTianhu = !!(st.result.flags && st.result.flags.tianhu);
      if (isTianhu && Date.now() < tianhuDeadline) return;
      if (!resultShown) {
        if (resultPending) return;                 // 横幅还在播，等它播完再弹结算
        // 和牌：先在胡牌者那一侧闪一个红色横幅，再弹结算
        if (st.result.type !== 'draw' && huToastRound !== st.roundNo) {
          huToastRound = st.roundNo;
          resultPending = true;
          const win = st.result.winner === HUMAN;
          showWinBanner(win, !!st.result.tsumo);
          setTimeout(() => {
            resultPending = false;
            if (game.state !== st) return;
            if (!resultShown) { resultShown = true; showResult(st.result); }
          }, 820);
          return;
        }
        resultShown = true;
        showResult(st.result);
      }
    } else {
      resultShown = false;
    }
  }

  function hintText() {
    const st = game.state;
    const me = st.players[HUMAN];
    if (st.result) return '';
    if (st.turn !== HUMAN || st.phase !== 'discard') return '';
    if (st.selfWin) {
      return '<b class="warn">可以自摸和牌！</b>';
    }
    if (st.drawn == null) return '';
    // 能成牌型但番数不够时，直接说明原因（摸到癞子常遇到）
    if (me.hand.length === 3 * (4 - me.melds.length) + 2) {
      const r = E.evaluateWin(me.hand, me.melds, {
        winTile: st.drawn, tsumo: true, baoting: me.riichi,
        flowerCount: (me.flowers || []).length,
      });
      const line = r && r.minFan != null ? r.minFan : E.getMinFan();
      if (r && r.fan > 0 && r.fan < line) {
        return '<b class="warn">可以和牌，但番数不足（' + r.fan + ' / ' + line + ' 番）</b>';
      }
    }
    return '';      // 「打出这张后听 xxx」的提示已按需求去掉
  }

  function lastEventText() {
    const st = game.state;
    if (st.result) {
      return st.result.type === 'draw' ? '本局流局' :
        (st.result.winner === HUMAN ? '你' : '电脑') + (st.result.tsumo ? ' 自摸' : ' 和牌');
    }
    const ev = st.lastEvent;
    if (!ev) return '';
    if (ev.type === 'discard') return (ev.player === HUMAN ? '你' : '电脑') + ' 打出 ' + E.tileLabel(ev.tile);
    if (ev.type === 'draw') return (ev.player === HUMAN ? '你' : '电脑') + ' 摸牌';
    return '';
  }

  function renderStatus() {
    const st = game.state;
    let s = '';
    if (st.result) s = '';
    else if (st.phase === 'claim' && st.claim && st.claim.player === HUMAN) s = '请选择：胡 / 杠 / 碰 / 吃 / 过';
    else if (st.phase === 'flower') s = '补花中…';
    else if (st.phase === 'claim') s = '电脑思考中…';
    else if (st.phase === 'discard' && st.turn === AI) s = '电脑思考中…';
    else if (dealingNow()) s = '发牌中…';
    else s = '轮到你出牌';
    if (game.state.result && game.state.result.flags && game.state.result.flags.tianhu) {
      $('status').textContent = '天胡！结算马上弹出…';
      return;
    }
    $('status').textContent = s;
  }

  /* ------------------------------------------------------------ 操作按钮 */
  function renderActs() {
    if (dealAnim) { $('acts').innerHTML = ''; return; }   // 发牌动画期间不显示按钮
    const st0 = game.state;
    if (st0 && st0.result && $('modal').hidden) {
      $('acts').innerHTML = '';
      const back = document.createElement('button');
      back.className = 'ghost';
      back.textContent = '查看结算';
      back.addEventListener('click', () => { showResult(st0.result, true); });
      $('acts').appendChild(back);
      const next = document.createElement('button');
      next.className = 'primary';
      next.textContent = game.over ? '再来一局' : '下一局';
      next.addEventListener('click', () => { $('modal').hidden = true; nextRound(); });
      $('acts').appendChild(next);
      return;
    }
    const st = game.state;
    const box = $('acts');
    box.innerHTML = '';
    if (st.result) return;
    const me = st.players[HUMAN];

    const btn = (label, cls, fn) => {
      const b = document.createElement('button');
      b.textContent = label;
      b.className = cls;
      b.addEventListener('click', () => { if (!busy) fn(); });
      box.appendChild(b);
      return b;
    };

    // 鸣牌（胡 > 杠 > 碰 > 吃 > 过）
    if (st.phase === 'claim' && st.claim && st.claim.player === HUMAN) {
      const o = st.claim.options;
      if (o.hu) btn('胡', 'hu', () => game.claim('hu'));
      if (o.kan) btn('杠', 'act', () => game.claim('kan'));
      if (o.pon) btn('碰', 'act', () => game.claim('pon'));
      if (o.chi && o.chi.length) {
        o.chi.forEach((pair) => {
          const all = pair.concat([st.claim.tile]).sort((a, b) => a - b);
          const label = '吃 ' + all.map(E.tileShort).join('');
          btn(label, 'act', () => game.claim('chi', pair));
        });
      }
      btn('过', 'pass', () => game.claim('pass'));
      return;
    }

    if (st.phase === 'discard' && st.turn === HUMAN) {
      if (st.selfWin) btn('胡（自摸）', 'hu', () => game.declareSelfWin(HUMAN));
      const kans = game.canSelfKan(HUMAN);
      kans.forEach((k) => {
        const label = (k.type === 'ankan' ? '暗杠 ' : '加杠 ') + E.tileLabel(k.tile);
        btn(label, 'act', () => game.selfKan(HUMAN, k.type, k.tile));
      });
      if (game.canRiichi(HUMAN)) {
        btn(riichiPick ? '取消听牌' : '听牌', 'act', () => {
          riichiPick = riichiPick ? null : buildRiichiPick();
          render();
        });
      }
    }
  }

  /* ------------------------------------------------------------ 结算弹窗 */
  function showResult(res, instant) {
    hideToast();
    hideWinBanner();
    // 结算面板打开时，操作栏上的「查看结算 / 下一局」不该出现
    if ($('acts')) $('acts').innerHTML = '';
    const modal = $('modal');
    const box = (modal && typeof modal.querySelector === 'function')
      ? modal.querySelector('.modal-box') : null;
    if (box) box.classList.toggle('noanim', !!instant);   // 二次打开时不重播动画
    const st = game.state;
    const winName = res.type === 'draw' ? '流局' :
      (res.winner === HUMAN ? '你' : '电脑') + (res.tsumo ? ' 自摸' : ' 和牌');

    $('modalTitle').textContent = '本局结算';   // 谁胡的、赢多少放在内容区的抬头

    if (res.type === 'draw') {
      const maxR0 = (game.opts && game.opts.maxRounds) || 8;
      const streak = game.drawStreak || 0;
      const rows = [];
      if (streak > 0) {
        rows.push('<div class="totalrow mulrow"><span>连续流局 ' + streak + ' 局</span><span>×' +
          Math.pow(2, streak) + '</span></div>');
      }
      rows.push('<div class="totalrow"><span>进度</span><span>第 ' + st.roundNo + ' / ' + maxR0 +
        ' 局' + (game.over ? '（对局结束）' : '') + '</span></div>');
      const below = rows.map((html, i) =>
        html.replace(/^<div class="([^"]*)"/, (m0, cls) =>
          '<div class="' + cls + ' rowwait" style="animation-delay:' + (320 + i * 130) + 'ms"')
      ).join('');
      $('modalBody').innerHTML =
        '<div class="reshead">' +
          '<div class="resleft rowwait" style="animation-delay:40ms">' +
            '<div class="reswho">流局</div>' +
            '<div class="restag">牌墙摸完 · 无人和牌</div>' +
          '</div>' +
          '<div class="resdelta wait draw" style="animation-delay:140ms">±0</div>' +
        '</div>' +
        below;
      $('modalFoot').innerHTML = '';
      const v = document.createElement('button');
      v.className = 'ghost';
      v.textContent = '查看牌桌';
      v.addEventListener('click', () => { modal.hidden = true; render(); });
      $('modalFoot').appendChild(v);
      const b = document.createElement('button');
      b.className = 'primary';
      b.textContent = game.over ? '再来一局' : '下一局';
      b.addEventListener('click', () => { modal.hidden = true; nextRound(); });
      $('modalFoot').appendChild(b);
      modal.hidden = false;
      return;
    }

    /* 出场节奏：先手牌弹入 -> 停一下 -> 番种逐条 -> 停一下 -> 下面逐行 */
    const HAND_DELAY = 60;         // 手牌开始
    const STEP = 300;              // 每条番种间隔（毫秒），越大越慢
    const GAP_AFTER_HAND = 620;    // 手牌弹完停顿
    const GAP_AFTER_FANS = 420;    // 番种出完停顿
    const ROW_STEP = 130;          // 下面每行的间隔

    // 同名番合并成一条（箭刻+1 箭刻+1 -> 箭刻+2）
    const merged = new Map();
    res.fans.forEach((f) => merged.set(f.name, (merged.get(f.name) || 0) + f.fan));
    const sortedFans = Array.from(merged, ([name, fan]) => ({ name, fan }))
      .sort((a, b) => b.fan - a.fan);
    const fanStart = HAND_DELAY + GAP_AFTER_HAND;
    const chips = sortedFans.map((f, i) =>
      '<span style="animation-delay:' + (fanStart + i * STEP) + 'ms">' + f.name + ' <b>' + fmtFan(f.fan) + '</b></span>'
    ).join('');
    const belowStart = fanStart + Math.max(sortedFans.length, 1) * STEP + GAP_AFTER_FANS;

    // 顶部：谁胡的 + 大大的分差
    const isHuman = res.winner === HUMAN;
    const myDeltaRaw = isHuman ? res.amount : -res.amount;   // 站在「你」的角度：输就显示负分
    const myDelta = fmtScore(myDeltaRaw);
    const wayText = res.tsumo ? '自摸' : '点炮';
    const topFan = sortedFans.length ? sortedFans[0].name : '无番';   // 只放最大的一个番
    const totalMul = res.multipliers.reduce((a, m) => a * m.factor, 1);

    const rows = [];
    rows.push('<div class="totalrow"><span>基本分</span><span>' + fmtScore(res.baseScore) + ' 分</span></div>');
    // 每条倍率单独一行，样式与「基本分」一致
    res.multipliers.forEach((m) => {
      rows.push('<div class="totalrow mulrow"><span>' + m.name + '</span><span>×' +
        (Math.round(m.factor * 100) / 100) + '</span></div>');
    });
    rows.push('<div class="totalrow totalfinal"><span>总分</span><span class="big">' +
      fmtScore(res.amount) + ' 分</span></div>');
    rows.push('<div class="totalrow"><span>当前分数</span><span>' +
      fmtScore(st.players[HUMAN].score) + ' 分</span></div>');
    rows.push('<div class="totalrow"><span>进度</span><span>第 ' + st.roundNo + ' / ' +
      ((game.opts && game.opts.maxRounds) || 8) + ' 局' + (game.over ? '（对局结束）' : '') + '</span></div>');
    // 每一行都挂上 rowwait + 递增延迟（不管是 totalrow / mul / totalfinal / mulsum）
    const below = rows.map((html, i) =>
      html.replace(/^<div class="([^"]*)"/, (m0, cls) =>
        '<div class="' + cls + ' rowwait" style="animation-delay:' + (belowStart + i * ROW_STEP) + 'ms"')
    ).join('');

    const fanLine = sortedFans.map((f, i) =>
      '<span style="animation-delay:' + (fanStart + i * STEP) + 'ms">' + f.name + '<b>+' + fmtFan(f.fan) + '</b></span>'
    ).join('');

    // 分数放在最后弹
    const deltaDelay = belowStart + rows.length * ROW_STEP + 240;

    const body = $('modalBody');
    body.innerHTML =
      '<div class="reshead">' +
        '<div class="resleft rowwait" style="animation-delay:40ms">' +
          '<div class="reswho">' + (isHuman ? '你' : '电脑') + ' · ' + wayText + '胡</div>' +
          '<div class="restag">' + topFan + ' · ' + fmtFan(res.fan) + ' 番</div>' +
        '</div>' +
        '<div class="resdelta wait' + (myDeltaRaw > 0 ? ' plus' : ' minus') +
          '" style="animation-delay:' + deltaDelay + 'ms">' +
          (isFinite(myDeltaRaw)
            ? ((myDeltaRaw > 0 ? '+' : '-') + Math.abs(myDeltaRaw))
            : '∞') +
          (res.capped ? '<i class="capped">（封顶）</i>' : '') +
        '</div>' +
      '</div>' +
      '<div class="handview handwait" id="resHand" style="animation-delay:' + (HAND_DELAY + 120) + 'ms"></div>' +
      '<div class="fanline">' + (fanLine || '<span style="animation-delay:' + fanStart + 'ms">无番</span>') + '</div>' +
      '<div class="fantotal rowwait" style="animation-delay:' +
        (fanStart + Math.max(sortedFans.length, 1) * STEP + 120) + 'ms"><b>' +
        fmtFan(res.fan) + '</b> 番</div>' +
      below;

    const hv = $('resHand');
    // 把和牌的那一张抽出来，单独放到最右侧
    const rest = res.hand.slice();
    let winIdx = -1;
    if (res.winTile != null) {
      for (let i = rest.length - 1; i >= 0; i--) {
        if (rest[i] === res.winTile) { winIdx = i; break; }
      }
    }
    if (winIdx >= 0) rest.splice(winIdx, 1);

    rest.slice().sort((a, b) => b - a).forEach((t) => hv.appendChild(tileEl(t, 'tiny')));
    // 副露接在同一行（花牌不显示）；暗杠在结算里亮出来并标注「暗杠」
    (res.melds || []).forEach((m) => {
      if (m.kind === 'ankan') {
        // 暗杠：外侧两张亮出、中间两张背面，整体和吃碰一样
        const box = document.createElement('div');
        box.className = 'meld';
        const mkBack = () => {
          const b = document.createElement('div');
          b.className = 'back tiny-back';
          return b;
        };
        box.appendChild(tileEl(m.tiles[0], 'tiny'));
        box.appendChild(mkBack());
        box.appendChild(mkBack());
        box.appendChild(tileEl(m.tiles[0], 'tiny'));
        hv.appendChild(box);
      } else {
        hv.appendChild(meldEl(m, 'tiny'));
      }
    });
    if (winIdx >= 0) {
      const sep = document.createElement('span');
      sep.className = 'winsep';
      hv.appendChild(sep);
      hv.appendChild(tileEl(res.winTile, 'tiny win'));
    }

    $('modalFoot').innerHTML = '';
    const v = document.createElement('button');
    v.className = 'ghost';
    v.textContent = '查看牌桌';
    v.addEventListener('click', () => { modal.hidden = true; render(); });
    $('modalFoot').appendChild(v);
    const b = document.createElement('button');
    b.className = 'primary';
    b.textContent = game.over ? '再来一局' : '下一局';
    b.addEventListener('click', () => { modal.hidden = true; nextRound(); });
    $('modalFoot').appendChild(b);
    modal.hidden = false;

    if (game.over) {
      const t = document.createElement('div');
      t.className = 'totalrow';
      // 「那说啥了给你了」只在 ∞（666还有破解版）这种离谱和牌时出现
      const memeEnd = !!(st.result && st.result.infinite);
      const winText = memeEnd ? '那说啥了给你了' : '你赢了！';
      t.innerHTML = '<span>对局结束</span><span>' +
        (st.players[HUMAN].score > st.players[AI].score ? winText :
          st.players[HUMAN].score < st.players[AI].score ? '电脑赢了' : '平局') + '</span>';
      body.appendChild(t);
    }
  }

  function nextRound() {
    resultShown = false;
    resultPending = false;
    hideWinBanner();
    riichiPick = null;
    if (game.over) {
      game.newGame();
    } else {
      game.nextRound();
    }
    render();
    scheduleAI();
  }

  /* ------------------------------------------------------------ 规则面板 */
  function buildRules() {
    const groups = {};
    E.FAN_LIST.forEach((f) => { (groups[f.group] = groups[f.group] || []).push(f); });
    let html = '<h3>牌库</h3>' +
      '<p>万 1~9 + 字牌 东南西北中发白（每张 4 枚）+ 八张花（春夏秋冬梅兰竹菊）+ <b>4 张癞子</b>，共 <b>76 张</b>。</p>' +
      '<p><b>花牌</b>：摸到即亮出放进自己的花牌区，然后补摸一张，不占手牌；按张数计「花牌类」番。<br>' +
      '<b>癞子</b>：万能牌，可当任意一张牌用，不能碰杠；打出的癞子单独放进自己的癞子区。整手牌没用癞子时：<b>起胡番减半</b>，并且<b>最终点数 ×2</b>。</p>' +
      '<h3>基本规则</h3>' +
      '<p>两人对局，庄家 14 张、闲家 13 张；初始各 <b>20000 分</b>；<b>6 番起胡</b>，共 <b>4 局</b>' +
      '（默认配置，可在「设置」里调整）。' +
      '<br>可以吃、碰、杠、胡；癞子不能碰、杠；报听后手牌锁定（摸什么打什么）。</p>';
    html += '<h3>番数换算</h3><table><tr><th>番数</th><th>分值</th></tr>';
    let prev = 1;
    E.SCORE_TABLE.forEach((r) => {
      const lo = prev, hi = r.max;
      prev = r.max + 1;
      html += '<tr><td class="fan">' + (hi === Infinity ? lo + ' 番以上' : lo + ' ~ ' + hi + ' 番') +
        '</td><td class="desc">' + r.score + ' 分</td></tr>';
    });
    html += '</table>';
    Object.keys(groups).forEach((g) => {
      html += '<h3>' + g + '</h3><table>';
      groups[g].forEach((f) => {
        html += '<tr><td class="fan">' + f.name + ' ' + fmtFan(f.fan) + ' 番</td><td class="desc">' + f.desc + '</td></tr>';
      });
      html += '</table>';
    });
    html += '<h3>得分倍率</h3>' +
      '<p class="mulhead"><b>×2</b></p>' +
      '<ul class="mullist">' +
      '<li><b>连续流局</b>：每多一局翻一倍（×2 / ×4 / ×8…），直到有人胡牌才清零</li>' +
      '<li><b>癞子杠</b>：本局主动打出过癞子时，打出的人自己胡牌 ×2（2 张则 ×4）</li>' +
      '</ul>' +
      '<p class="mulhead"><b>÷2</b></p>' +
      '<ul class="mullist">' +
      '<li>胡的那张牌是自己曾经打出过的牌种</li>' +
      '<li>见逃后胡同一张</li>' +
      '<li>和牌时手上有 3~4 张癞子（胡进来的那张不算）</li>' +
      '<li>单吊癞子胡牌</li>' +
      '</ul>';
    $('rulesBody').innerHTML = html;
  }

  /* ------------------------------------------------------------ 事件绑定 */
  $('btnRules').addEventListener('click', () => { $('rulesModal').hidden = false; });
  $('rulesClose').addEventListener('click', () => { $('rulesModal').hidden = true; });
  $('rulesModal').addEventListener('click', (e) => { if (e.target.id === 'rulesModal') $('rulesModal').hidden = true; });
  $('btnNew').addEventListener('click', () => {
    $('modal').hidden = true;
    resultShown = false;
    game.newGame();
    render();
    scheduleAI();
  });

  /* ------------------------------------------------------------ 对局设置 */
  const SET_KEY = 'mj2p.settings';
  function loadSettings() {
    let cfg = null;
    try { cfg = JSON.parse(localStorage.getItem(SET_KEY) || 'null'); } catch (e) { cfg = null; }
    if (cfg) {
      if (cfg.memeFans === false) E.setMemeEnabled(false);
      if (cfg.minFan) E.setMinFan(cfg.minFan);
      if (cfg.maxRounds) game.opts.maxRounds = cfg.maxRounds;
      if (cfg.startScore) game.opts.startScore = cfg.startScore;
      if (cfg.capScore != null) game.opts.capScore = cfg.capScore;
    }
  }
  function saveSettings(cfg) {
    try { localStorage.setItem(SET_KEY, JSON.stringify(cfg)); } catch (e) { /* ignore */ }
  }
  function openSettings() {
    $('setMinFan').value = E.getMinFan();
    $('setRounds').value = String(game.opts.maxRounds || 8);
    $('setScore').value = game.opts.startScore;
    $('setCap').value = game.opts.capScore == null ? 30000 : game.opts.capScore;
    $('jokerSel').value = game.opts.jokerCount;
    $('testMode').checked = !!game.opts.testMode;
    $('setMeme').checked = E.getMemeEnabled() !== false;
    $('setReveal').checked = game.opts.revealOnRiichi === true;
    $('peekMode').checked = !!game.opts.peekMode;
    $('setModal').hidden = false;
  }
  $('btnSet').addEventListener('click', openSettings);
  $('setClose').addEventListener('click', () => { $('setModal').hidden = true; });
  $('setModal').addEventListener('click', (e) => {
    if (e.target.id === 'setModal') $('setModal').hidden = true;
  });
  // 设置项改动即时生效（不用等「应用」）
  function liveMinFan() {
    const v = Math.max(1, Math.min(30, parseInt($('setMinFan').value, 10) || 6));
    E.setMinFan(v);
    saveSettings({ minFan: v, maxRounds: game.opts.maxRounds, startScore: game.opts.startScore,
      capScore: game.opts.capScore });
    render();
  }
  $('setMinFan').addEventListener('input', liveMinFan);
  $('setMinFan').addEventListener('change', liveMinFan);

  $('setRounds').addEventListener('change', () => {
    game.opts.maxRounds = parseInt($('setRounds').value, 10) === 4 ? 4 : 8;
    saveSettings({ minFan: E.getMinFan(), maxRounds: game.opts.maxRounds,
      startScore: game.opts.startScore, capScore: game.opts.capScore });
    render();
  });

  $('setCap').addEventListener('change', () => {
    const raw = parseInt($('setCap').value, 10);
    game.opts.capScore = Math.max(0, Math.min(1000000, isNaN(raw) ? 30000 : raw));
    saveSettings({ minFan: E.getMinFan(), maxRounds: game.opts.maxRounds,
      startScore: game.opts.startScore, capScore: game.opts.capScore });
  });

  $('setMeme').addEventListener('change', () => {
    E.setMemeEnabled($('setMeme').checked);
    saveSettings({ minFan: E.getMinFan(), maxRounds: game.opts.maxRounds,
      startScore: game.opts.startScore, capScore: game.opts.capScore,
      memeFans: $('setMeme').checked });
    render();
  });

  $('setReveal').addEventListener('change', () => {
    game.opts.revealOnRiichi = $('setReveal').checked;
    render();
  });

  $('setApply').addEventListener('click', () => {
    const minFan = Math.max(1, Math.min(30, parseInt($('setMinFan').value, 10) || 6));
    const rounds = parseInt($('setRounds').value, 10) === 4 ? 4 : 8;
    const score = Math.max(1000, Math.min(1000000, parseInt($('setScore').value, 10) || 20000));

    // 顶栏搬进来的几项
    game.opts.testMode = $('testMode').checked;
    game.opts.revealOnRiichi = $('setReveal').checked;
    game.opts.peekMode = $('peekMode').checked;
    const capRaw = parseInt($('setCap').value, 10);
    const cap = Math.max(0, Math.min(1000000, isNaN(capRaw) ? 30000 : capRaw));
    const JOKER_CHOICES = [0, 4, 8, 12, 16];
    const jokRaw = parseInt($('jokerSel').value, 10);
    const jok = JOKER_CHOICES.indexOf(jokRaw) >= 0 ? jokRaw : 4;
    game.opts.capScore = cap;
    game.opts.jokerCount = jok;
    try { localStorage.setItem('mj2p.jokerCount', String(jok)); } catch (e) { /* ignore */ }
    try { localStorage.setItem('mj2p.testMode', game.opts.testMode ? '1' : '0'); } catch (e) { /* ignore */ }
    try { localStorage.setItem('mj2p.peekMode', game.opts.peekMode ? '1' : '0'); } catch (e) { /* ignore */ }

    if ($('setMeme')) E.setMemeEnabled($('setMeme').checked);
    E.setMinFan(minFan);
    game.opts.maxRounds = rounds;
    game.opts.startScore = score;
    saveSettings({ minFan: minFan, maxRounds: rounds, startScore: score, capScore: cap });

    $('setModal').hidden = true;
    $('modal').hidden = true;
    resultShown = false;
    riichiPick = null;
    game.scores = [score, score];        // 起始分数变了，重新开一场
    game.newGame();
    render();
    scheduleAI();
  });

  /* --------------------------------------------------- 牌墙告警（居中提示） */
  let wallWarned = { round: -1, ten: false, five: false };
  let wallToastEl = null;
  function toastWall(text, cls, life) {
    if (!document.body || !document.createElement) return;   // 无 DOM 环境（测试）直接跳过
    if (wallToastEl && wallToastEl.parentNode) wallToastEl.parentNode.removeChild(wallToastEl);
    const el = document.createElement('div');
    el.className = 'walltoast' + (cls ? ' ' + cls : '');
    el.textContent = text;
    document.body.appendChild(el);
    wallToastEl = el;
    const L = life || 2100;
    setTimeout(() => el.classList.add('out'), Math.max(200, L - 400));
    setTimeout(() => { if (el.parentNode) el.parentNode.removeChild(el); }, L);
  }
  let resultPending = false;    // 正在等胡牌横幅播完再弹结算
  let huToastRound = -1;        // 哪一局已经弹过「胡了」标识
  // 吃 / 碰 / 杠：副露变化时在那一侧弹横幅
  let meldSeen = [null, null];
  function meldSigOf(p) {
    return {
      count: p.melds.length,
      sig: p.melds.map((m) => m.kind + ':' + m.tiles.join(',')).join('|'),
    };
  }
  function checkMeldBanner(st) {
    if (!st || st.result) return;
    [0, 1].forEach((i) => {
      const cur = meldSigOf(st.players[i]);
      const prev = meldSeen[i];
      meldSeen[i] = cur;
      if (!prev) return;                       // 首次记录，不弹
      let text = null;
      if (cur.count > prev.count) {
        const m = st.players[i].melds[st.players[i].melds.length - 1];
        text = m.kind === 'chi' ? '吃！' : (m.kind === 'pon' ? '碰！' : '杠！');
      } else if (cur.count === prev.count && cur.sig !== prev.sig) {
        text = '杠！';                          // 加杠
      }
      if (text) showBanner(i === HUMAN, text, 'meld', 750);
    });
  }
  let riichiSeen = [false, false];
  function checkRiichiToast(st) {
    if (!st || st.result) return;
    [0, 1].forEach((i) => {
      const on = !!(st.players[i] && st.players[i].riichi);
      if (on && !riichiSeen[i]) {
        riichiSeen[i] = true;
        showBanner(i === HUMAN, '听！', 'ting');
      } else if (!on) {
        riichiSeen[i] = false;
      }
    });
  }
  let winBannerEl = null;
  function showBanner(isHuman, text, kind, life) {
    if (!document.body || !document.createElement) return;
    if (winBannerEl && winBannerEl.parentNode) winBannerEl.parentNode.removeChild(winBannerEl);
    const el = document.createElement('div');
    el.className = 'wintoast ' + (isHuman ? 'human' : 'ai') + (kind ? ' ' + kind : '');
    el.textContent = text;
    document.body.appendChild(el);
    winBannerEl = el;
    setTimeout(() => { if (el.parentNode) el.parentNode.removeChild(el); }, life || 1000);
  }
  function showWinBanner(isHuman, tsumo) {
    showBanner(isHuman, tsumo ? '自摸！' : '胡！');
  }
  function hideWinBanner() {
    if (winBannerEl && winBannerEl.parentNode) winBannerEl.parentNode.removeChild(winBannerEl);
    winBannerEl = null;
  }
  function hideToast() {
    if (wallToastEl && wallToastEl.parentNode) wallToastEl.parentNode.removeChild(wallToastEl);
    wallToastEl = null;
  }
  function checkWallWarn(st) {
    if (!st || st.result) return;
    if (wallWarned.round !== st.round) wallWarned = { round: st.round, ten: false, five: false };
    const n = st.wall.length;
    if (!wallWarned.ten && n <= 10 && n > 5) { wallWarned.ten = true; toastWall('牌墙只剩 ' + n + ' 张'); }
    else if (!wallWarned.five && n <= 5) { wallWarned.five = true; toastWall('牌墙只剩 ' + n + ' 张！'); }
  }

  /* ------------------------------------------------------------ 测试模式 */
  const TEST_KEY = 'mj2p.testMode';
  function syncTestUI() {
    const on = !!game.opts.testMode;
    const box = $('testMode');
    if (box) box.checked = on;
    const label = box && box.parentNode;
    if (label) label.classList.toggle('on', on);
  }
  // 测试模式：勾选只改界面状态，不立刻动牌桌；点「应用并重开」才生效
  $('testMode').addEventListener('change', (e) => {
    const on = !!e.target.checked;
    const label = e.target.parentNode;
    if (label) label.classList.toggle('on', on);
  });

  /* ------------------------------------------------------------ 透视（看对手手牌） */
  const PEEK_KEY = 'mj2p.peekMode';
  function syncPeekUI() {
    const box = $('peekMode');
    if (!box) return;
    box.checked = !!game.opts.peekMode;
    const label = box.parentNode;
    if (label) label.classList.toggle('on', !!game.opts.peekMode);
  }
  $('peekMode').addEventListener('change', (e) => {
    game.opts.peekMode = !!e.target.checked;      // 只改显示，不动牌局
    try { localStorage.setItem(PEEK_KEY, game.opts.peekMode ? '1' : '0'); } catch (err) { /* ignore */ }
    syncPeekUI();
    render();
  });

  /* ------------------------------------------------------------ 癞子张数 */
  const JOKER_KEY = 'mj2p.jokerCount';
  function readJokerPref() {
    try {
      const v = parseInt(localStorage.getItem(JOKER_KEY), 10);
      if (!isNaN(v)) return normJoker(v);
    } catch (e) { /* 无 localStorage 时忽略 */ }
    return game.opts.jokerCount;
  }
  function saveJokerPref(n) {
    try { localStorage.setItem(JOKER_KEY, String(n)); } catch (e) { /* ignore */ }
  }
  const JOKER_CHOICES = [0, 4, 8, 12, 16];
  function normJoker(n) {
    const v = n | 0;
    return JOKER_CHOICES.indexOf(v) >= 0 ? v : 4;
  }
  function applyJokerCount(n, restart) {
    const v = normJoker(n);
    $('jokerSel').value = v;
    game.opts.jokerCount = v;
    saveJokerPref(v);
    if (restart) {
      $('modal').hidden = true;
      resultShown = false;
      game.newGame();
      render();
      scheduleAI();
    }
  }

  // 癞子张数：下拉只是选择，不动牌桌；点「应用并重开」才真正生效
  $('jokerSel').addEventListener('change', (e) => {
    e.target.value = normJoker(parseInt(e.target.value, 10));
  });

  /* ------------------------------------------------------------ PWA 注册 */
  // 只有通过 http(s) 打开（而不是 file://）时才注册，file:// 下浏览器会直接忽略
  if (typeof navigator !== 'undefined' && navigator.serviceWorker &&
      typeof location !== 'undefined' && location.protocol.indexOf('http') === 0) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('sw.js').catch(() => { /* 忽略 */ });
    });
  }

  /* ------------------------------------------------------------ 启动 */
  window.__mjgame = game;      // 便于调试 / 自动化测试
  window.__mjTile = tileEl;    // 牌面渲染，截图用
  window.__mjengineMinFan = () => E.getMinFan();

  loadSettings();
  buildRules();
  try {
    if (localStorage.getItem(TEST_KEY) === '1') game.opts.testMode = true;
    if (localStorage.getItem(PEEK_KEY) === '1') game.opts.peekMode = true;
  } catch (err) { /* ignore */ }
  syncTestUI();
  syncPeekUI();
  game.opts.jokerCount = readJokerPref();
  $('jokerSel').value = game.opts.jokerCount;
  game.newGame();
  render();
  scheduleAI();
})();
