# ARCP-R6-GO41-02 Independent Re-review

Date: 2026-09-24 (Asia/Shanghai)

## Verdict and fixed object

**Overall verdict: REVISE for the GO41-02 offline correction; BLOCKED for any
new live-provider authorization and for R6 A/B startup.**

This verdict applies only to:

- repository: `<home>/worktrees/dsh-arcp-v0.2-rc2-reconcile`
- GO41-02 diff base: `571e2c175616504252f315cb8479b8df10b28d2e`
- final implementation: `e570afac67e917b5869fd603ef164c52d3bf13bc`
- frozen evidence checkpoint: `c1619fdf6ab96fd5bf170fbbfcdb135f4681e05c`
- fixed review HEAD: `bf264bdf8aedb6e5965a406eed01239d014a5068`
- previous audit report SHA-256:
  `e5720815c96760ec6e4dca975b86eaa6bfcc5e9e029d0a902bdf83618b24601b`

All four commits exist and ancestry is exactly `diff base -> implementation ->
evidence checkpoint -> review HEAD`. `e570afac..c1619fdf` changes only the four
GO41-02 evidence/handoff artifacts, and `c1619fdf..bf264bdf` changes only the
handoff. There is no code change after the final implementation SHA.

The shared worktree was at `bf264bdf` with the seven dirty files identified by
the controller. I did not reset, clean, stash, checkout, commit, or edit that
worktree. Review ran at exact HEAD in the detached worktree
`<home>/worktrees/audit-arcp-r6-go41-02-bf264b`. Audit-only programs and
outputs live under `<home>/audits/ARCP-R6-GO41-02-bf264b`; they are not
production changes.

SocratiCode MCP was not available in this tool environment. I therefore used
fixed-SHA Git inspection, targeted `rg`, direct source reads, and focused local
execution. The checked-out fixed-SHA source was authoritative.

No real provider generation, credential read/authentication, pilot, or formal
run occurred. All request-bearing reproductions used an explicit loopback URL
and placeholder credential. The live command was tested only without
`--allow-live-provider`; it failed before creating a run or reading credentials.

## Three independent conclusions

1. **GO41-02 offline correction as a complete correction: REVISE.** Header
   validation, historical errata, digest coverage of the two keyless records,
   reasoning scope, and status scope are materially improved. The governor still
   fails open at reachable journal-write positions and can release concurrency
   before downstream quiescence. The selfcheck and validator also leave material
   evidence gaps.
2. **Budget/concurrency mechanism for a controller-considered small live run:
   BLOCKED / insufficient.** Normal successful paths are budgeted and serialized,
   including direct LLM, Agent, title, tool continuation, and DSH retry paths.
   However, a journal failure at `permit-granted` or `dispatch-entered` can still
   send, a queued attempt can send after the run has stopped, and failed teardown
   can produce actual local transport concurrency 2 while the governor records 1.
3. **R6 A/B readiness: BLOCKED / not ready.** In addition to the open governor
   findings, live acceptance, a legal treatment, study profile, capsule, and
   execution closure remain absent. The current configuration's lack of a legal
   treatment does not prove a permanent OpenCode Go server limitation.

## Prior finding adjudication

