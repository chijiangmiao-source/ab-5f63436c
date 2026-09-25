// Braid group equivalence engine.
//
// Exact decision procedure: Garside left greedy normal form for B_n.
// Every braid word has a UNIQUE normal form
//
//     Delta^k . f_1 . f_2 ... f_l
//
// where Delta is the Garside half-twist, every f_i is a non-trivial
// proper simple braid (permutation braid), and consecutive factors are
// left-weighted, i.e.  rightComplement(f_i) gcd_L f_{i+1} = 1.
//
// Simple braids are represented by their induced permutations (arrays
// p with p[i] = image of strand i, 0-based).  All arithmetic is exact;
// the algorithm is deterministic and terminating (no random rewrites,
// no bounded trial-and-error, and the induced permutation is NEVER used
// for the equivalence decision).

export const MIN_FIBERS = 2;
export const MAX_FIBERS = 6;
export const MAX_SYMBOLS = 80;

const SIGMA_CHARS = new Set(['σ', 's', 'S']);
const SUPERSCRIPT = {
  '⁰': '0', '¹': '1', '²': '2', '³': '3',
  '⁴': '4', '⁵': '5', '⁶': '6', '⁷': '7',
  '⁸': '8', '⁹': '9', '⁻': '-', '⁺': '+',
};

function isWhitespace(ch) {
  return ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r'
    || ch === ' ' || ch === '　'
    || ch === ',' || ch === '，' || ch === '、' || ch === ';';
}

function err(kind, index, message) {
  return { ok: false, error: { kind, index, message } };
}

// Parse one record into letters [{gen: 0-based, sign: 1|-1, start, end}].
// Accepted generator spellings (per record, fixed strand count n):
//   σ1  s1  S1  sigma1   σ1^-1   σ1^{-1}   σ1⁻¹   -σ1   +σ2
// Separators: whitespace, comma, Chinese comma/enumeration comma, semicolon.
export function parseRecord(text, n) {
  if (!Number.isInteger(n) || n < MIN_FIBERS || n > MAX_FIBERS) {
    return err('fibers', 0, `光纤根数 n 必须是 ${MIN_FIBERS}–${MAX_FIBERS} 之间的整数`);
  }
  const src = String(text ?? '');
  const letters = [];
  let i = 0;

  while (i < src.length) {
    while (i < src.length && isWhitespace(src[i])) i += 1;
    if (i >= src.length) break;

    const tokenStart = i;
    let sign = 1;

    // Optional leading sign.
    if (src[i] === '-' || src[i] === '−' || src[i] === '+') {
      if (src[i] !== '+') sign = -1;
      i += 1;
      while (i < src.length && (src[i] === ' ' || src[i] === ' ' || src[i] === '\t')) i += 1;
    }

    // Generator symbol.
    if (i >= src.length || !SIGMA_CHARS.has(src[i])) {
      return err('unexpected', tokenStart,
        `第 ${tokenStart + 1} 个字符处无法识别：应为发生器 σ（也可写 s 或 sigma）`);
    }
    if (src[i] === 's' || src[i] === 'S') {
      const rest = src.slice(i + 1, i + 5);
      if (/^igma/i.test(rest)) i += 5;
      else i += 1;
    } else {
      i += 1;
    }

    // Generator index.
    const digitStart = i;
    while (i < src.length && src[i] >= '0' && src[i] <= '9') i += 1;
    if (i === digitStart) {
      return err('index', i, `第 ${i + 1} 个字符处缺少发生器编号（σ 后须跟 1–${n - 1} 的数字）`);
    }
    const gen = Number(src.slice(digitStart, i));

    // Optional exponent: ^-1 / ^{+1} / unicode superscripts.
    let exponent = 1;
    if (src[i] === '^') {
      i += 1;
      let brace = false;
      if (src[i] === '{') { brace = true; i += 1; }
      let expSign = 1;
      if (src[i] === '-' || src[i] === '−') { expSign = -1; i += 1; }
      else if (src[i] === '+') { i += 1; }
      const expDigitStart = i;
      while (i < src.length && src[i] >= '0' && src[i] <= '9') i += 1;
      if (i === expDigitStart) {
        return err('exponent', i, `第 ${i + 1} 个字符处指数缺失：仅允许 ^1 或 ^-1`);
      }
      exponent = Number(src.slice(expDigitStart, i));
      if (expSign === -1) exponent = -exponent;
      if (brace) {
        if (src[i] !== '}') return err('exponent', i, `第 ${i + 1} 个字符处缺少右花括号`);
        i += 1;
      }
    } else if (SUPERSCRIPT[src[i]] !== undefined) {
      let collected = '';
      while (SUPERSCRIPT[src[i]] !== undefined) {
        collected += SUPERSCRIPT[src[i]];
        i += 1;
      }
      const value = Number(collected);
      if (!Number.isInteger(value)) {
        return err('exponent', tokenStart, `第 ${tokenStart + 1} 个字符处上标无法识别`);
      }
      exponent = value;
    }

    if (exponent !== 1 && exponent !== -1) {
      return err('exponent', tokenStart,
        `第 ${tokenStart + 1} 个字符处 σ${gen}^${exponent} 不允许：发生器指数只能为 +1 或 -1`);
    }
    if (gen < 1 || gen > n - 1) {
      return err('range', tokenStart,
        `第 ${tokenStart + 1} 个字符处 σ${gen} 越界：n=${n} 根光纤时有效发生器为 σ1–σ${n - 1}`);
    }

    letters.push({ gen: gen - 1, sign: sign * exponent, start: tokenStart, end: i });
  }

  if (letters.length > MAX_SYMBOLS) {
    const t = letters[MAX_SYMBOLS];
    return err('too-long', t.start,
      `记录含 ${letters.length} 个发生器符号，超过上限 ${MAX_SYMBOLS}（第 ${MAX_SYMBOLS + 1} 个符号位于第 ${t.start + 1} 个字符）`);
  }

  return { ok: true, letters };
}

