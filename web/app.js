// 主线程：收集输入、调度 Worker、渲染结论。
// 关键竞态约束：
//   1) 每次复核携带单调递增 runId，过期 Worker 回执一律丢弃；
//   2) 草稿任意变更立即作废旧结论（runId++ 并清空结论区）；
//   3) 取消会 terminate 旧 Worker 并重建，旧回执不可能再到达。

const $ = (sel) => document.querySelector(sel);

const els = {
  fibers: $('#fibers'),
  genRange: $('#genRange'),
  a: $('#recordA'),
  b: $('#recordB'),
  counterA: $('#counterA'),
  counterB: $('#counterB'),
  btnReview: $('#btnReview'),
  btnCancel: $('#btnCancel'),
  workState: $('#workState'),
  result: $('#resultPanel'),
};

const MAX_SYMBOLS = 80;
let runId = 0;
let inflight = false;
let worker = createWorker();

function createWorker() {
  const w = new Worker('./worker.js', { type: 'module' });
  w.onmessage = (ev) => {
    const { id, result } = ev.data || {};
    if (id !== runId) return; // 草稿已变更或已取消：丢弃旧结果
    inflight = false;
    setRunning(false);
    render(result);
  };
  w.onerror = (e) => {
    if (w !== worker) return; // 已取消并重建：旧 Worker 的错误作废
    inflight = false;
    setRunning(false);
    render({
      status: 'invalid',
      errors: [{ record: 'A', kind: 'worker', index: 0, message: `Worker 异常：${e.message}` }],
    });
  };
  return w;
}

function setRunning(on) {
  els.btnReview.disabled = on;
  els.btnCancel.disabled = !on;
  els.workState.textContent = on ? 'Worker 正在归约规范形…' : '';
}

// 与解析器口径一致的符号计数（仅用于界面提示，80 上限以引擎为准）
function countSymbols(text) {
  const m = String(text).match(/(?:σ|[sS](?:igma)?)\s*\d+/g);
  return m ? m.length : 0;
}

function refreshCounter(which) {
  const ta = which === 'A' ? els.a : els.b;
  const ce = which === 'A' ? els.counterA : els.counterB;
  const c = countSymbols(ta.value);
  ce.textContent = `${c} / ${MAX_SYMBOLS}`;
  ce.classList.toggle('over', c > MAX_SYMBOLS);
}

function invalidate(notice) {
  // 草稿变更：作废旧结论，旧 Worker 回执将因 id 不符被丢弃
  runId += 1;
  inflight = false;
  setRunning(false);
  els.result.classList.add('hidden');
  els.result.innerHTML = '';
  if (notice) els.workState.textContent = notice;
}

function review() {
  runId += 1;
  inflight = true;
  setRunning(true);
  els.result.classList.add('hidden');
  els.result.innerHTML = '';
  worker.postMessage({
    id: runId,
    n: Number(els.fibers.value),
    a: els.a.value,
    b: els.b.value,
  });
}

function cancel() {
  if (!inflight) return;
  worker.terminate();
  worker = createWorker();
  invalidate('已取消计算，旧结果已作废。');
}

// ---------------------------------------------------------------------------
// 渲染
// ---------------------------------------------------------------------------

function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

function chainHtml(side, data, divergence) {
  const chips = data.tokens.map((t, i) => {
    const diverge = divergence && i === divergence.index ? ' diverge' : '';
    const cls = t.kind === 'delta' ? 'factor-chip delta' : 'factor-chip';
    const title = t.perm ? `置换编织 [${t.perm.join(', ')}]` : 'Garside 半扭的幂';
    return `<span class="${cls}${diverge}" title="${esc(title)}">${esc(t.label)}</span>`;
  }).join('<span class="factor-op">·</span>');
  return `
    <div class="chain-card">
      <h3>记录 ${side} 的左规范形（Δ-幂 · 左加权因子链）</h3>
      <div class="factor-flow">${chips}</div>
      <div class="meta-row">
        <span>符号数：<code>${data.symbolCount}</code></span>
        <span>诱导置换（仅参考，不作判定依据）：<code>[${data.permutation.join(', ')}]</code></span>
      </div>
    </div>`;
}

