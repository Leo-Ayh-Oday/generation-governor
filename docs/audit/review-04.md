# ARCP-R6-GO41-04 Independent Re-review

Date: 2026-09-24 (Asia/Shanghai)

## Verdict and fixed object

**Overall verdict: REVISE for GO41-04 as a complete offline correction; BLOCKED for a new live-provider authorization; BLOCKED for R6 A/B startup.**

This ruling applies only to:

- repository: `<home>/worktrees/dsh-arcp-go41-04`
- diff base: `8c33466a3ceba193c1048f7062a62459f40386ee`
- final implementation: `c68f6df88e7150aef6488f09e90bfeed09fdbc26`
- evidence checkpoint: `be23ff7a2e572d531e21d9b4b0a7919c8aae24ec`
- review HEAD: `4235d81316bbfd93659f18b91a02372bc3355b60`
- prior report SHA-256: `5b5f2f5b399e70a6aedab6c19d31590afb12b6682465dd4ab252d997768fba59`

All objects exist. Git ancestry is exactly `base -> implementation -> evidence checkpoint -> review HEAD`. The implementation range changes five scripts. The evidence commit adds the GO41-04 bundle and updates the two ledgers; the final commit changes only those ledgers and the GO41-04 handoff. `git diff c68f6df8..4235d813 -- scripts packages` is empty.

The execution worktree was at the fixed review HEAD with only `packages/llm/llm-pi-ai/src/adapter.ts` modified. I did not read that uncommitted content, reset, clean, stash, checkout, overwrite, or move the execution worktree. Review ran in the clean detached worktree `<home>/worktrees/audit-arcp-r6-go41-04-4235d8` at exact review HEAD. Audit-only programs and results are under `<home>/audits/ARCP-R6-GO41-04-4235d8`.

SocratiCode MCP was not exposed in this tool environment. I followed the repository and subtree `AGENTS.md` files and used fixed-SHA Git, targeted source reads, the locked pi-ai 0.82.1 implementation, focused tests, independent child-process adversaries, and loopback endpoints. No real provider request, credential read/authentication, pilot, formal run, or live-smoke occurred.

## Three independent conclusions

1. **GO41-04 offline correction: REVISE / not acceptable as complete.** The known outer-return cleanup failure is conservatively contained, all six prior selfcheck forgeries are rejected, and committed frozen files are byte-valid. An adapter error converted to a terminal stream chunk is still misclassified as a completed/quiescent request and admits a concurrent second transport; cancellation while the actual wrapper chain is blocked in `source.next()` also bypasses the new cleanup bound. Strict validation still accepts contradictory nested facts, and three selfcheck run journals are absent from the checkpoint.
2. **Current budget/concurrency mechanism for controller consideration of one limited live validation: BLOCKED / insufficient.** The adapter-error reproduction sent a second request while the first transport remained active: endpoint `maxActive=2` while governor `maxActive=1`. The pending-read reproduction separately failed to terminate within the bound or retain a final settlement. The mechanism does not yet supply either the required transport serialization or bounded termination.
3. **R6 A/B readiness: BLOCKED / not ready.** Live acceptance, a legal treatment, study profile, capsule, and execution closure remain absent. These external conditions do not invalidate the accepted offline parts, but they independently block R6 A/B.

## Finding-by-finding adjudication

| Finding | Status | Ruling |
| --- | --- | --- |
| REV-012 conservative quiescence and bounded termination | **STILL OPEN** | Early return through the actual `PiAiAdapter -> lazyStream` queue/pump now stops the run and denies the second request even while the first loopback transport remains active. Cleanup and probe hangs are bounded and late settlement does not reopen the gate. However, the real DSH wrapper converts an adapter error to `finish(error)` and then outer exhaustion; the governor calls that completed/quiescent and admits a second transport (`maxActive=2`). Cancellation while already awaiting `source.next()` also remains unbounded. See GO41-04-REV-015. |
| REV-013 strict selfcheck validation | **PARTIALLY RESOLVED** | The exact code-owned sets, label-specific top-level rules, six prior self-consistent forgeries, roles, and digest bindings are fixed. Nested matrix/quiescence counters, the pre-send `pulled` fact, and key main/title detail arrays remain unchecked and can be resealed into a report the validator accepts. See GO41-04-REV-016. |
| EVID-014 checkpoint-only journal recovery | **STILL OPEN** | The 11 listed files exist, match sizes/hashes, and validate without reading original `/tmp`. The selfcheck also created separate retry, race, and queued-cancel run roots whose journals are not frozen. The manifest validator accepts a resealed omission or wrong correspondence, including a rebuilt valid chain. See GO41-04-EVID-017 and GO41-04-EVID-018. |
| FUP-001 journal ordinal | **CLOSED** | Every committed journal has unique, strictly increasing non-negative safe-integer `seq` values. Failed append attempts consume an ordinal: the attempted-failure journal starts at 2, and the post-send failure journal has the expected gap from 3 to 5. |

