/*
    <setup ...>                     document options, nothing to draw
    <page a=b;...> </page>          a box - border=N padding, width=100%,
                                      bkgcolor=r,g,b behind it
    <br> <BR> <br N>                line break, N adds extra space
    <color X>                       r,g,b / r,g,b,a / one number / #hex / name
    <blink color=A;color=B;time=N>  alternates the two every N ticks
    <font arial|default|small>
    <link URL web;> </link>
    <os android|ios|win32> </os>    only the matching platform draws
    <img URL width=..;height=..;>
    <center> <valign middle>        box alignment, ignored

*/

const newsurl = "https://chuzzle.coolsite.cv/news";
const newsread = "chuzzlenewsread";
const newsos = "android";

/*//////////////////////////////////////////////////////////////////////*/

function escapehtml(s) {
    return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}

function stripcomments(raw) {
    return raw.replace(/<--[\s\S]*?-->/g, "");
}

function attrsof(rest) {
    const out = {};
    rest.split(";").forEach(function(bit) {
        const at = bit.indexOf("=");
        if (at < 0) return;
        out[bit.slice(0, at).trim().toLowerCase()] = bit.slice(at + 1).trim();
    });
    return out;
}
function units(n) {return (Number(n) / 327 * 100).toFixed(3) + "%"}

function pagestyle(rest, boxed) {
    const a = attrsof(rest);
    const bits = [];
    if (a.border) bits.push("padding: " + units(a.border));
    if (a.bkgcolor) bits.push("background: " + csscolor(a.bkgcolor));
    if (a.width) bits.push("width: " + (a.width === "100%" ? "100%" : units(a.width)));
    if (boxed) bits.push("margin-inline: auto");
    return bits.length ? " style=\"" + bits.join("; ") + "\"" : "";
}

function blinkstyle(rest) {
    const cols = [];
    rest.replace(/color=([^;]+)/g, function(whole, v) {cols.push(csscolor(v)); return ""});
    const time = /time=(\d+)/.exec(rest);
    // time is ticks per half cycle at 60fps, so a full swap is twice that
    const secs = ((Number(time && time[1]) || 30) * 2 / 60).toFixed(3);
    return {cls: "newsblink", style: "--blinka: " + (cols[0] || "#fff")
        + "; --blinkb: " + (cols[1] || "#fff") + "; --blinktime: " + secs + "s"};
}

/*//////////////////////////////////////////////////////////////////////*/

const tagre = /<([^>]*)>/g;

