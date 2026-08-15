# Exposure checks

Annotation correctness asks "does this ability do what it claims?". Exposure asks a different
question: **"who can see it, and did anyone decide that on purpose?"**

The two are independent. An ability can be annotation-clean, schema-clean, permission-clean, and
still be wrong because it became discoverable to external agents as a side effect of a metadata
default the author never read.

## Why this is a live check, not a hypothetical

Exposure defaults have changed twice in the current release window, in opposite directions:

| Layer | Rule | Since |
|---|---|---|
| Core REST | `show_in_rest = meta.show_in_rest ?? meta.public ?? false` | WP 7.1 |
| MCP Adapter | `meta.mcp.public ?? meta.public ?? false` | adapter 0.6.0 |
| MCP Adapter | `meta.mcp.public` only, no inheritance | adapter ≤ 0.5.0 |

The consequence: a plugin that added `meta.public => true` to get onto the REST namespace
acquires MCP exposure the moment the site upgrades the adapter to 0.6.0+ — with no change to the
plugin. The adapter also honors `meta.public` on WP 6.9 and 7.0, where core still ignores it, so
the MCP exposure can land on sites where the REST exposure the author wanted has not.

## What to check

### 1. Every exposed ability has a real permission callback

Exposure is not authorization, so this is the check that actually matters. For each ability
resolving to exposed on any channel, apply the `permission-roundtrip.md` shapes and **fail** on
Shape E (literal `true`) or a callback that returns `true` unconditionally. An unexposed ability
with a weak callback is a WARN; an exposed one is a FAIL, because the discovery surface makes it
reachable by anything that can enumerate.

### 2. Exposure is declared, not inherited by accident

For each registered ability, record the raw keys — `meta.public`, `meta.show_in_rest`,
`meta.mcp.public` — as *present/absent*, not just their resolved boolean. Absent is the finding.

- `meta.public => true` **with no `meta.mcp.public` key** → WARN: "MCP exposure is inherited, not
  declared. On adapter 0.6.0+ this ability is served by the default MCP server. Add an explicit
  `meta.mcp.public` (either value) to state the intent."
- `meta.public => true` on a plugin whose readme/compatibility targets WP < 7.1 → WARN: the flag
  does nothing for REST on the target version but still drives MCP.

The WARN is deliberately not a FAIL. Inheriting `meta.public` is legitimate and often intended —
what is not legitimate is doing it silently.

### 2a. Registration matches the audit's exposure decision

**Only runs when an audit doc was supplied.** The comparison is against the `exposure` object in
`proposed_abilities` (canonical schema:
`../../wp-abilities-audit/references/audit-schema.md`), which carries `agent_facing` (bool),
`mcp` (`allow` / `deny` / `inherit`), and `rationale`.

| Audit says | Registration resolves to | Result |
|---|---|---|
| `agent_facing: true` | no exposure key at all | FAIL — the audit and the registration disagree |
| `agent_facing: false` | effectively REST- or MCP-exposed | FAIL — exposed against an explicit decision not to |
| `mcp: deny` | effectively MCP-public | FAIL — the opt-out was decided and not written |
| `mcp: allow` | not MCP-public | WARN — decided but not implemented; may be deliberate sequencing |
| `mcp: inherit` | anything | INFO — record the resolved value against the project's adapter version |

**When the `exposure` object is absent, every rule in this subsection degrades to WARN, and the
warning is about the audit, not the registration.** `exposure` was added to the canonical schema
on 2026-08-15; audits authored earlier simply do not carry it, and per the canonical's "Known
limitations" a missing `exposure` MUST NOT FAIL. Report it as
"audit predates the `exposure` field — exposure intent unverifiable" and move on. Do **not** read
an absent object as `agent_facing: false`; it carries no intent either way, and treating silence
as a decision is how this check would start manufacturing findings.

Same posture when no audit was supplied at all: §2's declared-vs-inherited WARNs still apply,
this subsection is skipped entirely, and the report says so rather than passing it silently.

### 3. Exposure matches the annotation risk profile

Cross-reference the annotations already parsed for `annotation-correctness.md`:

- `destructive: true` **and** effectively MCP-public → FAIL unless the audit records
  `exposure.mcp: allow` with a non-empty `exposure.rationale` for that ability. That pairing is
  what the canonical schema defines as an explicit allow-list decision; `mcp: inherit` does not
  qualify, because inheriting `meta.public` on adapter 0.6.0+ is exactly the default nobody read.
  Destructive abilities reaching the default MCP server is the shape that turns a discovery leak
  into a real incident.
  - No audit supplied, or an audit with no `exposure` object → **WARN, not FAIL**, worded as
    "destructive ability is MCP-public with no recorded allow-list decision." The finding is real
    and worth surfacing; the FAIL is reserved for the case where an audit exists, carries the
    field, and contradicts the registration.
- `readonly: null` (unset) and effectively public → WARN. Agents read annotations to plan; an
  exposed ability with unknown behavior is worse than an unexposed one.

### 4. Default-server capability floor (runtime mode, informational)

If the plugin ships or requires the MCP adapter's default server, note that its three built-in
abilities and the HTTP transport all gate on `read` by default. Report it once as INFO with the
count of effectively-MCP-public abilities: "N abilities are reachable by any Subscriber-level
account through the default server." Do not FAIL on it — it is a site configuration decision, not
a plugin defect — but a plugin that expects to be installed on multi-user sites should be told.

## Runtime enumeration

Static parsing gives you the declared keys. Runtime gives you the resolved truth, including
anything a filter changed after registration:

```bash
# Effective REST exposure (WP 7.1+ resolution applied by core).
wp eval 'foreach ( wp_get_abilities() as $a ) {
    $m = $a->get_meta();
    printf( "%s public=%s show_in_rest=%s mcp=%s\n",
        $a->get_name(),
        var_export( $m["public"] ?? null, true ),
        var_export( $m["show_in_rest"] ?? null, true ),
        var_export( $m["mcp"]["public"] ?? null, true )
    );
}'
```

On WP 7.1+ the same set can be filtered server-side:

```bash
wp eval 'print_r( array_keys( wp_get_abilities( array( "meta" => array( "public" => true ) ) ) ) );'
```

Remember that this query does **not** return abilities exposed only via an explicit
`meta.mcp.public => true`, and on adapter 0.6.0+ the MCP-served set is the union of both minus
explicit opt-outs. Compute it rather than assuming either key alone is the answer.

## Report shape

Add an `## Exposure` section to the report, between "Permission gates" and "Schema lints":

```
## Exposure

| Ability | public | show_in_rest | mcp.public | Effective REST | Effective MCP | Audit | Result |
|---|---|---|---|---|---|---|---|
```

Fill "Effective MCP" against the adapter version the project depends on, and state that version
in the section header. A verdict computed against the wrong adapter version is worse than no
verdict, because it reads as confirmation.

The "Audit" column holds the recorded decision — `agent_facing/mcp` from the audit's `exposure`
object (e.g. `true/allow`), `—` when no audit was supplied, or `n/a (pre-2026-08-15 schema)` when
the audit carries no `exposure` object. Those last two are not verdicts and must not be rendered
as PASS; the "Result" column for such rows is the WARN from §2a.
