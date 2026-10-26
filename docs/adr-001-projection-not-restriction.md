# ADR-001 — Projection, not restriction, hides capabilities

Status: accepted for Adaptive v0.1

## Context

Adaptive must keep the real DSH Tool Registry complete while presenting a much smaller model-facing tool set.

`ctx.tools.restrict()` changes registry resolution as well as schema visibility. A tool removed through restriction can no longer be resolved by a later Gateway dispatch in the same agent scope.

## Decision

Adaptive will hide long-tail tools at the authoritative prompt-assembly projection point by filtering the assembled tool schemas.

The underlying Tool Registry remains complete and continues to own tool resolution and execution.

A separate execution guard will enforce direct-call authority. Projection alone is never treated as a security boundary.

## Consequences

Gateway dispatch can resolve hidden tools without creating a second registry or bypassing ToolRuntime.

Projection and execution authority require separate tests and separate lifecycle cleanup.

P2 owns the projection implementation. P3 owns the hidden-tool authority guard.
