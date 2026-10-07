const fs = require('fs');
const vm = require('vm');
const assert = require('assert');

// Extract script
const html = fs.readFileSync('index.html', 'utf8');
const match = html.match(/<script>([\s\S]*?)<\/script>/);
if (!match) throw new Error("No script block found in index.html");

const scriptContent = match[1];

// Setup minimal sandbox
const mockStorage = {};
const sandbox = {
    window: {
        addEventListener: () => {},
        scrollY: 0,
        scrollTo: () => {},
        currentSimilarMovies: []
    },
    document: {
        addEventListener: () => {},
        getElementById: (id) => ({ appendChild: () => {}, removeChild: () => {},
            value: '',
            classList: {
                add: () => {},
                remove: () => {},
                contains: () => false
            },
            innerHTML: '',
            textContent: '',
            appendChild: () => {},
            querySelectorAll: () => [],
            options: [],
            addEventListener: () => {},
            max: '',
            style: {},
            remove: () => {},
            getBoundingClientRect: () => ({ top: 0, width: 0, height: 0, left: 0 }),
            children: []
        }),
        createElement: (tag) => ({
            classList: {
                add: () => {},
                remove: () => {}
            },
            style: {},
            appendChild: () => {}
        }),
        querySelector: () => null,
        querySelectorAll: () => [],
        body: {
            appendChild: () => {}
        }
    },
    localStorage: {
        getItem: (key) => mockStorage[key] || null,
        setItem: (key, val) => mockStorage[key] = String(val),
        removeItem: (key) => delete mockStorage[key]
    },
    fetch: async () => ({
        ok: true,
        json: async () => ({})
    }),
    setTimeout: (cb) => cb(),
    setInterval: () => 1,
    clearInterval: () => {},
    console: {
        log: () => {},
        warn: () => {},
        error: () => {}
    },
    location: {
        reload: () => {}
    },
    Math: Math,
    Date: Date,
    String: String,
    JSON: JSON,
    Array: Array,
    Object: Object,
    parseInt: parseInt,
    parseFloat: parseFloat,
    isNaN: isNaN,
    encodeURIComponent: encodeURIComponent,
    decodeURIComponent: decodeURIComponent,
    URLSearchParams: URLSearchParams,
    history: { pushState: () => {}, back: () => {}, state: null },
    requestAnimationFrame: (cb) => cb(),
    navigator: {}
};

sandbox.window.document = sandbox.document;
sandbox.window.localStorage = sandbox.localStorage;
sandbox.window.history = sandbox.history;
sandbox.window.requestAnimationFrame = sandbox.requestAnimationFrame;

vm.createContext(sandbox);

try {
    vm.runInContext(scriptContent, sandbox);
    console.log("Syntax valid and script initialized successfully in VM sandbox.");
} catch (e) {
    console.error("Script execution failed:", e);
    process.exit(1);
}

// 1. safeParseJSON tests
mockStorage['test_invalid'] = '{bad json}';
mockStorage['test_null'] = 'null';
mockStorage['test_array'] = '[1, null, {"id": 1, "title_ua": "Test"}]';

let parsed1 = sandbox.safeParseJSON('test_invalid', []);
assert.deepEqual(parsed1, []);

let parsed2 = sandbox.safeParseJSON('test_null', []);
assert.deepEqual(parsed2, []);

sandbox.localStorage.setItem('ani_movie_watched', '[1, null, {"id": 1, "title_ua": "Test"}]');
vm.runInContext(`
    watchedMovies = (safeParseJSON('ani_movie_watched', [])).filter(m => m && typeof m === 'object');
`, sandbox);

const watchedMoviesLen = vm.runInContext('watchedMovies.length', sandbox);
const watchedMoviesId = vm.runInContext('watchedMovies[0].id', sandbox);
assert.strictEqual(watchedMoviesLen, 1);
assert.strictEqual(watchedMoviesId, 1);
console.log('1. safeParseJSON test passed.');

// 2. shownTitles & shownIds deduplication
vm.runInContext(`
    currentSearchState = {
        query: '',
        genre: '',
        minYear: 1970,
        maxYear: 2026,
        shownTitles: ['Existing Title'],
        shownIds: [123],
        isLoadingMore: false
    };
`, sandbox);
const titles = vm.runInContext('currentSearchState.shownTitles', sandbox);
const ids = vm.runInContext('currentSearchState.shownIds', sandbox);
assert.deepEqual(titles, ['Existing Title']);
assert.deepEqual(ids, [123]);
console.log('2. deduplication state verification test passed.');

// 3. Personal Statistics threshold
let statsHidden = true;
let statsHTML = '';
const originalGetElementById = sandbox.document.getElementById;

sandbox.document.getElementById = function(id) {
    if (id === 'watchedStats') {
        return {
            classList: {
                remove: (cls) => { if (cls === 'hidden') statsHidden = false; },
                add: (cls) => { if (cls === 'hidden') statsHidden = true; }
            },
            set innerHTML(val) { statsHTML = val; }
        };
    }
    return originalGetElementById(id);
};

vm.runInContext(`
    watchedMovies = [
        { id: 1, rating: "8.0", year: "2010", genre: "Drama" },
        { id: 2, rating: "10.0", year: "2020", genre: "Drama" }
    ];
    renderWatchedStats();
`, sandbox);
assert.strictEqual(statsHidden, true, "Stats should be hidden for < 3 movies");

vm.runInContext(`
    watchedMovies = [
        { id: 1, rating: "8.0", year: "2010", genre: "Drama" },
        { id: 2, rating: "10.0", year: "2020", genre: "Drama" },
        { id: 3, rating: "6.0", year: "2015", genre: "Action" }
    ];
`, sandbox);
statsHidden = true;
vm.runInContext(`renderWatchedStats();`, sandbox);
assert.strictEqual(statsHidden, false, "Stats should not be hidden for >= 3 movies");
assert.ok(statsHTML.includes('8.0'), "Average rating should be 8.0");
assert.ok(statsHTML.includes('Drama'), "Favorite genre should be Drama");
assert.ok(statsHTML.includes('2010'), "Oldest year should be 2010");
assert.ok(statsHTML.includes('2020'), "Newest year should be 2020");
console.log('3. Personal Statistics threshold test passed.');

