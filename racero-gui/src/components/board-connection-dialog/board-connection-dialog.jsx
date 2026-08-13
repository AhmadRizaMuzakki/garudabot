import React from 'react';
import { defineMessages, injectIntl, FormattedMessage } from 'react-intl';

import PropTypes from 'prop-types';
import Modal from '../modal/modal.jsx';
import styles from './board-connection-dialog.css';

const messages = defineMessages({
    title: {
        id: 'gui.boardConnection.title',
        defaultMessage: 'Select Port',
        description: 'Title for the board selection modal'
    },
    label: {
        id: 'gui.boardConnection.label',
        defaultMessage: 'Select Board Port',
        description: 'Accessibility label for the board selection modal'
    },
    wireless: {
        id: 'gui.boardConnection.wireless',
        defaultMessage: 'Wireless',
        description: 'Label for the wireless connection option'
    }
});

const BoardConnectionDialogComponent = props => {
    const { intl } = props;
    const handleWirelessClick = () => {
        // UI-only placeholder; wireless connection is not implemented yet.
    };
    return (<Modal
        className={styles.modalContent}
        contentLabel={intl.formatMessage(messages.label)}
        id='boardConnectionDialog'
        onRequestClose={props.onCancel}
        title={intl.formatMessage(messages.title)}
    >
        { props.isLoading ? (
            <div className={`${styles.label} ${styles.scanning}`}>
                <FormattedMessage
                    defaultMessage="Scanning for devices..."
                    description="Board connection status scanning."
                    id="gui.boardConnection.scanning"
                />
            </div>
        ) : (
            <div className={styles.body}>
                <div className={styles.boardList}>
                    {props.ports.length === 0 && (
                        <div className={styles.label}>
                            <FormattedMessage
                                defaultMessage="No devices detected. Please plug in your device via USB."
                                description="Board connection no devices."
                                id="gui.boardConnection.noDevices"
                            />
                        </div>
                    )}
                    {props.ports.map(port => {
                        return (
                            <button
                                key={port.address || port.label}
                                className={styles.boardButton}
                                onClick={() => props.onConnect(port.address)}
                            >
                                <div>{port.label}</div>
                            </button>
                        );
                    })}
                    <button
                        type="button"
                        className={styles.boardButton}
                        onClick={handleWirelessClick}
                    >
                        <div>{intl.formatMessage(messages.wireless)}</div>
                    </button>
                </div>
            </div>
        )}
    </Modal>);
};

BoardConnectionDialogComponent.propTypes = {
    onCancel: PropTypes.func.isRequired,
    onConnect: PropTypes.func.isRequired,
    ports: PropTypes.arrayOf(PropTypes.object).isRequired
};

export default injectIntl(BoardConnectionDialogComponent);
