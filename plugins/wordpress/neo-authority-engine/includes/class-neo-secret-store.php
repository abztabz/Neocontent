<?php

if (!defined('ABSPATH')) exit;

final class Neo_Secret_Store {
    private const PREFIX = 'v1:';

    private static function key(): string {
        return hash('sha256', wp_salt('auth') . '|neo-authority-site-secret-v1', true);
    }

    public static function encrypt(string $secret): string {
        if (strlen($secret) < 32 || !function_exists('openssl_encrypt')) return '';
        $iv = random_bytes(12);
        $tag = '';
        $ciphertext = openssl_encrypt($secret, 'aes-256-gcm', self::key(), OPENSSL_RAW_DATA, $iv, $tag, 'neo-authority-v1');
        if (!is_string($ciphertext) || strlen($tag) !== 16) return '';
        return self::PREFIX . base64_encode($iv . $tag . $ciphertext);
    }

    private static function decrypt(string $stored): string {
        if (!str_starts_with($stored, self::PREFIX) || !function_exists('openssl_decrypt')) return '';
        $raw = base64_decode(substr($stored, strlen(self::PREFIX)), true);
        if (!is_string($raw) || strlen($raw) < 29) return '';
        $plaintext = openssl_decrypt(
            substr($raw, 28),
            'aes-256-gcm',
            self::key(),
            OPENSSL_RAW_DATA,
            substr($raw, 0, 12),
            substr($raw, 12, 16),
            'neo-authority-v1'
        );
        return is_string($plaintext) ? $plaintext : '';
    }

    public static function get(): string {
        $settings = get_option(NAE_OPTION, []);
        $stored = (string)($settings['site_secret_encrypted'] ?? '');
        if ($stored !== '') return self::decrypt($stored);

        $legacy = (string)($settings['site_secret'] ?? '');
        if ($legacy === '') return '';
        $encrypted = self::encrypt($legacy);
        if ($encrypted === '') return '';
        unset($settings['site_secret']);
        $settings['site_secret_encrypted'] = $encrypted;
        update_option(NAE_OPTION, $settings, false);
        return $legacy;
    }
}
