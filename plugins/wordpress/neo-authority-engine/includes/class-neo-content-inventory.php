<?php

if (!defined('ABSPATH')) exit;

final class Neo_Content_Inventory {
    private const PAGE_SIZE_MAX = 20;
    private const CONTENT_TEXT_MAX = 25000;

    public function __construct() {
        add_action('rest_api_init', [$this, 'routes']);
    }

    public function routes(): void {
        register_rest_route('neo-authority/v1', '/content-inventory', [
            'methods' => 'POST',
            'callback' => [$this, 'inventory'],
            'permission_callback' => [$this, 'verify_signature'],
        ]);
    }

    public function verify_signature(WP_REST_Request $request) {
        $settings = get_option(NAE_OPTION, []);
        $site_id = (string)($settings['site_id'] ?? '');
        if (($settings['registered'] ?? '0') !== '1' || ($settings['connection_status'] ?? '') !== 'active') {
            return new WP_Error('nae_inventory_inactive', 'NeoContent is not active.', ['status' => 403]);
        }
        if (!$site_id || !hash_equals($site_id, (string)$request->get_header('x-neo-site-id'))) {
            return new WP_Error('nae_inventory_site', 'Signed site identifier is invalid.', ['status' => 401]);
        }
        $timestamp = (string)$request->get_header('x-neo-timestamp');
        $signature = (string)$request->get_header('x-neo-signature');
        $body = $request->get_body();
        if (!$timestamp || !$signature || !ctype_digit($timestamp) || abs(time() - (int)$timestamp) > 300) {
            return new WP_Error('nae_inventory_stale', 'Request signature is missing or stale.', ['status' => 401]);
        }
        if (strlen($body) > 4096) return new WP_Error('nae_inventory_payload', 'Inventory request is too large.', ['status' => 413]);
        $path = (string)wp_parse_url(rest_url('neo-authority/v1/content-inventory'), PHP_URL_PATH);
        $canonical = "POST\n{$path}\n{$timestamp}\n" . hash('sha256', $body);
        $secret = Neo_Secret_Store::get();
        if (strlen($secret) < 32) return new WP_Error('nae_inventory_secret', 'Site secret is unavailable.', ['status' => 503]);
        $key = hash_hmac('sha256', 'neo-cloud-inventory-v1', $secret, true);
        $expected = hash_hmac('sha256', $canonical, $key);
        if (!hash_equals($expected, $signature)) return new WP_Error('nae_inventory_signature', 'Request signature is invalid.', ['status' => 401]);
        $replay = 'nae_inventory_' . hash('sha256', $site_id . ':' . $timestamp . ':' . $signature);
        if (get_transient($replay) !== false) return new WP_Error('nae_inventory_replay', 'Signed request replay detected.', ['status' => 409]);
        set_transient($replay, '1', 10 * MINUTE_IN_SECONDS);
        return true;
    }

    public function inventory(WP_REST_Request $request) {
        $cursor = (string)($request->get_param('cursor') ?: 'content:0');
        if (!preg_match('/^(content|media):(\d{1,7})$/', $cursor, $matches)) {
            return new WP_Error('nae_inventory_cursor', 'Inventory cursor is invalid.', ['status' => 400]);
        }
        $phase = $matches[1];
        $offset = min(1000000, (int)$matches[2]);
        $per_page = min(self::PAGE_SIZE_MAX, max(1, absint($request->get_param('perPage') ?: self::PAGE_SIZE_MAX)));
        $snapshot_id = sanitize_text_field((string)$request->get_param('snapshotId'));
        if (!wp_is_uuid($snapshot_id)) return new WP_Error('nae_inventory_snapshot', 'Inventory snapshot is invalid.', ['status' => 400]);

        $query = $phase === 'content' ? $this->content_query($offset, $per_page) : $this->media_query($offset, $per_page);
        $items = [];
        foreach ($query->posts as $post) {
            if ($phase === 'media' && (!$post->post_parent || get_post_status($post->post_parent) !== 'publish')) continue;
            $items[] = $phase === 'content' ? $this->content_item($post) : $this->media_item($post);
        }

        if (count($items) === $per_page) {
            $next = $phase . ':' . ($offset + $per_page);
        } elseif ($phase === 'content') {
            $next = 'media:0';
        } else {
            $next = null;
        }

        $response = [
            'schemaVersion' => 'neo-site-inventory-v1',
            'inventoryVersion' => 1,
            'snapshotId' => $snapshot_id,
            'cursor' => $cursor,
            'nextCursor' => $next,
            'items' => $items,
        ];
        if ($cursor === 'content:0') $response['site'] = $this->site_snapshot();
        return rest_ensure_response($response);
    }

