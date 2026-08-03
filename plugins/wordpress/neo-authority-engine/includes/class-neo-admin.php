<?php

if (!defined('ABSPATH')) exit;

final class Neo_Admin {
    public function __construct(
        private readonly Neo_Cloud_Client $client,
        private readonly Neo_Source_Manager $sources,
    ) {
        add_action('admin_menu', [$this, 'menu']);
        add_action('admin_post_nae_add_source', [$this, 'add_source']);
        add_action('admin_post_nae_decide_source', [$this, 'decide_source']);
    }

    public function menu(): void {
        add_menu_page(
            'Neo Authority',
            'Neo Authority',
            'manage_options',
            'neo-authority',
            [$this, 'page'],
            'dashicons-lightbulb',
            58
        );
    }

    public function page(): void {
        if (!current_user_can('manage_options')) return;
        $sources = array_reverse(get_option(NAE_SOURCES, []));
        ?>
        <div class="wrap">
            <h1>Neo Authority Engine</h1>
            <?php if (!empty($_GET['nae_message'])): ?>
                <div class="notice notice-info"><p><?php echo esc_html(wp_unslash($_GET['nae_message'])); ?></p></div>
            <?php endif; ?>
            <div style="display:grid;grid-template-columns:minmax(0,1fr) minmax(0,2fr);gap:20px;max-width:1150px">
                <section style="background:white;border:1px solid #dcdcde;border-radius:12px;padding:20px">
                    <h2>Add source URL</h2>
                    <form method="post" action="<?php echo esc_url(admin_url('admin-post.php')); ?>">
                        <?php wp_nonce_field('nae_add_source'); ?>
                        <input type="hidden" name="action" value="nae_add_source">
                        <p><label>URL<br><input type="url" class="regular-text" required name="url" placeholder="https://..."></label></p>
                        <p><label>Label<br><input type="text" class="regular-text" name="label"></label></p>
                        <p><label>Purpose<br><select name="purpose">
                            <option value="industry_research">Industry research</option>
                            <option value="preferred_research">Preferred research</option>
                            <option value="business_knowledge">Business knowledge</option>
                            <option value="topic_discovery_only">Topic discovery only</option>
                        </select></label></p>
                        <?php submit_button('Fetch and review source', 'primary', 'submit', false); ?>
                    </form>
                </section>
                <section style="background:white;border:1px solid #dcdcde;border-radius:12px;padding:20px">
                    <h2>Sources</h2>
                    <?php if (!$sources): ?><p>No sources added yet.</p><?php endif; ?>
                    <?php foreach ($sources as $source): ?>
                        <div style="padding:14px 0;border-bottom:1px solid #eee">
                            <strong><?php echo esc_html($source['label'] ?: $source['url']); ?></strong><br>
                            <a href="<?php echo esc_url($source['url']); ?>" target="_blank" rel="noopener noreferrer"><?php echo esc_html($source['url']); ?></a>
                            <p>Status: <strong><?php echo esc_html($source['status']); ?></strong> · Trust: <?php echo esc_html((string)$source['trust_score']); ?> · Freshness: <?php echo esc_html($source['freshness']); ?></p>
                            <?php if (($source['status'] ?? '') === 'pending_review'): ?>
                                <div style="display:flex;gap:8px">
                                <?php foreach (['approve' => 'Approve', 'reject' => 'Reject'] as $decision => $label): ?>
                                    <form method="post" action="<?php echo esc_url(admin_url('admin-post.php')); ?>">
                                        <?php wp_nonce_field('nae_decide_source'); ?>
                                        <input type="hidden" name="action" value="nae_decide_source">
                                        <input type="hidden" name="source_id" value="<?php echo esc_attr($source['id']); ?>">
                                        <input type="hidden" name="decision" value="<?php echo esc_attr($decision); ?>">
                                        <?php submit_button($label, $decision === 'approve' ? 'primary' : 'secondary', 'submit', false); ?>
                                    </form>
                                <?php endforeach; ?>
                                </div>
                            <?php endif; ?>
                        </div>
                    <?php endforeach; ?>
                </section>
            </div>
        </div>
        <?php
    }

    public function add_source(): void {
        $this->authorize('nae_add_source');
        $result = $this->sources->add($_POST);
        $this->redirect(is_wp_error($result) ? $result->get_error_message() : 'Source fetched and queued for review.');
    }

    public function decide_source(): void {
        $this->authorize('nae_decide_source');
        $result = $this->sources->decide(
            sanitize_text_field($_POST['source_id'] ?? ''),
            sanitize_key($_POST['decision'] ?? 'reject')
        );
        $this->redirect(is_wp_error($result) ? $result->get_error_message() : 'Source decision saved.');
    }

    private function authorize(string $nonce): void {
        if (!current_user_can('manage_options')) wp_die('Not allowed');
        check_admin_referer($nonce);
    }

    private function redirect(string $message): void {
        wp_safe_redirect(add_query_arg(['page' => 'neo-authority', 'nae_message' => rawurlencode($message)], admin_url('admin.php')));
        exit;
    }
}