## Blocking findings

### GO41-04-REV-015 — HIGH — CONFIRMED BUG: wrapper-normalized adapter failure falsely releases the transport barrier

- **Fixed-SHA source:** `scripts/arcp-r6-go41-governor.ts:601-670`, especially `source.next()` and the unconditional `settlement='completed'` on `done=true` at `:632-635`, plus the automatic quiescence decision at `:658-665`; `packages/llm/llm/src/index.ts:925-998`, especially conversion of an adapter throw into a terminal chunk at `:976-983` followed by normal iterator exhaustion at `:985-987`; `packages/llm/llm-pi-ai/src/adapter.ts:384-428`; and the locked pi-ai 0.82.1 `lazyStream`/event queue. The related unbounded-read path is at governor `:632`, idle-watchdog `packages/util/timeout/src/index.ts:115-120,149-160`, and runner wait/disposal `scripts/generate-arcp-r6-go41-evidence.ts:596-660`.
- **Reachable call chain:** `governedStream -> LlmRuntime.adapterStream -> PiAiAdapter.streamWithSnapshot -> toStreamChunks -> pi-ai lazyStream queue/pump -> provider transport`. A provider-stream failure reaches the adapter; `adapterStream` deliberately converts the throw into `finish(error)` and returns normally. The governor does not inspect that terminal failure and sees only the next `done=true`, which it treats as trusted completion. No transport-owned quiescence fact supports that inference.
- **Independent actual-chain reproduction:** `tests/actual-wrapper-chain.mts` uses the real fixed-SHA `LlmRuntime`, `PiAiAdapter`, `toStreamChunks`, pi-ai 0.82.1 `lazyStream`, and real loopback HTTP transport. Only the provider-stream seam injects an error while deliberately retaining its received transport, the exact lower-cleanup failure under review. Both governed requests ended as `PI_AI_ERROR`, but the second was admitted before the first transport stopped. The endpoint recorded `received=2`, `active=2`, `maxActive=2`; the governor reported `permitsGranted=2`, `settled=2`, `downstreamQuiescent=2`, and `maxActive=1`, with no stop. Evidence: `tests/actual-wrapper-chain-inner-error.json`.
- **Pending-read reproduction:** in the same actual wrapper chain, a provider pump that does not settle after cancellation leaves the governor inside `source.next()`. The child recorded one endpoint receipt, `active=1`, `maxActive=1`, `sdkCalls=1`, `wrapperEnded=0`, `settlementUnknown=0`, and `stop.stopped=false`. A second request timed out locally and did not enter the SDK. Disposal returned, but the read remained pending and the complete process required the independent 3-second process timeout (exit 124). This fault injection establishes the runner's missing outer bound; unlike the adapter-error case, it did not cause overlap.
- **Control reproduction:** stopping the same actual chain while it was suspended at a yielded chunk returned in 2 ms, recorded `settlementUnknown=1`, stopped at `quiescence-unconfirmed`, kept one active loopback transport, and denied the second attempt as `PERMIT_RUN_STOPPED`. This closes the old swallowed-inner-cleanup counterexample when control reaches `finally`.
- **Cleanup/probe bounds:** independent helper adversaries measured 41–44 ms for never-settling cleanup, late-resolving cleanup, late-rejecting cleanup, and never-settling probe under a 40 ms bound. Each stopped irreversibly, denied the second attempt, did not claim `downstreamQuiescent`, and late settlement changed no counters or stop state.
- **Actual behavior versus requirement:** the completed branch is based on wrapper exhaustion rather than a trusted lower-transport terminal fact, so it releases the barrier after a normalized error and fabricates `downstreamQuiescent`. Separately, when no outer item arrives, `runSession()` only requests Agent cancellation and continues waiting on `whenIdle()`; the governor's teardown timeout cannot run until `source.next()` returns.
- **Impact:** the first path violates the core concurrency invariant and makes governor evidence under-report real endpoint activity. The second can leave the calibration runner without a final record and keep the process alive past its requested bound.
- **Minimum correction invariant:** a terminal error/aborted chunk followed by wrapper exhaustion must not establish transport quiescence. Release requires a trusted lower-layer terminal fact or successful transport-owned probe; otherwise stop irreversibly, retain the barrier, deny queued/later work, and record unknown. Cancellation during an outstanding read must reach the same bounded terminal branch, and owning runner/disposal waits must not depend indefinitely on that read.
- **Blocks:** REV-012 closure, complete GO41-04 offline acceptance, and consideration of a live authorization.

