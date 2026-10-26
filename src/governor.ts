/**
 * Generation governor for the ARCP R6 GO41 evidence runner.
 *
 * Every generation path in one run — a main Agent request, a direct
 * `ctx.llm.stream` call, an automatic session-title request, a tool
 * continuation, and each DSH retry — passes through one governor instance
 * before it may reach the adapter or its transport. The governor owns these
 * invariants:
 *
 * - `dispatchEntered <= budget`: a request with no permit left is answered by
 *   a local terminal failure and never calls downstream at all.
 * - `maxActive <= 1`: one permit exists, and it is held across the whole
 *   stream lifetime.
 * - **fail closed**: the journal is a prerequisite for sending. A required
 *   frame that cannot be written stops the run before any downstream pull, and
 *   a stopped run never grants another permit — including to attempts that were
 *   already queued.
 * - **quiescence before reuse**: a permit is only handed on when downstream
 *   termination is confirmed. A completed stream confirms itself; every other
 *   ending is confirmed only by the caller's own transport probe, because a
 *   wrapper's `return()` can hide a lower cleanup failure (pi-ai's
 *   `lazyStream` pump owns the provider iterator, so the wrapper's return only
 *   closes the queue). An unconfirmed teardown keeps the barrier and stops the
 *   run rather than inferring that the transport is quiet, and every cleanup
 *   and probe wait is bounded.
 * - **exhaustion is not evidence**: what a stream ended with decides whether
 *   running out counts as silence. `finish(stop|tool-calls|max-tokens)` does;
 *   `finish(error|aborted)` does not, because the adapter normalizes a failure
 *   into a terminal chunk and then returns, so the wrapper's own end is the
 *   only thing an observer can see — and it is not a transport fact. A stream
 *   that ends with no terminal chunk at all is unknown for the same reason.
 *   Each downstream read is bounded and abort-aware, so a pump that never
 *   answers cannot hold the wrapper open.
 *
 * The governor is deliberately not built on cancellation: cancelling an owner
 * only tidies up a run, and a request already dispatched is never retracted and
 * never refunded.
 *
 * @module scripts/arcp-r6-go41-governor
 */

import type { FinishReason, StreamChunk } from './types.ts'

/** Why one attempt received no permit. */
export type GovernorDenialReason =
  | 'budget-exhausted'
  | 'aborted'
  | 'journal-failed'
  | 'wait-timeout'
  | 'run-stopped'

/**
 * How one attempt's downstream cleanup ended, as this wrapper observed it.
 * Only `not-needed` (the stream completed) and the caller's probe can confirm
 * that the transport stopped; the rest are recorded facts about the cleanup
 * attempt, never a claim about the transport.
 */
export type GovernorTeardown =
  | 'not-needed'
  | 'closed'
  | 'unconfirmed-done'
  | 'absent'
  | 'failed'
  | 'timeout'
  | 'skipped'

/** How one governed stream ended, as far as this wrapper can observe. */
export type GovernorSettlement =
  /** The stream ended in `finish(stop|tool-calls|max-tokens)` and then ran out. */
  | 'completed'
  /** A downstream read threw. */
  | 'error'
  /** A downstream read was cancelled, or an abort ended the wrapper. */
  | 'aborted'
  /** The consumer closed the stream before it ended. */
  | 'early-stop'
  | 'stopped-before-dispatch'
  /**
   * The stream's last chunk was `finish(error)` and the wrapper then ran out.
   * A normalized adapter failure is a fact about the response, not about the
   * transport: nothing in it says the underlying socket stopped.
   */
  | 'failed-finish'
  /** The same shape, with `finish(aborted)` as the terminal chunk. */
  | 'aborted-finish'
  /**
   * The stream ran out without ever yielding a `finish` chunk. No sanctioned
   * adapter ends that way — both turn a truncated stream into a throw — so a
   * missing terminal chunk is unknown, never a completion.
   */
  | 'no-terminal-finish'
  /** A downstream read did not settle inside the bound. */
  | 'read-timeout'

/** Where a run stopped: the frame that could not be written, or lost quiescence. */
export type GovernorStopPoint = GovernorFrame['type'] | 'quiescence-unconfirmed'

