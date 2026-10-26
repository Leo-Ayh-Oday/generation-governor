# Adaptive Agent Mode Invariants

Status: FROZEN FOR P0/P1 IMPLEMENTATION

## INV-01 — Registry is not projection

A tool existing in the DSH Tool Registry does not imply that its schema is visible to the model.

## INV-02 — Projection is not authority

A schema being hidden from model prompt assembly does not make direct execution safe. Execution authority requires an independent guard.

## INV-03 — Stable model ABI

Capability Registry mutations must not change the Adaptive model-visible tool schema digest once P2 establishes the stable projection.

## INV-04 — Direct hidden calls fail closed

A model-root call to a tool outside the direct visible set must be denied after the authority phase is implemented.

## INV-05 — Gateway dispatch re-enters ToolRuntime

Capability dispatch must use `ctx.tools.execute()` and must never call a ToolDefinition implementation directly.

## INV-06 — Parent authority is opaque

Only a nested execution descended from an authorized Gateway outer execution token may pass the hidden-tool guard. Model input cannot forge that authority.

## INV-07 — Discovery is bounded

Capability search must enforce a hard maximum result count. The v0.1 design target is a default of five and a hard maximum of eight.

## INV-08 — Capability revisions are consistent

Search or describe returns a revision for the observed capability schema. A later call using a stale revision must fail with a stale-capability outcome rather than silently invoking the changed schema.

## INV-09 — Dynamic catalog is not prompt state

Tool registration, removal, MCP resync, reconnect, or catalog generation changes must not create dynamic system-prompt state.

## INV-10 — Unknown effects are not safe

A capability whose effect cannot be classified is denied by default once effect policy is implemented.

## INV-11 — Agent scopes are isolated

One agent's Gateway policy, projection, catalog cache, and authority state must not leak into another agent.

## INV-12 — Disposal leaves no residue

Disposing the Adaptive agent or Gateway fiber must remove scoped tools, listeners, guards, authority tokens, and catalog observers owned by that scope.
