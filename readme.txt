=== Clean Tracked Links ===
Contributors: krivoshein
Donate link: https://krivoshein.site
Tags: gutenberg, links, tracking, unwrap, editor
Requires at least: 6.4
Tested up to: 6.8
Requires PHP: 8.1
Stable tag: 1.0.0
License: MIT
License URI: https://opensource.org/licenses/MIT

Подставляет исходный URL вместо трекинговой или редиректной обёртки в панели ссылки редактора Gutenberg.

== Description ==

Плагин добавляет в панель уже существующей ссылки Gutenberg (popover с заголовком, URL и кнопками редактирования / открытия / копирования) четвёртую кнопку «На оригинал».

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

= 1.0.0 =
* Первый выпуск: кнопка в панели ссылки Gutenberg и REST-разворот трекинговых URL.
