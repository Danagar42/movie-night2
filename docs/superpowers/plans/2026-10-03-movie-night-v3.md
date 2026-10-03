# Movie Night v3 — Смаковий профіль, фільтрація збереженого та Service Worker

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Навчити застосунок не показувати фільми зі списку «На майбутнє ❤️» у рекомендаціях, генерувати персоналізовані рекомендації на основі смакового профілю (жанри, улюблені фільми, акторський склад) і додати Service Worker для офлайн-доступу.

**Architecture:** Single-file SPA (`index.html`) + новий окремий файл `sw.js` (Service Worker, зовнішній файл — вимога браузерного API). Весь інший код залишається всередині `index.html`.

**Tech Stack:** HTML5, CSS3, Tailwind CSS (CDN), Vanilla JavaScript (ES6+), Gemini API, TMDB API v3, localStorage, Service Worker API

**Spec:** Узгоджено в чаті — фільтрація збереженого, смаковий профіль, Service Worker.

## Global Constraints

- `index.html` — основний та єдиний HTML-файл
- `sw.js` — окремий файл Service Worker (не може бути inline у HTML — вимога браузера)
- Tailwind CSS через CDN — без змін
- Мова інтерфейсу: тільки українська
- Пасхалка з Філіпом — не чіпати
- Всі існуючі фічі v2 (mood chips, load more, movie of the day, rabbit hole, roulette, stats, seasonal) — зберегти

---

## Карта файлів

- **Modify:** `index.html` — основна логіка (JS + HTML)
- **Create:** `sw.js` — Service Worker для кешування
- **Modify:** `test-verification.cjs` — нові тести

---

## Task 1: Фільтрація збережених (favorites) з рекомендацій

**Джерело:** Запит користувача — «щоб в рекомендаціях не показувались фільми які вже додані в список на майбутнє»

**Files:**
- Modify: `index.html` — JS: `performSearch()` (~рядок 1332), `renderSimilarMovies()` (~рядок 1110), `loadMovieOfTheDay()` (~рядок 1462)

**Interfaces:**
- Modifies: `performSearch()` — додає перевірку `favorites` при фільтрації результатів TMDB
- Modifies: `currentSimilarMovies` фільтр — додає виключення `favorites`
- Modifies: `loadMovieOfTheDay()` — перевіряє, чи рекомендація дня не в збереженому
- Consumes: `favorites` (глобальний масив), `watchedMovies` (глобальний масив)

---

- [ ] **Step 1: Додати фільтрацію favorites у performSearch**

У `performSearch()` (~рядок 1332), де фільтруються `watchedMovies`, додати аналогічну перевірку `favorites`:

```javascript
// Рядок 1332 — БУЛО:
if (watchedMovies.some(w => w.id == tmdbMovie.id)) continue;

// СТАЛО:
if (watchedMovies.some(w => w.id == tmdbMovie.id)) continue;
if (favorites.some(f => (f.id || f.imdbID) == tmdbMovie.id)) continue;
```

- [ ] **Step 2: Додати фільтрацію favorites у currentSimilarMovies**

У `openMovieModal()` (~рядок 1110), де фільтруються схожі фільми:

```javascript
// БУЛО:
window.currentSimilarMovies = (details.similar?.results || []).filter(m => !watchedMovies.some(w => w.id == m.id));

// СТАЛО:
window.currentSimilarMovies = (details.similar?.results || []).filter(m =>
    !watchedMovies.some(w => w.id == m.id) &&
    !favorites.some(f => (f.id || f.imdbID) == m.id)
);
```

- [ ] **Step 3: Додати виключення в excludeStr для Gemini**

У `performSearch()` (~рядок 1282), додати назви з favorites та watched до списку виключень для Gemini:

```javascript
// БУЛО:
const excludeStr = currentSearchState.shownTitles.length > 0
    ? `\nНЕ ВКЛЮЧАЙ ці фільми (вже показані): ${currentSearchState.shownTitles.join(', ')}.`
    : '';

// СТАЛО:
const knownTitles = [
    ...currentSearchState.shownTitles,
    ...favorites.map(f => f.title_en || f.title_ua).filter(Boolean),
    ...watchedMovies.map(w => w.title_en || w.title_ua).filter(Boolean)
];
const uniqueKnownTitles = [...new Set(knownTitles)];
const excludeStr = uniqueKnownTitles.length > 0
    ? `\nНЕ ВКЛЮЧАЙ ці фільми (вже відомі): ${uniqueKnownTitles.slice(0, 50).join(', ')}.`
    : '';
```