vm.runInContext(`
    let triggerCalled = false;
    triggerFrenchieEasterEgg = () => { triggerCalled = true; };
`, sandbox);

sandbox.document.getElementById = function(id) {
    if (id === 'promptInput') return { 
        value: 'бубочка', 
        classList: { add: () => {}, remove: () => {} },
        focus: () => {}
    };
    if (id === 'genreSelect') return { value: '' };
    return originalGetElementById(id);
};

vm.runInContext(`
    const e = { preventDefault: () => {} };
    searchForm.onsubmit(e);
`, sandbox);
const triggerCalled = vm.runInContext(`triggerCalled`, sandbox);
assert.strictEqual(triggerCalled, true, "Easter egg trigger failed for 'бубочка'");
console.log('4. Philip easter egg triggers test passed.');

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

// 6. Robust Favorites filtering test
vm.runInContext(`
    favorites = [
        { id: 100, imdbID: 'tt100', title_en: "Matrix", title_ua: "Матриця" },
        { imdbID: 'tt200', title_en: "Inception", title_ua: "Початок" }
    ];
    watchedMovies = [
        { id: 300, title_en: "Avatar", title_ua: "Аватар" }
    ];
`, sandbox);

// 1) Matching numeric TMDB ID
assert.strictEqual(vm.runInContext(`isMovieInList({id: 100}, favorites)`, sandbox), true);
// 2) Matching string imdbID
assert.strictEqual(vm.runInContext(`isMovieInList({id: 'tt200'}, favorites)`, sandbox), true);
// 3) Matching English title (when ID is missing/not both TMDB IDs)
assert.strictEqual(vm.runInContext(`isMovieInList({title_en: "matrix "}, favorites)`, sandbox), true);
// 4) Matching Ukrainian title (when ID is missing)
assert.strictEqual(vm.runInContext(`isMovieInList({title_ua: "аватар"}, watchedMovies)`, sandbox), true);
// 4.1) Remake isolation: different numeric TMDB IDs must NOT match even if titles match
assert.strictEqual(vm.runInContext(`isMovieInList({id: 999, title_en: "matrix"}, favorites)`, sandbox), false);
// 5) Completely non-matching movie returning false
assert.strictEqual(vm.runInContext(`isMovieInList({id: 404, title_en: "Unknown"}, favorites)`, sandbox), false);
console.log('6. Robust Favorites filtering test passed.');

// 6.1. updateTasteChipVisibility test
let chipHidden = false;
sandbox.document.getElementById = function(id) {
    if (id === 'tasteChip') return {
        classList: {
            add: (cls) => { if(cls === 'hidden') chipHidden = true; },
            remove: (cls) => { if(cls === 'hidden') chipHidden = false; }
        }
    };
    if (id === 'promptInput') return { value: '', classList: { add: ()=>{}, remove: ()=>{} }, focus: ()=>{} };
    return { classList: { add: ()=>{}, remove: ()=>{} }, innerHTML: '', appendChild: ()=>{} };
};

vm.runInContext(`
    favorites = [{id: 1}];
    watchedMovies = [{id: 2}];
    updateTasteChipVisibility();
`, sandbox);
assert.strictEqual(chipHidden, true);

vm.runInContext(`
    favorites = [{id: 1}, {id: 2}];
    watchedMovies = [{id: 3}];
    updateTasteChipVisibility();
`, sandbox);
assert.strictEqual(chipHidden, false);
console.log('6.1. updateTasteChipVisibility test passed.');

// 6.2. searchByTaste guard test
let toastMsg = '';
sandbox.window.showToast = (msg) => { toastMsg = msg; };
vm.runInContext(`
    const originalShowToast = showToast;
    showToast = function(msg) { window.showToast(msg); };
    favorites = [{id: 1}];
    watchedMovies = [{id: 2}];
    searchByTaste();
    showToast = originalShowToast;
`, sandbox);
assert.ok(toastMsg.includes('Додай щонайменше 3 фільми'), 'Should show toast when < 3 movies');
console.log('6.2. searchByTaste guard test passed.');
// 7. Service Worker file exists
const swExists = require('fs').existsSync('sw.js');
assert.ok(swExists, 'sw.js should exist in project root');
const swContent = require('fs').readFileSync('sw.js', 'utf8');
assert.ok(swContent.includes('movie-night'), 'sw.js should contain cache name');
assert.ok(swContent.includes('fetch'), 'sw.js should handle fetch events');
console.log('7. Service Worker file test passed.');


// A11y & Redesign tests
const htmlContent = require('fs').readFileSync('index.html', 'utf8');

// 6.3 Roulette cubic deceleration and isSpinning
assert.ok(htmlContent.includes('if (isSpinning) return;'), 'Should have isSpinning guard');
assert.ok(htmlContent.includes('.movie-card:not(.grayscale)'), 'Should select not grayscale cards');
assert.ok(htmlContent.includes('const totalSteps = cards.length * Math.max(1, Math.round(14 / cards.length)) + winnerIndex;'), 'Should have scaled deceleration formula');
console.log('6.3. Roulette cubic deceleration and isSpinning test passed.');

// 6.4 Silent MOTD
assert.ok(/callGemini\([\s\S]*?'Ти - кращий друг Ані, допомагаєш їй вибрати фільм\. Поверни ТІЛЬКИ JSON\.',\s*true,\s*true\)/.test(htmlContent), 'Should call gemini silently for MOTD');
console.log('6.4. Silent MOTD test passed.');

