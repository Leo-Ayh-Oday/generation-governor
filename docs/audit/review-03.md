# ARCP-R6-GO41-03 Independent Re-review

Date: 2026-09-24 (Asia/Shanghai)

## Verdict and fixed object

**Overall verdict: REVISE for GO41-03 as a complete offline correction;
BLOCKED for a new live-provider authorization; BLOCKED for R6 A/B startup.**

This ruling applies only to:

- repository: `<home>/worktrees/dsh-arcp-go41-03`
- diff base: `bf264bdf8aedb6e5965a406eed01239d014a5068`
- implementation: `da98c552725dbb0985561bc6f91659ff57321f9e`
- evidence checkpoint: `7367142961e912339d8efedddb2a247e6589a76f`
- review HEAD: `8c33466a3ceba193c1048f7062a62459f40386ee`
- prior report SHA-256:
  `e66a56531dc46efbca15a69ea6e3ac9200f641120cd2a13bdf473f28ee24acdd`

All objects exist. Git ancestry is exactly `base -> implementation -> evidence
checkpoint -> review HEAD`. `da98c552..73671429` adds evidence and changes only
handoff/ledger material; `73671429..8c33466a` changes only the two ledgers and
the GO41-03 handoff. `git diff da98c552..8c33466a -- scripts packages` is empty.

The execution worktree was at the fixed review HEAD with the four dirty files
named by the controller. I did not reset, clean, stash, checkout, edit, or commit
there. Review ran in the clean detached worktree
`<home>/worktrees/audit-arcp-r6-go41-03-8c3346` at exact review HEAD.
Audit-only programs and results are under
`<home>/audits/ARCP-R6-GO41-03-8c3346`.

SocratiCode MCP was not exposed in this tool environment. I used fixed-SHA Git,
targeted source reads, focused tests, and independent loopback/fake-transport
reproductions. No real provider request, credential read/authentication, pilot,
or formal run occurred. The only HTTP servers used by the audit listened on
`127.0.0.1`; live-smoke was invoked only without its allow flag and refused
before creating a run.

## Three independent conclusions

1. **GO41-03 offline correction: REVISE / not acceptable as complete.** The
   old journal fail-open paths and main/title evidence gap are closed. The
   cleanup/quiescence rule still does not survive the actual wrapper chain, and
   selfcheck semantic validation remains bypassable despite complete digest
   binding.
2. **Current budget/concurrency mechanism for controller consideration of a
   limited live run: BLOCKED / insufficient.** Directly visible teardown errors
   now stop safely, but the supported pi-ai wrapper hides an inner teardown
   failure and can make the governor release the slot without confirmed
   transport quiescence. Cleanup also has no bound when `return()` never
   settles.
3. **R6 A/B readiness: BLOCKED / not ready.** Live acceptance, a legal
   treatment, study profile, capsule, and execution closure remain absent.
   Those external conditions do not invalidate the accepted offline fixes, but
   they independently block R6 A/B.

## Finding-by-finding adjudication

| Finding | Status | Ruling |
| --- | --- | --- |
| REV-007 journal fail-closed | **CLOSED** | All five positions and the queued-after-settled case fail closed. The three formerly failing paths were independently connected to a loopback HTTP endpoint: `permit-granted` and `dispatch-entered` produced zero receipts; queued-after-settled produced only the already-sent first receipt. Stop is irreversible and queued work terminates locally. |
| REV-008 quiescence/bounded termination | **PARTIALLY RESOLVED** | The prior direct `next()`/`return()` throw adversaries are closed: second attempts do not pull and do not deadlock. The actual adapter chain can swallow an inner teardown failure, after which the governor treats the outer return as confirmation and releases. A never-settling return also has no timeout. See GO41-03-REV-012. |
| REV-009 full selfcheck binding | **PARTIALLY RESOLVED** | The complete selfcheck, verified `reportDigest`, implementation/source/dependency/run provenance, and derived conclusion are now bound as the third record. Semantic validation can still be weakened by changing the input-owned required sets or scenario-specific claims; the selfcheck journal is not frozen in the checkpoint. |
| REV-010 strict validator | **PARTIALLY RESOLVED** | The prior missing-transition, wrong-classifications, wrong-record-type, stale digest, role replacement, and old-chain/new-child forgeries are rejected. Self-consistent missing-required, invalid-count, duplicate-scenario, and false scenario-specific invariant forgeries are accepted. See GO41-03-REV-013. |
| REV-011 main/title two-success evidence | **CLOSED** | Independent replay produced exactly two scenario-local endpoint receipts, endpoint and governor `maxActive=1`, two distinct permits, and two `completed` settlements. The session log separately identifies the main turn and automatic title request/provider result. Cancellation remains a separate one-receipt scenario. |

