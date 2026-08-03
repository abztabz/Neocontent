<?php

if (!defined('ABSPATH')) exit;

final class Neo_Settings {
    public function __construct(private readonly Neo_Cloud_Client $client) {
        add_action('admin_menu', [$this, 'menu']);
        add_action('admin_init', [$this, 'register']);
        add_action('admin_post_nae_register_site', [$this, 'register_site']);
        add_action('admin_post_nae_run_now', [$this, 'run_now']);
    }

    public function menu(): void {
        add_submenu_page('neo-authority', 'Settings', 'Settings', 'manage_options', 'neo-authority-settings', [$this, 'page']);
    }

    public function register(): void {
        register_setting('nae_v1_group', NAE_OPTION, [
            'type' => 'array',
            'sanitize_callback' => [$this, 'sanitize'],
        ]);
    }

    public function sanitize($input): array {
        $current = get_option(NAE_OPTION, []);
        return [
            'cloud_url' => esc_url_raw(trim((string)($input['cloud_url'] ?? ''))),
            'site_id' => sanitize_text_field($current['site_id'] ?? wp_generate_uuid4()),
            'site_secret' => sanitize_text_field($current['site_secret'] ?? wp_generate_password(64, false, false)),
            'business_name' => sanitize_text_field($input['business_name'] ?? get_bloginfo('name')),
            'business_description' => sanitize_textarea_field($input['business_description'] ?? get_bloginfo('description')),
            'industry' => sanitize_text_field($input['industry'] ?? ''),
            'target_audience' => sanitize_textarea_field($input['target_audience'] ?? ''),
            'tone' => sanitize_text_field($input['tone'] ?? 'Clear, useful, trustworthy and professional'),
            'services' => sanitize_textarea_field($input['services'] ?? ''),
            'locations' => sanitize_text_field($input['locations'] ?? ''),
            'publish_mode' => in_array($input['publish_mode'] ?? '', ['auto', 'approval_required'], true) ? $input['publish_mode'] : 'approval_required',
            'content_mode' => in_array($input['content_mode'] ?? '', ['business_focused', 'balanced', 'industry_authority'], true) ? $input['content_mode'] : 'balanced',
            'cadence' => in_array($input['cadence'] ?? '', ['daily', 'weekly', 'biweekly', 'monthly'], true) ? $input['cadence'] : 'weekly',
            'knowledge_review_required' => isset($input['knowledge_review_required']) ? '1' : '0',
            'registered' => sanitize_text_field($current['registered'] ?? '0'),
        ];
    }

