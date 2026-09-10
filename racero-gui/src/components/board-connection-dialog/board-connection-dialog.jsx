import React from 'react';
import { defineMessages, injectIntl, FormattedMessage } from 'react-intl';

import PropTypes from 'prop-types';
import Modal from '../modal/modal.jsx';
import BleNameSection from './ble-name-section.jsx';
import styles from './board-connection-dialog.css';
import {
    isGenericBleLabel
} from '../../lib/ble/ble-device-name.js';

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

/**
 * Label yang ditampilkan di daftar Bluetooth.
 * Prioritas: nama asli dari OS → nama inject/Excel → fallback ID.
 */
const formatBleLabel = (device, preferredName) => {
    if (!device) return '';
    const raw = String(device.rawName || '').trim();
    if (raw && !isGenericBleLabel(raw)) {
        return raw;
    }
    if (preferredName) {
        return preferredName;
    }
    return device.name || device.peripheralId || 'ESP32 BLE';
};

const BlePairingSection = props => (
    <div className={styles.pairBlock}>
        <div className={styles.pairHeader}>
            <div className={styles.sectionLabel}>
                <FormattedMessage
                    defaultMessage="Bluetooth"
                    description="Section title for nearby BLE boards short"
                    id="gui.boardConnection.nearbyBleBoardsShort"
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
                        defaultMessage="Searching..."
                        description="BLE scan in progress"
                        id="gui.boardConnection.bleScanning"
                    />
                ) : (
                    <FormattedMessage
                        defaultMessage="Search"
                        description="Rescan nearby BLE boards short"
                        id="gui.boardConnection.bleRescanShort"
                    />
                )}
            </button>
        </div>

        <div className={styles.boardList}>
            {props.bleDevices.map(device => {
                const id = device.peripheralId;
                // Nama flash terakhir lebih akurat untuk sinyal board saat ini.
                const preferred = props.lastFlashedBleName || props.targetBleName;
                const label = formatBleLabel(device, preferred);
                const isPairing = props.pairingBleId === id;
                const raw = String(device.rawName || '').trim();
                const showingInjected = Boolean(preferred) &&
                    (!raw || isGenericBleLabel(raw) || raw === preferred);
                return (
                    <button
                        type="button"
                        key={`ble-${id}`}
                        className={styles.boardButton}
                        onClick={() => props.onPairBle(device)}
                        disabled={Boolean(props.pairingBleId)}
                    >
                        <span className={styles.boardNameStack}>
                            <span className={styles.boardName}>{label}</span>
                            {showingInjected && preferred && (
                                <span className={styles.boardNameSub}>
                                    <FormattedMessage
                                        defaultMessage="nama firmware"
                                        description="Subtitle when showing injected BLE name"
                                        id="gui.boardConnection.bleFirmwareNameHint"
                                    />
                                </span>
                            )}
                        </span>
                        {isPairing ? (
                            <span className={styles.boardBadge}>
                                <FormattedMessage
                                    defaultMessage="..."
                                    description="BLE pairing in progress short"
                                    id="gui.boardConnection.blePairingShort"
                                />
                            </span>
                        ) : (
                            <span className={styles.boardBadgeReady}>BLE</span>
                        )}
                    </button>
                );
            })}

            {!props.isScanningBle && props.bleDevices.length === 0 && (
                <div className={props.bleScanError ? styles.statusTextError : styles.statusText}>
                    {props.bleScanError ? props.bleScanError : (
                        <FormattedMessage
                            defaultMessage="None found. Click Search."
                            description="No BLE boards found hint short"
                            id="gui.boardConnection.noBleBoardsShort"
                        />
                    )}
                </div>
            )}
            {props.isScanningBle && (
                <div className={styles.statusTextScanning}>
                    <FormattedMessage
                        defaultMessage="Searching for board…"
                        description="BLE scan in progress status short"
                        id="gui.boardConnection.bleScanStatusShort"
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
    lastFlashedBleName: PropTypes.string,
    onPairBle: PropTypes.func.isRequired,
    onScanBle: PropTypes.func.isRequired,
    pairingBleId: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
    targetBleName: PropTypes.string
};

const UsbPortList = props => (
    <div className={props.docked ? styles.usbDock : styles.usbSection}>
        <div className={styles.usbSectionLabel}>
            {props.esp32Label ? (
                <FormattedMessage
                    defaultMessage="USB"
                    description="USB port section title for ESP32 short"
                    id="gui.boardConnection.usbTitleEsp32Short"
                />
            ) : (
                <FormattedMessage
                    defaultMessage="USB"
                    description="USB port section title short"
                    id="gui.boardConnection.usbTitleShort"
                />
            )}
        </div>
        <div className={styles.usbBoardList}>
            {props.ports.length === 0 && (
                <div className={styles.statusText}>
                    <FormattedMessage
                        defaultMessage="Plug in the board via USB"
                        description="No USB devices short"
                        id="gui.boardConnection.noDevicesShort"
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
    </div>
);

UsbPortList.propTypes = {
    docked: PropTypes.bool,
    esp32Label: PropTypes.bool,
    onConnect: PropTypes.func.isRequired,
    ports: PropTypes.arrayOf(PropTypes.object).isRequired
};

const BoardConnectionDialogComponent = props => {
    const { intl } = props;

    return (<Modal
        className={props.isEsp32 ? `${styles.modalContent} ${styles.modalWide}` : styles.modalContent}
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
        ) : props.isEsp32 ? (
            <div className={`${styles.body} ${styles.bodySplit}`}>
                <div className={styles.splitPane}>
                    <div className={styles.splitPaneHeader}>
                        <FormattedMessage
                            defaultMessage="1. Board name"
                            description="Left pane title short"
                            id="gui.boardConnection.splitNameTitleShort"
                        />
                    </div>
                    {props.bleDeviceName && (
                        <div className={styles.activeNameBanner}>
                            {props.bleDeviceName}
                        </div>
                    )}
                    <p className={styles.stepHint}>
                        <FormattedMessage
                            defaultMessage="This name is used on Upload"
                            description="One-line hint for BLE name"
                            id="gui.boardConnection.bleNameHintShort"
                        />
                    </p>
                    <div className={styles.splitPaneScroll}>
                        <BleNameSection
                            mode={props.bleNameMode}
                            draftName={props.bleNameDraft}
                            nameError={props.bleNameError}
                            batchNames={props.bleBatchNames}
                            batchIndex={props.bleBatchIndex}
                            batchFileName={props.bleBatchFileName}
                            batchErrors={props.bleBatchErrors}
                            activeName={props.bleDeviceName}
                            onModeChange={props.onBleNameModeChange}
                            onDraftChange={props.onBleNameDraftChange}
                            onSaveManual={props.onBleNameSave}
                            onImportCsv={props.onBleNameImport}
                            onBatchNext={props.onBleBatchNext}
                            onBatchSkip={props.onBleBatchSkip}
                            onBatchClear={props.onBleBatchClear}
                            onUseBatchCurrent={props.onBleUseBatchCurrent}
                        />
                    </div>
                </div>

                <div className={`${styles.splitPane} ${styles.splitPaneRight}`}>
                    <div className={styles.splitPaneHeader}>
                        <FormattedMessage
                            defaultMessage="2. Connect"
                            description="Right pane title short"
                            id="gui.boardConnection.splitBoardTitleShort"
                        />
                    </div>
                    <p className={styles.stepHint}>
                        <FormattedMessage
                            defaultMessage="Select USB to rename, then Upload"
                            description="One-line connect hint"
                            id="gui.boardConnection.connectHintShort"
                        />
                    </p>
                    <div className={styles.splitPaneScroll}>
                        {props.showUsbList && (
                            <UsbPortList
                                ports={props.ports}
                                onConnect={props.onConnect}
                                esp32Label
                            />
                        )}
                        <div className={styles.wifiBlock}>
                            <BlePairingSection
                                bleDevices={props.bleDevices}
                                bleScanError={props.bleScanError}
                                isScanningBle={props.isScanningBle}
                                pairingBleId={props.pairingBleId}
                                targetBleName={props.bleDeviceName}
                                lastFlashedBleName={props.lastFlashedBleName}
                                onPairBle={props.onPairBle}
                                onScanBle={props.onScanBle}
                            />
                        </div>
                    </div>
                </div>
            </div>
        ) : (
            <div className={styles.body}>
                {props.showUsbList && (
                    <UsbPortList
                        ports={props.ports}
                        onConnect={props.onConnect}
                        docked
                    />
                )}
            </div>
        )}
        {props.connectionSuccess && (
            <div className={styles.successOverlay}>
                <div className={styles.successCard}>
                    <div className={styles.successIcon}>✓</div>
                    <div className={styles.successTitle}>
                        <FormattedMessage
                            defaultMessage="Connected"
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
    bleBatchErrors: PropTypes.arrayOf(PropTypes.string),
    bleBatchFileName: PropTypes.string,
    bleBatchIndex: PropTypes.number,
    bleBatchNames: PropTypes.arrayOf(PropTypes.string),
    bleDeviceName: PropTypes.string,
    bleDevices: PropTypes.arrayOf(PropTypes.object),
    bleNameDraft: PropTypes.string,
    bleNameError: PropTypes.string,
    bleNameMode: PropTypes.oneOf(['manual', 'batch']),
    bleScanError: PropTypes.string,
    connectionSuccess: PropTypes.string,
    isEsp32: PropTypes.bool,
    isLoading: PropTypes.bool,
    isScanningBle: PropTypes.bool,
    lastFlashedBleName: PropTypes.string,
    onBleBatchClear: PropTypes.func,
    onBleBatchNext: PropTypes.func,
    onBleBatchSkip: PropTypes.func,
    onBleNameDraftChange: PropTypes.func,
    onBleNameImport: PropTypes.func,
    onBleNameModeChange: PropTypes.func,
    onBleNameSave: PropTypes.func,
    onBleUseBatchCurrent: PropTypes.func,
    onCancel: PropTypes.func.isRequired,
    onConnect: PropTypes.func.isRequired,
    onPairBle: PropTypes.func,
    onScanBle: PropTypes.func,
    pairingBleId: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
    ports: PropTypes.arrayOf(PropTypes.object).isRequired,
    showUsbList: PropTypes.bool
};

BoardConnectionDialogComponent.defaultProps = {
    bleBatchErrors: [],
    bleBatchFileName: '',
    bleBatchIndex: 0,
    bleBatchNames: [],
    bleDeviceName: 'Garudabot',
    bleDevices: [],
    bleNameDraft: 'Garudabot',
    bleNameError: null,
    bleNameMode: 'manual',
    bleScanError: null,
    connectionSuccess: null,
    isEsp32: false,
    isLoading: false,
    isScanningBle: false,
    lastFlashedBleName: null,
    pairingBleId: null,
    showUsbList: true
};

export default injectIntl(BoardConnectionDialogComponent);
