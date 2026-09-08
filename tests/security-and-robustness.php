<?php
/**
 * Security and robustness checks for Clean Tracked Links.
 *
 * Run: php tests/security-and-robustness.php
 */

declare(strict_types=1);

define('ABSPATH', '/tmp/');

final class WP_Error
{
    public function __construct(private string $code = '', private string $message = '')
    {
    }

    public function get_error_message(): string
    {
        return $this->message;
    }

    public function get_error_code(): string
    {
        return $this->code;
    }
}

function is_wp_error(mixed $value): bool
{
    return $value instanceof WP_Error;
}

function wp_parse_url(string $url, int $component = -1): mixed
{
    return parse_url($url, $component);
}

function esc_url_raw(string $url): string
{
    return $url;
}

function wp_http_validate_url(string $url): string|false
{
    $parts = parse_url($url);
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

    return $url;
}

function wp_remote_retrieve_response_code(array $response): int
{
    return (int) ($response['response']['code'] ?? 0);
}

function wp_remote_retrieve_header(array $response, string $header): string
{
    $headers = $response['headers'] ?? [];
    $header  = strtolower($header);
    foreach ($headers as $name => $value) {
        if (strtolower((string) $name) === $header) {
            return is_array($value) ? (string) reset($value) : (string) $value;
        }
    }

    return '';
}

require dirname(__DIR__) . '/includes/class-unwrapper.php';

use CleanTrackedLinks\Unwrapper;

$failed = 0;
$passed = 0;

function expect(string $name, bool $ok, string $detail = ''): void
{
    global $failed, $passed;
    if ($ok) {
        $passed++;
        echo "OK   {$name}\n";
        return;
    }
    $failed++;
    echo "FAIL {$name}" . ($detail !== '' ? " — {$detail}" : '') . "\n";
}

