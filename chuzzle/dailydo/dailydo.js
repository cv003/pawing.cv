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
}
if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(trimall);
} else {window.addEventListener("load", trimall)}

/*//////////////////////////////////////////////////////////////////////*/

/* row colours, straight out of DailyDoKit::DailyDoKit. the game feeds eight
   corners through Color::Pastel(0.5) and samples the resulting cycler at
   (row y / list height) * 7, wrapping past the end. the list is a palindrome
   around green, which is why the sweep mirrors instead of jumping. */
const cyclercorners = [
    [0, 0, 1], [1, 0, 1], [1, 0, 0], [1, 0.5, 0],
    [0, 1, 0], [1, 0.5, 0], [1, 0, 0], [1, 0, 1]
];
const cyclerspan = 0.875;

function pastel(v, floor) {return Math.max(floor, Math.min(1, v * 1.5))}

const cyclerstops = cyclercorners.map(function(c) {
    return c.map(function(v) {return pastel(v, 0.5)});
});

function cyclerget(t) {
    const last = cyclerstops.length - 1;
    let at = t % last;
    if (at < 0) at += last;
    const lo = Math.floor(at); const mix = at - lo;
    const a = cyclerstops[lo]; const b = cyclerstops[lo + 1];
    const ch = a.map(function(v, i) {return Math.round(255 * (v + (b[i] - v) * mix))});
    return "rgb(" + ch[0] + "," + ch[1] + "," + ch[2] + ")";
}

/* only the rows on screen exist as elements; a pool of about fifty gets
   repositioned and refilled as the list moves. 3800 live rows with a flag
   each would blow the compositor apart. */
let board = []; let pool = []; let rowheight = 0; let claimedat = -1;
let padtop = 0; let padbottom = 0; let filled = -1; let strip = null;

function poolsize(host) {
    return rowheight ? Math.ceil(host.clientHeight / rowheight) + 4 : 0;
}

function setdigits(cell, text) {
    while (cell.childNodes.length > text.length) cell.lastChild.remove();
    while (cell.childNodes.length < text.length) {
        cell.appendChild(document.createElement("d"));
    }
    for (let i = 0; i < text.length; i++) cell.childNodes[i].textContent = text[i];
}

function makerow() {
    const row = document.createElement("div");
    const rank = document.createElement("rank");
    const name = document.createElement("name");
    const flag = document.createElement("img");
    const score = document.createElement("score");
    row.append(rank, name, flag, score);
    row.parts = {rank: rank, name: name, flag: flag, score: score};
    return row;
}

function measurelist(host, list) {
    const style = getComputedStyle(list);
    padtop = parseFloat(style.paddingTop) || 0;
    padbottom = parseFloat(style.paddingBottom) || 0;

    if (!strip) {
        strip = document.createElement("hilite");
        list.insertBefore(strip, list.firstChild);
    }

    const probe = makerow();
    probe.parts.rank.textContent = "1.";
    probe.parts.name.textContent = "SAMPLE";
    probe.parts.score.textContent = "1000";
    probe.parts.flag.src = "assets/images/flags/--.png";
    list.appendChild(probe);
    rowheight = probe.offsetHeight;
    probe.remove();

    paintedat = null;
    const want = poolsize(host);
    while (pool.length > want) pool.pop().remove();
    while (pool.length < want) {
        const row = makerow();
        list.appendChild(row);
        pool.push(row);
    }
    filled = -1;
}

function contentheight() {return padtop + board.length * rowheight + padbottom}

let paintedat = null;

