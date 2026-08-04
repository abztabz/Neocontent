<?php

if (!defined('ABSPATH')) exit;

final class Neo_Operator_Sync {
    public function __construct(private readonly Neo_Cloud_Client $client) {
        add_action('nae_operator_sync', [$this, 'run']);
    }

    public function run(): void {
        $settings = get_option(NAE_OPTION, []);
        if (($settings['registered'] ?? '0') !== '1') return;
        if (!$this->is_due((string)($settings['cadence'] ?? 'weekly'))) return;

        $existing = $this->client->list_content_jobs();
        if (is_wp_error($existing)) return;
        foreach (($existing['jobs'] ?? []) as $job) {
            if (in_array((string)($job['status'] ?? ''), ['researching', 'brief_ready', 'draft_ready', 'changes_requested'], true)) return;
        }

        $brief = $this->brief($settings);
        if (!$brief['approvedKnowledge']) return;
        $topic = $this->topic($settings);
        $result = $this->client->create_content_job([
            'idempotencyKey' => wp_generate_uuid4(),
            'topic' => $topic,
            'customerSummary' => 'Researching an evidence-backed article selected for your audience and services.',
            'brief' => $brief,
        ]);
        if (!is_wp_error($result)) update_option('nae_last_operator_sync', time(), false);
    }

    private function is_due(string $cadence): bool {
        $intervals = ['daily' => DAY_IN_SECONDS, 'weekly' => WEEK_IN_SECONDS, 'biweekly' => 2 * WEEK_IN_SECONDS, 'monthly' => 30 * DAY_IN_SECONDS];
        $last = absint(get_option('nae_last_operator_sync', 0));
        return !$last || time() - $last >= ($intervals[$cadence] ?? WEEK_IN_SECONDS);
    }

    private function topic(array $settings): string {
        $service = trim((string)explode(',', (string)($settings['services'] ?? ''))[0]);
        $location = trim((string)explode(',', (string)($settings['locations'] ?? ''))[0]);
        if ($service !== '' && $location !== '') return sprintf('A practical guide to %s in %s', $service, $location);
        if ($service !== '') return sprintf('A practical guide to %s', $service);
        $industry = trim((string)($settings['industry'] ?? ''));
        return $industry !== '' ? sprintf('An authoritative guide for %s customers', $industry) : 'A useful guide for your customers';
    }

    private function brief(array $settings): array {
        $posts = get_posts([
            'post_type' => ['page', 'post'],
            'post_status' => 'publish',
            'numberposts' => 100,
            'orderby' => 'modified',
            'order' => 'DESC',
        ]);
        $knowledge = [];
        $remaining = 120000;
        foreach ($posts as $post) {
            if ($remaining < 1) break;
            $content = wp_trim_words(trim(wp_strip_all_tags(strip_shortcodes($post->post_content))), 250, '…');
            if ($content === '') continue;
            $content = substr($content, 0, min(5000, $remaining));
            if ($this->contains_injection($content)) continue;
            $knowledge[] = [
                'title' => sanitize_text_field(get_the_title($post)),
                'content' => sanitize_textarea_field($content),
                'sourceUrl' => esc_url_raw(get_permalink($post), ['https']),
                'sourceType' => $post->post_type === 'page' ? 'website_page' : 'existing_blog',
            ];
            $remaining -= strlen($content);
        }

        return [
            'schemaVersion' => 'neo-content-briefing-v2',
            'website' => [
                'url' => esc_url_raw(home_url('/'), ['https']),
                'name' => sanitize_text_field((string)($settings['business_name'] ?? get_bloginfo('name'))),
                'description' => sanitize_textarea_field((string)($settings['business_description'] ?? get_bloginfo('description'))),
                'industry' => sanitize_text_field((string)($settings['industry'] ?? '')),
                'audience' => sanitize_textarea_field((string)($settings['target_audience'] ?? '')),
                'tone' => sanitize_text_field((string)($settings['tone'] ?? '')),
                'services' => array_slice(array_values(array_filter(array_map('trim', explode(',', (string)($settings['services'] ?? ''))))), 0, 50),
                'locations' => array_slice(array_values(array_filter(array_map('trim', explode(',', (string)($settings['locations'] ?? ''))))), 0, 50),
                'contentMode' => sanitize_key((string)($settings['content_mode'] ?? 'balanced')),
            ],
            'approvedKnowledge' => $knowledge,
            'existingArticleTitles' => array_values(array_filter(array_map(static fn($post) => sanitize_text_field(get_the_title($post)), array_filter($posts, static fn($post) => $post->post_type === 'post')))),
        ];
    }

    private function contains_injection(string $text): bool {
        return (bool)preg_match('/ignore (all|any|the) previous instructions|system prompt|developer message|reveal (your|the) (prompt|instructions|secret)|execute (this|the following) command|you are chatgpt/i', $text);
    }
}