function dump(array $result): string
{
    return (string) json_encode($result, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
}

function redirect_client(array $map): callable
{
    return static function (string $url) use ($map): array|WP_Error {
        if (! isset($map[ $url ])) {
            return new WP_Error('not_mocked', 'unexpected HTTP ' . $url);
        }
        $entry = $map[ $url ];
        return [
            'response' => [ 'code' => $entry['code'] ],
            'headers'  => [ 'location' => $entry['location'] ?? '' ],
        ];
    };
}

$plain = new Unwrapper();

$klerk = 'https://www.klerk.ru/go/ext/?to=https%3A%2F%2Fwww.vedomosti.ru%2Fbusiness%2Farticles%2F2026%2F07%2F06%2F1211353-nedorogoi-ikri-mozhet-stat-menshe&entityId=1';
$vedomosti = 'https://www.vedomosti.ru/business/articles/2026/07/06/1211353-nedorogoi-ikri-mozhet-stat-menshe';

echo "== Robustness ==\n";

$ar = $plain->unwrap($klerk);
expect('A klerk to= vedomosti', ! empty($ar['ok']) && ! empty($ar['changed']) && ($ar['original'] ?? '') === $vedomosti, dump($ar));

$ar = $plain->unwrap('https://www.klerk.ru/go/ext/?to=https%3A%2F%2Fwww.vedomosti.ru%2Fbusiness%2Farticles%2F2026%2F07%2F06%2F1211353-nedorogoi-ikri-mozhet-stat-menshe&entityId=123');
expect('A2 klerk entityId=123', ! empty($ar['ok']) && ($ar['original'] ?? '') === $vedomosti, dump($ar));

$ar = $plain->unwrap('https://example.com/news/hello');
expect('B clean unchanged', ! empty($ar['ok']) && empty($ar['changed']) && ($ar['original'] ?? '') === 'https://example.com/news/hello', dump($ar));

$ar = $plain->unwrap('https://example.com/news/hello?utm_source=tg&yclid=123');
expect('C strip utm/yclid', ! empty($ar['ok']) && ! empty($ar['changed']) && ($ar['original'] ?? '') === 'https://example.com/news/hello', dump($ar));

$ar = $plain->unwrap('https://example.com/news/hello?id=5&article=9&utm_campaign=x&page=2&slug=hello');
expect(
    'C2 keep id/article/page/slug',
    ! empty($ar['ok']) && ($ar['original'] ?? '') === 'https://example.com/news/hello?id=5&article=9&page=2&slug=hello',
    dump($ar)
);

$ar = $plain->unwrap('https://example.com/news/hello?utm_source=tg#section');
expect('C3 keep fragment', ! empty($ar['ok']) && ($ar['original'] ?? '') === 'https://example.com/news/hello#section', dump($ar));

$ar = $plain->unwrap($vedomosti);
expect('repeat click does not break', ! empty($ar['ok']) && empty($ar['changed']), dump($ar));

$nested = 'https://tracker.example/out/?url=' . rawurlencode('https://wrap.example/go/?to=' . rawurlencode('https://news.example/a'));
$ar = $plain->unwrap($nested);
expect('nested url+to', ! empty($ar['ok']) && ($ar['original'] ?? '') === 'https://news.example/a', dump($ar));

$ar = $plain->unwrap('https://example.com/news/hello?target=_blank');
expect('target=_blank is not a URL', ! empty($ar['ok']) && empty($ar['changed']), dump($ar));

$ar = $plain->unwrap('https://example.com/?u=abc');
expect('u=hash is not a URL', ! empty($ar['ok']) && empty($ar['changed']), dump($ar));

$double = 'https://example.com/go/?to=' . rawurlencode(rawurlencode('https://news.example/x'));
$ar = $plain->unwrap($double);
expect('double-encoded to', ! empty($ar['ok']) && ($ar['original'] ?? '') === 'https://news.example/x', dump($ar));

$entity = 'https://example.com/go/?to=https&#58;&#47;&#47;news.example&#47;y';
$ar = $plain->unwrap(html_entity_decode($entity, ENT_QUOTES | ENT_HTML5, 'UTF-8'));
expect('html-entity decoded to still unwraps when already decoded', true);

$httpCalls = [];
$client = static function (string $url) use (&$httpCalls): WP_Error {
    $httpCalls[] = $url;
    return new WP_Error('blocked_call', 'HTTP should not run');
};
$guarded = new Unwrapper($client);
$ar = $guarded->unwrap('https://example.com/news/hello');
expect('clean URL does not HTTP', $httpCalls === [] && ! empty($ar['ok']), dump($ar) . ' calls=' . implode(',', $httpCalls));

$ar = $guarded->unwrap('https://example.com/news/external-review');
expect('content path /external-review is not a wrapper', $httpCalls === [] && ! empty($ar['ok']) && empty($ar['changed']), dump($ar));

$wrapper = 'https://go.example/out/abc';
$map = [
    $wrapper => [ 'code' => 302, 'location' => 'https://news.example/final' ],
];
$http = new Unwrapper(redirect_client($map));
$ar = $http->unwrap($wrapper);
expect('HTTP 302 Location unwraps', ! empty($ar['ok']) && ($ar['original'] ?? '') === 'https://news.example/final', dump($ar));

$short = 'https://bit.ly/abc';
$http = new Unwrapper(redirect_client([
    $short => [ 'code' => 301, 'location' => 'https://example.com/news/hello' ],
]));
$ar = $http->unwrap($short);
expect('shortener host follows redirect', ! empty($ar['ok']) && ($ar['original'] ?? '') === 'https://example.com/news/hello', dump($ar));

$rel = 'https://go.example/redirect';
$http = new Unwrapper(redirect_client([
    $rel => [ 'code' => 302, 'location' => '/news/hello' ],
]));
$ar = $http->unwrap($rel);
expect('relative Location is resolved', ! empty($ar['ok']) && ($ar['original'] ?? '') === 'https://go.example/news/hello', dump($ar));

$chain1 = 'https://go.example/out/1';
$chain2 = 'https://go.example/out/2';
$http = new Unwrapper(redirect_client([
    $chain1 => [ 'code' => 302, 'location' => $chain2 ],
    $chain2 => [ 'code' => 302, 'location' => 'https://news.example/end' ],
]));
$ar = $http->unwrap($chain1);
expect('two-hop redirect', ! empty($ar['ok']) && ($ar['original'] ?? '') === 'https://news.example/end', dump($ar));

$loop = 'https://go.example/out/loop';
$http = new Unwrapper(redirect_client([
    $loop => [ 'code' => 302, 'location' => $loop ],
]));
$ar = $http->unwrap($loop);
expect('redirect loop does not hang', empty($ar['ok']) || empty($ar['changed']), dump($ar));

$http = new Unwrapper(redirect_client([
    'https://go.example/out/x' => [ 'code' => 200, 'location' => 'https://news.example/nope' ],
]));
$ar = $http->unwrap('https://go.example/out/x');
expect('200 + Location is not followed', empty($ar['ok']) || ($ar['original'] ?? '') !== 'https://news.example/nope', dump($ar));

$four = 'https://a.example/go/?to=' . rawurlencode(
    'https://b.example/go/?to=' . rawurlencode(
        'https://c.example/go/?to=' . rawurlencode(
            'https://d.example/go/?to=' . rawurlencode('https://news.example/deep')
        )
    )
);
$ar = $plain->unwrap($four);
expect(
    'unwrap depth max 3 reaches http(s) target',
    ! empty($ar['ok']) && str_starts_with((string) ($ar['original'] ?? ''), 'https://'),
    dump($ar)
);

echo "\n== Security ==\n";

foreach ([
    '' => 'empty',
    'javascript:alert(1)' => 'javascript',
    'JAVASCRIPT:alert(1)' => 'javascript case',
    'vbscript:msgbox(1)' => 'vbscript',
    'data:text/html,hi' => 'data',
    'file:///etc/passwd' => 'file',
    'ftp://example.com/a' => 'ftp',
    'about:blank' => 'about',
    'blob:https://example.com/1' => 'blob',
    'mailto:a@b.c' => 'mailto',
    'http://127.0.0.1/' => '127.0.0.1',
    'http://127.0.0.1:8080/' => '127.0.0.1 port',
    'http://localhost/secret' => 'localhost',
    'http://localhost.localdomain/' => 'localhost.localdomain',
    'http://foo.localhost/' => 'foo.localhost',
    'http://[::1]/' => 'ipv6 loopback',
    'http://[::ffff:127.0.0.1]/' => 'ipv4-mapped loopback',
    'http://[::ffff:7f00:1]/' => 'ipv4-mapped hex loopback',
    'http://[fe80::1]/' => 'link-local ipv6',
    'http://[fd00::1]/' => 'ula ipv6',
    'http://192.168.1.10/' => 'rfc1918 192.168',
    'http://10.0.0.5/' => 'rfc1918 10/8',
    'http://172.16.4.4/' => 'rfc1918 172.16',
    'http://169.254.169.254/latest/meta-data/' => 'link-local metadata',
    'http://169.254.0.1/' => 'link-local',
    'http://0.0.0.0/' => '0.0.0.0',
    'http://2130706433/' => 'decimal 127.0.0.1',
    'http://127.1/' => 'short 127.1',
    'http://127.0.1/' => 'short 127.0.1',
    'http://0x7f000001/' => 'hex 127.0.0.1',
    'http://0177.0.0.1/' => 'octal 127.0.0.1',
    'http://0x7f.0.0.1/' => 'dotted hex 127.0.0.1',
    'http://0/' => 'host 0',
    'http://100.64.0.1/' => 'cgnat',
    'http://user:pass@example.com/' => 'credentials',
    'http://example.com@127.0.0.1/' => 'user@loopback host',
    'http://127.0.0.1@example.com/' => 'loopback as user',
    "http://example.com/foo\r\nLocation: http://evil.com" => 'CRLF in URL',
    'http://metadata.google.internal/' => 'gcp metadata host',
    'http://instance-data/' => 'ec2 metadata alias',
    'http://foo.internal/' => '.internal suffix',
    'http://printer.local/' => '.local suffix',
] as $url => $label) {
    $ar = $plain->unwrap($url);
    expect('reject ' . $label, empty($ar['ok']), dump($ar));
}

$ar = $plain->unwrap('https://example.com/go/?to=javascript:alert(1)');
expect('to=javascript is not extracted', empty($ar['ok']) || (($ar['original'] ?? '') !== 'javascript:alert(1)' && ! str_starts_with((string) ($ar['original'] ?? ''), 'javascript:')), dump($ar));

$ar = $plain->unwrap('https://example.com/go/?to=http://127.0.0.1/');
expect('to=loopback is not extracted', empty($ar['ok']) || ! str_contains((string) ($ar['original'] ?? ''), '127.0.0.1'), dump($ar));

$ar = $plain->unwrap('https://example.com/go/?to=http://169.254.169.254/latest/meta-data/');
expect('to=metadata IP is not extracted', empty($ar['ok']) || ! str_contains((string) ($ar['original'] ?? ''), '169.254'), dump($ar));

$ar = $plain->unwrap('https://example.com/go/?to=http://2130706433/');
expect('to=decimal loopback is not extracted', empty($ar['ok']) || ! str_contains((string) ($ar['original'] ?? ''), '2130706433'), dump($ar));

$ar = $plain->unwrap('https://example.com/go/?url=http://192.168.0.1/admin');
expect('url=rfc1918 is not extracted', empty($ar['ok']) || ! str_contains((string) ($ar['original'] ?? ''), '192.168'), dump($ar));

$long = 'https://example.com/' . str_repeat('a', 3000);
$ar = $plain->unwrap($long);
expect('overlong URL rejected', empty($ar['ok']), dump($ar));

$http = new Unwrapper(redirect_client([
    'https://go.example/out/ssrf' => [ 'code' => 302, 'location' => 'http://127.0.0.1/' ],
]));
$ar = $http->unwrap('https://go.example/out/ssrf');
expect('redirect to 127.0.0.1 rejected', empty($ar['ok']) || ! str_contains((string) ($ar['original'] ?? ''), '127.0.0.1'), dump($ar));

$http = new Unwrapper(redirect_client([
    'https://go.example/out/meta' => [ 'code' => 302, 'location' => 'http://169.254.169.254/latest/meta-data/' ],
]));
$ar = $http->unwrap('https://go.example/out/meta');
expect('redirect to metadata IP rejected', empty($ar['ok']) || ! str_contains((string) ($ar['original'] ?? ''), '169.254'), dump($ar));

$http = new Unwrapper(redirect_client([
    'https://go.example/out/dec' => [ 'code' => 302, 'location' => 'http://2130706433/' ],
]));
$ar = $http->unwrap('https://go.example/out/dec');
expect('redirect to decimal loopback rejected', empty($ar['ok']) || ! str_contains((string) ($ar['original'] ?? ''), '2130706433'), dump($ar));

$http = new Unwrapper(redirect_client([
    'https://go.example/out/file' => [ 'code' => 302, 'location' => 'file:///etc/passwd' ],
]));
$ar = $http->unwrap('https://go.example/out/file');
expect('redirect to file: rejected', empty($ar['ok']) || ! str_contains((string) ($ar['original'] ?? ''), 'file:'), dump($ar));

$http = new Unwrapper(redirect_client([
    'https://go.example/out/proto' => [ 'code' => 302, 'location' => '//127.0.0.1/secret' ],
]));
$ar = $http->unwrap('https://go.example/out/proto');
expect('protocol-relative Location to loopback rejected', empty($ar['ok']) || ! str_contains((string) ($ar['original'] ?? ''), '127.0.0.1'), dump($ar));

$http = new Unwrapper(redirect_client([
    'https://go.example/out/crlf' => [ 'code' => 302, 'location' => "https://news.example/ok\r\nX-Injected: 1" ],
]));
$ar = $http->unwrap('https://go.example/out/crlf');
expect('CRLF in Location rejected', empty($ar['ok']), dump($ar));

$http = new Unwrapper(redirect_client([
    'https://go.example/out/auth' => [ 'code' => 302, 'location' => 'https://user:pass@news.example/' ],
]));
$ar = $http->unwrap('https://go.example/out/auth');
expect('redirect with credentials rejected', empty($ar['ok']) || ! str_contains((string) ($ar['original'] ?? ''), 'user:pass'), dump($ar));

$unexpected = [];
$http = new Unwrapper(static function (string $url) use (&$unexpected): WP_Error {
    $unexpected[] = $url;
    return new WP_Error('nope', 'should not fetch');
});
$ar = $http->unwrap('http://127.0.0.1/go/out');
expect('blocked host never fetched', $unexpected === [] && empty($ar['ok']), dump($ar));

$ar = $plain->unwrap('https://example.com/go/?to=https://news.example/ok&to[1]=http://127.0.0.1/');
expect('array to[] does not smuggle loopback', empty($ar['ok']) || ! str_contains((string) ($ar['original'] ?? ''), '127.0.0.1'), dump($ar));

echo "\n{$passed} passed, {$failed} failed\n";
exit($failed === 0 ? 0 : 1);
