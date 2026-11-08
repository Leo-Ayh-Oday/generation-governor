# GO41-08 独立核验报告（路径脱敏副本）

> 本文件是 `TASK-01D-R` 原始核验报告的路径脱敏副本：判断、裁决、数字、命令输出与建议均未改动，仅把本机绝对路径、用户目录和内部目录名替换为占位符。
> §0 的 `UNPROVEN` 保留原文——它记录的是该轮控制文档的可见性问题，不是代码缺陷。
> 来源 SHA-256：`5be194704a179cbd448b22a315e256b8d8e8c5fccb6cfb87f017c7c720442832`（脱敏前原件）。

---

| 项 | 值 |
|---|---|
| 裁决 | **ACCEPT** |
| blocking | **0** |
| 对象 | base `ebea03253b` → impl `eb84149fca` → ckpt `539eda0782` |
| 工作树 | `<home>/worktrees/dsh-arcp-go41-08`（分支 `work/arcp-r6-go41-08-coverage-measurement`，HEAD `539eda078237651fe8b65c55dfa6f16c3320422e`） |
| 核验方式 | 只读源码 + 在 `git archive HEAD` 的仓库外副本上重放伪造；源工作树 `git status --porcelain` 全程 0 行 |
| 时间 | 2026-10-26 |

## 0. 必读文档：UNPROVEN（文件不存在）

`control/CONTROL.md`、`control/TASK-01D-review.md`、`control/artifacts/go41-07/MUTATION-CALIBRATION.md` 在本机**均不存在**：

- 工作树根无 `control/`；`find <home> -maxdepth 8 -name 'TASK-01*'` 无结果；
- `find <home> -maxdepth 5 -type d -name control` 只命中无关的 `projects/<other-repo>/docs/control`；
- 主仓库 `<home>/projects/<host-repo>` 的 `git log --all -- control` 为空；
- `<drive>`、`<workspace>` 同名文件搜索无结果。

因此本报告的判定口径来自任务文本本身（「任一 RC=0 → BLOCKED」）与 handoff 的自我声明，**不是**来自 CONTROL.md 的验收定义。这一项只能记 UNPROVEN，不能记 CONFIRMED。

## 1. 结论总表

| 项 | 结论 | 一句话 |
|---|---|---|
| M-1 | **CONFIRMED** | 链写 13/14、链降级单行、清单少一个 journal、journal 少一帧，四种相在摘要全部重算有效的前提下全部 RC=1 |
| M-2 | **CONFIRMED（兼容，非空档）** | 旧链（无 coverage 字段）+ 13 文件清单 → RC=1；拦它的是清单的代码所有权角色集，不是 coverage 字段 |
| M-3 | **CONFIRMED（无抬高路径）** | `countComparisons` 是两张固定绑定表的长度：side=8、selfcheck=9；环境变量/未知 flag 无效；额外或重复角色被拒 |
| M-4 | **CONFIRMED** | 自建驱动重放四个历史变体，全部 RC=1，四种不同的拒绝门 |
| M-5 | **CONFIRMED** | 独立实现 canonical JSON + SHA-256，复算出 `85bbe1cb…`、`f178b652…`、`bc1607ad…`，与日志一致 |
| M-6 | **观察项（不阻塞）** | 见 §7，两级：print-coverage 完全忽略 `--manifest`（低）；validate 只取 `--manifest` 内容、路径一律相对 REPO_ROOT（中） |

## 2. 基线（工作树内，只读）

```
node --import tsx/esm scripts/generate-arcp-r6-go41-evidence.ts validate-local-evidence \
  --wire .../go41-r6-05-20261021/ARCP_R6_GO41_04_WIRE_CAPTURE.json \
  --transition .../ARCP_R6_GO41_04_ARCP_TRANSITION.json \
  --selfcheck .../ARCP_R6_GO41_04_GOVERNOR_SELFCHECK.json \
  --manifest .../ARCP_R6_GO41_04_EVIDENCE_MANIFEST.json \
  --chain .../ARCP_R6_GO41_04_LOCAL_EVIDENCE_CHAIN.json
```

