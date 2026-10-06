import bindAll from 'lodash.bindall';
import PropTypes from 'prop-types';
import React from 'react';
import {connect} from 'react-redux';
import VM from 'racero-vm';

import MlLabComponent from '../components/ml-lab/ml-lab.jsx';
import {closeMlLab, openMlLab} from '../reducers/modals';

// Ala Teachable Machine Hold to Record — interval pendek
const BURST_INTERVAL_MS = 70;
const BURST_SYNC_MS = 250;
const FLASH_MS = 180;
const PREVIEW_INTERVAL_MS = 120;
const JPEG_QUALITY = 0.72;
/** Output crop kecil — cepat encode, cukup untuk MobileNet */
const CAPTURE_OUT_SIDE = 224;
const MAX_THUMBNAILS = 8;
const EXTENSION_ID = 'imageclassify';
/** Selaras OBJECT_CAPTURE_GUIDE di VM */
const OBJECT_GUIDE = {x: 0.16, y: 0.1, w: 0.68, h: 0.62};
const FACE_GUIDE = {x: 0.22, y: 0.1, w: 0.56, h: 0.58};

/**
 * ML Lab container — camera, burst capture, train, preview.
 * UI hidup di components/ml-lab; model hidup di VM extension.
 */
class MlLab extends React.Component {
    constructor (props) {
        super(props);
        bindAll(this, [
            'setVideoRef',
            'syncFromExtension',
            'handleSetTab',
            'handleSelectMode',
            'handleSelectClass',
            'handleAddClass',
            'handleRenameClass',
            'handleRemoveClass',
            'handleCapture',
            'handleShutterDown',
            'handleShutterUp',
            'handleClearSamples',
            'handleTrain',
            'handleUseInProject',
            'handleClose',
            'handleOpenFromVm',
            'handleTmUrlChange',
            'handleLoadTeachableMachine',
            'handleClearTeachableMachine',
            'startCamera',
            'stopCamera',
            'startPreviewLoop',
            'stopPreviewLoop',
            'stopBurstCapture',
            'triggerFlash'
        ]);
        this.videoEl = null;
        this.stream = null;
        this.previewTimer = null;
        this.flashTimer = null;
        this.burstTimer = null;
        this.burstBusy = false;
        this.burstSyncTimer = null;
        this._burstPointerUp = null;
        this.state = {
            tab: 'mode',
            detectMode: 'objects',
            classes: [],
            selectedClassId: null,
            isCameraReady: false,
            isTraining: false,
            isTrained: false,
            trainStatus: '',
            trainError: '',
            previewLabel: '',
            previewConfidence: 0,
            previewLabels: [],
            previewDetections: [],
            flashActive: false,
            isBursting: false,
            modelSource: 'lab',
            tmUrl: '',
            tmStatus: '',
            tmError: '',
            tmLoading: false
        };
    }

    componentDidMount () {
        if (this.props.vm) {
            this.props.vm.on('OPEN_ML_LAB', this.handleOpenFromVm);
        }
        if (this.props.visible) {
            this.onOpen();
        }
    }

    componentDidUpdate (prevProps) {
        if (this.props.visible && !prevProps.visible) {
            this.onOpen();
        } else if (!this.props.visible && prevProps.visible) {
            this.onCloseCleanup();
        }
    }

    componentWillUnmount () {
        this.onCloseCleanup();
        if (this.flashTimer) {
            clearTimeout(this.flashTimer);
        }
        if (this.props.vm) {
            this.props.vm.removeListener('OPEN_ML_LAB', this.handleOpenFromVm);
        }
    }

    handleOpenFromVm () {
        this.props.onOpen();
    }

    onOpen () {
        this.syncFromExtension();
        this.setState({tab: 'mode'});
        const ext = this.getExtension();
        if (ext && typeof ext.ensureEngine === 'function') {
            ext.ensureEngine().catch(() => {});
        }
        if (ext && typeof ext.setDetectMode === 'function') {
            ext.setDetectMode(this.state.detectMode || 'objects');
        }
    }

    onCloseCleanup () {
        this.stopBurstCapture();
        this.stopPreviewLoop();
        this.stopCamera();
    }

    getExtension () {
        if (!this.props.vm || !this.props.vm.extensionManager) return null;
        return this.props.vm.extensionManager.getExtensionInstance(EXTENSION_ID);
    }

    /**
     * Run an extension method then refresh lab UI state.
     * @param {function} fn
     * @returns {*}
     */
    withExtension (fn) {
        const ext = this.getExtension();
        if (!ext) return undefined;
        const result = fn(ext);
        this.syncFromExtension();
        return result;
    }