function newshtml(raw) {
    const src = stripcomments(raw);
    let html = "";
    // colour and font are separate states in the engine - one <color> does not
    // cancel a <font>, so they have to be tracked apart and emitted together
    let tint = null;
    let face = null;
    let depth = 0;
    let skip = 0;
    let centering = 0;
    let pendingcenter = false;
    let m, last = 0;

    function flush(text) {
        if (skip) return;
        const clean = text.replace(/\s+/g, " ");
        if (!clean.trim()) return;
        if (!tint && !face) {html += escapehtml(clean); return}
        const cls = [face, tint && tint.cls].filter(Boolean).join(" ");
        html += "<span" + (cls ? " class=\"" + cls + "\"" : "")
            + (tint && tint.style ? " style=\"" + tint.style + "\"" : "")
            + ">" + escapehtml(clean) + "</span>";
    }

    // <center> before a box centres the box, before anything else it centres
    // the lines that follow until the box closes. the feed uses both
    function opencenter(isbox) {
        pendingcenter = false;
        if (isbox) return true;
        html += "<div class=\"newscenter\">";
        centering++;
        return false;
    }

    while ((m = tagre.exec(src))) {
        flush(src.slice(last, m.index));
        last = tagre.lastIndex;

        const body = m[1].trim();
        const cut = body.search(/[\s=]/);
        const name = (cut < 0 ? body : body.slice(0, cut)).toLowerCase();
        const rest = cut < 0 ? "" : body.slice(cut).trim();

        if (name === "os") {
            if (rest.toLowerCase() !== newsos) skip++;
            continue;
        }
        if (name === "/os") {
            if (skip) skip--;
            continue;
        }
        if (skip) continue;

        if (name === "center") {
            pendingcenter = true;
        } else if (name === "page") {
            const boxed = pendingcenter && opencenter(true);
            html += "<div class=\"newspage" + (depth === 0 ? " newsitem" : "")
                + "\"" + pagestyle(rest, boxed) + ">";
            depth++;
        } else if (name === "/page") {
            // the feed ends most items with a stray <br>, which would leave the
            // bottom of every box padded deeper than the top
            html = html.replace(/(?:<br>)+$/, "");
            while (centering > 0) {html += "</div>"; centering--}
            html += "</div>";
            if (depth) depth--;
        } else if (name === "br") {
            if (pendingcenter) opencenter(false);
            const extra = Number(rest);
            html += extra
                ? "<br><span class=\"newsgap\" style=\"height: " + units(extra) + "\"></span>"
                : "<br>";
        } else if (name === "color") {
            if (pendingcenter) opencenter(false);
            tint = {style: "color: " + csscolor(rest)};
        } else if (name === "blink") {
            if (pendingcenter) opencenter(false);
            tint = blinkstyle(rest);
        } else if (name === "font") {
            if (pendingcenter) opencenter(false);
            const want = rest.toLowerCase();
            face = want === "default" ? null : "newsfont" + want;
        } else if (name === "link") {
            if (pendingcenter) opencenter(false);
            const href = rest.split(/\s+/)[0];
            html += "<a class=\"newslink\" target=\"_blank\" rel=\"noopener\" href=\""
                + escapehtml(href) + "\">";
        } else if (name === "/link") {
            html += "</a>";
        } else if (name === "img") {
            if (pendingcenter) opencenter(false);
            const a = attrsof(rest);
            // the feed's image is plain http from a bare ip, which an https
            // page blocks, so it comes back through the worker instead
            const href = newsurl + "/img/" + encodeURIComponent(rest.split(/[\s;]+/)[0]);
            html += "<img class=\"newsimg\" alt=\"\" src=\"" + escapehtml(href) + "\""
                + (a.width ? " width=\"" + escapehtml(a.width) + "\"" : "")
                + (a.height ? " height=\"" + escapehtml(a.height) + "\"" : "") + ">";
        }
        // setup and valign fall through with nothing to emit
    }
    flush(src.slice(last));
    while (centering-- > 0) html += "</div>";
    while (depth-- > 0) html += "</div>";
    return html;
}

/*//////////////////////////////////////////////////////////////////////*/

function buildnews() {
    const button = document.querySelector(".newschuzzle");
    const wrap = document.querySelector(".newswrap");
    if (!button || !wrap) return;
    const body = wrap.querySelector(".newsbody");
    let got = null;
    let asked = false;

    const pull = function() {
        if (asked) return Promise.resolve(got);
        asked = true;
        return fetch(newsurl).then(function(reply) {
            return reply.ok ? reply.json() : null;
        }).then(function(data) {got = data; return data}).catch(function() {return null});
    };

    button.addEventListener("click", function() {
        body.innerHTML = "<div class=\"newsloading\">Loading...</div>";
        // settled is what the daily-do popups use once the open scale is done
        wrap.classList.add("open", "settled");
        pull().then(function(data) {
            body.innerHTML = data
                ? newshtml(data.news || "")
                : "<div class=\"newsloading\">The news would not come.</div>";
            if (data) {try {localStorage.setItem(newsread, data.version || "")} catch (e) {}}
        });
    });

    const shut = function() {wrap.classList.remove("open", "settled")};
    wrap.querySelector(".closebtn").addEventListener("click", shut);
    wrap.addEventListener("click", function(e) {if (e.target === wrap) shut()});
    document.addEventListener("keydown", function(e) {
        if (e.key === "Escape") shut();
    });
}

document.addEventListener("DOMContentLoaded", buildnews);