### GO41-04-REV-016 — HIGH — CONFIRMED BUG: strict selfcheck validation still accepts contradictory nested facts

- **Fixed-SHA source:** main/title validation at `scripts/generate-arcp-r6-go41-evidence.ts:2492-2513`; journal and quiescence rules at `:2562-2646`; JSON-boundary validation at `:2980-3070`, especially `:3054` and `:3069`, which require nested `counters` only to be objects.
- **Reachable trigger:** a producer changes retained raw facts, recomputes the derived conclusion and `reportDigest`, and submits the report. This requires no collision and is the same self-consistent adversary the validator is intended to reject.
- **Closed prior cases:** independent resealing confirmed rejection of all six previous failures: scenario plus required-entry deletion; journal-point plus required-entry rename; one main/title receipt with `exactlyTwoRequests=false`; negative top-level counter; duplicate scenario; and a complete chain rebuilt around the invalid main/title report. Rejections came from code-owned rules, not stale hashes.
- **Accepted new cases:** the validator returned success after independently resealing each of the following: a negative `journalMatrix[].counters.permitsGranted`; `pulled=true` for the pre-send `attempted` failure row despite zero receipt; a negative `quiescenceAdversaries[].counters.downstreamQuiescent`; an empty main/title `requestSessionHeaders` array; and `requestMessageCounts=[-1,"not-a-count"]`. Evidence: `tests/selfcheck-manifest-adversarial-results.json`.
- **Actual behavior versus requirement:** top-level scenario counters are typed and checked, but nested raw counters and several decision-bearing detail fields are neither typed nor cross-checked. The main/title header rule uses `every()` without requiring two entries; its message-count rule checks only array length. Journal validation ignores the row's own `pulled` and nested counter record.
- **Impact:** the chain can certify exact bytes whose top-level conclusion says all invariants hold while retained raw evidence contains impossible counters, claims a pre-send downstream pull, or omits both per-request identities. This is an evidence-tool bug; it does not show the committed selfcheck is false. Fresh behavior replay matched the committed behavior digest exactly.
- **Minimum correction invariant:** validate the fields that the report retains as proof: exact governor-counter keys with non-negative safe integers and arithmetic consistency for matrix/adversary rows; pre/post-send `pulled` semantics; and exact typed main/title request arrays with two identities, two non-negative message counts, and two terminal statuses. Cross-check duplicated raw and summary facts rather than accepting each independently.
- **Blocks:** REV-013 closure and complete GO41-04 offline acceptance.

### GO41-04-EVID-017 — HIGH — CONFIRMED BUG: frozen-manifest completeness and correspondence remain input-owned