    private function content_query(int $offset, int $per_page): WP_Query {
        $types = get_post_types(['public' => true], 'names');
        unset($types['attachment']);
        return new WP_Query([
            'post_type' => array_values($types),
            'post_status' => 'publish',
            'posts_per_page' => $per_page,
            'offset' => $offset,
            'orderby' => 'ID',
            'order' => 'ASC',
            'no_found_rows' => true,
            'ignore_sticky_posts' => true,
        ]);
    }

    private function media_query(int $offset, int $per_page): WP_Query {
        return new WP_Query([
            'post_type' => 'attachment',
            'post_status' => 'inherit',
            'post_mime_type' => ['image', 'application/pdf'],
            'posts_per_page' => $per_page,
            'offset' => $offset,
            'orderby' => 'ID',
            'order' => 'ASC',
            'no_found_rows' => true,
        ]);
    }

    private function public_url(string $value): string {
        $url = esc_url_raw($value, ['https']);
        $home = wp_parse_url(home_url('/'));
        $parts = wp_parse_url($url);
        if (!$url || !is_array($home) || !is_array($parts)) return '';
        return strtolower((string)($home['host'] ?? '')) === strtolower((string)($parts['host'] ?? '')) ? $url : '';
    }

    private function clean_text(string $value, int $maximum = self::CONTENT_TEXT_MAX): string {
        $value = strip_shortcodes($value);
        $value = wp_strip_all_tags($value, true);
        $value = preg_replace('/\s+/u', ' ', $value) ?: '';
        return $this->truncate(trim($value), $maximum);
    }

    private function truncate(string $value, int $maximum): string {
        return function_exists('mb_substr') ? mb_substr($value, 0, $maximum) : substr($value, 0, $maximum);
    }

    private function elementor_text(int $post_id): string {
        $raw = get_post_meta($post_id, '_elementor_data', true);
        if (!is_string($raw) || $raw === '' || strlen($raw) > 2000000) return '';
        $data = json_decode($raw, true);
        if (!is_array($data)) return '';
        $allowed = ['editor', 'text', 'title', 'description', 'caption', 'html', 'button_text', 'testimonial_content'];
        $values = [];
        $walk = function($node) use (&$walk, &$values, $allowed): void {
            if (count($values) >= 500 || !is_array($node)) return;
            foreach ($node as $key => $value) {
                if (is_array($value)) $walk($value);
                elseif (is_string($key) && in_array($key, $allowed, true) && is_string($value)) $values[] = $value;
            }
        };
        $walk($data);
        return $this->clean_text(implode("\n", $values));
    }

    private function public_terms(int $post_id): array {
        $output = [];
        foreach (get_object_taxonomies(get_post_type($post_id), 'objects') as $taxonomy) {
            if (empty($taxonomy->public)) continue;
            $terms = wp_get_post_terms($post_id, $taxonomy->name);
            if (is_wp_error($terms)) continue;
            $output[$taxonomy->name] = array_slice(array_map(static fn($term) => [
                'name' => sanitize_text_field((string)$term->name),
                'slug' => sanitize_title((string)$term->slug),
            ], $terms), 0, 50);
        }
        return $output;
    }

    private function voice_eligible(WP_Post $post): bool {
        if ($post->post_type === 'post') return true;
        $excluded = '/\b(privacy|terms|policy|legal|cookie|checkout|cart|account|contact)\b/i';
        $words = preg_split('/\s+/u', $this->clean_text($post->post_content . ' ' . $this->elementor_text($post->ID))) ?: [];
        return !preg_match($excluded, $post->post_name . ' ' . $post->post_title) && count(array_filter($words)) >= 120;
    }

