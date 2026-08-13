/**
 * Extension Racero Fingers — pelacakan tangan dengan MediaPipe + TensorFlow.js.
 * Mendeteksi hingga 2 tangan, menggambar skeleton overlay, dan menyediakan
 * blok Scratch untuk posisi, deteksi, dan penghitungan jari.
 */
const handPoseDetection = require('@tensorflow-models/hand-pose-detection');
require('@tensorflow/tfjs-backend-webgl');

const formatMessage = require('format-message');

// Ukuran stage Scratch (harus sama dengan frame video agar koordinat akurat).
const STAGE_WIDTH = 480;
const STAGE_HEIGHT = 360;

// Indeks landmark MediaPipe, dipetakan ke nama titik yang mudah dipahami pengguna.
const LANDMARK_INDEX = {
    wrist: 0,
    palm: 9,
    'thumb tip': 4,
    'index tip': 8,
    'middle tip': 12,
    'ring tip': 16,
    'pinky tip': 20
};

// Warna skeleton per sisi tangan (kiri = cyan, kanan = hijau).
const HAND_COLORS = {
    Left: {stroke: '#00E5FF', fill: '#FF5252'},
    Right: {stroke: '#76FF03', fill: '#FF5252'},
    Unknown: {stroke: '#00FF00', fill: '#FF0000'}
};

// Ikon kategori extension Fingers di palette blok.
const iconURI = "data:image/png;base64,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";

class RaceroFingers {
    constructor (runtime) {
        this.runtime = runtime;
        this.model = null;
        this.hands = [];              // Hasil deteksi tangan terbaru dari MediaPipe
        this.isVideoRunning = false;  // Mencegah startTracking dipanggil berulang
        this.showSkeleton = true;
        this.detector = null;
        this.overlayCanvas = null;    // Canvas transparan di atas video stage
        this.ctx = null;
    }

