'use strict';

const assert = require('assert');
const guard = require('../assets/url-guard.js');

let failed = 0;
let passed = 0;

function expect(name, ok, detail) {
	if (ok) {
		passed++;
		console.log('OK   ' + name);
		return;
	}
	failed++;
	console.log('FAIL ' + name + (detail ? ' — ' + detail : ''));
}

const klerk =
	'https://www.klerk.ru/go/ext/?to=https%3A%2F%2Fwww.vedomosti.ru%2Fbusiness%2Farticles%2F2026%2F07%2F06%2F1211353-nedorogoi-ikri-mozhet-stat-menshe&entityId=1';
const vedomosti =
	'https://www.vedomosti.ru/business/articles/2026/07/06/1211353-nedorogoi-ikri-mozhet-stat-menshe';

console.log('== JS robustness ==');
expect('quickUnwrap klerk', guard.quickUnwrap(klerk) === vedomosti, String(guard.quickUnwrap(klerk)));
expect('quickUnwrap clean is null', guard.quickUnwrap('https://example.com/news/hello') === null);
expect(
	'quickUnwrap nested to/url',
	guard.quickUnwrap(
		'https://tracker.example/out/?url=' +
			encodeURIComponent('https://wrap.example/go/?to=' + encodeURIComponent('https://news.example/a'))
	) === 'https://news.example/a'
);
expect('target=_blank ignored', guard.quickUnwrap('https://example.com/?target=_blank') === null);
expect('isHttpUrl public', guard.isHttpUrl('https://example.com/news/hello') === true);

console.log('== JS security ==');
const rejected = [
	['javascript:alert(1)', 'javascript'],
	['data:text/html,hi', 'data'],
	['file:///etc/passwd', 'file'],
	['http://127.0.0.1/', '127.0.0.1'],
	['http://localhost/x', 'localhost'],
	['http://192.168.0.1/', 'rfc1918'],
	['http://10.1.2.3/', '10/8'],
	['http://172.16.0.9/', '172.16'],
	['http://169.254.169.254/', 'metadata'],
	['http://2130706433/', 'decimal loopback'],
	['http://127.1/', 'short 127.1'],
	['http://0x7f000001/', 'hex loopback'],
	['http://0/', 'host 0'],
	['http://[::1]/', 'ipv6 loopback'],
	['http://foo.localhost/', '.localhost'],
	['http://printer.local/', '.local'],
	['http://metadata.google.internal/', 'gcp metadata'],
	['http://user:pass@example.com/', 'credentials'],
	['http://100.64.0.1/', 'cgnat'],
];

rejected.forEach(function (pair) {
	expect('reject ' + pair[1], guard.isHttpUrl(pair[0]) === false, pair[0]);
});

expect(
	'quickUnwrap does not apply loopback to=',
	guard.quickUnwrap('https://example.com/go/?to=http://127.0.0.1/') === null
);
expect(
	'quickUnwrap does not apply rfc1918 to=',
	guard.quickUnwrap('https://example.com/go/?to=http://192.168.1.1/admin') === null
);
expect(
	'quickUnwrap does not apply javascript to=',
	guard.quickUnwrap('https://example.com/go/?to=javascript:alert(1)') === null
);
expect(
	'quickUnwrap does not apply decimal loopback',
	guard.quickUnwrap('https://example.com/go/?to=http://2130706433/') === null
);

const extraBlocked = [
	['http://0177.0.0.1/', 'octal'],
	['http://0x7f.0.0.1/', 'dotted-hex'],
	['http://127.0.1/', 'short 127.0.1'],
	['http://0.0.0.0/', '0.0.0.0'],
	['http://[::ffff:127.0.0.1]/', 'v4-mapped'],
	['http://[fe80::1]/', 'ipv6-ll'],
	['http://[fd00::1]/', 'ipv6-ula'],
	['http://224.0.0.1/', 'multicast'],
	['http://metadata.google.com/', 'gcp metadata.com'],
	['http://instance-data/', 'ec2 alias'],
	['http://foo.internal/', '.internal'],
	['http://nas.lan/', '.lan'],
	['http://files.corp/', '.corp'],
	['http://localhost./', 'trailing-dot localhost'],
	['  javascript:alert(1)', 'padded javascript'],
	['intent:scan', 'intent'],
];
extraBlocked.forEach(function (pair) {
	expect('js reject ' + pair[1], guard.isHttpUrl(pair[0]) === false, pair[0]);
});

expect(
	'js dest= is server-only',
	guard.quickUnwrap('https://example.com/go/?dest=' + encodeURIComponent('https://news.example/x')) === null
);
expect(
	'js skip bad to= then use url=',
	guard.quickUnwrap(
		'https://example.com/go/?to=_blank&url=' + encodeURIComponent('https://news.example/ok')
	) === 'https://news.example/ok'
);
expect(
	'quickUnwrap to=fe80 is null',
	guard.quickUnwrap('https://example.com/go/?to=' + encodeURIComponent('http://[fe80::1]/')) === null
);

console.log('\n' + passed + ' passed, ' + failed + ' failed');
process.exit(failed === 0 ? 0 : 1);
