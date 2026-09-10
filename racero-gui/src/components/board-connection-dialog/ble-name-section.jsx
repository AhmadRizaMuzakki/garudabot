/**
 * Form isi nama BLE: Manual atau antrian Excel (CSV).
 * Nama yang tersimpan dipakai inject saat Upload ESP32.
 */

import React from 'react';
import PropTypes from 'prop-types';
import {FormattedMessage} from 'react-intl';

import styles from './ble-name-section.css';
import {BLE_NAME_MAX_LEN} from '../../lib/ble/ble-device-name.js';

const BleNameSection = props => {
    const {
        mode,
        draftName,
        nameError,
        batchNames,
        batchIndex,
        batchFileName,
        batchErrors,
        onModeChange,
        onDraftChange,
        onSaveManual,
        onImportCsv,
        onBatchNext,
        onBatchSkip,
        onBatchClear
    } = props;

    const allDone = batchNames.length > 0 && batchIndex >= batchNames.length;
    const doneCount = batchNames.length ? Math.min(batchIndex, batchNames.length) : 0;

    return (
        <div className={styles.section}>
            <div className={styles.tabs}>
                <button
                    type="button"
                    className={mode === 'manual' ? styles.tabActive : styles.tab}
                    onClick={() => onModeChange('manual')}
                >
                    <FormattedMessage
                        defaultMessage="Manual"
                        description="Manual BLE name mode"
                        id="gui.boardConnection.bleNameManual"
                    />
                </button>
                <button
                    type="button"
                    className={mode === 'batch' ? styles.tabActive : styles.tab}
                    onClick={() => onModeChange('batch')}
                >
                    <FormattedMessage
                        defaultMessage="Excel"
                        description="Batch BLE name mode from Excel/CSV"
                        id="gui.boardConnection.bleNameBatch"
                    />
                </button>
            </div>

            {mode === 'manual' && (
                <div className={styles.panel}>
                    <div className={styles.row}>
                        <input
                            className={styles.input}
                            type="text"
                            maxLength={BLE_NAME_MAX_LEN}
                            value={draftName}
                            placeholder="Mobil-01"
                            onChange={e => onDraftChange(e.target.value)}
                            spellCheck={false}
                        />
                        <button
                            type="button"
                            className={styles.primaryBtn}
                            onClick={onSaveManual}
                        >
                            <FormattedMessage
                                defaultMessage="Save"
                                description="Save BLE name"
                                id="gui.boardConnection.bleNameSave"
                            />
                        </button>
                    </div>
                    {nameError ? (
                        <div className={styles.error}>{nameError}</div>
                    ) : (
                        <div className={styles.meta}>
                            <FormattedMessage
                                defaultMessage="Max {max} characters"
                                description="Short BLE name length hint"
                                id="gui.boardConnection.bleNameRulesShort"
                                values={{max: BLE_NAME_MAX_LEN}}
                            />
                        </div>
                    )}
                </div>
            )}

            {mode === 'batch' && (
                <div className={styles.panel}>
                    <div className={styles.batchActions}>
                        <button
                            type="button"
                            className={styles.primaryBtn}
                            onClick={onImportCsv}
                        >
                            <FormattedMessage
                                defaultMessage="Import CSV"
                                description="Import BLE names from CSV"
                                id="gui.boardConnection.bleNameImport"
                            />
                        </button>
                        {batchNames.length > 0 && (
                            <button
                                type="button"
                                className={styles.secondaryBtn}
                                onClick={onBatchClear}
                            >
                                <FormattedMessage
                                    defaultMessage="Clear"
                                    description="Clear BLE name batch queue"
                                    id="gui.boardConnection.bleNameClearBatch"
                                />
                            </button>
                        )}
                    </div>

                    <div className={styles.meta}>
                        <FormattedMessage
                            defaultMessage="Excel → Save As → CSV (column ble_name)"
                            description="Short Excel export hint"
                            id="gui.boardConnection.bleNameExcelHintShort"
                        />
                    </div>

                    {batchFileName && (
                        <div className={styles.fileName}>{batchFileName}</div>
                    )}

                    {batchErrors && batchErrors.length > 0 && (
                        <div className={styles.error}>
                            {batchErrors.slice(0, 2).join(' · ')}
                            {batchErrors.length > 2 ? ` (+${batchErrors.length - 2})` : ''}
                        </div>
                    )}

                    {batchNames.length === 0 ? (
                        <div className={styles.emptyBatch}>
                            <FormattedMessage
                                defaultMessage="No name list yet"
                                description="Empty batch queue message short"
                                id="gui.boardConnection.bleNameEmptyBatchShort"
                            />
                        </div>
                    ) : (
                        <React.Fragment>
                            <div className={styles.progress}>
                                {allDone ? (
                                    <FormattedMessage
                                        defaultMessage="Done {total}/{total}"
                                        description="Batch all done"
                                        id="gui.boardConnection.bleNameBatchDone"
                                        values={{total: batchNames.length}}
                                    />
                                ) : (
                                    <FormattedMessage
                                        defaultMessage="{done}/{total} done"
                                        description="Short batch progress"
                                        id="gui.boardConnection.bleNameBatchProgressShort"
                                        values={{
                                            done: doneCount,
                                            total: batchNames.length
                                        }}
                                    />
                                )}
                            </div>

                            <div className={styles.queue}>
                                {batchNames.map((name, i) => {
                                    let rowClass = styles.queueItem;
                                    if (i < batchIndex) rowClass = styles.queueDone;
                                    else if (i === batchIndex && !allDone) {
                                        rowClass = styles.queueCurrent;
                                    }
                                    return (
                                        <div key={`${name}-${i}`} className={rowClass}>
                                            <span className={styles.queueIndex}>{i + 1}</span>
                                            <span className={styles.queueName}>{name}</span>
                                            {i < batchIndex && (
                                                <span className={styles.queueTag}>
                                                    <FormattedMessage
                                                        defaultMessage="ok"
                                                        description="Batch item done badge"
                                                        id="gui.boardConnection.bleNameBatchOk"
                                                    />
                                                </span>
                                            )}
                                            {i === batchIndex && !allDone && (
                                                <span className={styles.queueTagNow}>
                                                    <FormattedMessage
                                                        defaultMessage="now"
                                                        description="Batch current item badge"
                                                        id="gui.boardConnection.bleNameBatchNow"
                                                    />
                                                </span>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>

                            {!allDone && (
                                <div className={styles.batchActions}>
                                    <button
                                        type="button"
                                        className={styles.primaryBtn}
                                        onClick={onBatchNext}
                                    >
                                        <FormattedMessage
                                            defaultMessage="Next"
                                            description="Mark flashed and advance batch"
                                            id="gui.boardConnection.bleNameBatchNext"
                                        />
                                    </button>
                                    <button
                                        type="button"
                                        className={styles.secondaryBtn}
                                        onClick={onBatchSkip}
                                    >
                                        <FormattedMessage
                                            defaultMessage="Skip"
                                            description="Skip current batch name"
                                            id="gui.boardConnection.bleNameBatchSkip"
                                        />
                                    </button>
                                </div>
                            )}

                            <div className={styles.meta}>
                                <FormattedMessage
                                    defaultMessage="Flow: USB → Upload → Next"
                                    description="Short batch workflow"
                                    id="gui.boardConnection.bleNameBatchWorkflowShort"
                                />
                            </div>
                        </React.Fragment>
                    )}
                </div>
            )}
        </div>
    );
};

BleNameSection.propTypes = {
    batchErrors: PropTypes.arrayOf(PropTypes.string),
    batchFileName: PropTypes.string,
    batchIndex: PropTypes.number,
    batchNames: PropTypes.arrayOf(PropTypes.string),
    draftName: PropTypes.string,
    mode: PropTypes.oneOf(['manual', 'batch']),
    nameError: PropTypes.string,
    onBatchClear: PropTypes.func.isRequired,
    onBatchNext: PropTypes.func.isRequired,
    onBatchSkip: PropTypes.func.isRequired,
    onDraftChange: PropTypes.func.isRequired,
    onImportCsv: PropTypes.func.isRequired,
    onModeChange: PropTypes.func.isRequired,
    onSaveManual: PropTypes.func.isRequired,
    onUseBatchCurrent: PropTypes.func
};

BleNameSection.defaultProps = {
    batchErrors: [],
    batchFileName: '',
    batchIndex: 0,
    batchNames: [],
    draftName: 'Garudabot',
    mode: 'manual',
    nameError: null
};

export default BleNameSection;
