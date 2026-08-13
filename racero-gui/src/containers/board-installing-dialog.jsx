import bindAll from 'lodash.bindall';

import React from 'react';
import PropTypes from 'prop-types';
import { connect } from 'react-redux';

import BoardInstallingDialogComponent from '../components/board-installing-dialog/board-installing-dialog.jsx';

class BoardInstallingDialog extends React.Component {
    constructor(props) {
        super(props);
    }

    render() {
        if (!this.props.isInstalling) {
            return null;
        }

        return (
            <BoardInstallingDialogComponent/>
        );
    }
}

BoardInstallingDialog.propTypes = {
    isInstalling: PropTypes.bool,
};

const mapStateToProps = state => ({
    vm: state.raceroGui.vm,
    isInstalling: state.raceroGui.board.isInstalling
});

const mapDispatchToProps = dispatch => ({
});

export default connect(mapStateToProps, mapDispatchToProps)(BoardInstallingDialog);