function paintrows(at, host) {
    if (!rowheight || !pool.length) return;
    if (paintedat === at) return;
    paintedat = at;
    const height = host.clientHeight * cyclerspan;
    const last = cyclerstops.length - 1;
    const first = Math.max(0, Math.min(board.length - pool.length,
        Math.floor((at - padtop) / rowheight) - 2));

    for (let slot = 0; slot < pool.length; slot++) {
        const index = first + slot;
        const row = pool[slot];
        if (index >= board.length) {row.style.display = "none"; continue}
        const entry = board[index];
        if (filled !== first) {
            row.style.display = "";
            row.parts.rank.textContent = (index + 1) + ".";
            row.parts.name.textContent = entry.name;
            setdigits(row.parts.score, entry.score);
            row.parts.flag.src = "assets/images/flags/" + entry.cc + ".png";
            row.dataset.id = entry.id;
            row.dataset.at = index;
            row.classList.toggle("mine", index === claimedat);
        }
        const top = padtop + index * rowheight - at;
        row.style.top = top + "px";
        const t = (top + rowheight / 2) / height * last;
        /* stop just short of the end: cyclerget wraps, so exactly last is blue again */
        row.style.color = cyclerget(Math.max(0, Math.min(last - 0.001, t)));
    }
    filled = first;

    if (strip) {
        strip.classList.toggle("on", claimedat >= 0);
        if (claimedat >= 0) {
            /* 40 game units tall on a 25 unit pitch, and its centre sits
               10 above the text where the row's own centre sits 7.5 */
            const band = rowheight * 1.6;
            strip.style.height = band + "px";
            strip.style.top = (padtop + (claimedat + 0.5) * rowheight - at
                - band / 2 - rowheight * 0.1) + "px";
        }
    }
}

/* three rings of stars turning behind the pillars. only the top of each
   ring clears the screen, so you see about four sliding along an arch. the
   stars counter-rotate so they never tip over. */
const rings = [
    {y: 0.94, r: 0.60, n: 15, size: 0.115, secs: 150},
    {y: 1.22, r: 0.55, n: 14, size: 0.1, secs: 122},
    {y: 1.48, r: 0.50, n: 13, size: 0.085, secs: 98}
];

function buildrings() {
    const host = document.querySelector(".bigstars");
    if (!host) return;
    rings.forEach(function(spec, index) {
        const clip = document.createElement("div");
        clip.className = "ringclip";
        clip.style.top = "calc(var(--u) * " + spec.y + ")";
        clip.style.width = "calc(var(--u) * " + (spec.r * 2 + spec.size) + ")";
        clip.style.height = "calc(var(--u) * " + (spec.r * 2 + spec.size) + ")";
        const ring = document.createElement("div");
        ring.className = "ring";
        ring.style.animationDuration = spec.secs + "s";
        if (index % 2) ring.style.animationDirection = "reverse";
        for (let i = 0; i < spec.n; i++) {
            const angle = (i / spec.n) * Math.PI * 2;
            const star = document.createElement("img");
            star.src = "assets/images/star.png";
            star.alt = "";
            star.style.left = "calc(var(--u) * " + (Math.sin(angle) * spec.r).toFixed(4) + ")";
            star.style.top = "calc(var(--u) * " + (-Math.cos(angle) * spec.r).toFixed(4) + ")";
            star.style.width = "calc(var(--u) * " + spec.size + ")";
            star.style.transform = "translate(-50%, -50%) rotate("
                + (angle * 180 / Math.PI).toFixed(1) + "deg)";
            ring.appendChild(star);
        }
        clip.appendChild(ring);
        host.appendChild(clip);
    });
}

/*//////////////////////////////////////////////////////////////////////*/

/* blippo has no glyph for these, and the game shows a question mark
   wherever a name uses something it cannot draw. */
const drawable = new Set(
    "!\"#$%&'()*+,-.0123456789:;=?@ABCDEFGHIJKLMNOPQRSTUVWXYZ[]{} ".split("")
);

const namecap = 15;
function tidyname(text) {
    let out = text.replace(/%%/g, "%").replace(/%(?= )/g, "");
    out = out.replace(/%([0-9a-f]{2})/gi, function(whole, hex) {
        const code = parseInt(hex, 16);
        return code >= 32 ? String.fromCharCode(code) : whole;
    });
    return out;
}

function drawname(text) {
    text = tidyname(text);
    const clean = text.toUpperCase().split("").map(function(c) {
        return drawable.has(c) ? c : "?";
    }).join("");
    return clean.length > namecap ? clean.slice(0, namecap) + " ..." : clean;
}

/*//////////////////////////////////////////////////////////////////////*/

/* the list is flung rather than scrolled: drag or wheel adds velocity and
   friction bleeds it off. dragging past either end meets rising resistance
   and springs back once let go. */
const overreach = 0.35; const springback = 0.16; const rub = 0.955;

