import React from 'react';
import PropTypes from 'prop-types';
import {FormattedMessage} from 'react-intl';
import styles from './debug-panel.css';

const DebugPanelComponent = props => {
    const {
        visible,
        tab,
        height,
        resizing,
        logs,
        serialOut,
        serialConnected,
        serialPort,
        serialBaud,
        serialStatus,
        ports,
        sendText,
        logBottomRef,
        serialBottomRef,
        onClose,
        onSelectTab,
        onClearLog,
        onClearSerial,
        onCopyLog,
        onPortChange,
        onBaudChange,
        onConnect,
        onDisconnect,
        onSendTextChange,
        onSend,
        onRefreshPorts,
        onResizeStart
    } = props;

    if (!visible) return null;

    return (
        <div
            className={styles.panel}
            style={{height: `${height}px`}}
        >
            <div
                className={resizing ? styles.resizeHandleActive : styles.resizeHandle}
                onMouseDown={onResizeStart}
                title="Drag to resize"
            />
            <div className={styles.header}>
                <button
                    type="button"
                    className={tab === 'log' ? styles.tabActive : styles.tab}
                    onClick={() => onSelectTab('log')}
                >
                    <FormattedMessage
                        defaultMessage="Output"
                        description="Debug panel output/log tab"
                        id="gui.debugPanel.tabLog"
                    />
                </button>
                <button
                    type="button"
                    className={tab === 'serial' ? styles.tabActive : styles.tab}
                    onClick={() => onSelectTab('serial')}
                >
                    <FormattedMessage
                        defaultMessage="Serial Monitor"
                        description="Debug panel serial tab"
                        id="gui.debugPanel.tabSerial"
                    />
                </button>
                <div className={styles.spacer} />
                {tab === 'log' && (
                    <React.Fragment>
                        <button type="button" className={styles.headerBtn} onClick={onCopyLog}>
                            Copy
                        </button>
                        <button type="button" className={styles.headerBtn} onClick={onClearLog}>
                            Clear
                        </button>
                    </React.Fragment>
                )}
                {tab === 'serial' && (
                    <button type="button" className={styles.headerBtn} onClick={onClearSerial}>
                        Clear
                    </button>
                )}
                <button
                    type="button"
                    className={styles.closeBtn}
                    onClick={onClose}
                    title="Close"
                >
                    ×
                </button>
            </div>

            <div className={styles.body}>
                {tab === 'log' ? (
                    <div className={styles.terminal}>
                        {logs || 'Menunggu log compile/upload…\n'}
                        <div ref={logBottomRef} />
                    </div>
                ) : (
                    <React.Fragment>
                        <div className={styles.toolbar}>
                            <input
                                className={styles.input}
                                type="text"
                                value={sendText}
                                placeholder={serialConnected ?
                                    `Message (Enter → ${serialPort})` :
                                    'Connect dulu untuk kirim…'}
                                disabled={!serialConnected}
                                onChange={onSendTextChange}
                                onKeyDown={e => {
                                    if (e.key === 'Enter') onSend();
                                }}
                            />
                            <select
                                className={styles.select}
                                value={serialPort}
                                disabled={serialConnected}
                                onChange={onPortChange}
                            >
                                <option value="">COM…</option>
                                {ports.map(p => (
                                    <option key={p} value={p}>{p}</option>
                                ))}
                            </select>
                            <select
                                className={styles.select}
                                value={String(serialBaud)}
                                disabled={serialConnected}
                                onChange={onBaudChange}
                            >
                                <option value="9600">9600 baud</option>
                                <option value="57600">57600 baud</option>
                                <option value="115200">115200 baud</option>
                                <option value="230400">230400 baud</option>
                            </select>
                            <button
                                type="button"
                                className={styles.headerBtn}
                                onClick={onRefreshPorts}
                                disabled={serialConnected}
                            >
                                Refresh
                            </button>
                            {serialConnected ? (
                                <button
                                    type="button"
                                    className={styles.actionBtnDanger}
                                    onClick={onDisconnect}
                                >
                                    Disconnect
                                </button>
                            ) : (
                                <button
                                    type="button"
                                    className={styles.actionBtn}
                                    onClick={onConnect}
                                    disabled={!serialPort}
                                >
                                    Connect
                                </button>
                            )}
                            {serialStatus ? (
                                <span className={styles.status}>{serialStatus}</span>
                            ) : null}
                        </div>
                        <div className={styles.terminal}>
                            {serialOut || 'Connect ke COMx untuk melihat Serial.println…\n'}
                            <div ref={serialBottomRef} />
                        </div>
                    </React.Fragment>
                )}
            </div>
        </div>
    );
};

DebugPanelComponent.propTypes = {
    visible: PropTypes.bool,
    tab: PropTypes.string,
    height: PropTypes.number,
    resizing: PropTypes.bool,
    logs: PropTypes.string,
    serialOut: PropTypes.string,
    serialConnected: PropTypes.bool,
    serialPort: PropTypes.string,
    serialBaud: PropTypes.number,
    serialStatus: PropTypes.string,
    ports: PropTypes.arrayOf(PropTypes.string),
    sendText: PropTypes.string,
    logBottomRef: PropTypes.func,
    serialBottomRef: PropTypes.func,
    onClose: PropTypes.func,
    onSelectTab: PropTypes.func,
    onClearLog: PropTypes.func,
    onClearSerial: PropTypes.func,
    onCopyLog: PropTypes.func,
    onPortChange: PropTypes.func,
    onBaudChange: PropTypes.func,
    onConnect: PropTypes.func,
    onDisconnect: PropTypes.func,
    onSendTextChange: PropTypes.func,
    onSend: PropTypes.func,
    onRefreshPorts: PropTypes.func,
    onResizeStart: PropTypes.func
};

export default DebugPanelComponent;
