# 五轮对抗复核：声明为什么必须被测量

> 一句话命题：**「我说我管住了」与「我真的管住了」之间，必须有一条机器强制的连接。**

这份案例不是项目宣传，也不是一篇讲道理的文章。它记录的是：一套本地证据链连续五次被自己的复核机制抓住，最后靠变异实验把「声明」改成「测量」。所有判断都保留被打回的原文，包括复核者当时读不到控制文档这件事。

---

## 0. 读之前先划边界

- 本仓能独立跑的是 `src/governor.ts` + 34 个测试，以及下面列出的公开证据副本。
- 私有宿主仓库的 SHA 是对象标识符，**不代表读者能在公网复现整个宿主仓库**。
- `GO41-08 / ACCEPT` 只指本地证据链完整性可被代码自证；不指产品收益、真实 provider 验收、任务成功率或 A/B 通过。
- 路径中的 `<home>` / `<workspace>` / `<audit-root>` 是脱敏占位符；判断、数字、命令结果未改。

---

## 1. 对象链

| 对象 | 裁决 | 关键事实 | 公开索引 |
|---|---|---|---|
| `GO41-04` @ `4235d813` | `REVISE` | 外层 `done=true` 被当成 transport 静止；`finish(error)` 后仍释放许可 | `docs/audit/` 中既有复核报告 |
| `GO41-05` @ `f22141eb4c` | `BLOCKED` | `requestSessionHeaders=[]` 通过 `.every()`；删除必需 journal 并重封 manifest/chain 仍 `RC=0` | `docs/audit/review-05.md` |
| `GO41-06` @ `a4876ba7a1` | `REVISE` | 声明 14 个角色全部绑定，实际只有 wire / transition 两个侧 journal 有计数绑定 | `docs/audit/review-06.md` |
| `GO41-07` @ `ebea03253b` | `REVISE` | 覆盖表由代码生成，但等级是无条件常量；总控变异实验证明降级一个角色后输出不变 | [`docs/evidence/mutation-calibration.md`](evidence/mutation-calibration.md) |
| `GO41-08` @ `539eda0782` | `ACCEPT` | 等级来自绑定记录；coverage 进入 calibration digest；独立核验 `blocking=0` | [`docs/audit/review-08.md`](audit/review-08.md) |

`GO41-08` 的对象链是 `ebea03253b → eb84149fca → 539eda0782`。它的独立核验报告 §1 把 M-1…M-5 全部记为 `CONFIRMED`，M-6 记为不阻塞观察项。

---

## 2. 五种同源病

| 形态 | 缺陷是怎么活下来的 | 为什么绿灯没抓住 |
|---|---|---|
| 1 | 测试把缺陷写成断言：`confirms quiescence on ... an ordinary stream error` | 断言本身要求错误路径确认静止 |
| 2 | 篡改矩阵 19/19 全绿，但少了 `[]` 这一条 | `[].every(...)` 恒为真，缺少基数约束 |
| 3 | manifest 校验只检查「所列文件」，没有代码自有的期望集合 | 删掉一个必需 journal 并重算摘要后，剩下那份仍然自洽 |
| 4 | §4 声明覆盖 14 个角色，实际只绑定 2 个 | 声明的覆盖面大于实现的覆盖面，而 §1 还引用了「§4 会说明」这句并不存在的话 |
| 5 | 覆盖表改为代码生成，但 `binding: 'count-bound' as const` 无条件赋值 | 表证明「角色在列表里」，不证明「角色被检查过」 |

这五张脸指向同一个病根：**测试矩阵或声明，是照着「实现能过的样子」搭的，不是照着「不变量能被破的样子」搭的。**

---

## 3. 决定性的变异实验

总控在仓外硬链接副本里注入一行：

```ts
for (const role of selfcheckRoles) {
  if (role === 'selfcheck/budget-0') continue   // 该角色不再被绑定
  // ...
}
```

这个角色仍在列表里、仍在 manifest 里、仍会出现在覆盖表里，只是绑定循环不再检查它。这是「降级」的最小形式。

| | GO41-07 `ebea03253b` | GO41-08 `539eda0782` |
|---|---|---|
| `print-coverage` | `14/14 count-bound` | `13/14 + 1 shape-only` |
| `validate-local-evidence` | `RC=0`，`chain verified` | `RC=1`，`missing selfcheck/budget-0` |
| calibration digest | 正确实现与变异体同为 `85bbe1cbd46a…` | 正确实现 `f178b652a8fa…`；降级 `bc1607ad1221…` |

**同一个注入，上一轮让校验器和正确实现输出逐字节相同；这一轮当场被判负。** 差别不是多写了一条用例，而是覆盖等级从常量变成了绑定记录。