```
validate-local-evidence: chain verified (3 records, 14 frozen files, coverage 14/14 count-bound,
calibration digest f178b652a8fa0e465fef3b798e0168ab32ce261a28116f85a47fb67996065825)
RC=0
```

冻结链自身摘要 `85bbe1cbd46aab4e22a406c3e1b6095136fc50c7cb5b0732205217a1137f8ec2`（无 `coverage` 字段），清单摘要 `14da7b039c99e9bd6d20d4d15bc8a2fb6b71012e8db623879e5bf4477028ee5f`。

## 3. M-1 · coverage 写进链 facts 与 digest（最高优先）

### 3.1 可达链路

`validate-local-evidence`（`scripts/generate-arcp-r6-go41-evidence.ts:4693-4744`）
→ 读三份记录 + 清单 → `assertFrozenEvidenceManifest(..., REPO_ROOT)`（4715）
→ `assertFrozenJournalsSupportRecords` 实测 coverage（4722）
→ `assertCoverageDeclaration`（handoff §4 与实测逐字比，4726）
→ `assertLocalEvidenceChain(chain, records, manifest, coverage)`（4731）
→ 链内 `coverage` 与实测投影比较（`1156-1159`）。

链摘要自校验在 `1126`，**先于** coverage 比较；所以「被摘要挡住」和「被 coverage 挡住」在错误信息上可区分——下面每一相都据此判读。

### 3.2 相 A：链写 13/14（删 `selfcheck/budget-0` 行），链摘要重算

| 观测 | 值 |
|---|---|
| 链摘要（重算后） | `c4330c66cbe7bf6d2608c007618edcaf6e4f22778e83766e2d52179ab3b6819f` |
| 清单摘要（重算路径后） | `3f5248756b29179d367be9284b0afd27157cff9c0a0f8b88228647e483d6757d` |
| 两个摘要是否自洽 | 是（本报告用独立实现复算，见 §6） |
| validate RC | **1** |
| 错误 | `local evidence chain coverage differs from the roles this validator bound` |

证明不是摘要挡的：错误串不是 `chain digest does not cover its own fields`；链摘要与清单摘要均按同一 canonical 规则重算且独立复算一致。

### 3.3 相 A'：链保持 14 行，把 `selfcheck/budget-0` 从 `count-bound` 降为 `shape-only`

| 观测 | 值 |
|---|---|
| 链摘要 | `da599da5bcd0643d7ac514bb3a45b9cb30faecec63635f92aee6f47c9fda6bdf` |
| 清单摘要 | `66ed422bdbee5cc6aeebc7b3391ec1a01ce52e48ba46a47474f44a1708617fef` |
| validate RC | **1** |
| 错误 | `local evidence chain coverage differs from the roles this validator bound` |

行数没变、只改等级也拒绝：比较的是投影后的 `{role,binding,order}` 三元组，不是行数。

### 3.4 相 B：链写 14/14，journal 少一个

三种构造，全部拒绝：

| 构造 | 链摘要 | 清单摘要 | RC | 拒绝点 |
|---|---|---|---|---|
| 物理删掉 `JOURNAL_01__selfcheck__budget-0.jsonl`，清单/链原样 | `7ac90736ded091d15d92597ab7d28b0446fef7de43f6b1ffafc25811f8443e21` | `3032caa9da548653ab61bb3977059fd36a2558d406db679e43344b152f213633` | 1 | `frozen file ... is missing from the checkpoint`（清单文件校验，`3192-3202`） |
| 清单重建为 13 文件 + 链重算（链仍写 14/14） | `da4652b498cd254d4b6914ff02aca9559e0944af57013e7e12fb7526f6fc9427` | `bebd1a0a9ea71243a72d4c7c5f832223bba0b53ae099b45c37f457c0382c8590` | 1 | `carries no frozen journal for the required role selfcheck/budget-0`（清单角色集，`3233-3244`） |
| journal 少一帧（4→3），清单条目重算 + 链重算（14/14） | `684eb1a3fa7597d4b42031e469bd7376dd6a22e4eaea209b3ba62217e96fe203` | `791084680a3a0338ec183558463410fe613845e87eba4dc3b7174c4b77786085` | 1 | `scenario budget-0 reports permitDenied=2, but its frozen selfcheck/budget-0 journal holds 1 permit-denied frame(s)`（计数比较，`3494-3516`） |

