# Independent review and fix pass

The fresh reviewer inspected base `fe2e33c8bff665349f2a3a30c0d565bb912087d5` through candidate `a52712c4b38898715aadd963cfd54cbff18939bb`, independently ran the full harness, and inspected exact tagged source. Its verdict was **with fixes**: no Critical findings, three Important findings, and one Minor finding.

| Finding | Final disposition and verification |
| --- | --- |
| Important: unconditional permission guarantees remained in three supporting references. | Corrected all three. The new guidance guard failed on the original wording and passes after correction; seven unmodified-Core execution cases remain green. |
| Important: a real upstream index change failed maintenance validation even with drift suppression. | Added explicit `--index-preview`, preserving strict default equality and recorded-state integrity. Both maintenance workflows use it together with the existing narrow drift flag. Seven state-preview cases pass after three initially failed. Five complete CLI cases in an isolated Git checkout confirm strict rejection, preview success, unchanged baseline bytes, and corrupt-state rejection. |
| Important: current Guidelines instructions still used legacy storage/availability/query rules. | Corrected the service example, method table, query guidance, and length limit; kept named 1.3.0 legacy guidance. Three negative guidance assertions failed before correction and pass now. Tagged AI 1.4.0 source supplies the contract. |
| Minor: Abilities entrypoint called AI 1.4.0 unreleased and omitted the third renamed ID. | Included in the authorized A01 release correction. The stale-release guard failed first and now passes; all three current IDs are documented. |

The independent skill exercise also identified an ambiguous block-theme indicator. The entrypoint now explicitly says that the readable index determines classification and `theme.json` is optional; the existing executable index-only fixture continues to pass.

After the single fix pass, the full harness passes under Node 24 and Node 20 with required PHP. There was no second reviewer pass; the review findings are closed by their covering regressions and complete validation, rather than a claim of a subsequent independent verdict.

## Behaviors the reviewer declined to judge

- Hosted Actions recovery: the account billing lock must be resolved and a hosted run must succeed.
- Live WordPress, REST/MCP, provider, and WPDS integration: local source and minimal fixtures do not establish live behavior.
- Runtime theme-path filters and parents outside the scan: these remain explicit filesystem detection limits.
- Installed OpenAI package regeneration: the five local skillpack checks do not establish that separate distribution's publication.

These are evidence boundaries, not deferred repository fixes. No Minor finding was left unfixed.
