import {connect} from 'react-redux';
import DragLayer from '../components/drag-layer/drag-layer.jsx';

const mapStateToProps = state => ({
    dragging: state.raceroGui.assetDrag.dragging,
    currentOffset: state.raceroGui.assetDrag.currentOffset,
    img: state.raceroGui.assetDrag.img
});

export default connect(mapStateToProps)(DragLayer);