第三行是真正意义上的「摘要全绿也过不去」：链与清单都重算到自洽，仍被逐计数器比较拒绝。

### 3.5 残余（不阻塞）：`coverage: null` 可退回 legacy

把链的 `coverage` 改成 `null` 并重算摘要后：

```
chainDigest 005d8c1770751d2020970cf20c1a5f56ee345d9c58beb8ce55797aecfbda4695
RC=0  coverage 14/14 count-bound  calibration digest 03dcccedb83fde8d708975be3edd2bf3e64d91fc9e8dd3651d6fa88f54709620
```

这是 `1130-1132` 明确允许的 legacy 分支（handoff §2 也写明「when a chain carries it」）。它不产生假 14/14：报告行与摘要仍来自实测。但含义是 **C7 的链内 coverage 绑定是可选项**——想删就能删，只要重算摘要。判定：设计内兼容，不是本轮缺陷；若要收紧，需在协议层规定「新链必须带 coverage」并给 schemaVersion 分叉。

## 4. M-2 · 旧格式链 + 少一个 journal：兼容还是空档

构造：清单删掉 `selfcheck/budget-0` 的 journal 条目与对应 correspondence，重算清单摘要；链保持**无 `coverage` 字段**（旧格式），只重算 `frozenEvidence` 与链摘要。

| 观测 | 值 |
|---|---|
| 链摘要 | `8bc3be4948791a503a9f2ba5ba6da31a70b42742b696fb70f09d58e79f3af929` |
| 清单摘要 | `bb109b37162cf36c044a4498d9092c67e581b48c45aa3f1bf30397d1edb41996` |
| 链是否带 coverage | 否（`Object.hasOwn(chain,'coverage') === false`） |
| validate RC | **1** |
| 错误 | `frozen evidence manifest carries no frozen journal for the required role selfcheck/budget-0` |

**结论：兼容，不是空档。** 理由是可验证的：`assertFrozenEvidenceManifest` 的必需角色集由 `FROZEN_RECORD_CONTRACT` 代码拥有（`3233-3244`），在链被读取之前就把 13 文件清单挡下；随后 `assertExactJournalRoleSet`（`3813-3833`）再要求 14 个角色全部 `countComparisons>0`。两者都不看链的 `coverage` 字段，所以「旧链」并不能换来更弱的 journal 校验。旧链仍通过（基线 RC=0）只是因为 14 份 journal 确实全部绑定成功。

## 5. M-3 · 外部输入能否抬高 countComparisons

实测每角色计数（`measureFrozenCoverage()` 原始记录）：

```
wire                                shape=1 count=8 order=1 session=2
transition                          shape=1 count=8 order=1 session=1
selfcheck/*（12 个角色）             shape=1 count=9 order=1 session=0..1
```

- side 角色 = `SIDE_JOURNAL_COUNTERS` 长度 8（`3318-3327`，`3735-3746` 每次 +1）；
- selfcheck 角色 = `SELFCHECK_COUNTER_BINDINGS` 6 项（`3340-3352`）+ `stop-state` + `attempt-gap` + 一个 session 项 = 9（`3494-3599`，`3773` 一次 `+= compared.length`）。

外部输入尝试：

| 输入 | 结果 |
|---|---|
| `GO41_BOUND_JOURNAL_ROLES=selfcheck/budget-0` 环境变量 | `print-coverage` 仍 14/14；代码内无读取该变量的路径（`process.env` 只用于凭据与 DSH_HOME） |
| `print-coverage --roles selfcheck/budget-0`（未知 flag） | 仍 14/14（未知参数被静默忽略，见 §7a） |
| `measureFrozenCoverage([...BOUND_JOURNAL_ROLES, 'selfcheck/not-a-role'])` | 拒绝：`names selfcheck/not-a-role, which the coverage contract does not define` |
| 追加重复角色 | 拒绝：`the journal role list names one role twice` |

