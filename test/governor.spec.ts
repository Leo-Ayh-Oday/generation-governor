/**
 * Focused invariants for the GO41 generation governor.
 *
 * These cover the normal budget and concurrency contract, the fail-closed
 * journal contract at every pre-send and post-send position, the queued-attempt
 * case, and the two teardown adversaries in which a wrapper ends while its
 * transport is still active. The transport is always a fake downstream that
 * counts its own activity, so a scenario is measured at the transport rather
 * than inferred from the governor's own permits.
 */

import { describe, expect, it } from 'vitest'
import {
  DEFAULT_WAIT_TIMEOUT_MS,
  GenerationGovernor,
  governedStream,
  type GovernorFrame,
} from '../src/governor.ts'
import type { StreamChunk } from '../src/types.ts'

interface TransportState {
  received: number
  active: number
  maxActive: number
}

interface Harness {
  readonly governor: GenerationGovernor
  readonly frames: GovernorFrame[]
  readonly transport: TransportState
}

function harness(
  budget: number,
  options: {
    waitTimeoutMs?: number
    teardownTimeoutMs?: number
    readTimeoutMs?: number
    failFrameAt?: GovernorFrame['type']
    onStop?: (state: ReturnType<GenerationGovernor['stopState']>) => void
  } = {},
): Harness {
  const frames: GovernorFrame[] = []
  const transport: TransportState = { received: 0, active: 0, maxActive: 0 }
  let injected = false
  const governor = new GenerationGovernor({
    budget,
    ...(options.waitTimeoutMs === undefined ? {} : { waitTimeoutMs: options.waitTimeoutMs }),
    ...(options.teardownTimeoutMs === undefined ? {} : { teardownTimeoutMs: options.teardownTimeoutMs }),
    ...(options.readTimeoutMs === undefined ? {} : { readTimeoutMs: options.readTimeoutMs }),
    appendFrame: (frame) => {
      if (options.failFrameAt === frame.type && !injected) {
        injected = true
        throw new Error(`injected ${frame.type} journal failure`)
      }
      frames.push(frame)
    },
    ...(options.onStop === undefined ? {} : { onStop: options.onStop }),
  })
  return { governor, frames, transport }
}

/** One fake downstream that records its own transport activity. */
function downstream(
  transport: TransportState,
  options: {
    delayMs?: number
    chunks?: readonly StreamChunk[]
    throwOnNext?: boolean
    throwOnReturn?: boolean
    /** Leave the transport active even after a successful `return()`. */
    leakOnReturn?: boolean
  } = {},
): () => AsyncIterable<StreamChunk> {
  return () => ({
    [Symbol.asyncIterator]: () => {
      const chunks: StreamChunk[] = [...options.chunks ?? [
        { type: 'text-delta', index: 0, text: 'ok' },
        { type: 'finish', reason: { kind: 'stop' } },
      ]]
      let index = 0
      let started = false
      const release = (): void => {
        if (started && transport.active > 0 && options.leakOnReturn !== true) {
          transport.active -= 1
        }
      }
      return {
        next: async () => {
          if (options.throwOnNext === true) {
            if (!started) {
              started = true
              transport.received += 1
              transport.active += 1
              transport.maxActive = Math.max(transport.maxActive, transport.active)
            }
            throw new Error('downstream next failed before stopping its transport')
          }
          if (!started) {
            started = true
            transport.received += 1
            transport.active += 1
            transport.maxActive = Math.max(transport.maxActive, transport.active)
            if (options.delayMs !== undefined) {
              await new Promise((resolve) => { setTimeout(resolve, options.delayMs) })
            }
          }
          const chunk = chunks[index]
          index += 1
          if (chunk === undefined) {
            release()
            return { done: true as const, value: undefined }
          }
          return { done: false as const, value: chunk }
        },
        return: async () => {
          if (options.throwOnReturn === true) {
            throw new Error('downstream return failed before stopping its transport')
          }
          release()
          return { done: true as const, value: undefined }
        },
      }
    },
  })
}