## Findings

### GO41-03-REV-012 — HIGH — CONFIRMED BUG: outer iterator completion is not a reliable quiescence confirmation and cleanup is unbounded

- **Fixed-SHA source:** governor teardown at
  `scripts/arcp-r6-go41-governor.ts:540-637`, especially
  `:603-621`; DSH adapter wrapper at
  `packages/llm/llm/src/index.ts:925-999`; pi-ai adapter cleanup at
  `packages/llm/llm-pi-ai/src/adapter.ts:339-428`, especially `:408-415`.
- **Reachable trigger:** a consumer stops early and pi-ai's underlying SDK
  iterator throws during `return()`, or the downstream `return()` Promise never
  settles. The first path is explicitly handled by current production source:
  pi-ai aborts, catches the SDK return exception, and lets its outer async
  generator return successfully.
- **Actual behavior versus requirement:** `governedStream()` sets
  `teardownConfirmed=true` whenever `await source.return?.()` returns without an
  outer exception. It does not inspect the returned `done` value and has no
  timeout. Through the actual wrapper ownership, an inner SDK cleanup exception
  is hidden at `llm-pi-ai/src/adapter.ts:411-415`; requesting abort is not proof
  that the transport has become quiet. The governor therefore receives a
  successful outer return and records downstream quiescence although the
  lowest observable cleanup failed.
- **Independent reproduction:** the direct prior adversaries now behave safely:
  both `next()`-throws and `return()`-throws recorded one received/active fake
  transport, `maxActive=1`, stopped at `quiescence-unconfirmed`, and denied the
  second attempt without pulling it. An adapter-shaped nested reproduction then
  caught the inner return error exactly as pi-ai does. The outer return resolved;
  the second request ran; measured transport state was `received=2`, actual
  `maxActive=2`, `active=1`, while the governor reported `maxActive=1`,
  `downstreamQuiescent=2`, and `stopped=false`. Evidence:
  `tests/governor-loopback-adversarial-results.json` under this audit directory.
- **Bounded termination reproduction:** when `source.return()` never resolved,
  the first wrapper remained unfinished after the observation bound,
  `wrapperEnded=0`, `stop=false`, and a queued second attempt timed out locally.
  No second send occurred, but the owning run could not finish or write final
  evidence. The request timer in `runSession()` requests cancellation; it does
  not bound the awaited cleanup.
- **Contract boundary:** a missing `return` or a `return()` result with
  `done:false` also caused transport `maxActive=2` in the generic helper test.
  Those two cases are legal under the current `AsyncIterable` type, but I found
  no such iterator in the fixed GO41 composition: its current wrappers and
  adapter are async generators. They are supporting contract defects, not the
  basis of the blocking ruling. The swallowed inner exception and missing
  timeout follow the actual DSH/pi-ai call chain.
- **Impact:** the claimed concurrency barrier is conditional on an outer wrapper
  hiding no lower cleanup failure. A stopped/aborted live request can overlap a
  later attempt, or prevent the runner from terminating and retaining final
  evidence.
- **Minimum correction invariant:** the exact supported adapter chain must
  propagate or explicitly attest lowest-owned transport quiescence; a wrapper
  return cannot confirm it after swallowing a cleanup failure. Await cleanup and
  any quiescence probe under a finite bound. A timeout, missing return,
  `done:false`, thrown cleanup, or unknown lower state must stop the run without
  releasing to another request, while allowing the caller to terminate and
  retain evidence.
- **Blocks:** REV-008 closure, acceptance of the hard concurrency mechanism,
  and consideration of a live authorization.

### GO41-03-REV-013 — HIGH — CONFIRMED BUG: selfcheck validation trusts input-owned required sets and ignores scenario-specific failure claims

- **Fixed-SHA source:** trusted constants at
  `scripts/generate-arcp-r6-go41-evidence.ts:1648-1677`; generic scenario
  derivation at `:2337-2357`; report conclusion at `:2368-2433`; validator at
  `:2454-2487`.