**结论：没有可达的外部输入能抬高 `countComparisons`。** 它不是「数出来的量」，而是两张冻结绑定表的长度；journal 内容、记录计数、环境变量、CLI 参数都改变不了它。唯一能改它的是库函数 `roles` 形参（`3663`），它只能缩短列表（降低覆盖），且生产调用点都不传（`4667`、`4722`、`4924`）。

## 6. M-5 · 独立复算（不用他们的 digest 模块）

自实现：递归按 `localeCompare` 排序键 + `JSON.stringify` + `sha256`（`packages/extensions/adaptive-controller/benchmark/src/digest.ts:30-45` 的同一 canonical 形式，但代码独立）。

| 复算对象 | 我的值 | 日志/文件值 | 一致 |
|---|---|---|---|
| 冻结链自身摘要 | `85bbe1cbd46aab4e22a406c3e1b6095136fc50c7cb5b0732205217a1137f8ec2` | 同 | ✅ |
| 冻结清单摘要 | `14da7b039c99e9bd6d20d4d15bc8a2fb6b71012e8db623879e5bf4477028ee5f` | 同 | ✅ |
| 14 行 calibration digest | `f178b652a8fa0e465fef3b798e0168ab32ce261a28116f85a47fb67996065825` | 总控/日志 `f178b652…` | ✅ |
| 13 行 calibration digest | `bc1607ad12210bc4f9562873095cd8b3bb918b70fe220b717c5a8f4a874bcf63` | handoff `bc1607ad…` | ✅ |

两相不等：`full != reduced`。复算输入来自 `measureFrozenCoverage()` 的实测行（14 行）与短列表抛错时的 `error.bindings`（13 行 + 1 not-covered），不是抄日志。

## 7. M-6 · 观察项定级

### 7a. `print-coverage` 完全忽略 `--manifest`（定级：低）

```
node --import tsx/esm scripts/generate-arcp-r6-go41-evidence.ts print-coverage \
  --manifest <audit-root>/nope.json --wire /nope
→ RC=0
→ Coverage: 14/14 required roles count-bound, 14/14 order-bound, 0 shape-only, 0 not-covered, 0 order-uncovered.
→ 打印 14 行
```

源码：`print-coverage` 分支只读 `argv[0]`（`4930-4947`），测量目标写死为 `COVERAGE_CHECKPOINT = 'handoff/adaptive-agent/go41-r6-05-20261021'`（`4887`），`measureFrozenCoverage` 只接受 `roles`/`checkpoint` 两个形参（`4899-4902`），CLI 不传。任何未知 flag 静默丢弃（`4870-4873` 只做 `indexOf`）。

风险：操作者以为在测另一个清单，拿到的是本仓库 05 检查点的表。缓解：`validate` 会用实测重渲染 §4 并逐字比较（`4007-4027`），错表在验收时会被抓。故不阻塞。

### 7b. `validate` 的 `--manifest` 只取内容，目录语义被忽略（定级：中）

把整个 05 检查点拷到仓库外，清空其中一份 journal，清单与链保持原样，用 `--manifest` 指向外部副本：

```
validate RC=0
validate-local-evidence: chain verified (3 records, 14 frozen files, coverage 14/14 count-bound,
calibration digest f178b652…)
```

原因：`assertFrozenEvidenceManifest(..., REPO_ROOT)`（`4715-4719`）与 `join(rootDir, path)`（`3191`）把清单里的相对路径一律解析到 **REPO_ROOT**，`--manifest` 的目录从不参与。结果：被点名的外部检查点里的空 journal 从未被读取，校验的是仓库内那份完好副本。

风险：审计者「把证据拷出来单独验」会得到一次针对别的目录树的 `chain verified`，而输出行不说明读了哪棵树。这是误导性证据，不是伪造通道（清单摘要仍绑定它实际读到的内容）。建议：要么按清单所在目录解析，要么拒绝对 REPO_ROOT 之外的清单，要么在输出行打印解析根。定级中，不阻塞本轮。

