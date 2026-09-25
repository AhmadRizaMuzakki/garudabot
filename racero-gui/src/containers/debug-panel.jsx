import bindAll from 'lodash.bindall';
import PropTypes from 'prop-types';
import React from 'react';
import {connect} from 'react-redux';

import {isAppDebug} from '../lib/app-debug.js';
import DebugPanelComponent from '../components/debug-panel/debug-panel.jsx';
import {
    setDebugPanelVisible,
    setDebugPanelTab,
    appendDebugLog,
    clearDebugLog,
    appendSerialOut,
    clearSerialOut,
    setSerialStatus
} from '../reducers/debug-panel';

/** Tutup Serial Monitor sebelum upload (dipakai overlay). */
export const closeSerialMonitorForUpload = async () => {
    if (!isAppDebug()) return;
    const tauri = typeof window !== 'undefined' ? window.__TAURI__ : null;
    if (!tauri || !tauri.core) return;
    try {
        await tauri.core.invoke('serial_monitor_close');
    } catch (e) { /* ignore */ }
};

class DebugPanel extends React.Component {
    constructor (props) {
        super(props);
        bindAll(this, [
            'handleClose',
            'handleSelectTab',
            'handleClearLog',
            'handleClearSerial',
            'handleCopyLog',
            'handlePortChange',
            'handleBaudChange',
            'handleConnect',
            'handleDisconnect',
            'handleSendTextChange',
            'handleSend',
            'handleRefreshPorts',
            'handleResizeStart',
            'handleResizeMove',
            'handleResizeEnd',
            'setLogBottomRef',
            'setSerialBottomRef'
        ]);
        this.state = {
            ports: [],
            sendText: '',
            height: 180,
            resizing: false
        };
        this.logBottomRef = null;
        this.serialBottomRef = null;
        this._unlistenLog = null;
        this._unlistenSerial = null;
        this._logBuffer = '';
        this._logFlushTimer = null;
        this._enabled = isAppDebug();
        this._resizeStartY = 0;
        this._resizeStartHeight = 180;
    }

    componentDidMount () {
        if (!this._enabled) return;
        this.subscribeEvents();
        this.handleRefreshPorts();
        // Prefill COM dari connectedDevice USB
        if (this.props.connectedDevice &&
            !String(this.props.connectedDevice).startsWith('ble:') &&
            !this.props.serialPort) {
            this.props.onSetSerialStatus({port: this.props.connectedDevice});
        }
    }

    componentDidUpdate (prevProps) {
        if (!this._enabled) return;
        if (this.props.logs !== prevProps.logs && this.logBottomRef) {
            this.logBottomRef.scrollIntoView({behavior: 'auto'});
        }
        if (this.props.serialOut !== prevProps.serialOut && this.serialBottomRef) {
            this.serialBottomRef.scrollIntoView({behavior: 'auto'});
        }
        if (this.props.connectedDevice &&
            this.props.connectedDevice !== prevProps.connectedDevice &&
            !String(this.props.connectedDevice).startsWith('ble:') &&
            !this.props.serialConnected) {
            this.props.onSetSerialStatus({port: this.props.connectedDevice});
        }
    }

    async componentWillUnmount () {
        this.flushLogBuffer(true);
        this.handleResizeEnd();
        if (this._unlistenLog) {
            const u = await this._unlistenLog;
            if (typeof u === 'function') u();
        }
        if (this._unlistenSerial) {
            const u = await this._unlistenSerial;
            if (typeof u === 'function') u();
        }
        if (this.props.serialConnected) {
            await closeSerialMonitorForUpload();
        }
    }

    handleResizeStart (e) {
        e.preventDefault();
        this._resizeStartY = e.clientY;
        this._resizeStartHeight = this.state.height;
        this.setState({resizing: true});
        window.addEventListener('mousemove', this.handleResizeMove);
        window.addEventListener('mouseup', this.handleResizeEnd);
    }

    handleResizeMove (e) {
        // Drag up = taller panel
        const delta = this._resizeStartY - e.clientY;
        const maxH = Math.floor(window.innerHeight * 0.45);
        const next = Math.min(maxH, Math.max(120, this._resizeStartHeight + delta));
        this.setState({height: next});
    }

