const log = require('../../util/log');

const CSV_FILTERS = [{name: 'CSV', extensions: ['csv']}];

const tauriApi = () => (typeof window === 'object' ? window.__TAURI__ : null);

const report = (message, error) => {
    log.error(error ? `${message}: ${error.message}` : message);
};

const saveCsvFile = async (filename, contents) => {
    const tauri = tauriApi();
    if (tauri) {
        try {
            const filePath = await tauri.core.invoke('plugin:dialog|save', {
                options: {
                    defaultPath: filename,
                    filters: CSV_FILTERS
                }
            });
            if (filePath) {
                await tauri.core.invoke('plugin:fs|write_text_file', {path: filePath, contents});
            }
        } catch (error) {
            report('Failed to save NLP CSV template', error);
        }
        return;
    }

    const canDownload = typeof document === 'object' && typeof Blob === 'function' &&
        typeof URL === 'function' && typeof URL.createObjectURL === 'function';
    if (!canDownload) return;

    const url = URL.createObjectURL(new Blob([contents], {type: 'text/csv;charset=utf-8'}));
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(url), 0);
};

const openCsvFile = onCsv => {
    const deliver = csv => {
        try {
            if (csv) onCsv(csv);
        } catch (error) {
            report('Failed to import NLP CSV', error);
        }
    };
    const tauri = tauriApi();
    if (tauri) {
        return tauri.core.invoke('plugin:dialog|open', {
            options: {
                multiple: false,
                filters: CSV_FILTERS
            }
        }).then(selectedPath => {
            const filePath = Array.isArray(selectedPath) ? selectedPath[0] : selectedPath;
            if (!filePath) return null;
            return tauri.core.invoke('plugin:fs|read_text_file', {path: filePath});
        })
            .then(deliver)
            .catch(error => report('Failed to import NLP CSV', error));
    }

    if (typeof document !== 'object' || typeof FileReader !== 'function') return undefined;

    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.csv';
    input.onchange = () => {
        const file = input.files && input.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = () => deliver(reader.result);
        reader.onerror = () => report('Failed to read NLP CSV file.');
        reader.readAsText(file);
    };
    input.click();
    return undefined;
};

module.exports = {openCsvFile, saveCsvFile};
