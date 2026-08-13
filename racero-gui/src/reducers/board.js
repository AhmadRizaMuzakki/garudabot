const SET_SELECTING  = 'racero-gui/board/SET_SELECTING';
const SET_SELECTED   = 'racero-gui/board/SET_SELECTED';
const SET_CONNECTING = 'racero-gui/board/SET_CONNECTING';
const SET_CONNECTED  = 'racero-gui/board/SET_CONNECTED';
const SET_COMPILING  = 'racero-gui/board/SET_COMPILING';
const SET_INSTALLING = 'racero-gui/board/SET_INSTALLING';
const SET_UPLOADING  = 'racero-gui/board/SET_UPLOADING';

const SET_CONNECTED_DEVICES = 'racero-gui/board/SET_CONNECTED_DEVICES';

const initialState = {
    isSelecting: false,
    isSelected: true,
    isConnecting: false,
    isConnected: false,
    isCompiling: false,
    isInstalling: false,
    isUploading: false,

    connectedDevice: null
};

const reducer = function (state, action) {
    if (typeof state === 'undefined') state = initialState;
    switch (action.type) {
        case SET_SELECTING:
            return Object.assign({}, state, {
                isSelecting: action.selecting
            });
        case SET_SELECTED:
            return Object.assign({}, state, {
                isSelected: action.selected
            });
        case SET_CONNECTING:
            return Object.assign({}, state, {
                isConnecting: action.connecting
            });
        case SET_CONNECTED:
            return Object.assign({}, state, {
                isConnected: action.connected
            });
        case SET_COMPILING:
            return Object.assign({}, state, {
                isCompiling: action.compiling
            });
        case SET_INSTALLING:
            return Object.assign({}, state, {
                isInstalling: action.installing
            });
        case SET_UPLOADING:
            return Object.assign({}, state, {
                isUploading: action.uploading
            });
        case SET_CONNECTED_DEVICES:
            return Object.assign({}, state, {
                connectedDevice: action.details
            });
        default:
            return state;
    }
};

// Action Creators
const setSelectingStatus = (selecting) => ({
    type: SET_SELECTING,
    selecting: selecting
});

const setSelectedStatus = (selected) => ({
    type: SET_SELECTED,
    selected: selected
});

const setConnectingStatus = (connecting) => ({
    type: SET_CONNECTING,
    connecting: connecting
});

const setConnectedStatus = (connected) => ({
    type: SET_CONNECTED,
    connected: connected
});

const setCompilingStatus = (compiling) => ({
    type: SET_COMPILING,
    compiling: compiling
});

const setInstallStatus = (installing) => ({
    type: SET_INSTALLING,
    installing: installing
});

const setUploadStatus = (uploading) => ({
    type: SET_UPLOADING,
    compiling: uploading
});

const setConnectionDetails = function (details) {
    return {
        type: SET_CONNECTED_DEVICES,
        details: details
    };
};

export {
    reducer as default,
    initialState as boardInitialState,
    setSelectingStatus,
    setSelectedStatus,
    setConnectingStatus,
    setConnectedStatus,
    setCompilingStatus,
    setInstallStatus,
    setUploadStatus,
    setConnectionDetails,
};