完整补丁、命令与两相输出见 [`docs/evidence/mutation-calibration.md`](evidence/mutation-calibration.md)。GO41-08 的独立核验还在摘要全部重算有效的前提下，构造了链写 13/14、单行降级、journal 删文件、journal 少一帧四种攻击，全部 `RC=1`；详见 `docs/audit/review-08.md` §3。

---

## 4. 先红后绿：必须证明「同一份伪造」

「改之前红了、改之后绿了」不够。红相和绿相必须跑在同一份伪造上，只换校验器。GO41-06 的 `omission-full` 片段：

```
RED  (base f22141eb4c)  manifest=ea39c6fbc19e  RC=0
GREEN(impl 9a5aea9bd6)  manifest=ea39c6fbc19e  RC=1
```

两相的 manifest 摘要逐字相同。若摘要不同，「红了又绿了」可以有一百种解释，其中九十种是骗自己。

六个变体（`omission-full` / `mapping` / `relabel` / `content` / `content-manual` / `header-empty`）的原始输出见附录 A；红相在独立 detached worktree、实现未改、0 脏，绿相在实现提交上。

---

## 5. 负校准：让机制自己失效，然后要求它叫

GO41-08 的校准日志有三段，第三段才是结论：

| 段 | 做法 | 观测 | 排除什么 |
|---|---|---|---|
| 单元级 | 传入少一个角色的列表 | `13/14 + 1 not-covered`，抛错 | 覆盖表不会在缺记录时硬说 14/14 |
| 同码对照 | red / green 都指向 base | `red RC=0 / green RC=0`，`BASE-ONLY` | 注入本身不会制造假阳性 |
| 换实现 | red 指 base，green 指新实现 | `red RC=0 / green RC=1`，注入点摘要两相同为 `ef8fc5eaecc5…` | 「叫」来自本轮改动，不是环境差异 |

「同码对照」这一段不是工单要求的，是执行器自己补的。它值钱，因为前四轮缺的恰恰是这一步：不是证明「它叫了」，而是证明「它叫是因为这次改动」。

---

## 6. GO41-08 到底关闭了什么

- `assertFrozenJournalsSupportRecords()` 返回按角色索引的绑定记录：`shapeChecks` / `countComparisons` / `orderComparisons` / `sessionComparisons` 由实际执行的比较循环递增。
- `journalCoverage(index)` 只做投影：无记录 → `not-covered`；有形状无计数 → `shape-only`；计数比较跑过 → `count-bound`。
- 主闸是双向集合相等：实际 count-bound 集合与 `BOUND_JOURNAL_ROLES` 完全相等，少一个、多一个、重复一个都抛错。
- coverage 写进链的 facts 与 calibration digest；旧冻结链的 `85bbe1cbd46a…` 不被改写，旧 checkpoint 仍能验过。
- 独立核验用自实现的 canonical JSON + SHA-256 复算出 `85bbe1cb…`、`f178b652…`、`bc1607ad…`，与日志一致。

**关闭的是：** 「checkpoint 完整、且每个角色都被实际绑定」这一声明可以被代码自证。

**没有关闭：** 外部锚问题。见下一节。

---

## 7. 没有证明什么

- **本地检查挡不住全量重算的伪造者（`R-002`）。** 把 14 个 journal、三份记录、manifest、chain 全部重算到自洽，且计数/会话/顺序都满足角色契约，本地任何检查都分不出来。算法公开，期望值就在仓库里；要闭合这一层需要签名 checkpoint、已发布 SHA 或第三方时间戳。
- **进程退出仍无界（`R-001`）。** 释放屏障不等于进程结束；socket 持有句柄时仍依赖 runner 外部超时。
- **没有接真实 provider。** 公开仓的 34 个测试跑在 fake transport 与本地端点上。
- **没有证明收益。** task success、cost per success、tokens、wall time、false completion 一概未测。
- **不是通用 agent 框架。** 它只做一件事：不许把「结束的声明」当成「结束的事实」。

---

## 8. 收口后仍挂着的观察项

独立核验的 `ACCEPT / blocking=0` 不等于「没有遗留问题」。`docs/audit/review-08.md` 明确记了三条：

1. `print-coverage` 忽略 `--manifest` 等未知参数，固定测量默认 checkpoint（低）。
2. `validate-local-evidence --manifest` 只取清单内容，文件解析仍相对 `REPO_ROOT`；「把 checkpoint 拷到仓外单独验」会验到仓内那份（中）。
3. 30 例篡改矩阵里 8 处链校验只传 3 个实参，不传实测 coverage，因此「30/30 全拒」不覆盖 C7 新开的链内 coverage 面（低）。

