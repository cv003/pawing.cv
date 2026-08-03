function logotrimmer(svg) {
    const texts = svg.querySelectorAll("text");
    if (!texts.length) return;
    /* getBBox reads zero inside a display:none subtree, which would collapse
       the viewBox and blow the logo up. leave it alone until it is on screen. */
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
    /* only the daily-do page has a board rail to reposition */
    if (typeof placepicks === "function") placepicks();
}

/* the logo is the same word stacked six times plus the erode mask, so every
   copy has to change together and the box has to be measured again. */
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

/* the game's own gloves stand in for every cursor on every chuzzle page.
   they are .cur rather than png, so the hotspot rides inside the file and no
   page has to remember where the fingertip is: pointing finger at its tip,
   pinch at the pinch, open palm at its middle.

   the three cover everything on purpose - no text bar in the search box, no
   scroll glyph over the list - so the pages never show a cursor the game
   would not have drawn. paths resolve against this script rather than the
   page, since it is included from two directory depths. */
const cursorhome = new URL("assets/static/", document.currentScript.src).href;

function paintcursors() {
    const glove = function(name, fallback) {
        return "url(\"" + cursorhome + "cursor-" + name + ".cur\"), " + fallback;
    };
    const sheet = document.createElement("style");
    sheet.textContent = [
        "*, html, body {cursor: " + glove("default", "default") + "}",
        "a, button, label, summary, [role=button], input, textarea, select," +
            " .scores name {cursor: " + glove("pointer", "pointer") + "}",
        ".scroller, .scroller *, .scroller.dragging {cursor: "
            + glove("grab", "grab") + "}",
        ".scroller name {cursor: " + glove("pointer", "pointer") + "}"
    ].join(String.fromCharCode(10));
    document.head.appendChild(sheet);
}
paintcursors();
