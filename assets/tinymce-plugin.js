(function (root) {
	'use strict';

	if (!root.tinymce || !root.tinymce.PluginManager) {
		return;
	}
	if (root.tinymce.PluginManager.get('clean_tracked_links')) {
		return;
	}

	root.tinymce.PluginManager.add('clean_tracked_links', function (editor) {
		if (root.cleanTrackedLinksClassic && typeof root.cleanTrackedLinksClassic.attachEditor === 'function') {
			root.cleanTrackedLinksClassic.attachEditor(editor);
			return;
		}

		editor.addCommand('CTL_Unwrap', function () {
			if (root.cleanTrackedLinksClassic && typeof root.cleanTrackedLinksClassic.unwrapActive === 'function') {
				root.cleanTrackedLinksClassic.unwrapActive(editor);
			}
		});

		editor.addButton('clean_tracked_links', {
			title: 'На оригинал',
			icon: 'clean_tracked_links',
			cmd: 'CTL_Unwrap',
		});
	});
})(typeof window !== 'undefined' ? window : this);
