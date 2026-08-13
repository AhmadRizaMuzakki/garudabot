import classNames from 'classnames';
import {connect} from 'react-redux';
import {compose} from 'redux';
import {defineMessages, FormattedMessage, injectIntl, intlShape} from 'react-intl';
import PropTypes from 'prop-types';
import bindAll from 'lodash.bindall';
import bowser from 'bowser';
import React from 'react';

import VM from 'racero-vm';

import Box from '../box/box.jsx';
import Button from '../button/button.jsx';
import CommunityButton from './community-button.jsx';
import ShareButton from './share-button.jsx';
import {ComingSoonTooltip} from '../coming-soon/coming-soon.jsx';
import Divider from '../divider/divider.jsx';
import SaveStatus from './save-status.jsx';
import ProjectWatcher from '../../containers/project-watcher.jsx';
import MenuBarMenu from './menu-bar-menu.jsx';
import {MenuItem, MenuSection} from '../menu/menu.jsx';
import ProjectTitleInput from './project-title-input.jsx';
import AuthorInfo from './author-info.jsx';
import AccountNav from '../../containers/account-nav.jsx';
import LoginDropdown from './login-dropdown.jsx';
import DeletionRestorer from '../../containers/deletion-restorer.jsx';
import TurboMode from '../../containers/turbo-mode.jsx';
import Board from '../../containers/board.jsx';
import MenuBarHOC from '../../containers/menu-bar-hoc.jsx';
import SettingsMenu from './settings-menu.jsx';

import {openTipsLibrary} from '../../reducers/modals';
import {setPlayer} from '../../reducers/mode';
import {
    autoUpdateProject,
    getIsUpdating,
    getIsShowingProject,
    manualUpdateProject,
    requestNewProject,
    saveProjectAsCopy,
    setProjectPath
} from '../../reducers/project-state';
import {
    openAboutMenu,
    closeAboutMenu,
    aboutMenuOpen,
    openAccountMenu,
    closeAccountMenu,
    accountMenuOpen,
    openFileMenu,
    closeFileMenu,
    fileMenuOpen,
    openEditMenu,
    closeEditMenu,
    editMenuOpen,
    openBoardMenu,
    closeBoardMenu,
    boardMenuOpen,
    openLoginMenu,
    closeLoginMenu,
    loginMenuOpen,
    openModeMenu,
    closeModeMenu,
    modeMenuOpen,
    settingsMenuOpen,
    openSettingsMenu,
    closeSettingsMenu
} from '../../reducers/menus';

import {
    generateCode
} from 'racero-compiler';

import BoardSelectionDialog from '../../containers/board-selection-dialog.jsx';
import BoardConnectionDialog from '../../containers/board-connection-dialog.jsx';
import BoardInstallingDialog from '../../containers/board-installing-dialog.jsx';
import BoardUploaderOverlay from '../../containers/board-uploader-overlay.jsx';

import collectMetadata from '../../lib/collect-metadata';

import styles from './menu-bar.css';

import helpIcon from '../../lib/assets/icon--tutorials.svg';
import mystuffIcon from './icon--mystuff.png';
import profileIcon from './icon--profile.png';
import dropdownCaret from './dropdown-caret.svg';
import aboutIcon from './icon--about.svg';
import fileIcon from './icon--file.svg';
import editIcon from './icon--edit.svg';
import boardIcon from './icon--board.svg';

import racerLogo from './racer-logo.svg';
import garudabotLogo from './garudabot.png';

import sharedMessages from '../../lib/shared-messages';

const ariaMessages = defineMessages({
    tutorials: {
        id: 'gui.menuBar.tutorialsLibrary',
        defaultMessage: 'Tutorials',
        description: 'accessibility text for the tutorials button'
    }
});

const MenuBarItemTooltip = ({
    children,
    className,
    enable,
    id,
    place = 'bottom'
}) => {
    if (enable) {
        return (
            <React.Fragment>
                {children}
            </React.Fragment>
        );
    }
    return (
        <ComingSoonTooltip
            className={classNames(styles.comingSoon, className)}
            place={place}
            tooltipClassName={styles.comingSoonTooltip}
            tooltipId={id}
        >
            {children}
        </ComingSoonTooltip>
    );
};


