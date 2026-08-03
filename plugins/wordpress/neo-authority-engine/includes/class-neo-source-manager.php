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

        $suggestions = array_values(array_filter(array_map('sanitize_textarea_field', $result['suggested_claims'] ?? [])));
        $sources = get_option(NAE_SOURCES, []);
        $sources[] = [
            'id' => sanitize_text_field($result['id'] ?? wp_generate_uuid4()),
            'url' => esc_url_raw($result['url'] ?? $url),
            'label' => sanitize_text_field($input['label'] ?? ''),
            'purpose' => $purpose,
            'status' => sanitize_key($result['status'] ?? 'pending_review'),
            'publisher' => sanitize_text_field($result['publisher'] ?? ''),
            'published_at' => sanitize_text_field($result['published_at'] ?? ''),
            'trust_score' => absint($result['trust_score'] ?? 0),
            'freshness' => sanitize_key($result['freshness_status'] ?? 'unknown'),
            'suggested_claims' => $suggestions,
            'created_at' => current_time('c'),
        ];
        update_option(NAE_SOURCES, $sources, false);
        return end($sources);
    }

    public function decide(string $id, string $decision, array $approved_claims = []) {
        $decision = $decision === 'approve' ? 'approve' : 'reject';
        $approved_claims = array_values(array_filter(array_map('sanitize_textarea_field', $approved_claims)));
        if ($decision === 'approve' && !$approved_claims) {
            return new WP_Error('nae_source_claims_required', 'Select at least one evidence statement before approving this source.');
        }

        $result = $this->client->decide_source($id, $decision, $approved_claims);
        if (is_wp_error($result)) return $result;

        $sources = get_option(NAE_SOURCES, []);
        foreach ($sources as &$source) {
            if (($source['id'] ?? '') !== $id) continue;
            $source['status'] = $decision === 'approve' ? 'approved' : 'rejected';
            $source['approved_claims'] = $decision === 'approve' ? $approved_claims : [];
            $source['reviewed_at'] = current_time('c');
            break;
        }
        unset($source);
        update_option(NAE_SOURCES, $sources, false);
        return true;
    }
}