// ---------------------------------------------------------------------------
// Permutation helpers (simple braids = permutation braids).
// Product a·b means "a first, then b"; permutation arrays compose as b∘a.
// ---------------------------------------------------------------------------

function identityPerm(n) {
  const p = new Array(n);
  for (let i = 0; i < n; i += 1) p[i] = i;
  return p;
}

function reversalPerm(n) {
  const p = new Array(n);
  for (let i = 0; i < n; i += 1) p[i] = n - 1 - i;
  return p;
}

function generatorPerm(j, n) {
  const p = identityPerm(n);
  p[j] = j + 1;
  p[j + 1] = j;
  return p;
}

// Braid product a·b (a applied first): result[i] = b[a[i]].
function product(a, b) {
  const r = new Array(a.length);
  for (let i = 0; i < a.length; i += 1) r[i] = b[a[i]];
  return r;
}

function inversePerm(a) {
  const r = new Array(a.length);
  for (let i = 0; i < a.length; i += 1) r[a[i]] = i;
  return r;
}

function permEqual(a, b) {
  for (let i = 0; i < a.length; i += 1) if (a[i] !== b[i]) return false;
  return true;
}

// Right complement: s · ∂(s) = Δ, so ∂(s) = w0 ∘ s^{-1}.
function rightComplement(s, n) {
  const inv = inversePerm(s);
  const r = new Array(n);
  for (let i = 0; i < n; i += 1) r[i] = n - 1 - inv[i];
  return r;
}

// Δ-conjugation τ: Δ s = τ(s) Δ, τ(σ_j) = σ_{n-2-j}.
// On permutations: τ(p) = w0 ∘ p ∘ w0, i.e. τ(p)[i] = n-1-p[n-1-i].
function tau(s, n) {
  const r = new Array(n);
  for (let i = 0; i < n; i += 1) r[i] = n - 1 - s[n - 1 - i];
  return r;
}

