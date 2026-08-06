// today's rules panel. desktop tucks it beside the phone frame with no
// dim/popup treatment; on narrow/mobile it falls back to a floating
// button opening the same content in the standard calwrap popup used by
// calendar/profile/qr. fully deterministic and shared by every player:
// Game::GoDailyDo reseeds gRandom with DailySeed(0) right before
// SetRules runs, so every roll below draws off the same per-day stream

let rules = null;
const rulesready = fetch("assets/static/rules.jsonc").then(function(reply) {
    return reply.ok ? reply.text() : "";
}).then(function(text) {
    const stripped = text.replace(/^\s*\/\/.*$/gm, "");
    rules = stripped.trim() ? JSON.parse(stripped) : null;
}).catch(function() {});

/*//////////////////////////////////////////////////////////////////////*/

// RaptRandom: 55-slot additive/lagged-fibonacci ring, mod 2^30. get()
// mirrors RaptRandom::GetNew (2.70+) - a multiply-shift map to [0,n),
// not the older GetLegacy's power-of-2-mask-and-modulo
class RaptRandom {
    constructor() {this.ring = new Array(55).fill(0); this.j = 0; this.k = 31}
    seed(s) {
        const mask = 0x3fffffff;
        s = s & mask;
        this.ring[0] = s; this.ring[1] = 1; this.j = 0; this.k = 31;
        let carry = (s + 1) & mask;
        this.ring[2] = carry;
        for (let i = 0; i < 52; i++) {
            carry = (this.ring[1 + i] + carry) & mask;
            this.ring[3 + i] = carry;
        }
    }
    get(n) {
        if (n <= 0) return 0;
        const mask = 0x3fffffff;
        const sum = (this.ring[this.k] + this.ring[this.j]) & mask;
        this.ring[this.j] = sum;
        this.j = (this.j === 54) ? 0 : this.j + 1;
        this.k = (this.k === 54) ? 0 : this.k + 1;
        const frac = (sum >>> 6) & 0xffffff;
        return Math.floor(frac * n / 0x1000000);
    }
}

// year+month, shared all month - year+day+month (not calendar order,
// matches OS_Core::GetTime's own param order), shared for one day
function monthlyseed(year, month) {
    return parseInt(String(year) + String(month).padStart(2, "0"));
}
function dailyseed(year, month, day) {
    return parseInt(String(year) + String(day).padStart(2, "0") + String(month).padStart(2, "0"));
}

/*//////////////////////////////////////////////////////////////////////*/

// weighted bag SetRules draws the day's gametype from, plus anti-repeat:
// ids 2/3 reject a repeat of the previous slot, ids 0/1/4 reject a
// repeat of both of the previous two
const gametypebag = [0, 0, 0, 1, 1, 2, 3, 3, 4, 4];
function buildgametypepool(seed) {
    const rng = new RaptRandom();
    rng.seed(seed);
    const pool = [];
    for (let slot = 0; slot < 35; slot++) {
        let id;
        do {
            id = gametypebag[rng.get(gametypebag.length)];
            if (slot !== 0 && (id | 1) === 3) {
                if (id === pool[slot - 1]) id = -1;
            } else if (slot > 1 && id < 5 && ((1 << id) & 0x13) !== 0) {
                if (id === pool[slot - 1] || id === pool[slot - 2]) id = -1;
            }
        } while (id === -1);
        pool.push(id);
    }
    return pool;
}

/*//////////////////////////////////////////////////////////////////////*/

// each rule's conflict bitmask (its object's +0x40 field) - IsRuleOK
// rejects a candidate sharing any bit with an already-selected rule,
// which also rejects re-drawing the same id (every nonzero mask
// conflicts with itself)
const RULEMASKS = {
    5: 0x40001, 6: 0x0010, 7: 0x1000, 8: 0x0010, 9: 0x0300, 10: 0x0c80,
    12: 0x0020, 13: 0x0040, 14: 0x2c00, 17: 0x0000, 18: 0x4000, 19: 0x43000,
    20: 0x0300, 21: 0x0010, 22: 0x0000, 23: 0x8000, 24: 0x0000, 25: 0xc000,
    26: 0x4000, 27: 0x4000, 28: 0x10000, 29: 0x10000, 30: 0x20000, 31: 0x42001,
};
// gametype 2/3 each carry a silent, textless rule (15/16) active from
// the moment the gametype is picked - masks still apply
const GAMETYPE_INHERENT_MASK = {2: 0x0400, 3: 0x0800};

