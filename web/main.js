"use strict";

const size = 1024;
const world = new Uint16Array(size);

function redraw(scale, originX) {
    let canvas = document.getElementById("main");
    const ctx = canvas.getContext("2d");

    ctx.fillStyle = "white";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.save();
    ctx.translate(originX, 0);
    ctx.scale(scale, scale);

    ctx.fillStyle = "black";
    for (let i = 0; i < size; i++) {
        const label = ("0000" + world[i].toString(16)).substr(-4);
        ctx.fillText(label, i * 30, 10);
    }

    ctx.restore();
}

function cleanParticles() {
    world.fill(0);
}

function addRandom(n) {
}


function step() {
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
                    step();
                    this.tick += 1;
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
