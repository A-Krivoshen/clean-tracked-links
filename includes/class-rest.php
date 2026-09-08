<?php
/**
 * REST API for unwrapping tracked links.
 *
 * @package CleanTrackedLinks
 */

declare(strict_types=1);

namespace CleanTrackedLinks;

if (! defined('ABSPATH')) {
    exit;
}

final class Rest
{
    public const NAMESPACE = 'clean-tracked-links/v1';
    public const ROUTE     = '/unwrap';

    public function register(): void
    {
        register_rest_route(
            self::NAMESPACE,
            self::ROUTE,
            [
                'methods'             => 'POST',
                'callback'            => [ $this, 'handle' ],
                'permission_callback' => static function (): bool {
                    return current_user_can('edit_posts');
                },
                'args'                => [
                    'url' => [
                        'required'          => true,
                        'type'              => 'string',
                        'sanitize_callback' => static function ($value): string {
                            return is_string($value) ? trim($value) : '';
                        },
                    ],
                ],
            ]
        );
    }

    public function handle(\WP_REST_Request $request): \WP_REST_Response
    {
        $url       = (string) $request->get_param('url');
        $unwrapper = new Unwrapper();
        $result    = $unwrapper->unwrap($url);

        return new \WP_REST_Response($result, 200);
    }
}
