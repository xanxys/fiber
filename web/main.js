"use strict";

// World itself (Level 0)
const size = 128;
const numThread = 4;
const topology = new Uint8Array(size * numThread);


function encodePos(cellIx, threadIx) {
    return cellIx * numThread + threadIx;
}

class WorldState {
    constructor() {
        this.state = new Uint16Array(size * numThread);
        this.currThreadIx = 0
        this.currCellIx = 0;
    }

    clone() {
        const st = new WorldState();
        st.state = new Uint16Array(this.state);
        st.currThreadIx = this.currThreadIx;
        st.currCellIx = this.currCellIx;
        return st;
    }

    reset() {
        this.currThreadIx = 0;
        this.currCellIx = 0;
        this.state.fill(0);
    }

    step() {
        this.execInstruction(this.currThreadIx, this.currCellIx);
        this.currThreadIx++;
        if (this.currThreadIx >= numThread) {
            this.currThreadIx = 0;
            this.currCellIx = (this.currCellIx + 1) % size;
        }
    }
        
    execInstruction(threadIx, cellIx) {
        const state = this.state;

        // exec(1), inst(3), op1(6), op2(6)
        const instruction = state[cellIx * numThread + threadIx];
        if ((instruction & 0x80) === 0) {
            return;
        }
        const inst_type = (instruction >> 12) & 0x7;
        const op1 = decodeAddress(threadIx, cellIx, (instruction >> 6) & 0x3f);
        const op2 = decodeAddress(threadIx, cellIx, instruction & 0x3f);
        switch(inst_type) {
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
                state[op1] = state[decodeAddress(threadIx, cellIx, state[op2] & 0x3f)];
                break;
            case 7: // store V, A
                state[decodeAddress(threadIx, cellIx, state[op2] & 0x3f)] = state[op1];
                break;
        }
    }

}

const canonicalState = new WorldState();

// World View: Connection by Effect (depends on L0)
class ConnectionView {
    constructor() {
        this.unionfind_parent = new Uint32Array(size * numThread);
        this.disconnectAll();
    }

    analyzeSingleSweep() {
        const stCopy = canonicalState.clone();
        this.disconnectAll();

        for (let i = 0; i < numThread * size; i++) {
            const src = encodePos(stCopy.currCellIx, stCopy.currThreadIx);
            const affectedPos = this.getWrittenPos(stCopy);
            if (affectedPos !== null) {
                this.connect(src, affectedPos);
            }
            stCopy.step();
        }

        console.log("num groups=", new Array(new Array(this.getGroups().values()).filter(g => g.length > 1)).length);


    }

    getWrittenPos(stCopy) {
        const instruction = stCopy.state[stCopy.currCellIx * numThread + stCopy.currThreadIx];
        if ((instruction & 0x80) === 0) {
            return null;
        }

        const inst_type = (instruction >> 12) & 0x7;
        const op1 = decodeAddress(stCopy.currThreadIx, stCopy.currCellIx, (instruction >> 6) & 0x3f);
        const op2 = decodeAddress(stCopy.currThreadIx, stCopy.currCellIx, instruction & 0x3f);
        switch(inst_type) {
            case 0: // mov
            case 1: // add
            case 2: // cshl (cyclic shift left)
            case 3: // or
            case 4: // and
            case 5: // ssub (saturating sub)
                return op1;
            case 6: // load V, A
                return op1;
            case 7: // store V, A
                return decodeAddress(stCopy.currThreadIx, stCopy.currCellIx, stCopy.state[op2] & 0x3f);
        }
    }

    disconnectAll() {
        for (let i = 0; i < size * numThread; i++) {
            this.unionfind_parent[i] = i;
        }
    }

    isSame(pa, pb) {
        return this.rootOf(pa) === this.rootOf(pb);
    }

    rootOf(pos) {
        const parent = this.unionfind_parent[pos];
        if (parent === pos) {
            return pos;
        } else {
            const root = this.rootOf(parent);
            this.unionfind_parent[pos] = root;  // cache result
            return root;
        }
    }

    connect(pa, pb) {
        const rootA = this.rootOf(pa);
        const rootB = this.rootOf(pb);
        if (rootA === rootB) {
            return;
        }
        this.unionfind_parent[rootB] = rootA;
    }

    // return Array<Array<pos>>
    getGroups() {
        const groups = new Map();
        for (let i = 0; i < this.unionfind_parent.length; i++) {
            const root = this.rootOf(i);
            if (groups.has(root)) {
                groups.get(root).push(i);
            } else {
                groups.set(root, [i]);
            }
        }
        return groups;
    }
}


function redraw(scale, originX) {
    let canvas = document.getElementById("main");
    const ctx = canvas.getContext("2d");

    ctx.fillStyle = "white";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.save();
    ctx.translate(originX, 0);
    ctx.scale(scale, scale);
    
    for (let i = 0; i < size; i++) {
        for (let threadIx = 0; threadIx < numThread; threadIx++) {
            const data = canonicalState.state[i * numThread + threadIx];
            ctx.fillStyle = (threadIx === canonicalState.currThreadIx && i === canonicalState.currCellIx) ? "red" : (instToExecFlag(data) ? "black" : "gray");

            const num = ("0000" + data.toString(16)).substr(-4);
            const inst = instToString(data);

            ctx.font = "10px 'Inconsolata'";
            ctx.fillText(num, i * 24, 20 * (threadIx + 1));

            ctx.font = "3px sans-serif";
            ctx.fillText(inst, i * 24, 20 * (threadIx + 1) + 5);
        }
    }

    const connectionView = new ConnectionView();
    connectionView.analyzeSingleSweep();

    ctx.restore();
}

