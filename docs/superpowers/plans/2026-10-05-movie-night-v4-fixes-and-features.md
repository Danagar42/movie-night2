# Movie Night v4: Критичні виправлення та нові функції

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Усунути критичні помилки пошуку, стану та UI (пункти 1–7 з аудиту), оптимізувати продуктивність та додати функції збереження в модалці й резервного копіювання списків.

**Architecture:** 
- Клієнтська частина у `index.html` (Vanilla JS, Tailwind CSS, TMDB API, LocalStorage PWA).
- Серверна функція у `api/recommend.js` (Vercel Serverless Function, Google Vertex AI SDK).
- Тестова валідація у `test-verification.cjs` (Node.js VM Sandbox, перевірка синтаксису, функцій фільтрації, регулярних виразів, селекторів та безпеки).

**Tech Stack:** HTML5, Tailwind CSS, Vanilla JavaScript (ES2022), TMDB API v3, Node.js (test runner), Service Worker.

**Spec:** Зауваження та ідеї користувацького аудиту (вечірній подарунок для Ані):
1. Виправлення невидимого заголовка «Переглянуто» (`-webkit-background-clip-text`).
2. Відновлення та збереження кнопки «Ще більше магії» після нового пошуку та перезавантаження.
3. Ізоляція обробки помилок у `performSearch`, щоб разова помилка не ховала рулетку та кнопку пагінації.
4. Розподіл причин порожнього пошуку (немає в TMDB vs вже бачені vs фільтр років) замість хибного «Оце так кіноман!».
5. Пошук TMDB за `primary_release_year` з фолбеком без року, та використання української назви з TMDB.
6. Захист «Рекомендації дня» (MOTD) від зникнення на добу при випадковому повторі.
7. Реалізація чистих CSS-анімацій появи карток замість непрацюючих класів `tailwindcss-animate`.
8. Оптимізація та точність пасхалки з Філіпом (регулярний вираз для цілих слів, зменшення кількості елементів до 18, узгодження таймерів).
9. Кнопка «Зберегти ❤️» безпосередньо всередині модалки фільму.
10. Резервне копіювання списків (Експорт/Імпорт JSON) для захисту від очищення браузера.
11. Дружній неймінг кнопки штучного інтелекту («Враження друга ✨» замість «Gemini»).

## Global Constraints
- Не ламати PWA та офлайн-роботу через `sw.js`.
- Зберігати стилістику: палітра темно-синього з рожево-золотим акцентом, шрифти Lora + Onest.
- Зберігати персональну спрямованість («для Ані», жіночий рід у сповіщеннях та підказках).
- Усі нові зміни мають проходити перевірку `node test-verification.cjs`.

---

### Task 1: Виправлення заголовка «Переглянуто» та заміна непрацюючих класів анімацій

**Files:**
- Modify: `index.html:318-328` (заголовок панелі "Переглянуто")
- Modify: `index.html:250-285` (CSS стилі анімацій у `<style>`)
- Modify: `index.html:1385-1410` (класи карток фільмів)
- Test: `test-verification.cjs`

**Interfaces:**
- Consumes: CSS клас `.gradient-text`, HTML розмітка `watchedPanel`.
- Produces: Працюючий градієнтний заголовок та плавна CSS-анімація `cardFadeIn` без зовнішніх бібліотек.

- [ ] **Step 1: Оновити заголовок панелі «Переглянуто» в `index.html`**

