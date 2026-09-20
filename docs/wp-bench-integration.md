# WP-Bench integration

Status: **mostly overtaken by upstream.** Two of the three things this document argued for have shipped; what remains is narrower and more concrete than the original plan.

Verified against `WordPress/wp-bench@e19d3a8` (trunk, 2026-09-20). Previously verified at `bf059e2` (2026-08-06) and `d20c0e7` (2026-07-20).

## What upstream changed between `bf059e2` and `e19d3a8`

Six commits landed, and they close most of this document's open ground.

- **[#52] Issue #39 is fixed.** `Environment.reset()` now raises when `grader.kind` has no reset implementation instead of silently skipping and stamping `runtime_isolation: reset_per_test` anyway. It also refuses when no clean baseline was captured. **The argument that assisted-vs-raw numbers must wait for #39 no longer applies.**
- **[#53] Reset restores a captured baseline** (`wp db reset && wp db import`, chained so a failed drop cannot import over surviving state) instead of reinstalling WordPress. Isolation is now both honest and affordable.
- **[#49] Results stream to disk** as tests complete, so a crash mid-run no longer discards everything graded so far.
- **[#50] Skill-injection A/B runs shipped.** `--skill` takes one or more skill directories or bare `.md` files; every model runs a `baseline` variant and a `skills` variant over the identical seeded subset, and the comparison table shows the delta. **This is the bridge this document was arguing toward, built upstream.**
- **[#63] Targets WordPress 7.1, drops `difficulty`.** The field is gone from the model, both loaders, the Parquet export, result records (`result_schema_version` 2.1 → 2.2), and limited-run selection, which now stratifies by category only. The upstream authoring skill was refreshed in the same PR.
- **[#64] 165 harder execution tests** across 9 new and 20 existing categories.

Net effect on the suite:

| | `bf059e2` | `e19d3a8` |
| --- | --- | --- |
| Categories | 29 | **39** |
| Tests | 185 | **350** |
| Tests with `exploit_solutions` | 17 | **182** |
| Authored exploit strings | 21 | **378** |
| `security` / `roles-caps` authored exploits | 0 / 0 | **7 / 2** |
| Scoring version | 2.0 | **3.0** |
| Suite `wp_version` | 7.0 | **7.1** |
| Upstream authoring skill | 143 lines, zero mentions of "exploit" | **207 lines, 11 mentions, 7 of `--check-exploits`** |

Two open questions from the previous revision are answered:

- **Which WordPress version does the grader build?** 7.1. `AGENTS.md` now says "WordPress 7.1 plugin", `runtime/.wp-env.json` and `runtime/Dockerfile` target 7.1, and every suite file declares `wp_version: 7.1`.
- **Does the Hugging Face export need an `exploit_solutions` column?** No, and deliberately: `datasets/export_dataset.py` excludes it as "maintainer-side assertion QA (`--check-exploits`), not benchmark content for dataset consumers." The "are authored near-misses acceptable as public data" question is settled the same way — they live in the local suite, not the published dataset.

One incidental finding worth carrying: **WordPress 7.1 marks every core ability `public` (r62737).** `e-abilities-api-012` previously used `core/get-user-info` as its not-REST-exposed fixture and broke, so it now registers its own `wpbp/hidden-probe` ability instead. The same core change is why `skills/wp-abilities-api` needed re-syncing — see that skill's `references/mcp-exposure.md`.

## Position

Unchanged: `agent-skills` should be a controlled input to WP-Bench and a source of harder cases, not a parallel benchmark. What has changed is the sequencing answer.

The original question was **which coordinated specification comes first, external-completion grading or skill-derived near-miss cases.** The answer was "near-miss cases first, because grading calibration is a prerequisite for the measurement the grading path exists to produce."

**That argument has largely been satisfied by upstream rather than by us.** It rested on two premises, and both have moved:

1. *The categories the skills most affect have no authored exploits.* `security` now has 7 and `roles-caps` has 2, inside a suite that went from 17 to 182 exploit-carrying tests.
2. *Isolation can silently fail, so cross-run comparisons are untrustworthy.* Fixed in #52.

The calibration argument still holds in principle — an assertion written to prove a feature works will still usually pass when the capability check is missing, because the fixture runs as an administrator, and that blindness correlates with exactly what the skills teach. But it is no longer a *blocker*. It is now a reason to read a lift number carefully, not a reason to refuse to produce one.

## Revised plan

### Phase 1 — run the A/B that already exists (no new upstream code)

`--skill` is implemented. Nothing needs to land upstream before we can measure.

```bash
wp-bench run --skill ../agent-skills/skills/wp-rest-api \
             --skill ../agent-skills/skills/wp-abilities-api \
             --limit 60 --seed 1
```

Mechanics worth knowing before reading any output:

- Every model runs both variants over the **identical** seeded subset. The variant keys are `baseline` and `skills`; the with-skills pass suffixes the model name with `+skills`.
- `--skills-include-references` is **on by default**, and must stay on for a fair test. The harness is single-shot, so the model cannot follow a `SKILL.md` file pointer on its own; with references off you are measuring a truncated skill. It exists as a diagnostic, not a normal mode.
- `--skills-only` skips the baseline. Also diagnostic — the in-run A/B is what makes the numbers comparable.
- Provenance is recorded per record (`variant.key`, `kind`, `system_prompt_hash`) and per payload (skill names plus the system-prompt SHA-256). Cite the hash when reporting a delta; a skill edit silently changes what was measured.
- Run under `run.execution_isolation: reset_per_test` with a `wp_env_dir` or `docker` grader. `cli` graders now raise rather than pretending, which is what makes the comparison meaningful.

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

  Upstream keeps adding block and theme coverage *as* `php_snippet` rather than touching the parser, so the contribution here is the narrow question of whether tests that need a real plugin or theme tree on disk justify implementing `block_plugin` and `wp_theme_files`. Maps onto open issues [#6](https://github.com/WordPress/wp-bench/issues/6), [#7](https://github.com/WordPress/wp-bench/issues/7), [#8](https://github.com/WordPress/wp-bench/issues/8), [#10](https://github.com/WordPress/wp-bench/issues/10).

- **No public path for grading external completions.** `cli.py` still defines exactly one command, `run`. A `wp-bench grade --completions <jsonl>` remains unbuilt, and separating artifact generation from artifact grading is still the correct architecture. Note that `--skill` covers the *raw / direct* axis of the four-profile proposal in-process; `routed` and `decoy` would still need either external grading or their own variant kinds. `Variant.kind` is explicitly documented as the extension seam for that.

`config.py` sets `extra="forbid"` on every config model — "every field is either implemented or rejected loudly" — so an `evaluation.mode` block cannot be prototyped out of band. Raise it as an issue before writing code.

## Verified against trunk

Re-verified at `e19d3a8` (2026-09-20).

| Claim | Status |
| --- | --- |
| Six artifact kinds declared, two implemented | **Confirmed, unchanged** — `config.py:14`; `artifacts.py::parse_artifact` handles `php_snippet` and `wp_plugin_files` and raises for the rest |
| No public path for grading external completions | **Confirmed, unchanged** — `cli.py` still defines exactly one command, `run` |
| `reset_per_test` can silently fail | **Now false** — fixed in #52. `Environment.reset()` raises when `grader.kind` has no reset implementation, and again when no baseline was captured |
| Results record usage and reproducibility metadata | **Confirmed** — `records.py` carries `usage`, `model_call`, `prompt_hash`; `core.py` records `runtime_isolation` at 473, 648, 1003 (was 401, 596, 901) |
| `security` and `roles-caps` have no authored exploits | **Now false** — 7 and 2 respectively |
| Authored exploits supported end to end | **Yes** — `ExecutionTest.exploit_solutions`, local JSON loader, `--check-exploits` |
| `exploit_solutions` uses opaque `authored-N` labels | **Confirmed, still open** — `list[str]` at `datasets.py:38`, `enumerate` at `exploits.py:77` |
| Upstream authoring skill teaches the adversarial half | **Now yes** — 207 lines, 11 mentions of "exploit", 7 of `--check-exploits` |
| Hugging Face export needs an `exploit_solutions` column | **No, deliberately** — excluded as maintainer-side QA, `export_dataset.py:49` |
| `difficulty` is an author-estimated label with no scoring role | **Removed entirely** — 0 of 350 tests carry it; `result_schema_version` 2.2 |
| Config key is `run.execution_isolation`, metadata says `runtime_isolation` | **Confirmed, unchanged** |

## Sources

- [WordPress/wp-bench](https://github.com/WordPress/wp-bench) @ `e19d3a8` — `python/wp_bench/{config,artifacts,exploits,datasets,environment,records,core,cli,scoring,skills}.py`, `datasets/suites/wp-core-v1/execution/`, `datasets/export_dataset.py`, `.agents/skills/wp-bench-execution-tests/SKILL.md`, `AGENTS.md`
- Upstream PRs since `bf059e2`: [#50](https://github.com/WordPress/wp-bench/pull/50) (skill-injection A/B), [#52](https://github.com/WordPress/wp-bench/pull/52) (isolation honesty, fixes [#39](https://github.com/WordPress/wp-bench/issues/39)), [#49](https://github.com/WordPress/wp-bench/pull/49) (stream results), [#53](https://github.com/WordPress/wp-bench/pull/53) (captured baseline restore), [#63](https://github.com/WordPress/wp-bench/pull/63) (WP 7.1, drop `difficulty`, skill refresh), [#64](https://github.com/WordPress/wp-bench/pull/64) (165 harder tests)
- [Introducing WP-Bench: A WordPress AI Benchmark](https://make.wordpress.org/ai/2026/01/14/introducing-wp-bench-a-wordpress-ai-benchmark/)