function makefling(host, list) {
    let at = 0; let velocity = 0; let dragging = false;
    let lastY = 0; let lastTime = 0; let running = false;

    function limit() {return Math.max(0, contentheight() - host.clientHeight)}
    function place() {paintrows(at, host)}
    function past() {
        if (at < 0) return at;
        if (at > limit()) return at - limit();
        return 0;
    }

    function step() {
        const out = past();
        if (dragging) {
            place();
            requestAnimationFrame(step);
            return;
        }
        if (out !== 0) {
            at -= out * springback;
            velocity = 0;
            if (Math.abs(out) < 0.4) {at = out < 0 ? 0 : limit()}
        } else {
            at += velocity;
            velocity *= rub;
            if (Math.abs(velocity) < 0.05) velocity = 0;
        }
        place();
        if (velocity === 0 && past() === 0) {running = false; return}
        requestAnimationFrame(step);
    }
    function kick() {if (!running) {running = true; requestAnimationFrame(step)}}

    host.addEventListener("wheel", function(e) {
        e.preventDefault();
        velocity += e.deltaY * 0.22;
        kick();
    }, {passive: false});

    host.addEventListener("pointerdown", function(e) {
        dragging = true; velocity = 0;
        lastY = e.clientY; lastTime = e.timeStamp;
        host.setPointerCapture(e.pointerId);
        host.classList.add("dragging");
        kick();
    });
    host.addEventListener("pointermove", function(e) {
        if (!dragging) return;
        const moved = e.clientY - lastY;
        const gap = Math.max(1, e.timeStamp - lastTime);
        /* outside the ends the list only follows part of the drag */
        at -= past() === 0 ? moved : moved * overreach;
        velocity = -moved / gap * 16;
        lastY = e.clientY; lastTime = e.timeStamp;
    });
    function letgo() {
        if (!dragging) return;
        dragging = false;
        host.classList.remove("dragging");
        kick();
    }
    host.addEventListener("pointerup", letgo);
    host.addEventListener("pointercancel", letgo);
    host.addEventListener("lostpointercapture", letgo);

    return {
        at: function() {return at},
        jump: function(to) {
            at = Math.max(0, Math.min(limit(), to));
            velocity = 0;
            place();
        }
    };
}

/*//////////////////////////////////////////////////////////////////////*/

/* the sample board is a tab separated dump straight from the worker:
   country, name, score, guid. */