    handleResizeEnd () {
        window.removeEventListener('mousemove', this.handleResizeMove);
        window.removeEventListener('mouseup', this.handleResizeEnd);
        if (this.state.resizing) {
            this.setState({resizing: false});
        }
    }

    async subscribeEvents () {
        const tauri = window.__TAURI__;
        if (!tauri || !tauri.event) return;

        this._unlistenLog = tauri.event.listen('compiler-log', event => {
            const payload = String(event.payload || '');
            this._logBuffer += payload.endsWith('\n') ? payload : `${payload}\n`;
            this.scheduleLogFlush();
        });

        this._unlistenSerial = tauri.event.listen('serial-monitor-data', event => {
            const payload = String(event.payload || '');
            this.props.onAppendSerial(payload);
            if (payload.includes('[Serial putus') ||
                payload.includes('Serial Monitor ditutup')) {
                this.props.onSetSerialStatus({
                    connected: false,
                    status: 'Terputus'
                });
            }
        });
    }

    scheduleLogFlush () {
        if (this._logFlushTimer) return;
        this._logFlushTimer = setTimeout(() => {
            this.flushLogBuffer(false);
        }, 200);
    }

    flushLogBuffer (force) {
        if (this._logFlushTimer) {
            clearTimeout(this._logFlushTimer);
            this._logFlushTimer = null;
        }
        if (!this._logBuffer && !force) return;
        if (this._logBuffer) {
            this.props.onAppendLog(this._logBuffer);
            this._logBuffer = '';
        }
    }

    setLogBottomRef (el) {
        this.logBottomRef = el;
    }

    setSerialBottomRef (el) {
        this.serialBottomRef = el;
    }

    handleClose () {
        this.props.onSetVisible(false);
    }

    handleSelectTab (tab) {
        this.props.onSetTab(tab);
    }

    handleClearLog () {
        this.flushLogBuffer(true);
        this.props.onClearLog();
    }

    handleClearSerial () {
        this.props.onClearSerial();
    }