/**
 * Consume one stream to its end, answering how it ended.
 *
 * The whole stream is drained: stopping at the first error chunk would close
 * the generator early and change the settlement this spec measures.
 * @param stream - the governed stream.
 * @returns the terminal failure code, `completed`, or the thrown message.
 */
async function drain(stream: AsyncIterable<StreamChunk>): Promise<string> {
  let failure: string | null = null
  try {
    for await (const chunk of stream) {
      if (chunk.type === 'finish' && chunk.reason.kind === 'error') {
        failure = chunk.reason.failure.code
      }
    }
    return failure ?? 'completed'
  } catch (error: unknown) {
    return `threw:${error instanceof Error ? error.message : String(error)}`
  }
}

function attempt(label: string, signal?: AbortSignal) {
  return { sessionId: label, provider: 'stub', model: 'stub-model', purpose: null, signal }
}

function countersOf(harness: Harness) {
  return harness.governor.snapshot()
}

describe('GO41 generation governor', () => {
  it('denies every attempt under budget 0 without dispatching', async () => {
    const h = harness(0)
    const outcome = await drain(governedStream(h.governor, attempt('a'), downstream(h.transport)))
    expect(h.transport.received).toBe(0)
    expect(outcome).toBe('ARCP_R6_GO41_PERMIT_BUDGET_EXHAUSTED')
    expect(countersOf(h)).toMatchObject({
      attempted: 1,
      permitsGranted: 0,
      permitsDenied: 1,
      dispatchEntered: 0,
      maxActive: 0,
    })
  })

  it('stops the second attempt under budget 1 and never reaches transport', async () => {
    const h = harness(1)
    await drain(governedStream(h.governor, attempt('first'), downstream(h.transport)))
    const second = await drain(governedStream(h.governor, attempt('second'), downstream(h.transport)))
    expect(h.transport.received).toBe(1)
    expect(second).toBe('ARCP_R6_GO41_PERMIT_BUDGET_EXHAUSTED')
    expect(countersOf(h)).toMatchObject({ attempted: 2, dispatchEntered: 1, maxActive: 1 })
  })

  it('serializes concurrent attempts to one active transport request', async () => {
    const h = harness(2)
    await Promise.all([
      drain(governedStream(h.governor, attempt('a'), downstream(h.transport, { delayMs: 20 }))),
      drain(governedStream(h.governor, attempt('b'), downstream(h.transport, { delayMs: 20 }))),
    ])
    expect(h.transport.received).toBe(2)
    expect(h.transport.maxActive).toBe(1)
    expect(countersOf(h).maxActive).toBe(1)
  })

  it('holds the slot until the stream ends, so a queued attempt cannot overlap it', async () => {
    const h = harness(2)
    const first = governedStream(h.governor, attempt('a'), downstream(h.transport, { delayMs: 30 }))
    const iterator = first[Symbol.asyncIterator]()
    await iterator.next()
    expect(h.transport.active).toBe(1)
    const second = drain(governedStream(h.governor, attempt('b'), downstream(h.transport)))
    await new Promise((resolve) => { setTimeout(resolve, 10) })
    expect(h.transport.received).toBe(1)
    // The consumer stops early, and no probe can confirm the transport: the
    // run stops instead of handing the slot to the queued attempt.
    await iterator.return?.(undefined)
    expect(await second).toBe('ARCP_R6_GO41_PERMIT_RUN_STOPPED')
    expect(h.transport.received).toBe(1)
    expect(h.transport.maxActive).toBe(1)
    expect(h.governor.stopState()).toMatchObject({ stopped: true, at: 'quiescence-unconfirmed' })
  })

  it('hands the slot to a queued attempt after a completed stream', async () => {
    const h = harness(2)
    const first = governedStream(h.governor, attempt('a'), downstream(h.transport, { delayMs: 20 }))
    const iterator = first[Symbol.asyncIterator]()
    await iterator.next()
    const second = drain(governedStream(h.governor, attempt('b'), downstream(h.transport)))
    await new Promise((resolve) => { setTimeout(resolve, 10) })
    expect(h.transport.received).toBe(1)
    // Let the first attempt finish normally: that confirms its transport.
    for (;;) {
      const result = await iterator.next()
      if (result.done === true) break
    }
    expect(await second).toBe('completed')
    expect(h.transport.received).toBe(2)
    expect(h.transport.maxActive).toBe(1)
    expect(h.governor.stopState().stopped).toBe(false)
  })

  it('grants exactly one permit when many attempts race for a budget of one', async () => {
    const h = harness(1)
    const outcomes = await Promise.all(Array.from({ length: 8 }, async (_unused, index) =>
      await drain(governedStream(h.governor, attempt(`race-${index}`), downstream(h.transport)))))
    expect(h.transport.received).toBe(1)
    expect(outcomes.filter(outcome => outcome === 'ARCP_R6_GO41_PERMIT_BUDGET_EXHAUSTED')).toHaveLength(7)
    expect(countersOf(h)).toMatchObject({
      attempted: 8,
      permitsGranted: 1,
      permitsDenied: 7,
      dispatchEntered: 1,
      maxActive: 1,
    })
  })

  it('never dispatches an attempt cancelled while it waits for the slot', async () => {
    const h = harness(2)
    const first = governedStream(h.governor, attempt('a'), downstream(h.transport, { delayMs: 40 }))
    const iterator = first[Symbol.asyncIterator]()
    await iterator.next()
    const controller = new AbortController()
    const queued = drain(governedStream(
      h.governor,
      attempt('cancelled', controller.signal),
      downstream(h.transport),
    ))
    controller.abort()
    expect(await queued).toBe('ARCP_R6_GO41_PERMIT_ABORTED')
    expect(h.transport.received).toBe(1)
    // Let the first attempt finish normally, so the slot is confirmed quiet.
    for (;;) {
      const result = await iterator.next()
      if (result.done === true) break
    }
    // The cancelled attempt consumed no allowance, so the next one still runs.
    expect(await drain(governedStream(h.governor, attempt('b'), downstream(h.transport))))
      .toBe('completed')
    expect(h.transport.received).toBe(2)
    expect(countersOf(h).denialsByReason.aborted).toBe(1)
  })

  it('denies a waiter that outlives the bounded slot wait without dispatching', async () => {
    const h = harness(2, { waitTimeoutMs: 10 })
    const first = governedStream(h.governor, attempt('a'), downstream(h.transport, { delayMs: 60 }))
    const iterator = first[Symbol.asyncIterator]()
    await iterator.next()
    expect(await drain(governedStream(h.governor, attempt('slow'), downstream(h.transport))))
      .toBe('ARCP_R6_GO41_PERMIT_WAIT_TIMEOUT')
    expect(h.transport.received).toBe(1)
    await iterator.return?.(undefined)
  })

  it('journals every observable state separately', async () => {
    const h = harness(1)
    await drain(governedStream(h.governor, attempt('a'), downstream(h.transport)))
    await drain(governedStream(h.governor, attempt('b'), downstream(h.transport)))
    expect(h.frames.map(frame => frame.type)).toEqual([
      'attempted',
      'permit-granted',
      'dispatch-entered',
      'first-chunk-observed',
      'settled',
      'attempted',
      'permit-denied',
    ])
    expect(h.frames[4]?.detail).toMatchObject({ status: 'completed' })
  })

  it('exposes a bounded default wait so no attempt can hang forever', () => {
    expect(DEFAULT_WAIT_TIMEOUT_MS).toBeGreaterThan(0)
  })
})

