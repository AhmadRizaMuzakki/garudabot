import React from 'react';
import { connect } from 'react-redux';
import { boards } from 'racero-boards';
import BoardUploaderOverlayComponent from '../components/board-uploader-overlay/board-uploader-overlay.jsx';

class BoardUploaderOverlay extends React.Component {
    constructor(props) {
        super(props);
        this.state = {
            logs: '',
            isCompiling: true
        };

        this.bottomRef = null;
        this.setBottomRef = element => {
            this.bottomRef = element;
        };

        this.unlisten = null;
    }

    componentDidMount() {
        if (this.props.isVisible) {
            this.startCompilation();
        }
    }

    componentDidUpdate(prevProps, prevState) {
        if (this.props.isVisible && !prevProps.isVisible) {
            this.setState({ logs: 'Starting compiler...\n', isCompiling: true }, () => {
                this.startCompilation();
            });
        }

        if (this.state.logs !== prevState.logs && this.bottomRef) {
            this.bottomRef.scrollIntoView({ behavior: 'smooth' });
        }
    }

    async componentWillUnmount() {
        if (this.unlisten) {
            const unsubscribe = await this.unlisten;
            if (typeof unsubscribe === 'function') {
                unsubscribe();
            } else if (typeof this.unlisten === 'function') {
                this.unlisten();
            }
    }
    }

    startCompilation = async () => {
        const tauri = window.__TAURI__;
        if (!tauri) return;

        if (this.unlisten) {
            await this.unlisten();
            this.unlisten = null;
        }

        const { cppCode } = this.props;
        try {
            this.unlisten = await tauri.event.listen('compiler-log', (event) => {
                this.setState(prevState => ({
                    logs: prevState.logs + event.payload + '\n'
                }));

                if (event.payload.includes('Process finished')) {
                    this.setState({ isCompiling: false });
                }
            });

            await tauri.core.invoke('board_disconnect');
            await new Promise(res => setTimeout(res, 500));

            await tauri.core.invoke('board_compile_and_flash', {
                code: cppCode,
                fqbn: boards[this.props.vm.runtime.boardConfig.name].fqbn,
                port: this.props.connectedDevice
            });
        } catch (error) {
            this.setState(prevState => ({
                logs: prevState.logs + '\nSYSTEM ERROR: ' + error + '\n',
                isCompiling: false
            }));
        }
    };

    render() {
        return (
            <BoardUploaderOverlayComponent
                isVisible={this.props.isVisible}
                onClose={this.props.onClose}
                logs={this.state.logs}
                isCompiling={this.state.isCompiling}
                setBottomRef={this.setBottomRef}
            />
        );
    }
}

const mapStateToProps = state => {
    return {
        vm: state.raceroGui.vm,
        connectedDevice: state.raceroGui.board.connectedDevice,
    };
};

export default connect(mapStateToProps)(BoardUploaderOverlay);