function verdictHtml(r) {
  if (r.status === 'equivalent') {
    return `
      <div class="verdict equivalent">
        <span class="badge">✓</span>
        <div>
          <strong>等价：两条束路记录在辫群 B<sub>${r.n}</sub> 中代表同一元素。</strong>
          <div class="verdict-detail">两侧 Δ-幂与全部规范因子逐位相同，规范因子链完全一致。</div>
        </div>
      </div>`;
  }
  return `
    <div class="verdict inequivalent">
      <span class="badge">✗</span>
      <div>
        <strong>不等价：两条束路记录在辫群 B<sub>${r.n}</sub> 中是不同元素。</strong>
        <div class="verdict-detail">判定基于完整规范形而非诱导置换；即使诱导置换相同，规范形不同仍判不等价。</div>
      </div>
    </div>`;
}

function divergenceHtml(d) {
  if (!d) return '';
  const place = d.index === 0
    ? '第 1 个规范位置（Δ 半扭的幂）'
    : `第 ${d.index + 1} 个规范位置（第 ${d.index} 个规范因子）`;
  const side = (v) => (v === null || v === undefined ? '（缺失）' : `<code>${esc(v)}</code>`);
  return `
    <div class="diverge-box">
      <strong>首个分歧位置：${place}</strong><br />
      记录 A：${side(d.a)}　｜　记录 B：${side(d.b)}
    </div>`;
}

function errorsHtml(errors) {
  const items = errors.map((e) => {
    const loc = typeof e.index === 'number'
      ? ` <button type="button" class="loc-link" data-record="${e.record}" data-index="${e.index}">定位到第 ${e.index + 1} 个字符</button>`
      : '';
    return `<li>记录 ${e.record}：${esc(e.message)}${loc}</li>`;
  }).join('');
  return `
    <div class="verdict invalid">
      <span class="badge">!</span>
      <div><strong>输入有误，未产生复核结论（旧结论已清除）。</strong></div>
    </div>
    <div class="errors-box"><ul>${items}</ul></div>`;
}

function render(r) {
  els.result.classList.remove('hidden');
  if (r.status === 'invalid') {
    els.result.innerHTML = errorsHtml(r.errors || []);
  } else {
    els.result.innerHTML = `
      ${verdictHtml(r)}
      <div class="chains">
        ${chainHtml('A', r.a, r.divergence)}
        ${chainHtml('B', r.b, r.divergence)}
      </div>
      ${divergenceHtml(r.divergence)}
      <div class="note">
        等价性由 Garside 左规范形 <code>Δ^k · f₁ · … · fₗ</code> 的逐位相等决定；
        精确处理逆元、远交换（|i−j|≥2 时 σiσj=σjσi）与三项编织关系（σiσi+1σi=σi+1σiσi+1），
        不使用有限次试变换、随机改写，也不仅比较诱导置换。
      </div>`;
  }
  els.result.querySelectorAll('.loc-link').forEach((btn) => {
    btn.addEventListener('click', () => locate(btn.dataset.record, Number(btn.dataset.index)));
  });
}

function locate(record, index) {
  const ta = record === 'B' ? els.b : els.a;
  ta.focus();
  const end = Math.min(ta.value.length, index + 1);
  ta.setSelectionRange(index, end);
  // 滚动到光标位置
  const before = ta.value.slice(0, index);
  const lines = before.split('\n').length - 1;
  ta.scrollTop = lines * 22;
}

// ---------------------------------------------------------------------------
// 事件
// ---------------------------------------------------------------------------

function refreshGenRange() {
  const n = Number(els.fibers.value);
  els.genRange.textContent = n === 2 ? 'σ1' : `σ1–σ${n - 1}`;
}

els.fibers.addEventListener('change', () => {
  refreshGenRange();
  invalidate('光纤根数已变更，旧结论已作废，请重新复核。');
});
els.a.addEventListener('input', () => { refreshCounter('A'); invalidate(); });
els.b.addEventListener('input', () => { refreshCounter('B'); invalidate(); });
els.btnReview.addEventListener('click', review);
els.btnCancel.addEventListener('click', cancel);

for (const ta of [els.a, els.b]) {
  ta.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') review();
  });
}

const EXAMPLES = {
  far: { n: 4, a: 'σ1 σ3', b: 'σ3 σ1' },
  braid: { n: 4, a: 'σ1 σ2 σ1', b: 'σ2 σ1 σ2' },
  perm: { n: 2, a: 'σ1 σ1', b: '' },
};

document.querySelectorAll('.examples button').forEach((btn) => {
  btn.addEventListener('click', () => {
    const ex = EXAMPLES[btn.dataset.example];
    els.fibers.value = String(ex.n);
    els.a.value = ex.a;
    els.b.value = ex.b;
    refreshGenRange();
    refreshCounter('A');
    refreshCounter('B');
    review();
  });
});

refreshGenRange();
refreshCounter('A');
refreshCounter('B');