    handleCopyLog () {
        const text = this.props.logs || '';
        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(text).catch(() => {});
        }
    }

    handlePortChange (e) {
        this.props.onSetSerialStatus({port: e.target.value});
    }

    handleBaudChange (e) {
        this.props.onSetSerialStatus({baud: Number(e.target.value) || 115200});
    }

    handleSendTextChange (e) {
        this.setState({sendText: e.target.value});
    }

    async handleRefreshPorts () {
        const tauri = window.__TAURI__;
        if (!tauri || !tauri.core) return;
        try {
            const raw = await tauri.core.invoke('port_list');
            let data = raw;
            if (typeof raw === 'string') {
                try {
                    data = JSON.parse(raw);
                } catch (e) {
                    data = {};
                }
            }
            const list = (data && (data.detected_ports || data.ports)) ||
                (Array.isArray(data) ? data : []);
            const ports = list
                .map(p => {
                    if (typeof p === 'string') return p;
                    if (!p) return null;
                    if (p.port && typeof p.port === 'object') {
                        return p.port.address || p.port.path;
                    }
                    return p.address || p.port || p.name || p.path;
                })
                .filter(p => p && !String(p).toLowerCase().startsWith('ble:'))
                .map(String);
            this.setState({ports});
        } catch (e) {
            this.setState({ports: []});
        }
    }

    async handleConnect () {
        const tauri = window.__TAURI__;
        if (!tauri || !tauri.core) return;
        const port = this.props.serialPort;
        const baud = this.props.serialBaud || 115200;
        if (!port) return;
        try {
            this.props.onSetSerialStatus({status: 'Menyambung…'});
            await tauri.core.invoke('serial_monitor_open', {port, baud});
            this.props.onSetSerialStatus({
                connected: true,
                status: `${port} @ ${baud}`
            });
            this.props.onSetTab('serial');
        } catch (e) {
            this.props.onSetSerialStatus({
                connected: false,
                status: String(e && e.message ? e.message : e)
            });
        }
    }

    async handleDisconnect () {
        const tauri = window.__TAURI__;
        if (!tauri || !tauri.core) return;
        try {
            await tauri.core.invoke('serial_monitor_close');
        } catch (e) { /* ignore */ }
        this.props.onSetSerialStatus({
            connected: false,
            status: 'Disconnect'
        });
        this.props.onAppendSerial('\n[Disconnect]\n');
    }

    async handleSend () {
        const tauri = window.__TAURI__;
        if (!tauri || !tauri.core) return;
        const text = this.state.sendText;
        if (!text) return;
        try {
            // Kirim dengan newline seperti Arduino Serial Monitor
            await tauri.core.invoke('serial_monitor_write', {text: `${text}\n`});
            this.setState({sendText: ''});
        } catch (e) {
            this.props.onSetSerialStatus({
                status: String(e && e.message ? e.message : e)
            });
        }
    }

    render () {
        if (!this._enabled) return null;
        return (
            <DebugPanelComponent
                visible={this.props.visible}
                tab={this.props.tab}
                height={this.state.height}
                resizing={this.state.resizing}
                logs={this.props.logs}
                serialOut={this.props.serialOut}
                serialConnected={this.props.serialConnected}
                serialPort={this.props.serialPort}
                serialBaud={this.props.serialBaud}
                serialStatus={this.props.serialStatus}
                ports={this.state.ports}
                sendText={this.state.sendText}
                logBottomRef={this.setLogBottomRef}
                serialBottomRef={this.setSerialBottomRef}
                onClose={this.handleClose}
                onSelectTab={this.handleSelectTab}
                onClearLog={this.handleClearLog}
                onClearSerial={this.handleClearSerial}
                onCopyLog={this.handleCopyLog}
                onPortChange={this.handlePortChange}
                onBaudChange={this.handleBaudChange}
                onConnect={this.handleConnect}
                onDisconnect={this.handleDisconnect}
                onSendTextChange={this.handleSendTextChange}
                onSend={this.handleSend}
                onRefreshPorts={this.handleRefreshPorts}
                onResizeStart={this.handleResizeStart}
            />
        );
    }
}

DebugPanel.propTypes = {
    visible: PropTypes.bool,
    tab: PropTypes.string,
    logs: PropTypes.string,
    serialOut: PropTypes.string,
    serialConnected: PropTypes.bool,
    serialPort: PropTypes.string,
    serialBaud: PropTypes.number,
    serialStatus: PropTypes.string,
    connectedDevice: PropTypes.string,
    onSetVisible: PropTypes.func,
    onSetTab: PropTypes.func,
    onAppendLog: PropTypes.func,
    onClearLog: PropTypes.func,
    onAppendSerial: PropTypes.func,
    onClearSerial: PropTypes.func,
    onSetSerialStatus: PropTypes.func
};

const mapStateToProps = state => ({
    visible: state.raceroGui.debugPanel.visible,
    tab: state.raceroGui.debugPanel.tab,
    logs: state.raceroGui.debugPanel.logs,
    serialOut: state.raceroGui.debugPanel.serialOut,
    serialConnected: state.raceroGui.debugPanel.serialConnected,
    serialPort: state.raceroGui.debugPanel.serialPort,
    serialBaud: state.raceroGui.debugPanel.serialBaud,
    serialStatus: state.raceroGui.debugPanel.serialStatus,
    connectedDevice: state.raceroGui.board.connectedDevice
});

const mapDispatchToProps = dispatch => ({
    onSetVisible: visible => dispatch(setDebugPanelVisible(visible)),
    onSetTab: tab => dispatch(setDebugPanelTab(tab)),
    onAppendLog: text => dispatch(appendDebugLog(text)),
    onClearLog: () => dispatch(clearDebugLog()),
    onAppendSerial: text => dispatch(appendSerialOut(text)),
    onClearSerial: () => dispatch(clearSerialOut()),
    onSetSerialStatus: opts => dispatch(setSerialStatus(opts))
});

export default connect(mapStateToProps, mapDispatchToProps)(DebugPanel);
