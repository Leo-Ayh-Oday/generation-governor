# ARCP-R6-GO41-05 · TASK-01-R 独立核验报告

**裁决：BLOCKED**　blocking=2　核验 SHA：`f22141eb4c2e92d02bf9f5a67c04d36997a40fc6`

| 字段 | 值 |
|---|---|
| 对象链 | `4235d81316` (base) → `4207869a9e` (impl) → `f22141eb4c` (checkpoint/HEAD) |
| 审计工作树 | `<home>/worktrees/audit-arcp-r6-go41-05-f22141`（detached @ `f22141eb4c`，核验结束时 0 脏） |
| 执行器工作树 | `<home>/worktrees/dsh-arcp-go41-05` @ `f22141eb4c`，0 脏，**未被改动** |
| 核验产物 | `<home>/g05-audit/`（探针与日志，仓外） |
| 环境 | WSL Ubuntu / node v24.21.0 / pnpm 11.7.0，`pnpm install --offline --frozen-lockfile --ignore-scripts` 7.1 s |

## 0. 对象校验（全部成立）

- 四个对象均存在（`git cat-file -t` = commit）；`merge-base --is-ancestor` 两跳均为真；`4235d813..f22141eb4c` 共 **6 个提交、0 个 merge**（C1/C2/C3 + 2 个附加提交 + freeze）。
- `git diff --stat 4235d813 f22141eb4c` = **28 文件 / +1078 −97**；`--name-only` 落在 `scripts/`、`handoff/` 之外的文件数 = **0**；`-- packages` = **0 行**。与 CONTROL §4、D-019 口径一致。

---

# 必查项

## M-1 · N-002：WIRE_JOURNAL 是否真有代码生产者 — **CONFIRMED**（生产者为真、可复现）；其"手工内容"子项见 M-1(d)，单独判负

**源码（写入点）**

- `scripts/generate-arcp-r6-go41-evidence.ts:1382-1386`

```ts
await writeFile(
  join(dirname(outputPath), 'ARCP_R6_GO41_04_WIRE_JOURNAL.jsonl'),
  readFileSync(journalPath),
  { flag: 'wx', mode: 0o444 },
)
```

- 角色定义：`:3134-3148`（`sideJournals` → `role:'wire'`，固定文件名）；`REQUIRED_JOURNALS` 在 `:3001`；冻结侧 `resolveJournalRoles` `:3031`、`freezeJournals` `:3083`。

**可达链路**：`main('wire-capture')` (`:3881`) → `wireCapture()` (`:1252`) → `prepareRunPaths('wire', outputPath)` → `beginScenario(..., journalPath)` 逐帧写 `governor-journal.jsonl` → 记录 `writeFile(outputPath)` (`:1382`) → **紧接着**把本轮 journal 字节复制为固定名 (`:1383-1386`)。写入与记录同进程、同 run root，不依赖任何外部步骤。

**复现（a/b/c）**

```sh
cd <home>/worktrees/audit-arcp-r6-go41-05-f22141
git show f22141eb4c:handoff/.../ARCP_R6_GO41_04_WIRE_JOURNAL.jsonl > <home>/g05-audit/m1/committed.jsonl
rm -f handoff/adaptive-agent/go41-r6-05-20261021/ARCP_R6_GO41_04_WIRE_JOURNAL.jsonl
node --import tsx/esm scripts/generate-arcp-r6-go41-evidence.ts wire-capture \
  --out <home>/g05-audit/m1/run1/ARCP_R6_GO41_05_WIRE_CAPTURE.json
# 同上再跑一次到 run2
```

**观测值**

| 项 | 值 |
|---|---|
| 入库版本 | `edf3c244f4dd73303d2a40048f01ac12bd400413d2178fffc32c2a938aee5c68`，3819 B |
| 删除后重跑 run1 | `edf3c244f4dd733…`，3819 B，mode **444**，`cmp` → **BYTE-IDENTICAL** |
| 删除后重跑 run2 | `edf3c244f4dd733…` |
| 进程输出 | `wire-capture: 8 captured requests, 8 dispatched, 0 denied` |
| 删除但未重封时校验 | 拒绝：`frozen evidence manifest frozen file …WIRE_JOURNAL.jsonl is missing from the checkpoint` |

