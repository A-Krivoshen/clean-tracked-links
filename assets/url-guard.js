(function (root) {
	'use strict';

	function normalizeHost(host) {
		return String(host || '')
			.toLowerCase()
			.replace(/^\[|\]$/g, '')
			.replace(/\.$/, '');
	}

	function parseIpv4Token(part) {
		if (/^0x[0-9a-f]+$/i.test(part)) {
			return parseInt(part, 16);
		}
		if (/^0[0-7]+$/.test(part)) {
			return parseInt(part, 8);
		}
		if (/^\d+$/.test(part)) {
			return parseInt(part, 10);
		}
		return null;
	}

	function expandWeirdIpv4(host) {
		if (/^\d+$/.test(host)) {
			var n = Number(host);
			if (n < 0 || n > 4294967295) {
				return null;
			}
			return [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255].join('.');
		}
		if (/^0x[0-9a-f]+$/i.test(host)) {
			var hx = parseInt(host, 16);
			if (hx < 0 || hx > 4294967295) {
				return null;
			}
			return [(hx >>> 24) & 255, (hx >>> 16) & 255, (hx >>> 8) & 255, hx & 255].join('.');
		}
		if (!/^[0-9a-fx.]+$/i.test(host) || host.indexOf('.') === -1) {
			return null;
		}
		var parts = host.split('.');
		if (parts.length < 2 || parts.length > 4) {
			return null;
		}
		var vals = [];
		for (var i = 0; i < parts.length; i++) {
			var v = parseIpv4Token(parts[i]);
			if (v === null || v < 0) {
				return null;
			}
			vals.push(v);
		}
		if (vals.length === 4) {
			for (var j = 0; j < 4; j++) {
				if (vals[j] > 255) {
					return null;
				}
			}
			return vals.join('.');
		}
		if (vals.length === 3) {
			if (vals[0] > 255 || vals[1] > 255 || vals[2] > 65535) {
				return null;
			}
			return [vals[0], vals[1], (vals[2] >> 8) & 255, vals[2] & 255].join('.');
		}
		if (vals.length === 2) {
			if (vals[0] > 255 || vals[1] > 16777215) {
				return null;
			}
			var tail = vals[1];
			return [vals[0], (tail >> 16) & 255, (tail >> 8) & 255, tail & 255].join('.');
		}
		return null;
	}

	function ipv4FromMapped(host) {
		host = normalizeHost(host);
		if (host.indexOf('::ffff:') !== 0) {
			return null;
		}
		var rest = host.slice(7);
		if (/^\d+\.\d+\.\d+\.\d+$/.test(rest)) {
			return rest;
		}
		var hex = /^([0-9a-f]{1,4}):([0-9a-f]{1,4})$/i.exec(rest);
		if (!hex) {
			return null;
		}
		var hi = parseInt(hex[1], 16);
		var lo = parseInt(hex[2], 16);
		return [(hi >> 8) & 255, hi & 255, (lo >> 8) & 255, lo & 255].join('.');
	}

	function isBlockedIPv4(ip) {
		var m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(ip);
		if (!m) {
			return false;
		}
		var a = +m[1];
		var b = +m[2];
		var c = +m[3];
		var d = +m[4];
		if (a > 255 || b > 255 || c > 255 || d > 255) {
			return false;
		}
		if (a === 0 || a === 10 || a === 127 || a >= 224) {
			return true;
		}
		if (a === 169 && b === 254) {
			return true;
		}
		if (a === 172 && b >= 16 && b <= 31) {
			return true;
		}
		if (a === 192 && b === 168) {
			return true;
		}
		if (a === 100 && b >= 64 && b <= 127) {
			return true;
		}
		return false;
	}

	function isBlockedHost(host) {
		host = normalizeHost(host);
		if (!host) {
			return true;
		}
		if (
			host === 'localhost' ||
			host === '0.0.0.0' ||
			host === '0' ||
			host === '::' ||
			host === '::1' ||
			host === 'metadata' ||
			host === 'metadata.google.internal' ||
			host === 'metadata.google.com' ||
			host === 'instance-data'
		) {
			return true;
		}
		if (/\.(localhost|localdomain|local|internal|lan|home|corp)$/.test(host)) {
			return true;
		}
		if (host.indexOf('::ffff:') === 0) {
			var mapped = ipv4FromMapped(host);
			if (mapped) {
				return isBlockedHost(mapped);
			}
			return isBlockedHost(host.slice(7));
		}
		if (host.indexOf(':') !== -1) {
			if (host.indexOf('fe80:') === 0 || host.indexOf('fc') === 0 || host.indexOf('fd') === 0 || host.indexOf('ff') === 0) {
				return true;
			}
		}
		if (isBlockedIPv4(host)) {
			return true;
		}
		var expanded = expandWeirdIpv4(host);
		if (expanded && isBlockedIPv4(expanded)) {
			return true;
		}
		return false;
	}

	function isHttpUrl(value) {
		if (!value || typeof value !== 'string') {
			return false;
		}
		if (/[\u0000-\u001f\u007f]/.test(value)) {
			return false;
		}
		if (/^\s*(javascript|data|file|ftp|ftps|about|blob|vbscript|mailto|intent):/i.test(value)) {
			return false;
		}
		try {
			var parsed = new URL(value);
			if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
				return false;
			}
			if (parsed.username || parsed.password) {
				return false;
			}
			if (isBlockedHost(parsed.hostname || '')) {
				return false;
			}
			return true;
		} catch (e) {
			return false;
		}
	}

	var TARGET_PARAMS = ['to', 'url', 'target'];

	function decodeValue(value) {
		var current = String(value);
		for (var d = 0; d < 3; d++) {
			try {
				var decoded = decodeURIComponent(current.replace(/\+/g, ' '));
				if (decoded === current) {
					break;
				}
				current = decoded;
			} catch (e) {
				break;
			}
		}
		return current.trim();
	}

	function quickUnwrap(url) {
		var current = url;
		var changed = false;
		for (var depth = 0; depth < 3; depth++) {
			var next = null;
			try {
				var parsed = new URL(current);
				for (var i = 0; i < TARGET_PARAMS.length; i++) {
					var key = TARGET_PARAMS[i];
					if (!parsed.searchParams.has(key)) {
						continue;
					}
					var candidate = decodeValue(parsed.searchParams.get(key) || '');
					if (isHttpUrl(candidate)) {
						next = candidate;
						break;
					}
				}
			} catch (e) {
				break;
			}
			if (!next || next === current) {
				break;
			}
			current = next;
			changed = true;
		}
		return changed && isHttpUrl(current) ? current : null;
	}

	var urlGuard = {
		isHttpUrl: isHttpUrl,
		quickUnwrap: quickUnwrap,
		isBlockedHost: isBlockedHost,
	};
	if (typeof module === 'object' && module.exports) {
		module.exports = urlGuard;
	}
	root.cleanTrackedLinksUrlGuard = urlGuard;
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