/** One journal frame written before the state change it records. */
export interface GovernorFrame {
  readonly seq: number
  readonly type:
    | 'attempted'
    | 'permit-granted'
    | 'permit-denied'
    | 'dispatch-entered'
    | 'first-chunk-observed'
    | 'settled'
    | 'settlement-unknown'
    | 'run-stopped'
    | 'journal-failed'
  readonly sessionId: string | null
  readonly detail: Readonly<Record<string, unknown>>
}

/**
 * Counters the governor observes itself. Each one names its own observation
 * point: none is inferred from another, and a wrapper that finished is never
 * reported as a transport that is known to be quiet.
 */
export interface GovernorCounters {
  /** Middleware entries: every generation attempt, permitted or not. */
  readonly attempted: number
  readonly permitsGranted: number
  readonly permitsDenied: number
  /** Attempts that entered downstream dispatch; the budget is consumed here. */
  readonly dispatchEntered: number
  readonly firstChunkObserved: number
  /** Streams whose wrapper ran to its end, however they ended. */
  readonly wrapperEnded: number
  /** Streams whose downstream termination this wrapper confirmed. */
  readonly downstreamQuiescent: number
  /** Streams whose downstream termination could not be confirmed. */
  readonly settlementUnknown: number
  /** Cleanups that did not settle within the bound; unknown, never success. */
  readonly teardownTimeouts: number
  /** Cleanups that failed, reported a non-terminal result, or were absent. */
  readonly teardownUnconfirmed: number
  /** Settlements this governor successfully recorded in the journal. */
  readonly settled: number
  /** Highest number of permits held at once; the concurrency invariant reads this. */
  readonly maxActive: number
  readonly journalFailures: number
  readonly denialsByReason: Readonly<Record<GovernorDenialReason, number>>
}

/** Whether this run can still send, and why not when it cannot. */
export interface GovernorStopState {
  readonly stopped: boolean
  readonly at: GovernorStopPoint | null
  readonly reason: string | null
}

/** One held permit. */
export interface GovernorPermit {
  readonly id: number
}

/** The permit decision for one attempt. */
export type GovernorDecision =
  | { readonly kind: 'granted'; readonly permit: GovernorPermit }
  | { readonly kind: 'denied'; readonly reason: GovernorDenialReason }

/** Options for {@link GenerationGovernor}. */
export interface GenerationGovernorOptions {
  /** Maximum number of attempts that may enter downstream dispatch. */
  readonly budget: number
  /**
   * Synchronous frame sink. A throw stops the run: the failing attempt must
   * not dispatch, and no later attempt may dispatch either.
   */
  readonly appendFrame: (frame: GovernorFrame) => void
  /** Bounded wait for the single concurrency slot; a timeout denies without sending. */
  readonly waitTimeoutMs?: number
  /**
   * Bounded wait for one attempt's downstream cleanup and for the caller's
   * quiescence probe. A timeout is unknown, never confirmation.
   */
  readonly teardownTimeoutMs?: number
  /**
   * Bounded wait for one downstream read. A read that outlives it is not an
   * ending: the attempt settles as unknown and the run stops, while the
   * abandoned read is never joined.
   */
  readonly readTimeoutMs?: number
  /** Notified once when the journal itself fails. */
  readonly onJournalFailure?: (error: unknown) => void
  /** Notified once when the run stops for any reason. */
  readonly onStop?: (state: GovernorStopState) => void
}

type SlotOutcome = 'acquired' | Extract<GovernorDenialReason, 'aborted' | 'wait-timeout' | 'run-stopped'>

interface Waiter {
  readonly resolve: (outcome: SlotOutcome) => void
  readonly signal: AbortSignal | undefined
  onAbort: (() => void) | undefined
  timer: NodeJS.Timeout | undefined
  settled: boolean
}

/** Default bounded wait for the concurrency slot. */
export const DEFAULT_WAIT_TIMEOUT_MS = 30_000
/** Default bounded wait for one attempt's downstream cleanup and probe. */
export const DEFAULT_TEARDOWN_TIMEOUT_MS = 10_000
/**
 * Default bound on one downstream read.
 *
 * Deliberately far looser than the teardown bound: a chunk may legitimately
 * take a long time to arrive, while a cleanup that has not finished in seconds
 * is simply not going to confirm anything. It still has to be finite — an
 * unbounded read let a stalled pump hold the wrapper, and the runner above it,
 * open forever.
 */
