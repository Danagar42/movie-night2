# Movie Night v2 — План реалізації

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Перетворити «Вечір кіно в Ані» з одноразового пошуковика на стрічку для відкриття фільмів — з безкінечним переглядом, швидкими настроями, фільмом дня, ланцюговим discovery, рулеткою, статистикою та сезонними підказками. Попутно виправити критичні баги з аудиту.

**Architecture:** Single-file SPA (index.html). Весь код — HTML + CSS + vanilla JS. Без build-системи, без фреймворків, без зовнішніх залежностей крім Tailwind CDN, Google Fonts, Gemini API та TMDB API. Зберігаємо цю архітектуру — всі зміни в одному файлі.

**Tech Stack:** HTML5, CSS3, Tailwind CSS (CDN), Vanilla JavaScript (ES6+), Gemini API, TMDB API v3, localStorage

**Spec:** Аудит — `AUDIT_REPORT_2026-10-02.md`, фронтенд-ідеї — узгоджені в чаті.

## Global Constraints

- Все залишається в одному файлі `index.html` — без рефакторингу на модулі
- Tailwind CSS через CDN — без зміни підходу
- API-ключі: TMDB залишається хардкоджений, Gemini вводиться користувачем — без змін
- Мова інтерфейсу: тільки українська
- Основна цільова платформа: iPhone (iOS Safari, Add to Home Screen)
- Пасхалка з Філіпом (тригери «філіп», «філя», «бубочка») — не чіпати, не ламати

---

## Карта файлів

- **Modify:** `index.html` — єдиний файл проєкту. Всі зміни вносяться сюди:
  - `<head>` (рядки 1-226) — CSS, meta-теги
  - `<body>` HTML (рядки 227-377) — розмітка UI
  - `<script>` (рядки 378-1232) — вся логіка

---

## Task 1: Фундамент — утиліти безпеки та фікси аудиту

**Джерело:** AUD-001, AUD-004, AUD-005, AUD-006, AUD-012, AUD-014, AUD-016, AUD-017

**Files:**
- Modify: `index.html:5` (viewport meta)
- Modify: `index.html:17` (@import → link)
- Modify: `index.html:378-435` (утиліти та глобальні змінні)
- Modify: `index.html:454-468` (toast — XSS)
- Modify: `index.html:530-554` (removeFavorite — undo)
- Modify: `index.html:587` (watched panel class)

**Interfaces:**
- Produces: `escapeHtml(str)` → `string` — утиліта санітизації, використовується всіма наступними тасками
- Produces: `safeParseJSON(key, fallback)` → `any` — безпечне зчитування з localStorage

---

- [ ] **Step 1: Виправити viewport meta (AUD-014)**

Рядок 5 — видалити `maximum-scale=1.0, user-scalable=no`:

```html
<!-- БУЛО: -->
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">

<!-- СТАЛО: -->
<meta name="viewport" content="width=device-width, initial-scale=1.0">
```

- [ ] **Step 2: Замінити @import на link (AUD-012)**

Видалити рядок 17 (`@import url(...)`) зсередини блоку `<style>`, додати `<link>` перед `<style>`:

```html
<!-- Додати ПЕРЕД тегом <style>, після рядка 15 (<script src="https://cdn.tailwindcss.com">) -->
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;600;700&family=Dancing+Script:wght@600&display=swap">

<!-- Всередині <style> ВИДАЛИТИ рядок: -->
<!-- @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;600;700&family=Dancing+Script:wght@600&display=swap'); -->
```

- [ ] **Step 3: Додати утиліти escapeHtml та safeParseJSON**

Вставити на початку блоку `<script>` (після рядка 378), ДО будь-якого іншого коду:

```javascript
// --- Утиліти безпеки ---
function escapeHtml(str) {
    if (str == null) return '';
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;')
        .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
}

function safeParseJSON(key, fallback = []) {
    try {
        const raw = localStorage.getItem(key);
        if (raw === null) return fallback;
        return JSON.parse(raw) || fallback;
    } catch {
        console.warn(`localStorage "${key}" містить пошкоджені дані — скинуто.`);
        localStorage.removeItem(key);
        return fallback;
    }
}
```

- [ ] **Step 4: Замінити JSON.parse на safeParseJSON (AUD-004)**

Замінити три виклики:

```javascript
// Рядок 427 — БУЛО:
let favorites = JSON.parse(localStorage.getItem('ani_movie_favorites')) || [];
// СТАЛО:
let favorites = safeParseJSON('ani_movie_favorites', []);

// Рядок 428 — БУЛО:
let watchedMovies = JSON.parse(localStorage.getItem('ani_movie_watched')) || [];
// СТАЛО:
let watchedMovies = safeParseJSON('ani_movie_watched', []);

// Рядок 922 — БУЛО:
const savedResults = JSON.parse(localStorage.getItem('ani_last_results')) || [];
// СТАЛО:
const savedResults = safeParseJSON('ani_last_results', []);
```

- [ ] **Step 5: Виправити клас watched-панелі (AUD-005)**

Рядок 587:

```javascript
// БУЛО:
if(!document.getElementById('watchedPanel').classList.contains('-translate-x-full')) renderWatchedList();

// СТАЛО:
if(!document.getElementById('watchedPanel').classList.contains('translate-x-full')) renderWatchedList();
```

- [ ] **Step 6: Виправити undo через замикання (AUD-006)**

У функції `removeFavorite()` (рядки 530-554) — замість глобальної `lastRemovedFavorite` використати локальну змінну в замиканні:

```javascript
function removeFavorite(identifier) {
    favorites = favorites.filter(m => String(m.id || m.imdbID) !== String(identifier));
    const existingFavorites = safeParseJSON('ani_movie_favorites', []);
    const removedIndex = existingFavorites.findIndex(m => String(m.id || m.imdbID) === String(identifier));
    if (removedIndex > -1) {
        const removedMovie = existingFavorites[removedIndex]; // <-- локальна змінна
        existingFavorites.splice(removedIndex, 1);
        favorites = existingFavorites;
        localStorage.setItem('ani_movie_favorites', JSON.stringify(favorites));
        updateFavCount(); renderFavoritesList();

        const btn = document.getElementById(`fav-btn-${identifier}`);
        if(btn) { btn.innerHTML = "🤍"; btn.classList.remove('text-pink-500'); btn.classList.add('text-white/30'); }

        showToast("🗑️ Фільм видалено", () => {
            favorites.push(removedMovie); // <-- замикання, не глобальна
            localStorage.setItem('ani_movie_favorites', JSON.stringify(favorites));
            updateFavCount();
            if(!document.getElementById('favoritesPanel').classList.contains('translate-x-full')) renderFavoritesList();
            const undoBtn = document.getElementById(`fav-btn-${removedMovie.id || removedMovie.imdbID}`);
            if (undoBtn) { undoBtn.innerHTML = "❤️"; undoBtn.classList.add('text-pink-500'); undoBtn.classList.remove('text-white/30'); }
            showToast("✨ Відновлено!");
        });
    }
}
```

