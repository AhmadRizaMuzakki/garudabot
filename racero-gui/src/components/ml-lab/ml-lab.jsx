import PropTypes from 'prop-types';
import React, {useCallback, useEffect, useRef, useState} from 'react';
import classNames from 'classnames';
import {FormattedMessage} from 'react-intl';
import styles from './ml-lab.css';

const TABS = [
    {id: 'mode', label: 'Mode'},
    {id: 'photo', label: 'Foto'},
    {id: 'train', label: 'Training'},
    {id: 'preview', label: 'Preview'}
];

const DETECT_MODES = [
    {
        id: 'objects',
        title: 'Objek',
        description: 'Deteksi benda yang kamu foto.',
        mark: 'Objek',
        badge: 'OBJEK'
    },
    {
        id: 'faces',
        title: 'Wajah',
        description: 'Deteksi wajah yang kamu foto.',
        mark: 'Wajah',
        badge: 'WAJAH'
    }
];

const MODE_COPY = {
    objects: {
        subtitle: 'Deteksi benda',
        classHint: 'Minimal 2 class (opsional class netral).',
        trainHint: 'Hold to Record di kotak hijau, lalu Train — seperti Teachable Machine.',
        previewHint: 'Skor softmax langsung (ala Teachable Machine).'
    },
    faces: {
        subtitle: 'Deteksi wajah',
        classHint: 'Satu class = satu orang.',
        trainHint: 'Foto wajah dari dekat, lalu train.',
        previewHint: 'Uji deteksi wajah di kamera.'
    },
    teachablemachine: {
        subtitle: 'Model Teachable Machine',
        classHint: 'Class dari model yang diimpor.',
        trainHint: 'Train di situs Teachable Machine.',
        previewHint: 'Uji model impor di kamera.'
    }
};

const DETECT_BOX_COLORS = [
    '#4ECDC4', '#FF8A65', '#FFD54F', '#81C784',
    '#64B5F6', '#CE93D8', '#F48FB1', '#A5D6A7'
];
const colorForClassName = name => {
    const key = String(name || '').trim().toLowerCase();
    if (!key) return DETECT_BOX_COLORS[0];
    let hash = 0;
    for (let i = 0; i < key.length; i++) {
        hash = ((hash << 5) - hash) + key.charCodeAt(i);
        hash |= 0;
    }
    return DETECT_BOX_COLORS[Math.abs(hash) % DETECT_BOX_COLORS.length];
};