**归属交叉核对（我自建，验证器不做此项）**：journal 40 帧，`seq` 1..40 连续；按类型 8×{attempted, permit-granted, dispatch-entered, first-chunk-observed, settled}；与 `ARCP_R6_GO41_04_WIRE_CAPTURE.json.governor`（attempted 8 / granted 8 / dispatchEntered 8 / settled 8 / maxActive 1 / denials 0）逐项一致。

**必须记录的一个观察**：05 的该文件与 GO41-04 的入库文件 **sha256 完全相同**（`edf3c244…`）。这**不是** N-002 复发：wire-capture 场景固定（同 5 个请求、同 session id、帧内无时间戳），我的两次重跑都逐字节复现同一结果，说明 04 那份也是同一确定性场景的产物。但反过来说，**对该场景而言"字节相同"不构成区分证据**——区分力来自"删除后由代码重新写出"，即上面的 a/b/c。

**M-1(d)「手工内容可通过校验」**：成立，见 EVID-017。把文件替换为手工内容、重封 manifest 与 chain 后，`validate-local-evidence` 返回 `RC=0`。这是同一根因（校验只查自洽哈希），在 EVID-017 条目下计为 blocking，不在此重复计。

---

## M-2 · 「无 finish 直接 done」 — **CONFIRMED**（自建探针，未复用执行器 spec/harness）

**源码**

- `scripts/arcp-r6-go41-governor.ts:648` `governedStream`；`:700-708` 只在 `done===true` 时 `settlement = exhaustionSettlement(terminal)`；`:760-779` `exhaustionSettlement`：`stop|tool-calls|max-tokens → completed`，`error → failed-finish`，`aborted → aborted-finish`，**`undefined → no-terminal-finish`**（按 `reason.kind` 分类，不按"是否出现过 finish"）。
- `:735-740` `quiescent = settlement==='completed' ? true : await confirmQuiescence(downstream, …)`；`:395` `settle()`；`:411-420` 未确认 → `settlementUnknown += 1` → `stop('quiescence-unconfirmed')` → `releaseSlot()`（不交接）。
- `:504-521` `stop()` 仅在 `stoppedAt===null` 时写入，**无复位入口**；`:438` `takeSlot` 首要判断 `stoppedAt!==null → 'run-stopped'`；`:321-345` `acquire` 入口与拿到 slot 后各查一次。

**探针**：`<home>/g05-audit/m2-no-finish.ts`，直接 `import { GenerationGovernor, governedStream }`，下游为自建迭代器。

```sh
cd <home>/worktrees/audit-arcp-r6-go41-05-f22141 && ./node_modules/.bin/tsx <home>/g05-audit/m2-no-finish.ts
```

**观测值**

| 用例 | 结果 |
|---|---|
| A：`[text-delta]` 后 `done`（无 finish） | `settlementUnknown=1`、`settled=0`、`stopped=true`、`stopAt=quiescence-unconfirmed`、`reason="…after no-terminal-finish (cleanup closed)"` |
| A：随后两次请求 | 均为 `ARCP_R6_GO41_PERMIT_RUN_STOPPED`；`denialsByReason.run-stopped=2`；`transport.received` 恒为 **1**（被拒请求从未进入 transport）；`maxActive=1` |
| B：零 chunk 后 `done` | 同上（unknown=1，stopped=true，at=quiescence-unconfirmed） |
| C：对照 `finish(stop)` 后 `done` | `completed`×2、`settlementUnknown=0`、`stopped=false`、`received=2`、`maxActive=1` |

**不可逆性**：stop 后 `permitsGranted` 恒为 1；`stopState().at` 不随后续拒绝变化；`run-stopped` 帧只出现 1 次（首因不被覆盖）。

**注**：执行器 spec `:539-549` 的用例与我的探针语义一致，但本结论只建立在自建探针上。

---

## M-3 · 「普通 provider 错误终止 run」是否忠实于 REV-015 不变量 — **CONFIRMED**（忠实，非过度收紧）