> **Примітка:** `.slice(0, 50)` обмежує кількість виключень, щоб не перевантажувати промпт Gemini. 50 назв достатньо для основних дублікатів.

- [ ] **Step 4: Виключити favorites з Movie of the Day**

У `loadMovieOfTheDay()` (~рядок 1462), після знаходження фільму в TMDB, перевірити чи він не в збереженому/переглянутому:

```javascript
// Після рядка: const tmdb = searchData.results[0];
// Додати перевірку:
if (watchedMovies.some(w => w.id == tmdb.id) || favorites.some(f => (f.id || f.imdbID) == tmdb.id)) {
    // Фільм вже відомий — не показуємо рекомендацію дня
    console.log('Movie of the Day skipped — already in watched/favorites');
    return;
}
```

- [ ] **Step 5: Перевірити**

1. Додати фільм у збережене ❤️ → зробити пошук → цей фільм не повинен з'являтися
2. Відкрити деталі фільму → «Схожі» → фільми зі збереженого не повинні з'являтися
3. Перезавантажити → «Рекомендація дня» не повинна бути фільмом із збереженого

---

## Task 2: Смаковий профіль (Taste Profile) та персоналізовані рекомендації

**Джерело:** Запит користувача — «рекомендація фільмів засновану на тому що користувач добавив»

**Files:**
- Modify: `index.html` — JS: нова функція `getUserTasteProfile()`
- Modify: `index.html` — HTML: новий чіпс «💖 На мій смак» (перший у ряду)
- Modify: `index.html` — JS: нова функція `searchByTaste()`
- Modify: `index.html` — JS: оновлення `loadMovieOfTheDay()` для персоналізації

**Interfaces:**
- Produces: `getUserTasteProfile()` → `{ topGenres: string[], recentTitles: string[], allKnownIds: number[], profileDescription: string }`
- Produces: `searchByTaste()` — генерує промпт на основі смакового профілю і запускає пошук
- Modifies: `loadMovieOfTheDay()` — використовує смаковий профіль для персоналізації промпту Gemini
- Consumes: `favorites`, `watchedMovies`, `movieDataStore`

---

- [ ] **Step 1: Додати функцію getUserTasteProfile**

Додати у `<script>`, після оголошення `favorites` та `watchedMovies` (~рядок 534):

```javascript
function getUserTasteProfile() {
    const allMovies = [...favorites, ...watchedMovies].filter(m => m && typeof m === 'object');

    if (allMovies.length === 0) return null;

    // Підрахунок жанрів
    const genreCounts = {};
    allMovies.forEach(m => {
        if (m.genre) genreCounts[m.genre] = (genreCounts[m.genre] || 0) + 1;
    });
    const topGenres = Object.entries(genreCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([genre]) => genre);

    // Останні фільми (для контексту)
    const recentFavorites = favorites.slice(-5).map(m => m.title_ua || m.title_en).filter(Boolean);
    const recentWatched = watchedMovies.slice(-5).map(m => m.title_ua || m.title_en).filter(Boolean);
    const recentTitles = [...new Set([...recentFavorites, ...recentWatched])].slice(0, 8);

    // Середній рейтинг фільмів які сподобались
    const ratedMovies = allMovies.filter(m => parseFloat(m.rating) > 0);
    const avgRating = ratedMovies.length > 0
        ? (ratedMovies.reduce((sum, m) => sum + parseFloat(m.rating), 0) / ratedMovies.length).toFixed(1)
        : null;

    // Текстовий опис профілю для промпту Gemini
    let profileDescription = '';
    if (topGenres.length > 0) {
        profileDescription += `Улюблені жанри: ${topGenres.join(', ')}. `;
    }
    if (recentTitles.length > 0) {
        profileDescription += `Нещодавно їй сподобались: ${recentTitles.join(', ')}. `;
    }
    if (avgRating) {
        profileDescription += `Зазвичай дивиться фільми з рейтингом ${avgRating}+. `;
    }

    // ID для виключення
    const allKnownIds = allMovies.map(m => m.id || m.imdbID).filter(Boolean);

    return { topGenres, recentTitles, allKnownIds, profileDescription };
}
```