- **Reachable trigger:** a producer changes the selfcheck facts and recomputes
  the conclusion, report digest, and chain. This is the adversary the validator
  is intended to reject; no hash collision or stale digest is involved.
- **Actual behavior versus requirement:** the validator never compares
  `requiredScenarios`, `requiredJournalPoints`, or
  `requiredQuiescenceCases` with the module's trusted constants. It checks only
  input against input. `derivedScenarioInvariants()` validates eight generic
  arithmetic claims but does not require every recorded scenario-specific
  invariant to be true. It also performs no complete numeric/schema validation
  on scenario and matrix rows.
- **Independent tamper results:** the audit matrix expected all cases to reject.
  The following fully resealed cases were accepted:
  - remove `main-and-title-delayed` from both `scenarios` and
    `requiredScenarios`;
  - replace the first required journal point and its matrix label with an
    invented value;
  - change main/title to `stubReceived=1`, `requestCount=1`, and
    `exactlyTwoRequests=false`;
  - set `permitGranted=-999` in a scenario;
  - duplicate a scenario label.

  More strongly, the audit rebuilt a three-record chain around the one-receipt
  main/title selfcheck. The official `validate-local-evidence` CLI returned exit
  0 and reported the chain verified. Evidence:
  `tests/independent-tamper-matrix-results.json`,
  `tests/tamper-main-title-one-receipt-selfcheck.json`, and
  `tests/tamper-main-title-one-receipt-chain.json`.
- **Correctly rejected cases:** missing, duplicate, or replaced chain roles;
  stale selfcheck digest; recomputed child with the old chain; the prior
  missing-transition, wrong-classification, and wrong-record-type forgeries.
  These are real improvements.
- **Impact:** hashes now bind the exact submitted bytes, but the validator can
  certify a fully regenerated report that omits a required scenario, renames a
  required failure point, contains illegal counters, or expressly records that
  main/title did not meet its central invariant. This is an evidence-tool bug;
  it does not show that the committed report is false. Independent replay
  supports the committed behavior.
- **Minimum correction invariant:** compare the three required arrays to
  code-owned exact sets and reject missing, extra, reordered where ordering is
  meaningful, and duplicate entries. Validate all row shapes and non-negative
  safe-integer counters. Derive label-specific requirements from trusted code
  (including exactly two main/title receipts and settlements) and reject every
  false recorded invariant instead of treating extra invariants as unchecked
  prose.
- **Blocks:** REV-009/010 closure and complete acceptance of the evidence tool.

### GO41-03-EVID-014 — MODERATE — EVIDENCE GAP: the selfcheck run journal is environment-retained rather than checkpoint-retained

- **Fixed-SHA source:** provenance construction at
  `scripts/generate-arcp-r6-go41-evidence.ts:302-351`; selfcheck artifact at
  `handoff/adaptive-agent/go41-r6-03-20260924/ARCP_R6_GO41_03_GOVERNOR_SELFCHECK.json:1`.
- **Observed condition:** the checkpoint commits wire and transition journals,
  but not a selfcheck journal. The selfcheck points to
  `/tmp/go41c-ev/selfcheck.json.run/governor-journal.jsonl` and binds its digest
  and containing run-root digest.
- **Independent evidence:** that `/tmp` run root was still present during this
  review. Independent recomputation matched both its journal digest
  `e9f37de2...` and run-root digest `bdacec98...`. A fresh independent selfcheck
  replay also reproduced all committed behavioral results.
- **Impact:** current-machine recovery is credible, but the frozen Git
  checkpoint alone cannot recover the detailed selfcheck journal after `/tmp`
  is cleaned. This is separate from integrity: the report digest and chain do
  bind the full reported matrices and counts.
- **Minimum correction invariant:** freeze the selfcheck journal/run manifest
  with the evidence bundle, or explicitly scope recovery to the retained
  external run root and do not describe the Git checkpoint alone as carrying
  the journal.
- **Blocks:** complete REV-009 provenance closure. It does not invalidate the
  independently reproduced committed behavior.

### GO41-03-FUP-001 — LOW — NON-BLOCKING FOLLOW-UP: journal `seq` values are not unique ordinals

