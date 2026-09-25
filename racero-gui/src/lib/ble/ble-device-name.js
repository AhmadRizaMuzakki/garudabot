/**
 * Pengaturan nama advertising BLE (manual + batch CSV dari Excel).
 *
 * Alur singkat:
 * 1. User isi nama / import CSV → disimpan di localStorage + Redux
 * 2. Saat Upload ESP32, Rust inject: GarudabotBleOta::begin("Nama")
 * 3. Board reboot → advertise dengan nama itu
 *
 * Catatan Windows: nama BLE dari OS sering kosong; UI bisa
 * menampilkan nama hasil flash terakhir sebagai fallback.
 */

import Papa from 'papaparse';

export const DEFAULT_BLE_DEVICE_NAME = 'Garudabot';
/** Batas aman untuk local name di paket advertising BLE. */
export const BLE_NAME_MAX_LEN = 15;

const BLE_NAME_STORAGE_KEY = 'garudabot.bleDeviceName';
const BLE_BATCH_STORAGE_KEY = 'garudabot.bleNameBatch';
const BLE_LAST_FLASHED_KEY = 'garudabot.lastFlashedBleName';

/** Header kolom CSV yang diterima (Excel → Save As CSV). */
const CSV_NAME_HEADERS = ['ble_name', 'name', 'nama', 'device_name', 'nama_board'];

/** Huruf/angka di awal; selanjutnya boleh - atau _. */
const NAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]*$/;

/**
 * Validasi nama sebelum inject ke sketch / simpan ke storage.
 * @returns {{ok: boolean, error: string|null, name: string}}
 */
export const sanitizeBleDeviceName = raw => {
    const name = String(raw || '').trim();
    if (!name) {
        return {ok: false, error: 'Nama tidak boleh kosong.', name: DEFAULT_BLE_DEVICE_NAME};
    }
    if (name.length > BLE_NAME_MAX_LEN) {
        return {
            ok: false,
            error: `Maksimal ${BLE_NAME_MAX_LEN} karakter (batas advertising BLE).`,
            name
        };
    }
    if (!NAME_PATTERN.test(name)) {
        return {
            ok: false,
            error: 'Hanya huruf, angka, - dan _. Harus diawali huruf/angka.',
            name
        };
    }
    return {ok: true, error: null, name};
};

/** Baca nama aktif dari localStorage (fallback: Garudabot). */
export const loadStoredBleDeviceName = () => {
    try {
        const stored = localStorage.getItem(BLE_NAME_STORAGE_KEY);
        const checked = sanitizeBleDeviceName(stored || DEFAULT_BLE_DEVICE_NAME);
        return checked.ok ? checked.name : DEFAULT_BLE_DEVICE_NAME;
    } catch (e) {
        return DEFAULT_BLE_DEVICE_NAME;
    }
};

/** Simpan nama aktif (dipakai Upload berikutnya). */
export const saveBleDeviceName = name => {
    const checked = sanitizeBleDeviceName(name);
    if (!checked.ok) return checked;
    try {
        localStorage.setItem(BLE_NAME_STORAGE_KEY, checked.name);
    } catch (e) { /* localStorage penuh / privat — abaikan */ }
    return checked;
};

/**
 * Simpan nama yang baru saja berhasil di-flash.
 * Dipakai label daftar BLE saat Windows tidak mengirim nama.
 */
export const saveLastFlashedBleName = name => {
    const checked = sanitizeBleDeviceName(name);
    if (!checked.ok) return checked;
    try {
        localStorage.setItem(BLE_LAST_FLASHED_KEY, JSON.stringify({
            name: checked.name,
            at: Date.now()
        }));
    } catch (e) { /* abaikan */ }
    return checked;
};

export const loadLastFlashedBleName = () => {
    try {
        const raw = localStorage.getItem(BLE_LAST_FLASHED_KEY);
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        const checked = sanitizeBleDeviceName(parsed && parsed.name);
        return checked.ok ? checked.name : null;
    } catch (e) {
        return null;
    }
};

