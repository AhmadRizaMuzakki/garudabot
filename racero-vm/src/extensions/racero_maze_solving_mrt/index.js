const formatMessage = require('format-message');
const ArgumentType = require('../../extension-support/argument-type');
const BlockType = require('../../extension-support/block-type');

/**
 * Maze Solving MRT — hat Upload Program sebagai entry stack yang di-compile & di-upload.
 *
 * Blok hitam mengikuti pemanggilan di PDF:
 * hitam(MAJU, 20, 15, 2000)
 * Jenis aksi dipilih dari menu enum, bukan lubang kosong.
 */
const menuIconURI = 'data:image/svg+xml,' + encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 40 40">' +
    '<rect width="40" height="40" rx="8" fill="#1B4F72"/>' +
    '<path d="M8 8h8v8H8zm16 0h8v8h-8zM8 24h8v8H8zm16 0h8v8h-8z" fill="none" stroke="#F4D03F" stroke-width="2"/>' +
    '<path d="M16 12h8M12 16v8M28 16v8M16 28h8" fill="none" stroke="#5DADE2" stroke-width="2" stroke-linecap="round"/>' +
    '<circle cx="12" cy="12" r="2.2" fill="#E74C3C"/>' +
    '<circle cx="28" cy="28" r="2.2" fill="#2ECC71"/>' +
    '</svg>'
);


const NOTE_DO = 523;
const NOTE_RE = 587;
const NOTE_MI = 659;
const NOTE_SOL = 784;
const NOTE_LA = 880;
const NOTE_LOW = 250;

class RaceroMazeSolvingMrt {
    constructor (runtime) {
        this.runtime = runtime;
    }

    getInfo () {
        return {
            id: 'mazesolvingmrt',
            name: formatMessage({
                id: 'mazesolvingmrt.categoryName',
                default: 'Maze Solving MRT',
                description: 'Name of the Maze Solving MRT extension category'
            }),
            // Hanya icon di toolbar kiri — jangan tampil di dalam setiap block
            menuIconURI: menuIconURI,
            color1: '#E74C3C',
            color2: '#C0392B',
            color3: '#922B21',
            blocks: [
                {
                    opcode: 'uploadProgram',
                    blockType: BlockType.HAT,
                    text: formatMessage({
                        id: 'mazesolvingmrt.uploadProgram',
                        default: 'Generate Program',
                        description: 'Hat block marking the maze program stack to compile and upload'
                    }),
                    // Hat statis: penanda entry setup(), bukan event runtime Scratch
                    isEdgeActivated: false
                },
                {
                    opcode: 'MCU_Initialization',
                    blockType: BlockType.COMMAND,
                    text: 'mcu initialization'
                },
                {
                    opcode: 'kalibrasi_dan_cek_sensor',
                    blockType: BlockType.COMMAND,
                    text: 'kalibrasi dan cek sensor'
                },
                {
                    opcode: 'Tunggu_Start',
                    blockType: BlockType.COMMAND,
                    text: 'tunggu start'
                },
                '---',
                {
                    opcode: 'HITAM',
                    blockType: BlockType.COMMAND,
                    text: 'hitam [JenisAksi] v_cepat [vfast] v_lambat [vslow] milidetik [ms]',
                    arguments: {
                        JenisAksi: {
                            type: ArgumentType.STRING,
                            menu: 'jenisAksiMenu',
                            defaultValue: 'MAJU'
                        },
                        vfast: {
                            type: ArgumentType.NUMBER,
                            defaultValue: 20
                        },
                        vslow: {
                            type: ArgumentType.NUMBER,
                            defaultValue: 15
                        },
                        ms: {
                            type: ArgumentType.NUMBER,
                            defaultValue: 2000
                        }
                    }
                },
                '---',
                {
                    opcode: 'simpang',
                    blockType: BlockType.COMMAND,
                    text: 'simpang',
                    defaultValue: 0
                },
                {
                    opcode: 'Aksi_finish',
                    blockType: BlockType.COMMAND,
                    text: 'aksi finish'
                }
            ],
            menus: {
                jenisAksiMenu: {
                    acceptReporters: false,
                    items: [
                        {text: 'maju', value: 'MAJU'},
                        {text: 'maju ms', value: 'MAJU_MS'},
                        {text: 'mundur ms', value: 'MUNDUR_MS'},
                        {text: 'kiri ms', value: 'KIRI_MS'},
                        {text: 'kanan ms', value: 'KANAN_MS'},
                        {text: 'kiri line', value: 'KIRI_LINE'},
                        {text: 'kanan line', value: 'KANAN_LINE'},
                        {text: 'putar balik', value: 'PUTAR_BALIK'},
                        {text: 'berhenti ms', value: 'BERHENTI_MS'},
                        {text: 'garis putus', value: 'GARIS_PUTUS'},
                        {text: 'garis hilang', value: 'GARIS_HILANG'},
                        {text: 'garis paralel', value: 'GARIS_PARALEL'}
                    ]
                }
            }
        };
    }

    /**
     * Hat tidak dijalankan di VM Scratch — dipakai compiler sebagai entry upload.
     */
    uploadProgram () {}

    /**
     * Block HITAM — stub VM; logika line-follow diisi di compiler.
     * args: JenisAksi, vfast, vslow, ms
     */
    HITAM () {}

    /**
     * Block MCU Initialization — stub VM.
     */
    MCU_Initialization () {}

    /**
     * Block kalibrasi dan cek sensor — stub VM.
     */
    kalibrasi_dan_cek_sensor () {}

    /**
     * Block tunggu start — stub VM.
     */
    Tunggu_Start () {}

    /**
     * Block aksi finish — stub VM.
     */
    Aksi_finish () {}

    /**
     * Block simpang — stub VM (nama method = opcode).
     */
    simpang () {}

    /** Reporter jenis aksi — identifier enum C, tanpa tanda petik. */
    Maju () {
        return 'MAJU';
    }

    Maju_ms () {
        return 'MAJU_MS';
    }

    Mundur_ms () {
        return 'MUNDUR_MS';
    }

    Kiri_ms () {
        return 'KIRI_MS';
    }

    Kanan_ms () {
        return 'KANAN_MS';
    }

    Kiri_line () {
        return 'KIRI_LINE';
    }

    Kanan_line () {
        return 'KANAN_LINE';
    }

    Putar_balik () {
        return 'PUTAR_BALIK';
    }

    Berhenti_ms () {
        return 'BERHENTI_MS';
    }

    Garis_Putus () {
        return 'GARIS_PUTUS';
    }

    Garis_hilang () {
        return 'GARIS_HILANG';
    }

    Garis_Paralel () {
        return 'GARIS_PARALEL';
    }
}

module.exports = RaceroMazeSolvingMrt;