export const DEFAULT_READ_TIMEOUT_MS = 120_000

/**
 * One run's atomic generation permit gate.
 *
 * The permit is consumed when it is granted and is never returned: a request
 * that was dispatched, cancelled, timed out, or whose outcome is unknown has
 * already spent its allowance. A request that never obtained a permit consumes
 * nothing, because nothing was sent.
 */
export class GenerationGovernor {
  private readonly budget: number
  private readonly waitTimeoutMs: number
  /** The bound this governor applies to cleanup and probe waits. */
  readonly teardownTimeoutMs: number
  /** The bound this governor applies to one downstream read. */
  readonly readTimeoutMs: number
  private readonly appendFrame: (frame: GovernorFrame) => void
  private readonly onJournalFailure: ((error: unknown) => void) | undefined
  private readonly onStop: ((state: GovernorStopState) => void) | undefined
  private readonly queue: Waiter[] = []
  private readonly held = new Set<number>()
  private counters = {
    attempted: 0,
    permitsGranted: 0,
    permitsDenied: 0,
    dispatchEntered: 0,
    firstChunkObserved: 0,
    wrapperEnded: 0,
    downstreamQuiescent: 0,
    settlementUnknown: 0,
    teardownTimeouts: 0,
    teardownUnconfirmed: 0,
    settled: 0,
    maxActive: 0,
    journalFailures: 0,
  }

  private readonly denials: Record<GovernorDenialReason, number> = {
    'budget-exhausted': 0,
    aborted: 0,
    'journal-failed': 0,
    'wait-timeout': 0,
    'run-stopped': 0,
  }

  private nextPermitId = 1
  /**
   * Monotonic append-attempt ordinal. Every append attempt consumes exactly
   * one value, including an attempt whose write fails, so a journal's `seq`
   * values are unique and a gap marks a frame that never landed.
   */
  private appendAttempts = 0
  private slotFree = true
  private stoppedAt: GovernorStopPoint | null = null
  private stopReason: string | null = null
  private stopNotified = false

  constructor(options: GenerationGovernorOptions) {
    if (!Number.isSafeInteger(options.budget) || options.budget < 0) {
      throw new TypeError('generation budget must be a non-negative safe integer')
    }
    this.budget = options.budget
    this.appendFrame = options.appendFrame
    this.waitTimeoutMs = options.waitTimeoutMs ?? DEFAULT_WAIT_TIMEOUT_MS
    this.teardownTimeoutMs = options.teardownTimeoutMs ?? DEFAULT_TEARDOWN_TIMEOUT_MS
    this.readTimeoutMs = options.readTimeoutMs ?? DEFAULT_READ_TIMEOUT_MS
    this.onJournalFailure = options.onJournalFailure
    this.onStop = options.onStop
  }

  /** The counters as one frozen snapshot. */
  snapshot(): GovernorCounters {
    return Object.freeze({
      ...this.counters,
      denialsByReason: Object.freeze({ ...this.denials }),
    })
  }

  /** Whether this run stopped, and the first reason it did. */
  stopState(): GovernorStopState {
    return Object.freeze({
      stopped: this.stoppedAt !== null,
      at: this.stoppedAt,
      reason: this.stopReason,
    })
  }

  /** Whether the journal failure already stopped this run. */
  get stopped(): boolean {
    return this.stoppedAt !== null
  }