Замінити класи на [рядку 320](file:///d:/Розробка/movie-night/index.html#L320):
```html
<!-- Було: -->
<h2 class="text-2xl font-bold bg-gradient-to-r from-indigo-400 to-cyan-400 -webkit-background-clip-text text-transparent">Переглянуто ...</h2>

<!-- Стало: -->
<h2 class="text-2xl font-bold gradient-text flex items-center">Переглянуто <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="inline-block ml-2 text-indigo-400"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"></path><circle cx="12" cy="12" r="3"></circle></svg></h2>
```

- [ ] **Step 2: Додати чисту CSS-анімацію появи карток у `<style>`**

У блоці `<style>` замінити класи `animate-in` на нативні `@keyframes cardFadeIn`:
```css
@keyframes cardFadeIn {
    from {
        opacity: 0;
        transform: translateY(16px) scale(0.97);
    }
    to {
        opacity: 1;
        transform: translateY(0) scale(1);
    }
}

.movie-card-anim {
    animation: cardFadeIn 0.45s cubic-bezier(0.16, 1, 0.3, 1) both;
}
```

- [ ] **Step 3: Застосувати `.movie-card-anim` у `generateMovieCardHtml`**

У функції `generateMovieCardHtml` замінити непрацюючі класи `animate-in fade-in zoom-in-95 duration-500` на `movie-card-anim`.

- [ ] **Step 4: Запустити валідатор**

Run: `node test-verification.cjs`
Expected: `ALL VERIFIER TESTS PASSED SUCCESSFULLY`

---

### Task 2: Збереження стану пошуку, «Ще більше магії» та динамічний рік

**Files:**
- Modify: `index.html:655-667` (`currentSearchState` ініціалізація)
- Modify: `index.html:1208-1215` (дефолтний maxYear)
- Modify: `index.html:1410-1426` (`renderSavedResults`)
- Modify: `index.html:1608-1648` (`performSearch` початкова ініціалізація)
- Modify: `index.html:1785-1825` (`performSearch` обробка помилок та завершення)
- Test: `test-verification.cjs`

**Interfaces:**
- Consumes: `localStorage.getItem('ani_search_state')`, `new Date().getFullYear()`.
- Produces: Відновлення можливості підвантаження результатів після F5 або повторного пошуку.

- [ ] **Step 1: Прибрати хардкод 2026 року у `currentSearchState` та промптах**

Замінити `2026` на динамічний `currentYear` (який вже оголошено на рядку 1120).
У `callGemini`: `payload.maxYear || currentYear`.

- [ ] **Step 2: Зберігати та відновлювати `currentSearchState`**

При успішному завершенні пошуку в `performSearch`:
```javascript
localStorage.setItem('ani_search_state', JSON.stringify(currentSearchState));
```

У `renderSavedResults`:
```javascript
const savedState = safeParseJSON('ani_search_state', null);
if (savedState && savedState.query) {
    currentSearchState = savedState;
    document.getElementById('loadMoreContainer').classList.remove('hidden');
    document.getElementById('loadMoreBtn').classList.remove('hidden');
} else {
    document.getElementById('loadMoreContainer').classList.remove('hidden');
    document.getElementById('loadMoreBtn').classList.add('hidden');
}
```

- [ ] **Step 3: Не ховати весь контейнер при помилці «Завантажити ще»**

У `catch (err)` функції `performSearch`:
```javascript
if (!appendMode) {
    loadMoreContainer.classList.add('hidden');
} else {
    showToast("Не вдалося завантажити ще. Спробуй ще раз!");
}
```

- [ ] **Step 4: Запустити валідатор**

Run: `node test-verification.cjs`
Expected: PASS

---

### Task 3: Підвищення точності TMDB, українські назви та інформативні порожні стани

**Files:**
- Modify: `index.html:1680-1765` (TMDB пошук та підбір деталей)
- Modify: `index.html:1765-1790` (порожні стани)
- Test: `test-verification.cjs`

**Interfaces:**
- Consumes: TMDB `/search/movie` з `primary_release_year`, TMDB `/movie/{id}` з українською назвою.
- Produces: Точні результати без випадкових омонімів/ремейків, коректний український переклад, адресні повідомлення про порожній стан.

- [ ] **Step 1: Реалізувати двохетапний пошук TMDB (з роком, потім без року як фолбек)**

```javascript
async function searchTmdbWithYearFallback(titleEn, year) {
    let url = `https://api.themoviedb.org/3/search/movie?api_key=${TMDB_KEY}&query=${encodeURIComponent(titleEn)}&language=uk-UA`;
    const yNum = parseInt(year, 10);
    if (!isNaN(yNum) && yNum > 1900) {
        try {
            const res = await fetch(`${url}&primary_release_year=${yNum}`);
            if (res.ok) {
                const data = await res.json();
                if (data.results && data.results.length > 0) return data;
            }
        } catch (_) {}
    }
    const fallbackRes = await fetch(url);
    return fallbackRes.ok ? await fallbackRes.json() : { results: [] };
}
```

- [ ] **Step 2: Брати офіційну українську назву з TMDB `data.title`, якщо вона доступна**

```javascript
const finalTitleUa = (data.title && data.title.trim()) || m.title_ua || m.title_en;
```

- [ ] **Step 3: Розділити лічильники причин відсутності результатів**

Ввести окремі лічильники:
- `filteredAlreadySeen`: відкинуті, бо вже в `watchedMovies` або `favorites`.
- `filteredByYear`: не потрапили в обраний користувачкою діапазон років.
- `filteredTmdbNotFound`: TMDB не зміг знайти фільм з такою назвою.
- `tmdbErrorsCount`: мережеві помилки TMDB.

Відображати відповідний екран:
1. Якщо більшість відкинуто через `filteredByYear` -> показувати «У ${minYear}–${maxYear} нічого нового, розшир епоху!».
2. Якщо більшість `filteredAlreadySeen` -> показувати «Оце так кіноман! Ти вже бачила все, що запропонували зірки».
3. Якщо `filteredTmdbNotFound` чи порожньо від AI -> «Схоже, ми зайшли в глухий кут. Зірки підібрали занадто рідкісні варіанти, спробуй змінити настрій або жанр».

- [ ] **Step 4: Перевірка через тест**

Run: `node test-verification.cjs`
Expected: PASS

---

### Task 4: Виправлення пасхалки Філіпа, оптимізація скролу та очищення коду

**Files:**
- Modify: `index.html:1297-1365` (`triggerFrenchieEasterEgg`)
- Modify: `index.html:890-915` (`removeFavorite`)
- Modify: `index.html:1960-1970` (`spinRoulette`)
- Modify: `index.html:2030-2040` (перевірка пасхалки у формі)
- Test: `test-verification.cjs`

**Interfaces:**
- Consumes: `promptValue`.
- Produces: Точне спрацьовування тільки на цілі слова «філіп», «філя», «бубочка» без хибних спрацьовувань на «філіппіни».

- [ ] **Step 1: Замінити `.includes()` на Regex з межами слів**

У `searchForm.onsubmit`:
```javascript
const philipRegex = /(^|[^\p{L}])(філіп|філя|бубочка)([^\p{L}]|$)/iu;
if (philipRegex.test(promptValue)) {
    triggerFrenchieEasterEgg();
    return;
}
```

- [ ] **Step 2: Оптимізувати анімацію пасхалки**

Зменшити `numberOfDogs` з 40 до 18, а час видалення елементів узгодити з максимальною тривалістю анімації:
```javascript
const numberOfDogs = 18;
// ...
setTimeout(() => el.remove(), 12000);
```

- [ ] **Step 3: Очистити логіку `removeFavorite`**

Прибрати дублювання фільтрації:
```javascript
function removeFavorite(identifier) {
    const existingFavorites = safeParseJSON('ani_movie_favorites', []);
    const removedIndex = existingFavorites.findIndex(m => String(m.id || m.imdbID) === String(identifier));
    if (removedIndex > -1) {
        const removedMovie = existingFavorites.splice(removedIndex, 1)[0];
        favorites = existingFavorites;
        localStorage.setItem('ani_movie_favorites', JSON.stringify(favorites));
        updateFavCount();
        renderFavoritesList();

        const btn = document.getElementById(`fav-btn-${identifier}`);
        if (btn) {
            btn.innerHTML = ICONS.heart(false);
            btn.classList.remove('text-pink-500');
            btn.classList.add('text-white/30');
        }

        showToast("🗑️ Фільм видалено", () => {
            favorites.push(removedMovie);
            localStorage.setItem('ani_movie_favorites', JSON.stringify(favorites));
            updateFavCount();
            if (!document.getElementById('favoritesPanel').classList.contains('translate-x-full')) renderFavoritesList();
            const undoBtn = document.getElementById(`fav-btn-${removedMovie.id || removedMovie.imdbID}`);
            if (undoBtn) {
                undoBtn.innerHTML = ICONS.heart(true);
                undoBtn.classList.add('text-pink-500');
                undoBtn.classList.remove('text-white/30');
            }
            showToast("✨ Відновлено!");
        });
    }
}
```

- [ ] **Step 4: Уточнити повідомлення рулетки, коли всі картки переглянуті**

У `spinRoulette`:
```javascript
const allCards = Array.from(resultsGrid.querySelectorAll('.movie-card'));
const unreadCards = allCards.filter(c => !c.classList.contains('grayscale'));
if (allCards.length > 0 && unreadCards.length === 0) {
    showToast("Всі знайдені фільми вже переглянуті! Завантаж ще магії або почни новий пошук ✨");
    return;
}
if (unreadCards.length === 0) {
    showToast("Спочатку знайди фільми ✨");
    return;
}
```

- [ ] **Step 5: Запустити тести**

Run: `node test-verification.cjs`
Expected: PASS

---

### Task 5: Стійкість «Рекомендації дня» (MOTD)

**Files:**
- Modify: `index.html:1840-1920` (`loadMovieOfTheDay`)
- Test: `test-verification.cjs`

**Interfaces:**
- Consumes: Повний список відомих назв `allKnownTitles`, TMDB search.
- Produces: Гарантована рекомендація дня без блокування на добу через випадковий збіг.

- [ ] **Step 1: Передавати у запит MOTD ширший список виключень**

```javascript
const allKnownTitles = [...new Set([
    ...favorites.map(m => m.title_en || m.title_ua),
    ...watchedMovies.map(m => m.title_en || m.title_ua)
])].filter(Boolean).slice(0, 50);
```

- [ ] **Step 2: Додати спробу вибрати альтернативний результат з TMDB при збігу**

Якщо перший результат уже в переглянутих або обраному, перевірити інші результати з `searchData.results`:
```javascript
let tmdb = searchData.results.find(candidate => 
    !isMovieInList(candidate, watchedMovies) && 
    !isMovieInList(candidate, favorites)
);
```
Лише якщо жоден кандидат не підходить, зробити одноразовий повторний запит без кешування `null` на 24 години (кешувати тільки успішну рекомендацію).

- [ ] **Step 3: Запустити тести**

Run: `node test-verification.cjs`
Expected: PASS

---

### Task 6: Кнопка «Зберегти ❤️» безпосередньо в модалці фільму

**Files:**
- Modify: `index.html:1500-1515` (`modalButtons` у `openMovieModal`)
- Modify: `index.html:840-865` (`toggleFavorite` синхронізація з модалкою)
- Test: `test-verification.cjs`

**Interfaces:**
- Consumes: `openMovieModal(id)`, об'єкт фільму з `movieDataStore`.
- Produces: Кнопка збереження в деталях фільму, синхронізована з карткою в сітці.

- [ ] **Step 1: Додати кнопку «Зберегти» в `modalButtons`**

У функції `openMovieModal`:
```javascript
const isFavModal = favorites.some(fav => (fav.id || fav.imdbID) == movie.id);
const favBtnClass = isFavModal 
    ? "bg-pink-500/20 text-pink-300 border-pink-500/40" 
    : "bg-white/5 text-slate-300 hover:text-pink-300 border-white/10 hover:border-pink-500/30";
