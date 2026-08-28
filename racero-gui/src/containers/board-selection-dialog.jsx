import bindAll from 'lodash.bindall';

import React from 'react';
import PropTypes from 'prop-types';
import { connect } from 'react-redux';
import { setSelectingStatus, setConnectionDetails } from '../reducers/board';

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
        if (!vm || !vm.runtime) {
            this.props.onSetSelecting(false);
            return;
        }

        // Selalu simpan board aktif di runtime (jangan hanya lewat extension pins).
        // Tanpa ini, upload bisa tetap pakai Arduino Uno walau UI sudah pilih ESP32.
        if (!vm.runtime.boardConfig) {
            vm.runtime.boardConfig = {name: board.name};
        } else {
            vm.runtime.boardConfig.name = board.name;
        }

        ['pins', 'pinsuno', 'pinsesp32'].forEach(extensionId => {
            const extension = vm.extensionManager.getExtensionInstance(extensionId);
            if (extension && typeof extension.changeBoard === 'function' && !extension.forcedBoardName) {
                extension.changeBoard(board.name);
            }
        });

        if (typeof vm.runtime.requestBlocksUpdate === 'function') {
            vm.runtime.requestBlocksUpdate();
        }

        // Ganti board ESP32 ↔ Arduino: reset target koneksi lama (net:8266 vs IP OTA).
        this.props.onSetConnectionDetails(null);

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
    onSetConnectionDetails: PropTypes.func,
    onSetSelecting: PropTypes.func,
};

const mapStateToProps = state => ({
    vm: state.raceroGui.vm,
    isSelecting: state.raceroGui.board.isSelecting
});

const mapDispatchToProps = dispatch => ({
    onSetSelecting: selecting => dispatch(setSelectingStatus(selecting)),
    onSetConnectionDetails: details => dispatch(setConnectionDetails(details)),
});

export default connect(mapStateToProps, mapDispatchToProps)(BoardSelectionDialog);
