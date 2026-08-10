<?php

if (!defined('ABSPATH')) exit;

final class Neo_Settings {
    private Neo_Cloud_Client $client;

    public function __construct(Neo_Cloud_Client $client) {
        $this->client = $client;
        add_action('admin_menu', [$this, 'menu']);
        add_action('admin_init', [$this, 'register']);
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
            <?php if (($_GET['nae_connection'] ?? '') === 'sent'): ?><div class="notice notice-success"><p>NeoContent received the connection request. Secure operator approval is pending.</p></div><?php endif; ?>
            <?php if (($_GET['nae_connection'] ?? '') === 'error'): ?><div class="notice notice-error"><p>NeoContent could not complete the connection request. Please press Connect NeoContent to retry.</p></div><?php endif; ?>
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
            $connecting = in_array(($s['connection_status'] ?? ''), ['browser_pending', 'pending'], true);
            $status = $s['registered'] === '1' ? 'Active' : ($connecting ? 'Connecting' : (($s['connection_status'] ?? '') === 'support_required' ? 'Needs assistance' : 'Not connected'));
            ?>
            <hr><p>Service status: <strong><?php echo esc_html($status); ?></strong></p>
            <?php if ($s['registered'] !== '1' && !$connecting) $this->render_connect_form($s); ?>
            <?php if ($s['registered'] !== '1' && $connecting): ?><p>Connection request sent. Waiting for secure operator approval.</p><?php endif; ?>
        </div><?php
    }

    private function render_connect_form(array $s): void {
        $package = $this->client->registration_package([
            'businessName' => $s['business_name'] ?? get_bloginfo('name'), 'businessDescription' => $s['business_description'] ?? '',
            'industry' => $s['industry'] ?? '', 'targetAudience' => $s['target_audience'] ?? '', 'tone' => $s['tone'] ?? '',
            'services' => array_values(array_filter(array_map('trim', explode(',', $s['services'] ?? '')))),
            'locations' => array_values(array_filter(array_map('trim', explode(',', $s['locations'] ?? '')))),
            'contentMode' => $s['content_mode'] ?? 'balanced', 'publishMode' => $s['publish_mode'] ?? 'approval_required',
            'cadence' => $s['cadence'] ?? 'weekly', 'knowledgeReviewRequired' => ($s['knowledge_review_required'] ?? '1') === '1',
        ]);
        if (is_wp_error($package)) {
            echo '<p class="notice notice-error"><strong>NeoContent could not prepare the connection request. Reference: NEO-C01.</strong></p>';
            return;
        }
        $state = wp_generate_password(48, false, false);
        $envelope = [
            'schemaVersion' => 'neo-browser-navigation-v1',
            'payload' => $package['body'],
            'siteId' => $package['headers']['X-Neo-Site-ID'],
            'timestamp' => $package['headers']['X-Neo-Timestamp'],
            'signature' => $package['headers']['X-Neo-Signature'],
            'returnUrl' => add_query_arg('page', 'neo-authority-settings', admin_url('admin.php')),
            'state' => $state,
        ];
        ?><form method="post" action="<?php echo esc_url($package['url']); ?>">
            <input type="hidden" name="neo_connection_envelope" value="<?php echo esc_attr(wp_json_encode($envelope, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE)); ?>">
            <?php submit_button('Connect NeoContent', 'primary', 'submit', false); ?>
        </form><?php
    }
}
