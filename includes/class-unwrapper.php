<?php
/**
 * Unwraps tracking / redirect wrapper URLs into the destination URL.
 *
 * @package CleanTrackedLinks
 */

declare(strict_types=1);

namespace CleanTrackedLinks;

if (! defined('ABSPATH')) {
    exit;
}

final class Unwrapper
{
    private const TARGET_PARAMS = [
        'to',
        'url',
        'target',
        'u',
        'dest',
        'destination',
        'redirect',
        'redirect_url',
        'link',
    ];

    private const TRACKING_PARAMS = [
        'yclid',
        'ysclid',
        'gclid',
        'fbclid',
        '_openstat',
        'from',
        'eref',
        'ref',
        'ref_src',
    ];

    private const WRAPPER_SEGMENTS = [
        'go',
        'goto',
        'out',
        'redirect',
        'redir',
        'away',
        'leave',
        'click',
        'ext',
        'outbound',
        'exit',
        'offsite',
        'track',
        'tracking',
        'jump',
        'bridge',
        'external',
        'leave-site',
    ];

    private const SHORTENER_HOSTS = [
        'bit.ly',
        't.co',
        'tinyurl.com',
        'ow.ly',
        'is.gd',
        'buff.ly',
        'clck.ru',
        'vk.cc',
        'goo.gl',
        'rebrand.ly',
        'cutt.ly',
        'shorturl.at',
        'lnkd.in',
        'rb.gy',
        'j.mp',
        'trib.al',
    ];

    private const MAX_UNWRAP_DEPTH = 3;
    private const MAX_REDIRECTS    = 3;
    private const TIMEOUT          = 5;
    private const USER_AGENT       = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36';

    /**
     * @return array{ok: bool, original?: string, changed?: bool, error?: string}
     */
    public function unwrap(string $url): array
    {
        $url = trim($url);

        if ($url === '') {
            return $this->fail('empty');
        }

        if (! $this->is_allowed_url($url)) {
            return $this->fail('invalid_url');
        }

        $current = $url;
        $changed = false;

        for ($i = 0; $i < self::MAX_UNWRAP_DEPTH; $i++) {
            $extracted = $this->extract_target_param($current);
            if ($extracted === null || $extracted === $current) {
                break;
            }
            if (! $this->is_allowed_url($extracted)) {
                if (! $changed) {
                    return $this->fail('invalid_url');
                }
                break;
            }
            $current = $extracted;
            $changed = true;
        }

        $stripped = $this->strip_tracking($current);
        if ($stripped !== $current) {
            $current = $stripped;
            $changed = true;
        }

        if (! $changed && $this->looks_like_redirect_wrapper($current)) {
            $resolved = $this->follow_redirects($current);
            if (is_string($resolved) && $resolved !== '' && $this->is_allowed_url($resolved)) {
                $resolved = $this->strip_tracking($resolved);
                if ($this->normalize_for_compare($resolved) !== $this->normalize_for_compare($current)) {
                    $current = $resolved;
                    $changed = true;
                }
            } elseif (! $changed) {
                return $this->fail('not_found');
            }
        }

        $final = $this->sanitize_result($current);
        if ($final === null) {
            return $this->fail('invalid_url');
        }

        $really_changed = $this->normalize_for_compare($final) !== $this->normalize_for_compare($url);

        return [
            'ok'       => true,
            'original' => $final,
            'changed'  => $really_changed,
        ];
    }

    /**
     * @return array{ok: false, error: string}
     */
    private function fail(string $code): array
    {
        return [
            'ok'    => false,
            'error' => $code,
        ];
    }

    public function is_allowed_url(string $url): bool
    {
        $url = trim($url);
        if ($url === '' || strlen($url) > 2048) {
            return false;
        }

        if (preg_match('#^\s*(javascript|data|file|ftp|about|blob|vbscript):#i', $url)) {
            return false;
        }

        $parts = $this->parse_url($url);
        if (! is_array($parts) || empty($parts['scheme']) || empty($parts['host'])) {
            return false;
        }

        $scheme = strtolower((string) $parts['scheme']);
        if ($scheme !== 'http' && $scheme !== 'https') {
            return false;
        }

        if (! empty($parts['user']) || ! empty($parts['pass'])) {
            return false;
        }

        $host = strtolower((string) $parts['host']);
        $host = trim($host, '[]');

        if ($this->is_blocked_host($host)) {
            return false;
        }

        if (function_exists('wp_http_validate_url') && ! wp_http_validate_url($url)) {
            return false;
        }

        return true;
    }

