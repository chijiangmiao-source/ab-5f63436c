// Independent exact oracle for braid equality: Artin's faithful
// representation B_n -> Aut(F_n).  Two braid words are equal in B_n iff
// their induced automorphisms agree on every free-group generator.
//
// Free-group words are integer arrays: letter k is encoded  k+1 > 0,
// its inverse as -(k+1).  Free reduction cancels adjacent inverses.
// This code deliberately shares nothing with web/engine.js.

const SIGMA_CHARS = new Set(['σ', 's', 'S']);

function parseWord(text, n) {
  const src = String(text ?? '');
  const out = [];
  let i = 0;
  const skipWs = () => {
    while (i < src.length && /[\s,，、;]/.test(src[i])) i += 1;
  };
  for (;;) {
    skipWs();
    if (i >= src.length) break;
    let sign = 1;
    if (src[i] === '-' || src[i] === '−' || src[i] === '+') {
      if (src[i] !== '+') sign = -1;
      i += 1; skipWs();
    }
    if (!SIGMA_CHARS.has(src[i])) throw new Error(`bad char at ${i}`);
    if ((src[i] === 's' || src[i] === 'S') && /^igma/i.test(src.slice(i + 1, i + 5))) i += 5;
    else i += 1;
    const d0 = i;
    while (i < src.length && src[i] >= '0' && src[i] <= '9') i += 1;
    const gen = Number(src.slice(d0, i));
    let exp = 1;
    if (src[i] === '^') {
      i += 1;
      let es = 1;
      if (src[i] === '-' || src[i] === '−') { es = -1; i += 1; }
      let brace = false;
      if (src[i] === '{') { brace = true; i += 1; }
      const e0 = i;
      while (i < src.length && src[i] >= '0' && src[i] <= '9') i += 1;
      exp = Number(src.slice(e0, i));
      if (es === -1) exp = -exp;
      if (brace) i += 1;
    }
    out.push((gen - 1) * 2 + (sign * exp === 1 ? 0 : 1)); // even = σ, odd = σ^-1
  }
  return out;
}

function reduce(word) {
  const stack = [];
  for (const l of word) {
    if (stack.length && stack[stack.length - 1] === (l ^ 1)) stack.pop();
    else stack.push(l);
  }
  return stack;
}

// Images of the n free generators under one braid letter.
function letterImages(letter, n) {
  const i = letter >> 1;
  const inv = letter & 1;
  const img = Array.from({ length: n }, (_, k) => [2 * k]);
  if (!inv) {
    img[i] = reduce([2 * i, 2 * (i + 1), 2 * i + 1]);       // x_i     -> x_i x_{i+1} x_i^-1
    img[i + 1] = [2 * i];                                    // x_{i+1} -> x_i
  } else {
    img[i] = [2 * (i + 1)];                                  // x_i     -> x_{i+1}
    img[i + 1] = reduce([2 * (i + 1) + 1, 2 * i, 2 * (i + 1)]); // x_{i+1} -> x_{i+1}^-1 x_i x_{i+1}
  }
  return img;
}

function applyImage(word, images) {
  const out = [];
  for (const l of word) {
    const w = images[l >> 1];
    if (l & 1) { for (let k = w.length - 1; k >= 0; k -= 1) out.push(w[k] ^ 1); }
    else out.push(...w);
  }
  return reduce(out);
}

// Automorphism images for a whole braid word (letters applied left to right).
function automorphism(word, n) {
  let images = Array.from({ length: n }, (_, k) => [2 * k]);
  for (const letter of word) {
    const psi = letterImages(letter, n);
    images = images.map((w) => applyImage(w, psi));
  }
  return images;
}

export function artinEqual(textA, textB, n) {
  const a = automorphism(parseWord(textA, n), n);
  const b = automorphism(parseWord(textB, n), n);
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    if (a[i].length !== b[i].length) return false;
    for (let j = 0; j < a[i].length; j += 1) {
      if (a[i][j] !== b[i][j]) return false;
    }
  }
  return true;
}
