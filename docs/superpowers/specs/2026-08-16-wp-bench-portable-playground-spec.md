# WP-Bench Portable Playground Execution Design

**Status:** Revision 3, 2026-08-16. Single-file specification. Supersedes and replaces the
design/review/audit trio: design revisions 1 and 2, the revision-1 review, and the revision-2 closure
audit. Their findings are applied in the body; their empirical evidence is Appendix A–D; their
finding-to-section history is section 23.

**Target repositories:** `WordPress/wp-bench` and the WP-Bench guidance in `agent-skills`

**How to read this document.** Sections 1–22 are the specification. Sections marked **provisional**
depend on a spike that has not yet run and must not be treated as approved targets. Appendices A–D
are measurements taken on a single review host and inherit its configuration; they constrain the
design but are not portable targets. Appendix E lists claims already investigated and refuted — do
not re-litigate them. Section 23 records what changed across three revisions and, in 23.2, the seven
judgment calls made while merging, each of which is reversible.

## 1. Summary

WP-Bench will add a direct WordPress Playground execution profile optimized for fast startup, low
infrastructure cost, and broad local accessibility. The existing Docker/wp-env/MySQL execution path
remains the canonical benchmark profile until the portable profile demonstrates full parity.

The design separates model generation from grading, caches completions, restores a clean Playground
instance from a read-only baseline into private storage for every test, and grades concurrently
through a bounded pool of single-instance OS workers. Both runtime profiles emit the same additive
telemetry contract. A self-contained HTML report makes results accessible without replacing the raw
JSONL record.

The public entry point is `wp-bench quick`. It runs a curated, parity-qualified subset on the
portable profile and clearly labels its runtime and coverage. Full portable and canonical runs remain
explicit.

## 2. Goals

- Reduce time to the first useful graded result.
- Increase full-suite grading throughput.
- Remove Docker as a requirement for the public quickstart.
- Reduce repeated model and infrastructure cost.
- Preserve all existing telemetry fields and add enough detail to explain time, cost, retries,
  failures, runtime identity, and parity.
- Keep every selected test visible, including unsupported, errored, and cancelled tests.
- Produce results that can be understood and shared through a self-contained static report.
- Preserve Docker/wp-env/MySQL as the canonical result until Playground parity is demonstrated.
- Keep runtime integrations behind a shared adapter boundary so additional runtimes do not fork
  benchmark semantics.

## 3. Non-goals

- Replacing Docker/MySQL immediately.
- Claiming SQLite and MySQL are behaviorally identical.
- Translating MySQL-specific test SQL silently **in the adapter**. Rewriting performed by the
  database drop-in below the adapter boundary is outside this design's control and is documented in
  section 12 rather than denied.
- Reusing a mutated WordPress instance across tests.
- Making HTML the authoritative result format.
- Hiding unsupported tests to improve a displayed score or coverage number.
- Repeating model requests solely to grade a completion on another runtime.
- Depending on the experimental `wp-env --runtime=playground` path as the primary adapter.

## 4. Current constraints

The current WP-Bench environment abstraction supports two grader kinds, `docker` and `cli`, with
`docker` as the default and `http` explicitly rejected as unimplemented. In practice a third
selection dominates: when `grader.wp_env_dir` is set it takes precedence over `kind` on every code
path, and it is the mode the README and the example configuration both use. The wp-env path invokes
WP-CLI through `wp-env run cli`. Reset uses `wp db reset --yes` followed by WordPress installation.
The verifier is invoked through `wp eval-file`, reads JSON from `php://stdin`, and depends on the
`WP_CLI` execution context.

That contract does not transfer directly to Playground:

- The wp-env Playground runtime uses SQLite rather than MySQL.
- The documented wp-env Playground runtime does not support `wp-env run`.
- Playground's `resetData` operation removes common content but is not a complete database and
  filesystem reset suitable for hostile benchmark submissions.
- A new transport must preserve verifier behavior without making WP-CLI the bridge for every test.

### 4.1 Where the database divergence actually is

An earlier revision named MySQL-oriented statements — `SHOW TABLES`, `SHOW COLUMNS`, `SHOW INDEX` —
as the divergence source. That premise is superseded and is corrected here, because designing against
the wrong divergence would have produced a capability model that never fires.

Those statements now execute correctly under the bundled SQLite integration, which ships a
MySQL-on-SQLite driver with information-schema emulation (Appendix A.7). They also appear in exactly
one test of the corpus (Appendix C.2). Two consequences follow: the divergence is smaller than stated
in that direction, and it is contingent on a runtime flag rather than on the integration's version
number, so the flag belongs in the baseline identity of section 7.3.

The real database-layer blockers are elsewhere:

- **MySQL DDL in fixture setup.** Every test in the `database` category creates tables with
  MySQL-specific column and index syntax and a generated charset-collation clause, and fails its own
  setup if that query returns false (Appendix C.4). This is fixture code, not candidate code, so it
  is not something a candidate can be graded around.
- **Collation capability.** The SQLite layer reports no collation support, which causes WordPress's
  database layer to skip its invalid and oversized text stripping (Appendix C.11). Writes that MySQL
  rejects succeed silently on the portable profile — a difference that produces divergent results
  without raising an error anywhere.
- **Silent rewriting below the adapter.** See section 12 and Appendix C.12.

A larger cross-cutting amplifier sits in the harness rather than the corpus: the verifier sandbox
converts every PHP warning, notice, deprecation, and user-level diagnostic into a thrown error with
no severity mask (Appendix C.7). Any runtime-specific diagnostic therefore turns a passing test into
a zero, on every test in the suite. This is why section 7.1's environment-parity requirements are
load-bearing rather than tidiness.

### 4.2 Verified Playground runtime constraints

These were established empirically (Appendix A) and constrain the design rather than merely informing
it:

- **There is no snapshot save/restore API.** No Node Playground package exposes a `serialize`,
  `save`, or `restore` symbol. The CLI verbs are exactly `start`, `server`, `run-blueprint`,
  `build-snapshot`, and `php`.
- **`build-snapshot` output is not self-contained.** It archives `/wordpress` only, while
  Playground's SQLite driver and platform mu-plugins live under `/internal/shared`. Restoring the
  archive alone yields a WordPress database error. Any baseline definition must cover both trees.
- **Restoring without reinstalling WordPress is achievable** through `bootWordPressAndRequestHandler`
  with `wordpressInstallMode: 'do-not-attempt-installing'` and an explicitly supplied SQLite
  integration. The goal of section 7 is reachable; the mechanism has to be built.
- **In-process instances do not run in parallel.** PHP-WASM is synchronous on the JS thread.
  Measured, four co-located instances were slower than the same work run sequentially.
- **`loadNodeRuntime` requires an explicit `processId`** once more than one instance exists, or it
  fails at init.
- **Instance memory is not promptly reclaimed on disposal**, so a long-lived supervisor must recycle
  slots on a bounded schedule.
- **The `@php-wasm` logger writes `info` and `log` severity to stdout.** A protocol-only stdout
  channel must redirect or replace it.
- **Playground has no PHP-level execution timeout.** `set_time_limit()` is stripped from its
  WordPress build and `max_execution_time` is `0`.
- **Outbound networking is enabled by default** by an unconditional `withNetworking` call, and each
  instance opens its own listening localhost proxy port.

As of the 2026-08-16 research snapshot, the local guidance and package pins also trail upstream
releases. Version values must be refreshed from official upstream sources immediately before
implementation and at each compatibility update.

## 5. Decision

Add two explicit execution profiles behind one Python coordinator:

| Profile | Runtime | Database | Role |
| --- | --- | --- | --- |
| `portable` | Direct WordPress Playground Node API | SQLite | Fast, low-cost, broadly accessible execution |
| `canonical` | Docker through wp-env | MySQL | Authoritative benchmark execution and parity reference |

`canonical` maps to the existing wp-env selection — `grader.wp_env_dir`, which takes precedence over
`kind` wherever both are set — and to bare `kind: docker`. The existing `kind: cli` maps to **neither
profile**. It has no reset implementation and now fails loudly rather than silently skipping
isolation, which also makes it ineligible as a parity reference.

`kind: cli` is rejected, at configuration load time and with a message naming the two supported
profiles, on every path that requires a resolved profile: an explicit `--profile`, `quick`,
`compare-runtimes`, and any command that emits the profile badge required by section 14. It is not
silently substituted. Paths that do not require a resolved profile retain their current behavior, so
this is not a backward-compatibility break for existing `kind: cli` users. Section 13.2 defers to
this rule rather than restating it.

The portable profile uses a long-lived Node supervisor and a bounded pool of Playground worker slots.

A **worker slot is an OS-level worker thread or child process hosting exactly one live Playground
instance at a time.** Slots are never co-located behind the supervisor's event loop, and a slot never
holds two live instances. This is a correctness requirement, not a tuning choice: PHP-WASM executes
synchronously on the JS thread, so co-located instances interleave rather than run in parallel
(Appendix A.3), and a candidate loop inside PHP-WASM is not preemptible from JavaScript. Only a
parent holding a thread or process handle can enforce the deadlines in section 11 without killing
unrelated in-flight work.

Each test receives a newly created instance restored from the immutable baseline into private
per-instance storage. The instance is destroyed after the terminal result is returned.

The Python coordinator remains responsible for suite selection, model requests, completion caching,
scheduling, retries, deterministic result ordering, telemetry persistence, parity classification, and
report generation.

## 6. Architecture

```text
CLI
 |
 v
Python coordinator -----------------------------------------+
 |                                                          |
 +-- suite selection                                        |
 +-- model generation and completion cache                  |
 +-- bounded scheduler                                      |
 +-- sole durable JSONL writer                              |
 +-- parity classifier                                      |
 +-- static report builder                                  |
 |                                                          |
 +-------------------------+--------------------------------+
                           |
             Runtime adapter contract
                 /                    \
                v                      v
     Portable Playground          Canonical wp-env
       Node supervisor              Docker/MySQL
       one instance per             WP-CLI verifier
         OS worker
       read-only baseline
       private per-instance
         restore
       SQLite/WASM
```

### 6.1 Python coordinator

The coordinator owns all cross-runtime behavior. Runtime adapters return structured observations;
they do not write benchmark output files directly.

Coordinator responsibilities:

- Resolve the requested profile and suite.
- Start runtime preparation as early as possible.
- Generate or load completions independently of grading.
- Schedule ready completions with bounded backpressure.
- Assign stable run, test, trace, attempt, and sequence identifiers.
- Append all durable events through one writer.
- Preserve suite ordering in materialized results even when execution completes out of order.
- Classify infrastructure failures separately from candidate outcomes.
- Resume safely from the journal and completion cache.
- Generate machine-readable artifacts and the static report.

### 6.2 Runtime adapter contract

Both adapters implement the same conceptual operations:

```text
prepare(run_context)                                 -> runtime_metadata
capabilities()                                       -> capability_report
health()                                             -> health_observation
execute(test_case, completion, attempt_context)      -> execution_observation
dispose()                                            -> teardown_observation
```

`capabilities()` reports what the runtime can do, as facts. It does not decide what that means for a
test. `health()` supports warm-up and slot replacement without inferring liveness from a failed
execution.

An execution observation must contain enough structured data for the coordinator to create the common
terminal record:

- Runtime and dependency versions.
- Test and attempt identifiers.
- Start and end timestamps.
- Component durations.
- Verifier result and assertions.
- Standard output and standard error.
- Exit status, fatal error, and timeout details.
- Resource observations when available.
- Infrastructure diagnostics.
- Observed capability facts, and the span in which any fault occurred.
- Result-channel integrity status.

The adapter boundary must not contain scoring policy. Shared verifier logic remains the single source
of truth for assertions and scoring.

That invariant extends to classification. The adapter reports capability **facts**; the coordinator
alone maps a declared requirement against those facts to `unsupported`. An adapter that returned a
terminal status would be deciding what a test is worth, which is the thing this boundary exists to
prevent — and it is what makes a third runtime addable without forking benchmark semantics.

### 6.3 Playground supervisor protocol

The Python process starts one Node supervisor for the run. Communication uses versioned
newline-delimited JSON over standard input and standard output.

Protocol requirements:

- Every request and response carries `protocol_version`, `run_id`, `test_id`, and `attempt_id`.
- Protocol output is the only content written to supervisor stdout.
- Node and PHP diagnostic logs are captured or sent to stderr so they cannot corrupt the protocol.
- Requests are acknowledged and finish with exactly one attempt response.
- The coordinator applies queue, preparation, execution, and total-attempt deadlines separately.
- Unknown protocol versions fail before tests are scheduled.
- Worker capacity is bounded and configurable.

#### Worker topology

The supervisor owns a pool of worker slots, each an OS worker thread or child process hosting exactly
one live Playground instance at a time, as defined in section 5. The following follow from that and
are requirements, not implementation latitude:

- Deadline enforcement, cancellation, and teardown are performed by the parent against the worker's
  thread or process handle. A worker that will not yield to a deadline is terminated by the parent,
  and only that worker's in-flight test is affected.
- Each instance is created with an explicit, unique `processId`. Duplicate or defaulted process
  identifiers break file locking across workers (Appendix A.6).
