import PropTypes from 'prop-types';
import React from 'react';
import {compose} from 'redux';
import {connect} from 'react-redux';
import ReactModal from 'react-modal';
import VM from 'racero-vm';
import {injectIntl, intlShape} from 'react-intl';

import ErrorBoundaryHOC from '../lib/error-boundary-hoc.jsx';
import {
    getIsError,
    getIsShowingProject
} from '../reducers/project-state';
import {
    activateTab,
    BLOCKS_TAB_INDEX,
    COSTUMES_TAB_INDEX,
    SOUNDS_TAB_INDEX
} from '../reducers/editor-tab';

import {
    closeCostumeLibrary,
    closeBackdropLibrary,
    closeTelemetryModal,
    openExtensionLibrary
} from '../reducers/modals';

import FontLoaderHOC from '../lib/font-loader-hoc.jsx';
import LocalizationHOC from '../lib/localization-hoc.jsx';
import SBFileUploaderHOC from '../lib/sb-file-uploader-hoc.jsx';
import ProjectFetcherHOC from '../lib/project-fetcher-hoc.jsx';
import TitledHOC from '../lib/titled-hoc.jsx';
import ProjectSaverHOC from '../lib/project-saver-hoc.jsx';
import QueryParserHOC from '../lib/query-parser-hoc.jsx';
import storage from '../lib/storage';
import vmListenerHOC from '../lib/vm-listener-hoc.jsx';
import vmManagerHOC from '../lib/vm-manager-hoc.jsx';
import cloudManagerHOC from '../lib/cloud-manager-hoc.jsx';
import systemPreferencesHOC from '../lib/system-preferences-hoc.jsx';

import GUIComponent from '../components/gui/gui.jsx';
import {setIsRaceroDesktop} from '../lib/isRaceroDesktop.js';

const {RequestMetadata, setMetadata, unsetMetadata} = storage.scratchFetch;

const setProjectIdMetadata = projectId => {
    // If project ID is '0' or zero, it's not a real project ID. In that case, remove the project ID metadata.
    // Same if it's null undefined.
    if (projectId && projectId !== '0') {
        setMetadata(RequestMetadata.ProjectId, projectId);
    } else {
        unsetMetadata(RequestMetadata.ProjectId);
    }
};

class GUI extends React.Component {
    componentDidMount () {
        setIsRaceroDesktop(this.props.isRaceroDesktop);
        this.props.onStorageInit(storage);
        this.props.onVmInit(this.props.vm);

        setProjectIdMetadata(this.props.projectId);
    }
    componentDidUpdate (prevProps) {
        if (this.props.projectId !== prevProps.projectId) {
            if (this.props.projectId !== null) {
                this.props.onUpdateProjectId(this.props.projectId);
            }
            setProjectIdMetadata(this.props.projectId);
        }
        if (this.props.isShowingProject && !prevProps.isShowingProject) {
            // this only notifies container when a project changes from not yet loaded to loaded
            // At this time the project view in www doesn't need to know when a project is unloaded
            this.props.onProjectLoaded();
        }
    }
    render () {
        if (this.props.isError) {
            throw new Error(
                `Error in Racero GUI [location=${window.location}]: ${this.props.error}`);
        }
        const {
            /* eslint-disable no-unused-vars */
            assetHost,
            cloudHost,
            error,
            isError,
            isRaceroDesktop,
            isShowingProject,
            onProjectLoaded,
            onStorageInit,
            onUpdateProjectId,
            onVmInit,
            projectHost,
            projectId,
            /* eslint-enable no-unused-vars */
            children,
            fetchingProject,
            isLoading,
            loadingStateVisible,
            ...componentProps
        } = this.props;
        return (
            <GUIComponent
                loading={fetchingProject || isLoading || loadingStateVisible}
                {...componentProps}
            >
                {children}
            </GUIComponent>
        );
    }
}

