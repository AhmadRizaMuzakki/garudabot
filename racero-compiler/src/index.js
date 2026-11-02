import beautify from "js-beautify";
import { methods as coreMethods, handlers as coreHandlers } from "./core/index.js";
import { methods as pinsMethods, handlers as pinsHandlers, setupEntryOpcodes as pinsSetupHats } from "./pins/index.js";
import { methods as displayMethods, handlers as displayHandlers } from "./display/index.js";
import { methods as mrtMethods, handlers as mrtHandlers } from "./mrt-pins/index.js";
import { methods as mazeMethods, handlers as mazeHandlers, setupEntryOpcodes as mazeSetupHats } from "./maze-solving/index.js";
import { methods as esp32Methods, handlers as esp32Handlers, setupEntryOpcodes as esp32SetupHats } from "./esp32/index.js";

const handlerGroups = [
    coreHandlers,
    pinsHandlers,
    displayHandlers,
    mrtHandlers,
    mazeHandlers,
    esp32Handlers,
];

const setupEntryOpcodes = new Set([
    ...pinsSetupHats,
    ...mazeSetupHats,
    ...esp32SetupHats,
]);

function bindHandlerGroups(compiler) {
    const handlers = {};
    for (const group of handlerGroups) {
        for (const opcode in group) {
            handlers[opcode] = group[opcode].bind(compiler);
        }
    }
    return handlers;
}

export class ArduinoCompiler {
    constructor(vm) {
        this.vm = vm;

        this.blocks = null;
        this.includes = new Set();
        this.globals = new Set();
        this.procedures = new Set();
        this.setups = new Set();
        this.loopSubstack = undefined;
        this.handlers = bindHandlerGroups(this);
    }

    sanitizeName(variable) {
        const sanitized = variable.replace(/[^a-zA-Z0-9]/g, "_");
        return `var_${sanitized}`;
    }

    resetState() {
        this.includes.clear();
        this.globals.clear();
        this.procedures.clear();
        this.setups.clear();
        this.loopSubstack = undefined;
        this.mazeActive = false;
    }

    getInput(block, inputName) {
        const inputId = block.inputs[inputName] && block.inputs[inputName].block;
        return this.traverseBlock(inputId);
    }

    /**
     * Menu yang memakai acceptReporters muncul sebagai input berisi blok menu,
     * bukan field, sehingga membaca block.fields saja selalu jatuh ke nilai
     * bawaan. Helper ini mencoba field lebih dulu lalu input menunya.
     */
    getMenuValue(block, name, fallback) {
        if (
            block.fields &&
            block.fields[name] &&
            block.fields[name].value !== undefined
        ) {
            return block.fields[name].value;
        }
        const fromInput = this.getInput(block, name);
        return fromInput === "" ? fallback : fromInput;
    }

    traverseBlock(blockId, isSetup = false) {
        if (!blockId) return "";

        const block = this.blocks.getBlock(blockId);
        if (!block) return "";

        let code = "";
        const handler = this.handlers[block.opcode];

        if (handler) {
            code = handler(block, isSetup);
        } else {
            console.warn(`COMPILER: unknown block opcode: ${block.opcode}`);
        }

        const nextCode = this.traverseBlock(block.next, isSetup);
        return code + nextCode;
    }

    generateProcedures() {
        const procedures = {};

        for (const blockId in this.blocks._blocks) {
            const block = this.blocks._blocks[blockId];
            if (block.opcode !== "procedures_definition") continue;

            const prototype = this.blocks._blocks[block.inputs.custom_block.block];
            const funcname = `proc_${this.sanitizeName(prototype.mutation.proccode)}`;

            const argids_json = JSON.parse(prototype.mutation.argumentids);
            const argnames_json = JSON.parse(prototype.mutation.argumentnames);

            procedures[funcname] = {
                nextId: block.next,
                args: {},
                argIds: argids_json,
            };

            for (let i = 0; i < argids_json.length; i++) {
                const id = argids_json[i];
                procedures[funcname].args[id] = {
                    name: `arg_${this.sanitizeName(argnames_json[i])}`,
                    type: "float",
                };
            }
        }

        for (const blockId in this.blocks._blocks) {
            const block = this.blocks._blocks[blockId];
            if (block.opcode !== "procedures_call") continue;

            const funcname = `proc_${this.sanitizeName(block.mutation.proccode)}`;
            if (!procedures[funcname]) continue;

            const argids_json = JSON.parse(block.mutation.argumentids);
            for (let i = 0; i < argids_json.length; i++) {
                const argId = argids_json[i];
                if (!block.inputs[argId]) continue;

                const inputBlockId = block.inputs[argId].block;
                const inputBlock = this.blocks.getBlock(inputBlockId);
                if (!inputBlock) continue;

                if (inputBlock.opcode === "text") {
                    const val = inputBlock.fields.TEXT.value;
                    if (isNaN(val)) procedures[funcname].args[argId].type = "String";
                } else if (
                    inputBlock.opcode.startsWith("operator_") &&
                    ["equals", "lt", "gt", "and", "or", "not", "contains"].some((op) =>
                        inputBlock.opcode.includes(op),
                    )
                ) {
                    procedures[funcname].args[argId].type = "bool";
                }
            }
        }

        for (const p in procedures) {
            const proc = procedures[p];
            const argsList = proc.argIds
                .map((id) => `${proc.args[id].type} ${proc.args[id].name}`)
                .join(", ");
            const bodyCode = this.traverseBlock(proc.nextId, false);

            this.procedures.add(`\nvoid ${p}(${argsList}) {\n${bodyCode}\n}\n`);
        }
    }