    public function page(): void {
        if (!current_user_can('manage_options')) return;
        $s = wp_parse_args(get_option(NAE_OPTION, []), [
            'business_name' => get_bloginfo('name'), 'business_description' => get_bloginfo('description'),
            'industry' => '', 'target_audience' => '', 'tone' => 'Clear, useful, trustworthy and professional',
            'services' => '', 'locations' => '', 'cloud_url' => '', 'publish_mode' => 'approval_required',
            'content_mode' => 'balanced', 'cadence' => 'weekly', 'knowledge_review_required' => '1', 'registered' => '0',
        ]);
        ?>
        <div class="wrap"><h1>Neo Authority Settings</h1>
            <?php if (!empty($_GET['nae_message'])): ?><div class="notice notice-info"><p><?php echo esc_html(wp_unslash($_GET['nae_message'])); ?></p></div><?php endif; ?>
            <form method="post" action="options.php"><?php settings_fields('nae_v1_group'); ?>
                <table class="form-table">
                    <tr><th>Cloud URL</th><td><input class="regular-text code" type="url" name="<?php echo NAE_OPTION; ?>[cloud_url]" value="<?php echo esc_attr($s['cloud_url']); ?>"></td></tr>
                    <tr><th>Business name</th><td><input class="regular-text" name="<?php echo NAE_OPTION; ?>[business_name]" value="<?php echo esc_attr($s['business_name']); ?>"></td></tr>
                    <tr><th>Description</th><td><textarea class="large-text" rows="3" name="<?php echo NAE_OPTION; ?>[business_description]"><?php echo esc_textarea($s['business_description']); ?></textarea></td></tr>
                    <tr><th>Industry</th><td><input class="regular-text" name="<?php echo NAE_OPTION; ?>[industry]" value="<?php echo esc_attr($s['industry']); ?>"></td></tr>
                    <tr><th>Audience</th><td><textarea class="large-text" rows="2" name="<?php echo NAE_OPTION; ?>[target_audience]"><?php echo esc_textarea($s['target_audience']); ?></textarea></td></tr>
                    <tr><th>Services</th><td><textarea class="large-text" rows="2" name="<?php echo NAE_OPTION; ?>[services]"><?php echo esc_textarea($s['services']); ?></textarea></td></tr>
                    <tr><th>Locations</th><td><input class="regular-text" name="<?php echo NAE_OPTION; ?>[locations]" value="<?php echo esc_attr($s['locations']); ?>"></td></tr>
                    <tr><th>Tone</th><td><input class="regular-text" name="<?php echo NAE_OPTION; ?>[tone]" value="<?php echo esc_attr($s['tone']); ?>"></td></tr>
                    <tr><th>Content mode</th><td><select name="<?php echo NAE_OPTION; ?>[content_mode]"><option value="business_focused" <?php selected($s['content_mode'], 'business_focused'); ?>>Business focused</option><option value="balanced" <?php selected($s['content_mode'], 'balanced'); ?>>Balanced</option><option value="industry_authority" <?php selected($s['content_mode'], 'industry_authority'); ?>>Industry authority</option></select></td></tr>
                    <tr><th>Publishing</th><td><select name="<?php echo NAE_OPTION; ?>[publish_mode]"><option value="approval_required" <?php selected($s['publish_mode'], 'approval_required'); ?>>Save for approval</option><option value="auto" <?php selected($s['publish_mode'], 'auto'); ?>>Auto-publish</option></select></td></tr>
                    <tr><th>Cadence</th><td><select name="<?php echo NAE_OPTION; ?>[cadence]"><option value="daily" <?php selected($s['cadence'], 'daily'); ?>>Daily</option><option value="weekly" <?php selected($s['cadence'], 'weekly'); ?>>Weekly</option><option value="biweekly" <?php selected($s['cadence'], 'biweekly'); ?>>Every two weeks</option><option value="monthly" <?php selected($s['cadence'], 'monthly'); ?>>Monthly</option></select></td></tr>
                    <tr><th>Knowledge governance</th><td><label><input type="checkbox" name="<?php echo NAE_OPTION; ?>[knowledge_review_required]" value="1" <?php checked($s['knowledge_review_required'], '1'); ?>> Require approval before new website knowledge is used</label></td></tr>
                </table><?php submit_button('Save settings'); ?>
            </form>
            <hr><p>Cloud registration: <strong><?php echo $s['registered'] === '1' ? 'Connected' : 'Not connected'; ?></strong></p>
            <div style="display:flex;gap:10px"><form method="post" action="<?php echo esc_url(admin_url('admin-post.php')); ?>"><?php wp_nonce_field('nae_register_site'); ?><input type="hidden" name="action" value="nae_register_site"><?php submit_button('Register / sync site', 'secondary', 'submit', false); ?></form>
            <form method="post" action="<?php echo esc_url(admin_url('admin-post.php')); ?>"><?php wp_nonce_field('nae_run_now'); ?><input type="hidden" name="action" value="nae_run_now"><?php submit_button('Generate blog now', 'primary', 'submit', false); ?></form></div>
        </div><?php
    }

    public function register_site(): void {
        $this->authorize('nae_register_site'); $s = get_option(NAE_OPTION, []);
        $result = $this->client->register_site([
            'businessName' => $s['business_name'] ?? get_bloginfo('name'), 'businessDescription' => $s['business_description'] ?? '',
            'industry' => $s['industry'] ?? '', 'targetAudience' => $s['target_audience'] ?? '', 'tone' => $s['tone'] ?? '',
            'services' => array_values(array_filter(array_map('trim', explode(',', $s['services'] ?? '')))),
            'locations' => array_values(array_filter(array_map('trim', explode(',', $s['locations'] ?? '')))),
            'contentMode' => $s['content_mode'] ?? 'balanced', 'publishMode' => $s['publish_mode'] ?? 'approval_required',
            'cadence' => $s['cadence'] ?? 'weekly', 'knowledgeReviewRequired' => ($s['knowledge_review_required'] ?? '1') === '1',
        ]);
        if (!is_wp_error($result)) { $s['registered'] = '1'; update_option(NAE_OPTION, $s, false); }
        $this->redirect(is_wp_error($result) ? $result->get_error_message() : 'Site registered and synchronized.');
    }

    public function run_now(): void {
        $this->authorize('nae_run_now'); $result = $this->client->run_now();
        $this->redirect(is_wp_error($result) ? $result->get_error_message() : 'Content run completed.');
    }

    private function authorize(string $nonce): void { if (!current_user_can('manage_options')) wp_die('Not allowed'); check_admin_referer($nonce); }
    private function redirect(string $message): void { wp_safe_redirect(add_query_arg(['page' => 'neo-authority-settings', 'nae_message' => rawurlencode($message)], admin_url('admin.php'))); exit; }
}
