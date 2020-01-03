"use strict";
import {WorldState, decodeAddress, decodeExecFlag} from "./fiber.js";
import {parseSingle, addr6ToString, instToString} from "./fiber-asm.js";

const canonicalState = new WorldState(128);

// World View: Connection by Effect (depends on L0)
class ConnectionView {
    constructor(world) {
        this.world = world;
        this.unionfind_parent = new Uint32Array(world.size);
        this.disconnectAll();
    }

    analyzeSingleSweep() {
        const stCopy = this.world.clone();
        this.disconnectAll();

        for (let i = 0; i < this.world.size; i++) {
            const src = stCopy.currCellIx;
            const affectedPos = this.getWrittenPos(stCopy);
            if (affectedPos !== null) {
                this.connect(src, affectedPos);
            }
            stCopy.step();
        }

        const gs = [];
        for (let g of this.getGroups().values()) {
            if (g.length > 1) {
                gs.push(g);
            }
        }
        console.log("num groups=", gs.length);
        return gs;
    }

    getWrittenPos(stCopy) {
        const instruction = stCopy.state[stCopy.currCellIx];
        if ((instruction & 0x80) === 0) {
            return null;
        }

        const inst_type = (instruction >> 12) & 0x7;
        const op1 = decodeAddress(stCopy.currCellIx, (instruction >> 6) & 0x3f);
        const op2 = decodeAddress(stCopy.currCellIx, instruction & 0x3f);
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
                return decodeAddress(stCopy.currCellIx, stCopy.state[op2] & 0x3f);
        }
    }

    disconnectAll() {
        for (let i = 0; i < this.world.size; i++) {
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

function redraw(world, scale, originY) {
    const canvas = document.getElementById("main");
    const ctx = canvas.getContext("2d");

    ctx.fillStyle = "white";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.save();
    ctx.translate(0, originY);
    ctx.scale(scale, scale);

    
    const connectionView = new ConnectionView(canonicalState);
    const connectionEntities = connectionView.analyzeSingleSweep();
    const colors = ["lightblue", "lightgreen", "lightpink", "lightcoral", "lightsalmon"];
    for (let entityIx = 0; entityIx < connectionEntities.length; entityIx++) {
        const color = colors[entityIx % 3];
        connectionEntities[entityIx].forEach(pos => {
            const cellIx = pos;

            ctx.fillStyle = color;
            ctx.fillRect(0, cellIx * 10 + 2, 300, 10);
        });
    }
    
    for (let i = -32; i < world.size + 32; i++) {
        const wrappedIx = (i + world.size) % world.size;
        const data = world.state[wrappedIx];

        const numHex = formatCellHex(data);
        const numDec = ("     " + data.toString(10)).substr(-5);
        const inst = instToString(data);

        ctx.font = "10px 'Inconsolata'";

        ctx.fillStyle = (wrappedIx === world.currCellIx) ? "red" : "black";
        ctx.fillText(("      " + wrappedIx.toString(10)).substr(-6), 0, i * 10);

        ctx.fillStyle = "black";
        ctx.fillText(numHex, 40, i * 10);
        ctx.fillText(numDec, 65, i * 10);

        ctx.fillStyle = decodeExecFlag(data) ? "black" : "#888";
        ctx.fillText(inst, 100, i * 10);
    }

    ctx.restore();
}

function formatCellHex(v) {
    return ("0000" + v.toString(16)).substr(-4);
}

function addRandom(n) {
    for (let cellIx = 0; cellIx < n; cellIx++) {
        canonicalState.state[cellIx] = Math.floor(Math.random() * 0xffff);
    }
}

function fitCanvasToWindow() {
    const canvas = document.getElementById("main");
    canvas.height = window.innerHeight;
}

function main() {
    const vm = new Vue({
        el: "#app",
        data: {
            interval: null,
            tick: 0,

            snippetSize: 50,
            snippetText: "",

            // viewport
            viewportScale: 2, // px/space
            viewportOrigin: 25, // px
        },
        methods: {
            toSpace: function(pCanvas) {
                return pCanvas.clone().sub(this.viewportOrigin).mult(1 / this.viewportScale);
            },
            clean: function() {
                this.stopStepping();
                canonicalState.reset();
                this.tick = 0;
                this.redraw();
            },
            addRandom: function(num) {
                addRandom(num);
                this.redraw();
            },
            redraw: function() {
                redraw(canonicalState, this.viewportScale, this.viewportOrigin);
            },
            scrollZoom: function(ev) {
                ev.preventDefault();

                if (ev.ctrlKey) {
                    // Zoom

                    // p = event.offsetX,Y must be preserved.
                    // p<canvas> = p<space> * zoom + t = p<ECA> * new_zoom + new_t
                    var centerYSp = (ev.offsetY - this.viewportOrigin) / this.viewportScale;
                    this.viewportScale = Math.min(2, Math.max(0.01, this.viewportScale * (1 - ev.deltaY * 0.002)));

                    this.viewportOrigin = ev.offsetY - centerYSp * this.viewportScale;
                } else {
                    // Scroll
                    this.viewportOrigin -= this.viewportScale * ev.deltaY * 0.2;
                }

                this.redraw();
            },
            startStepping: function() {
                if (this.interval !== null) {
                    return;
                }
                this.finishMicrostep();
                this.interval = setInterval(() => {
                    for (let i = 0; i < canonicalState.size; i++) {
                        canonicalState.step();
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
                if (this.finishMicrostep()) {
                    for (var i = 0; i < canonicalState.size; i++) {
                        canonicalState.step();
                        this.tick += 1;
                    }
                }
                this.redraw();
            },
            /// returns: already finished
            finishMicrostep: function() {
                if (this.tick % canonicalState.size === 0) {
                    return true;
                }
                
                var remaining = canonicalState.size - this.tick % canonicalState.size;
                for (var i = 0; i < remaining; i++) {
                    canonicalState.step();
                    this.tick += 1;
                }
                return false;
            },
            clickMicroStep: function() {
                canonicalState.step();
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
            writeSnippet: function() {
                this.parseSnippet().forEach((v, i) => canonicalState.state[i] = v);
                this.redraw();
            },
            readSnippet: function() {
                const lines = [];
                canonicalState.state.slice(0, this.snippetSize).forEach(v => {
                    if (decodeExecFlag(v)) {
                        lines.push(instToString(v));
                    } else {
                        lines.push(formatCellHex(v));
                    }
                });
                this.snippetText = lines.join("\n");
            },
            parseSnippet: function() {
                return this.snippetText.split("\n").map(x => x.trim()).filter(x => x !== "").map(x => {
                    const inst = parseSingle(x);
                    if (inst !== null) {
                        return inst;
                    }
                    return parseInt(x, 16);
                });
            },
        },
        computed: {
            currentSnippetSize: function() {
                return this.parseSnippet().length;
            },
            timestep: function() {
                return Math.floor(this.tick / canonicalState.size);
            },
            subtimestep: function() {
                return this.tick % canonicalState.size;
            },
        },
    });

    window.addEventListener("resize", fitCanvasToWindow);

    fitCanvasToWindow();
    canonicalState.reset();
    addRandom();
    vm.readSnippet();
    vm.startStepping();
}

main();
