=== Clean Tracked Links ===
Contributors: krivoshein
Donate link: https://krivoshein.site
Tags: gutenberg, links, tracking, unwrap, editor
Requires at least: 6.4
Tested up to: 6.8
Requires PHP: 8.1
Stable tag: 1.1.1
License: MIT
License URI: https://opensource.org/licenses/MIT

Подставляет исходный URL вместо трекинговой обёртки в Gutenberg, классическом редакторе и встроенных WYSIWYG.

== Description ==

Плагин добавляет кнопку «На оригинал» в панель ссылки Gutenberg, в классический редактор TinyMCE и во встроенные WYSIWYG на произвольных полях.

По клику текущий href разворачивается в обычный целевой URL. Текст анкора не меняется. Если ссылка уже чистая, плагин сообщает об этом и ничего не портит.

Это не автозамена ссылок на сайте, не массовая чистка старых постов и не новый блок.

= Разработка =

* ИП Кривошеин А.С.
* Сайт: https://krivoshein.site
* Отзывы: https://yandex.ru/maps/org/ip_krivoshein_aleksey_sergeyevich/100156734340/reviews/
* По вопросам: aleskey@krivoshein.site

== Installation ==

1. Загрузите папку `clean-tracked-links` в `/wp-content/plugins/`.
2. Активируйте плагин в меню «Плагины».
3. Откройте запись в редакторе Gutenberg, кликните по ссылке и нажмите кнопку со стрелками «На оригинал».

== Frequently Asked Questions ==

= Это системная кнопка WordPress? =

Нет. Плагин встраивает свою кнопку в панель ссылки редактора.

= Меняются ли ссылки на сайте у посетителей? =

Нет. Плагин работает только в редакторе, когда вы нажимаете кнопку.

== Changelog ==

= 1.1.1 =
* TinyMCE-плагин вынесен в отдельный файл, чтобы кнопка регистрировалась после загрузки редактора.
* Классический путь: teeny/ACF, окно ссылки и inline-поле URL; не затирает src у блоков изображения.
* JS-guard закрывает IPv6 ULA/link-local и IPv4-mapped loopback; шортенер с utm по-прежнему разворачивается.

= 1.1.0 =
* Классический редактор: кнопка рядом со «ссылкой» TinyMCE, в выезжающей панели ссылки и в окне «Вставить/редактировать ссылку».
* То же для встроенных WYSIWYG на произвольных полях (ACF и другие `wp_editor()`).

= 1.0.0 =
* Первый выпуск: кнопка в панели ссылки Gutenberg и REST-разворот трекинговых URL.
