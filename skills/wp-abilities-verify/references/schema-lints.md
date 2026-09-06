# Schema Lints

Static lints against an ability's `input_schema` — and, for Lint 7,
its `output_schema` as well. Schema hygiene is about *agent
legibility*: orchestrating agents read the schema to figure out how to
call the ability. A schema that's hard to parse, ambiguous, or
misleading wastes turns even when the ability itself works.

These lints are seven small principles. Apply them by reading the
schema, not by mechanically grepping — most plugins use enough
formatting variety that grep recipes drift.

## Lint 1 — `additionalProperties: false` for object schemas

For top-level `'type' => 'object'` schemas, declare
`'additionalProperties' => false` unless you deliberately accept
extras. Without this, an agent passing a typo (`par_page` instead of
`per_page`) gets accepted silently and falls through to the backing,
which ignores the unknown key.

- `additionalProperties: false` declared → OK.
- `additionalProperties: true` declared → WARN, unless the schema is
  for genuinely free-form metadata (payment custom fields, form
  free-text); document the reason inline.
- Not declared on an object schema → WARN.
- Non-object root (string with enum, integer, etc.) → N/A. The lint
  applies only to objects.

## Lint 2 — every required field has a non-empty description

For each entry in `required`, the matching `properties` entry must
declare a non-empty `description`. Required fields are where agents
most need guidance; an opaque required key forces the agent to guess
from the field name alone. Empty / missing → FAIL.

Optional-field descriptions are nice-to-have — absence is WARN.

## Lint 3 — enums are non-empty

`'enum' => []` accepts no values, rejecting every input. Almost always
a bug. → FAIL.

A single-value enum (`'enum' => [ 'pending' ]`) is legal but unusual;
WARN and prompt for review — often a copy-paste that lost the other
values.

## Lint 4 — no `$ref`

Agents read the schema via REST introspection. A `$ref` forces the
agent to follow a reference to see the field shape — wastes a turn and
often breaks because the referenced schema isn't in the same document.
Inline the shape instead.

Any `'$ref'` in the schema → FAIL.

## Lint 5 — defaults are statically constant

Each `'default'` value must evaluate to the same shape on every call:

- Scalar literals — `true`, `false`, integer, float, quoted string,
  `null` → OK.
- Empty or all-literal arrays — `[]`, `array()`, `[ 'a', 'b' ]` → OK.
- Literal cast to an empty object — `(object) array()`, `(object) []`
  → OK. This is the recommended top-level default for zero-arg-allowed
  abilities; see
  `../../wp-abilities-api/references/input-schema-gotchas.md` §4.
- `new stdClass()` with no arguments → OK.
- A function call (`gmdate('c')`, `wp_generate_uuid4()`, `time()`),
  variable reference, or other computed expression → FAIL.

The principle: defaults that vary per call are both non-deterministic
and surprising to agents that expect defaults to be static.

## Lint 6 — `reference_ability: true` must be executable with empty input

If an audit doc is provided and an ability has `reference_ability: true`,
it must work with `execute([])` — it is the smallest, safest bootstrap
call an implementer lands first. The complete contract is an object-root
schema with an empty-object root `default` and no required inputs. Optional
property definitions are allowed. Any violation FAILs:

1. **A missing `input_schema` altogether.** This is the one that reads
   like a pass and is not. `WP_Ability::validate_input()` guards on
   `null === $input`, not `empty( $input )`, so a schema-less ability
   accepts `execute()` and `execute( null )` but rejects
   `execute( array() )` with
   `WP_Error( 'ability_missing_input_schema' )` — "Ability "%s" does not
   define an input schema required to validate the provided input."
   The same trap fires over REST: a run body of `{}` resolves the input
   to `null` and succeeds, while `{"input": {}}` — what many MCP and
   agent clients send for a no-argument tool — resolves to `array()` and
   fails. Declare `'input_schema' => array( 'type' => 'object',
   'properties' => array(), 'default' => (object) array() )` on any
   reference ability instead of omitting it.
2. **A root type other than `object`.** A no-argument agent call supplies an
   object; a scalar or array root does not describe that call.
3. **A missing or non-object root `default`.** The schema must carry
   `'default' => (object) array()` in PHP (`default: {}` in the audit YAML), so
   the default remains a JSON object rather than becoming `[]`.
4. **A non-empty `input_schema.required` array.** `execute([])` cannot satisfy
   a required property. An absent or empty `required` is valid.

So the lint is: `reference_ability: true` FAILS unless all three schema-shape
requirements hold and `input_schema.required` is absent or empty. A list
ability with optional filters remains a valid reference ability.

(No audit provided → this lint is skipped — no reference ability is
declared.)

## Lint 7 — `format` values the JS client can compile

The PHP and JS validators enforce different `format` lists.
`rest_validate_value_from_schema()` handles `hex-color`, `date-time`,
`email`, `ip`, `uuid`; `@wordpress/abilities` registers `date-time`,
`email`, `hostname`, `ipv4`, `ipv6`, `uri`, `uuid` with AJV. A format
outside the client's list is not merely unenforced there — AJV refuses
to compile the schema, the client validator catches the throw and
returns "Invalid schema provided for validation.", and every
client-side execution of that ability fails. `@wordpress/core-abilities`
re-registers every REST-exposed ability in the JS registry with its
schemas intact, so REST exposure is what puts a schema in front of that
validator.

- A format in both lists (`date-time`, `email`, `uuid`) → OK.
- `uri` → OK on Gutenberg 23.6+ clients; WARN below that, where it is
  exactly the compile failure `WordPress/gutenberg#79555` fixed.
- `hex-color` or `ip` on an ability that resolves to REST-exposed →
  FAIL. On an unexposed ability → WARN: nothing breaks today, and
  turning exposure on later breaks it.
- No `format` declared → N/A.

Applies to `output_schema` too — the client validates the result against
it on the way back.

## Cross-reference: gotchas 1-3 (callback hardening) and gotchas 4-5 (structural)

Static lints catch shape; the five runtime gotchas in
`../../wp-abilities-api/references/input-schema-gotchas.md` split into
two kinds.

Gotchas 1-3 need defensive code in the execute callback —
`array_key_exists` instead of `isset`-only for property defaults,
pagination key translation, ID validation that accepts `"0"`. These
are runtime behaviors the callback itself must handle; static schema
lints can't enforce them.

Gotchas 4 and 5 ARE structural, and the lints carry the enforcement.
Gotcha 4 — the direct vs indirect invocation strictness — is what
motivates the `(object) array()` top-level default that Lint 5
explicitly accepts. Gotcha 5 — the server and client `format` lists
don't match — is Lint 7.

## Output format

```markdown
## Schema lints

| Ability | Lint | Result | Detail |
|---|---|---|---|
| <ability> | additionalProperties (object schemas) | WARN | not declared on object schema |
| <ability> | required-field descriptions | OK | 3/3 required fields documented |
| <ability> | enum non-empty | OK | no enums |
| <ability> | no $ref | OK | inline |
| <ability> | static defaults | FAIL | `created_at` uses `gmdate('c')` |
| <ability> | reference_ability implies no required | N/A | not reference ability |
| <ability> | client-compilable formats | FAIL | `color` uses `format: hex-color`; ability is REST-exposed |
```

A FAIL on any lint flips that ability to FAIL in the run summary.
WARNs surface but don't block.
