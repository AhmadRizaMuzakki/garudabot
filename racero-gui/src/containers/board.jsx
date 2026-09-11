import bindAll from 'lodash.bindall';
import PropTypes from 'prop-types';
import React from 'react';
import {connect} from 'react-redux';
import {
    setSelectingStatus,
    setSelectedStatus,
    setConnectingStatus,
    setConnectedStatus,
    setCompilingStatus,
    setInstallStatus,
    setUploadStatus,
    setConnectionDetails,
    setBoardName,
} from '../reducers/board';

import {
    boards
} from 'racero-boards';

class Board extends React.Component {
    constructor (props) {
        super(props);

        bindAll(this, [
            'handleBoardSelection',
            'toggleBoardConnection',
            'handleLiveModeOn',
            'handleLiveModeOff'
        ]);
    }
    componentDidMount () {
        // Pastikan label menu bar cocok dengan boardConfig VM saat startup.
        const name = this.props.vm &&
            this.props.vm.runtime &&
            this.props.vm.runtime.boardConfig &&
            this.props.vm.runtime.boardConfig.name;
        if (name && name !== this.props.selectedBoardName) {
            this.props.onSetBoardName(name);
        }
    }
    componentWillUnmount() {
    }
    handleBoardSelection () {
        this.props.onSetSelecting(true);
    }
    handleLiveModeOn () {
        const tauri = window.__TAURI__;
        if (!tauri) return;

        const address = this.props.connectedDevice;
        if (address && (address.startsWith('net:') || /^\d{1,3}(\.\d{1,3}){3}(:\d+)?$/.test(address))) {
            window.alert('Live Mode hanya tersedia lewat USB. Untuk WiFi, gunakan Upload Program.');
            return;
        }

        const fqbn = boards[this.props.vm.runtime.boardConfig.name].fqbn;

        this.props.onSetInstalling(true);
        tauri.core.invoke('board_connect', {
            address: address,
            fqbn: fqbn
        }).then(msg => {
            console.log(msg);
            this.props.onSetInstalling(false);
            this.props.onSetConnected(true);
        }).catch(err => {
            console.error(err);

            this.props.onSetInstalling(false);
            this.props.onSetConnected(false);
        });
    }
    handleLiveModeOff () {
        const tauri = window.__TAURI__;
        if (!tauri) return;

        tauri.core.invoke('board_disconnect')
            .then(() => {
                this.props.onSetConnected(false);
            }).catch(err => {
                console.error(err);
            });
    }
    toggleBoardConnection () {
        if (!this.props.connectedDevice && !this.props.isConnecting) {
            this.props.onSetConnecting(true);
        } else {
            this.props.onSetConnected(false);
            this.props.onSetConnectionDetails(null);
        }
    }
    render () {
        const {
            /* eslint-disable no-unused-vars */
            children,
            isSelecting,
            isSelected,
            isConnected,
            isCompiling,
            isInstalling,
            isUploading,
            vm,
            /* eslint-enable no-unused-vars */
            ...props
        } = this.props;
        return this.props.children(this.handleBoardSelection, this.toggleBoardConnection, this.handleLiveModeOn, this.handleLiveModeOff, {
            ...props,
            isConnected: isConnected,
            isSelected: isSelected
        });
    }
}

Board.propTypes = {
    children: PropTypes.func,
    isSelecting: PropTypes.bool,
    isSelected: PropTypes.bool,
    isConnected: PropTypes.bool,
    isCompiling: PropTypes.bool,
    isInstalling: PropTypes.bool,
    isUploading: PropTypes.bool,
    onSetBoardName: PropTypes.func,
    onSetSelecting: PropTypes.func,
    onSetSelected: PropTypes.func,
    onSetConnected: PropTypes.func,
    onSetCompiling: PropTypes.func,
    onSetInstalling: PropTypes.func,
    onSetUploading: PropTypes.func,
    onSetConnectionDetails: PropTypes.func,
    selectedBoardName: PropTypes.string,
};

const mapStateToProps = state => {
    return {
        vm: state.raceroGui.vm,
        isSelecting: state.raceroGui.board.isSelecting,
        isSelected: state.raceroGui.board.isSelected,
        isConnecting: state.raceroGui.board.isConnecting,
        isConnected: state.raceroGui.board.isConnected,
        isCompiling: state.raceroGui.board.isCompiling,
        isInstalling: state.raceroGui.board.isInstalling,
        isUploading: state.raceroGui.board.isUploading,
        selectedBoardName: state.raceroGui.board.selectedBoardName,

        connectedDevice: state.raceroGui.board.connectedDevice,
    };
};

const mapDispatchToProps = dispatch => ({
    onSetSelecting: selecting => dispatch(setSelectingStatus(selecting)),
    onSetSelected: connecting => dispatch(setSelectedStatus(connecting)),
    onSetConnecting: connecting => dispatch(setConnectingStatus(connecting)),
    onSetConnected: connected => dispatch(setConnectedStatus(connected)),
    onSetCompiling: compiling => dispatch(setCompilingStatus(compiling)),
    onSetInstalling: installing => dispatch(setInstallStatus(installing)),
    onSetUploading: uploading => dispatch(setUploadStatus(uploading)),
    onSetBoardName: name => dispatch(setBoardName(name)),

    onSetConnectionDetails: details => dispatch(setConnectionDetails(details)),
});


export default connect(
    mapStateToProps,
    mapDispatchToProps
)(Board);
