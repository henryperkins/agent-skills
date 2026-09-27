# Static Enumeration

Enumerate a plugin's abilities from source, with no running
environment. Static enumeration is necessarily best-effort — PHP's
dynamism (variable indirection, runtime-conditional registration)
means a complete inventory requires a live raw-registry enumeration.
`wp_get_abilities()` is an ecosystem-filtered view and can omit correctly
registered abilities. In runtime mode, compare source with both surfaces;
static drives the diff so the reviewer knows where to look.

## Typical registration shape

```php
wp_register_ability(
    '<plugin-slug>/<ability-name>',
    array(
        'label'               => __( '...', '<text-domain>' ),
        'description'         => __( '...', '<text-domain>' ),
        'category'            => '<category-slug>',
        'input_schema'        => array( /* ... */ ),
        'execute_callback'    => array( self::class, 'execute_my_ability' ),
        'permission_callback' => array( self::class, 'check_permission' ),
        'meta'                => array(
            'annotations' => array(
                'readonly'    => true,
                'destructive' => false,
                'idempotent'  => true,
            ),
            'show_in_rest' => true,
        ),
    )
);
```

## Step 1 — find every registration call

```bash
grep -rn --include='*.php' 'wp_register_ability\s*(' <plugin-root>/
```

Zero hits → return a clear "no abilities registered" report per
SKILL.md "Failure modes." Don't fabricate an empty inventory.

## Step 2 — extract each ability name

The first argument is the ability name — usually a literal string.
Real-world formatting splits the call across lines (the example
above is itself multi-line), so single-line regexes miss common
cases. Use a multi-line tool:

```bash
# ripgrep with --multiline + PCRE2 captures the name regardless of line break:
rg --multiline --pcre2 --type=php -n \
   "wp_register_ability\s*\(\s*['\"]([^'\"]+)['\"]" <plugin-root>/

# Fallbacks: pcregrep -M, perl -0777.
```

If the first argument is a variable or constant
(`wp_register_ability( $name, ... )`,
`wp_register_ability( MyPlugin\NAME, ... )`), trace it: a recent
assignment in the same function or a class constant usually resolves;
a name computed in a loop won't, in which case flag the limitation and
recommend runtime mode for authoritative enumeration.

## Step 3 — extract the annotation block

Annotations live at `meta.annotations.{readonly,destructive,idempotent}`.
For each registration, read the array literal forward until the
matching close. Common shapes:

- Multi-line literal (most common).
- Short-form one-liner.
- Helper method (`'annotations' => self::annotations_for_read()`) —
  resolve the helper if it returns a literal; otherwise mark
  `<unresolved>` and run the adversarial check against the callback
  alone.
- Class constant (`'annotations' => self::READONLY_ANNOTATIONS`) —
  resolve the constant.

Record `ability_name → declared_annotations`.

## Step 4 — follow `execute_callback` to its body

`execute_callback` is one of:

```php
'execute_callback' => array( self::class, 'execute_get_things' ),
'execute_callback' => array( My_Class::class, 'execute_get_things' ),
'execute_callback' => array( $this, 'execute_get_things' ),
'execute_callback' => 'my_plugin_execute_get_things',  // top-level function
'execute_callback' => function ( $input ) { /* ... */ },  // closure
```

Resolve the reference to its source location: file + start line + end
line. The annotation-correctness, schema-lint, and permission checks
all operate on that byte range.

## Limits of static enumeration

Cases where the inventory is incomplete or ambiguous:

- Variable-indirected names (`foreach` over a slug list).
- Variable-indirected annotations (built from config).
- Conditional registration (`if ( feature_enabled() )`).
- Variable-indirected callbacks (`array( $this, $callback_name )`).
- Args rewritten by `wp_register_ability_args` (core 6.9+). The filter
  runs on the whole `$args` array after the literal above and before the
  ability is instantiated, so a listener can replace the annotations,
  `meta.public` / `meta.mcp.public`, and the permission and execute
  callbacks. Grep for it — and note that the plugin is not the only
  possible source; any other plugin on the site can register one, and no
  priority is guaranteed to run last:

  ```bash
  rg -n --type=php "wp_register_ability_args" <plugin-root>/
  ```

  When any listener is found, the static annotation and exposure
  verdicts are advisory only and runtime mode is required for an
  authoritative reading.

Record each in the report's `### Limitations` subsection under `## Static inventory`
and recommend a runtime-mode rerun for the authoritative inventory.

## Output format

```markdown
## Static inventory

Found <N> ability registrations across <M> files:

| Ability | Source file | Registration line | Callback file | Callback lines |
|---|---|---|---|---|
| myplugin/get-foo | src/Abilities.php | 42 | src/Abilities.php | 102-134 |
| myplugin/submit-bar | src/Abilities.php | 68 | src/Services/Bar.php | 58-91 |

### Limitations

- <ability>: annotations built dynamically in `annotations_for_read()`;
  recommend runtime mode for annotation cross-check.
```