**不变量原文**（REF-REV-015）：*"Release requires a trusted lower-layer terminal fact or successful transport-owned probe; **otherwise stop irreversibly**, retain the barrier, deny queued/later work, and record unknown."*

**源码**

- 真实链路**不装探针**：`generate-arcp-r6-go41-evidence.ts:545-551` 调用 `governedStream(governor, {...}, next)` —— **只有三个参数**，`downstream` 缺省。这正是 REV-015 描述的"没有任何 transport-owned 事实"的条件。
- 因此 `finish(error)` → `exhaustionSettlement → 'failed-finish'` (`:770-773`) → `quiescent=false` (`:735-740`) → `settle` 记 unknown 并 `stop` (`:411-420`)。**不变量要求的就是这条路径。**
- 判据不是"凡是错误都停"：有探针且探针答 true 时照样释放。

**探针（同一 `finish(error)` 流，唯一变量是探针）**

| 条件 | 结果 |
|---|---|
| 带 `confirmQuiescent: () => true` | `settled=1`、`settlementUnknown=0`、`stopped=false`（D 用例） |
| 无探针 | `settlementUnknown=1`、`stopped=true`、后续 `PERMIT_RUN_STOPPED`、`received=1`（E 用例） |

**语义代价的实测**（我重跑 `governed-selfcheck`）：`ordinary-stream-error` recv=**1**、stopped=true、unknown=1；`retry-amplification` attempted 3 / granted 1 / denied 2 / recv=**1**。即"发一次后停止"确实发生。

**判定**：实现忠实于不变量；把"重试被拒"记为产品代价（D-021/D-022 已裁定）是正确归类，不属于实现过度收紧。

---

# 其余按工单

## REV-015 a · normalized adapter error 后不得再进 transport — **CONFIRMED**

- 源码：`:700-708` + `:760-779` + `:411-420`。
- 复现：自建探针 E（上表）；以及 `node --import tsx/esm scripts/generate-arcp-r6-go41-evidence.ts governed-selfcheck --out <home>/g05-audit/self2.json`（`bootComposition` + loopback stub，真实中间件路径）。
- 观测：`ordinary-stream-error` attempted=2 / granted=1 / denied=1 / dispatch=1 / **recv=1** / **maxActive=1** / unknown=1 / stopped=true；探针中第二次请求 `PERMIT_RUN_STOPPED`，`transport.received` 不增。
- 判据：第二次请求在 `acquire` 即被 `run-stopped` 拒绝，未触达 `next()`；endpoint 侧 `maxActive` 恒 1。

## REV-015 b · outstanding `source.next()` 下的取消 — **CONFIRMED**

- 源码：`boundedRead` `:799-843`（`signal` abort 竞争者）；`:685-693` `read.kind==='aborted' → settlement='aborted'` 并抛出；`finally` 走 `settle` → unknown + stop。
- 复现：`<home>/g05-audit/rev015b.ts`：`readTimeoutMs=30_000`，`next()` 永不结算，100 ms 时 abort。
- 观测：wrapper 在 **413 ms** 返回（受 `teardownTimeoutMs=300` 约束，与 30 s 读界无关）；`settlementUnknown=1`、`wrapperEnded=1`、`stopped=true`、`stopAt=quiescence-unconfirmed`、`reason="…after aborted (cleanup timeout)"`；**未使用外部 3 s 进程超时**。
- 判据：取消在 bound 内到达同一终局分支并留下最终记录。**范围声明**：D-016 已把"进程退出"移出本轮，我的探针也未测进程退出（R-001 仍未验证）。

## REV-015 c · stop 之后不得再签发 permit — **CONFIRMED**

- 源码：`:438`（takeSlot 首判）、`:321-345`（acquire 入口 + 拿到 slot 后复检）、`:504-521`（`wakeQueued` 把排队者以 `run-stopped` 唤醒）。
- 观测：stop 后一次后续请求 → `ARCP_R6_GO41_PERMIT_RUN_STOPPED`；`permitsGranted` 停在 1；`denialsByReason.run-stopped=1`；`stopState()` 的 `at` 未变。

## REV-016 · 嵌套字段伪造 — **REFUTED**（5 个新用例中 4 拒 1 过；旧 6 类全拒）

