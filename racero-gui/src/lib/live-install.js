/**
 * Flag batal untuk proses Turn Live Mode On (BLE compile/OTA bisa lama).
 */
let cancelled = false;

export const beginLiveInstall = () => {
    cancelled = false;
};

export const cancelLiveInstall = () => {
    cancelled = true;
};

export const isLiveInstallCancelled = () => cancelled;

export const throwIfLiveInstallCancelled = () => {
    if (cancelled) {
        throw new Error('Live Mode dibatalkan.');
    }
};