describe('GO41 governor journal failures fail closed', () => {
  it.each(['attempted', 'permit-granted', 'dispatch-entered'] as const)(
    'stops the run before any transport pull when %s cannot be written',
    async (point) => {
      const h = harness(3, { failFrameAt: point })
      const first = await drain(governedStream(h.governor, attempt('first'), downstream(h.transport)))
      const second = await drain(governedStream(h.governor, attempt('second'), downstream(h.transport)))
      expect(h.transport.received).toBe(0)
      // The run stopped before any pull, so this attempt is answered locally
      // (denied at the gate, or stopped between grant and pull).
      expect(['ARCP_R6_GO41_PERMIT_JOURNAL_FAILED', 'ARCP_R6_GO41_RUN_STOPPED'])
        .toContain(first)
      expect(second).toBe('ARCP_R6_GO41_PERMIT_RUN_STOPPED')
      const counters = countersOf(h)
      expect(counters.dispatchEntered).toBe(0)
      expect(counters.journalFailures).toBe(1)
      expect(counters.maxActive).toBeLessThanOrEqual(1)
      expect(h.governor.stopState().stopped).toBe(true)
    },
  )

  it.each(['first-chunk-observed', 'settled'] as const)(
    'keeps the spent allowance and sends nothing new when %s cannot be written',
    async (point) => {
      const h = harness(3, { failFrameAt: point })
      await drain(governedStream(h.governor, attempt('first'), downstream(h.transport)))
      const receivedAfterFirst = h.transport.received
      const second = await drain(governedStream(h.governor, attempt('second'), downstream(h.transport)))
      expect(receivedAfterFirst).toBe(1)
      expect(second).toBe('ARCP_R6_GO41_PERMIT_RUN_STOPPED')
      expect(h.transport.received).toBe(receivedAfterFirst)
      const counters = countersOf(h)
      expect(counters.dispatchEntered).toBe(1)
      // A settlement the journal could not record is never counted as settled.
      expect(counters.settled).toBe(0)
      expect(counters.journalFailures).toBeGreaterThanOrEqual(1)
      expect(h.governor.stopState().stopped).toBe(true)
    },
  )

  it('denies an already-queued attempt when the running attempt cannot settle', async () => {
    const h = harness(3, { failFrameAt: 'settled' })
    const first = governedStream(h.governor, attempt('first'), downstream(h.transport, { delayMs: 10 }))
    const iterator = first[Symbol.asyncIterator]()
    await iterator.next()
    const queued = drain(governedStream(h.governor, attempt('queued'), downstream(h.transport)))
    await new Promise((resolve) => { setTimeout(resolve, 20) })
    // Finish the first attempt so its settlement is what stops the run.
    await iterator.next()
    await iterator.next()
    const queuedOutcome = await queued
    expect(queuedOutcome).toBe('ARCP_R6_GO41_PERMIT_RUN_STOPPED')
    expect(h.transport.received).toBe(1)
    expect(h.transport.active).toBe(0)
    const counters = countersOf(h)
    expect(counters.permitsGranted).toBe(1)
    expect(counters.dispatchEntered).toBe(1)
    expect(counters.denialsByReason['run-stopped']).toBe(1)
    expect(h.governor.stopState().stopped).toBe(true)
  })

  it('stops the run once, with the first failure as its cause', async () => {
    const stops: string[] = []
    const h = harness(3, {
      failFrameAt: 'attempted',
      onStop: (state) => { stops.push(String(state.at)) },
    })
    await drain(governedStream(h.governor, attempt('first'), downstream(h.transport)))
    await drain(governedStream(h.governor, attempt('second'), downstream(h.transport)))
    expect(stops).toEqual(['attempted'])
    expect(h.governor.stopState()).toMatchObject({ stopped: true, at: 'attempted' })
  })
})