- Workers are recycled on a bounded schedule — a maximum number of tests served, or a
  resident-memory ceiling, whichever comes first — because instance memory is not promptly reclaimed
  on disposal (Appendix A.4). Recycling is normal operation and is not recorded as an infrastructure
  failure.
- The supervisor redirects or replaces the `@php-wasm` logger before any instance is created, because
  it writes `info` and `log` severity to stdout and would otherwise corrupt the protocol channel
  (Appendix A.14).

#### Bounded frames and streams

Every observation carries captured standard output and standard error, and nothing else in this
design bounds them. The portable runtime makes that worse than canonical: it has no PHP execution
timeout, and the SQLite layer prints raw markup into the output stream on database errors, which it
raises more often than MySQL would (Appendix C.14). A candidate looping on output until a deadline
would otherwise produce a frame large enough to exhaust the worker, be classified as an infrastructure
failure, be retried, and be recorded as `errored` — a candidate defect booked as an infrastructure
error, with an unbounded durable record attached.

The protocol therefore defines a maximum frame size and a per-stream capture cap, and records
`truncated_bytes` when either applies. Exceeding the output cap is an output-channel violation and is
attributed by section 11.1.

#### Liveness

The supervisor's lifecycle is defined rather than assumed, because each instance holds a listening
localhost port and hundreds of megabytes that outlive an unclean coordinator exit (Appendix A.11,
A.4):

- The supervisor exits when its standard input closes.
- Coordinator and supervisor exchange a heartbeat, with a timeout on both sides.
- At startup the supervisor detects and reaps orphaned predecessors **before** the pool is sized, so
  a resumed run does not size its pool against memory an orphan still holds.

The supervisor begins with one usable worker slot so the first test is not delayed by full-pool
preparation. Additional slots prewarm in the background. A slot creates a fresh Playground instance
from the baseline for each assigned test and destroys it, and its private storage, after the
response.

### 6.4 Transport-neutral verifier

The existing verifier must be refactored into a transport-neutral core plus thin entry points:

- The canonical entry point preserves current WP-CLI behavior and input compatibility.
- The portable entry point reads a request from a per-instance virtual filesystem file, calls the
  same verifier core, and emits the same structured result.

The Playground adapter writes the request into the instance, invokes the portable PHP entry point
with the direct Playground API, and captures the result. This avoids a per-test wp-env or WP-CLI
process and avoids relying on a Blueprint WP-CLI step that cannot provide the existing stdin
contract.

#### Result channel integrity

Candidate code executes in the same PHP process as the verifier, so the result channel is part of the
threat model rather than a transport detail. The following are requirements:

- The result is emitted **out of band**, through the host message channel that Playground exposes
  from PHP to the embedding JavaScript (Appendix A.8). It is not written to a file the candidate can
  reach and not recovered by parsing stdout.
- The request file is read and **unlinked before any candidate code executes**.
- Exactly one emission per attempt is accepted. A second emission, an emission after the result has
  been recorded, or any candidate write to a result path is an integrity violation. A violated
  attempt can never yield `passed`.
- Each attempt records an integrity field stating whether the channel was clean, so a forged pass is
  visible in telemetry rather than inferred from a parity divergence.

**Classification of an integrity violation follows section 11.1's attribution rule.** A violation
occurring at or after the point candidate code began executing is a candidate outcome: it is recorded
as `failed`, and it is **never retried**, because a retry hands the same completion a second attempt
at the same forgery. A violation occurring before any candidate code executed is an infrastructure
failure and is retried once on a fresh worker. In neither case can the attempt yield `passed`. This
is why section 11's infrastructure list scopes protocol corruption to corruption not attributable to
candidate action.

This rule applies to **both** entry points. The canonical path carries the same class of weakness
today — a candidate can emit a well-formed result and terminate before the verifier writes its own —
so this closes a pre-existing hole rather than hardening only the new transport. Without it, an
exploit completion that forges a pass on one profile is classified by section 12 as a runtime
divergence, attributing cheating to a database difference on exactly the population the exploit
corpus exists to measure.

Verifier refactoring must be behavior-preserving. Existing telemetry fields and scoring results
cannot change as a side effect of the transport split, and section 15.0 exists to make a violation of
that observable.

## 7. Isolation, baseline, and security

### 7.1 Immutable baseline

The portable baseline contains:

- The selected WordPress version.
- The selected PHP and Playground runtime versions.
- The selected SQLite integration, including the platform tree under `/internal/shared` that carries
  the database driver and Playground's mu-plugins. The baseline is not complete without it
  (Appendix A.2).
- The WP-Bench runtime plugin and transport entry point.
- Required site configuration and deterministic fixture state, reproducing the state `wp core install`
  produces on the canonical profile rather than approximating it. Roughly a dozen tests read that
  state directly — auto-increment starting values, maximum user identifiers, seeded option contents
  (Appendix C.18) — so approximation is not sufficient.
- No candidate-specific files or database mutations.

#### Environment parity

**Environment parity is a precondition, not an aspiration.** Two profiles are compared only under a
declared environment. Every dimension that can affect a result falls into exactly one of two sets,
and both are asserted before any parity run.

**Must match. A mismatch fails the run.** These are dimensions a baseline can be built to control:

- PHP minor version.
- Debug configuration, because the canonical profile enables it and that escalates deprecation and
  misuse notices into thrown errors under the sandbox described in section 4.1 (Appendix C.8).
- Permalink structure. The portable runtime sets it at boot and the canonical reset leaves it plain
  (Appendix C.10), so the portable baseline is constructed to restore the canonical value.
- Deadline clock basis, per section 11.2. A candidate deadline enforced in CPU time on one profile
  and wall time on the other is a divergence source with no declared cause.

**Declared deltas. Recorded on the run, reproduced in the report, and asserted to equal their
declared value.** These are properties of the portable runtime that no baseline construction can
remove:

| Declared delta | Why it cannot be reconciled | What it is expected to perturb |
| --- | --- | --- |
| WordPress build identity | The canonical profile builds a release tag; the portable runtime ships a source-modified, minified build resolving to a different point release, with functions such as `set_time_limit()` removed (Appendix C.5) | Execution deadlines (section 11.2), any test reading core file contents or version constants |
| Platform must-use plugin set | Playground installs `0-playground.php` unconditionally at boot; it overrides redirect-host allowances and URL-rewrite capability on every request (Appendix C.9) | Redirect and rewrite behavior; `mail-url` and `rewrite-permalinks` categories |
| Network access policy | Portable defaults to networking off per section 7.5; canonical wp-env has it on | Nothing in the current corpus, which makes zero outbound calls (Appendix C.13). Recorded because a future test could |

**A mismatch on a must-match dimension fails the run. A declared delta whose observed value differs
from its declaration fails the run. A difference on any dimension in neither list fails the run.**
The declared-delta list is closed: adding to it is a design change, reviewed at the promotion review
in section 17, not a run-time accommodation.

These deltas are never recorded as a set of unsupported tests, because they produce differing results
without erroring, so they would never be detected by a capability probe and would instead surface as
uncaused divergences.

After bootstrapping and a health check, the supervisor materializes the baseline once per run and
holds it read-only for the life of the run. Test instances are created from it rather than repeating
WordPress installation.

### 7.2 Restore mechanism

Playground exposes no snapshot save or restore API (Appendix A.2), so this is a mechanism the harness
builds, not a format it selects. The choice determines whether the immutability claim in section 21
is true or merely reported as true, so it is stated here rather than deferred to section 20.

**Decision: each instance receives private, writable storage restored from the read-only baseline.
Private in-memory storage is the correctness baseline for the first implementation.**

| Mechanism | Status | Measured cost and consequence |
| --- | --- | --- |
| **Private per-instance storage restored from the read-only baseline** | **Accepted** | ≈4.1 s restore, ≈218 MB per instance (Appendix A.2, A.4). Misses section 8.3's preparation target by roughly 2× and sets the memory floor for section 8.2's sizing. Accepted because it is the only constructible mechanism that makes contamination *impossible* rather than *detectable* |
| Shared read-write host-directory mount, with a post-run content hash to detect contamination | Rejected as the correctness baseline | 1167–2498 ms restore, ≈37 MB marginal per instance — the fastest constructible option. Detection is after the fact. Under the bounded pool of section 8, a contaminating write lands while other tests are executing against the same tree, so hashing can report that corruption occurred but cannot prevent it and cannot attribute which results were affected |
| Per-instance database file only | Rejected as an isolation boundary | 24 ms for 3 files / 414 KB. Redirecting the SQLite file leaves the WordPress tree, `wp-content`, and mu-plugins shared, which does not meet the threat model in section 4 and section 18. It is a valid optimization *within* a private-storage design and not a substitute for one |
| Full per-test copy of the WordPress tree | Rejected | 16.6–19.7 s for 3,949 files / 86 MB. Unusable at any suite size |

Private in-memory restore is slower and heavier per instance than a shared mount. That cost is
accepted for the first implementation: correctness first, then earn the latency back. A shared or
layered baseline may replace it only when a genuine read-only or copy-on-write boundary is
demonstrated — one that makes a candidate write to the shared tree impossible rather than detectable.
Until then the preparation target in section 8.3 is provisional.

### 7.3 Baseline identity

The baseline cache key includes at least:

- WordPress version and build identity.
- PHP version.
- Playground package and runtime version.
- SQLite integration version **and driver mode**. The version alone is insufficient: the driver is
  selected by a runtime constant, and the two drivers answer schema-introspection queries differently
  (Appendix C.3), so two baselines with otherwise identical keys can grade the same test differently
  and both validate as cache hits.
- Node major version and WebAssembly execution mode. These are not cosmetic: the runtime selects a
  different execution backend above a Node major boundary, and that boundary is not crossed by
  default even on a recent Node without an explicit flag (Appendix A.5). Two portable runs that
  differ only here are otherwise indistinguishable in the record.
- Host operating system and architecture.
- Network access policy.
- WP-Bench runtime plugin content hash.
- Blueprint or bootstrap configuration hash, with the Blueprint schema version stated explicitly.
- Schema version for the baseline manifest.

Any key change creates a new baseline. A baseline is never reused when its manifest is incomplete or
incompatible.

### 7.4 Per-test lifecycle

Each selected test follows this lifecycle:

1. Wait for a worker slot.
2. Create a new Playground instance with a unique process identifier.
3. Restore the baseline into private per-instance storage.
4. Write only that test's request and candidate artifacts.
5. Read and unlink the request before any candidate code executes.
6. Run the shared verifier through the portable entry point.
7. Capture structured output, diagnostics, timing, and resources.
8. Return the attempt observation.
9. Destroy the entire instance and its private storage.
10. Replace the worker slot if teardown or health checks fail, or if the recycling bound in section
    6.3 is reached.

No test receives an instance previously exposed to another candidate, and no candidate can reach
storage that another test will read. `resetData` is not an isolation boundary (Appendix A.2).

### 7.5 Security model

This design assumes hostile candidate code — that assumption is what justifies per-test instance
destruction — and it removes the container that the canonical profile relies on. The resulting trust
boundary must be stated rather than left implicit, particularly because `wp-bench quick` invites
first-time users to execute untrusted generated code on their own machine.

**Candidate code is untrusted.** The portable profile provides virtual-filesystem isolation, not
operating-system isolation. Relative to canonical Docker it is a weaker boundary, and documentation
must say so plainly rather than implying that removing Docker removed only a dependency.

The exposure is bounded and can be stated precisely:

- **Reachable:** the instance's own virtual filesystem, any host path explicitly mounted into it, and
  the network if enabled. Under the private-storage decision in section 7.2 the portable profile
  **mounts no host path into a test instance by default**; any addition is enumerated, with its mode,
  in the run record and in the report.
- **Not reachable:** the host shell. Process-spawning functions exist in the runtime but resolve
  against a handler that implements only a small fixed command set and fails everything else, so host
  binaries cannot be invoked (Appendix A.12).

**Outbound network access is disabled by default on the portable baseline**, with an explicit opt-in
flag. Three reasons: the runtime enables networking unconditionally unless told otherwise, and writes
the host's certificate bundle into the instance (Appendix A.10); no test in the corpus makes an
outbound request at grading time (Appendix C.13), so the capability delivers no benchmark value; and
an uncontrolled network is a nondeterminism source in a design whose parity model depends on
reproducibility.

Because the canonical profile does have network access, this default is a **declared delta** under
section 7.1 rather than a mismatch, and it is recorded and reported as such.

## 8. Scheduling and performance

### 8.1 Pipeline

Environment preparation and model generation begin concurrently. Cached completions become gradeable
as soon as one runtime slot is ready. Newly generated completions enter the same bounded queue as
they arrive.

The coordinator may execute tests concurrently, but terminal result materialization remains
deterministic by suite order. Queue bounds prevent completion generation from consuming unbounded
memory when grading is slower.

Ordered materialization guarantees the **order** of results, not their **content**. Outcome
determinism under concurrency is a separate obligation, discharged by the timeout confirmation rule
in section 11.2, the per-instance resource limits in section 11.1, and the worker-count invariance
gate in section 16. Concurrency is the first thing in this design capable of changing a score without
changing a completion, and the existing canonical path has never had to reason about it — it forbids
concurrency outright under per-test isolation (Appendix B.8).