Також видалити глобальну змінну `let lastRemovedFavorite = null;` (рядок 434).

- [ ] **Step 7: Санітизація innerHTML у showToast (AUD-001 — частково)**

Рядок 458:

```javascript
// БУЛО:
toast.innerHTML = `<span>${message}</span>`;

// СТАЛО:
toast.innerHTML = `<span>${escapeHtml(message)}</span>`;
```

- [ ] **Step 8: Санітизація innerHTML у renderFavoritesList та renderWatchedList (AUD-001)**

У `renderFavoritesList()` (рядок 516-527) — екранувати `m.title_ua`:

```javascript
// У шаблоні — замінити ${m.title_ua} на ${escapeHtml(m.title_ua)}
// і ${m.year} на ${escapeHtml(m.year)}
```

Аналогічно у `renderWatchedList()` (рядок 616-628).

- [ ] **Step 9: Санітизація в generateMovieCardHtml (AUD-001)**

У функції `generateMovieCardHtml()` (рядок 894-920) — екранувати `title`, `year`, `genre`:

```javascript
// Рядок 915:
<h3 class="...">${escapeHtml(title)}</h3>
// Рядок 916:
<div class="...">${escapeHtml(year)} • ${escapeHtml(genre)}</div>
// Рядок 910 (alt):
alt="${escapeHtml(title)}"
```

- [ ] **Step 10: Санітизація в openMovieModal та помилках (AUD-001)**

У `openMovieModal()` — екранувати `movie.title_ua`, `plot`, `details.genres`, та повідомлення помилки:

```javascript
// Рядок 998:
<p class="...">${escapeHtml(plot)}</p>

// Рядок 1228 (помилка):
<p class="...">${escapeHtml(err.message)}</p>
```

- [ ] **Step 11: Додати onerror для зображень (AUD-017)**

У `generateMovieCardHtml()` (рядок 910) — додати fallback при помилці завантаження:

```javascript
// БУЛО:
<img src="${poster}" alt="${escapeHtml(title)}" class="..." onload="this.classList.remove('opacity-0')">

// СТАЛО:
<img src="${poster}" alt="${escapeHtml(title)}" class="..." onload="this.classList.remove('opacity-0')" onerror="this.src='data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 400 600%22%3E%3Crect fill=%22%231e293b%22 width=%22400%22 height=%22600%22/%3E%3Ctext x=%2250%25%22 y=%2250%25%22 fill=%22%23475569%22 text-anchor=%22middle%22 font-size=%2248%22%3E🎬%3C/text%3E%3C/svg%3E'; this.classList.remove('opacity-0')">
```

Так само у `renderFavoritesList()` та `renderWatchedList()` для постерів.

- [ ] **Step 12: Обробник Escape для модалок (AUD-016)**

Додати в кінці блоку `<script>` (перед `</script>`):

```javascript
// --- Глобальний обробник клавіш ---
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        const videoModal = document.getElementById('videoModal');
        if (!videoModal.classList.contains('hidden')) { closeVideoModal(); return; }
        
        const movieModal = document.getElementById('movieModal');
        if (!movieModal.classList.contains('hidden')) { closeMovieModal(); return; }

        closeAllPanels();
    }
});
```

- [ ] **Step 13: Перевірити, що пасхалка з Філіпом працює**

Відкрити застосунок → ввести «бубочка» → натиснути «Створити мій вечір» → переконатися, що анімація працює як раніше.

---

## Task 2: Швидкі настрої — чіпси одним тапом

**Джерело:** Ідея №2 — Mood chips

**Files:**
- Modify: `index.html` — HTML секція форми (після рядка 343, перед textarea)
- Modify: `index.html` — JS блок (нова функція)

**Interfaces:**
- Produces: `searchByMood(mood)` — заповнює prompt і одразу запускає пошук
- Consumes: `searchForm.onsubmit` (існуюча логіка подачі форми)

---

- [ ] **Step 1: Додати HTML для чіпсів настрою**

Вставити ПЕРЕД блоком `<div class="space-y-3 relative">` з textarea (рядок 345):

```html
<!-- Швидкі настрої -->
<div class="flex flex-wrap gap-2 -mt-4 mb-2">
    <button type="button" onclick="searchByMood('Щось романтичне та ніжне для вечора удвох')" class="text-xs bg-pink-500/10 hover:bg-pink-500/20 text-pink-300 px-3 py-2 rounded-full border border-pink-500/20 active:scale-95 transition-all">🥰 Романтика</button>
    <button type="button" onclick="searchByMood('Легка весела комедія щоб посміятися від душі')" class="text-xs bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 px-3 py-2 rounded-full border border-amber-500/20 active:scale-95 transition-all">😂 Посміятися</button>
    <button type="button" onclick="searchByMood('Щось моторошне та напружене, тримає в напрузі')" class="text-xs bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-300 px-3 py-2 rounded-full border border-emerald-500/20 active:scale-95 transition-all">😱 Помочити нерви</button>
    <button type="button" onclick="searchByMood('Затишне, тепле кіно яке обіймає душу')" class="text-xs bg-orange-500/10 hover:bg-orange-500/20 text-orange-300 px-3 py-2 rounded-full border border-orange-500/20 active:scale-95 transition-all">☕ Затишно</button>
    <button type="button" onclick="searchByMood('Фантастика або фентезі з неймовірними світами')" class="text-xs bg-violet-500/10 hover:bg-violet-500/20 text-violet-300 px-3 py-2 rounded-full border border-violet-500/20 active:scale-95 transition-all">🚀 Пригоди</button>
    <button type="button" onclick="searchByMood('Глибоке, задумливе кіно зі змістом, після якого хочеться думати')" class="text-xs bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-300 px-3 py-2 rounded-full border border-cyan-500/20 active:scale-95 transition-all">🧠 Задумливе</button>
    <button type="button" onclick="searchByMood('Зворушлива емоційна історія, можна і поплакати')" class="text-xs bg-blue-500/10 hover:bg-blue-500/20 text-blue-300 px-3 py-2 rounded-full border border-blue-500/20 active:scale-95 transition-all">🥹 Поплакати</button>
</div>
```

- [ ] **Step 2: Додати функцію searchByMood**

Додати у `<script>` (після функції `feelLucky`, ~рядок 682):

```javascript
function searchByMood(mood) {
    const input = document.getElementById('promptInput');
    input.value = mood;
    // Імітуємо сабміт форми
    searchForm.dispatchEvent(new Event('submit', { cancelable: true }));
}
```