- 旧 6 类：全部在 19 条矩阵内且被拒（`tests` 输出：删条目、改名 journal point、单回执、负顶层计数、重复场景、围绕失效 main/title 重建 chain）。矩阵由 `scripts/arcp-r6-go41-tamper-check.ts` **重建**伪造并**重算摘要**，非字符串比对 —— 我核对了 `resealRecord/resealChain/resealSelfcheck` 与用例构造。
- 我另建 `<home>/g05-audit/rev016.ts`，按 REF-REV-015 列出的"修复前被接受"的 5 个新用例逐一重封：

| 用例 | 结果 |
|---|---|
| `journalMatrix[].counters.permitsGranted = -1` | REJECTED（不是非负安全整数） |
| pre-send `attempted` 行 `pulled=true`（0 回执） | REJECTED（pulled 必须与 dispatchEntered 一致） |
| `quiescenceAdversaries[].counters.downstreamQuiescent = -1` | REJECTED |
| `requestMessageCounts = [-1,"not-a-count"]` | REJECTED |
| **`requestSessionHeaders = []`** | **ACCEPTED（验证器返回成功）** |

- 源码根因：`generate-arcp-r6-go41-evidence.ts:2578-2582`

```ts
expect(
  Array.isArray(detail.requestSessionHeaders)
    && detail.requestSessionHeaders.every(header => header === detail.sessionHeader),
  'every request must carry the scenario session header',
)
```

`[].every(...) === true`，**没有基数约束**。相邻三条（`requestMessageCounts.length===2`、`terminalStatuses.length===2`）都补了长度，唯独 header 数组没有 —— 正是 REF-REV-015 点名的 "`every()` without requiring two entries" 原样残留。旁证：我把同一字段改成 `['only-one']` 反而被拒（"every request must carry the scenario session header"），说明只补了"元素值"，没补"必须两条"。

- 判据：工单要求"detail 数组伪造 → **全部**被拒"；空数组可过，故 REFUTED。影响面限于"main/title 行可携带零条 per-request 头证据仍被判为满足契约"，不改变其他 4 项已关闭的事实。

## EVID-017 · 删除/错配后重封 — **REFUTED**（三种重封全部通过校验）

- 源码：`assertFrozenEvidenceManifest` `:2898-2985`。它只检查：自身摘要（`:2914`）、每个列出文件的摘要与字节数（`:2928-2937`）、`.jsonl` 帧序号递增唯一（`:2941-2953`）、**correspondence 是"所列文件"的划分**（`:2960-2984`）。**没有**代码自有的"应有角色/应有文件集"期望值，**没有**记录角色白名单，**没有**每记录应有 journal 的断言。
- 复现（`<home>/g05-audit/evid017.ts` + `evid017-run.sh`，用模块自己的 `frozenEvidenceManifest` / `composeLocalEvidenceChain` 重封，等价于有决心的伪造者）：

| 变体 | 操作 | 结果 |
|---|---|---|
| `omission`（只删文件与条目，留空数组） | 13 文件 | REJECTED，但理由是 "malformed correspondence entry"（空数组），**不是覆盖率** |
| **`omission-full`** | 删除 wire journal + 整个 WIRE_CAPTURE 对应条目，重封 | **RC=0**：`chain verified (3 records, 13 frozen files, …)` |
| **`mapping`** | 14 文件不变，把 wire/transition 的 journal 互换归属，重封 | **RC=0**：`chain verified` |
| **`relabel`** | 14 文件不变，把三个记录标识全部改名，重封 | **RC=0**：`chain verified` |
| 仅删文件、不重封 | — | REJECTED（"is missing from the checkpoint"） |

- 判据：REF-REV-015/GO41-04-EVID-017 的触发条件原文是 *"remove a required journal from both `files` and its correspondence entry … then recompute `manifestDigest` and rebuild the complete chain"*，且最小修正不变量要求 *"exact record roles、every required file 的唯一归属、期望计数作为该集合的推论"*。三条都未实现，三种攻击全部通过。**这一项不能算关闭。**
- 需要公平记录的部分：**冻结侧确实是代码自有的**（`:3001`/`:3031`/`:3083`，缺角色即停、多 journal 无角色即停、side journal 缺失即停）。漏洞在**校验侧**——即"拿到一份 checkpoint 目录后能否证明它完整"，而这正是 EVID-017 的攻击面。
- 与 M-1(d) 的关系：把 wire journal 换成手工内容（`content` 变体）同样 **RC=0**。同一根因，不重复计 blocking。