const countrynames = {
    "--": "Unknown", "AD": "Andorra", "AE": "United Arab Emirates", "AF": "Afghanistan",
    "AG": "Antigua and Barbuda", "AL": "Albania", "AM": "Armenia", "AO": "Angola", "AR": "Argentina",
    "AT": "Austria", "AU": "Australia", "AZ": "Azerbaijan", "BA": "Bosnia and Herzegovina",
    "BB": "Barbados", "BD": "Bangladesh", "BE": "Belgium", "BG": "Bulgaria", "BH": "Bahrain",
    "BN": "Brunei", "BO": "Bolivia", "BR": "Brazil", "BS": "Bahamas", "BY": "Belarus",
    "BZ": "Belize", "CA": "Canada", "CH": "Switzerland", "CI": "Ivory Coast", "CL": "Chile",
    "CM": "Cameroon", "CN": "China", "CO": "Colombia", "CR": "Costa Rica", "CU": "Cuba",
    "CY": "Cyprus", "CZ": "Czechia", "DE": "Germany", "DK": "Denmark", "DO": "Dominican Republic",
    "DZ": "Algeria", "EC": "Ecuador", "EE": "Estonia", "EG": "Egypt", "ES": "Spain", "ET": "Ethiopia",
    "FI": "Finland", "FJ": "Fiji", "FR": "France", "GB": "United Kingdom", "GE": "Georgia",
    "GH": "Ghana", "GR": "Greece", "GT": "Guatemala", "HK": "Hong Kong", "HN": "Honduras",
    "HR": "Croatia", "HU": "Hungary", "ID": "Indonesia", "IE": "Ireland", "IL": "Israel",
    "IN": "India", "IQ": "Iraq", "IR": "Iran", "IS": "Iceland", "IT": "Italy", "JM": "Jamaica",
    "JO": "Jordan", "JP": "Japan", "KE": "Kenya", "KG": "Kyrgyzstan", "KH": "Cambodia",
    "KR": "South Korea", "KW": "Kuwait", "KZ": "Kazakhstan", "LB": "Lebanon", "LK": "Sri Lanka",
    "LT": "Lithuania", "LU": "Luxembourg", "LV": "Latvia", "LY": "Libya", "MA": "Morocco",
    "MD": "Moldova", "ME": "Montenegro", "MK": "North Macedonia", "MM": "Myanmar", "MN": "Mongolia",
    "MO": "Macau", "MT": "Malta", "MU": "Mauritius", "MV": "Maldives", "MX": "Mexico",
    "MY": "Malaysia", "MZ": "Mozambique", "NA": "Namibia", "NG": "Nigeria", "NI": "Nicaragua",
    "NL": "Netherlands", "NO": "Norway", "NP": "Nepal", "NZ": "New Zealand", "OM": "Oman",
    "PA": "Panama", "PE": "Peru", "PH": "Philippines", "PK": "Pakistan", "PL": "Poland",
    "PR": "Puerto Rico", "PS": "Palestine", "PT": "Portugal", "PY": "Paraguay", "QA": "Qatar",
    "RO": "Romania", "RS": "Serbia", "RU": "Russia", "SA": "Saudi Arabia", "SE": "Sweden",
    "SG": "Singapore", "SI": "Slovenia", "SK": "Slovakia", "SV": "El Salvador", "SY": "Syria",
    "TH": "Thailand", "TN": "Tunisia", "TR": "Turkey", "TT": "Trinidad and Tobago", "TW": "Taiwan",
    "TZ": "Tanzania", "UA": "Ukraine", "UG": "Uganda", "US": "United States", "UY": "Uruguay",
    "UZ": "Uzbekistan", "VE": "Venezuela", "VN": "Vietnam", "YE": "Yemen", "ZA": "South Africa",
    "ZM": "Zambia", "ZW": "Zimbabwe"
};

const sampleboard = "assets/data/dailydo-sample.txt";
const knownflags = new Set(("AD AE AF AG AI AL AM AN AO AR AS AT AU AW AX AZ BA BB BD BE BF " +
    "BG BH BI BJ BM BN BO BR BS BT BV BW BY BZ CA CC CD CF CG CH CI CK CL CM CN CO CR CS CU " +
    "CV CX CY CZ DE DJ DK DM DO DZ EC EE EG EH ER ES ET FI FJ FK FM FO FR GA GB GD GE GF GG " +
    "GH GI GL GM GN GP GQ GR GS GT GU GW GY HK HM HN HR HT HU ID IE IL IM IN IO IQ IR IS IT " +
    "JE JM JO JP KE KG KH KI KM KN KP KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD " +
    "ME MG MH MK ML MM MN MO MP MQ MR MS MT MU MV MW MX MY MZ NA NC NE NF NG NI NL NO NP NR " +
    "NU NZ OM PA PE PF PG PH PK PL PM PN PR PS PT PW PY QA RE RO RS RU RW SA SB SC SD SE SG " +
    "SH SI SJ SK SL SM SN SO SR ST SV SY SZ TC TD TF TG TH TJ TK TL TM TN TO TR TT TV TW TZ " +
    "UA UG UM US UY UZ VA VC VE VG VI VN VU WF WS YE YT ZA ZM ZW").split(" "));

function readboard(text) {
    const out = [];
    for (const line of text.split(String.fromCharCode(10))) {
        const bits = line.split(String.fromCharCode(9));
        if (bits.length < 3) continue;
        const clean = tidyname(bits[1]);
        out.push({
            cc: knownflags.has(bits[0]) ? bits[0] : "--",
            country: bits[0],
            name: drawname(bits[1]),
            full: clean,
            raw: bits[1],
            score: bits[2],
            id: bits[3] || ""
        });
    }
    return out;
}

/* the three boards the worker exposes: prefix 11, prefix 12 and snap. */
const boards = [
    {key: "main", label: "Daily-Do"},
    {key: "snap", label: "Snap", badge: "assets/images/snap2.webp"},
    {key: "chuzzle", label: "Older"}
];
const boardhost = "https://dailydo.coolsite.cv";
let boardat = 0;

