<?php
/**
 * Plugin Name:       Clean Tracked Links
 * Plugin URI:        https://krivoshein.site
 * Description:       В редакторе Gutenberg добавляет в панель ссылки кнопку «На оригинал»: подставляет исходный URL вместо трекинговой или редиректной обёртки. Разработка: ИП Кривошеин А.С.
 * Version:           1.0.0
 * Requires at least: 6.4
 * Requires PHP:      8.1
 * Author:            ИП Кривошеин А.С.
 * Author URI:        https://krivoshein.site
 * License:           MIT
 * License URI:       https://opensource.org/licenses/MIT
 * Text Domain:       clean-tracked-links
 *
 * @package CleanTrackedLinks
 */

declare(strict_types=1);

if (! defined('ABSPATH')) {
    exit;
}

define('CLEAN_TRACKED_LINKS_VERSION', '1.0.0');
define('CLEAN_TRACKED_LINKS_FILE', __FILE__);
define('CLEAN_TRACKED_LINKS_DIR', plugin_dir_path(__FILE__));
define('CLEAN_TRACKED_LINKS_URL', plugin_dir_url(__FILE__));
define('CLEAN_TRACKED_LINKS_BASENAME', plugin_basename(__FILE__));

const CLEAN_TRACKED_LINKS_SITE    = 'https://krivoshein.site';
const CLEAN_TRACKED_LINKS_REVIEWS = 'https://yandex.ru/maps/org/ip_krivoshein_aleksey_sergeyevich/100156734340/reviews/';
const CLEAN_TRACKED_LINKS_EMAIL   = 'aleskey@krivoshein.site';
const CLEAN_TRACKED_LINKS_AUTHOR  = 'ИП Кривошеин А.С.';

require_once CLEAN_TRACKED_LINKS_DIR . 'includes/class-unwrapper.php';
require_once CLEAN_TRACKED_LINKS_DIR . 'includes/class-rest.php';

add_action('rest_api_init', static function (): void {
    (new \CleanTrackedLinks\Rest())->register();
});

add_action('enqueue_block_editor_assets', 'clean_tracked_links_enqueue_editor_assets');

/**
 * Load editor script and styles only in the block editor.
 */
function clean_tracked_links_enqueue_editor_assets(): void
{
    wp_enqueue_script(
        'clean-tracked-links-editor',
        CLEAN_TRACKED_LINKS_URL . 'assets/editor.js',
        [
            'wp-element',
            'wp-rich-text',
            'wp-api-fetch',
            'wp-data',
            'wp-i18n',
            'wp-components',
            'wp-block-editor',
            'wp-primitives',
            'wp-plugins',
            'wp-notices',
        ],
        CLEAN_TRACKED_LINKS_VERSION,
        true
    );

    wp_enqueue_style(
        'clean-tracked-links-editor',
        CLEAN_TRACKED_LINKS_URL . 'assets/editor.css',
        [],
        CLEAN_TRACKED_LINKS_VERSION
    );
}

add_filter('plugin_row_meta', 'clean_tracked_links_plugin_row_meta', 10, 2);

/**
 * @param array<int, string> $links
 * @return array<int, string>
 */
function clean_tracked_links_plugin_row_meta(array $links, string $file): array
{
    if ($file !== CLEAN_TRACKED_LINKS_BASENAME) {
        return $links;
    }

    $links[] = sprintf(
        '<a href="%s" target="_blank" rel="noopener noreferrer">%s</a>',
        esc_url(CLEAN_TRACKED_LINKS_SITE),
        esc_html__('Сайт', 'clean-tracked-links')
    );
    $links[] = sprintf(
        '<a href="%s" target="_blank" rel="noopener noreferrer">%s</a>',
        esc_url(CLEAN_TRACKED_LINKS_REVIEWS),
        esc_html__('Отзывы', 'clean-tracked-links')
    );
    $links[] = sprintf(
        '<a href="%s">%s</a>',
        esc_url('mailto:' . CLEAN_TRACKED_LINKS_EMAIL),
        esc_html__('По вопросам', 'clean-tracked-links')
    );

    return $links;
}

add_action('after_plugin_row_' . CLEAN_TRACKED_LINKS_BASENAME, 'clean_tracked_links_after_plugin_row', 10, 3);

/**
 * Developer credit under the plugin on the Plugins screen.
 *
 * @param array<string, mixed> $plugin_data
 */
function clean_tracked_links_after_plugin_row(string $file, array $plugin_data, string $status): void
{
    unset($plugin_data, $status);

    $class = is_plugin_active($file) ? 'active' : 'inactive';

    $site_host = (string) (wp_parse_url(CLEAN_TRACKED_LINKS_SITE, PHP_URL_HOST) ?: 'krivoshein.site');

    echo '<tr class="clean-tracked-links-credit ' . esc_attr($class) . '"><td colspan="4" class="colspanchange"><div class="clean-tracked-links-credit__inner">';
    echo esc_html__('Разработка:', 'clean-tracked-links') . ' ' . esc_html(CLEAN_TRACKED_LINKS_AUTHOR);
    echo ' · <a href="' . esc_url(CLEAN_TRACKED_LINKS_SITE) . '" target="_blank" rel="noopener noreferrer">' . esc_html($site_host) . '</a>';
    echo ' · <a href="' . esc_url(CLEAN_TRACKED_LINKS_REVIEWS) . '" target="_blank" rel="noopener noreferrer">' . esc_html__('Отзывы', 'clean-tracked-links') . '</a>';
    echo ' · ' . esc_html__('По вопросам:', 'clean-tracked-links') . ' <a href="' . esc_url('mailto:' . CLEAN_TRACKED_LINKS_EMAIL) . '">' . esc_html(CLEAN_TRACKED_LINKS_EMAIL) . '</a>';
    echo '</div></td></tr>';
}

add_action('admin_head-plugins.php', 'clean_tracked_links_admin_head');

/**
 * Quiet styles for the developer credit row.
 */
function clean_tracked_links_admin_head(): void
{
    echo '<style>
        .plugins tr.clean-tracked-links-credit td { padding: 0 12px 10px 40px; border-top: 0; }
        .plugins tr.clean-tracked-links-credit .clean-tracked-links-credit__inner { color: #646970; font-size: 13px; }
        .plugins tr.clean-tracked-links-credit a { text-decoration: none; }
        .plugins tr.clean-tracked-links-credit a:hover { text-decoration: underline; }
    </style>';
}
