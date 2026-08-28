import bindAll from 'lodash.bindall';

import React from 'react';
import PropTypes from 'prop-types';
import { connect } from 'react-redux';
import { setConnectingStatus, setConnectionDetails, setInstallStatus, setOtaPassword } from '../reducers/board';
import { boards } from 'racero-boards';

import BoardConnectionDialogComponent from '../components/board-connection-dialog/board-connection-dialog.jsx';

const DEFAULT_WIFI_IP = '192.168.4.1';
const DEFAULT_WIFI_PORT = '8266';

const isValidIpv4 = value => /^\d{1,3}(\.\d{1,3}){3}$/.test(value.trim());
const isNetworkAddress = value => value.startsWith('net:') || /^\d{1,3}(\.\d{1,3}){3}(:\d+)?$/.test(value);

const normalizePorts = data => {
    const rawPorts = (data && (data.detected_ports || data.ports)) || [];
    return rawPorts.map(port => {
        const address = port.address || '';
        const label = port.label || port.protocol_label || address;
        return {
            address,
            label,
            protocol: port.protocol || port.protocol_label || ''
        };
    }).filter(port => port.address);
};

class BoardConnectionDialog extends React.Component {
    constructor(props) {
        super(props);
        bindAll(this, [
            'handleConnect',
            'handleCancel',
            'handleConnectWifi',
            'handleInstallBridge',
            'handleWifiIpChange',
            'handleOtaPasswordChange',
            'handleEspPortChange'
        ]);
        this.state = {
            ports: [],
            isLoading: false,
            wifiIp: DEFAULT_WIFI_IP,
            otaPassword: 'admin',
            selectedEspPort: '',
            isInstallingBridge: false,
            connectionSuccess: null
        };
        this.connectionSuccessTimer = null;
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
            this.setState({
                ports: normalizePorts(data),
                isLoading: false
            });
        }).catch(err => {
            console.error(err);
            this.setState({ isLoading: false });
        });
    }
    componentWillUnmount() {
        if (this.unlistenPorts) {
            this.unlistenPorts();
        }
        if (this.connectionSuccessTimer) {
            clearTimeout(this.connectionSuccessTimer);
        }
    }
    showConnectionSuccess (label, connectionTarget) {
        if (this.connectionSuccessTimer) {
            clearTimeout(this.connectionSuccessTimer);
        }

        this.props.onSetConnectionDetails(connectionTarget);
        this.setState({ connectionSuccess: label });

        this.connectionSuccessTimer = setTimeout(() => {
            this.setState({ connectionSuccess: null });
            this.props.onSetConnecting(false);
            this.connectionSuccessTimer = null;
        }, 1800);
    }
    handlePortWatcherEvent = (e) => {
        try {
            const data = JSON.parse(e.payload);
            this.setState({ ports: normalizePorts(data) });
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
    getBoardName() {
        return this.props.vm &&
            this.props.vm.runtime &&
            this.props.vm.runtime.boardConfig &&
            this.props.vm.runtime.boardConfig.name;
    }
    isEsp32Board () {
        const boardName = this.getBoardName() || '';
        if (/esp32/i.test(boardName)) {
            return true;
        }
        const board = boards[boardName];
        return Boolean(board && board.fqbn && /esp32/i.test(board.fqbn));
    }
    handleConnect (port, label) {
        this.showConnectionSuccess(label || port, port);
    }
    handleConnectWifi () {
        const ip = this.state.wifiIp.trim();
        if (!isValidIpv4(ip)) {
            window.alert('IP tidak valid. Contoh: 192.168.4.1');
            return;
        }
        if (this.isEsp32Board()) {
            this.props.onSetOtaPassword(this.state.otaPassword);
            this.showConnectionSuccess(`WiFi ${ip}`, ip);
            return;
        }
        this.showConnectionSuccess(
            `WiFi ${ip}:${DEFAULT_WIFI_PORT}`,
            `net:${ip}:${DEFAULT_WIFI_PORT}`
        );
    }
    handleInstallBridge () {
        const tauri = window.__TAURI__;
        if (!tauri || !this.state.selectedEspPort) return;
        if (isNetworkAddress(this.state.selectedEspPort)) {
            window.alert('Install ESP-01 bridge harus via USB-TTL (COM), bukan IP/WiFi.');
            return;
        }

        this.setState({ isInstallingBridge: true });
        this.props.onSetInstalling(true);
        tauri.core.invoke('board_install_esp01_bridge', {
            port: this.state.selectedEspPort
        }).then(msg => {
            window.alert(msg);
        }).catch(err => {
            window.alert(String(err));
        }).finally(() => {
            this.setState({ isInstallingBridge: false });
            this.props.onSetInstalling(false);
        });
    }
    handleWifiIpChange (value) {
        this.setState({ wifiIp: value });
    }
    handleOtaPasswordChange (value) {
        this.setState({ otaPassword: value });
        this.props.onSetOtaPassword(value);
    }
    handleEspPortChange (value) {
        this.setState({ selectedEspPort: value });
    }
    handleCancel() {
        this.props.onSetConnecting(false);
        this.props.onSetConnectionDetails(null);
    }
    render() {
        if (!this.props.isConnecting) {
            return null;
        }
        const isEsp32 = this.isEsp32Board();
        const serialPorts = this.state.ports.filter(port => !isNetworkAddress(port.address || ''));

        return (
            <BoardConnectionDialogComponent
                ports={serialPorts}
                installPorts={serialPorts}
                showBridgeInstall={!isEsp32}
                showUsbList={!isEsp32}
                isEsp32={isEsp32}
                isLoading={this.state.isLoading}
                connectionSuccess={this.state.connectionSuccess}
                wifiIp={this.state.wifiIp}
                otaPassword={this.state.otaPassword}
                selectedEspPort={this.state.selectedEspPort}
                isInstallingBridge={this.state.isInstallingBridge}
                onCancel={this.handleCancel}
                onConnect={this.handleConnect}
                onConnectWifi={this.handleConnectWifi}
                onInstallBridge={this.handleInstallBridge}
                onWifiIpChange={this.handleWifiIpChange}
                onOtaPasswordChange={this.handleOtaPasswordChange}
                onEspPortChange={this.handleEspPortChange}
            />
        );
    }
}

BoardConnectionDialog.propTypes = {
    isConnecting: PropTypes.bool,
    onSetConnecting: PropTypes.func,
    onSetConnectionDetails: PropTypes.func,
    onSetInstalling: PropTypes.func,
    onSetOtaPassword: PropTypes.func,
    vm: PropTypes.object
};

const mapStateToProps = state => ({
    vm: state.raceroGui.vm,
    isConnecting: state.raceroGui.board.isConnecting,
});

const mapDispatchToProps = dispatch => ({
    onSetConnecting: connecting => dispatch(setConnectingStatus(connecting)),
    onSetConnectionDetails: details => dispatch(setConnectionDetails(details)),
    onSetInstalling: installing => dispatch(setInstallStatus(installing)),
    onSetOtaPassword: password => dispatch(setOtaPassword(password))
});

export default connect(mapStateToProps, mapDispatchToProps)(BoardConnectionDialog);
