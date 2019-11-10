"use strict";

const size = 128;
const numThread = 4;
const state = new Uint16Array(size * numThread);
const topology = new Uint8Array(size * numThread);

let currThreadIx = 0
let currCellIx = 0;

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
            const data = state[i * numThread + threadIx];
            ctx.fillStyle = (threadIx === currThreadIx && i === currCellIx) ? "red" : (instToExecFlag(data) ? "black" : "gray");

            const num = ("0000" + data.toString(16)).substr(-4);
            const inst = instToString(data);

            ctx.font = "10px 'Inconsolata'";
            ctx.fillText(num, i * 24, 20 * (threadIx + 1));

            ctx.font = "3px sans-serif";
            ctx.fillText(inst, i * 24, 20 * (threadIx + 1) + 5);
        }
    }

    ctx.restore();
}

function cleanParticles() {
    currThreadIx = 0;
    currCellIx = 0;

    state.fill(0);

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
}

function addRandom(n) {
    for (let cellIx = 0; cellIx < n; cellIx++) {
        for (let threadIx = 0; threadIx < numThread; threadIx++) {
            state[cellIx * numThread + threadIx] = Math.floor(Math.random() * 0xffff);
        }
    }
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

function execInstruction(threadIx, cellIx) {
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

function step() {
    execInstruction(currThreadIx, currCellIx);
    currThreadIx++;
    if (currThreadIx >= numThread) {
        currThreadIx = 0;
        currCellIx = (currCellIx + 1) % size;
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
