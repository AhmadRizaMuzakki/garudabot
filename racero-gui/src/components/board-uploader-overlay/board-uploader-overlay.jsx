import React from 'react';
import {FormattedMessage} from 'react-intl';
import styles from './board-uploader-overlay.css';

const BoardUploaderOverlayComponent = props => {
    const {
        isVisible,
        isCompiling,
        logs,
        onClose,
        setBottomRef
    } = props;

    if (!isVisible) return null;

    return (
    <div className={styles.overlay}>
        <div className={styles.modal}>
            <h2 className={styles.title}>
                {isCompiling ? (
                <FormattedMessage
                        defaultMessage="Compiling & Uploading..."
                        description="Message indicating that project is compiling and uploading the code"
                        id="gui.cnu.compiling"
                        />
                ) : (
                <FormattedMessage
                        defaultMessage="Finished"
                        description="Message indicating that project finished compiling and uploading the code"
                        id="gui.cnu.finished"
                        />
                )}
            </h2>

            <div className={styles.terminal}>
                {logs}
                <div ref={setBottomRef} />
                </div>

                <div className={styles.footer}>
                    <button
                            className="compiler-button"
                            className={styles.button}
                            onClick={onClose}
                            disabled={isCompiling}
                            >
                            {isCompiling ? (
                            <FormattedMessage
                                defaultMessage="Please Wait..."
                                description=""
                                id="gui.cnu.wait"
                                />
                            ) : (
                            <FormattedMessage
                                defaultMessage="Close"
                                description=""
                                id="gui.cnu.close"
                                />
                            )}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default BoardUploaderOverlayComponent;
