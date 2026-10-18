/* ============================================================================
 *  双人麻将 · 电脑对手  ai.js
 * ==========================================================================*/
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./engine.js'));
  else root.MJAI = factory(root.MJEngine);
})(typeof self !== 'undefined' ? self : this, function (E) {
  'use strict';


  // 手牌「保留价值」：越大越好（用来在同向听数时挑选打哪张）
  function keepValue(c) {
    let v = 0;
    for (let t = 0; t < 16; t++) {
      const n = c[t];
      if (!n) continue;
      const honor = t >= 9;
      if (n >= 2) v += 6 + (honor ? 2 : 0);          // 对子/刻子
      if (!honor && t <= 6 && c[t + 1] && c[t + 2]) v += 4;   // 顺子
      if (!honor && t <= 7 && c[t + 1]) v += 2;      // 两面
      if (!honor && t <= 6 && c[t + 2]) v += 1;      // 嵌张
      if (n === 1 && honor) v -= 1;                  // 孤张字牌
      if (n === 1 && !honor && (t === 0 || t === 8)) v -= 0.5;
    }
    v += 14 * (c[E.WILD] || 0);                        // 癞子非常宝贵
    return v;
  }

  function ukeire(hand, melds) {
    const base = E.shanten(hand, melds);
    const c = E.countsOf(hand);
    let n = 0;
    for (let t = 0; t < 16; t++) {
      const left = 4 - c[t];
      if (left <= 0) continue;
      if (E.shanten(hand.concat([t]), melds) < base) n += left;
    }
    return n;
  }

  /* ------------------------------------------------------------ 打牌选择 */
  function decideDiscard(game, pi) {
    const st = game.state;
    const p = st.players[pi];
    const hand = p.hand;

    if (p.riichi) {                       // 报听后只能打摸到的牌
      const i = hand.indexOf(st.drawn);
      return i >= 0 ? i : hand.length - 1;
    }

    const uniq = [];
    for (const t of hand) if (uniq.indexOf(t) < 0) uniq.push(t);

    let cands = [];
    for (const t of uniq) {
      if (E.isWild(t) && uniq.length > 1) continue;      // 不轻易打癞子
      const rest = hand.slice();
      rest.splice(rest.indexOf(t), 1);
      const sh = E.shanten(rest, p.melds);
      const kv = keepValue(E.countsOf(rest));
      cands.push({ t: t, sh: sh, kv: kv });
    }
    if (!cands.length) {
      const t = hand[0];
      cands = [{ t: t, sh: E.shanten(hand.slice(1), p.melds), kv: 0 }];
    }
    cands.sort((a, b) => (a.sh - b.sh) || (b.kv - a.kv));

    const bestSh = cands[0].sh;
    const top = cands.filter((c) => c.sh === bestSh).slice(0, 4);

    let pick = top[0];
    if (top.length > 1) {
      let bestU = -1;
      for (const c of top) {
        const rest = hand.slice();
        rest.splice(rest.indexOf(c.t), 1);
        const u = ukeire(rest, p.melds) + c.kv * 0.01;
        if (u > bestU) { bestU = u; pick = c; }
      }
    }
    return hand.indexOf(pick.t);
  }

  /* ------------------------------------------------------------ 鸣牌选择 */
  function decideClaim(game) {
    const st = game.state;
    const c = st.claim;
    if (!c) return { action: 'pass' };
    const pi = c.player;
    const p = st.players[pi];
    const tile = c.tile;

    if (c.options.hu) return { action: 'hu' };

    const curSh = E.shanten(p.hand, p.melds);

    // 碰
    if (c.options.pon) {
      const rest = p.hand.slice();
      for (let i = 0; i < 2; i++) rest.splice(rest.indexOf(tile), 1);
      const melds = p.melds.concat([{ kind: 'pon', tiles: [tile, tile, tile] }]);
      let best = 99;
      const uniq = [];
      for (const t of rest) if (uniq.indexOf(t) < 0) uniq.push(t);
      for (const t of uniq) {
        const r2 = rest.slice(); r2.splice(r2.indexOf(t), 1);
        best = Math.min(best, E.shanten(r2, melds));
      }
      if (best < curSh || (best === curSh && curSh <= 1)) return { action: 'pon' };
    }

    // 吃
    if (c.options.chi && c.options.chi.length) {
      let bestChi = null, bestSh = 99;
      for (const pair of c.options.chi) {
        const rest = p.hand.slice();
        pair.forEach((t) => rest.splice(rest.indexOf(t), 1));
        const all = pair.concat([tile]).sort((a, b) => a - b);
        const melds = p.melds.concat([{ kind: 'chi', tiles: all }]);
        const uniq = [];
        for (const t of rest) if (uniq.indexOf(t) < 0) uniq.push(t);
        for (const t of uniq) {
          const r2 = rest.slice(); r2.splice(r2.indexOf(t), 1);
          const sh = E.shanten(r2, melds);
          if (sh < bestSh) { bestSh = sh; bestChi = pair; }
        }
      }
      if (bestChi && bestSh < curSh) return { action: 'chi', chiPair: bestChi };
    }

    // 杠
    if (c.options.kan) {
      const rest = p.hand.slice();
      for (let i = 0; i < 3; i++) rest.splice(rest.indexOf(tile), 1);
      const melds = p.melds.concat([{ kind: 'kan', tiles: [tile, tile, tile, tile] }]);
      const sh = E.shanten(rest, melds);
      if (sh <= curSh) return { action: 'kan' };
    }

    return { action: 'pass' };
  }

  /* ------------------------------------------------------- 自己回合的暗杠/加杠 */
  function decideSelfKan(game, pi) {
    const st = game.state;
    const p = st.players[pi];
    const list = game.canSelfKan(pi);
    if (!list.length) return null;
    const curSh = E.shanten(p.hand, p.melds);
    for (const k of list) {
      const rest = p.hand.slice();
      if (k.type === 'ankan') {
        for (let i = 0; i < 4; i++) rest.splice(rest.indexOf(k.tile), 1);
      } else {
        rest.splice(rest.indexOf(k.tile), 1);
      }
      const meldKind = k.type === 'ankan' ? 'ankan' : 'kan';
      const melds = p.melds.map((m) => (m.kind === 'pon' && m.tiles[0] === k.tile && k.type === 'jiagang')
        ? { kind: 'kan', tiles: m.tiles.concat([k.tile]) } : m);
      if (k.type === 'ankan') melds.push({ kind: 'ankan', tiles: [k.tile, k.tile, k.tile, k.tile] });
      const sh = E.shanten(rest, melds);
      if (sh <= curSh) return k;
    }
    return null;
  }

  /* ------------------------------------------------------------ 是否报听 */
  /**
   * 能听就报听（返回 true 表示已经宣言并打出了宣言牌，
   * 调用方不要再另外出牌）
   */
  function maybeRiichi(game, pi) {
    const st = game.state;
    const p = st.players[pi];
    if (p.riichi) return false;
    if (st.drawn == null) return false;
    if (!game.canRiichi(pi)) return false;

    // 从所有可打的宣言牌里挑「剩余可胡张数」最多的那张
    const c = E.countsOf(p.hand);
    let best = null;
    game.riichiOptions(pi).forEach((o) => {
      const r = p.hand.slice();
      const k = r.indexOf(o.tile);
      if (k < 0) return;
      r.splice(k, 1);
      const ws = E.waits(r, p.melds);
      if (!ws.length) return;
      let left = 0;
      ws.forEach((t) => { left += 4 - (c[t] || 0); });
      if (!best || left > best.left) best = { tile: o.tile, left: left, kinds: ws.length };
    });
    if (!best) return false;
    if (best.left < 4) return false;          // 等牌太少就不报听
    const idx = p.hand.indexOf(best.tile);
    if (idx < 0) return false;
    return game.riichi(pi, idx);
  }

  return { decideDiscard, decideClaim, decideSelfKan, maybeRiichi, ukeire, keepValue };
});
