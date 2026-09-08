# Clean Tracked Links

WordPress-плагин для редактора Gutenberg: в панели уже существующей ссылки появляется кнопка **«На оригинал»**. Она подставляет исходный URL вместо трекинговой или редиректной обёртки. Текст анкора не меняется.

Это **не** системная кнопка ядра WordPress. Плагин сам встраивает её в popover ссылки.

**Версия:** 1.0.0 · **WP:** 6.4+ · **PHP:** 8.1+ · без npm и без сборки.

## Что делает

В маленькой панельке ссылки (заголовок, URL, карандаш / открыть / копировать) добавляется четвёртая кнопка со стрелками ↔.

По клику плагин берёт текущий `href`, разворачивает обёртку и записывает целевой URL обратно в ту же ссылку.

| Было | Стало |
| --- | --- |
| `https://www.klerk.ru/go/ext/?to=https%3A%2F%2Fwww.vedomosti.ru%2F…&entityId=123` | `https://www.vedomosti.ru/business/articles/…` |
| `https://example.com/news/hello?utm_source=tg&yclid=123` | `https://example.com/news/hello` |
| обычная `https://example.com/news/hello` | без изменения |

Если развернуть нельзя — ссылка не трогается. Повторный клик по уже чистой ссылке её не портит.

## Это не

- не автозамена ссылок на сайте у посетителей
- не массовая чистка старых постов
- не страница настроек
- не новый блок Gutenberg

## Установка

1. Скачайте ZIP: [Code → Download ZIP](https://github.com/A-Krivoshen/clean-tracked-links/archive/refs/heads/main.zip).
2. Распакуйте папку в `/wp-content/plugins/clean-tracked-links/`.
3. В админке WordPress: **Плагины → активировать Clean Tracked Links**.
4. Откройте запись в Gutenberg, кликните по ссылке и нажмите кнопку со стрелками.

Главный файл должен лежать так:

```text
wp-content/plugins/clean-tracked-links/clean-tracked-links.php
```

## Как пользоваться

1. Кликните по ссылке в тексте.
2. В popover нажмите **«На оригинал»**.
3. Пока идёт запрос, кнопка disabled и показывает «Разворачиваю…».
4. Успех — snackbar «Готово», в ссылке уже исходный URL.
5. Если ссылка и так обычная — «Уже обычная ссылка».
6. Если исходный URL не найден — «Не удалось найти исходную ссылку», href не меняется.

## Как разворачивает

Логика на PHP, маршрут `POST /wp-json/clean-tracked-links/v1/unwrap` (право `edit_posts`).

1. Параметры цели по очереди: `to`, `url`, `target`, `u`, `dest`, `destination`, `redirect`, `redirect_url`, `link`. Значение urldecode, вложенные обёртки — до 3 раз.
2. Если параметра нет, но URL похож на промежуточный редирект — один безопасный HTTP-запрос без тела страницы (HEAD, иначе ограниченный GET), берётся `Location`. Максимум 3 редиректа, таймаут 5 секунд.
3. У уже почти чистого URL срезаются только служебные метки: `utm_*`, `yclid`, `ysclid`, `gclid`, `fbclid`, `_openstat`, `from`, `eref`, `ref`, `ref_src`. Параметры вроде `id`, `article`, `slug`, `page` не трогаются.

Принимаются только `http`/`https`. Localhost, private/reserved и link-local IP не резолвятся. Результат проходит через `wp_http_validate_url` и `esc_url_raw`.

## Файлы

```text
clean-tracked-links.php
readme.txt
includes/class-unwrapper.php
includes/class-rest.php
assets/editor.js
assets/editor.css
```

## Разработка

ИП Кривошеин А.С.

- Сайт: [krivoshein.site](https://krivoshein.site)
- [Отзывы](https://yandex.ru/maps/org/ip_krivoshein_aleksey_sergeyevich/100156734340/reviews/)
- По вопросам: [aleskey@krivoshein.site](mailto:aleskey@krivoshein.site)

## License

[MIT](LICENSE) © 2026 Aleksey Krivoshein
