/**
 * Extension Image Classification — Picto / Teachable Machine style ML Lab.
 *
 * ## Arsitektur (mudah di-maintain)
 * 1. Feature extractor: MobileNet v2 (`infer(..., true)` → embedding)
 * 2. Classifier head: Dense(100, relu) → Dense(numClasses, softmax)  ← di-train di lab
 * 3. Mode OBJEK: classify HANYA crop kotak hijau (sama saat foto & preview)
 *    → 1 kotak tampil + multi-label skor class (softmax)
 * 4. Mode WAJAH: MediaPipe deteksi wajah → classify tiap wajah dengan head yang sama
 *
 * Hindari: KNN + hunting banyak seed COCO (sering nempel muka/tangan).
 * Pola ini = Teachable Machine transfer learning, cukup jelas untuk programmer lain.
 */
const formatMessage = require('format-message');

require('@tensorflow/tfjs-backend-webgl');

const STAGE_WIDTH = 480;
const STAGE_HEIGHT = 360;
const PREDICT_INTERVAL_MS = 150;
const MIN_CONFIDENCE = 0.45;
const FACE_CLASS_MIN = 0.12;
const TRACK_IOU_MATCH = 0.12;

/** Hyperparameter head (selaras Teachable Machine defaults yang umum). */
const HEAD_DENSE_UNITS = 100;
const HEAD_LEARNING_RATE = 0.001;
const HEAD_EPOCHS = 40;
const HEAD_BATCH = 16;
/** Confidence minimum tampil kotak benda (TM-style: cukup yakin). */
const OBJECT_POSITIVE_MIN = 25;

/**
 * Panduan foto objek (selaras CSS .detectFrameObject).
 * Kotak lebih tinggi (vertikal) agar area foto nyaman.
 */
const OBJECT_CAPTURE_GUIDE = {x: 0.16, y: 0.1, w: 0.68, h: 0.62};

/** Nama class netral / background (Teachable Machine style). */
const IDLE_CLASS_RE = /^(netral|kosong|idle|empty|none|background|bg|suasana|diam|class\s*1)$/i;

const menuIconURI = 'data:image/svg+xml,' + encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 40 40">' +
    '<rect width="40" height="40" rx="8" fill="#2A3538"/>' +
    '<circle cx="20" cy="16" r="7" fill="none" stroke="#fff" stroke-width="2.5"/>' +
    '<path d="M12 28c2.5-4 13.5-4 16 0" fill="none" stroke="#fff" stroke-width="2.5" stroke-linecap="round"/>' +
    '<circle cx="28" cy="10" r="3" fill="#A8B4B7"/></svg>'
);

const blockIconURI = menuIconURI;

class RaceroImageClassify {
    constructor (runtime) {
        this.runtime = runtime;

        /** Slot terpisah keras: objects ≠ faces (sample + head masing-masing). */
        this._modeSlots = {
            objects: this._createEmptyModeSlot('objects'),
            faces: this._createEmptyModeSlot('faces')
        };

        /** @type {Array<{id:string, name:string, samples:string[]}>} */
        this.classes = this._modeSlots.objects.classes;

        this.isTrained = false;
        this.isPredicting = false;
        this.currentClass = '';
        this.currentConfidence = 0;
        this.currentLabels = [];
        this.exampleCount = 0;
        this._predictTimer = null;
        this._predictBusy = false;
        this._labPredictBusy = false;
        this._nextClassNum = 3;
        this._labelNames = [];

        this._mobilenet = null;
        /** @deprecated diganti _headModel (TM-style). Masih dibaca slot lama. */
        this._knn = null;
        /** @type {import('@tensorflow/tfjs').LayersModel|null} */
        this._headModel = null;
        this._engineReady = false;
        this._engineLoading = null;
        this._cropCanvas = null;
        this._cropCtx = null;
        this._regionCanvas = null;
        this._regionCtx = null;

        /** @type {Array<{className:string, confidence:number, box?:object}>} */
        this.currentDetections = [];
        /** @type {Object.<string, {box:object, confidence:number, miss:number, className:string}>} */
        this._trackMap = Object.create(null);
        this._frameSeq = 0;

        /** @type {'objects'|'faces'} */
        this.detectMode = 'objects';
        this._loadModeSlot('objects');

        this._mpFaceDetector = null;
        this._mpFaceLoading = null;
        this._mpFaceReady = false;
        this._faceScratchCanvas = null;
        this._faceScratchCtx = null;

        /** @type {'lab'|'teachablemachine'} */
        this.modelSource = 'lab';
        this._tmModel = null;
        this._tmMetadata = null;
        this.tmModelUrl = '';
        this._tmPredictBusy = false;
    }

    _createEmptyModeSlot (mode) {
        const prefix = mode === 'faces' ? 'face' : 'obj';
        // Mode objek: class "netral" wajib (negatif) biar latar tidak dipaksa jadi benda
        const classes = mode === 'objects' ? [
            {id: `${prefix}_netral`, name: 'netral', samples: []},
            {id: `${prefix}_class_2`, name: 'Class 2', samples: []}
        ] : [
            {id: `${prefix}_class_1`, name: 'Class 1', samples: []},
            {id: `${prefix}_class_2`, name: 'Class 2', samples: []}
        ];
        return {
            classes,
            isTrained: false,
            exampleCount: 0,
            knn: null,
            headModel: null,
            labelNames: [],
            nextClassNum: 3
        };
    }

    _isIdleClassName (name) {
        return IDLE_CLASS_RE.test(String(name || '').trim());
    }

    /** Pastikan mode objek punya class negatif "netral". */
    _ensureIdleClass () {
        if (this.detectMode !== 'objects') return;
        const hasIdle = (this.classes || []).some(c => this._isIdleClassName(c.name));
        if (hasIdle) {
            // Rename label lama "kosong" → "netral" (sample tetap)
            for (let i = 0; i < this.classes.length; i++) {
                if (/^kosong$/i.test(String(this.classes[i].name || '').trim())) {
                    this.classes[i].name = 'netral';
                }
            }
            return;
        }
        this.classes = [
            {id: `obj_netral_${Date.now()}`, name: 'netral', samples: []}
        ].concat(this.classes || []);
    }

    _disposeHeadModel (model) {
        if (model && typeof model.dispose === 'function') {
            try {
                model.dispose();
            } catch (e) { /* ignore */ }
        }
    }

    /** Simpan state lab mode aktif ke slot-nya. */
    _saveModeSlot (mode) {
        const key = mode === 'faces' ? 'faces' : 'objects';
        const slot = this._modeSlots[key] || this._createEmptyModeSlot(key);
        slot.classes = this.classes;
        slot.isTrained = !!this.isTrained;
        slot.exampleCount = this.exampleCount || 0;
        slot.knn = this._knn;
        slot.headModel = this._headModel;
        slot.labelNames = (this._labelNames || []).slice();
        slot.nextClassNum = this._nextClassNum || 3;
        this._modeSlots[key] = slot;
    }