function cleanParticles() {
    // Generate random topology
    const permutation = new Array(numThread);
    for (let cellIx = 0; cellIx < size; cellIx++) {
        // Randomize permutation
        for (let i = numThread - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [permutation[i], permutation[j]] = [permutation[j], permutation[i]];
        }

        // Pair-wise tangling
        for (let i = 0; i < numThread; i+=2) {
            const thread0 = permutation[i];
            const thread1 = permutation[(i + 1) % numThread];

            topology[cellIx * numThread + thread0] = thread1;
            topology[cellIx * numThread + thread1] = thread0;
        }
    }

    canonicalState.reset();
}

function addRandom(n) {
    for (let cellIx = 0; cellIx < n; cellIx++) {
        for (let threadIx = 0; threadIx < 1; threadIx++) {
            canonicalState.state[cellIx * numThread + threadIx] = Math.floor(Math.random() * 0xffff);
        }
    }
}

function step() {
    canonicalState.step();
}

function decodeAddress(baseThreadIx, baseCellIx, addr6) {
    const alt = (addr6 & 0x20) !== 0; // TODO: implement
    const negative = (addr6 & 0x10) !== 0;
    const abs_val = (addr6 & 0xf) + 1;
    const val = negative ? -abs_val : abs_val;

    const threadIx = alt ? topology[baseCellIx * numThread + baseThreadIx] : baseThreadIx;
    const cellIx = (baseCellIx + val + size) % size;
    return cellIx * numThread + threadIx;
}

function instToExecFlag(instruction) {
    return (instruction & 0x80) !== 0;
}

function addr6ToString(addr6) {
    const alt = (addr6 & 0x20) !== 0; // TODO: implement
    const negative = (addr6 & 0x10) !== 0;
    const abs_val = (addr6 & 0xf) + 1;
    return (alt ? "|" : "") + (negative ? "-" : "+") + abs_val.toString();
}

function instToString(instruction) {
    const inst_type = (instruction >> 12) & 0x7;
    const op1 = addr6ToString((instruction >> 6) & 0x3f);
    const op2 = addr6ToString(instruction & 0x3f);
    switch(inst_type) {
        case 0:
            return `mov ${op1},${op2}`;
        case 1:
            return `add ${op1},${op2}`;
        case 2:
            return `cshl ${op1},${op2}`;
        case 3: // or
            return `or ${op1},${op2}`;
        case 4: // and
            return `and ${op1},${op2}`;
        case 5: // ssub (saturating sub)
            return `ssub ${op1},${op2}`;
        case 6: // load V, A
            return `ld ${op1},[${op2}]`;
        case 7: // store V, A
            return `st ${op1},[${op2}]`;
    }
}


function main() {
    const vm = new Vue({
        el: "#app",
        data: {
            interval: null,
            tick: 0,
            numParticles: 0,

            // viewport
            viewportScale: 10, // px/space
            viewportOrigin: 0, // px

            // drag control
            captureMode: false,
            dragging: false,
            prevPos: 0,
            selectionBox: null,
        },
        methods: {
            toSpace: function(pCanvas) {
                return pCanvas.clone().sub(this.viewportOrigin).mult(1 / this.viewportScale);
            },
            dragStart: function(ev) {
                this.dragging = true;
                this.prevPos = ev.clientX;
            },
            dragStop: function() {
                this.dragging = false;
                this.redraw();
            },
            drag: function(ev) {
                if (!this.dragging) {
                    return;
                }

                const currPos = ev.clientX;
                // normal: move canvas
                const dx = ev.clientX - this.prevPos;
                this.viewportOrigin += dx;
                this.prevPos = currPos;

                this.redraw();
            },
            clean: function() {
                cleanParticles();
                this.tick = 0;
                this.redraw();
            },
            addRandom: function(num) {
                addRandom(num);
                this.redraw();
            },
            addGlider1: function(num) {
                addPatternsRandomly(glider1, num);
                this.redraw();
            },
            addPuffer1: function(num) {
                addPatternsRandomly(puffer1, num);
                this.redraw();
            },
            addPuffer2: function(num) {
                addPatternsRandomly(puffer2, num);
                this.redraw();
            },
            redraw: function() {
                this.numParticles = 0;
                redraw(this.viewportScale, this.viewportOrigin);
            },
            zoom: function(ev) {
                ev.preventDefault();

                // p = event.offsetX,Y must be preserved.
                // p<canvas> = p<space> * zoom + t = p<ECA> * new_zoom + new_t
                var centerXSp = (ev.offsetX - this.viewportOrigin) / this.viewportScale;
                this.viewportScale = Math.min(20, Math.max(0.01, this.viewportScale * (1 - ev.deltaY * 0.002)));

                this.viewportOrigin = ev.offsetX - centerXSp * this.viewportScale;

                this.redraw();
            },
            startStepping: function() {
                if (this.interval !== null) {
                    return;
                }
                this.interval = setInterval(() => {
                    for (let i = 0; i < numThread * size; i++) {
                        step();
                        this.tick += 1;
                    }
                    this.redraw();
                }, 50);    
            },
            stopStepping: function() {
                if (this.interval === null) {
                    return;
                }
                clearInterval(this.interval);
                this.interval = null;
            },
            clickStep: function() {
                step();
                this.tick += 1;
                this.redraw();
            },
            clickTogglePlaying: function() {
                if (this.interval === null) {
                    this.startStepping();
                } else {
                    this.stopStepping();
                }
            },
            clickCapture: function() {
                this.dragging = false;
                this.stopStepping();
                this.captureMode = true;
            },
        },
    });

    cleanParticles();
    addRandom();
    vm.startStepping();
}

main();
