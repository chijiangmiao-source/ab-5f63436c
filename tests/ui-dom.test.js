// 最小 DOM/Worker 桩：加载真实 web/app.js，桥接真实 web/worker.js，
// 端到端验证界面调度、渲染与竞态防护（不依赖浏览器或第三方库）。
import assert from 'node:assert/strict';

const store = new Map();

function makeEl(id) {
  const listeners = {};
  return {
    id,
    value: '',
    textContent: '',
    innerHTML: '',
    disabled: false,
    scrollTop: 0,
    dataset: {},
    style: {},
    classes: new Set(),
    classList: {
      add: (c) => store.get(id).classes.add(c),
      remove: (c) => store.get(id).classes.delete(c),
      toggle: (c, on) => {
        const el = store.get(id);
        if (on) el.classes.add(c); else el.classes.delete(c);
      },
      contains: (c) => store.get(id).classes.has(c),
    },
    addEventListener(k, fn) { (listeners[k] ||= []).push(fn); },
    dispatch(k, ev = {}) { for (const fn of listeners[k] || []) fn(ev); },
    focus() { this._focused = true; },
    setSelectionRange() { this._selected = true; },
    querySelectorAll() { return []; },
  };
}

const ids = ['fibers', 'genRange', 'recordA', 'recordB', 'counterA', 'counterB',
  'btnReview', 'btnCancel', 'workState', 'resultPanel'];
for (const id of ids) store.set(id, makeEl(id));
store.get('fibers').value = '4';

// 真实 worker.js 的桥接桩
const workerMessages = [];
let activeWorker = null;
globalThis.self = {
  set onmessage(fn) { this._h = fn; },
  postMessage(m) {
    const w = activeWorker; // 捕获发消息时的具体 Worker 实例
    if (w && !w.dead) {
      queueMicrotask(() => { if (!w.dead) w.onmessage && w.onmessage({ data: m }); });
    }
  },
};
globalThis.Worker = class FakeWorker {
  constructor() { this.dead = false; activeWorker = this; workerMessages.push(this); }
  postMessage(data) { globalThis.self._h({ data }); }
  terminate() { this.dead = true; }
};

globalThis.document = {
  querySelector: (sel) => {
    const id = sel.replace('#', '');
    return store.get(id) || null;
  },
  querySelectorAll: (sel) => {
    if (sel === '.examples button') {
      return ['far', 'braid', 'perm'].map((ex) => {
        const b = makeEl(`ex-${ex}`);
        b.dataset.example = ex;
        store.set(`ex-${ex}`, b);
        return b;
      });
    }
    return [];
  },
};

await import('../web/app.js');
await import('../web/worker.js');
const tick = () => new Promise((r) => setTimeout(r, 0));

const el = (id) => store.get(id);
let passed = 0;
const ok = (name, cond) => { assert.ok(cond, name); passed += 1; console.log(`✓ ${name}`); };

// 1) 远交换样例：点击样例按钮 → 自动复核 → 等价渲染，两侧同链
el('ex-far').dispatch('click');
await tick();
ok('σ1σ3 ⇄ σ3σ1 渲染等价结论', el('resultPanel').innerHTML.includes('等价：两条束路记录'));
ok('等价时显示两条规范链', (el('resultPanel').innerHTML.match(/factor-flow/g) || []).length === 2);
ok('等价时无分歧框', !el('resultPanel').innerHTML.includes('diverge-box'));

// 2) 编织关系
el('ex-braid').dispatch('click');
await tick();
ok('σ1σ2σ1 ⇄ σ2σ1σ2 渲染等价', el('resultPanel').innerHTML.includes('等价'));

// 3) σ1σ1 vs 空：不等价 + 分歧定位（Δ^2 vs Δ^0）
el('ex-perm').dispatch('click');
await tick();
ok('σ1σ1 ⇄ 空 渲染不等价', el('resultPanel').innerHTML.includes('不等价'));
ok('展示首个分歧因子 Δ^2', el('resultPanel').innerHTML.includes('Δ^2'));
ok('展示对侧 Δ^0', el('resultPanel').innerHTML.includes('Δ^0'));
ok('分歧说明存在', el('resultPanel').innerHTML.includes('首个分歧位置'));

// 4) 草稿变更立即作废旧结论（不等待 Worker）
el('ex-far').dispatch('click');
el('recordA').value = 'σ1 σ3';
el('recordA').dispatch('input');
ok('输入后结果区立即隐藏', el('resultPanel').classes.has('hidden'));
ok('输入后结果 DOM 被清空', el('resultPanel').innerHTML === '');

// 5) 过期回执竞态：发起复核 → 立即改草稿 → Worker 回执到达也必须被丢弃
el('recordA').value = 'σ1 σ3';
el('recordB').value = 'σ3 σ1';
el('btnReview').dispatch('click');
ok('复核中按钮禁用', el('btnReview').disabled === true);
el('recordA').value = 'σ1 σ2';
el('recordA').dispatch('input'); // runId 递增
await tick(); // 旧 worker 回执此刻才送达
ok('过期 Worker 回执不覆盖新内容', el('resultPanel').innerHTML === '');
ok('过期回执后按钮恢复可用', el('btnReview').disabled === false);

// 6) 取消计算：terminate 旧 Worker，旧结果作废
el('btnReview').dispatch('click');
ok('复核开始后取消按钮可用', el('btnCancel').disabled === false);
el('btnCancel').dispatch('click');
ok('取消后结果隐藏', el('resultPanel').classes.has('hidden'));
ok('取消有提示文案', el('workState').textContent.includes('已取消'));

// 7) 双空记录 → 错误结论且不含任何等价判定
el('fibers').value = '4';
el('recordA').value = '';
el('recordB').value = '';
el('btnReview').dispatch('click');
await tick();
ok('双空输入显示错误态', el('resultPanel').innerHTML.includes('输入有误'));
ok('错误态清除旧结论（无 verdict equivalent/inequivalent）',
  !el('resultPanel').innerHTML.includes('verdict equivalent')
    && !el('resultPanel').innerHTML.includes('verdict inequivalent'));

// 8) 越界错误展示
el('recordA').value = 'σ5';
el('recordB').value = 'σ1';
el('btnReview').dispatch('click');
await tick();
ok('σ5 越界（n=4）显示错误', el('resultPanel').innerHTML.includes('越界'));

// 9) 计数与超 80 提示样式
el('recordA').value = Array.from({ length: 81 }, () => 'σ1').join(' ');
el('recordA').dispatch('input');
ok('计数显示 81 / 80', el('counterA').textContent === '81 / 80');
ok('超限计数标红（over 类）', el('counterA').classes.has('over'));

console.log(`\n✅ UI 端到端测试 ${passed} 项全部通过`);