- [ ] **Step 3: Перевірити на мобільному viewport**

Відкрити на iPhone → чіпси повинні обтікати на 2-3 рядки → тапнути «🥰 Романтика» → пошук запускається без друкування.

---

## Task 3: «Завантажити ще» — розширення стрічки

**Джерело:** Ідея №1 — Load More

**Files:**
- Modify: `index.html` — JS: нові глобальні змінні стану пошуку
- Modify: `index.html` — JS: рефакторинг `searchForm.onsubmit` (виділення `performSearch`)
- Modify: `index.html` — JS: нова функція `loadMore()`
- Modify: `index.html` — JS: функція для рендерингу кнопки «Ще»

**Interfaces:**
- Produces: `performSearch(query, genre, minYear, maxYear, excludeIds, appendMode)` — основна функція пошуку, використовується як основним сабмітом так і Load More
- Produces: `loadMore()` — довантажує наступну порцію
- Produces: `renderLoadMoreButton()` → вставляє кнопку після сітки
- Consumes: `callGemini(prompt, systemPrompt, isJson)`, `generateMovieCardHtml(...)` (існуючі)

---

- [ ] **Step 1: Додати глобальний стан пошуку**

Додати після `window.currentSimilarMovies = [];` (рядок 393):

```javascript
// --- Стан пошуку для «Завантажити ще» ---
let currentSearchState = {
    query: '',
    genre: '',
    minYear: 1970,
    maxYear: 2026,
    shownTitles: [],  // назви вже показаних фільмів (для виключення при нових запитах)
    shownIds: [],     // TMDB ID вже показаних фільмів
    isLoadingMore: false
};
```

- [ ] **Step 2: Додати HTML-контейнер для кнопки «Ще»**

Після `<div id="resultsGrid" ...></div>` (рядок 369), додати:

```html
<div id="loadMoreContainer" class="hidden flex justify-center mt-10 mb-8">
    <button onclick="loadMore()" id="loadMoreBtn" class="group bg-white/5 hover:bg-white/10 border border-white/10 hover:border-pink-500/30 text-pink-200 px-8 py-4 rounded-full font-bold text-lg active:scale-95 transition-all flex items-center gap-3 shadow-lg hover:shadow-pink-500/10 disabled:opacity-50 disabled:cursor-not-allowed">
        <span class="group-hover:scale-110 transition-transform">✨</span>
        <span id="loadMoreText">Ще більше магії</span>
    </button>
</div>
```

- [ ] **Step 3: Виділити логіку пошуку у функцію performSearch**

Рефакторинг: витягти ядро з `searchForm.onsubmit` у нову функцію. Ця функція підтримує два режими: `appendMode=false` (новий пошук — очистити сітку) та `appendMode=true` (довантажити — додати до сітки).