const CameraBlock = ({
    videoRef,
    isCameraReady,
    flashActive,
    showDetectFrame,
    detections,
    captureGuide
}) => {
    const wrapRef = useRef(null);
    const localVideoRef = useRef(null);
    const [contentBox, setContentBox] = useState(null);

    const setVideoNode = useCallback(node => {
        localVideoRef.current = node;
        if (typeof videoRef === 'function') {
            videoRef(node);
        } else if (videoRef) {
            videoRef.current = node;
        }
    }, [videoRef]);

    // object-fit:contain → kotak harus dihitung terhadap area video aktual (bukan letterbox)
    useEffect(() => {
        const update = () => {
            const video = localVideoRef.current;
            const wrap = wrapRef.current;
            if (!video || !wrap || !video.videoWidth || !video.videoHeight) {
                setContentBox(null);
                return;
            }
            const ew = wrap.clientWidth;
            const eh = wrap.clientHeight;
            const vw = video.videoWidth;
            const vh = video.videoHeight;
            const scale = Math.min(ew / vw, eh / vh);
            const dw = vw * scale;
            const dh = vh * scale;
            setContentBox({
                left: (ew - dw) / 2,
                top: (eh - dh) / 2,
                width: dw,
                height: dh
            });
        };
        update();
        const video = localVideoRef.current;
        if (video) {
            video.addEventListener('loadedmetadata', update);
            video.addEventListener('resize', update);
        }
        window.addEventListener('resize', update);
        const id = setInterval(update, 500);
        return () => {
            if (video) {
                video.removeEventListener('loadedmetadata', update);
                video.removeEventListener('resize', update);
            }
            window.removeEventListener('resize', update);
            clearInterval(id);
        };
    }, [isCameraReady]);

    // Tampil 1 kotak saja (benda terkuat). Multi-label ada di bar class bawah.
    const rawBoxes = (detections || [])
        .filter(d => d && d.box && d.box.w > 0 && d.box.h > 0)
        .sort((a, b) => (b.confidence || 0) - (a.confidence || 0));
    const boxes = rawBoxes.length ? [rawBoxes[0]] : [];
    return (
        <div
            className={styles.cameraWrap}
            ref={wrapRef}
        >
            <video
                ref={setVideoNode}
                className={styles.video}
                autoPlay
                muted
                playsInline
            />
            {!isCameraReady && (
                <div className={styles.cameraPlaceholder}>
                    <FormattedMessage
                        defaultMessage="Waiting for camera permission…"
                        description="Camera waiting message"
                        id="gui.mlLab.cameraWaiting"
                    />
                </div>
            )}
            {showDetectFrame && !boxes.length && (
                <div
                    className={classNames(styles.detectFrame, {
                        [styles.detectFrameObject]: captureGuide === 'object',
                        [styles.detectFrameFace]: captureGuide === 'face'
                    })}
                    aria-hidden
                >
                    <span className={styles.detectCornerTL} />
                    <span className={styles.detectCornerTR} />
                    <span className={styles.detectCornerBL} />
                    <span className={styles.detectCornerBR} />
                </div>
            )}
            {boxes.map((det, i) => {
                const box = det.box;
                const color = colorForClassName(det.className);
                // Mirror horizontal + map ke content rect object-fit:contain
                let style;
                if (contentBox && contentBox.width > 0 && contentBox.height > 0) {
                    style = {
                        left: `${contentBox.left + (1 - box.x - box.w) * contentBox.width}px`,
                        top: `${contentBox.top + box.y * contentBox.height}px`,
                        width: `${box.w * contentBox.width}px`,
                        height: `${box.h * contentBox.height}px`,
                        borderColor: color
                    };
                } else {
                    style = {
                        left: `${(1 - box.x - box.w) * 100}%`,
                        top: `${box.y * 100}%`,
                        width: `${box.w * 100}%`,
                        height: `${box.h * 100}%`,
                        borderColor: color
                    };
                }
                return (
                    <div
                        key={`${det.className}-${Math.round(box.x * 100)}-${Math.round(box.y * 100)}-${i}`}
                        className={styles.detectBox}
                        style={style}
                    >
                        <span
                            className={styles.detectBoxTag}
                            style={{backgroundColor: color}}
                        >
                            {det.className}
                            {typeof det.confidence === 'number' ?
                                ` ${Math.round(det.confidence)}%` :
                                ''}
                        </span>
                    </div>
                );
            })}
            <div
                className={classNames(styles.flash, {
                    [styles.flashActive]: flashActive
                })}
            />
        </div>
    );
};

CameraBlock.propTypes = {
    videoRef: PropTypes.oneOfType([
        PropTypes.func,
        PropTypes.shape({current: PropTypes.any})
    ]),
    isCameraReady: PropTypes.bool,
    flashActive: PropTypes.bool,
    showDetectFrame: PropTypes.bool,
    captureGuide: PropTypes.oneOf(['object', 'face']),
    detections: PropTypes.arrayOf(PropTypes.shape({
        className: PropTypes.string,
        confidence: PropTypes.number,
        color: PropTypes.string,
        box: PropTypes.shape({
            x: PropTypes.number,
            y: PropTypes.number,
            w: PropTypes.number,
            h: PropTypes.number
        })
    }))
};

