<?php

if (!defined('ABSPATH')) exit;

final class Neo_Cloud_Client {
    private function settings(): array {
        $settings = wp_parse_args(get_option(NAE_OPTION, []), [
            'cloud_url' => '',
            'site_id' => '',
            'registered' => '0',
        ]);
        $settings['site_secret'] = Neo_Secret_Store::get();
        return $settings;
    }

    private function canonicalize_json_value($value) {
        if (!is_array($value)) return $value;

        $keys = array_keys($value);
        $is_list = $value === [] || $keys === range(0, count($value) - 1);
        if ($is_list) return array_map([$this, 'canonicalize_json_value'], $value);

        ksort($value, SORT_STRING);
        foreach ($value as $key => $item) {
            $value[$key] = $this->canonicalize_json_value($item);
        }
        return $value;
    }

    private function canonical_json(array $payload): string {
        $encoded = wp_json_encode(
            $this->canonicalize_json_value($payload),
            JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE
        );
        return is_string($encoded) ? $encoded : '{}';
    }

    private function headers(string $method, string $path, string $body, string $purpose = 'plugin-to-cloud'): array {
        $settings = $this->settings();
        $timestamp = (string) time();
        $canonical = strtoupper($method) . "\n" . $path . "\n" . $timestamp . "\n" . hash('sha256', $body);
        $labels = [
            'plugin-to-cloud' => 'neo-plugin-to-cloud-v1',
            'registration' => 'neo-registration-v1',
        ];
        if (!isset($labels[$purpose])) return [];
        $signing_key = hash_hmac('sha256', $labels[$purpose], $settings['site_secret'], true);
        return [
            'Content-Type' => 'application/json',
            'X-Neo-Site-ID' => $settings['site_id'],
            'X-Neo-Timestamp' => $timestamp,
            'X-Neo-Signature' => hash_hmac('sha256', $canonical, $signing_key),
        ];
    }

    private function valid_cloud_url(string $value): bool {
        $parts = wp_parse_url($value);
        if (!is_array($parts) || strtolower((string)($parts['scheme'] ?? '')) !== 'https') return false;
        if (!empty($parts['user']) || !empty($parts['pass']) || (!empty($parts['port']) && (int)$parts['port'] !== 443)) return false;
        $allowed = apply_filters('nae_allowed_cloud_hosts', ['living-content-engine.vercel.app']);
        $allowed = is_array($allowed) ? array_map(static fn($host) => strtolower((string)$host), $allowed) : [];
        return in_array(strtolower((string)($parts['host'] ?? '')), $allowed, true);
    }

    public function request(string $method, string $path, array $payload = [], array $extra_headers = [], string $purpose = 'plugin-to-cloud') {
        $settings = $this->settings();
        if (empty($settings['cloud_url'])) return new WP_Error('nae_cloud_missing', 'Neo Authority Cloud URL is not configured.');
        if (!$this->valid_cloud_url((string)$settings['cloud_url'])) return new WP_Error('nae_cloud_invalid', 'Neo Authority Cloud URL is not trusted.');
        if (strlen((string)$settings['site_secret']) < 32) return new WP_Error('nae_secret_invalid', 'Neo Authority site secret is unavailable.');

        $body = $payload ? $this->canonical_json($payload) : '';
        $headers = array_merge($this->headers($method, $path, $body, $purpose), $extra_headers);
        if (!$headers) return new WP_Error('nae_signing_failed', 'Neo Authority request signing failed.');
        $response = wp_remote_request(untrailingslashit($settings['cloud_url']) . $path, [
            'method' => $method,
            'timeout' => 90,
            'headers' => $headers,
            'body' => $body,
        ]);
        if (is_wp_error($response)) return $response;

        $status = wp_remote_retrieve_response_code($response);
        $decoded = json_decode(wp_remote_retrieve_body($response), true);
        if ($status < 200 || $status >= 300) {
            return new WP_Error(
                sanitize_key($decoded['error']['code'] ?? 'nae_cloud_error'),
                sanitize_text_field($decoded['error']['message'] ?? ('Cloud returned HTTP ' . $status))
            );
        }
        return is_array($decoded) ? $decoded : [];
    }

    public function register_site(array $profile) {
        $settings = $this->settings();
        $initial = ($settings['registered'] ?? '0') !== '1';
        $extra_headers = $initial ? ['X-Neo-Connection-Request' => '1'] : [];
        $payload = array_merge([
            'siteId' => $settings['site_id'],
            'siteSecret' => $settings['site_secret'],
            'websiteUrl' => home_url('/'),
            'callbackUrl' => rest_url('neo-authority/v1/publish'),
        ], $profile);
        return $this->request(
            'POST',
            '/api/v1/sites/register',
            $payload,
            $extra_headers,
            $initial ? 'registration' : 'plugin-to-cloud'
        );
    }

    public function sync_knowledge_candidates(array $candidates) {
        $settings = $this->settings();
        return $this->request(
            'POST',
            '/api/v1/sites/' . rawurlencode($settings['site_id']) . '/knowledge-candidates',
            ['candidates' => array_values($candidates)]
        );
    }

    public function decide_knowledge(string $candidate_id, string $decision, ?string $edited_content = null) {
        $settings = $this->settings();
        return $this->request(
            'POST',
            '/api/v1/sites/' . rawurlencode($settings['site_id']) . '/knowledge-candidates/' . rawurlencode($candidate_id) . '/decision',
            ['decision' => $decision, 'editedContent' => $edited_content]
        );
    }

    public function add_source(array $source) {
        $settings = $this->settings();
        return $this->request('POST', '/api/v1/sites/' . rawurlencode($settings['site_id']) . '/sources', $source);
    }

    public function decide_source(string $source_id, string $decision, array $approved_claims = []) {
        $settings = $this->settings();
        return $this->request(
            'POST',
            '/api/v1/sites/' . rawurlencode($settings['site_id']) . '/sources/' . rawurlencode($source_id) . '/decision',
            ['decision' => $decision, 'approvedClaims' => $approved_claims]
        );
    }

    public function run_now() {
        $settings = $this->settings();
        return $this->request(
            'POST',
            '/api/v1/sites/' . rawurlencode($settings['site_id']) . '/runs',
            ['trigger' => 'manual', 'idempotencyKey' => wp_generate_uuid4()]
        );
    }

    public function create_content_job(array $payload) {
        $settings = $this->settings();
        return $this->request(
            'POST',
            '/api/v1/sites/' . rawurlencode($settings['site_id']) . '/content-jobs',
            array_merge(['action' => 'create'], $payload)
        );
    }

    public function list_content_jobs() {
        $settings = $this->settings();
        return $this->request(
            'POST',
            '/api/v1/sites/' . rawurlencode($settings['site_id']) . '/content-jobs',
            ['action' => 'list']
        );
    }

    public function review_content_job(string $job_id, string $decision, string $feedback = '') {
        $settings = $this->settings();
        return $this->request(
            'POST',
            '/api/v1/sites/' . rawurlencode($settings['site_id']) . '/content-jobs',
            ['action' => 'review', 'jobId' => $job_id, 'decision' => $decision, 'feedback' => $feedback]
        );
    }
}