### 8.2 Worker sizing

The default worker count is selected conservatively from available CPU and memory. `--grader-workers`
provides an explicit override. The flag is deliberately not named `--workers`: the Playground CLI
already uses `--workers` for request-handling workers against a single shared site, which is a
different unit and cannot serve as a per-test sandbox (Appendix A.3, D.3). Documentation must not
present the two as related.

Sizing must account for the private per-instance storage chosen in section 7.2, whose per-instance
memory cost — ≈218 MB, against ≈37 MB marginal for a shared mount (Appendix A.4) — sets the memory
floor. The implementation must favor stable throughput over maximum instantaneous concurrency and
reduce capacity when repeated worker health failures indicate resource pressure.

The exact heuristic is an implementation decision, but the resolved worker count, the memory floor,
and any mid-run capacity change must be reported in telemetry and covered by benchmark fixtures.

### 8.3 Performance targets

Targets apply to a documented host with cached dependencies and cached completions unless stated
otherwise. The documented host, its CPU and memory, and the exact configuration are published with
any figure quoted against these targets. Measured figures below are from the review host in Appendix
A and must be re-measured on the intended benchmark host.

| Metric | Target | Status |
| --- | --- | --- |
| Command invocation to first graded result | At most 15 seconds | **Approved.** Measured single-instance floor is ≈5.4 s (≈4.1 s restore plus ≈1.25 s boot, Appendix A.2). The target holds only while section 7.2's mechanism holds and is re-derived if it changes |
| Fresh instance preparation p95 | At most 2 seconds | **Provisional.** Private per-instance storage measured ≈4.1 s (Appendix A.2), roughly 2× the target. Re-derived, or the mechanism improved, after the copy-on-write spike |
| Portable full-suite grading throughput | At least 3x the current serial wp-env baseline on the same host | **Unmeasured** — see below |
| First-run baseline construction | No unmitigated target. **Mitigation adopted:** distribute a prebuilt baseline keyed to the section 7.3 manifest, so the quickstart path downloads rather than builds | **Mitigated.** Unmitigated construction measured at ≈3m16s cold and ≈2m47s warm (Appendix A.13), and is still measured and reported whenever it runs |
| Telemetry persistence | Zero lost selected-test terminal records | Approved |

The throughput target compares portable full-suite wall time against the **serial wp-env baseline**,
not against sequential Playground execution. Those denominators differ, and measurements of one do
not bound the other. Portable's advantage over serial wp-env has at least three independent
components: parallelism across workers, elimination of the per-test `wp db reset` and
`wp core install` round trips, and elimination of the per-test `wp-env run cli` process. The target is
neither established nor refuted until the comparison in section 15.3 is run directly: full suite,
cached completions, same host, both configurations recorded.

The measured wall time includes the timeout-confirmation cost in section 11.2, which quiesces the
pool on every candidate execution timeout. That cost falls on the population most likely to time out,
including the exploit corpus. The section 8.3 throughput figure is therefore a figure for the harness
*including* that rule, and must not be quoted against a harness without it.

Cold end-to-end timing, including dependency downloads and model latency, is still measured and
reported. It is not hidden behind the warm target because external network and provider latency are
meaningful user costs.

### 8.4 Performance measurement

The benchmark harness records:

- Process invocation to durable report completion.
- Process invocation to first durable graded result.
- Dependency resolution and downloads.
- Model queueing, generation, retries, and response parsing.
- Completion-cache lookup and materialization.
- Runtime startup and baseline creation or import.
- Worker queue wait.
- Instance creation and baseline restore into private storage.
- Request transport.
- Candidate execution.
- Assertion evaluation.
- Result serialization and persistence.
- Instance and runtime teardown.
- Throughput, CPU, and peak memory where available.

Spans may overlap. Their durations are not presented as an additive substitute for end-to-end wall
time.

## 9. Completion cache and cost accounting

Generation and grading are separate operations. A completion can be graded repeatedly on either
profile without another model call.

The cache is a durable artifact with the same lifecycle obligations as the baseline in section 7.3:
it carries a schema version, and it is never reused when its manifest is incomplete or incompatible.
The stored completion hash is verified on read. **A hash mismatch invalidates the entry rather than
being retried against**: the entry is discarded, the completion is regenerated if generation is in
scope for the run, and the test is recorded `errored` only when regeneration is unavailable — for
example under `grade`, which makes no model calls. Completion-cache corruption is a required
fault-injection case, because a truncated cache write is exactly what an interrupted run produces.

The completion cache key covers the complete generation identity:

- Fully rendered prompt and system instructions.
- Model and provider identity.
- Sampling and tool settings.
- Test, suite, and skill inputs.
- The generation-affecting harness inputs, enumerated rather than summarized: the rendered prompt and
  system text, the skill and variant assembly that produced them, and the generation schema.

Harness version and build identifier are stored as **provenance on the entry, not as key material**.
Keying on a package version would invalidate the entire cache on every release during a six-phase
rollout, which is the opposite of what section 9 exists to achieve. The rule is that anything which
changes what the model was asked is key material; anything that merely records who asked is
provenance.

The stored completion preserves its original prompt hash, completion hash, usage, cost, provider
metadata, retry history, and creation timestamp. A cache hit records zero new model cost while
referencing the original cost and provenance. Reports distinguish original attributed cost from new
spend for the current run.

An interrupted run resumes from its journal and cache. It must not repeat a completed model request
merely because grading or reporting was interrupted.

## 10. Telemetry contract

### 10.1 Compatibility rule

Existing telemetry fields retain their names, types, and meanings. New data is additive and
versioned. If a schema migration becomes unavoidable, it requires an explicit converter and
compatibility test rather than an implicit change.

### 10.2 Durable writer

The Python coordinator is the sole durable JSONL writer. Worker events are observations delivered to
the coordinator, not independent file writes.

If the coordinator cannot persist telemetry safely, it stops scheduling new work and terminates the
run as an infrastructure failure. It must not continue producing unrecorded benchmark outcomes.

There are **two durable artifacts, not one file carrying two record shapes**:

| Artifact | Contents | Version field |
| --- | --- | --- |
| Event journal | Append-only. Every attempt, span, and lifecycle event, each carrying the envelope below | `journal_schema_version` |
| Per-test results JSONL | The existing flat record shape, unchanged, one line per test, containing only terminal per-test records | `result_schema_version`, bumped additively |

The results JSONL is materialized from the journal at finalize. Mixing enveloped event lines into it
is prohibited: existing consumers — the pass/fail reducer, the errored-test reducer, and the results
notebook — all assume one line equals one test result (Appendix B.5), and a mixed file would produce
a wrong suite score without being recognizable as incomplete.

**Materialization under resume.** Materialization is scoped to a `run_id`. Where a run resumed a
prior one under section 11.3, finalize materializes the resumed run's terminal records **over** the
inherited journal's, so the results JSONL covers the full selected suite exactly once and the run
reports one score over the whole suite. The superseded `cancelled` records remain in the inherited
journal and are never rewritten there.

Each journal record includes a common envelope such as:

```json
{
  "schema_version": "...",
  "run_id": "...",
  "sequence": 42,
  "timestamp": "...",
  "event_type": "...",
  "test_id": "...",
  "attempt_id": "...",
  "profile": "portable",
  "payload": {}
}
```

Exact existing field placement must be preserved during implementation. The example defines required
semantics, not permission to replace the current schema.

### 10.3 Required observations

The combined journal and materialized result retain:

- End-to-end wall time.
- Trace, span, and parent-span relationships.
- Generation, cache, retry, queue, preparation, transport, execution, assertion, serialization, and
  teardown timings.
- Prompt and completion hashes.
- Model usage, cost, settings, provider metadata, and cache status.
- WordPress, PHP, Playground, SQLite integration **and driver mode**, wp-env, Docker, MySQL, runtime
  plugin, suite, and harness provenance as applicable.
- **Node version, WebAssembly execution mode, and host operating system and architecture.** These are
  behavior-affecting (Appendix A.5) and are part of the section 7.3 baseline key; a report that omits
  them cannot explain a divergence they caused.
- Standard output and standard error.
- Exit status, timeout, fatal error, and worker diagnostics.
- Attempt history and retry reasons.
- CPU, memory, or other resource measurements where supported.
- Explicit null value and reason where a platform cannot provide a resource measurement.
- Selected, graded, unsupported, errored, cancelled, and denominator counts.
- Runtime profile and parity classification.
- Effective concurrency at dispatch, queue occupancy, and host load — so a contention-sensitive
  outcome is explicable after the fact rather than inferred.
- Resolved worker count and any mid-run capacity change. Worker count is part of run identity, not an
  untracked tuning knob.
- Worker or slot identifier, instance identifier, and the resolved baseline manifest identifier.
- The span in which any fault occurred, the clock basis used for each deadline, and — on a parity run
  — whether that basis matched the comparison profile's.
- Result-channel integrity status for the attempt.
- Captured-stream truncation counts, where a cap was applied.
- The declared deltas in force for the run, per section 7.1, and their observed values.

### 10.4 Terminal statuses

Every selected test receives exactly one durable terminal classification:

- `passed`
- `failed`
- `errored`
- `unsupported`
- `cancelled`

Attempt events may precede the terminal record. Resume logic uses stable identifiers and the journal
to avoid producing a second terminal outcome for the same run and test.

### 10.5 Scoring contract

The terminal statuses above are new. Their effect on the score must be stated, because the existing
scoring path derives outcome from `scores.execution_pass` and treats an absent score as a failure
(Appendix B.5), which would silently make `unsupported` and `errored` deflate the portable score
relative to canonical for the same model.

| Terminal status | `scores.execution_pass` | In score numerator | In score denominator | In coverage denominator |
| --- | --- | --- | --- | --- |
| `passed` | `true` | Yes | Yes | Yes |
| `failed` | `false` | No | Yes | Yes |
| `errored` | `false` | No | Yes | Yes |
| `unsupported` | `false` | No | No | Yes |
| `cancelled` | `false` | No | No | Yes |

**`scores.execution_pass` remains a boolean and never carries null or a sentinel of another type.**
It answers exactly one question — did this completion demonstrably pass? — and for all three
non-graded statuses the answer is no. The distinction between "not applicable here" and "was not
scored" is carried by the **terminal status field**, not by the score field. This is deliberate: a
non-boolean sentinel in `scores.execution_pass` would be truthy in the existing reducer and would
count every unsupported test as a pass, and it would change the field's type in violation of section
10.1.

It follows that **numerator and denominator membership is determined by terminal status, never by
reading `scores.execution_pass`.** Introducing the enum bumps `scoring_version`, and the pass/fail
reducer, the errored-test reducer, and the results notebook are updated in the same change to key off
terminal status.

Definitions, used consistently in telemetry, reports, and this document:

- **Selected** — tests chosen by suite selection for this run. The denominator for coverage.
- **Graded** — selected tests that reached `passed` or `failed`.
- **Score denominator** — selected tests excluding `unsupported` and `cancelled`.
- **Coverage denominator** — all selected tests.
- **Coverage** — the score denominator over the coverage denominator: the fraction of selected tests
  this runtime could evaluate at all.

Consequences that are requirements, not guidance:

- Every report emits **two labeled figures** — score over the score denominator, and coverage as
  defined above. A single bare percentage is never emitted.
- Runs recorded before and after the `scoring_version` bump are never averaged or compared as like
  quantities.
- A cross-profile score comparison is emitted only when both profiles report identical score
  denominators **and identical `errored` counts**. Where either differs, the report shows the two
  figures, the denominator difference, and both `errored` counts, and suppresses the delta. Without
  the second condition, denominators match while one profile's infrastructure flakiness is emitted as
  a model score delta.

## 11. Failure and retry semantics

Failures are divided into candidate outcomes and infrastructure failures.

Candidate failures include verifier assertion failures, candidate PHP fatals, candidate execution
timeouts, and result-channel integrity violations attributable to candidate action per section 6.4.
They are benchmark outcomes and are not retried automatically.

Infrastructure failures include baseline restore failure, worker crash, protocol corruption **not
attributable to candidate action**, or adapter health failure. The coordinator retries one time on a
fresh worker, preserving both attempts and the retry reason. If the second attempt fails, the test
receives `errored` and the worker is replaced.

Telemetry persistence failure is run-fatal because continuing would violate the data-preservation
goal.

### 11.1 Span attribution

The candidate-versus-infrastructure split is not decidable from the symptom alone. A candidate that
exhausts memory aborts its instance, which looks exactly like a worker crash; on the canonical
profile the same candidate hits the PHP memory limit and is scored `failed`. Left unstated, the same
completion earns `errored` on one profile and `failed` on the other, producing a permanent divergence
that no amount of parity work can close.

**Attribution rule:** any deadline expiry, memory-limit breach, output-channel violation, or
result-channel integrity violation whose consumption or occurrence falls inside the candidate's own
execution span is charged to the candidate. It is recorded as `failed`, never `errored`, and is never
retried. Every attempt records which span the fault occurred in.