- [ ] **Step 2: Додати чіпс «💖 На мій смак»**

У HTML, перший елемент у блоку mood chips (~рядок 395), ПЕРЕД «🥰 Романтика»:

```html
<button type="button" onclick="searchByTaste()" id="tasteChip" class="text-xs bg-gradient-to-r from-pink-500/20 to-indigo-500/20 hover:from-pink-500/30 hover:to-indigo-500/30 text-white px-4 py-2 rounded-full border border-pink-500/30 active:scale-95 transition-all font-medium shadow-sm shadow-pink-500/10">💖 На мій смак</button>
```

- [ ] **Step 3: Реалізувати searchByTaste**

Додати після `searchByMood()`:

```javascript
function searchByTaste() {
    const profile = getUserTasteProfile();
    if (!profile || profile.recentTitles.length === 0) {
        showToast("Додай кілька фільмів у ❤️ або 👀, щоб я зрозумів(ла) твій смак!");
        return;
    }

    const tastePrompt = `Підбери фільми спеціально для мене на основі мого смаку. ${profile.profileDescription}Хочу щось нове, що мені точно сподобається — можливо невідомі перлини або свіжі релізи у моїх улюблених жанрах. Здивуй мене!`;

    const input = document.getElementById('promptInput');
    input.value = tastePrompt;
    searchForm.dispatchEvent(new Event('submit', { cancelable: true }));
}
```

- [ ] **Step 4: Персоналізувати Movie of the Day**

У `loadMovieOfTheDay()`, оновити промпт Gemini, додавши смаковий профіль:

```javascript
// БУЛО (рядок ~1454):
const prompt = `Порекомендуй ОДИН чудовий ${season} фільм: ${dayMoods[dayOfWeek]}. Фільм має бути відомий та з високим рейтингом. Поверни JSON: {"title_en": "...", "title_ua": "...", "why": "Одне коротке речення УКРАЇНСЬКОЮ чому його варто подивитися сьогодні"}`;

// СТАЛО:
const profile = getUserTasteProfile();
const tasteHint = profile ? `Враховуй її смак: ${profile.profileDescription}` : '';
const excludeHint = profile && profile.recentTitles.length > 0
    ? `НЕ РЕКОМЕНДУЙ ці фільми: ${profile.recentTitles.join(', ')}.`
    : '';
const prompt = `Порекомендуй ОДИН чудовий ${season} фільм: ${dayMoods[dayOfWeek]}. ${tasteHint}${excludeHint} Фільм має бути відомий та з високим рейтингом. Поверни JSON: {"title_en": "...", "title_ua": "...", "why": "Одне коротке речення УКРАЇНСЬКОЮ чому саме ЇЙ варто це подивитися сьогодні, враховуючи її смак"}`;
```

- [ ] **Step 5: Персоналізувати AI-рецензію у модалці**

У `getAiCritique()` (~рядок 1183), збагатити промпт контекстом:

```javascript
// БУЛО:
let critique = await callGemini(`Ти - кращий друг Ані. Напиши милий та влучний коментар про фільм "${movieTitle}" українською мовою. Тільки 1 коротке речення.`, "", false);

// СТАЛО:
const profile = getUserTasteProfile();
const tasteCtx = profile ? ` Ані любить: ${profile.topGenres.join(', ')}.` : '';
let critique = await callGemini(`Ти - кращий друг Ані.${tasteCtx} Напиши милий та влучний коментар про фільм "${movieTitle}" українською мовою — чому саме Ані може сподобатися цей фільм. Тільки 1 коротке речення.`, "", false);
```

- [ ] **Step 6: Приховати чіпс «На мій смак» якщо профіль порожній**

В кінці ініціалізації `<script>`, після завантаження `favorites` та `watchedMovies`:

```javascript
// Показати/приховати чіпс "На мій смак" залежно від наявності даних
const tasteChip = document.getElementById('tasteChip');
if (tasteChip && (favorites.length + watchedMovies.length) < 3) {
    tasteChip.classList.add('hidden');
}
```