GUI.propTypes = {
    assetHost: PropTypes.string,
    children: PropTypes.node,
    cloudHost: PropTypes.string,
    error: PropTypes.oneOfType([PropTypes.object, PropTypes.string]),
    fetchingProject: PropTypes.bool,
    intl: intlShape,
    isError: PropTypes.bool,
    isLoading: PropTypes.bool,
    isRaceroDesktop: PropTypes.bool,
    isShowingProject: PropTypes.bool,
    isTotallyNormal: PropTypes.bool,
    loadingStateVisible: PropTypes.bool,
    onProjectLoaded: PropTypes.func,
    onSeeCommunity: PropTypes.func,
    onStorageInit: PropTypes.func,
    onUpdateProjectId: PropTypes.func,
    onVmInit: PropTypes.func,
    projectHost: PropTypes.string,
    projectId: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
    telemetryModalVisible: PropTypes.bool,
    vm: PropTypes.instanceOf(VM).isRequired
};

GUI.defaultProps = {
    isRaceroDesktop: false,
    isTotallyNormal: false,
    onStorageInit: storageInstance => storageInstance.addOfficialRaceroWebStores(),
    onProjectLoaded: () => {},
    onUpdateProjectId: () => {},
    onVmInit: (/* vm */) => {}
};

const mapStateToProps = state => {
    const loadingState = state.raceroGui.projectState.loadingState;
    return {
        activeTabIndex: state.raceroGui.editorTab.activeTabIndex,
        alertsVisible: state.raceroGui.alerts.visible,
        backdropLibraryVisible: state.raceroGui.modals.backdropLibrary,
        blocksTabVisible: state.raceroGui.editorTab.activeTabIndex === BLOCKS_TAB_INDEX,
        cardsVisible: state.raceroGui.cards.visible,
        connectionModalVisible: state.raceroGui.modals.connectionModal,
        costumeLibraryVisible: state.raceroGui.modals.costumeLibrary,
        costumesTabVisible: state.raceroGui.editorTab.activeTabIndex === COSTUMES_TAB_INDEX,
        error: state.raceroGui.projectState.error,
        isError: getIsError(loadingState),
        isFullScreen: state.raceroGui.mode.isFullScreen,
        isPlayerOnly: state.raceroGui.mode.isPlayerOnly,
        isRtl: state.locales.isRtl,
        isShowingProject: getIsShowingProject(loadingState),
        loadingStateVisible: state.raceroGui.modals.loadingProject,
        projectId: state.raceroGui.projectState.projectId,
        soundsTabVisible: state.raceroGui.editorTab.activeTabIndex === SOUNDS_TAB_INDEX,
        targetIsStage: (
            state.raceroGui.targets.stage &&
            state.raceroGui.targets.stage.id === state.raceroGui.targets.editingTarget
        ),
        telemetryModalVisible: state.raceroGui.modals.telemetryModal,
        tipsLibraryVisible: state.raceroGui.modals.tipsLibrary,
        vm: state.raceroGui.vm
    };
};

const mapDispatchToProps = dispatch => ({
    onExtensionButtonClick: () => dispatch(openExtensionLibrary()),
    onActivateTab: tab => dispatch(activateTab(tab)),
    onActivateCostumesTab: () => dispatch(activateTab(COSTUMES_TAB_INDEX)),
    onActivateSoundsTab: () => dispatch(activateTab(SOUNDS_TAB_INDEX)),
    onRequestCloseBackdropLibrary: () => dispatch(closeBackdropLibrary()),
    onRequestCloseCostumeLibrary: () => dispatch(closeCostumeLibrary()),
    onRequestCloseTelemetryModal: () => dispatch(closeTelemetryModal())
});

const ConnectedGUI = injectIntl(connect(
    mapStateToProps,
    mapDispatchToProps
)(GUI));

// note that redux's 'compose' function is just being used as a general utility to make
// the hierarchy of HOC constructor calls clearer here; it has nothing to do with redux's
// ability to compose reducers.
const WrappedGui = compose(
    LocalizationHOC,
    ErrorBoundaryHOC('Top Level App'),
    FontLoaderHOC,
    QueryParserHOC,
    ProjectFetcherHOC,
    TitledHOC,
    ProjectSaverHOC,
    vmListenerHOC,
    vmManagerHOC,
    SBFileUploaderHOC,
    cloudManagerHOC,
    systemPreferencesHOC
)(ConnectedGUI);

WrappedGui.setAppElement = ReactModal.setAppElement;
export default WrappedGui;
