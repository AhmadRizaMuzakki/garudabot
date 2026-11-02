/** Blok bahasa Scratch: data, operator, kontrol, dan prosedur. */
export const methods = {
    handleDataVariable(block) {
        const variableName = block.fields.VARIABLE.value;
        return this.sanitizeName(variableName);
    },

    handleDataSetVariableTo(block) {
        const variableName = this.sanitizeName(block.fields.VARIABLE.value);
        const value = this.getInput(block, "VALUE");
        return `${variableName} = ${value};\n`;
    },

    handleDataChangeVariableBy(block) {
        const variableName = this.sanitizeName(block.fields.VARIABLE.value);
        const value = this.getInput(block, "VALUE");
        return `${variableName} += ${value}`;
    },

    handleText(block) {
        const value = block.fields.TEXT.value;
        if (isNaN(value)) {
            return `String("${value}")`;
        }
        return `${value}`;
    },

    handleMathNumber(block) {
        const raw = block.fields && block.fields.NUM && block.fields.NUM.value;
        const value = Number(raw);
        return `${Number.isFinite(value) ? value : 0}`;
    },

    handleOperatorAdd(block) {
        const num1 = this.getInput(block, "NUM1");
        const num2 = this.getInput(block, "NUM2");
        return `(${num1} + ${num2})`;
    },

    handleOperatorSubtract(block) {
        const num1 = this.getInput(block, "NUM1");
        const num2 = this.getInput(block, "NUM2");
        return `(${num1} - ${num2})`;
    },

    handleOperatorMultiply(block) {
        const num1 = this.getInput(block, "NUM1");
        const num2 = this.getInput(block, "NUM2");
        return `((float)${num1} * (float)${num2})`;
    },

    handleOperatorDivide(block) {
        const num1 = this.getInput(block, "NUM1");
        const num2 = this.getInput(block, "NUM2");
        return `((float)${num1} / (float)${num2})`;
    },

    handleOperatorLt(block) {
        const operand1 = this.getInput(block, "OPERAND1");
        const operand2 = this.getInput(block, "OPERAND2");
        return `(${operand1} < ${operand2})`;
    },

    handleOperatorEquals(block) {
        const operand1 = this.getInput(block, "OPERAND1");
        const operand2 = this.getInput(block, "OPERAND2");
        return `(${operand1} == ${operand2})`;
    },

    handleOperatorGt(block) {
        const operand1 = this.getInput(block, "OPERAND1");
        const operand2 = this.getInput(block, "OPERAND2");
        return `(${operand1} > ${operand2})`;
    },

    handleOperatorAnd(block) {
        const operand1 = this.getInput(block, "OPERAND1");
        const operand2 = this.getInput(block, "OPERAND2");
        return `(${operand1} && ${operand2})`;
    },

    handleOperatorOr(block) {
        const operand1 = this.getInput(block, "OPERAND1");
        const operand2 = this.getInput(block, "OPERAND2");
        return `(${operand1} || ${operand2})`;
    },

    handleOperatorNot(block) {
        const operand = this.getInput(block, "OPERAND");
        return `!${operand}`;
    },

    handleOperatorRandom(block) {
        const from = this.getInput(block, "FROM");
        const to = this.getInput(block, "TO");
        return `random(${from}, ${to})`;
    },

    handleOperatorJoin(block) {
        let string1 = this.getInput(block, "STRING1");
        let string2 = this.getInput(block, "STRING2");

        if (!isNaN(string1)) {
            string1 = `String("${string1}")`;
        }
        if (!isNaN(string2)) {
            string2 = `String("${string2}")`;
        }

        return `String(${string1} + ${string2})`;
    },

    handleOperatorLetterOf(block) {
        const string = this.getInput(block, "STRING");
        const letter = this.getInput(block, "LETTER");
        return `String(${string}.charAt(${letter}))`;
    },

    handleOperatorLength(block) {
        const string = this.getInput(block, "STRING");
        return `${string}.length()`;
    },

    handleOperatorContains(block) {
        const string1 = this.getInput(block, "STRING1");
        const string2 = this.getInput(block, "STRING2");
        return `(${string1}.indexOf(${string2}) != -1)`;
    },

    handleOperatorMod(block) {
        const num1 = this.getInput(block, "NUM1");
        const num2 = this.getInput(block, "NUM2");
        return `${num1} % ${num2}`;
    },

    handleOperatorRound(block) {
        this.includes.add("#include <math.h>");
        const num = this.getInput(block, "NUM");
        return `round(${num})`;
    },

    handleOperatorMathop(block) {
        this.includes.add("#include <math.h>");

        const operator = block.fields.OPERATOR.value;
        const n = this.getInput(block, "NUM");

        switch (operator) {
            case "abs":
                return `abs(${n})`;
            case "floor":
                return `floor(${n})`;
            case "ceiling":
                return `ceil(${n})`;
            case "sqrt":
                return `sqrt(${n})`;
            case "sin":
                return `sin((M_PI * ${n}) / 180.0f)`;
            case "cos":
                return `cos((M_PI * ${n}) / 180.0f)`;
            case "tan":
                return `tan((M_PI * ${n}) / 180.0f)`;
            case "asin":
                return `((asin(${n}) * 180.0f) / M_PI)`;
            case "acos":
                return `((acos(${n}) * 180.0f) / M_PI)`;
            case "atan":
                return `((atan(${n}) * 180.0f) / M_PI)`;
            case "ln":
                return `log(${n})`;
            case "log":
                return `log10(${n})`;
            case "e ^":
                return `exp(${n})`;
            case "10 ^":
                return `pow(10, ${n})`;
            default:
                return "";
        }
    },

    handleControlRepeat(block) {
        const times = this.getInput(block, "TIMES");
        const substack = this.getInput(block, "SUBSTACK");
        return `for (int i = 0; i < ${times}; ++i) {\n${substack}\n}`;
    },

    handleControlWhileRepeatUntil(block) {
        const condition = this.getInput(block, "CONDITION");
        const substack = this.getInput(block, "SUBSTACK");
        return `while (${condition}) {\n${substack}\n}`;
    },

    handleControlForever(block, isSetup) {
        const substackId = block.inputs.SUBSTACK && block.inputs.SUBSTACK.block;

        if (isSetup) {
            this.loopSubstack = substackId;
            return "";
        }

        const substackCode = this.traverseBlock(substackId);
        return `for (;;) {\n${substackCode}\n}`;
    },

    handleControlWait(block) {
        const duration = this.getInput(block, "DURATION");
        return `delay(${duration} * 1000);\n`;
    },

    handleControlWaitUntil(block) {
        const condition = this.getInput(block, "CONDITION");
        return `while (!${condition}) {\ndelay(5);\n}`;
    },

    handleControlIf(block) {
        const condition = this.getInput(block, "CONDITION");
        const substack = this.getInput(block, "SUBSTACK");
        return `if (${condition}) {\n${substack}\n}`;
    },

    handleControlIfElse(block) {
        const condition = this.getInput(block, "CONDITION");
        const substack1 = this.getInput(block, "SUBSTACK");
        const substack2 = this.getInput(block, "SUBSTACK2");
        return `if (${condition}) {\n${substack1}\n} else {\n${substack2}\n}`;
    },

    handleProceduresCall(block) {
        const rawFuncName = block.mutation.proccode;
        const funcname = `proc_${this.sanitizeName(rawFuncName)}`;
        const argids_json = JSON.parse(block.mutation.argumentids);

        const args = [];

        for (let i = 0; i < argids_json.length; i++) {
            const argId = argids_json[i];
            if (block.inputs[argId]) {
                const argValue = this.traverseBlock(block.inputs[argId].block);
                args.push(argValue);
            } else {
                args.push("0");
            }
        }

        return `${funcname}(${args.join(", ")});\n`;
    },

    handleArgumentReporter(block) {
        const argName = this.sanitizeName(block.fields.VALUE.value);
        return `arg_${argName}`;
    }
};