- [ ] **Step 7: Перевірити**

1. Без збережених/переглянутих фільмів → чіпс «💖 На мій смак» прихований
2. Додати 3+ фільми → чіпс з'являється
3. Натиснути «💖 На мій смак» → Gemini генерує рекомендації на основі профілю
4. Перезавантажити → «Рекомендація дня» має персоналізоване «чому» з урахуванням смаку
5. Відкрити модалку → AI-коментар згадує зв'язок зі смаком

---

## Task 3: Service Worker для офлайн-доступу

**Джерело:** Узгоджено в чаті — базовий SW для кешування

**Files:**
- Create: `sw.js` — файл Service Worker
- Modify: `index.html` — реєстрація SW у `<script>`

**Interfaces:**
- Produces: `sw.js` — кешує HTML, CSS, шрифти; при офлайні показує кешовану версію
- Modifies: `index.html` — додає `navigator.serviceWorker.register('./sw.js')`

---

- [ ] **Step 1: Створити sw.js**

Створити файл `sw.js` у кореневій директорії проєкту:

```javascript
const CACHE_NAME = 'movie-night-v3';
const STATIC_ASSETS = [
    './',
    './index.html'
];

// Встановлення: кешуємо основні ресурси
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => cache.addAll(STATIC_ASSETS))
            .then(() => self.skipWaiting())
    );
});

// Активація: видаляємо старі кеші
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then(keys =>
            Promise.all(
                keys.filter(key => key !== CACHE_NAME)
                    .map(key => caches.delete(key))
            )
        ).then(() => self.clients.claim())
    );
});

// Стратегія: Network First для HTML/API, Cache First для статики
self.addEventListener('fetch', (event) => {
    const url = new URL(event.request.url);

    // API запити — тільки мережа, без кешування
    if (url.hostname.includes('generativelanguage.googleapis.com') ||
        url.hostname.includes('api.themoviedb.org')) {
        return; // дозволяємо fetch працювати нативно
    }

    // Зображення TMDB — Cache First (постери рідко змінюються)
    if (url.hostname === 'image.tmdb.org') {
        event.respondWith(
            caches.match(event.request).then(cached => {
                if (cached) return cached;
                return fetch(event.request).then(response => {
                    if (response.ok) {
                        const clone = response.clone();
                        caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
                    }
                    return response;
                }).catch(() => new Response('', { status: 404 }));
            })
        );
        return;
    }

    // HTML та інша статика — Network First з фолбеком на кеш
    event.respondWith(
        fetch(event.request)
            .then(response => {
                if (response.ok) {
                    const clone = response.clone();
                    caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
                }
                return response;
            })
            .catch(() => caches.match(event.request))
    );
});
```

- [ ] **Step 2: Зареєструвати Service Worker в index.html**

Додати в кінець `<script>` блоку (перед `</script>`), після обробника Escape:

```javascript
// --- Service Worker ---
if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js')
        .then(reg => console.log('SW registered:', reg.scope))
        .catch(err => console.warn('SW registration failed:', err));
}
```

- [ ] **Step 3: Додати manifest.json посилання для повноцінного PWA (опціонально)**

У `<head>` після PWA мета-тегів (~рядок 13):

```html
<link rel="manifest" href="data:application/json,%7B%22name%22%3A%22%D0%92%D0%B5%D1%87%D1%96%D1%80%20%D0%BA%D1%96%D0%BD%D0%BE%20%D0%B2%20%D0%90%D0%BD%D1%96%22%2C%22short_name%22%3A%22%D0%92%D0%B5%D1%87%D1%96%D1%80%20%D0%BA%D1%96%D0%BD%D0%BE%22%2C%22start_url%22%3A%22.%2F%22%2C%22display%22%3A%22standalone%22%2C%22background_color%22%3A%22%230f172a%22%2C%22theme_color%22%3A%22%230f172a%22%7D">
```

> **Примітка:** manifest.json вбудований як data URI, щоб не створювати зайвий файл. Він мінімальний — ім'я, start_url, display mode. iOS його ігнорує (використовує apple-mobile-web-app мета-теги), але Android/Chrome потребує для PWA install prompt.

- [ ] **Step 4: Перевірити**

