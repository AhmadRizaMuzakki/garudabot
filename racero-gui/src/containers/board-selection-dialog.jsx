import bindAll from 'lodash.bindall';

import React from 'react';
import PropTypes from 'prop-types';
import { connect } from 'react-redux';
import { setSelectingStatus } from '../reducers/board';

import { boards } from 'racero-boards';

import BoardSelectionDialogComponent from '../components/board-selection-dialog/board-selection-dialog.jsx';

class BoardSelectionDialog extends React.Component {
    constructor(props) {
        super(props);

        bindAll(this, [
            'handleConnect',
            'handleCancel'
        ]);

        this.boards = Object.values(boards);
    }

    handleConnect(board) {
        const vm = this.props.vm;
        const extension = vm.extensionManager.getExtensionInstance('pins');

        if (extension) {
            extension.changeBoard(board.name);
        }

        this.props.onSetSelecting(false);
    }

    handleCancel() {
        this.props.onSetSelecting(false);
    }

    render() {
        if (!this.props.isSelecting) {
            return null;
        }

        return (
            <BoardSelectionDialogComponent
                boards={this.boards}
                onCancel={this.handleCancel}
                onConnect={this.handleConnect}
            />
        );
    }
}

BoardSelectionDialog.propTypes = {
    isSelecting: PropTypes.bool,
    onSetSelecting: PropTypes.func,
};

const mapStateToProps = state => ({
    vm: state.raceroGui.vm,
    isSelecting: state.raceroGui.board.isSelecting
});

const mapDispatchToProps = dispatch => ({
    onSetSelecting: selecting => dispatch(setSelectingStatus(selecting)),
});

export default connect(mapStateToProps, mapDispatchToProps)(BoardSelectionDialog);
