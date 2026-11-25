# Life OS

Планировщик дня вокруг важного: свои направления жизни, опорные точки дня (по желанию время намаза), привычки, вечерние итоги и цели на 1/5/10 лет.

- Статический сайт, работает как приложение (PWA): на телефоне «Добавить на главный экран».
- Без входа план хранится в браузере. С входом по почте он хранится в Supabase и есть на всех устройствах.
- Каждый пользователь видит только свои данные (Row Level Security).

## Запуск
1. Supabase: создать проект, открыть SQL Editor и выполнить `supabase/schema.sql`.
2. В Authentication → URL Configuration указать адрес сайта (Site URL и Redirect URLs).
3. В `config.js` вписать Project URL и anon public key (не service_role).
4. Хостинг: Vercel (Import Git Repository, без сборки) или GitHub Pages из корня репозитория.

Локально: `python3 -m http.server` в этой папке.
