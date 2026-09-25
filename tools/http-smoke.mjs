// HTTP 冒烟：对运行中的页面服务请求健康路径与首页。
// 用法：node tools/http-smoke.mjs [BASE_URL]
const BASE = (process.env.SMOKE_URL || process.argv[2] || 'http://localhost:8080').replace(/\/+$/, '');

const checks = [
  { path: '/healthz', expectStatus: 200, expectBody: /ok/i },
  { path: '/', expectStatus: 200, expectBody: /光纤束路复核/ },
  { path: '/engine.js', expectStatus: 200, expectBody: /Garside/ },
  { path: '/worker.js', expectStatus: 200, expectBody: /analyzeRecords/ },
];

let failures = 0;
for (const c of checks) {
  try {
    const res = await fetch(BASE + c.path);
    const body = await res.text();
    const okStatus = res.status === c.expectStatus;
    const okBody = c.expectBody.test(body);
    if (okStatus && okBody) {
      console.log(`✅ ${c.path} → ${res.status}`);
    } else {
      failures += 1;
      console.error(`✗ ${c.path} → 状态 ${res.status}（期望 ${c.expectStatus}），正文匹配=${okBody}`);
    }
  } catch (e) {
    failures += 1;
    console.error(`✗ ${c.path} 请求失败：${e.message}`);
  }
}

if (failures > 0) {
  console.error(`\nHTTP 冒烟失败：${failures} 项`);
  process.exit(1);
}
console.log('✅ HTTP 冒烟全部通过');
