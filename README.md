# Blockedit (Racero / Garudabot)

Monorepo editor visual programming berbasis Racero (fork Scratch), dijalankan sebagai aplikasi desktop lewat **Tauri** (`Garudabot`).

## Struktur paket

| Paket | Deskripsi |
| --- | --- |
| `racero-gui` | Antarmuka React + wrapper Tauri |
| `racero-vm` | Virtual machine untuk menjalankan program block |
| `racero-blocks` | Library block visual (fork Blockly) |
| `racero-audio` | Audio engine |
| `racero-l10n` | Lokalisasi / terjemahan |
| `racero-compiler` | Compiler untuk Racero |
| `racero-boards` | Informasi board yang didukung |

## Prasyarat

- [Git](https://git-scm.com/)
- [Node.js](https://nodejs.org/) **18** (disarankan lewat [nvm](https://github.com/nvm-sh/nvm) / [nvm-windows](https://github.com/coreybutler/nvm-windows))
- npm (ikut terpasang bersama Node.js)
- [Rust](https://www.rust-lang.org/tools/install) (untuk Tauri)
- Windows: [WebView2](https://developer.microsoft.com/microsoft-edge/webview2/) (biasanya sudah ada di Windows 10/11)

## Clone

```bash
git clone <URL_REPO_ANDA>
cd Blockedit-master
```

## Setup & menjalankan

### Opsi A — otomatis (`setup.sh`)

Script ini meng-install, build dependensi, lalu menjalankan aplikasi Tauri:

```bash
bash setup.sh
```

Urutan yang dijalankan:

1. `racero-l10n` → `npm install` + `npm run build`
2. `racero-audio` → `npm install` + `npm run build`
3. `racero-blocks` → `npm install`
4. `racero-vm` → `npm install` + `npm run build`
5. `racero-gui` → `npm install` + `npm run tauri dev`

> Di Windows, jalankan lewat Git Bash atau WSL. Pastikan `nvm` dan Rust sudah terpasang.

### Opsi B — manual

Jalankan **berurutan** dari root repo (urutan penting karena saling bergantung):

```bash
# 1. Localization
cd racero-l10n
nvm use
npm install
npm run build

# 2. Audio
cd ../racero-audio
nvm use
npm install
npm run build

# 3. Blocks
cd ../racero-blocks
nvm use
npm install

# 4. VM
cd ../racero-vm
nvm use
npm install
npm run build

# 5. GUI (aplikasi desktop Tauri)
cd ../racero-gui
nvm use
npm install
npm run tauri dev
```

Paket tambahan (opsional, belum termasuk di `setup.sh`):

```bash
cd racero-compiler && nvm use && npm install
cd ../racero-boards && nvm use && npm install
```

## Membuka aplikasi

Perintah utama:

```bash
cd racero-gui
npm run tauri dev
```

Ini akan:
1. Menjalankan frontend (`npm start` → http://localhost:8601) lewat `beforeDevCommand`
2. Membuka jendela desktop **Garudabot** (fitur native/hardware tersedia)

### Mode browser saja (opsional)

Kalau hanya ingin UI di browser **tanpa** API Tauri (board/hardware tidak tersedia):

```bash
cd racero-gui
npm start
```

Lalu buka **http://localhost:8601/**

## Build ke `.exe` (Windows)

Pastikan setup dependensi monorepo sudah selesai (langkah di atas), lalu:

### Prasyarat tambahan build Windows

- [Visual Studio Build Tools](https://visualstudio.microsoft.com/visual-cpp-build-tools/) dengan workload **Desktop development with C++**
- Rust toolchain Windows (`rustup` default `x86_64-pc-windows-msvc`)

### Perintah build

```bash
cd racero-gui
nvm use
npm run tauri build
```

Proses ini akan:
1. Menjalankan `npm run build` (frontend production) lewat `beforeBuildCommand`
2. Mengompilasi Rust/Tauri
3. Membuat installer / executable Windows

### Hasil build

Setelah sukses, file ada di:

| Output | Lokasi |
| --- | --- |
| Executable | `racero-gui/src-tauri/target/release/garudabot.exe` |
| Installer NSIS (`.exe`) | `racero-gui/src-tauri/target/release/bundle/nsis/` |
| Installer MSI | `racero-gui/src-tauri/target/release/bundle/msi/` |

Untuk distribusi ke pengguna lain, biasanya pakai installer di folder `bundle/nsis/` (bukan hanya `.exe` mentah).

> Build pertama bisa lama (download crate Rust). Pastikan koneksi internet stabil.

## Catatan pengembangan

- Gunakan Node **18** (`nvm use` di tiap paket yang punya `.nvmrc`).
- `node_modules/`, `dist/`, `build/`, `target/`, dan file lingkungan tidak di-commit (lihat `.gitignore`).
- Setelah pull perubahan baru, biasanya cukup ulang `npm install` (dan `npm run build` jika ada) di paket yang berubah.

## Lisensi

Paket inti mengikuti lisensi masing-masing upstream Racero/Scratch (umumnya BSD-3-Clause). Lihat `package.json` di setiap folder paket.