  /**
   * Record one attempt and take the single permit for it.
   * @param sessionId - owning session of the attempt, for the journal.
   * @param signal - the attempt's own signal; an abort while waiting denies it.
   * @returns the permit, or the reason this attempt must fail locally.
   */
  async acquire(sessionId: string | null, signal?: AbortSignal): Promise<GovernorDecision> {
    // Read through a closure: the checks below run after an await, so the
    // narrowing from the first check would otherwise hide a real abort.
    const isAborted = (): boolean => signal?.aborted === true
    // Read through a closure: the checks below run after an await, so the
    // narrowing from an earlier check would otherwise hide a real stop.
    const isStopped = (): boolean => this.stoppedAt !== null
    this.counters.attempted += 1
    if (isStopped()) return this.deny('run-stopped', sessionId)
    if (!this.frame('attempted', sessionId, {})) return this.deny('journal-failed', sessionId)
    if (isAborted()) return this.deny('aborted', sessionId)
    // The allowance is spent and nothing returns it, so no slot is needed.
    if (this.counters.permitsGranted >= this.budget) {
      return this.deny('budget-exhausted', sessionId)
    }
    const slot = await this.takeSlot(signal)
    if (slot !== 'acquired') return this.deny(slot, sessionId)
    // This attempt holds the slot now; every exit below hands it on, and a
    // stopped run is re-checked because the wait may have outlived it.
    if (isStopped()) {
      this.releaseSlot()
      return this.deny('run-stopped', sessionId)
    }
    if (isAborted()) {
      this.releaseSlot()
      return this.deny('aborted', sessionId)
    }
    if (this.counters.permitsGranted >= this.budget) {
      this.releaseSlot()
      return this.deny('budget-exhausted', sessionId)
    }
    const permit = { id: this.nextPermitId++ }
    // The permit is only real once its frame is durable: a journal failure
    // here must not hand out a permit that could dispatch.
    if (!this.frame('permit-granted', sessionId, { permit: permit.id })) {
      this.releaseSlot()
      return this.deny('journal-failed', sessionId)
    }
    this.held.add(permit.id)
    this.counters.permitsGranted += 1
    this.counters.maxActive = Math.max(this.counters.maxActive, this.held.size)
    return { kind: 'granted', permit }
  }

  /**
   * Record that a permitted attempt is about to pull from downstream.
   * @param permit - the held permit.
   * @param sessionId - owning session, for the journal.
   * @returns whether the attempt may pull; `false` means nothing was sent and
   *   the caller must stop without calling downstream.
   */
  markDispatchEntered(permit: GovernorPermit, sessionId: string | null): boolean {
    if (this.stopped) return false
    if (!this.frame('dispatch-entered', sessionId, { permit: permit.id })) return false
    this.counters.dispatchEntered += 1
    return true
  }

  /**
   * Record the first chunk of a dispatched stream.
   * @param sessionId - owning session, for the journal.
   * @returns whether the frame was recorded; `false` stops the run, and the
   *   caller performs controlled teardown without claiming settlement.
   */
  markFirstChunk(sessionId: string | null): boolean {
    if (this.stopped) return false
    if (!this.frame('first-chunk-observed', sessionId, {})) return false
    this.counters.firstChunkObserved += 1
    return true
  }

  /**
   * End one attempt's wrapper.
   *
   * The slot is handed on only when `downstreamQuiescent` is true. Otherwise
   * the run stops, the barrier stays held, and every queued attempt is denied:
   * an unconfirmed teardown is never treated as a quiet transport.
   * @param permit - the held permit.
   * @param status - how the wrapper ended.
   * @param sessionId - owning session, for the journal.
   * @param options - whether downstream termination was confirmed.
   */
  settle(
    permit: GovernorPermit,
    status: GovernorSettlement,
    sessionId: string | null,
    options: {
      readonly downstreamQuiescent: boolean
      readonly teardown: GovernorTeardown
    },
  ): void {
    this.counters.wrapperEnded += 1
    this.held.delete(permit.id)
    if (options.teardown === 'timeout') this.counters.teardownTimeouts += 1
    else if (options.teardown === 'failed' || options.teardown === 'absent'
      || options.teardown === 'unconfirmed-done') {
      this.counters.teardownUnconfirmed += 1
    }
    if (!options.downstreamQuiescent) {
      this.counters.settlementUnknown += 1
      this.frame('settlement-unknown', sessionId, {
        permit: permit.id,
        status,
        teardown: options.teardown,
      })
      this.stop(
        'quiescence-unconfirmed',
        `downstream termination was not confirmed after ${status} (cleanup ${options.teardown})`,
      )
      this.releaseSlot()
      return
    }
    this.counters.downstreamQuiescent += 1
    if (this.frame('settled', sessionId, {
      permit: permit.id,
      status,
      teardown: options.teardown,
    })) {
      this.counters.settled += 1
    }
    this.releaseSlot()
  }