| Prior finding | Re-review status | Evidence-based ruling |
| --- | --- | --- |
| GO41-REV-001 budget/concurrency | **PARTIALLY RESOLVED** | The middleware now gates normal direct, Agent, auxiliary, continuation, and DSH retry attempts through one governor; SDK retry is disabled with `maxRetries: 0`. Hard fail-closed journal and quiescence invariants remain open in GO41-02-REV-007/008. |
| GO41-REV-002 count/provenance | **PARTIALLY RESOLVED** | The errata correctly preserves the historical provider send/receive count as unknown and rejects 24 as a proven upper bound. New frames distinguish attempted, permit, dispatch observation, first chunk, and settlement. The selfcheck is not bound to final implementation provenance, and `dispatch-entered` remains a pre-`source.next()` observation rather than provider receipt. |
| GO41-REV-003 header validation | **CLOSED** | Profile resolution enforces HTTP field-name token syntax and case-insensitively rejects static-header, Harness attribution, `authorization`, `cf-aig-authorization`, and `x-api-key` collisions before transport. Focused wire tests cover legal/absent headers, interleaved and repeated sessions, and hot update. |
| GO41-REV-004 digest chain | **PARTIALLY RESOLVED** | Complete wire and transition records now have valid record, wire, and classifications digests, and the committed chain consumes them. The full governor selfcheck is not bound, and the validator accepts structurally incomplete or semantically mismatched self-consistent chains. |
| GO41-REV-005 reasoning scope | **CLOSED** | The new records describe `[low, high, max]` as a local deployment declaration, explicit `high` only as local serialization, and no legal treatment only for the current adapter/configuration. They do not infer permanent server incapability. |
| GO41-REV-006 status wording | **CLOSED** | The errata consistently uses local keyless resolution/composite evidence wording and preserves live acceptance and provider facts as unknown. `READY FOR INDEPENDENT RE-REVIEW` is a workflow state. The stronger budget wording noted below is inaccurate but does not reopen the old route-access/model-calibration finding. |

The prior low follow-up for interleaved/repeated/hot-update header behavior is
also closed by the added tests and by the passing focused adapter suite.

## Findings

### GO41-02-REV-007 — CRITICAL — CONFIRMED BUG: journal failure is fail-open at permit and dispatch boundaries

- **Fixed-SHA source:** `scripts/arcp-r6-go41-governor.ts:178-208,
  212-215,301-345`; downstream call at
  `scripts/arcp-r6-go41-governor.ts:383-415`.
- **Reachable trigger:** the append-only journal accepts `attempted` but throws
  while recording `permit-granted`; it throws while recording
  `dispatch-entered`; or a request is queued before another request's `settled`
  append fails and receives the released slot afterward.
- **Actual behavior versus requirement:** `frame()` sets `journalFailed` and
  swallows the exception. `acquire()` does not recheck it after `takeSlot()` and
  returns a granted permit even when the `permit-granted` frame failed.
  `markDispatchEntered()` cannot report failure, and `governedStream()` still
  calls `source.next()`. `settle()` releases the slot after its frame fails; an
  already-queued attempt has no post-wait stopped check and sends. The required
  invariant is that any pre-send journal failure stops downstream dispatch and
  that no later request sends.
- **Impact:** the append-only recovery record is not a hard prerequisite for
  send. The run can continue after its accounting authority is unusable, so the
  budget cannot support a new live authorization.
- **Offline reproduction:** the audit-only real governor reproduction injected
  failure at each frame and counted transport receipt itself:

  | Injected failure | Stub received | Result |
  | --- | ---: | --- |
  | `attempted` | 0 | correctly denied locally |
  | `permit-granted` | 1 | **sent after journal failure** |
  | `dispatch-entered` | 1 | **sent after journal failure** |
  | `first-chunk-observed` | 1 | send already happened; later fresh request denied |
  | `settled` | 1 | send already happened; later fresh request denied |
  | first request `settled`, second already queued | 2 | **queued request sent after stop** |

  The queued case ended without deadlock but recorded `permitsGranted=2`,
  `dispatchEntered=2`, `journalFailures=1`, and no denial. Evidence is in
  `tests/governor-adversarial-results.json`. The production test at
  `scripts/arcp-r6-go41-governor.spec.ts:304-329` fails only the next request's
  initial `attempted` frame and therefore does not exercise these positions.
- **Minimum correction invariant:** a required frame append must return failure
  or throw into the gate. Recheck stopped state after every wait and immediately
  before downstream pull. A pre-send failure must release/poison the local slot
  without calling `next()`, wake and deny queued work, and preserve already spent
  allowances without permitting new sends.
- **Blocks:** GO41-REV-001 closure, acceptance of the offline correction, any
  later live authorization, and R6 A/B startup.

