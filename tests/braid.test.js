import assert from 'node:assert/strict';
import {
  parseRecord,
  normalizeLetters,
  canonicalKey,
  chainTokens,
  analyzeRecords,
  factorWord,
  inducedPermutation,
  MAX_FIBERS,
  MAX_SYMBOLS,
} from '../web/engine.js';
import { artinEqual } from './artin-oracle.js';

let passed = 0;
let failed = 0;
const failures = [];

function test(name, fn) {
  try {
    fn();
    passed += 1;
  } catch (e) {
    failed += 1;
    failures.push({ name, error: e });
    console.error(`✗ ${name}\n  ${e.stack.split('\n').slice(0, 3).join('\n  ')}`);
  }
}

function keyOf(text, n) {
  const p = parseRecord(text, n);
  assert.ok(p.ok, p.error?.message);
  return canonicalKey(normalizeLetters(p.letters, n));
}
const equiv = (n, a, b) => keyOf(a, n) === keyOf(b, n);

// ---------------------------------------------------------------------------
// 业务样例（同步辐射光纤束路复核场景）
// ---------------------------------------------------------------------------

test('样例1 四纤: σ1σ3 与 σ3σ1 等价（远交换），两侧规范链一致', () => {
  const r = analyzeRecords(4, 'σ1 σ3', 'σ3 σ1');
  assert.equal(r.status, 'equivalent');
  assert.equal(r.equivalent, true);
  assert.equal(r.divergence, null);
  assert.deepEqual(r.a.tokens, r.b.tokens);
  assert.ok(r.a.tokens.length >= 1);
});

test('样例1 补充: 远交换在三纤(σ1σ2)上必须不等价', () => {
  const r = analyzeRecords(3, 'σ1 σ2', 'σ2 σ1');
  assert.equal(r.equivalent, false);
  assert.ok(r.divergence);
});

test('样例2 四纤: σ1σ2σ1 与 σ2σ1σ2 等价（三项编织关系）', () => {
  const r = analyzeRecords(4, 'σ1 σ2 σ1', 'σ2 σ1 σ2');
  assert.equal(r.equivalent, true);
  assert.deepEqual(r.a.tokens.map((t) => t.key), r.b.tokens.map((t) => t.key));
});

test('样例3 两纤: σ1σ1 与空记录必须判定不等价，含分歧信息', () => {
  const r = analyzeRecords(2, 'σ1 σ1', '');
  assert.equal(r.status, 'inequivalent');
  assert.equal(r.equivalent, false);
  assert.ok(r.divergence, '必须报告首个分歧因子');
  // 空记录是恒等：Δ^0，无其他因子；σ1² 为 Δ^2 (B_2)
  assert.deepEqual(r.b.tokens.map((t) => t.label), ['Δ^0']);
  assert.notDeepEqual(r.a.tokens.map((t) => t.label), r.b.tokens.map((t) => t.label));
});

test('关键防线: 诱导置换相同不得被判为等价', () => {
  // σ1σ1 与 空记录在 B_2 中诱导置换都是恒等
  const a = parseRecord('σ1 σ1', 2);
  const e = parseRecord('', 2);
  assert.deepEqual(inducedPermutation(a.letters, 2), [1, 2]);
  assert.deepEqual(inducedPermutation(e.letters, 2), [1, 2]);
  assert.equal(equiv(2, 'σ1 σ1', ''), false);

  // σ1²σ2² 与 σ2²σ1²（B3）诱导置换均恒等，但一般不等价
  assert.equal(equiv(3, 'σ1 σ1 σ2 σ2', 'σ2 σ2 σ1 σ1'), false);
  // σ1 σ2² σ1 与 σ2 σ1² σ2 在 B3 诱导置换相同吗？检查后再确认不等价
  assert.equal(equiv(3, 'σ1 σ2 σ2 σ1', 'σ2 σ1 σ1 σ2'), false);
});

test('逆元精确处理: σ1 σ1^-1 = 恒等 = 空记录', () => {
  assert.equal(equiv(3, 'σ1 σ1^-1', ''), true);
  assert.equal(equiv(3, 'σ1 σ2 σ2^-1 σ1^-1', ''), true);
  assert.equal(equiv(4, 'σ2^-1 σ2', ''), true);
});

test('逆元与编织混合: σ1^-1 σ2 σ1 = σ2 σ1 σ2^-1（共轭关系变形）', () => {
  // σ1^-1 σ2 σ1 = σ2 σ1 σ2^-1  由 σ1^-1 σ2 σ1 = σ2 σ1 σ2^-1 (braid 推导)
  assert.equal(equiv(3, 'σ1^-1 σ2 σ1', 'σ2 σ1 σ2^-1'), true);
});

