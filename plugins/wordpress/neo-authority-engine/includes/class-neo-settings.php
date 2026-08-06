<?php

if (!defined('ABSPATH')) exit;

final class Neo_Settings {
    private Neo_Cloud_Client $client;

    public function __construct(Neo_Cloud_Client $client) {
        $this->client = $client;
        add_action('admin_menu', [$this, 'menu']);
        add_action('admin_init', [$this, 'register']);
        add_action('admin_post_nae_register_site', [$this, 'register_site']);
        add_action('nae_connection_check', [$this, 'check_connection']);
    }

    public function menu(): void {
        $settings = get_option(NAE_OPTION, []);
        if (($settings['registered'] ?? '0') !== '1') {
            add_submenu_page('neo-authority', 'Activate NeoContent', 'Activate', 'manage_options', 'neo-authority-settings', [$this, 'page']);
        }
    }

    public function register(): void {
        register_setting('nae_v1_group', NAE_OPTION, [
            'type' => 'array',
            'sanitize_callback' => [$this, 'sanitize'],
        ]);
    }

    public function sanitize($input): array {
        Neo_Secret_Store::get();
        $current = get_option(NAE_OPTION, []);
        return [
            'cloud_url' => sanitize_text_field((string)($current['cloud_url'] ?? 'https://living-content-engine.vercel.app')),
            'site_id' => sanitize_text_field($current['site_id'] ?? wp_generate_uuid4()),
            'site_secret_encrypted' => sanitize_text_field($current['site_secret_encrypted'] ?? ''),
            'business_name' => sanitize_text_field($input['business_name'] ?? get_bloginfo('name')),
            'business_description' => sanitize_textarea_field($input['business_description'] ?? get_bloginfo('description')),
            'industry' => sanitize_text_field($input['industry'] ?? ''),
            'target_audience' => sanitize_textarea_field($input['target_audience'] ?? ''),
            'tone' => sanitize_text_field($input['tone'] ?? 'Clear, useful, trustworthy and professional'),
            'services' => sanitize_textarea_field($input['services'] ?? ''),
            'locations' => sanitize_text_field($input['locations'] ?? ''),
            'manual_source_urls' => sanitize_textarea_field((string)($current['manual_source_urls'] ?? '')),
            'publish_mode' => 'approval_required',
            'content_mode' => in_array($input['content_mode'] ?? '', ['business_focused', 'balanced', 'industry_authority'], true) ? $input['content_mode'] : 'balanced',
            'cadence' => in_array($input['cadence'] ?? '', ['daily', 'weekly', 'biweekly', 'monthly'], true) ? $input['cadence'] : 'weekly',
            'generation_mode' => 'operator_managed',
            'knowledge_review_required' => '0',
            'registered' => sanitize_text_field($current['registered'] ?? '0'),
            'connection_status' => sanitize_key($current['connection_status'] ?? 'not_connected'),
            'connection_requested_at' => absint($current['connection_requested_at'] ?? 0),
        ];
    }

    private function sanitize_manual_source_urls(string $value): string {
        $safe = [];
        foreach (array_slice(preg_split('/\R/', $value) ?: [], 0, 20) as $line) {
            $url = esc_url_raw(trim((string)$line), ['https']);
            if ($url === '' || !wp_http_validate_url($url)) continue;
            $host = strtolower((string)wp_parse_url($url, PHP_URL_HOST));
            if ($host === 'localhost' || str_ends_with($host, '.local') || str_ends_with($host, '.internal')) continue;
            if (filter_var($host, FILTER_VALIDATE_IP)
                && !filter_var($host, FILTER_VALIDATE_IP, FILTER_FLAG_NO_PRIV_RANGE | FILTER_FLAG_NO_RES_RANGE)) continue;
            $safe[] = $url;
        }
        return implode("\n", array_values(array_unique($safe)));
    }

