<?php

if (!defined('ABSPATH')) exit;

final class Neo_Publisher {
    public function __construct() {
        add_action('rest_api_init', [$this, 'routes']);
    }

    public function routes(): void {
        register_rest_route('neo-authority/v1', '/publish', [
            'methods' => 'POST',
            'callback' => [$this, 'publish'],
            'permission_callback' => [$this, 'verify_signature'],
        ]);
    }

    public function verify_signature(WP_REST_Request $request): bool {
        $settings = get_option(NAE_OPTION, []);
        $timestamp = (string)$request->get_header('x-neo-timestamp');
        $signature = (string)$request->get_header('x-neo-signature');
        if (!$timestamp || !$signature || abs(time() - (int)$timestamp) > 300) return false;

        $path = '/wp-json/neo-authority/v1/publish';
        $canonical = "POST\n{$path}\n{$timestamp}\n" . hash('sha256', $request->get_body());
        $expected = hash_hmac('sha256', $canonical, (string)($settings['site_secret'] ?? ''));
        return hash_equals($expected, $signature);
    }

    public function publish(WP_REST_Request $request) {
        $settings = get_option(NAE_OPTION, []);
        $key = sanitize_text_field((string)$request->get_param('idempotencyKey'));
        if (!$key) return new WP_Error('nae_missing_idempotency', 'idempotencyKey is required.', ['status' => 400]);

        $existing = get_posts([
            'post_type' => 'post',
            'post_status' => 'any',
            'meta_key' => '_nae_idempotency_key',
            'meta_value' => $key,
            'numberposts' => 1,
        ]);
        if ($existing) {
            return rest_ensure_response([
                'externalId' => (string)$existing[0]->ID,
                'url' => get_permalink($existing[0]),
                'status' => get_post_status($existing[0]),
                'duplicate' => true,
            ]);
        }

        $post_id = wp_insert_post([
            'post_title' => sanitize_text_field((string)$request->get_param('title')),
            'post_content' => wp_kses_post((string)$request->get_param('body')),
            'post_excerpt' => sanitize_textarea_field((string)$request->get_param('excerpt')),
            'post_status' => ($settings['publish_mode'] ?? 'approval_required') === 'auto' ? 'publish' : 'draft',
            'post_type' => 'post',
            'meta_input' => [
                '_nae_idempotency_key' => $key,
                '_nae_rationale' => sanitize_textarea_field((string)$request->get_param('rationale')),
                '_nae_authority_score' => absint($request->get_param('authorityScore')),
                '_nae_business_alignment_score' => absint($request->get_param('businessAlignmentScore')),
                '_nae_sources' => wp_json_encode($request->get_param('sources') ?: []),
            ],
        ], true);

        if (is_wp_error($post_id)) return $post_id;
        return new WP_REST_Response([
            'externalId' => (string)$post_id,
            'url' => get_permalink($post_id),
            'status' => get_post_status($post_id),
            'publishedAt' => current_time('c'),
        ], 201);
    }
}
