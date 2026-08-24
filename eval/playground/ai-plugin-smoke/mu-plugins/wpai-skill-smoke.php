<?php
/**
 * Plugin Name: WPAI Skill Smoke
 * Description: Downstream Experiment + Ability registration exactly as skills/wp-ai-plugin documents.
 */

add_action( 'plugins_loaded', function () {
	if ( ! class_exists( 'WordPress\AI\Abstracts\Abstract_Feature' ) ) {
		return; // AI plugin not active — degrade gracefully.
	}

	if ( ! class_exists( 'Smoke_Experiment' ) ) {
		class Smoke_Experiment extends \WordPress\AI\Abstracts\Abstract_Feature {
			public static function get_id(): string {
				return 'smoke-experiment';
			}

			protected function load_metadata(): array {
				return array(
					'label'       => 'Smoke Experiment',
					'description' => 'Downstream registration smoke test.',
					'category'    => \WordPress\AI\Experiments\Experiment_Category::ADMIN,
				);
			}

			public function register(): void {
				add_action( 'wp_abilities_api_init', function () {
					wp_register_ability(
						'smoke/echo',
						array(
							'label'               => 'Echo',
							'description'         => 'Echoes the msg input back.',
							'category'            => defined( 'WPAI_DEFAULT_ABILITY_CATEGORY' ) ? WPAI_DEFAULT_ABILITY_CATEGORY : 'ai-experiments',
							'input_schema'        => array(
								'type'       => 'object',
								'properties' => array( 'msg' => array( 'type' => 'string' ) ),
							),
							'output_schema'       => array( 'type' => 'string' ),
							'execute_callback'    => function ( $input ) {
								return isset( $input['msg'] ) ? (string) $input['msg'] : '';
							},
							'permission_callback' => function () {
								return current_user_can( 'read' );
							},
						)
					);
				} );
			}
		}
	}

	add_filter( 'wpai_default_feature_classes', function ( array $classes ): array {
		$classes[ Smoke_Experiment::get_id() ] = Smoke_Experiment::class;
		return $classes;
	} );
} );

/**
 * Record one side of the Custom Abilities gate without registering those abilities here.
 *
 * @param string $phase Either disabled or enabled.
 */
function wpai_skill_smoke_record_state( $phase ) {
	$get = function ( $id ) {
		return function_exists( 'wp_get_ability' ) ? wp_get_ability( $id ) : null;
	};

	$smoke = $get( 'smoke/echo' );
	$exec  = null;
	if ( $smoke ) {
		$exec = $smoke->execute( array( 'msg' => 'hi' ) );
		if ( is_wp_error( $exec ) ) {
			$exec = 'WP_Error: ' . $exec->get_error_code();
		}
	}

	$path   = WP_CONTENT_DIR . '/mu-plugins/result.json';
	$result = array();
	if ( file_exists( $path ) ) {
		$decoded = json_decode( file_get_contents( $path ), true );
		if ( is_array( $decoded ) ) {
			$result = $decoded;
		}
	}

	$result['wpai_version']     = defined( 'WPAI_VERSION' ) ? WPAI_VERSION : null;
	$result['abstract_feature'] = class_exists( 'WordPress\AI\Abstracts\Abstract_Feature' );
	$result[ $phase ]           = array(
		'custom_abilities_feature' => (bool) get_option( 'wpai_feature_custom-abilities_enabled', false ),
		'smoke_ability'             => (bool) $smoke,
		'smoke_exec'                => $exec,
		'read_content'              => (bool) $get( 'core/read-content' ),
		'read_users'                => (bool) $get( 'core/read-users' ),
		'read_settings'             => (bool) $get( 'core/read-settings' ),
		'get_post_details'          => (bool) $get( 'ai/get-post-details' ),
		'get_post_terms'            => (bool) $get( 'ai/get-post-terms' ),
		'suggest_reply'             => (bool) $get( 'ai/suggest-reply' ),
	);

	file_put_contents( $path, json_encode( $result, JSON_PRETTY_PRINT ) );
	echo json_encode( $result[ $phase ] );
}