  /** Wait for the single concurrency slot, or answer why this attempt stopped. */
  private takeSlot(signal: AbortSignal | undefined): Promise<SlotOutcome> {
    if (this.stoppedAt !== null) return Promise.resolve('run-stopped')
    if (this.slotFree) {
      this.slotFree = false
      return Promise.resolve('acquired')
    }
    return new Promise<SlotOutcome>((resolve) => {
      const waiter: Waiter = { resolve, signal, onAbort: undefined, timer: undefined, settled: false }
      if (signal !== undefined) {
        waiter.onAbort = () => {
          if (waiter.settled) return
          waiter.settled = true
          if (waiter.timer !== undefined) clearTimeout(waiter.timer)
          resolve('aborted')
        }
        signal.addEventListener('abort', waiter.onAbort, { once: true })
      }
      waiter.timer = setTimeout(() => {
        if (waiter.settled) return
        waiter.settled = true
        resolve('wait-timeout')
      }, this.waitTimeoutMs)
      this.queue.push(waiter)
    })
  }

  /**
   * Hand the slot to the next live waiter, or free it. A stopped run hands the
   * slot to nobody: every waiter is woken with a denial instead, so a queued
   * attempt can never send after the run stopped, and no waiter is left
   * waiting forever.
   */
  private releaseSlot(): void {
    while (this.queue.length > 0) {
      const waiter = this.queue.shift()
      /* v8 ignore next -- the shift above returned a queued waiter */
      if (waiter === undefined) break
      if (waiter.settled) continue
      waiter.settled = true
      if (waiter.timer !== undefined) clearTimeout(waiter.timer)
      if (waiter.onAbort !== undefined && waiter.signal !== undefined) {
        waiter.signal.removeEventListener('abort', waiter.onAbort)
      }
      if (this.stoppedAt !== null) {
        waiter.resolve('run-stopped')
        continue
      }
      // The slot transfers: it is never marked free on this path.
      waiter.resolve('acquired')
      return
    }
    this.slotFree = true
  }

  /** Count and journal one denial. */
  private deny(reason: GovernorDenialReason, sessionId: string | null): GovernorDecision {
    this.counters.permitsDenied += 1
    this.denials[reason] += 1
    this.frame('permit-denied', sessionId, { reason })
    return { kind: 'denied', reason }
  }

  /**
   * Stop this run irreversibly and wake every queued waiter with a denial.
   * @param at - the observation point that stopped it.
   * @param reason - the human-readable cause.
   */
  private stop(at: GovernorStopPoint, reason: string): void {
    if (this.stoppedAt === null) {
      this.stoppedAt = at
      this.stopReason = reason
    }
    this.frame('run-stopped', null, { at, reason })
    if (!this.stopNotified) {
      this.stopNotified = true
      this.onStop?.(this.stopState())
    }
    this.wakeQueued()
  }

  /** Deny every queued waiter, so no attempt waits on a stopped run. */
  private wakeQueued(): void {
    for (const waiter of this.queue.splice(0)) {
      if (waiter.settled) continue
      waiter.settled = true
      if (waiter.timer !== undefined) clearTimeout(waiter.timer)
      if (waiter.onAbort !== undefined && waiter.signal !== undefined) {
        waiter.signal.removeEventListener('abort', waiter.onAbort)
      }
      waiter.resolve('run-stopped')
    }
  }

  /**
   * Write one frame.
   * @param type - the frame kind.
   * @param sessionId - owning session, for the journal.
   * @param detail - the frame's own facts.
   * @returns `true` when the frame is durable; `false` when the run stopped.
   */
  private frame(
    type: GovernorFrame['type'],
    sessionId: string | null,
    detail: Readonly<Record<string, unknown>>,
  ): boolean {
    if (this.stoppedAt !== null && type !== 'run-stopped' && type !== 'journal-failed') {
      return false
    }
    try {
      this.appendAttempts += 1
      this.appendFrame(Object.freeze({
        seq: this.appendAttempts,
        type,
        sessionId,
        detail,
      }))
      return true
    } catch (error: unknown) {
      this.counters.journalFailures += 1
      this.onJournalFailure?.(error)
      // One best-effort record of the failure itself; a sink that throws twice
      // must not escape into the request path.
      try {
        this.appendAttempts += 1
        this.appendFrame(Object.freeze({
          seq: this.appendAttempts,
          type: 'journal-failed',
          sessionId,
          detail: { message: error instanceof Error ? error.message : String(error) },
        }))
      } catch {
        // The sink is unusable; the run stops through the state below instead.
      }
      if (this.stoppedAt === null) {
        this.stoppedAt = type
        this.stopReason = `journal write failed at ${type}`
      }
      if (!this.stopNotified) {
        this.stopNotified = true
        this.onStop?.(this.stopState())
      }
      this.wakeQueued()
      return false
    }
  }
}