- **Fixed-SHA source:** manifest validation at `scripts/generate-arcp-r6-go41-evidence.ts:2809-2880`; correspondence construction at `:2942-2958`; chain binding at `:3374-3424` and `:3428-3463`.
- **Reachable trigger:** remove a required journal from both `files` and its correspondence entry, or replace one record's journal mapping with another listed journal, then recompute `manifestDigest` and rebuild the complete chain.
- **Independent checkpoint-copy reproduction:** validation from an audit-directory copy rejected deletion or modification of a still-listed journal. It accepted a manifest with one required journal omitted and accepted a wrong record-to-journal mapping. `composeLocalEvidenceChain` rebuilt around each accepted manifest, and `assertLocalEvidenceChain` accepted both complete chains. No original `/tmp` path was read. Evidence: `tests/selfcheck-manifest-adversarial-results.json` and `tests/checkpoint-recovery-root/`.
- **Actual behavior versus requirement:** the validator checks only paths currently listed and that correspondence paths occur somewhere in that list. It owns no exact required file/role set, does not require the three exact record roles, does not require each file to be assigned exactly once to its correct record, and cannot detect an omitted entry after the manifest and chain are resealed.
- **Impact:** file hashes prove the identity of listed files, while the claimed recovery set can silently lose a required journal or attribute it to the wrong record and still be certified as a complete chain.
- **Minimum correction invariant:** derive the required journal roles and exact expected scenario/run coverage from code-owned record facts or a code-owned manifest schema; require exact record roles, exact unique assignment of every required file, no unassigned/duplicate mapping, and the expected count only as a consequence of that set.
- **Blocks:** EVID-014 closure and complete GO41-04 offline acceptance.

### GO41-04-EVID-018 — MODERATE — EVIDENCE GAP: the committed checkpoint omits three selfcheck run journals

- **Fixed-SHA source:** separate retry, race, and queue run roots at `scripts/generate-arcp-r6-go41-evidence.ts:3161-3173`, `:3213-3226`, and `:3250-3267`; freeze call limited to the primary `paths.runRoot` at `:3331-3336`; handoff completeness claim at `handoff/adaptive-agent/go41-r6-04-20260924/ARCP_R6_GO41_04_HANDOFF.md:128-140`; English ledger claim at `handoff/adaptive-agent/ARCP_V0_2_1_IMPLEMENTATION_LEDGER.md:1590-1596` and its Chinese counterpart.
- **Observed condition:** the committed manifest has 11 files: nine selfcheck journals under the primary run root plus wire and transition. The selfcheck's `retry-amplification`, `race-for-one-permit`, and `queued-cancel` scenarios use three sibling run roots created from `${outputPath}-retry`, `${outputPath}-race`, and `${outputPath}-queue`; `freezeJournals(paths.runRoot, ...)` cannot walk those siblings.
- **Independent reproduction:** fresh selfcheck produced the three separate files `governor-selfcheck.replay.json-retry.run/governor-journal.jsonl`, `...-race.run/governor-journal.jsonl`, and `...-queue.run/governor-journal.jsonl`. Their hashes are retained in `tests/missing-frozen-journals-replay.sha256`. None has a role in the committed manifest. This conclusion uses fixed source and fresh audit output, not the original executor `/tmp`.
- **Actual behavior versus requirement:** “11 frozen files” accurately describes the current list, and all 11 are valid, but “every journal this round's runs produced” is false. The checkpoint alone cannot replay the detailed journal frames for three scenarios that contribute to the selfcheck conclusion.
- **Impact:** EVID-014's portability goal is incomplete even if the manifest validator is repaired. The selfcheck report digest retains aggregate facts, but the frozen checkpoint does not retain all underlying journals it claims to carry.
- **Minimum correction invariant:** freeze journals from every selfcheck run root before composing the manifest, bind each to its scenario/record, and state the retained boundary accurately. Harness homes, sessions, workspaces, and unrelated dependencies need not be frozen.
- **Blocks:** EVID-014 closure and complete GO41-04 offline acceptance.

## Accepted behavior and regressions

The actual-wrapper early-return control recorded one active loopback request, `maxActive=1`, and no second SDK call; the second attempt was denied by the stopped run. That accepted sub-fix does not cover the normalized-error path above. The independent journal regression reconnected `permit-granted`, `dispatch-entered`, and queued-after-settled failures to a loopback endpoint: the two pre-send failures had zero receipts, and queued-after-settled had only the first receipt. REV-007 remains closed.