    /** Muat slot mode → field aktif extension. */
    _loadModeSlot (mode) {
        const key = mode === 'faces' ? 'faces' : 'objects';
        if (!this._modeSlots[key]) {
            this._modeSlots[key] = this._createEmptyModeSlot(key);
        }
        const slot = this._modeSlots[key];
        this.classes = slot.classes;
        this.isTrained = !!slot.isTrained;
        this.exampleCount = slot.exampleCount || 0;
        this._knn = slot.knn;
        this._headModel = slot.headModel || null;
        this._labelNames = (slot.labelNames || []).slice();
        this._nextClassNum = slot.nextClassNum || 3;
        this._trackMap = Object.create(null);
        this.currentDetections = [];
        this.currentLabels = [];
        this.currentClass = '';
        this.currentConfidence = 0;
        this._ensureIdleClass();
    }

    getInfo () {
        return {
            id: 'imageclassify',
            name: formatMessage({
                id: 'imageclassify.categoryName',
                default: 'Image Classification',
                description: 'Name of the image classification extension category'
            }),
            blockIconURI: blockIconURI,
            menuIconURI: menuIconURI,
            color1: '#4A5C61',
            color2: '#3A484C',
            color3: '#2A3538',
            blocks: [
                {
                    opcode: 'openLab',
                    blockType: 'command',
                    text: formatMessage({
                        id: 'imageclassify.openLab',
                        default: 'open ML lab',
                        description: 'Open the image classification training lab'
                    })
                },
                {
                    opcode: 'loadTeachableMachineModel',
                    blockType: 'command',
                    text: formatMessage({
                        id: 'imageclassify.loadTeachableMachine',
                        default: 'load Teachable Machine model [URL]',
                        description: 'Load an exported Teachable Machine image model from URL'
                    }),
                    arguments: {
                        URL: {
                            type: 'string',
                            defaultValue: 'https://teachablemachine.withgoogle.com/models/YOUR_MODEL_ID/'
                        }
                    }
                },
                {
                    opcode: 'clearTeachableMachineModel',
                    blockType: 'command',
                    text: formatMessage({
                        id: 'imageclassify.clearTeachableMachine',
                        default: 'clear Teachable Machine model',
                        description: 'Unload Teachable Machine model and return to ML Lab model'
                    })
                },
                {
                    opcode: 'startClassifying',
                    blockType: 'command',
                    text: formatMessage({
                        id: 'imageclassify.startClassifying',
                        default: 'start classifying from camera',
                        description: 'Start live classification from webcam'
                    })
                },
                {
                    opcode: 'stopClassifying',
                    blockType: 'command',
                    text: formatMessage({
                        id: 'imageclassify.stopClassifying',
                        default: 'stop classifying',
                        description: 'Stop live classification'
                    })
                },
                '---',
                {
                    opcode: 'whenClassDetected',
                    blockType: 'hat',
                    text: formatMessage({
                        id: 'imageclassify.whenClassDetected',
                        default: 'when class [CLASS] detected',
                        description: 'Hat that fires when a class is detected'
                    }),
                    arguments: {
                        CLASS: {
                            type: 'string',
                            menu: 'classMenu',
                            defaultValue: 'Class 1'
                        }
                    }
                },
                {
                    opcode: 'isClass',
                    blockType: 'Boolean',
                    text: formatMessage({
                        id: 'imageclassify.isClass',
                        default: 'is class [CLASS]?',
                        description: 'Whether the current prediction matches a class'
                    }),
                    arguments: {
                        CLASS: {
                            type: 'string',
                            menu: 'classMenu',
                            defaultValue: 'Class 1'
                        }
                    }
                },
                {
                    opcode: 'getClassName',
                    blockType: 'reporter',
                    text: formatMessage({
                        id: 'imageclassify.className',
                        default: 'classified class',
                        description: 'Name of the predicted class'
                    })
                },
                {
                    opcode: 'getConfidence',
                    blockType: 'reporter',
                    text: formatMessage({
                        id: 'imageclassify.confidence',
                        default: 'classification confidence',
                        description: 'Confidence 0-100 of the prediction'
                    })
                },
                {
                    opcode: 'isModelReady',
                    blockType: 'Boolean',
                    text: formatMessage({
                        id: 'imageclassify.isModelReady',
                        default: 'model trained?',
                        description: 'Whether a model has been trained'
                    })
                }
            ],
            menus: {
                classMenu: {
                    acceptReporters: true,
                    items: 'getClassMenuItems'
                }
            }
        };
    }

    getClassMenuItems () {
        if (this.modelSource === 'teachablemachine' && this._labelNames && this._labelNames.length) {
            return this._labelNames.slice();
        }
        if (!this.classes.length) return ['Class 1', 'Class 2'];
        return this.classes.map(c => c.name);
    }

    /**
     * Normalisasi URL export Teachable Machine (pastikan trailing slash).
     * @param {string} url
     * @returns {string}
     */
    _normalizeTeachableMachineUrl (url) {
        let u = String(url || '').trim();
        if (!u) return '';
        // Izinkan paste link tanpa /models/ — tetap pakai apa adanya
        if (u.endsWith('model.json')) {
            u = u.slice(0, -'model.json'.length);
        }
        if (u.endsWith('metadata.json')) {
            u = u.slice(0, -'metadata.json'.length);
        }
        if (!u.endsWith('/')) u += '/';
        return u;
    }