MenuBarItemTooltip.propTypes = {
    children: PropTypes.node,
    className: PropTypes.string,
    enable: PropTypes.bool,
    id: PropTypes.string,
    place: PropTypes.oneOf(['top', 'bottom', 'left', 'right'])
};

const MenuItemTooltip = ({id, isRtl, children, className}) => (
    <ComingSoonTooltip
        className={classNames(styles.comingSoon, className)}
        isRtl={isRtl}
        place={isRtl ? 'left' : 'right'}
        tooltipClassName={styles.comingSoonTooltip}
        tooltipId={id}
    >
        {children}
    </ComingSoonTooltip>
);

MenuItemTooltip.propTypes = {
    children: PropTypes.node,
    className: PropTypes.string,
    id: PropTypes.string,
    isRtl: PropTypes.bool
};

const AboutButton = props => (
    <Button
        className={classNames(styles.menuBarItem, styles.hoverable)}
        iconClassName={styles.aboutIcon}
        iconSrc={aboutIcon}
        onClick={props.onClick}
    />
);

AboutButton.propTypes = {
    onClick: PropTypes.func.isRequired
};

class MenuBar extends React.Component {
    constructor (props) {
        super(props);
        bindAll(this, [
            'handleClickOpen',
            'handleClickNew',
            'handleClickSave',
            'handleClickSaveAsCopy',
            'handleClickSeeCommunity',
            'handleClickShare',
            'handleUploadClick',
            'handleCloseOverlay',
            'handleKeyPress',
            'handleRestoreOption',
            'restoreOptionMessage'
        ]);

        this.state = {
            isOverlayVisible: false,
            generatedCode: ''
        };
    }
    componentDidMount () {
        document.addEventListener('keydown', this.handleKeyPress);
    }
    componentWillUnmount () {
        document.removeEventListener('keydown', this.handleKeyPress);
    }
    handleClickOpen () {
        try {
            const readyToReplaceProject = this.props.confirmReadyToReplaceProject(
                this.props.intl.formatMessage(sharedMessages.replaceProjectWarning)
            ).then(async (result) => {
                if (result) {
                    if (!this.props.projectPath) {
                        await this.handleClickSaveAsCopy();
                    }
                    this.props.onStartSelectingProjectFile();
                }
            });
        } catch (err) {
            this.props.onStartSelectingProjectFile();
        }
    }
    handleClickNew () {
        try {
            const readyToReplaceProject = this.props.confirmReadyToReplaceProject(
                this.props.intl.formatMessage(sharedMessages.replaceProjectWarning)
            ).then(result => {
                if (result) {
                    if (!this.props.projectPath) {
                        this.handleClickSaveAsCopy().then(() => {
                            this.props.onClickNew(this.props.canSave && this.props.canCreateNew);
                        });
                    }
                    this.props.onSetProjectPath(null);
                    this.props.onRequestCloseFile();
                }
            });
        } catch (err) {
            this.props.onClickNew(this.props.canSave && this.props.canCreateNew);
            this.props.onSetProjectPath(null);
            this.props.onRequestCloseFile();
        }
    }
    handleClickSave () {
        this.props.onClickSave();

        const {vm} = this.props;
        if (!window.__TAURI__) return;

        if (this.props.projectPath) {
            vm.saveProjectSb3().then(blob => {
                blob.arrayBuffer().then(content => {
                    const projectData = new Uint8Array(content);
                    window.__TAURI__.core.invoke('file_write', {
                        path: this.props.projectPath,
                        data: Array.from(projectData)
                    });
                });
            });
        } else {
            this.handleClickSaveAsCopy();
        }
    }
    handleClickSaveAsCopy () {
        const {vm} = this.props;

        const tauri = window.__TAURI__;
        if (!tauri) return;

        this.props.onClickSaveAsCopy();
        return new Promise(async (resolve, reject) => {
            try {
                const filePath = await tauri.core.invoke('plugin:dialog|save', {
                    options: {
                        filters: [{
                            name: 'Racero Project',
                            extensions: ['sb3']
                        }]
                    }
                });

                if (!filePath) resolve(false);

                const blob = await vm.saveProjectSb3();
                const buffer = await blob.arrayBuffer();
                const data = new Uint8Array(buffer);

                await tauri.core.invoke('file_write', {
                    path: filePath,
                    data: Array.from(data)
                });

                this.props.onSetProjectPath(filePath);
                resolve(true);
            } catch (err) {
                reject(err);
            }
        });
    }
    handleClickSeeCommunity (waitForUpdate) {
        if (this.props.shouldSaveBeforeTransition()) {
            this.props.autoUpdateProject(); // save before transitioning to project page
            waitForUpdate(true); // queue the transition to project page
        } else {
            waitForUpdate(false); // immediately transition to project page
        }
    }
    handleClickShare (waitForUpdate) {
        if (!this.props.isShared) {
            if (this.props.canShare) { // save before transitioning to project page
                this.props.onShare();
            }
            if (this.props.canSave) { // save before transitioning to project page
                this.props.autoUpdateProject();
                waitForUpdate(true); // queue the transition to project page
            } else {
                waitForUpdate(false); // immediately transition to project page
            }
        }
    }
    handleRestoreOption (restoreFun) {
        return () => {
            restoreFun();
            this.props.onRequestCloseEdit();
        };
    }
    handleKeyPress (event) {
        const modifier = bowser.mac ? event.metaKey : event.ctrlKey;

        if (modifier && event.key === 'o') {
            this.handleClickOpen();
            event.preventDefault();
        }

        if (modifier && event.key === 'n') {
            this.handleClickNew();
            event.preventDefault();
        }

        if (modifier && event.key === 's') {
            this.handleClickSave();
            event.preventDefault();
        }
    }
    handleUploadClick = () => {
        const { vm } = this.props;

        const code = generateCode(vm);
        console.log(code);
        this.setState({
            generatedCode: code,
            isOverlayVisible: true
        });
    };

