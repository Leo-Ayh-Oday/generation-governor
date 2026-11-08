# GO41-07 覆盖表变异校准（路径脱敏副本）

> 本文件是总控变异校准记录的路径脱敏副本：结论、注入补丁、命令与观测值均未改动，仅把本机绝对路径和内部目录名替换为占位符。
> 来源 SHA-256：`c0c800e0ee64bb170d96c732a302a932e630a0df32c51e3f2589b150b617d2e5`（脱敏前原件）。

---

| 字段 | 值 |
|---|---|
| 对象 | `ebea03253b`（GO41-07 checkpoint，自称 `coverage=count-bound 14/14`） |
| 执行者 | 总控窗口（非执行器、非核验器） |
| 性质 | 只读仓库 + 在仓外硬链接副本上注入单行变异 |
| 日期 | 2026-10-26 |
| 结论 | **覆盖等级是常量字面量，不是测量值**；降级一个角色的绑定后，校验器输出与正确实现逐字节相同 |

---

## 1. 待检验的声明

handoff §4 的生成块（由 `renderCoverageBlock()` 产出）：

```
Coverage: 14/14 required roles count-bound, 14/14 order-bound,
0 shape-only, 0 not-covered, 0 order-uncovered.
```

C5 的要求原文：

> 如果有人把某个角色降级却不改那张表，校验器必须判负。

## 2. 被检验的实现

`scripts/generate-arcp-r6-go41-evidence.ts:3692`

```ts
for (const role of BOUND_JOURNAL_ROLES) {
  const record = recordByRole.get(role)
  if (record === undefined) throw ...
  rows.push(Object.freeze({
    role,
    record,
    binding: 'count-bound' as const,   // ← 无条件常量
    order: 'order-bound' as const,     // ← 无条件常量
    note: ...
  }))
}
```

`binding` / `order` 都是 `as const` 字面量，对列表中每个角色无条件赋值。代码中不存在任何能产出 `shape-only` / `not-covered` / `order-uncovered` 的路径——`renderCoverageBlock()` 里那三个计数器因此恒为 0。

## 3. 变异

在仓外硬链接副本上注入一行（**仓库未被修改，`git status` 仍为 0**）：

```sh
cp -al <home>/worktrees/dsh-arcp-go41-07 <home>/<audit-root>/mutation2
# 用真文件替换硬链接，避免污染原仓库
rm  <home>/<audit-root>/mutation2/scripts/generate-arcp-r6-go41-evidence.ts
cp  <home>/worktrees/dsh-arcp-go41-07/scripts/generate-arcp-r6-go41-evidence.ts \
    <home>/<audit-root>/mutation2/scripts/generate-arcp-r6-go41-evidence.ts
sed -i "3632a\\    if (role === 'selfcheck/budget-0') continue" \
    <home>/<audit-root>/mutation2/scripts/generate-arcp-r6-go41-evidence.ts
```

变异后的 `assertFrozenJournalsSupportRecords`（`:3632`）：

```ts
for (const role of selfcheckRoles) {
  if (role === 'selfcheck/budget-0') continue   // ← 注入：该角色不再被绑定
  const label = role.slice('selfcheck/'.length)
  ...
```

这正是一个角色被"降级"的最小形式：它仍在 `REQUIRED_JOURNALS`、仍在 manifest、仍在表里，但绑定逻辑不再检查它。

## 4. 观测

| 命令 | 正确实现 `ebea03253b` | 变异副本 |
|---|---|---|
| `print-coverage` | `14/14 count-bound, 14/14 order-bound` | **`14/14 count-bound, 14/14 order-bound`（一致）** |
| `validate-local-evidence --wire … --transition … --selfcheck … --manifest … --chain …` | `chain verified (3 records, 14 frozen files, calibration digest 85bbe1cb…)` | **`chain verified (3 records, 14 frozen files, calibration digest 85bbe1cb…)`（一致）** |
| 退出码 | `0` | **`0`** |

**一个静默停止绑定 1/14 角色的校验器，与正确实现输出逐字节相同。**

也就是说：表里的 `count-bound` 不是"我绑定了这个角色"的测量结果，而是"这个角色在列表里"的同义反复。表是对的，但它证明的东西比它看起来少一层。

## 5. 复现

```sh
# 正确实现
cd <home>/worktrees/dsh-arcp-go41-07
node --import tsx/esm scripts/generate-arcp-r6-go41-evidence.ts print-coverage | tail -4

# 变异副本（已在上文建好）
cd <home>/<audit-root>/mutation2
node --import tsx/esm scripts/generate-arcp-r6-go41-evidence.ts print-coverage | tail -4

# 完整校验（两条命令的输出应逐字相同）
CK=handoff/adaptive-agent/go41-r6-05-20261021
node --import tsx/esm scripts/generate-arcp-r6-go41-evidence.ts validate-local-evidence \
  --wire "$CK/ARCP_R6_GO41_04_WIRE_CAPTURE.json" \
  --transition "$CK/ARCP_R6_GO41_04_ARCP_TRANSITION.json" \
  --selfcheck "$CK/ARCP_R6_GO41_04_GOVERNOR_SELFCHECK.json" \
  --manifest "$CK/ARCP_R6_GO41_04_EVIDENCE_MANIFEST.json" \
  --chain "$CK/ARCP_R6_GO41_04_LOCAL_EVIDENCE_CHAIN.json"
```

## 6. 这条实验不证明什么

- 不证明本轮 C4 有问题。C4 是真的：14 个角色确实被绑定了，红绿四例也确实从 `RC=0` 变成 `RC=1`。
- 不证明存在可被利用的攻击。当前代码没有任何 `continue` / `filter` / 短路；今天这张表说的是真话。
- 只证明一件事：**当实现与声明发生偏离时，这套机制不会说话。** 而"实现与声明偏离"正是本题连追四轮的病灶。

## 7. 边界

- 变异只在仓外副本，仓库 `git status` 全程为 0。
- 未修改任何冻结产物。
- 本实验不进入核验对象；它只用于支撑总控对 C5 的裁决。