Fresh full-composition replay reproduced all 12 selfcheck scenarios. Normal paths remained usable: wire capture dispatched eight serialized requests including a successful tool call and continuation; retry dispatched two attempts within budget and denied the third; main/title delayed produced exactly two receipts and two confirmed settlements at endpoint `maxActive=1`; ordinary destroyed-socket errors produced two sequential receipts with no active transport at scenario end. Main/title cancellation and early stop deliberately stopped their runs and sent nothing later. REV-011 remains closed.

The normalized-error reproduction reaches the real supported wrapper chain and the exact DSH error-to-finish behavior; it is not a standalone arbitrary iterator. The lower provider failure and retained loopback transport are injected at the SDK seam because no real provider call was authorized. This proves that the current composition has no trustworthy quiescence boundary for that reachable failure class; it does not assert that the real OpenCode Go service will exhibit the injected failure.

## Integrity, provenance, and checkpoint-only recovery

Independent canonical recomputation matched every committed semantic digest:

| Artifact | File SHA-256 | Semantic digest |
| --- | --- | --- |
| wire | `2a06f928a9853867eb64b8e0ad5a7986889cc3100343fcafe6995ba7599544b2` | record `dcebfc72...`; wire/classifications both matched |
| transition | `a5515f6cb162494e9aad3eed3daed2cc491d43596f7bbe56aa8c2754ee2585b0` | record `fb5d8944...`; wire/classifications both matched |
| selfcheck | `bd362daacd43a4ce59b531b3132dbaef1e61e8da1804d172cd9c50a83c206057` | report `df7e5447...` |
| frozen manifest | `3f565c5c3bf6fcfc4345fdc1c70b5d432f2ee2a074d127523f640371cdd77380` | manifest `9fc6226c...` |
| local chain | `bc1dd0d632bca4ce32d4068547c2333d29d84bccf11e83aba9f4d29a171ea317` | calibration `12146f5e...` |

Wire, transition, and selfcheck bind implementation `c68f6df88e...`; every recorded source digest matches `git show c68f6df88e:<path>`. The three records carry the same lockfile digest and pi-ai 0.82.1 dependency version. Fresh review-HEAD replay reproduced the committed wire digest, both classifications digests, transition wire digest, and the complete selected selfcheck behavior digest exactly. Record/report digests differ where fresh provenance contains new paths, timestamps, and review SHA, as expected.

From an audit-only copy, the original 11-file manifest validated without accessing the recorded `/tmp` run roots. Every listed file matched its byte count and SHA-256. All journal ordinals were unique and strictly increasing. This proves checkpoint identity for the listed files. It does not cure the omitted sibling-run journals, prove that the described historical process ran, freeze the unlisted Harness home/session/workspace, or create a sealed execution closure.

### FUP-001 ordinal result

`GenerationGovernor.frame()` increments one `appendAttempts` counter before every append attempt at `scripts/arcp-r6-go41-governor.ts:490-519`. Committed journals contain no duplicates or reversals. The failed `attempted` append consumed ordinal 1, so its best-effort `journal-failed` record is ordinal 2; the failed `first-chunk-observed` append consumed ordinal 4, so its failure record is ordinal 5. FUP-001 is closed.

### Non-blocking documentation follow-up

**GO41-04-FUP-002 — LOW — NON-BLOCKING FOLLOW-UP.** `scripts/arcp-r6-go41-governor.ts:537-543` says that a teardown returning without throwing can confirm transport termination without a probe. The implementation at `:653-669` correctly treats only `settlement === 'completed'` or a positive caller probe as confirmation. Align this JSDoc with the implemented rule; it did not change runtime behavior or the verdict.

## Commands and results

Commands ran from the detached review worktree unless an absolute path is shown.