    handleCloseOverlay = () => {
        this.setState({
            isOverlayVisible: false,
            generatedCode: ''
        });
    };
    restoreOptionMessage (deletedItem) {
        switch (deletedItem) {
        case 'Sprite':
            return (<FormattedMessage
                defaultMessage="Restore Sprite"
                description="Menu bar item for restoring the last deleted sprite."
                id="gui.menuBar.restoreSprite"
            />);
        case 'Sound':
            return (<FormattedMessage
                defaultMessage="Restore Sound"
                description="Menu bar item for restoring the last deleted sound."
                id="gui.menuBar.restoreSound"
            />);
        case 'Costume':
            return (<FormattedMessage
                defaultMessage="Restore Costume"
                description="Menu bar item for restoring the last deleted costume."
                id="gui.menuBar.restoreCostume"
            />);
        default: {
            return (<FormattedMessage
                defaultMessage="Restore"
                description="Menu bar item for restoring the last deleted item in its disabled state." /* eslint-disable-line max-len */
                id="gui.menuBar.restore"
            />);
        }
        }
    }
    buildAboutMenu (onClickAbout) {
        if (!onClickAbout) {
            // hide the button
            return null;
        }
        if (typeof onClickAbout === 'function') {
            // make a button which calls a function
            return <AboutButton onClick={onClickAbout} />;
        }
        // assume it's an array of objects
        // each item must have a 'title' FormattedMessage and a 'handleClick' function
        // generate a menu with items for each object in the array
        return (
            <div
                className={classNames(styles.menuBarItem, styles.hoverable, {
                    [styles.active]: this.props.aboutMenuOpen
                })}
                onMouseUp={this.props.onRequestOpenAbout}
            >
                <img
                    className={styles.aboutIcon}
                    src={aboutIcon}
                />
                <MenuBarMenu
                    className={classNames(styles.menuBarMenu)}
                    open={this.props.aboutMenuOpen}
                    place={this.props.isRtl ? 'right' : 'left'}
                    onRequestClose={this.props.onRequestCloseAbout}
                >
                    {
                        onClickAbout.map(itemProps => (
                            <MenuItem
                                key={itemProps.title}
                                isRtl={this.props.isRtl}
                                onClick={this.wrapAboutMenuCallback(itemProps.onClick)}
                            >
                                {itemProps.title}
                            </MenuItem>
                        ))
                    }
                </MenuBarMenu>
            </div>
        );
    }
    wrapAboutMenuCallback (callback) {
        return () => {
            callback();
            this.props.onRequestCloseAbout();
        };
    }
    render () {
        const quitMessage = (
            <FormattedMessage
                defaultMessage="Quit"
                description="Menu bar item for exiting the application"
                id="gui.menuBar.quit"
            />
        );
        const saveMessage = (
            <FormattedMessage
                defaultMessage="Save"
                description="Menu bar item for saving"
                id="gui.menuBar.save"
            />
        );
        const saveAsMessage = (
            <FormattedMessage
                defaultMessage="Save As"
                description="Menu bar item for saving as a copy"
                id="gui.menuBar.saveAs"
            />
        );
        const newProjectMessage = (
            <FormattedMessage
                defaultMessage="New Project"
                description="Menu bar item for creating a new project"
                id="gui.menuBar.newProject"
            />
        );
        // Show the About button only if we have a handler for it (like in the desktop app)
        const aboutButton = this.buildAboutMenu(this.props.onClickAbout);
        const selectBoardMessage = (
            <FormattedMessage
                defaultMessage="Select Board"
                description="Menu bar item for selecting board type"
                id="gui.menuBar.boardSelect"
            />
        );
        return (
            <Box
                className={classNames(
                    this.props.className,
                    styles.menuBar
                )}
            >
                <div className={styles.mainMenu}>
                    <div className={styles.fileGroup}>
                        <div className={classNames(styles.menuBarItem)}>
                            <img
                                id="logo_img"
                                alt="Racero"
                                className={classNames(styles.scratchLogo, {
                                    [styles.clickable]: typeof this.props.onClickLogo !== 'undefined'
                                })}
                                draggable={false}
                                src={this.props.logo}
                                onClick={this.props.onClickLogo}
                            />
                        </div>
                        {(this.props.canManageFiles) && (
                            <div
                                className={classNames(styles.menuBarItem, styles.hoverable, {
                                    [styles.active]: this.props.fileMenuOpen
                                })}
                                onMouseUp={this.props.onClickFile}
                            >
                                <img src={fileIcon} />
                                <span className={styles.collapsibleLabel}>
                                    <FormattedMessage
                                        defaultMessage="File"
                                        description="Text for file dropdown menu"
                                        id="gui.menuBar.file"
                                    />
                                </span>
                                <img src={dropdownCaret} />
                                <MenuBarMenu
                                    className={classNames(styles.menuBarMenu)}
                                    open={this.props.fileMenuOpen}
                                    place={this.props.isRtl ? 'left' : 'right'}
                                    onRequestClose={this.props.onRequestCloseFile}
                                >
                                    <MenuSection>
                                        <MenuItem
                                            isRtl={this.props.isRtl}
                                            onClick={this.handleClickNew}
                                        >
                                            {newProjectMessage}
                                        </MenuItem>
                                    </MenuSection>
                                    <MenuSection>
                                        <MenuItem
                                            onClick={this.handleClickOpen}
                                        >
                                            {this.props.intl.formatMessage(sharedMessages.openProject)}
                                        </MenuItem>
                                        <MenuItem onClick={this.handleClickSave}>
                                            {saveMessage}
                                        </MenuItem>
                                        <MenuItem onClick={this.handleClickSaveAsCopy}>
                                            {saveAsMessage}
                                        </MenuItem>
                                    </MenuSection>
                                    <MenuSection>
                                        <MenuItem
                                            onClick={() => {
                                                if (window.__TAURI__) {
                                                    window.__TAURI__.core.invoke('app_quit');
                                                }
                                            }}
                                        >
                                            {quitMessage}
                                        </MenuItem>
                                    </MenuSection>
                                </MenuBarMenu>
                            </div>
                        )}
                        <div
                            className={classNames(styles.menuBarItem, styles.hoverable, {
                                [styles.active]: this.props.editMenuOpen
                            })}
                            onMouseUp={this.props.onClickEdit}
                        >
                            <img src={editIcon} />
                            <span className={styles.collapsibleLabel}>
                                <FormattedMessage
                                    defaultMessage="Edit"
                                    description="Text for edit dropdown menu"
                                    id="gui.menuBar.edit"
                                />
                            </span>
                            <img src={dropdownCaret} />
                            <MenuBarMenu
                                className={classNames(styles.menuBarMenu)}
                                open={this.props.editMenuOpen}
                                place={this.props.isRtl ? 'left' : 'right'}
                                onRequestClose={this.props.onRequestCloseEdit}
                            >
                                <DeletionRestorer>{(handleRestore, {restorable, deletedItem}) => (
                                    <MenuItem
                                        className={classNames({[styles.disabled]: !restorable})}
                                        onClick={this.handleRestoreOption(handleRestore)}
                                    >
                                        {this.restoreOptionMessage(deletedItem)}
                                    </MenuItem>
                                )}</DeletionRestorer>
                                <MenuSection>
                                    <TurboMode>{(toggleTurboMode, {turboMode}) => (
                                        <MenuItem onClick={toggleTurboMode}>
                                            {turboMode ? (
                                                <FormattedMessage
                                                    defaultMessage="Turn off Turbo Mode"
                                                    description="Menu bar item for turning off turbo mode"
                                                    id="gui.menuBar.turboModeOff"
                                                />
                                            ) : (
                                                <FormattedMessage
                                                    defaultMessage="Turn on Turbo Mode"
                                                    description="Menu bar item for turning on turbo mode"
                                                    id="gui.menuBar.turboModeOn"
                                                />
                                            )}
                                        </MenuItem>
                                    )}</TurboMode>
                                </MenuSection>
                            </MenuBarMenu>
                        </div>
                        <div
                            className={classNames(styles.menuBarItem, styles.hoverable, {
                                [styles.active]: this.props.boardMenuOpen
                            })}
                            onMouseUp={this.props.onClickBoard}
                        >
                            <img src={boardIcon} />
                            <span className={styles.collapsibleLabel}>
                                <FormattedMessage
                                    defaultMessage="Board"
                                    description="Text for edit dropdown menu"
                                    id="gui.menuBar.board"
                                />
                            </span>
                            <img src={dropdownCaret} />
                            <MenuBarMenu
                                className={classNames(styles.menuBarMenu)}
                                open={this.props.boardMenuOpen}
                                place={this.props.isRtl ? 'left' : 'right'}
                                onRequestClose={this.props.onRequestCloseBoard}
                            >
                                <Board>{(handleBoardSelection, toggleBoardConnection, handleLiveModeOn, handleLiveModeOff, {isSelected, isInstalling, isConnected, connectedDevice}) => (
                                    <div>
                                        <MenuSection>
                                            <MenuItem onClick={handleBoardSelection}>
                                                {selectBoardMessage}
                                            </MenuItem>
                                            <MenuItem onClick={toggleBoardConnection}>
                                                {connectedDevice ? (
                                                    <FormattedMessage
                                                        defaultMessage="Disconnect Board"
                                                        description="Menu bar item for disconnect from the board"
                                                        id="gui.menuBar.boardDisconnect"
                                                    />
                                                ) : (
                                                    <FormattedMessage
                                                        defaultMessage="Connect Board"
                                                        description="Menu bar item for connecting to the board"
                                                        id="gui.menuBar.boardConnect"
                                                    />
                                                )}
                                            </MenuItem>
                                        </MenuSection>
                                        <MenuSection>
                                            {connectedDevice && !isConnected && (
                                            <MenuItem onClick={handleLiveModeOn}>
                                                <FormattedMessage
                                                    defaultMessage="Turn Live Mode On"
                                                    description="Menu bar item for turning on direct code execution on board"
                                                    id="gui.menuBar.boardLiveModeOn"
                                                />
                                            </MenuItem>
                                            )}
                                            {connectedDevice && isConnected && (
                                            <MenuItem onClick={handleLiveModeOff}>
                                                <FormattedMessage
                                                    defaultMessage="Turn Live Mode Off"
                                                    description="Menu bar item for turning off direct code execution on board"
                                                    id="gui.menuBar.boardLiveModeOff"
                                                />
                                            </MenuItem>
                                            )}
                                            { connectedDevice && (
                                            <MenuItem onClick={this.handleUploadClick}>
                                                <FormattedMessage
                                                    defaultMessage="Upload Program"
                                                    description="Menu bar item for uploading program to the board"
                                                    id="gui.menuBar.boardUploadProgram"
                                                />
                                            </MenuItem>
                                            )}
                                        </MenuSection>
                                    </div>
                                )}</Board>
                            </MenuBarMenu>
                        </div>
                    </div>
                </div>

                {(this.props.canChangeTheme || this.props.canChangeLanguage) && (<SettingsMenu
                    canChangeLanguage={this.props.canChangeLanguage}
                    canChangeTheme={this.props.canChangeTheme}
                    isRtl={this.props.isRtl}
                    onRequestClose={this.props.onRequestCloseSettings}
                    onRequestOpen={this.props.onClickSettings}
                    settingsMenuOpen={this.props.settingsMenuOpen}
                />)}

                {aboutButton}

                <BoardSelectionDialog />
                <BoardConnectionDialog />
                <BoardInstallingDialog />
                <BoardUploaderOverlay
                    isVisible={this.state.isOverlayVisible}
                    onClose={this.handleCloseOverlay}
                    cppCode={this.state.generatedCode}
                />
            </Box>
        );
    }
}