    private function is_blocked_host(string $host): bool
    {
        if ($host === '' || $host === 'localhost' || $host === '0.0.0.0' || $host === '::' || $host === '::1') {
            return true;
        }

        if (str_ends_with($host, '.localhost') || str_ends_with($host, '.localdomain')) {
            return true;
        }

        if (filter_var($host, FILTER_VALIDATE_IP)) {
            return $this->is_blocked_ip($host);
        }

        return false;
    }

    private function is_blocked_ip(string $ip): bool
    {
        $ip = strtolower(trim($ip, '[]'));

        if (str_starts_with($ip, '::ffff:')) {
            $mapped = substr($ip, 7);
            if (filter_var($mapped, FILTER_VALIDATE_IP, FILTER_FLAG_IPV4)) {
                $ip = $mapped;
            }
        }

        $flags = FILTER_FLAG_NO_PRIV_RANGE | FILTER_FLAG_NO_RES_RANGE;
        if (filter_var($ip, FILTER_VALIDATE_IP, $flags) === false) {
            return true;
        }

        if (filter_var($ip, FILTER_VALIDATE_IP, FILTER_FLAG_IPV6)) {
            if (preg_match('/^(::1|fe80:|fc|fd|ff)/i', $ip)) {
                return true;
            }
        }

        return false;
    }

    private function extract_target_param(string $url): ?string
    {
        $parts = $this->parse_url($url);
        if (! is_array($parts) || empty($parts['query'])) {
            return null;
        }

        $query = [];
        parse_str((string) $parts['query'], $query);

        foreach (self::TARGET_PARAMS as $param) {
            if (! isset($query[ $param ]) || ! is_string($query[ $param ]) || $query[ $param ] === '') {
                continue;
            }

            $candidate = $this->decode_url_value($query[ $param ]);
            if ($this->looks_like_http_url($candidate) && $this->is_allowed_url($candidate)) {
                return $candidate;
            }
        }

        return null;
    }

    private function decode_url_value(string $value): string
    {
        $current = html_entity_decode($value, ENT_QUOTES | ENT_HTML5, 'UTF-8');

        for ($i = 0; $i < 3; $i++) {
            $decoded = rawurldecode($current);
            if ($decoded === $current) {
                break;
            }
            $current = $decoded;
        }

        return trim($current);
    }

    private function looks_like_http_url(string $value): bool
    {
        return (bool) preg_match('#^https?://[^\s]+#i', $value);
    }

    private function strip_tracking(string $url): string
    {
        $parts = $this->parse_url($url);
        if (! is_array($parts) || empty($parts['query'])) {
            return $url;
        }

        $query = [];
        parse_str((string) $parts['query'], $query);
        if ($query === []) {
            return $url;
        }

        $changed = false;
        foreach (array_keys($query) as $key) {
            $name = strtolower((string) $key);
            if (str_starts_with($name, 'utm_') || in_array($name, self::TRACKING_PARAMS, true)) {
                unset($query[ $key ]);
                $changed = true;
            }
        }

        if (! $changed) {
            return $url;
        }

        return $this->rebuild_url($parts, $query);
    }

    /**
     * @param array<string, mixed> $parts
     * @param array<string, mixed> $query
     */
    private function rebuild_url(array $parts, array $query): string
    {
        $scheme   = (string) ($parts['scheme'] ?? 'https');
        $host     = (string) ($parts['host'] ?? '');
        $port     = isset($parts['port']) ? ':' . $parts['port'] : '';
        $path     = (string) ($parts['path'] ?? '');
        $fragment = isset($parts['fragment']) ? '#' . $parts['fragment'] : '';
        $qs       = $query === [] ? '' : http_build_query($query, '', '&', PHP_QUERY_RFC3986);

        return $scheme . '://' . $host . $port . $path . ($qs !== '' ? '?' . $qs : '') . $fragment;
    }

    private function looks_like_redirect_wrapper(string $url): bool
    {
        $parts = $this->parse_url($url);
        if (! is_array($parts)) {
            return false;
        }

        $host = strtolower((string) ($parts['host'] ?? ''));
        $host = preg_replace('/^www\./', '', $host) ?? $host;
        if (in_array($host, self::SHORTENER_HOSTS, true)) {
            return true;
        }

        $path     = strtolower((string) ($parts['path'] ?? ''));
        $segments = array_values(array_filter(explode('/', $path), static fn ($s) => $s !== ''));

        foreach ($segments as $segment) {
            if (in_array($segment, self::WRAPPER_SEGMENTS, true)) {
                return true;
            }
        }

        return false;
    }