// the candidate deck SetRules builds before shuffling, in push order.
// ids are the real ids (each rule object's own +0x38 field) - see
// rules.jsonc's header for how those were confirmed
function builddeck(gametype, day, rng, extra) {
    const deck = [];
    const push = function(id, times) {for (let i = 0; i < (times || 1); i++) deck.push(id)};

    if (gametype !== 4) push(5);

    const picked = [6];
    const comboroll = rng.get(2); // always drawn, even when discarded below
    if (comboroll === 1 && gametype !== 3) picked.push(21);
    picked.push(22);
    picked.push(24);
    push(picked[rng.get(picked.length)]);

    push(7);
    push(8);
    if (gametype !== 4) push(10);
    push(12);
    push(13);
    push(9);
    push(14);
    push(11);
    if (gametype === 3) push(17);
    push(18);
    if ((gametype === 0 || gametype === 1) && day % 3 === 1) push(19);

    // colour order traced from gChuzzleColors's own RGB literals
    extra.colour = ["Red", "Green", "Blue", "Orange", "Yellow", "Purple"][rng.get(6)];
    extra.multiplier = ["double", "triple"][rng.get(2)];
    push(20);

    push(23, (gametype === 0 || gametype === 1) ? 3 : 2);
    push(25);
    push(26);
    push(27);
    push(28);
    push(29);
    if (gametype !== 2) push(30);
    if (day % 3 === 0) push(31);
    return deck;
}

// PointerList::Shuffle: full-range draw per slot, rerolled if it lands
// on itself, then swapped in - not textbook Fisher-Yates
function shuffledeck(deck, rng) {
    const n = deck.length;
    for (let i = 0; i < n; i++) {
        let draw;
        do {draw = rng.get(n)} while (draw === i);
        const t = deck[i]; deck[i] = deck[draw]; deck[draw] = t;
    }
    return deck;
}

// modifier count: 1/12 chance of 3, else 11/240 chance of 1, else 2
function drawtarget(rng) {
    if (rng.get(12) === 1) return 3;
    return rng.get(20) === 1 ? 1 : 2;
}

// draws off the shuffled deck, rejecting on mask conflict (IsRuleOK)
// plus id22's extra clause: needs id19 or id10 already active, gametype
// 0/1 only
function drawrules(deck, target, gametype) {
    const selected = []; let idx = 0;
    let usedmask = GAMETYPE_INHERENT_MASK[gametype] || 0;
    function tryadd(id) {
        let ok = (RULEMASKS[id] & usedmask) === 0;
        if (ok && id === 22 && (gametype === 0 || gametype === 1)) {
            ok = selected.includes(19) || selected.includes(10);
        }
        if (ok) {selected.push(id); usedmask |= RULEMASKS[id]}
        return ok;
    }
    function remove(id) {
        selected.splice(selected.indexOf(id), 1);
        usedmask = selected.reduce(function(m, sid) {return m | RULEMASKS[sid]}, GAMETYPE_INHERENT_MASK[gametype] || 0);
    }
    while (selected.length < target && idx < deck.length) tryadd(deck[idx++]);
    if (gametype === 3) {
        if (selected.includes(7) && !selected.includes(13) && !selected.includes(12)) remove(7);
        if (selected.includes(7) && selected.includes(6)) remove(rng.get(10) < 5 ? 7 : 6);
        while (selected.length < target && idx < deck.length) tryadd(deck[idx++]);
    }
    return selected;
}

// bonus odds depend on modifier count: 3 = none, 1 = always, 2 = reroll
// gamble off a roll that's always drawn first regardless of target.
// lockbreaker (id1) excluded on chuzzle-in-ten and alongside stinky (id19)
function drawbonus(rng, target, gametype, selectedrules) {
    const pre = rng.get(2);
    let granted;
    if (target === 3) granted = false;
    else if (target === 1) granted = true;
    else granted = rng.get(pre + 2) === 1;
    if (!granted) return null;
    let id;
    do {
        id = rng.get(4);
    } while (id === 1 && (gametype === 3 || selectedrules.includes(19)));
    return id;
}

// chuzzle in ten skips the difficulty roll entirely
function drawdifficulty(rng, gametype) {
    if (gametype === 3) return null;
    const roll = rng.get(5);
    if (roll <= 2) return {name: "Easiest!", color: "0,1,0"};
    if (roll === 3) return {name: "Medium!", color: "1,1,0"};
    return {name: "Hard!", color: "1,0,0"};
}

// generalized off "today" so the panel can also show a scrolled-to day's
// rules (see paintrulescontent) - only handles the "normal" daily-do track,
// see chuzzle/datainfo/net/report_rulevariants_270.md for why golden
// tournament isn't modeled here yet
function computerulesfordate(date) {
    const year = date.getFullYear(), month = date.getMonth() + 1, day = date.getDate();

    const pool = buildgametypepool(monthlyseed(year, month));
    const gametype = pool[day];

    const rng = new RaptRandom();
    rng.seed(dailyseed(year, month, day));
    const extra = {};
    const deck = shuffledeck(builddeck(gametype, day, rng, extra), rng);
    const target = drawtarget(rng);
    const ruleids = drawrules(deck, target, gametype);
    const bonusid = drawbonus(rng, target, gametype, ruleids);
    const difficulty = drawdifficulty(rng, gametype);

    return {gametype, ruleids, bonusid, difficulty, extra};
}

/*//////////////////////////////////////////////////////////////////////*/

function iconimg(path, alt) {
    return "<img src=\"assets/images/ruleicons/" + path + ".png\" alt=\"" + alt + "\">";
}

