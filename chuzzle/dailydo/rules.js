// today's rules panel. desktop tucks it beside the phone frame with no
// dim/popup treatment; when there isn't room (narrow window or mobile),
// it falls back to a floating button that opens the same content in the
// standard calwrap popup treatment used by calendar/profile/qr
//
// fully deterministic and shared by every player on the same calendar
// day: Game::GoDailyDo reseeds gRandom with DailySeed(0) (today as
// YYYYMMDD) right before SetRules runs, so every RaptRandom::Get call in
// there - gametype, modifiers, bonus, difficulty - draws off the same
// per-day stream. see rules.jsonc's header for the gametype half; the
// rest is reverse engineered below

let rules = null;
const rulesready = fetch("assets/static/rules.jsonc").then(function(reply) {
    return reply.ok ? reply.text() : "";
}).then(function(text) {
    const stripped = text.replace(/^\s*\/\/.*$/gm, "");
    rules = stripped.trim() ? JSON.parse(stripped) : null;
}).catch(function() {});

/*//////////////////////////////////////////////////////////////////////*/

// port of RaptRandom (55-slot additive/lagged-fibonacci ring, mod 2^30).
// the whole persistent mismatch turned out to be a game-version gap, not
// a porting bug: the live app is on 2.70, and re-decompiling that build
// (chuzzle/datainfo/decomp/ghidra_270/) shows RaptRandom::Get was split
// into GetNew and GetLegacy at some point - Seed and the ring recurrence
// are unchanged, but SetRules calls GetNew, which maps the ring sum to
// [0,n) with a multiply-shift ((frac * n) >> 24) instead of the old
// power-of-2-mask-and-modulo GetLegacy still does. every prior "confirmed
// correct" claim about Seed/the ring itself still holds - only this one
// formula needed to change
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

// year + month squished into one integer, shared all
// month - year + month + day, shared for one calendar day
function monthlyseed(year, month) {
    return parseInt(String(year) + String(month).padStart(2, "0"));
}
// real parameter order is hour,min,sec,MONTH,DAY,YEAR,weekday,
// daily do's seeds follow that order, not calendar order, so this is year + day + month, not year + month + day
function dailyseed(year, month, day) {
    return parseInt(String(year) + String(day).padStart(2, "0") + String(month).padStart(2, "0"));
}

/*//////////////////////////////////////////////////////////////////////*/

// the weighted bag SetRules draws gametype ids from, and the anti-repeat
// rule layered on top - ids 2/3 reject a repeat of the immediately
// previous pool slot, ids 0/1/4 reject a repeat of either of the previous
// two. cross-checked against 3 of 4 real screenshots (2026-07-28,
// 2026-08-02, 2026-08-04); 2026-08-05 still doesn't match, open question
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

// each deck rule's conflict bitmask (its object's +0x40 field) - IsRuleOK
// rejects a candidate if it shares any bit with an already-selected
// rule's mask, which also naturally rejects re-drawing the same id (every
// id conflicts with itself) except the three zero-mask ids (17,22,24),
// which is moot since none of those are ever pushed more than once.
// 2.70 added a new 0x40000 category bit (on rules 5, 19, and the new 31)
// and two new rules (30, 31) not present in the build this was first
// reverse engineered against
const RULEMASKS = {
    5: 0x40001, 6: 0x0010, 7: 0x1000, 8: 0x0010, 9: 0x0300, 10: 0x0c80,
    12: 0x0020, 13: 0x0040, 14: 0x2c00, 17: 0x0000, 18: 0x4000, 19: 0x43000,
    20: 0x0300, 21: 0x0010, 22: 0x0000, 23: 0x8000, 24: 0x0000, 25: 0xc000,
    26: 0x4000, 27: 0x4000, 28: 0x10000, 29: 0x10000, 30: 0x20000, 31: 0x42001,
};
// gametype 2 and 3 each silently carry an inherent, textless rule (15 and
// 16) that's active from the moment the gametype is picked - their masks
// still block conflicting deck picks even though the rules themselves
// never appear as their own line
const GAMETYPE_INHERENT_MASK = {2: 0x0400, 3: 0x0800};

// the modifier/bonus/difficulty candidate deck SetRules builds before
// shuffling and drawing from it, in the game's exact push order. gates
// read off today's gametype id (0-4) and, for rules 19/31, the day of
// the month. id20's "%s CHUZZLES will %s scores" template consumes two
// rolls of its own (colour, multiplier word) right where it's pushed,
// same as the real code. ids here are the REAL ids (each rule object's
// own +0x38 field, confirmed via HasRule/IsRuleOK) - this file used to
// number rules by eye-matching icon art to text, which was wrong for
// most of them; see rules.jsonc's header. rules 30/31 and rule 19's day
// gate are new in 2.70 and weren't part of the build this was originally
// reverse engineered against
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

    // traced from gChuzzleColors's own RGB literals, index-aligned with
    // this array - not a guess anymore
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