### GO41-02-REV-008 — HIGH — CONFIRMED BUG: failed downstream cleanup releases the slot before transport quiescence

- **Fixed-SHA source:** `scripts/arcp-r6-go41-governor.ts:417-432`, especially
  the swallowed `source.return()` error at `:425-430` followed by unconditional
  `settle()`; the same unconditional `finally` applies after `source.next()`
  throws.
- **Reachable trigger:** a downstream async iterator has started transport, then
  its `next()` rejects without stopping that transport, or a consumer exits
  early and `return()` rejects without stopping it.
- **Actual behavior versus requirement:** the permit is released even though
  downstream liveness is unknown. A second request then acquires the slot. In
  both audit cases the local transport saw `received=2`, actual `maxActive=2`,
  and one old request still active, while the governor reported `maxActive=1`
  and `settled=2`.
- **Impact:** concurrency 1 is not a transport invariant on error/cancellation
  paths, and the journal can state settlement while work remains active.
- **Offline reproduction:** `throwingNextReleasesBeforeQuiescence` and
  `throwingReturnReleasesBeforeQuiescence` in
  `tests/governor-adversarial-results.json`. Both completed the test without a
  deadlock and exposed the same 2-versus-1 mismatch.
- **Minimum correction invariant:** do not hand the slot to another attempt until
  downstream termination is confirmed. If cancellation/teardown cannot confirm
  quiescence, poison and stop the run, retain the concurrency barrier, and deny
  or drain queued attempts rather than infer settlement.
- **Blocks:** GO41-REV-001 closure, any later live authorization, and R6 A/B.

### GO41-02-REV-009 — HIGH — EVIDENCE GAP: the governor selfcheck is neither fully chain-bound nor bound to final implementation provenance

- **Fixed-SHA source:** selfcheck creation at
  `scripts/generate-arcp-r6-go41-evidence.ts:1843-1854`; composition at
  `:1869-1899`; validation at `:1902-1920`. The committed selfcheck artifact is
  a one-line JSON file at
  `handoff/adaptive-agent/go41-r6-02-20260923/ARCP_R6_GO41_02_GOVERNOR_SELFCHECK.json:1`.
- **Reachable trigger:** change selfcheck counts, transport maximums, invariants,
  or source/runtime identity while retaining the scenario names and top-level
  `allInvariantsHold`; or provide a stale `reportDigest`.
- **Actual behavior versus requirement:** `compose-local-evidence` does not
  verify `reportDigest` and copies only the boolean plus scenario labels. The
  validator takes no selfcheck input. I changed main/title `stubReceived` to 999,
  `stubMaxActive` to 99, and two invariants to false while deliberately retaining
  the stale report digest; composition succeeded and produced the exact committed
  calibration digest
  `9c1313a65e32e0c261bc740d98185d921b1ec4ca67dcc134697e9d65eb4cad77`,
  and validation succeeded.
- **Execution provenance:** Git shows the selfcheck was added at
  `fff4e5f73fee59b605b83be5a48676ff75a8c3b6`; the evidence rebind commit
  `c1619fdf` changed wire, transition, chain, and handoff, but not selfcheck. The
  selfcheck carries no implementation SHA, source digests, module paths,
  dependency versions, lockfile, run directory, or journal digest. Governor and
  runner source happen to be byte-identical from `fff4e5f` through `e570afac`,
  which supports code equivalence but does not turn the report into final-SHA
  execution evidence.
- **Impact:** the chain's local transport receipt cannot substantiate its core
  budget/concurrency numbers. Git and file SHA fix the committed selfcheck bytes;
  they do not prove the described run occurred or bind it to the final runtime.
- **Minimum correction invariant:** validate and bind the complete selfcheck
  report (or at least its verified `reportDigest` and committed file hash), and
  give it the same recoverable implementation/source/dependency/run provenance
  as the wire and transition records. Chain validation must require that bound
  input.
- **Blocks:** GO41-REV-002 and GO41-REV-004 closure and full acceptance of local
  budget evidence.