    /**
     * Muat model Teachable Machine (image) dari URL publik.
     * Export panel TM → "Tensorflow.js" → shareable link /models/ID/
     * @param {string|{URL?:string}} urlOrArgs
     * @returns {Promise<{ok:boolean, message?:string, labels?:string[]}>}
     */
    async loadTeachableMachineModel (urlOrArgs) {
        const raw = typeof urlOrArgs === 'string' ?
            urlOrArgs :
            (urlOrArgs && (urlOrArgs.URL || urlOrArgs.url)) || '';
        const base = this._normalizeTeachableMachineUrl(raw);
        if (!base || base.indexOf('YOUR_MODEL_ID') >= 0) {
            return {
                ok: false,
                message: 'Paste URL model Teachable Machine, contoh: https://teachablemachine.withgoogle.com/models/xxxx/'
            };
        }

        try {
            const tf = require('@tensorflow/tfjs');
            await tf.setBackend('webgl');
            await tf.ready();

            const metaRes = await fetch(`${base}metadata.json`);
            if (!metaRes.ok) {
                return {ok: false, message: `Gagal unduh metadata.json (${metaRes.status})`};
            }
            const metadata = await metaRes.json();
            const labels = Array.isArray(metadata.labels) ?
                metadata.labels.map(l => String(l)) :
                [];
            if (labels.length < 1) {
                return {ok: false, message: 'metadata.json tidak berisi labels.'};
            }

            if (this._tmModel && typeof this._tmModel.dispose === 'function') {
                try {
                    this._tmModel.dispose();
                } catch (e) { /* ignore */ }
            }

            const model = await tf.loadLayersModel(`${base}model.json`);
            this._tmModel = model;
            this._tmMetadata = metadata;
            this.tmModelUrl = base;
            this.modelSource = 'teachablemachine';
            this._labelNames = labels.slice();
            this.classes = labels.map((name, i) => ({
                id: `tm_${i}`,
                name,
                samples: []
            }));
            this.isTrained = true;
            this.exampleCount = labels.length;
            this._disposeHeadModel(this._headModel);
            this._headModel = null;
            this._knn = null;
            this._trackMap = Object.create(null);
            this.currentDetections = [];
            this.currentLabels = labels.map(name => ({className: name, confidence: 0}));
            this.currentClass = '';
            this.currentConfidence = 0;
            this._refreshBlocks();
            return {
                ok: true,
                message: `Teachable Machine loaded · ${labels.length} class`,
                labels
            };
        } catch (e) {
            return {
                ok: false,
                message: e && e.message ?
                    `Gagal load Teachable Machine: ${e.message}` :
                    'Gagal load Teachable Machine model.'
            };
        }
    }

    clearTeachableMachineModel () {
        if (this._tmModel && typeof this._tmModel.dispose === 'function') {
            try {
                this._tmModel.dispose();
            } catch (e) { /* ignore */ }
        }
        this._tmModel = null;
        this._tmMetadata = null;
        this.tmModelUrl = '';
        this.modelSource = 'lab';
        this.isTrained = !!(
            (this._headModel || this._knn) &&
            this._labelNames && this._labelNames.length
        );
        if (!this.isTrained) {
            this._labelNames = [];
            this.currentClass = '';
            this.currentConfidence = 0;
            this.currentLabels = [];
            this.currentDetections = [];
        }
        this._refreshBlocks();
    }

    /**
     * Inferensi full-frame ala Teachable Machine (bukan deteksi kotak objek).
     */
    async _predictTeachableMachine (element) {
        if (!this._tmModel || !element) return null;
        if (this._tmPredictBusy) {
            return {
                className: this.currentClass || '',
                confidence: this.currentConfidence || 0,
                detections: this.currentDetections || [],
                labels: this.currentLabels || []
            };
        }
        this._tmPredictBusy = true;
        const tf = require('@tensorflow/tfjs');
        try {
            const canvas = this._fitContainToCanvas(element) || this._centerCropToCanvas(element);
            if (!canvas) return null;

            const probs = tf.tidy(() => {
                let img = tf.browser.fromPixels(canvas);
                // TM image models: 224×224, normalize ke [-1, 1]
                img = tf.image.resizeBilinear(img, [224, 224], false);
                img = img.toFloat().div(tf.scalar(127.5)).sub(tf.scalar(1));
                img = img.expandDims(0);
                const out = this._tmModel.predict(img);
                return Array.isArray(out) ? out[0] : out;
            });
            const data = await probs.data();
            probs.dispose();

            const labels = this._labelNames || [];
            const list = [];
            for (let i = 0; i < labels.length; i++) {
                const p = typeof data[i] === 'number' ? data[i] : 0;
                list.push({
                    className: labels[i],
                    confidence: Math.max(0, Math.min(100, p * 100))
                });
            }
            list.sort((a, b) => b.confidence - a.confidence);
            const top = list[0] || {className: '', confidence: 0};

            // Kotak panduan tengah (TM = klasifikasi frame, bukan bbox objek)
            const detections = top.confidence >= 25 ? [{
                className: top.className,
                confidence: top.confidence,
                box: {x: 0.18, y: 0.12, w: 0.64, h: 0.76}
            }] : [];

            this.currentLabels = list;
            this.currentDetections = detections;
            this.currentClass = top.confidence >= 25 ? top.className : '';
            this.currentConfidence = top.confidence >= 25 ? top.confidence : 0;

            return {
                className: this.currentClass,
                confidence: this.currentConfidence,
                detections,
                labels: list
            };
        } catch (e) {
            return null;
        } finally {
            this._tmPredictBusy = false;
        }
    }

    /**
     * Mode deteksi dari ML Lab — TERPISAH KERAS: objects | faces.
     * Ganti mode = tukar slot (sample+head), tidak campur / tidak hapus mode lain.
     * @param {string} mode
     */
    setDetectMode (mode) {
        const next = String(mode || 'objects');
        const allowed = {objects: 1, faces: 1};
        const resolved = allowed[next] ? next : 'objects';
        if (resolved === this.detectMode) return;

        this._saveModeSlot(this.detectMode);
        this.detectMode = resolved;
        this._loadModeSlot(resolved);
        this._refreshBlocks();
        this._trackMap = Object.create(null);

        // MediaPipe dipakai mode wajah (deteksi) dan sampling wajah.
        this._ensureMediaPipeFace().catch(() => {});
    }

    getLabState () {
        return {
            classes: this.classes.map(c => ({
                id: c.id,
                name: c.name,
                sampleCount: c.samples.length,
                samples: c.samples.slice(0, 8)
            })),
            isTrained: this.isTrained,
            exampleCount: this.exampleCount,
            currentClass: this.currentClass,
            currentConfidence: this.currentConfidence,
            isPredicting: this.isPredicting,
            engineReady: this._engineReady,
            detectMode: this.detectMode,
            modelSource: this.modelSource || 'lab',
            tmModelUrl: this.tmModelUrl || ''
        };
    }

    addClass (name) {
        const label = (name && String(name).trim()) || `Class ${this._nextClassNum}`;
        const id = `class_${Date.now()}_${this._nextClassNum}`;
        this._nextClassNum += 1;
        this.classes.push({id, name: label, samples: []});
        this.isTrained = false;
        this._refreshBlocks();
        return id;
    }

    renameClass (classId, name) {
        const cls = this.classes.find(c => c.id === classId);
        if (!cls) return;
        cls.name = String(name == null ? '' : name);
        this.isTrained = false;
        this._refreshBlocks();
    }

    removeClass (classId) {
        if (this.classes.length <= 2) return false;
        this.classes = this.classes.filter(c => c.id !== classId);
        this.isTrained = false;
        this.exampleCount = 0;
        this._disposeHeadModel(this._headModel);
        this._headModel = null;
        this._knn = null;
        this._refreshBlocks();
        return true;
    }