To make the rule enforceable rather than aspirational, the portable adapter sets per-instance hard
limits chosen to match the canonical profile: a PHP memory limit, a WebAssembly memory ceiling, and
an output byte cap. Without them the portable runtime has no equivalent of the canonical memory
limit, and no PHP-level execution timeout at all (Appendix C.6).

### 11.2 Deadlines

Separate deadlines cover:

| Deadline | On expiry | Retried |
| --- | --- | --- |
| Worker queue wait | Not attributable to the candidate. Recorded as an infrastructure condition and requeued | Yes, and never scored against the model. Requeues are bounded; on exhausting the bound the test is recorded `errored` with a queue-starvation reason code rather than requeued indefinitely |
| Instance preparation | Infrastructure failure | Yes, once, on a fresh worker |
| Candidate execution | Candidate outcome, subject to the confirmation rule below | No |
| Total attempt duration | Attributed to the span the deadline expired in, per section 11.1: expiry inside the candidate span is a candidate outcome, expiry outside it is an infrastructure condition. It is never decomposed proportionally, because a single attempt yields exactly one terminal record | Only when attributed to infrastructure |
| Graceful runtime teardown | Infrastructure. The worker is replaced; the already-returned result stands | Not applicable |

Every deadline states its clock basis. Candidate execution is bounded in candidate CPU time where the
runtime can supply it, and in wall time otherwise, and the basis actually used is recorded on the
attempt. On a parity run the basis must match across profiles, per section 7.1.

**Timeout confirmation.** A candidate execution timeout is never recorded as terminal while other
work is in flight. On expiry the attempt is marked `timeout_unconfirmed`, the pool is quiesced, and
the test is re-run alone at one worker. If the confirmation run also times out, `failed` is recorded.
If it does not, the confirmation run's outcome is the terminal outcome for the test, and the attempt
history retains both. Without this, a slow-but-correct completion crosses a wall-clock deadline under
contention and is scored against the model at the default worker count while passing at one worker —
the same completions and the same host producing different scores, with nothing in the record
identifying contention as the cause.

Confirmation has a throughput cost, accounted for in section 8.3.

### 11.3 Cancellation and resume

Cancellation stops new scheduling, records terminal `cancelled` states for remaining selected tests,
drains persistable observations, and leaves a resumable journal.

Four rules make that compatible with the exactly-one-terminal-record invariant:

- **Run identity.** Resume opens a **new** `run_id` that inherits the prior journal and completion
  cache by reference. The prior run's journal records are never rewritten. "Exactly one terminal
  record per selected test" is scoped to a single `run_id`. The resumed run's materialized results
  file supersedes prior `cancelled` records for the tests it graded, per section 10.2, so a resumed
  run reports one score over the full selected suite rather than over a partial one.
- **In-flight precedence.** An attempt response arriving after cancellation has been recorded for
  that test is **discarded**, not materialized. It is retained in the journal as an observation with
  an explicit `superseded_by_cancellation` marker so the work is not lost, but it never becomes a
  second terminal record.
- **Configuration validation.** Resume compares suite selection, seed, limit, profile, and model
  configuration against the prior run's metadata and **refuses** on any mismatch. It does not warn and
  continue. Splicing two configurations into one reported score is not recoverable after the fact.
- **Torn-record recovery.** A truncated trailing journal line is discarded, a `journal_truncated`
  event naming the discarded byte range is emitted, and the run continues. The terminal write itself
  is durable before it is acknowledged — atomic rename, or flushed to disk — so a crash can lose an
  in-progress attempt but never a recorded terminal outcome. The existing writer does not meet this
  bar today (Appendix B.10).

## 12. Parity model

Parity is measured with identical completions, reference solutions, and exploit cases on both
profiles. Model generation is never repeated for a parity comparison.

Each comparable result is classified as:

- `unverified`
- `parity_passed`
- `portable_only`
- `canonical_only`
- `divergent`

`parity_passed` means the two runtimes **agreed**, including agreed failure. An exploit that is
correctly rejected on both profiles is `parity_passed`, because this classifier measures runtime
agreement and not benchmark health. Whether the grader can be cheated is a separate question answered
by the exploit check, not by this enum. The full status-pair to class mapping, including which pairs
are `unverified`, belongs in the implementation plan and is listed in section 20.

The comparison includes terminal status, score, assertion results, failure class, and relevant
normalized verifier output. Runtime-specific diagnostics and timing are retained but are not required
to be byte-identical.

MySQL-specific behavior is capability-tested. A test that cannot preserve its intended semantics on
SQLite is `unsupported` with a structured reason code and remains in coverage counts.

**Capability requirements are declarative, not inferred.** A test declares what it requires as dataset
metadata, and the **coordinator** — never the adapter — maps a missing capability to `unsupported`.
Deriving `unsupported` from a runtime error message is prohibited: it makes the classification
candidate-influenceable, so a completion that emits an unsupported construct is booked as "the
runtime could not run this" rather than as a failure it earned.

Declarative capability metadata does not exist in the dataset schema today, and the configuration
models reject unknown fields by design (Appendix B.7). This design therefore **depends on an upstream
schema addition**, and that dependency is called out here rather than assumed.

**On silent rewriting.** The portable adapter must not rewrite SQL. The stack below it does, and this
design cannot prevent that: the SQLite drop-in rewrites escape characters in pattern matching, maps
signed and unsigned cast types onto a single integer type, and emulates several MySQL functions
through user-defined functions — all beneath the adapter boundary (Appendix C.12). The non-goal in
section 3 is scoped to the adapter accordingly. Claiming the property for the whole stack would be
claiming something the design cannot enforce.

### 12.1 The supported corpus

"Supported corpus" is an enumerated, version-pinned list of test identifiers, published as an artifact
rather than derived per run.

Shrinking it is a corpus change and requires review. In particular, classifying a test `unsupported`
removes it from the score denominator and therefore from the promotion criterion below, so it cannot
be a decision the portable profile makes unilaterally at run time. Without this rule the promotion
gate is self-referential: the profile declares the tests it diverges on unsupported, the remaining
corpus passes parity trivially, and the profile is promoted having dropped exactly the coverage that
made the divergence visible.

Every `unsupported` classification carries a structured reason code, the codes are published in the
report, and the accumulated set is reviewed at the promotion review in section 17.

### 12.2 Quick-suite membership

The `wp-bench quick` suite contains only tests that have demonstrated complete outcome and assertion
parity across repeated validation runs. N is fixed in the implementation plan and is not fewer than
the promotion floor in section 12.3; "repeated" is not left to the reader.

Membership is frozen and versioned as `quick-v1` for a released suite and runtime pair. It is
re-derived on a version bump, never per run, so the published quick suite is a stable, auditable list
rather than whatever agreed today.

Qualification is a property of a test **and the completions used to qualify it**, not of the test
alone. A later model's completion can exercise a path the qualifying completions never touched — a
version-specific deprecation, or a `_doing_it_wrong()` notice that one profile escalates and the
other does not — and score differently on the two profiles inside a suite this design has certified.
A quick run therefore flags any test whose current completion exercises a path outside the qualifying
set, and that flag appears in the report. The detection mechanism is an implementation decision,
listed in section 20.

The report discloses the **selection mechanism** — membership was chosen by cross-runtime agreement —
alongside per-category coverage against the full suite, so a reader can see the shape of what was
omitted rather than only its count.

This permits a trustworthy portable quickstart without claiming that the full portable suite is
canonical.

### 12.3 Promotion

Docker/wp-env/MySQL remains canonical until the full supported corpus repeatedly passes parity gates
across the supported WordPress and runtime compatibility matrix, **and** no unsupported or divergent
classification remains outstanding in that corpus.

The second condition is the stricter reading and it governs. Passing parity over a corpus that was
shrunk to make parity easy is not promotion evidence.

"Repeatedly" means **not fewer than three consecutive full passes** over the supported corpus on the
same pinned compatibility-matrix entry, with no divergence and no new `unsupported` classification in
any of them. The implementation plan may raise this floor and may not lower it.

## 13. Public command surface

### 13.1 Entry points

```text
wp-bench quick
wp-bench generate ...
wp-bench grade --profile portable|canonical ...
wp-bench run --profile portable|canonical ...
wp-bench compare-runtimes ...
wp-bench report ...
```

The precise integration with existing argument placement is finalized during implementation, but
these command responsibilities are fixed.

### 13.2 Command behavior

| Command | Responsibility |
| --- | --- |
| `quick` | Run the curated parity-qualified suite on `portable` and generate a report |
| `generate` | Produce or load completions and record complete model provenance |
| `grade` | Grade existing completions without model calls |
| `run` | Compose generation, grading, and reporting |
| `compare-runtimes` | Grade identical completions on both profiles and classify parity |
| `report` | Rebuild a self-contained report from durable raw artifacts |

`quick` defaults to the portable profile. Existing command defaults must not silently switch from
canonical behavior; backward compatibility is assessed during implementation. Full runs should use an
explicit profile in documentation and automation. A configuration that maps to no profile is rejected
rather than reassigned, on the paths and with the scope defined in section 5.

**Externally supplied completions.** A sibling proposal in this repository specifies
`wp-bench grade --completions <jsonl>` for completions produced outside the harness. That input
cannot carry the prompt hash, usage, cost, and provider metadata that section 9 requires of a stored
completion. The two must not silently share a command shape: an externally supplied completion is
recorded with an explicit `provenance: external` marker, contributes zero attributed cost rather than
unknown cost, and is excluded from cost-accounting totals and from cache-hit-rate reporting. Whether
that lives under `grade` or a distinct command is settled with the sibling proposal, not
independently, and is listed in section 20.

The quick command prints a prominent portable-runtime and subset notice before execution. It reports
its selected count and denominator rather than presenting the subset as the full benchmark.

## 14. Reporting

Raw JSONL is the durable source of truth. Materialized JSON and self-contained HTML are derived views
that can be regenerated without rerunning generation or grading.

The HTML report requires no application server and includes:

- Two labeled figures per section 10.5 — score over the score denominator and coverage — never a
  single unlabeled percentage. Category breakdown alongside.
- Selected, graded, passed, failed, errored, unsupported, and cancelled counts.
- Both denominators, named, with the structured reason code for every unsupported test.
- Effective worker count, and whether that worker configuration is one the invariance gate in
  section 16 has been verified at.
- Portable or canonical profile badge.
- SQLite/WASM or MySQL/Docker database and runtime badge.
- Exact version and provenance details, including the section 10.3 runtime provenance fields.
- The declared deltas in force for the run, per section 7.1.
- The enumerated host-mount set, per section 7.5.
- First-result and total end-to-end duration.
- Component timing and throughput views.
- Original attributed model cost, new run cost, usage, and cache-hit rate.
- Parity status and divergence details.
- Per-test outcomes, attempts, diagnostics, and timing.
- Direct access to the raw artifact names and schema version.

Profile, coverage, and parity remain visible in screenshots and printed output. They cannot be
relegated to hover text or a secondary settings page.

## 15. Validation strategy

### 15.0 Canonical behavioral golden fixture

Before the verifier is touched, capture the unmodified canonical path's behavior over the **full
corpus**: run the reference-solution check and the exploit check across every test and freeze
per-test scores, assertion results, and failure classes as a committed fixture.

Reproducing that fixture byte-for-byte on the post-refactor canonical entry point is a release gate.

This is not redundant with the rest of section 15. Every other subsection compares portable against
canonical *after* the refactor. The transport split necessarily changes output buffering and
error-handler installation order in the shared core, and that core converts every PHP warning,
notice, deprecation, and user-level diagnostic into a thrown error with no severity mask (Appendix
C.7). An ordering change therefore moves **both** entry points identically, leaving every
cross-adapter comparison green while the canonical profile — the one this design promises to preserve
— silently reports different numbers than before.

This fixture is also distinct from the serial wp-env throughput baseline recorded in the same rollout
phase. That one measures time; this one measures behavior. Neither substitutes for the other.

### 15.1 Adapter contract suite

Run identical fixtures against both adapters to validate runtime preparation, plugin loading, input
transfer, output capture, fatal handling, timeouts, teardown, and isolation.

This suite compares the two adapters to **each other**. It cannot observe a change that moves both of
them equally, which is why section 15.0 exists. Any fixture in this section that asserts only
*agreement* between profiles carries the same blind spot and must be paired with an absolute
assertion where the correct value is known.

### 15.2 Differential parity corpus

Run reference, candidate, and exploit completions through both profiles. Supported quick-suite tests
require identical terminal outcomes and assertion results. Divergences produce inspectable records
rather than averaged or hidden results.

### 15.3 Performance harness

Measure cold and warm runs on the same documented host. Record configuration, worker count, versions,
CPU, memory, and run-to-run variance.

The throughput comparison is run directly and is not inferred from component measurements: the full
suite, cached completions, the same host, portable wall time against serial wp-env wall time. The
serial baseline is pinned to a named wp-bench commit and configuration, published alongside any ratio
quoted from it, and re-measured whenever a canonical-side reset optimization lands (Appendix B.9). A
ratio measured against a superseded baseline is not a valid gate result.

