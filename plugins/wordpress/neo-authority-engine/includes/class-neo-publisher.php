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
            'permission_callback' => [$this, 'verify_publish_signature'],
        ]);
        register_rest_route('neo-authority/v1', '/connection-proof', [
            'methods' => 'GET',
            'callback' => [$this, 'connection_proof'],
            'permission_callback' => '__return_true',
        ]);
        register_rest_route('neo-authority/v1', '/activate', [
            'methods' => 'POST',
            'callback' => [$this, 'activate'],
            'permission_callback' => [$this, 'verify_activation_signature'],
        ]);
        register_rest_route('neo-authority/v1', '/connection-pending', [
            'methods' => 'POST',
            'callback' => [$this, 'connection_pending'],
            'permission_callback' => [$this, 'verify_pending_signature'],
        ]);
    }

    public function verify_publish_signature(WP_REST_Request $request) {
        return $this->verify_signature($request, 'publish', 'neo-cloud-to-wordpress-v1', 750000);
    }

    public function verify_activation_signature(WP_REST_Request $request) {
        return $this->verify_signature($request, 'activate', 'neo-cloud-activation-v1', 4096);
    }

    public function verify_pending_signature(WP_REST_Request $request) {
        return $this->verify_signature($request, 'connection-pending', 'neo-cloud-pending-v1', 4096);
    }

    private function verify_signature(WP_REST_Request $request, string $route, string $purpose, int $maximum_body) {
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
        if (strlen($request->get_body()) > $maximum_body) {
            return new WP_Error('nae_payload_too_large', 'Signed payload is too large.', ['status' => 413]);
        }

        $path = (string)wp_parse_url(rest_url('neo-authority/v1/' . $route), PHP_URL_PATH);
        $canonical = "POST\n{$path}\n{$timestamp}\n" . hash('sha256', $request->get_body());
        $secret = Neo_Secret_Store::get();
        if (strlen($secret) < 32) return new WP_Error('nae_secret_missing', 'Site secret is unavailable.', ['status' => 503]);
        $signing_key = hash_hmac('sha256', $purpose, $secret, true);
        $expected = hash_hmac('sha256', $canonical, $signing_key);
        if (!hash_equals($expected, $signature)) {
            return new WP_Error('nae_bad_signature', 'Request signature is invalid.', ['status' => 401]);
        }

        $replay_key = 'nae_replay_' . hash('sha256', $route . ':' . $site_id . ':' . $timestamp . ':' . $signature);
        if (get_transient($replay_key) !== false) {
            return new WP_Error('nae_replay', 'Signed request replay detected.', ['status' => 409]);
        }
        set_transient($replay_key, '1', 10 * MINUTE_IN_SECONDS);
        return true;
    }

    public function connection_proof() {
        $settings = get_option(NAE_OPTION, []);
        $site_id = (string)($settings['site_id'] ?? '');
        $secret = Neo_Secret_Store::get();
        $home = wp_parse_url(home_url('/'));
        if (!$site_id || strlen($secret) < 32 || !is_array($home) || strtolower((string)($home['scheme'] ?? '')) !== 'https') {
            return new WP_Error('nae_proof_unavailable', 'Connection proof is unavailable.', ['status' => 503]);
        }
        $origin = 'https://' . strtolower((string)($home['host'] ?? ''));
        if (!empty($home['port']) && (int)$home['port'] !== 443) $origin .= ':' . (int)$home['port'];
        $key = hash_hmac('sha256', 'neo-connection-proof-v1', $secret, true);
        return rest_ensure_response([
            'siteId' => $site_id,
            'origin' => $origin,
            'proof' => hash_hmac('sha256', $site_id . "\n" . $origin, $key),
            'version' => NAE_VERSION,
        ]);
    }

    public function activate(WP_REST_Request $request) {
        $settings = get_option(NAE_OPTION, []);
        $site_id = (string)($settings['site_id'] ?? '');
        if ((string)$request->get_param('status') !== 'active'
            || !hash_equals($site_id, (string)$request->get_param('siteId'))) {
            return new WP_Error('nae_activation_invalid', 'Activation payload is invalid.', ['status' => 400]);
        }
        $current = sanitize_key((string)($settings['connection_status'] ?? 'not_connected'));
        if (($settings['registered'] ?? '0') === '1' && $current === 'active') {
            return rest_ensure_response(['status' => 'active']);
        }
        if (!in_array($current, ['browser_pending', 'pending'], true)) {
            return new WP_Error('nae_activation_state', 'Activation is not pending.', ['status' => 409]);
        }
        $settings['registered'] = '1';
        $settings['connection_status'] = 'active';
        update_option(NAE_OPTION, $settings, false);
        wp_clear_scheduled_hook('nae_connection_check');
        wp_clear_scheduled_hook('nae_operator_sync');
        return rest_ensure_response(['status' => 'active']);
    }

    public function connection_pending(WP_REST_Request $request) {
        $settings = get_option(NAE_OPTION, []);
        $site_id = (string)($settings['site_id'] ?? '');
        if ((string)$request->get_param('status') !== 'pending'
            || !hash_equals($site_id, (string)$request->get_param('siteId'))) {
            return new WP_Error('nae_pending_invalid', 'Pending connection payload is invalid.', ['status' => 400]);
        }
        if (($settings['registered'] ?? '0') === '1') {
            return new WP_Error('nae_pending_active', 'Active connections cannot return to pending.', ['status' => 409]);
        }
        $settings['connection_status'] = 'browser_pending';
        $settings['connection_requested_at'] = time();
        update_option(NAE_OPTION, $settings, false);
        wp_clear_scheduled_hook('nae_connection_check');
        wp_clear_scheduled_hook('nae_operator_sync');
        return rest_ensure_response(['status' => 'pending']);
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
        $image_plan_raw = $request->get_param('imagePlan');
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
        $image_plan = $this->sanitize_image_plan($image_plan_raw, $title_raw, $body_raw);
        $formatted_body = $this->format_for_gutenberg($body_raw);
        $meta_input = [
            '_nae_idempotency_key' => $key,
            '_nae_rationale' => sanitize_textarea_field($rationale_raw),
            '_nae_authority_score' => min(100, absint($request->get_param('authorityScore'))),
            '_nae_business_alignment_score' => min(100, absint($request->get_param('businessAlignmentScore'))),
            '_nae_sources' => wp_json_encode($sources),
            '_nae_seo_title' => substr(sanitize_text_field((string)$request->get_param('seoTitle')), 0, 1000),
            '_nae_meta_description' => substr(sanitize_textarea_field((string)$request->get_param('metaDescription')), 0, 2000),
            '_nae_focus_keyphrase' => substr(sanitize_text_field((string)$request->get_param('focusKeyphrase')), 0, 500),
            '_nae_image_plan' => wp_json_encode($image_plan, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE),
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
                'post_content' => $formatted_body,
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
            'post_content' => $formatted_body,
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

    private function sanitize_image_plan($value, string $title, string $body): array {
        $value = is_array($value) ? $value : [];
        $featured = is_array($value['featured'] ?? null) ? $value['featured'] : [];
        $inline = [];
        foreach (array_slice(is_array($value['inline'] ?? null) ? $value['inline'] : [], 0, 3) as $image) {
            if (!is_array($image)) continue;
            $subject = substr(sanitize_text_field((string)($image['subject'] ?? '')), 0, 500);
            if ($subject === '') continue;
            $inline[] = [
                'afterHeading' => substr(sanitize_text_field((string)($image['afterHeading'] ?? '')), 0, 300),
                'subject' => $subject,
                'altText' => substr(sanitize_text_field((string)($image['altText'] ?? '')), 0, 300),
                'caption' => substr(sanitize_text_field((string)($image['caption'] ?? '')), 0, 500),
            ];
        }
        if (!$inline && preg_match_all('/<h2(?:\s[^>]*)?>(.*?)<\/h2>/is', $body, $matches)) {
            foreach (array_slice($matches[1], 0, 2) as $heading_html) {
                $heading = substr(sanitize_text_field(wp_strip_all_tags((string)$heading_html)), 0, 300);
                if ($heading !== '') $inline[] = [
                    'afterHeading' => $heading,
                    'subject' => 'Editorial supporting image for ' . $heading,
                    'altText' => $heading,
                    'caption' => '',
                ];
            }
        }
        return [
            'featured' => [
                'subject' => substr(sanitize_text_field((string)($featured['subject'] ?? ('Editorial banner image for ' . $title))), 0, 500),
                'altText' => substr(sanitize_text_field((string)($featured['altText'] ?? $title)), 0, 300),
                'caption' => substr(sanitize_text_field((string)($featured['caption'] ?? '')), 0, 500),
            ],
            'inline' => $inline,
        ];
    }

    private function format_for_gutenberg(string $body): string {
        $safe = wp_kses_post($body);
        $safe = preg_replace('/<h1(\s[^>]*)?>/i', '<h2$1>', $safe);
        $safe = preg_replace('/<\/h1>/i', '</h2>', (string)$safe);
        if (str_contains((string)$safe, '<!-- wp:')) return (string)$safe;
        return (string)preg_replace_callback(
            '/<(p|h2|h3|ul|ol|blockquote|figure)(\s[^>]*)?>[\s\S]*?<\/\1>|<hr\s*\/?>/i',
            static function(array $match): string {
                $fragment = $match[0];
                if (stripos($fragment, '<h3') === 0) return "<!-- wp:heading {\"level\":3} -->\n{$fragment}\n<!-- /wp:heading -->";
                if (stripos($fragment, '<h2') === 0) return "<!-- wp:heading -->\n{$fragment}\n<!-- /wp:heading -->";
                if (stripos($fragment, '<ul') === 0 || stripos($fragment, '<ol') === 0) return "<!-- wp:list -->\n{$fragment}\n<!-- /wp:list -->";
                if (stripos($fragment, '<blockquote') === 0) return "<!-- wp:quote -->\n{$fragment}\n<!-- /wp:quote -->";
                if (stripos($fragment, '<figure') === 0) return "<!-- wp:image -->\n{$fragment}\n<!-- /wp:image -->";
                if (stripos($fragment, '<hr') === 0) return "<!-- wp:separator -->\n<hr class=\"wp-block-separator has-alpha-channel-opacity\"/>\n<!-- /wp:separator -->";
                return "<!-- wp:paragraph -->\n{$fragment}\n<!-- /wp:paragraph -->";
            },
            (string)$safe
        );
    }
}
