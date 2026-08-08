/*

  the title screen news, the thing the pink chuzzle opens.

  RComm::RetrieveNews asks go.php for command=getnews and stashes the reply in
  the "NewsVersion" setting; Title::Notify then feeds it to MLRender, which is
  the engine's little markup language. the worker at /news does the fetching so
  the endpoint and its checksum stay off this page.

  the tags MLRender actually uses in the live feed, all of which are handled
  below except where noted:

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
      <center> <valign middle>        box alignment, ignored - the live feed
                                      only ever centres full width boxes, so it
                                      would not move anything
      <-- ... -->                     comment, and the feed does keep a whole
                                      dead news item inside one

*/

const newsurl = "https://chuzzle.coolsite.cv/news";
const newsread = "chuzzlenewsread";

// the game draws whichever <os> block matches the device it is running on.
// there is no "web", and the site is a companion to the android build, so that
// is the branch worth showing - the others are store links we cannot use.
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

// border/width are in the same game units the box is laid out in, and the
// content column is 327 of them across, so a percentage keeps them in step at
// any size - padding percentages resolve against the width either way
function units(n) {return (Number(n) / 327 * 100).toFixed(3) + "%"}

function pagestyle(rest) {
    const a = attrsof(rest);
    const bits = [];
    if (a.border) bits.push("padding: " + units(a.border));
    if (a.bkgcolor) bits.push("background: " + csscolor(a.bkgcolor));
    if (a.width) bits.push("width: " + (a.width === "100%" ? "100%" : units(a.width)));
    return bits.length ? " style=\"" + bits.join("; ") + "\"" : "";
}

function blinkstyle(rest) {
    const cols = [];
    rest.replace(/color=([^;]+)/g, function(whole, v) {cols.push(csscolor(v)); return ""});
    const time = /time=(\d+)/.exec(rest);
    // time is ticks per half cycle at 60fps, so a full swap is twice that
    const secs = ((Number(time && time[1]) || 30) * 2 / 60).toFixed(3);
    return " class=\"newsblink\" style=\"--blinka: " + (cols[0] || "#fff")
        + "; --blinkb: " + (cols[1] || "#fff") + "; --blinktime: " + secs + "s\"";
}

/*//////////////////////////////////////////////////////////////////////*/

const tagre = /<([^>]*)>/g;

function newshtml(raw) {
    const src = stripcomments(raw);
    let html = "";
    let mode = null;
    let depth = 0;
    let skip = 0;
    let m, last = 0;

    function flush(text) {
        if (skip) return;
        const clean = text.replace(/\s+/g, " ");
        if (!clean.trim()) return;
        if (!mode) {html += escapehtml(clean); return}
        html += "<span" + mode + ">" + escapehtml(clean) + "</span>";
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

        if (name === "page") {
            html += "<div class=\"newspage" + (depth === 0 ? " newsitem" : "")
                + "\"" + pagestyle(rest) + ">";
            depth++;
        } else if (name === "/page") {
            html += "</div>";
            if (depth) depth--;
        } else if (name === "br") {
            const extra = Number(rest);
            html += extra
                ? "<br><span class=\"newsgap\" style=\"height: " + units(extra) + "\"></span>"
                : "<br>";
        } else if (name === "color") {
            mode = " style=\"color: " + csscolor(rest) + "\"";
        } else if (name === "blink") {
            mode = blinkstyle(rest);
        } else if (name === "font") {
            const face = rest.toLowerCase();
            mode = face === "default" ? null : " class=\"newsfont" + face + "\"";
        } else if (name === "link") {
            const href = rest.split(/\s+/)[0];
            html += "<a class=\"newslink\" target=\"_blank\" rel=\"noopener\" href=\""
                + escapehtml(href) + "\">";
        } else if (name === "/link") {
            html += "</a>";
        } else if (name === "img") {
            const a = attrsof(rest);
            const href = rest.split(/[\s;]+/)[0];
            html += "<img class=\"newsimg\" alt=\"\" src=\"" + escapehtml(href) + "\""
                + (a.width ? " width=\"" + escapehtml(a.width) + "\"" : "")
                + (a.height ? " height=\"" + escapehtml(a.height) + "\"" : "") + ">";
        }
        // setup, center and valign fall through with nothing to emit
    }
    flush(src.slice(last));
    while (depth-- > 0) html += "</div>";
    return html;
}

/*//////////////////////////////////////////////////////////////////////*/

function shownews(wrap, body, got) {
    body.innerHTML = newshtml(got.news || "");
    wrap.classList.add("on");
    try {localStorage.setItem(newsread, got.version || "")} catch (e) {}
    const badge = document.querySelector(".newsbadge");
    if (badge) badge.classList.remove("on");
}

function buildnews() {
    const button = document.querySelector(".newschuzzle");
    const wrap = document.querySelector(".newswrap");
    if (!button || !wrap) return;
    const body = wrap.querySelector(".newsbody");
    const badge = document.querySelector(".newsbadge");
    let got = null;
    let asked = false;

    const pull = function() {
        if (asked) return Promise.resolve(got);
        asked = true;
        return fetch(newsurl).then(function(reply) {
            return reply.ok ? reply.json() : null;
        }).then(function(data) {got = data; return data}).catch(function() {return null});
    };

    // the game keeps the last version it showed and badges the chuzzle when the
    // server moves past it, which is all RComm::IsNews and SetNewsRead do
    pull().then(function(data) {
        if (!data || !badge) return;
        let seen = null;
        try {seen = localStorage.getItem(newsread)} catch (e) {}
        if (seen !== (data.version || "")) badge.classList.add("on");
    });

    button.addEventListener("click", function() {
        if (typeof playsound === "function") playsound("click", 0.7);
        body.innerHTML = "<div class=\"newsloading\">Loading...</div>";
        wrap.classList.add("on");
        pull().then(function(data) {
            if (!data) {
                body.innerHTML = "<div class=\"newsloading\">The news would not come.</div>";
                return;
            }
            shownews(wrap, body, data);
        });
    });

    const shut = function() {wrap.classList.remove("on")};
    wrap.querySelector(".newsclose").addEventListener("click", shut);
    wrap.addEventListener("click", function(e) {if (e.target === wrap) shut()});
    document.addEventListener("keydown", function(e) {
        if (e.key === "Escape") shut();
    });
}

document.addEventListener("DOMContentLoaded", buildnews);
