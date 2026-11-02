import bindAll from 'lodash.bindall';

import React from 'react';
import PropTypes from 'prop-types';
import { connect } from 'react-redux';
import {
    setSelectingStatus,
    setConnectionDetails,
    setBoardName,
    setBleDeviceName
} from '../reducers/board';
import {
    DEFAULT_BLE_DEVICE_NAME,
    loadBleNameForBoard,
    saveBleNameForBoard
} from '../lib/ble/ble-device-name.js';

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

    componentDidMount () {
        // Sinkron nama board dari VM (mis. default extension Pins) ke menu bar.
        const name = this.props.vm &&
            this.props.vm.runtime &&
            this.props.vm.runtime.boardConfig &&
            this.props.vm.runtime.boardConfig.name;
        if (name && name !== this.props.selectedBoardName) {
            this.props.onSetBoardName(name);
        }
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

        // Ganti board ESP32 ↔ Arduino: reset target koneksi lama.
        this.props.onSetConnectionDetails(null);
        this.props.onSetBoardName(board.name);

        const fqbn = (boards[board.name] && boards[board.name].fqbn) || '';
        if (/esp32/i.test(fqbn)) {
            const stored = loadBleNameForBoard(board.name) || DEFAULT_BLE_DEVICE_NAME;
            const saved = saveBleNameForBoard(board.name, stored);
            if (saved.ok) this.props.onSetBleDeviceName(saved.name);
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
    onSetBleDeviceName: PropTypes.func,
    onSetBoardName: PropTypes.func,
    onSetConnectionDetails: PropTypes.func,
    onSetSelecting: PropTypes.func,
    selectedBoardName: PropTypes.string,
    vm: PropTypes.shape({
        runtime: PropTypes.shape({
            boardConfig: PropTypes.shape({
                name: PropTypes.string
            })
        })
    })
};

const mapStateToProps = state => ({
    vm: state.raceroGui.vm,
    isSelecting: state.raceroGui.board.isSelecting,
    selectedBoardName: state.raceroGui.board.selectedBoardName
});

const mapDispatchToProps = dispatch => ({
    onSetSelecting: selecting => dispatch(setSelectingStatus(selecting)),
    onSetConnectionDetails: details => dispatch(setConnectionDetails(details)),
    onSetBoardName: name => dispatch(setBoardName(name)),
    onSetBleDeviceName: name => dispatch(setBleDeviceName(name))
});

export default connect(mapStateToProps, mapDispatchToProps)(BoardSelectionDialog);
