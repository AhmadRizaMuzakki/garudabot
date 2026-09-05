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

const formatBleLabel = device => {
    if (!device) return '';
    return device.name || device.peripheralId || 'ESP32 BLE';
};

const WifiPairingSection = props => (
    <div className={styles.pairBlock}>
        <div className={styles.pairHeader}>
            <div className={styles.sectionLabel}>
                <FormattedMessage
                    defaultMessage="Papan WiFi di sekitar"
                    description="Section title for nearby WiFi boards"
                    id="gui.boardConnection.nearbyBoards"
                />
            </div>
            <button
                type="button"
                className={styles.scanButton}
                onClick={props.onScanWifi}
                disabled={props.isScanningWifi || Boolean(props.pairingSsid)}
            >
                {props.isScanningWifi ? (
                    <FormattedMessage
                        defaultMessage="Mencari..."
                        description="WiFi scan in progress"
                        id="gui.boardConnection.wifiScanning"
                    />
                ) : (
                    <FormattedMessage
                        defaultMessage="Cari lagi"
                        description="Rescan nearby WiFi boards"
                        id="gui.boardConnection.wifiRescan"
                    />
                )}
            </button>
        </div>

        <div className={styles.boardList}>
            {props.networkPorts.map(port => {
                const label = formatPortLabel(port);
                return (
                    <button
                        type="button"
                        key={`net-${port.address}`}
                        className={styles.boardButton}
                        onClick={() => props.onConnectDiscovered(port.address, label)}
                        disabled={Boolean(props.pairingSsid)}
                    >
                        <span className={styles.boardName}>{label}</span>
                        <span className={styles.boardBadgeReady}>
                            <FormattedMessage
                                defaultMessage="siap"
                                description="Board already reachable on the network"
                                id="gui.boardConnection.boardReady"
                            />
                        </span>
                    </button>
                );
            })}

            {props.wifiBoards.map(board => {
                const isPairing = props.pairingSsid === board.ssid;
                return (
                    <button
                        type="button"
                        key={`ssid-${board.ssid}`}
                        className={styles.boardButton}
                        onClick={() => props.onPairBoard(board.ssid)}
                        disabled={Boolean(props.pairingSsid)}
                    >
                        <span className={styles.boardName}>{board.ssid}</span>
                        {isPairing ? (
                            <span className={styles.boardBadge}>
                                <FormattedMessage
                                    defaultMessage="menyambung..."
                                    description="Pairing in progress"
                                    id="gui.boardConnection.pairing"
                                />
                            </span>
                        ) : (
                            <span className={styles.boardMeta}>
                                {board.connected && (
                                    <span className={styles.boardBadgeReady}>
                                        <FormattedMessage
                                            defaultMessage="tersambung"
                                            description="Already joined this hotspot"
                                            id="gui.boardConnection.ssidConnected"
                                        />
                                    </span>
                                )}
                                {typeof board.signal === 'number' && (
                                    <span className={styles.boardSignal}>{board.signal}%</span>
                                )}
                            </span>
                        )}
                    </button>
                );
            })}

            {!props.isScanningWifi &&
                props.wifiBoards.length === 0 &&
                props.networkPorts.length === 0 && (
                <div className={styles.statusText}>
                    {props.wifiScanError ? props.wifiScanError : (
                        <FormattedMessage
                            defaultMessage="Belum ada papan terdeteksi. Nyalakan papan, atau upload sekali lewat USB supaya WiFi-nya aktif."
                            description="No WiFi boards found hint"
                            id="gui.boardConnection.noWifiBoards"
                        />
                    )}
                </div>
            )}
        </div>
    </div>
);

WifiPairingSection.propTypes = {
    isScanningWifi: PropTypes.bool,
    networkPorts: PropTypes.arrayOf(PropTypes.object).isRequired,
    onConnectDiscovered: PropTypes.func.isRequired,
    onPairBoard: PropTypes.func.isRequired,
    onScanWifi: PropTypes.func.isRequired,
    pairingSsid: PropTypes.string,
    wifiBoards: PropTypes.arrayOf(PropTypes.object).isRequired,
    wifiScanError: PropTypes.string
};