/**
 * The caller's own knowledge about downstream termination.
 *
 * A wrapper above the adapter cannot observe a transport. Without this probe,
 * only a completed stream or a teardown that returns without throwing counts
 * as confirmation, and a mid-read failure is unconfirmed.
 */
export interface GovernedDownstream {
  /**
   * Answer whether the transport this attempt used is known to be quiet.
   * Called only when the wrapper cannot confirm it on its own.
   */
  readonly confirmQuiescent?: () => Promise<boolean> | boolean
}

/** One governed attempt's request facts, for the journal. */
export interface GovernedAttempt {
  readonly sessionId: string | null
  readonly provider: string
  readonly model: string
  readonly purpose: string | null
  readonly signal: AbortSignal | undefined
}

/** A terminal local failure answering one denied attempt. */
export function denialChunk(reason: GovernorDenialReason): StreamChunk {
  return {
    type: 'finish',
    reason: {
      kind: 'error',
      failure: {
        code: `ARCP_R6_GO41_PERMIT_${reason.replaceAll('-', '_').toUpperCase()}`,
        message: `the run's generation governor denied this attempt (${reason}) before any downstream dispatch`,
      },
    },
  }
}

/** A terminal local failure for a run that stopped while this attempt was live. */
export function stoppedChunk(status: GovernorSettlement): StreamChunk {
  return {
    type: 'finish',
    reason: {
      kind: 'error',
      failure: {
        code: 'ARCP_R6_GO41_RUN_STOPPED',
        message: `the run's generation governor stopped during this attempt (${status}); no further request may be sent`,
      },
    },
  }
}

/**
 * Run one attempt through the governor: take the permit, then dispatch.
 *
 * A denied attempt yields one local terminal failure and never calls
 * `next()`. A permitted attempt holds its permit until its stream ends, and the
 * permit is only handed on once downstream termination is confirmed.
 * @param governor - the run's governor.
 * @param attempt - request facts for the journal.
 * @param next - downstream dispatch, called only after a permit is granted.
 * @param downstream - the caller's transport-quiescence probe, when it has one.
 * @returns the chunk stream for this attempt.
 */
