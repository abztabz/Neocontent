<?php
/**
 * Plugin Name: Neo Authority Engine
 * Description: Governed business knowledge, trusted sources, and evidence-backed blog automation.
 * Version: 1.0.1
 * Author: 108 Media
 * Requires at least: 6.2
 * Requires PHP: 8.0
 */

if (!defined('ABSPATH')) exit;

define('NAE_VERSION', '1.0.1');
define('NAE_OPTION', 'nae_v1_settings');
define('NAE_SOURCES', 'nae_v1_sources');
define('NAE_KNOWLEDGE', 'nae_v1_knowledge');

require_once __DIR__ . '/includes/class-neo-cloud-client.php';
require_once __DIR__ . '/includes/class-neo-source-manager.php';
require_once __DIR__ . '/includes/class-neo-admin.php';
require_once __DIR__ . '/includes/class-neo-settings.php';
require_once __DIR__ . '/includes/class-neo-knowledge-manager.php';
require_once __DIR__ . '/includes/class-neo-publisher.php';

final class Neo_Authority_Engine_V1 {
    private static ?self $instance = null;

    public static function instance(): self { return self::$instance ??= new self(); }

    private function __construct() {
        $client = new Neo_Cloud_Client();
        $sources = new Neo_Source_Manager($client);
        new Neo_Admin($client, $sources);
        new Neo_Settings($client);
        new Neo_Knowledge_Manager($client);
        new Neo_Publisher();
        add_action('rest_api_init', [$this, 'register_status_route']);
    }

    public static function activate(): void {
        if (get_option(NAE_OPTION, null) === null) {
            add_option(NAE_OPTION, [
                'cloud_url' => '', 'site_id' => wp_generate_uuid4(),
                'site_secret' => wp_generate_password(64, false, false),
                'business_name' => get_bloginfo('name'), 'business_description' => get_bloginfo('description'),
                'industry' => '', 'target_audience' => '', 'tone' => 'Clear, useful, trustworthy and professional',
                'services' => '', 'locations' => '', 'publish_mode' => 'approval_required',
                'content_mode' => 'balanced', 'cadence' => 'weekly',
                'knowledge_review_required' => '1', 'registered' => '0',
            ], '', false);
        }
        if (get_option(NAE_SOURCES, null) === null) add_option(NAE_SOURCES, [], '', false);
        if (get_option(NAE_KNOWLEDGE, null) === null) add_option(NAE_KNOWLEDGE, [], '', false);
        if (get_option('nae_v1_knowledge_candidates', null) === null) add_option('nae_v1_knowledge_candidates', [], '', false);
    }

    public function register_status_route(): void {
        register_rest_route('neo-authority/v1', '/status', [
            'methods' => 'GET',
            'callback' => static fn() => rest_ensure_response([
                'plugin' => 'neo-authority-engine', 'version' => NAE_VERSION,
                'siteId' => (get_option(NAE_OPTION, [])['site_id'] ?? null),
            ]),
            'permission_callback' => '__return_true',
        ]);
    }
}

register_activation_hook(__FILE__, ['Neo_Authority_Engine_V1', 'activate']);
Neo_Authority_Engine_V1::instance();