MenuBar.propTypes = {
    aboutMenuOpen: PropTypes.bool,
    accountMenuOpen: PropTypes.bool,
    authorId: PropTypes.oneOfType([PropTypes.string, PropTypes.bool]),
    authorThumbnailUrl: PropTypes.string,
    authorUsername: PropTypes.oneOfType([PropTypes.string, PropTypes.bool]),
    autoUpdateProject: PropTypes.func,
    canChangeLanguage: PropTypes.bool,
    canChangeTheme: PropTypes.bool,
    canCreateCopy: PropTypes.bool,
    canCreateNew: PropTypes.bool,
    canEditTitle: PropTypes.bool,
    canManageFiles: PropTypes.bool,
    canRemix: PropTypes.bool,
    canSave: PropTypes.bool,
    canShare: PropTypes.bool,
    className: PropTypes.string,
    confirmReadyToReplaceProject: PropTypes.func,
    currentLocale: PropTypes.string.isRequired,
    boardMenuOpen: PropTypes.bool,
    editMenuOpen: PropTypes.bool,
    enableCommunity: PropTypes.bool,
    fileMenuOpen: PropTypes.bool,
    intl: intlShape,
    isRtl: PropTypes.bool,
    isShared: PropTypes.bool,
    isShowingProject: PropTypes.bool,
    isTotallyNormal: PropTypes.bool,
    isUpdating: PropTypes.bool,
    locale: PropTypes.string.isRequired,
    loginMenuOpen: PropTypes.bool,
    logo: PropTypes.string,
    mode1920: PropTypes.bool,
    mode1990: PropTypes.bool,
    mode2020: PropTypes.bool,
    mode220022BC: PropTypes.bool,
    modeMenuOpen: PropTypes.bool,
    modeNow: PropTypes.bool,
    onClickAbout: PropTypes.oneOfType([
        PropTypes.func, // button mode: call this callback when the About button is clicked
        PropTypes.arrayOf( // menu mode: list of items in the About menu
            PropTypes.shape({
                title: PropTypes.string, // text for the menu item
                onClick: PropTypes.func // call this callback when the menu item is clicked
            })
        )
    ]),
    onClickAccount: PropTypes.func,
    onClickBoard: PropTypes.func,
    onClickEdit: PropTypes.func,
    onClickFile: PropTypes.func,
    onClickLogin: PropTypes.func,
    onClickLogo: PropTypes.func,
    onClickMode: PropTypes.func,
    onClickNew: PropTypes.func,
    onClickRemix: PropTypes.func,
    onClickSave: PropTypes.func,
    onClickSaveAsCopy: PropTypes.func,
    onClickSettings: PropTypes.func,
    onLogOut: PropTypes.func,
    onOpenRegistration: PropTypes.func,
    onOpenTipLibrary: PropTypes.func,
    onProjectTelemetryEvent: PropTypes.func,
    onRequestCloseAbout: PropTypes.func,
    onRequestCloseAccount: PropTypes.func,
    onRequestCloseBoard: PropTypes.func,
    onRequestCloseEdit: PropTypes.func,
    onRequestCloseFile: PropTypes.func,
    onRequestCloseLogin: PropTypes.func,
    onRequestCloseMode: PropTypes.func,
    onRequestCloseSettings: PropTypes.func,
    onRequestOpenAbout: PropTypes.func,
    onSeeCommunity: PropTypes.func,
    onShare: PropTypes.func,
    onStartSelectingProjectFile: PropTypes.func,
    onToggleLoginOpen: PropTypes.func,
    projectTitle: PropTypes.string,
    renderLogin: PropTypes.func,
    sessionExists: PropTypes.bool,
    settingsMenuOpen: PropTypes.bool,
    shouldSaveBeforeTransition: PropTypes.func,
    showComingSoon: PropTypes.bool,
    username: PropTypes.string,
    userOwnsProject: PropTypes.bool,
    vm: PropTypes.instanceOf(VM).isRequired
};