function todaykey() {
    const pad = function(n) {return String(n).padStart(2, "0")};
    const d = new Date();
    return d.getFullYear() + "-" + pad(d.getDate()) + "-" + pad(d.getMonth() + 1);
}

async function loadboard() {
    const spot = boards[boardat];
    let text = "";
    try {
        const reply = await fetch(boardhost + "/" + spot.key + "/" + todaykey());
        if (reply.ok) text = await reply.text();
    } catch (e) {}
    if (!text || text.indexOf(String.fromCharCode(9)) < 0) {
        /* offline, or opened straight off disk: fall back to the saved day */
        try {
            const reply = await fetch(sampleboard);
            if (reply.ok) text = await reply.text();
        } catch (e) {}
    }
    board = text ? readboard(text) : [];
    return board.length;
}

/* take the colour the list would use at the switcher's own height, so the
   two arrows sit in the same sweep the rows do. */
function tintswitcher() {
    const stage = document.querySelector(".dailydo");
    const height = stage.clientHeight * cyclerspan;
    const last = cyclerstops.length - 1;
    document.querySelectorAll(".switcher button").forEach(function(seat) {
        const box = seat.getBoundingClientRect();
        const middle = box.top + box.height / 2;
        const t = middle / height * last;
        seat.style.color = cyclerget(Math.max(0, Math.min(last - 0.001, t)));
    });
}

function drawswitcher() {
    const prev = boards[(boardat + boards.length - 1) % boards.length];
    const next = boards[(boardat + 1) % boards.length];
    [[".swleft", prev], [".swright", next]].forEach(function(pair) {
        const seat = document.querySelector(pair[0]);
        const spot = pair[1];
        seat.querySelector(".lbl").textContent = spot.label;
        const line = seat.querySelector(".line");
        let badge = line.querySelector("img.badge");
        if (spot.badge) {
            if (!badge) {
                badge = document.createElement("img");
                badge.className = "badge";
                badge.alt = "";
                line.insertBefore(badge, line.querySelector(".lbl"));
            }
            badge.src = spot.badge;
        } else if (badge) {
            badge.remove();
        }
    });
    tintswitcher();
}

async function switchboard(step) {
    boardat = (boardat + step + boards.length) % boards.length;
    drawswitcher();
    const held = document.querySelector(".scores");
    held.style.opacity = "0.4";
    const count = await loadboard();
    measurelist(host, list);
    claimedat = findclaimed();
    paintrows(0, host);
    jumptoclaimed();
    openlinkedplayer();
    held.style.opacity = "";
    document.title = boards[boardat].label + " (" + count + ")";
}

function makeidtip() {
    const tip = document.querySelector(".idtip");
    const host = document.querySelector(".scroller");
    if (!tip || !host) return;
    function drop() {tip.classList.remove("on")}
    host.addEventListener("pointermove", function(e) {
        const cell = e.target;
        const row = cell.parentElement;
        if (cell.tagName !== "IMG" || !row || !row.dataset.at
            || host.classList.contains("dragging")) {
            drop();
            return;
        }
        const entry = board[row.dataset.at];
        tip.textContent = countrynames[entry.country] || entry.country;
        tip.style.left = (e.clientX + 14) + "px";
        tip.style.top = (e.clientY + 16) + "px";
        tip.classList.add("on");
    });
    host.addEventListener("pointerleave", drop);
    host.addEventListener("wheel", drop, {passive: true});
    host.addEventListener("pointerdown", drop);
    window.addEventListener("blur", drop);
    document.querySelector(".scores").addEventListener("scrolled", drop);
}

function readclaim() {
    try {return JSON.parse(localStorage.getItem("chuzzleclaim") || "null")} catch (e) {}
    return null;
}

/* guid first: a player can rename and still be the same person. */
function findclaimed() {
    const held = readclaim();
    if (!held || !board.length) return -1;
    if (held.guid) {
        const byid = board.findIndex(function(e) {return e.id === held.guid});
        if (byid >= 0) return byid;
    }
    if (held.name) {
        return board.findIndex(function(e) {return e.full === held.name});
    }
    return -1;
}