    /**
     * Simpan sample yang sudah di-crop di GUI (Hold to Record cepat).
     * Sync — tanpa Image decode / MediaPipe.
     * @returns {string|null}
     */
    addSampleReady (classId, dataUrl) {
        const cls = this.classes.find(c => c.id === classId);
        if (!cls || !dataUrl) return null;
        cls.samples.push(dataUrl);
        this.isTrained = false;
        return dataUrl;
    }

    /**
     * Simpan sample — cepat ala Teachable Machine (Hold to Record).
     * Mode objek/wajah: crop panduan saja (tanpa MediaPipe/CV berat).
     * @returns {Promise<string|null>} data URL yang disimpan
     */
    async addSample (classId, dataUrl) {
        const cls = this.classes.find(c => c.id === classId);
        if (!cls || !dataUrl) return null;

        let stored = null;
        try {
            if (this.detectMode === 'objects') {
                stored = await this._prepareObjectSampleFast(dataUrl);
            } else if (this.detectMode === 'faces') {
                stored = await this._prepareFaceSampleFast(dataUrl);
            } else {
                stored = dataUrl;
            }
        } catch (e) {
            stored = dataUrl;
        }

        if (!stored) stored = dataUrl;
        cls.samples.push(stored);
        this.isTrained = false;
        return stored;
    }

    clearSamples (classId) {
        const cls = this.classes.find(c => c.id === classId);
        if (!cls) return;
        cls.samples = [];
        this.isTrained = false;
        this.exampleCount = 0;
        this._disposeHeadModel(this._headModel);
        this._headModel = null;
        this._knn = null;
        this._labelNames = [];
        this._saveModeSlot(this.detectMode);
    }

    async ensureEngine () {
        if (this._engineReady && this._mobilenet) {
            // Objek: MediaPipe untuk crop sample (buang muka dari foto train)
            this._ensureMediaPipeFace().catch(() => {});
            return;
        }
        if (this._engineLoading) return this._engineLoading;

        this._engineLoading = (async () => {
            const tf = require('@tensorflow/tfjs');
            await tf.setBackend('webgl');
            await tf.ready();
            const mobilenet = require('@tensorflow-models/mobilenet');
            this._mobilenet = await mobilenet.load({version: 2, alpha: 1.0});
            this._engineReady = true;
            this._engineLoading = null;
            await this._ensureMediaPipeFace().catch(() => {});
        })().catch(err => {
            this._engineLoading = null;
            this._engineReady = false;
            throw err;
        });

        return this._engineLoading;
    }

    /**
     * Train ala Teachable Machine:
     * MobileNet embedding → Dense head (softmax) di-fit beberapa epoch.
     * @param {{onProgress?: function}|undefined} opts
     */
    async train (opts) {
        const onProgress = opts && typeof opts.onProgress === 'function' ?
            opts.onProgress :
            null;
        this._ensureIdleClass();
        const ready = this.classes.filter(c => c.samples.length > 0);
        if (ready.length < 2) {
            return {
                ok: false,
                message: 'Need at least 2 classes with samples.',
                exampleCount: 0
            };
        }
        // Class netral opsional (ala Teachable Machine: cukup 2+ class benda)

        const tf = require('@tensorflow/tfjs');
        try {
            if (onProgress) onProgress('Memuat MobileNet…');
            await this.ensureEngine();
        } catch (e) {
            return {
                ok: false,
                message: 'Failed to load MobileNet.',
                exampleCount: 0
            };
        }

        const labelNames = ready.map(c => c.name);
        const labelIndex = Object.create(null);
        for (let i = 0; i < labelNames.length; i++) labelIndex[labelNames[i]] = i;

        const embeddingTensors = [];
        const labelIds = [];
        let count = 0;

        for (const cls of ready) {
            if (onProgress) onProgress(`Embedding ${cls.name}…`);
            for (const dataUrl of cls.samples) {
                // eslint-disable-next-line no-await-in-loop
                const img = await this._loadImage(dataUrl);
                if (!img) continue;
                // Objek: sample sudah crop guide; wajah: center crop
                // eslint-disable-next-line no-await-in-loop
                const views = this.detectMode === 'objects' ?
                    await this._objectTrainViews(img) :
                    [this._centerCropToCanvas(img)];
                for (let v = 0; v < views.length; v++) {
                    const cropped = views[v];
                    if (!cropped) continue;
                    const activation = this._mobilenet.infer(cropped, true);
                    // infer → [1, D]; simpan [D]
                    embeddingTensors.push(tf.squeeze(activation));
                    activation.dispose();
                    labelIds.push(labelIndex[cls.name]);
                    count += 1;
                }
            }
        }

        if (count < 2 || embeddingTensors.length < 2) {
            embeddingTensors.forEach(t => t.dispose());
            return {ok: false, message: 'Not enough valid samples.', exampleCount: 0};
        }

        if (onProgress) onProgress('Training dense head…');
        let xs = null;
        let ys = null;
        let head = null;
        try {
            xs = tf.stack(embeddingTensors);
            embeddingTensors.forEach(t => t.dispose());
            embeddingTensors.length = 0;
            const embSize = xs.shape[1];
            ys = tf.oneHot(tf.tensor1d(labelIds, 'int32'), labelNames.length);

            head = tf.sequential({
                layers: [
                    tf.layers.dense({
                        inputShape: [embSize],
                        units: HEAD_DENSE_UNITS,
                        activation: 'relu'
                    }),
                    tf.layers.dropout({rate: 0.2}),
                    tf.layers.dense({
                        units: labelNames.length,
                        activation: 'softmax'
                    })
                ]
            });
            head.compile({
                optimizer: tf.train.adam(HEAD_LEARNING_RATE),
                loss: 'categoricalCrossentropy',
                metrics: ['accuracy']
            });

            const batchSize = Math.min(HEAD_BATCH, Math.max(2, Math.floor(count / 2)));
            await head.fit(xs, ys, {
                epochs: HEAD_EPOCHS,
                batchSize,
                shuffle: true,
                callbacks: onProgress ? {
                    onEpochEnd: (epoch) => {
                        if (epoch % 5 === 0 || epoch === HEAD_EPOCHS - 1) {
                            onProgress(`Epoch ${epoch + 1}/${HEAD_EPOCHS}…`);
                        }
                    }
                } : undefined
            });
        } catch (eTrain) {
            embeddingTensors.forEach(t => {
                try { t.dispose(); } catch (e) { /* ignore */ }
            });
            if (xs) xs.dispose();
            if (ys) ys.dispose();
            this._disposeHeadModel(head);
            return {
                ok: false,
                message: eTrain && eTrain.message ?
                    `Train gagal: ${eTrain.message}` :
                    'Train gagal.',
                exampleCount: 0
            };
        } finally {
            if (xs) xs.dispose();
            if (ys) ys.dispose();
        }

        // Train lokal → nonaktifkan model Teachable Machine impor
        if (this._tmModel && typeof this._tmModel.dispose === 'function') {
            try {
                this._tmModel.dispose();
            } catch (e) { /* ignore */ }
        }
        this._tmModel = null;
        this._tmMetadata = null;
        this.tmModelUrl = '';
        this.modelSource = 'lab';

        this._disposeHeadModel(this._headModel);
        this._headModel = head;
        this._knn = null;
        this._labelNames = labelNames;
        this.exampleCount = count;
        this.isTrained = true;
        this._trackMap = Object.create(null);
        this._saveModeSlot(this.detectMode);

        if (onProgress) onProgress('Selesai');
        return {
            ok: true,
            message: `Trained ${count} views · ${HEAD_EPOCHS} epoch · mode ${this.detectMode}.`,
            exampleCount: count
        };
    }

