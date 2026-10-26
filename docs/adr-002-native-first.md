# ADR-002 — Native tool presentation first

Status: accepted for Adaptive v0.1

## Context

Code Mode derives a generated SDK from the tool catalog. If that generated SDK tracks dynamic tools, capability hot-plug would still mutate model-visible input even when native tool schemas are projected to a stable set.

## Decision

Adaptive v0.1 uses native tool presentation.

The first version does not attempt to combine dynamic backend capabilities with Code Mode's generated SDK.

## Consequences

The v0.1 experiment isolates the value of stable capability virtualization without introducing a second dynamic presentation path.

A static Code SDK over a dynamic backend is deferred until the native Adaptive ABI is proven stable and useful.