// Greatest common LEFT divisor of two simple braids.
// σ_j left-divides simple s iff j is a descent of the permutation s
// (s[j] > s[j+1]); extract shared descents, smallest index first, which
// builds the unique lattice gcd deterministically.
function leftGcd(a, b, n) {
  const ra = a.slice();
  const rb = b.slice();
  let g = identityPerm(n);
  for (;;) {
    let j = -1;
    for (let k = 0; k < n - 1; k += 1) {
      if (ra[k] > ra[k + 1] && rb[k] > rb[k + 1]) { j = k; break; }
    }
    if (j === -1) return g;
    const tj = generatorPerm(j, n);
    // Residuals a = g·r become r ← r ∘ σ_j: swap entries at positions j,j+1.
    const x = ra[j]; ra[j] = ra[j + 1]; ra[j + 1] = x;
    const y = rb[j]; rb[j] = rb[j + 1]; rb[j + 1] = y;
    // g ← g · σ_j, permutation σ_j ∘ g.
    g = product(g, tj);
  }
}

// Canonical positive word for a simple braid: repeatedly take the smallest
// generator in the starting set. Deterministic reduced decomposition.
export function factorWord(s) {
  const n = s.length;
  const r = s.slice();
  const parts = [];
  for (;;) {
    let j = -1;
    for (let k = 0; k < n - 1; k += 1) {
      if (r[k] > r[k + 1]) { j = k; break; }
    }
    if (j === -1) break;
    parts.push(`σ${j + 1}`);
    const x = r[j]; r[j] = r[j + 1]; r[j + 1] = x;
  }
  return parts.join('');
}

// ---------------------------------------------------------------------------
// Normal form
// ---------------------------------------------------------------------------

// Insert one simple factor at the right end of a factor list,
// absorbing identity / Δ.  P·Δ = Δ·τ^{-1}(P) and τ is an involution.
function pushSimple(list, s, state, n) {
  const w0 = reversalPerm(n);
  if (permEqual(s, identityPerm(n))) return;
  if (permEqual(s, w0)) {
    state.delta += 1;
    for (let i = 0; i < list.length; i += 1) list[i] = tau(list[i], n);
    return;
  }
  list.push(s);
}

export function normalizeLetters(letters, n) {
  const w0 = reversalPerm(n);
  const state = { delta: 0 };
  let factors = [];

  for (const letter of letters) {
    if (letter.sign === 1) {
      // σ_j
      pushSimple(factors, generatorPerm(letter.gen, n), state, n);
    } else {
      // σ_j^{-1} = ∂(σ_j) · Δ^{-1}.  Moving Δ^{-1} to the front applies
      // τ to every factor already accumulated and to the new complement:
      //   F · ∂σ_j · Δ^{-1} = Δ^{-1} · τ(F) · τ(∂σ_j).
      state.delta -= 1;
      factors = factors.map((s) => tau(s, n));
      const comp = rightComplement(generatorPerm(letter.gen, n), n);
      pushSimple(factors, tau(comp, n), state, n);
    }
  }

  // Left greedy normalisation.  For an adjacent pair (a, b), move
  // c = ∂(a) ∧_L b from b onto a; this preserves the braid, keeps both
  // new factors simple, and strictly shifts length toward earlier
  // factors (a terminating greedy process).  The pass cap is only a
  // safety net: each extraction strictly increases the prefix infimum,
  // so at most O(L^2) passes can occur for L letters.
  const MAX_PASSES = 100000;
  let passes = 0;
  for (;;) {
    passes += 1;
    if (passes > MAX_PASSES) {
      const e = new Error('规范化未能在安全步数内结束（输入可能异常复杂）');
      e.kind = 'internal';
      throw e;
    }
    let changed = false;
    for (let i = 0; i + 1 < factors.length; i += 1) {
      const a = factors[i];
      const b = factors[i + 1];
      const c = leftGcd(rightComplement(a, n), b, n);
      if (permEqual(c, identityPerm(n))) continue;
      changed = true;
      const cInv = inversePerm(c);
      const a2 = product(a, c);     // a · c
      const b2 = product(cInv, b);  // c^{-1} · b
      if (permEqual(a2, w0)) {
        // a · c = Δ: absorb.  Moving this Δ left across the prefix
        // conjugates each earlier factor by τ.
        state.delta += 1;
        for (let j = 0; j < i; j += 1) factors[j] = tau(factors[j], n);
        factors.splice(i, 2, b2);   // remove Δ, keep transformed right factor
        if (permEqual(b2, identityPerm(n))) factors.splice(i, 1);
      } else {
        factors[i] = a2;
        factors[i + 1] = b2;
        if (permEqual(b2, identityPerm(n))) factors.splice(i + 1, 1);
      }
    }
    factors = factors.filter((s) => !permEqual(s, identityPerm(n)) && !permEqual(s, w0));
    if (!changed) break;
  }

  return { delta: state.delta, factors, n };
}

