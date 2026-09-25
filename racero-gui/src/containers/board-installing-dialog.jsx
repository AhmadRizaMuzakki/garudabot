import bindAll from 'lodash.bindall';

import React from 'react';
import PropTypes from 'prop-types';
import { connect } from 'react-redux';

import BoardInstallingDialogComponent from '../components/board-installing-dialog/board-installing-dialog.jsx';
import {setInstallStatus} from '../reducers/board';
import {cancelLiveInstall} from '../lib/live-install.js';

class BoardInstallingDialog extends React.Component {
    constructor(props) {
        super(props);
        bindAll(this, ['handleCancel']);
    }

    handleCancel () {
        cancelLiveInstall();
        try {
            const tauri = window.__TAURI__;
            if (tauri && tauri.core) {
                tauri.core.invoke('board_compile_cancel').catch(() => {});
            }
        } catch (e) { /* ignore */ }
        this.props.onSetInstalling(false);
    }

    render() {
        if (!this.props.isInstalling) {
            return null;
        }

        return (
            <BoardInstallingDialogComponent
                statusText={this.props.installingStatus}
                onCancel={this.handleCancel}
            />
        );
    }
}

BoardInstallingDialog.propTypes = {
    isInstalling: PropTypes.bool,
    installingStatus: PropTypes.string,
    onSetInstalling: PropTypes.func
};

const mapStateToProps = state => ({
    vm: state.raceroGui.vm,
    isInstalling: state.raceroGui.board.isInstalling,
    installingStatus: state.raceroGui.board.installingStatus || ''
});

const mapDispatchToProps = dispatch => ({
    onSetInstalling: installing => dispatch(setInstallStatus(installing))
});

export default connect(mapStateToProps, mapDispatchToProps)(BoardInstallingDialog);
