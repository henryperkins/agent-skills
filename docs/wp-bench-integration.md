# WP-Bench integration

Status: **mostly overtaken by upstream.** Two of the three things this document argued for have shipped; what remains is narrower and more concrete than the original plan.

Verified against `WordPress/wp-bench@e19d3a8` (trunk). Re-checked 2026-09-27, when `e19d3a8` was still the head — trunk has not moved since 2026-09-07 — with every count below recomputed and the corrections from that pass applied. Previously verified at `bf059e2` (2026-08-06) and `d20c0e7` (2026-07-20).

## What upstream changed between `bf059e2` and `e19d3a8`

Six commits landed, and they close most of this document's open ground.

- **[#52] Issue #39 is fixed.** `WordPressEnvironment.reset()` now raises when `grader.kind` has no reset implementation instead of silently skipping and stamping `runtime_isolation: reset_per_test` anyway. **The argument that assisted-vs-raw numbers must wait for #39 no longer applies.**
- **[#53] Reset restores a captured baseline** (`wp db reset && wp db import`, chained so a failed drop cannot import over surviving state) instead of reinstalling WordPress, and refuses to run when no clean baseline was captured. Isolation is now both honest and affordable.
- **[#49] Results stream to disk** as tests complete, so a crash mid-run no longer discards everything graded so far.
- **[#50] Skill-injection A/B runs shipped.** `--skill` takes one or more skill directories or bare `.md` files; every model runs a `baseline` variant and a `skills` variant over the identical seeded subset, and the comparison table shows the delta. **This is the bridge this document was arguing toward, built upstream.**
- **[#63] Targets WordPress 7.1, drops `difficulty`.** The field is gone from the model, both loaders, the Parquet export, result records (`result_schema_version` 2.1 → 2.2), and limited-run selection, which now stratifies by category only. The upstream authoring skill was refreshed in the same PR.
- **[#64] 165 harder execution tests.** The PR title says 9 new and 20 existing categories; a recount of the tree gives 10 new categories (admin, auth, block-patterns-styles, dates-time, html-api, http-api, performance, plugin-lifecycle, posts-lifecycle, theme-templates) and 19 existing ones that grew. It also added the first five `wp_plugin_files` tests.

Net effect on the suite:

| | `bf059e2` | `e19d3a8` |
| --- | --- | --- |
| Categories | 29 | **39** |
| Tests | 185 | **350** |
| Tests with `exploit_solutions` | 17 | **182** |
| Authored exploit strings | 21 | **378** |
| `security` / `roles-caps` tests with authored exploits | 0 / 0 | **7 / 2** (14 / 4 exploit strings) |
| Result schema version | 2.0 | **2.2** (2.1 in #50, 2.2 in #63) |
| Scoring version | 3.0 | 3.0 (unchanged) |
| Suite `wp_version` | 7.0 | **7.1** |
| Upstream authoring skill | 143 lines, zero mentions of "exploit" | **207 lines; "exploit" on 11 lines (15 occurrences), 7 of `--check-exploits`** |

Two open questions from the previous revision are answered:

- **Which WordPress version does the grader build?** 7.1. `AGENTS.md` now says "WordPress 7.1 plugin", `runtime/.wp-env.json` and `runtime/Dockerfile` target 7.1, and every suite file declares `wp_version: 7.1`.
- **Does the Hugging Face export need an `exploit_solutions` column?** No, and deliberately: `datasets/export_dataset.py` excludes it as "maintainer-side assertion QA (`--check-exploits`), not benchmark content for dataset consumers." The "are authored near-misses acceptable as public data" question is settled the same way — they live in the local suite, not the published dataset.

One incidental finding worth carrying: **WordPress 7.1 marks every core ability `public` (r62737).** `e-abilities-api-012` previously used `core/get-user-info` as its not-REST-exposed fixture and broke, so it now registers its own `wpbp/hidden-probe` ability instead. The same core change is why `skills/wp-abilities-api` needed re-syncing — see that skill's `references/mcp-exposure.md`.

## Position

Unchanged: `agent-skills` should be a controlled input to WP-Bench and a source of harder cases, not a parallel benchmark. What has changed is the sequencing answer.

The original question was **which coordinated specification comes first, external-completion grading or skill-derived near-miss cases.** The answer was "near-miss cases first, because grading calibration is a prerequisite for the measurement the grading path exists to produce."

**That argument has largely been satisfied by upstream rather than by us.** It rested on two premises, and both have moved:

1. *The categories the skills most affect have no authored exploits.* `security` now has 7 exploit-carrying tests and `roles-caps` has 2, inside a suite that went from 17 to 182 exploit-carrying tests.
2. *Isolation can silently fail, so cross-run comparisons are untrustworthy.* Fixed in #52.

The calibration argument still holds in principle — an assertion written to prove a feature works will still usually pass when the capability check is missing — but not for the reason this document used to give. Fixtures do not run as an administrator: the verifier runs `wp eval-file` with no `--user`, so code executes as user 0 (anonymous), and only 19 of the 350 tests switch users at all. A missing capability check therefore goes unnoticed, and the effect also runs the other way: code that *does* check capabilities can fail tests that execute as user 0 (`e-abilities-api-002`, `-004`, and `-007` never say who may run the ability, and their reference solutions use `__return_true`). That blindness correlates with exactly what the skills teach, and it can push a skill's measured lift *below* zero. But it is no longer a *blocker*. It is now a reason to read a lift number carefully, not a reason to refuse to produce one.

## Revised plan

### Phase 1 — run the A/B that already exists (no new upstream code)

`--skill` is implemented. Nothing needs to land upstream before we can measure.

```bash
# wp-bench.example.yaml already sets dataset.source: local and grader.wp_env_dir: ./runtime.
cp wp-bench.example.yaml wp-bench.yaml

# --limit round-robins across all 39 sorted categories (--limit 60 --seed 1 selects one
# rest-api and two abilities-api tests), so name the 37 tests instead.
IDS=$(python -c "import json; print(','.join(t['id'] for c in ('rest-api', 'abilities-api') for t in json.load(open(f'datasets/suites/wp-core-v1/execution/{c}.json'))['tests']))")

wp-bench run --config wp-bench.yaml \
             --skill ../agent-skills/skills/wp-rest-api \
             --skill ../agent-skills/skills/wp-abilities-api \
             --test-id "$IDS"
```

Without `--config`, the dataset defaults to the Hugging Face source `WordPress/wp-bench-v1` (HTTP 401 when checked on 2026-09-27) and the grader to bare docker. Open PR [#67](https://github.com/WordPress/wp-bench/pull/67) adds `--category`, which would replace the ID list.

Mechanics worth knowing before reading any output:

- Every model runs both variants over the **identical** seeded subset. The variant keys are `baseline` and `skills`; the with-skills pass suffixes the model name with `+skills`.
- `--skills-include-references` is **on by default**, and must stay on for a fair test. The harness is single-shot, so the model cannot follow a `SKILL.md` file pointer on its own; with references off you are measuring a truncated skill. It exists as a diagnostic, not a normal mode.
- `--skills-only` skips the baseline. Also diagnostic — the in-run A/B is what makes the numbers comparable.
- Provenance is recorded per record (`variant.key`, `kind`, `system_prompt_hash`) and per payload (skill names plus the system-prompt SHA-256). Cite the hash when reporting a delta; a skill edit silently changes what was measured.
- Run under `run.execution_isolation: reset_per_test` with the `wp_env_dir` grader. The bare `docker` grader is not equivalent: only `runtime/.wp-env.json` sets `WP_DEBUG`, which the sandbox turns into thrown exceptions, so the nine tests whose contract is "no notice" (among them `e-abilities-api-012` and `e-connectors-api-002`, `-009`, `-011`, and `-013`) discriminate only on wp-env. `cli` graders now raise rather than pretending, which is what makes the comparison meaningful.
- **Cost.** References are inlined, so injecting `wp-abilities-api` alone adds about 225,000 characters (roughly 56k tokens by wp-bench's own estimate, measured 2026-09-27) to every skills-arm call.
- **Baseline bias.** #63 added an execution-context note to every prompt that tells the model to register directly rather than defer to boot actions. For abilities that produces `_doing_it_wrong()` and a `null` registration, and `e-abilities-api-002` and `-004` do not name the hook in their prompts, so part of any lift there measures the note steering the baseline wrong.
- **Usage accounting.** Multi-model payloads — every `--skill` run — drop the per-model `usage` summary (`core.py:994-1017`); open PR [#51](https://github.com/WordPress/wp-bench/pull/51) restores it and adds `--baseline-from` to reuse a baseline.
- **Temperature.** `temperature` is always sent, and the fallback matches only the literal "`temperature` is deprecated" message. Open PR [#54](https://github.com/WordPress/wp-bench/pull/54) removes `ModelConfig.temperature` — a breaking config change — because current Claude models reject it with a different message; check before running Claude models.

Start with the skills whose subject matter maps cleanly onto existing categories: `wp-rest-api` (24 tests), `wp-abilities-api` (13), `wp-block-development` against `gb-block-api` (16) and `gb-block-markup` (14), `wp-performance` against `performance` (7) and `caching` (9).

**Read the result as a floor, not a measurement.** Where a delta is flat, check whether the category's assertions can see the behaviour the skill adds before concluding the skill does not help. That check is Phase 2.

### Phase 2 — near-miss audit, narrowed

Still worth doing, but no longer a prerequisite, and no longer aimed at `security` and `roles-caps` wholesale — upstream has authored exploits there now. The remaining contribution is targeted:

1. **Audit where exploit coverage is thinnest and our skills are strongest.** Two distinct gaps:

   - **Seven of the 39 categories carry no authored exploits at all:** `ai-client`, `gb-block-hooks`, `gb-font-library`, `gb-templates-navigation`, `post-meta`, `scripts-styles`, `shortcodes`. `ai-client` (10 tests) and `post-meta` (6) are the ones this repo is best placed to attack, via `wp-ai-client` and `wp-plugin-development`.
   - **Partial coverage in high-traffic categories:** `queries` 7 of 19 tests, `roles-caps` 2 of 10, `rest-api` 12 of 24, `abilities-api` 2 of 13. These map onto `wp-rest-api`, `wp-abilities-api`, and the security guidance the skills carry, and they are where a flat A/B delta is most likely to mean "the assertions cannot see it."

   Where a near-miss passes an existing test, tighten the assertion in the same PR; that is the deliverable, not a side effect.
2. **Propose the named-exploit shape.** Unchanged and still open: `exploit_solutions` is `list[str] | None` (`datasets.py:38`), and `exploit_candidates()` labels entries `authored-{index}` by enumeration (`exploits.py:77`). With 378 authored strings, an audit report saying `authored-2` is now substantially less useful than it was at 21. Propose objects with a `name`, accepting both shapes during migration.

```json
"exploit_solutions": [
  { "name": "nonce-without-capability", "code": "..." },
  { "name": "sanitized-but-unescaped-output", "code": "..." }
]
```

Local layout:

```
docs/wp-bench-integration.md
eval/wp-bench/near-misses/        # per skill, per behavior; source of record
eval/wp-bench/audit-report.md     # which tests each near-miss survives
eval/wp-bench/lift/               # A/B runs: config, seed, prompt hash, deltas
```

### Phase 3 — artifact kinds, and external-completion grading

Both still genuinely open upstream:

- **Artifact kinds: six declared, two implemented.** `config.py:14` declares `php_snippet`, `wp_plugin_files`, `block_plugin`, `wp_theme_files`, `js_module`, `patch`; `artifacts.py::parse_artifact` handles the first two and raises `ArtifactError` for the rest. Unchanged across both revisions. The exploit-coverage argument still gates expansion: `generic_exploit_candidates()` returns `[]` for anything that is not `php_snippet`, so every artifact kind added to the parser expands unaudited surface unless authored exploits ship with it.

  #64 added the first five `wp_plugin_files` tests (`e-gb-block-api-007` and `-008`, `e-block-patterns-styles-001`, `e-plugin-lifecycle-001` and `-002`), and the rest of upstream's new block and theme coverage still arrives *as* `php_snippet`. That weakens the case for `block_plugin`: a real plugin tree on disk is already reachable through `wp_plugin_files`. The narrow remaining question is whether theme tests justify implementing `wp_theme_files`. Maps onto open issues [#6](https://github.com/WordPress/wp-bench/issues/6), [#7](https://github.com/WordPress/wp-bench/issues/7), [#8](https://github.com/WordPress/wp-bench/issues/8), [#10](https://github.com/WordPress/wp-bench/issues/10).

- **No public path for grading external completions.** `cli.py` still defines exactly one command, `run`. A `wp-bench grade --completions <jsonl>` remains unbuilt, and separating artifact generation from artifact grading is still the correct architecture. Note that `--skill` covers the *raw / direct* axis of the four-profile proposal in-process; `routed` and `decoy` would still need either external grading or their own variant kinds. `Variant.kind` is explicitly documented as the extension seam for that.

`config.py` sets `extra="forbid"` on every config model — "every field is either implemented or rejected loudly" — so an `evaluation.mode` block cannot be prototyped out of band. Raise it as an issue before writing code.

## Verified against trunk

Re-verified at `e19d3a8` (2026-09-20; counts recomputed and corrected 2026-09-27).

| Claim | Status |
| --- | --- |
| Six artifact kinds declared, two implemented | **Confirmed, unchanged** — `config.py:14`; `artifacts.py::parse_artifact` handles `php_snippet` and `wp_plugin_files` and raises for the rest |
| No public path for grading external completions | **Confirmed, unchanged** — `cli.py` still defines exactly one command, `run` |
| `reset_per_test` can silently fail | **Now false** — #52 made `WordPressEnvironment.reset()` raise when `grader.kind` has no reset implementation, and #53 made it refuse when no baseline was captured |
| Results record usage and reproducibility metadata | **Confirmed, with a gap** — `records.py` carries `usage`, `model_call`, `prompt_hash`; `core.py` records `runtime_isolation` at 473, 648, 1003 (was 401, 596, 901). Multi-model payloads, which every `--skill` run produces, drop the per-model `usage` summary (open PR #51) |
| Fixtures run as an administrator | **False** — the verifier runs `wp eval-file` with no `--user` (`environment.py:242-246`), so code executes as user 0; 19 of 350 tests switch users |
| `security` and `roles-caps` have no authored exploits | **Now false** — 7 and 2 tests carry authored exploits (14 and 4 exploit strings) |
| Authored exploits supported end to end | **Yes** — `ExecutionTest.exploit_solutions`, local JSON loader, `--check-exploits` |
| `exploit_solutions` uses opaque `authored-N` labels | **Confirmed, still open** — `list[str]` at `datasets.py:38`, `enumerate` at `exploits.py:77` |
| Upstream authoring skill teaches the adversarial half | **Now yes** — 207 lines; "exploit" on 11 lines (15 occurrences), 7 of `--check-exploits` |
| Hugging Face export needs an `exploit_solutions` column | **No, deliberately** — excluded as maintainer-side QA, `export_dataset.py:49` |
| `difficulty` is an author-estimated label with no scoring role | **Removed entirely** — 0 of 350 tests carry it; `result_schema_version` 2.2 |
| Config key is `run.execution_isolation`, metadata says `runtime_isolation` | **Confirmed, unchanged** |

## Skill↔suite alignment (2026-09-27)

The suite executes its reference solutions against WordPress 7.1, which makes it an independent oracle for the skills. All 13 `abilities-api` and 10 `ai-client` tests were read against `skills/wp-abilities-api` and `skills/wp-ai-client`.

- **No reference solution contradicts either skill.** Hook order, `ability_invalid_input`, `ability_invalid_permissions`, `ability_callback_exception`, root-only `default`, `wp_unregister_ability()`, `wp_register_ability_args`, 7.1 `public` → `show_in_rest`, `wp_supports_ai()` / `prompt_prevented` / 503, the timeout filter, the resolver's name helpers, and `prompt_builder_error` all match.
- **Four gaps the tests exposed were fixed in the skills** in the same pass: `wp_get_ability()` on an unknown name fires a `_doing_it_wrong()` notice (the reference for `e-abilities-api-012` probes with `wp_has_ability()` first, and the notice crashes the test under wp-env); `execute_ability()` always returns a `FunctionResponse` whose `code` carries the failure (`e-ai-client-010`); the builder's sticky error and prevention states (`e-ai-client-011`, `-015`); and `wp_connectors_init` registering new, non-AI connectors (`e-connectors-api-003`, `-004`).
- **Test weaknesses, recorded here rather than upstreamed:** `e-ai-client-004` can be passed by reimplementing the `wpab__` name encoding without the resolver (required static patterns are diagnostic only, and `ai-client` has no authored exploits); `e-abilities-api-004`'s static `show_in_rest` pattern docks the diagnostic score of code following the skill's 7.1 `public => true` advice, although the runtime check still passes; no test covers a `permission_callback` that returns `WP_Error`.
- **Skill-taught behavior with no suite coverage** — the natural Phase 2 targets: the seven 7.1 lifecycle hooks and the trailing `$ability` argument on `wp_before/after_execute_ability`; `meta.public` on plugin abilities, `show_in_rest: false` overriding it, and `meta.mcp.public`; annotations driving the `/run` HTTP method (405); `wp_get_abilities()` `$args`; name and category-slug rejection; `ability_class`; `ability_invalid_output`; `ability_missing_input_schema`; every `/wp-abilities/v1` route; `using_abilities()` with `has_ability_calls()` / `execute_abilities()`; `TypeError` escaping the wrapper; `wp_ai_client_cache_group`.

## Sources

- [WordPress/wp-bench](https://github.com/WordPress/wp-bench) @ `e19d3a8` — `python/wp_bench/{config,artifacts,exploits,datasets,environment,records,core,cli,scoring,skills}.py`, `datasets/suites/wp-core-v1/execution/`, `datasets/export_dataset.py`, `.agents/skills/wp-bench-execution-tests/SKILL.md`, `AGENTS.md`
- Upstream PRs since `bf059e2`: [#50](https://github.com/WordPress/wp-bench/pull/50) (skill-injection A/B), [#52](https://github.com/WordPress/wp-bench/pull/52) (isolation honesty, fixes [#39](https://github.com/WordPress/wp-bench/issues/39)), [#49](https://github.com/WordPress/wp-bench/pull/49) (stream results), [#53](https://github.com/WordPress/wp-bench/pull/53) (captured baseline restore), [#63](https://github.com/WordPress/wp-bench/pull/63) (WP 7.1, drop `difficulty`, skill refresh), [#64](https://github.com/WordPress/wp-bench/pull/64) (165 harder tests)
- [Introducing WP-Bench: A WordPress AI Benchmark](https://make.wordpress.org/ai/2026/01/14/introducing-wp-bench-a-wordpress-ai-benchmark/)