function jumptoclaimed() {
    const seat = findclaimed();
    claimedat = seat;
    if (seat < 0) return;
    const host = document.querySelector(".scroller");
    fling.jump(padtop + (seat + 0.5) * rowheight - host.clientHeight / 2);
}

/* ?player=<id> lands straight on that row with the popup up. */
function openlinkedplayer() {
    const want = new URL(location.href).searchParams.get("player");
    if (!want) return;
    const seat = board.findIndex(function(e) {return e.id === want});
    if (seat < 0) return;
    const host = document.querySelector(".scroller");
    fling.jump(padtop + (seat + 0.5) * rowheight - host.clientHeight / 2);
    const row = pool.find(function(r) {return r.dataset.at === String(seat)});
    if (row) row.querySelector("name").dispatchEvent(
        new PointerEvent("pointerdown", {bubbles: true, clientY: 0}));
    if (row) row.querySelector("name").dispatchEvent(
        new PointerEvent("pointerup", {bubbles: true, clientY: 0}));
}

/* jump to the first row whose name or id starts with what was typed. */
function makefinder() {
    const box = document.querySelector(".findbox input");
    const hits = document.querySelector(".findbox .hits");
    if (!box) return;
    box.addEventListener("input", function() {
        const want = box.value.trim().toUpperCase();
        if (!want) {hits.textContent = ""; return}
        const seat = board.findIndex(function(e) {
            return e.full.indexOf(want) === 0 || e.id.indexOf(want) === 0;
        });
        if (seat < 0) {hits.textContent = "none"; return}
        hits.textContent = "#" + (seat + 1);
        const host = document.querySelector(".scroller");
        fling.jump(padtop + (seat + 0.5) * rowheight - host.clientHeight / 2);
    });
}

/* clicking a row opens everything known about that player, untrimmed. */
function makeprofile() {
    const wrap = document.querySelector("[data-role=profile]");
    const body = wrap.querySelector(".pucontent > div");
    const host = document.querySelector(".scroller");
    let downat = 0; let downrow = null;

    host.addEventListener("pointerdown", function(e) {
        downat = e.clientY;
        downrow = e.target.tagName === "NAME" && e.target.closest
            ? e.target.closest("[data-at]") : null;
    }, true);
    host.addEventListener("pointerup", function(e) {
        const row = downrow;
        downrow = null;
        if (!row || Math.abs(e.clientY - downat) > 6) return;
        const entry = board[row.dataset.at];
        if (!entry) return;
        const flag = "<img src=\"assets/images/flags/" + entry.cc + ".png\" alt=\"\">";
        const country = countrynames[entry.country] || entry.country;
        const facts = [
            ["Nickname", entry.full],
            ["Country", flag + country],
            ["Player ID", entry.id || "unknown"],
            null,
            ["Today's Rank", "#" + (Number(row.dataset.at) + 1)],
            ["Today's Score", Number(entry.score).toLocaleString("en")]
        ];
        const held = readclaim();
        const mine = held && held.guid && held.guid === entry.id;
        body.innerHTML = '<div class="facts">' + facts.map(function(f) {
            if (!f) return '<span class="gap"></span>';
            return "<i>" + f[0] + "</i><u>" + f[1] + "</u>";
        }).join("") + "</div><button class=\"claim\" type=\"button\">"
            + (mine ? "Forget me" : "This is me") + "</button>";
        body.querySelector(".claim").onclick = function() {
            try {
                if (mine) {localStorage.removeItem("chuzzleclaim")}
                else {
                    localStorage.setItem("chuzzleclaim",
                        JSON.stringify({guid: entry.id, name: entry.full}));
                }
            } catch (e) {}
            closepopup(wrap);
            claimedat = findclaimed();
            paintedat = null; filled = -1;
            paintrows(0, document.querySelector(".scroller"));
            jumptoclaimed();
        };
        if (entry.id) {
            const url = new URL(location.href);
            url.searchParams.set("player", entry.id);
            history.replaceState(null, "", url);
        }
        openpopup(wrap);
    });
    wrap.addEventListener("click", function(e) {
        if (e.target === wrap) closepopup(wrap);
    });
}

