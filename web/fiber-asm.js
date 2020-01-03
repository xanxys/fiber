"use strict";

export function addr6ToString(addr6) {
    const negative = (addr6 & 0x20) !== 0;
    const abs_val = (addr6 & 0x1f) + 1;
    return (negative ? "-" : "+") + abs_val.toString();
}

export function instToString(instruction) {
    const inst_type = (instruction >> 12) & 0x7;
    const op1 = addr6ToString((instruction >> 6) & 0x3f);
    const op2 = addr6ToString(instruction & 0x3f);
    switch(inst_type) {
        case 0:
            return `mov ${op1} ${op2}`;
        case 1:
            return `add ${op1} ${op2}`;
        case 2:
            return `cshl ${op1} ${op2}`;
        case 3: // or
            return `or ${op1} ${op2}`;
        case 4: // and
            return `and ${op1} ${op2}`;
        case 5: // ssub (saturating sub)
            return `ssub ${op1} ${op2}`;
        case 6: // load V, A
            return `ld ${op1} [${op2}]`;
        case 7: // store V, A
            return `st ${op1} [${op2}]`;
    }
}

// returns: uint16 | null
export function parseSingle(str) {
    const tokens = str.trim().toLowerCase().split(" ");
    if (tokens.length !== 3) {
        return null;
    }
    
    const insts = new Map([
        ["mov", 0],
        ["add", 1],
        ["cshl", 2],
        ["or", 3],
        ["and", 4],
        ["ssub", 5],
        ["ld", 6],
        ["st", 7],
    ]);
    if (!insts.has(tokens[0])) {
        return null;
    }
    const inst = insts.get(tokens[0]);

    const op1 = parseInt(tokens[1]);
    if (isNaN(op1) || op1 < -32 || op1 > 32 || op1 === 0) {
        return null;
    }

    var op2Text;
    if (tokens[0] === "ld" || tokens[0] === "st") {
        op2Text = tokens[2].replace("[", "").replace("]", "")
    } else {
        op2Text = tokens[2];
    }
    const op2 = parseInt(op2Text);
    if (isNaN(op1) || op1 < -32 || op1 > 32 || op1 === 0) {
        return null;
    }

    return 0x8000 | (inst << 12) | (encodeAddress(op1) << 6) | encodeAddress(op2);
}

function encodeAddress(addr) {
    const neg = addr < 0 ? 0x20 : 0;
    return neg | ((Math.abs(addr) - 1) & 0x1f);
}
