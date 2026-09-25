/**
 * Routing perintah pin Live Mode (USB Firmata / BLE).
 * Dipakai lewat window agar racero-vm tidak import racero-gui.
 */

export const setLiveTransport = transport => {
    if (typeof window === 'undefined') return;
    window.__garudabotLiveTransport = transport || null;
};

export const getLiveTransport = () => {
    if (typeof window === 'undefined') return null;
    return window.__garudabotLiveTransport || null;
};

export const isBleLiveActive = () => {
    const bleLive = typeof window !== 'undefined' ? window.__garudabotBleLive : null;
    return Boolean(bleLive && typeof bleLive.isActive === 'function' && bleLive.isActive());
};

/**
 * Apakah sesi Live Mode benar-benar siap mengirim perintah pin.
 * (Redux isConnected saja tidak cukup — bisa stale.)
 */
export const isLiveSessionReady = () => {
    if (isBleLiveActive()) return true;
    const transport = getLiveTransport();
    if (transport === 'usb') return true;
    // transport ble + sesi di window (survive HMR)
    if (transport === 'ble' && typeof window !== 'undefined') {
        const session = window.__garudabotBleLiveSession;
        if (session && session.active) return true;
    }
    return false;
};