    /**
     * Metadata extension: definisi blok, menu, dan warna kategori.
     * Blok dikelompokkan dengan pemisah '---' (setup / posisi / deteksi / info).
     */
    getInfo () {
        return {
            id: 'fingers',
            name: 'Fingers',
            blockIconURI: iconURI,
            color1: '#00A8CC',
            color2: '#007A99',
            color3: '#005566',
            blocks: [
                {
                    opcode: 'startTracking',
                    blockType: 'command',
                    text: formatMessage({
                        id: 'fingers.startTracking',
                        default: 'start fingers tracking [MODE]',
                        description: 'start fingers tracking'
                    }),
                    arguments: {
                        MODE: {
                            type: 'string',
                            menu: 'modeMenu',
                            defaultValue: 'lite'
                        }
                    }
                },
                {
                    opcode: 'toggleSkeleton',
                    blockType: 'command',
                    text: formatMessage({
                        id: 'fingers.toggleSkeleton',
                        default: 'show hand skeleton [STATE]',
                        description: 'toggle hand skeleton overlay'
                    }),
                    arguments: {
                        STATE: {
                            type: 'string',
                            menu: 'stateMenu',
                            defaultValue: 'on'
                        }
                    }
                },
                '---', // Pemisah: grup posisi tangan
                {
                    opcode: 'getHandPosition',
                    blockType: 'reporter',
                    text: formatMessage({
                        id: 'fingers.handPosition',
                        default: 'hand [POINT] [AXIS] position',
                        description: 'hand position'
                    }),
                    arguments: {
                        POINT: {
                            type: 'string',
                            menu: 'pointMenu',
                            defaultValue: 'index tip'
                        },
                        AXIS: {
                            type: 'string',
                            menu: 'axisMenu',
                            defaultValue: 'x'
                        }
                    }
                },
                {
                    opcode: 'getLeftHandPosition',
                    blockType: 'reporter',
                    text: formatMessage({
                        id: 'fingers.leftHandPosition',
                        default: 'left hand [POINT] [AXIS] position',
                        description: 'left hand position'
                    }),
                    arguments: {
                        POINT: {
                            type: 'string',
                            menu: 'pointMenu',
                            defaultValue: 'index tip'
                        },
                        AXIS: {
                            type: 'string',
                            menu: 'axisMenu',
                            defaultValue: 'x'
                        }
                    }
                },
                {
                    opcode: 'getRightHandPosition',
                    blockType: 'reporter',
                    text: formatMessage({
                        id: 'fingers.rightHandPosition',
                        default: 'right hand [POINT] [AXIS] position',
                        description: 'right hand position'
                    }),
                    arguments: {
                        POINT: {
                            type: 'string',
                            menu: 'pointMenu',
                            defaultValue: 'index tip'
                        },
                        AXIS: {
                            type: 'string',
                            menu: 'axisMenu',
                            defaultValue: 'x'
                        }
                    }
                },
                '---', // Pemisah: grup deteksi tangan
                {
                    opcode: 'handDetected',
                    blockType: 'Boolean',
                    text: formatMessage({
                        id: 'fingers.handDetected',
                        default: 'hand detected?',
                        description: 'whether a hand is currently detected'
                    })
                },
                {
                    opcode: 'leftHandDetected',
                    blockType: 'Boolean',
                    text: formatMessage({
                        id: 'fingers.leftHandDetected',
                        default: 'left hand detected?',
                        description: 'whether the left hand is detected'
                    })
                },
                {
                    opcode: 'rightHandDetected',
                    blockType: 'Boolean',
                    text: formatMessage({
                        id: 'fingers.rightHandDetected',
                        default: 'right hand detected?',
                        description: 'whether the right hand is detected'
                    })
                },
                '---', // Pemisah: grup info jari
                {
                    opcode: 'getFingersUp',
                    blockType: 'reporter',
                    text: formatMessage({
                        id: 'fingers.numberOfFingersUp',
                        default: 'number of fingers up',
                        description: 'number of fingers up'
                    })
                }
            ],
            menus: {
                axisMenu: {
                    acceptReporters: false,
                    items: ['x', 'y']
                },
                modeMenu: {
                    acceptReporters: false,
                    items: ['lite', 'full']
                },
                stateMenu: {
                    acceptReporters: false,
                    items: ['on', 'off']
                },
                pointMenu: {
                    acceptReporters: false,
                    items: [
                        {
                            text: formatMessage({
                                id: 'fingers.menu.indexTip',
                                default: 'index tip',
                                description: 'index fingertip'
                            }),
                            value: 'index tip'
                        },
                        {
                            text: formatMessage({
                                id: 'fingers.menu.palm',
                                default: 'palm',
                                description: 'palm center'
                            }),
                            value: 'palm'
                        },
                        {
                            text: formatMessage({
                                id: 'fingers.menu.wrist',
                                default: 'wrist',
                                description: 'wrist'
                            }),
                            value: 'wrist'
                        },
                        {
                            text: formatMessage({
                                id: 'fingers.menu.thumbTip',
                                default: 'thumb tip',
                                description: 'thumb tip'
                            }),
                            value: 'thumb tip'
                        },
                        {
                            text: formatMessage({
                                id: 'fingers.menu.middleTip',
                                default: 'middle tip',
                                description: 'middle fingertip'
                            }),
                            value: 'middle tip'
                        },
                        {
                            text: formatMessage({
                                id: 'fingers.menu.ringTip',
                                default: 'ring tip',
                                description: 'ring fingertip'
                            }),
                            value: 'ring tip'
                        },
                        {
                            text: formatMessage({
                                id: 'fingers.menu.pinkyTip',
                                default: 'pinky tip',
                                description: 'pinky fingertip'
                            }),
                            value: 'pinky tip'
                        }
                    ]
                }
            }
        };
    }

    /** Nyalakan webcam dan mulai loop deteksi tangan MediaPipe. */
    async startTracking (args) {
        if (this.isVideoRunning) return;

        this.isVideoRunning = true;
        this.runtime.ioDevices.video.enableVideo();

        const mode = args.MODE === 'full' ? 'full' : 'lite';
        const model = handPoseDetection.SupportedModels.MediaPipeHands;
        const detectorConfig = {
            runtime: 'tfjs',
            modelType: mode,
            maxHands: 2 // Dukung tangan kiri + kanan sekaligus
        };
        this.detector = await handPoseDetection.createDetector(model, detectorConfig);
        this.showSkeleton = true;
        this._ensureOverlay();
        this._trackLoop();
    }

    /** Buat canvas overlay transparan yang sejajar dengan stage Scratch. */
    _ensureOverlay () {
        if (this.overlayCanvas) return;

        const scratchCanvas = document.querySelector('canvas');
        if (!scratchCanvas || !scratchCanvas.parentElement) return;

        this.overlayCanvas = document.createElement('canvas');
        this.overlayCanvas.width = STAGE_WIDTH;
        this.overlayCanvas.height = STAGE_HEIGHT;
        this.overlayCanvas.style.position = 'absolute';
        this.overlayCanvas.style.top = '0';
        this.overlayCanvas.style.left = '0';
        this.overlayCanvas.style.width = '100%';
        this.overlayCanvas.style.height = '100%';
        this.overlayCanvas.style.pointerEvents = 'none';
        this.overlayCanvas.style.zIndex = '100';

        this.ctx = this.overlayCanvas.getContext('2d');
        scratchCanvas.parentElement.appendChild(this.overlayCanvas);
    }

    // --- Helper pencarian tangan ---