MenuBar.defaultProps = {
    logo: garudabotLogo,
    onShare: () => {}
};

const mapStateToProps = (state, ownProps) => {
    const loadingState = state.raceroGui.projectState.loadingState;
    const user = state.session && state.session.session && state.session.session.user;
    return {
        aboutMenuOpen: aboutMenuOpen(state),
        accountMenuOpen: accountMenuOpen(state),
        currentLocale: state.locales.locale,
        fileMenuOpen: fileMenuOpen(state),
        editMenuOpen: editMenuOpen(state),
        boardMenuOpen: boardMenuOpen(state),
        isRtl: state.locales.isRtl,
        isUpdating: getIsUpdating(loadingState),
        isShowingProject: getIsShowingProject(loadingState),
        locale: state.locales.locale,
        loginMenuOpen: loginMenuOpen(state),
        modeMenuOpen: modeMenuOpen(state),
        projectTitle: state.raceroGui.projectTitle,
        sessionExists: state.session && typeof state.session.session !== 'undefined',
        settingsMenuOpen: settingsMenuOpen(state),
        username: user ? user.username : null,
        userOwnsProject: ownProps.authorUsername && user &&
            (ownProps.authorUsername === user.username),
        vm: state.raceroGui.vm,
        projectPath: state.raceroGui.projectState.projectPath,
    };
};

