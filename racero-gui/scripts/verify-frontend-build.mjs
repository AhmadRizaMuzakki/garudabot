/**
 * Pastikan folder `build/` (yang di-pack Tauri) selaras dengan source ML Lab.
 * Dev (`webpack serve`) selalu live; build/installer hanya ikut isi `build/`.
 */
import fs from 'fs';
import path from 'path';
import {fileURLToPath} from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const bundlePath = path.join(root, 'build', 'lib.min.js');
const sourceFiles = [
    path.join(root, 'src', 'components', 'ml-lab', 'ml-lab.jsx'),
    path.join(root, 'src', 'components', 'ml-lab', 'ml-lab.css'),
    path.join(root, 'src', 'containers', 'ml-lab.jsx')
];

// Marker dari UI ML terbaru — kalau hilang, bundle masih versi lama.
const REQUIRED_MARKERS = [
    'netral',
    'gui.mlLab.title',
    'detectFrameObject'
];

function fail (msg) {
    console.error(`[verify-frontend-build] ${msg}`);
    process.exit(1);
}

if (!fs.existsSync(bundlePath)) {
    fail(`Missing ${bundlePath}. Jalankan npm run build dulu.`);
}

const bundleStat = fs.statSync(bundlePath);
const bundle = fs.readFileSync(bundlePath, 'utf8');

for (const marker of REQUIRED_MARKERS) {
    if (!bundle.includes(marker)) {
        fail(
            `Bundle tidak berisi marker ML Lab "${marker}". ` +
            'Build stale — UI di installer akan beda dari npm start. Rebuild: npm run build'
        );
    }
}

for (const src of sourceFiles) {
    if (!fs.existsSync(src)) continue;
    const srcMtime = fs.statSync(src).mtimeMs;
    // toleransi 2s untuk filesystem clock
    if (srcMtime > bundleStat.mtimeMs + 2000) {
        fail(
            `${path.relative(root, src)} lebih baru dari build/lib.min.js. ` +
            'Rebuild sebelum tauri build: npm run build'
        );
    }
}

const meta = {
    builtAt: new Date(bundleStat.mtimeMs).toISOString(),
    markers: REQUIRED_MARKERS,
    ok: true
};
fs.writeFileSync(
    path.join(root, 'build', 'build-meta.json'),
    `${JSON.stringify(meta, null, 2)}\n`
);
console.log(`[verify-frontend-build] OK — build fresh (${meta.builtAt})`);