test('半扭 Δ: B3 中 σ1σ2σ1 = Δ，Δ² 为全扭（中心）', () => {
  const p = parseRecord('σ1 σ2 σ1', 3);
  const nf = normalizeLetters(p.letters, 3);
  assert.equal(nf.delta, 1);
  assert.equal(nf.factors.length, 0);
  // 全扭 Δ²
  assert.equal(equiv(3, 'σ1 σ2 σ1 σ1 σ2 σ1', 'σ2 σ1 σ2 σ2 σ1 σ2'), true);
  // 中心元与一切交换
  assert.equal(equiv(3, 'σ1 σ2 σ1 σ1 σ2 σ1 σ1', 'σ1 σ1 σ2 σ1 σ1 σ2 σ1'), true);
});

test('n 不影响子辫群判定: 记录嵌入更高 n 结论一致', () => {
  for (const n of [3, 4, 6]) {
    assert.equal(equiv(n, 'σ1 σ2 σ1', 'σ2 σ1 σ2'), true);
    assert.equal(equiv(n, 'σ1 σ1', ''), false);
  }
});

test('规范因子链展示: 因子标签为简化正字分解', () => {
  const p = parseRecord('σ1 σ3', 4);
  const nf = normalizeLetters(p.letters, 4);
  const labels = chainTokens(nf).map((t) => t.label);
  assert.ok(labels.includes('σ1σ3') || labels.includes('σ3σ1'));
  // 置换编织 σ1σ3 的标签是 σ1σ3（两交换不相交，字唯一）
  assert.ok(factorWord(nf.factors[0]).length > 0);
});

// ---------------------------------------------------------------------------
// 输入校验
// ---------------------------------------------------------------------------

test('空输入: 两条记录皆空 → 定位错误并清除结论', () => {
  const r = analyzeRecords(4, '', '');
  assert.equal(r.status, 'invalid');
  assert.ok(r.errors.some((e) => e.kind === 'empty'));
  assert.equal(r.equivalent, undefined);
});

test('发生器越界: n=3 时 σ3 被定位', () => {
  const p = parseRecord('σ1 σ3', 3);
  assert.equal(p.ok, false);
  assert.equal(p.error.kind, 'range');
  assert.ok(p.error.index >= 0);
  const r = analyzeRecords(3, 'σ1 σ3', 'σ1');
  assert.equal(r.status, 'invalid');
});

test('n 边界: 二至六根；n=2 只有 σ1', () => {
  assert.equal(parseRecord('σ1', 2).ok, true);
  assert.equal(parseRecord('σ2', 2).ok, false);
  assert.equal(parseRecord('σ5', 6).ok, true);
  assert.equal(parseRecord('σ6', 6).ok, false);
  assert.equal(parseRecord('σ1', 1).ok, false);
  assert.equal(parseRecord('σ1', 7).ok, false);
});

test('长度限制: 超过 80 个符号被定位', () => {
  const long81 = Array.from({ length: 81 }, (_, i) => `σ${(i % 2) + 1}`).join(' ');
  const p = parseRecord(long81, 3);
  assert.equal(p.ok, false);
  assert.equal(p.error.kind, 'too-long');
  const ok80 = Array.from({ length: 80 }, () => 'σ1').join(' ');
  assert.equal(parseRecord(ok80, 3).ok, true);
});

test('词法错误被定位（未知字符、缺编号、非法指数）', () => {
  assert.equal(parseRecord('σx', 3).ok, false);
  assert.equal(parseRecord('σ', 3).error.kind, 'index');
  assert.equal(parseRecord('σ1^2', 3).error.kind, 'exponent');
  assert.equal(parseRecord('σ1^a', 3).ok, false);
});

test('支持多种书写: 负号/花括号指数/上标/sigma 前缀/中文分隔', () => {
  assert.equal(equiv(4, 'σ1 σ3', 's3 s1'), true);
  assert.equal(equiv(3, 'sigma1 sigma2 sigma1', 'σ2σ1σ2'), true);
  assert.equal(equiv(3, 'σ1⁻¹ σ1', ''), true);
  assert.equal(equiv(3, 'σ1^{-1}，σ2，σ2^{-1}，σ1', ''), true);
});

