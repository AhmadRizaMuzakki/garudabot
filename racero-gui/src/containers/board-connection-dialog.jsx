import bindAll from 'lodash.bindall';

import React from 'react';
import PropTypes from 'prop-types';
import { connect } from 'react-redux';
import { setConnectingStatus, setConnectedStatus, setConnectionDetails } from '../reducers/board';

import BoardConnectionDialogComponent from '../components/board-connection-dialog/board-connection-dialog.jsx';

class BoardConnectionDialog extends React.Component {
    constructor(props) {
        super(props);
        bindAll(this, [
            'handleConnect',
            'handleCancel'
        ]);
        this.state = {
            ports: [],
            isLoading: false
        };
    }
    componentDidMount() {
        const tauri = window.__TAURI__;
        if (!tauri) return;

        tauri.event.listen('ports-updated', this.handlePortWatcherEvent).then(unlistenFn => {
            this.unlistenPorts = unlistenFn;
        });

        this.setState({isLoading: true});
        tauri.core.invoke('port_list').then(portsString => {
            const data = JSON.parse(portsString);
            if (data.detected_ports) {
                const formatted = data.detected_ports;
                this.setState({ ports: formatted, isLoading: false });
            }
        }).catch(err => {
            console.error(err);
            this.setState({ isLoading: false });
        });
    }
    componentWillUnmount() {
        if (this.unlistenPorts) {
            this.unlistenPorts();
        }
    }
    handlePortWatcherEvent = (e) => {
        try {
            const data = JSON.parse(e.payload);
            if (data.detected_ports) {
                const formattedPorts = data.detected_ports.map(p => {
                    return p;
                });
                console.log(formattedPorts);
                this.setState({ ports: formattedPorts });
            }
        } catch (err) {
            console.error("FIRMATA: Error updating port list", err);
        }
    }
    componentDidUpdate(prevProps) {
        if (this.props.isConnecting && !prevProps.isConnecting) {
            if (this.state.isLoading) {
                this.setState({isLoading: false});
            }
        }
    }
    handleConnect (port) {
        this.props.onSetConnecting(false);
        this.props.onSetConnectionDetails(port);
    }
    handleCancel() {
        this.props.onSetConnecting(false);
        this.props.onSetConnectionDetails(null);
    }
    render() {
        if (!this.props.isConnecting) {
            return null;
        }

        return (
            <BoardConnectionDialogComponent
                ports={this.state.ports}
                isLoading={this.state.isLoading}
                onCancel={this.handleCancel}
                onConnect={this.handleConnect}
            />
        );
    }
}

BoardConnectionDialog.propTypes = {
    isConnecting: PropTypes.bool,
    onSetConnecting: PropTypes.func,
};

const mapStateToProps = state => ({
                                  vm: state.raceroGui.vm,
                                  isConnecting: state.raceroGui.board.isConnecting,
});

const mapDispatchToProps = dispatch => ({
                                        onSetConnecting: connecting => dispatch(setConnectingStatus(connecting)),
                                        onSetConnectionDetails: details => dispatch(setConnectionDetails(details))
});

export default connect(mapStateToProps, mapDispatchToProps)(BoardConnectionDialog);
