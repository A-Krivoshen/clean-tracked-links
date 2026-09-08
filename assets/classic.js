(function (root) {
	'use strict';

	if (root.cleanTrackedLinksClassicLoaded) {
		return;
	}
	root.cleanTrackedLinksClassicLoaded = true;

	var settings = root.cleanTrackedLinksSettings || {};
	var i18n = settings.i18n || {};
	var guard = root.cleanTrackedLinksUrlGuard;
	var busy = false;
	var BTN_CLASS = 'ctl-classic-unwrap';

	function t(key, fallback) {
		return i18n[key] || fallback;
	}

	function svgIcon() {
		return (
			'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false">' +
			'<path fill="currentColor" d="M7 8L3 12l4 4v-3h4v-2H7V8zm10 0v3h-4v2h4v3l4-4-4-4z"/>' +
			'</svg>'
		);
	}

	function unwrapUrl(url) {
		var quick = guard && guard.quickUnwrap ? guard.quickUnwrap(url) : null;
		if (quick && quick !== url) {
			return Promise.resolve({ ok: true, original: quick, changed: true });
		}

		var restUrl = settings.restUrl || '';
		var nonce = settings.nonce || (root.wpApiSettings && root.wpApiSettings.nonce) || '';
		if (!restUrl) {
			return Promise.reject(new Error('rest url missing'));
		}

		return fetch(restUrl, {
			method: 'POST',
			credentials: 'same-origin',
			headers: {
				'Content-Type': 'application/json',
				'X-WP-Nonce': nonce,
			},
			body: JSON.stringify({ url: url }),
		}).then(function (res) {
			return res.json();
		});
	}

	function speak(message) {
		if (root.wp && root.wp.a11y && typeof root.wp.a11y.speak === 'function') {
			root.wp.a11y.speak(message);
		}
	}

	function snackbar(status, message) {
		if (root.wp && root.wp.data && root.wp.data.dispatch) {
			try {
				root.wp.data.dispatch('core/notices').createNotice(status, message, {
					type: 'snackbar',
					isDismissible: true,
					id: 'clean-tracked-links',
				});
				return;
			} catch (e) {
				// Classic screen without notices store.
			}
		}
		speak(message);
	}

	function tinymceNotify(editor, type, message) {
		if (editor && editor.notificationManager && typeof editor.notificationManager.open === 'function') {
			editor.notificationManager.open({
				text: message,
				type: type === 'success' ? 'success' : 'info',
				timeout: 2500,
			});
		}
		snackbar(type === 'success' ? 'success' : type === 'error' ? 'warning' : 'info', message);
	}

	function runUnwrap(href, onApply, editor) {
		if (busy) {
			return Promise.resolve();
		}
		if (!href) {
			tinymceNotify(editor, 'warning', t('fail', 'Не удалось найти исходную ссылку'));
			return Promise.resolve();
		}

		busy = true;
		return unwrapUrl(href)
			.then(function (result) {
				busy = false;
				if (!result || !result.ok || !result.original) {
					tinymceNotify(editor, 'warning', t('fail', 'Не удалось найти исходную ссылку'));
					return;
				}
				if (!result.changed) {
					tinymceNotify(editor, 'info', t('already', 'Уже обычная ссылка'));
					return;
				}
				if (guard && !guard.isHttpUrl(result.original)) {
					tinymceNotify(editor, 'warning', t('fail', 'Не удалось найти исходную ссылку'));
					return;
				}
				if (typeof onApply === 'function') {
					onApply(result.original);
				}
				tinymceNotify(editor, 'success', t('done', 'Готово'));
			})
			.catch(function () {
				busy = false;
				tinymceNotify(editor, 'warning', t('fail', 'Не удалось найти исходную ссылку'));
			});
	}

	function getLinkNode(editor) {
		if (!editor || !editor.dom) {
			return null;
		}
		return editor.dom.getParent(editor.selection.getNode(), 'a[href]');
	}

	function applyToAnchor(editor, node, newUrl) {
		if (!editor || !node) {
			return;
		}
		editor.undoManager.transact(function () {
			editor.dom.setAttrib(node, 'href', newUrl);
			editor.dom.setAttrib(node, 'data-mce-href', newUrl);
		});
		var preview = document.querySelector('.wp-link-preview a');
		if (preview) {
			preview.setAttribute('href', newUrl);
			preview.textContent = newUrl.replace(/^https?:\/\//i, '');
		}
	}

	function registerTinyMcePlugin() {
		if (!root.tinymce || !root.tinymce.PluginManager) {
			return;
		}
		if (root.tinymce.PluginManager.get('clean_tracked_links')) {
			return;
		}

		root.tinymce.PluginManager.add('clean_tracked_links', function (editor) {
			editor.addCommand('CTL_Unwrap', function () {
				var node = getLinkNode(editor);
				if (!node) {
					tinymceNotify(editor, 'warning', t('fail', 'Не удалось найти исходную ссылку'));
					return;
				}
				runUnwrap(node.getAttribute('href'), function (original) {
					applyToAnchor(editor, node, original);
				}, editor);
			});

			editor.addButton('clean_tracked_links', {
				title: t('tooltip', 'Подставить исходную ссылку вместо прослеживаемой'),
				icon: 'clean_tracked_links',
				cmd: 'CTL_Unwrap',
				onPostRender: function () {
					var ctrl = this;
					editor.on('NodeChange', function () {
						if (ctrl.disabled) {
							ctrl.disabled(!getLinkNode(editor));
						}
					});
				},
			});
		});
	}

	function makeButton(extraClass) {
		var btn = document.createElement('button');
		btn.type = 'button';
		btn.className = BTN_CLASS + (extraClass ? ' ' + extraClass : '');
		btn.setAttribute('aria-label', t('label', 'На оригинал'));
		btn.title = t('tooltip', 'Подставить исходную ссылку вместо прослеживаемой');
		btn.innerHTML = svgIcon() + '<span class="ctl-classic-unwrap__text">' + t('label', 'На оригинал') + '</span>';
		return btn;
	}

	function injectWpLinkModal() {
		var input = document.getElementById('wp-link-url');
		if (!input || document.querySelector('#wp-link .' + BTN_CLASS)) {
			return;
		}
		var host = input.closest('div') || input.parentElement;
		if (!host) {
			return;
		}
		var btn = makeButton('button ctl-wplink-unwrap');
		var status = document.createElement('span');
		status.className = 'ctl-wplink-status';
		btn.addEventListener('click', function (event) {
			event.preventDefault();
			event.stopPropagation();
			if (busy) {
				return;
			}
			btn.disabled = true;
			status.textContent = t('busy', 'Разворачиваю…');
			runUnwrap(
				input.value,
				function (original) {
					input.value = original;
					input.dispatchEvent(new Event('change', { bubbles: true }));
				},
				root.tinymce && root.tinymce.activeEditor
			).then(function () {
				btn.disabled = false;
				status.textContent = '';
			});
		});
		host.appendChild(btn);
		host.appendChild(status);
	}

	function injectInlineToolbar() {
		var previews = document.querySelectorAll('.wp-link-preview');
		for (var i = 0; i < previews.length; i++) {
			var preview = previews[i];
			var toolbar = preview.closest('.mce-toolbar, .mce-container-body, .mce-flow-layout');
			if (!toolbar || toolbar.querySelector('.' + BTN_CLASS)) {
				continue;
			}
			var btn = document.createElement('div');
			btn.className = 'mce-widget mce-btn ' + BTN_CLASS;
			btn.setAttribute('role', 'button');
			btn.setAttribute('tabindex', '-1');
			btn.setAttribute('aria-label', t('label', 'На оригинал'));
			btn.title = t('tooltip', 'Подставить исходную ссылку вместо прослеживаемой');
			btn.innerHTML = '<button type="button">' + svgIcon() + '</button>';
			btn.addEventListener('mousedown', function (event) {
				event.preventDefault();
			});
			btn.addEventListener(
				'click',
				(function (currentPreview) {
					return function (event) {
						event.preventDefault();
						event.stopPropagation();
						var editor = root.tinymce && root.tinymce.activeEditor;
						if (!editor) {
							return;
						}
						var node = getLinkNode(editor);
						var href = node ? node.getAttribute('href') : '';
						if (!href) {
							var previewLink = currentPreview.querySelector('a[href]');
							href = previewLink ? previewLink.getAttribute('href') : '';
						}
						runUnwrap(
							href,
							function (original) {
								if (node) {
									applyToAnchor(editor, node, original);
								}
							},
							editor
						);
					};
				})(preview)
			);
			var lastBtn = toolbar.querySelector('.mce-btn:last-of-type');
			if (lastBtn && lastBtn.parentNode) {
				lastBtn.parentNode.insertBefore(btn, lastBtn.nextSibling);
			} else {
				toolbar.appendChild(btn);
			}
		}
	}

	function scan() {
		injectWpLinkModal();
		injectInlineToolbar();
	}

	registerTinyMcePlugin();

	if (document.readyState === 'loading') {
		document.addEventListener('DOMContentLoaded', function () {
			registerTinyMcePlugin();
			scan();
		});
	} else {
		scan();
	}

	function startObserver() {
		if (typeof MutationObserver === 'undefined' || !document.body) {
			return;
		}
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
	}

	if (document.body) {
		startObserver();
	} else if (document.addEventListener) {
		document.addEventListener('DOMContentLoaded', startObserver);
	}
})(typeof window !== 'undefined' ? window : this);
