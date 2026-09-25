/**
 * Mirip Laravel APP_DEBUG:
 * - production / tauri build → selalu false (fitur debug tidak masuk UI)
 * - development (webpack serve / tauri dev) → default true
 * - override: localStorage `garudabot.debug` = 'true' | 'false' (hanya di development)
 *
 * `__GARUDABOT_APP_DEBUG__` di-inject webpack (true hanya saat webpack serve).
 */

const STORAGE_KEY = 'garudabot.debug';

const readStoredOverride = () => {
    if (typeof localStorage === 'undefined') return null;
    try {
        const v = localStorage.getItem(STORAGE_KEY);
        if (v === '1' || v === 'true') return true;
        if (v === '0' || v === 'false') return false;
    } catch (e) { /* ignore */ }
    return null;
};

/**
 * @returns {boolean}
 */
export const isAppDebug = () => {
    // Compile-time: false di `npm run build` / tauri build → selalu OFF
    if (!__GARUDABOT_APP_DEBUG__) {
        return false;
    }
    const stored = readStoredOverride();
    if (stored !== null) {
        return stored;
    }
    return true;
};

/**
 * Toggle runtime (hanya bermakna di development).
 * @param {boolean} enabled
 */
export const setAppDebug = enabled => {
    if (typeof localStorage === 'undefined') return;
    try {
        localStorage.setItem(STORAGE_KEY, enabled ? 'true' : 'false');
    } catch (e) { /* ignore */ }
};

export default isAppDebug;