Record **outcome** variance as well as timing variance. A test whose terminal status is not stable
across repeated runs at the same worker count is recorded as `flaky` in the parity artifact and is
disqualified from the quick suite.

### 15.4 Fault injection

Cover worker termination, baseline corruption, protocol corruption, candidate timeout, telemetry
write failure, completion-cache corruption, process interruption, and journal-based resume. Verify
that model spending is not repeated during resume.

Three isolation fixtures are required rather than optional:

- **Destructive candidate.** A candidate mutates files in its instance that exist in the baseline —
  core files, mu-plugins, and the database. A later detector test asserts it sees pristine baseline
  state. If a shared or layered baseline is ever adopted under section 7.2, the same fixture must
  fail the entire run on contamination rather than reporting it per test.
- **Resource exhaustion.** A hostile hang, an output flood, and an allocation loop **each yield
  `failed` on both profiles**, per section 11.1. The assertion is absolute, not an agreement check:
  both profiles returning `errored` is the misclassification section 11.1 exists to prevent, and an
  agreement-only assertion cannot see it.
- **Result-channel forgery.** A candidate emits a well-formed passing result and terminates before
  the verifier emits its own, on **both** entry points. The attempt yields `failed`, is not retried,
  and records an unclean integrity status, per section 6.4.

### 15.5 Compatibility matrix

Version *values* are deliberately not pinned in this document — they are refreshed from official
upstream sources before implementation and at each release. The **axes** are pinned here, because a
matrix with unnamed axes cannot be validated against:

| Axis | Requirement |
| --- | --- |
| WordPress version, per profile | Stated separately for portable and canonical, including build identity, not only the version string. Build identity is a declared delta under section 7.1 |
| PHP version, per profile | Stated separately, with a required-match rule between profiles |
| Playground package version | Stated, and reconciled with the pin asserted in the `agent-skills` conformance checks (Appendix D.2) |
| SQLite integration version and driver mode | Both, per section 7.3 |
| Node floor, and execution mode | Minimum supported Node major, plus an explicit statement of whether the newer WebAssembly execution backend is required or merely permitted (Appendix A.5) |
| Host operating systems | Enumerated. Removing Docker is a portability goal, so the host matrix is the mechanism that goal is delivered through |
| Blueprint schema version | Stated, since the surrounding guidance is version-specific |

At minimum, validate the latest supported stable WordPress release and the versions explicitly
supported by WP-Bench.

Two compatibility facts belong on the record because they constrain what the portable profile can
claim. First, the `agent-skills` repository asserts a specific Playground CLI version as a hard string
check in its conformance harness (Appendix D.2), so adopting a different version there and here must
happen in one change or continuous integration fails. Second, that repository's default compatibility
floor is a PHP version the portable runtime cannot select at all (Appendix D.5), so the portable
profile structurally cannot exercise the default floor and must not be described as if it does.

## 16. Release gates

Correctness gates:

- Complete result and assertion parity for every test included in `wp-bench quick`.
- Exactly one terminal record for every selected test, within a `run_id`.
- No hidden exclusions; every unsupported test is visibly counted with a structured reason code.
- No telemetry field regression.
- The section 15.0 canonical golden fixture reproduces byte-for-byte after the verifier refactor.
- Every terminal status has a defined score contribution per section 10.5, `scores.execution_pass` is
  boolean on every record, and no report emits a single unlabeled percentage.
- Identical cached completions graded at one worker and at the default worker count yield identical
  terminal statuses and identical scores.
- Successful interruption and resume without repeated model spending, with the resumed run reporting
  one score over the full selected suite.
- Runtime versions and upstream provenance present in every report, including Node version, execution
  mode, host operating system, and database driver mode — the same fields section 10.3 requires.
- The declared-delta list in section 7.1 is asserted at run start, and an undeclared environment
  difference fails the run.
- The `agent-skills` Playground conformance assertions are updated in the same change as any
  Playground version adopted here.
- Fault-injection suite passes for required infrastructure failures, including all three isolation
  fixtures in section 15.4.
- Every portable test observably begins from pristine baseline state, proven by the
  destructive-candidate fixture rather than asserted by the adapter.

Performance gates:

- Cached first graded result within 15 seconds on the benchmark host.
- Fresh Playground instance preparation at or below 2 seconds p95. **Provisional.** This target was
  set before the restore mechanism was known, the accepted mechanism measures roughly 2× it, and it
  is re-derived once section 7.2's mechanism is implemented and measured on the benchmark host. It
  does not block the correctness gates above.
- At least 3x full-suite grading throughput versus serial wp-env on the same host with cached
  completions, measured directly per section 15.3 against a baseline pinned to a named wp-bench
  commit.

## 17. Rollout

### Phase 1: Instrument and baseline

Add the shared timing and telemetry model to the canonical path first. Record the current serial
wp-env baseline without changing scoring behavior, pinned to a named wp-bench commit.

This phase has two distinct deliverables that are often conflated. The **throughput baseline** is the
wall-time comparator for section 8.3. The **behavioral golden fixture** required by section 15.0 is
separate: per-test scores, assertion results, and failure classes captured on the unmodified
canonical path. Both are captured here, and neither substitutes for the other.

### Phase 2: Portable single worker

Implement the transport-neutral verifier, Node protocol, baseline materialization and private
per-instance restore, and a single portable worker. Establish correctness and isolation before
concurrency.

Section 7.2's restore mechanism is spiked in this phase. Its measured preparation cost on the
benchmark host, not the provisional target and not the Appendix A figure, is what section 8.3 and
section 16 are updated to carry forward.

### Phase 3: Worker pool

Add bounded concurrency, immediate first worker availability, background prewarming, backpressure,
worker recycling, and worker replacement. Tune only against recorded performance and resource data.

The direct throughput comparison in section 15.3 is run at the end of this phase. Until it has been
run, no figure in this document establishes or refutes the 3x gate.

### Phase 4: Experimental portable profile

Expose `--profile portable`, the static report, explicit capabilities, and differential comparison.
Keep canonical labeling and documentation unchanged.

### Phase 5: Public quickstart

Enable `wp-bench quick` only after its curated suite meets parity, telemetry, fault-tolerance, and
speed gates. Publish its subset and runtime labels prominently.

### Phase 6: Full-profile promotion review

Evaluate full-suite parity across the supported compatibility matrix, against the floor in section
12.3. Review the accumulated `unsupported` reason codes and the declared-delta list. Docker/MySQL
remains canonical until this review explicitly changes that status.

## 18. Alternatives considered

### Use `wp-env --runtime=playground` directly

Rejected as the primary design because the documented runtime does not support `wp-env run`, while
the current verifier depends on that command path. It may remain useful for manual compatibility
checks.

### Start a new Playground CLI process per test

Rejected because repeated process startup, WordPress bootstrapping, and dependency work would
undermine both first-result latency and suite throughput. `run-blueprint` exits after execution, so
each per-test process genuinely re-pays boot (Appendix D.6).

### Reuse one mutated Playground instance

Rejected because hostile or faulty candidate code can change database, filesystem, hooks, globals,
and process state beyond what content-only reset operations remove.

### Share one read-write baseline mount and detect contamination by hashing afterward

Rejected as the correctness baseline. It is the fastest constructible restore, but detection is after
the fact: under a bounded worker pool the contaminating write lands while other tests are still
executing against the same tree, so a post-run hash can report that corruption occurred without
preventing it and without identifying which results it affected. A shared baseline is admissible only
behind a boundary that makes the write impossible — read-only or copy-on-write — not one that makes
it visible. See section 7.2.

### Isolate only the per-instance database file

Rejected as an isolation boundary. Redirecting the SQLite database file per instance is cheap and
worth doing, but it leaves the WordPress tree, `wp-content`, and mu-plugins shared, which does not
meet the threat model that motivates per-test destruction. It is retained as an optimization inside a
private-storage design.

### Co-locate multiple Playground instances in the supervisor process

Rejected because PHP-WASM executes synchronously on the JS thread, so co-located instances interleave
rather than run in parallel — measured slower than running the same work sequentially (Appendix A.3)
— and because a candidate loop inside a co-located instance is not preemptible, leaving no way to
enforce a per-test deadline except killing the supervisor and every unrelated in-flight test with it.

### Replace the canonical profile immediately

Rejected because SQLite and MySQL differences are observable in the current dataset and a portability
claim without differential evidence would weaken benchmark meaning.

### Keep only the current Docker path

Rejected because it preserves setup cost, startup latency, and audience barriers and does not address
the stated goals.

## 19. Risks and mitigations

| Risk | Mitigation |
| --- | --- |
| SQLite differs from MySQL | Explicit capabilities, differential classification, canonical Docker profile |
| Baseline restore leaks state | Private per-instance storage, new instance per test, versioned manifest, destructive-candidate fixture that must fail the run |
| Concurrency changes result ordering | Stable identifiers and coordinator-side ordered materialization |
| Worker logs corrupt IPC | Protocol-only stdout and captured diagnostic stderr |
| Speed optimization loses telemetry | Sole durable writer, bounded queues, stop-on-persistence-failure policy |
| Cache obscures model cost | Preserve original cost and separately report new spend |
| Quick score is mistaken for full score | Persistent profile, subset, coverage, and denominator labels |
| Upstream APIs drift | Versioned adapter protocol, compatibility matrix, upstream refresh before releases |
| Excess workers exhaust memory | Conservative sizing against the measured per-instance floor, bounded queues, override, health-driven replacement, worker recycling |
| Untrusted candidate code reaches the host once Docker is removed | Stated trust boundary, no host mounts by default, network off by default, no reachable host shell |
| Concurrency changes an outcome rather than an ordering | Timeout confirmation at one worker, per-instance resource limits, worker-count invariance gate |
| Candidate forges a passing result in-process | Out-of-band result channel, request unlinked before candidate execution, one accepted emission, `failed`-not-retried under section 11.1, recorded integrity status, forgery fixture |
| Behavior drifts during the verifier refactor | Canonical golden fixture captured before the refactor and reproduced byte-for-byte after |
| Unsupported classification is used to shrink the corpus into parity | Enumerated version-pinned corpus, reason codes, review required to shrink, promotion blocked while divergence remains |
| An unreconcilable environment difference is silently absorbed | Closed declared-delta list in section 7.1; anything not on it fails the run |
| Infrastructure flakiness is read as a model score delta | Cross-profile comparison suppressed unless `errored` counts match, per section 10.5 |

## 20. Implementation-time decisions

These choices do not reopen the approved architecture but must be settled in the implementation plan:

- CLI surface redesign. This is larger than parser integration: the tool exposes one subcommand today
  (Appendix B.1), five of the six commands in section 13.1 are net-new, and `run` must be decomposed
  into separable generation and grading phases that do not currently exist as units.
  Backward-compatible aliases are the smallest part of this item, not the whole of it.
- Initial quick-suite membership based on measured parity.
- **N for quick-suite qualification** under section 12.2, not fewer than section 12.3's floor.
- **The full status-pair to parity-class mapping**, including which pairs are `unverified`
  (section 12).
- **The mechanism by which a quick run detects that a current completion exercises a path outside the
  qualifying set** (section 12.2).
- **Whether externally supplied completions live under `grade` or a distinct command**, settled with
  the sibling proposal (section 13.2).
- **The enumerated host-mount set per profile**, which section 7.5 requires to be published and which
  the private-storage decision expects to be empty by default on portable.
- Default worker-count heuristic and memory floor.
- Storage format and layering technique used to implement the private per-instance restore decided in
  section 7.2. The mechanism and its isolation guarantee are decided; only the encoding is open.
- Exact additive field placement within the current telemetry schema.
- Report artifact names and output-directory conventions.

## 21. Acceptance criteria

The design is complete when an implementation can demonstrate all of the following:

- A new user can run `wp-bench quick` without Docker and receive a clearly labeled static report.
  Their first run is cold by definition: it is measured and reported honestly against section 8.3's
  cold row, not against the warm targets.
- On the documented benchmark host with cached dependencies and completions, the first portable
  result and the full grading run **meet** the section 8.3 targets marked approved, **report measured
  values** for those marked provisional or unmeasured, and **demonstrate the adopted mitigation** for
  those marked mitigated.
- The same cached completion can be graded on both runtimes without another model request.
- Every selected test has a visible terminal outcome, a defined score contribution per section 10.5,
  and a complete attempt history.
- Existing telemetry remains readable, no existing field changes type, and all newly required timing,
  runtime, cost, and parity data is present.
- Every portable test begins from pristine baseline state and its instance and private storage are
  destroyed afterward, demonstrated by the destructive-candidate fixture rather than asserted.
- Quick-suite results have complete demonstrated parity with canonical results, over a frozen and
  published membership list.
- Full portable results never imply canonical status while unsupported or divergent behavior remains
  in the supported corpus. This is the governing promotion rule; section 12.3 states it identically.
- Raw artifacts can regenerate the report without rerunning the benchmark.

## 22. Upstream references

Upstream:

