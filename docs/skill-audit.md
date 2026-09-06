# Skill audit — agent-skills vs. agentskills.io guidance

Originally audited 2026-07-03 against the Agent Skills specification and the skill-creation guides
(best practices, optimizing descriptions, using scripts, evaluating skills).

**Re-verified against the working tree on 2026-09-06.** Four of the seven original findings are
closed and one is partly closed; the scorecard and finding bodies below carry current status, not
the July snapshot. Where a finding is closed, the original text is kept so the fix is legible.

## Scorecard

| Area | Status (2026-07-03) | Status (2026-09-06) |
|---|---|---|
| Spec compliance (frontmatter, naming, size budgets) | Pass, one gap (license) | **Pass** |
| Description triggering | Strong, one weak skill (wpds) | Strong, wpds still weak |
| Progressive disclosure | Exemplary | Exemplary |
| Instruction patterns (checklists, validation loops, gotchas) | Strong, two skills missing Verification | **Strong; fixed** |
| Script portability | **Fails when skills are installed standalone** | **Fixed** |
| Script agent-interface design | Partial (4 of 8 scripts lack `--help`) | **Pass (8 of 8)** |
| Output-quality evals | Not implemented (specs exist, no loop) | Not implemented |
| Trigger evals | Not implemented | **Partial (3 of 21 skills)** |

## What's already strong

All 21 skills are within budget (largest: `wp-patterns` at 309 lines; recommendation is 500 lines /
5k tokens). Frontmatter is spec-valid throughout: names match directories, descriptions are under
1024 characters, compatibility lines under 500.

> July snapshot said "All 20 skills … largest: blueprint at 418 lines." Both numbers have moved:
> the tree now holds 21 skills and `blueprint` is 70 lines.

Descriptions follow the guidance well — imperative "Use when...", keyword-dense, intent-focused. The
AI-stack trio (wp-ai-client / wp-ai-connectors / wp-ai-plugin) explicitly disambiguates siblings
("Use this — not `wp-ai-client` — when..."), which is exactly the near-miss boundary-drawing the
optimization guide asks for.

Progressive disclosure is done right. References are loaded conditionally with stated triggers
("read `references/grouping-heuristic.md` first — it keeps you from shipping one atomic ability per
REST operation"), not generic "see references/". wp-abilities-api is the best example (11
references, each with a when-to-load rule).

The house template (When to use / Inputs required / Procedure / Verification / Failure modes /
Escalation) already implements the recommended patterns: checklists, validation loops, and gotchas
(as "Failure modes / debugging"). The shared triage script is the "bundle repeated work" pattern
applied correctly.

## Findings, by impact

### 1. Cross-skill script paths break standalone installs (high) — **closed**

*Original:* The spec requires paths relative to the skill root. Nine skills instead used repo-root
paths (`node skills/wp-project-triage/scripts/detect_wp_project.mjs`), so a user who runs
`npx skills add ... --skill wp-rest-api` would not get wp-project-triage and step 1 of the procedure
would fail. Self-references had the same problem.

*Now:* Resolved via fix option 2 (source-level, graceful degradation). Eight of the nine dependent
skills use the sibling path with an explicit fallback:

```
`node ../wp-project-triage/scripts/detect_wp_project.mjs` when the `wp-project-triage` skill is
installed alongside; otherwise classify the project manually.
```

`eval/harness/run.mjs::validatePortableTriageCommand()` gates the regression by rejecting the
bare-local `scripts/detect_wp_project.mjs` form in any skill other than wp-project-triage itself.

`wp-ai-plugin` now uses the sibling path with the manual-classification fallback. The harness rejects
both non-portable forms: a bare local `scripts/detect_wp_project.mjs` path outside the triage skill
and a repository-root `skills/wp-project-triage/scripts/detect_wp_project.mjs` path.

### 2. No eval loop (high, but effort-gated) — **open**

`eval/scenarios/*.json` are good expectation specs (query, expected_behavior, success_criteria), but
the harness still only does static validation — `run.mjs`, `skill-quality.mjs`, and
`release-conformance.mjs` assert on frontmatter, bounds, and conformance. Nothing executes agent
runs, grades assertions, or compares with-skill vs. without-skill baselines. Per the evaluation
guide, the missing pieces are: per-skill assertions, with/without baseline runs, grading with
evidence, and a benchmark delta.

Start small: pilot the loop on 2–3 skills where the payoff is clearest (wp-rest-api,
wp-block-development, wp-abilities-api). The existing scenario files convert almost directly —
`success_criteria` are already assertion-shaped.

### 3. Trigger evals don't exist (medium) — **partly closed**

*Now:* `eval/descriptions/` exists with fixed train / validation / holdout query splits for three
skills — `wp-abilities-audit`, `wp-abilities-verify`, and `wp-playground` — which is exactly the
methodology the original finding asked for.

**Still open:** 18 of 21 skills have no corpus, including the high-traffic ones and the sibling
boundaries that motivated the finding (a block-themes question that shouldn't trigger
wp-block-development; a REST question that shouldn't trigger wp-abilities-api). Extend the existing
`eval/descriptions/` pattern rather than inventing a second one.

### 4. wpds description is under-specified (medium) — **open, unchanged**

Still 110 characters ending in "etc." — the weakest description in the repo and the most likely to
miss triggers:

> Use when building UIs leveraging the WordPress Design System (WPDS) and its components, tokens, patterns, etc.

Expand with concrete intents and keywords (component names, `@wordpress/components`, design tokens,
admin UI screens, Storybook) and state the MCP-server dependency in the description, not just
compatibility.

### 5. No `license` field on any skill (low) — **closed**

All 21 skills now carry `license: GPL-2.0-or-later` in frontmatter. No skill is missing it.

### 6. Script interface gaps (low) — **closed**

All 8 scripts now handle `--help`: `detect_ai_client`, `list_blocks`, `detect_block_themes`,
`perf_inspect`, `phpstan_inspect`, `detect_plugins`, `detect_wp_project`, `wpcli_inspect`. The
original gap (`list_blocks`, `detect_block_themes`, `detect_plugins`, `wpcli_inspect`) is resolved.

### 7. Two skills missing Verification sections (low) — **closed**

`wpds` and `blueprint` now have `## Verification` sections. The Blueprint loop validates against the
current schema, runs the result on its target surface, checks the resulting environment, and opens
share URLs in a fresh session.

## Suggested order

1. wpds description rewrite (finding 4)
2. Extend `eval/descriptions/` corpora beyond the current three skills (finding 3)
3. Pilot output-quality evals on 2–3 skills (finding 2)
