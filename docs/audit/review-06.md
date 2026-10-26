# ARCP-R6-GO41-06 · TASK-01B-R 独立核验报告

**裁决：REVISE**　blocking=1　核验 SHA：`a4876ba7a1`

| 字段 | 值 |
|---|---|
| 对象链 | `f22141eb4c` (base) → `9a5aea9bd6` (impl) → `a4876ba7a1` (ckpt) |
| 审计工作树 | `<home>/worktrees/audit-arcp-r6-go41-06-a4876b`（detached，自有，核验结束时 0 脏） |
| 执行器工作树 | `<home>/worktrees/dsh-arcp-go41-06` @ `a4876ba7a1`，0 脏，**未改动** |
| 核验产物 | `<home>/g06-audit/`（`probe.ts` / `run.sh` / `run-all.sh` / `regress.sh` / `g04.sh`） |
| 结论摘要 | **V-1…V-8 全部 CONFIRMED；改动范围与回归全部成立；handoff §4 的边界声明被"缩小"（低估残余面），需更正后才可作为接受残余风险的依据** |

**先说清三个陷阱的处理**

1. `g05-audit/evid017*.sh` 一行未用。驱动是新建的 `<home>/g06-audit/probe.ts`，`REPO`/`WT` 指向 `audit-arcp-r6-go41-06-a4876b`。
2. 自建驱动 + 摘要对表：`omission-full` → `ea39c6fbc19e`、`mapping` → `cc593a20bdbd`、`relabel` → `46d125760261`、`content` → `6f1fe6f33086`、`content-manual` → `f3bc84ef9fe9`，**与 `RED_GREEN.log` 逐字相同**，说明我造的是同一份伪造、伪造强度可比较。`header-empty` 的 manifest 亦为 `14da7b039c99`（chain 摘要不同，见 V-1 注）。
3. `git diff f22141eb4c a4876ba7a1 -- handoff/adaptive-agent/go41-r6-05-20261021` = **0 行**，确认 14 journal / 3 记录 / manifest / chain 未重新生成，本轮测的是校验器行为。

---

# 必查项

## V-1 · `requestSessionHeaders = []` — **CONFIRMED**

- 源码：`scripts/generate-arcp-r6-go41-evidence.ts:2578-2582`

```ts
expect(
  Array.isArray(detail.requestSessionHeaders) && detail.requestSessionHeaders.length === 2
    && detail.requestSessionHeaders.every(header => header === detail.sessionHeader),
  'every request must carry the scenario session header',
)
```

- 链路：`validate-local-evidence` → `assertSelfcheckReport` → `scenarioViolations('main-and-title-delayed')` → 上述分支。
- 复现：`bash <home>/g06-audit/run.sh header-empty`（把 `detail.requestSessionHeaders` 置空、用模块自己的 `digest` 重封 report、重建 chain）。
- 观测：`RC=1`，`arcp-r6-go41: governor self-check report conclusion does not match its own contracts: [{"where":"scenario main-and-title-delayed","why":"every request must carry the scenario session header"}]`。
- 判据：基数补齐后空数组不再空真。上一轮我实测"被接受"的同一构造，本轮被同一条契约拒绝。

> 注：我的 `header-empty` chain 摘要为 `a8c5e3b87c2d`，日志记 `33a393b94ecc`。manifest 摘要一致（`14da7b039c99`），说明被改的输入相同；chain 差异来自重封时 selfcheck 记录落盘与否的构造细节，不影响本条判定（拒绝理由与日志 green 相同）。

## V-2 · `omission-full` — **CONFIRMED**（拒绝理由来自期望集合）