    private function sanitize_cloud_url(string $value, string $current): string {
        if (trim($value) === '') return '';
        $url = esc_url_raw(trim($value), ['https']);
        $parts = wp_parse_url($url);
        $allowed = apply_filters('nae_allowed_cloud_hosts', ['living-content-engine.vercel.app']);
        $allowed = is_array($allowed) ? array_map(static fn($host) => strtolower((string)$host), $allowed) : [];
        $valid = is_array($parts)
            && strtolower((string)($parts['scheme'] ?? '')) === 'https'
            && empty($parts['user']) && empty($parts['pass'])
            && (empty($parts['port']) || (int)$parts['port'] === 443)
            && in_array(strtolower((string)($parts['host'] ?? '')), $allowed, true);
        if (!$valid) {
            add_settings_error(NAE_OPTION, 'nae_cloud_url_invalid', 'Use the approved Neo Authority HTTPS cloud URL.');
            return $current;
        }
        return untrailingslashit($url);
    }

    public function page(): void {
        if (!current_user_can('manage_options')) return;
        $s = wp_parse_args(get_option(NAE_OPTION, []), [
            'business_name' => get_bloginfo('name'), 'business_description' => get_bloginfo('description'),
            'industry' => '', 'target_audience' => '', 'tone' => 'Clear, useful, trustworthy and professional',
            'services' => '', 'locations' => '', 'cloud_url' => '', 'publish_mode' => 'approval_required',
            'manual_source_urls' => '',
            'content_mode' => 'balanced', 'cadence' => 'weekly', 'knowledge_review_required' => '1', 'registered' => '0',
            'generation_mode' => 'operator_managed',
            'connection_status' => 'not_connected', 'connection_requested_at' => 0,
        ]);
        ?>
        <div class="wrap"><h1>Activate NeoContent</h1>
            <?php if (!empty($_GET['nae_message'])): ?><div class="notice notice-info"><p><?php echo esc_html(wp_unslash($_GET['nae_message'])); ?></p></div><?php endif; ?>
            <form method="post" action="options.php"><?php settings_fields('nae_v1_group'); ?>
                <table class="form-table">
                    <tr><th>Business name</th><td><input class="regular-text" name="<?php echo NAE_OPTION; ?>[business_name]" value="<?php echo esc_attr($s['business_name']); ?>"></td></tr>
                    <tr><th>Description</th><td><textarea class="large-text" rows="3" name="<?php echo NAE_OPTION; ?>[business_description]"><?php echo esc_textarea($s['business_description']); ?></textarea></td></tr>
                    <tr><th>Industry</th><td><input class="regular-text" name="<?php echo NAE_OPTION; ?>[industry]" value="<?php echo esc_attr($s['industry']); ?>"></td></tr>
                    <tr><th>Audience</th><td><textarea class="large-text" rows="2" name="<?php echo NAE_OPTION; ?>[target_audience]"><?php echo esc_textarea($s['target_audience']); ?></textarea></td></tr>
                    <tr><th>Services</th><td><textarea class="large-text" rows="2" name="<?php echo NAE_OPTION; ?>[services]"><?php echo esc_textarea($s['services']); ?></textarea></td></tr>
                    <tr><th>Locations</th><td><input class="regular-text" name="<?php echo NAE_OPTION; ?>[locations]" value="<?php echo esc_attr($s['locations']); ?>"></td></tr>
                    <tr><th>Tone</th><td><input class="regular-text" name="<?php echo NAE_OPTION; ?>[tone]" value="<?php echo esc_attr($s['tone']); ?>"></td></tr>
                    <tr><th>Content mode</th><td><select name="<?php echo NAE_OPTION; ?>[content_mode]"><option value="business_focused" <?php selected($s['content_mode'], 'business_focused'); ?>>Business focused</option><option value="balanced" <?php selected($s['content_mode'], 'balanced'); ?>>Balanced</option><option value="industry_authority" <?php selected($s['content_mode'], 'industry_authority'); ?>>Industry authority</option></select></td></tr>
                    <tr><th>Cadence</th><td><select name="<?php echo NAE_OPTION; ?>[cadence]"><option value="daily" <?php selected($s['cadence'], 'daily'); ?>>Daily</option><option value="weekly" <?php selected($s['cadence'], 'weekly'); ?>>Weekly</option><option value="biweekly" <?php selected($s['cadence'], 'biweekly'); ?>>Every two weeks</option><option value="monthly" <?php selected($s['cadence'], 'monthly'); ?>>Monthly</option></select></td></tr>
                </table><?php submit_button('Save settings'); ?>
            </form>
            <?php
            $status = $s['registered'] === '1' ? 'Active' : (($s['connection_status'] ?? '') === 'pending' ? 'Connecting' : (($s['connection_status'] ?? '') === 'support_required' ? 'Needs assistance' : 'Not connected'));
            ?>
            <hr><p>Service status: <strong><?php echo esc_html($status); ?></strong></p>
            <?php if ($s['registered'] !== '1' && ($s['connection_status'] ?? '') !== 'pending'): ?><form method="post" action="<?php echo esc_url(admin_url('admin-post.php')); ?>"><?php wp_nonce_field('nae_register_site'); ?><input type="hidden" name="action" value="nae_register_site"><?php submit_button('Connect NeoContent', 'primary', 'submit', false); ?></form><?php endif; ?>
        </div><?php
    }

