/* ============================================================================
 *  双人麻将 · 对局流程  game.js
 *  依赖 engine.js
 * ==========================================================================*/
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./engine.js'));
  else root.MJGame = factory(root.MJEngine);
})(typeof self !== 'undefined' ? self : this, function (E) {
  'use strict';

  const MIN_FAN = () => (E.getMinFan ? E.getMinFan() : 6);

  // 判断这些牌能不能刚好拆成 need 个面子（不含将）；剩下的癞子可以补进面子
  function formsMelds(c, jokers, need) {
    if (need === 0) return c.every((x) => x === 0) && jokers === 0;
    let t = -1;
    for (let i = 0; i < 16; i++) if (c[i] > 0) { t = i; break; }
    if (t < 0) return jokers >= 3 * need;          // 剩下的全用癞子拼
    // 刻子（用 1~3 张真牌，缺的用癞子补）
    for (let r = Math.min(3, c[t]); r >= 1; r--) {
      const w = 3 - r;
      if (jokers < w) continue;
      c[t] -= r;
      const ok = formsMelds(c, jokers - w, need - 1);
      c[t] += r;
      if (ok) return true;
    }
    // 顺子（含 t 的三种位置，其余两张可真可癞）
    if (t < 9) {
      for (let s = Math.max(0, t - 2); s <= Math.min(6, t); s++) {
        const posT = t - s;
        const others = [0, 1, 2].filter((x) => x !== posT);
        for (let mask = 0; mask < 4; mask++) {
          const j0 = (mask & 1) ? 1 : 0;
          const j1 = (mask & 2) ? 1 : 0;
          const w = j0 + j1;
          if (w > jokers) continue;
          if (!j0 && c[s + others[0]] <= 0) continue;
          if (!j1 && c[s + others[1]] <= 0) continue;
          c[t]--;
          if (!j0) c[s + others[0]]--;
          if (!j1) c[s + others[1]]--;
          const ok = formsMelds(c, jokers - w, need - 1);
          c[t]++;
          if (!j0) c[s + others[0]]++;
          if (!j1) c[s + others[1]]++;
          if (ok) return true;
        }
      }
    }
    return false;
  }

  function mkPlayer(score) {
    return {
      hand: [], melds: [], discards: [], jokerDiscards: [],
      flowers: [],            // 已亮出的花牌（补花区）
      jokersDiscarded: 0,     // 本局主动打出过几张癞子（每张胡牌 ×2）
      riichi: false, riichiTurn: -1,
      discardedTypes: {},     // 自己打出过的牌型 -> true
      passedWin: {},          // 见逃过的牌型 -> true
      score: score,
    };
  }

  class Game {
    constructor(opts) {
      this.opts = Object.assign({
        chi: true,            // 允许吃
        startScore: 20000,
        maxRounds: 4,
        jokerCount: 4,        // 牌库里的癞子张数
        capScore: 30000,      // 单局封顶分（0 = 不封顶）
        testMode: false,      // 测试模式：只有自己摸牌打牌，对手不动
        revealOnRiichi: false,   // 报听后是否亮出对手手牌（默认关）
        onChange: null,
      }, opts || {});
      this.scores = [this.opts.startScore, this.opts.startScore];
      this.dealer = 0;
      this.roundNo = 0;
      this.drawStreak = 0;      // 连续流局次数（倍率累积）
      this.over = false;
      this.state = null;
      this.history = [];
      this.onChange = this.opts.onChange;
    }

    emit() { if (this.onChange) this.onChange(this); }

    newGame() {
      this.scores = [this.opts.startScore, this.opts.startScore];
      this.dealer = 0;
      this.roundNo = 0;
      this.drawStreak = 0;      // 连续流局次数（倍率累积）
      this.over = false;
      this.history = [];
      this.startRound();
      return this;
    }

    /* ------------------------------------------------------------ 开新一局 */
    startRound() {
      this.roundNo++;
      this.roundSeq = (this.roundSeq || 0) + 1;   // 每开一局唯一递增，供发牌动画判断
      if (this.opts.testMode) this.dealer = 0;    // 测试模式：永远自己坐庄
      const deck = E.shuffle(E.buildDeck(this.opts.jokerCount));
      const st = {
        roundNo: this.roundNo,
        seq: this.roundSeq,
        dealer: this.dealer,
        wall: deck,
        players: [mkPlayer(this.scores[0]), mkPlayer(this.scores[1])],
        turn: this.dealer,
        turnSeq: 0,
        phase: 'discard',
        drawn: null,
        lastDiscard: null,
        claim: null,
        result: null,
        log: [],
        selfWin: null,
        pendingFlower: null,
        pendingDraw: null,
        mulFlags: { drawStreak: this.drawStreak },   // 分差规则已取消
        lastEvent: null,
      };
      this.state = st;

      this.log('第 ' + this.roundNo + ' 局开始 · ' + (st.dealer === 0 ? '你' : '对手') + '坐庄');
      // 测试模式：不给对手发牌，牌全留给自己摸
      const dealBoth = !this.opts.testMode;
      for (let i = 0; i < 13; i++) {
        this.takeTile(0);
        if (dealBoth) this.takeTile(1);
      }
      const extraPlayer = dealBoth ? st.dealer : 0;
      const extraBefore = st.players[extraPlayer].hand.length;
      this.takeTile(extraPlayer);
      // 记住庄家真正摸进来的那张（排序之后仍然以它为准，而不是排到最后的那张）
      if (st.mulFlags.drawStreak > 0) {
        this.log('已连续流局 ' + st.mulFlags.drawStreak + ' 局，本局得分 ×' +
          Math.pow(2, st.mulFlags.drawStreak));
      }

      const dealtExtra = st.players[extraPlayer].hand.length > extraBefore
        ? st.players[extraPlayer].hand[st.players[extraPlayer].hand.length - 1]
        : null;
      st.players.forEach((p, i) => this.sortHand(i));
      const first = st.players[st.dealer];
      // 庄家那张：用真实摸到的牌；摸到花牌补花后则为补进来的那张
      st.drawn = dealtExtra != null ? dealtExtra : first.hand[first.hand.length - 1];
      st.turn = st.dealer;

      // 天胡判定：自己坐庄时要手动点「自摸」确认，电脑坐庄直接和
      const tian = this.checkWin(st.dealer, null, { tsumo: true, tianhu: true });
      if (tian && st.dealer !== 0) {
        this.log('天胡！');
        this.finishWin(st.dealer, st.dealer, tian, null, { tsumo: true, tianhu: true });
        return this;
      }
      if (tian) {
        st.selfWin = tian;                 // 等玩家点「自摸」
        this.log('天胡！点「自摸」和牌');
        this.emit();
        return this;
      }
      this.refreshSelfWin();
      this.emit();
      return this;
    }

    sortHand(pi) {
      this.state.players[pi].hand.sort((a, b) => a - b);
    }

    log(text) {
      if (!this.state) return;
      this.state.log.push(text);
      if (this.state.log.length > 200) this.state.log.shift();
    }

    /* ------------------------------------------------------------ 手牌统计 */
    wallLeft() { return this.state.wall.length; }

    /* ------------------------------------------------- 判断某张牌能否和 */
    checkWin(pi, tile, extraFlags) {
      const st = this.state;
      const p = st.players[pi];
      const tiles = tile == null ? p.hand.slice() : p.hand.concat([tile]);
      const winTile = tile == null ? st.drawn : tile;
      if (!E.isWinShape(tiles, p.melds) && !E.isMemeWin(tiles, p.melds)) return null;

      const flags = Object.assign({
        tsumo: tile == null,
        winTile: winTile,
        baoting: p.riichi,
        tianting: !!p.tianting,
        flowerCount: p.flowers.length,   // 花牌区的张数（花牌类番）
      }, extraFlags || {});

      const totalDis = st.discardCount || 0;     // 本局累计出牌数（鸣牌不会减小）
      if (flags.tsumo) {
        // 地胡：闲家第一次摸牌即胡
        if (pi !== st.dealer && p.discards.length === 0 && p.melds.length === 0 && totalDis <= 1) {
          flags.dihu = true;
        }
      } else if (st.lastDiscard && st.lastDiscard.player === st.dealer &&
                 totalDis === 1 && p.melds.length === 0) {
        flags.renhu = true;      // 人胡：胡庄家第一张打出的牌（自己还没吃过碰过）
      }
      // 杠上炮：对方杠后打出的牌被自己胡
      if (!flags.tsumo && st.lastDiscard && st.lastDiscard.afterKan &&
          st.lastDiscard.player !== pi) {
        flags.gangpao = true;
      }

      // 胡绝张：桌面上（牌河 + 副露）已经现出 3 张，自己手牌不算
      if (winTile != null) {
        let seen = 0;
        [0, 1].forEach((q) => {
          st.players[q].discards.forEach((d) => { if (d === winTile) seen++; });
          (st.players[q].jokerDiscards || []).forEach((d) => { if (d === winTile) seen++; });
          st.players[q].melds.forEach((m) => {
            m.tiles.forEach((d) => { if (d === winTile) seen++; });
          });
        });
        // 点炮的那张牌本身就在牌河里，不能算作「已经现过」的那 3 张
        if (!flags.tsumo && !(st.claim && st.claim.robbing) &&
            st.lastDiscard && st.lastDiscard.player !== pi && st.lastDiscard.tile === winTile) {
          seen -= 1;
        }
        flags.juezhang = seen >= 3;
      }
      // 海底
      if (st.wall.length === 0) flags.haidi = true;

      const res = E.evaluateWin(tiles, p.melds, flags);
      if (!res) return null;
      const needFan = res.minFan == null ? MIN_FAN() : res.minFan;
      if (res.fan < needFan) return null;
      res.tiles = tiles;
      res.winTile = winTile;
      res.flags = flags;
      return res;
    }

    refreshSelfWin() {
      const st = this.state;
      st.selfWin = null;
      if (st.phase !== 'discard' || st.claim) return;
      const res = this.checkWin(st.turn, null, {});
      if (res) st.selfWin = res;
    }

    /* ------------------------------------------------------------ 摸牌 */
    // 发牌用：连续摸，摸到花牌直接亮出补花，不暂停
    takeTile(pi) {
      const st = this.state;
      const p = st.players[pi];
      while (st.wall.length > 0) {
        const t = st.wall.pop();
        if (t >= E.FLOWER_BASE && t < E.FLOWER_END) {
          p.flowers.push(t);
          this.log((pi === 0 ? '你' : '对手') + ' 摸到花牌 ' + E.tileLabel(t) + '，补花');
          continue;
        }
        p.hand.push(t);
        return t;
      }
      return null;
    }

    // 对局中的摸牌：摸到花牌就停在 'flower' 阶段，等界面播完补花动画
    // 再调用 resolveFlower() 继续摸下一张（连摸两张花牌也会一张一张来）
    beginDraw(pi, kind) {
      const st = this.state;
      st.pendingDraw = { player: pi, kind: kind };
      this.stepDraw();
    }

    stepDraw() {
      const st = this.state;
      const pd = st.pendingDraw;
      if (!pd) return;
      if (st.wall.length === 0) { st.pendingDraw = null; this.finishDraw(); return; }
      const t = st.wall.pop();
      if (t >= E.FLOWER_BASE && t < E.FLOWER_END) {
        st.pendingFlower = { player: pd.player, tile: t };
        st.phase = 'flower';
        st.turn = pd.player;
        st.drawn = null;
        this.log((pd.player === 0 ? '你' : '对手') + ' 摸到花牌 ' + E.tileLabel(t) + '，补花');
        this.emit();
        return;                                   // 等界面播完动画
      }
      st.pendingFlower = null;
      st.players[pd.player].hand.push(t);
      this.sortHand(pd.player);
      st.pendingDraw = null;
      this.finishDrawStep(pd, t);
    }

    // 界面播完「花牌落到花牌区」的动画后调用
    resolveFlower() {
      const st = this.state;
      if (!st || st.result || !st.pendingFlower) return false;
      const f = st.pendingFlower;
      st.players[f.player].flowers.push(f.tile);
      st.pendingFlower = null;
      this.stepDraw();
      return true;
    }

    finishDrawStep(pd, tile) {
      const st = this.state;
      const pi = pd.player;
      st.turn = pi;
      st.drawn = tile;
      st.phase = 'discard';
      st.claim = null;
      st.lastDiscard = null;
      st.lastEvent = { type: 'draw', player: pi, tile: tile };
      if (pd.kind === 'kan') {
        st.players[pi].afterKanDraw = true;       // 这张是杠后补的牌
        const res = this.checkWin(pi, null, { tsumo: true, gangshang: true });
        st.selfWin = res;
        if (res) this.log((pi === 0 ? '你' : '对手') + ' 杠上开花可胡！');
      } else {
        this.refreshSelfWin();
      }
      this.emit();
    }

    nextTurn(pi) {
      const st = this.state;
      if (st.result) return;
      st.claim = null;
      st.lastDiscard = null;
      if (this.opts.testMode) pi = 0;    // 测试模式：永远轮到自己，对手不摸不打
      st.turn = pi;
      st.turnSeq++;
      this.beginDraw(pi, 'turn');
    }

    /* ------------------------------------------------------------ 打牌 */
    discard(pi, tileIndex) {
      const st = this.state;
      if (st.result || st.phase !== 'discard' || st.turn !== pi) return false;
      const p = st.players[pi];
      if (tileIndex < 0 || tileIndex >= p.hand.length) return false;
      const tile = p.hand.splice(tileIndex, 1)[0];
      p.discardedTypes[tile] = true;
      if (tile === E.WILD) {
        // 打出的癞子单独放在癞子区，不混进牌河
        p.jokerDiscards.push(tile);
        p.jokersDiscarded++;
        this.log((pi === 0 ? '你' : '对手') + ' 打出癞子（本局胡牌 ×' +
          Math.pow(2, p.jokersDiscarded) + '）');
      } else {
        p.discards.push(tile);
        this.log((pi === 0 ? '你' : '对手') + ' 打出 ' + E.tileLabel(tile));
      }
      st.drawn = null;
      st.selfWin = null;
      const afterKan = !!p.afterKanDraw;         // 这张是杠后打出来的（可能被杠上炮）
      p.afterKanDraw = false;
      st.discardCount = (st.discardCount || 0) + 1;   // 本局累计出牌序号（鸣牌不会减小）
      st.lastDiscard = { player: pi, tile: tile, afterKan: afterKan };
      st.lastEvent = { type: 'discard', player: pi, tile: tile };
      // 报听后自动打牌，打出的牌不能再换
      this.afterDiscard(pi, tile);
      return true;
    }

    afterDiscard(pi, tile) {
      const st = this.state;
      const other = 1 - pi;
      if (this.opts.testMode) {          // 测试模式：对手不鸣牌
        st.lastEvent = (pi === 0 ? '你' : '对手') + ' 打出 ' + E.tileLabel(tile);
        this.nextTurn(0);
        return;
      }

      // 对方：胡 > 杠 > 碰 > 吃
      const isWildTile = tile === E.WILD;  // 打出的癞子不能被碰/杠/吃，也不能点炮
      const hu = isWildTile ? null : this.checkWin(other, tile, { tsumo: false });
      const op = st.players[other];
      const cnt = op.hand.filter((t) => t === tile).length;
      const chi = [];
      if (this.opts.chi && tile < 9) {
        const has = (t) => op.hand.indexOf(t) >= 0;
        if (tile >= 2 && has(tile - 1) && has(tile - 2)) chi.push([tile - 2, tile - 1]);
        if (tile >= 1 && tile <= 7 && has(tile - 1) && has(tile + 1)) chi.push([tile - 1, tile + 1]);
        if (tile <= 6 && has(tile + 1) && has(tile + 2)) chi.push([tile + 1, tile + 2]);
      }
      const canCall = !op.riichi;          // 报听后只能胡，不能吃碰杠
      const options = {
        hu: hu,
        kan: canCall && !isWildTile && cnt >= 3,
        pon: canCall && !isWildTile && cnt >= 2,
        chi: canCall && !isWildTile ? chi : [],
      };
      if (hu || options.kan || options.pon || options.chi.length) {
        st.phase = 'claim';
        st.claim = { player: other, from: pi, tile: tile, options: options };
        st.turn = other;
        this.emit();
        return;
      }
      // 主动打出癞子 -> 还是自己摸牌；普通牌 -> 轮到对手
      this.nextTurn(tile === E.WILD ? pi : other);
    }

    /* ------------------------------------------------------------ 鸣牌处理 */
    claim(action, chiPair) {
      const st = this.state;
      if (!st.claim || st.phase !== 'claim') return false;
      const c = st.claim;
      const pi = c.player;
      const p = st.players[pi];
      const tile = c.tile;

      if (action === 'pass') {
        if (c.options.hu) p.passedWin[tile] = true;       // 记「见逃」
        st.claim = null;
        if (c.robbing) {                                   // 不抢杠 -> 完成加杠
          const jg = st.pendingJiagang;
          st.pendingJiagang = null;
          const q = st.players[jg.player];
          const meld = q.melds.find((m) => m.kind === 'pon' && m.tiles[0] === jg.tile);
          if (meld) {
            q.hand.splice(q.hand.indexOf(jg.tile), 1);
            meld.kind = 'kan';
            meld.tiles.push(jg.tile);
            this.log((jg.player === 0 ? '你' : '对手') + ' 加杠 ' + E.tileLabel(jg.tile));
            this.kanDraw(jg.player);
            return true;
          }
        }
        // 打出的癞子没人要 -> 打出癞子的人继续摸
        if (c.tile === E.WILD && c.from != null) this.nextTurn(c.from);
        else this.nextTurn(pi);        // 其他情况：过牌的人摸牌（两人麻将里他就是下家）
        return true;
      }
      if (action === 'hu') {
        if (!c.options.hu) return false;
        st.claim = null;
        st.players[c.from].discards.pop();     // 点炮的那张进胡牌者手里
        p.hand.push(tile);
        this.finishWin(pi, c.from, c.options.hu, tile, { tsumo: false });
        return true;
      }
      if (action === 'kan') {
        if (!c.options.kan) return false;
        st.players[c.from].discards.pop();
        for (let i = 0; i < 3; i++) p.hand.splice(p.hand.indexOf(tile), 1);
        p.melds.push({ kind: 'kan', tiles: [tile, tile, tile, tile], from: c.from });
        st.claim = null;
        st.lastDiscard = null;
        st.selfWin = null;
        this.log((pi === 0 ? '你' : '对手') + ' 明杠 ' + E.tileLabel(tile));
        this.kanDraw(pi);
        return true;
      }
      if (action === 'pon') {
        if (!c.options.pon) return false;
        st.players[c.from].discards.pop();
        for (let i = 0; i < 2; i++) p.hand.splice(p.hand.indexOf(tile), 1);
        p.melds.push({ kind: 'pon', tiles: [tile, tile, tile], from: c.from });
        st.claim = null;
        st.lastDiscard = null;
        st.phase = 'discard';
        st.turn = pi;
        st.drawn = null;
        st.selfWin = null;
        this.log((pi === 0 ? '你' : '对手') + ' 碰 ' + E.tileLabel(tile));
        this.emit();
        return true;
      }
      if (action === 'chi') {
        if (!chiPair || !c.options.chi.length) return false;
        st.players[c.from].discards.pop();
        const pair = chiPair;
        pair.forEach((t) => p.hand.splice(p.hand.indexOf(t), 1));
        const all = pair.concat([tile]).sort((a, b) => a - b);
        p.melds.push({ kind: 'chi', tiles: all, from: c.from });
        st.claim = null;
        st.lastDiscard = null;
        st.phase = 'discard';
        st.turn = pi;
        st.drawn = null;
        st.selfWin = null;
        this.log((pi === 0 ? '你' : '对手') + ' 吃 ' + all.map(E.tileLabel).join(''));
        this.emit();
        return true;
      }
      return false;
    }

    /* ------------------------------------------------------------ 杠（自己回合） */
    canSelfKan(pi) {
      const st = this.state;
      const p = st.players[pi];
      const list = [];
      const c = E.countsOf(p.hand);
      for (let t = 0; t < 16; t++) {
        if (c[t] === 4) list.push({ type: 'ankan', tile: t });
        if (c[t] >= 1) {
          p.melds.forEach((m) => {
            if (m.kind === 'pon' && m.tiles[0] === t) list.push({ type: 'jiagang', tile: t });
          });
        }
      }
      return list;
    }

    selfKan(pi, type, tile) {
      const st = this.state;
      const p = st.players[pi];
      if (st.phase !== 'discard' || st.turn !== pi || st.claim) return false;
      if (type === 'ankan') {
        for (let i = 0; i < 4; i++) p.hand.splice(p.hand.indexOf(tile), 1);
        p.melds.push({ kind: 'ankan', tiles: [tile, tile, tile, tile] });
        this.log((pi === 0 ? '你' : '对手') + ' 暗杠 ' + E.tileLabel(tile));
        st.drawn = null;
        this.kanDraw(pi);
        return true;
      }
      if (type === 'jiagang') {
        const meld = p.melds.find((m) => m.kind === 'pon' && m.tiles[0] === tile);
        if (!meld) return false;
        // 抢杠
        const other = 1 - pi;
        const rob = this.checkWin(other, tile, { tsumo: false, qianggang: true });
        if (rob) {
          st.claim = {
            player: other, from: pi, tile: tile,
            options: { hu: rob, kan: false, pon: false, chi: [] },
            robbing: true,
          };
          st.phase = 'claim';
          st.turn = other;
          st.pendingJiagang = { player: pi, tile: tile };
          this.log((other === 0 ? '你' : '对手') + ' 可以抢杠！');
          this.emit();
          return true;
        }
        p.hand.splice(p.hand.indexOf(tile), 1);
        meld.kind = 'kan';
        meld.tiles.push(tile);
        this.log((pi === 0 ? '你' : '对手') + ' 加杠 ' + E.tileLabel(tile));
        st.drawn = null;
        st.pendingKanDraw = pi;      // 加杠后停顿一下再摸牌（由界面在 0.7 秒后触发）
        this.emit();
        return true;
      }
      return false;
    }

    // 杠后补牌
    // 加杠停顿结束后真正摸牌
    finishKanDraw() {
      const st = this.state;
      if (st.pendingKanDraw == null || st.result) return false;
      const pi = st.pendingKanDraw;
      st.pendingKanDraw = null;
      this.kanDraw(pi);
      return true;
    }

    kanDraw(pi) {
      const st = this.state;
      if (st.wall.length === 0) { this.finishDraw(); return; }
      st.turn = pi;
      st.lastDiscard = null;
      this.beginDraw(pi, 'kan');
    }

    /* ------------------------------------------------------------ 自己宣告和牌 */
    declareSelfWin(pi) {
      const st = this.state;
      if (st.phase !== 'discard' || st.turn !== pi || !st.selfWin) return false;
      const res = st.selfWin;
      this.finishWin(pi, pi, res, st.drawn, res.flags || { tsumo: true });
      return true;
    }

    /* ------------------------------------------------------------ 报听 */
    // 打掉哪张能听牌（按等牌张数从多到少）
    riichiOptions(pi) {
      const st = this.state;
      const p = st.players[pi];
      const need = 4 - p.melds.length;
      if (p.hand.length !== 3 * need + 2) return [];
      const out = [];
      const seen = {};
      p.hand.forEach((t) => {
        if (seen[t]) return;
        seen[t] = true;
        const rest = p.hand.slice();
        rest.splice(rest.indexOf(t), 1);
        const w = E.waits(rest, p.melds);
        if (w.length) out.push({ tile: t, waits: w.length });
      });
      out.sort((a, b) => b.waits - a.waits);
      return out;
    }

    canRiichi(pi) {
      const st = this.state;
      const p = st.players[pi];
      if (!st || st.result || p.riichi) return false;
      // 听牌不要求门清：有吃碰杠也能报听（只是听牌后会锁定手牌）
      if (E.waits(p.hand, p.melds).length) return true;            // 已经听牌
      return this.riichiOptions(pi).length > 0;                    // 打一张之后能听
    }

    riichi(pi, tileIndex) {
      const st = this.state;
      const p = st.players[pi];
      if (!this.canRiichi(pi)) return false;
      const need = 4 - p.melds.length;
      const canDiscardNow = st.phase === 'discard' && st.turn === pi && !st.claim && !st.result;

      p.riichi = true;
      p.riichiTurn = st.turnSeq;
      // 天听：轮到自己第一次摸牌时就报听（庄家第 0 巡、闲家第 1 巡）
      // 报听之前有过吃/碰/明杠 就不算天听；庄家的暗杠例外（暗杠后仍算天听）
      const firstTurnSeq = (pi === st.dealer) ? 0 : 1;
      const onlyAnkan = p.melds.every((m) => m.kind === 'ankan');
      const meldOk = pi === st.dealer ? onlyAnkan : p.melds.length === 0;
      if (st.turnSeq === firstTurnSeq && p.discards.length === 0 && meldOk) {
        p.tianting = true;
        this.log('天听！' + (pi === 0 ? '你' : '对手') + ' 起手听牌');
      } else {
        this.log((pi === 0 ? '你' : '对手') + ' 报听！');
      }

      // 手上是 14 张：把宣言牌打出去（默认选等牌最多的一张）
      if (canDiscardNow && p.hand.length === 3 * need + 2) {
        let idx = (typeof tileIndex === 'number' && tileIndex >= 0) ? tileIndex : -1;
        if (idx < 0) {
          const opts = this.riichiOptions(pi);
          if (opts.length) idx = p.hand.indexOf(opts[0].tile);
        }
        if (idx >= 0) { this.discard(pi, idx); return true; }
      }
      this.emit();
      return true;
    }

    /* ------------------------------------------------------------ 结算 */
    multipliers(pi, flags, res) {
      const st = this.state;
      const list = [];
      const tiles = (res && res.tiles) || [];
      if (st.mulFlags.drawStreak > 0) {
        list.push({
          name: '连续流局 ' + st.mulFlags.drawStreak + ' 局',
          factor: Math.pow(2, st.mulFlags.drawStreak),
        });
      }
      if (res && res.noJoker) list.push({ name: '无癞子', factor: 2 });
      const jd = st.players[pi].jokersDiscarded || 0;
      if (jd > 0) {
        list.push({ name: '癞子杠' + (jd > 1 ? '（' + jd + ' 张）' : ''), factor: Math.pow(2, jd) });
      }
      if (flags.ron && st.players[pi].discardedTypes[flags.winTile]) {
        list.push({ name: '胡自己打过的牌', factor: 0.5 });
      }
      if (flags.ron && st.players[pi].passedWin[flags.winTile]) {
        list.push({ name: '见逃后胡同一张', factor: 0.5 });
      }
      // 和牌时手上有 3 张或 4 张癞子 -> 得分减半
      // （如果胡进来的那张正好是癞子，它不算在「手里」的张数里）
      let jokers = tiles.filter((t) => t === E.WILD).length;
      if (flags.winTile === E.WILD && jokers > 0) jokers -= 1;
      if (jokers >= 3) list.push({ name: '手中有 ' + jokers + ' 张癞子', factor: 0.5 });

      // 单吊癞子：最后一只是癞子、等任意牌来配对（癞子做将）
      let danDiaoJoker = false;
      if (res) {
        // 只有「手里本来就吊着一张癞子」才算；胡进来的癞子补将不算
        if (res.tiles) {
          const before = res.tiles.slice();                  // 和牌前的手牌
          const wi = before.indexOf(res.winTile);
          if (wi >= 0) before.splice(wi, 1);
          const ji = before.indexOf(E.WILD);
          if (ji >= 0) {
            const rest = before.slice();
            rest.splice(ji, 1);                              // 去掉那张单吊的癞子
            const cc = E.countsOf(rest);
            const restJokers = cc[E.WILD] || 0;
            const need = 4 - st.players[pi].melds.length;
            // 剩下的牌（含其余癞子）要刚好凑成 need 个面子
            if (rest.length === 3 * need &&
                formsMelds(cc.slice(0, 16), restJokers, need)) danDiaoJoker = true;
          }
        }
      }
      if (danDiaoJoker) list.push({ name: '单吊癞子胡牌', factor: 0.5 });
      return list;
    }

    finishWin(pi, loser, res, winTile, flags) {
      const st = this.state;
      flags = flags || {};
      // 胡的那张卡在「摸牌位」上（和牌后手牌里它会和其余牌隔开显示）
      if (winTile != null) st.drawn = winTile;
      const muls = this.multipliers(pi, { ron: !flags.tsumo, winTile: winTile }, res);
      let factor = 1;
      muls.forEach((m) => { factor *= m.factor; });
      let amount = Math.max(0, Math.round(res.scoreBase * factor));
      if (res.infinite) amount = Infinity;   // 梗番「666还有破解版」：分数直接 ∞
      const rawAmount = amount;              // 封顶前的分数
      // 封顶分：每局得分不超过设定上限（0 = 不封顶）；∞ 不受封顶限制
      const cap = this.opts.capScore | 0;
      if (!res.infinite && cap > 0 && amount > cap) amount = cap;

      st.result = {
        type: flags.tsumo ? 'tsumo' : 'ron',
        winner: pi,
        loser: flags.tsumo ? 1 - pi : loser,
        fan: res.fan,
        fans: res.fans,
        baseScore: res.scoreBase,
        minFan: res.minFan,
        noJoker: res.noJoker,
        infinite: !!res.infinite,      // 666还有破解版：分数无上限
        multipliers: muls,
        factor: factor,
        amount: amount,
        hand: res.tiles,
        melds: st.players[pi].melds.slice(),
        flowers: st.players[pi].flowers.slice(),
        winTile: winTile == null ? st.drawn : winTile,
        flags: flags,
        tsumo: !!flags.tsumo,
        rawAmount: rawAmount,      // 封顶前的分数（用来显示「封顶」）
        capped: amount < rawAmount,
        scoreBefore: [st.players[0].score, st.players[1].score],   // 天胡停留时先显示旧比分
      };
      this.applyScore(pi, st.result.loser, amount);
      st.phase = 'over';
      st.claim = null;
      this.drawStreak = 0;
      this.log((pi === 0 ? '你' : '对手') + ' 和牌：' + res.fan + ' 番 ' +
        (amount > 0 ? '（' + amount + ' 分）' : ''));
      this.history.push({ round: st.roundNo, ...st.result });
      this.checkGameOver(pi);
      this.emit();
    }

    finishDraw() {
      const st = this.state;
      st.result = { type: 'draw', fans: [], amount: 0 };
      st.phase = 'over';
      st.claim = null;
      this.drawStreak = (this.drawStreak || 0) + 1;
      this.log('牌墙摸完，流局。');
      this.history.push({ round: st.roundNo, type: 'draw' });
      this.checkGameOver(-1);
      this.emit();
    }

    applyScore(winner, loser, amount) {
      const st = this.state;
      if (amount <= 0) return;
      st.players[winner].score += amount;
      st.players[loser].score -= amount;
      this.scores[winner] = st.players[winner].score;
      this.scores[loser] = st.players[loser].score;
    }

    checkGameOver(winner) {
      const st = this.state;
      if (this.scores[0] <= 0 || this.scores[1] <= 0) {
        this.over = true;
        this.emit();
        return;
      }
      if (st.roundNo >= this.opts.maxRounds) {
        this.over = true;
        this.emit();
        return;
      }
    }

    /* ------------------------------------------------------- 下一局 / 重开 */
    nextRound() {
      const st = this.state;
      if (st && st.result && st.result.type !== 'draw') {
        this.dealer = st.result.winner;       // 赢家坐庄
      }
      if (this.over) return this;
      this.startRound();
      return this;
    }

    /* ------------------------------------------------------------ 工具 */
    stateFor(pi) {
      // 给 UI 用的视角信息
      const st = this.state;
      return st;
    }
  }

  return { Game: Game };
});
