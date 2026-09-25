import React from 'react';
import { defineMessages, injectIntl, FormattedMessage } from 'react-intl';

import PropTypes from 'prop-types';
import Modal from '../modal/modal.jsx';
import styles from './board-installing-dialog.css';

const messages = defineMessages({
    title: {
        id: 'gui.boardInstalling.title',
        defaultMessage: 'Turning Live Mode On',
        description: 'Title for the board selection modal'
    },
    label: {
        id: 'gui.boardInstalling.label',
        defaultMessage: 'Turning On Live Mode',
        description: 'Accessibility label for the board selection modal'
    },
    cancel: {
        id: 'gui.boardInstalling.cancel',
        defaultMessage: 'Cancel',
        description: 'Cancel live mode setup'
    }
});

const BoardInstallingDialogComponent = props => {
    const { intl, statusText, onCancel } = props;
    return (<Modal
        className={styles.modalContent}
        contentLabel={intl.formatMessage(messages.label)}
        id='boardConnectionDialog'
        onRequestClose={onCancel || (() => {})}
        title={intl.formatMessage(messages.title)}
    >
        <div className={`${styles.label} ${styles.scanning}`}>
            {statusText ? statusText : (
                <FormattedMessage
                    defaultMessage="Please wait… This can take 1–3 minutes on Bluetooth."
                    description="Board turn live mode on."
                    id="gui.boardInstalling.installing"
                />
            )}
        </div>
        {typeof onCancel === 'function' && (
            <div className={styles.actions}>
                <button
                    type="button"
                    className={styles.cancelButton}
                    onClick={onCancel}
                >
                    {intl.formatMessage(messages.cancel)}
                </button>
            </div>
        )}
    </Modal>);
};

BoardInstallingDialogComponent.propTypes = {
    intl: PropTypes.object,
    statusText: PropTypes.string,
    onCancel: PropTypes.func
};

export default injectIntl(BoardInstallingDialogComponent);