    syncFromExtension () {
        const ext = this.getExtension();
        if (!ext || typeof ext.getLabState !== 'function') return;

        const lab = ext.getLabState();
        const selectedClassId = this.state.selectedClassId &&
            lab.classes.some(c => c.id === this.state.selectedClassId) ?
            this.state.selectedClassId :
            (lab.classes[0] && lab.classes[0].id) || null;

        this.setState({
            classes: lab.classes,
            selectedClassId,
            isTrained: lab.isTrained,
            modelSource: lab.modelSource || 'lab',
            tmUrl: lab.tmModelUrl || this.state.tmUrl || ''
        });
    }

    handleTmUrlChange (tmUrl) {
        this.setState({tmUrl, tmError: '', tmStatus: ''});
    }

    async handleLoadTeachableMachine () {
        const ext = this.getExtension();
        if (!ext || typeof ext.loadTeachableMachineModel !== 'function') return;
        const url = (this.state.tmUrl || '').trim();
        this.setState({tmLoading: true, tmError: '', tmStatus: 'Memuat Teachable Machine…'});
        try {
            const result = await ext.loadTeachableMachineModel(url);
            this.syncFromExtension();
            if (result && result.ok) {
                this.setState({
                    tmLoading: false,
                    tmStatus: result.message || 'Model loaded',
                    tmError: '',
                    isTrained: true,
                    modelSource: 'teachablemachine',
                    tab: 'preview',
                    previewLabel: '',
                    previewConfidence: 0,
                    previewLabels: [],
                    previewDetections: []
                });
                this.startPreviewLoop();
            } else {
                this.setState({
                    tmLoading: false,
                    tmStatus: '',
                    tmError: (result && result.message) || 'Gagal load model'
                });
            }
        } catch (e) {
            this.setState({
                tmLoading: false,
                tmStatus: '',
                tmError: e && e.message ? e.message : 'Gagal load model'
            });
        }
    }

    handleClearTeachableMachine () {
        const ext = this.getExtension();
        if (ext && typeof ext.clearTeachableMachineModel === 'function') {
            ext.clearTeachableMachineModel();
        }
        this.syncFromExtension();
        this.setState({
            tmStatus: '',
            tmError: '',
            modelSource: 'lab',
            isTrained: false,
            previewLabel: '',
            previewConfidence: 0,
            previewLabels: [],
            previewDetections: []
        });
    }

    setVideoRef (el) {
        this.videoEl = el;
        if (el && this.stream) {
            el.srcObject = this.stream;
            el.play().catch(() => {});
        }
    }

    triggerFlash () {
        if (this.flashTimer) {
            clearTimeout(this.flashTimer);
        }
        this.setState({flashActive: true});
        this.flashTimer = setTimeout(() => {
            this.setState({flashActive: false});
        }, FLASH_MS);
    }