    /**
     * @param {HTMLVideoElement|HTMLImageElement|HTMLCanvasElement} element
     * @param {{detectMode?: string}=} opts
     * @returns {Promise<{className:string, confidence:number, detections:Array, labels:Array}|null>}
     */
    async predictFromElement (element, opts) {
        if (!element) return null;

        // Model eksternal Teachable Machine (full-frame)
        if (this.modelSource === 'teachablemachine' && this._tmModel) {
            return this._predictTeachableMachine(element);
        }

        if (!this.isTrained || !this._mobilenet || !(this._headModel || this._knn)) {
            return null;
        }
        // Cegah race: preview 70ms + inferensi lambat → track/kotak numpuk
        if (this._labPredictBusy) {
            return {
                className: this.currentClass || '',
                confidence: this.currentConfidence || 0,
                detections: this.currentDetections || [],
                labels: this.currentLabels || []
            };
        }
        this._labPredictBusy = true;
        try {
            if (opts && opts.detectMode) {
                this.setDetectMode(opts.detectMode);
            }

            this._frameSeq += 1;
            const classNames = (this._labelNames || []).filter(n => n && String(n).trim());
            let detections = [];
            const scoreByClass = Object.create(null);
            for (let i = 0; i < classNames.length; i++) {
                scoreByClass[classNames[i]] = 0;
            }

            if (this.detectMode === 'faces') {
                try {
                    detections = await this._detectFaces(element);
                } catch (e) {
                    detections = [];
                }
                detections = this._stabilizeTracks(detections);
                detections = this._nmsBoxes(detections, 0.25);
                for (let i = 0; i < detections.length; i++) {
                    const d = detections[i];
                    if (!d || !d.className) continue;
                    scoreByClass[d.className] = Math.max(
                        scoreByClass[d.className] || 0,
                        d.confidence || 0
                    );
                }
                if (!detections.length) {
                    const fillCanvas = this._centerCropToCanvas(element);
                    const whole = await this._classifyCanvas(fillCanvas);
                    if (whole && whole.confidences) {
                        const keys = Object.keys(whole.confidences);
                        for (let k = 0; k < keys.length; k++) {
                            const name = keys[k];
                            const v = whole.confidences[name];
                            if (typeof v === 'number') scoreByClass[name] = v;
                        }
                    }
                }
            } else {
                // Objek: 1 kotak tampil + multi-label skor class
                let obj = null;
                try {
                    obj = await this._detectObjectsOne(element);
                } catch (e) {
                    obj = null;
                }
                if (obj && obj.scores) {
                    const keys = Object.keys(obj.scores);
                    for (let k = 0; k < keys.length; k++) {
                        scoreByClass[keys[k]] = obj.scores[keys[k]];
                    }
                }
                // Mode objek: kotak FIXED — jangan track/geser
                if (obj && obj.box && obj.className &&
                    !this._isIdleClassName(obj.className) &&
                    (obj.confidence || 0) >= OBJECT_POSITIVE_MIN) {
                    this._trackMap = Object.create(null);
                    detections = [{
                        className: obj.className,
                        confidence: obj.confidence,
                        box: {
                            x: OBJECT_CAPTURE_GUIDE.x,
                            y: OBJECT_CAPTURE_GUIDE.y,
                            w: OBJECT_CAPTURE_GUIDE.w,
                            h: OBJECT_CAPTURE_GUIDE.h
                        },
                        fromCoco: false
                    }];
                } else {
                    this._trackMap = Object.create(null);
                    detections = [];
                }
            }

            const uniq = classNames.map(name => ({
                className: name,
                confidence: Math.max(0, Math.min(100, scoreByClass[name] || 0))
            })).sort((a, b) => b.confidence - a.confidence);

            this.currentDetections = detections;
            this.currentLabels = uniq;

            if (detections.length) {
                const top = detections[0];
                this.currentClass = top.className;
                this.currentConfidence = top.confidence;
            } else if (uniq.length && uniq[0].confidence > 0) {
                // Tidak ada kotak benda — bisa class kosong / gate kulit
                this.currentClass = uniq[0].className;
                this.currentConfidence = uniq[0].confidence;
            } else {
                this.currentClass = '';
                this.currentConfidence = 0;
            }

            return {
                className: this.currentClass || '',
                confidence: this.currentConfidence || 0,
                detections,
                labels: uniq
            };
        } finally {
            this._labPredictBusy = false;
        }
    }

    // --- Mode wajah (MediaPipe saja) ---

    async _ensureMediaPipeFace () {
        if (this._mpFaceReady && this._mpFaceDetector) return true;
        if (this._mpFaceLoading) return this._mpFaceLoading;

        this._mpFaceLoading = (async () => {
            const tf = require('@tensorflow/tfjs');
            await tf.setBackend('webgl');
            await tf.ready();
            const faceDetection = require('@tensorflow-models/face-detection');
            const model = faceDetection.SupportedModels.MediaPipeFaceDetector;
            try {
                this._mpFaceDetector = await faceDetection.createDetector(model, {
                    runtime: 'tfjs',
                    modelType: 'short',
                    maxFaces: 5
                });
            } catch (eTfjs) {
                this._mpFaceDetector = await faceDetection.createDetector(model, {
                    runtime: 'mediapipe',
                    solutionPath: 'https://cdn.jsdelivr.net/npm/@mediapipe/face_detection@0.4.1646425229',
                    modelType: 'short',
                    maxFaces: 5
                });
            }
            this._mpFaceReady = true;
            this._mpFaceLoading = null;
            return true;
        })().catch(err => {
            this._mpFaceLoading = null;
            this._mpFaceReady = false;
            this._mpFaceDetector = null;
            throw err;
        });

        return this._mpFaceLoading;
    }