const favBtnText = isFavModal ? `${ICONS.heart(true)} Збережено` : `${ICONS.heart(false)} Зберегти`;

// У розмітку modalButtons додати:
<button onclick="toggleFavoriteModal(${movie.id}, '${storageStr}')" id="modal-fav-btn" class="${favBtnClass} px-6 py-3 rounded-full font-bold active:scale-95 transition-all border flex items-center gap-2">
    ${favBtnText}
</button>
```

- [ ] **Step 2: Створити функцію `toggleFavoriteModal`**

```javascript
function toggleFavoriteModal(id, movieStr) {
    const cardBtn = document.getElementById(`fav-btn-${id}`);
    toggleFavorite(cardBtn || { innerHTML: '', classList: { add: ()=>{}, remove: ()=>{} } }, movieStr);
    
    const isF = favorites.some(f => (f.id || f.imdbID) == id);
    const modalBtn = document.getElementById('modal-fav-btn');
    if (modalBtn) {
        modalBtn.innerHTML = isF ? `${ICONS.heart(true)} Збережено` : `${ICONS.heart(false)} Зберегти`;
        modalBtn.className = (isF ? "bg-pink-500/20 text-pink-300 border-pink-500/40" : "bg-white/5 text-slate-300 hover:text-pink-300 border-white/10 hover:border-pink-500/30") + " px-6 py-3 rounded-full font-bold active:scale-95 transition-all border flex items-center gap-2";
    }
}
```

- [ ] **Step 3: Запустити тести**

Run: `node test-verification.cjs`
Expected: PASS

---

### Task 7: Резервне копіювання списків (Експорт / Імпорт JSON)

**Files:**
- Modify: `index.html:485-502` (футер сторінки)
- Modify: `index.html:2000-2050` (функції експорту/імпорту)
- Test: `test-verification.cjs`

**Interfaces:**
- Consumes: `favorites`, `watchedMovies`, `localStorage`.
- Produces: Завантаження `.json` файлу та безпечне відновлення через `FileReader`.

- [ ] **Step 1: Додати кнопки експорту/імпорту у футер**

Поряд з копірайтом додати компактний блок:
```html
<div class="flex items-center gap-3 text-xs text-slate-500">
    <button onclick="exportDataBackup()" class="hover:text-pink-300 transition-colors flex items-center gap-1 bg-white/5 hover:bg-white/10 px-3 py-1.5 rounded-lg border border-white/5">
        <span>💾</span> Зберегти копію
    </button>
    <span>•</span>
    <label class="hover:text-pink-300 transition-colors cursor-pointer flex items-center gap-1 bg-white/5 hover:bg-white/10 px-3 py-1.5 rounded-lg border border-white/5">
        <span>📥</span> Відновити копію
        <input type="file" id="importBackupInput" accept=".json" class="hidden" onchange="importDataBackup(event)">
    </label>