export async function* governedStream(
  governor: GenerationGovernor,
  attempt: GovernedAttempt,
  next: () => AsyncIterable<StreamChunk>,
  downstream?: GovernedDownstream,
): AsyncIterable<StreamChunk> {
  const decision = await governor.acquire(attempt.sessionId, attempt.signal)
  if (decision.kind === 'denied') {
    yield denialChunk(decision.reason)
    return
  }
  const permit = decision.permit
  let settlement: GovernorSettlement = 'early-stop'
  let sawChunk = false
  /**
   * The `reason.kind` of the last `finish` chunk this stream produced.
   * `undefined` means no terminal chunk was ever observed, which is never read
   * as a completion.
   */
  let terminal: FinishReason['kind'] | undefined
  let source: AsyncIterator<StreamChunk> | undefined
  try {
    source = next()[Symbol.asyncIterator]()
    for (;;) {
      if (!sawChunk) {
        // The first pull is the closest observable point to "this attempt
        // entered transport": the adapter's own laziness means obtaining the
        // iterable alone may not have sent anything yet.
        if (!governor.markDispatchEntered(permit, attempt.sessionId)) {
          // The run stopped before any pull, so nothing was sent. Downstream
          // was never entered, but its liveness is still unconfirmed: the
          // barrier stays held and the run stays stopped.
          settlement = 'stopped-before-dispatch'
          yield stoppedChunk(settlement)
          return
        }
      }
      // Bounded and abort-aware: a transport that never answers must not keep
      // this wrapper — and the runner waiting on it — alive forever.
      const read = await boundedRead(source, governor.readTimeoutMs, attempt.signal)
      if (read.kind === 'timeout') {
        // Not an ending. The outstanding promise is abandoned, never joined,
        // so the wrapper can still stop the run, deny later work, and return.
        settlement = 'read-timeout'
        throw new Error('the governed stream did not settle a downstream read within the bound')
      }
      if (read.kind === 'aborted') {
        // A cancellation during an outstanding read reaches the same terminal
        // branch as any other unconfirmed ending.
        settlement = 'aborted'
        throw new Error('the governed stream was cancelled during an outstanding read')
      }
      if (read.kind === 'rejected') throw read.error
      const result = read.value
      if (result.done === true) {
        // Wrapper exhaustion is classified by the stream's own terminal chunk.
        // Running out says nothing about the transport by itself.
        settlement = exhaustionSettlement(terminal)
        return
      }
      if (!sawChunk) {
        sawChunk = true
        if (!governor.markFirstChunk(attempt.sessionId)) {
          // Post-send journal failure: the allowance stays spent, the stream is
          // torn down below, and nothing claims the provider saw anything.
          settlement = 'error'
          throw new Error('the run stopped after this attempt had already dispatched')
        }
      }
      if (result.value.type === 'finish') terminal = result.value.reason.kind
      yield result.value
    }
  } catch (error: unknown) {
    // Only an undecided ending is classified here: a settlement this wrapper
    // already reached is never overwritten by the throw that carried it out.
    if (settlement === 'early-stop') {
      settlement = attempt.signal?.aborted === true ? 'aborted' : 'error'
    }
    throw error
  } finally {
    // Controlled cleanup, bounded, and never a confirmation: a wrapper's
    // `return()` can resolve while a lower cleanup it hid is still running. So
    // only a clean completion — `finish(stop|tool-calls|max-tokens)` and then
    // silence — or the caller's own probe may confirm that the transport
    // stopped. Every other ending, a normalized `finish(error)` included, stays
    // unknown until that probe answers.
    const teardown: GovernorTeardown = settlement === 'completed'
      ? 'not-needed'
      : source === undefined || settlement === 'stopped-before-dispatch'
        ? 'skipped'
        : await runTeardown(source, governor.teardownTimeoutMs)
    const quiescent = settlement === 'completed'
      ? true
      : await confirmQuiescence(downstream, governor.teardownTimeoutMs)
    governor.settle(permit, settlement, attempt.sessionId, {
      downstreamQuiescent: quiescent,
      teardown,
    })
  }
}

/**
 * Classify how a stream ended from its own terminal chunk.
 *
 * The test is the chunk's `reason.kind`, never the chunk's existence: a
 * normally completed response also ends in a `finish` chunk, so "saw a finish"
 * would fail every good response. Both sanctioned adapters turn a truncated
 * stream into a throw rather than returning without a terminal chunk, so a
 * missing one is not a completion either.
 * @param kind - `reason.kind` of the last finish chunk, or `undefined`.
 * @returns the settlement that wrapper exhaustion carries.
 */
export function exhaustionSettlement(kind: FinishReason['kind'] | undefined): GovernorSettlement {
  switch (kind) {
    case 'stop':
    case 'tool-calls':
    case 'max-tokens':
      // The lower iterator reported its own end: a trusted terminal fact.
      return 'completed'
    case 'error':
      // A normalized adapter failure. It says the response failed; it says
      // nothing about whether the transport stopped.
      return 'failed-finish'
    case 'aborted':
      return 'aborted-finish'
    default:
      // Fail closed. An ending this wrapper cannot explain is not a quiet
      // transport.
      return 'no-terminal-finish'
  }
}

/** One downstream read's outcome, under the bound and the caller's signal. */
type ReadOutcome =
  | { readonly kind: 'resolved'; readonly value: IteratorResult<StreamChunk> }
  | { readonly kind: 'rejected'; readonly error: unknown }
  | { readonly kind: 'timeout' }
  | { readonly kind: 'aborted' }