const BlePairingSection = props => (
    // ESP32: pilih board Bluetooth (Scratch Link). USB di bawah untuk flash pertama / cadangan.
    <div className={styles.pairBlock}>
        <div className={styles.pairHeader}>
            <div className={styles.sectionLabel}>
                <FormattedMessage
                    defaultMessage="Papan BLE di sekitar"
                    description="Section title for nearby BLE boards"
                    id="gui.boardConnection.nearbyBleBoards"
                />
            </div>
            <button
                type="button"
                className={styles.scanButton}
                onClick={props.onScanBle}
                disabled={props.isScanningBle || Boolean(props.pairingBleId)}
            >
                {props.isScanningBle ? (
                    <FormattedMessage
                        defaultMessage="Mencari..."
                        description="BLE scan in progress"
                        id="gui.boardConnection.bleScanning"
                    />
                ) : (
                    <FormattedMessage
                        defaultMessage="Cari lagi"
                        description="Rescan nearby BLE boards"
                        id="gui.boardConnection.bleRescan"
                    />
                )}
            </button>
        </div>

        <div className={styles.hintText}>
            <FormattedMessage
                defaultMessage="Butuh Scratch Link. Jangan pair di Windows. Upload USB sekali dulu, lalu pilih board di sini."
                description="Hint that BLE OTA needs Scratch Link and first USB flash"
                id="gui.boardConnection.bleHint"
            />
        </div>

        <div className={styles.boardList}>
            {props.bleDevices.map(device => {
                const id = device.peripheralId;
                const label = formatBleLabel(device);
                const isPairing = props.pairingBleId === id;
                return (
                    <button
                        type="button"
                        key={`ble-${id}`}
                        className={styles.boardButton}
                        onClick={() => props.onPairBle(device)}
                        disabled={Boolean(props.pairingBleId)}
                    >
                        <span className={styles.boardName}>{label}</span>
                        {isPairing ? (
                            <span className={styles.boardBadge}>
                                <FormattedMessage
                                    defaultMessage="menyambung..."
                                    description="BLE pairing in progress"
                                    id="gui.boardConnection.blePairing"
                                />
                            </span>
                        ) : (
                            <span className={styles.boardBadgeReady}>
                                <FormattedMessage
                                    defaultMessage="BLE"
                                    description="BLE device badge"
                                    id="gui.boardConnection.bleBadge"
                                />
                            </span>
                        )}
                    </button>
                );
            })}

            {!props.isScanningBle && props.bleDevices.length === 0 && (
                <div className={props.bleScanError ? styles.statusTextError : styles.statusText}>
                    {props.bleScanError ? props.bleScanError : (
                        <FormattedMessage
                            defaultMessage="Belum ada ESP32 BLE. Klik Cari lagi dan tunggu ~15 detik."
                            description="No BLE boards found hint"
                            id="gui.boardConnection.noBleBoards"
                        />
                    )}
                </div>
            )}
            {props.isScanningBle && (
                <div className={styles.statusTextScanning}>
                    <FormattedMessage
                        defaultMessage="Mencari Garudabot lewat Scratch Link…"
                        description="BLE scan in progress status"
                        id="gui.boardConnection.bleScanStatus"
                    />
                </div>
            )}
        </div>
    </div>
);

BlePairingSection.propTypes = {
    bleDevices: PropTypes.arrayOf(PropTypes.object).isRequired,
    bleScanError: PropTypes.string,
    isScanningBle: PropTypes.bool,
    onPairBle: PropTypes.func.isRequired,
    onScanBle: PropTypes.func.isRequired,
    pairingBleId: PropTypes.oneOfType([PropTypes.string, PropTypes.number])
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
                {props.isEsp32 ? (
                    <div className={styles.wifiBlock}>
                        <BlePairingSection
                            bleDevices={props.bleDevices}
                            bleScanError={props.bleScanError}
                            isScanningBle={props.isScanningBle}
                            pairingBleId={props.pairingBleId}
                            onPairBle={props.onPairBle}
                            onScanBle={props.onScanBle}
                        />
                    </div>
                ) : (
                    <div className={styles.wifiBlock}>
                        <WifiPairingSection
                            isScanningWifi={props.isScanningWifi}
                            networkPorts={props.networkPorts}
                            pairingSsid={props.pairingSsid}
                            wifiBoards={props.wifiBoards}
                            wifiScanError={props.wifiScanError}
                            onConnectDiscovered={props.onConnectDiscovered}
                            onPairBoard={props.onPairBoard}
                            onScanWifi={props.onScanWifi}
                        />
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
                )}

                {props.showUsbList && (
                    <div className={styles.usbSectionLabel}>
                        {props.isEsp32 ? (
                            <FormattedMessage
                                defaultMessage="USB Serial (upload pertama / cadangan)"
                                description="USB port section title for ESP32"
                                id="gui.boardConnection.usbTitleEsp32"
                            />
                        ) : (
                            <FormattedMessage
                                defaultMessage="USB Serial"
                                description="USB port section title"
                                id="gui.boardConnection.usbTitle"
                            />
                        )}
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
    bleDevices: PropTypes.arrayOf(PropTypes.object),
    bleScanError: PropTypes.string,
    connectionSuccess: PropTypes.string,
    installPorts: PropTypes.arrayOf(PropTypes.object),
    isEsp32: PropTypes.bool,
    isInstallingBridge: PropTypes.bool,
    isLoading: PropTypes.bool,
    isScanningBle: PropTypes.bool,
    isScanningWifi: PropTypes.bool,
    networkPorts: PropTypes.arrayOf(PropTypes.object),
    onCancel: PropTypes.func.isRequired,
    onConnect: PropTypes.func.isRequired,
    onConnectDiscovered: PropTypes.func,
    onEspPortChange: PropTypes.func,
    onInstallBridge: PropTypes.func,
    onPairBle: PropTypes.func,
    onPairBoard: PropTypes.func,
    onScanBle: PropTypes.func,
    onScanWifi: PropTypes.func,
    pairingBleId: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
    pairingSsid: PropTypes.string,
    ports: PropTypes.arrayOf(PropTypes.object).isRequired,
    selectedEspPort: PropTypes.string,
    showBridgeInstall: PropTypes.bool,
    showUsbList: PropTypes.bool,
    wifiBoards: PropTypes.arrayOf(PropTypes.object),
    wifiScanError: PropTypes.string
};

BoardConnectionDialogComponent.defaultProps = {
    bleDevices: [],
    bleScanError: null,
    connectionSuccess: null,
    installPorts: [],
    isEsp32: false,
    isInstallingBridge: false,
    isLoading: false,
    isScanningBle: false,
    isScanningWifi: false,
    networkPorts: [],
    pairingBleId: null,
    pairingSsid: null,
    selectedEspPort: '',
    showBridgeInstall: true,
    showUsbList: true,
    wifiBoards: [],
    wifiScanError: null
};

export default injectIntl(BoardConnectionDialogComponent);