    private function follow_redirects(string $url): ?string
    {
        if (! function_exists('wp_remote_request')) {
            return null;
        }

        $current = $url;
        $final   = null;
        $seen    = [];

        for ($i = 0; $i < self::MAX_REDIRECTS; $i++) {
            if (! $this->is_allowed_url($current)) {
                return null;
            }

            $key = $this->normalize_for_compare($current);
            if (isset($seen[ $key ])) {
                break;
            }
            $seen[ $key ] = true;

            $response = $this->request_headers($current);
            if (is_wp_error($response)) {
                return $final;
            }

            $code     = (int) wp_remote_retrieve_response_code($response);
            $location = wp_remote_retrieve_header($response, 'location');
            if (is_array($location)) {
                $location = (string) reset($location);
            }
            $location = is_string($location) ? trim($location) : '';

            if ($location !== '' && $code >= 300 && $code < 400) {
                $next = $this->absolutize($current, $location);
                if (! $this->is_allowed_url($next)) {
                    return null;
                }
                $current = $next;
                $final   = $next;
                continue;
            }

            break;
        }

        return $final;
    }

    /**
     * @return array<string, mixed>|\WP_Error
     */
    private function request_headers(string $url)
    {
        $args = [
            'timeout'             => self::TIMEOUT,
            'redirection'         => 0,
            'sslverify'           => true,
            'reject_unsafe_urls'  => true,
            'limit_response_size' => 2048,
            'decompress'          => false,
            'user-agent'          => self::USER_AGENT,
            'cookies'             => [],
            'headers'             => [
                'Accept' => 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.8',
            ],
        ];

        $head = wp_remote_request($url, array_merge($args, [ 'method' => 'HEAD' ]));
        if (is_wp_error($head)) {
            $message = $head->get_error_message();
            if (stripos($message, 'timed out') !== false || stripos($message, 'timeout') !== false) {
                return $head;
            }
        } else {
            $code     = (int) wp_remote_retrieve_response_code($head);
            $location = wp_remote_retrieve_header($head, 'location');
            if ($location || ($code !== 0 && $code !== 405 && $code !== 501)) {
                return $head;
            }
        }

        return wp_remote_request($url, array_merge($args, [ 'method' => 'GET' ]));
    }

    private function absolutize(string $base, string $location): string
    {
        $location = trim($location);
        if ($location === '') {
            return $base;
        }

        if (preg_match('#^https?://#i', $location)) {
            return $location;
        }

        $base_parts = $this->parse_url($base);
        if (! is_array($base_parts) || empty($base_parts['host'])) {
            return $location;
        }

        $scheme = (string) ($base_parts['scheme'] ?? 'https');
        $host   = (string) $base_parts['host'];
        $port   = isset($base_parts['port']) ? ':' . $base_parts['port'] : '';
        $origin = $scheme . '://' . $host . $port;

        if (str_starts_with($location, '//')) {
            return $scheme . ':' . $location;
        }

        if (str_starts_with($location, '/')) {
            return $origin . $location;
        }

        $path = (string) ($base_parts['path'] ?? '/');
        $dir  = preg_replace('#/[^/]*$#', '/', $path) ?? '/';

        return $origin . $dir . $location;
    }

    private function sanitize_result(string $url): ?string
    {
        $clean = function_exists('esc_url_raw') ? esc_url_raw($url) : $url;
        if (! is_string($clean) || $clean === '' || ! $this->is_allowed_url($clean)) {
            return null;
        }

        return $clean;
    }

    private function normalize_for_compare(string $url): string
    {
        $parts = $this->parse_url($url);
        if (! is_array($parts) || empty($parts['host'])) {
            return $url;
        }

        $scheme = strtolower((string) ($parts['scheme'] ?? 'https'));
        $host   = strtolower((string) $parts['host']);
        $port   = isset($parts['port']) ? ':' . $parts['port'] : '';
        $path   = (string) ($parts['path'] ?? '');
        $query  = (string) ($parts['query'] ?? '');

        return $scheme . '://' . $host . $port . $path . ($query !== '' ? '?' . $query : '');
    }

    /**
     * @return array<string, mixed>|false
     */
    private function parse_url(string $url): array|false
    {
        if (function_exists('wp_parse_url')) {
            $parts = wp_parse_url($url);
            return is_array($parts) ? $parts : false;
        }

        $parts = parse_url($url);
        return is_array($parts) ? $parts : false;
    }
}