describe('GO41 governor requires confirmed quiescence before reuse', () => {
  it('stops the run when a downstream read fails while its transport stays active', async () => {
    const h = harness(2)
    const first = await drain(governedStream(
      h.governor,
      attempt('first'),
      downstream(h.transport, { throwOnNext: true, leakOnReturn: true }),
    ))
    expect(first).toContain('threw:')
    const receivedAfterFirst = h.transport.received
    const second = await drain(governedStream(h.governor, attempt('second'), downstream(h.transport)))
    expect(second).toBe('ARCP_R6_GO41_PERMIT_RUN_STOPPED')
    expect(h.transport.received).toBe(receivedAfterFirst)
    expect(h.transport.maxActive).toBe(1)
    const counters = countersOf(h)
    expect(counters.settlementUnknown).toBe(1)
    expect(counters.settled).toBe(0)
    expect(h.governor.stopState()).toMatchObject({ stopped: true, at: 'quiescence-unconfirmed' })
  })

  it('stops the run when downstream teardown throws while its transport stays active', async () => {
    const h = harness(2)
    const first = governedStream(
      h.governor,
      attempt('first'),
      downstream(h.transport, { throwOnReturn: true, leakOnReturn: true }),
    )[Symbol.asyncIterator]()
    await first.next()
    await first.return?.(undefined)
    const receivedAfterFirst = h.transport.received
    const second = await drain(governedStream(h.governor, attempt('second'), downstream(h.transport)))
    expect(second).toBe('ARCP_R6_GO41_PERMIT_RUN_STOPPED')
    expect(h.transport.received).toBe(receivedAfterFirst)
    expect(h.transport.maxActive).toBe(1)
    expect(countersOf(h).settlementUnknown).toBe(1)
    expect(h.governor.stopState().stopped).toBe(true)
  })

  it('never confirms through a wrapper whose return hides a failed inner teardown', async () => {
    // The shape of pi-ai's lazyStream: a detached pump owns the provider
    // iterator, so the wrapper's own return closes a queue and resolves while
    // the inner teardown failure stays hidden.
    const h = harness(2)
    let innerTeardownFailed = false
    const adapterLike = (): AsyncIterable<StreamChunk> => {
      const provider = downstream(h.transport, { leakOnReturn: true })
      const queue = (async function* () {
        const iterator = provider()[Symbol.asyncIterator]()
        for (;;) {
          const result = await iterator.next()
          if (result.done === true) return
          yield result.value
        }
      })()
      return (async function* () {
        // Typed as AsyncIterator, not AsyncGenerator: `return` must stay optional so the
        // `?.` below is legal. An adapter can hand back an iterator with no teardown at
        // all, and this wrapper must still swallow that case rather than throw.
        const iterator: AsyncIterator<StreamChunk> = queue[Symbol.asyncIterator]()
        try {
          for (;;) {
            const result = await iterator.next()
            if (result.done === true) return
            yield result.value
          }
        } finally {
          try {
            await iterator.return?.(undefined)
          } catch {
            innerTeardownFailed = true
          }
        }
      })()
    }
    const first = governedStream(h.governor, attempt('swallow-first'), adapterLike)[Symbol.asyncIterator]()
    await first.next()
    await first.return?.(undefined)
    expect(innerTeardownFailed).toBe(false)
    // The outer return resolved, yet nothing may be handed on: no probe
    // confirmed the transport.
    expect(h.governor.stopState()).toMatchObject({ stopped: true, at: 'quiescence-unconfirmed' })
    expect(await drain(governedStream(h.governor, attempt('swallow-second'), downstream(h.transport))))
      .toBe('ARCP_R6_GO41_PERMIT_RUN_STOPPED')
    expect(h.transport.received).toBe(1)
    expect(h.transport.maxActive).toBe(1)
  })

  it.each([
    ['a return that reports it is not finished', () => ({
      [Symbol.asyncIterator]: () => ({
        next: async () => ({ done: false as const, value: { type: 'text-delta', index: 0, text: 'held' } }),
        return: async () => ({ done: false as const, value: undefined }),
      }),
    })],
    ['no return at all', () => ({
      [Symbol.asyncIterator]: () => ({
        next: async () => ({ done: false as const, value: { type: 'text-delta', index: 0, text: 'held' } }),
      }),
    })],
  ] as const)('stops the run when the downstream offers %s', async (_label, build) => {
    const h = harness(2)
    const iterator = governedStream(h.governor, attempt('odd'), build as never)[Symbol.asyncIterator]()
    await iterator.next()
    await iterator.return?.(undefined)
    await new Promise((resolve) => { setTimeout(resolve, 20) })
    expect(h.governor.stopState()).toMatchObject({ stopped: true, at: 'quiescence-unconfirmed' })
    expect(countersOf(h).settlementUnknown).toBe(1)
    expect(await drain(governedStream(h.governor, attempt('later'), downstream(h.transport))))
      .toBe('ARCP_R6_GO41_PERMIT_RUN_STOPPED')
  })

  it('bounds a cleanup that never settles and still ends the wrapper', async () => {
    const h = harness(2, { teardownTimeoutMs: 30 })
    const hanging = (): AsyncIterable<StreamChunk> => ({
      [Symbol.asyncIterator]: () => ({
        next: async () => ({ done: false as const, value: { type: 'text-delta', index: 0, text: 'held' } }),
        return: async () => await new Promise<never>(() => { /* never settles */ }),
      }),
    })
    const iterator = governedStream(h.governor, attempt('hang'), hanging)[Symbol.asyncIterator]()
    await iterator.next()
    const started = Date.now()
    const ended = await iterator.return?.(undefined)
    const elapsed = Date.now() - started
    expect(ended?.done).toBe(true)
    expect(elapsed).toBeLessThan(2_000)
    const counters = countersOf(h)
    expect(counters.teardownTimeouts).toBe(1)
    expect(counters.settlementUnknown).toBe(1)
    expect(h.governor.stopState()).toMatchObject({ stopped: true, at: 'quiescence-unconfirmed' })
    expect(await drain(governedStream(h.governor, attempt('later'), downstream(h.transport))))
      .toBe('ARCP_R6_GO41_PERMIT_RUN_STOPPED')
  })

  it('bounds a probe that never settles and treats it as unknown', async () => {
    const h = harness(2, { teardownTimeoutMs: 30 })
    const iterator = governedStream(
      h.governor,
      attempt('probe-hang'),
      downstream(h.transport),
      { confirmQuiescent: async () => await new Promise<never>(() => { /* never settles */ }) },
    )[Symbol.asyncIterator]()
    await iterator.next()
    const started = Date.now()
    await iterator.return?.(undefined)
    expect(Date.now() - started).toBeLessThan(2_000)
    expect(h.governor.stopState()).toMatchObject({ stopped: true, at: 'quiescence-unconfirmed' })
  })

  it('releases the slot when the caller can confirm quiescence after a failed read', async () => {
    const h = harness(2)
    const first = await drain(governedStream(
      h.governor,
      attempt('first'),
      downstream(h.transport, { throwOnNext: true }),
      { confirmQuiescent: () => h.transport.active === 0 },
    ))
    expect(first).toContain('threw:')
    expect(h.governor.stopState().stopped).toBe(false)
    const second = await drain(governedStream(h.governor, attempt('second'), downstream(h.transport)))
    expect(second).toBe('completed')
    expect(h.transport.received).toBe(2)
    expect(h.transport.maxActive).toBe(1)
  })

  it('never treats a stream that ends without a terminal chunk as a completion', async () => {
    // Fail closed. A truncated stream makes no statement about the transport,
    // and "it ran out" is not one either.
    const h = harness(2)
    const truncated: StreamChunk[] = [{ type: 'text-delta', index: 0, text: 'partial' }]
    await drain(governedStream(h.governor, attempt('truncated'), downstream(h.transport, { chunks: truncated })))
    expect(h.governor.stopState()).toMatchObject({ stopped: true, at: 'quiescence-unconfirmed' })
    expect(countersOf(h)).toMatchObject({ settlementUnknown: 1, settled: 0 })
    expect(await drain(governedStream(h.governor, attempt('later'), downstream(h.transport))))
      .toBe('ARCP_R6_GO41_PERMIT_RUN_STOPPED')
  })

  it('bounds a downstream read that never settles and stops the run', async () => {
    const h = harness(2, { readTimeoutMs: 30 })
    const stalled = (): AsyncIterable<StreamChunk> => ({
      [Symbol.asyncIterator]: () => ({
        next: async () => await new Promise<never>(() => { /* never settles */ }),
      }),
    })
    const iterator = governedStream(h.governor, attempt('stalled'), stalled)[Symbol.asyncIterator]()
    const started = Date.now()
    const outcome = await iterator.next().then(
      () => 'resolved',
      (error: unknown) => `threw:${error instanceof Error ? error.message : String(error)}`,
    )
    expect(outcome).toContain('did not settle a downstream read')
    expect(Date.now() - started).toBeLessThan(2_000)
    expect(h.governor.stopState()).toMatchObject({ stopped: true, at: 'quiescence-unconfirmed' })
    expect(countersOf(h).settlementUnknown).toBe(1)
    expect(await drain(governedStream(h.governor, attempt('later'), downstream(h.transport))))
      .toBe('ARCP_R6_GO41_PERMIT_RUN_STOPPED')
  })

  it('ends a cancelled read on the same bounded terminal branch', async () => {
    // The read bound here is a minute: only the cancellation can end this
    // promptly, and it must land on the ordinary unknown-then-stop branch.
    const h = harness(2, { readTimeoutMs: 60_000 })
    const controller = new AbortController()
    let markReached: (() => void) | undefined
    const reached = new Promise<void>((resolve) => { markReached = resolve })
    const stalled = (): AsyncIterable<StreamChunk> => ({
      [Symbol.asyncIterator]: () => ({
        next: async () => {
          markReached?.()
          return await new Promise<never>(() => { /* never settles */ })
        },
      }),
    })
    const iterator = governedStream(
      h.governor,
      attempt('cancelled-read', controller.signal),
      stalled,
    )[Symbol.asyncIterator]()
    const pending = iterator.next()
    await reached
    controller.abort()
    const outcome = await pending.then(
      () => 'resolved',
      (error: unknown) => `threw:${error instanceof Error ? error.message : String(error)}`,
    )
    expect(outcome).toContain('cancelled during an outstanding read')
    expect(h.governor.stopState()).toMatchObject({ stopped: true, at: 'quiescence-unconfirmed' })
    expect(countersOf(h).settlementUnknown).toBe(1)
  })
})