另外 `chain.coverage === null` 走 legacy 分支仍 `RC=0`，这是设计内兼容，不产生假 14/14；若要收紧，需要 schemaVersion 分叉。这些都如实保留，没打算用「已验收」三个字盖住。

---

## 9. 证据索引

| 公开文件 | 来源 | 说明 |
|---|---|---|
| `src/governor.ts` / `test/governor.spec.ts` | 本仓 | 896 行实现、34 个测试；`pnpm test` 可独立运行 |
| `docs/audit/review-02.md` … `review-06.md` | 本仓 | 既有独立复核报告原文 |
| `docs/audit/review-08.md` | 原件 SHA-256 `5be194704a179cbd448b22a315e256b8d8e8c5fccb6cfb87f017c7c720442832` | 路径脱敏副本，判断/数字未改；§0 的 `UNPROVEN` 保留 |
| `docs/evidence/mutation-calibration.md` | 原件 SHA-256 `c0c800e0ee64bb170d96c732a302a932e630a0df32c51e3f2589b150b617d2e5` | 路径脱敏副本，变异补丁、两相命令与输出未改 |
| 附录 A | 原件 SHA-256 `6e88e3527147a806113ff9c4779326ed3e9bc09455957717a9f41214c5d86499` | GO41-06 红绿日志路径脱敏全文 |

GO41-08 校准日志位于私有宿主仓的 handoff 中，未公开；本案例引用的 `f178b652…` / `bc1607ad…` / `ef8fc5ea…` 由 `review-08.md` §6 的独立复算交叉确认。

---

## 附录 A · GO41-06 红绿日志（路径脱敏全文）

> 仅把本机路径与内部目录名替换为占位符；变体名、摘要、RC、错误串与命令输出均未改。