    /** Kembalikan tangan pertama yang terdeteksi (untuk blok umum). */
    _getPrimaryHand () {
        if (!this.hands || this.hands.length === 0) return null;
        return this.hands[0];
    }

    /** Cari tangan berdasarkan label MediaPipe ('left' atau 'right'). */
    _findHandBySide (side) {
        if (!this.hands || this.hands.length === 0) return null;

        const wanted = String(side || '').toLowerCase();
        return this.hands.find(hand =>
            this._getHandednessLabel(hand).toLowerCase() === wanted
        ) || null;
    }

    /**
     * Ambil koordinat x/y Scratch untuk landmark pada tangan tertentu.
     * @param {string|null} side - 'left', 'right', atau null untuk tangan utama
     */
    _getPositionForSide (side, args) {
        const hand = side ? this._findHandBySide(side) : this._getPrimaryHand();
        if (!hand || !hand.keypoints) return 0;

        const pointName = String(args.POINT || 'index tip').toLowerCase();
        const landmarkIndex = Object.prototype.hasOwnProperty.call(LANDMARK_INDEX, pointName) ?
            LANDMARK_INDEX[pointName] :
            LANDMARK_INDEX['index tip'];
        const point = hand.keypoints[landmarkIndex];
        if (!point) return 0;

        const scratch = this._toScratchCoords(point);
        const axis = String(args.AXIS || 'x').toLowerCase();
        if (axis === 'y') return scratch.y;
        return scratch.x;
    }

    /** Normalisasi handedness MediaPipe menjadi 'Left', 'Right', atau 'Unknown'. */
    _getHandednessLabel (hand) {
        if (!hand || !hand.handedness) return 'Unknown';
        // MediaPipe bisa mengembalikan string atau array hasil klasifikasi.
        if (typeof hand.handedness === 'string') return hand.handedness;
        if (Array.isArray(hand.handedness) && hand.handedness.length > 0) {
            const first = hand.handedness[0];
            return typeof first === 'string' ? first : (first.categoryName || first.displayName || 'Unknown');
        }
        return 'Unknown';
    }

    /** Konversi koordinat pixel video (origin kiri-atas) ke koordinat stage Scratch (origin tengah). */
    _toScratchCoords (point) {
        // Canvas video/skeleton: origin kiri-atas, +y ke bawah.
        // Stage Scratch: origin tengah, +y ke atas. X tidak di-flip agar sprite
        // selaras dengan overlay skeleton pada video (mirror).
        return {
            x: Math.round(point.x - (STAGE_WIDTH / 2)),
            y: Math.round((STAGE_HEIGHT / 2) - point.y)
        };
    }

    /** Hitung jarak Euclidean antara dua titik landmark. */
    _getDistance (p1, p2) {
        return Math.sqrt(Math.pow(p2.x - p1.x, 2) + Math.pow(p2.y - p1.y, 2));
    }

    /**
     * Hitung jumlah jari terangkat dengan membandingkan jarak ujung jari vs sendi PIP dari pergelangan.
     * Metode ini tahan rotasi tangan (tidak bergantung pada sumbu Y saja).
     */
    _countFingersUp (hand) {
        if (!hand || !hand.keypoints) return 0;

        const keypoints = hand.keypoints;
        let fingersUp = 0;

        const wrist = keypoints[0];
        const tips = [8, 12, 16, 20];   // Ujung telunjuk, tengah, manis, kelingking
        const pips = [6, 10, 14, 18];    // Sendi tengah (PIP) masing-masing jari

        for (let i = 0; i < tips.length; i++) {
            const tipDistance = this._getDistance(wrist, keypoints[tips[i]]);
            const pipDistance = this._getDistance(wrist, keypoints[pips[i]]);
            if (tipDistance > pipDistance) fingersUp += 1;
        }

        const pinkyBase = keypoints[17];
        const thumbTipDist = this._getDistance(pinkyBase, keypoints[4]);
        const thumbKnuckleDist = this._getDistance(pinkyBase, keypoints[3]);
        // Jempol: bandingkan jarak ujung jempol vs ruas bawah jempol dari dasar kelingking.
        if (thumbTipDist > thumbKnuckleDist) fingersUp += 1;

        return fingersUp;
    }

    // --- Handler blok (dipanggil oleh Scratch VM) ---

    /** Blok: jumlah jari terangkat (tangan pertama yang terdeteksi). */
    getFingersUp () {
        return this._countFingersUp(this._getPrimaryHand());
    }

    /** Blok: posisi tangan pertama yang terdeteksi. */
    getHandPosition (args) {
        return this._getPositionForSide(null, args);
    }

    /** Blok: posisi tangan kiri. */
    getLeftHandPosition (args) {
        return this._getPositionForSide('left', args);
    }

    /** Blok: posisi tangan kanan. */
    getRightHandPosition (args) {
        return this._getPositionForSide('right', args);
    }

