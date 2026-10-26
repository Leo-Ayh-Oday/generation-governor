# ADR-003 — Capability calls require a revision

Status: accepted for Adaptive v0.1

## Context

A capability may change after the model discovers it. MCP `tools/list_changed`, provider replacement, HMR, or ordinary tool registration can replace a schema between discovery and execution.

## Decision

Search and describe expose a revision derived from the capability's callable schema, and `capability_call` requires the revision that the caller observed.

If the current revision differs, execution fails closed and the caller must search or describe again.

## Consequences

Tool schema updates become an explicit protocol event instead of an implicit time-of-check/time-of-use race.

Historical session events may reference old revisions; new calls always validate against the current registry state.