    async _detectFaces (element) {
        const ok = await this._ensureMediaPipeFace().catch(() => false);
        if (!ok || !this._mpFaceDetector) return [];

        const canvas = this._frameToCanvas(element);
        if (!canvas) return [];

        let faces = [];
        try {
            faces = await this._mpFaceDetector.estimateFaces(canvas, {flipHorizontal: false});
        } catch (e) {
            return [];
        }
        if (!faces || !faces.length) return [];

        const classNames = (this._labelNames || []).filter(n => n && String(n).trim());
        const out = [];
        const w = canvas.width || 1;
        const h = canvas.height || 1;

        for (let i = 0; i < faces.length; i++) {
            const f = faces[i];
            const box = f.box || {};
            let bx; let by; let bw; let bh;
            if (typeof box.xMin === 'number' && typeof box.width === 'number') {
                bx = box.xMin / w;
                by = box.yMin / h;
                bw = box.width / w;
                bh = box.height / h;
            } else if (Array.isArray(f.boundingBox) && f.boundingBox.length >= 4) {
                // [x1,y1,x2,y2] fallback
                bx = f.boundingBox[0] / w;
                by = f.boundingBox[1] / h;
                bw = (f.boundingBox[2] - f.boundingBox[0]) / w;
                bh = (f.boundingBox[3] - f.boundingBox[1]) / h;
            } else {
                continue;
            }
            // pad sedikit
            const pad = 0.08;
            bx = Math.max(0, bx - pad * bw);
            by = Math.max(0, by - pad * bh);
            bw = Math.min(1 - bx, bw * (1 + 2 * pad));
            bh = Math.min(1 - by, bh * (1 + 2 * pad));
            if (bw < 0.04 || bh < 0.04) continue;

            const region = {x: bx, y: by, w: bw, h: bh};
            let className = 'unknown';
            let confidence = 40;
            let confidences = null;
            if (classNames.length) {
                const scored = await this._classifyRegion(element, region);
                if (scored) {
                    className = scored.className;
                    confidence = scored.confidence >= FACE_CLASS_MIN * 100 ?
                        scored.confidence :
                        Math.max(25, scored.confidence);
                    confidences = scored.confidences || null;
                }
            }
            out.push({className, confidence, box: region, confidences});
        }

        // NMS lintas label (1 wajah = 1 kotak)
        out.sort((a, b) => b.confidence - a.confidence);
        const kept = [];
        for (let i = 0; i < out.length; i++) {
            let overlap = false;
            for (let j = 0; j < kept.length; j++) {
                if (this._iou(out[i].box, kept[j].box) >= 0.35) {
                    overlap = true;
                    break;
                }
            }
            if (!overlap) kept.push(out[i]);
        }
        return kept;
    }
    async _detectObjectsOne (element) {
        const classNames = (this._labelNames || []).filter(n => n && String(n).trim());
        if (!classNames.length) return null;

        const fixedBox = {
            x: OBJECT_CAPTURE_GUIDE.x,
            y: OBJECT_CAPTURE_GUIDE.y,
            w: OBJECT_CAPTURE_GUIDE.w,
            h: OBJECT_CAPTURE_GUIDE.h
        };
        const scores = Object.create(null);
        for (let i = 0; i < classNames.length; i++) scores[classNames[i]] = 0;

        // Satu crop seperti webcam TM (area panduan)
        const scored = await this._classifyRegion(element, fixedBox);
        if (!scored || !scored.confidences) {
            return {
                box: null,
                className: '',
                confidence: 0,
                fromCoco: false,
                scores
            };
        }

        for (let i = 0; i < classNames.length; i++) {
            const name = classNames[i];
            const v = scored.confidences[name];
            scores[name] = typeof v === 'number' ? v : 0;
        }

        const winner = scored.className || '';
        const confidence = scored.confidence || 0;

        // Class netral / idle → skor tetap ditampilkan, tanpa kotak benda
        if (this._isIdleClassName(winner) || confidence < 25) {
            return {
                box: null,
                className: winner,
                confidence,
                fromCoco: false,
                scores
            };
        }

        return {
            box: fixedBox,
            className: winner,
            confidence,
            fromCoco: false,
            scores
        };
    }

    async _classifyRegion (element, region) {
        const canvas = this._regionToCanvas(element, region);
        if (!canvas) return null;
        return this._classifyCanvas(canvas);
    }

    async _classifyCanvas (canvas) {
        if (!canvas || !this._mobilenet) return null;
        if (!this._headModel && !this._knn) return null;

        const activation = this._mobilenet.infer(canvas, true);
        try {
            // Prefer dense head (TM-style)
            if (this._headModel) {
                const probs = this._headModel.predict(activation);
                try {
                    const data = await probs.data();
                    const labels = this._labelNames || [];
                    const confidencesPct = Object.create(null);
                    let bestName = '';
                    let best = -1;
                    let second = 0;
                    for (let i = 0; i < labels.length; i++) {
                        const v = (data[i] || 0) * 100;
                        confidencesPct[labels[i]] = v;
                        if (v > best) {
                            second = best;
                            best = v;
                            bestName = labels[i];
                        } else if (v > second) {
                            second = v;
                        }
                    }
                    return {
                        className: bestName,
                        confidence: best,
                        margin: (best - second) / 100,
                        confidences: confidencesPct
                    };
                } finally {
                    probs.dispose();
                }
            }

            // Fallback KNN (slot lama)
            const k = Math.min(10, Math.max(3, this.exampleCount));
            const result = await this._knn.predictClass(activation, k);
            const confidences = result.confidences || {};
            const conf = typeof confidences[result.label] === 'number' ?
                confidences[result.label] * 100 :
                0;
            let second = 0;
            const keys = Object.keys(confidences);
            for (let i = 0; i < keys.length; i++) {
                if (keys[i] === result.label) continue;
                const v = confidences[keys[i]] * 100;
                if (v > second) second = v;
            }
            const confidencesPct = Object.create(null);
            for (let i = 0; i < keys.length; i++) {
                const name = keys[i];
                const v = confidences[name];
                confidencesPct[name] = typeof v === 'number' ? v * 100 : 0;
            }
            for (let i = 0; i < (this._labelNames || []).length; i++) {
                const name = this._labelNames[i];
                if (confidencesPct[name] == null) confidencesPct[name] = 0;
            }
            return {
                className: result.label,
                confidence: conf,
                margin: (conf - second) / 100,
                confidences: confidencesPct
            };
        } finally {
            activation.dispose();
        }
    }

    // --- Tracking & geometry ---

    /**
     * Gabungkan deteksi overlap → 1 kotak (cegah numpuk).
     */
    _nmsBoxes (list, iouThresh) {
        const sorted = (list || []).slice()
            .filter(d => d && d.box)
            .sort((a, b) => (b.confidence || 0) - (a.confidence || 0));
        const kept = [];
        for (let i = 0; i < sorted.length; i++) {
            let overlap = false;
            for (let j = 0; j < kept.length; j++) {
                if (this._iou(sorted[i].box, kept[j].box) >= iouThresh) {
                    overlap = true;
                    break;
                }
            }
            if (!overlap) kept.push(sorted[i]);
        }
        return kept;
    }

