import React from 'react';
import { defineMessages, injectIntl, FormattedMessage } from 'react-intl';

import PropTypes from 'prop-types';
import Modal from '../modal/modal.jsx';
import styles from './board-connection-dialog.css';

const messages = defineMessages({
    title: {
        id: 'gui.boardConnection.title',
        defaultMessage: 'Select Board Port',
        description: 'Title for the board selection modal'
    },
    label: {
        id: 'gui.boardConnection.label',
        defaultMessage: 'Select Board Port',
        description: 'Accessibility label for the board selection modal'
    }
});

const formatPortLabel = port => {
    if (!port) return '';
    return port.label || port.address || '';
};

const BoardConnectionDialogComponent = props => {
    const { intl } = props;

    return (<Modal
        className={styles.modalContent}
        contentLabel={intl.formatMessage(messages.label)}
        id='boardConnectionDialog'
        onRequestClose={props.onCancel}
    >
        { props.isLoading ? (
            <div className={`${styles.statusText} ${styles.scanning}`}>
                <FormattedMessage
                    defaultMessage="Scanning for devices..."
                    description="Board connection status scanning."
                    id="gui.boardConnection.scanning"
                />
            </div>
        ) : (
            <div className={styles.body}>
                <div className={styles.wifiBlock}>
                    <div className={styles.sectionLabel}>
                        {props.isEsp32 ? (
                            <FormattedMessage
                                defaultMessage="WiFi (ESP32 OTA)"
                                description="WiFi section label for ESP32 OTA"
                                id="gui.boardConnection.wifiTitleEsp32"
                            />
                        ) : (
                            <FormattedMessage
                                defaultMessage="WiFi (Arduino + ESP-01)"
                                description="WiFi section label"
                                id="gui.boardConnection.wifiTitle"
                            />
                        )}
                    </div>
                    <div className={styles.wifiRow}>
                        <input
                            className={styles.textInput}
                            type="text"
                            placeholder="192.168.4.1"
                            aria-label="IP ESP"
                            value={props.wifiIp}
                            onChange={e => props.onWifiIpChange(e.target.value)}
                        />
                    </div>
                    {props.isEsp32 && (
                        <div className={styles.wifiRow}>
                            <input
                                className={styles.textInput}
                                type="text"
                                placeholder="Password OTA (contoh: admin)"
                                aria-label="Password OTA"
                                value={props.otaPassword}
                                onChange={e => props.onOtaPasswordChange(e.target.value)}
                            />
                        </div>
                    )}
                    <button
                        type="button"
                        className={styles.boardButton}
                        onClick={props.onConnectWifi}
                        disabled={!props.wifiIp}
                    >
                        <FormattedMessage
                            defaultMessage="Connect WiFi"
                            description="Connect via WiFi"
                            id="gui.boardConnection.connectWifi"
                        />
                    </button>
                    {props.showBridgeInstall && (
                        <details className={styles.installDetails}>
                            <summary className={styles.installSummary}>
                                <FormattedMessage
                                    defaultMessage="Install ESP-01 bridge (USB-TTL)"
                                    description="ESP-01 firmware install summary"
                                    id="gui.boardConnection.installBridgeTitle"
                                />
                            </summary>
                            <div className={styles.installBody}>
                                <select
                                    className={styles.portSelect}
                                    value={props.selectedEspPort || ''}
                                    onChange={e => props.onEspPortChange(e.target.value)}
                                >
                                    <option value="">
                                        {intl.formatMessage({
                                            id: 'gui.boardConnection.selectEspPort',
                                            defaultMessage: 'Pilih port USB-TTL',
                                            description: 'Placeholder for ESP USB port select'
                                        })}
                                    </option>
                                    {props.installPorts.map(port => (
                                        <option key={port.address} value={port.address}>
                                            {formatPortLabel(port)}
                                        </option>
                                    ))}
                                </select>
                                <button
                                    type="button"
                                    className={styles.boardButton}
                                    onClick={props.onInstallBridge}
                                    disabled={!props.selectedEspPort || props.isInstallingBridge}
                                >
                                    {props.isInstallingBridge ? (
                                        <FormattedMessage
                                            defaultMessage="Installing..."
                                            description="ESP bridge install in progress"
                                            id="gui.boardConnection.installingBridge"
                                        />
                                    ) : (
                                        <FormattedMessage
                                            defaultMessage="Install Bridge"
                                            description="Install ESP-01 bridge firmware button"
                                            id="gui.boardConnection.installBridge"
                                        />
                                    )}
                                </button>
                            </div>
                        </details>
                    )}
                </div>

                {props.showUsbList && (
                    <div className={styles.sectionLabel}>
                        <FormattedMessage
                            defaultMessage="USB Serial"
                            description="USB port section title"
                            id="gui.boardConnection.usbTitle"
                        />
                    </div>
                )}

                {props.showUsbList && (
                    <div className={styles.boardList}>
                        {props.ports.length === 0 && (
                            <div className={styles.statusText}>
                                <FormattedMessage
                                    defaultMessage="No devices detected. Please plug in your device via USB."
                                    description="Board connection no devices."
                                    id="gui.boardConnection.noDevices"
                                />
                            </div>
                        )}
                        {props.ports.map(port => {
                            const label = formatPortLabel(port);
                            return (
                                <button
                                    type="button"
                                    key={port.address || label}
                                    className={styles.boardButton}
                                    onClick={() => props.onConnect(port.address, label)}
                                >
                                    {label}
                                </button>
                            );
                        })}
                    </div>
                )}
            </div>
        )}
        {props.connectionSuccess && (
            <div className={styles.successOverlay}>
                <div className={styles.successCard}>
                    <div className={styles.successIcon}>✓</div>
                    <div className={styles.successTitle}>
                        <FormattedMessage
                            defaultMessage="Koneksi tersambung"
                            description="Board connection success title"
                            id="gui.boardConnection.successTitle"
                        />
                    </div>
                    <div className={styles.successDetail}>{props.connectionSuccess}</div>
                </div>
            </div>
        )}
    </Modal>);
};

BoardConnectionDialogComponent.propTypes = {
    connectionSuccess: PropTypes.string,
    installPorts: PropTypes.arrayOf(PropTypes.object),
    isEsp32: PropTypes.bool,
    isInstallingBridge: PropTypes.bool,
    isLoading: PropTypes.bool,
    onCancel: PropTypes.func.isRequired,
    onConnect: PropTypes.func.isRequired,
    onConnectWifi: PropTypes.func.isRequired,
    onEspPortChange: PropTypes.func,
    onInstallBridge: PropTypes.func,
    onWifiIpChange: PropTypes.func,
    onOtaPasswordChange: PropTypes.func,
    otaPassword: PropTypes.string,
    ports: PropTypes.arrayOf(PropTypes.object).isRequired,
    selectedEspPort: PropTypes.string,
    showBridgeInstall: PropTypes.bool,
    showUsbList: PropTypes.bool,
    wifiIp: PropTypes.string
};

BoardConnectionDialogComponent.defaultProps = {
    connectionSuccess: null,
    installPorts: [],
    isEsp32: false,
    isInstallingBridge: false,
    isLoading: false,
    selectedEspPort: '',
    showBridgeInstall: true,
    showUsbList: true,
    wifiIp: '192.168.4.1',
    otaPassword: 'admin'
};

export default injectIntl(BoardConnectionDialogComponent);