### GO41-02-REV-010 — MODERATE — CONFIRMED BUG: the evidence validator accepts structurally incomplete or mismatched self-consistent chains

- **Fixed-SHA source:** generic record validation at
  `scripts/generate-arcp-r6-go41-evidence.ts:838-859`; chain validation at
  `:921-957`.
- **Reachable trigger:** an artifact producer recomputes its digest after
  removing the transition entry, changing a bound `classificationsDigest`, or
  changing the wire record's `recordType`.
- **Actual behavior versus requirement:** `assertEvidenceRecord()` checks the
  schema version and self-digests but not expected record type. The chain loop
  iterates only over supplied entries, never requires exactly two, and compares
  role/record/wire digest but not `classificationsDigest`.
- **Offline reproduction:** three self-consistent tamper files were passed to
  the author validator. All returned exit 0:
  - missing transition: `chain verified (1 records, ...0af03397...)`;
  - wrong classifications digest: `chain verified (2 records, ...523b16d0...)`;
  - wire `recordType=ARCP_R6_GO41_LIVE_SMOKE`: `chain verified (2 records,
    ...52aacea8...)`.
- **Impact:** the committed artifacts themselves independently recompute
  correctly, so this does not invalidate their current bytes. It disproves the
  stronger claim that the validator enforces the advertised schema and all
  cross-record bindings.
- **Minimum correction invariant:** require exact record types, exactly one wire
  and one transition entry in fixed order (or unique keyed roles), compare every
  declared bound digest including classifications, and validate the chain's
  required field shapes and source relationships.
- **Blocks:** complete GO41-REV-004 closure; not the independently recomputed
  integrity of the current committed wire and transition files.

### GO41-02-REV-011 — MODERATE — EVIDENCE GAP: committed main/title scenario proves only one transport receipt

- **Fixed-SHA source:** scenario and assertion at
  `scripts/generate-arcp-r6-go41-evidence.ts:1522-1554`; shared outcome
  calculation at `:1366-1404`; Agent disposal at `:556-603`.
- **Reachable trigger:** the main request completes and the detached automatic
  title request is queued, then `runSession()` immediately disposes the Agent.
- **Actual behavior versus requirement:** the committed/replayed scenario records
  two attempts, permits, dispatch observations, and settlements but only one
  stub request. Its assertion is merely `atLeastOneNewRequest`. `stubMaxActive`
  is the stub's run-wide high-water mark, not a per-scenario delta. The journal
  and session log show the second title attempt ended as an early-stop after
  Agent disposal; this is a legitimate cancellation and not by itself a
  production defect. It does not prove that main and title both successfully
  reach transport and remain serialized.
- **Offline reproduction:** the committed selfcheck was rerun and reproduced
  `attempted=2`, `dispatchEntered=2`, `stubReceived=1`. An audit-only patch kept
  the Agent alive for the delayed title and delayed the first local response;
  the result was `stubReceived=2`, governor and stub `maxActive=1`, and both
  settled. This supports normal-path serialization while exposing the committed
  scenario's weaker evidence. The patch is retained as
  `tests/main-title-delayed-runner.patch`.
- **Minimum correction invariant:** a scenario claiming both requests must assert
  exactly two scenario-local endpoint receipts, preserve separate request and
  terminal evidence for each, and calculate the scenario's own maximum active
  interval. Keep cancellation as a separate scenario.
- **Blocks:** the main/title portion of GO41-REV-001 evidence and the claim in
  `ARCP_R6_GO41_02_HANDOFF.md:103-106`; it is not a separate production bug.

### GO41-02-FUP-001 — LOW — NON-BLOCKING FOLLOW-UP: handoff overstates the review base and hard guarantee

- **Fixed-SHA source:**
  `handoff/adaptive-agent/go41-r6-02-20260923/ARCP_R6_GO41_02_HANDOFF.md:21-24,
  103-106,221-223`.
- **Observed issue:** line 22 calls `51384262...` this review's diff base even
  though GO41-02's fixed base is `571e2c...`; later ledger text gives the correct
  base. “Impossible by construction” and “cannot repeat the overshoot” exceed
  the exception-path evidence in REV-007/008.