```javascript
async function performSearch(query, genre, minYear, maxYear, excludeTitles = [], appendMode = false) {
    const submitBtn = document.getElementById('submitBtn');
    const loadMoreBtn = document.getElementById('loadMoreBtn');
    const loadMoreContainer = document.getElementById('loadMoreContainer');

    if (!appendMode) {
        // Новий пошук — повний лоадер
        const originalBtnHtml = submitBtn.innerHTML;
        submitBtn.disabled = true;
        submitBtn.innerHTML = `<span class="animate-spin inline-block">✨</span> <span>Магія в процесі...</span>`;

        resultsGrid.innerHTML = ""; loader.classList.remove('hidden'); loader.classList.add('flex');
        loadMoreContainer.classList.add('hidden');

        const loaderPhrases = ["Спілкуюсь із зірками ✨...", "Аналізую твій настрій 🧠...", "Готую віртуальний попкорн 🍿...", "Фільтрую те, що ти вже бачив(ла) 👀...", "Майже готово ❤️..."];
        let phraseIndex = 0; loaderText.textContent = loaderPhrases[0]; loaderText.style.opacity = 1;
        if (currentLoaderInterval) clearInterval(currentLoaderInterval);
        currentLoaderInterval = setInterval(() => { phraseIndex = (phraseIndex + 1) % loaderPhrases.length; loaderText.style.opacity = 0; setTimeout(() => { loaderText.textContent = loaderPhrases[phraseIndex]; loaderText.style.opacity = 1; }, 300); }, 3000);

        const targetY = loader.getBoundingClientRect().top + window.scrollY - 120;
        window.scrollTo({ top: targetY, behavior: 'smooth' });

        // Зберегти стан пошуку
        currentSearchState = { query, genre, minYear, maxYear, shownTitles: [], shownIds: [], isLoadingMore: false };

        var restoreBtn = () => { submitBtn.disabled = false; submitBtn.innerHTML = originalBtnHtml; };
    } else {
        // Load More — міні-лоадер на кнопці
        currentSearchState.isLoadingMore = true;
        loadMoreBtn.disabled = true;
        document.getElementById('loadMoreText').textContent = 'Шукаю ще...';
        var restoreBtn = () => {
            loadMoreBtn.disabled = false;
            document.getElementById('loadMoreText').textContent = 'Ще більше магії';
            currentSearchState.isLoadingMore = false;
        };
    }

    try {
        const excludeStr = currentSearchState.shownTitles.length > 0
            ? `\nНЕ ВКЛЮЧАЙ ці фільми (вже показані): ${currentSearchState.shownTitles.join(', ')}.`
            : '';

        const systemPrompt = `Ти - професійний кіноман. Поверни суворий JSON масив з 15 об'єктів. Схема: [{"title_en": "String", "title_ua": "String", "plot": "Опис сюжету обов'язково УКРАЇНСЬКОЮ мовою"}]. Нічого крім JSON.`;

        const rawResponse = await callGemini(
            `Запит: ${query}. Жанр: ${genre}. Роки: ${minYear} - ${maxYear}.${excludeStr}`,
            systemPrompt, true
        );

        let moviesList = [];
        try { moviesList = JSON.parse(rawResponse); }
        catch (e) { throw new Error("Зірки сьогодні говорять загадками. Спробуй перефразувати запит!"); }

        if (!moviesList || moviesList.length === 0) throw new Error("empty");

        if (!appendMode) {
            if (currentLoaderInterval) clearInterval(currentLoaderInterval);
            loader.classList.add('hidden'); loader.classList.remove('flex');
        }

        // Скелетони: для нового пошуку — замінити все, для Load More — додати в кінець
        const skeletonCount = 8;
        const skeletonHtml = Array(skeletonCount).fill(createSkeletonCard()).join('');

        if (appendMode) {
            resultsGrid.insertAdjacentHTML('beforeend', skeletonHtml);
        } else {
            resultsGrid.innerHTML = skeletonHtml;
        }

        const allGridChildren = Array.from(resultsGrid.children);
        const skeletonCards = allGridChildren.slice(-skeletonCount); // останні N — скелетони
        const startIndex = allGridChildren.length - skeletonCount;

        const finalFetchedMovies = [];
        let displayedCount = 0;

        for (let i = 0; i < moviesList.length; i++) {
            if (displayedCount >= 8) break;
            const m = moviesList[i];
            try {
                // Перевірка дублікатів за назвою
                if (currentSearchState.shownTitles.includes(m.title_en)) continue;

                const searchRes = await fetch(`https://api.themoviedb.org/3/search/movie?api_key=${TMDB_KEY}&query=${encodeURIComponent(m.title_en)}&language=uk-UA`);
                const searchData = await searchRes.json();

                if (searchData.results?.length > 0) {
                    const tmdbMovie = searchData.results[0];

                    // Пропустити переглянуті та вже показані
                    if (watchedMovies.some(w => w.id == tmdbMovie.id)) continue;
                    if (currentSearchState.shownIds.includes(tmdbMovie.id)) continue;

                    const detailsRes = await fetch(`https://api.themoviedb.org/3/movie/${tmdbMovie.id}?api_key=${TMDB_KEY}&language=uk-UA`);
                    const data = await detailsRes.json();

                    const releaseYear = data.release_date ? data.release_date.split('-')[0] : 'N/A';
                    const posterUrl = data.poster_path ? `${TMDB_IMAGE_BASE}${data.poster_path}` : 'https://via.placeholder.com/400x600/1e293b/475569?text=' + encodeURIComponent(m.title_ua);
                    const firstGenre = data.genres?.length > 0 ? data.genres[0].name : 'Кіно';
                    const rating = data.vote_average?.toFixed(1) || 'N/A';
                    const finalPlot = (data.overview && data.overview.trim().length > 10) ? data.overview : m.plot;

                    const movieObjForStore = { id: data.id, title_ua: m.title_ua, title_en: m.title_en, year: releaseYear, genre: firstGenre, poster: posterUrl, plot: finalPlot, rating: rating };
                    movieDataStore[data.id] = movieObjForStore;
                    finalFetchedMovies.push(movieObjForStore);

                    // Зберегти в стан (для виключення в наступних Load More)
                    currentSearchState.shownTitles.push(m.title_en);
                    currentSearchState.shownIds.push(data.id);

                    const isFav = favorites.some(fav => (fav.id || fav.imdbID) == data.id);
                    const isWatched = false; // вже відфільтровано
                    const storageStr = encodeURIComponent(JSON.stringify({ id: data.id, title_ua: m.title_ua, title_en: m.title_en, year: releaseYear, poster: posterUrl }));

                    const cardHtml = generateMovieCardHtml(data.id, startIndex + displayedCount, m.title_ua, releaseYear, firstGenre, posterUrl, rating, storageStr, isFav, isWatched);
                    if (skeletonCards[displayedCount]) skeletonCards[displayedCount].outerHTML = cardHtml;
                    displayedCount++;
                }
            } catch (err) { console.error(err); }
        }

        // Видалити зайві скелетони
        for (let i = displayedCount; i < skeletonCards.length; i++) {
            if (skeletonCards[i] && skeletonCards[i].parentNode) skeletonCards[i].remove();
        }

        if (!appendMode && displayedCount === 0) {
            resultsGrid.innerHTML = `
                <div class="col-span-full flex flex-col items-center justify-center py-16 px-4 animate-in fade-in zoom-in-95 duration-500">
                    <div class="text-7xl mb-4 text-center">🤯🎬</div>
                    <h3 class="text-3xl md:text-4xl gradient-text font-bold mb-4 text-center leading-tight">Оце так кіноман!</h3>
                    <p class="text-slate-300 text-center max-w-md mb-2">Ти вже бачив(ла) абсолютно всі фільми, які зараз спали на думку зіркам.</p>
                    <p class="text-slate-500 text-sm mb-8 text-center italic">Спробуй змінити жанр або написати щось інше в запиті.</p>
                </div>`;
            loadMoreContainer.classList.add('hidden');
        } else if (displayedCount > 0) {
            // Зберегти всі показані результати
            const allShownMovies = appendMode
                ? [...safeParseJSON('ani_last_results', []), ...finalFetchedMovies]
                : finalFetchedMovies;
            localStorage.setItem('ani_last_results', JSON.stringify(allShownMovies));

            // Показати кнопку «Ще»
            loadMoreContainer.classList.remove('hidden');
        } else if (appendMode && displayedCount === 0) {
            showToast("Зірки вичерпали ідеї на цю тему ✨");
            loadMoreContainer.classList.add('hidden');
        }

        restoreBtn();
    } catch (err) {
        if (currentLoaderInterval) clearInterval(currentLoaderInterval);
        loader.classList.add('hidden'); loader.classList.remove('flex');
        restoreBtn();

        if (!appendMode) {
            if (err.message === "empty") {
                resultsGrid.innerHTML = `
                    <div class="col-span-full flex flex-col items-center justify-center py-16 px-4 animate-in fade-in zoom-in-95 duration-500">
                        <div class="text-7xl mb-4 text-center">🍿🕵️‍♀️</div>
                        <h3 class="text-3xl md:text-4xl gradient-text font-bold mb-4 text-center leading-tight">Схоже, ми зайшли в глухий кут</h3>
                        <p class="text-slate-300 text-center max-w-md mb-2">Зірки трохи розгубились і не знайшли ідеального фільму за цим запитом.</p>
                        <p class="text-slate-500 text-sm mb-8 text-center italic">Підказка: спробуй написати щось на кшталт "щось затишне на вечір" або "динамічний бойовик".</p>
                        <button onclick="focusInputAndScroll()" class="bg-gradient-to-r from-indigo-500 to-pink-500 text-white hover:scale-105 active:scale-95 px-8 py-4 rounded-full font-bold transition-all shadow-lg shadow-pink-500/25 flex items-center gap-2">
                            <span>🔍</span> Повернутись до пошуку
                        </button>
                    </div>`;
            } else {
                resultsGrid.innerHTML = `<div class="col-span-full text-center py-20 px-4"><div class="text-6xl mb-6">⚠️</div><p class="text-xl text-red-400 mb-4 font-bold">Ой-ой, виникла помилка</p><p class="text-slate-400 mb-8">${escapeHtml(err.message)}</p><button onclick="focusInputAndScroll()" class="bg-white/10 text-white active:scale-95 hover:bg-white/20 px-8 py-4 rounded-full font-bold transition-all border border-white/20">Спробувати ще раз</button></div>`;
            }
        } else {
            showToast("Не вдалося завантажити ще. Спробуй ще раз!");
        }
        document.getElementById('loadMoreContainer').classList.add('hidden');
    }
}
```

- [ ] **Step 4: Функція loadMore**

```javascript
function loadMore() {
    if (currentSearchState.isLoadingMore) return;
    performSearch(
        currentSearchState.query,
        currentSearchState.genre,
        currentSearchState.minYear,
        currentSearchState.maxYear,
        currentSearchState.shownTitles,
        true // appendMode
    );
}
```

- [ ] **Step 5: Переписати searchForm.onsubmit**

Замінити весь існуючий `searchForm.onsubmit` (рядки 1098-1231) на тонку обгортку:

```javascript
searchForm.onsubmit = async (e) => {
    e.preventDefault();
    const promptInput = document.getElementById('promptInput');
    const promptValue = promptInput.value.trim();
    if (!promptValue) { promptInput.classList.remove('shake'); void promptInput.offsetWidth; promptInput.classList.add('shake'); showToast("✨ Розкажи мені свій настрій"); return; }
    if (['філіп', 'філя', 'бубочка'].some(word => promptValue.toLowerCase().includes(word))) { triggerFrenchieEasterEgg(); return; }

    const genre = document.getElementById('genreSelect').value;
    if (genre) localStorage.setItem('ani_movie_last_genre', genre);

    await performSearch(promptValue, genre, minYearInput.value, maxYearInput.value, [], false);
};
```

- [ ] **Step 6: Перевірити повний потік**

1. Ввести запит → отримати 8 фільмів → з'являється кнопка «Ще більше магії»
2. Натиснути «Ще» → під існуючими картками з'являються скелетони → потім 8 нових фільмів
3. Натиснути «Ще» ще раз → фільми не повторюються
4. Перевірити, що пасхалка з Філіпом все ще працює

---

## Task 4: Фільм дня

**Джерело:** Ідея №3 — Movie of the Day

**Files:**
- Modify: `index.html` — HTML: секція перед формою пошуку
- Modify: `index.html` — JS: функція `loadMovieOfTheDay()`

**Interfaces:**
- Produces: `loadMovieOfTheDay()` — завантажує і рендерить рекомендацію дня
- Consumes: `callGemini(...)`, `escapeHtml(...)`, `openMovieModal(...)`, TMDB API

---

- [ ] **Step 1: Додати HTML-контейнер для фільму дня**

Вставити всередині `<main>`, ПЕРЕД секцією форми (перед рядком 308):

```html
<!-- Фільм дня -->
<div id="movieOfTheDay" class="hidden mb-10 animate-in fade-in duration-700">
    <div class="bg-gradient-to-r from-pink-500/10 via-indigo-500/10 to-pink-500/10 border border-pink-500/20 rounded-[2rem] p-6 md:p-8 shadow-2xl backdrop-blur-md relative overflow-hidden cursor-pointer group" id="motdCard">
        <div class="absolute top-4 right-4 md:top-6 md:right-6 text-[10px] uppercase tracking-widest text-pink-400/70 font-bold">✨ Рекомендація дня</div>
        <div class="flex gap-6 items-center">
            <img id="motdPoster" src="" alt="" class="w-20 h-30 md:w-28 md:h-42 rounded-xl object-cover shadow-lg border border-white/10 opacity-0 transition-opacity duration-700 flex-shrink-0" onload="this.classList.remove('opacity-0')">
            <div class="flex-grow min-w-0">
                <h3 id="motdTitle" class="text-xl md:text-2xl font-bold text-white mb-2 leading-tight"></h3>
                <p id="motdMeta" class="text-xs text-pink-300/70 mb-3"></p>
                <p id="motdPlot" class="text-sm text-slate-300/80 line-clamp-2 md:line-clamp-3"></p>
            </div>
        </div>
    </div>
