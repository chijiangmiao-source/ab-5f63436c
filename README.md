# 同步辐射光纤束路复核台

重接后的光纤束路以**辫群 Bₙ** 的发生器字记录（σᵢ 交换第 i 与第 i+1 根光纤），
本应用对两条记录做**精确等价判定**，并展示两侧相同（或首个分歧）的规范因子链。

## 判定算法（精确，非启发式）

使用辫群的 **Garside 左规范形**：每个字唯一归约为

```
Δ^k · f₁ · f₂ · … · fₗ
```

- `Δ` 为半扭（Garside 元），`k ∈ ℤ`；
- 每个 `fᵢ` 是非平凡真简单元（置换辫），相邻因子满足**左加权**条件
  `∂(fᵢ) ∧_L fᵢ₊₁ = 1`（右补元与下一因子的左 gcd 为恒等）；
- 归约确定性终止：每次左移严格增大前缀下确界，不依赖随机改写、
  有限次试变换；**判定只比较规范形，不比较诱导置换**。

因此精确覆盖：

- 逆元（σᵢ⁻¹）；
- 远交换（|i−j| ≥ 2 时 σᵢσⱼ = σⱼσᵢ）；
- 三项编织关系（σᵢσᵢ₊₁σᵢ = σᵢ₊₁σᵢσᵢ₊₁）。

业务样例：

| 场景 | n | 记录 A | 记录 B | 结论 |
|---|---|---|---|---|
| 远交换 | 4 | `σ1 σ3` | `σ3 σ1` | 等价，规范链一致 |
| 编织关系 | 4 | `σ1 σ2 σ1` | `σ2 σ1 σ2` | 等价 |
| 诱导置换同而辫不等 | 2 | `σ1 σ1` | 空记录 | **不等价**，首个分歧 `Δ^2` vs `Δ^0` |

## 输入约定

- 光纤根数 n：**2–6**，按固定顺序编号；有效发生器 σ1–σ(n−1)；
- 两条记录，每条 **≤ 80 个发生器符号**；
- 支持写法：`σ1`、`s1`、`sigma1`、`σ1^-1`、`σ1^{-1}`、`σ1⁻¹`、`-σ1`；
- 分隔符：空白、逗号、中文逗号/顿号、分号；
- 空输入（两条皆空）、发生器越界、超长均会**定位错误并清除旧结论**；
- 草稿变更或取消计算后，旧 Worker 回执一律作废，不会覆盖新内容
  （单调 runId + Worker terminate 双重防护）。

## 运行（Docker Compose）

```bash
# 启动静态页面，端口可用 WEB_PORT 配置（默认 8080）
WEB_PORT=9090 docker compose up -d web

# 健康路径
curl -i http://localhost:9090/healthz    # 200 ok

# 一键验收：测试 → 构建产物检查 → HTTP 冒烟，完成后退出并以退出码报告
docker compose up --abort-on-container-exit --exit-code-from verify
# 或单独运行：
docker compose run --rm verify
```

`verify` 服务依次执行：

1. `node --test tests/`：辫群业务样例代码测试
   （另含 700+ 组随机样本，以独立的 Artin 忠实表示 Oracle 交叉验证）；
2. `node tools/build-check.mjs`：页面构建产物检查；
3. `node tools/http-smoke.mjs`：对 `/healthz` 与页面资源的 HTTP 冒烟。

任一步失败即以非零退出码结束。

## 无 Docker 的本地开发

```bash
npm test                 # 代码测试（Node ≥ 20，零依赖）
npm run build-check      # 产物检查
PORT=8080 npm run serve  # 零依赖静态服务器
```

## 目录

```
web/
  index.html    页面
  styles.css
  app.js        主线程：输入调度、渲染、竞态防护
  worker.js     Web Worker（module），复核计算在此线程执行
  engine.js     Garside 左规范形引擎（页面与测试共用）
tests/
  braid.test.js      业务样例 + 随机性质测试
  artin-oracle.js    独立 Oracle：Bₙ → Aut(Fₙ) 忠实表示
  ui-dom.test.js     真实 app.js + worker.js 的调度/竞态端到端测试
tools/
  serve.mjs          零依赖静态服务器
  build-check.mjs    构建产物检查
  http-smoke.mjs     HTTP 冒烟
  verify.sh          Compose verify 入口
Dockerfile              nginx 静态页面镜像
Dockerfile.verify       Node 验收镜像
docker-compose.yml      web + verify
```
