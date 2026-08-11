# WP-Bench integration

Status: design proposal, partially overtaken by upstream.
Verified against `WordPress/wp-bench@bf059e2` (trunk, 2026-08-06). Previously verified at `d20c0e7` (2026-07-20); see "What upstream changed" below for what that revision got wrong.

## What upstream changed between `d20c0e7` and `bf059e2`

Four commits landed. Two of them resolve things this document argued for, so read the sequenced
plan below with these already done:

- **[#45] `exploit_solutions` is wired end to end.** It is now a field on the `ExecutionTest`
  dataclass (`datasets.py:39`, `list[str] | None`) and read by the local JSON loader
  (`datasets.py:181`), which `exploits.py::exploit_candidates()` already consumed. **Phase 1
  step 2 is complete upstream.** Upstream took plain strings — the minimal fallback offered at
  the end of the amendment below, not the named-object shape argued for — so the `authored-2`
  diagnostics problem is untouched and remains the live part of that proposal.
- **[#45] `gb-block-markup` execution category (14 tests) shipped with authored exploits.**
- **[#46] 21 execution tests for the WP 7.0 API surfaces** — `abilities-api`, `connectors-api`,
  `ai-client`.
- **[#48] The knowledge track was removed; wp-bench is execution-only.** Any framing that treats
  knowledge and execution as two tracks is obsolete.

The suite now spans 29 categories in `datasets/suites/wp-core-v1/`, many mapping onto skills in
this repo: `gb-block-markup` (14), `abilities-api` (13), `rest-api` (12), `queries` (12),
`connectors-api` (10), `ai-client` (10), `roles-caps` (8), plus `gb-block-api`, `gb-block-hooks`,
`gb-block-bindings`, `gb-block-editor`, `gb-interactivity-api`, `gb-templates-navigation`, and
`gb-font-library`.

Authored exploits exist in exactly three of those categories — `gb-block-markup`,
`connectors-api`, and `abilities-api`. Counted precisely: **17 tests carry a non-empty
`exploit_solutions` list, holding 21 exploit strings in total** — `gb-block-markup` 14 tests / 15
strings, `abilities-api` 2 tests / 4 strings, `connectors-api` 1 test / 2 strings. (The two counts
differ because a test may carry more than one exploit; `exploit_candidates()` enumerates strings,
so 21 is the number that shows up as `authored-N` labels.) **`security` and `roles-caps` have
none.** Those are the two this document argued to audit first, and the argument in "Why
calibration precedes measurement" now applies to a concrete, unaudited surface rather than a
hypothetical one.

Minor drift: the config key is `run.execution_isolation` (result metadata still reports
`runtime_isolation`), and the `core.py` line references below are now 401, 596, and 901.

## Position

Agree with the two-way bridge. `agent-skills` should be a controlled input to WP-Bench and a source
of harder cases, not a parallel benchmark. This document answers only the open sequencing question:
**which coordinated specification comes first, external-completion grading or skill-derived
near-miss cases.**

**Answer: near-miss cases first.** Not because they are lower risk — because grading calibration is
a prerequisite for the measurement the grading path exists to produce.

## Why calibration precedes measurement

Under scoring v2.0, required static patterns are diagnostics only and runtime assertions decide the
pass. A test's discriminating power is therefore exactly the discriminating power of its assertions,
and nothing else.

Now consider what the skills teach: capability checks alongside nonces, context-specific escaping,
prepared SQL, deprecations on changed block markup, non-permissive `permission_callback`s. Every one
of those is invisible to a happy-path fixture. An assertion written to prove the feature works will
usually still pass when the capability check is missing, because the fixture runs as an
administrator.

So the behaviors the skills are most likely to add are the behaviors the assertions are most likely
to miss. That correlation is close to 1 and does not average out across tests. Running the lift
experiment first would produce a defensible-looking number — `direct` minus `raw` — that is
systematically depressed by the graders' blindness to precisely the guidance under test. There is no
post-hoc correction for it; you would not be able to tell a skill that does not help from a grader
that cannot see the help.

Auditing near-misses first inverts this. Every authored near-miss that *passes* an existing test is
a grading gap found and fixed, published upstream on its own merits, before any lift number depends
on it.

## Second reason: issue #39 blocks grading harder than it blocks auditing

Issue [#39](https://github.com/WordPress/wp-bench/issues/39) — "reset_per_test isolation can
silently fail: cli/http graders never reset; docker reset ignores errors" — is real and visible in
`environment.py`. `reset()` acts only when `grader.wp_env_dir` is set or `grader.kind == "docker"`;
`kind: cli` falls through the branch and performs no reset at all, while still reporting
`runtime_isolation: reset_per_test` in result metadata (`core.py` lines 401, 596, 901).

The asymmetry matters:

- A **lift experiment** is a comparison across runs. Leaked state corrupts it systematically and
  silently, and the corruption is invisible in the output because the metadata asserts isolation.
- A **near-miss audit** is a per-test proposition — "does this implementation fail this test?" — that
  is re-runnable against a single `--test-id` and verifiable by hand.

Useful near-miss work can proceed today under a `wp_env_dir` configuration. Publishing assisted-vs-raw
numbers should wait for #39.

## Third reason: the exploit field is a prerequisite for the artifact roadmap

The artifact-roadmap observation is confirmed. `config.py` declares:

```python
ArtifactKind = Literal[
    "php_snippet", "wp_plugin_files", "block_plugin",
    "wp_theme_files", "js_module", "patch",
]
```

while `artifacts.py::parse_artifact` implements two and raises `ArtifactError` for the rest —
`test_artifacts.py::test_unknown_artifact_kind_rejected` pins that behavior using `js_module`.

The consequence for sequencing: `exploits.py::generic_exploit_candidates()` returns `[]` for any
test whose `artifact_kind` is not `php_snippet`, on the stated grounds that such tests need an
authored exploit rather than a one-liner. So **every artifact kind added to the parser expands the
suite's unaudited surface** unless authored exploits ship with it. Wiring the authored-exploit field
is not only the near-miss enabler; it is a precondition for growing the roadmap without degrading
the audit.

This also reframes `block_plugin` and `wp_theme_files` — the kinds that map onto
`wp-block-development`, `wp-interactivity-api`, `wp-block-themes`, and `wp-patterns`. Those are the
right contributions, and they should arrive with near-misses attached from the first commit.

## Amendment: do not add `mutation_solutions`

The proposal introduces a `mutation_solutions` field and a `--check-mutations` flag. Recommend
against: it would create two fields with identical mechanics (a list of implementations that must
fail) and two audit flags over one code path.

`exploit_solutions` already exists as the extension point — `exploits.py` appends
`getattr(test, "exploit_solutions", None)` to the generic battery. It was a follow-up schema field
when this was written; #45 has since implemented it, which settles the argument in this amendment's
favour: upstream extended the existing field rather than adding a parallel one. A realistic
near-miss is precisely a cheat the generic battery cannot express.

One refinement is worth proposing, because the current shape produces poor diagnostics.
`exploit_candidates()` labels authored entries `authored-0`, `authored-1`, … by enumeration, and
`records.py` reports `passing_exploit` as that label. In an audit report, `authored-2` says nothing.
Propose the loaded field as a list of objects:

```json
"exploit_solutions": [
  { "name": "nonce-without-capability", "code": "..." },
  { "name": "sanitized-but-unescaped-output", "code": "..." }
]
```

This changes `exploit_candidates()` alongside the loader, so scope both into the same PR. If
maintainers prefer the minimal change, plain strings match the existing `enumerate` and the labels
can be improved later.

**Outcome:** #45 shipped the minimal form — `exploit_solutions: list[str] | None`. "Later" is now,
and the case is stronger with 21 authored exploit strings across 17 tests in the suite, every one of
them producing an opaque `authored-N` label in audit output. Propose the named shape as a follow-up with a migration that accepts both.

Note also that `config.py` sets `extra="forbid"` on every config model, with the stated rule that
"every field is either implemented or rejected loudly." An `evaluation.mode` block cannot be
prototyped out-of-band — it has to land as implemented config. That strengthens the case for raising
the raw-vs-assisted identity question as an issue before the code.

## Sequenced plan

### Phase 1 — near-miss audit (no model calls, no API keys)

Upstream, ascending review cost:

1. **Docs — still open.** Add the exploit audit to
   `.agents/skills/wp-bench-execution-tests/SKILL.md`. That skill is 143 lines and contains zero
   occurrences of "exploit", "cheat", or "adversarial"; its validation block runs
   `--check-reference-solution` but never `--check-exploits`. Authors are currently taught to prove
   the reference passes and not to prove cheats fail. This gap widened with #45: the field now
   exists and three categories use it, but nothing teaches an author to reach for it.
2. **Schema — done upstream (#45).** `exploit_solutions` is on the `ExecutionTest` dataclass and
   read by the local JSON loader. Two pieces of the original proposal remain: the Hugging Face row
   path in `datasets.py`, and the named-object shape for `exploit_candidates()` so audit reports
   say `nonce-without-capability` instead of `authored-2`.
3. **Content — started upstream, but not where it matters most.** Authored exploits exist for
   `gb-block-markup`, `connectors-api`, and `abilities-api`. Author near-misses for `security` and
   `roles-caps` next — nonce without capability, sanitised storage with unescaped output, correct
   API names with interpolated SQL, correct route with permissive `permission_callback`. Where a
   near-miss passes, tighten the assertion in the same PR; that is the deliverable, not a side
   effect.

Local:

```
docs/wp-bench-integration.md
eval/wp-bench/near-misses/        # per skill, per behavior; source of record
eval/wp-bench/audit-report.md     # which tests each near-miss survives
```

**Stop condition.** If no authored near-miss passes any existing test, the suite discriminates
better than assumed. That is a publishable result, and it also means the calibration argument above
no longer blocks the lift experiment — jump to phase 3.

### Phase 2 — artifact kinds where the skills are strongest

`block_plugin` and `wp_theme_files` parser support plus cases, each shipping `reference_files` and
authored near-misses together. Maps onto open issues [#6](https://github.com/WordPress/wp-bench/issues/6)
(Block Code Generation), [#7](https://github.com/WordPress/wp-bench/issues/7) (Plugin Architecture),
[#8](https://github.com/WordPress/wp-bench/issues/8) (Theme Development),
[#10](https://github.com/WordPress/wp-bench/issues/10) (Security).

**Re-scoped at `bf059e2`.** Upstream added block coverage without touching the artifact parser:
#45's 14 `gb-block-markup` tests, and the `gb-block-api`, `gb-block-hooks`, `gb-block-bindings`,
`gb-block-editor`, `gb-interactivity-api`, `gb-templates-navigation`, and `gb-font-library`
categories all run as `php_snippet`. The parser is still two kinds. So the contribution here is no
longer "add block tests" — that is being done — it is the narrower question of whether tests that
need a real plugin or theme tree on disk justify implementing `block_plugin` and `wp_theme_files`,
and the exploit-coverage argument still gates that: every artifact kind added to the parser expands
unaudited surface, because `generic_exploit_candidates()` returns `[]` for anything that is not
`php_snippet`.

### Phase 3 — external-completion grading and the four profiles

`wp-bench grade --completions <jsonl>` as specified, plus the assisted-run identity. Gated on #39
being resolved, or on the config refusing to run assisted comparisons when reset cannot be verified.
Then `raw` / `direct` / `routed` / `decoy` with the diagnostic metrics, and `eval/wp-bench/coverage.yaml`
once there is enough mapping to query.

Endorsed without reservation: separating artifact generation from artifact grading is the correct
architecture, and keeping assisted scores out of the raw leaderboard is the correct policy. The
disagreement is only about what has to be true before those numbers mean anything.

## Verified against trunk

Re-verified at `bf059e2` (2026-08-06).

| Claim | Status |
| --- | --- |
| Six artifact kinds declared, two implemented | Confirmed, unchanged — `config.py:14`; `artifacts.py::parse_artifact` handles `php_snippet` and `wp_plugin_files` and raises for the rest. No test in the suite sets `artifact_kind`, so all 29 category files run on the `php_snippet` default (`datasets.py:33`) |
| No public path for grading external completions | Confirmed, unchanged — `cli.py` still defines exactly one command, `run` |
| `reset_per_test` can silently fail | Confirmed, unchanged — issue #39 is still open. `environment.py::reset()` acts only under `if self.config.wp_env_dir` / `elif self.config.kind == "docker"` (lines 79, 82); `kind: cli` still falls through with no reset while metadata reports isolation. The docstring was expanded, the branch was not fixed |
| Results record usage and reproducibility metadata | Confirmed — `records.py` carries `usage`, `model_call`, `prompt_hash`; `core.py` records `runtime_isolation` at 401, 596, 901 |
| Open gaps in plugins, security, blocks, themes, performance, multisite | Partly closed — blocks and the WP 7.0 API surfaces landed via #45/#46; `security` and `roles-caps` remain without authored exploits |
| Authored exploits supported end to end | **Now yes** — #45 added the `ExecutionTest` field and loader support. This row was `No` at `d20c0e7` |
| Upstream authoring skill teaches the adversarial half | **Still no** — `.agents/skills/wp-bench-execution-tests/SKILL.md` is still 143 lines with zero occurrences of "exploit", "cheat", or "adversarial" |

## Open questions

- Which WordPress version does the grader image build? `AGENTS.md` describes the runtime as a
  WordPress 6.9 plugin while the authoring skill directs authors to verify modern APIs against 7.0
  source. Any version-matrix work needs this settled first.
- Does the Hugging Face export (`datasets/export_dataset.py`) need a matching column, or is
  `exploit_solutions` local-suite only?
- Are authored near-misses acceptable as public data? They are adversarial inputs rather than
  holdout answers, and the generic battery is already public — worth confirming before the PR.

## Sources

- [WordPress/wp-bench](https://github.com/WordPress/wp-bench) @ `bf059e2` — `python/wp_bench/{config,artifacts,exploits,datasets,environment,records,core,cli}.py`, `python/tests/{test_artifacts,test_exploit_audit}.py`, `datasets/suites/wp-core-v1/`, `.agents/skills/wp-bench-execution-tests/SKILL.md`, `AGENTS.md`
- Upstream PRs since `d20c0e7`: [#45](https://github.com/WordPress/wp-bench/pull/45) (gb-block-markup + `exploit_solutions` wiring), [#46](https://github.com/WordPress/wp-bench/pull/46) (WP 7.0 API surface tests), [#47](https://github.com/WordPress/wp-bench/pull/47) (ruff 0.16), [#48](https://github.com/WordPress/wp-bench/pull/48) (knowledge track removed)
- [Issue #39 — reset_per_test isolation can silently fail](https://github.com/WordPress/wp-bench/issues/39)
- [Introducing WP-Bench: A WordPress AI Benchmark](https://make.wordpress.org/ai/2026/01/14/introducing-wp-bench-a-wordpress-ai-benchmark/)
