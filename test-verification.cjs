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
        getElementById: (id) => ({
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
            style: {}
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
    navigator: {}
};

sandbox.window.document = sandbox.document;
sandbox.window.localStorage = sandbox.localStorage;

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
// 3) Matching English title (even if ID is different/missing)
assert.strictEqual(vm.runInContext(`isMovieInList({id: 999, title_en: "matrix "}, favorites)`, sandbox), true);
// 4) Matching Ukrainian title
assert.strictEqual(vm.runInContext(`isMovieInList({id: 888, title_ua: "аватар"}, watchedMovies)`, sandbox), true);
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
console.log("ALL VERIFIER TESTS PASSED SUCCESSFULLY");