- WordPress Playground documentation: <https://wordpress.github.io/wordpress-playground/>
- WordPress Playground Node API: <https://wordpress.github.io/wordpress-playground/api/node/>
- WordPress Playground Blueprint schema, including
  `applicationOptions.wordpress-playground.networkAccess`, which the section 7.5 default aligns with:
  <https://wordpress.github.io/wordpress-playground/blueprints/>
- WordPress SQLite database integration:
  <https://github.com/WordPress/sqlite-database-integration> — a source for the section 7.3 baseline
  key, including driver mode
- WordPress wp-env package documentation:
  <https://developer.wordpress.org/block-editor/reference-guides/packages/packages-env/>
- WordPress core releases: <https://wordpress.org/news/category/releases/>
- WP-Bench repository: <https://github.com/WordPress/wp-bench>

In this repository:

- `docs/wp-bench-integration.md` — the sibling proposal that also claims `wp-bench grade`; see
  section 13.2
- `docs/compatibility-policy.md` — the WordPress and PHP floors section 15.5 must honor
- `skills/wp-playground/references/cli.md` and `eval/harness/release-conformance.mjs` — the
  Playground version pin asserted in continuous integration

These links are sources of truth, not permanent version pins.

## 23. Revision history

### 23.1 How this document reached revision 3

Revision 1 was reviewed by seventeen agents — four upstream-grounding, five blind single-dimension
reviewers, seven adversarial verifiers, one synthesis — including empirical work on a live Playground
installation (Appendix A). The review returned two blocking findings and twenty document findings,
and its verdict was "not ready to enter an implementation plan as written."

Revision 2 answered all twenty-two. A closure audit then checked each answer against the finding that
prompted it and found ten landed clean, eight landed with a gap, and three partial. Revision 3 applies
those twelve, merges the review's evidence into Appendix A–D and its refuted claims into Appendix E,
and replaces all three documents.

**Revision 1 → 2, from the review.** Section numbers are those of *this* revision.

| Review finding | Where it landed |
| --- | --- |
| B1 Restore primitive does not exist | 7.2 (mechanism decided), 7.1 (baseline includes the platform tree), 15.4 (destructive fixture), 18 (two new rejections), 20 (encoding only), 8.3 and 16 (target marked provisional) |
| B2 Worker topology undefined | 5 (definition), 6.3 (topology, process identity, recycling), 8.2 (`--grader-workers`), 18 (co-location rejected), 17 Phase 3 |
| M1 Score never defined | 10.5 (scoring contract), 14 (two labeled figures), 16, 21 |
| M2 No canonical golden fixture | 15.0, 16, 17 Phase 1, 15.1 (states what it cannot observe) |
| M3 Result channel candidate-writable | 6.4 (out-of-band emission), 7.4 step 5, 6.2, 19 |
| M4 `unsupported` unadmissible; wrong divergence source | 4.1 (premise corrected), 7.1 (environment parity), 7.3 (driver mode in key), 12 (declarative capabilities), 3 (non-goal scoped) |
| M5 Concurrency makes score scheduling-dependent | 8.1, 11.2 (timeout confirmation, clock basis), 10.3, 16 (invariance gate), 15.3 (outcome variance) |
| M6 Unclassified deadlines; exhaustion routes to infrastructure | 11.1 (span attribution, resource limits), 11.2 (deadline table), 15.4 |
| M7 Promotion gate self-referential | 12.1, 12.2, 12.3, 21 |
| M8 Cancellation and resume undefined | 11.3 |
| M9 No trust boundary or network policy | 7.5, 19 |
| M10 Compatibility matrix has no axes | 15.5, 7.3, 10.3, 16, 22 |
| m1 `kind: cli` has no profile | 4, 5, 13.2 |
| m2 Journal and results not separated | 10.2 |
| m3 Cache unversioned; "relevant" undefined | 9 |
| m4 Unbounded frames and streams | 6.3 |
| m5 No supervisor liveness contract | 6.3 |
| m6 Baseline not pinned to a commit | 15.3, 17 Phase 1 |
| m7 Cold baseline construction untargeted | 8.3 |
| m8 `parity_passed` ambiguous | 12 |
| m9 CLI work mis-scoped; `grade` collides | 20, 13.2 |

**Revision 2 → 3, from the closure audit.**

| Audit finding | What changed |
| --- | --- |
| H1 Environment-parity precondition unsatisfiable — four of six bullets named deltas the same bullets described as inherent, under a fail-the-run rule | 7.1 split into must-match and a **closed declared-delta list**; 7.5 network default reclassified as a declared delta; 10.3 and 14 record and report them; 16 and 19 gate on the list being closed |
| H2 `unsupported`/`cancelled` sentinel value unspecified; a truthy sentinel would count them as passes | 10.5 fixes `scores.execution_pass` as boolean `false` for all non-graded statuses, moves the "not applicable vs not scored" distinction to the terminal status field, and states that numerator/denominator membership is read from terminal status; 16 gates on the field being boolean |
| H3 §10.3 never updated for M10 while §16 gated on those fields | 10.3 adds Node version, WebAssembly execution mode, host OS and architecture, and SQLite driver mode |
| G1 Integrity violation yielded `errored` against 11.1's `failed`; retry unresolved | 6.4 classifies by span per 11.1 — candidate-attributable is `failed` and never retried; 11 scopes protocol corruption to corruption not attributable to candidate action; 15.4 adds a forgery fixture |
| G2 Exhaustion fixture weakened to "same terminal status" | 15.4 restores the absolute assertion and says why; 15.1 generalizes the rule |
| G3 §8.3 only partly re-derived; accepted mechanism's measured cost absent | 7.2 gives the accepted mechanism a costed row; 8.2 carries the memory figure; 8.3 states the measured floor under the 15 s row and the measured ≈4.1 s under the provisional row |
| G4 Timeout confirmation's throughput cost unbudgeted | 8.3 and 11.2 state that the measured throughput figure includes it |
| G5 Cross-profile guard was denominator equality only | 10.5 adds `errored`-count equality |
| G6 Resume score reporting across two `run_id`s undefined | 10.2 adds the materialization rule; 11.3 states a resumed run reports one score over the full suite; 16 scopes the one-record gate to a `run_id` |
| G7 Total-attempt row read as proportional decomposition | 11.2 attributes by the span the deadline expired in and forbids proportional splitting |
| G8 §20 did not absorb revision 2's new deferrals; promotion's N unquantified | 20 gains five entries; 12.3 sets a floor of three consecutive full passes; 12.2 ties its N to that floor |
| G9 Cold-baseline row stated neither target nor mitigation | 8.3 adopts the prebuilt-baseline mitigation and carries the measured figure; 21 covers all four target statuses |
| Nits N1–N10 | 5 and 13.2 (cli rejection scope), 7.1 and 10.3 (clock-basis parity), 11.2 (confirmation non-reproduction, bounded requeue), 9 (cache-integrity invalidation), 14 (invariance reporting), 7.5 (mounts), 22 (Blueprint reference), 7.2 (copy cost stated as measured), 16 (`run_id` scoping) |

### 23.2 Judgment calls made while merging

Twelve audit findings were applied. Seven required a decision the audit identified but did not make.
Each is reversible and is listed here so it can be overridden without re-deriving the analysis:

1. **§7.1's split.** PHP minor, debug configuration, permalink structure and clock basis were placed
   in must-match; WordPress build identity, platform mu-plugins and network policy in declared
   deltas. The dividing line is whether baseline construction can control the dimension. Permalinks
   are the debatable one — placed in must-match because the baseline can restore the canonical value,
   though doing so fights a boot-time action.
2. **§10.5's sentinel.** Resolved by keeping `scores.execution_pass` boolean and moving the
   distinction to terminal status, rather than by introducing a typed sentinel. This preserves
   section 10.1 and the existing reducer's type expectations; the cost is that the score field alone
   no longer distinguishes `failed` from `unsupported`, which is why membership must be read from
   terminal status.
3. **§6.4's classification.** Candidate-attributable integrity violations were routed to `failed`
   rather than `errored`, for consistency with 11.1. The opposite choice — `errored` on the grounds
   that an untrustworthy channel means the completion could not be graded at all — is defensible;
   what is not defensible is the revision-2 state where the two rules disagreed.
4. **§12.3's floor.** Three consecutive full passes, stated as a floor the implementation plan may
   raise. The number is a judgment call; the audit's point was that a governing gate cannot use an
   unquantified adverb.
5. **§8.3's cold-baseline row.** The prebuilt-baseline mitigation was adopted rather than a target
   being set, because the measured ≈3 minute construction sits on the quickstart path this design
   exists to improve.
6. **§8.3's 15 s row.** Re-affirmed rather than changed, with the measured ≈5.4 s single-instance
   floor stated beneath it so the headroom is visible.
7. **§5's `kind: cli` scope.** Rejection was scoped to paths that require a resolved profile, rather
   than to all paths, to avoid breaking existing `kind: cli` users running with
   `execution_isolation: none`.

### 23.3 Invariants that must not be disturbed

Recorded because each survived adversarial review and is load-bearing for something non-obvious:

- **Generation is separate from grading, and generation is never repeated for a parity comparison**
  (sections 3, 9, 12). This forecloses the failure mode that would make section 12 uninterpretable:
  sampling noise misattributed to SQLite-versus-MySQL.
- **Adapters return observations; the coordinator is the sole durable writer** (sections 6.1, 10.2).
  This is the structural fix for wp-bench issue #39, where per-test isolation was asserted in
  metadata by a path that performed no reset (Appendix B.4).
- **The adapter boundary contains no scoring policy** (section 6.2). This is what makes a third
  runtime addable without forking benchmark semantics.
- **Unsupported tests stay in coverage counts; `quick` prints its subset notice before execution; and
  profile, coverage and parity cannot be relegated to hover text** (sections 3, 12, 13.2, 14).
- **Section 15.0 exists because section 15.1 cannot see a change that moves both adapters equally.**
  Deleting either as redundant re-opens M2.
- **Spans may overlap and are not an additive substitute for wall time; cold timing is not hidden
  behind the warm target** (sections 8.3, 8.4).
- **Version values in this document are stale by construction and must be refreshed upstream before
  implementation** (sections 4.2, 15.5).

### 23.4 Two things this document still does not claim

It does not claim the throughput gate is met or missed — that comparison has not been run, and
section 8.3 says so. And it does not restate the instance-preparation target as achievable; that
number is provisional until the restore mechanism is measured on the benchmark host. The
implementation plan must begin with a narrow upstream refresh, because this workspace requires
alignment with current WordPress core, Gutenberg, Playground, and WP-Bench.

---

# Appendix A — Empirical measurements

All figures from experiments `exp1.mjs`–`exp6.mjs` and CLI runs on the review host: Windows 11 Pro
10.0.26200, Node v24.19.0, 8 logical CPUs, `@wp-playground/cli` 3.1.49, PHP 8.3.32 (asyncify build —
JSPI off, see A.5), WordPress 7.0.4, SQLite Database Integration 3.0.0-rc.8. **These are single-host
figures; re-measure on the intended benchmark host before writing any of them into section 8.3.**

**A.1 — Package and API surface.** Playground packages are at 3.1.49, published 2026-08-10
(`npm view @wp-playground/cli version time.modified`). The official Node API reference lists exactly
`bindUserSpace`, `createNodeFsMountHandler`, `getPHPLoaderModule`, `loadNodeRuntime`,
`useHostFilesystem`, `withNetworking`. CLI commands are exactly
`start | server | run-blueprint | build-snapshot | php` (`run-cli.d.ts:831`). `runCLI()` is a
supported programmatic entry point returning a `RunCLIServer`.

**A.2 — Snapshot and restore.**

| Observation | Value |
| --- | --- |
| Snapshot save/restore API in any Node package | None. No `serialize`/`restore`/`save-state` symbol; `grep -ril snapshot --include=*.d.ts` returns 4 files, all doc comments or the CLI command name |
| `build-snapshot` output | 31,428,240 bytes, 3,949 entries, includes `/wordpress/wp-content/database/.ht.sqlite` |
| `build-snapshot` implementation | ~25 lines of inline PHP `ZipArchive` (`run-cli.ts:2170-2196`, `zipSite`) |
| Snapshot self-containment | **No.** Covers `/wordpress` only; SQLite driver and platform mu-plugins live under `/internal/shared`. Restore without `sqliteIntegrationPluginZip` → HTTP 500 "Database Error"; with it → HTTP 200 |
| Restore without reinstalling WP | Works via `wordpressInstallMode: 'do-not-attempt-installing'` + `createNodeFsMountHandler`. `restore1_boot_ms :: 1250`; state verified `{"ver":"7.0.4","installed":true,"wpdb":"WP_SQLite_DB","posts":1}` |
| Generic VFS primitives that do exist | `zipDirectory(php, path) => Uint8Array`, `unzipFile(php, zip, extractTo)` from `@wp-playground/common`, plus `writeFiles`/`iterateFiles`/`php.mount` |
| `dataSqlPath` | Not a SQL loader despite its docstring; defines `DB_DIR`/`DB_FILE` constants, pointing the driver at an arbitrary SQLite file |
| `resetData` | Content-only Blueprint step (posts/pages/comments via WP APIs, sequences reset). Not an isolation boundary |
| Browser "snapshot .zip" | `importWordPressFiles`, which explicitly discards Playground-owned runtime artifacts on import. Not a generic VM restore |