</div>
```

- [ ] **Step 2: Реалізувати функції `exportDataBackup` та `importDataBackup`**

```javascript
function exportDataBackup() {
    const backup = {
        version: 1,
        exportedAt: new Date().toISOString(),
        favorites: favorites,
        watched: watchedMovies
    };
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `movie-night-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showToast("💾 Резервну копію збережено!");
}

function importDataBackup(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
        try {
            const data = JSON.parse(e.target.result);
            if (!data || (!Array.isArray(data.favorites) && !Array.isArray(data.watched))) {
                throw new Error("Невірний формат файлу");
            }
            if (Array.isArray(data.favorites)) {
                favorites = data.favorites;
                localStorage.setItem('ani_movie_favorites', JSON.stringify(favorites));
                updateFavCount();
                renderFavoritesList();
            }
            if (Array.isArray(data.watched)) {
                watchedMovies = data.watched;
                localStorage.setItem('ani_movie_watched', JSON.stringify(watchedMovies));
                updateWatchedCount();
                renderWatchedList();
                renderWatchedStats();
            }
            showToast("✨ Списки успішно відновлено!");
        } catch (err) {
            showToast("❌ Помилка читання файлу резервної копії");
        }
    };
    reader.readAsText(file);
    event.target.value = '';
}
```

- [ ] **Step 3: Запустити тести**

Run: `node test-verification.cjs`
Expected: PASS

---

### Task 8: Оновлення підписів («Враження друга ✨») та розширення тестів

**Files:**
- Modify: `index.html:1510` (кнопка AI в модалці)
- Modify: `test-verification.cjs` (додавання перевірок для нових функцій)
- Test: `test-verification.cjs`

**Interfaces:**
- Consumes: `openMovieModal`, `test-verification.cjs`.
- Produces: Зрозуміла назва кнопки та 100% покриття тестами.

- [ ] **Step 1: Змінити назву кнопки Gemini на «Враження друга ✨»**

У `index.html` на рядку 1510 замінити текст:
```html
<!-- Було: -->
<span>...</span> Gemini</button>

<!-- Стало: -->
<span>...</span> Враження друга ✨</button>
```

- [ ] **Step 2: Додати тести в `test-verification.cjs`**

Додати перевірки для:
1. `philipRegex` з валідацією `Філіппіни` (повинно бути `false`) та `Філіп` (повинно бути `true`).
2. Наявності кнопок `exportDataBackup` та `importDataBackup`.
3. Наявності кнопки збереження в модалці (`modal-fav-btn`).
4. Наявності класу `.movie-card-anim`.
5. Відсутності `-webkit-background-clip-text` у чистих утилітах Tailwind.

- [ ] **Step 3: Запустити фінальну валідацію**

Run: `node test-verification.cjs`
Expected: ALL VERIFIER TESTS PASSED SUCCESSFULLY

---