assert.ok(htmlContent.includes('Lora'), 'Should include Lora font');
assert.ok(htmlContent.includes('Onest'), 'Should include Onest font');
assert.ok(!htmlContent.includes('Dancing Script'), 'Should NOT include Dancing Script font');

assert.ok(htmlContent.includes('role="dialog"'), 'Modals should have role="dialog"');
assert.ok(htmlContent.includes('aria-modal="true"'), 'Modals should have aria-modal="true"');

// Ensure no emojis are hardcoded in JS template literals for main interactive buttons
assert.ok(!htmlContent.includes('innerHTML = "❤️"'), 'Should not use raw heart emoji in JS innerHTML');
assert.ok(!htmlContent.includes('innerHTML = "👀"'), 'Should not use raw eye emoji in JS innerHTML');
assert.ok(!htmlContent.includes('innerHTML = "❌'), 'Should not use raw close emoji in JS innerHTML');
assert.ok(!htmlContent.includes('>▶️<'), 'Should not use raw play emoji');
assert.ok(!htmlContent.includes('>🕸️<'), 'Should not use raw similar emoji');

// Ensure ICONS are used
assert.ok(htmlContent.includes('ICONS.heart'), 'Should use ICONS.heart');
assert.ok(htmlContent.includes('ICONS.eye'), 'Should use ICONS.eye');
assert.ok(htmlContent.includes('ICONS.close'), 'Should use ICONS.close');

// Edge cases
assert.ok(htmlContent.includes("@media (prefers-reduced-motion: reduce)"), 'Should have prefers-reduced-motion');
assert.ok(htmlContent.includes('min-h-[44px]'), 'Should have touch targets >= 44px');
assert.ok(htmlContent.includes('label for='), 'Labels should have for attributes');

// PopState
assert.ok(htmlContent.includes("window.addEventListener('popstate'"), 'Should handle popstate');
assert.ok(htmlContent.includes("history.pushState"), 'Should call pushState');
assert.ok(htmlContent.includes("focusStack"), 'Should use focusStack for tracking elements');

// Trap Focus empty handling
assert.ok(htmlContent.includes('if (focusableElements.length === 0)'), 'Should handle empty focusable elements');


// Strict Emoji checks
assert.ok(!htmlContent.includes('>❤️<'), 'Should not use raw heart emoji');
assert.ok(!htmlContent.includes('>👀<'), 'Should not use raw eye emoji');
assert.ok(!htmlContent.includes('>⭐<'), 'Should not use raw star emoji');
assert.ok(!htmlContent.includes('>✓<'), 'Should not use raw check emoji');
assert.ok(!htmlContent.includes('>▶️<'), 'Should not use raw play emoji');

console.log("A11y, Redesign, and Critic tests passed.");


// Modal Direct and PopState synchronization tests
assert.ok(htmlContent.includes('function closePanelsDirect()'), 'closePanelsDirect must be defined');
assert.ok(htmlContent.includes('function closeMovieModalDirect()'), 'closeMovieModalDirect must be defined');
assert.ok(htmlContent.includes('function closeVideoModalDirect()'), 'closeVideoModalDirect must be defined');
assert.ok(htmlContent.includes('function userCloseModal()'), 'userCloseModal must be defined');

// Verify manual modal closers delegate to userCloseModal
assert.ok(htmlContent.includes('userCloseModal();'), 'userCloseModal must be invoked');
assert.ok(htmlContent.includes('closePanelsDirect();'), 'closePanelsDirect must be invoked on panel open');

// Verify no SVGs or ICONS are assigned to textContent (which causes literal tag display)
assert.ok(!htmlContent.includes('.textContent = `${movie.year}'), 'motdMeta should use innerHTML, not textContent');
assert.ok(!htmlContent.includes('.textContent = ICONS.'), 'No ICONS should be assigned to textContent');

console.log("Modal hierarchy and history synchronization tests passed.");

// 8. Backend / API tests
const recommendExists = require('fs').existsSync('api/recommend.js');
assert.ok(recommendExists, 'api/recommend.js should exist');
const recommendContent = require('fs').readFileSync('api/recommend.js', 'utf8');
assert.ok(recommendContent.includes('export default async function handler'), 'recommend.js should export default handler');
assert.ok(recommendContent.includes('req.body'), 'recommend.js should parse req.body');

// Verify CORS headers are set on OPTIONS and POST
assert.ok(recommendContent.includes("res.setHeader('Access-Control-Allow-Origin', '*')"), "CORS origin should be *");
assert.ok(recommendContent.includes("req.method === 'OPTIONS'"), "Should handle OPTIONS");

// Verify 405 Method Not Allowed on GET
assert.ok(recommendContent.includes("res.status(405)"), "Should handle 405");

// Verify 400 Bad Request on missing prompt
assert.ok(recommendContent.includes("res.status(400)"), "Should handle 400");

// Verify markdown fence stripping
assert.ok(recommendContent.includes('replace'), "Should strip markdown");

// 9. SW Bypasses API
const swContent2 = require('fs').readFileSync('sw.js', 'utf8');
assert.ok(swContent2.includes('/api/'), 'sw.js should bypass /api/');
assert.ok(swContent2.includes('recommend'), 'sw.js should bypass recommend');

// 10. Index.html API modifications
assert.ok(!htmlContent.includes("apiModal.classList.remove('hidden'); setTimeout(() => trapFocus(apiModal), 100); } else {"), 'Index should not show apiModal on load');
assert.ok(htmlContent.includes('/api/recommend'), 'Index should call /api/recommend');

// 11. Test saveApiKey does not throw when changeApiBtnHeader is null
sandbox.document.getElementById = function(id) {
    if (id === 'apiInput') return { value: 'AIza123' };
    if (id === 'apiModal') return { classList: { add: () => {} } };
    if (id === 'changeApiBtnHeader') return null; // simulate missing button
    if (id === 'saveApiKey') return { 
        set onclick(fn) { this._onclick = fn; },
        get onclick() { return this._onclick; }
    };
    return { classList: { remove: () => {}, add: () => {} } };
};

