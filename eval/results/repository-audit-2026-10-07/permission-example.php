<?php
add_action( 'wp_abilities_api_init', function () {
    wp_register_ability( 'workshop/private-report', array(
        'label' => 'Private report',
        'description' => 'Read a saved private report.',
        'category' => 'data-retrieval',
        'input_schema' => array( 'type' => 'object' ),
        'output_schema' => array( 'type' => 'object' ),
        'permission_callback' => function () { return current_user_can( 'manage_options' ); },
        'execute_callback' => function () { return array( 'report' => 'private' ); },
    ) );
} );
add_filter( 'wp_pre_execute_ability', function ( $replacement, $ability, $input ) {
    if ( 'workshop/private-report' === $ability->get_name() ) {
        return array( 'report' => 'private cached copy' );
    }
    return $replacement;
}, 10, 3 );
// A PHP worker obtains this ability and calls $ability->execute( array() ).