/*//////////////////////////////////////////////////////////////////////*/

/* the game only walks back to yesterday. the server keeps today plus the
   thirteen days behind it: day-13 still answers, day-14 comes back empty. */
const calendarreach = 13;

function daykey(date) {
    const pad = function(n) {return String(n).padStart(2, "0")};
    return date.getFullYear() + "-" + pad(date.getDate()) + "-" + pad(date.getMonth() + 1);
}

function buildcalendar() {
    const grid = document.querySelector(".calgrid");
    if (!grid) return;
    const names = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"];
    const day = 86400000;
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    /* six weeks around today, starting on the sunday that lands furthest
       back, so both ends of the reachable window show as dimmed. */
    const start = new Date(today.getTime() - (calendarreach + 7) * day);
    /* weeks run monday first, so sunday has to fall to the end */
    start.setDate(start.getDate() - ((start.getDay() + 6) % 7));
    const oldest = today.getTime() - calendarreach * day;
    const newest = today.getTime() + day;

    for (const n of names) {
        const head = document.createElement("span");
        head.textContent = n;
        grid.appendChild(head);
    }
    for (let i = 0; i < 42; i++) {
        const at = new Date(start.getTime() + i * day);
        const cell = document.createElement("button");
        cell.textContent = at.getDate();
        cell.title = daykey(at);
        if (at.getTime() >= oldest && at.getTime() <= newest) {
            cell.className = "live" + (at.getTime() === today.getTime() ? " today" : "");
            cell.dataset.day = daykey(at);
        }
        grid.appendChild(cell);
    }
}

/*//////////////////////////////////////////////////////////////////////*/

makeprofile();
makefinder();
buildrings();
buildcalendar();
makeidtip();
const fling = makefling(document.querySelector(".scroller"), document.querySelector(".scores"));


const host = document.querySelector(".scroller");
const list = document.querySelector(".scores");

drawswitcher();
document.querySelector(".swleft").addEventListener("click", function() {switchboard(-1)});
document.querySelector(".swright").addEventListener("click", function() {switchboard(1)});

loadboard().then(function(count) {
    measurelist(host, list);
    claimedat = findclaimed();
    paintrows(0, host);
    jumptoclaimed();
    openlinkedplayer();
    if (count) document.title = boards[boardat].label + " (" + count + ")";
});
window.addEventListener("resize", function() {
    const keep = fling.at();
    measurelist(host, list);
    paintedat = null;
    fling.jump(keep);
    tintswitcher();
});

const popupwait = 250;

function openpopup(wrap) {
    wrap.classList.remove("closing");
    wrap.classList.add("open");
    trimpending(wrap);
    clearTimeout(wrap.settletimer);
    wrap.settletimer = setTimeout(function() {wrap.classList.add("settled")}, popupwait);
}

function closepopup(wrap) {
    if (!wrap.classList.contains("open")) return;
    clearTimeout(wrap.settletimer);
    wrap.classList.remove("settled");
    wrap.classList.add("closing");
    wrap.settletimer = setTimeout(function () {
        wrap.classList.remove("open");
        wrap.classList.remove("closing");
    }, popupwait);
    if (wrap.dataset.role === "profile") {
        const url = new URL(location.href);
        url.searchParams.delete("player");
        history.replaceState(null, "", url);
    }
}

document.querySelectorAll(".closebtn").forEach(function (seat) {
    seat.addEventListener("click", function () {
        closepopup(seat.closest(".calwrap"));
    });
});

const calwrap = document.querySelector("[data-role=calendar]");
document.querySelector(".calbutton").addEventListener("click", function() {
    if (calwrap.classList.contains("open")) {closepopup(calwrap)}
    else {openpopup(calwrap)}
});
calwrap.addEventListener("click", function(e) {
    if (e.target === calwrap) closepopup(calwrap);
});
window.addEventListener("keydown", function(e) {
    if (e.key !== "Escape") return;
    document.querySelectorAll(".calwrap.open").forEach(closepopup);
});

document.addEventListener("click", function(e) {
    if (e.target.tagName === "BUTTON") {
        new Audio("../assets/audio/click.ogg").play();
    }
});
