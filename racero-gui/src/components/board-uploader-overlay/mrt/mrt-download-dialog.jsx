import React from 'react';
import PropTypes from 'prop-types';
import classNames from 'classnames';

import styles from './mrt-download-dialog.css';
import pressResetImage from './press-reset.png';
import downloadErrorImage from './download-error.png';

/**
 * Dialog download gaya MY ROBOT TIME (MRT3).
 *
 * Tiga tampilan, meniru form asli:
 *  - "Download"        : progress bar, gambar tekan reset, pesan, tombol Cancel
 *  - "Download Error"  : gambar 4 langkah troubleshooting + tombol Ok
 *  - MessageBox        : "Downloading has been stopped" (setelah Cancel)
 */
const MrtDownloadDialog = props => {
    const {
        isVisible,
        view,
        message,
        progress,
        total,
        indeterminate,
        onCancel,
        onClose
    } = props;

    if (!isVisible) return null;

    if (view === 'error') {
        return (
            <div className={styles.overlay}>
                <div className={styles.window}>
                    <div className={styles.titleBar}>{'Download Error'}</div>
                    <div className={styles.errorClient}>
                        <img
                            className={styles.errorPicture}
                            src={downloadErrorImage}
                            alt=""
                            draggable={false}
                        />
                        {message ? (
                            <div
                                className={styles.errorMessage}
                                title={message}
                            >
                                {message}
                            </div>
                        ) : null}
                        <button
                            type="button"
                            className={classNames(styles.winButton, styles.okButton)}
                            onClick={onClose}
                            autoFocus
                        >
                            {'Ok'}
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    if (view === 'stopped') {
        return (
            <div className={styles.overlay}>
                <div className={styles.window}>
                    <div className={styles.titleBar}>{'MY ROBOT TIME'}</div>
                    <div className={styles.msgboxClient}>
                        {'Downloading has been stopped'}
                    </div>
                    <div className={styles.msgboxFooter}>
                        <button
                            type="button"
                            className={classNames(styles.winButton, styles.msgboxOk)}
                            onClick={onClose}
                            autoFocus
                        >
                            {'OK'}
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    const pct = total > 0 ? Math.min(100, Math.round((progress / total) * 100)) : 0;

    return (
        <div className={styles.overlay}>
            <div className={styles.window}>
                <div className={styles.titleBar}>{'Download'}</div>
                <div className={styles.client}>
                    <div className={styles.progress}>
                        {indeterminate ? (
                            <div className={styles.progressMarquee} />
                        ) : (
                            <div
                                className={styles.progressFill}
                                style={{width: `${pct}%`}}
                            />
                        )}
                    </div>
                    <img
                        className={styles.picture}
                        src={pressResetImage}
                        alt=""
                        draggable={false}
                    />
                    <div className={styles.message}>{message}</div>
                    <button
                        type="button"
                        className={classNames(styles.winButton, styles.cancelButton)}
                        onClick={onCancel}
                        disabled={view === 'done'}
                    >
                        {'Cancel'}
                    </button>
                </div>
            </div>
        </div>
    );
};

MrtDownloadDialog.propTypes = {
    isVisible: PropTypes.bool,
    /** 'download' | 'done' | 'error' | 'stopped' */
    view: PropTypes.string,
    message: PropTypes.string,
    progress: PropTypes.number,
    total: PropTypes.number,
    indeterminate: PropTypes.bool,
    onCancel: PropTypes.func,
    onClose: PropTypes.func
};

MrtDownloadDialog.defaultProps = {
    view: 'download',
    message: '',
    progress: 0,
    total: 0,
    indeterminate: false
};

export default MrtDownloadDialog;
