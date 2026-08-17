---
name: wp-abilities-audit
description: Use when auditing a WordPress plugin's REST API surface for Abilities API candidates, planning registrations, or producing an abilities migration audit before implementation.
compatibility: "Targets WordPress 6.9+ (PHP 7.2.24+). Filesystem-based agent with bash + node. Requires access to the plugin checkout; some workflows benefit from WP-CLI but don't require it."
license: GPL-2.0-or-later
---

# WP Abilities Audit

Produce a standardized audit document for a WordPress plugin's REST surface,
proposing a set of Abilities API registrations grouped by semantic intent. The
audit doc is a planning artifact for implementers — humans, agents, or both —
that captures the controller inventory, capability gates, and proposed
ability shapes in a structured form. A reviewer reading the doc can scope the
work without re-deriving the survey.

This skill works on any plugin that exposes a REST surface. Plugin
classification (for purposes of the optional `plugin_family` annotation) is
the user's call; the workflow itself is plugin-agnostic.

## When to use

- The task is "register Abilities API abilities for a WP plugin" and no audit
  doc exists yet.
- Planning participation in a multi-plugin abilities rollout and need a
  shareable, standardized audit artifact.
- Pre-flight checking a plugin's agent-readiness before implementing abilities.
- A PM or non-implementer wants to scope the work before engineering picks it up.

## Inputs required

1. **Plugin checkout path** — working tree of the plugin to audit.
2. **Triage output** — run `wp-project-triage` first if not already done. The
   audit consumes `signals.usesAbilitiesApi`, `versions.wordpress`, and
   `project.kind` from the report.
3. **Auditor identity** — name and team or context, recorded in the audit's
   `auditor` field.
4. **Output path** — where the audit doc should land. Default explicit over
   implicit; ask if not provided rather than writing into the plugin worktree.

## Prerequisites

- `wp-project-triage` has run successfully and classified the plugin.
- The plugin has at least one REST surface. If enumeration finds zero declared
  controllers *and* zero implicit `show_in_rest` surface, the audit doesn't
  apply — see "Failure modes" below.

## Procedure

### 1. Enumerate REST controllers

Read `references/controller-enumeration.md` now — it covers the three
enumeration paths (glob for standard layouts, grep as the universal fallback,
and the implicit pass for core-derived `show_in_rest` routes) and when to use
each. The implicit pass is additive: run it whatever the first two returned.

Record every controller class + file + REST base + routes in a "Controller
Inventory" table. The inventory is exhaustive even though only a subset
becomes proposed abilities.

### 2. For each controller, extract the backing fields

For every controller found, extract the fields the audit schema requires:
class, file, HTTP method, route, route-registration line number, callback
name, callback line number, permission callback, whether the callback takes
a `WP_REST_Request` argument or is zero-arg, and the return type.

Read `references/audit-schema.md` now for the exact field list and the shape
of `proposed_abilities` entries. Line-number fields may be `null` for
inherited callbacks — the schema allows this and pairs it with an optional
`inherited_from` field.

### 3. Confirm capability gate(s)

Trace each controller's `permission_callback` to its `current_user_can()` call
(or to the post-type capability machinery if the controller extends a
post-type-backed base).

Read `references/capability-gate-tracing.md` now — it documents the two
common mechanisms (direct `check_permission()` vs post-type-backed
`wc_rest_check_post_permissions()`) and how to represent each in the schema.
Note explicitly whether read and write gates differ: compound gates are
represented as a `{read, write}` object, not a single string.

### 4. Propose abilities using semantic-intent grouping

Do NOT atomize one ability per HTTP method. Apply the semantic-intent grouping
heuristic — it's the only grouping rule this skill uses.

Read `../wp-abilities-api/references/grouping-heuristic.md` now — do NOT
re-derive the rules here. Short version: one ability per real-world question
or state transition, with filter parameters in `input_schema` collapsing N
variants into 1.

**Apply the use-case sanity check before populating any candidate.** Per
`../wp-abilities-api/references/domain-vs-projection.md`'s use-case-contract
test: would a human or agent intentionally perform this behavior through a
supported plugin workflow? If yes, the candidate is a real ability —
proceed to fill in fields. If no, the route is internal transport plumbing
(cache invalidation, scheduler ticks, bookkeeping endpoints, debug
introspection) — keep it in the Controller Inventory section for
completeness, but do NOT promote it to `proposed_abilities`. The route may
be useful to inventory; the proposed ability must represent a real
user/operator question or action.

For each proposed ability that passes the sanity check, fill in every
field in the `proposed_abilities` schema: `name`, `intent`, `backing`,
`permission`, `return_type`, `effort` (S/M/L), `annotations`
(readonly/destructive/idempotent), `notes`, `risks`, `use_case_fit`,
`side_effects`, `seed_data_needs`, `exposure`.

`use_case_fit`, `side_effects`, and `seed_data_needs` are the
implementation-readiness facts the implementer and the verify-mode
tooling both need: which human/agent workflow this ability serves
(`use_case_fit`), what the backing path emits on every call
(`side_effects` — empty array is a fact, not a missing value), and what
representative data must exist in the test environment for the ability
to execute through the public boundary (`seed_data_needs`).

### 4a. Decide exposure explicitly