export function normalizeRecord(text, n) {
  const parsed = parseRecord(text, n);
  if (!parsed.ok) {
    const e = new Error(parsed.error.message);
    e.kind = parsed.error.kind;
    e.index = parsed.error.index;
    throw e;
  }
  return normalizeLetters(parsed.letters, n);
}

// Induced permutation (strand permutation). Supplementary information only:
// equal permutations do NOT imply equal braids.
export function inducedPermutation(letters, n) {
  let p = identityPerm(n);
  for (const { gen } of letters) {
    const t = generatorPerm(gen, n);
    p = product(p, t); // sign does not matter: σ and σ^{-1} induce same transposition
  }
  return p.map((x) => x + 1);
}

export function canonicalKey(nf) {
  return `${nf.delta}|${nf.factors.map((f) => f.join('.')).join('|')}`;
}

// Display token stream: Δ-power first, then canonical factors.
// Token keys are used for locating the first divergence.
export function chainTokens(nf) {
  const tokens = [{
    kind: 'delta',
    key: `Δ:${nf.delta}`,
    label: `Δ^${nf.delta}`,
    perm: null,
  }];
  for (const f of nf.factors) {
    tokens.push({
      kind: 'factor',
      key: f.join('.'),
      label: factorWord(f),
      perm: f.map((x) => x + 1),
    });
  }
  return tokens;
}

// First position at which two canonical chains differ, or null if equal.
export function firstDivergence(nfA, nfB) {
  const ta = chainTokens(nfA);
  const tb = chainTokens(nfB);
  const len = Math.max(ta.length, tb.length);
  for (let i = 0; i < len; i += 1) {
    const a = ta[i] || null;
    const b = tb[i] || null;
    if (!a || !b || a.key !== b.key) {
      return { index: i, a: a && a.label, b: b && b.label };
    }
  }
  return null;
}

// Full review of two records. A single empty record is the identity braid.
// Both records empty is an input error (nothing to review).
export function analyzeRecords(n, textA, textB) {
  const pa = parseRecord(textA, n);
  const pb = parseRecord(textB, n);
  const errors = [];
  if (!pa.ok) errors.push({ record: 'A', ...pa.error });
  if (!pb.ok) errors.push({ record: 'B', ...pb.error });
  if (pa.ok && pb.ok && pa.letters.length === 0 && pb.letters.length === 0) {
    errors.push({ record: 'A', kind: 'empty', index: 0, message: '两条记录均为空，没有可复核的束路记录' });
  }
  if (errors.length > 0) return { status: 'invalid', errors };

  const nfA = normalizeLetters(pa.letters, n);
  const nfB = normalizeLetters(pb.letters, n);
  const keyA = canonicalKey(nfA);
  const keyB = canonicalKey(nfB);
  const equivalent = keyA === keyB;

  return {
    status: equivalent ? 'equivalent' : 'inequivalent',
    equivalent,
    n,
    a: {
        tokens: chainTokens(nfA),
        key: keyA,
        permutation: inducedPermutation(pa.letters, n),
        symbolCount: pa.letters.length,
    },
    b: {
        tokens: chainTokens(nfB),
        key: keyB,
        permutation: inducedPermutation(pb.letters, n),
        symbolCount: pb.letters.length,
    },
    divergence: equivalent ? null : firstDivergence(nfA, nfB),
  };
}
