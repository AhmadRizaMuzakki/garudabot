const faceapi = require('face-api.js');
const formatMessage = require('format-message');

const iconURI = "data:image/png;base64,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";

class RaceroExpresive {
    constructor (runtime) {
        this.runtime = runtime;
        this.isEngineReady = false;

        // AI Guess States
        this.currentExpression = 'neutral';
        this.currentAge = 0;
        this.currentGender = 'unknown';
        this.currentLandmarks = null; // Stores the 68 points

        // Overlay Drawing States
        this.showLandmarks = false;
        this.overlayCanvas = null;
        this.ctx = null;
    }

    getInfo () {
        return {
            id: 'expresive',
            name: 'Expressive',
            color1: '#8A2BE2',
            color2: '#6A1B9A',
            color3: '#4A148C',
            blockIconURI: iconURI,
            blocks: [
                {
                    opcode: 'initFaceEngine',
                    blockType: 'command',
                    text: formatMessage({
                        id: 'expresive.initialize',
                        default: 'initialize expressive AI',
                        description: 'initialize face models'
                    })
                },
                {
                    opcode: 'startFaceTracking',
                    blockType: 'command',
                    text: formatMessage({
                        id: 'expresive.startTracking',
                        default: 'start tracking face',
                        description: 'start webcam loop'
                    })
                },
                {
                    opcode: 'toggleLandmarks',
                    blockType: 'command',
                    text: formatMessage({
                        id: 'expresive.toggleLandmarks',
                        default: 'show face landmarks [STATE]',
                        description: 'toggle facial landmark drawing overlay'
                    }),
                    arguments: {
                        STATE: {
                            type: 'string',
                            menu: 'stateMenu',
                            defaultValue: 'on'
                        }
                    }
                },
                {
                    opcode: 'getCurrentExpression',
                    blockType: 'reporter',
                    text: formatMessage({
                        id: 'expresive.current',
                        default: 'current expression',
                        description: 'returns current emotion string'
                    })
                },
                {
                    opcode: 'checkExpression',
                    blockType: 'Boolean',
                    isTerminal: false,
                    text: formatMessage({
                        id: 'expresive.checkExpression',
                        default: 'is expressing [EXPRESSION]?',
                        description: 'boolean check for emotion'
                    }),
                    arguments: {
                        EXPRESSION: {
                            type: 'string',
                            menu: 'expressionMenu',
                            defaultValue: 'happy'
                        }
                    }
                },
                {
                    opcode: 'whenExpression',
                    blockType: 'hat',
                    text: formatMessage({
                        id: 'expresive.whenExpression',
                        default: 'when expression is [EXPRESSION]',
                        description: 'event hat block for emotion'
                    }),
                    arguments: {
                        EXPRESSION: {
                            type: 'string',
                            menu: 'expressionMenu',
                            defaultValue: 'surprised'
                        }
                    }
                },
                {
                    opcode: 'getEstimatedAge',
                    blockType: 'reporter',
                    text: formatMessage({
                        id: 'expresive.getAge',
                        default: 'estimated age',
                        description: 'returns AI age guess'
                    })
                },
                {
                    opcode: 'getEstimatedGender',
                    blockType: 'reporter',
                    text: formatMessage({
                        id: 'expresive.getGender',
                        default: 'estimated gender',
                        description: 'returns AI gender guess'
                    })
                },
                {
                    opcode: 'getLandmarkPosition',
                    blockType: 'reporter',
                    text: formatMessage({
                        id: 'expresive.getLandmark',
                        default: 'landmark point [POINT] [AXIS] position',
                        description: 'returns x or y coordinate of a facial point'
                    }),
                    arguments: {
                        POINT: {
                            type: 'number',
                            defaultValue: 33 // Default: Tip of the nose
                        },
                        AXIS: {
                            type: 'string',
                            menu: 'axisMenu',
                            defaultValue: 'x'
                        }
                    }
                }
            ],
            menus: {
                expressionMenu: {
                    acceptReporters: true,
                    items: ['happy', 'sad', 'angry', 'surprised', 'neutral', 'disgusted', 'fearful']
                },
                stateMenu: {
                    acceptReporters: false,
                    items: ['on', 'off']
                },
                axisMenu: {
                    acceptReporters: false,
                    items: ['x', 'y']
                }
            }
        };
    }

