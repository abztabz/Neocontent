<?php

if (!defined('ABSPATH')) exit;

final class Neo_Customer_Dashboard {
    private Neo_Cloud_Client $client;

    public function __construct(Neo_Cloud_Client $client) {
        $this->client = $client;
        add_action('admin_menu', [$this, 'menu']);
        add_action('admin_post_nae_review_draft', [$this, 'review_draft']);
        add_action('add_meta_boxes_post', [$this, 'add_evidence_box']);
    }

    public function menu(): void {
        add_menu_page('NeoContent', 'NeoContent', 'manage_options', 'neo-authority', [$this, 'researching'], 'dashicons-lightbulb', 58);
        add_submenu_page('neo-authority', 'Researching', 'Researching', 'manage_options', 'neo-authority', [$this, 'researching']);
        add_submenu_page('neo-authority', 'Drafts', 'Drafts', 'manage_options', 'neo-authority-drafts', [$this, 'drafts']);
    }

    private function program(): array {
        $cached = get_transient('nae_customer_jobs');
        if (is_array($cached) && isset($cached['jobs']) && is_array($cached['jobs'])) return $cached;
        $result = $this->client->list_content_jobs();
        if (is_wp_error($result)) return ['jobs' => [], 'nextResearchAt' => null, 'cadence' => ''];
        $program = [
            'jobs' => is_array($result['jobs'] ?? null) ? $result['jobs'] : [],
            'nextResearchAt' => sanitize_text_field((string)($result['nextResearchAt'] ?? '')),
            'cadence' => sanitize_key((string)($result['cadence'] ?? '')),
        ];
        set_transient('nae_customer_jobs', $program, MINUTE_IN_SECONDS);
        return $program;
    }

    private function jobs(): array {
        return $this->program()['jobs'];
    }

    public function researching(): void {
        if (!current_user_can('manage_options')) return;
        $program = $this->program();
        $jobs = array_values(array_filter($program['jobs'], static fn($job) => in_array(
            (string)($job['status'] ?? ''),
            ['researching', 'brief_ready', 'draft_ready', 'changes_requested'],
            true
        )));
        ?>
        <div class="wrap"><h1>Researching</h1>
            <p>NeoContent is researching and preparing the next articles for your website.</p>
            <?php if (!empty($program['nextResearchAt'])): ?>
                <p><strong>Next research scheduled:</strong> <?php echo esc_html(wp_date(get_option('date_format') . ' ' . get_option('time_format'), strtotime((string)$program['nextResearchAt']))); ?><?php if (!empty($program['cadence'])): ?> · <?php echo esc_html(ucfirst((string)$program['cadence'])); ?> cadence<?php endif; ?></p>
            <?php endif; ?>
            <?php if (!$jobs): ?><div class="notice notice-info inline"><p>No articles are currently being researched.</p></div><?php endif; ?>
            <div style="max-width:1000px">
                <?php foreach ($jobs as $job): ?>
                    <section style="background:#fff;border:1px solid #dcdcde;border-radius:10px;padding:18px;margin:14px 0">
                        <h2 style="margin-top:0"><?php echo esc_html((string)($job['topic'] ?? 'Upcoming article')); ?></h2>
                        <?php if (!empty($job['customer_summary'])): ?><p><?php echo esc_html((string)$job['customer_summary']); ?></p><?php endif; ?>
                        <p><strong>Status:</strong> Researching</p>
                    </section>
                <?php endforeach; ?>
            </div>
        </div>
        <?php
    }

    public function drafts(): void {
        if (!current_user_can('manage_options')) return;
        $posts = get_posts([
            'post_type' => 'post',
            'post_status' => ['draft', 'pending'],
            'numberposts' => 100,
            'meta_key' => '_nae_idempotency_key',
            'orderby' => 'date',
            'order' => 'DESC',
        ]);
        ?>
        <div class="wrap"><h1>Drafts</h1>
            <p>Review, edit, approve, or return each article for changes.</p>
            <?php if (!empty($_GET['nae_message'])): ?><div class="notice notice-info"><p><?php echo esc_html(wp_unslash($_GET['nae_message'])); ?></p></div><?php endif; ?>
            <?php if (!$posts): ?><div class="notice notice-info inline"><p>No drafts are awaiting review.</p></div><?php endif; ?>
            <div style="max-width:1000px">
            <?php foreach ($posts as $post):
                $job_id = (string)get_post_meta($post->ID, '_nae_idempotency_key', true);
                ?>
                <section style="background:#fff;border:1px solid #dcdcde;border-radius:10px;padding:18px;margin:14px 0">
                    <h2 style="margin-top:0"><?php echo esc_html(get_the_title($post)); ?></h2>
                    <p><?php echo esc_html(wp_trim_words(wp_strip_all_tags($post->post_content), 45, '…')); ?></p>
                    <p><a class="button" href="<?php echo esc_url(get_edit_post_link($post->ID, 'raw')); ?>">Edit and preview</a></p>
                    <form method="post" action="<?php echo esc_url(admin_url('admin-post.php')); ?>">
                        <?php wp_nonce_field('nae_review_draft_' . $post->ID); ?>
                        <input type="hidden" name="action" value="nae_review_draft"><input type="hidden" name="post_id" value="<?php echo esc_attr((string)$post->ID); ?>"><input type="hidden" name="job_id" value="<?php echo esc_attr($job_id); ?>">
                        <p><label>Feedback or requested changes<br><textarea class="large-text" rows="3" name="feedback" maxlength="5000"></textarea></label></p>
                        <div style="display:flex;gap:8px"><button class="button button-primary" name="decision" value="approved">Approve and publish</button><button class="button" name="decision" value="changes_requested">Request changes</button><button class="button button-link-delete" name="decision" value="rejected">Reject</button></div>
                    </form>
                </section>
            <?php endforeach; ?>
            </div>
        </div>
        <?php
    }

