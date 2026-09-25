const SET_VISIBLE = 'racero-gui/debug-panel/SET_VISIBLE';
const SET_TAB = 'racero-gui/debug-panel/SET_TAB';
const APPEND_LOG = 'racero-gui/debug-panel/APPEND_LOG';
const CLEAR_LOG = 'racero-gui/debug-panel/CLEAR_LOG';
const APPEND_SERIAL = 'racero-gui/debug-panel/APPEND_SERIAL';
const CLEAR_SERIAL = 'racero-gui/debug-panel/CLEAR_SERIAL';
const SET_SERIAL_STATUS = 'racero-gui/debug-panel/SET_SERIAL_STATUS';

const MAX_LOG_CHARS = 200000;
const MAX_SERIAL_CHARS = 200000;

const trimTail = (text, max) => {
    if (!text || text.length <= max) return text || '';
    return text.slice(text.length - max);
};

const initialState = {
    visible: false,
    tab: 'log', // 'log' | 'serial'
    logs: '',
    serialOut: '',
    serialConnected: false,
    serialPort: '',
    serialBaud: 115200,
    serialStatus: ''
};

const reducer = function (state, action) {
    if (typeof state === 'undefined') state = initialState;
    switch (action.type) {
    case SET_VISIBLE:
        return Object.assign({}, state, {
            visible: Boolean(action.visible)
        });
    case SET_TAB:
        return Object.assign({}, state, {
            tab: action.tab === 'serial' ? 'serial' : 'log'
        });
    case APPEND_LOG:
        return Object.assign({}, state, {
            logs: trimTail(state.logs + (action.text || ''), MAX_LOG_CHARS)
        });
    case CLEAR_LOG:
        return Object.assign({}, state, {logs: ''});
    case APPEND_SERIAL:
        return Object.assign({}, state, {
            serialOut: trimTail(state.serialOut + (action.text || ''), MAX_SERIAL_CHARS)
        });
    case CLEAR_SERIAL:
        return Object.assign({}, state, {serialOut: ''});
    case SET_SERIAL_STATUS:
        return Object.assign({}, state, {
            serialConnected: typeof action.connected === 'boolean' ?
                action.connected : state.serialConnected,
            serialPort: action.port !== undefined ? action.port : state.serialPort,
            serialBaud: action.baud !== undefined ? action.baud : state.serialBaud,
            serialStatus: action.status !== undefined ? action.status : state.serialStatus
        });
    default:
        return state;
    }
};

const setDebugPanelVisible = visible => ({
    type: SET_VISIBLE,
    visible
});

const setDebugPanelTab = tab => ({
    type: SET_TAB,
    tab
});

const appendDebugLog = text => ({
    type: APPEND_LOG,
    text
});

const clearDebugLog = () => ({type: CLEAR_LOG});

const appendSerialOut = text => ({
    type: APPEND_SERIAL,
    text
});

const clearSerialOut = () => ({type: CLEAR_SERIAL});

const setSerialStatus = ({connected, port, baud, status} = {}) => ({
    type: SET_SERIAL_STATUS,
    connected,
    port,
    baud,
    status
});

export {
    reducer as default,
    initialState as debugPanelInitialState,
    setDebugPanelVisible,
    setDebugPanelTab,
    appendDebugLog,
    clearDebugLog,
    appendSerialOut,
    clearSerialOut,
    setSerialStatus
};
