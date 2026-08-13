import React from 'react';
import { defineMessages, injectIntl } from 'react-intl';
import PropTypes from 'prop-types';
import Modal from '../modal/modal.jsx';
import styles from './board-selection-dialog.css';

const messages = defineMessages({
    title: {
        id: 'gui.boardSelection.title',
        defaultMessage: 'Select Board',
        description: 'Title for the board selection modal'
    },
    label: {
        id: 'gui.boardSelection.label',
        defaultMessage: 'Select Board Type',
        description: 'Accessibility label for the board selection modal'
    }
});

const BoardSelectionDialogComponent = props => {
    const { intl } = props;
    return (
        <Modal
            className={styles.modalContent}
            contentLabel={intl.formatMessage(messages.label)}
            id='boardSelectionDialog'
            onRequestClose={props.onCancel}
            title={intl.formatMessage(messages.title)}
        >
            <div className={styles.body}>
                <div className={styles.boardGrid}>
                    {props.boards.map(board => (
                        <button
                            key={board.fqbn}
                            className={styles.boardCard}
                            onClick={() => props.onConnect(board)}
                        >
                            <div className={styles.iconWrapper}>
                                <img
                                    alt={board.name}
                                    src={board.icon}
                                    className={styles.boardIcon}
                                />
                            </div>
                            <span className={styles.boardName}>{board.name}</span>
                        </button>
                    ))}
                </div>
            </div>
        </Modal>
    );
};

BoardSelectionDialogComponent.propTypes = {
    onCancel: PropTypes.func.isRequired,
    onConnect: PropTypes.func.isRequired,
    boards: PropTypes.arrayOf(PropTypes.object).isRequired
};

export default injectIntl(BoardSelectionDialogComponent);