Fill in `exposure` on every proposed ability. This is a distinct decision
from `permission`, and the audit is where it gets made — if it is left to
the implementer it gets made by a metadata default instead.

Set `agent_facing` (should an external agent be able to *discover* this?),
`mcp` (`allow` / `deny` / `inherit`), and a one-sentence `rationale`
naming the agent workflow whenever `agent_facing: true` or `mcp: allow`.

Two rules:

- **Every `destructive: true` ability needs `mcp: allow` with a rationale,
  or `mcp: deny`.** `inherit` on a destructive ability is not a decision.
  On MCP Adapter 0.6.0+ the default server serves anything resolving to
  `meta.public`, so `inherit` silently hands agents a destructive
  operation.
- **Never soften `permission` because `agent_facing` is `false`.**
  Exposure decides who can find an ability; `permission_callback` decides
  who may run it. A non-agent-facing ability is still executable by any
  caller that knows its name.

`../wp-abilities-api/references/rest-api.md` has the resolution tables if
the target WP or adapter version is in question.

### 5. Surface gaps and deferred items

Three buckets:

- **`excluded_from_mvp`** — candidates intentionally deferred for risk reasons
  (real-money writes, irreversible state changes, or prerequisite design
  work). Each entry gets a one-sentence reason.
- **`surfaced_gaps`** — MVP candidates with no backing endpoint (ability with
  `backing: null`), plus high-value endpoints discovered during enumeration
  that aren't in the MVP list but would be easy future wins.
- **Risks per ability** — anything about a backing endpoint that the
  implementer must handle (no idempotency key, two-phase behavior,
  state-transition caveats, zero-arg endpoints registered with
  `permission_callback => '__return_true'` that must NOT copy that into the
  ability registration).

### 6. Write the audit doc

Write to the explicit output path collected in "Inputs required". The
document structure must match `references/audit-schema.md` exactly:

1. `Last updated: YYYY-MM-DD HH:MM` header.
2. YAML block with all required top-level metadata + `proposed_abilities`,
   `excluded_from_mvp`, `surfaced_gaps`.
3. "Controller Inventory" table.
4. "Notes and Surprises" prose section.

A copy-pasteable minimal example showing the full shape lives in
`references/audit-schema.md` under "Minimal valid example" — start there
when authoring a new audit.

### 7. (Optional) Designate a reference implementation ability

Set `reference_ability: true` on the first ability an implementer should
land — typically the smallest, safest, highest-leverage read. This gives
downstream workflows a deterministic starting point.

Pick one that needs no required input: the reference ability must be
invocable as `execute([])`, and `wp-abilities-verify` Lint 6 FAILs a
registration whose reference ability declares a non-empty
`input_schema.required`. A list ability whose filters are all optional
qualifies; one that requires an id does not.

## Verification

- The audit conforms to `references/audit-schema.md` (all required top-level
  fields present, at least one entry in `proposed_abilities`, annotations
  complete on every ability).
- `capability_gate` is a string for single-cap plugins or a `{read, write}`
  object for post-type-backed plugins.
- Every ability with `backing: null` also appears in `surfaced_gaps`.
- Every ability carries an `exposure` object, and every `destructive: true`
  ability resolves it to `mcp: allow` (with a rationale) or `mcp: deny` —
  never `inherit`.
- The doc passes the validation procedure in
  `../wp-abilities-verify/references/audit-schema-validation.md` (Steps 1-3)
  with no FAIL entries.

## Failure modes / debugging

- **Plugin has no REST controllers** — not a conclusion on its own. Run the
  implicit pass first: a CPT-only plugin has a full REST surface with zero
  `register_rest_route(` call sites. Only when the implicit pass also comes
  back empty does the audit not apply — then consider hooks/filters-based
  abilities (out of scope for this skill's current version) or skip abilities
  adoption for this plugin.
- **Plugin inherits controllers from another repo** (common for plugins
  extending core post-type-backed controllers like `WP_REST_Posts_Controller`,
  or extension plugins built on a parent's REST classes) — capture with
  `backing.inherited_from: "<parent FQCN>"`. Line-number fields may be
  `null` per the schema.
- **Compound capability gate (distinct read/write caps)** — use the
  structured `{read, write}` form documented in
  `references/capability-gate-tracing.md`. Don't smuggle a `/`-separated
  string into a field typed as a single cap.
- **Ambiguous grouping** — route to
  `../wp-abilities-api/references/grouping-heuristic.md`. Do not invent
  alternative grouping rules in the audit doc.
- **Zero-arg endpoints with `permission_callback => '__return_true'`** —
  legal at the REST layer, but the ability's own `permission_callback` must
  match the plugin's merchant gate. Never promote `'__return_true'` into an
  ability registration. Note this in the ability's `risks`.
- **Output path defaults to plugin worktree** — always ask the user for an
  explicit output directory (e.g. their vault `plans/`). Writing the audit
  into the plugin's own git history pollutes the worktree and buries the
  artifact.

## Escalation

- If the plugin uses an enumeration convention not covered by
  `references/controller-enumeration.md` (none of the three paths produces a
  complete inventory), update that reference with the new convention and open
  a PR so future audits cover it deterministically.
- If capability tracing hits a mechanism not covered by
  `references/capability-gate-tracing.md`, extend that file rather than
  encoding the new case in the audit's "Notes and Surprises" only.