- **Fixed-SHA source:** sequence calculation at
  `scripts/arcp-r6-go41-governor.ts:429-445`; committed wire journal at
  `handoff/adaptive-agent/go41-r6-03-20260924/ARCP_R6_GO41_03_WIRE_JOURNAL.jsonl:1`.
- **Observed result:** the 40-frame wire journal has 30 unique `seq` values;
  duplicates include 1, 3, 6, 11, 16, 21, 23, 26, 31, and 36. The calculation
  derives `seq` from counters that are updated on different sides of the append.
- **Impact:** physical append order and the file digest still preserve ordering,
  and no control decision reads `seq`, so this did not defeat fail-closed
  behavior. The field is not a reliable frame ordinal for recovery tooling.
- **Minimum follow-up:** use one monotonic frame counter incremented exactly once
  for every append attempt, and document whether failed/best-effort frames
  consume an ordinal.
- **Blocks:** nothing in this checkpoint.

## REV-007 journal matrix and accounting result

The independent HTTP-loopback matrix used the real fixed-SHA governor and
counted requests at the endpoint rather than trusting governor counters:

| Injected failure | First receipts | Total after later attempt | Later result |
| --- | ---: | ---: | --- |
| `attempted` | 0 | 0 | `PERMIT_RUN_STOPPED` |
| `permit-granted` | 0 | 0 | `PERMIT_RUN_STOPPED` |
| `dispatch-entered` | 0 | 0 | `PERMIT_RUN_STOPPED` |
| `first-chunk-observed` | 1 | 1 | `PERMIT_RUN_STOPPED` |
| `settled` | 1 | 1 | `PERMIT_RUN_STOPPED` |
| `settled`, second already queued | 1 | 1 | `PERMIT_RUN_STOPPED` |

Required writes now return success/failure into the gate. `acquire()` rechecks
stop after waiting; `markDispatchEntered()` is a final pre-pull fence; journal
failure wakes queued work; and the first stop reason is irreversible. Pre-send
failure sends nothing. Post-send failure spends its permit, makes no new send,
and does not fabricate a provider receipt. REV-007 is closed.

## REV-011 main/title result

Fresh full-composition replay produced:

- `main-and-title-delayed`: two endpoint receipts, two attempts/permits/
  dispatches/settlements, endpoint and governor `maxActive=1`, active-at-end 0;
- two request records with the same owning session header and different message
  cardinalities (`3` for the main context, `2` for title generation);
- governor frames for permits 1 and 2, each ending with `status=completed`;
- a durable main `turn/end` with `completed`, plus a separate
  `session/title-llm-request` and later `session/title` whose source is the
  configured provider route;
- `main-and-title-cancelled` remains separate: one endpoint receipt, two wrapper
  settlements, no stop, and no leaked endpoint activity.

The scenario-local stub high-water mark is computed from its own scope rather
than the run-wide historical maximum. The delayed-success scenario does not
dispose the Agent until both governed attempts have ended. REV-011 is closed.

## Integrity, provenance, and source binding

Independent canonical recomputation matched all committed values:

| Artifact | File SHA-256 | Semantic digest |
| --- | --- | --- |
| wire | `9c5648b1954351257e5db616aa3c5aa938d2d0e243a674314cbeb2cba7cb13f0` | record `4c5234e0...`, wire `048051c3...`, classifications `c366db82...` |
| transition | `86d688f0ffa1276d06eaf89ddbe9532afbe7009b4759d075538554388a0d0396` | record `78fa77c6...`, wire `d4ebb2b1...`, classifications `10269143...` |
| selfcheck | `3b258f12639baed3406953db109656c40ac7be3e5a554091dc8bb77bd317a624` | report `3dda1195...` |
| chain | `a794ea9508493528a7e3b83bf1b7abf1d00a7e6493330070ebd63b313caec3ce` | calibration `cdc19cb8...` |

Wire, transition, and selfcheck all claim clean implementation SHA
`da98c552...`. Every recorded source digest matches `git show da98c552:<path>`.
The lockfile/dependency/module paths are consistent, and the retained run-root
and journal digests independently match. Fresh review-HEAD replay preserved the
wire and classifications digests exactly; record/report/chain digests changed
as expected because provenance SHA, paths, timestamps, and run-root content are
new. Git proves there was no code change after the implementation commit.

This is credible local execution provenance, not a sealed execution closure.
Git/file hashes fix committed material identity and independent replay supports
behavior; hashes alone do not prove that a described execution occurred.