- 源码：`:3188-3201`（role 解码 → 必需集合的缺失/多余双向检查）、`:3249-3253`（必需记录必须出现）。
- 复现：`bash <home>/g06-audit/run.sh omission-full`（删 wire journal + 删其归属条目 → 13 文件 / 2 记录；manifest `ea39c6fbc19e`，与日志同）。
- 观测：`RC=1`，`frozen evidence manifest carries no frozen journal for the required role wire`。
- 判据：理由来自 `requiredRoles` 的缺失检查（`:3192-3196`），**不是**"correspondence 为空"这类旁路理由，也**不是**计数比较——代码里没有与 13 或 14 比较的任何分支。

## V-3 · `mapping` — **CONFIRMED**

- 源码：`:3229-3241`（`owned.has(role)`）。
- 复现：`run.sh mapping`（`cc593a20bdbd`）。
- 观测：`RC=1`，`assigns the transition journal …TRANSITION_JOURNAL.jsonl to ARCP_R6_GO41_04_WIRE_CAPTURE, which does not own that role`。

## V-4 · `relabel` — **CONFIRMED**

- 源码：`:3212-3219`（`recordContract.get(entry.record)`）。
- 复现：`run.sh relabel`（`46d125760261`）。
- 观测：`RC=1`，`names the record RENAMED_ARCP_R6_GO41_04_GOVERNOR_SELFCHECK, which this round does not define`。

## V-5 · `content`（换成另一角色字节） — **CONFIRMED**

- 源码：`assertFrozenJournalContent` `:3014-3051`（wire 角色：会话白名单 + 两个会话都必须出现）。
- 复现：`run.sh content`（wire journal ← transition journal 的 983 字节；manifest `6f1fe6f33086`）。
- 观测：`RC=1`，`carries session arcp-r6-go41-transition, which the wire scenario never drives`。

## V-6 · `content-manual`（手写形状合规 journal） — **CONFIRMED**

- 源码：`assertFrozenJournalsSupportRecords` `:3298-3331`，调用点 `:3971`（compose）、`:4024`（validate）。
- 复现：`run.sh content-manual-exact`（用日志同款两帧字节，manifest `f3bc84ef9fe9` **逐字对上**）。
- 观测：`RC=1`，`the wire-capture record reports attempted=8, but its frozen wire journal holds 2 attempted frame(s)`。
- 判据：形状全部合规（两个 wire 会话、已知帧型、detail 记录、seq 连续），唯一不合的是帧计数。

## V-7 · 形状合规但帧计数与所挂记录不符 — **CONFIRMED**（单独验证，未用 V-2 代替）

- 目标函数：`assertFrozenJournalsSupportRecords` `:3298-3331`；绑定表 `SIDE_JOURNAL_COUNTERS` `:3275-3284`（8 个帧型 ↔ 计数器）。
- 自建用例：40→34 帧，8 attempted / 8 permit-granted / 8 dispatch-entered / 8 first-chunk-observed / **2 settled**；seq 连续、两个会话都在、帧型全已知 —— 即"除计数外全部合规"，且失败计数器是 `settled`（与 V-6 的 `attempted` 不同，排除"只是形状检查在起作用"）。
- 观测：`RC=1`，`the wire-capture record reports settled=8, but its frozen wire journal holds 2 settled frame(s)`（manifest `4a52e8686e03`）。
- 追加对照（证明该绑定只在计数上生效、不看时序）：把 40 帧写成"先 8 个 settled，再 8 组 attempted/permit-granted/dispatch-entered/first-chunk"——计数与记录**完全一致**，顺序是 governor 不可能产生的。
- 观测：`RC=0`，`chain verified (3 records, 14 frozen files, …)`（manifest `e5ff11ada5a1`）。见 §4 边界。

## V-8 · 删一个 journal、重封后集合仍"自洽" — **CONFIRMED**