    private function content_item(WP_Post $post): array {
        $url = $this->public_url((string)get_permalink($post));
        $text = $this->clean_text($post->post_content . "\n" . $this->elementor_text($post->ID));
        $excerpt = $this->clean_text($post->post_excerpt ?: wp_trim_words($text, 55, ''), 5000);
        $type = $post->post_type === 'post' ? 'post' : ($post->post_type === 'page' ? 'page' : 'custom');
        $featured_id = get_post_thumbnail_id($post);
        $featured = $featured_id ? [
            'url' => $this->public_url((string)wp_get_attachment_url($featured_id)),
            'alt' => $this->truncate(sanitize_text_field((string)get_post_meta($featured_id, '_wp_attachment_image_alt', true)), 500),
            'caption' => $this->truncate(sanitize_text_field((string)wp_get_attachment_caption($featured_id)), 1000),
        ] : null;
        $metadata = [
            'terms' => $this->public_terms($post->ID),
            'authorName' => $this->truncate(sanitize_text_field((string)get_the_author_meta('display_name', (int)$post->post_author)), 200),
            'seoTitle' => $this->truncate(sanitize_text_field((string)(get_post_meta($post->ID, '_yoast_wpseo_title', true) ?: get_post_meta($post->ID, 'rank_math_title', true))), 1000),
            'seoDescription' => $this->truncate(sanitize_textarea_field((string)(get_post_meta($post->ID, '_yoast_wpseo_metadesc', true) ?: get_post_meta($post->ID, 'rank_math_description', true))), 2000),
            'featuredMedia' => $featured,
            'wordCount' => str_word_count($text),
        ];
        $stable = [$type, $post->post_type, $url, $post->post_title, $excerpt, $text, $metadata];
        return [
            'externalContentId' => 'post:' . $post->ID,
            'contentType' => $type,
            'subtype' => sanitize_key($post->post_type),
            'url' => $url,
            'title' => $this->truncate(sanitize_text_field($post->post_title), 1000),
            'excerpt' => $excerpt,
            'contentText' => $text,
            'contentHash' => hash('sha256', (string)wp_json_encode($stable, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE)),
            'voiceEligible' => $this->voice_eligible($post),
            'publishedAt' => get_post_time(DATE_ATOM, true, $post),
            'modifiedAt' => get_post_modified_time(DATE_ATOM, true, $post),
            'metadata' => $metadata,
        ];
    }

    private function media_item(WP_Post $post): array {
        $url = $this->public_url((string)wp_get_attachment_url($post->ID));
        $alt = sanitize_text_field((string)get_post_meta($post->ID, '_wp_attachment_image_alt', true));
        $text = $this->clean_text($post->post_excerpt . ' ' . $post->post_content . ' ' . $alt, 5000);
        $metadata = ['mimeType' => sanitize_mime_type((string)$post->post_mime_type), 'alt' => $this->truncate($alt, 500)];
        return [
            'externalContentId' => 'media:' . $post->ID,
            'contentType' => 'media',
            'subtype' => sanitize_mime_type((string)$post->post_mime_type),
            'url' => $url,
            'title' => $this->truncate(sanitize_text_field($post->post_title), 1000),
            'excerpt' => $this->truncate(sanitize_textarea_field($post->post_excerpt), 5000),
            'contentText' => $text,
            'contentHash' => hash('sha256', $url . "\n" . $post->post_title . "\n" . $text . "\n" . $post->post_mime_type),
            'voiceEligible' => false,
            'publishedAt' => get_post_time(DATE_ATOM, true, $post),
            'modifiedAt' => get_post_modified_time(DATE_ATOM, true, $post),
            'metadata' => $metadata,
        ];
    }

    private function site_snapshot(): array {
        $menus = [];
        foreach (wp_get_nav_menus() as $menu) {
            $items = wp_get_nav_menu_items($menu->term_id);
            if (!is_array($items)) continue;
            $menus[] = [
                'name' => $this->truncate(sanitize_text_field((string)$menu->name), 200),
                'items' => array_slice(array_values(array_filter(array_map(fn($item) => [
                    'label' => $this->truncate(sanitize_text_field((string)$item->title), 300),
                    'url' => $this->public_url((string)$item->url),
                ], $items), static fn($item) => $item['url'] !== '')), 0, 100),
            ];
        }
        return [
            'name' => $this->truncate(sanitize_text_field((string)get_bloginfo('name')), 300),
            'description' => $this->truncate(sanitize_text_field((string)get_bloginfo('description')), 1000),
            'locale' => sanitize_text_field((string)get_locale()),
            'homeUrl' => $this->public_url(home_url('/')),
            'menus' => array_slice($menus, 0, 20),
        ];
    }
}
