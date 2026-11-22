# ПДР Тренажер

Тренажер теоретичного іспиту з ПДР України.
Сайт: https://nazyxxs.github.io/pdr-trainer/

## Дані

- Джерело: офіційні тестові питання ГСЦ МВС (наказ від 29.10.2025 № 225),
  https://hsc.gov.ua/pitannya-ta-ispit-z-pdr/
- 2332 питання, 65 розділів, 1123 ілюстрації.
- PDF з питаннями розбирається скриптом `tools/parse_questions.py` (PyMuPDF).
- Таблиця відповідей - скан, розпізнана через `tools/parse_answers.py` (OpenCV).
- Результат: `public/questions.json` + картинки в `public/img/` (`tools/build_data.py`).

## База даних

- Supabase (PostgreSQL) - акаунти (email + пароль) і синхронізація прогресу.
- Одна таблиця `progress`: `user_id`, `data` (jsonb), `updated_at`. Схема: `supabase/schema.sql`.
- Доступ обмежено Row Level Security: користувач бачить лише свій рядок.
- Без входу прогрес зберігається локально (localStorage).

## Стек

React 19, Vite, Supabase JS, PWA (офлайн). Хостинг: GitHub Pages (GitHub Actions).

## Запуск

```bash
npm install
cp .env.example .env.local   # VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY
npm run dev
```

Автор: **nazyxxs**