- 用例：删 `JOURNAL_01__selfcheck__budget-0.jsonl` 并从 SELFCHECK 的归属条目中移除（剩余 13 文件仍是完整划分，仍覆盖 3 条记录），重封 manifest + chain。
- 观测：`RC=1`，`frozen evidence manifest carries no frozen journal for the required role selfcheck/budget-0`（manifest `132718af0437`）。
- 判据：理由来自 `FROZEN_RECORD_CONTRACT`（`:2964-2977`）展开的 14 个必需 role，**不是**文件数比较；`assigned.size !== seen.size` 那条（`:3259`）根本没走到。

---

# 回归（全部成立）

| 项 | 复现 | 观测 |
|---|---|---|
| 规格 | `npx vitest run scripts/arcp-r6-go41-governor.spec.ts scripts/arcp-r6-go41-evidence-chain.spec.ts` | **66 passed (34 + 32)** |
| 拒绝矩阵 | `node --import tsx/esm scripts/arcp-r6-go41-tamper-check.ts handoff/adaptive-agent/go41-r6-05-20261021` | **25/25 REJECTED**，退出码 0（末 6 条正是本轮六个用例，含 `hand-written to shape`） |
| M-2 / M-3 / REV-015 | `governed-selfcheck --out <home>/g06-audit/self3.json` | `allInvariantsHold: true`、`violations: []`；`ordinary-stream-error` recv=1/unknown=1/stopped=true；`retry-amplification` 3/1/2/1；6 个 adversary 全部 `secondPulled=false` |
| 12 行表 | 同上，与冻结报告结构比对 | **非 provenance 差异 0**，场景行逐格相同，conclusion 两侧同为 true |
| M-1 | `wire-capture --out <home>/g06-audit/m1/…` | `edf3c244f4dd7330…`，**3819 B，mode 444**，与冻结副本逐字节一致 |
| EVID-018 | 逐文件 `sha256sum` 对 `<home>/g05-run/**` | **14/14 MATCH**（含 `-retry`/`-race`/`-queue` 三个 sibling） |
| lint | `npx oxlint` 三个文件 | 0 warnings, 0 errors |

**GO41-04 的 11 文件 checkpoint 判负 = 预期，不是回归**：整链校验 `RC=1`；单独对 04 的 manifest 调 `assertFrozenEvidenceManifest` 也 `RC=1`，理由 `carries no frozen journal for the required role selfcheck/budget-0`——即由期望集合拒绝，而非偶然的摘要不符。（整链路径上先触发的是 04 报告自身的旧契约违规：`ordinary-stream-error` / `retry-amplification` 仍按修复前语义记录。两条路都判负，但它不是"因为 11 个文件"这个计数理由。）

---

# §4 边界复核 — **边界被"缩小"（低估残余面），blocking=1**

handoff §4 原文：*"A forger who re-derives every record, re-seals manifest and chain, **and** writes a journal whose frames and counts satisfy the role's contract is indistinguishable from a real run by any local check."* 紧随其后的"已关闭"清单包含 *"hand-writing a shape-conforming journal whose frame counts do not match the record it is filed under"*。

这句话对 **wire / transition** 成立（V-6/V-7 实测），对**十二个 selfcheck journal 不成立**，而 §4 没有区分。三条实测（均 `RC=0`，`chain verified (3 records, 14 frozen files, …)`）：

| 探针 | 内容 | 结果 |
|---|---|---|
| `selfcheck-empty` | `JOURNAL_01__selfcheck__budget-0.jsonl` 替换为**空文件**（0 字节）；该场景行记录 attempted=2 / denied=2 | **RC=0**（manifest `e50601efb729`） |
| `selfcheck-content` | 替换为**单帧** `attempted` | **RC=0**（`f3de42d2d90f`） |
| `selfcheck-wire-session` | 替换为**wire 场景的会话**（`arcp-r6-go41-session-a`）的 `first-chunk-observed` 单帧 | **RC=0**（`f3ad091488d1`） |

根因两条，都在本地可检：

