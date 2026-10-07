<?php
/** Executes the frozen, unmodified Core WP_Ability class with minimal host shims.
 * This is a direct-PHP execution-order regression, not a REST/MCP integration test.
 */
error_reporting(E_ALL);

class WP_Filter_Sentinel {}
class WP_Error {
    private $code;
    private $message;
    public function __construct($code, $message = '') { $this->code = $code; $this->message = $message; }
    public function get_error_code() { return $this->code; }
    public function get_error_message() { return $this->message; }
    public function has_errors() { return true; }
}
function __($message) { return $message; }
function esc_html($message) { return $message; }
function is_wp_error($value) { return $value instanceof WP_Error; }
function wp_parse_args($args, $defaults = array()) { return array_merge($defaults, $args); }
function _doing_it_wrong($method, $message, $version) { throw new RuntimeException($message); }
function do_action($hook, ...$args) { $GLOBALS['events'][] = $hook; }
function apply_filters($hook, $value, ...$args) {
    $GLOBALS['events'][] = $hook;
    if (isset($GLOBALS['filters'][$hook])) { return $GLOBALS['filters'][$hook]($value, ...$args); }
    return $value;
}

require __DIR__ . '/../fixtures/core-7.1.3/class-wp-ability.php';

function ensure($condition, $message) {
    if (!$condition) { throw new RuntimeException($message); }
}
function exercise($allow, $shortCircuit = false, $replacement = null, $input = null) {
    $GLOBALS['events'] = array();
    $GLOBALS['filters'] = $shortCircuit ? array('wp_pre_execute_ability' => static function() use ($replacement) { return $replacement; }) : array();
    $permissions = 0;
    $executions = 0;
    $ability = new WP_Ability('fixture/example', array(
        'label' => 'Example', 'description' => 'Execution-order fixture', 'category' => 'fixture',
        'permission_callback' => static function() use (&$permissions, $allow) { $permissions++; return $allow; },
        'execute_callback' => static function() use (&$executions) { $executions++; return 'executed'; },
    ));
    $result = $ability->execute($input);
    return array($result, $permissions, $executions, $GLOBALS['events']);
}

list($result, $permissions, $executions) = exercise(false);
ensure(is_wp_error($result) && $result->get_error_code() === 'ability_invalid_permissions', 'Normal execution must reject a denied permission callback');
ensure($permissions === 1 && $executions === 0, 'Denied execution must check permissions without executing');

list($result, $permissions, $executions) = exercise(true);
ensure($result === 'executed' && $permissions === 1 && $executions === 1, 'Successful normal execution must check permissions before executing');

foreach (array('cached', null, false, new stdClass()) as $replacement) {
    list($result, $permissions, $executions, $events) = exercise(false, true, $replacement, 'invalid-input-without-schema');
    ensure($result === $replacement, 'A pre-execution replacement must return as-is, including false/null/objects');
    ensure($permissions === 0 && $executions === 0, 'Pre-execution replacement must bypass normal permissions and callback execution');
    ensure($events === array('wp_ability_invoked', 'wp_pre_execute_ability'), 'Pre-execution replacement must precede normalization and validation');
}

list($result, $permissions, $executions) = exercise(true, false, null, 'invalid-input-without-schema');
ensure(is_wp_error($result) && $result->get_error_code() === 'ability_missing_input_schema', 'Invalid input must fail before permission checks');
ensure($permissions === 0 && $executions === 0, 'Input validation failure also prevents the permission callback from running');

echo "OK: 7 direct-PHP Core ability execution cases passed.\n";
