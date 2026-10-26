/**
 * The slice of the host runtime's chunk types this governor actually reads.
 *
 * The governor was extracted from a larger agent runtime (DSH). Its only
 * external dependency was a type-only import of `FinishReason` and
 * `StreamChunk`, so this file reproduces those shapes locally and removes the
 * dependency entirely.
 *
 * Two properties are kept deliberately:
 *
 * 1. **The unions stay open.** `FinishReasonMap` and `ContentBlockMap` are
 *    interfaces, so a host can merge-in provider-specific members without
 *    editing this file — which is why the governor switches on `kind` and
 *    falls through unknown values instead of assuming a closed set.
 * 2. **Only what is read is modelled.** `ReplayEnvelope` is narrowed to the
 *    response slot; nothing in the governor or its tests reads it. The full
 *    envelope lives in the host runtime.
 */

/** Opaque identifier for one tool call. */
export type CallId = string

/** Opaque provider-issued identifier for one request. */
export type ProviderRequestId = string

/** Why one provider request failed, in provider-neutral terms. */
export interface LlmFailure {
  /** Human-readable provider or transport failure. */
  readonly message: string
  /** Stable provider-neutral machine-routing code. */
  readonly code: string
  /** HTTP status returned by the provider, when available. */
  readonly status?: number
  /** Provider-requested delay in milliseconds, when valid and available. */
  readonly providerRetryAfterMs?: number
  /** Opaque provider-issued request identifier for diagnostics. */
  readonly requestId?: ProviderRequestId
}

/** One assembled content block in a model response. */
export interface ContentBlockMap {
  readonly text: { readonly type: 'text'; readonly text: string }
  readonly reasoning: { readonly type: 'reasoning'; readonly text: string }
  readonly 'tool-call': {
    readonly type: 'tool-call'
    readonly id: CallId
    readonly name: string
    readonly arguments: unknown
  }
}

/** Any known content block type. */
export type ContentBlockType = keyof ContentBlockMap

/** Any known content block; switch on `type` and fall through unknowns. */
export type ContentBlock = ContentBlockMap[ContentBlockType]

/** Token accounting for one model call. Counts are disjoint. */
export interface TokenUsage {
  readonly inputTokens: number
  readonly outputTokens: number
  readonly cacheReadTokens?: number
  readonly cacheWriteTokens?: number
  readonly reasoningTokens?: number
}

/** Adapter-private metadata attached to a replayed response. */
export interface ReplayEnvelope {
  /** Response-level adapter-private metadata (ids, native stop reason). */
  readonly response: unknown
}

/**
 * Why a model response stopped.
 *
 * Merge-extensible so adapters can surface provider-specific reasons: the
 * governor reads `kind` and treats anything outside this map as "unknown",
 * never as success.
 */
export interface FinishReasonMap {
  readonly stop: { readonly kind: 'stop' }
  readonly 'tool-calls': { readonly kind: 'tool-calls' }
  readonly 'max-tokens': { readonly kind: 'max-tokens' }
  readonly aborted: { readonly kind: 'aborted'; readonly failure: LlmFailure }
  readonly error: { readonly kind: 'error'; readonly failure: LlmFailure }
}

/** Any known finish reason, derived from {@link FinishReasonMap}. */
export type FinishReason = FinishReasonMap[keyof FinishReasonMap]

/**
 * One incremental chunk of a model stream.
 *
 * This is the surface the governor observes. It reads `type` and, on a
 * `finish` chunk, `reason` — nothing else. Every other field is carried
 * through untouched.
 */
export type StreamChunk =
  | { readonly type: 'block-start'; readonly index: number; readonly blockType: ContentBlockType }
  | { readonly type: 'text-delta'; readonly index: number; readonly text: string }
  | { readonly type: 'reasoning-delta'; readonly index: number; readonly text: string }
  | {
    readonly type: 'tool-call-delta'
    readonly index: number
    readonly id: CallId
    readonly name?: string
    readonly argumentsDelta: string
  }
  | { readonly type: 'block-end'; readonly index: number; readonly block: ContentBlock }
  | { readonly type: 'usage'; readonly usage: TokenUsage }
  | {
    readonly type: 'finish'
    readonly reason: FinishReason
    /** Replay metadata for a successful response. */
    readonly replayState?: ReplayEnvelope
  }
