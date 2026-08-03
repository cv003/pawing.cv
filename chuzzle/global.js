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
    if (typeof placepicks === "function") placepicks();
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

const sitehome = new URL(".", document.currentScript.src).href;
function paintcursors() {
    const glove = function(name, fallback) {
        return "url(\"" + sitehome + "assets/static/cursor-" + name + ".cur\"), " + fallback;
    };
    const sheet = document.createElement("style");
    sheet.textContent = [
        "html, body {cursor: " + glove("default", "default") + "}",
        "a, button, label, summary, [role=button], input, textarea, select," +
            " .scores name {cursor: " + glove("pointer", "pointer") + "}",
        ".scroller {cursor: " + glove("grab", "grab") + "}",
        "img, canvas, svg {-webkit-user-drag: none; user-drag: none}"
    ].join(String.fromCharCode(10));
    document.head.appendChild(sheet);
}
paintcursors();

/*//////////////////////////////////////////////////////////////////////*/

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