    async startCamera () {
        if (this.stream && this.stream.active) {
            if (this.videoEl) {
                this.videoEl.srcObject = this.stream;
                this.videoEl.play().catch(() => {});
            }
            this.setState({isCameraReady: true});
            return;
        }

        this.stopCamera();
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
            this.setState({isCameraReady: false});
            return;
        }
        try {
            this.stream = await navigator.mediaDevices.getUserMedia({
                video: {facingMode: 'user'},
                audio: false
            });
            if (this.videoEl) {
                this.videoEl.srcObject = this.stream;
                await this.videoEl.play().catch(() => {});
            }
            this.setState({isCameraReady: true});
        } catch (e) {
            this.setState({isCameraReady: false});
        }
    }

    stopCamera () {
        if (this.stream) {
            this.stream.getTracks().forEach(t => t.stop());
            this.stream = null;
        }
        if (this.videoEl) {
            this.videoEl.srcObject = null;
        }
        if (this.props.visible) {
            this.setState({isCameraReady: false});
        }
    }

    handleSetTab (tab) {
        this.stopBurstCapture();
        this.stopPreviewLoop();
        this.setState({tab}, () => {
            if (tab === 'photo' || tab === 'preview') {
                this.startCamera();
            } else if (tab === 'mode' || tab === 'train') {
                // Mode picker tidak butuh kamera; train juga tidak
                if (tab === 'mode') {
                    this.stopCamera();
                }
            }
            if (tab === 'preview') {
                this.startPreviewLoop();
            }
        });
    }

    handleSelectMode (detectMode) {
        if (detectMode === this.state.detectMode && this.state.modelSource !== 'teachablemachine') {
            return;
        }
        const ext = this.getExtension();
        // Kembali ke train lokal — lepas model TM
        if (ext && typeof ext.clearTeachableMachineModel === 'function' &&
            this.state.modelSource === 'teachablemachine') {
            ext.clearTeachableMachineModel();
        }
        if (ext && typeof ext.setDetectMode === 'function') {
            // VM tukar slot: objek ↔ wajah terpisah (data mode lain tetap)
            ext.setDetectMode(detectMode);
        }
        this.syncFromExtension();
        const lab = ext && typeof ext.getLabState === 'function' ? ext.getLabState() : null;
        this.setState({
            detectMode,
            modelSource: 'lab',
            isTrained: !!(lab && lab.isTrained),
            trainStatus: '',
            trainError: '',
            tmStatus: '',
            tmError: '',
            previewLabel: '',
            previewConfidence: 0,
            previewLabels: [],
            previewDetections: [],
            tab: 'mode'
        });
    }

    handleSelectClass (classId) {
        this.setState({selectedClassId: classId});
    }

    handleAddClass () {
        const id = this.withExtension(ext => ext.addClass());
        if (id) {
            this.setState({selectedClassId: id});
        }
    }

    handleRenameClass (classId, name) {
        if (!classId) return;
        // Update lokal dulu agar typing tetap responsif; sync ke VM saja.
        const ext = this.getExtension();
        if (!ext) return;
        ext.renameClass(classId, name);
        this.setState(prev => ({
            isTrained: false,
            classes: prev.classes.map(c => (
                c.id === classId ? {...c, name} : c
            ))
        }));
    }

    handleRemoveClass (classId) {
        this.withExtension(ext => ext.removeClass(classId));
    }

    handleClearSamples (classId) {
        this.withExtension(ext => ext.clearSamples(classId));
    }

    /**
     * Crop panduan langsung dari video (mirror) — 1 draw + 1 encode, tanpa decode ulang.
     * @returns {string|null}
     */
    grabFrameDataUrl () {
        const video = this.videoEl;
        if (!video || !video.videoWidth || !this.state.isCameraReady) return null;

        const mode = this.state.detectMode;
        const guide = mode === 'faces' ? FACE_GUIDE : OBJECT_GUIDE;
        const vw = video.videoWidth;
        const vh = video.videoHeight;

        // Video di-CSS mirror; panduan = ruang tampilan → ambil region cermin di buffer mentah
        const sx = (1 - guide.x - guide.w) * vw;
        const sy = guide.y * vh;
        const sw = Math.max(8, guide.w * vw);
        const sh = Math.max(8, guide.h * vh);

        const outW = CAPTURE_OUT_SIDE;
        const outH = Math.max(8, Math.round(CAPTURE_OUT_SIDE * (sh / sw)));

        if (!this._captureCanvas) {
            this._captureCanvas = document.createElement('canvas');
        }
        const canvas = this._captureCanvas;
        if (canvas.width !== outW || canvas.height !== outH) {
            canvas.width = outW;
            canvas.height = outH;
        }
        const ctx = canvas.getContext('2d');
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.fillStyle = '#111';
        ctx.fillRect(0, 0, outW, outH);
        // Flip supaya isi crop sama seperti yang dilihat user di kotak hijau
        ctx.translate(outW, 0);
        ctx.scale(-1, 1);
        ctx.drawImage(video, sx, sy, sw, sh, 0, 0, outW, outH);
        return canvas.toDataURL('image/jpeg', JPEG_QUALITY);
    }

    /**
     * @param {string=} classId
     * @param {{silent?: boolean}=} options silent=true during burst (no flash, throttled sync)
     * @returns {Promise<boolean>}
     */
    async handleCapture (classId, options = {}) {
        const silent = !!options.silent;
        const targetId = classId || this.state.selectedClassId;
        const ext = this.getExtension();
        if (!ext || !targetId) return false;

        const dataUrl = this.grabFrameDataUrl();
        if (!dataUrl) return false;

        if (!silent) {
            this.triggerFlash();
        }

        // Sudah crop di GUI — simpan langsung (tanpa Image decode / MediaPipe)
        let stored = dataUrl;
        try {
            if (typeof ext.addSampleReady === 'function') {
                stored = ext.addSampleReady(targetId, dataUrl) || dataUrl;
            } else if (typeof ext.addSample === 'function') {
                const result = ext.addSample(targetId, dataUrl);
                stored = (result && typeof result.then === 'function') ?
                    await result :
                    result;
            }
        } catch (e) {
            stored = dataUrl;
        }
        if (!stored) stored = dataUrl;

        if (silent) {
            // Thumbnail UI tiap ~3 frame — sample tetap semua masuk ke VM
            this._burstThumbN = (this._burstThumbN || 0) + 1;
            if (this._burstThumbN % 3 === 1) {
                this.applyLocalSample(targetId, stored);
            } else {
                this.setState(prev => ({
                    isTrained: false,
                    classes: prev.classes.map(c => {
                        if (c.id !== targetId) return c;
                        return {...c, sampleCount: (c.sampleCount || 0) + 1};
                    })
                }));
            }
            this.scheduleBurstSync();
        } else {
            this.syncFromExtension();
            this.setState({isTrained: false, trainError: null});
        }
        return true;
    }

    applyLocalSample (targetId, dataUrl) {
        this.setState(prev => ({
            isTrained: false,
            classes: prev.classes.map(c => {
                if (c.id !== targetId) return c;
                const samples = (c.samples || []).slice();
                if (samples.length < MAX_THUMBNAILS) samples.push(dataUrl);
                return {
                    ...c,
                    sampleCount: (c.sampleCount || 0) + 1,
                    samples
                };
            })
        }));
    }

    scheduleBurstSync () {
        if (this.burstSyncTimer) return;
        this.burstSyncTimer = setTimeout(() => {
            this.burstSyncTimer = null;
            this.syncFromExtension();
        }, BURST_SYNC_MS);
    }

    /**
     * Hold shutter = continuous capture. Stops on pointerup (button + document).
     * Listeners attached BEFORE capture so quick taps never leave isBursting stuck.
     */
    handleShutterDown (classId, event) {
        if (!this.state.isCameraReady) return;
        const targetId = classId || this.state.selectedClassId;
        if (!targetId) return;

        this.stopBurstCapture();

        this._burstPointerUp = ev => {
            if (ev && ev.pointerType === 'mouse' && typeof ev.button === 'number' && ev.button !== 0) {
                return;
            }
            this.stopBurstCapture();
        };
        document.addEventListener('pointerup', this._burstPointerUp, true);
        document.addEventListener('pointercancel', this._burstPointerUp, true);
        window.addEventListener('blur', this._burstPointerUp, true);

        if (event && event.currentTarget && event.pointerId != null) {
            try {
                event.currentTarget.setPointerCapture(event.pointerId);
            } catch (e) {
                // ignore unsupported capture
            }
        }

        this.setState({isBursting: true});
        this._burstThumbN = 0;
        // Optimistic first snap — path sync cepat (tanpa MediaPipe)
        this.handleCapture(targetId, {silent: true})
            .then(ok => {
                if (ok) this.triggerFlash();
            })
            .catch(() => {});

        this.burstTimer = setInterval(() => {
            if (!this.state.isCameraReady || !this.props.visible) {
                this.stopBurstCapture();
                return;
            }
            // Sync path — jangan skip frame hanya karena Promise lama
            if (this.burstBusy) return;
            this.burstBusy = true;
            try {
                this.handleCapture(targetId, {silent: true});
            } catch (e) { /* ignore */ }
            this.burstBusy = false;
        }, BURST_INTERVAL_MS);
    }

    handleShutterUp (event) {
        if (event && event.pointerType === 'mouse' && typeof event.button === 'number' && event.button !== 0) {
            return;
        }
        this.stopBurstCapture();
    }

    stopBurstCapture () {
        if (this.burstTimer) {
            clearInterval(this.burstTimer);
            this.burstTimer = null;
        }
        if (this.burstSyncTimer) {
            clearTimeout(this.burstSyncTimer);
            this.burstSyncTimer = null;
            this.syncFromExtension();
        }
        if (this._burstPointerUp) {
            document.removeEventListener('pointerup', this._burstPointerUp, true);
            document.removeEventListener('pointercancel', this._burstPointerUp, true);
            window.removeEventListener('blur', this._burstPointerUp, true);
            this._burstPointerUp = null;
        }
        this.burstBusy = false;
        if (this.state.isBursting) {
            this.setState({isBursting: false});
        }
    }

    async handleTrain () {
        const ext = this.getExtension();
        if (!ext) return;
        this.setState({
            isTraining: true,
            trainStatus: 'Menyiapkan…',
            trainError: ''
        });
        try {
            const result = await ext.train({
                onProgress: status => {
                    this.setState({trainStatus: status || ''});
                }
            });
            this.syncFromExtension();
            this.setState({
                isTraining: false,
                isTrained: !!(result && result.ok),
                trainStatus: result && result.ok ? (result.message || 'Selesai') : '',
                trainError: result && !result.ok ? (result.message || 'Training gagal') : '',
                tab: result && result.ok ? 'preview' : 'train'
            });
            if (result && result.ok) {
                this.startPreviewLoop();
            }
        } catch (e) {
            this.setState({
                isTraining: false,
                trainStatus: '',
                trainError: e && e.message ? e.message : 'Training gagal'
            });
        }
    }

    startPreviewLoop () {
        this.stopPreviewLoop();
        const ext0 = this.getExtension();
        if (ext0 && typeof ext0.setDetectMode === 'function') {
            ext0.setDetectMode(this.state.detectMode || 'objects');
        }
        if (ext0 && typeof ext0.ensureEngine === 'function') {
            ext0.ensureEngine().catch(() => {});
        }
        const tick = async () => {
            const ext = this.getExtension();
            if (!ext || !this.videoEl || !this.props.visible || this.state.tab !== 'preview') {
                return;
            }
            const ready = ext.isTrained ||
                (ext.modelSource === 'teachablemachine' && ext._tmModel);
            if (ready && this.videoEl.readyState >= 2) {
                try {
                    // Mode dari UI tiap frame — jangan sampai desync ke path objek
                    // Teachable Machine: predictFromElement mengabaikan detectMode lokal
                    const result = await ext.predictFromElement(this.videoEl, {
                        detectMode: this.state.detectMode || 'objects'
                    });
                    if (result) {
                        this.setState({
                            previewLabel: result.className,
                            previewConfidence: result.confidence,
                            previewLabels: result.labels || [],
                            previewDetections: result.detections || []
                        });
                    }
                } catch (e) {
                    // ignore frame errors
                }
            }
            this.previewTimer = setTimeout(tick, PREVIEW_INTERVAL_MS);
        };
        tick();
    }

    stopPreviewLoop () {
        if (this.previewTimer) {
            clearTimeout(this.previewTimer);
            this.previewTimer = null;
        }
    }

    handleUseInProject () {
        const ext = this.getExtension();
        const ready = ext && (ext.isTrained ||
            (ext.modelSource === 'teachablemachine' && ext._tmModel));
        if (ext && !ready) return;
        this.props.onRequestClose();
    }

    handleClose () {
        this.props.onRequestClose();
    }

    render () {
        return (
            <MlLabComponent
                isVisible={this.props.visible}
                tab={this.state.tab}
                detectMode={this.state.detectMode}
                classes={this.state.classes}
                selectedClassId={this.state.selectedClassId}
                isCameraReady={this.state.isCameraReady}
                isTraining={this.state.isTraining}
                isTrained={this.state.isTrained}
                trainStatus={this.state.trainStatus}
                trainError={this.state.trainError}
                previewLabel={this.state.previewLabel}
                previewConfidence={this.state.previewConfidence}
                previewLabels={this.state.previewLabels}
                previewDetections={this.state.previewDetections}
                flashActive={this.state.flashActive}
                isBursting={this.state.isBursting}
                modelSource={this.state.modelSource}
                tmUrl={this.state.tmUrl}
                tmStatus={this.state.tmStatus}
                tmError={this.state.tmError}
                tmLoading={this.state.tmLoading}
                videoRef={this.setVideoRef}
                onClose={this.handleClose}
                onSetTab={this.handleSetTab}
                onSelectMode={this.handleSelectMode}
                onSelectClass={this.handleSelectClass}
                onAddClass={this.handleAddClass}
                onRenameClass={this.handleRenameClass}
                onRemoveClass={this.handleRemoveClass}
                onCapture={this.handleCapture}
                onShutterDown={this.handleShutterDown}
                onShutterUp={this.handleShutterUp}
                onClearSamples={this.handleClearSamples}
                onTrain={this.handleTrain}
                onUseInProject={this.handleUseInProject}
                onTmUrlChange={this.handleTmUrlChange}
                onLoadTeachableMachine={this.handleLoadTeachableMachine}
                onClearTeachableMachine={this.handleClearTeachableMachine}
            />
        );
    }
}

MlLab.propTypes = {
    onOpen: PropTypes.func,
    onRequestClose: PropTypes.func,
    visible: PropTypes.bool,
    vm: PropTypes.instanceOf(VM)
};

const mapStateToProps = state => ({
    visible: state.raceroGui.modals.mlLab,
    vm: state.raceroGui.vm
});

const mapDispatchToProps = dispatch => ({
    onOpen: () => dispatch(openMlLab()),
    onRequestClose: () => dispatch(closeMlLab())
});

export default connect(mapStateToProps, mapDispatchToProps)(MlLab);