### 7c. 附带观察：30 例矩阵不含「链 coverage 伪造」（定级：低）

`scripts/arcp-r6-go41-tamper-check.ts` 的 30 例已复跑，全部 REJECTED；但其中 8 处 `assertLocalEvidenceChain(...)` 调用只传 3 个实参（`173,182,206,234,244,310,339,347`），**不传实测 coverage**，因此 C7 的链内比较在矩阵里从未被执行；唯一的 coverage 用例是 handoff §4 表格降级（`560-569`）。这不影响 `validate` 的结论（它必传 coverage），但「30 例全拒」这句话不覆盖本轮新开的 C7 面。

## 8. M-4 · 四个历史变体（自建驱动）

驱动：`<audit-root>/harness.mjs`。每个变体都从 `git archive HEAD` 的仓库外副本出发，替换 journal 字节、按新字节重算清单条目与清单摘要、重算链的 `frozenEvidence` 与链摘要（链保持旧格式、无 coverage），再跑真实 `validate-local-evidence` 子进程。未使用 `go41-07` 的 probe（它写 `REPO_ROOT/node_modules/.cache`，会碰工作树），也未使用 <audit-root> 的硬编码脚本。

| 变体 | 伪造 | 清单摘要 | 链摘要 | RC | 拒绝点 |
|---|---|---|---|---|---|
| `selfcheck-empty` | `budget-1-direct` 清空（7→0 帧） | `7366a64e…` | `d64b63ed…` | 1 | `scenario budget-1-direct reports permitGranted=1, but ... holds 0 permit-granted frame(s)` |
| `selfcheck-content` | `race-for-one-permit` 换成 1 帧 | `6af0af0c…` | `8618c912…` | 1 | 同上类：`permitGranted=1 ... holds 0` |
| `selfcheck-wire-session` | `main-and-title-delayed` 全帧改 wire 会话 | `3db33f3f…` | `34eae974…` | 1 | `frozen journals wire and selfcheck/main-and-title-delayed both claim session arcp-r6-go41-session-a` |
| `order-violation` | `budget-0` 前两帧 type 互换 | `314505a8…` | `525c50c6…` | 1 | `frame 1 (permit-denied) denies an attempt that was never opened` |

四个摘要均为本驱动重算且独立复算自洽；拒绝理由都是内容/计数/会话/顺序，不是摘要不覆盖字段。

## 9. 辅助复核

| 检查 | 结果 |
|---|---|
| `scripts/arcp-r6-go41-tamper-check.ts <05 检查点>` | `all 30 forgeries rejected`，`allInvariantsHold: true` |
| 运行后源工作树 | `git status --porcelain` 0 行（全程只读） |
| 源码改动面 | `git diff --name-only ebea03253b eb84149fca -- packages` = 0（与 handoff 一致） |
| 复现材料 | `<audit-root>/{run-all.sh, harness.mjs, rows.ts, bindings.ts, run-m3.sh, run-tamper.sh}` |

## 10. 建议（不阻塞）

1. `print-coverage`：拒绝未知参数，或接受 `--checkpoint/--manifest` 并真实生效；否则这条「测量」命令的输入是不可信的。
2. `validate-local-evidence --manifest`：解析根应来自清单所在目录（或在输出行声明 `root=`），避免「验了另一棵树」。
3. 协议层：若要 C7 的链内 coverage 不可后退，给「新链必须带 coverage」一个 schemaVersion 分叉，而不是让 `null` 与「未测量」共用一条 legacy 分支。
4. 矩阵：补一条「链 coverage 降级/删行 + 全量重算」用例，并让矩阵的链校验传入实测 coverage，否则「30 例」这句话覆盖不到本轮新面。

---

TASK-01D-R | ACCEPT | ckpt=539eda0782 | blocking=0 | report=<home>/audits/ARCP-R6-GO41-08/TASK-01D-R-report.md