    /** Stabilkan kotak wajah antar-frame (mode objects pakai kotak fixed, tidak lewat sini). */
    _stabilizeTracks (detections) {
        const incoming = this._nmsBoxes(detections, 0.25);
        const next = Object.create(null);
        const matched = [];
        const usedTrackKeys = Object.create(null);

        for (let i = 0; i < incoming.length; i++) {
            const d = incoming[i];
            let conf = d.confidence || 0;
            let bestKey = null;
            let bestIou = 0;
            const keys = Object.keys(this._trackMap);
            for (let k = 0; k < keys.length; k++) {
                if (usedTrackKeys[keys[k]]) continue;
                const t = this._trackMap[keys[k]];
                if (!t || !t.box) continue;
                const iou = this._iou(d.box, t.box);
                if (iou > bestIou) {
                    bestIou = iou;
                    bestKey = keys[k];
                }
            }
            let key = bestKey && bestIou >= TRACK_IOU_MATCH ? bestKey : null;
            if (!key && d.className) {
                const classKey = `faces:${d.className}`;
                if (!usedTrackKeys[classKey]) key = classKey;
            }
            if (!key) key = `t_${this._frameSeq}_${i}`;
            usedTrackKeys[key] = true;

            const prev = this._trackMap[key];
            let box = d.box;
            if (prev && prev.box) {
                const a = 0.7;
                box = {
                    x: prev.box.x * (1 - a) + d.box.x * a,
                    y: prev.box.y * (1 - a) + d.box.y * a,
                    w: prev.box.w * (1 - a) + d.box.w * a,
                    h: prev.box.h * (1 - a) + d.box.h * a
                };
            }
            next[key] = {
                box,
                confidence: conf,
                className: d.className,
                confidences: d.confidences || null,
                miss: 0
            };
            matched.push({
                className: d.className,
                confidence: conf,
                box,
                confidences: d.confidences || null
            });
        }

        // Ghost track singkat agar wajah tidak kedip
        const oldKeys = Object.keys(this._trackMap);
        for (let i = 0; i < oldKeys.length; i++) {
            const k = oldKeys[i];
            if (next[k]) continue;
            const t = this._trackMap[k];
            if (!t || !t.box) continue;
            t.miss = (t.miss || 0) + 1;
            if (t.miss > 1) continue;
            let overlapsLive = false;
            for (let j = 0; j < matched.length; j++) {
                if (this._iou(t.box, matched[j].box) >= 0.2) {
                    overlapsLive = true;
                    break;
                }
            }
            if (overlapsLive) continue;
            next[k] = t;
            matched.push({
                className: t.className,
                confidence: Math.max(20, (t.confidence || 40) * 0.8),
                box: t.box,
                confidences: t.confidences || null
            });
        }

        this._trackMap = next;
        return this._nmsBoxes(matched, 0.25);
    }

    _iou (a, b) {
        if (!a || !b) return 0;
        const x1 = Math.max(a.x, b.x);
        const y1 = Math.max(a.y, b.y);
        const x2 = Math.min(a.x + a.w, b.x + b.w);
        const y2 = Math.min(a.y + a.h, b.y + b.h);
        const iw = Math.max(0, x2 - x1);
        const ih = Math.max(0, y2 - y1);
        const inter = iw * ih;
        const union = a.w * a.h + b.w * b.h - inter;
        return union > 0 ? inter / union : 0;
    }

    _frameToCanvas (element) {
        const w = element.videoWidth || element.naturalWidth || element.width || 0;
        const h = element.videoHeight || element.naturalHeight || element.height || 0;
        if (!w || !h) return null;
        if (!this._faceScratchCanvas) {
            this._faceScratchCanvas = document.createElement('canvas');
            this._faceScratchCtx = this._faceScratchCanvas.getContext('2d', {willReadFrequently: true});
        }
        const maxSide = 480;
        const scale = Math.min(1, maxSide / Math.max(w, h));
        const cw = Math.max(1, Math.round(w * scale));
        const ch = Math.max(1, Math.round(h * scale));
        this._faceScratchCanvas.width = cw;
        this._faceScratchCanvas.height = ch;
        this._faceScratchCtx.drawImage(element, 0, 0, cw, ch);
        return this._faceScratchCanvas;
    }

    _regionToCanvas (element, region) {
        const srcW = element.videoWidth || element.naturalWidth || element.width || 0;
        const srcH = element.videoHeight || element.naturalHeight || element.height || 0;
        if (!srcW || !srcH || !region) return null;
        if (!this._regionCanvas) {
            this._regionCanvas = document.createElement('canvas');
            this._regionCanvas.width = 224;
            this._regionCanvas.height = 224;
            this._regionCtx = this._regionCanvas.getContext('2d', {willReadFrequently: true});
        }
        const sx = region.x * srcW;
        const sy = region.y * srcH;
        const sw = Math.max(1, region.w * srcW);
        const sh = Math.max(1, region.h * srcH);
        this._regionCtx.clearRect(0, 0, 224, 224);
        this._regionCtx.drawImage(element, sx, sy, sw, sh, 0, 0, 224, 224);
        return this._regionCanvas;
    }

    // --- Blocks ---

    openLab () {
        this.runtime.emit('OPEN_ML_LAB', {extensionId: 'imageclassify'});
        this.ensureEngine().catch(() => {});
    }

    startClassifying () {
        const ready = this.isTrained ||
            (this.modelSource === 'teachablemachine' && this._tmModel);
        if (!ready) {
            this.currentClass = '';
            this.currentConfidence = 0;
            return;
        }
        if (this.isPredicting) return;
        this.isPredicting = true;
        this.runtime.ioDevices.video.enableVideo();
        this._predictLoop();
    }

    stopClassifying () {
        this.isPredicting = false;
        if (this._predictTimer) {
            clearTimeout(this._predictTimer);
            this._predictTimer = null;
        }
    }

    whenClassDetected (args) {
        const ready = this.isTrained ||
            (this.modelSource === 'teachablemachine' && this._tmModel);
        if (!this.isPredicting || !ready) return false;
        const wanted = String(args.CLASS || '');
        return this.currentClass === wanted && this.currentConfidence >= MIN_CONFIDENCE * 100;
    }

    isClass (args) {
        return this.currentClass === String(args.CLASS || '');
    }

    getClassName () {
        return this.currentClass || '';
    }

    getConfidence () {
        return Math.round(this.currentConfidence);
    }

