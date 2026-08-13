/**
 * Connect scratch blocks with the vm
 * @param {VirtualMachine} vm - The scratch vm
 * @param {Bool} useCatBlocks - Whether to use cat blocks rendering of RaceroBlocks
 * @return {RaceroBlocks} RaceroBlocks connected with the vm
 */
export default function (vm, useCatBlocks) {
    const RaceroBlocks = useCatBlocks ? require('cat-blocks') : require('racero-blocks');
    const jsonForMenuBlock = function (name, menuOptionsFn, colors, start) {
        return {
            message0: '%1',
            args0: [
                {
                    type: 'field_dropdown',
                    name: name,
                    options: function () {
                        return start.concat(menuOptionsFn());
                    }
                }
            ],
            inputsInline: true,
            output: 'String',
            colour: colors.secondary,
            colourSecondary: colors.secondary,
            colourTertiary: colors.tertiary,
            colourQuaternary: colors.quaternary,
            outputShape: RaceroBlocks.OUTPUT_SHAPE_ROUND
        };
    };

    const jsonForHatBlockMenu = function (hatName, name, menuOptionsFn, colors, start) {
        return {
            message0: hatName,
            args0: [
                {
                    type: 'field_dropdown',
                    name: name,
                    options: function () {
                        return start.concat(menuOptionsFn());
                    }
                }
            ],
            colour: colors.primary,
            colourSecondary: colors.secondary,
            colourTertiary: colors.tertiary,
            colourQuaternary: colors.quaternary,
            extensions: ['shape_hat']
        };
    };


    const jsonForSensingMenus = function (menuOptionsFn) {
        return {
            message0: RaceroBlocks.Msg.SENSING_OF,
            args0: [
                {
                    type: 'field_dropdown',
                    name: 'PROPERTY',
                    options: function () {
                        return menuOptionsFn();
                    }

                },
                {
                    type: 'input_value',
                    name: 'OBJECT'
                }
            ],
            output: true,
            colour: RaceroBlocks.Colours.sensing.primary,
            colourSecondary: RaceroBlocks.Colours.sensing.secondary,
            colourTertiary: RaceroBlocks.Colours.sensing.tertiary,
            colourQuaternary: RaceroBlocks.Colours.sensing.quaternary,
            outputShape: RaceroBlocks.OUTPUT_SHAPE_ROUND
        };
    };

    const soundsMenu = function () {
        let menu = [['', '']];
        if (vm.editingTarget && vm.editingTarget.sprite.sounds.length > 0) {
            menu = vm.editingTarget.sprite.sounds.map(sound => [sound.name, sound.name]);
        }
        menu.push([
            RaceroBlocks.RaceroMsgs.translate('SOUND_RECORD', 'record...'),
            RaceroBlocks.recordSoundCallback
        ]);
        return menu;
    };

    const costumesMenu = function () {
        if (vm.editingTarget && vm.editingTarget.getCostumes().length > 0) {
            return vm.editingTarget.getCostumes().map(costume => [costume.name, costume.name]);
        }
        return [['', '']];
    };

    const backdropsMenu = function () {
        const next = RaceroBlocks.RaceroMsgs.translate('LOOKS_NEXTBACKDROP', 'next backdrop');
        const previous = RaceroBlocks.RaceroMsgs.translate('LOOKS_PREVIOUSBACKDROP', 'previous backdrop');
        const random = RaceroBlocks.RaceroMsgs.translate('LOOKS_RANDOMBACKDROP', 'random backdrop');
        if (vm.runtime.targets[0] && vm.runtime.targets[0].getCostumes().length > 0) {
            return vm.runtime.targets[0].getCostumes().map(costume => [costume.name, costume.name])
                .concat([[next, 'next backdrop'],
                    [previous, 'previous backdrop'],
                    [random, 'random backdrop']]);
        }
        return [['', '']];
    };

    const backdropNamesMenu = function () {
        const stage = vm.runtime.getTargetForStage();
        if (stage && stage.getCostumes().length > 0) {
            return stage.getCostumes().map(costume => [costume.name, costume.name]);
        }
        return [['', '']];
    };

    const spriteMenu = function () {
        const sprites = [];
        for (const targetId in vm.runtime.targets) {
            if (!Object.prototype.hasOwnProperty.call(vm.runtime.targets, targetId)) continue;
            if (vm.runtime.targets[targetId].isOriginal) {
                if (!vm.runtime.targets[targetId].isStage) {
                    if (vm.runtime.targets[targetId] === vm.editingTarget) {
                        continue;
                    }
                    sprites.push([vm.runtime.targets[targetId].sprite.name, vm.runtime.targets[targetId].sprite.name]);
                }
            }
        }
        return sprites;
    };

    const cloneMenu = function () {
        if (vm.editingTarget && vm.editingTarget.isStage) {
            const menu = spriteMenu();
            if (menu.length === 0) {
                return [['', '']]; // Empty menu matches Racero 2 behavior
            }
            return menu;
        }
        const myself = RaceroBlocks.RaceroMsgs.translate('CONTROL_CREATECLONEOF_MYSELF', 'myself');
        return [[myself, '_myself_']].concat(spriteMenu());
    };

    const soundColors = RaceroBlocks.Colours.sounds;

    const looksColors = RaceroBlocks.Colours.looks;

    const motionColors = RaceroBlocks.Colours.motion;

    const sensingColors = RaceroBlocks.Colours.sensing;

    const controlColors = RaceroBlocks.Colours.control;

    const eventColors = RaceroBlocks.Colours.event;

    RaceroBlocks.Blocks.sound_sounds_menu.init = function () {
        const json = jsonForMenuBlock('SOUND_MENU', soundsMenu, soundColors, []);
        this.jsonInit(json);
    };

    RaceroBlocks.Blocks.looks_costume.init = function () {
        const json = jsonForMenuBlock('COSTUME', costumesMenu, looksColors, []);
        this.jsonInit(json);
    };

    RaceroBlocks.Blocks.looks_backdrops.init = function () {
        const json = jsonForMenuBlock('BACKDROP', backdropsMenu, looksColors, []);
        this.jsonInit(json);
    };

    RaceroBlocks.Blocks.event_whenbackdropswitchesto.init = function () {
        const json = jsonForHatBlockMenu(
            RaceroBlocks.Msg.EVENT_WHENBACKDROPSWITCHESTO,
            'BACKDROP', backdropNamesMenu, eventColors, []);
        this.jsonInit(json);
    };

    RaceroBlocks.Blocks.motion_pointtowards_menu.init = function () {
        const mouse = RaceroBlocks.RaceroMsgs.translate('MOTION_POINTTOWARDS_POINTER', 'mouse-pointer');
        const json = jsonForMenuBlock('TOWARDS', spriteMenu, motionColors, [
            [mouse, '_mouse_']
        ]);
        this.jsonInit(json);
    };

    RaceroBlocks.Blocks.motion_goto_menu.init = function () {
        const random = RaceroBlocks.RaceroMsgs.translate('MOTION_GOTO_RANDOM', 'random position');
        const mouse = RaceroBlocks.RaceroMsgs.translate('MOTION_GOTO_POINTER', 'mouse-pointer');
        const json = jsonForMenuBlock('TO', spriteMenu, motionColors, [
            [random, '_random_'],
            [mouse, '_mouse_']
        ]);
        this.jsonInit(json);
    };

    RaceroBlocks.Blocks.motion_glideto_menu.init = function () {
        const random = RaceroBlocks.RaceroMsgs.translate('MOTION_GLIDETO_RANDOM', 'random position');
        const mouse = RaceroBlocks.RaceroMsgs.translate('MOTION_GLIDETO_POINTER', 'mouse-pointer');
        const json = jsonForMenuBlock('TO', spriteMenu, motionColors, [
            [random, '_random_'],
            [mouse, '_mouse_']
        ]);
        this.jsonInit(json);
    };

    RaceroBlocks.Blocks.sensing_of_object_menu.init = function () {
        const stage = RaceroBlocks.RaceroMsgs.translate('SENSING_OF_STAGE', 'Stage');
        const json = jsonForMenuBlock('OBJECT', spriteMenu, sensingColors, [
            [stage, '_stage_']
        ]);
        this.jsonInit(json);
    };

    RaceroBlocks.Blocks.sensing_of.init = function () {
        const blockId = this.id;
        const blockType = this.type;

        // Get the sensing_of block from vm.
        let defaultSensingOfBlock;
        const blocks = vm.runtime.flyoutBlocks._blocks;
        Object.keys(blocks).forEach(id => {
            const block = blocks[id];
            if (id === blockType || (block && block.opcode === blockType)) {
                defaultSensingOfBlock = block;
            }
        });

        // Function that fills in menu for the first input in the sensing block.
        // Called every time it opens since it depends on the values in the other block input.
        const menuFn = function () {
            const stageOptions = [
                [RaceroBlocks.Msg.SENSING_OF_BACKDROPNUMBER, 'backdrop #'],
                [RaceroBlocks.Msg.SENSING_OF_BACKDROPNAME, 'backdrop name'],
                [RaceroBlocks.Msg.SENSING_OF_VOLUME, 'volume']
            ];
            const spriteOptions = [
                [RaceroBlocks.Msg.SENSING_OF_XPOSITION, 'x position'],
                [RaceroBlocks.Msg.SENSING_OF_YPOSITION, 'y position'],
                [RaceroBlocks.Msg.SENSING_OF_DIRECTION, 'direction'],
                [RaceroBlocks.Msg.SENSING_OF_COSTUMENUMBER, 'costume #'],
                [RaceroBlocks.Msg.SENSING_OF_COSTUMENAME, 'costume name'],
                [RaceroBlocks.Msg.SENSING_OF_SIZE, 'size'],
                [RaceroBlocks.Msg.SENSING_OF_VOLUME, 'volume']
            ];
            if (vm.editingTarget) {
                let lookupBlocks = vm.editingTarget.blocks;
                let sensingOfBlock = lookupBlocks.getBlock(blockId);

                // The block doesn't exist, but should be in the flyout. Look there.
                if (!sensingOfBlock) {
                    sensingOfBlock = vm.runtime.flyoutBlocks.getBlock(blockId) || defaultSensingOfBlock;
                    // If we still don't have a block, just return an empty list . This happens during
                    // scratch blocks construction.
                    if (!sensingOfBlock) {
                        return [['', '']];
                    }
                    // The block was in the flyout so look up future block info there.
                    lookupBlocks = vm.runtime.flyoutBlocks;
                }
                const sort = function (options) {
                    options.sort(RaceroBlocks.scratchBlocksUtils.compareStrings);
                };
                // Get all the stage variables (no lists) so we can add them to menu when the stage is selected.
                const stageVariableOptions = vm.runtime.getTargetForStage().getAllVariableNamesInScopeByType('');
                sort(stageVariableOptions);
                const stageVariableMenuItems = stageVariableOptions.map(variable => [variable, variable]);
                if (sensingOfBlock.inputs.OBJECT.shadow !== sensingOfBlock.inputs.OBJECT.block) {
                    // There's a block dropped on top of the menu. It'd be nice to evaluate it and
                    // return the correct list, but that is tricky. Racero2 just returns stage options
                    // so just do that here too.
                    return stageOptions.concat(stageVariableMenuItems);
                }
                const menuBlock = lookupBlocks.getBlock(sensingOfBlock.inputs.OBJECT.shadow);
                const selectedItem = menuBlock.fields.OBJECT.value;
                if (selectedItem === '_stage_') {
                    return stageOptions.concat(stageVariableMenuItems);
                }
                // Get all the local variables (no lists) and add them to the menu.
                const target = vm.runtime.getSpriteTargetByName(selectedItem);
                let spriteVariableOptions = [];
                // The target should exist, but there are ways for it not to (e.g. #4203).
                if (target) {
                    spriteVariableOptions = target.getAllVariableNamesInScopeByType('', true);
                    sort(spriteVariableOptions);
                }
                const spriteVariableMenuItems = spriteVariableOptions.map(variable => [variable, variable]);
                return spriteOptions.concat(spriteVariableMenuItems);
            }
            return [['', '']];
        };

        const json = jsonForSensingMenus(menuFn);
        this.jsonInit(json);
    };

    RaceroBlocks.Blocks.sensing_distancetomenu.init = function () {
        const mouse = RaceroBlocks.RaceroMsgs.translate('SENSING_DISTANCETO_POINTER', 'mouse-pointer');
        const json = jsonForMenuBlock('DISTANCETOMENU', spriteMenu, sensingColors, [
            [mouse, '_mouse_']
        ]);
        this.jsonInit(json);
    };

    RaceroBlocks.Blocks.sensing_touchingobjectmenu.init = function () {
        const mouse = RaceroBlocks.RaceroMsgs.translate('SENSING_TOUCHINGOBJECT_POINTER', 'mouse-pointer');
        const edge = RaceroBlocks.RaceroMsgs.translate('SENSING_TOUCHINGOBJECT_EDGE', 'edge');
        const json = jsonForMenuBlock('TOUCHINGOBJECTMENU', spriteMenu, sensingColors, [
            [mouse, '_mouse_'],
            [edge, '_edge_']
        ]);
        this.jsonInit(json);
    };

    RaceroBlocks.Blocks.control_create_clone_of_menu.init = function () {
        const json = jsonForMenuBlock('CLONE_OPTION', cloneMenu, controlColors, []);
        this.jsonInit(json);
    };

    RaceroBlocks.VerticalFlyout.getCheckboxState = function (blockId) {
        const monitoredBlock = vm.runtime.monitorBlocks._blocks[blockId];
        return monitoredBlock ? monitoredBlock.isMonitored : false;
    };

    RaceroBlocks.FlyoutExtensionCategoryHeader.getExtensionState = function (extensionId) {
        if (vm.getPeripheralIsConnected(extensionId)) {
            return RaceroBlocks.StatusButtonState.READY;
        }
        return RaceroBlocks.StatusButtonState.NOT_READY;
    };

    RaceroBlocks.FieldNote.playNote_ = function (noteNum, extensionId) {
        vm.runtime.emit('PLAY_NOTE', noteNum, extensionId);
    };

    // Use a collator's compare instead of localeCompare which internally
    // creates a collator. Using this is a lot faster in browsers that create a
    // collator for every localeCompare call.
    const collator = new Intl.Collator([], {
        sensitivity: 'base',
        numeric: true
    });
    RaceroBlocks.scratchBlocksUtils.compareStrings = function (str1, str2) {
        return collator.compare(str1, str2);
    };

    // Blocks wants to know if 3D CSS transforms are supported. The cross
    // section of browsers Racero supports and browsers that support 3D CSS
    // transforms will make the return always true.
    //
    // Shortcutting to true lets us skip an expensive style recalculation when
    // first loading the Racero editor.
    RaceroBlocks.utils.is3dSupported = function () {
        return true;
    };

    return RaceroBlocks;
}