- **Minimum follow-up:** use `571e2c...` as the GO41-02 diff base, reserve
  `51384262...` for the original integration context, and scope the guarantee to
  demonstrated behavior until journal and quiescence cases fail closed.
- **Blocks:** nothing additional beyond REV-007/008.

## External blockers (not implementation findings)

- **EXTERNAL BLOCKER — live acceptance:** no retained provider receipt,
  response, usage, or reasoning-support fact exists. The historical exact send
  count remains unknown, and this review made zero provider calls.
- **EXTERNAL BLOCKER — experiment eligibility:** the current pi-ai route has no
  trustworthy escalation order and no legal immediate-next treatment. This is
  scoped to the current declaration and implementation, not a permanent claim
  about OpenCode Go.
- **EXTERNAL BLOCKER — governed execution readiness:** no study profile,
  capsule, or execution closure exists for this route. These do not invalidate
  the accepted local header/keyless work, but they independently block R6 A/B.

## Header, retry, and native-chain conclusions

The `sessionIdHeader` correction is acceptable. The name pattern at
`packages/llm/llm-pi-ai/src/config.ts:363-426` implements HTTP token syntax and
case-insensitive collisions. The reserved set matches pi-ai 0.82.1's supported
OpenAI-compatible/Cloudflare/Anthropic authentication paths. Resolution fails
before transport. The focused suite confirms a legal header, missing session,
missing option, interleaved sessions, repeated session, and configuration hot
update. The request uses an immutable resolved profile snapshot, so an in-flight
request does not switch configuration. Without the option, prior behavior is
preserved.

The governor wraps the common DSH `llm/stream` path, so normal Agent, direct LLM,
title/auxiliary, tool continuation, and DSH retry attempts share it. Current
pi-ai construction sets SDK `maxRetries: 0` at
`packages/llm/llm-pi-ai/src/adapter.ts:127`, so there is no hidden SDK retry on
this exact path. A future adapter-internal retry below the middleware would not
be counted by this governor and would require an explicit transport-level
contract; that is a boundary observation, not a current reachable bug.

The wire and transition captures remain local keyless evidence. Independent
replay at review HEAD reproduced wire/classification digests exactly:

- wire: `048051c3...` / `c366db82...`, 8 loopback receipts;
- transition: `d4ebb2b1...` / `10269143...`, 2 governed attempts.

Record digests differ because provenance correctly records the later review HEAD
and new paths/timestamps. The committed artifacts' source digests match the
tracked `e570afac` files, and code did not change afterward. Their loaded module
paths show workspace `src` for DSH packages and pnpm `node_modules` for pi-ai,
with version and lockfile digests recorded. This is substantially better local
provenance, but a clean Git SHA plus self-recorded environment fields is not a
sealed execution closure. The handoff accurately says there is no capsule,
study profile, or closure.

Independent canonical recomputation confirmed every current committed digest
and file SHA. This establishes file integrity and internal canonicalization, not
authorship or execution truth. The selfcheck exception is described in
REV-009.

The historical errata is accurate and additive: 13 is the old middleware
attempt/reservation lower bound, actual sends/receipts remain unknown, 24 is not
a proven upper bound, and the historical run cannot be rebound to clean
`6eb2d94...`. Provider acceptance, usage, and reasoning support remain unknown.

For reasoning, `[low, high, max]` is a local deployment declaration. The
explicit-high capture proves adapter serialization only. Missing default effort
and escalation order correctly lead native fallback to no legal next effort;
decision 33 and verifier `not-applied` correspond to that local configuration.
The two injected synthetic failures do not reach transport and are separate
from generation receipts. These facts do not prove the remote service lacks
reasoning escalation. Provider-owned means the adapter owning this route makes a
credible, evidence-backed declaration; it need not be dynamically returned by
the remote API, but a static enum alone is not server capability evidence.

## Test and reproduction matrix