The GO41-03 errata accurately preserves the old live send/receive count and
historical runtime bytes as unknown. No new diff regresses the previously closed
header or reasoning-scope findings.

## Commands and results

Commands ran from the detached review worktree unless an absolute path is
shown.

| Command/check | Exit | Result |
| --- | ---: | --- |
| fixed-object `git cat-file` and three `merge-base --is-ancestor` checks | 0 | objects and ancestry verified |
| `pnpm install --offline --frozen-lockfile` | 0 | 936 packages reused, zero downloaded |
| focused Vitest command for llm-pi-ai, governor, and evidence chain | 0 | 13 files, 333 tests passed |
| audit `governor-loopback-adversarial.mts` | 0 | six loopback journal cases, visible teardown errors, wrapper-swallow, missing/false/hanging return measured |
| committed `governed-selfcheck` replay | 0 | 12 scenarios, five journal points, queued case, two direct adversaries; author conclusion true |
| `wire-capture` / `arcp-transition` | 0 / 0 | 8 and 2 loopback dispatches; semantic digests match committed evidence |
| replay compose / validate | 0 / 0 | three-record replay chain verified |
| author `arcp-r6-go41-tamper-check.ts` | 0 | all its 10 cases rejected |
| independent tamper matrix | 2 intentionally | six expected-reject cases were accepted; five controls rejected correctly |
| official validate on one-receipt main/title rebuilt chain | **0** | incorrectly reported three-record chain verified |
| independent digest recomputation | 0 | all record/report/chain/file digests match |
| independent retained run-root/journal recomputation | 0 | all three provenance digest pairs match |
| `pnpm exec tsc -b packages/llm/llm-pi-ai --pretty false` | 0 | affected package typecheck passed |
| `pnpm exec tsc -b tsconfig.host.json --pretty false` | 1 | default Node heap aborted near 2 GiB with V8 OOM |
| `NODE_OPTIONS=--max-old-space-size=8192 pnpm exec tsc -b tsconfig.host.json --pretty false` | 0 | host typecheck passed with recorded 8 GiB heap cap |
| focused Oxlint over five changed TypeScript files | 0 | no findings |
| markdown/link/Agent Note/translation checks | all 0 | applicable documentation checks passed |
| export JSDoc, workspace constraints, vendor manifest | all 0 | focused repository gates passed |
| `git diff --check bf264bdf..8c33466a` | 0 | no whitespace errors |
| live-smoke without `--allow-live-provider` | 1 expected | refused before run/artifact creation |

The implementation history says repository pre-commit ran normally. This
review made no production commit and did not rerun the hook as a commit action;
it ran the relevant checks above. No pre-push or CI was run. Host typecheck and
pre-commit evidence are not reported as pre-push or CI PASS.

Not covered: real provider receipt/acceptance, credentials, usage, remote
reasoning capability, pilot/formal execution, capsule, study profile, execution
closure, pre-push, and CI.

## External blockers

- **EXTERNAL BLOCKER — live acceptance:** no retained provider receipt,
  response, usage, or reasoning-support fact exists; historical exact sends
  remain unknown.
- **EXTERNAL BLOCKER — experiment eligibility:** the current exact route has no
  trustworthy supported-set/escalation declaration and therefore no legal
  treatment. This is scoped to the current adapter/configuration.
- **EXTERNAL BLOCKER — governed study execution:** no study profile, capsule,
  or execution closure exists for this route.

These conditions block R6 A/B but are not reasons to reject the REV-007 and
REV-011 offline fixes that were independently demonstrated.

## Minimum next step

The controller should require one more offline checkpoint with two narrow
corrections:

1. make quiescence an end-to-end supported-adapter fact, do not convert a
   swallowed lower cleanup failure into success, and bound cleanup/probe waits
   while keeping the run stopped and the concurrency barrier closed on timeout;
2. make required selfcheck sets and label-specific arithmetic code-owned,
   validate exact unique scenario/matrix rows and all counters, and reject any
   false scenario-specific invariant.

Rerun the nested swallowed-cleanup and hanging-cleanup adversaries plus the six
accepted tamper cases. Preserve the successful REV-007 loopback matrix and
REV-011 delayed/cancelled split. Whether a corrected future checkpoint merits a
separately bounded live authorization remains solely the controller's decision.