    /** Blok: apakah ada tangan terdeteksi? */
    handDetected () {
        return !!this._getPrimaryHand();
    }

    /** Blok: apakah tangan kiri terdeteksi? */
    leftHandDetected () {
        return !!this._findHandBySide('left');
    }

    /** Blok: apakah tangan kanan terdeteksi? */
    rightHandDetected () {
        return !!this._findHandBySide('right');
    }

    /** Blok: tampilkan/sembunyikan overlay skeleton tangan. */
    toggleSkeleton (args) {
        this.showSkeleton = (args.STATE === 'on');

        if (!this.showSkeleton && this.ctx && this.overlayCanvas) {
            this.ctx.clearRect(0, 0, this.overlayCanvas.width, this.overlayCanvas.height);
        }
    }

    /**
     * Loop utama: baca frame webcam, jalankan deteksi tangan,
     * lalu perbarui overlay skeleton setiap frame.
     */
    async _trackLoop () {
        if (!this.isVideoRunning) return;

        const videoFrame = this.runtime.ioDevices.video.getFrame({
            format: 'canvas',
            dimensions: [STAGE_WIDTH, STAGE_HEIGHT]
        });

        if (videoFrame && this.detector) {
            try {
                this.hands = await this.detector.estimateHands(videoFrame, {
                    flipHorizontal: false // Video tidak di-mirror saat estimasi
                });

                if (this.showSkeleton && this.ctx) {
                    this._drawSkeletons(this.hands);
                } else if (this.ctx && this.overlayCanvas) {
                    this.ctx.clearRect(0, 0, this.overlayCanvas.width, this.overlayCanvas.height);
                }
            } catch (err) {
                console.error('Hand tracking error:', err);
            }
        }

        requestAnimationFrame(this._trackLoop.bind(this));
    }

    /** Gambar skeleton untuk semua tangan terdeteksi dengan warna berbeda per sisi. */
    _drawSkeletons (hands) {
        if (!this.ctx || !this.overlayCanvas) return;

        this.ctx.clearRect(0, 0, this.overlayCanvas.width, this.overlayCanvas.height);
        if (!hands || hands.length === 0) return;

        hands.forEach(hand => {
            const label = this._getHandednessLabel(hand);
            const colors = HAND_COLORS[label] || HAND_COLORS.Unknown;
            this._drawSkeleton(hand.keypoints, colors, label);
        });
    }

    /** Gambar sendi dan tulang satu tangan; label L/R di dekat pergelangan. */
    _drawSkeleton (keypoints, colors, label) {
        if (!keypoints || keypoints.length === 0) return;

        const fingerJoints = [
            // Ibu jari
            [0, 1], [1, 2], [2, 3], [3, 4],
            // Telunjuk
            [0, 5], [5, 6], [6, 7], [7, 8],
            // Jari tengah (terhubung ke telapak via [5,9])
            [5, 9], [9, 10], [10, 11], [11, 12],
            // Jari manis
            [9, 13], [13, 14], [14, 15], [15, 16],
            // Kelingking + sambungan telapak
            [13, 17], [17, 18], [18, 19], [19, 20],
            [0, 17]
        ];

        this.ctx.strokeStyle = colors.stroke;
        this.ctx.lineWidth = 4;

        fingerJoints.forEach(bone => {
            const startPoint = keypoints[bone[0]];
            const endPoint = keypoints[bone[1]];
            if (!startPoint || !endPoint) return;

            this.ctx.beginPath();
            this.ctx.moveTo(startPoint.x, startPoint.y);
            this.ctx.lineTo(endPoint.x, endPoint.y);
            this.ctx.stroke();
        });

        this.ctx.fillStyle = colors.fill;
        keypoints.forEach(point => {
            this.ctx.beginPath();
            this.ctx.arc(point.x, point.y, 5, 0, 2 * Math.PI);
            this.ctx.fill();
        });

        // Label di dekat pergelangan agar kiri/kanan jelas saat 2 tangan muncul.
        const wrist = keypoints[0];
        if (wrist && label && label !== 'Unknown') {
            this.ctx.fillStyle = colors.stroke;
            this.ctx.font = 'bold 14px sans-serif';
            this.ctx.fillText(label === 'Left' ? 'L' : 'R', wrist.x + 8, wrist.y - 8);
        }
    }

    /** Bersihkan state saat project di-stop atau extension di-unload. */
    reset () {
        this.isVideoRunning = false;
        this.hands = [];
        if (this.overlayCanvas && this.overlayCanvas.parentElement) {
            this.overlayCanvas.parentElement.removeChild(this.overlayCanvas);
        }
        this.overlayCanvas = null;
        this.ctx = null;
        this.detector = null;
    }
}

module.exports = RaceroFingers;