Copy costs measured on the baseline tree (3,949 files / 86.0 MB):

| Operation | Time |
| --- | --- |
| `fs.cpSync` full tree | 19,743 / 16,607 / 17,296 ms (three runs) |
| `wp-content` only (447 files / 15.3 MB) | 2,644 ms |
| `wp-content/database` only (3 files / 0.41 MB) | 24 ms |
| `rm` of a `wp-content` copy | 504 ms |
| MEMFS unzip from the 30 MB snapshot | 4,038 ms |
| Shared host-directory mount restore | 1,167–2,498 ms |

**A.3 — Concurrency.** Multiple independent instances *can* be constructed in one Node process with
real state isolation (`concurrent_boot_total_ms :: 1894`, three concurrent `GET /` → `[200,200,200]`,
mutation in instance 0 invisible to instance 1). But there is **no CPU parallelism**: PHP-WASM runs
synchronously on the JS thread.

| Configuration | Wall time |
| --- | --- |
| 4 instances, same process, sequential | 3,419 ms |
| 4 instances, same process, "concurrent" | 3,847 ms (slower) |
| 4 `worker_threads`, sequential reference | 7,173 ms |
| 4 `worker_threads`, parallel | 2,362 ms → **2.91×** |
| Spawn + boot 4 `worker_threads` | 3,613 ms |

The Playground CLI itself uses `spawnWorkerThread('v1'|'v2')` → `new Worker(...)`, one php-wasm
instance per worker, load-balanced by `createObjectPoolProxy`. CLI `--workers` are request-handling
workers for **one shared site** (shared host mounts, shared native `/internal`, cross-worker file-lock
manager) and cannot be repurposed as per-test sandboxes.

**Note on the 2.91× figure.** It measures four `worker_threads` against sequential Playground
execution of the same CPU-bound work. Section 16's gate measures portable full-suite grading
throughput against the serial wp-env baseline. Different denominators; the first does not bound the
second, and neither establishes nor refutes the gate.

**A.4 — Memory.**

| Observation | Value |
| --- | --- |
| Bare PHP-WASM runtime | 29.3 MB RSS per instance |
| First WordPress instance (incl. one-time WASM compile) | 110–123 MB |
| Marginal per additional WP instance (host-dir mount) | 37.3 MB |
| Per instance with the WP tree unzipped into MEMFS | 218.0 MB |
| RSS across a 10× create/dispose loop | 184.3 MB → 247.0 MB; peak 266.9 MB; 238.4 MB after forced GC |
| `dispose()` latency | 11 ms — but RSS rose 339.9 MB → 526.1 MB, so memory is not promptly reclaimed |

**A.5 — Node and execution mode.** `@php-wasm/node` declares `engines: node >=20.10.0`; CLI docs say
20.18+; external extensions are JSPI-only and need Node 23+. JSPI is **not** on by default even on
Node 24 (`jspi_available :: false` on v24.19.0 without flags) — the CLI respawns itself with
`--experimental-wasm-jspi`, so a direct `loadNodeRuntime` caller silently gets the asyncify build.

**A.6 — `processId`.** `loadNodeRuntime()` requires an explicit `emscriptenOptions.processId` once
more than one instance exists; the first `exp1.mjs` run failed with `Error: PHPLoader.processId must
be set before init`. The default is assigned only under test, because duplicate process IDs break
file locking.

**A.7 — SQL capability.** Against restored WP 7.0.4 with SQLite integration 3.0.0-rc.8:
`{"SHOW_TABLES_n":12, "SHOW_COLUMNS":["ID","post_author","post_date","post_date_gmt"],
"SHOW_INDEX_n":11, "info_schema":"12", "err":""}` — `$wpdb->last_error` empty. The bundled
integration ships the full MySQL-on-SQLite AST driver (`class-wp-mysql-lexer.php`,
`class-wp-mysql-parser.php`, `mysql-grammar.php`), not the legacy translator alone. MySQL as an
actual backing database for Playground CLI 3.1.49 is unwired: `db-engine`/`db-host`/… exist in the
`RunCLIArgs` *type* but are not registered as yargs options, and only `--skip-sqlite-setup` exists.

**A.8 — Host↔PHP transport.** `php.run({code|scriptPath, method, headers, body, env, $_SERVER})`
returns `PHPResponse {text, bytes, errors, exitCode, httpStatusCode, headers}`; `php.runStream()`
returns separate stdout/stderr streams plus an exitCode promise; `php.cli(argv, {env, cwd})` gives
real `$argv`/STDERR and a process exit code. Measured: `runStream :: {"stdout":"OUT1\nOUT2\n",
"stderr":"ERR1\n","exitCode":0}`; `cli :: {..., "exitCode":5}`; request `body` populates
`php://input`.

`post_message_to_js($string)` → `php.onMessage(listener)` works, outside both stdout and the VFS, and
the listener's return value is returned to PHP: `{"msgs":["{\"result\":\"ok\",\"score\":7}"],
"stdout":"reply=ack-from-js","exitCode":0}`. This is the out-of-band channel section 6.4 requires.

Two adapter hazards: `php.run()` **throws** `PHPExecutionFailureError` on any non-zero exit code
(response attached as `.response`) rather than returning it; and both `php.run()` and `php.request()`
are marked `@deprecated` in 3.1.49 in favour of `runStream()`/`PHPRequestHandler`.

**A.9 — Loaded extensions (PHP 8.3.32, default Node runtime).** `Core, date, libxml, openssl, pcre,
sqlite3, zlib, bcmath, calendar, ctype, curl, dns_polyfill, dom, hash, fileinfo, filter, gd, json,
iconv, SPL, session, mbstring, standard, mysqlnd, opcache, exif, mysqli, PDO, pdo_mysql, pdo_sqlite,
Phar, post_message_to_js, random, Reflection, imagick, SimpleXML, soap, tokenizer,
wasm_memory_storage, xml, xmlreader, xmlwriter, zip, Zend OPcache`. **No** pcntl, posix, sockets or
pgsql. intl/xdebug/redis/memcached are opt-in built-ins; external `.so` extensions need JSPI.
Supported PHP versions: 5.2, 7.4, 8.0–8.5, default 8.3.

**A.10 — Networking.** `loadNodeRuntime` calls `withNetworking` unconditionally
(`@php-wasm/node/index.js:1991`). Verified live: `{"curl":"code=200 len=13431",
"wp_remote_get":"HTTP 200 len=13431"}` against `https://api.wordpress.org/`. TLS works because
Playground writes Node's `tls.rootCertificates` to `/internal/shared/ca-bundle.crt` and sets
`openssl.cafile` + `curl.cainfo`. With networking off, Playground sets
`disable_functions=fsockopen,pfsockopen,curl_init,curl_exec,curl_multi_exec,mail` and
`allow_url_fopen=0`.

**A.11 — Localhost servers.** Every `loadNodeRuntime()` starts its own outbound WebSocket→TCP proxy
HTTP server on an ephemeral 127.0.0.1 port. N instances mean N listening servers keeping the Node
event loop alive.

**A.12 — Process spawning.** `proc_open`, `exec`, `shell_exec`, `system` and `popen` all exist and are
enabled, but there is no host shell. With no spawn handler every spawn exits 127; with the stock
`sandboxedSpawnHandlerFactory` only `php`, `ls` and `pwd` (plus `stty size`, `tput cols`, `less`) are
implemented and everything else exits 127. Host binaries are unreachable.

**A.13 — Windows.** Officially supported ("Works across all desktop platforms"), and everything above
ran successfully. Caveats: colon-separated `--mount /host:/vfs` is ambiguous — use
`--mount-dir "/host/path" "/vfs/path"`; a dedicated `FileLockManagerForWindows` emits recurring
`lockWholeFile: unlock failed` warnings during normal runs; open upstream issues #2936
(`--follow-symlinks` broken on Windows), #995 (`php.useHostFilesystem()` broken on Windows), #597
(`zipEntireSite` invalid zip on Windows). Cold cost dominates: end-to-end `build-snapshot` took
**3m15.680s** cold and **2m46.637s** on a second run.

**A.14 — Logging hazard.** The `@php-wasm/logger` singleton writes `info` and `log` severity to
**stdout** (`console.info`/`console.log`) and only `warn`/`error` to stderr; its handlers are private
on the exported singleton. A protocol-only stdout NDJSON supervisor (section 6.3) must override
console methods or construct its own `Logger`.

# Appendix B — `WordPress/wp-bench` trunk facts

Captured 2026-08-16.

**B.1 — CLI.** Exactly one subcommand: `wp-bench run` (`cli.py`, one `@app.callback()` and one
`@app.command()`). Flags today: `--config`, `--suite`, `--model-name`, `--limit`, `--seed`,
`--dry-run`, `--check-reference-solution`, `--check-exploits`, `--test-id`, `--skill`,
`--skills-include-references/--no-…`, `--skills-only`. No `--profile`, no `--workers`.

**B.2 — Environment kinds.** Exactly two: `docker` and `cli` (`config.py:83`,
`kind: Literal["docker","cli"] = "docker"`). `http` is explicitly rejected at config load with a
dedicated message ("planned but not implemented"). Default is `docker` (bare `docker run` of
`ghcr.io/wordpress/wp-bench-grader:latest`), but in practice `grader.wp_env_dir` takes precedence over
`kind` on every code path, and both README and `wp-bench.example.yaml` set `wp_env_dir: ./runtime`.

**B.3 — Verifier transport.** `wp eval-file <verifier_path>` with the JSON payload piped on stdin,
never argv; result parsed from stdout as JSON (`environment.py:147-172`). The PHP entry point reads
`php://stdin` and calls `WP_CLI::error()` / `WP_CLI::line()`, so it cannot run outside WP-CLI. Plugin
path differs by mode: wp-env `…/plugins/runtime/verify-runtime.php`, bare docker
`…/plugins/wp-bench-runtime/verify-runtime.php`.

**B.4 — Issue #39.** **Closed as completed** on 2026-08-15 by merged PR #52. The fix landed as loud
runtime failures rather than config-time rejection: `reset()` now raises `RuntimeError` for any kind
without a reset implementation, and each bare-docker reset step raises on nonzero exit or timeout.
Note an inaccuracy left behind: the inline comment in `environment.py:84-86` claiming "Config
validation rejects this pairing" is false — no cross-field validator for `grader.kind` vs
`run.execution_isolation` exists.

**B.5 — Telemetry today.** `RESULT_SCHEMA_VERSION = "2.1"`. Flat per-test record: `test_id, suite,
type, category, difficulty, metadata, mode, prompt_hash, model, variant,
output{raw_completion,code}, scores{correctness,execution_pass,runtime,static,static_policy_pass},
grader{success,raw,stdout,stderr,timeout}, usage{prompt_tokens,completion_tokens,total_tokens,
cost_usd,latency_ms}, model_call, error`. Run-level metadata: `suite, mode, result_schema_version,
model, grader, dataset, runtime_isolation, scoring_version, seed, limit, selected_test_ids,
continue_on_error, errored_test_ids, usage, scores`. There is **no** terminal-status enum; outcome is
derived from `scores.execution_pass`, and the only non-graded state is a non-null `error` object.
`execution_record_passed` reads `scores.execution_pass`, so null is falsy — and a non-boolean truthy
value would be counted as a pass. This is the constraint section 10.5 is written against.

**B.6 — Reset today.** `wp db reset --yes` followed by a full `wp core install` — two round trips into
the runtime — exactly as section 4 states. Measured upstream at ~1.822 s per test.

**B.7 — Config strictness.** Every config model sets `extra="forbid"`, with the stated rule that every
field is either implemented or rejected loudly. This is why section 12's declarative capability
metadata is an upstream schema dependency.

**B.8 — Concurrency today.** Strictly serial under the default isolation:
`_validate_execution_concurrency` raises when `execution_isolation == "reset_per_test"` and
`execution_concurrency > 1`. Concurrency is only reachable with `execution_isolation: none`.

**B.9 — Open PRs that interact with this design.** #53 (open, unmerged, `perf/template-db-restore`) —
replaces per-test `core install` with a captured-baseline `wp db import -`, ~1.822 s → ~1.18 s per
reset, roughly 35 % of the quantity section 8.3's throughput gate triples. #51 (open, unmerged,
`feat/skills-baseline-reuse`) — `--baseline-from`, the closest existing thing to a completion cache.