// ---------------------------------------------------------------------------
// 性质测试：独立 Artin 表示 Oracle
// ---------------------------------------------------------------------------

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function randomWord(rnd, n, len) {
  const parts = [];
  for (let i = 0; i < len; i += 1) {
    const g = 1 + Math.floor(rnd() * (n - 1));
    const inv = rnd() < 0.35 ? '^-1' : '';
    parts.push(`σ${g}${inv}`);
  }
  return parts.join(' ');
}

// 在辫群中做已知保持相等的局部改写
function braidRewrite(word, rnd, n) {
  const insertFree = (w) => {
    const g = 1 + Math.floor(rnd() * (n - 1));
    const pos = Math.floor(rnd() * (w.length + 1));
    return [...w.slice(0, pos), g, -g, ...w.slice(pos)];
  };
  const insertBraid = (w) => {
    if (n < 3) return insertFree(w);
    const g = 1 + Math.floor(rnd() * (n - 2));
    const rel = rnd() < 0.5 ? [g, g + 1, g] : [g + 1, g, g + 1];
    const alt = rnd() < 0.5 ? [g + 1, g, g + 1] : [g, g + 1, g];
    const target = rel;
    for (let start = 0; start + 3 <= w.length; start += 1) {
      if (w.slice(start, start + 3).every((v, i) => v === target[i])) {
        return [...w.slice(0, start), ...alt, ...w.slice(start + 3)];
      }
    }
    return insertFree(w);
  };
  let w = word;
  const rounds = 1 + Math.floor(rnd() * 3);
  for (let i = 0; i < rounds; i += 1) {
    w = rnd() < 0.5 ? insertFree(w) : insertBraid(w);
  }
  return w;
}

function lettersToText(w) {
  return w.map((g) => (g > 0 ? `σ${g}` : `σ${-g}^-1`)).join(' ');
}
function parseLetters(text, n) {
  const p = parseRecord(text, n);
  if (!p.ok) throw new Error(p.error.message);
  return p.letters.map((l) => (l.sign === 1 ? l.gen + 1 : -(l.gen + 1)));
}

test('性质: 随机词与局部改写词 — 引擎判定与 Artin Oracle 完全一致', () => {
  const rnd = mulberry32(20260925);
  let checked = 0;
  for (let iter = 0; iter < 400; iter += 1) {
    const n = 2 + Math.floor(rnd() * (MAX_FIBERS - 1));
    const len = Math.floor(rnd() * 24);
    const w1 = parseLetters(randomWord(rnd, n, len), n);
    let text2;
    if (rnd() < 0.6) text2 = lettersToText(braidRewrite(w1.slice(), rnd, n));
    else text2 = randomWord(rnd, n, len + Math.floor(rnd() * 4) - 2);
    const text1 = lettersToText(w1);
    const oracle = artinEqual(text1, text2, n);
    const engine = equiv(n, text1, text2);
    assert.equal(engine, oracle, `n=${n}: "${text1}" vs "${text2}"`);
    checked += 1;
  }
  assert.ok(checked === 400);
});

test('性质: 随机独立词对误判率为 0（相对 Oracle）', () => {
  const rnd = mulberry32(42);
  for (let iter = 0; iter < 200; iter += 1) {
    const n = 2 + Math.floor(rnd() * 3);
    const a = randomWord(rnd, n, 6 + Math.floor(rnd() * 10));
    const b = randomWord(rnd, n, 6 + Math.floor(rnd() * 10));
    assert.equal(equiv(n, a, b), artinEqual(a, b, n));
  }
});

test('性质: 80 符号边界内随机词 Oracle 一致', () => {
  const rnd = mulberry32(7);
  for (let iter = 0; iter < 30; iter += 1) {
    const n = 3;
    const w = parseLetters(randomWord(rnd, n, 70), n);
    const w2 = braidRewrite(w.slice(), rnd, n);
    assert.ok(w2.length <= 80, `改写后 ${w2.length} 个符号超出上限`);
    assert.equal(equiv(n, lettersToText(w), lettersToText(w2)), true);
    assert.equal(artinEqual(lettersToText(w), lettersToText(w2), n), true);
  }
});

test('确定性: 同一输入多次计算结果完全一致', () => {
  for (let i = 0; i < 10; i += 1) {
    const k1 = keyOf('σ1^-1 σ2 σ2 σ1 σ3 σ2^-1', 4);
    const k2 = keyOf('σ1^-1 σ2 σ2 σ1 σ3 σ2^-1', 4);
    assert.equal(k1, k2);
  }
});

// ---------------------------------------------------------------------------

console.log(`\n${failed === 0 ? '✅' : '❌'} 通过 ${passed} 项，失败 ${failed} 项`);
if (failed > 0) process.exit(1);