1. **selfcheck 角色没有计数绑定**（`:3020-3072` 只查帧型/会话/detail 形状；`:3267-3273` 的注释明确只绑定 side journals）。空文件连"形状"都不违反——`sequences` 为空，`unique.size === sequences.length` 成立，会话集合为空循环通过。
   这不是"做不到"：十二个 role 的后缀与 selfcheck 报告的 `scenarios[].label` 是**同一集合**（实测 12/12 逐一对应），每行都带 `attempted / permitGranted / permitDenied / dispatchEntered / wrapperEnded / downstreamQuiescent / settlementUnknown / settled`，绑定所需的数据在记录里现成。
2. **selfcheck 的会话命名空间检查是前缀判断** `session.startsWith('arcp-r6-go41-')`（`:2916`、`:3065-3071`），而 wire / transition 的会话同样以 `arcp-r6-go41-` 开头，等于该检查对"跨场景串用"没有区分力。

另外一条不在 §4 声明内的本地可检面：**帧序不检查**。`order-violation` 探针（计数全对、8 个 `settled` 排在最前）`RC=0`。§4 若按字面理解（"frames and counts satisfy the role's contract"，而契约里没有顺序）尚可自洽，但读者不会这样读。

**文档内部还有一处悬空引用**：§1（第 85-87 行）称 *"so for those roles the shape contract is the whole claim, and **§4 says so**"* —— §4 全文没有任何一句说这件事。这条不需要判断力就能核对，属于必须更正的事实性错误。

**为什么这构成 blocking 而不是脚注**：本轮的交付物是"闭包 + 它自己的边界"。§4 是总控据此接受残余风险的唯一依据。当前 §4 把"12/14 个文件的计数不匹配"这一整类留在外面却没有说，且 §1 指向 §4 的交叉引用是空的；若照此 ACCEPT，决策记录会建立在一句比实现更乐观的陈述上。**代码不需要改**，需要改的是 §4 的三段文字（并把 `assertFrozenJournalsSupportRecords` 只覆盖两个 side journal 这件事写进去）；是否要进一步给 12 个 selfcheck role 加计数绑定，属于总控的新工单判断。

---

# 未证事项

- **freeze-evidence 路径**（handoff §3 末行"14 frozen file(s)"）未独立复现：需要 12 个 role 的 run root 齐备，本轮未重建那套目录。`UNPROVEN`。
- **tsc**：handoff 声称需 `NODE_OPTIONS=--max-old-space-size=6144`；我未跑（环境内存限制与结论无关）。`UNPROVEN`。
- **红相**：六例中 `omission-full`/`mapping`/`relabel`/`content` 的红相我在 GO41-05 轮已独立测得 `RC=0`（同一伪造、同一摘要）；`content-manual`/`header-empty` 的红相依赖执行器日志，我只独立验证了"旧校验器的 `assertSelfcheckReport` 接受空 header 数组"这一子事实。合并判定成立，但红相本身不完全独立。

# 复核命令

```sh
# 逐项（每条运行前自动还原，运行后打印 dirty=0）
bash <home>/g06-audit/run-all.sh omission-full mapping relabel content \
     content-manual-exact count-mismatch order-violation omission-selfcheck header-empty
bash <home>/g06-audit/run-all.sh selfcheck-content selfcheck-wire-session selfcheck-empty count-exact

# 回归
bash <home>/g06-audit/regress.sh          # M-1 / EVID-018 / GO41-04
bash <home>/g06-audit/g04.sh              # GO41-04 整链，RC=1
npx vitest run scripts/arcp-r6-go41-governor.spec.ts scripts/arcp-r6-go41-evidence-chain.spec.ts
node --import tsx/esm scripts/arcp-r6-go41-tamper-check.ts handoff/adaptive-agent/go41-r6-05-20261021
```

---

TASK-01B-R | REVISE | ckpt=a4876ba7a1 | blocking=1 | report=<home>/audits/ARCP-R6-GO41-06-a4876b/ARCP_R6_GO41_06_INDEPENDENT_REVIEW.md
