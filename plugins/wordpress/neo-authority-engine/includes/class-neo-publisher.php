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

    public function verify_signature(WP_REST_Request $request) {
        $settings = get_option(NAE_OPTION, []);
        $site_id = (string)($settings['site_id'] ?? '');
        if (!$site_id || !hash_equals($site_id, (string)$request->get_header('x-neo-site-id'))) {
            return new WP_Error('nae_bad_site', 'Signed site identifier is invalid.', ['status' => 401]);
        }
        $timestamp = (string)$request->get_header('x-neo-timestamp');
        $signature = (string)$request->get_header('x-neo-signature');
        if (!$timestamp || !$signature || !ctype_digit($timestamp) || abs(time() - (int)$timestamp) > 300) {
            return new WP_Error('nae_stale_signature', 'Request signature is missing or stale.', ['status' => 401]);
        }
        if (strlen($request->get_body()) > 750000) {
            return new WP_Error('nae_payload_too_large', 'Publish payload is too large.', ['status' => 413]);
        }

        $path = (string)wp_parse_url(rest_url('neo-authority/v1/publish'), PHP_URL_PATH);
        $canonical = "POST\n{$path}\n{$timestamp}\n" . hash('sha256', $request->get_body());
        $secret = Neo_Secret_Store::get();
        if (strlen($secret) < 32) return new WP_Error('nae_secret_missing', 'Site secret is unavailable.', ['status' => 503]);
        $signing_key = hash_hmac('sha256', 'neo-cloud-to-wordpress-v1', $secret, true);
        $expected = hash_hmac('sha256', $canonical, $signing_key);
        if (!hash_equals($expected, $signature)) {
            return new WP_Error('nae_bad_signature', 'Request signature is invalid.', ['status' => 401]);
        }

        $replay_key = 'nae_replay_' . hash('sha256', $site_id . ':' . $timestamp . ':' . $signature);
        if (get_transient($replay_key) !== false) {
            return new WP_Error('nae_replay', 'Signed request replay detected.', ['status' => 409]);
        }
        set_transient($replay_key, '1', 10 * MINUTE_IN_SECONDS);
        return true;
    }

    public function publish(WP_REST_Request $request) {
        $settings = get_option(NAE_OPTION, []);
        $key = sanitize_text_field((string)$request->get_param('idempotencyKey'));
        if (!wp_is_uuid($key)) return new WP_Error('nae_missing_idempotency', 'A valid idempotencyKey is required.', ['status' => 400]);

        $title_raw = (string)$request->get_param('title');
        $body_raw = (string)$request->get_param('body');
        $excerpt_raw = (string)$request->get_param('excerpt');
        $rationale_raw = (string)$request->get_param('rationale');
        $sources_raw = $request->get_param('sources');
        if ($title_raw === '' || strlen($title_raw) > 1000) return new WP_Error('nae_invalid_title', 'Article title is invalid.', ['status' => 400]);
        if ($body_raw === '' || strlen($body_raw) > 500000) return new WP_Error('nae_invalid_body', 'Article body is invalid.', ['status' => 400]);
        if (strlen($excerpt_raw) > 8000 || strlen($rationale_raw) > 20000) return new WP_Error('nae_invalid_metadata', 'Article metadata is too long.', ['status' => 400]);
        if (!is_array($sources_raw) || count($sources_raw) > 50) return new WP_Error('nae_invalid_sources', 'Article sources are invalid.', ['status' => 400]);

        $sources = array_map(static function($source): array {
            if (!is_array($source)) return [];
            return [
                'id' => sanitize_text_field((string)($source['id'] ?? '')),
                'title' => sanitize_text_field((string)($source['title'] ?? '')),
                'publisher' => sanitize_text_field((string)($source['publisher'] ?? '')),
                'url' => esc_url_raw((string)($source['url'] ?? ''), ['https']),
                'claimSupported' => sanitize_textarea_field((string)($source['claimSupported'] ?? '')),
            ];
        }, $sources_raw);
        $meta_input = [
            '_nae_idempotency_key' => $key,
            '_nae_rationale' => sanitize_textarea_field($rationale_raw),
            '_nae_authority_score' => min(100, absint($request->get_param('authorityScore'))),
            '_nae_business_alignment_score' => min(100, absint($request->get_param('businessAlignmentScore'))),
            '_nae_sources' => wp_json_encode($sources),
            '_nae_seo_title' => substr(sanitize_text_field((string)$request->get_param('seoTitle')), 0, 1000),
            '_nae_meta_description' => substr(sanitize_textarea_field((string)$request->get_param('metaDescription')), 0, 2000),
            '_nae_focus_keyphrase' => substr(sanitize_text_field((string)$request->get_param('focusKeyphrase')), 0, 500),
        ];
        if (defined('WPSEO_VERSION')) {
            $meta_input['_yoast_wpseo_title'] = $meta_input['_nae_seo_title'];
            $meta_input['_yoast_wpseo_metadesc'] = $meta_input['_nae_meta_description'];
            $meta_input['_yoast_wpseo_focuskw'] = $meta_input['_nae_focus_keyphrase'];
        }
        if (defined('RANK_MATH_VERSION')) {
            $meta_input['rank_math_title'] = $meta_input['_nae_seo_title'];
            $meta_input['rank_math_description'] = $meta_input['_nae_meta_description'];
            $meta_input['rank_math_focus_keyword'] = $meta_input['_nae_focus_keyphrase'];
        }

        $existing = get_posts([
            'post_type' => 'post',
            'post_status' => 'any',
            'meta_key' => '_nae_idempotency_key',
            'meta_value' => $key,
            'numberposts' => 1,
        ]);
        if ($existing) {
            if (!in_array(get_post_status($existing[0]), ['draft', 'pending'], true)) {
                return new WP_Error('nae_revision_closed', 'Published or rejected articles cannot be replaced.', ['status' => 409]);
            }
            $updated = wp_update_post([
                'ID' => $existing[0]->ID,
                'post_title' => sanitize_text_field($title_raw),
                'post_content' => wp_kses_post($body_raw),
                'post_excerpt' => sanitize_textarea_field($excerpt_raw),
                'meta_input' => $meta_input,
            ], true);
            if (is_wp_error($updated)) return $updated;
            return rest_ensure_response([
                'externalId' => (string)$existing[0]->ID,
                'url' => get_permalink($existing[0]),
                'status' => get_post_status($existing[0]),
                'revised' => true,
            ]);
        }

        $post_id = wp_insert_post([
            'post_title' => sanitize_text_field($title_raw),
            'post_content' => wp_kses_post($body_raw),
            'post_excerpt' => sanitize_textarea_field($excerpt_raw),
            'post_status' => 'draft',
            'post_type' => 'post',
            'meta_input' => $meta_input,
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