    public function review_draft(): void {
        if (!current_user_can('manage_options')) wp_die('Not allowed');
        $post_id = absint($_POST['post_id'] ?? 0);
        check_admin_referer('nae_review_draft_' . $post_id);
        $post = get_post($post_id);
        $job_id = sanitize_text_field((string)($_POST['job_id'] ?? ''));
        $stored_job_id = (string)get_post_meta($post_id, '_nae_idempotency_key', true);
        if (!$post || $post->post_type !== 'post' || !wp_is_uuid($job_id) || !hash_equals($stored_job_id, $job_id)) {
            $this->redirect('The draft could not be verified.');
        }
        $decision = sanitize_key((string)($_POST['decision'] ?? ''));
        if (!in_array($decision, ['approved', 'rejected', 'changes_requested'], true)) $this->redirect('The review decision is invalid.');
        $feedback = substr(sanitize_textarea_field((string)wp_unslash($_POST['feedback'] ?? '')), 0, 5000);
        if ($decision === 'changes_requested' && $feedback === '') $this->redirect('Add the changes you would like made.');

        if ($decision === 'approved') {
            $updated = wp_update_post(['ID' => $post_id, 'post_status' => 'publish'], true);
            if (is_wp_error($updated)) $this->redirect($updated->get_error_message());
        } elseif ($decision === 'rejected') {
            if (!wp_trash_post($post_id)) $this->redirect('The draft could not be rejected.');
        }
        $result = $this->client->review_content_job($job_id, $decision, $feedback);
        if (is_wp_error($result)) {
            if ($decision === 'approved') wp_update_post(['ID' => $post_id, 'post_status' => 'draft']);
            if ($decision === 'rejected') wp_untrash_post($post_id);
            $this->redirect($result->get_error_message());
        }
        delete_transient('nae_customer_jobs');
        $this->redirect($decision === 'approved' ? 'Article approved and published.' : ($decision === 'rejected' ? 'Article rejected.' : 'Changes requested.'));
    }

    public function add_evidence_box(): void {
        add_meta_box('nae_article_evidence', 'NeoContent SEO & Evidence', [$this, 'evidence_box'], 'post', 'normal', 'default');
    }

    public function evidence_box(WP_Post $post): void {
        if (get_post_meta($post->ID, '_nae_idempotency_key', true) === '') {
            echo '<p>No NeoContent evidence package is attached to this post.</p>';
            return;
        }
        $sources = json_decode((string)get_post_meta($post->ID, '_nae_sources', true), true);
        if (!is_array($sources)) $sources = [];
        $image_plan = json_decode((string)get_post_meta($post->ID, '_nae_image_plan', true), true);
        if (!is_array($image_plan)) $image_plan = [];
        ?>
        <p><strong>SEO title</strong><br><?php echo esc_html((string)get_post_meta($post->ID, '_nae_seo_title', true)); ?></p>
        <p><strong>Meta description</strong><br><?php echo esc_html((string)get_post_meta($post->ID, '_nae_meta_description', true)); ?></p>
        <p><strong>Focus keyphrase</strong><br><?php echo esc_html((string)get_post_meta($post->ID, '_nae_focus_keyphrase', true)); ?></p>
        <p><strong>Why this article was selected</strong><br><?php echo esc_html((string)get_post_meta($post->ID, '_nae_rationale', true)); ?></p>
        <p><strong>Image plan</strong></p>
        <?php if (!empty($image_plan['featured']['subject'])): ?><p><em>Featured/banner image:</em> <?php echo esc_html((string)$image_plan['featured']['subject']); ?><br><small>Alt text: <?php echo esc_html((string)($image_plan['featured']['altText'] ?? '')); ?></small></p><?php endif; ?>
        <?php if (!empty($image_plan['inline']) && is_array($image_plan['inline'])): ?><ul><?php foreach ($image_plan['inline'] as $image): if (!is_array($image)) continue; ?><li><strong>After “<?php echo esc_html((string)($image['afterHeading'] ?? 'section')); ?>”:</strong> <?php echo esc_html((string)($image['subject'] ?? '')); ?><?php if (!empty($image['altText'])): ?><br><small>Alt text: <?php echo esc_html((string)$image['altText']); ?></small><?php endif; ?></li><?php endforeach; ?></ul><?php endif; ?>
        <p><strong>Evidence sources</strong></p><ul>
        <?php foreach ($sources as $source):
            if (!is_array($source)) continue;
            $url = esc_url((string)($source['url'] ?? ''));
            if ($url === '') continue;
            ?><li><a href="<?php echo $url; ?>" target="_blank" rel="noopener noreferrer"><?php echo esc_html((string)($source['title'] ?? $url)); ?></a><?php if (!empty($source['claimSupported'])): ?> — <?php echo esc_html((string)$source['claimSupported']); ?><?php endif; ?></li><?php
        endforeach; ?>
        </ul><?php
    }

    private function redirect(string $message): void {
        wp_safe_redirect(add_query_arg(['page' => 'neo-authority-drafts', 'nae_message' => $message], admin_url('admin.php')));
        exit;
    }
}
