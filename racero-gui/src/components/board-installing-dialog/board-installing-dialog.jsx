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
    }
});

const BoardInstallingDialogComponent = props => {
    const { intl } = props;
    return (<Modal
        className={styles.modalContent}
        contentLabel={intl.formatMessage(messages.label)}
        id='boardConnectionDialog'
        onRequestClose={() => {}}
        title={intl.formatMessage(messages.title)}
    >
        <div className={`${styles.label} ${styles.scanning}`}>
            <FormattedMessage
                defaultMessage="Please wait..."
                description="Board turn live mode on."
                id="gui.boardInstalling.installing"
            />
        </div>
    </Modal>);
};

BoardInstallingDialogComponent.propTypes = {
};

export default injectIntl(BoardInstallingDialogComponent);
