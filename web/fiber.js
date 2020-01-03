"use strict";

// World itself (Level 0)
export class WorldState {
    constructor(size) {
        this.size = size;
        this.state = new Uint16Array(size);
        this.currCellIx = 0;
    }

    clone() {
        const st = new WorldState(this.size);
        st.state = new Uint16Array(this.state);
        st.currCellIx = this.currCellIx;
        return st;
    }

    reset() {
        this.currCellIx = 0;
        this.state.fill(0);
    }

    step() {
        this.execInstruction(this.currCellIx);
        this.currCellIx = (this.currCellIx + 1) % this.size;
    }
        
    execInstruction(cellIx) {
        const state = this.state;

        // exec(1), inst(3), op1(6), op2(6)
        const v = state[cellIx];
        if (!decodeExecFlag(v)) {
            return;
        }
        const inst = (v >> 12) & 0x7;
        const op1 = decodeAddress(this.size, cellIx, (v >> 6) & 0x3f);
        const op2 = decodeAddress(this.size, cellIx, v & 0x3f);
        switch(inst) {
            case 0: // mov
                state[op1] = state[op2];
                break;
            case 1: // add
                state[op1] = (state[op1] + state[op2]) & 0xffff;
                break;
            case 2: // cshl (cyclic shift left)
                const v = state[op1] << (state[op2] % 16);
                state[op1] = (v & 0xffff) | (v >> 16);
                break;
            case 3: // or
                state[op1] |= state[op2];
                break;
            case 4: // and
                state[op1] &= state[op2];
                break;
            case 5: // ssub (saturating sub)
                state[op1] = Math.max(0, state[op1] - state[op2]);
                break;
            case 6: // load V, A
                state[op1] = state[decodeAddress(this.size, cellIx, state[op2] & 0x3f)];
                break;
            case 7: // store V, A
                state[decodeAddress(this.size, cellIx, state[op2] & 0x3f)] = state[op1];
                break;
        }
    }
}

// <neg:1> <delta_addr:5> (1-origin, -32~-1, +1~+32)
export function decodeAddress(size, baseCellIx, addr6) {
    const negative = (addr6 & 0x20) !== 0;
    const abs_val = (addr6 & 0x1f) + 1;
    const val = negative ? -abs_val : abs_val;

    const cellIx = (baseCellIx + val + size) % size;
    return cellIx;
}

export function decodeExecFlag(v) {
    return (v & 0x8000) !== 0;
}