</div>
```

- [ ] **Step 2: Додати CSS для line-clamp**

В блок `<style>` додати:

```css
.line-clamp-2 { display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
.line-clamp-3 { display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; }
```

- [ ] **Step 3: Реалізувати loadMovieOfTheDay**

Додати в `<script>`:

```javascript
async function loadMovieOfTheDay() {
    const today = new Date().toISOString().split('T')[0]; // "2026-10-02"
    const cacheKey = 'ani_motd';
    const cached = safeParseJSON(cacheKey, null);

    // Використати кеш, якщо це той самий день
    if (cached && cached.date === today && cached.movie) {
        renderMovieOfTheDay(cached.movie);
        return;
    }

    try {
        // Визначити «настрій дня» за днем тижня та порою року
        const dayOfWeek = new Date().getDay(); // 0=Нд, 5=Пт, 6=Сб
        const month = new Date().getMonth(); // 0-11
        
        const dayMoods = [
            'затишна душевна драма для неділі',           // Нд
            'енергійний мотиваційний фільм на початок тижня', // Пн
            'цікавий трилер або детектив',                 // Вт
            'фантастика або фентезі з магією',            // Ср
            'хороша комедія для настрою',                  // Чт
            'легкий романтичний фільм для п\'ятниці',     // Пт
            'кінохіт або класика для суботнього вечора'    // Сб
        ];

        const seasonHints = ['зимовий', 'весняний', 'літній', 'осінній'];
        const season = seasonHints[Math.floor(month / 3) % 4];

        const prompt = `Порекомендуй ОДИН чудовий ${season} фільм: ${dayMoods[dayOfWeek]}. Фільм має бути відомий та з високим рейтингом. Поверни JSON: {"title_en": "...", "title_ua": "...", "why": "Одне коротке речення УКРАЇНСЬКОЮ чому його варто подивитися сьогодні"}`;

        const raw = await callGemini(prompt, 'Ти - кращий друг Ані, допомагаєш їй вибрати фільм. Поверни ТІЛЬКИ JSON.', true);
        const suggestion = JSON.parse(raw);

        // Знайти в TMDB
        const searchRes = await fetch(`https://api.themoviedb.org/3/search/movie?api_key=${TMDB_KEY}&query=${encodeURIComponent(suggestion.title_en)}&language=uk-UA`);
        const searchData = await searchRes.json();

        if (searchData.results?.length > 0) {
            const tmdb = searchData.results[0];
            const detailsRes = await fetch(`https://api.themoviedb.org/3/movie/${tmdb.id}?api_key=${TMDB_KEY}&language=uk-UA`);
            const data = await detailsRes.json();

            const movie = {
                id: data.id,
                title_ua: suggestion.title_ua || data.title,
                title_en: suggestion.title_en,
                year: data.release_date ? data.release_date.split('-')[0] : '',
                poster: data.poster_path ? `${TMDB_IMAGE_BASE}${data.poster_path}` : null,
                genre: data.genres?.[0]?.name || '',
                rating: data.vote_average?.toFixed(1) || '',
                plot: data.overview || '',
                why: suggestion.why || ''
            };

            movieDataStore[movie.id] = movie;
            localStorage.setItem(cacheKey, JSON.stringify({ date: today, movie }));
            renderMovieOfTheDay(movie);
        }
    } catch (e) {
        console.error('Movie of the Day failed:', e);
        // Не показуємо помилку — секція просто залишається прихованою
    }
}

function renderMovieOfTheDay(movie) {
    const container = document.getElementById('movieOfTheDay');
    document.getElementById('motdPoster').src = movie.poster || '';
    document.getElementById('motdPoster').alt = escapeHtml(movie.title_ua);
    document.getElementById('motdTitle').textContent = movie.title_ua;
    document.getElementById('motdMeta').textContent = `${movie.year} • ${movie.genre} • ⭐ ${movie.rating}`;
    document.getElementById('motdPlot').textContent = movie.why || movie.plot;
    document.getElementById('motdCard').onclick = () => openMovieModal(movie.id);
    container.classList.remove('hidden');
}

// Запустити при завантаженні (тільки якщо є API-ключ)
if (CURRENT_API_KEY) {
    loadMovieOfTheDay();
}
```

- [ ] **Step 4: Перевірити**

Перезавантажити сторінку → над формою з'являється «Рекомендація дня» → натиснути на неї → відкривається модалка з деталями → перезавантажити ще раз → фільм той самий (з кешу, без нового API-запиту).

---

## Task 5: «Кроляча нора» — ланцюгове відкриття

**Джерело:** Ідея №4 — Rabbit Hole chain browsing

**Files:**
- Modify: `index.html` — JS: рефакторинг `renderSimilarMovies()`

**Interfaces:**
- Modifies: `renderSimilarMovies()` — замість заміни сітки, додає новий блок під існуючими картками з заголовком
- Consumes: `window.currentSimilarMovies`, `generateMovieCardHtml(...)`, TMDB API

---

- [ ] **Step 1: Переписати renderSimilarMovies — додавання замість заміни**

Замінити всю функцію `renderSimilarMovies()` (рядки 1053-1094):

```javascript
async function renderSimilarMovies() {
    const sourceMovie = movieDataStore[Object.keys(movieDataStore).find(k => {
        const m = movieDataStore[k];
        return window.currentSimilarMovies.some(s => s.id !== m.id);
    })] || {};
    
    // Отримати назву фільму з модалки
    const modalTitle = document.querySelector('#movieModalContent h2, #movieModalContent img[alt]');
    const sourceName = modalTitle?.textContent || modalTitle?.alt || 'цей фільм';

    closeMovieModal();
    const similar = window.currentSimilarMovies.slice(0, 8);
    if (!similar || similar.length === 0) return;

    // Сховати кнопку «Ще» — схожі фільми це інший контекст
    document.getElementById('loadMoreContainer').classList.add('hidden');

    // Додати заголовок-розділювач
    const separator = document.createElement('div');
    separator.className = 'col-span-full mt-8 mb-2 animate-in fade-in slide-in-from-bottom-4 duration-500';
    separator.innerHTML = `
        <div class="flex items-center gap-3 px-2">
            <div class="h-px flex-grow bg-gradient-to-r from-transparent via-indigo-500/30 to-transparent"></div>
            <span class="text-sm text-indigo-300/70 font-medium whitespace-nowrap">🕸️ Схожі на «${escapeHtml(sourceName)}»</span>
            <div class="h-px flex-grow bg-gradient-to-r from-transparent via-indigo-500/30 to-transparent"></div>
        </div>`;
    resultsGrid.appendChild(separator);

    // Скелетони для нової порції
    const skeletonElements = [];
    for (let i = 0; i < similar.length; i++) {
        const skeleton = document.createElement('div');
        skeleton.innerHTML = createSkeletonCard();
        const el = skeleton.firstElementChild;
        resultsGrid.appendChild(el);
        skeletonElements.push(el);
    }

    const targetY = separator.getBoundingClientRect().top + window.scrollY - 120;
    window.scrollTo({ top: targetY, behavior: 'smooth' });

    const fetchedSimilarMovies = [];
    for (let i = 0; i < similar.length; i++) {
        const data = similar[i];
        try {
            const res = await fetch(`https://api.themoviedb.org/3/movie/${data.id}?api_key=${TMDB_KEY}&language=uk-UA`);
            const detailedData = await res.json();
            const releaseYear = detailedData.release_date ? detailedData.release_date.split('-')[0] : 'N/A';
            const posterUrl = detailedData.poster_path ? `${TMDB_IMAGE_BASE}${detailedData.poster_path}` : 'https://via.placeholder.com/400x600/1e293b/475569?text=' + encodeURIComponent(detailedData.title);
            const firstGenre = detailedData.genres?.length > 0 ? detailedData.genres[0].name : 'Кіно';
            const rating = detailedData.vote_average?.toFixed(1) || 'N/A';

            const movieObjForStore = { id: detailedData.id, title_ua: detailedData.title, title_en: detailedData.original_title, year: releaseYear, genre: firstGenre, poster: posterUrl, plot: detailedData.overview, rating: rating };
            movieDataStore[detailedData.id] = movieObjForStore;
            fetchedSimilarMovies.push(movieObjForStore);

            const isFav = favorites.some(fav => (fav.id || fav.imdbID) == detailedData.id);
            const isWatched = watchedMovies.some(w => (w.id || w.imdbID) == detailedData.id);
            const storageStr = encodeURIComponent(JSON.stringify({ id: detailedData.id, title_ua: detailedData.title, title_en: detailedData.original_title, year: releaseYear, poster: posterUrl }));

            const cardHtml = generateMovieCardHtml(detailedData.id, i, detailedData.title, releaseYear, firstGenre, posterUrl, rating, storageStr, isFav, isWatched);
            if (skeletonElements[i]) skeletonElements[i].outerHTML = cardHtml;
        } catch(e) {
            if (skeletonElements[i]) skeletonElements[i].remove();
        }
    }
}
```

- [ ] **Step 2: Перевірити ланцюг**

1. Пошук → отримати фільми → клік на картку → модалка → «Схожі»
2. Під основними картками з'являється роздільник «Схожі на X» + нові картки
3. Клік на одну з нових → модалка → «Схожі» → ще один рівень ланцюга

---

## Task 6: Рулетка «Обери за мене»

**Джерело:** Ідея №6 — Movie Roulette

**Files:**
- Modify: `index.html` — CSS: анімація рулетки
- Modify: `index.html` — HTML: кнопка рулетки
- Modify: `index.html` — JS: функція `spinRoulette()`

**Interfaces:**
- Produces: `spinRoulette()` — випадковий вибір з показаних фільмів з анімацією

---

- [ ] **Step 1: Додати CSS для анімації рулетки**

В блок `<style>` додати:

```css
@keyframes roulettePulse {
    0%, 100% { box-shadow: 0 0 0 0 rgba(244, 114, 182, 0); border-color: rgba(255,255,255,0.05); }
    50% { box-shadow: 0 0 30px 10px rgba(244, 114, 182, 0.4); border-color: rgba(244, 114, 182, 0.7); }
}
.roulette-highlight { animation: roulettePulse 0.15s ease-in-out; }
.roulette-winner {
    animation: roulettePulse 0.5s ease-in-out 3;
    box-shadow: 0 0 40px 15px rgba(244, 114, 182, 0.5) !important;
    border-color: rgba(244, 114, 182, 0.8) !important;
    z-index: 30 !important;
    transform: scale(1.05);
}
```

- [ ] **Step 2: Додати кнопку рулетки**

Кнопка з'являється поруч з «Ще більше магії». Модифікувати `loadMoreContainer` (з Task 3):

```html
<div id="loadMoreContainer" class="hidden flex flex-wrap justify-center gap-4 mt-10 mb-8">
    <button onclick="loadMore()" id="loadMoreBtn" class="group bg-white/5 hover:bg-white/10 border border-white/10 hover:border-pink-500/30 text-pink-200 px-8 py-4 rounded-full font-bold text-lg active:scale-95 transition-all flex items-center gap-3 shadow-lg hover:shadow-pink-500/10 disabled:opacity-50 disabled:cursor-not-allowed">
        <span class="group-hover:scale-110 transition-transform">✨</span>
        <span id="loadMoreText">Ще більше магії</span>
    </button>
    <button onclick="spinRoulette()" id="rouletteBtn" class="group bg-white/5 hover:bg-white/10 border border-white/10 hover:border-amber-500/30 text-amber-200 px-8 py-4 rounded-full font-bold text-lg active:scale-95 transition-all flex items-center gap-3 shadow-lg hover:shadow-amber-500/10">
        <span class="group-hover:animate-spin transition-transform">🎰</span>
        <span>Обери за мене</span>
    </button>
</div>
```

- [ ] **Step 3: Реалізувати spinRoulette**

```javascript
function spinRoulette() {
    const cards = Array.from(resultsGrid.querySelectorAll('.movie-card'));
    if (cards.length === 0) { showToast("Спочатку знайди фільми ✨"); return; }

    // Прибрати попередні виділення
    cards.forEach(c => c.classList.remove('roulette-winner', 'roulette-highlight'));

    const totalSteps = 20 + Math.floor(Math.random() * 10); // 20-30 кроків
    const winnerIndex = Math.floor(Math.random() * cards.length);
    let step = 0;
    let currentIndex = 0;

    // Скрол до сітки
    const targetY = resultsGrid.getBoundingClientRect().top + window.scrollY - 120;
    window.scrollTo({ top: targetY, behavior: 'smooth' });

    const interval = setInterval(() => {
        // Зняти виділення з попередньої
        cards.forEach(c => c.classList.remove('roulette-highlight'));

        // Підсвітити поточну
        cards[currentIndex].classList.add('roulette-highlight');

        step++;
        currentIndex = (currentIndex + 1) % cards.length;

        // Уповільнення під кінець
        if (step >= totalSteps) {
            clearInterval(interval);

            // Фінальне виділення переможця
            cards.forEach(c => c.classList.remove('roulette-highlight'));
            cards[winnerIndex].classList.add('roulette-winner');
            cards[winnerIndex].scrollIntoView({ behavior: 'smooth', block: 'center' });

            // Відкрити модалку через 2 секунди
            setTimeout(() => {
                const movieId = cards[winnerIndex].id.replace('movie-card-', '');
                openMovieModal(parseInt(movieId));
                setTimeout(() => cards[winnerIndex].classList.remove('roulette-winner'), 500);
            }, 2000);

            showToast("🎬 Сьогодні дивимось це!");
        }
    }, Math.max(50, 200 - step * 5)); // прискорення на початку, уповільнення в кінці
}
```

> **Примітка:** Інтервал фіксований, але уповільнення імітується через `totalSteps`. Для плавнішого ефекту можна використати рекурсивний `setTimeout` з зростаючою затримкою — це опціональне покращення.

- [ ] **Step 4: Перевірити**

Пошук → 8+ карток → «Обери за мене» → анімація перебору → одна картка підсвічується → через 2 сек відкривається модалка.

---

## Task 7: Персональна статистика

**Джерело:** Ідея №5 — Personal Stats

**Files:**
- Modify: `index.html` — HTML: секція статистики у watched-панелі
- Modify: `index.html` — JS: функція `renderWatchedStats()`

**Interfaces:**
- Produces: `renderWatchedStats()` → рендерить інфографіку у верхній частині watched-панелі
- Consumes: `watchedMovies` (глобальний масив), `escapeHtml()`

---

- [ ] **Step 1: Додати контейнер статистики у watched-панель**

У HTML, всередині `watchedPanel` (після заголовка, перед `watchedList`, ~рядок 262):

```html
<div id="watchedStats" class="px-6 pt-4 pb-2 hidden">
    <!-- Заповнюється через JS -->
</div>
```

- [ ] **Step 2: Реалізувати renderWatchedStats**

```javascript
function renderWatchedStats() {
    const container = document.getElementById('watchedStats');
    if (watchedMovies.length < 3) { container.classList.add('hidden'); return; }

    // Підрахунок жанрів
    const genreCounts = {};
    let totalRating = 0, ratingCount = 0;
    let oldestYear = 9999, newestYear = 0;

    watchedMovies.forEach(m => {
        if (m.genre) genreCounts[m.genre] = (genreCounts[m.genre] || 0) + 1;
        const r = parseFloat(m.rating);
        if (!isNaN(r) && r > 0) { totalRating += r; ratingCount++; }
        const y = parseInt(m.year);
        if (!isNaN(y)) { if (y < oldestYear) oldestYear = y; if (y > newestYear) newestYear = y; }
    });

    const topGenre = Object.entries(genreCounts).sort((a, b) => b[1] - a[1])[0];
    const avgRating = ratingCount > 0 ? (totalRating / ratingCount).toFixed(1) : '—';

    container.innerHTML = `
        <div class="grid grid-cols-2 gap-3 mb-3">
            <div class="bg-indigo-500/10 border border-indigo-500/20 rounded-xl p-3 text-center">
                <div class="text-2xl font-bold text-indigo-300">${watchedMovies.length}</div>
                <div class="text-[10px] text-indigo-300/60 uppercase tracking-wider">Переглянуто</div>
            </div>
            <div class="bg-pink-500/10 border border-pink-500/20 rounded-xl p-3 text-center">
                <div class="text-2xl font-bold text-pink-300">⭐ ${avgRating}</div>
                <div class="text-[10px] text-pink-300/60 uppercase tracking-wider">Середня оцінка</div>
            </div>
        </div>
        ${topGenre ? `<div class="text-xs text-slate-400 text-center mb-2">Улюблений жанр: <span class="text-indigo-300 font-medium">${escapeHtml(topGenre[0])}</span> (${topGenre[1]} фільмів)</div>` : ''}
        ${oldestYear < 9999 ? `<div class="text-[10px] text-slate-500 text-center">Від ${oldestYear} до ${newestYear}</div>` : ''}
    `;
    container.classList.remove('hidden');
}
```

- [ ] **Step 3: Викликати renderWatchedStats при відкритті панелі**

У функції `toggleWatchedPanel()` додати виклик після `renderWatchedList()`:

```javascript
// БУЛО:
panel.classList.remove('translate-x-full'); overlay.classList.remove('hidden'); renderWatchedList();

// СТАЛО:
panel.classList.remove('translate-x-full'); overlay.classList.remove('hidden'); renderWatchedList(); renderWatchedStats();
```

- [ ] **Step 4: Перевірити**

Додати 3+ фільми в переглянуті → відкрити панель 👀 → зверху видно: кількість, середню оцінку, улюблений жанр.

---

## Task 8: Сезонні підказки

**Джерело:** Ідея №7 — Seasonal/themed suggestions

**Files:**
- Modify: `index.html` — HTML: банер-підказка
- Modify: `index.html` — JS: логіка сезонного вибору

**Interfaces:**
- Produces: `showSeasonalBanner()` — показує банер, якщо є актуальна подія/сезон
- Consumes: `searchByMood()` (з Task 2)

---

- [ ] **Step 1: Додати контейнер банера**

Вставити всередині `<main>`, ПЕРЕД секцією «Фільм дня» (або перед формою, якщо Task 4 ще не реалізований):

```html
<!-- Сезонний банер -->
<div id="seasonalBanner" class="hidden mb-6 animate-in fade-in duration-500">
    <button id="seasonalBtn" class="w-full bg-gradient-to-r from-indigo-500/10 to-pink-500/10 hover:from-indigo-500/20 hover:to-pink-500/20 border border-white/10 hover:border-pink-500/20 rounded-2xl p-4 md:p-5 text-left active:scale-[0.99] transition-all flex items-center gap-4">
        <span id="seasonalEmoji" class="text-3xl md:text-4xl"></span>
        <div>
            <div id="seasonalTitle" class="text-sm md:text-base font-bold text-white"></div>
            <div id="seasonalSub" class="text-xs text-slate-400"></div>
        </div>
        <span class="text-pink-400/50 ml-auto text-xs">Натисни →</span>
    </button>
</div>
```

- [ ] **Step 2: Реалізувати showSeasonalBanner**

```javascript
function showSeasonalBanner() {
    const now = new Date();
    const month = now.getMonth() + 1; // 1-12
    const day = now.getDate();

    // Таблиця подій та сезонів
    const events = [
        { check: () => month === 2 && day >= 10 && day <= 14, emoji: '❤️', title: 'Фільми для закоханих', sub: 'Ідеально для Дня Валентина', mood: 'Найромантичніший фільм для вечора вдвох на День Валентина' },
        { check: () => month === 10 && day >= 20, emoji: '🎃', title: 'Хеллоуїн-настрій', sub: 'Час для моторошного кіно', mood: 'Моторошний атмосферний фільм для Хеллоуїн-вечора' },
        { check: () => month === 12 && day >= 15, emoji: '🎄', title: 'Різдвяна класика', sub: 'Найтепліші зимові фільми', mood: 'Затишний різдвяний або новорічний фільм для святкового настрою' },
        { check: () => month === 12 && day >= 28 || (month === 1 && day <= 3), emoji: '🎆', title: 'Новорічне кіно', sub: 'Фільми для новорічних канікул', mood: 'Фільм для новорічних канікул — щось святкове або легке' },
        { check: () => month === 3 && day === 8, emoji: '💐', title: 'До Дня жінок', sub: 'Фільми про сильних і чарівних', mood: 'Надихаючий фільм про сильну жінку яка змінює світ' },
        // Сезони (фолбек)
        { check: () => month >= 3 && month <= 5, emoji: '🌸', title: 'Весняний настрій', sub: 'Свіже, легке, надихаюче', mood: 'Легкий весняний фільм — щось свіже і надихаюче' },
        { check: () => month >= 6 && month <= 8, emoji: '☀️', title: 'Літнє кіно', sub: 'Пригоди, море, свобода', mood: 'Літній фільм з пригодами — море, подорожі, свобода' },
        { check: () => month >= 9 && month <= 11, emoji: '🍂', title: 'Осінній вайб', sub: 'Атмосферне, глибоке, затишне', mood: 'Атмосферний осінній фільм — кава, дощ, роздуми' },
        { check: () => month === 12 || month <= 2, emoji: '❄️', title: 'Зимова атмосфера', sub: 'Тепло всередині, холод за вікном', mood: 'Зимовий затишний фільм — ковдра, какао, сніг за вікном' },
    ];

    const event = events.find(e => e.check());
    if (!event) return;

    document.getElementById('seasonalEmoji').textContent = event.emoji;
    document.getElementById('seasonalTitle').textContent = event.title;
    document.getElementById('seasonalSub').textContent = event.sub;
    document.getElementById('seasonalBtn').onclick = () => searchByMood(event.mood);
    document.getElementById('seasonalBanner').classList.remove('hidden');
}

showSeasonalBanner();
```

- [ ] **Step 3: Перевірити**

На початку жовтня → повинен з'явитися банер «🍂 Осінній вайб» → тап → автоматичний пошук осінніх фільмів. Після 20 жовтня → «🎃 Хеллоуїн-настрій».

---

## Порядок виконання та залежності

```
Task 1 (Фундамент) ──► Task 2 (Mood Chips) ──► Task 3 (Load More)
                                                       │
                       Task 4 (Фільм дня)◄─────────────┤
                       Task 5 (Кроляча нора) ◄──────────┤
                       Task 6 (Рулетка) ◄───────────────┤
                       Task 7 (Статистика) ◄────────────┘
                       Task 8 (Сезонні) ── потребує Task 2 (searchByMood)
```

- **Task 1** — обов'язково першим (утиліти `escapeHtml`, `safeParseJSON` використовуються всюди)
- **Task 2** — другим (функція `searchByMood` використовується у Task 8)
- **Task 3** — третім (головна фіча, рефакторить основний пошук)
- **Tasks 4-8** — паралельні, в будь-якому порядку після Tasks 1-3