    generateVariables() {
        const variables = {};

        for (const blockId in this.blocks._blocks) {
            const block = this.blocks._blocks[blockId];
            if (
                block.opcode === "data_variable" ||
                block.opcode === "data_setvariableto"
            ) {
                if (block.fields && block.fields["VARIABLE"]) {
                    const name = this.sanitizeName(block.fields.VARIABLE.value);
                    if (block.inputs && block.inputs.VALUE) {
                        variables[name] = this.traverseBlock(block.inputs.VALUE.block);
                    }
                }
            }
        }

        for (const v in variables) {
            this.globals.add(`auto ${v} = ${variables[v]};`);
        }
    }

    /**
     * Cari blok entry untuk setup().
     * Hat tiap ekstensi didaftarkan di folder masing-masing.
     */
    findSetupEntryBlockId() {
        const topBlocks = this.blocks.getScripts();
        let fallbackId = null;

        for (let i = 0; i < topBlocks.length; i++) {
            const blockId = topBlocks[i];
            const block = this.blocks.getBlock(blockId);
            if (!block) continue;

            if (setupEntryOpcodes.has(block.opcode)) {
                return block.next || null;
            }

            if (
                !fallbackId &&
                block.opcode !== "procedures_definition" &&
                block.opcode !== "procedures_prototype"
            ) {
                fallbackId = blockId;
            }
        }

        return fallbackId;
    }

    renderSketch(setupCode, loopCode) {
        const includesStr = Array.from(this.includes).join("\n").trim();
        const globalsStr = Array.from(this.globals).join("\n").trim();
        const proceduresStr = Array.from(this.procedures).join("\n").trim();
        const setupsStr = Array.from(this.setups).join("\n").trim();

        const code = `
        ${includesStr}

        ${globalsStr}
        ${proceduresStr}
        void setup() {
            ${setupsStr}
            ${setupCode}
        }

        void loop() {
            ${loopCode}
        }
        `;

        return beautify.js(code, {
            indent_size: "4",
            indent_char: " ",
            max_preserve_newlines: "5",
            preserve_newlines: true,
            keep_array_indentation: true,
            break_chained_methods: false,
            indent_scripts: "normal",
            brace_style: "collapse",
            space_before_conditional: true,
            unescape_strings: false,
            jslint_happy: false,
            end_with_newline: false,
            wrap_line_length: "0",
            indent_inner_html: false,
            comma_first: false,
            e4x: false,
            indent_empty_lines: false,
        });
    }

    generate() {
        this.resetState();

        const target = this.vm && this.vm.editingTarget;
        if (!target || !target.blocks) {
            return this.renderSketch("", "");
        }

        this.blocks = target.blocks;

        this.generateVariables();
        this.generateProcedures();

        const setupEntryId = this.findSetupEntryBlockId();
        let setupCode = this.traverseBlock(setupEntryId, true);

        let loopCode = "";
        if (this.loopSubstack) {
            loopCode = this.traverseBlock(this.loopSubstack, false);
        }

        if (this.mazeActive) {
            if (loopCode) {
                loopCode = "status_break_simpang = 0;\n" + loopCode + "\nGerak_Robot(0, 0);\n";
            } else if (!setupCode.includes("while (1)")) {
                setupCode += "\nGerak_Robot(0, 0);\n";
            }
        }

        return this.renderSketch(setupCode, loopCode);
    }
}

Object.assign(
    ArduinoCompiler.prototype,
    coreMethods,
    pinsMethods,
    displayMethods,
    mrtMethods,
    mazeMethods,
    esp32Methods,
);

export function generateCode(vm) {
    const compiler = new ArduinoCompiler(vm);
    return compiler.generate();
}
