/**
 * Pencarian blok di menu kategori toolbox (gaya Scratch).
 *
 * Menambah baris Cari di paling atas toolbox. Saat aktif, input overlay
 * memfilter isi flyout dari semua kategori (termasuk callback ekstensi).
 * Pencocokan bersifat AND untuk setiap kata yang dipisah spasi, terhadap
 * nama kategori, tipe blok, field XML, dan teks tampilan blok jika ada.
 *
 * Aktifkan lewat kategori Cari atau Ctrl/Cmd+F. Escape atau memilih
 * kategori lain mengembalikan flyout biasa.
 */
import debounce from 'lodash.debounce';
import searchIcon from '../components/blocks/icon--search.svg';

/** Class CSS pada baris kategori palsu "Cari". */
const SEARCH_ITEM_CLASS = 'toolboxSearchItem';
/** Class CSS pada kotak pencarian mengambang di atas flyout. */
const SEARCH_OVERLAY_CLASS = 'toolboxSearchOverlay';
/** Class CSS pada <input> overlay. */
const SEARCH_INPUT_CLASS = 'toolboxSearchInput';
/**
 * Label flyout tak terlihat sebagai spacer. Blockly mengabaikan <sep>
 * di awal flyout, jadi label dummy ini diperlukan agar hasil geser
 * ke bawah overlay.
 */
const SEARCH_SPACER_CLASS = 'toolboxSearchSpacer';
/** Jarak ekstra (px) setelah label spacer. */
const SEARCH_SPACER_GAP = 24;

/** Escape teks agar aman dimasukkan ke XML flyout Blockly. */
const escapeXml = text => String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

