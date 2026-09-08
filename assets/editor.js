(function (wp) {
	'use strict';

	if (!wp || !wp.element || !wp.richText || !wp.i18n) {
		return;
	}

	var el = wp.element.createElement;
	var useState = wp.element.useState;
	var useEffect = wp.element.useEffect;
	var createRoot = wp.element.createRoot;
	var render = wp.element.render;
	var unmountComponentAtNode = wp.element.unmountComponentAtNode;
	var __ = wp.i18n.__;
	var Button = wp.components && wp.components.Button;
	var SVG = wp.primitives && wp.primitives.SVG;
	var Path = wp.primitives && wp.primitives.Path;
	var getActiveFormat = wp.richText.getActiveFormat;
	var applyFormat = wp.richText.applyFormat;
	var registerFormatType = wp.richText.registerFormatType;
	var RichTextToolbarButton =
		wp.blockEditor && wp.blockEditor.RichTextToolbarButton;
	var LinkControl =
		wp.blockEditor &&
		(wp.blockEditor.LinkControl || wp.blockEditor.__experimentalLinkControl);
	var ViewerFill = LinkControl && LinkControl.ViewerFill;
	var apiFetch = wp.apiFetch;

	var TEXT_DOMAIN = 'clean-tracked-links';
	var BTN_CLASS = 'clean-tracked-links-unwrap-btn';
	var HOLDER_ATTR = 'data-clean-tracked-links-holder';
	var TARGET_PARAMS = ['to', 'url', 'target'];
	var NOTICE_ID = 'clean-tracked-links';

	var latestRichText = { value: null, onChange: null };
	var unwrapBusy = false;
	var observerStarted = false;
	var mountedRoots = [];

	var swapIcon = SVG
		? el(
				SVG,
				{
					xmlns: 'http://www.w3.org/2000/svg',
					viewBox: '0 0 24 24',
					width: 24,
					height: 24,
				},
				el(Path, {
					d: 'M7 8L3 12l4 4v-3h4v-2H7V8zm10 0v3h-4v2h4v3l4-4-4-4z',
				})
		  )
		: 'update';

	function t(text) {
		return __(text, TEXT_DOMAIN);
	}

	function showNotice(status, message) {
		if (!wp.data || !wp.data.dispatch) {
			return;
		}
		try {
			wp.data.dispatch('core/notices').createNotice(status, message, {
				type: 'snackbar',
				isDismissible: true,
				id: NOTICE_ID,
			});
		} catch (e) {
			// Notices store may be unavailable outside the editor chrome.
		}
	}

	function isHttpUrl(value) {
		if (!value || typeof value !== 'string') {
			return false;
		}
		try {
			var parsed = new URL(value);
			if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
				return false;
			}
			var host = (parsed.hostname || '').toLowerCase();
			if (
				host === 'localhost' ||
				host === '127.0.0.1' ||
				host === '::1' ||
				host === '0.0.0.0'
			) {
				return false;
			}
			return true;
		} catch (e) {
			return false;
		}
	}

	function decodeValue(value) {
		var current = String(value);
		for (var i = 0; i < 3; i++) {
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

	function restUnwrap(url) {
		if (!apiFetch) {
			return Promise.reject(new Error('apiFetch missing'));
		}
		return apiFetch({
			path: '/clean-tracked-links/v1/unwrap',
			method: 'POST',
			data: { url: url },
		});
	}

	function hasLinkFormatAt(formats, index) {
		var list = formats && formats[index];
		if (!list) {
			return false;
		}
		for (var i = 0; i < list.length; i++) {
			if (list[i] && list[i].type === 'core/link') {
				return true;
			}
		}
		return false;
	}

	function copyAttributes(source) {
		var attrs = {};
		if (!source) {
			return attrs;
		}
		Object.keys(source).forEach(function (key) {
			var val = source[key];
			if (typeof val === 'string' && val !== '') {
				attrs[key] = val;
			}
		});
		return attrs;
	}

	function applyToRichText(value, onChange, newUrl) {
		if (!value || typeof onChange !== 'function') {
			return false;
		}
		var active = getActiveFormat(value, 'core/link');
		if (!active) {
			return false;
		}

		var formats = value.formats || [];
		var start = typeof value.start === 'number' ? value.start : 0;
		var end = typeof value.end === 'number' ? value.end : start;

		while (start > 0 && hasLinkFormatAt(formats, start - 1)) {
			start -= 1;
		}
		while (end < formats.length && hasLinkFormatAt(formats, end)) {
			end += 1;
		}
		if (end <= start) {
			end = start + 1;
		}

		var attrs = copyAttributes(active.attributes);
		attrs.url = newUrl;

		var next = applyFormat(Object.assign({}, value, { start: start, end: end }), {
			type: 'core/link',
			attributes: attrs,
		});
		onChange(next);
		return true;
	}

	function applyNewUrl(newUrl) {
		if (latestRichText.value && latestRichText.onChange) {
			if (applyToRichText(latestRichText.value, latestRichText.onChange, newUrl)) {
				return true;
			}
		}

		if (!wp.data || !wp.data.select || !wp.data.dispatch) {
			return false;
		}

		var select = wp.data.select('core/block-editor');
		var dispatch = wp.data.dispatch('core/block-editor');
		if (!select || !dispatch) {
			return false;
		}

		var start = select.getSelectionStart && select.getSelectionStart();
		var end = select.getSelectionEnd && select.getSelectionEnd();
		var block = select.getSelectedBlock && select.getSelectedBlock();

		if (block && start && start.clientId === block.clientId && start.attributeKey) {
			var html = block.attributes[start.attributeKey];
			if (typeof html === 'string') {
				var value = wp.richText.create({ html: html });
				value.start = typeof start.offset === 'number' ? start.offset : 0;
				value.end =
					end && typeof end.offset === 'number' ? end.offset : value.start;
				var applied = applyToRichText(
					value,
					function (next) {
						var nextHtml = wp.richText.toHTMLString({ value: next });
						var attrs = {};
						attrs[start.attributeKey] = nextHtml;
						dispatch.updateBlockAttributes(block.clientId, attrs);
					},
					newUrl
				);
				if (applied) {
					return true;
				}
			}
		}

		if (block && block.attributes && typeof block.attributes.url === 'string') {
			dispatch.updateBlockAttributes(block.clientId, { url: newUrl });
			return true;
		}

		return false;
	}

	function readUrlFromPopover() {
		var root = document.querySelector('.block-editor-link-control');
		if (!root) {
			return '';
		}
		var link = root.querySelector(
			'.block-editor-link-control__search-item-title[href], a.components-external-link[href]'
		);
		if (link && isHttpUrl(link.getAttribute('href'))) {
			return link.getAttribute('href');
		}
		if (link && isHttpUrl(link.href)) {
			return link.href;
		}
		return '';
	}

	function getCurrentUrl(preferredUrl) {
		if (preferredUrl && typeof preferredUrl === 'string' && preferredUrl !== '') {
			return preferredUrl;
		}
		if (latestRichText.value) {
			var format = getActiveFormat(latestRichText.value, 'core/link');
			if (format && format.attributes && format.attributes.url) {
				return format.attributes.url;
			}
		}
		if (wp.data && wp.data.select) {
			var block =
				wp.data.select('core/block-editor').getSelectedBlock &&
				wp.data.select('core/block-editor').getSelectedBlock();
			if (block && block.attributes && typeof block.attributes.url === 'string') {
				return block.attributes.url;
			}
		}
		return readUrlFromPopover();
	}

	function runUnwrap(preferredUrl, onBusy) {
		if (unwrapBusy) {
			return Promise.resolve();
		}

		var url = getCurrentUrl(preferredUrl);
		if (!url) {
			showNotice('warning', t('Не удалось найти исходную ссылку'));
			return Promise.resolve();
		}

		unwrapBusy = true;
		if (typeof onBusy === 'function') {
			onBusy(true);
		}

		var finish = function (status, message) {
			unwrapBusy = false;
			if (typeof onBusy === 'function') {
				onBusy(false);
			}
			if (message) {
				showNotice(status, message);
			}
		};

		var applyResult = function (result) {
			if (!result || !result.ok || !result.original) {
				finish('warning', t('Не удалось найти исходную ссылку'));
				return;
			}
			if (!result.changed) {
				finish('info', t('Уже обычная ссылка'));
				return;
			}
			if (!isHttpUrl(result.original)) {
				finish('warning', t('Не удалось найти исходную ссылку'));
				return;
			}
			if (!applyNewUrl(result.original)) {
				finish('warning', t('Не удалось найти исходную ссылку'));
				return;
			}
			finish('success', t('Готово'));
		};

		var quick = quickUnwrap(url);
		if (quick && quick !== url) {
			applyResult({ ok: true, original: quick, changed: true });
			return Promise.resolve();
		}

		return restUnwrap(url)
			.then(applyResult)
			.catch(function () {
				finish('warning', t('Не удалось найти исходную ссылку'));
			});
	}

	function UnwrapButton(props) {
		var sourceUrl = props.sourceUrl;
		var isToolbar = !!props.isToolbar;
		var state = useState(false);
		var busy = state[0];
		var setBusy = state[1];

		var caption = busy ? t('Разворачиваю…') : t('На оригинал');
		var hint = t('Подставить исходную ссылку вместо прослеживаемой');

		var onClick = function (event) {
			if (event) {
				event.preventDefault();
				event.stopPropagation();
			}
			runUnwrap(sourceUrl, setBusy);
		};

		var onMouseDown = function (event) {
			if (event) {
				event.preventDefault();
			}
		};

		if (isToolbar && RichTextToolbarButton) {
			return el(RichTextToolbarButton, {
				icon: swapIcon,
				title: caption,
				onClick: onClick,
				isDisabled: busy,
			});
		}

		if (!Button) {
			return null;
		}

		return el(Button, {
			className: BTN_CLASS,
			icon: swapIcon,
			label: busy ? caption : hint,
			showTooltip: true,
			onClick: onClick,
			onMouseDown: onMouseDown,
			disabled: busy,
			isBusy: busy,
			isSmall: true,
			size: 'compact',
			iconSize: 24,
			'aria-label': caption,
		});
	}

	function FormatEdit(props) {
		var linkFormat = getActiveFormat(props.value, 'core/link');
		if (linkFormat && typeof props.value.start === 'number') {
			latestRichText.value = props.value;
			latestRichText.onChange = props.onChange;
		}

		useEffect(function () {
			startObserver();
		}, []);

		if (!linkFormat || !RichTextToolbarButton) {
			return null;
		}

		return el(UnwrapButton, { isToolbar: true });
	}

	if (typeof registerFormatType === 'function') {
		registerFormatType('clean-tracked-links/unwrap', {
			title: t('На оригинал'),
			tagName: 'span',
			className: 'clean-tracked-links-unwrap',
			edit: FormatEdit,
		});
	}

	if (ViewerFill && wp.plugins && typeof wp.plugins.registerPlugin === 'function') {
		wp.plugins.registerPlugin('clean-tracked-links', {
			render: function () {
				return el(ViewerFill, null, function (fillProps) {
					var url = fillProps && fillProps.url ? fillProps.url : '';
					return el(UnwrapButton, { sourceUrl: url });
				});
			},
			icon: swapIcon,
		});
	}

	function isPreviewPopover(root) {
		if (!root) {
			return false;
		}
		if (root.querySelector('.block-editor-link-control__search-item.is-preview')) {
			return true;
		}
		if (root.querySelector('.block-editor-link-control__search-item-top')) {
			return true;
		}
		if (root.querySelector('.block-editor-format-toolbar__link-container')) {
			return true;
		}
		return !!root.querySelector('.block-editor-url-popover__link-viewer');
	}

	function findInsertPoint(root) {
		var top = root.querySelector('.block-editor-link-control__search-item-top');
		if (top) {
			return top;
		}

		var actions = root.querySelector(
			'.block-editor-link-control__search-item-actions'
		);
		if (actions) {
			return actions;
		}

		var viewer = root.querySelector('.block-editor-url-popover__link-viewer');
		if (viewer) {
			return viewer;
		}

		var container = root.querySelector(
			'.block-editor-format-toolbar__link-container'
		);
		if (container) {
			return container;
		}

		var buttons = root.querySelectorAll('.components-button.has-icon');
		if (buttons.length) {
			return buttons[buttons.length - 1].parentElement;
		}

		return null;
	}

	function mountButton(holder, url) {
		var node = el(UnwrapButton, { sourceUrl: url || '' });
		if (createRoot) {
			var root = createRoot(holder);
			root.render(node);
			mountedRoots.push({ holder: holder, root: root });
			return;
		}
		if (typeof render === 'function') {
			render(node, holder);
			mountedRoots.push({ holder: holder, root: null });
		}
	}

	function isLinkControlRoot(root) {
		return (
			root.classList.contains('block-editor-link-control') ||
			!!root.closest('.block-editor-link-control') ||
			!!root.querySelector(':scope > .block-editor-link-control, .block-editor-link-control__search-item')
		);
	}

	function injectInto(root) {
		if (!root || root.nodeType !== 1) {
			return;
		}
		if (root.querySelector('.' + BTN_CLASS) || root.querySelector('[' + HOLDER_ATTR + ']')) {
			return;
		}
		// Official ViewerFill already paints the button inside LinkControl.
		if (ViewerFill && isLinkControlRoot(root)) {
			return;
		}
		if (!isPreviewPopover(root) && !root.classList.contains('block-editor-link-control')) {
			return;
		}

		var point = findInsertPoint(root);
		if (!point) {
			return;
		}

		var holder = document.createElement('span');
		holder.className = 'clean-tracked-links-holder';
		holder.setAttribute(HOLDER_ATTR, '1');
		point.appendChild(holder);
		mountButton(holder, readUrlFromPopover());
	}

	function scan() {
		var nodes = document.querySelectorAll(
			[
				'.block-editor-link-control',
				'.block-editor-link-control__search-item.is-preview',
				'.block-editor-format-toolbar__link-container',
				'.block-editor-url-popover__link-viewer',
			].join(',')
		);
		for (var i = 0; i < nodes.length; i++) {
			var node = nodes[i];
			var root = node.classList.contains('block-editor-link-control')
				? node
				: node.closest('.block-editor-link-control') ||
				  node.closest('.components-popover') ||
				  node;
			injectInto(root);
		}

		for (var j = mountedRoots.length - 1; j >= 0; j--) {
			var entry = mountedRoots[j];
			if (!entry.holder.isConnected) {
				try {
					if (entry.root && typeof entry.root.unmount === 'function') {
						entry.root.unmount();
					} else if (typeof unmountComponentAtNode === 'function') {
						unmountComponentAtNode(entry.holder);
					}
				} catch (e) {
					// Already gone.
				}
				mountedRoots.splice(j, 1);
			}
		}
	}

	function startObserver() {
		if (observerStarted || typeof MutationObserver === 'undefined') {
			return;
		}
		observerStarted = true;

		var scheduled = false;
		var observer = new MutationObserver(function () {
			if (scheduled) {
				return;
			}
			scheduled = true;
			requestAnimationFrame(function () {
				scheduled = false;
				scan();
			});
		});

		observer.observe(document.body, { childList: true, subtree: true });
		scan();
	}

	if (document.readyState === 'loading') {
		document.addEventListener('DOMContentLoaded', startObserver);
	} else {
		startObserver();
	}
})(window.wp);