describe('GO41 governor keeps clean completions usable', () => {
  it('confirms quiescence on a clean completion, and never on a normalized failure finish', async () => {
    // This case used to assert the opposite for its second stream: a
    // `finish(error)` chunk followed by wrapper exhaustion was counted as a
    // confirmed settlement (`settled: 3`, `settlementUnknown: 0`) and the run
    // stayed usable. That is REV-015 exactly — `LlmRuntime.adapterStream`
    // normalizes an adapter failure into a terminal chunk and then returns, so
    // the wrapper's own end is all an observer sees, and it is not a transport
    // fact. The old expectation was the defect, not the specification; what
    // follows is the invariant, not a looser tolerance.
    const h = harness(3)
    expect(await drain(governedStream(h.governor, attempt('normal'), downstream(h.transport))))
      .toBe('completed')
    const errorChunks: StreamChunk[] = [
      { type: 'finish', reason: { kind: 'error', failure: { message: 'provider said no', code: 'SERVER' } } },
    ]
    expect(await drain(governedStream(
      h.governor,
      attempt('error-chunk'),
      downstream(h.transport, { chunks: errorChunks }),
    ))).toBe('SERVER')
    // Nothing on this chain can confirm the transport, so the failure finish
    // stays unknown and the run stops instead of handing the barrier on.
    expect(h.governor.stopState()).toMatchObject({ stopped: true, at: 'quiescence-unconfirmed' })
    expect(countersOf(h)).toMatchObject({
      wrapperEnded: 2,
      downstreamQuiescent: 1,
      settlementUnknown: 1,
      settled: 1,
      teardownTimeouts: 0,
      maxActive: 1,
    })
    // And the barrier really is held: the next attempt is denied locally.
    expect(await drain(governedStream(h.governor, attempt('after'), downstream(h.transport))))
      .toBe('ARCP_R6_GO41_PERMIT_RUN_STOPPED')
    expect(h.transport.received).toBe(2)
  })

  it('releases a failure finish through the transport probe, and only then', async () => {
    const h = harness(3)
    const errorChunks: StreamChunk[] = [
      { type: 'finish', reason: { kind: 'error', failure: { message: 'provider said no', code: 'SERVER' } } },
    ]
    expect(await drain(governedStream(
      h.governor,
      attempt('probed-error'),
      downstream(h.transport, { chunks: errorChunks }),
      { confirmQuiescent: () => h.transport.active === 0 },
    ))).toBe('SERVER')
    // The probe answered for the transport, which is the only release path a
    // failure finish may use.
    expect(h.governor.stopState().stopped).toBe(false)
    expect(await drain(governedStream(h.governor, attempt('after'), downstream(h.transport))))
      .toBe('completed')
    expect(countersOf(h)).toMatchObject({ settled: 2, settlementUnknown: 0 })
    expect(h.transport.received).toBe(2)
  })

  it('stops the run when an early stop cannot be confirmed', async () => {
    const h = harness(3)
    const early = governedStream(h.governor, attempt('early'), downstream(h.transport))
    const iterator = early[Symbol.asyncIterator]()
    await iterator.next()
    await iterator.return?.(undefined)
    const counters = countersOf(h)
    expect(counters.downstreamQuiescent).toBe(0)
    expect(counters.settlementUnknown).toBe(1)
    // The cleanup itself succeeded; it simply does not confirm the transport.
    expect(counters.teardownUnconfirmed).toBe(0)
    expect(h.governor.stopState()).toMatchObject({ stopped: true, at: 'quiescence-unconfirmed' })
    expect(h.transport.active).toBe(0)
    // Nothing new may be sent after the stop.
    expect(await drain(governedStream(h.governor, attempt('later'), downstream(h.transport))))
      .toBe('ARCP_R6_GO41_PERMIT_RUN_STOPPED')
    expect(h.transport.received).toBe(1)
  })

  it('denies a cancellation before dispatch without stopping the run', async () => {
    const h = harness(3)
    const controller = new AbortController()
    const cancelled = governedStream(
      h.governor,
      attempt('cancelled', controller.signal),
      downstream(h.transport, { delayMs: 30 }),
    )
    const iterator = cancelled[Symbol.asyncIterator]()
    const pending = iterator.next()
    controller.abort()
    expect(await pending.catch(() => 'threw')).toMatchObject({
      value: { type: 'finish', reason: { kind: 'error', failure: { code: 'ARCP_R6_GO41_PERMIT_ABORTED' } } },
    })
    expect(h.transport.received).toBe(0)
    expect(h.governor.stopState().stopped).toBe(false)
    // Nothing was sent, so the next attempt still runs.
    expect(await drain(governedStream(h.governor, attempt('later'), downstream(h.transport))))
      .toBe('completed')
    expect(h.transport.received).toBe(1)
  })

  it('stops the run when a cancellation after dispatch cannot be confirmed', async () => {
    const h = harness(3)
    const controller = new AbortController()
    const cancelled = governedStream(
      h.governor,
      attempt('cancelled', controller.signal),
      downstream(h.transport),
    )
    const iterator = cancelled[Symbol.asyncIterator]()
    await iterator.next()
    controller.abort()
    await iterator.return?.(undefined)
    await new Promise((resolve) => { setTimeout(resolve, 20) })
    expect(h.governor.stopState()).toMatchObject({ stopped: true, at: 'quiescence-unconfirmed' })
    expect(countersOf(h).settlementUnknown).toBe(1)
    expect(h.transport.received).toBe(1)
    expect(await drain(governedStream(h.governor, attempt('later'), downstream(h.transport))))
      .toBe('ARCP_R6_GO41_PERMIT_RUN_STOPPED')
    expect(h.transport.received).toBe(1)
  })

  it('records the settlement it could confirm, and never claims the unknown ones', async () => {
    const h = harness(2)
    await drain(governedStream(h.governor, attempt('ok'), downstream(h.transport)))
    await drain(governedStream(
      h.governor,
      attempt('unknown'),
      downstream(h.transport, { throwOnNext: true, leakOnReturn: true }),
    ))
    const counters = countersOf(h)
    expect(counters.wrapperEnded).toBe(2)
    expect(counters.downstreamQuiescent).toBe(1)
    expect(counters.settlementUnknown).toBe(1)
    expect(counters.settled).toBe(1)
    expect(h.frames.filter(frame => frame.type === 'settlement-unknown')).toHaveLength(1)
  })
})
