# Annotation Correctness

The adversarial core of this skill: verify what the annotation claims
by reading the callback. A `readonly: true` ability that actually
writes is a security and UX disaster, and unit tests don't catch it
because the mock looks just like the real writer.

## Why this matters

Agents plan actions on the basis of the annotations they introspect.
If an ability is annotated `readonly: true`, an orchestrator will
confidently invoke it in a dry-run, speculative exploration, or
multi-agent fan-out without thinking twice — because `readonly` means
"can't break anything".

A `readonly: true` ability that actually writes is therefore:

1. **A security hazard** — agents will invoke it in contexts where
   side effects are forbidden.
2. **A UX disaster** — the agent's mental model of what happened
   diverges silently from reality.
3. **Undetectable at the annotation layer** — the annotation says
   `readonly: true`; nothing in the registration forces it to be true.

Unit tests won't catch this class of bug because the mock the test
constructs looks just like the real writer. What catches it is reading
the execute callback body and comparing what it does against what the
annotation says it does.

## What each annotation promises

| Annotation | What Core promises |
|---|---|
| `readonly: true` | "If true, the ability does not modify its environment." |
| `destructive: false` | "The ability performs only additive updates." Conversely `destructive: true` means it "may perform destructive updates to its environment" (both quoted from the `destructive` annotation in `class-wp-ability.php`). |
| `idempotent: true` | Repeated calls with the same arguments produce no additional effect on the environment (per the `idempotent` annotation's docblock in `class-wp-ability.php`). |

**Skill policy:** apply Core's promise literally. `readonly: true` prohibits
every environmental mutation, including read-through cache writes such as
`set_transient()` and observability timestamps such as `last_read_at`. An
inline `verify-ignore` may suppress a syntactic false positive only after the
reviewer proves that the flagged call does not modify the environment.

These overlap but are not redundant: `readonly` is the strictest;
`destructive: false` is weaker but still narrow (writes are OK only so
long as they are *additive*); `idempotent` is orthogonal (a POST that
writes the same row twice is both "writes" and "idempotent").

The Abilities REST run controller operationalizes annotations into
HTTP method routing (`readonly: true` → GET, `destructive && idempotent`
→ DELETE, otherwise POST — see
`WP_REST_Abilities_V1_Run_Controller::validate_request_method()`). That
mapping is the load-bearing semantic; verify checks that each
callback's behavior is consistent with how the routing will treat it.

## How to verify

For each ability, locate the `execute_callback` body (see
`static-enumeration.md` step 4), then:

1. **Read the callback end-to-end.** Form a model of what it actually
   does. Don't rely on pattern-matching alone.
2. **Compare to the claim.** A `readonly: true` callback that writes
   anywhere — the database via `$wpdb`, options / post / user / term /
   comment writes, filesystem, cron schedules, or non-GET HTTP/REST
   delegates — FAILs readonly. For `destructive: false`, hold the
   callback to core's actual promise — "the ability performs only
   additive updates" — rather than to a verb list:
   - **FAIL** when the callback removes or reverses existing state:
     deletes, trashes, refunds, voids, cancels; `$wpdb->delete`,
     `wp_delete_post`, `wp_trash_post`, `delete_option`,
     `delete_post_meta`.
   - **WARN** when the callback overwrites existing state in place:
     `update_option()` on a key that already holds a value,
     `wp_update_post()` / `wp_update_user()` / `wp_update_term()`
     against an existing row, `update_*_meta()` replacing a set value,
     `$wpdb->update` / `$wpdb->replace`. Replacing a prior value the
     caller can no longer recover is not an additive update. It is a
     WARN rather than a FAIL because static reading usually can't tell
     whether the target already had a value.
   - **OK** for genuinely additive writes: creating a new row
     (`wp_insert_post`, `$wpdb->insert`, `add_option` / `add_post_meta`
     on an absent key), appending to a log, or populating a field that
     had no prior value.

   A FAIL here — or a WARN you resolve by confirming the write is
   non-additive — means `exposure-checks.md` §3 never evaluated this
   ability against its destructive + MCP-public gate, because the
   registration claimed `destructive: false`. Re-run that check against
   the corrected annotation before reporting the exposure section
   clean. A WARN left unresolved stays a WARN: say so in the evidence
   column rather than rewriting the annotation on its strength.

   An `idempotent: true` callback whose environmental effect
   *accumulates* per call (counters, append-only logs, per-call cron
   schedules) FAILs idempotent.
3. **Record evidence.** Cite file + line of the offending pattern so a
   reviewer can jump straight to it.

Use grep or ripgrep to surface *candidates*. Common writes worth
looking for:

```text
$wpdb->update / insert / delete / replace
update_option / add_option / delete_option
wp_insert_post / wp_update_post / wp_delete_post
update_post_meta / update_user_meta / update_term_meta
->save / ->delete / ->set_status / ->add_*
wp_remote_post / wp_remote_delete
file_put_contents / wp_upload_bits / unlink / rename
wp_schedule_event / wp_schedule_single_event
```

Treat the list as a starting set, not a checklist. Plugin vocabularies
vary — domain-specific verbs (`->markAsPaid`, `->commit`, `->refund`)
and framework patterns (Doctrine `->persist`, queue `->dispatch`) won't
appear above. Once you've grepped for candidates, read the callback to
confirm whether each hit is actually a write and whether it
contradicts the annotation in context.

## Known blind spots

Static reading + grep can't reach every write. A static-mode PASS
means "no obvious-shape violations," not "verified write-free."

| Blind spot | Why static misses it | Mitigation |
|---|---|---|
| Indirected service writes — `$repo->persist()`, `$service->commit()`, custom verbs. | Any finite verb list drifts; domain vocabulary varies. | Inspect callbacks that touch custom services or repositories. |
| `do_action()` whose listeners write. | Provenance ambiguity: ability looks clean; system mutates state in a listener. | Audit listeners on the action. If any writes, downgrade or split. |
| Implicit core hooks fired by WP API calls — `wp_insert_post()` fires `save_post`; `update_option()` fires `updated_option`; `wp_create_user()` fires `user_register`; etc. | The WP API call IS the write; the hooks fire automatically as a side effect. Agents looking for `do_action()` won't see this. | Treat any WP write-API call as a write regardless of whether the callback also calls `do_action()`. |
| Action Scheduler / deferred writes — `as_schedule_single_action()`, `WC()->queue()->schedule_single()`, custom job dispatchers. | The callback returns cleanly with no immediately visible DB mutation; the durable write lands later in the AS tables. A static grep for `$wpdb->insert` won't catch it. | Treat scheduler dispatches as writes. The "no additional effect on the environment" promise of `idempotent: true` is violated by accumulating queued jobs even if the immediate return value is constant. |
| Lifecycle-hook listeners that write — `wp_before_execute_ability` / `wp_after_execute_ability` (6.9+), `wp_ability_execute_result` (7.1+). | Core fires these around the callback, not from it, so reading the callback body end-to-end never surfaces them. | Grep the plugin for listeners on all three. One that writes makes a `readonly: true` ability write even when the callback is clean; `wp_ability_execute_result` also reshapes the return value before output validation. |
| Args rewritten by `wp_register_ability_args` (6.9+). | The filter runs after the array literal the enumerator read and before the ability is instantiated, so the declared annotations are not necessarily the registered ones. | See `static-enumeration.md` "Limits of static enumeration". When a listener exists, the static annotation verdict is advisory and runtime mode is required. |
| Variable-built HTTP methods on delegate helpers. | Static can't follow runtime values. | Treat callers of helpers whose default method isn't `GET` as suspect. |
| Tautological capability gates — `current_user_can('read')` on a "private" ability. | The cap looks valid; subscribers happen to hold it. | Cross-reference the permission roundtrip — subscribers should be denied. |

For high-stakes plugins, run runtime mode (see `runtime-harness.md`)
before landing — it catches some blind spots via twin-invocation diff
and live state inspection.

## Suppressing false positives

When a pattern merely looks like a write but provably does not modify the
environment, suppress the static match with an inline comment on the offending
line. Do not suppress cache population, tracking timestamps, or diagnostic log
writes: each changes the environment and contradicts `readonly: true`.

```php
// verify-ignore: readonly -- pure in-memory test double; no state escapes this call.
$test_double->save();
```

Format: `// verify-ignore: <annotation> -- <reason>`. Legal annotation
names: `readonly`, `destructive`, `idempotent`, `all`. Narrower is
better than `all`.

## Runtime check complement

For `idempotent: true` abilities, runtime mode adds a heuristic: invoke
twice with the same input and compare. See `runtime-harness.md`
Check 6. Differing returns are a *signal* to inspect, not a verdict —
under core's definition, the question is whether the *environment*
changed, not whether the *return value* matches. A response that
embeds a per-call timestamp / nonce / random ID is fine; a response
that reflects a counter that grew between calls is not.

## Report format

Each finding gets one row in the run's "Annotation correctness" table:

```markdown
| Ability | Claim | Result | Evidence |
|---|---|---|---|
| myplugin/get-things | readonly=true | OK | callback reads only |
| myplugin/get-things-with-counts | readonly=true | FAIL | `src/Abilities/Things.php:142`: `$wpdb->update( $table, ... )` |
| myplugin/submit-thing | destructive=false | OK | `wp_insert_post()` only; additive |
| myplugin/set-thing-status | destructive=false | WARN | `src/Abilities/Things.php:88`: `update_option()` overwrites an existing value in place |
| myplugin/submit-thing | idempotent=false | OK | check only applies when idempotent=true; false annotation acknowledged |
```

The evidence column MUST cite file + line so a reviewer can jump
straight to the issue.
