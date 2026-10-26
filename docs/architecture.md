# Adaptive Agent Mode Architecture Lock

Status: FROZEN FOR P0/P1 IMPLEMENTATION

## Purpose

Adaptive Agent Mode is a fifth agent-plane topology for DeepSeek Harness. It keeps the model-facing tool contract small and stable while the underlying Tool Registry may contain a large, dynamic capability set.

P0 and P1 establish only the architecture record, package lifecycle, three gateway tool placeholders, and an out-of-tree Adaptive preset source. Stable projection, authority enforcement, catalog/search, nested dispatch, policy, result bounding, MCP hot-plug, and benchmarks remain outside this implementation slice.

## Repository-conforming placement

The implementation package lives at `packages/extensions/capability-gateway` and uses the repository-valid package name `@deepseek-ai/dsh-capability-gateway`.

The design working name `@ds-runtime/dsh-capability-gateway` is not used because this repository requires `@deepseek-ai/dsh-<name>` workspace names and `packages/<group>/<pkg>` layout. This placement change does not alter the Adaptive runtime semantics.

The preset source lives at `distributions/leo-adaptive/presets/adaptive`. It does not modify `apps/cli/config/agent-presets`, so the four shipped presets remain untouched during research.

## Plane placement

The Capability Gateway is agent-plane behavior. It owns model projection, direct-call authority, capability discovery, and capability dispatch for an Adaptive agent scope.

Shared providers such as MCP servers remain host/deployment concerns. Adaptive consumes the Tool Registry produced by those providers; it does not create a second registry, session store, approval layer, sandbox, or model loop.

## Frozen model-facing names

The Adaptive direct core is:

```text
ask_user_question
todo_write
skill
capability_search
capability_describe
capability_call
```

P1 registers only the three `capability_*` tools as deterministic placeholders. P2 is the first phase allowed to implement model projection and therefore the first phase that may claim the complete six-tool visible surface.

## Registry, projection, and authority

Registry answers which tools exist and can be resolved by ToolRuntime.

Projection answers which registered schemas are sent to the model. Projection must not delete or restrict hidden tools from the underlying registry.

Authority answers which calls may execute. Hiding a schema is not an authority boundary; a later phase must deny model-root calls to hidden tools while allowing only Gateway-authorized descendants.

These three responsibilities remain separate throughout the implementation.

## Execution

A future `capability_call` must dispatch through `ctx.tools.execute()`. It must not invoke a tool definition's `execute` function directly.

This preserves the native pre-execute, guards, execution wrapper, post-execute, result finalization, cancellation, approval, sandbox, metrics, and observation path.

## Dynamic state

Capability catalog state is derived from the current agent-visible Tool Registry and is not durable session state.

Tool registration, removal, MCP resync, reconnect, or schema replacement must not rewrite the stable system contract or model tool ABI.

## Scope and lifecycle

All Gateway registrations belong to the mounting Cordis fiber or agent scope and must disappear on disposal.

Per-agent policy, catalog state, projection listeners, authority tokens, and listeners must never be process-global mutable singletons.

## P0/P1 completion boundary

P0 completes when the architectural obligations and alternatives are recorded.

P1 completes when the package and out-of-tree preset can be mounted, the three placeholder tools are registered through ToolRuntime, and disposing the owning fiber removes the package's registrations.

P0/P1 explicitly do not implement projection, hidden-tool guards, catalog snapshots, search ranking, describe resolution, nested dispatch, effect policy, bounded results, MCP hot-plug, or benchmarks.
