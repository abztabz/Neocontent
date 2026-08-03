<?php

if (!defined('ABSPATH')) exit;

define('NAE_CANDIDATES', 'nae_v1_knowledge_candidates');

final class Neo_Knowledge_Manager {
    public function __construct(private readonly Neo_Cloud_Client $client) {
        add_action('admin_menu', [$this, 'menu']);
        add_action('admin_post_nae_scan_knowledge', [$this, 'scan']);
        add_action('admin_post_nae_decide_knowledge', [$this, 'decide']);
    }

    public function menu(): void {
        add_submenu_page('neo-authority', 'Knowledge Review', 'Knowledge Review', 'manage_options', 'neo-authority-knowledge', [$this, 'page']);
    }

    public function scan(): void {
        $this->authorize('nae_scan_knowledge');
        $posts = get_posts([
            'post_type' => ['page', 'post'],
            'post_status' => 'publish',
            'numberposts' => 100,
            'orderby' => 'modified',
            'order' => 'DESC',
        ]);
        $local = get_option(NAE_CANDIDATES, []);
        $known = [];
        foreach ($local as $candidate) $known[$candidate['fingerprint']] = true;

        $new = [];
        foreach ($posts as $post) {
            $text = trim(wp_strip_all_tags(strip_shortcodes($post->post_content)));
            if ($text === '') continue;
            $summary = wp_trim_words($text, 80, '…');
            $fingerprint = hash('sha256', $post->ID . '|' . $post->post_modified_gmt . '|' . $summary);
            if (isset($known[$fingerprint])) continue;
            $candidate = [
                'externalId' => (string)$post->ID,
                'title' => get_the_title($post),
                'summary' => $summary,
                'sourceUrl' => get_permalink($post),
                'sourceType' => $post->post_type === 'page' ? 'website_page' : 'existing_blog',
                'confidence' => $post->post_type === 'page' ? 92 : 78,
                'riskLevel' => $this->risk_level($summary),
                'fingerprint' => $fingerprint,
                'status' => 'pending',
            ];
            $new[] = $candidate;
            $local[] = $candidate;
        }

        if ($new) {
            $result = $this->client->sync_knowledge_candidates($new);
            if (is_wp_error($result)) $this->redirect($result->get_error_message());
            $cloud = $result['candidates'] ?? [];
            foreach ($local as &$candidate) {
                foreach ($cloud as $remote) {
                    if (($remote['fingerprint'] ?? '') === $candidate['fingerprint']) {
                        $candidate['cloud_id'] = sanitize_text_field($remote['id'] ?? '');
                        break;
                    }
                }
            }
            unset($candidate);
        }
        update_option(NAE_CANDIDATES, $local, false);
        $this->redirect(count($new) . ' knowledge candidate(s) detected.');
    }

    public function decide(): void {
        $this->authorize('nae_decide_knowledge');
        $fingerprint = sanitize_text_field($_POST['fingerprint'] ?? '');
        $decision = sanitize_key($_POST['decision'] ?? 'reject') === 'approve' ? 'approve' : 'reject';
        $edited = sanitize_textarea_field($_POST['edited_content'] ?? '');
        $candidates = get_option(NAE_CANDIDATES, []);
        foreach ($candidates as &$candidate) {
            if (($candidate['fingerprint'] ?? '') !== $fingerprint) continue;
            if (empty($candidate['cloud_id'])) $this->redirect('Candidate is not synchronized with the cloud.');
            $result = $this->client->decide_knowledge($candidate['cloud_id'], $decision, $edited ?: null);
            if (is_wp_error($result)) $this->redirect($result->get_error_message());
            $candidate['status'] = $decision === 'approve' ? 'approved' : 'rejected';
            $candidate['reviewed_at'] = current_time('c');
            if ($decision === 'approve') {
                $knowledge = get_option(NAE_KNOWLEDGE, []);
                $knowledge[] = [
                    'title' => $candidate['title'],
                    'content' => $edited ?: $candidate['summary'],
                    'source_url' => $candidate['sourceUrl'],
                    'fingerprint' => $candidate['fingerprint'],
                ];
                update_option(NAE_KNOWLEDGE, $knowledge, false);
            }
            break;
        }
        unset($candidate);
        update_option(NAE_CANDIDATES, $candidates, false);
        $this->redirect('Knowledge decision saved.');
    }

    public function page(): void {
        if (!current_user_can('manage_options')) return;
        $candidates = array_filter(get_option(NAE_CANDIDATES, []), static fn($item) => ($item['status'] ?? '') === 'pending');
        ?>
        <div class="wrap"><h1>Knowledge Review</h1>
            <?php if (!empty($_GET['nae_message'])): ?><div class="notice notice-info"><p><?php echo esc_html(wp_unslash($_GET['nae_message'])); ?></p></div><?php endif; ?>
            <form method="post" action="<?php echo esc_url(admin_url('admin-post.php')); ?>"><?php wp_nonce_field('nae_scan_knowledge'); ?><input type="hidden" name="action" value="nae_scan_knowledge"><?php submit_button('Scan website for changes', 'primary', 'submit', false); ?></form>
            <div style="max-width:1000px;margin-top:20px">
            <?php if (!$candidates): ?><p>No pending knowledge changes.</p><?php endif; ?>
            <?php foreach ($candidates as $candidate): ?>
                <section style="background:#fff;border:1px solid #dcdcde;border-radius:12px;padding:18px;margin-bottom:14px">
                    <h2><?php echo esc_html($candidate['title']); ?></h2>
                    <p><strong>Risk:</strong> <?php echo esc_html($candidate['riskLevel']); ?> · <strong>Confidence:</strong> <?php echo esc_html((string)$candidate['confidence']); ?>%</p>
                    <p><?php echo esc_html($candidate['summary']); ?></p>
                    <form method="post" action="<?php echo esc_url(admin_url('admin-post.php')); ?>">
                        <?php wp_nonce_field('nae_decide_knowledge'); ?><input type="hidden" name="action" value="nae_decide_knowledge"><input type="hidden" name="fingerprint" value="<?php echo esc_attr($candidate['fingerprint']); ?>">
                        <textarea class="large-text" rows="4" name="edited_content" placeholder="Optionally edit the approved knowledge statement"></textarea>
                        <div style="display:flex;gap:8px;margin-top:10px"><button class="button button-primary" name="decision" value="approve">Approve knowledge</button><button class="button" name="decision" value="reject">Ignore change</button></div>
                    </form>
                </section>
            <?php endforeach; ?>
            </div>
        </div><?php
    }

    private function risk_level(string $text): string {
        return preg_match('/\b(price|guarantee|medical|legal|regulated|certified|licensed|refund|warranty)\b/i', $text) ? 'high' : 'normal';
    }
    private function authorize(string $nonce): void { if (!current_user_can('manage_options')) wp_die('Not allowed'); check_admin_referer($nonce); }
    private function redirect(string $message): void { wp_safe_redirect(add_query_arg(['page' => 'neo-authority-knowledge', 'nae_message' => rawurlencode($message)], admin_url('admin.php'))); exit; }
}
