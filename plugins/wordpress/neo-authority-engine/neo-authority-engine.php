<?php
/**
 * Plugin Name: Neo Authority Engine
 * Description: Governed business knowledge, trusted sources, and evidence-backed blog automation.
 * Version: 1.5.2
 * Author: 108 Media
 * Requires at least: 6.2
 * Requires PHP: 8.0
 */

if (!defined('ABSPATH')) exit;

define('NAE_VERSION', '1.5.2');
define('NAE_OPTION', 'nae_v1_settings');

require_once __DIR__ . '/includes/class-neo-secret-store.php';
require_once __DIR__ . '/includes/class-neo-cloud-client.php';
require_once __DIR__ . '/includes/class-neo-settings.php';
require_once __DIR__ . '/includes/class-neo-publisher.php';
require_once __DIR__ . '/includes/class-neo-customer-dashboard.php';

final class Neo_Authority_Engine_V1 {
    private static ?self $instance = null;

    public static function instance(): self { return self::$instance ??= new self(); }

    private function __construct() {
        self::upgrade();
        $client = new Neo_Cloud_Client();
        new Neo_Customer_Dashboard($client);
        new Neo_Settings($client);
        new Neo_Publisher();
        add_action('rest_api_init', [$this, 'register_status_route']);
    }

    public static function activate(): void {
        if (get_option(NAE_OPTION, null) === null) {
            $site_secret = wp_generate_password(64, false, false);
            add_option(NAE_OPTION, [
                'cloud_url' => 'https://living-content-engine.vercel.app', 'site_id' => wp_generate_uuid4(),
                'site_secret_encrypted' => Neo_Secret_Store::encrypt($site_secret),
                'business_name' => get_bloginfo('name'), 'business_description' => get_bloginfo('description'),
                'industry' => '', 'target_audience' => '', 'tone' => 'Clear, useful, trustworthy and professional',
                'services' => '', 'locations' => '', 'publish_mode' => 'approval_required',
                'manual_source_urls' => '',
                'content_mode' => 'balanced', 'cadence' => 'weekly',
                'generation_mode' => 'operator_managed',
                'knowledge_review_required' => '1', 'registered' => '0',
                'connection_status' => 'not_connected', 'connection_requested_at' => 0,
            ], '', false);
        }
        self::clear_legacy_schedules();
    }

    public static function deactivate(): void { self::clear_legacy_schedules(); }

    private static function clear_legacy_schedules(): void {
        wp_clear_scheduled_hook('nae_operator_sync');
        wp_clear_scheduled_hook('nae_connection_check');
    }

    private static function upgrade(): void {
        if (get_option('nae_plugin_version', '') === NAE_VERSION) return;
        self::clear_legacy_schedules();
        $settings = get_option(NAE_OPTION, []);
        if (is_array($settings)) {
            if (empty($settings['cloud_url'])) $settings['cloud_url'] = 'https://living-content-engine.vercel.app';
            $settings['generation_mode'] = 'operator_managed';
            $settings['publish_mode'] = 'approval_required';
            $settings['knowledge_review_required'] = '0';
            if (($settings['registered'] ?? '0') !== '1') {
                $settings['registered'] = '0';
                $settings['connection_status'] = 'not_connected';
                $settings['connection_requested_at'] = 0;
            }
            update_option(NAE_OPTION, $settings, false);
        }
        update_option('nae_plugin_version', NAE_VERSION, false);
    }

    public function register_status_route(): void {
        register_rest_route('neo-authority/v1', '/status', [
            'methods' => 'GET',
            'callback' => static fn() => rest_ensure_response([
                'plugin' => 'neo-authority-engine', 'version' => NAE_VERSION,
            ]),
            'permission_callback' => '__return_true',
        ]);
    }
}

register_activation_hook(__FILE__, ['Neo_Authority_Engine_V1', 'activate']);
register_deactivation_hook(__FILE__, ['Neo_Authority_Engine_V1', 'deactivate']);
Neo_Authority_Engine_V1::instance();
