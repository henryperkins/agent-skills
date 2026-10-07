<?php
// Isolated behavioral probe using the supplied exact WP_Ability class.
// WordPress hook/error/schema dependencies below are minimal local shims.
// This is not a live WordPress, REST, MCP, category-registry, or cache test.
$GLOBALS['hooks'] = array();
$GLOBALS['trace'] = array();
$GLOBALS['allowed'] = false;
class WP_Filter_Sentinel {}
class WP_Error {
    public function __construct(public string $code = '', public string $message = '') {}
    public function has_errors() { return '' !== $this->code; }
    public function get_error_code() { return $this->code; }
    public function get_error_message() { return $this->message; }
}
function __( $message ) { return $message; }
function esc_html( $message ) { return htmlspecialchars($message, ENT_QUOTES); }
function is_wp_error( $value ) { return $value instanceof WP_Error; }
function wp_parse_args( $args, $defaults ) { return array_merge($defaults, $args); }
function _doing_it_wrong( $method, $message, $version ) {
    $GLOBALS['trace'][] = array('doing_it_wrong' => $method, 'message' => $message);
}
function current_user_can( $capability ) {
    $GLOBALS['trace'][] = 'current_user_can:' . $capability;
    return $GLOBALS['allowed'];
}
function rest_validate_value_from_schema( $value, $schema, $parameter ) {
    $GLOBALS['trace'][] = 'schema:' . $parameter;
    if ('object' === ($schema['type'] ?? null) && !is_array($value) && !is_object($value)) {
        return new WP_Error('rest_invalid_type', 'Expected object.');
    }
    return true;
}
function add_filter( $hook, $callback, $priority = 10, $accepted_args = 1 ) {
    $GLOBALS['hooks'][$hook][] = array($priority, $callback, $accepted_args);
}
function add_action( $hook, $callback, $priority = 10, $accepted_args = 1 ) {
    add_filter($hook, $callback, $priority, $accepted_args);
}
function hook_callbacks( $hook ) {
    $callbacks = $GLOBALS['hooks'][$hook] ?? array();
    usort($callbacks, fn($a, $b) => $a[0] <=> $b[0]);
    return $callbacks;
}
function apply_filters( $hook, $value, ...$args ) {
    $GLOBALS['trace'][] = $hook;
    foreach (hook_callbacks($hook) as $entry) {
        $value = ($entry[1])(...array_slice(array_merge(array($value), $args), 0, $entry[2]));
    }
    return $value;
}
function do_action( $hook, ...$args ) {
    $GLOBALS['trace'][] = $hook;
    foreach (hook_callbacks($hook) as $entry) {
        ($entry[1])(...array_slice($args, 0, $entry[2]));
    }
}
function wp_register_ability( $name, $args ) {
    $GLOBALS['registered_args'] = $args;
    $GLOBALS['ability'] = new WP_Ability($name, $args);
    return $GLOBALS['ability'];
}
$scratch = __DIR__;
require __DIR__ . '/../../fixtures/core-7.1.3/class-wp-ability.php';
require $scratch . '/permission-example.php';
do_action('wp_abilities_api_init');
$original_pre_callbacks = $GLOBALS['hooks']['wp_pre_execute_ability'];
$original_args = $GLOBALS['registered_args'];
function probe( $label, $allowed, $ability ) {
    $GLOBALS['allowed'] = $allowed;
    $GLOBALS['trace'] = array();
    try {
        $result = $ability->execute(array());
        $outcome = is_wp_error($result)
            ? array('wp_error' => $result->get_error_code(), 'message' => $result->get_error_message())
            : array('value' => $result);
    } catch (Throwable $error) {
        $outcome = array('thrown_class' => get_class($error), 'message' => $error->getMessage());
    }
    return array('case' => $label, 'has_manage_options' => $allowed, 'outcome' => $outcome, 'trace' => $GLOBALS['trace']);
}
$results = array();
$results[] = probe('supplied_callback_unprivileged', false, $GLOBALS['ability']);
$results[] = probe('supplied_callback_privileged', true, $GLOBALS['ability']);
$GLOBALS['hooks']['wp_pre_execute_ability'] = array();
add_filter('wp_pre_execute_ability', function ($pre, $name, $input) {
    return 'workshop/private-report' === $name
        ? array('report' => 'private cached copy')
        : $pre;
}, 10, 3);
$results[] = probe('signature_corrected_only_unprivileged', false, $GLOBALS['ability']);
$GLOBALS['hooks']['wp_pre_execute_ability'] = array();
$results[] = probe('pre_filter_removed_unprivileged', false, $GLOBALS['ability']);
$cached_args = $original_args;
$cached_args['execute_callback'] = function () {
    $GLOBALS['trace'][] = 'execute_callback:cached_fixture';
    return array('report' => 'private cached copy');
};
$cached_ability = new WP_Ability('workshop/private-report', $cached_args);
$results[] = probe('cache_in_execute_callback_unprivileged', false, $cached_ability);
$results[] = probe('cache_in_execute_callback_privileged', true, $cached_ability);
echo json_encode(array(
    'scope' => 'Exact supplied WP_Ability methods with local hook/error/object-schema shims; no live WP/REST/MCP.',
    'core_source' => 'eval/fixtures/core-7.1.3/class-wp-ability.php',
    'example_source' => $scratch . '/permission-example.php',
    'results' => $results
), JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES) . PHP_EOL;