// PointerList::Shuffle's own algorithm: full-range draw per slot,
// rerolled if it lands on itself, then swapped in - not textbook
// Fisher-Yates (which only draws from the remaining range)
function shuffledeck(deck, rng) {
    const n = deck.length;
    for (let i = 0; i < n; i++) {
        let draw;
        do {draw = rng.get(n)} while (draw === i);
        const t = deck[i]; deck[i] = deck[draw]; deck[draw] = t;
    }
    return deck;
}

// how many modifier rules today gets: 1/12 chance of 3, else an 11/240
// chance of 1, else 2 - drawn once, consumed regardless of which branch
function drawtarget(rng) {
    if (rng.get(12) === 1) return 3;
    return rng.get(20) === 1 ? 1 : 2;
}

// draws off the shuffled deck's front, rejecting a candidate whenever its
// conflict mask shares a bit with anything already selected (this is
// IsRuleOK's real check, a bitmask test, not a plain duplicate-id
// lookup - it happens to reject re-drawing the same id too, since every
// nonzero-mask id conflicts with itself) plus the one extra clause id22
// carries: it needs id19 or id10 already active, but only on gametype 0/1
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

// bonus odds depend on how many modifier rules landed: 3 rules means no
// bonus, 1 rule always grants one, 2 rules is a coinflip-ish reroll off a
// roll that's ALWAYS drawn first regardless of target (easy to miss,
// since it's only ever USED on the target==2 path) - lockbreaker (id1)
// is then excluded on chuzzle-in-ten and alongside the stinky rule (id19),
// both by rerolling
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

function computetodaysrules() {
    const now = new Date();
    const year = now.getFullYear(), month = now.getMonth() + 1, day = now.getDate();

    const pool = buildgametypepool(monthlyseed(year, month));
    const gametype = pool[day];

    // Game::GoDailyDo reseeds gRandom to dailySeed a second time
    // immediately before calling SetRules (confirmed in the 2.70 trace) -
    // whatever board-generation draws happened earlier are wiped by that
    // reseed, so SetRules genuinely starts reading from a clean point.
    // an earlier version of this function simulated the whole board
    // scramble here to "catch up" the stream, which was solving a
    // problem the live game doesn't actually have
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

// gametype.color and <color ...> tags are either a css keyword ("gold",
// "cyan"...) or a raw 0-1 float rgb triplet straight from the game's own
// data ("0,1,0") - the latter needs scaling up to 0-255 before css takes it
function csscolor(raw) {
    if (!/^[\d.]+,[\d.]+,[\d.]+$/.test(raw)) return raw;
    const [r, g, b] = raw.split(",").map(function(n) {return Math.round(n * 255)});
    return "rgb(" + r + "," + g + "," + b + ")";
}

// the game's own inline markup: <_tc> is the default readable colour,
// <blinky>/<_stinky> switch to an emphasis colour until the next tag
// resets it, <color X> sets a literal colour the same way - these are
// state-switches, not a nested/closing-tag syntax
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
    if (entry.id !== 27) return entry.text;
    return entry.text.replace("%s", extra.colour).replace("%s", extra.multiplier);
}

function rulescontenthtml() {
    if (!rules) return "";
    const today = computetodaysrules();
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

function paintrulescontent() {
    const html = rulescontenthtml();
    if (!html) return;
    document.querySelectorAll(".rulescontent").forEach(function(seat) {seat.innerHTML = html});
}

/*//////////////////////////////////////////////////////////////////////*/

// enough side space beside the phone frame for the inline aside to fit
// without crowding it - measured against the live layout rather than a
// fixed breakpoint, since --u itself is capped by viewport height too
const asideneeds = 300;
const rulesbutton = document.querySelector(".rulesbutton");
function updateruleslayout() {
    const uibox = document.querySelector(".ui").getBoundingClientRect();
    document.body.classList.toggle("showaside", uibox.left >= asideneeds);

    // parked directly above the play/redo button - .todaybutton lives
    // inside .ui's cqw-based layout, which this button (a plain fixed
    // element outside .ui) can't reach with CSS alone
    const play = document.querySelector(".todaybutton").getBoundingClientRect();
    const size = rulesbutton.getBoundingClientRect().height;
    rulesbutton.style.left = (play.left + play.width / 2 - size / 2) + "px";
    rulesbutton.style.top = (play.top - size - 8) + "px";
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