## EVID-018 · 三个 sibling run root — **CONFIRMED**

- 源码：`REQUIRED_JOURNALS` `:3001-3014` 含 `selfcheck/retry-amplification`、`race-for-one-permit`、`queued-cancel`，各绑定独立 root；冻结 14 个 journal（12 selfcheck + wire + transition），manifest `files`=14。
- 复现：`<home>/g05-audit/evid018.sh`（逐文件 `sha256sum` 对比 `<home>/g05-run/**` 源文件）。
- 观测：**14/14 MATCH**；三个 sibling 文件互不相同：

| journal | 冻结名 | sha256（前 16） | 源 |
|---|---|---|---|
| retry | `…JOURNAL_10__selfcheck__retry-amplification.jsonl` | `7a4af9f7e6be94d0` | `SELF.json-retry.run/governor-journal.jsonl` |
| race | `…JOURNAL_11__selfcheck__race-for-one-permit.jsonl` | `b5ff10b7c726077c` | `SELF.json-race.run/governor-journal.jsonl` |
| queue | `…JOURNAL_12__selfcheck__queued-cancel.jsonl` | `703a6b0f5c9231b3` | `SELF.json-queue.run/governor-journal.jsonl` |

- 归属：manifest `correspondence` 把 12 个 selfcheck journal（含上述三个）全部挂在 `ARCP_R6_GO41_04_GOVERNOR_SELFCHECK` 下，wire/transition 各 1。三个 sibling 均已冻结并绑定到正确记录。

## 回归 · 五组已通过行为 — **CONFIRMED**（重跑复现，非采信绿灯）

```sh
npx vitest run scripts/arcp-r6-go41-governor.spec.ts scripts/arcp-r6-go41-evidence-chain.spec.ts
# Test Files 2 passed (2) / Tests 58 passed (58)  (34 + 24)
node --import tsx/esm scripts/generate-arcp-r6-go41-evidence.ts governed-selfcheck --out <home>/g05-audit/self2.json
```

我用**新跑出的报告**与冻结报告做结构化 diff：差异 **10 处，全部在 `provenance`**（`implementationSha` 4207869a9e→f22141eb4c、runRoot/journalPath/loadedModulePaths/两个 digest），**scenarios / journalMatrix / quiescenceAdversaries / conclusion 零差异**。12 行场景计数与 handoff §3 表逐格一致；5 个 journal point 与 6 个 quiescence adversary 亦一致（全部 `secondPulled=false`、`maxActive=1`、`stopped=true`、`PERMIT_RUN_STOPPED`）。

五组对应：outer-return control（`adapter-swallow-hides-inner-teardown-failure`）、bounded cleanup/probe（`hanging-return…`、`return-absent…`）、ordinary serialization（`race-for-one-permit` 6 尝试 1 授予、`queued-cancel`）、journal fail-closed（`journal-failure-attempted/post-send`）、main/title delay + cancellation（`recv=2 / recv=1 + stopped`）。

## 命名 · 05 沿用 `ARCP_R6_GO41_04_*` 是否影响 record 归属判定 — **CONFIRMED（不影响程序化判定）**，附两条限定

- 04 与 05 两份 manifest 的 `correspondence.record` 完全相同（`ARCP_R6_GO41_04_{GOVERNOR_SELFCHECK,WIRE_CAPTURE,ARCP_TRANSITION}`），文件名前缀也相同；区别在目录与 `provenance.implementationSha`。
- **程序化判定不受影响**：manifest 里的 `files[].path` 是仓库相对路径，含轮次目录；chain 的 `records[]` 按 `role` 绑定、`frozenEvidence` 绑定 `manifestDigest`+`files`；两份 checkpoint 各自独立校验（04：11 文件 / `9fc6226c…`；05：14 文件 / `14da7b03…`）。不存在按名字解析"那一条记录"的代码路径，因此不会误绑。
- **限定 1（可读性）**：任何只引用记录名而不带目录或 `implementationSha` 的表述都有歧义，报告/交接必须写全路径。
- **限定 2（实现缺口，非命名问题）**：`correspondence.record` 在校验器里是**自由字符串**，改名后仍 `RC=0`（见 EVID-017 `relabel`）。也就是说"归属"目前只由路径保证，不由名字保证——这与 EVID-017 是同一处缺陷，不应被"命名沿用"这一表层现象掩盖。