| Command/check | Exit | Result |
| --- | ---: | --- |
| fixed-object `git cat-file` and three `merge-base --is-ancestor` checks | 0 | objects and ancestry verified |
| prior-report `sha256sum` | 0 | matched the supplied SHA-256 |
| `pnpm install --offline --frozen-lockfile` | 0 | 936 packages installed from local store; zero downloaded |
| focused Vitest command for llm-pi-ai, governor, and evidence chain | 0 | 13 files, 336 tests passed |
| author `arcp-r6-go41-tamper-check.ts` | 0 | all its 16 forgeries rejected |
| committed `validate-local-evidence` | 0 | three records and 11 listed frozen files verified |
| independent selfcheck/manifest adversary | 2 intentionally | six old selfcheck forgeries rejected; nine new expected-reject semantic/manifest cases were accepted |
| actual wrapper early-return child | 0 | active loopback transport retained; run stopped; second SDK call denied; process ended |
| actual wrapper normalized-error child | 0 | both requests returned `PI_AI_ERROR`; endpoint `received=2`, `maxActive=2`; governor incorrectly recorded `downstreamQuiescent=2`, `maxActive=1` |
| actual wrapper pending-read cancellation child | 124 expected from process timeout | request and transport remained active; wrapper/run never ended; second request did not send |
| independent bounded cleanup/probe adversary | 0 | four 40 ms cases ended in 41–44 ms, stayed stopped, and ignored late settlement |
| independent journal loopback regression | 0 | permit-granted/dispatch-entered zero receipts; queued-after-settled one receipt only |
| fresh `governed-selfcheck` | 0 | 12 scenarios, five journal points, queued case, six quiescence cases reproduced |
| fresh `wire-capture` / `arcp-transition` | 0 / 0 | 8 / 2 loopback dispatches; semantic digests matched committed evidence |
| independent record/manifest/chain/source digest recomputation | 0 | every claimed digest and implementation source digest matched |
| checkpoint-copy listed-file deletion / byte modification | rejected | validator detected both |
| checkpoint-copy omitted entry / wrong correspondence with rebuilt chain | incorrectly accepted | demonstrates EVID-017 |
| `pnpm exec tsc -b packages/llm/llm-pi-ai --pretty false` | 0 | affected package typecheck passed |
| `NODE_OPTIONS=--max-old-space-size=8192 pnpm exec tsc -b tsconfig.host.json --pretty false` | 0 | host typecheck passed with the recorded 8 GiB heap cap; known default-heap OOM was not deliberately repeated |
| focused Oxlint over five changed TypeScript files | 0 | no findings |
| Markdown wrap/link, Agent Note, translation pairing, export JSDoc, workspace constraints, and vendored-link checks | all 0 | applicable focused repository gates passed |
| `git diff --check 8c33466a..4235d813` | 0 | no whitespace errors |

No pre-push or CI was run. Host typecheck, pre-commit history, and focused checks are not reported as pre-push or CI PASS.

Not covered: real provider receipt/acceptance, credentials, usage, remote reasoning capability, pilot/formal execution, capsule, study profile, execution closure, pre-push, and CI.

## External blockers

- **EXTERNAL BLOCKER — live acceptance:** no retained provider receipt, response, usage, or reasoning-support fact exists; historical exact sends and runtime bytes remain unknown.
- **EXTERNAL BLOCKER — experiment eligibility:** the exact route still lacks a trustworthy supported-set/escalation declaration and therefore a legal treatment. This conclusion is scoped to the current adapter/configuration.
- **EXTERNAL BLOCKER — governed study execution:** no study profile, capsule, or execution closure exists for this route.

These conditions block R6 A/B but are not reasons to reject the REV-012 and REV-013 sub-fixes that were independently demonstrated.

## Minimum next step

The controller should require one more offline checkpoint with three narrow corrections:

1. stop treating outer `done=true` after `finish(error|aborted)` as trusted transport completion, and bound cancellation while `source.next()` is outstanding across the real `LlmRuntime -> PiAiAdapter -> lazyStream` chain, so unknown state stops the run, retains the barrier, and lets the owning runner finish;
2. validate the nested counter, `pulled`, and main/title detail fields already used as evidence;
3. freeze the retry, race, and queued-cancel journals, and make manifest completeness and record correspondence code-owned.

Rerun the actual-wrapper pending-read child, the nine accepted selfcheck/manifest forgeries, and checkpoint-only recovery with no original `/tmp`. Preserve the passing outer-return, cleanup/probe, normal-request, journal fail-closed, and main/title controls. Whether a corrected future checkpoint merits one separately bounded live validation remains solely the controller's decision.