Commands ran from the detached worktree unless an absolute path is shown.

| Command / check | Exit | Result |
| --- | ---: | --- |
| `git cat-file` / `git merge-base --is-ancestor` for all fixed objects | 0 | objects and full ancestry verified |
| `pnpm install --offline --frozen-lockfile` | 0 | existing lockfile installed without network download |
| `pnpm exec vitest run packages/llm/llm-pi-ai/tests` | 0 | 11 files, 282 tests passed |
| `pnpm exec vitest run scripts/arcp-r6-go41-governor.spec.ts` | 0 | 1 file, 11 tests passed |
| `pnpm exec vitest run scripts/arcp-r6-go41-evidence-chain.spec.ts` | 0 | 1 file, 20 tests passed |
| `pnpm exec tsc -b packages/llm/llm-pi-ai --pretty false` | 0 | affected package typecheck passed |
| `pnpm exec tsc -b tsconfig.host.json --pretty false` | 0 | host typecheck passed |
| focused `pnpm exec oxlint` over six changed TS files | 0 | no findings |
| `governed-selfcheck --out .../governor-selfcheck.replay.json` | 0 | nine author invariants pass; main/title remains 2 dispatch / 1 receipt |
| `tsx tests/governor-adversarial-repro.mts` | 0 | all five failure points plus queued and teardown adversaries completed; exposed REV-007/008 |
| audit delayed-success runner | 0 | main/title 2 receipts, stub/governor max active 1 |
| `wire-capture --out .../wire-capture.replay.json` | 0 | 8 loopback receipts, semantic digests match |
| `arcp-transition --out .../arcp-transition.replay.json` | 0 | local transition reproduced, semantic digests match |
| replay `compose-local-evidence` then `validate-local-evidence` | 0 / 0 | author chain accepts replay |
| `node tests/recompute-digests.mjs` | 0 | all committed record/wire/classification/report/chain/file digests independently match |
| stale-selfcheck tamper compose/validate | 0 / 0 | same committed calibration digest; exposes REV-009 |
| missing-transition / wrong-classification / wrong-record-type validators | 0 / 0 / 0 | all incorrectly accepted; exposes REV-010 |
| `live-smoke` without `--allow-live-provider` | 1 expected | refused before artifact/run creation; zero credential/provider access |
| `verify-md-wrap`, `verify-md-links`, Agent Note format/classification, translation pairing | all 0 | documentation gates passed |
| `verify-export-jsdoc`, `constraints`, `check-vendor-manifest.sh` | all 0 | focused repository gates passed |
| `git diff --check 571e2c..bf264b` | 0 | no whitespace error |

The implementation commits report that normal pre-commit hooks ran. I did not
rerun a commit hook because this review made no production commit; I ran the
relevant underlying checks above. I did not run pre-push or CI. Therefore host
typecheck and manual checks are not reported as pre-push or CI PASS. The 313
passing author tests do not supersede the adversarial results.

Not covered: real provider receipt/acceptance, credential behavior, provider
usage, server reasoning support, pilot/formal execution, capsule build, study
profile, execution closure, pre-push, and CI.

## Acceptance disposition and minimum next step

- Production header correction: **accepted**.
- Keyless wire/transition artifacts: **credible for their scoped local behavior
  and current committed bytes**, with chain-validator limitations; not sealed
  readiness.
- Historical errata and scoped research identity/status: **accepted**.
- Governor hard budget/concurrency correction: **not accepted**.
- Live acceptance: **not proved**.
- R6 A/B startup: **not ready**.

The minimum next step for the controller is to require one offline correction
that makes journal writes fail closed at every pre-send boundary, rechecks queued
waiters, and retains/poisons the slot until downstream quiescence is confirmed;
then rerun the five-point journal matrix and both teardown adversaries with stub
receipt/activity assertions. In the same checkpoint, bind and validate the full
selfcheck and strengthen exact chain schema checks. Whether any later fixed
checkpoint merits a separately bounded real call remains solely the controller's
decision.