---

# 阻断项

| # | 编号 | 事实 | 依据 |
|---|---|---|---|
| 1 | EVID-017 | 删除 wire journal 及其归属条目、或互换归属、或改记录名，只要重封 manifest+chain，`validate-local-evidence` 一律 `RC=0`（`chain verified`）。checkpoint 可以静默少一个 required journal 并被认证为完整。 | `:2898-2985` 只校验"所列文件"的摘要/序号/划分；无代码自有的期望集合与记录角色 |
| 2 | REV-016 | `requestSessionHeaders = []` 重封后被接受（`:2578-2582` `.every()` 空真）。REF-REV-015 明确列出该用例必须在修复后拒绝。 | 5 个新用例 4/5 关闭 |

**为什么是 BLOCKED 而不是 REVISE**：本轮的 C2/C3 都以"证据可由代码自证"为核心卖点；第 1 项使"checkpoint 完整"这一声明仍不可证（D-022 已对 02/03/04 降级过同一句话），第 2 项使 REV-016 的"全部被拒"停留在 4/5。两者都不是文档措辞问题，而是校验器的行为事实，且都能用一行伪造复现。**M-1 本身通过**——阻断不来自 wire journal 的生产者，而来自"校验侧仍以输入为准"。

# 本轮未证 / 边界

- 未重建 REV-015 原始复现里的 `LlmRuntime → PiAiAdapter → pi-ai lazyStream → loopback` 真实链；REV-015 a 的确认止于 governor 边界 + `bootComposition` 组合层（中间件路径相同，`packages/**` 本轮 0 改动）。
- 进程退出（R-001）未测；按 D-016 不在本轮判据内。
- 未接触 live provider / 凭据 / 预算。
- `content`/`mapping`/`omission` 变体使用模块自身的构造器重封，未做逐字节手工编辑；若要求"手写 JSON + 手算摘要"，结论不变（摘要算法公开）。

# 复核用命令汇总

```sh
# 对象链
git log --oneline 4235d81316..f22141eb4c
git diff --name-only 4235d81316 f22141eb4c -- packages | wc -l     # 0

# M-1
node --import tsx/esm scripts/generate-arcp-r6-go41-evidence.ts wire-capture --out <dir>/ARCP_R6_GO41_05_WIRE_CAPTURE.json
sha256sum <dir>/ARCP_R6_GO41_04_WIRE_JOURNAL.jsonl                  # edf3c244…

# M-2 / M-3 / REV-015
./node_modules/.bin/tsx <home>/g05-audit/m2-no-finish.ts
./node_modules/.bin/tsx <home>/g05-audit/rev015b.ts

# REV-016 / EVID-017
./node_modules/.bin/tsx <home>/g05-audit/rev016.ts
bash <home>/g05-audit/evid017-run.sh omission-full   # RC=0 ← 缺陷
bash <home>/g05-audit/evid017-run.sh mapping         # RC=0 ← 缺陷
bash <home>/g05-audit/evid017-run.sh relabel         # RC=0 ← 缺陷

# EVID-018 / 回归
bash <home>/g05-audit/evid018.sh
npx vitest run scripts/arcp-r6-go41-governor.spec.ts scripts/arcp-r6-go41-evidence-chain.spec.ts
node --import tsx/esm scripts/generate-arcp-r6-go41-evidence.ts governed-selfcheck --out <home>/g05-audit/self2.json
```

---

TASK-01-R | BLOCKED | ckpt=f22141eb4c | blocking=2 | report=<home>/audits/ARCP-R6-GO41-05-f22141/ARCP_R6_GO41_05_INDEPENDENT_REVIEW.md