const ClassCard = ({
    cls,
    isActive,
    canRemove,
    onSelect,
    onRename,
    onClearSamples,
    onRemove
}) => (
    <div
        className={classNames(styles.classCard, {
            [styles.classCardActive]: isActive
        })}
        onClick={() => onSelect(cls.id)}
        role="button"
        tabIndex={0}
        onKeyDown={e => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onSelect(cls.id);
            }
        }}
    >
        <div className={styles.classHeader}>
            <input
                type="text"
                className={styles.classNameInput}
                value={cls.name}
                maxLength={32}
                aria-label="Rename class"
                onClick={e => e.stopPropagation()}
                onMouseDown={e => e.stopPropagation()}
                onChange={e => onRename(cls.id, e.target.value)}
                onBlur={e => {
                    const trimmed = e.target.value.trim();
                    if (!trimmed) {
                        onRename(cls.id, 'Class');
                    } else if (trimmed !== e.target.value) {
                        onRename(cls.id, trimmed);
                    }
                }}
                onKeyDown={e => {
                    e.stopPropagation();
                    if (e.key === 'Enter') {
                        e.currentTarget.blur();
                    }
                }}
            />
            <span className={styles.sampleMeta}>
                {cls.sampleCount} samples
            </span>
        </div>
        {cls.samples && cls.samples.length > 0 && (
            <div className={styles.sampleGrid}>
                {cls.samples.map((src, idx) => (
                    <img
                        key={`${cls.id}_${idx}`}
                        className={styles.sampleThumb}
                        src={src}
                        alt=""
                    />
                ))}
            </div>
        )}
        <div className={styles.classActions}>
            <button
                type="button"
                className={classNames(styles.btn, styles.btnSecondary)}
                onClick={e => {
                    e.stopPropagation();
                    onClearSamples(cls.id);
                }}
            >
                <FormattedMessage
                    defaultMessage="Clear"
                    description="Clear samples button"
                    id="gui.mlLab.clear"
                />
            </button>
            {canRemove && (
                <button
                    type="button"
                    className={classNames(styles.btn, styles.btnDanger)}
                    onClick={e => {
                        e.stopPropagation();
                        onRemove(cls.id);
                    }}
                >
                    <FormattedMessage
                        defaultMessage="Remove"
                        description="Remove class button"
                        id="gui.mlLab.remove"
                    />
                </button>
            )}
        </div>
    </div>
);

ClassCard.propTypes = {
    cls: PropTypes.shape({
        id: PropTypes.string,
        name: PropTypes.string,
        sampleCount: PropTypes.number,
        samples: PropTypes.arrayOf(PropTypes.string)
    }).isRequired,
    isActive: PropTypes.bool,
    canRemove: PropTypes.bool,
    onSelect: PropTypes.func,
    onRename: PropTypes.func,
    onClearSamples: PropTypes.func,
    onRemove: PropTypes.func
};

const ShutterBar = ({
    selectedName,
    sampleCount,
    isBursting,
    isCameraReady,
    selectedClassId,
    onShutterDown,
    onShutterUp,
    onCapture
}) => (
    <div className={styles.shutterBar}>
        <div className={styles.shutterMeta}>
            <span
                className={classNames(styles.shutterChip, {
                    [styles.shutterChipActive]: isBursting
                })}
            >
                {isBursting && <span className={styles.shutterDot} aria-hidden />}
                <span className={styles.shutterChipName}>{selectedName}</span>
                <span className={styles.shutterChipCount}>{sampleCount}</span>
            </span>
        </div>
        <button
            type="button"
            className={classNames(styles.shutterButton, {
                [styles.shutterBursting]: isBursting
            })}
            onPointerDown={e => {
                if (e.pointerType === 'mouse' && e.button !== 0) return;
                e.preventDefault();
                if (isCameraReady && selectedClassId && onShutterDown) {
                    onShutterDown(selectedClassId, e);
                }
            }}
            onPointerUp={e => {
                if (onShutterUp) onShutterUp(e);
            }}
            onPointerCancel={e => {
                if (onShutterUp) onShutterUp(e);
            }}
            onLostPointerCapture={e => {
                if (onShutterUp) onShutterUp(e);
            }}
            onKeyDown={e => {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    if (isCameraReady && selectedClassId && onCapture) {
                        onCapture(selectedClassId);
                    }
                }
            }}
            disabled={!isCameraReady || !selectedClassId}
            title="Hold to capture continuously"
            aria-label="Take photo — hold for burst"
        >
            <span className={styles.shutterPulse} aria-hidden />
            <span className={styles.shutterInner} />
        </button>
        <p className={styles.shutterHint}>
            {isBursting ? (
                <FormattedMessage
                    defaultMessage="Recording…"
                    description="Burst capture in progress hint like Teachable Machine"
                    id="gui.mlLab.bursting"
                />
            ) : (
                <FormattedMessage
                    defaultMessage="Hold to Record"
                    description="Hold shutter for burst capture hint like Teachable Machine"
                    id="gui.mlLab.savingTo"
                />
            )}
        </p>
    </div>
);