    public function register_site(): void {
        $this->authorize('nae_register_site');
        $message = $this->attempt_connection();
        $this->redirect($message);
    }

    public function check_connection(): void {
        $this->attempt_connection();
    }

    private function attempt_connection(): string {
        $s = get_option(NAE_OPTION, []);
        $result = $this->client->register_site([
            'businessName' => $s['business_name'] ?? get_bloginfo('name'), 'businessDescription' => $s['business_description'] ?? '',
            'industry' => $s['industry'] ?? '', 'targetAudience' => $s['target_audience'] ?? '', 'tone' => $s['tone'] ?? '',
            'services' => array_values(array_filter(array_map('trim', explode(',', $s['services'] ?? '')))),
            'locations' => array_values(array_filter(array_map('trim', explode(',', $s['locations'] ?? '')))),
            'contentMode' => $s['content_mode'] ?? 'balanced', 'publishMode' => $s['publish_mode'] ?? 'approval_required',
            'cadence' => $s['cadence'] ?? 'weekly', 'knowledgeReviewRequired' => ($s['knowledge_review_required'] ?? '1') === '1',
        ]);
        if (is_wp_error($result)) {
            $s['connection_status'] = 'support_required';
            update_option(NAE_OPTION, $s, false);
            $code = (string)$result->get_error_code();
            $reference = in_array($code, ['nae_secret_invalid', 'nae_signing_failed'], true) ? 'C01'
                : (in_array($code, ['nae_cloud_missing', 'nae_cloud_invalid'], true) ? 'C02'
                : ($code === 'http_request_failed' ? 'C03' : 'C04'));
            return 'NeoContent could not connect. Please contact support. Reference: NEO-' . $reference;
        }
        $status = sanitize_key((string)($result['status'] ?? ''));
        if ($status === 'registered') {
            $s['registered'] = '1';
            $s['connection_status'] = 'active';
            update_option(NAE_OPTION, $s, false);
            wp_clear_scheduled_hook('nae_connection_check');
            wp_schedule_single_event(time() + 10, 'nae_operator_sync');
            return 'NeoContent is connected.';
        }
        if ($status === 'pending') {
            $s['connection_status'] = 'pending';
            if (empty($s['connection_requested_at'])) $s['connection_requested_at'] = time();
            update_option(NAE_OPTION, $s, false);
            if (!wp_next_scheduled('nae_connection_check')) wp_schedule_single_event(time() + 300, 'nae_connection_check');
            return 'NeoContent is connecting. Setup will complete automatically.';
        }
        $s['connection_status'] = 'support_required';
        update_option(NAE_OPTION, $s, false);
        return 'NeoContent needs assistance. Please contact support.';
    }

    private function authorize(string $nonce): void { if (!current_user_can('manage_options')) wp_die('Not allowed'); check_admin_referer($nonce); }
    private function redirect(string $message): void { wp_safe_redirect(add_query_arg(['page' => 'neo-authority-settings', 'nae_message' => rawurlencode($message)], admin_url('admin.php'))); exit; }
}
