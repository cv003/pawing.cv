/*
    <setup ...>                     document options
    <page a=b;...> </page>          a box
    <br> <BR> <br N>                line break, N adds extra space
    <color X>
    <blink color=A;color=B;time=N>  alternates the two every N ticks
    <font arial|default|small>      i don't get why it uses arial, it's still clearly not arial in-game?
    <link URL web;> </link>
    <os android|ios|win32> </os>    only the matching platform draws
    <img URL width=..;height=..;>
    <center> <valign middle>        box alignment, ignored

*/

const newsurl = "https://chuzzle.coolsite.cv/news";
const newsread = "chuzzlenewsread";
const newsos = "android";
// can't properly proxy media from this awful http server whatsoever
const localimages = {"http://45.76.25.28/images/getchuzzlesnap.png": "assets/images/getchuzzlesnap.png"};

function imagesrc(url) {
    return localimages[url] || newsurl + "/img/" + encodeURIComponent(url);
}

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
function pageattrs(rest, boxed) {
    const a = attrsof(rest);
    let out = "";
    if (a.border) out += " data-border=\"" + escapehtml(a.border) + "\"";
    if (a.width) out += " data-width=\"" + escapehtml(a.width) + "\"";
    if (boxed) out += " data-boxed=\"1\"";
    if (a.bkgcolor) out += " style=\"background: " + csscolor(a.bkgcolor) + "\"";
    return out;
}

function blinkstyle(rest) {
    const cols = [];
    rest.replace(/color=([^;]+)/g, function(whole, v) {cols.push(csscolor(v)); return ""});
    const time = /time=(\d+)/.exec(rest);
    const secs = ((Number(time && time[1]) || 30) * 2 / 60).toFixed(3);
    return {cls: "newsblink", style: "--blinka: " + (cols[0] || "#fff")
        + "; --blinkb: " + (cols[1] || "#fff") + "; --blinktime: " + secs + "s"};
}

/*//////////////////////////////////////////////////////////////////////*/

const tagre = /<([^>]*)>/g;

function newshtml(raw) {
    const src = stripcomments(raw);
    let html = "";
    let tint = null; let face = null;
    let depth = 0; let skip = 0;
    let centering = 0;
    let pendingcenter = false;
    let blocked = true;
    let m, last = 0;

    function flush(text) {
        if (skip) return;
        const clean = text.replace(/\s+/g, " ");
        if (!clean.trim()) {
            if (!blocked) {html += " "; blocked = true}
            return;
        }
        blocked = false;
        if (!tint && !face) {html += escapehtml(clean); return}
        const cls = [face, tint && tint.cls].filter(Boolean).join(" ");
        html += "<span" + (cls ? " class=\"" + cls + "\"" : "")
            + (tint && tint.style ? " style=\"" + tint.style + "\"" : "")
            + ">" + escapehtml(clean) + "</span>";
    }

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
                + "\"" + pageattrs(rest, boxed) + ">";
            depth++;
            blocked = true;
        } else if (name === "/page") {
            html = html.replace(/(?:<br>|\s)+$/, "");
            while (centering > 0) {html += "</div>"; centering--}
            html += "</div>";
            if (depth) depth--;
            blocked = true;
        } else if (name === "br") {
            if (pendingcenter) opencenter(false);
            const extra = Number(rest);
            html += extra
                ? "<br><span class=\"newsgap\" data-gap=\"" + escapehtml(rest) + "\"></span>"
                : "<br>";
            blocked = true;
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
            const href = imagesrc(rest.split(/[\s;]+/)[0]);
            html += "<img class=\"newsimg\" alt=\"\" onerror=\"this.remove()\" src=\""
                + escapehtml(href) + "\""
                + (a.width ? " width=\"" + escapehtml(a.width) + "\"" : "")
                + (a.height ? " height=\"" + escapehtml(a.height) + "\"" : "") + ">";
        }
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
    loadsounds(["click"]);

    const pull = function() {
        if (asked) return Promise.resolve(got);
        asked = true;
        return fetch(newsurl).then(function(reply) {
            return reply.ok ? reply.json() : null;
        }).then(function(data) {got = data; return data}).catch(function() {return null});
    };

    const paint = function() {
        body.innerHTML = got
            ? newshtml(got.news || "")
            : "<div class=\"newsloading\">The news would not come.</div>";
        if (got) {try {localStorage.setItem(newsread, got.version || "")} catch (e) {}}
    };

    const open = function(quiet) {
        if (!quiet) playsound("click", 0.7);
        body.innerHTML = "<div class=\"newsloading\">Loading...</div>";
        wrap.classList.add("open", "settled");
        if (location.hash !== "#news") {
            history.replaceState(null, "", location.pathname + location.search + "#news");
        }
        pull().then(paint);
    };

    button.addEventListener("click", function() {open()});

    const shut = function(quiet) {
        if (!quiet) playsound("click", 0.7);
        wrap.classList.remove("open", "settled");
        document.documentElement.classList.remove("newshash");
        if (location.hash === "#news") {
            history.replaceState(null, "", location.pathname + location.search);
        }
    };
    wrap.querySelector(".closebtn").addEventListener("click", function() {shut()});
    wrap.addEventListener("click", function(e) {if (e.target === wrap) shut()});
    document.addEventListener("keydown", function(e) {
        if (e.key === "Escape") shut();
    });
    if (document.documentElement.classList.contains("newshash")) open(true);
    window.addEventListener("hashchange", function() {
        if (location.hash === "#news") open(true);
        else shut(true);
    });
}
document.addEventListener("DOMContentLoaded", buildnews);