ShutterBar.propTypes = {
    selectedName: PropTypes.string,
    sampleCount: PropTypes.number,
    isBursting: PropTypes.bool,
    isCameraReady: PropTypes.bool,
    selectedClassId: PropTypes.string,
    onShutterDown: PropTypes.func,
    onShutterUp: PropTypes.func,
    onCapture: PropTypes.func
};

const MlLabComponent = props => {
    const {
        isVisible,
        tab,
        detectMode,
        classes,
        selectedClassId,
        isCameraReady,
        isTraining,
        isTrained,
        trainStatus,
        trainError,
        previewLabel,
        previewConfidence,
        previewLabels,
        previewDetections,
        flashActive,
        videoRef,
        onClose,
        onSetTab,
        onSelectMode,
        onSelectClass,
        onAddClass,
        onRenameClass,
        onRemoveClass,
        onCapture,
        onShutterDown,
        onShutterUp,
        onClearSamples,
        onTrain,
        onUseInProject,
        isBursting,
        modelSource,
        tmUrl,
        tmStatus,
        tmError,
        tmLoading,
        onTmUrlChange,
        onLoadTeachableMachine,
        onClearTeachableMachine
    } = props;

    if (!isVisible) return null;

    const selectedClass = classes.find(c => c.id === selectedClassId);
    const selectedName = selectedClass ? selectedClass.name : '—';
    const totalSamples = classes.reduce((sum, c) => sum + (c.sampleCount || 0), 0);
    const classesWithSamples = classes.filter(c => c.sampleCount > 0).length;
    const isTm = modelSource === 'teachablemachine';
    const modeCopy = isTm ?
        MODE_COPY.teachablemachine :
        (MODE_COPY[detectMode] || MODE_COPY.objects);
    const activeMode = DETECT_MODES.find(m => m.id === detectMode) || DETECT_MODES[0];
    const badgeLabel = isTm ? 'TEACHABLE MACHINE' : (activeMode.badge || activeMode.title);

    return (
        <div className={styles.overlay}>
            <div
                className={styles.modal}
                role="dialog"
                aria-modal="true"
            >
                <div className={styles.header}>
                    <div className={styles.titleBlock}>
                        <h2 className={styles.title}>
                            <FormattedMessage
                                defaultMessage="ML Lab — Image Classification"
                                description="Title for ML training lab"
                                id="gui.mlLab.title"
                            />
                        </h2>
                        <div className={styles.modeBannerRow}>
                            <span
                                className={classNames(styles.modeBadge, {
                                    [styles.modeBadgeFaces]: !isTm && detectMode === 'faces',
                                    [styles.modeBadgeObjects]: !isTm && detectMode !== 'faces',
                                    [styles.modeBadgeTm]: isTm
                                })}
                            >
                                {badgeLabel}
                            </span>
                            <p className={styles.subtitle}>
                                {modeCopy.subtitle}
                            </p>
                        </div>
                    </div>
                    <button
                        type="button"
                        className={styles.closeButton}
                        onClick={onClose}
                        aria-label="Close"
                    >
                        ×
                    </button>
                </div>

                <div className={styles.tabs} role="tablist">
                    {TABS.map(t => (
                        <button
                            key={t.id}
                            type="button"
                            role="tab"
                            aria-selected={tab === t.id}
                            className={classNames(styles.tab, {
                                [styles.tabActive]: tab === t.id
                            })}
                            onClick={() => onSetTab(t.id)}
                        >
                            {t.label}
                        </button>
                    ))}
                </div>

                <div className={styles.body}>
                    {tab === 'mode' && (
                        <div className={styles.modePanel}>
                            <section className={styles.modeSection}>
                                <div className={styles.modeSectionHead}>
                                    <h3 className={styles.panelTitle}>
                                        1. Train di aplikasi
                                    </h3>
                                    <p className={styles.modeSectionHint}>
                                        Pilih satu, lalu lanjut ke tab Foto.
                                    </p>
                                </div>
                                <div className={styles.modeGridSplit}>
                                    {DETECT_MODES.map(mode => (
                                        <button
                                            key={mode.id}
                                            type="button"
                                            className={classNames(styles.modeCard, styles.modeCardLarge, {
                                                [styles.modeCardActive]: !isTm && detectMode === mode.id,
                                                [styles.modeCardObjects]: mode.id === 'objects',
                                                [styles.modeCardFaces]: mode.id === 'faces'
                                            })}
                                            onClick={() => onSelectMode(mode.id)}
                                        >
                                            <span className={styles.modeMark}>{mode.mark}</span>
                                            <span className={styles.modeTitle}>{mode.title}</span>
                                            <span className={styles.modeDesc}>{mode.description}</span>
                                        </button>
                                    ))}
                                </div>
                                {!isTm && (
                                    <p className={styles.modeSelected}>
                                        Dipilih: <strong>{activeMode.title}</strong>
                                        <span className={styles.modeSelectedNote}>
                                            {' '}· ganti mode = foto lama hilang
                                        </span>
                                    </p>
                                )}
                            </section>

                            <div className={styles.modeOr} aria-hidden="true">
                                <span>atau</span>
                            </div>

                            <section className={styles.modeSection}>
                                <div className={styles.modeSectionHead}>
                                    <h3 className={styles.panelTitle}>
                                        2. Impor model luar
                                    </h3>
                                    <p className={styles.modeSectionHint}>
                                        Paste link Teachable Machine, lalu Load.
                                    </p>
                                </div>
                                <div className={classNames(styles.tmPanel, {
                                    [styles.tmPanelActive]: isTm
                                })}
                                >
                                    <input
                                        className={styles.tmInput}
                                        type="url"
                                        value={tmUrl || ''}
                                        placeholder="https://teachablemachine.withgoogle.com/models/…/"
                                        onChange={e => onTmUrlChange && onTmUrlChange(e.target.value)}
                                        disabled={!!tmLoading}
                                    />
                                    <div className={styles.tmActions}>
                                        <button
                                            type="button"
                                            className={classNames(styles.btn, styles.btnPrimary)}
                                            onClick={onLoadTeachableMachine}
                                            disabled={!!tmLoading || !(tmUrl && tmUrl.trim())}
                                        >
                                            {tmLoading ? 'Memuat…' : 'Load'}
                                        </button>
                                        {isTm && (
                                            <button
                                                type="button"
                                                className={classNames(styles.btn, styles.btnGhost)}
                                                onClick={onClearTeachableMachine}
                                                disabled={!!tmLoading}
                                            >
                                                Hapus
                                            </button>
                                        )}
                                        {isTm && (
                                            <button
                                                type="button"
                                                className={classNames(styles.btn, styles.btnPrimary)}
                                                onClick={() => onSetTab('preview')}
                                            >
                                                Ke Preview
                                            </button>
                                        )}
                                    </div>
                                    {tmStatus ? <p className={styles.tmOk}>{tmStatus}</p> : null}
                                    {tmError ? <p className={styles.tmErr}>{tmError}</p> : null}
                                </div>
                            </section>
                        </div>
                    )}

                    {tab === 'photo' && (
                        <div className={styles.photoLayout}>
                            <div className={styles.photoMain}>
                                <div className={styles.photoCamera}>
                                    <CameraBlock
                                        videoRef={videoRef}
                                        isCameraReady={isCameraReady}
                                        flashActive={flashActive}
                                        showDetectFrame
                                        captureGuide={detectMode === 'objects' ? 'object' : (detectMode === 'faces' ? 'face' : null)}
                                    />
                                    <div className={styles.shutterOverlay}>
                                        <ShutterBar
                                            selectedName={selectedName}
                                            sampleCount={selectedClass ? selectedClass.sampleCount : 0}
                                            isBursting={isBursting}
                                            isCameraReady={isCameraReady}
                                            selectedClassId={selectedClassId}
                                            onShutterDown={onShutterDown}
                                            onShutterUp={onShutterUp}
                                            onCapture={onCapture}
                                        />
                                    </div>
                                </div>
                                <p className={styles.captureTip}>
                                    {detectMode === 'objects' ?
                                        'Hold to Record — isi kotak hijau dengan benda class ini.' :
                                        'Isi bingkai dengan wajah.'}
                                </p>
                                {trainError ? (
                                    <p className={styles.trainError}>{trainError}</p>
                                ) : null}
                            </div>

                            <div className={styles.classesPanel}>
                                <h3 className={styles.panelTitle}>
                                    <FormattedMessage
                                        defaultMessage="Classes"
                                        description="Classes panel title"
                                        id="gui.mlLab.classes"
                                    />
                                </h3>
                                <p className={styles.hint}>
                                    {modeCopy.classHint}
                                </p>
                                <div className={styles.classList}>
                                    {classes.map(cls => (
                                        <ClassCard
                                            key={cls.id}
                                            cls={cls}
                                            isActive={selectedClassId === cls.id}
                                            canRemove={classes.length > 2}
                                            onSelect={onSelectClass}
                                            onRename={onRenameClass}
                                            onClearSamples={onClearSamples}
                                            onRemove={onRemoveClass}
                                        />
                                    ))}
                                </div>
                                <button
                                    type="button"
                                    className={classNames(styles.btn, styles.btnGhost, styles.addClassBtn)}
                                    onClick={onAddClass}
                                >
                                    <FormattedMessage
                                        defaultMessage="+ Add class"
                                        description="Add class button"
                                        id="gui.mlLab.addClass"
                                    />
                                </button>
                            </div>
                        </div>
                    )}

                    {tab === 'train' && (
                        <div className={styles.trainPanel}>
                            <h3 className={styles.panelTitle}>
                                <FormattedMessage
                                    defaultMessage="Training model"
                                    description="Train tab title"
                                    id="gui.mlLab.trainTitle"
                                />
                            </h3>
                            <p className={styles.hint}>
                                {modeCopy.trainHint}
                            </p>

                            <div className={styles.statsGrid}>
                                <div className={styles.statCard}>
                                    <span className={styles.statValue}>{classes.length}</span>
                                    <span className={styles.statLabel}>Classes</span>
                                </div>
                                <div className={styles.statCard}>
                                    <span className={styles.statValue}>{classesWithSamples}</span>
                                    <span className={styles.statLabel}>With samples</span>
                                </div>
                                <div className={styles.statCard}>
                                    <span className={styles.statValue}>{totalSamples}</span>
                                    <span className={styles.statLabel}>Total photos</span>
                                </div>
                            </div>

                            <ul className={styles.trainClassList}>
                                {classes.map(cls => (
                                    <li
                                        key={cls.id}
                                        className={styles.trainClassItem}
                                    >
                                        <span className={styles.className}>{cls.name}</span>
                                        <span className={styles.sampleMeta}>
                                            {cls.sampleCount} samples
                                        </span>
                                    </li>
                                ))}
                            </ul>

                            <button
                                type="button"
                                className={classNames(styles.btn, styles.btnPrimary, styles.trainBtn)}
                                onClick={onTrain}
                                disabled={isTraining}
                            >
                                {isTraining ? (
                                    <FormattedMessage
                                        defaultMessage="Training…"
                                        description="Training in progress"
                                        id="gui.mlLab.training"
                                    />
                                ) : (
                                    <FormattedMessage
                                        defaultMessage="Train model"
                                        description="Train model button"
                                        id="gui.mlLab.train"
                                    />
                                )}
                            </button>
                            {(isTraining || trainStatus) && !trainError && (
                                <p className={styles.trainStatus}>
                                    {trainStatus || 'Training…'}
                                </p>
                            )}
                            {trainError ? (
                                <p className={styles.trainError}>{trainError}</p>
                            ) : null}
                        </div>
                    )}

                    {tab === 'preview' && (
                        <div className={styles.previewLayout}>
                            <CameraBlock
                                videoRef={videoRef}
                                isCameraReady={isCameraReady}
                                flashActive={flashActive}
                                showDetectFrame={false}
                                captureGuide="object"
                                detections={previewDetections}
                            />
                            <div className={styles.previewResult}>
                                {isTrained ? (
                                    <div className={styles.multiLabelList}>
                                        {(previewLabels && previewLabels.length > 0) ? (
                                            previewLabels.map(item => {
                                                const color = colorForClassName(item.className);
                                                const pct = Math.max(0, Math.min(100, item.confidence || 0));
                                                const isTop = previewLabels[0] &&
                                                    item.className === previewLabels[0].className &&
                                                    pct > 0;
                                                return (
                                                    <div
                                                        key={item.className}
                                                        className={classNames(styles.multiLabelRow, {
                                                            [styles.multiLabelRowActive]: isTop
                                                        })}
                                                    >
                                                        <div className={styles.multiLabelHead}>
                                                            <span
                                                                className={styles.multiLabelSwatch}
                                                                style={{backgroundColor: color}}
                                                                aria-hidden
                                                            />
                                                            <span className={styles.multiLabelName}>
                                                                {item.className}
                                                            </span>
                                                            <span className={styles.multiLabelPct}>
                                                                {Math.round(pct)}%
                                                            </span>
                                                        </div>
                                                        <div className={styles.barTrack}>
                                                            <div
                                                                className={styles.barFill}
                                                                style={{
                                                                    width: `${pct}%`,
                                                                    backgroundColor: color
                                                                }}
                                                            />
                                                        </div>
                                                    </div>
                                                );
                                            })
                                        ) : (
                                            <div className={styles.multiLabelEmpty}>
                                                {previewLabel || '—'}
                                                {previewConfidence > 0 ? `  ${Math.round(previewConfidence)}%` : ''}
                                            </div>
                                        )}
                                    </div>
                                ) : (
                                    <FormattedMessage
                                        defaultMessage="Train a model first"
                                        description="Shown when testing without a trained model"
                                        id="gui.mlLab.needTrain"
                                    />
                                )}
                            </div>
                            <p className={styles.hint}>
                                {modeCopy.previewHint}
                            </p>
                        </div>
                    )}
                </div>

                <div className={styles.footer}>
                    <div className={styles.footerActions}>
                        {tab === 'mode' && (
                            <button
                                type="button"
                                className={classNames(styles.btn, styles.btnPrimary)}
                                onClick={() => onSetTab('photo')}
                            >
                                <FormattedMessage
                                    defaultMessage="Next: Foto →"
                                    description="Go to photo tab from mode"
                                    id="gui.mlLab.nextPhoto"
                                />
                            </button>
                        )}
                        {tab === 'photo' && (
                            <React.Fragment>
                                <button
                                    type="button"
                                    className={classNames(styles.btn, styles.btnGhost)}
                                    onClick={() => onSetTab('mode')}
                                >
                                    ← Mode
                                </button>
                                <button
                                    type="button"
                                    className={classNames(styles.btn, styles.btnPrimary)}
                                    onClick={() => onSetTab('train')}
                                >
                                    <FormattedMessage
                                        defaultMessage="Next: Training →"
                                        description="Go to training tab"
                                        id="gui.mlLab.nextTrain"
                                    />
                                </button>
                            </React.Fragment>
                        )}
                        {tab === 'train' && (
                            <React.Fragment>
                                <button
                                    type="button"
                                    className={classNames(styles.btn, styles.btnGhost)}
                                    onClick={() => onSetTab('photo')}
                                >
                                    ← Foto
                                </button>
                                <button
                                    type="button"
                                    className={classNames(styles.btn, styles.btnPrimary)}
                                    onClick={() => onSetTab('preview')}
                                    disabled={!isTrained}
                                >
                                    <FormattedMessage
                                        defaultMessage="Next: Preview →"
                                        description="Go to preview tab"
                                        id="gui.mlLab.nextPreview"
                                    />
                                </button>
                            </React.Fragment>
                        )}
                        {tab === 'preview' && (
                            <React.Fragment>
                                <button
                                    type="button"
                                    className={classNames(styles.btn, styles.btnGhost)}
                                    onClick={() => onSetTab('train')}
                                >
                                    ← Training
                                </button>
                                <button
                                    type="button"
                                    className={classNames(styles.btn, styles.btnPrimary)}
                                    onClick={onUseInProject}
                                    disabled={!isTrained}
                                >
                                    <FormattedMessage
                                        defaultMessage="Use in project"
                                        description="Close lab and use trained model"
                                        id="gui.mlLab.useInProject"
                                    />
                                </button>
                            </React.Fragment>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

MlLabComponent.propTypes = {
    isVisible: PropTypes.bool,
    tab: PropTypes.oneOf(['mode', 'photo', 'train', 'preview']),
    detectMode: PropTypes.oneOf(['objects', 'faces']),
    classes: PropTypes.arrayOf(PropTypes.shape({
        id: PropTypes.string,
        name: PropTypes.string,
        sampleCount: PropTypes.number,
        samples: PropTypes.arrayOf(PropTypes.string)
    })),
    selectedClassId: PropTypes.string,
    isCameraReady: PropTypes.bool,
    isTraining: PropTypes.bool,
    isTrained: PropTypes.bool,
    trainStatus: PropTypes.string,
    trainError: PropTypes.string,
    previewLabel: PropTypes.string,
    previewConfidence: PropTypes.number,
    previewLabels: PropTypes.arrayOf(PropTypes.shape({
        className: PropTypes.string,
        confidence: PropTypes.number
    })),
    previewDetections: PropTypes.arrayOf(PropTypes.shape({
        className: PropTypes.string,
        confidence: PropTypes.number,
        box: PropTypes.shape({
            x: PropTypes.number,
            y: PropTypes.number,
            w: PropTypes.number,
            h: PropTypes.number
        })
    })),
    flashActive: PropTypes.bool,
    isBursting: PropTypes.bool,
    videoRef: PropTypes.oneOfType([
        PropTypes.func,
        PropTypes.shape({current: PropTypes.any})
    ]),
    onClose: PropTypes.func,
    onSetTab: PropTypes.func,
    onSelectMode: PropTypes.func,
    onSelectClass: PropTypes.func,
    onAddClass: PropTypes.func,
    onRenameClass: PropTypes.func,
    onRemoveClass: PropTypes.func,
    onCapture: PropTypes.func,
    onShutterDown: PropTypes.func,
    onShutterUp: PropTypes.func,
    onClearSamples: PropTypes.func,
    onTrain: PropTypes.func,
    onUseInProject: PropTypes.func,
    modelSource: PropTypes.oneOf(['lab', 'teachablemachine']),
    tmUrl: PropTypes.string,
    tmStatus: PropTypes.string,
    tmError: PropTypes.string,
    tmLoading: PropTypes.bool,
    onTmUrlChange: PropTypes.func,
    onLoadTeachableMachine: PropTypes.func,
    onClearTeachableMachine: PropTypes.func
};

export default MlLabComponent;