```text
# TASK-01B · GO41-06 red -> green transcript
# Red  : detached worktree <home>/worktrees/<audit-worktree> at f22141eb4c,
#        implementation untouched, 0 dirty entries.
# Green: <home>/worktrees/dsh-arcp-go41-06 at 9a5aea9bd6; the only
#        dirty entry during those runs is the untracked directory this
#        transcript is written into.
# Each case re-seals the checkpoint with the module's own constructors,
# then runs that checkout's validate-local-evidence.
# The re-sealed manifest digests are identical in both phases, so each
# green case is the same forgery the red case accepted.

########################################################################
## variant: omission-full - RED (base f22141eb4c)
########################################################################
[probe] repo=<home>/worktrees/<audit-worktree> head=f22141eb4c dirty=0
[probe] variant=omission-full resealed: 13 files, 2 records; manifest=ea39c6fbc19e chain=d68ad660ab5d
[validate] validate-local-evidence: chain verified (3 records, 13 frozen files, calibration digest d68ad660ab5d1a18b012a1505b40bc44d8996356e6ec444dd3f10626eba62d06)
[probe] variant=omission-full validate-local-evidence RC=0

########################################################################
## variant: omission-full - GREEN (9a5aea9bd6)
########################################################################
[probe] repo=<home>/worktrees/dsh-arcp-go41-06 head=9a5aea9bd6 dirty=1
[probe] variant=omission-full resealed: 13 files, 2 records; manifest=ea39c6fbc19e chain=d68ad660ab5d
[validate] arcp-r6-go41: frozen evidence manifest carries no frozen journal for the required role wire
[probe] variant=omission-full validate-local-evidence RC=1

########################################################################
## variant: mapping - RED (base f22141eb4c)
########################################################################
[probe] repo=<home>/worktrees/<audit-worktree> head=f22141eb4c dirty=0
[probe] variant=mapping resealed: wire and transition journal ownership swapped; manifest=cc593a20bdbd chain=1601b0bae5ba
[validate] validate-local-evidence: chain verified (3 records, 14 frozen files, calibration digest 1601b0bae5ba69e4968ff02f19f8532be3c404713e6d3d02fb5d9f14bd91b848)
[probe] variant=mapping validate-local-evidence RC=0

########################################################################
## variant: mapping - GREEN (9a5aea9bd6)
########################################################################
[probe] repo=<home>/worktrees/dsh-arcp-go41-06 head=9a5aea9bd6 dirty=1
[probe] variant=mapping resealed: wire and transition journal ownership swapped; manifest=cc593a20bdbd chain=1601b0bae5ba
[validate] arcp-r6-go41: frozen evidence manifest assigns the transition journal handoff/adaptive-agent/go41-r6-05-20261021/ARCP_R6_GO41_04_TRANSITION_JOURNAL.jsonl to ARCP_R6_GO41_04_WIRE_CAPTURE, which does not own that role
[probe] variant=mapping validate-local-evidence RC=1

########################################################################
## variant: relabel - RED (base f22141eb4c)
########################################################################
[probe] repo=<home>/worktrees/<audit-worktree> head=f22141eb4c dirty=0
[probe] variant=relabel resealed: all three record identifiers renamed; manifest=46d125760261 chain=26b3b140b870
[validate] validate-local-evidence: chain verified (3 records, 14 frozen files, calibration digest 26b3b140b870bad054ba413e10128897f787383277fabf678f3b0f8c656242bf)
[probe] variant=relabel validate-local-evidence RC=0

########################################################################
## variant: relabel - GREEN (9a5aea9bd6)
########################################################################
[probe] repo=<home>/worktrees/dsh-arcp-go41-06 head=9a5aea9bd6 dirty=1
[probe] variant=relabel resealed: all three record identifiers renamed; manifest=46d125760261 chain=26b3b140b870
[validate] arcp-r6-go41: frozen evidence manifest names the record RENAMED_ARCP_R6_GO41_04_GOVERNOR_SELFCHECK, which this round does not define
[probe] variant=relabel validate-local-evidence RC=1

########################################################################
## variant: content - RED (base f22141eb4c)
########################################################################
[probe] repo=<home>/worktrees/<audit-worktree> head=f22141eb4c dirty=0
[probe] variant=content resealed: wire journal replaced with 983 bytes of another journal; manifest=6f1fe6f33086 chain=68b7b7706384
[validate] validate-local-evidence: chain verified (3 records, 14 frozen files, calibration digest 68b7b7706384cc5c79e0d4b2f19a7ec75177cf45feda09d3b81e1f9eed31bb00)
[probe] variant=content validate-local-evidence RC=0

########################################################################
## variant: content - GREEN (9a5aea9bd6)
########################################################################
[probe] repo=<home>/worktrees/dsh-arcp-go41-06 head=9a5aea9bd6 dirty=1
[probe] variant=content resealed: wire journal replaced with 983 bytes of another journal; manifest=6f1fe6f33086 chain=68b7b7706384
[validate] arcp-r6-go41: frozen evidence manifest frozen wire journal handoff/adaptive-agent/go41-r6-05-20261021/ARCP_R6_GO41_04_WIRE_JOURNAL.jsonl carries session arcp-r6-go41-transition, which the wire scenario never drives
[probe] variant=content validate-local-evidence RC=1

########################################################################
## variant: content-manual - RED (base f22141eb4c)
########################################################################
[probe] repo=<home>/worktrees/<audit-worktree> head=f22141eb4c dirty=0
[probe] variant=content-manual resealed: wire journal replaced with a 2-frame hand-written journal; manifest=f3bc84ef9fe9 chain=ecf1b77b2967
[validate] validate-local-evidence: chain verified (3 records, 14 frozen files, calibration digest ecf1b77b2967591d7d0bd48b5a28584c95d25853476794f02a8d6486b7adab58)
[probe] variant=content-manual validate-local-evidence RC=0

########################################################################
## variant: content-manual - GREEN (9a5aea9bd6)
########################################################################
[probe] repo=<home>/worktrees/dsh-arcp-go41-06 head=9a5aea9bd6 dirty=1
[probe] variant=content-manual resealed: wire journal replaced with a 2-frame hand-written journal; manifest=f3bc84ef9fe9 chain=ecf1b77b2967
[validate] arcp-r6-go41: the wire-capture record reports attempted=8, but its frozen wire journal holds 2 attempted frame(s)
[probe] variant=content-manual validate-local-evidence RC=1

########################################################################
## variant: header-empty - RED (base f22141eb4c)
########################################################################
[probe] repo=<home>/worktrees/<audit-worktree> head=f22141eb4c dirty=0
[probe] variant=header-empty resealed: requestSessionHeaders reduced to [] and the report resealed; manifest=14da7b039c99 chain=33a39810a0be
[validate] validate-local-evidence: chain verified (3 records, 14 frozen files, calibration digest 33a39810a0be351afbdba7cc98426a36749652181f6c2ef736ee7a139e7ad783)
[probe] variant=header-empty validate-local-evidence RC=0

########################################################################
## variant: header-empty - GREEN (9a5aea9bd6)
########################################################################
[probe] repo=<home>/worktrees/dsh-arcp-go41-06 head=9a5aea9bd6 dirty=1
[probe] variant=header-empty resealed: requestSessionHeaders reduced to [] and the report resealed; manifest=14da7b039c99 chain=33a393b94ecc
[validate] arcp-r6-go41: governor self-check report does not hold its contracts: [{"where":"scenario main-and-title-delayed","why":"every request must carry the scenario session header"}]
[probe] variant=header-empty validate-local-evidence RC=1
```