/**
 * Read one chunk under a finite bound, or give up on it.
 *
 * A rejection is reported rather than thrown so the caller can rethrow the
 * original error: that error is what the stream protocol's consumer must see.
 * A read that loses the race is abandoned, and its eventual settlement is
 * consumed by its own wrapper promise, so a late rejection surfaces nowhere.
 * @param source - the downstream iterator.
 * @param timeoutMs - the finite bound in milliseconds.
 * @param signal - the attempt's cancellation signal.
 * @returns how the read ended.
 */
async function boundedRead(
  source: AsyncIterator<StreamChunk>,
  timeoutMs: number,
  signal: AbortSignal | undefined,
): Promise<ReadOutcome> {
  if (signal?.aborted === true) return { kind: 'aborted' }
  let timer: NodeJS.Timeout | undefined
  let onAbort: (() => void) | undefined
  const read = (async (): Promise<ReadOutcome> => {
    try {
      return { kind: 'resolved', value: await source.next() }
    } catch (error: unknown) {
      return { kind: 'rejected', error }
    }
  })()
  const expiry = new Promise<ReadOutcome>((resolve) => {
    timer = setTimeout(() => { resolve({ kind: 'timeout' }) }, timeoutMs)
  })
  const racers: Promise<ReadOutcome>[] = [read, expiry]
  if (signal !== undefined) {
    racers.push(new Promise<ReadOutcome>((resolve) => {
      onAbort = () => { resolve({ kind: 'aborted' }) }
      signal.addEventListener('abort', onAbort, { once: true })
    }))
  }
  try {
    return await Promise.race(racers)
  } finally {
    if (timer !== undefined) clearTimeout(timer)
    if (onAbort !== undefined && signal !== undefined) signal.removeEventListener('abort', onAbort)
  }
}

/** The result of one bounded wait. */
type BoundedOutcome<T> =
  | { readonly kind: 'resolved'; readonly value: T }
  | { readonly kind: 'rejected'; readonly error: unknown }
  | { readonly kind: 'timeout' }

/**
 * Await one promise under a finite bound.
 *
 * A late settlement is ignored and its rejection is consumed, so a cleanup
 * that finishes after the bound cannot reopen anything or surface as an
 * unhandled rejection.
 * @param work - the promise to bound.
 * @param timeoutMs - the finite bound in milliseconds.
 * @returns how the wait ended.
 */
async function boundedWait<T>(work: Promise<T>, timeoutMs: number): Promise<BoundedOutcome<T>> {
  let timer: NodeJS.Timeout | undefined
  const settled = work.then(
    (value): BoundedOutcome<T> => ({ kind: 'resolved', value }),
    (error: unknown): BoundedOutcome<T> => ({ kind: 'rejected', error }),
  )
  const expiry = new Promise<BoundedOutcome<T>>((resolve) => {
    timer = setTimeout(() => { resolve({ kind: 'timeout' }) }, timeoutMs)
  })
  try {
    return await Promise.race([settled, expiry])
  } finally {
    if (timer !== undefined) clearTimeout(timer)
  }
}

/**
 * Close one downstream iterator under the bound, for cleanup only.
 * @param source - the iterator to close.
 * @param timeoutMs - the finite bound in milliseconds.
 * @returns what the cleanup attempt did, never a claim about the transport.
 */
async function runTeardown(
  source: AsyncIterator<StreamChunk>,
  timeoutMs: number,
): Promise<GovernorTeardown> {
  const close = source.return?.bind(source)
  if (close === undefined) return 'absent'
  const outcome = await boundedWait((async () => await close(undefined))(), timeoutMs)
  if (outcome.kind === 'timeout') return 'timeout'
  if (outcome.kind === 'rejected') return 'failed'
  return outcome.value.done === true ? 'closed' : 'unconfirmed-done'
}

/**
 * Ask the caller's probe whether the transport is known to be quiet.
 * @param downstream - the caller's probe, when it has one.
 * @returns the answer; absence is unconfirmed.
 */
async function confirmQuiescence(
  downstream: GovernedDownstream | undefined,
  timeoutMs: number,
): Promise<boolean> {
  const probe = downstream?.confirmQuiescent
  if (probe === undefined) return false
  const outcome = await boundedWait((async () => await probe())(), timeoutMs)
  // A probe that times out, rejects, or answers false has confirmed nothing.
  return outcome.kind === 'resolved' && outcome.value
}