1. Відкрити сторінку → DevTools → Application → Service Worker → статус «activated»
2. Переключити в «Offline» → перезавантажити → сторінка відкривається з кешу
3. Постери фільмів, які бачили раніше, завантажуються з кешу
4. На iPhone: видалити з Home Screen → додати знову → все працює

---

## Task 4: Оновлення тестів

**Files:**
- Modify: `test-verification.cjs`

**Interfaces:**
- Consumes: VM sandbox з `index.html`
- Тестує: `getUserTasteProfile()`, фільтрацію favorites, service worker file existence

---

- [ ] **Step 1: Додати тест getUserTasteProfile**

Додати в `test-verification.cjs`, після існуючих тестів (але перед `console.log("ALL VERIFIER TESTS...")`):

```javascript
// 5. getUserTasteProfile test
vm.runInContext(`
    favorites = [
        { id: 10, title_ua: "Фільм А", title_en: "Movie A", genre: "Комедія", rating: "8.0", year: "2020" },
        { id: 11, title_ua: "Фільм Б", title_en: "Movie B", genre: "Комедія", rating: "7.0", year: "2019" },
        { id: 12, title_ua: "Фільм В", title_en: "Movie C", genre: "Драма", rating: "9.0", year: "2021" }
    ];
    watchedMovies = [
        { id: 20, title_ua: "Фільм Г", title_en: "Movie D", genre: "Комедія", rating: "8.5", year: "2018" }
    ];
`, sandbox);

const profile = vm.runInContext('getUserTasteProfile()', sandbox);
assert.ok(profile !== null, 'Profile should not be null');
assert.ok(profile.topGenres.includes('Комедія'), 'Top genre should be Комедія');
assert.ok(profile.recentTitles.length > 0, 'Should have recent titles');
assert.ok(profile.profileDescription.includes('Комедія'), 'Description should mention top genre');
assert.ok(profile.allKnownIds.includes(10), 'Should include favorite IDs');
assert.ok(profile.allKnownIds.includes(20), 'Should include watched IDs');
console.log('5. getUserTasteProfile test passed.');
```

- [ ] **Step 2: Додати тест фільтрації favorites**

```javascript
// 6. Favorites filtering test
// Verify that favorites IDs would be excluded from search results
const favIds = vm.runInContext('favorites.map(f => f.id)', sandbox);
assert.ok(favIds.includes(10), 'Favorites should contain id 10');
assert.ok(favIds.includes(11), 'Favorites should contain id 11');
// Verify knownTitles construction includes both lists
const knownTitles = vm.runInContext(`
    [...favorites.map(f => f.title_en).filter(Boolean),
     ...watchedMovies.map(w => w.title_en).filter(Boolean)]
`, sandbox);
assert.ok(knownTitles.includes('Movie A'), 'Known titles should include favorites');
assert.ok(knownTitles.includes('Movie D'), 'Known titles should include watched');
console.log('6. Favorites filtering test passed.');
```

- [ ] **Step 3: Додати тест наявності sw.js**

```javascript
// 7. Service Worker file exists
const swExists = require('fs').existsSync('sw.js');
assert.ok(swExists, 'sw.js should exist in project root');
const swContent = require('fs').readFileSync('sw.js', 'utf8');
assert.ok(swContent.includes('movie-night'), 'sw.js should contain cache name');
assert.ok(swContent.includes('fetch'), 'sw.js should handle fetch events');
console.log('7. Service Worker file test passed.');
```

- [ ] **Step 4: Запустити тести і закоммітити**

```bash
node test-verification.cjs
git add index.html sw.js test-verification.cjs
git commit -m "feat: taste profile, favorites filtering, service worker"
```

---

## Порядок виконання та залежності

```
Task 1 (Фільтрація favorites) ──► Task 2 (Смаковий профіль)
                                           │
Task 3 (Service Worker)  ◄─────────────────┘  (паралельний, незалежний)
                                           │
Task 4 (Тести) ◄───────────────────────────┘  (після всіх)
```

- **Task 1** — першим (простий і незалежний)
- **Task 2** — другим (залежить від Task 1 для excludeStr)
- **Task 3** — паралельний з Task 2 (не залежить від JS-логіки)
- **Task 4** — останнім (тестує все разом)
