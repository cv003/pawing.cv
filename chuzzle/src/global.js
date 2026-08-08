function fitheight() {
    if (document.activeElement && /^(INPUT|TEXTAREA)$/.test(document.activeElement.tagName)) {
        return;
    }
    document.documentElement.style.setProperty("--vh", window.innerHeight + "px");
}

if (!(window.CSS && CSS.supports && CSS.supports("height", "100svh"))) {
    fitheight();
    window.addEventListener("resize", fitheight);
    window.addEventListener("orientationchange", function() {
        setTimeout(fitheight, 200);
    });
}

/*//////////////////////////////////////////////////////////////////////*/

function logotrimmer(svg) {
    const texts = svg.querySelectorAll("text");
    if (!texts.length) return;
    if (!svg.getClientRects().length) return;
    let xmin = Infinity, ymin = Infinity, xmax = -Infinity, ymax = -Infinity;
    for (const text of texts) {
        const box = text.getBBox();
        xmin = Math.min(xmin, box.x); ymin = Math.min(ymin, box.y);
        xmax = Math.max(xmax, box.x + box.width); ymax = Math.max(ymax, box.y + box.height);
    }

    const outline = svg.querySelector(".lgblack");
    const strokeWidth = outline ? parseFloat(getComputedStyle(outline).strokeWidth) || 0 : 0;
    const pad = Math.ceil(strokeWidth / 2) + 1;

    xmin -= pad; ymin -= pad; xmax += pad; ymax += pad;

    const width = Math.max(1, xmax - xmin); const height = Math.max(1, ymax - ymin);
    if (width < 2 || height < 2) return;
    svg.setAttribute("viewBox", `${xmin} ${ymin} ${width} ${height}`);
    const glyphs = Math.max(1, (ymax - pad) - (ymin + pad));
    svg.style.setProperty("--boxratio", (height / glyphs).toFixed(4));
    svg.dataset.trimmed = "1";
}

function trimpending(root) {
    root.querySelectorAll("svg.logo:not([data-trimmed])").forEach(logotrimmer);
}

function trimall() {
    document.querySelectorAll("svg.logo").forEach(logotrimmer);
    document.documentElement.classList.add("fontsready");
}

function relabellogo(svg, words) {
    if (!svg || svg.dataset.words === words) return;
    svg.dataset.words = words;
    svg.querySelectorAll("text").forEach(function(t) {t.textContent = words});
    delete svg.dataset.trimmed;
    logotrimmer(svg);
}
if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(trimall);
} else {window.addEventListener("load", trimall)}

/*//////////////////////////////////////////////////////////////////////*/

/* MLRender's <color> argument, shared by the daily-do rule text and the news.
   it takes "r,g,b" or "r,g,b,a" as 0..1 floats (a bare ".5" is legal, and the
   engine tolerates a trailing f), a single number for grey, "#rrggbb", or one
   of the names below. grey is nudged off pure 50% so it stays readable. */
const colornames = {
    white: "#ffffff", black: "#000000", red: "#ff0000", green: "#00ff00",
    blue: "#0000ff", cyan: "#00ffff", magenta: "#ff00ff", yellow: "#ffff00",
    orange: "#ff8000", gold: "#ffd700", pink: "#ff80c0", purple: "#8000ff",
    grey: "#e8e8f0", gray: "#e8e8f0",
};

function csscolor(raw) {
    const want = String(raw).trim();
    const named = colornames[want.toLowerCase()];
    if (named) return named;
    if (want.charAt(0) === "#") return want;
    const bits = want.split(",").map(parseFloat);
    if (!bits.length || bits.some(Number.isNaN)) return want;
    const eight = function(v) {return Math.round(Math.max(0, Math.min(1, v)) * 255)};
    const trio = bits.length === 1 ? [bits[0], bits[0], bits[0]] : bits;
    const rgb = eight(trio[0]) + "," + eight(trio[1]) + "," + eight(trio[2]);
    return bits.length >= 4 ? "rgba(" + rgb + "," + bits[3] + ")" : "rgb(" + rgb + ")";
}

/*//////////////////////////////////////////////////////////////////////*/

const sitehome = new URL("..", document.currentScript.src).href;
const soundbank = {};
let soundgear = null;

function loadsounds(names) {
    if (!window.AudioContext) return;
    soundgear = soundgear || new AudioContext();
    names.forEach(function(name) {
        fetch(sitehome + "assets/audio/" + name + ".ogg").then(function(reply) {
            return reply.arrayBuffer();
        }).then(function(raw) {
            return soundgear.decodeAudioData(raw);
        }).then(function(buffer) {
            soundbank[name] = buffer;
        }).catch(function() {});
    });
}

function playsound(name, level) {
    const buffer = soundbank[name];
    if (!buffer || !soundgear) return;
    const source = soundgear.createBufferSource();
    const volume = soundgear.createGain();
    source.buffer = buffer;
    volume.gain.value = level === undefined ? 1 : level;
    source.connect(volume).connect(soundgear.destination);
    source.start();
}

function wakesound() {
    if (soundgear && soundgear.state === "suspended") soundgear.resume();
}
window.addEventListener("pointerdown", wakesound, true);
window.addEventListener("keydown", wakesound, true);