/**
 * Label generik dari OS/BLE stack (bukan nama custom firmware).
 * Contoh: "", "ESP32-03323910", "Garudabot" default lama.
 */
export const isGenericBleLabel = label => {
    const text = String(label || '').trim();
    if (!text) return true;
    if (/^ESP32-/i.test(text)) return true;
    if (/^ESP32 BLE$/i.test(text)) return true;
    if (/^Garudabot$/i.test(text)) return true;
    return false;
};

/** Antrian batch Excel: daftar nama + indeks baris aktif. */
export const loadStoredBatch = () => {
    try {
        const raw = localStorage.getItem(BLE_BATCH_STORAGE_KEY);
        if (!raw) return {names: [], index: 0};
        const parsed = JSON.parse(raw);
        const names = Array.isArray(parsed.names) ? parsed.names.filter(Boolean) : [];
        const maxIndex = Math.max(0, names.length - 1);
        const index = Math.min(Math.max(0, Number(parsed.index) || 0), maxIndex);
        return {names, index};
    } catch (e) {
        return {names: [], index: 0};
    }
};

export const saveStoredBatch = (names, index) => {
    try {
        localStorage.setItem(BLE_BATCH_STORAGE_KEY, JSON.stringify({
            names: names || [],
            index: index || 0
        }));
    } catch (e) { /* abaikan */ }
};

export const clearStoredBatch = () => {
    try {
        localStorage.removeItem(BLE_BATCH_STORAGE_KEY);
    } catch (e) { /* abaikan */ }
};

const isCsvNameHeader = cell =>
    CSV_NAME_HEADERS.includes(String(cell || '').trim().toLowerCase());

/**
 * Ubah hasil PapaParse (array of arrays) menjadi daftar nama valid.
 * Baris pertama boleh header ble_name / name / nama.
 */
export const parseBleNameRows = rows => {
    const names = [];
    const errors = [];
    if (!rows || !rows.length) {
        return {names, errors: ['File kosong.']};
    }

    let startRow = 0;
    let nameCol = 0;
    const firstCell = rows[0] && rows[0][0];

    if (isCsvNameHeader(firstCell)) {
        startRow = 1;
        const header = (rows[0] || []).map(c => String(c || '').trim().toLowerCase());
        const idx = header.findIndex(h => CSV_NAME_HEADERS.includes(h));
        if (idx >= 0) nameCol = idx;
    }

    for (let i = startRow; i < rows.length; i++) {
        const row = rows[i];
        if (!row || row.every(c => !String(c || '').trim())) continue;

        const raw = String(row[nameCol] != null ? row[nameCol] : row[0] || '').trim();
        if (!raw) continue;

        const checked = sanitizeBleDeviceName(raw);
        if (checked.ok) {
            names.push(checked.name);
        } else {
            errors.push(`Baris ${i + 1}: ${raw} — ${checked.error}`);
        }
    }

    if (!names.length && !errors.length) {
        errors.push('Tidak ada nama valid. Kolom pertama = ble_name.');
    }
    return {names, errors};
};

/** Buka dialog pilih file CSV, lalu parse daftar nama. */
export const importBleNameCsv = () => new Promise((resolve, reject) => {
    const fileInput = document.createElement('input');
    fileInput.setAttribute('type', 'file');
    fileInput.setAttribute('accept', '.csv, .tsv, .txt');

    fileInput.onchange = e => {
        const file = e.target.files[0];
        if (!file) {
            document.body.removeChild(fileInput);
            reject(new Error('Tidak ada file dipilih.'));
            return;
        }
        Papa.parse(file, {
            header: false,
            skipEmptyLines: true,
            complete: results => {
                document.body.removeChild(fileInput);
                const parsed = parseBleNameRows(results.data);
                resolve({
                    fileName: file.name,
                    names: parsed.names,
                    errors: parsed.errors
                });
            },
            error: err => {
                document.body.removeChild(fileInput);
                reject(err);
            }
        });
    };

    document.body.appendChild(fileInput);
    fileInput.click();
});