    async initFaceEngine () {
        if (this.isEngineReady) return;

        const MODEL_URL = '/static/assets/models';

        // Load all 4 required neural networks
        await faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL);
        await faceapi.nets.faceExpressionNet.loadFromUri(MODEL_URL);
        await faceapi.nets.ageGenderNet.loadFromUri(MODEL_URL);
        await faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL);

        this.isEngineReady = true;
    }

    async startFaceTracking () {
        if (!this.isEngineReady) return;
        this.runtime.ioDevices.video.enableVideo();

        // Inject the invisible drawing canvas over the Scratch Stage
        if (!this.overlayCanvas) {
            const scratchCanvas = document.querySelector('canvas');
            if (scratchCanvas && scratchCanvas.parentElement) {
                this.overlayCanvas = document.createElement('canvas');
                // Force to Scratch stage dimensions
                this.overlayCanvas.width = 480;
                this.overlayCanvas.height = 360;
                this.overlayCanvas.style.position = 'absolute';
                this.overlayCanvas.style.top = '0';
                this.overlayCanvas.style.left = '0';
                this.overlayCanvas.style.pointerEvents = 'none'; // Don't block Scratch blocks
                this.overlayCanvas.style.zIndex = '100';

                this.ctx = this.overlayCanvas.getContext('2d');
                scratchCanvas.parentElement.appendChild(this.overlayCanvas);
            }
        }

        this._processingLoop();
    }

    async _processingLoop () {
        if (!this.isEngineReady) return;

        const videoFrame = this.runtime.ioDevices.video.getFrame({ format: 'canvas' });

        if (videoFrame) {
            const detection = await faceapi.detectSingleFace(
                videoFrame,
                new faceapi.TinyFaceDetectorOptions()
            ).withFaceLandmarks().withFaceExpressions().withAgeAndGender();

            if (detection) {
                // 1. Process Expressions & Demographics
                const expressions = detection.expressions;
                const topExpression = Object.keys(expressions).reduce((a, b) => expressions[a] > expressions[b] ? a : b);
                this.currentExpression = topExpression;
                this.currentAge = Math.round(detection.age);
                this.currentGender = detection.gender;

                // 2. Save points to memory for the coordinate block
                this.currentLandmarks = detection.landmarks.positions;

                // 3. Draw Landmarks if toggled ON
                if (this.showLandmarks && this.ctx) {
                    this._drawLandmarks(detection.landmarks.positions);
                } else if (this.ctx) {
                    this.ctx.clearRect(0, 0, this.overlayCanvas.width, this.overlayCanvas.height);
                }

            } else {
                // Reset states if nobody is on camera
                if (this.ctx) {
                    this.ctx.clearRect(0, 0, this.overlayCanvas.width, this.overlayCanvas.height);
                }
                this.currentExpression = 'neutral';
                this.currentLandmarks = null;
            }
        }

        requestAnimationFrame(this._processingLoop.bind(this));
    }

    // --- Block Functions ---

    toggleLandmarks (args) {
        this.showLandmarks = (args.STATE === 'on');
        if (!this.showLandmarks && this.ctx) {
            this.ctx.clearRect(0, 0, this.overlayCanvas.width, this.overlayCanvas.height);
        }
    }

    getCurrentExpression () {
        return this.currentExpression;
    }

    checkExpression (args) {
        return this.currentExpression === args.EXPRESSION;
    }

    whenExpression (args) {
        return this.currentExpression === args.EXPRESSION;
    }

    getEstimatedAge () {
        return this.currentAge;
    }

    getEstimatedGender () {
        return this.currentGender;
    }

	getLandmarkPosition (args) {
        if (!this.currentLandmarks) return 0;

        const index = Math.max(0, Math.min(67, parseInt(args.POINT) || 0));
        const point = this.currentLandmarks[index];

        if (!point) return 0;

        const axis = args.AXIS;

        if (axis === 'x') {
            // Convert Video X to Scratch X (and mirror it horizontally)
            return Math.round(point.x - 240);
        } else if (axis === 'y') {
            // Convert Video Y to Scratch Y (and invert it vertically)
            return Math.round((point.y - 180) * -1);
        }

        return 0;
    }

    // --- Drawing Helper ---

    _drawLandmarks (positions) {
        this.ctx.clearRect(0, 0, this.overlayCanvas.width, this.overlayCanvas.height);

        this.ctx.fillStyle = '#00FF00';
        this.ctx.font = '10px Arial';

        positions.forEach((point, index) => {
            this.ctx.beginPath();
            this.ctx.arc(point.x, point.y, 2.5, 0, 2 * Math.PI);
            this.ctx.fill();

            this.ctx.fillStyle = '#FFFFFF';
            this.ctx.fillText(index, point.x + 4, point.y - 2);

            this.ctx.fillStyle = '#00FF00';
        });
    }

    reset () {
        this.isEngineReady = false;
        this.showLandmarks = false;

        this.currentExpression = 'neutral';
        this.currentAge = 0;
        this.currentGender = 'unknown';
        this.currentLandmarks = null;

        if (this.overlayCanvas && this.overlayCanvas.parentElement) {
            this.overlayCanvas.parentElement.removeChild(this.overlayCanvas);
            this.overlayCanvas = null;
            this.ctx = null;
        }
    }
}

module.exports = RaceroExpresive;
