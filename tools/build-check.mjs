// 构建产物检查：静态站点无需打包，这里校验
//   1) 页面所需文件齐备；
//   2) 所有 JS 通过语法检查；
//   3) HTML/Worker 的资源引用均可解析；
//   4) 健康路径文件存在且内容非空。
import { spawnSync } from 'node:child_process';
import { readFile, access } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const WEB = path.join(ROOT, 'web');
const failures = [];
const notes = [];

const check = async (p) => {
  try { await access(p); return true; }
  catch { failures.push(`缺少文件: ${path.relative(ROOT, p)}`); return false; }
};

const required = ['index.html', 'styles.css', 'app.js', 'worker.js', 'engine.js', 'healthz'];
const present = {};
for (const f of required) present[f] = await check(path.join(WEB, f));

// JS 语法检查
for (const f of ['app.js', 'worker.js', 'engine.js']) {
  if (!present[f]) continue;
  const r = spawnSync(process.execPath, ['--check', path.join(WEB, f)], { encoding: 'utf8' });
  if (r.status !== 0) failures.push(`语法检查失败 web/${f}: ${r.stderr || r.stdout}`);
  else notes.push(`语法检查通过 web/${f}`);
}

// 引用完整性
const html = present['index.html'] ? await readFile(path.join(WEB, 'index.html'), 'utf8') : '';
for (const ref of ['./styles.css', './app.js']) {
  if (!html.includes(`"${ref}"`) && !html.includes(`'${ref}'`)) {
    failures.push(`index.html 未引用 ${ref}`);
  }
}
if (present['app.js']) {
  const app = await readFile(path.join(WEB, 'app.js'), 'utf8');
  if (!app.includes("new Worker('./worker.js'")) failures.push('app.js 未以 module Worker 方式加载 worker.js');
}
if (present['worker.js']) {
  const worker = await readFile(path.join(WEB, 'worker.js'), 'utf8');
  if (!worker.includes("from './engine.js'")) failures.push('worker.js 未导入 engine.js');
}
if (present.healthz) {
  const hz = (await readFile(path.join(WEB, 'healthz'), 'utf8')).trim();
  if (!hz) failures.push('healthz 内容为空');
  else notes.push('健康文件 healthz 就绪');
}

// 算法产物自检：必须包含精确判定的关键结构（防止退化为仅比较置换）
const engine = present['engine.js'] ? await readFile(path.join(WEB, 'engine.js'), 'utf8') : '';
for (const marker of ['leftGcd', 'rightComplement', 'normalizeLetters', 'canonicalKey', 'chainTokens']) {
  if (!engine.includes(marker)) failures.push(`engine.js 缺少关键算法结构: ${marker}`);
}
// 判定必须由规范形键相等驱动，诱导置换仅用于展示
if (!/const equivalent = keyA === keyB;/.test(engine)) {
  failures.push('等价判定必须为 canonicalKey 逐位比较（未找到 equivalent = keyA === keyB）');
}

if (failures.length > 0) {
  for (const f of failures) console.error(`✗ ${f}`);
  console.error(`\n构建产物检查失败：${failures.length} 项问题`);
  process.exit(1);
}
console.log(`✅ 构建产物检查通过（${notes.join('；')}）`);