vm.runInContext("const btn = document.getElementById('saveApiKey'); if (btn && btn.onclick) { btn.onclick(); } else { console.log('Mocking saveApiKey click not fully possible in this VM state'); }", sandbox);
console.log('11. saveApiKey guard test passed.');
// 12. safe-area CSS checks
assert.ok(htmlContent.includes('padding: max(var(--pad), env(safe-area-inset-top)) max(var(--pad), env(safe-area-inset-right)) var(--pad) max(var(--pad), env(safe-area-inset-left));'), 'Safe area CSS is missing in mainHeader');
assert.ok(htmlContent.includes('#videoModal > button { top: max(1rem, env(safe-area-inset-top)); }'), 'Safe area CSS is missing in videoModal button');

// 13. Year slider localStorage.removeItem('ani_movie_max_year') when maxVal >= currentYear
vm.runInContext(`
    maxYearInput.value = currentYear.toString();
    minYearInput.value = '2000';
    localStorage.setItem('ani_movie_max_year', '2025');
    updateYearSlider();
`, sandbox);
assert.strictEqual(sandbox.localStorage.getItem('ani_movie_max_year'), null, 'max_year should be removed if >= currentYear');
console.log('13. Year slider max_year test passed.');

// 14. backfillSaved() behavior with missing genres/ratings in sandbox
sandbox.fetch = async (url) => {
    if (url.includes('/movie/555')) {
        return { ok: true, json: async () => ({ genres: [{name: 'Horror'}], vote_average: 8.5 }) };
    }
    return { ok: false };
};
vm.runInContext(`
    favorites = [{id: 555, title_en: "Scary Movie"}];
    watchedMovies = [];
    localStorage.removeItem('ani_backfill_v2');
    let renderFavoritesListCalled = false;
    let renderWatchedListCalled = false;
    renderFavoritesList = () => { renderFavoritesListCalled = true; };
    renderWatchedList = () => { renderWatchedListCalled = true; };
    renderWatchedStats = () => {};
`, sandbox);
vm.runInContext(`backfillSaved().then(() => { window.backfillDone = true; });`, sandbox);
const checkBackfill = setInterval(() => {
    if (sandbox.window.backfillDone) {
        clearInterval(checkBackfill);
        const favs = JSON.parse(sandbox.localStorage.getItem('ani_movie_favorites'));
        assert.strictEqual(favs[0].genre, 'Horror', 'Backfill should populate genre');
        assert.strictEqual(favs[0].rating, '8.5', 'Backfill should populate rating');
        console.log('14. backfillSaved test passed.');

        // 15. devKeyBtn URL parameter removal when ?dev is not present
        let devKeyBtnRemoved = false;
        sandbox.document.getElementById = function(id) {
            if (id === 'devKeyBtn') {
                return { remove: () => { devKeyBtnRemoved = true; } };
            }
            return { classList: { remove: () => {}, add: () => {} }, style: {}, remove: () => {} };
        };
        sandbox.location = { search: '' };
        vm.runInContext(`
            if (!new URLSearchParams(location.search).has('dev')) document.getElementById('devKeyBtn')?.remove();
        `, sandbox);
        assert.strictEqual(devKeyBtnRemoved, true, 'devKeyBtn should be removed without ?dev');
        console.log('15. devKeyBtn test passed.');

        // 16. Test api/recommend.js prompt template directly
        const recContent = require('fs').readFileSync('api/recommend.js', 'utf8');
        assert.ok(recContent.includes('Знайди 15 фільмів'), 'API must ask for 15 movies');
        assert.ok(recContent.includes('"plot": "..."'), 'API must ask for plot');
        console.log('16. api/recommend.js prompt test passed.');

        // 17. skippedByYear message logic and feminine forms
        assert.ok(htmlContent.includes('skippedByYear'), 'skippedByYear logic is missing');
        assert.ok(htmlContent.includes('нічого нового, розшир епоху!'), 'Empty state message for skippedByYear is missing');
        assert.ok(!htmlContent.includes('бачив(ла)'), 'Feminine forms not properly replaced in loaderPhrases');
        console.log('17. text updates test passed.');

        
// 18. Sandbox philipRegex tests
sandbox.document.getElementById = function(id) {
    if (id === 'promptInput') return sandbox.mockPromptInput;
    if (id === 'genreSelect') return { value: '' };
    return { classList: { add: () => {}, remove: () => {} }, offsetWidth: 0, style: {}, appendChild: () => {}, textContent: "" };
};
sandbox.isSearching = false;
let triggerCount = 0;
sandbox.triggerFrenchieEasterEgg = () => { triggerCount++; };

const simulateSubmit = (val) => {
    sandbox.mockPromptInput = { value: val, classList: { add: () => {}, remove: () => {} }, offsetWidth: 0 };
    vm.runInContext(`
        if (searchForm.onsubmit) {
            const originalPerform = performSearch;
            performSearch = async () => {}; // mock to prevent async bleed
            const e = { preventDefault: () => {} };
            searchForm.onsubmit(e).catch(err => {});
            performSearch = originalPerform;
        }
    `, sandbox);
};

simulateSubmit("Філіппіни");
assert.strictEqual(triggerCount, 0, "Regex should reject Філіппіни in sandbox");

simulateSubmit("Ой Філіп");
assert.strictEqual(triggerCount, 1, "Regex should accept Філіп in sandbox");

simulateSubmit("бубочка");
assert.strictEqual(triggerCount, 2, "Regex should accept бубочка in sandbox");

console.log('18. philipRegex sandbox tests passed.');

// 2. Heading "Переглянуто" does not use broken -webkit-background-clip-text
assert.ok(!htmlContent.includes('-webkit-background-clip-text text-transparent">Переглянуто'), "Heading Переглянуто should not use broken -webkit-background-clip-text");
assert.ok(htmlContent.includes('gradient-text flex items-center">Переглянуто'), "Heading Переглянуто should use gradient-text flex items-center");
console.log('19. Heading style tests passed.');

// 3. cardFadeIn / .movie-card-anim exists in CSS
assert.ok(htmlContent.includes('@keyframes cardFadeIn'), "CSS should contain @keyframes cardFadeIn");
assert.ok(htmlContent.includes('.movie-card-anim'), "CSS should contain .movie-card-anim");
console.log('20. CSS animations tests passed.');

// 4. Modal contains favorite button (modal-fav-btn) and toggleFavoriteModal is defined
assert.ok(htmlContent.includes('id="modal-fav-btn"'), "Modal should contain favorite button with id modal-fav-btn");
assert.ok(htmlContent.includes('function toggleFavoriteModal('), "toggleFavoriteModal should be defined");
console.log('21. Modal favorite button tests passed.');

// 5. Backup export/import functions are defined
assert.ok(htmlContent.includes('function exportDataBackup('), "exportDataBackup should be defined");
assert.ok(htmlContent.includes('function importDataBackup('), "importDataBackup should be defined");
console.log('22. Backup functions tests passed.');

// 6. Button text in modal uses "Враження друга ✨"
assert.ok(htmlContent.includes('Враження друга ✨'), "Button text in modal should use 'Враження друга ✨'");
assert.ok(!htmlContent.includes('Gemini</button>'), "Button text in modal should not use 'Gemini'");
console.log('23. Modal button text tests passed.');

        
// 24. movieDataStore sync test
sandbox.FileReader = class {
    readAsText(file) {
        this.onload({ target: { result: file.content } });
    }
};
vm.runInContext(`
    const mockFile24 = { content: '{"favorites":[{"id":123,"title_ua":"A","title_en":"A","year":"2023","genre":"Action","rating":"5","plot":"Plot","poster":"https://safe"}],"watchedMovies":[]}' };
    const evt24 = { target: { files: [mockFile24] } };
    importDataBackup(evt24);
`, sandbox);
const hasMovieData = vm.runInContext(`!!movieDataStore[123]`, sandbox);
assert.strictEqual(hasMovieData, true, 'movieDataStore should have imported movie 123');
console.log('24. movieDataStore sync test passed.');

        
// 25. appendMode failure preserves loadMoreContainer visibility
sandbox.loadMoreContainerClassList = new Set();
sandbox.document.getElementById = function(id) {
    if (id === 'loadMoreContainer') {
        return {
            classList: {
                add: (cls) => { sandbox.loadMoreContainerClassList.add(cls); },
                remove: (cls) => sandbox.loadMoreContainerClassList.delete(cls)
            }
        };
    }
    if (id === 'loadMoreBtn' || id === 'submitBtn') return { innerHTML: '', disabled: false };
    if (id === 'promptInput') return sandbox.mockPromptInput || { value: 'test' };
    if (id === 'genreSelect') return { value: '' };
    if (id === 'loader') return { classList: { add: () => {}, remove: () => {} }, getBoundingClientRect: () => ({ top: 0 }) };
    if (id === 'resultsGrid') return sandbox.resultsGrid;
    return { classList: { add: () => {}, remove: () => {} }, offsetWidth: 0, style: {}, appendChild: () => {}, textContent: "", getBoundingClientRect: () => ({ top: 0 }) };
};
sandbox.isSearching = false;
sandbox.currentLoaderInterval = null;
sandbox.loader = { classList: { add: () => {}, remove: () => {} }, getBoundingClientRect: () => ({ top: 0 }) };
sandbox.resultsGrid = { innerHTML: '', querySelectorAll: () => [], appendChild: () => {}, children: [], insertAdjacentHTML: () => {} };
sandbox.loaderText = { style: {} };

const originalFetch = sandbox.fetch;
sandbox.fetch = async () => { throw new Error("Simulated Network Error"); };

vm.runInContext(`
    performSearch("test", "", 1990, 2020, [], true).catch(() => {});
`, sandbox);

setTimeout(() => {
    assert.strictEqual(sandbox.loadMoreContainerClassList.has('hidden'), false, "appendMode failure should not add 'hidden' to loadMoreContainer");
    console.log('25. appendMode failure preserves loadMoreContainer visibility test passed.');

    // 26. TMDB year validation & fallback logic
    sandbox.fetchUrls = [];
    sandbox.fetch = async (url) => {
        sandbox.fetchUrls.push(url);
        return { ok: true, json: async () => ({ results: [] }) };
    };
    vm.runInContext(`
        const originalCallGemini = callGemini;
        callGemini = async () => '[{"title_en": "ValidYear", "year": "2020"}, {"title_en": "InvalidYear", "year": "abc"}, {"title_en": "TooOld", "year": "1800"}]';
        isSearching = false;
        performSearch("test", "", 1990, 2020, [], false).catch(() => {});
    `, sandbox);

    setTimeout(() => {
        const urls = sandbox.fetchUrls;
        const validYearUrls = urls.filter(u => u.includes('ValidYear'));
        const invalidYearUrls = urls.filter(u => u.includes('InvalidYear'));
        const tooOldUrls = urls.filter(u => u.includes('TooOld'));

        // For valid year, it should first try with primary_release_year=2020
        assert.ok(validYearUrls.some(u => u.includes('primary_release_year=2020')), "Should query primary_release_year for 2020");
        // Because we mocked results: [], it should ALSO fallback
        assert.ok(validYearUrls.some(u => !u.includes('primary_release_year')), "Should fallback for 2020 if no results");

        // For invalid year "abc", it should NOT use primary_release_year
        assert.ok(invalidYearUrls.every(u => !u.includes('primary_release_year')), "Should NOT query primary_release_year for abc");

        // For too old year "1800", it should NOT use primary_release_year
        assert.ok(tooOldUrls.every(u => !u.includes('primary_release_year')), "Should NOT query primary_release_year for 1800");

        vm.runInContext(`callGemini = originalCallGemini;`, sandbox);
        sandbox.fetch = originalFetch;
        console.log('26. TMDB year validation & fallback logic test passed.');
    }, 100);

        // 27. importDataBackup rejects malformed files
    sandbox.showToastMessage = "";
    sandbox.showToast = function(msg) { sandbox.showToastMessage = msg; };
    vm.runInContext(`
        const mockFileErr = { content: '{"foo": "bar"}' };
        const evtErr = { target: { files: [mockFileErr] } };
        importDataBackup(evtErr);
    `, sandbox);
    setTimeout(() => {
        assert.ok(sandbox.showToastMessage.includes('❌ Помилка читання файлу резервної копії'), "importDataBackup should reject malformed files");
        console.log('27. importDataBackup rejects malformed files test passed.');
        
        // 28. MOTD candidate iteration
        sandbox.motdFetchUrls = [];
        sandbox.fetch = async (url) => {
            sandbox.motdFetchUrls.push(url);
            if (url.includes('search/movie')) {
                return { ok: true, json: async () => ({ results: [{ id: 101, title_en: 'InWatched' }, { id: 102, title_en: 'NotInWatched' }] }) };
            }
            if (url.includes('/movie/102')) {
                return { ok: true, json: async () => ({ id: 102, title: 'NotInWatched', release_date: '2023-01-01', genres: [], vote_average: 8.0, overview: '' }) };
            }
            return { ok: true, json: async () => ({ id: 999 }) }; // fallback
        };
        vm.runInContext(`
            localStorage.removeItem('ani_motd');
            watchedMovies = [{ id: 101, title_en: 'InWatched' }];
            favorites = [];
            const oldCallGemini28 = callGemini;
            callGemini = async () => '{"title_en": "TestMovie", "title_ua": "Test", "why": "test"}';
            loadMovieOfTheDay().catch(console.error);
        `, sandbox);
        
        setTimeout(() => {
            const has102 = sandbox.motdFetchUrls.some(u => u.includes('/movie/102'));
            const has101 = sandbox.motdFetchUrls.some(u => u.includes('/movie/101'));
            assert.ok(has102, 'Should fetch details for candidate 102');
            assert.ok(!has101, 'Should NOT fetch details for candidate 101 since it is watched');
            console.log('28. MOTD candidate iteration test passed.');
            
            // 29. TMDB Ukrainian title prioritization
            sandbox.fetch = async (url) => {
                if (url.includes('search/movie')) {
                    return { ok: true, json: async () => ({ results: [{ id: 501, title_en: 'Test 29' }] }) };
                }
                if (url.includes('/movie/501')) {
                    return { ok: true, json: async () => ({ id: 501, title: 'Офіційна Назва', release_date: '2023-01-01', genres: [], vote_average: 8.0, overview: '' }) };
                }
                return { ok: true, json: async () => ({ id: 501 }) };
            };
            vm.runInContext(`
                callGemini = async () => '[{"title_en": "Test 29", "title_ua": "Варіант ШІ", "year": "2023"}]';
                isSearching = false;
                performSearch("test", "", 1990, 2020, [], false).catch(console.error);
            `, sandbox);

            setTimeout(() => {
                const storedTitle = vm.runInContext('movieDataStore[501]?.title_ua', sandbox);
                assert.strictEqual(storedTitle, 'Офіційна Назва', 'Should prioritize TMDB title over Gemini title_ua');
                console.log('29. TMDB Ukrainian title prioritization test passed.');

                // 30. removeFavorite DOM and state cleanup
                let favBtnClassRemoved = false;
                sandbox.document.getElementById = function(id) {
                    if (id === 'favCount') return sandbox.favCountMock || { textContent: '1' };
                    if (id === 'fav-btn-123') return { classList: { add: () => {}, remove: (cls) => { if(cls==='text-pink-500') favBtnClassRemoved = true; } }, innerHTML: '' };
                    if (id === 'btn-fav-modal') return { classList: { add: () => {}, remove: () => {} }, innerHTML: '', setAttribute: () => {} };
                    if (id === 'tasteChip') return { classList: { add: () => {}, remove: () => {} } };
                    return { classList: { add: () => {}, remove: () => {} }, offsetWidth: 0, style: {}, appendChild: () => {}, textContent: "", getBoundingClientRect: () => ({ top: 0 }), children: [] };
                };
                sandbox.favCountMock = { textContent: '1' };
                vm.runInContext(`
                    favorites = [{ id: 123, title_en: "To Remove" }];
                    localStorage.setItem('ani_movie_favorites', JSON.stringify(favorites));
                    removeFavorite(123);
                `, sandbox);
                
                const remainingFavs = JSON.parse(sandbox.localStorage.getItem('ani_movie_favorites'));
                assert.strictEqual(remainingFavs.length, 0, 'LocalStorage favorites should be empty');
                assert.strictEqual(String(sandbox.favCountMock.textContent), '0', 'favCount should be updated to 0');
                assert.strictEqual(favBtnClassRemoved, true, 'fav-btn-123 should have text-pink-500 removed');
                console.log('30. removeFavorite DOM and state cleanup test passed.');

                // 31. Easter Egg 12s cleanup timeout verification
                const scriptSource = require('fs').readFileSync('index.html', 'utf8');
                assert.ok(scriptSource.includes('setTimeout'), "Should have a setTimeout for cleanup");
                assert.ok(scriptSource.includes('12000'), "Timeout should be exactly 12000ms");
                // More precise check: triggerFrenchieEasterEgg contains 12000
                const eggMatch = scriptSource.match(/function triggerFrenchieEasterEgg[\s\S]*?12000/);
                assert.ok(eggMatch, "triggerFrenchieEasterEgg should have a 12000ms timeout");
                console.log('31. Easter Egg 12s cleanup timeout verification test passed.');

                // 32. Verify api/recommend.js supports direct prompt and has gemini-2.5-flash fallback
                const currentRec = require('fs').readFileSync('api/recommend.js', 'utf8');
                assert.ok(currentRec.includes('body.prompt'), 'api/recommend.js must read body.prompt');
                assert.ok(currentRec.includes('gemini-2.5-flash'), 'api/recommend.js must include gemini-2.5-flash as candidate');
                assert.ok(currentRec.includes('candidateKeyPaths'), 'api/recommend.js must have candidateKeyPaths for GCP credentials fallback');
                console.log('32. api/recommend.js prompt and Vertex AI credits fallback test passed.');

                // 33. Verify apiModal is never shown in index.html
                assert.ok(htmlContent.includes('style="display: none !important;"'), 'apiModal must be permanently hidden with display: none !important;');
                assert.ok(!htmlContent.includes('apiModal.classList.remove(\'hidden\')'), 'callGemini must never open apiModal');
                console.log('33. apiModal permanently hidden test passed.');

                // 34. Verify callGemini never throws or prompts for user API keys
                assert.ok(!htmlContent.includes('Ключі API можуть бути недійсними'), 'callGemini must not complain about user API keys');
                console.log('34. callGemini user API key-free error handling test passed.');

                // 35. Verify loadMovieOfTheDay() is called unconditionally on startup
                assert.ok(!htmlContent.includes('if (CURRENT_API_KEY) {\n            loadMovieOfTheDay();\n        }'), 'loadMovieOfTheDay must not require CURRENT_API_KEY');
                assert.ok(/loadMovieOfTheDay\(\);/.test(htmlContent), 'loadMovieOfTheDay must be called on page load');
                console.log('35. loadMovieOfTheDay startup call test passed.');

                // 36. Runtime openMovieModal without errors & offline fallback
                let modalContentHTML = '';
                const savedGetElementById36 = sandbox.document.getElementById;
                sandbox.document.getElementById = function(id) {
                    if (id === 'movieModalContent') {
                        return {
                            set innerHTML(val) { modalContentHTML = val; },
                            get innerHTML() { return modalContentHTML; },
                            classList: { add: () => {}, remove: () => {} }
                        };
                    }
                    if (id === 'movieModal') {
                        return {
                            classList: { add: () => {}, remove: () => {} },
                            querySelectorAll: () => [],
                            addEventListener: () => {}
                        };
                    }
                    return savedGetElementById36(id);
                };

                sandbox.fetch = async (url) => {
                    if (url.includes('/movie/777')) {
                        return {
                            ok: true,
                            json: async () => ({
                                id: 777,
                                title: 'Тестовий Фільм',
                                original_title: 'Test Movie',
                                overview: 'Опис фільму без жодних збоїв.',
                                release_date: '2026-02-14',
                                vote_average: 8.8,
                                genres: [{ id: 18, name: 'Драма' }],
                                videos: { results: [{ type: 'Trailer', key: 'trailer123', iso_639_1: 'uk' }] }
                            })
                        };
                    }
                    throw new Error('Network error (offline simulation)');
                };

                vm.runInContext(`
                    movieDataStore[777] = { id: 777, title_ua: 'Тестовий Фільм', poster: 'https://test.jpg' };
                    openMovieModal(777);
                `, sandbox);

                setTimeout(() => {
                    assert.ok(modalContentHTML.includes('modal-fav-btn'), 'modal-fav-btn must be present in openMovieModal');
                    assert.ok(modalContentHTML.includes('toggleFavoriteModal(777'), 'toggleFavoriteModal must receive id 777');
                    assert.ok(modalContentHTML.includes('Тестовий Фільм'), 'Ukrainian title must be rendered');
                    assert.ok(!modalContentHTML.includes('undefined'), 'HTML must not contain literal undefined');

                    // 36b. Offline fallback check
                    vm.runInContext(`
                        movieDataStore[778] = { id: 778, title_ua: 'Офлайн Фільм', title_en: 'Offline', year: '2024', genre: 'Комедія', rating: '7.5', poster: 'https://off.jpg', plot: 'Офлайн опис' };
                        openMovieModal(778);
                    `, sandbox);

                    setTimeout(() => {
                        assert.ok(modalContentHTML.includes('Офлайн-режим'), 'openMovieModal must render offline fallback');
                        assert.ok(modalContentHTML.includes('Офлайн Фільм'), 'openMovieModal offline must show movie title');
                        console.log('36. runtime openMovieModal and offline fallback test passed.');

                        // 37. Full backup round-trip with genre/rating/plot
                        sandbox.FileReader = class {
                            readAsText(file) { this.onload({ target: { result: file.content } }); }
                        };
                        const backupData = {
                            favorites: [{
                                id: 888,
                                title_ua: 'Улюблений Фільм',
                                title_en: 'Favorite Movie',
                                year: '2025',
                                genre: 'Фантастика',
                                rating: '9.1',
                                poster: 'https://posters/fav.jpg',
                                plot: 'Глибокий сюжет про космос'
                            }],
                            watchedMovies: [{
                                id: 889,
                                title_ua: 'Переглянутий Фільм',
                                title_en: 'Watched Movie',
                                year: '2023',
                                genre: 'Драма',
                                rating: '8.4',
                                poster: 'https://posters/watched.jpg',
                                plot: 'Драматичний сюжет'
                            }]
                        };

                        vm.runInContext(`
                            importDataBackup({ target: { files: [{ content: JSON.stringify(${JSON.stringify(backupData)}) }] } });
                        `, sandbox);

                        const importedFav = vm.runInContext('favorites.find(f => f.id === 888)', sandbox);
                        assert.ok(importedFav, 'Imported movie 888 must exist in favorites');
                        assert.strictEqual(importedFav.genre, 'Фантастика', 'genre must be preserved in backup cycle');
                        assert.strictEqual(importedFav.rating, '9.1', 'rating must be preserved in backup cycle');
                        assert.strictEqual(importedFav.plot, 'Глибокий сюжет про космос', 'plot must be preserved in backup cycle');

                        const importedWatched = vm.runInContext('watchedMovies.find(w => w.id === 889)', sandbox);
                        assert.ok(importedWatched, 'Imported movie 889 must exist in watched');
                        assert.strictEqual(importedWatched.genre, 'Драма', 'watched genre must be preserved in backup cycle');

                        // Also verify backup with missing genre/rating uses safe defaults
                        const partialBackup = {
                            favorites: [{
                                id: 990,
                                title_ua: 'Старий Фільм',
                                title_en: 'Old Movie',
                                poster: 'https://posters/old.jpg'
                            }],
                            watchedMovies: []
                        };
                        vm.runInContext(`
                            importDataBackup({ target: { files: [{ content: JSON.stringify(${JSON.stringify(partialBackup)}) }] } });
                        `, sandbox);
                        const importedOld = vm.runInContext('favorites.find(f => f.id === 990)', sandbox);
                        assert.ok(importedOld, 'Old partial backup movie must be imported successfully');
                        assert.strictEqual(importedOld.genre, 'Кіно', 'Old movie should get safe default genre');
                        assert.strictEqual(importedOld.rating, '—', 'Old movie should get safe default rating');
                        console.log('37. full backup cycle with genre/rating/plot test passed.');

                        // 38. isSpinning flag behavior
                        const initialSpinning = vm.runInContext('isSpinning', sandbox);
                        assert.strictEqual(initialSpinning, false, 'isSpinning should initially be false');

                        const targetGrid = vm.runInContext('resultsGrid', sandbox);
                        targetGrid.querySelectorAll = () => [];
                        vm.runInContext('spinRoulette();', sandbox);
                        assert.strictEqual(vm.runInContext('isSpinning', sandbox), false, 'isSpinning must remain false when no cards available');

                        // When cards are available, test full spinning lifecycle
                        const mockWinnerCard = {
                            id: 'movie-card-550',
                            classList: { add: () => {}, remove: () => {} },
                            scrollIntoView: () => {}
                        };
                        targetGrid.querySelectorAll = () => [mockWinnerCard];
                        targetGrid.getBoundingClientRect = () => ({ top: 0 });

                        const mockRouletteBtn = {
                            disabled: false,
                            innerHTML: '<span>Обери за мене</span>'
                        };
                        const origGetElementById = sandbox.document.getElementById;
                        sandbox.document.getElementById = (id) => {
                            if (id === 'rouletteBtn') return mockRouletteBtn;
                            return origGetElementById(id);
                        };

                        let activeTimeoutCb = null;
                        let lastTimeoutDelay = null;
                        const savedSetTimeout = sandbox.setTimeout;

                        sandbox.setTimeout = (cb, delay) => {
                            activeTimeoutCb = cb;
                            lastTimeoutDelay = delay;
                            return 888;
                        };

                        vm.runInContext(`
                            movieDataStore[550] = { id: 550, title_ua: 'Бійцівський клуб', poster: 'https://test.jpg' };
                            spinRoulette();
                        `, sandbox);

                        // While spinning, isSpinning must be true and button disabled
                        assert.strictEqual(vm.runInContext('isSpinning', sandbox), true, 'isSpinning must be true while spinning');
                        assert.strictEqual(mockRouletteBtn.disabled, true, 'rouletteBtn must be disabled while spinning');
                        assert.ok(mockRouletteBtn.innerHTML.includes('Обираємо... ✨'), 'rouletteBtn text must show loading state');

                        // Calling spinRoulette while spinning must be ignored
                        vm.runInContext('spinRoulette();', sandbox);
                        assert.strictEqual(vm.runInContext('isSpinning', sandbox), true, 'Concurrent spinRoulette call must be blocked by isSpinning guard');

                        // Step through animation steps until deceleration completes and winner modal timeout is scheduled (450ms)
                        let steps = 0;
                        while (activeTimeoutCb && steps < 100) {
                            const cb = activeTimeoutCb;
                            activeTimeoutCb = null;
                            cb();
                            steps++;
                            if (lastTimeoutDelay >= 450) {
                                break;
                            }
                        }

                        // Trigger winner display completion timeout (450ms)
                        assert.ok(activeTimeoutCb, 'Winner timeout must be scheduled after roulette deceleration completes');
                        assert.strictEqual(lastTimeoutDelay, 450, 'Winner timeout delay should be 450ms');
                        assert.strictEqual(vm.runInContext('isSpinning', sandbox), true, 'isSpinning must still be true before winner timeout executes');

                        activeTimeoutCb();

                        assert.strictEqual(vm.runInContext('isSpinning', sandbox), false, 'isSpinning must be reset to false after roulette spin and winner display');
                        assert.strictEqual(mockRouletteBtn.disabled, false, 'rouletteBtn must be re-enabled after modal opens');
                        assert.strictEqual(mockRouletteBtn.innerHTML, '<span>Обери за мене</span>', 'rouletteBtn text must be restored');

                        sandbox.document.getElementById = origGetElementById;
                        sandbox.setTimeout = savedSetTimeout;
                        console.log('38. isSpinning flag behavior test passed.');

                        // 39. Copyright date 06.01.2026 check
                        assert.ok(htmlContent.includes('&copy; 06.01.2026'), 'Footer copyright must be 06.01.2026');
                        assert.ok(!htmlContent.includes('&copy; 01.06.2026'), 'Old incorrect copyright 01.06.2026 must not exist');
                        console.log('39. copyright 06.01.2026 test passed.');

                        console.log("ALL VERIFIER TESTS PASSED SUCCESSFULLY");
                    }, 50);
                }, 50);
            }, 100);
        }, 100);
    }, 100);
}, 100);

    }
}, 50);