class ToolboxSearch {
    /**
     * @param {object} options
     * @param {Blockly.WorkspaceSvg} options.workspace Workspace editor utama.
     * @param {object} options.Blockly Namespace Blockly / RaceroBlocks.
     * @param {function(): string} options.getPlaceholder Label kategori dan placeholder input.
     * @param {function(): string} options.getHint Pesan saat query masih kosong.
     * @param {function(): string} options.getNoResults Pesan saat tidak ada yang cocok.
     */
    constructor (options) {
        this.workspace = options.workspace;
        this.Blockly = options.Blockly;
        this.getPlaceholder = options.getPlaceholder;
        this.getHint = options.getHint;
        this.getNoResults = options.getNoResults;

        /** Overlay pencarian sedang tampil dan menguasai flyout. */
        this.active = false;
        this.query = '';
        /** Node DOM item kategori Cari. */
        this.searchItem = null;
        this.overlay = null;
        this.input = null;
        /** Workspace tanpa tampilan untuk membuat blok agar bisa `toString()`. */
        this.searchWorkspace = null;
        /** Peta outerHTML XML -> teks yang bisa dicari. */
        this.searchTextCache = Object.create(null);

        this.applyFilterNow = this.applyFilterNow.bind(this);
        this.applyFilter = debounce(this.applyFilterNow, 120);
        this.handleDocumentKeyDown = this.handleDocumentKeyDown.bind(this);
        this.handleQueryInput = this.handleQueryInput.bind(this);
        this.activate = this.activate.bind(this);
    }
    /**
     * Patch show/select toolbox, pasang overlay + baris kategori, bind Ctrl/Cmd+F.
     * Panggil sekali setelah Blockly.inject.
     */
    attach () {
        const toolbox = this.workspace.getToolbox();
        if (!toolbox) return;

        // Tetap tampilkan hasil filter jika Blockly mencoba menampilkan seluruh toolbox.
        this._originalShowAll = toolbox.showAll_.bind(toolbox);
        toolbox.showAll_ = () => {
            if (this.active) {
                this.applyFilterNow();
            } else {
                this._originalShowAll();
            }
        };

        // Klik kategori asli keluar dari mode cari. optShouldScroll === false
        // dipakai internal saat toolbox dibangun ulang; biarkan Cari tetap terpilih.
        this._originalSetSelectedItem = toolbox.setSelectedItem.bind(toolbox);
        toolbox.setSelectedItem = (item, optShouldScroll) => {
            if (this.active && item && optShouldScroll !== false) {
                this.deactivate({restoreFlyout: true});
            }
            const result = this._originalSetSelectedItem(item, optShouldScroll);
            if (this.active && optShouldScroll === false) {
                if (toolbox.selectedItem_) {
                    toolbox.selectedItem_.setSelected(false);
                }
                if (this.searchItem) {
                    this.searchItem.classList.add('categorySelected');
                }
            }
            return result;
        };

        this.createOverlay();
        this.insertSearchItem();
        document.addEventListener('keydown', this.handleDocumentKeyDown);
    }
    /** Lepas listener, kembalikan method toolbox, hapus DOM/workspace. */
    dispose () {
        document.removeEventListener('keydown', this.handleDocumentKeyDown);
        this.applyFilter.cancel();

        const toolbox = this.workspace && this.workspace.getToolbox && this.workspace.getToolbox();
        if (toolbox) {
            if (this._originalShowAll) {
                toolbox.showAll_ = this._originalShowAll;
            }
            if (this._originalSetSelectedItem) {
                toolbox.setSelectedItem = this._originalSetSelectedItem;
            }
        }

        if (this.searchWorkspace) {
            this.searchWorkspace.dispose();
            this.searchWorkspace = null;
        }
        if (this.overlay && this.overlay.parentNode) {
            this.overlay.parentNode.removeChild(this.overlay);
        }
        this.overlay = null;
        this.input = null;
        this.searchItem = null;
        this.searchTextCache = Object.create(null);
    }
    /**
     * XML toolbox diganti (locale, ekstensi, variabel). Pasang ulang baris Cari,
     * buang cache teks, dan pertahankan hasil jika pencarian masih aktif.
     */
    syncAfterToolboxUpdate () {
        this.searchTextCache = Object.create(null);
        this.insertSearchItem();
        this.updateMessages();
        if (this.active) {
            const toolbox = this.workspace.getToolbox();
            if (toolbox && toolbox.selectedItem_) {
                toolbox.selectedItem_.setSelected(false);
            }
            if (this.searchItem) {
                this.searchItem.classList.add('categorySelected');
            }
            this.applyFilterNow();
        }
    }
    /** Perbarui teks placeholder pada label kategori dan input. */
    updateMessages () {
        if (this.searchItem) {
            const label = this.searchItem.querySelector('.scratchCategoryMenuItemLabel');
            if (label) label.textContent = this.getPlaceholder();
        }
        if (this.input) {
            this.input.placeholder = this.getPlaceholder();
        }
    }
    /** Buat input overlay dan sisipkan ke injection div Blockly. */
    createOverlay () {
        const injectionDiv = this.workspace.getParentSvg().parentNode;
        this.overlay = document.createElement('div');
        this.overlay.className = SEARCH_OVERLAY_CLASS;
        this.overlay.style.display = 'none';

        this.input = document.createElement('input');
        this.input.type = 'text';
        this.input.className = SEARCH_INPUT_CLASS;
        this.input.placeholder = this.getPlaceholder();
        this.input.autocomplete = 'off';
        this.input.spellcheck = false;
        this.input.addEventListener('input', this.handleQueryInput);
        this.input.addEventListener('mousedown', event => event.stopPropagation());
        this.input.addEventListener('touchstart', event => event.stopPropagation());
        this.input.addEventListener('keydown', event => {
            event.stopPropagation();
            if (event.key === 'Escape') {
                this.deactivate({restoreFlyout: true, restoreSelection: true});
            }
        });

        this.overlay.appendChild(this.input);
        this.overlay.addEventListener('mousedown', event => event.stopPropagation());
        injectionDiv.appendChild(this.overlay);
    }
    /** Sisipkan (atau pakai ulang) kategori Cari sebagai baris pertama toolbox. */
    insertSearchItem () {
        const toolbox = this.workspace.getToolbox();
        const table = toolbox && toolbox.categoryMenu_ && toolbox.categoryMenu_.table;
        if (!table) return;

        const existing = table.querySelector(`.${SEARCH_ITEM_CLASS}`);
        if (existing) {
            this.searchItem = existing;
            if (this.active) {
                this.searchItem.classList.add('categorySelected');
            }
            return;
        }

        const row = document.createElement('div');
        row.className = 'scratchCategoryMenuRow';

        const item = document.createElement('div');
        item.className = `scratchCategoryMenuItem ${SEARCH_ITEM_CLASS}`;

        const icon = document.createElement('div');
        icon.className = 'scratchCategoryItemIcon';
        icon.style.backgroundImage = `url(${searchIcon})`;

        const label = document.createElement('div');
        label.className = 'scratchCategoryMenuItemLabel';
        label.textContent = this.getPlaceholder();

        item.appendChild(icon);
        item.appendChild(label);
        row.appendChild(item);
        table.insertBefore(row, table.firstChild);

        item.addEventListener('mouseup', event => {
            event.stopPropagation();
            event.preventDefault();
            this.activate();
        });
        item.addEventListener('touchend', event => {
            event.stopPropagation();
            this.activate();
        });

        this.searchItem = item;
        if (this.active) {
            this.searchItem.classList.add('categorySelected');
        }
    }
    /**
     * Ctrl/Cmd+F membuka pencarian, kecuali fokus sudah di kolom teks lain.
     * Jika fokus sudah di input pencarian, shortcut tetap mengaktifkan/memilihnya.
     */
    handleDocumentKeyDown (event) {
        if (!(event.ctrlKey || event.metaKey) || event.key !== 'f') return;
        const target = event.target;
        const tag = target && target.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA' || (target && target.isContentEditable)) {
            if (target !== this.input) return;
        }
        if (!this.workspace.isVisible()) return;
        event.preventDefault();
        this.activate();
    }
    /** Perbarui flyout (debounce) saat pengguna mengetik. */
    handleQueryInput () {
        this.query = this.input.value;
        this.applyFilter();
    }
    /** Tampilkan overlay, sorot kategori Cari, dan isi flyout. */
    activate () {
        const toolbox = this.workspace.getToolbox();
        this.active = true;
        if (toolbox && toolbox.selectedItem_) {
            toolbox.selectedItem_.setSelected(false);
        }
        if (this.searchItem) {
            this.searchItem.classList.add('categorySelected');
        }
        this.overlay.style.display = 'flex';
        this.updateMessages();
        this.applyFilterNow();
        setTimeout(() => {
            if (this.input) {
                this.input.focus();
                this.input.select();
            }
        }, 0);
    }
    /**
     * Sembunyikan UI pencarian dan kosongkan query.
     * @param {object} [opts]
     * @param {boolean} [opts.restoreFlyout] Panggil toolbox.showAll_() asli.
     * @param {boolean} [opts.restoreSelection] Pilih ulang kategori sebelumnya.
     */
    deactivate ({restoreFlyout, restoreSelection} = {}) {
        this.active = false;
        this.query = '';
        if (this.input) this.input.value = '';
        if (this.overlay) this.overlay.style.display = 'none';
        if (this.searchItem) this.searchItem.classList.remove('categorySelected');
        if (restoreFlyout && this._originalShowAll) {
            this._originalShowAll();
        }
        if (restoreSelection) {
            const toolbox = this.workspace.getToolbox();
            if (toolbox && toolbox.selectedItem_) {
                toolbox.selectedItem_.setSelected(true);
                toolbox.scrollToCategoryById(toolbox.selectedItem_.id_);
            }
        }
    }
    /** Ganti isi flyout dengan petunjuk, hasil kosong, atau blok yang cocok. */
    applyFilterNow () {
        if (!this.active) return;
        const flyout = this.workspace.getFlyout();
        if (!flyout) return;

        const query = (this.query || '').trim().toLowerCase();
        if (!query) {
            this.showFlyoutLabel(this.getHint());
            return;
        }

        const matches = this.collectMatches(query);
        if (!matches.length) {
            this.showFlyoutLabel(this.getNoResults());
            return;
        }

        flyout.show(this.createSpacerNodes().concat(matches));
    }
    /** Anak elemen Blockly.Xml, tanpa text node. */
    xmlChildElements (xml) {
        const nodes = [];
        for (let i = 0; i < xml.childNodes.length; i++) {
            if (xml.childNodes[i].tagName) {
                nodes.push(xml.childNodes[i]);
            }
        }
        return nodes;
    }
    /** Label tak terlihat + jarak agar hasil berada di bawah overlay. */
    createSpacerNodes () {
        return this.xmlChildElements(this.Blockly.Xml.textToDom(
            '<xml>' +
            `<label text="" web-class="${SEARCH_SPACER_CLASS}"></label>` +
            `<sep gap="${SEARCH_SPACER_GAP}"></sep>` +
            '</xml>'
        ));
    }
    /** Tampilkan spacer plus satu label flyout (petunjuk atau hasil kosong). */
    showFlyoutLabel (text) {
        const flyout = this.workspace.getFlyout();
        flyout.show(this.xmlChildElements(this.Blockly.Xml.textToDom(
            '<xml>' +
            `<label text="" web-class="${SEARCH_SPACER_CLASS}"></label>` +
            `<sep gap="${SEARCH_SPACER_GAP}"></sep>` +
            `<label text="${escapeXml(text)}"></label>` +
            '</xml>'
        )));
    }
    /**
     * Telusuri setiap kategori toolbox (XML statis dan isi dari callback)
     * lalu kembalikan klon node BLOCK/BUTTON yang teks pencariannya memuat
     * setiap kata query. Event Blockly dimatikan saat blok diinstansiasi.
     * @param {string} query String pencarian yang sudah lowercase dan di-trim.
     * @returns {Element[]}
     */
    collectMatches (query) {
        const toolbox = this.workspace.getToolbox();
        const Blockly = this.Blockly;
        const words = query.split(/\s+/).filter(Boolean);
        const matches = [];
        const seen = Object.create(null);

        const pushIfMatch = (node, extraText) => {
            // extraText = nama kategori, mis. "gerak" ikut mencocokkan blok gerak.
            if (!node || !node.tagName) return;
            const tag = node.tagName.toUpperCase();
            if (tag !== 'BLOCK' && tag !== 'BUTTON') return;
            const text = `${extraText} ${this.getNodeSearchText(node)}`.toLowerCase();
            if (!words.every(word => text.indexOf(word) !== -1)) return;
            const key = node.outerHTML;
            if (seen[key]) return;
            seen[key] = true;
            matches.push(node.cloneNode(true));
        };

        Blockly.Events.disable();
        try {
            const categories = toolbox.categoryMenu_.categories_ || [];
            for (let i = 0; i < categories.length; i++) {
                const category = categories[i];
                const categoryName = Blockly.utils.replaceMessageReferences(category.name_ || '');
                let contents = category.getContents();
                if (typeof contents === 'string') {
                    const callback = this.workspace.getToolboxCategoryCallback(contents);
                    contents = callback ? callback(this.workspace) : [];
                }
                for (let j = 0; j < contents.length; j++) {
                    pushIfMatch(contents[j], categoryName);
                }
            }
        } finally {
            Blockly.Events.enable();
            if (this.searchWorkspace) {
                this.searchWorkspace.clear();
            }
        }
        return matches;
    }
    /** Workspace tanpa tampilan (lazy) untuk `block.toString()` yang bisa dicari. */
    getSearchWorkspace () {
        if (!this.searchWorkspace) {
            this.searchWorkspace = new this.Blockly.Workspace();
        }
        return this.searchWorkspace;
    }
    /**
     * Bangun teks pencarian ter-cache: opcode, teks/field XML, dan block.toString().
     * Instansiasi bisa gagal untuk blok yang butuh workspace ter-render; tipe
     * dan field tetap dipakai dalam kasus itu.
     * @param {Element} node Node XML toolbox.
     * @returns {string}
     */
    getNodeSearchText (node) {
        const cacheKey = node.outerHTML;
        if (this.searchTextCache[cacheKey]) {
            return this.searchTextCache[cacheKey];
        }

        const Blockly = this.Blockly;
        const type = node.getAttribute('type') || '';
        const parts = [
            type.replace(/_/g, ' '),
            Blockly.utils.replaceMessageReferences(node.getAttribute('text') || '')
        ];

        const fields = node.getElementsByTagName('field');
        for (let i = 0; i < fields.length; i++) {
            parts.push(fields[i].textContent || '');
        }

        if (node.tagName.toUpperCase() === 'BLOCK' && Blockly.Blocks[type]) {
            try {
                const searchWorkspace = this.getSearchWorkspace();
                searchWorkspace.clear();
                const block = Blockly.Xml.domToBlock(node.cloneNode(true), searchWorkspace);
                parts.push(block.toString());
            } catch (e) {
                // Beberapa blok butuh workspace ter-render atau menu runtime; tipe/field tetap dicocokkan.
            }
        }

        const text = parts.join(' ');
        this.searchTextCache[cacheKey] = text;
        return text;
    }
}

export default ToolboxSearch;
