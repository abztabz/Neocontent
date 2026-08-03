<?php

if (!defined('ABSPATH')) exit;

final class Neo_Source_Manager {
    public function __construct(private readonly Neo_Cloud_Client $client) {}

    public function add(array $input) {
        $url = esc_url_raw(trim((string)($input['url'] ?? '')));
        if (!$url || !wp_http_validate_url($url)) {
            return new WP_Error('nae_invalid_source_url', 'Enter a valid public URL.');
        }

        $purpose = sanitize_key($input['purpose'] ?? 'industry_research');
        $allowed = ['business_knowledge', 'industry_research', 'preferred_research', 'topic_discovery_only'];
        if (!in_array($purpose, $allowed, true)) {
            return new WP_Error('nae_invalid_source_purpose', 'Invalid source purpose.');
        }

        $result = $this->client->add_source([
            'url' => $url,
            'label' => sanitize_text_field($input['label'] ?? ''),
            'purpose' => $purpose,
        ]);
        if (is_wp_error($result)) return $result;

        $sources = get_option(NAE_SOURCES, []);
        $sources[] = [
            'id' => sanitize_text_field($result['id'] ?? wp_generate_uuid4()),
            'url' => $url,
            'label' => sanitize_text_field($input['label'] ?? ''),
            'purpose' => $purpose,
            'status' => sanitize_key($result['status'] ?? 'pending_review'),
            'publisher' => sanitize_text_field($result['publisher'] ?? ''),
            'published_at' => sanitize_text_field($result['publishedAt'] ?? ''),
            'trust_score' => absint($result['trustScore'] ?? 0),
            'freshness' => sanitize_key($result['freshness'] ?? 'unknown'),
            'created_at' => current_time('c'),
        ];
        update_option(NAE_SOURCES, $sources, false);
        return end($sources);
    }

    public function decide(string $id, string $decision) {
        $decision = $decision === 'approve' ? 'approve' : 'reject';
        $result = $this->client->decide_source($id, $decision);
        if (is_wp_error($result)) return $result;

        $sources = get_option(NAE_SOURCES, []);
        foreach ($sources as &$source) {
            if (($source['id'] ?? '') !== $id) continue;
            $source['status'] = $decision === 'approve' ? 'approved' : 'rejected';
            $source['reviewed_at'] = current_time('c');
            break;
        }
        unset($source);
        update_option(NAE_SOURCES, $sources, false);
        return true;
    }
}
