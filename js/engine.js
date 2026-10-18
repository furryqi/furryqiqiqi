/* ============================================================================
 *  双人麻将 · 规则引擎  engine.js
 *  规则依据：手写规则表（见 ../规则说明.md）
 *
 *  牌库：八张花（万能/癞子）+ 万（1~9）+ 字（东南西北中发白），每张 4 枚
 *        共 4*16 + 8 = 72 张
 *  起胡：6 番        初始：双方各 20000 分
 * ==========================================================================*/
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.MJEngine = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /* ---------------------------------------------------------------- 牌的编码 */
  // 0..8   一万..九万
  // 9..15  东 南 西 北 中 发 白
  // 16..23 花：春 夏 秋 冬 梅 兰 竹 菊（摸到即亮出 → 补花，不进手牌）
  // 24     癞子（万能牌，4 张，单独一种牌）
  const FLOWER_BASE = 16;
  const FLOWER_END = 24;
  const WILD = 24;
  const TYPE_COUNT = 25;
  const CN_NUM = ['一', '二', '三', '四', '五', '六', '七', '八', '九'];
  const CN_HONOR = ['東', '南', '西', '北', '中', '發', '白'];   // 牌面用繁体
  const CN_FLOWER = ['春', '夏', '秋', '冬', '梅', '兰', '竹', '菊'];

  const WIND_START = 9, WIND_END = 12;      // 东南西北
  const DRAGON_START = 13, DRAGON_END = 15; // 中发白

  const isFlower = (t) => t >= FLOWER_BASE && t < WILD;
  const isWild = (t) => t === WILD;
  const isHonor = (t) => t >= 9 && t < FLOWER_BASE;
  const isWind = (t) => t >= WIND_START && t <= WIND_END;
  const isDragon = (t) => t >= DRAGON_START && t <= DRAGON_END;
  const isSuit = (t) => t >= 0 && t < 9;

  function tileLabel(t) {
    if (t === WILD) return '癞子';
    if (t >= FLOWER_BASE) return '花' + CN_FLOWER[t - FLOWER_BASE];
    if (t >= 9) return CN_HONOR[t - 9];
    return CN_NUM[t] + '万';
  }
  function tileShort(t) {
    if (t === WILD) return '癞';
    if (t >= FLOWER_BASE) return CN_FLOWER[t - FLOWER_BASE];
    if (t >= 9) return CN_HONOR[t - 9];
    return CN_NUM[t];
  }

  /* -------------------------------------------------------------- 牌库 / 工具 */
  function buildDeck(jokerCount) {
    const n = jokerCount == null ? 4 : Math.max(0, Math.min(16, jokerCount | 0));
    const d = [];
    for (let t = 0; t < 16; t++) for (let i = 0; i < 4; i++) d.push(t);
    for (let t = 16; t < 24; t++) d.push(t);    // 8 张花
    for (let i = 0; i < n; i++) d.push(WILD);   // 可配置张数的癞子
    return d;                                   // 默认 76 张
  }
  function shuffle(arr, rnd) {
    rnd = rnd || Math.random;
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(rnd() * (i + 1));
      const tmp = arr[i]; arr[i] = arr[j]; arr[j] = tmp;
    }
    return arr;
  }
  function countsOf(tiles) {
    const c = new Array(TYPE_COUNT).fill(0);
    for (let i = 0; i < tiles.length; i++) c[tiles[i]]++;
    return c;
  }
  const sumArr = (c) => { let s = 0; for (let i = 0; i < c.length; i++) s += c[i]; return s; };
  const sortTiles = (a, b) => a - b;
  function sumFlowers(c) {
    let n = 0;
    for (let t = FLOWER_BASE; t < FLOWER_END; t++) n += c[t];
    return n;
  }
  function sumWilds(c) { return c[WILD] || 0; }

  /* ------------------------------------------------------------ 番种总表 */
  const FAN_LIST = [
    { id: 'qingyise', name: '清一色', fan: 3, group: '色类', desc: '全部由万子组成' },
    { id: 'ziyise', name: '字一色', fan: 12, group: '色类', desc: '全部由字牌组成' },
  
    { id: 'jianke', name: '箭刻', fan: 1, group: '喜类', desc: '中/发/白的刻子，每个 1 番' },
    { id: 'xiaosanyuan', name: '小三元', fan: 8, group: '喜类', desc: '两组箭刻 + 第三种箭牌作将' },
    { id: 'dasanyuan', name: '大三元', fan: 24, group: '喜类', desc: '中发白三组刻子' },
    { id: 'sanfeng', name: '三风', fan: 8, group: '喜类', desc: '三个风刻' },
    { id: 'xiaosixi', name: '小四喜', fan: 24, group: '喜类', desc: '三组风刻 + 第四种风牌作将' },
    { id: 'dasixi', name: '大四喜', fan: 36, group: '喜类', desc: '东南西北四组刻子' },

    { id: 'qidui', name: '七对', fan: 6, group: '七对类', desc: '七个对子' },
    { id: 'sanyuanqidui', name: '三元七对', fan: 16, group: '七对类', desc: '七对中含中发白三对' },
    { id: 'sixiqidui', name: '四喜七对', fan: 24, group: '七对类', desc: '七对中含东南西北四对' },
    { id: 'daqixing', name: '大七星', fan: 48, group: '七对类', desc: '7 个对子正好是东南西北中发白各一对' },
    { id: 'lianqidui', name: '连七对', fan: 48, group: '七对类', desc: '七个连号对子（如 1~7 万）' },

    { id: 'shuanganke', name: '双暗刻', fan: 3, group: '刻子类', desc: '两个暗刻（碰出的、点炮补成的刻子都不算暗刻）' },
    { id: 'sananke', name: '三暗刻', fan: 8, group: '刻子类', desc: '三个暗刻（暗杠算，点炮补成的那副算明刻）' },
    { id: 'sianke', name: '四暗刻', fan: 36, group: '刻子类', desc: '四个暗刻（自摸才是四暗刻；点炮补成的那副算明刻）' },
    { id: 'sanlianke', name: '三连刻', fan: 8, group: '刻子类', desc: '三个连号刻子（如 111 222 333）' },
    { id: 'silianke', name: '四连刻', fan: 24, group: '刻子类', desc: '四个连号刻子（如 111 222 333 444）' },

    { id: 'gang1', name: '杠', fan: 1, group: '杠类', desc: '一个杠' },
    { id: 'gang2', name: '双杠', fan: 3, group: '杠类', desc: '两个杠' },
    { id: 'gang3', name: '三杠', fan: 8, group: '杠类', desc: '三个杠' },
    { id: 'gang4', name: '四杠', fan: 36, group: '杠类', desc: '四个杠' },

    { id: 'yitiaolong', name: '一条龙', fan: 3, group: '顺子类', desc: '同花色 1~9 三副顺子' },
    { id: 'santongshun', name: '三同顺', fan: 8, group: '顺子类', desc: '三副相同顺子' },
    { id: 'sitongshun', name: '四同顺', fan: 48, group: '顺子类', desc: '四副相同顺子' },
  { id: 'yibangao', name: '一般高', fan: 1, group: '顺子类', desc: '两组相同的顺子（如 123 + 123，含吃出来的）' },
  { id: 'sanbugao', name: '三步高', fan: 8, group: '顺子类', desc: '同花色三副顺子依次递增 1 或 2（123+234+345 或 123+345+567）' },
  { id: 'sibugao', name: '四步高', fan: 24, group: '顺子类', desc: '同花色四副顺子依次递增 1 或 2（123+234+345+456 或 123+345+567+789）' },

    { id: 'hua2', name: '花牌', fan: 1, group: '花牌类', desc: '2 张以上花牌' },
    { id: 'hua4', name: '花牌', fan: 3, group: '花牌类', desc: '4 张以上花牌' },
    { id: 'hua6', name: '花牌', fan: 6, group: '花牌类', desc: '6 张以上花牌' },
    { id: 'hua8', name: '全花', fan: 16, group: '花牌类', desc: '八张花牌全收' },

    { id: 'jiulian', name: '九莲宝灯', fan: 36, group: '其他', desc: '万子 1112345678999 + 任意一张万' },
    { id: 'shuanglong', name: '双龙会', fan: 36, group: '其他', desc: '一色双龙会：两组 123 + 两组 789，五万作将' },
    { id: 'dayu5', name: '大于五', fan: 24, group: '其他', desc: '全部是 6~9 万' },
    { id: 'xiaoyu5', name: '小于五', fan: 24, group: '其他', desc: '全部是 1~4 万' },
    { id: 'tianhu', name: '天胡', fan: 36, group: '其他', desc: '庄家起手天胡' },
    { id: 'dihu', name: '地胡', fan: 24, group: '其他', desc: '闲家第一次摸牌即胡' },
    { id: 'renhu', name: '人胡', fan: 18, group: '其他', desc: '闲家胡庄家第一张打出的牌' },
    { id: 'tianting', name: '天听', fan: 12, group: '其他', desc: '庄家起手就听牌（摸到的那张直接打出）' },
    { id: 'haidi', name: '海底捞月', fan: 3, group: '其他', desc: '摸最后一张牌自摸' },
    { id: 'haidipao', name: '海底炮', fan: 3, group: '其他', desc: '胡最后一张打出的牌' },
    { id: 'gangshang', name: '杠上开花', fan: 3, group: '其他', desc: '杠后补牌自摸' },
    { id: 'gangpao', name: '杠上炮', fan: 3, group: '其他', desc: '杠后打出的牌被胡' },
    { id: 'qianggang', name: '抢杠', fan: 3, group: '其他', desc: '抢他人加杠之牌胡' },
    { id: 'baoting', name: '报听', fan: 1, group: '其他', desc: '报听后胡牌' },
    { id: 'zimo', name: '自摸', fan: 1, group: '其他', desc: '自己摸到和牌' },

    { id: 'pengpeng', name: '碰碰胡', fan: 3, group: '副类', desc: '全部是刻子/杠' },
    { id: 'quanqiuren', name: '全求人', fan: 3, group: '副类', desc: '四副全部吃碰，单钓将' },
    { id: 'buqiuren', name: '不求人', fan: 3, group: '副类', desc: '门前清且自摸' },
    { id: 'menqing', name: '门清', fan: 1, group: '副类', desc: '没有吃碰明杠' },
    { id: 'siguiyi', name: '四归一', fan: 1, group: '副类', desc: '暗牌中有四张相同的牌（未开杠），癞子可以顶第 4 张' },
    { id: 'hujuezhang', name: '胡绝张', fan: 1, group: '副类', desc: '所胡之牌桌上已现 3 张（不含自己手牌）' },
    { id: 'kanzhang', name: '坎张', fan: 1, group: '副类', desc: '中间的牌作眼（如 3 万在 2~4 万中间）' },
    { id: 'bianzhang', name: '边张', fan: 1, group: '副类', desc: '边上的牌作眼（如 123 等 3、789 等 7）' },
    { id: 'duandiao', name: '单钓', fan: 1, group: '副类', desc: '单钓将牌作眼' },
    { id: 'hunquandaiyao', name: '混全带幺', fan: 3, group: '副类', desc: '每组都带幺九或字牌，且有字牌' },
    { id: 'chunquandaiyao', name: '纯全带幺', fan: 12, group: '副类', desc: '每组都带幺九，无字牌' },
    { id: 'chunyaojiu', name: '纯幺九', fan: 8, group: '副类', desc: '全部由幺九牌与字牌组成' },
    /* ---------------- 梗番（彩蛋，可在设置里关闭） ---------------- */
    { id: 'meme114514', name: '1145141919810', fan: 48, group: '梗番',
      desc: '111111445899 + 白板 + 任意一张幺九（彩蛋番，可在设置里关闭）' },
    { id: 'zijiu99', name: '字九种九牌', fan: 20, group: '梗番',
      desc: '111999 + 东南西北中发白各一张 + 任意一张幺九（彩蛋番，可在设置里关闭）' },
    { id: 'alljoker', name: '666还有破解版', fan: Infinity, group: '梗番',
      desc: '整手 14 张全是癞子，番数与分数都是 ∞' },
    { id: 'suixinpei', name: '随心配吧', fan: 216, group: '梗番',
      desc: '整手 12 张癞子（其余 2 张随意）' },
    { id: 'wanneng', name: '万能胡', fan: 108, group: '梗番',
      desc: '整手 9 张癞子（其余 5 张随意）' },
    { id: 'ziyou', name: '基本自由胡', fan: 72, group: '梗番',
      desc: '整手 6 张癞子（其余 8 张随意）' },
  ];
  const FAN_MAP = {};
  FAN_LIST.forEach((f) => { FAN_MAP[f.id] = f; });

  /* ------------------------------------------------------------ 分值换算表 */
  const SCORE_TABLE = [
    { max: 3, score: 200 },          // 1~3 番
    { max: 5, score: 300 },          // 4~5 番
    { max: 7, score: 500 },
    { max: 9, score: 1000 },
    { max: 11, score: 1600 },
    { max: 13, score: 2200 },
    { max: 15, score: 3000 },
    { max: 20, score: 4500 },
    { max: 25, score: 6300 },
    { max: 30, score: 9000 },
    { max: 40, score: 12000 },
    { max: 50, score: 15000 },
    { max: 60, score: 18000 },
    { max: 70, score: 21000 },
    { max: 80, score: 25000 },
    { max: Infinity, score: 30000 },
  ];
  let MIN_FAN = 6;                        // 起胡番（可通过 setMinFan 调整）
  function setMinFan(n) {
    MIN_FAN = Math.max(1, Math.min(30, n | 0));
    return MIN_FAN;
  }
  function getMinFan() { return MIN_FAN; }
  function fanToScore(fan, minFan) {
    if (fan < (minFan == null ? MIN_FAN : minFan)) return 0;
    for (let i = 0; i < SCORE_TABLE.length; i++) if (fan <= SCORE_TABLE[i].max) return SCORE_TABLE[i].score;
    return 30000;
  }

  /* ============================================================
   *  一、和牌结构拆分（支持癞子）
   * ==========================================================*/

  function enumMelds(c, jokers, need, acc, out) {
    if (need === 0) {
      if (jokers === 0 && sumArr(c) === 0) out.push(acc.slice());
      return;
    }
    let t = -1;
    for (let i = 0; i < 16; i++) if (c[i] > 0) { t = i; break; }

    if (t === -1) {                    // 只剩癞子
      if (jokers === 3 * need) {
        const emit = (types) => {
          for (let k = 0; k < need; k++) acc.push({ kind: 'tri', t: types[k], wilds: 3 });
          out.push(acc.slice());
          for (let k = 0; k < need; k++) acc.pop();
        };
        // 1) 全部补成同一种牌（纯幺九、清一色等）
        for (let tt = 0; tt < 16; tt++) emit(new Array(need).fill(tt));
        // 2) 补成各种字牌组合（大四喜 / 大三元 / 字一色 这些需要不同的字）
        if (need >= 2) {
          const combo = [];
          const rec = (start, left) => {
            if (left === 0) { emit(combo.slice()); return; }
            for (let tt = start; tt < 16; tt++) {
              combo.push(tt);
              rec(tt, left - 1);
              combo.pop();
            }
          };
          rec(9, need);
        }
      }
      return;
    }

    // 1) 刻子（至少 1 张真牌）
    const maxReal = Math.min(3, c[t]);
    for (let r = maxReal; r >= 1; r--) {
      const w = 3 - r;
      if (jokers < w) continue;
      c[t] -= r;
      acc.push({ kind: 'tri', t: t, wilds: w });
      enumMelds(c, jokers - w, need - 1, acc, out);
      acc.pop();
      c[t] += r;
    }

    // 2) 含 t 的顺子（仅万子）
    if (t < 9) {
      for (let s = Math.max(0, t - 2); s <= Math.min(6, t); s++) {
        const posT = t - s;
        const others = [0, 1, 2].filter((p) => p !== posT);
        for (let mask = 0; mask < 4; mask++) {
          const useJ0 = (mask & 1) ? 1 : 0;
          const useJ1 = (mask & 2) ? 1 : 0;
          const w = useJ0 + useJ1;
          if (w > jokers) continue;
          if (!useJ0 && c[s + others[0]] <= 0) continue;
          if (!useJ1 && c[s + others[1]] <= 0) continue;
          c[t]--;
          if (!useJ0) c[s + others[0]]--;
          if (!useJ1) c[s + others[1]]--;
          acc.push({ kind: 'seq', t: s, wilds: w });
          enumMelds(c, jokers - w, need - 1, acc, out);
          acc.pop();
          c[t]++;
          if (!useJ0) c[s + others[0]]++;
          if (!useJ1) c[s + others[1]]++;
        }
      }
    }
  }

  function enumerateStandard(counts16, jokers, needMelds) {
    const out = [];
    const seen = new Set();
    const c = counts16.slice();
    const pairCands = [];
    for (let t = 0; t < 16; t++) {
      if (c[t] >= 2) pairCands.push({ t: t, wilds: 0 });
      else if (c[t] === 1 && jokers >= 1) pairCands.push({ t: t, wilds: 1 });
    }
    if (jokers >= 2) for (let t = 0; t < 16; t++) if (c[t] === 0) pairCands.push({ t: t, wilds: 2 });

    for (const pair of pairCands) {
      const cc = c.slice();
      if (pair.wilds === 1) cc[pair.t] -= 1;
      else if (pair.wilds === 0) cc[pair.t] -= 2;
      const jl = jokers - pair.wilds;
      const melds = [];
      const res = [];
      enumMelds(cc, jl, needMelds, melds, res);
      for (const sets of res) {
        const key = sets.map((s) => s.kind + s.t + 'w' + s.wilds).sort().join('|') + '#' + pair.t + 'w' + pair.wilds;
        if (seen.has(key)) continue;
        seen.add(key);
        out.push({ sets: sets, pair: { t: pair.t, wilds: pair.wilds }, sevenPairs: false });
      }
    }
    return out;
  }

  function enumeratSevenPairs(counts16, jokers) {
    const total = sumArr(counts16) + jokers;
    if (total !== 14) return [];
    const pairs = [];
    const singles = [];
    for (let t = 0; t < 16; t++) {
      let n = counts16[t];
      while (n >= 2) { pairs.push({ t: t, wilds: 0 }); n -= 2; }
      if (n === 1) singles.push(t);
    }
    let j = jokers;
    const res = pairs.slice();
    for (const t of singles) {
      if (j > 0) { res.push({ t: t, wilds: 1 }); j--; } else return [];
    }
    const wildPairs = Math.floor(j / 2);
    if (j % 2 !== 0) return [];
    if (res.length + wildPairs !== 7) return [];
    if (wildPairs === 0) return [{ sets: [], pair: null, sevenPairs: true, pairs: res }];
    // 纯癞子对子的点数可以任选，这里对「字牌」和「万子」各给一种，取高分
    const out = [];
    for (let rep = 9; rep <= 15; rep++) {
      const rr = res.slice();
      for (let k = 0; k < wildPairs; k++) rr.push({ t: rep, wilds: 2 });
      out.push({ sets: [], pair: null, sevenPairs: true, pairs: rr });
      if (rep === 9) rep = 15;            // 先 9(东) 再跳到 15(白) 覆盖字牌，最后补万子
    }
    for (let rep = 0; rep <= 8; rep += 8) {
      const rr = res.slice();
      for (let k = 0; k < wildPairs; k++) rr.push({ t: rep, wilds: 2 });
      out.push({ sets: [], pair: null, sevenPairs: true, pairs: rr });
    }
    return out;
  }

  /* ============================================================
   *  二、等待形判定（单钓 / 坎张 / 边张）
   * ==========================================================*/
  function detectWait(struct, winTile) {
    if (!struct) return 'none';
    if (struct.sevenPairs) return 'none';      // 七对不计单钓
    for (const s of struct.sets) {
      if (s.kind === 'tri' && s.t === winTile) continue;
      if (s.kind === 'seq' && s.t <= winTile && winTile <= s.t + 2) {
        const pos = winTile - s.t;
        if (pos === 1) return 'kanzhang';
        if (pos === 0 && s.t === 6) return 'bianzhang';
        if (pos === 2 && s.t === 0) return 'bianzhang';
      }
    }
    if (struct.pair && struct.pair.t === winTile) return 'duandiao';
    return 'none';
  }

  /* ============================================================
   *  三、番数计算
   * ==========================================================*/
  function setTiles(s) {
    if (s.kind === 'tri') return [s.t, s.t, s.t];
    if (s.kind === 'kan') return [s.t, s.t, s.t, s.t];
    if (s.kind === 'pair') return [s.t, s.t];
    return [s.t, s.t + 1, s.t + 2];
  }

  function computeFans(struct, melds, ctx) {
    const fans = [];
    const add = (id) => {
      const f = FAN_MAP[id];
      if (f) fans.push({ id: f.id, name: f.name, fan: f.fan, group: f.group });
    };
    melds = melds || [];

    const sets = [];
    melds.forEach((m) => {
      const kind = (m.kind === 'kan' || m.kind === 'ankan') ? 'kan' : (m.kind === 'chi' ? 'seq' : 'tri');
      sets.push({ kind: kind, t: m.tiles[0], wilds: 0, concealed: m.kind === 'ankan' });
    });
    const isSevenPairs = !!struct.sevenPairs;

    // 点炮胡的那一张，如果能放进顺子/将里，就放在那里；只能落在刻子里的话，
    // 那副刻子就是「明刻」，不算暗刻。
    let ronTripletT = null;
    if (!isSevenPairs && !ctx.flags.tsumo && ctx.flags.winTile != null) {
      const wt = ctx.flags.winTile;
      const groups = struct.sets.concat([struct.pair]);
      const inTri = groups.some((g) => g.kind === 'tri' && g.t === wt);
      const inOther = groups.some((g) =>
        (g.kind === 'seq' && wt >= g.t && wt <= g.t + 2) ||
        (g.kind === 'pair' && g.t === wt));
      if (inTri && !inOther) ronTripletT = wt;
    }

    if (isSevenPairs) {
      struct.pairs.forEach((p) => sets.push({ kind: 'pair', t: p.t, wilds: p.wilds }));
    } else {
      struct.sets.forEach((s) => sets.push({
        kind: s.kind,
        t: s.t,
        wilds: s.wilds,
        concealed: !(ronTripletT != null && s.kind === 'tri' && s.t === ronTripletT),
      }));
      sets.push({ kind: 'pair', t: struct.pair.t, wilds: struct.pair.wilds, concealed: true });
    }

    const tileList = [];
    sets.forEach((s) => { setTiles(s).forEach((tt) => tileList.push(tt)); });
    tileList.sort(sortTiles);

    const seqSets = sets.filter((s) => s.kind === 'seq');
    const triSets = sets.filter((s) => s.kind === 'tri' || s.kind === 'kan');
    const pairSet = sets.find((s) => s.kind === 'pair');

    /* ---- 1. 色类 ---- */
    const allHonor = tileList.every((t) => t >= 9 && t < 16);
    const allSuit = tileList.every((t) => t < 9);
    // 大七星（七对是七种字牌各一对）本身已经包含字一色，不再重复计
    const honorPairTypes = isSevenPairs
      ? new Set(struct.pairs.filter((x) => x.t >= 9 && x.t < 16).map((x) => x.t)).size : 0;
    const isDaqixing = honorPairTypes === 7;
    if (allHonor && !isDaqixing) add('ziyise');
    // 九莲宝灯本身就是一色，不再重复计清一色
    const isJiulian = (() => {
      if (!allSuit || isSevenPairs) return false;
      const nc = countsOf(tileList);
      const need = [3, 1, 1, 1, 1, 1, 1, 1, 3];
      for (let i = 0; i < 9; i++) if (nc[i] < need[i]) return false;
      return true;
    })();
    const isDaYu5 = tileList.every((t) => t >= 5 && t < 9);
    const isXiaoYu5 = tileList.every((t) => t <= 3);
    // 双龙会（一色双龙会）：两组 123 + 两组 789，五万作将
    const isShuanglong = (() => {
      if (isSevenPairs || !allSuit) return false;
      const sk = seqSets.map((x) => x.t);
      const c123 = sk.filter((k) => k === 0).length;
      const c789 = sk.filter((k) => k === 6).length;
      return c123 >= 2 && c789 >= 2 && pairSet && pairSet.t === 4;
    })();
    if (allSuit && !isJiulian && !isDaYu5 && !isXiaoYu5 && !isShuanglong) add('qingyise');

    /* ---- 2. 喜类 ---- */
    const dragonTris = triSets.filter((s) => isDragon(s.t));
    const windTris = triSets.filter((s) => isWind(s.t));
    const pairT = pairSet ? pairSet.t : -1;
    if (dragonTris.length >= 3) add('dasanyuan');
    else if (dragonTris.length === 2 && pairSet && isDragon(pairT) &&
             !dragonTris.some((s) => s.t === pairT)) {
      // 小三元要求「将」是第三种箭牌，不能和已有的箭刻重复
      add('xiaosanyuan');
    } else { for (let i = 0; i < dragonTris.length; i++) add('jianke'); }
    if (windTris.length >= 4) add('dasixi');
    else if (windTris.length === 3 && pairSet && isWind(pairT) &&
             !windTris.some((s) => s.t === pairT)) {
      // 小四喜同理：将是第四种风牌
      add('xiaosixi');
    } else if (windTris.length >= 3) add('sanfeng');

    /* ---- 3. 七对类 ---- */
    if (isSevenPairs) {
      const pairTs = struct.pairs.map((p) => p.t);
      const hasAllDragons = [13, 14, 15].every((d) => pairTs.indexOf(d) >= 0);
      const windPairs = [9, 10, 11, 12].filter((w) => pairTs.indexOf(w) >= 0).length;
      // 字牌对子要「种类」够，不能靠同一张牌凑两对
      const honorTypes = new Set(pairTs.filter((t) => t >= 9 && t < 16)).size;
      // 连七对：数字对子 + 癞子对，能凑成同一花色连续 7 个数即可
      const wildPairCount = struct.pairs.filter((p) => (p.wilds || 0) >= 2).length;
      const numPairTs = struct.pairs
        .filter((p) => (p.wilds || 0) < 2 && p.t < 9)
        .map((p) => p.t);
      let isLian = false;
      if (numPairTs.length > 0 && numPairTs.length + wildPairCount === 7) {
        const set = new Set(numPairTs);
        for (let start = 0; start <= 2 && !isLian; start++) {
          let need = 0, inside = true;
          for (let v = start; v < start + 7; v++) if (!set.has(v)) need++;
          for (const v of set) if (v < start || v > start + 6) { inside = false; break; }
          if (inside && need === wildPairCount) isLian = true;
        }
      }
      // 七对类取最高的一种（不叠加）
      if (honorTypes === 7) add('daqixing');
      else if (isLian) {
        add('lianqidui');
        // 连七对本身就一色，不再重复计清一色
        for (let i = fans.length - 1; i >= 0; i--) if (fans[i].id === 'qingyise') fans.splice(i, 1);
      }
      else if (windPairs >= 4) add('sixiqidui');
      else if (hasAllDragons) add('sanyuanqidui');
      else add('qidui');
    }

    /* ---- 4. 刻子类 ---- */
    if (!isSevenPairs) {
      const anKe = triSets.filter((s) => s.concealed).length;
      if (anKe >= 4) add('sianke');
      else if (anKe === 3) add('sananke');
      else if (anKe === 2) add('shuanganke');

      // 连号刻子：按编号排序去重，找最长连续段（保留 kind，用来判断有没有杠）
      const numTriSets = triSets.filter((s) => s.t < 9).slice().sort((a, b) => a.t - b.t);
      const uniqTris = [];
      numTriSets.forEach((s) => {
        if (!uniqTris.length || uniqTris[uniqTris.length - 1].t !== s.t) uniqTris.push(s);
      });
      let bestRunSets = [];
      for (let i = 0; i < uniqTris.length; i++) {
        const run = [uniqTris[i]];
        for (let k = i + 1; k < uniqTris.length; k++) {
          if (uniqTris[k].t === run[run.length - 1].t + 1) run.push(uniqTris[k]);
          else break;
        }
        if (run.length > bestRunSets.length) bestRunSets = run;
      }
      // 连号刻子按「分高的算法」记：111 222 333 = 三连刻（配合三暗刻 16 番 > 三同顺 8 番）
      if (bestRunSets.length >= 4) add('silianke');
      else if (bestRunSets.length === 3) add('sanlianke');
    }

    /* ---- 5. 杠类 ---- */
    const kanCount = melds.filter((m) => m.kind === 'kan' || m.kind === 'ankan').length;
    if (kanCount >= 4) add('gang4');
    else if (kanCount === 3) add('gang3');
    else if (kanCount === 2) add('gang2');
    else if (kanCount === 1) add('gang1');

    /* ---- 6. 顺子类 ---- */
    if (!isSevenPairs) {
      const seqKeys = seqSets.map((s) => s.t);
      const cnt = {};
      seqKeys.forEach((k) => { cnt[k] = (cnt[k] || 0) + 1; });
      let maxSame = 0;
      for (const k in cnt) if (cnt[k] > maxSame) maxSame = cnt[k];
      if (maxSame >= 4) add('sitongshun');
      else if (maxSame === 3) add('santongshun');
      else if (maxSame === 2 && !isShuanglong) add('yibangao');   // 一般高：两组相同顺子（双龙会不计）
      const has = (n) => seqKeys.indexOf(n) >= 0;
      if (has(0) && has(3) && has(6)) add('yitiaolong');

      // 三步高 / 四步高：同花色顺子依次递增 1 或 2
      //   步长 2：123 345 567（+789）    步长 1：123 234 345（+456）
      let bugao4 = false;
      for (let st = 0; st <= 6 && !bugao4; st++) {
        if (has(st) && has(st + 1) && has(st + 2) && has(st + 3)) bugao4 = true;
        else if (has(st) && has(st + 2) && has(st + 4) && has(st + 6)) bugao4 = true;
      }
      if (bugao4) {
        add('sibugao');
      } else {
        for (let st = 0; st <= 6; st++) {
          if (has(st) && has(st + 1) && has(st + 2)) { add('sanbugao'); break; }
          if (has(st) && has(st + 2) && has(st + 4)) { add('sanbugao'); break; }
        }
      }
    }

    /* ---- 7. 花牌类 ---- */
    const f = ctx.flowerCount;
    if (f >= 8) add('hua8');
    else if (f >= 6) add('hua6');
    else if (f >= 4) add('hua4');
    else if (f >= 2) add('hua2');

    /* ---- 8. 其他 ---- */
    if (melds.length === 0) {                    // 九莲宝灯
      const nc = [0, 0, 0, 0, 0, 0, 0, 0, 0];
      let onlyNum = true;
      tileList.forEach((t) => { if (t < 9) nc[t]++; else onlyNum = false; });
      if (onlyNum) {
        const need = [3, 1, 1, 1, 1, 1, 1, 1, 3];
        let ok = true;
        for (let i = 0; i < 9; i++) if (nc[i] < need[i]) ok = false;
        if (ok) add('jiulian');
      }
    }
    // 双龙会（一色双龙会）：两组 123 + 两组 789，五万作将
    if (isShuanglong) add('shuanglong');
    const allNum = tileList.every((t) => t < 9);
    if (allNum && tileList.every((t) => t >= 5)) add('dayu5');
    else if (allNum && tileList.every((t) => t <= 3)) add('xiaoyu5');
    if (ctx.flags.tianhu) add('tianhu');
    if (ctx.flags.dihu) add('dihu');
    if (ctx.flags.renhu) add('renhu');
    if (ctx.flags.tianting) add('tianting');
    if (ctx.flags.haidi) add(ctx.flags.tsumo ? 'haidi' : 'haidipao');
    if (ctx.flags.gangshang) add('gangshang');
    if (ctx.flags.gangpao) add('gangpao');
    if (ctx.flags.qianggang) add('qianggang');
    if (ctx.flags.baoting && !ctx.flags.tianting) add('baoting');   // 天听已包含报听，不重复计
    const menqingTsumo = (!(melds.length) || melds.every((m) => m.kind === 'ankan')) && ctx.flags.tsumo;
    // 已经算「不求人」时不再重复算「自摸」
    if (ctx.flags.tsumo && !menqingTsumo) add('zimo');

    /* ---- 9. 副类 ---- */
    // 大四喜 / 四暗刻 必然全是刻子，不再重复计碰碰胡
    const isDaSiXi = windTris.length >= 4;
    const isSiAnKe = !isSevenPairs && triSets.filter((s) => s.concealed).length >= 4;
    if (!isSevenPairs && seqSets.length === 0 && !isDaSiXi && !isSiAnKe) add('pengpeng');
    const exposed = melds.filter((m) => m.kind !== 'ankan');
    // 天胡已经包含「门清自摸」，不求人 / 门清 / 自摸 都不再另计
    if (exposed.length === 0 && !ctx.flags.tianhu) {
      // 不求人 = 门清 + 自摸，取代「门清」「自摸」两项
      // 七对本身必然是门清，不再重复计「门清」
      if (ctx.flags.tsumo) add('buqiuren');
      else if (!isSevenPairs && !isJiulian && !isShuanglong) add('menqing');
    }
    // 全求人：四副都是吃/碰/明杠（暗杠不算），单钓将，且必须点炮胡（全靠别人）
    if (melds.length === 4 && melds.every((m) => m.kind !== 'ankan') &&
        ctx.flags.waitType === 'duandiao' && !ctx.flags.tsumo) add('quanqiuren');

    const cc = countsOf(ctx.concealedTiles || []);
    const wildCount = (ctx.concealedTiles || []).filter((t) => t === WILD).length;
    // 拆法里的各组（含七对的对子），用来判断癞子到底补成了哪张牌
    const groups = (struct.sets || [])
      .concat(struct.pairs || [], struct.pair ? [struct.pair] : []);
    for (let t = 0; t < 16; t++) {
      if (cc[t] >= 4) { add('siguiyi'); break; }
      // 手里 3 张 + 癞子：只有癞子确实被当成这张牌时，才算四归一
      if (cc[t] === 3 && wildCount > 0) {
        const usedAsThis = groups.some((g) => g.t === t && (g.wilds || 0) > 0);
        if (usedAsThis) { add('siguiyi'); break; }
      }
    }
    if (ctx.flags.juezhang) add('hujuezhang');
    // 等牌类型：坎张 / 边张 / 单钓 分别记
    // 四杠时必然是单钓（只剩一张将），不再重复计
    const wt = ctx.flags.waitType;
    if (wt === 'kanzhang') add('kanzhang');
    else if (wt === 'bianzhang') add('bianzhang');
    else if (wt === 'duandiao' && kanCount < 4) add('duandiao');

    const hasHonorTile = tileList.some((t) => t >= 9);
    const setHasYao = (s) => setTiles(s).some((t) => (t < 9 && (t === 0 || t === 8)) || t >= 9);
    const allSetsYao = sets.every(setHasYao);
    const allYaoTiles = tileList.every((t) => (t < 9 && (t === 0 || t === 8)) || t >= 9);
    // 字一色 已经包含「全是幺九字牌」，不再重复计幺九系列
    if (allHonor) { /* 字一色：不计纯幺九 / 纯全带幺 / 混全带幺 */ }
    else if (allYaoTiles) add('chunyaojiu');
    else if (allSetsYao && !hasHonorTile) add('chunquandaiyao');
    else if (allSetsYao && hasHonorTile) add('hunquandaiyao');

    return fans;
  }

  /* ============================================================
   *  四、和牌判定 / 计分
   * ==========================================================*/
  function needMeldsOf(melds) { return 4 - ((melds || []).length); }

  function isWinShape(concealedTiles, melds) {
    const c = countsOf(concealedTiles);
    const jokers = sumWilds(c);
    const counts16 = c.slice(0, 16);
    const need = needMeldsOf(melds);
    if (need < 0) return false;
    const total = sumArr(counts16) + jokers;
    if (total !== 3 * need + 2) return false;
    if (need === 0) {
      // 只剩将牌：必须「两张相同 / 一张实牌 + 一张癞子 / 两张癞子」
      if (jokers === 2) return true;
      if (jokers === 1) return sumArr(counts16) === 1;
      for (let t = 0; t < 16; t++) if (counts16[t] >= 2) return true;
      return false;
    }
    if (enumerateStandard(counts16, jokers, need).length) return true;
    if (need === 4 && enumeratSevenPairs(counts16, jokers).length) return true;
    return false;
  }

  /**
   * 计算一副和牌（自动取番数最高的拆法）
   * @param {number[]} concealedTiles 暗牌（含所和之牌）
   * @param {Array} melds 副露
   * @param {object} flags {tsumo, waitType, flowerCount, tianhu, ...}
   */
  /**
   * 梗番：111111445899 + 白板 + 任意一张幺九  ->  1145141919810
   * 牌型本身不成普通面子，属于彩蛋，命中直接按 48 番算和牌。
   */
  let memeEnabled = true;           // 梗番是否允许出现（设置里可关）
  function setMemeEnabled(v) { memeEnabled = v !== false; }
  function getMemeEnabled() { return memeEnabled; }

  function isMeme114514(c, melds) {
    if (!memeEnabled) return false;
    if (melds && melds.length) return false;
    const want = { 0: 6, 3: 2, 4: 1, 7: 1, 8: 2, 15: 1 };   // 一×6 四×2 五×1 八×1 九×2 白×1
    const wilds = c[WILD] || 0;                             // 癞子可以补任意缺的张
    let realTotal = 0, missing = 0, extra = 0, extraOk = true;
    for (let t = 0; t < 16; t++) {
      const n = c[t] || 0;
      if (t === WILD) continue;
      realTotal += n;
      const need = want[t] || 0;
      if (n <= need) missing += need - n;
      else {                                                  // 多出来的只能是幺九
        extra += n - need;
        if (!((t === 0 || t === 8) || (t >= 9 && t < 16))) extraOk = false;
      }
    }
    if (realTotal + wilds !== 14) return false;
    if (extra > 1 || !extraOk) return false;
    // 缺的张 + 那 1 张幺九 都由癞子补，必须正好用完
    return missing + (1 - extra) === wilds;
  }

  /**
   * 梗番：字九种九牌 —— 一萬×3 + 九萬×3 + 七种字牌各一张 + 任意一张幺九
   * 也是彩蛋，牌型本身不成普通面子；癞子可以补缺张。
   */
  function isZijiuJiu(c, melds) {
    if (!memeEnabled) return false;
    if (melds && melds.length) return false;
    const want = new Array(16).fill(0);
    want[0] = 3;                       // 一萬 ×3
    want[8] = 3;                       // 九萬 ×3
    for (let t = 9; t < 16; t++) want[t] = 1;   // 七种字牌各一张
    const isYao = (t) => t === 0 || t === 8 || (t >= 9 && t < 16);
    let realTotal = 0, missing = 0, extra = 0, extraOk = true;
    for (let t = 0; t < 16; t++) {
      const n = c[t] || 0;
      realTotal += n;
      const need = want[t];
      if (n <= need) missing += need - n;
      else {
        extra += n - need;             // 多出来的只能是幺九牌
        if (!isYao(t)) extraOk = false;
      }
    }
    const wilds = c[WILD] || 0;
    if (realTotal + wilds !== 14) return false;
    if (extra > 1 || !extraOk) return false;
    // 缺的张 + 那 1 张幺九，全由癞子补，必须正好用完
    return missing + (1 - extra) === wilds;
  }

  /**
   * 梗番可以和「按局面给的番」叠加：天胡/地胡/人胡、天听/报听、自摸(不求人)、
   * 杠上开花/杠上炮/抢杠、花牌类。牌型类番（清一色、一条龙等）不参与。
   */
  function memeExtraFans(c, flags, flowerCount) {
    const out = [];
    const push = (id) => { const f = FAN_MAP[id]; if (f) out.push({ id: f.id, name: f.name, fan: f.fan, group: f.group }); };
    if (flags.tianhu) push('tianhu');
    else if (flags.dihu) push('dihu');
    else if (flags.renhu) push('renhu');
    if (flags.tianting) push('tianting');
    else if (flags.baoting) push('baoting');
    if (flags.tsumo && !flags.tianhu) push('buqiuren');      // 门清自摸
    if (flags.gangkai) push('gangkai');
    if (flags.gangpao) push('gangpao');
    if (flags.qianggang) push('qianggang');
    if (flags.haidi) push('haidi');
    if (flags.haidipao) push('haidipao');
    const f2 = flowerCount | 0;
    if (f2 >= 8) push('hua8');
    else if (f2 >= 6) push('hua6');
    else if (f2 >= 4) push('hua4');
    else if (f2 >= 2) push('hua2');
    return out;
  }

  /** 梗番：整手 6 张癞子（另外 8 张随意） */
  function isZiyou(c, melds) {
    if (!memeEnabled) return false;
    if (melds && melds.length) return false;
    return (c[WILD] || 0) === 6;
  }

  /** 梗番：整手 9 张癞子（另外 5 张随意） */
  function isWanNeng(c, melds) {
    if (!memeEnabled) return false;
    if (melds && melds.length) return false;
    return (c[WILD] || 0) === 9;
  }

  /** 梗番：整手 12 张癞子（另外 2 张随意） */
  function isSuixinPei(c, melds) {
    if (!memeEnabled) return false;
    if (melds && melds.length) return false;
    return (c[WILD] || 0) === 12;
  }

  /** 梗番：整手 14 张全是癞子 */
  function isAllJoker(c, melds) {
    if (!memeEnabled) return false;
    if (melds && melds.length) return false;
    return (c[WILD] || 0) === 14;
  }

  function evaluateStandard(concealedTiles, melds, flags) {
    flags = flags || {};
    melds = melds || [];
    const c = countsOf(concealedTiles);
    const flowerCount = flags.flowerCount != null ? flags.flowerCount : sumFlowers(c);
    const jokers = sumWilds(c);
    // 整手没有癞子（或者唯一那张癞子就是自己胡的那张）：起胡番减半，最终点数再 ×2
    const noJoker = jokers === 0 || (jokers === 1 && flags.winTile === WILD);
    const minFan = noJoker ? Math.ceil(MIN_FAN / 2) : MIN_FAN;
    const counts16 = c.slice(0, 16);
    const need = needMeldsOf(melds);
    const total = sumArr(counts16) + jokers;
    if (need < 0 || total !== 3 * need + 2) return { fan: 0, fans: [], score: 0, best: null };

    let structs = [];
    if (need === 0) {
      let pairT = -1, wilds = 0;
      for (let t = 0; t < 16; t++) if (counts16[t] >= 2) { pairT = t; break; }
      if (pairT < 0 && jokers === 1) {          // 一张实牌 + 一张癞子
        for (let t = 0; t < 16; t++) if (counts16[t] === 1) { pairT = t; wilds = 1; break; }
      }
      if (pairT < 0 && jokers === 2 && sumArr(counts16) === 0) { pairT = 9; wilds = 2; }
      if (pairT >= 0) structs = [{ sets: [], pair: { t: pairT, wilds: wilds }, sevenPairs: false }];
    } else {
      structs = enumerateStandard(counts16, jokers, need);
      if (need === 4) structs = structs.concat(enumeratSevenPairs(counts16, jokers));
    }
    if (!structs.length) return { fan: 0, fans: [], score: 0, best: null };

    let best = null;
    for (const st of structs) {
      const wt = detectWait(st, flags.winTile);
      const fl = Object.assign({}, flags, { waitType: wt });
      const fans = computeFans(st, melds, {
        flowerCount: flowerCount,
        jokerCount: jokers,
        flags: fl,
        concealedTiles: concealedTiles,
      });
      let fan = 0;
      fans.forEach((x) => { fan += x.fan; });
      if (!best || fan > best.fan) best = { fan: fan, fans: fans, struct: st, waitType: wt };
    }
    return {
      fan: best.fan,
      fans: best.fans,
      scoreBase: best.fan >= minFan ? fanToScore(best.fan, minFan) : 0,
      score: best.fan >= minFan ? fanToScore(best.fan, minFan) : 0,
      minFan: minFan,
      noJoker: noJoker,
      best: best.struct,
      waitType: best.waitType,
    };
  }

  /**
   * 对外入口：梗番和普通牌型各算一遍，取番数更高的那个。
   * 这样一堆癞子既能算梗番，也能按 大四喜 + 四暗刻 之类的普通牌型算。
   */
  function evaluateWin(concealedTiles, melds, flags) {
    const f = flags || {};
    const m = melds || [];
    const c = countsOf(concealedTiles);
    const cands = [];
    if (isAllJoker(c, m)) cands.push(FAN_MAP.alljoker);
    if (isSuixinPei(c, m)) cands.push(FAN_MAP.suixinpei);
    if (isWanNeng(c, m)) cands.push(FAN_MAP.wanneng);
    if (isZiyou(c, m)) cands.push(FAN_MAP.ziyou);
    if (isMeme114514(c, m)) cands.push(FAN_MAP.meme114514);
    if (isZijiuJiu(c, m)) cands.push(FAN_MAP.zijiu99);
    let memeFan = null;
    cands.forEach((f) => { if (!memeFan || f.fan > memeFan.fan) memeFan = f; });

    const std = evaluateStandard(concealedTiles, m, f);
    if (!memeFan) return std;

    const fl = f.flowerCount != null ? f.flowerCount : sumFlowers(c);
    const fans = [{ id: memeFan.id, name: memeFan.name, fan: memeFan.fan, group: memeFan.group }]
      .concat(memeExtraFans(c, f, fl));
    let total = 0;
    fans.forEach((x) => { total += x.fan; });
    const infinite = memeFan.id === 'alljoker';
    const memeRes = {
      fan: total, fans: fans,
      scoreBase: infinite ? Infinity : fanToScore(total, MIN_FAN),
      score: infinite ? Infinity : fanToScore(total, MIN_FAN),
      minFan: MIN_FAN, noJoker: false, best: null, waitType: 'none',
      meme: true,
    };
    if (infinite) memeRes.infinite = true;
    if (std && std.fan > total) return std;   // 普通牌型番数更高就按普通牌型算
    return memeRes;
  }

  /* ============================================================
   *  五、向听数
   * ==========================================================*/
  function shantenStandard(counts16, baseMelds) {
    const c = counts16.slice(0, 16);
    let best = 8;
    function rec(i, m, p, pair) {
      if (m + baseMelds > 4) return;
      if (m + p + pair > 5) return;
      while (i < 16 && c[i] === 0) i++;
      if (i >= 16) {
        const mm = Math.min(4, m + baseMelds);
        const pp = Math.min(p, 4 - mm);
        const sh = 8 - 2 * mm - pp - (pair ? 1 : 0);
        if (sh < best) best = sh;
        return;
      }
      if (c[i] >= 3) { c[i] -= 3; rec(i, m + 1, p, pair); c[i] += 3; }
      if (i <= 6 && c[i + 1] > 0 && c[i + 2] > 0) {
        c[i]--; c[i + 1]--; c[i + 2]--;
        rec(i, m + 1, p, pair);
        c[i]++; c[i + 1]++; c[i + 2]++;
      }
      if (!pair && c[i] >= 2) { c[i] -= 2; rec(i, m, p, true); c[i] += 2; }
      if (c[i] >= 2) { c[i] -= 2; rec(i, m, p + 1, pair); c[i] += 2; }
      if (i <= 7 && c[i + 1] > 0) { c[i]--; c[i + 1]--; rec(i, m, p + 1, pair); c[i]++; c[i + 1]++; }
      if (i <= 6 && c[i + 2] > 0) { c[i]--; c[i + 2]--; rec(i, m, p + 1, pair); c[i]++; c[i + 2]++; }
      c[i]--; rec(i, m, p, pair); c[i]++;
    }
    rec(0, 0, 0, false);
    return best;
  }

  function shantenSevenPairs(counts16, jokers) {
    let pairs = 0, singles = 0;
    for (let t = 0; t < 16; t++) { pairs += Math.floor(counts16[t] / 2); singles += counts16[t] % 2; }
    let j = jokers;
    const use = Math.min(j, singles); pairs += use; j -= use;
    pairs += Math.floor(j / 2);
    if (pairs > 7) pairs = 7;
    return 6 - pairs;
  }

  function shanten(tiles, melds) {
    const c = countsOf(tiles);
    const jokers = sumWilds(c);
    const base = (melds || []).length;
    const counts16 = c.slice(0, 16);
    let best = 99;

    function evalConcrete(cc) {
      let s = shantenStandard(cc, base);
      if (base === 0) s = Math.min(s, shantenSevenPairs(cc, 0));
      return s;
    }
    if (jokers === 0) return evalConcrete(counts16);
    if (jokers <= 4) {
      const assign = (t, left) => {
        if (t === 16) { if (left === 0) { const s = evalConcrete(counts16); if (s < best) best = s; } return; }
        for (let k = 0; k <= left; k++) {
          if (counts16[t] + k > 4) break;
          counts16[t] += k;
          assign(t + 1, left - k);
          counts16[t] -= k;
        }
      };
      assign(0, jokers);
      return best;
    }
    let s = shantenStandard(counts16, base);
    s = Math.max(-1, s - Math.floor(jokers / 2));
    return s;
  }

  /* ============================================================
   *  六、听牌
   * ==========================================================*/
  function waits(tiles, melds) {
    const res = [];
    for (let t = 0; t < 16; t++) if (isWinShape(tiles.concat([t]), melds)) res.push(t);
    return res;
  }

  return {
    FLOWER_BASE, FLOWER_END, WILD, TYPE_COUNT, CN_NUM, CN_HONOR, CN_FLOWER,
    isFlower, isWild, isHonor, isWind, isDragon, isSuit,
    tileLabel, tileShort, buildDeck, shuffle, countsOf, sumFlowers, sumWilds, sumArr,
    FAN_LIST, FAN_MAP, SCORE_TABLE, fanToScore, setMinFan, getMinFan,
    enumerateStandard, enumeratSevenPairs, computeFans, detectWait,
    isWinShape, evaluateWin, shanten, waits, setTiles, needMeldsOf,
    setMemeEnabled, getMemeEnabled,
    isMemeWin: (tiles, melds) => {
      if (melds && melds.length) return false;
      const c = countsOf(tiles);
      return isMeme114514(c, melds) || isZijiuJiu(c, melds) ||
        isAllJoker(c, melds) || isSuixinPei(c, melds) ||
        isWanNeng(c, melds) || isZiyou(c, melds);
    },
  };
});