const mapDispatchToProps = dispatch => ({
    autoUpdateProject: () => dispatch(autoUpdateProject()),
    onOpenTipLibrary: () => dispatch(openTipsLibrary()),
    onClickAccount: () => dispatch(openAccountMenu()),
    onRequestCloseAccount: () => dispatch(closeAccountMenu()),
    onClickFile: () => dispatch(openFileMenu()),
    onRequestCloseFile: () => dispatch(closeFileMenu()),
    onClickEdit: () => dispatch(openEditMenu()),
    onRequestCloseEdit: () => dispatch(closeEditMenu()),
    onClickBoard: () => dispatch(openBoardMenu()),
    onRequestCloseBoard: () => dispatch(closeBoardMenu()),
    onClickLogin: () => dispatch(openLoginMenu()),
    onRequestCloseLogin: () => dispatch(closeLoginMenu()),
    onClickMode: () => dispatch(openModeMenu()),
    onRequestCloseMode: () => dispatch(closeModeMenu()),
    onRequestOpenAbout: () => dispatch(openAboutMenu()),
    onRequestCloseAbout: () => dispatch(closeAboutMenu()),
    onClickSettings: () => dispatch(openSettingsMenu()),
    onRequestCloseSettings: () => dispatch(closeSettingsMenu()),
    onClickNew: needSave => dispatch(requestNewProject(needSave)),
    onClickSave: () => dispatch(manualUpdateProject()),
    onClickSaveAsCopy: () => dispatch(saveProjectAsCopy()),
    onSeeCommunity: () => dispatch(setPlayer(true)),
    onSetProjectPath: (path) => dispatch(setProjectPath(path))
});

export default compose(
    injectIntl,
    MenuBarHOC,
    connect(
        mapStateToProps,
        mapDispatchToProps
    )
)(MenuBar);