    isModelReady () {
        return !!(this.isTrained ||
            (this.modelSource === 'teachablemachine' && this._tmModel));
    }

    _refreshBlocks () {
        if (this.runtime && this.runtime.extensionManager) {
            this.runtime.extensionManager.refreshBlocks();
        }
    }

    _loadImage (dataUrl) {
        return new Promise(resolve => {
            const img = new Image();
            img.onload = () => resolve(img);
            img.onerror = () => resolve(null);
            img.src = dataUrl;
        });
    }

    /**
     * Crop cepat ke kotak hijau — untuk Hold to Record (tanpa MediaPipe/CV).
     * @returns {Promise<string|null>}
     */
    async _prepareObjectSampleFast (dataUrl) {
        const img = await this._loadImage(dataUrl);
        if (!img) return null;
        return this._cropRegionToDataUrl(img, OBJECT_CAPTURE_GUIDE, 0.01);
    }

    /**
     * Crop cepat zona wajah — tidak await detektor (burst tetap lancar).
     * @returns {Promise<string|null>}
     */
    async _prepareFaceSampleFast (dataUrl) {
        const img = await this._loadImage(dataUrl);
        if (!img) return null;
        return this._cropRegionToDataUrl(img, {x: 0.22, y: 0.1, w: 0.56, h: 0.58}, 0.02);
    }
    async _objectTrainViews (img) {
        const views = [];
        const fitted = this._fitContainToCanvas(img);
        if (fitted) {
            views.push(this._cloneCanvas(fitted));
            // Flip horizontal — augment ala TM
            const flipped = document.createElement('canvas');
            flipped.width = fitted.width;
            flipped.height = fitted.height;
            const ctx = flipped.getContext('2d');
            ctx.translate(flipped.width, 0);
            ctx.scale(-1, 1);
            ctx.drawImage(fitted, 0, 0);
            views.push(flipped);
        }
        if (!views.length) {
            views.push(this._cloneCanvas(this._centerCropToCanvas(img)));
        }
        return views;
    }

    _cloneCanvas (src) {
        if (!src) return null;
        const out = document.createElement('canvas');
        out.width = src.width;
        out.height = src.height;
        out.getContext('2d').drawImage(src, 0, 0);
        return out;
    }

    _padBox (box, pad) {
        const px = box.w * pad;
        const py = box.h * pad;
        const x = Math.max(0, box.x - px);
        const y = Math.max(0, box.y - py);
        const w = Math.min(1 - x, box.w + 2 * px);
        const h = Math.min(1 - y, box.h + 2 * py);
        return {x, y, w, h};
    }

    _cropRegionToDataUrl (element, box, pad) {
        const region = this._padBox(box, pad || 0);
        const srcW = element.videoWidth || element.naturalWidth || element.width || 0;
        const srcH = element.videoHeight || element.naturalHeight || element.height || 0;
        if (!srcW || !srcH) return null;
        const sx = region.x * srcW;
        const sy = region.y * srcH;
        const sw = Math.max(8, region.w * srcW);
        const sh = Math.max(8, region.h * srcH);
        const out = document.createElement('canvas');
        // Simpan crop objek (bukan full body)
        const side = Math.max(sw, sh);
        out.width = Math.min(320, Math.round(side));
        out.height = Math.min(320, Math.round(side * (sh / sw)));
        if (out.height < 8) out.height = out.width;
        const ctx = out.getContext('2d');
        ctx.fillStyle = '#111';
        ctx.fillRect(0, 0, out.width, out.height);
        // contain
        const scale = Math.min(out.width / sw, out.height / sh);
        const dw = sw * scale;
        const dh = sh * scale;
        const dx = (out.width - dw) / 2;
        const dy = (out.height - dh) / 2;
        ctx.drawImage(element, sx, sy, sw, sh, dx, dy, dw, dh);
        try {
            return out.toDataURL('image/jpeg', 0.88);
        } catch (e) {
            return null;
        }
    }

    /** Masukkan seluruh sample ke 224×224 (letterbox) — cocok crop benda. */
    _fitContainToCanvas (element) {
        if (!this._cropCanvas) {
            this._cropCanvas = document.createElement('canvas');
            this._cropCanvas.width = 224;
            this._cropCanvas.height = 224;
            this._cropCtx = this._cropCanvas.getContext('2d', {willReadFrequently: true});
        }
        const srcW = element.videoWidth || element.naturalWidth || element.width || 224;
        const srcH = element.videoHeight || element.naturalHeight || element.height || 224;
        this._cropCtx.fillStyle = '#202020';
        this._cropCtx.fillRect(0, 0, 224, 224);
        const scale = Math.min(224 / srcW, 224 / srcH);
        const dw = srcW * scale;
        const dh = srcH * scale;
        const dx = (224 - dw) / 2;
        const dy = (224 - dh) / 2;
        this._cropCtx.drawImage(element, 0, 0, srcW, srcH, dx, dy, dw, dh);
        return this._cropCanvas;
    }

    _centerCropToCanvas (element) {
        if (!this._cropCanvas) {
            this._cropCanvas = document.createElement('canvas');
            this._cropCanvas.width = 224;
            this._cropCanvas.height = 224;
            this._cropCtx = this._cropCanvas.getContext('2d', {willReadFrequently: true});
        }
        const srcW = element.videoWidth || element.naturalWidth || element.width || 224;
        const srcH = element.videoHeight || element.naturalHeight || element.height || 224;
        const side = Math.min(srcW, srcH);
        const sx = (srcW - side) / 2;
        const sy = (srcH - side) / 2;
        this._cropCtx.clearRect(0, 0, 224, 224);
        this._cropCtx.drawImage(element, sx, sy, side, side, 0, 0, 224, 224);
        return this._cropCanvas;
    }

    async _predictLoop () {
        if (!this.isPredicting) return;
        if (!this._predictBusy) {
            this._predictBusy = true;
            try {
                const provider = this.runtime.ioDevices.video.provider;
                const videoEl = provider && provider.video;
                let result = null;
                if (videoEl && videoEl.readyState >= 2) {
                    result = await this.predictFromElement(videoEl);
                } else {
                    const canvasFrame = this.runtime.ioDevices.video.getFrame({
                        format: 'canvas',
                        dimensions: [STAGE_WIDTH, STAGE_HEIGHT]
                    });
                    if (canvasFrame) {
                        result = await this.predictFromElement(canvasFrame);
                    }
                }
                if (result) {
                    this.currentClass = result.className;
                    this.currentConfidence = result.confidence;
                }
            } catch (e) {
                // ignore
            } finally {
                this._predictBusy = false;
            }
        }
        this._predictTimer = setTimeout(() => this._predictLoop(), PREDICT_INTERVAL_MS);
    }
}

module.exports = RaceroImageClassify;
