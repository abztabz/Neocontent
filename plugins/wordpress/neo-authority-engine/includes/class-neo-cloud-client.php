<?php

if (!defined('ABSPATH')) exit;

final class Neo_Cloud_Client {
    private function settings(): array {
        return wp_parse_args(get_option(NAE_OPTION, []), [
            'cloud_url' => '',
            'site_id' => '',
            'site_secret' => '',
        ]);
    }

    private function headers(string $method, string $path, string $body): array {
        $settings = $this->settings();
        $timestamp = (string) time();
        $canonical = strtoupper($method) . "\n" . $path . "\n" . $timestamp . "\n" . hash('sha256', $body);
        return [
            'Content-Type' => 'application/json',
            'X-Neo-Site-ID' => $settings['site_id'],
            'X-Neo-Timestamp' => $timestamp,
            'X-Neo-Signature' => hash_hmac('sha256', $canonical, $settings['site_secret']),
        ];
    }

    public function request(string $method, string $path, array $payload = []) {
        $settings = $this->settings();
        if (empty($settings['cloud_url'])) return new WP_Error('nae_cloud_missing', 'Neo Authority Cloud URL is not configured.');

        $body = $payload ? wp_json_encode($payload) : '';
        $response = wp_remote_request(untrailingslashit($settings['cloud_url']) . $path, [
            'method' => $method,
            'timeout' => 90,
            'headers' => $this->headers($method, $path, $body),
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
        return $this->request('POST', '/api/v1/sites/register', [
            'siteId' => $settings['site_id'],
            'siteSecret' => $settings['site_secret'],
            'websiteUrl' => home_url('/'),
            'callbackUrl' => rest_url('neo-authority/v1/publish'),
            ...$profile,
        ]);
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
}