**B.10 — Streamed JSONL.** Exists as of 2026-08-15 (PR #49) but as crash-durability only: records
stream to `<artifact>.partial` and are replaced by the canonical `.jsonl` at finalize; nothing reads a
partial back in. `results_io.py` uses `O_APPEND` unbuffered `os.write` with no fsync, so it does not
meet section 11.3's durability contract. There is **no** completion cache, **no** resumable journal,
and **no** trace/span telemetry today.

**B.11 — No Playground work upstream.** Zero code, doc, issue, PR or branch references to Playground
or SQLite anywhere in `WordPress/wp-bench`.

**B.12 — Other.** Default dataset source is HuggingFace (`WordPress/wp-bench-v1`, split `test`), not
the local suite. No HTML report generator exists; reporting is Rich console tables plus a Jupyter
notebook. Version pins are inconsistent between the root dev wp-env
(`WordPress/WordPress#6.9-branch`, PHP 8.4) and the grader runtime actually used for grading
(`WordPress/WordPress#7.0`, PHP 8.2).

# Appendix C — Corpus capability facts

**C.1 — Shape.** 185 execution tests across 29 category files: gb-block-markup 14, abilities-api 13,
rest-api 12, queries 12, connectors-api 10, ai-client 10, roles-caps 8, post-types-taxonomy 8,
caching/database/gb-block-api/hooks/post-meta 6 each, security/cron/media/internationalization/
scripts-styles/settings-options/shortcodes 5 each, comments-users/gb-block-bindings/gb-block-editor/
gb-block-hooks/gb-interactivity-api/mail-url 4 each, gb-font-library/gb-templates-navigation/
rewrite-permalinks 3 each. Assertions are almost entirely arbitrary PHP: 198 `custom_assertion`
entries against 3 `rest_response`. 74/185 tests have a `setup` block, 65/185 a `teardown`.

**C.2 — SHOW statements.** Literal `SHOW TABLES`/`COLUMNS`/`INDEX` appear in exactly one test,
`e-database-006`. A regex scan for `SHOW (TABLES|COLUMNS|INDEX|CREATE|VARIABLES)` over all 185 tests
returns 1 hit.

**C.3 — Driver-flag dependence.** Whether `e-database-006` can pass is determined by an opt-in feature
flag, not by the plugin version: the legacy `WP_SQLite_Translator` omits the `Extra` column from
`SHOW COLUMNS` entirely, so `$columns['id']->Extra` would raise an undefined-property warning.
Playground unconditionally sets `WP_SQLITE_AST_DRIVER` (`boot.ts:410`), which does emulate `Extra` and
`Key_name`/`Column_name`. This is why section 7.3's key carries driver mode.

**C.4 — The real database blocker.** All six `database` tests depend on MySQL DDL in fixture setup,
not just `e-database-006`: each runs `$wpdb->query("CREATE TABLE … bigint(20) unsigned NOT NULL
AUTO_INCREMENT … KEY x (y) ) {$charset_collate}")` with `$wpdb->get_charset_collate()`, and throws
`RuntimeException` if it returns false. DDL signal: 6/6 in `database`, 0 elsewhere.

**C.5 — Version deltas.** Canonical `runtime/.wp-env.json` = `WordPress/WordPress#7.0` + PHP 8.2;
Playground `RecommendedPHPVersion = '8.3'`. Canonical builds tag 7.0.0; Playground's bundled "7.0"
resolves to 7.0.2; current release is 7.0.4. Playground's WordPress is a **source-modified minified
build**: non-default themes removed, akismet deleted, most images/css/js deleted, every
non-`wp-content` PHP file minified. This is the basis of section 7.1's build-identity declared delta.

**C.6 — No PHP-level timeouts on portable.** Playground's WP build regex-deletes `set_time_limit()`
(emscripten has no `setitimer`), and php-wasm's ini sets `max_execution_time = 0`.

**C.7 — The largest cross-cutting amplifier is in the harness, not the corpus.**
`Sandbox::execute_and_verify()` installs an error handler that throws `ErrorException` for **every**
`E_WARNING`, `E_NOTICE`, `E_DEPRECATED` and `E_USER_*`, with no `error_reporting` mask. Any
runtime-specific PHP diagnostic turns a passing test into score 0.

**C.8 — `WP_DEBUG`.** True on canonical (`runtime/.wp-env.json`), which makes `_doing_it_wrong()` and
`_deprecated_*()` raise `E_USER_*`, which C.7 converts to a test error. If the portable baseline omits
it, the same candidate passes on portable and errors on canonical.

**C.9 — Playground platform mu-plugins.** `0-playground.php` is installed unconditionally and
overrides `allowed_redirect_hosts` (returning only wordpress.org / api.wordpress.org) and
`got_url_rewrite`, on every request.

**C.10 — Permalinks.** Playground sets `permalink_structure` in the database at boot and flushes
rewrite rules late on `init`; canonical's `wp db reset` + `wp core install` leaves permalinks plain. A
live fixture delta for the 3 `rewrite-permalinks` tests and anything reading `$wp_rewrite`.

**C.11 — Collation.** `$wpdb->has_cap('collation')` is false under SQLite, so wpdb's
invalid/oversized-text stripping is skipped — writes MySQL would reject silently succeed on portable.

**C.12 — Silent rewriting below the adapter.** The SQLite integration rewrites `LIKE` escape
characters, maps `SIGNED`/`UNSIGNED` to `INTEGER`, and emulates `FIELD()`, `FOUND_ROWS()` and
`SQL_CALC_FOUND_ROWS` via user-defined functions — all inside the db drop-in, below the adapter
boundary. Roughly 5 tests reach MySQL-shaped SQL implicitly through query APIs
(`e-queries-002/003/005/012`, `e-comments-users-002`); 3 more use raw but ANSI-portable SQL
(`e-queries-011`, `e-rest-api-011`, `e-settings-options-002`).

**C.13 — No outbound HTTP in the corpus.** `wp_remote` 0 occurrences, `WP_Http` 0 occurrences across
all 185 tests. All 10 ai-client tests exercise filters and in-process objects; all 10 connectors-api
tests manipulate `WP_Connector_Registry` in memory; only 3 assertions are `rest_response`, and those
are internal `WP_REST_Server` dispatch.

**C.14 — DB-error output corruption.** SQLite raises errors on constructs MySQL accepts
(`new_not_supported_exception()`, "MySQL query not supported. Cause: %s" — e.g. `CREATE TABLE … AS
SELECT`, unknown cast types), and `WP_SQLite_DB::print_error()` prints raw HTML into the output stream
when `show_errors` is on.

**C.15 — No WP-CLI in test content.** `WP_CLI` 0 occurrences across 185 tests. Dependence is confined
to the harness transport and the reset path.

**C.16 — No browser dependence.** All 4 `gb-interactivity-api` tests call server-side PHP only and
assert on returned PHP strings/arrays; same for `scripts-styles`. `gb-block-markup` (14 tests, the
largest category and the only one with broad authored exploits) is the lowest-risk category: zero DB,
filesystem, network or object-cache dependence.

**C.17 — Absent risks.** No multisite (`is_multisite` 0, `switch_to_blog` 0), no real cron spawning,
no image-editor/Imagick work, no timing-tolerance assertions (`sleep(` 0, `microtime` 0). Exactly one
test touches the filesystem (`e-media-004`), depending on libxml/DOM being compiled in — which it is
(A.9).

**C.18 — Fixture-state sensitivity.** Roughly 10–15 tests depend on the exact just-installed fixture
state `wp core install` produces (e.g. `e-database-001` asserts a new auto-increment id > 1, which
depends on the single seeded row being id 1; `e-rest-api-011` captures `SELECT MAX(ID) FROM
wp_users`). The portable immutable baseline must reproduce that state, not approximate it.

**C.19 — SAPI.** `php_sapi_name()` is always `'cli'` in Playground, including for web requests — a
semantic difference from the canonical wp-env web/CLI split.

# Appendix D — `agent-skills` coherence facts

**D.1** This repo pins Playground CLI **3.1.45** (`docs/superpowers/specs/2026-07-17-…:20`,
`skills/wp-playground/SKILL.md:35`, `skills/wp-playground/references/cli.md:5`). Upstream is at
3.1.49. This document names no Playground version, per section 15.5.

**D.2** The pin is enforced as a hard-coded CI assertion:
`eval/harness/release-conformance.mjs:221-228` requires the literal strings `3.1.45`,
`@wp-playground/cli@3.1.45 start`, `--xdebug`, `--workers=auto`,
`--wordpress-install-mode=install-from-existing-files-if-needed` and `"8.5"` in
`skills/wp-playground/references/cli.md`.

**D.3** The repo documents `--workers` as request workers inside one Playground server instance
(`references/cli.md:45`, "`--workers=auto` uses one worker per CPU core minus one. Both are
server-only"). Section 8.2's `--grader-workers` is a different unit and is named differently for this
reason.

**D.4** The repo documents no Playground **Node API** whatsoever. Its entire Playground surface is the
CLI plus the browser `window.playground` / `window.playgroundSites` clients. This design's core
mechanism has zero supporting guidance here.

**D.5** The repo's two-floor compatibility policy (`docs/compatibility-policy.md:9-10`) is WP 6.9+ /
PHP 7.2.24+ by default and WP 7.0+ / PHP 7.4+ for 7.0-only APIs. Playground's audited PHP choices are
5.2, 7.4, 8.0–8.5, so **PHP 7.2.24 — the repo's default floor — is not selectable**, and the portable
profile structurally cannot exercise it.

**D.6** The repo corroborates section 18's rejection of per-test CLI processes:
`references/cli.md:73`, "`run-blueprint` exits after execution."

**D.7** The repo documents snapshots only as a build-time CLI artifact (`build-snapshot --blueprint=…
--outfile=site.zip`, then "load the ZIP in a fresh Playground instance"), never as runtime export or
per-test import.

# Appendix E — Refuted claims: do not re-litigate

These were raised during review and did **not** survive adversarial verification. Recorded so future
revisions do not spend effort on them.

| Claim | Why it failed |
| --- | --- |
| Stop-on-persistence-failure contradicts the cancellation drain | The contradiction is not in the text. They are distinct paths and nothing routes one through the other; the drain is already hedged to "persistable" observations |
| The completion cache key has no draw index, so multi-sample / temperature>0 generation collapses silently | Conditional on a feature neither wp-bench nor this design proposes. `records.py` emits one `output.{raw_completion,code}` per test at schema 2.1; there is no pass@k or draw-ordinal concept anywhere |
| The five parity classes are not exhaustive and invert the meaning of exploit results | Category error. The classifier measures agreement between two runtimes, not benchmark health. An exploit uncaught on both profiles genuinely *is* runtime parity; whether the grader can be cheated is what the exploit check measures. Only the naming ambiguity survived, and section 12 now states it |
| Capacity reduction is one-way with no floor; deterministic infra failures are retried per test rather than aborting the run | Every leg is either explicitly deferred with obligations attached (section 8.2 requires the heuristic be reported in telemetry and covered by fixtures; section 20 lists the memory floor) or guarded by text the finding did not engage |
| Harness version in the cache key breaks the cross-runtime and parity guarantees | The scoping qualifier is explicit, and section 9's promise is profile-independence, not upgrade-independence. Only the undefined-term half survived, and section 9 now enumerates the inputs |
| `ai-client` and `connectors-api` make outbound HTTP calls to providers during grading | Factually false. `wp_remote` 0 and `WP_Http` 0 across all 185 tests (C.13) |
| The corpus depends on WP-CLI at test-content level | `WP_CLI` 0 occurrences across 185 tests. WP-CLI dependence is confined to the harness transport and the reset path (C.15) |
| `gb-interactivity-api` requires a browser or JS execution | All 4 tests call server-side PHP only and assert on returned PHP strings and arrays (C.16) |

One nuance worth keeping from the last three rows: the *corpus* makes no outbound HTTP calls, which
does not weaken section 7.5's network policy — it strengthens it. Networking is on by default for
untrusted candidate code while delivering zero benchmark benefit.

# Sources

- [WordPress/wp-bench](https://github.com/WordPress/wp-bench) @ trunk, 2026-08-16 —
  `python/wp_bench/{cli,config,core,datasets,environment,records,results_io}.py`,
  `runtime/{verify-runtime.php,src/class-sandbox.php,.wp-env.json}`,
  `datasets/suites/wp-core-v1/execution/*.json`; issues #39 (closed 2026-08-15 via #52);
  PRs #49 (merged), #51 (open), #52 (merged), #53 (open)
- [WordPress/wordpress-playground](https://github.com/WordPress/wordpress-playground) @ trunk —
  `packages/playground/cli/src/run-cli.ts`, `packages/playground/wordpress/src/{boot.ts,
  platform-mu-plugins.ts}`, `packages/playground/wordpress-builds/`, `packages/php-wasm/node/`;
  issues #597, #995, #2936
- [WordPress Playground Node API](https://wordpress.github.io/wordpress-playground/api/node/)
- [WordPress/sqlite-database-integration](https://github.com/WordPress/sqlite-database-integration) —
  bundled 3.0.0-rc.8 (AST driver); `develop` 2.2.16 (legacy translator)
- Installed npm tree at `@wp-playground/{cli,client,common,wordpress}` and
  `@php-wasm/{node,universal,logger}` 3.1.49
- Empirical experiments `exp1.mjs`–`exp6.mjs`, review host as described in Appendix A
- In this repository: `docs/wp-bench-integration.md`, `docs/compatibility-policy.md`,
  `docs/superpowers/specs/2026-07-17-wordpress-skills-release-refresh-design.md`,
  `skills/wp-playground/references/cli.md`, `eval/harness/release-conformance.mjs`