export const handlers = {
    data_variable: methods.handleDataVariable,
    data_setvariableto: methods.handleDataSetVariableTo,
    data_changevariableby: methods.handleDataChangeVariableBy,
    text: methods.handleText,

    math_angle: methods.handleMathNumber,
    math_number: methods.handleMathNumber,
    math_integer: methods.handleMathNumber,
    math_whole_number: methods.handleMathNumber,
    math_positive_number: methods.handleMathNumber,
    math_slider: methods.handleMathNumber,
    math_slider_motor: methods.handleMathNumber,

    operator_add: methods.handleOperatorAdd,
    operator_subtract: methods.handleOperatorSubtract,
    operator_multiply: methods.handleOperatorMultiply,
    operator_divide: methods.handleOperatorDivide,
    operator_lt: methods.handleOperatorLt,
    operator_equals: methods.handleOperatorEquals,
    operator_gt: methods.handleOperatorGt,
    operator_and: methods.handleOperatorAnd,
    operator_or: methods.handleOperatorOr,
    operator_not: methods.handleOperatorNot,
    operator_random: methods.handleOperatorRandom,
    operator_join: methods.handleOperatorJoin,
    operator_letter_of: methods.handleOperatorLetterOf,
    operator_length: methods.handleOperatorLength,
    operator_contains: methods.handleOperatorContains,
    operator_mod: methods.handleOperatorMod,
    operator_round: methods.handleOperatorRound,
    operator_mathop: methods.handleOperatorMathop,

    control_repeat: methods.handleControlRepeat,
    control_while: methods.handleControlWhileRepeatUntil,
    control_repeat_until: methods.handleControlWhileRepeatUntil,
    control_forever: methods.handleControlForever,
    control_wait: methods.handleControlWait,
    control_wait_until: methods.handleControlWaitUntil,
    control_if: methods.handleControlIf,
    control_if_else: methods.handleControlIfElse,

    procedures_call: methods.handleProceduresCall,
    argument_reporter_string_number: methods.handleArgumentReporter,
    argument_reporter_boolean: methods.handleArgumentReporter
};