function escapehtml(s) {
    return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// gametype.color and <color ...> are either a css keyword or a raw 0-1
// float rgb triplet from the game's own data, which needs scaling to 0-255
function csscolor(raw) {
    if (!/^[\d.]+,[\d.]+,[\d.]+$/.test(raw)) return raw;
    const [r, g, b] = raw.split(",").map(function(n) {return Math.round(n * 255)});
    return "rgb(" + r + "," + g + "," + b + ")";
}

// the game's inline markup: <_tc> is the default colour, <blinky>/
// <_stinky>/<color X> switch to an emphasis colour until the next tag -
// state switches, not nested/closing tags
function markuptext(raw) {
    const re = /<_tc>|<blinky>|<_stinky>|<color ([^>]+)>/g;
    let mode = {type: "tc"}, last = 0, html = "", m;
    function flush(text) {
        if (!text) return;
        if (mode.type === "tc") {html += escapehtml(text); return}
        const attr = mode.type === "color"
            ? " style=\"color:" + csscolor(mode.value) + "\"" : " class=\"" + mode.type + "\"";
        html += "<span" + attr + ">" + escapehtml(text) + "</span>";
    }
    while ((m = re.exec(raw))) {
        flush(raw.slice(last, m.index));
        last = re.lastIndex;
        mode = m[0] === "<_tc>" ? {type: "tc"} : m[0] === "<blinky>" ? {type: "blinky"}
            : m[0] === "<_stinky>" ? {type: "stinky"} : {type: "color", value: m[1]};
    }
    flush(raw.slice(last));
    return html;
}

function itemrow(icon, alt, text) {
    return "<div class=\"rulesitem\">" + iconimg(icon, alt) + "<span>" + markuptext(text) + "</span></div>";
}

function ruletext(entry, extra) {
    if (entry.id !== 20) return entry.text;
    return entry.text.replace("%s", extra.colour).replace("%s", extra.multiplier);
}

function rulescontenthtml(date) {
    if (!rules) return "";
    const today = computerulesfordate(date);
    const gt = rules.gametype[today.gametype];
    if (!gt) return "";

    let html = itemrow(gt.icon, gt.name, gt.text);
    if (today.ruleids.length) html += "<div class=\"rulesdivider\"></div>";
    html += today.ruleids.map(function(id) {
        const entry = rules.rules.find(function(r) {return r.id === id});
        return entry ? itemrow(entry.icon, "", ruletext(entry, today.extra)) : "";
    }).join("");
    if (today.bonusid !== null) {
        const bonus = rules.bonus[today.bonusid];
        html += itemrow(bonus.icon, bonus.name, bonus.text);
    }
    if (today.difficulty) {
        html += "<div class=\"rulesdifficulty\">Difficulty: <span style=\"color:"
            + csscolor(today.difficulty.color) + "\">" + today.difficulty.name + "</span></div>";
    }
    return html;
}

// back: days before today, matching ui.js's dayat/dayback - falls back to
// dayat itself (the leaderboard's currently viewed day) when omitted, so
// scrolling the scores also scrolls the rules panel to match
function rulestitlefor(back) {
    if (back === 0) return "Today's Rules!";
    if (back === 1) return "Yesterday's Rules!";
    return (typeof daylabel === "function" ? daylabel(back) : "") + " Rules!";
}

function paintrulescontent(back) {
    if (back === undefined) back = typeof dayat !== "undefined" ? dayat : 0;
    const date = typeof dayback === "function" ? dayback(back) : new Date();
    const html = rulescontenthtml(date);
    if (!html) return;
    document.querySelectorAll(".rulescontent").forEach(function(seat) {seat.innerHTML = html});
    const title = rulestitlefor(back);
    document.querySelectorAll(".rulestitle").forEach(function(el) {el.textContent = title});
}

/*//////////////////////////////////////////////////////////////////////*/

// enough side space beside the phone frame for the aside to fit without
// crowding it - measured live since --u is capped by viewport height too
const asideneeds = 300;
const rulesbutton = document.querySelector(".rulesbutton");
function updateruleslayout() {
    const uibox = document.querySelector(".ui").getBoundingClientRect();
    document.body.classList.toggle("showaside", uibox.left >= asideneeds);

    // parked above the play/redo button - .todaybutton lives inside .ui's
    // cqw layout, unreachable from here with CSS alone
    const play = document.querySelector(".todaybutton").getBoundingClientRect();
    const size = rulesbutton.getBoundingClientRect().height;
    rulesbutton.style.left = (play.left + play.width / 2 - size / 2) + "px";
    rulesbutton.style.top = (play.top - size - 8) + "px";
    // .todaybutton isn't laid out yet on the very first call (still 0x0 at
    // parse time) - reveal only once we have a real rect, instead of
    // flashing the button at its garbage top-left position for a frame
    if (play.width > 0) rulesbutton.classList.add("positioned");
}

rulesready.then(paintrulescontent);
window.addEventListener("resize", updateruleslayout);
window.addEventListener("load", updateruleslayout);
updateruleslayout();

const ruleswrap = document.querySelector("[data-role=rules]");
document.querySelector(".rulesbutton").addEventListener("click", function() {
    if (ruleswrap.classList.contains("open")) {closepopup(ruleswrap)}
    else {openpopup(ruleswrap)}
});
