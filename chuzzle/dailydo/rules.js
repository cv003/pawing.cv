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

// port of RaptRandom (55-slot additive/lagged-fibonacci ring, mod 2^30),
// reversed from RaptRandom::Seed/Get at 0x00588fe8/0x00589060
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
        if (n === 0) return 0;
        const mask = 0x3fffffff;
        let p = 2;
        while (p < n) p *= 2;
        const sum = (this.ring[this.k] + this.ring[this.j]) & mask;
        const val = (p - 1) & (sum >>> 6);
        this.ring[this.j] = sum;
        this.j = (this.j === 54) ? 0 : this.j + 1;
        this.k = (this.k === 54) ? 0 : this.k + 1;
        return val % n;
    }
}

// App::MonthlySeed(0): year+month squashed into one int, shared all
// month - App::DailySeed(0): year+month+day, shared for one calendar day
function monthlyseed(year, month) {
    return parseInt(String(year) + String(month).padStart(2, "0"));
}
function dailyseed(year, month, day) {
    return parseInt(String(year) + String(month).padStart(2, "0") + String(day).padStart(2, "0"));
}

/*//////////////////////////////////////////////////////////////////////*/

// the weighted bag SetRules draws gametype ids from, and the anti-repeat
// rule layered on top - ids 2/3 reject a repeat of the immediately
// previous pool slot, ids 0/1/4 reject a repeat of either of the previous
// two. verified violation-free simulating every month 2019-2027
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

// the modifier/bonus/difficulty candidate deck SetRules builds before
// shuffling and drawing from it, in the game's exact push order. gates
// read off today's gametype id (0-4). id27's "%s CHUZZLES will %s scores"
// template consumes two rolls of its own (colour, multiplier word) right
// where it's pushed, same as the real code
function builddeck(gametype, rng, extra) {
    const deck = [];
    const push = function(id, times) {for (let i = 0; i < (times || 1); i++) deck.push(id)};

    if (gametype !== 4) push(5);

    const picked = [6];
    const comboroll = rng.get(2); // always drawn, even when discarded below
    if (comboroll === 1 && gametype !== 3) picked.push(18);
    picked.push(23);
    picked.push(19);
    push(picked[rng.get(picked.length)]);

    push(17);
    push(13);
    if (gametype !== 4) push(10);
    push(12);
    push(14);
    push(9);
    push(8);
    push(11);
    if (gametype === 3) push(7);
    push(20);
    if (gametype === 0 || gametype === 1) push(24);

    // colour index only confirmed for 0 ("Red") - the rest of the
    // 6-entry name array wasn't recovered, so this is a plausible
    // best-effort guess at the other five, not a decompiled fact
    extra.colour = ["Red", "Orange", "Yellow", "Green", "Blue", "Purple"][rng.get(6)];
    extra.multiplier = ["double", "triple"][rng.get(2)];
    push(27);

    push(25, (gametype === 0 || gametype === 1) ? 3 : 2);
    push(26);
    push(21);
    push(22);
    push(28);
    push(29);
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

// draws off the shuffled deck's front, skipping anything already picked
// (the deck deliberately has duplicate ids for draw-weight, not to
// actually select a rule twice) plus the one documented IsRuleOK special
// case - id23 needs id19 or id10 already active when gametype is 0/1
function drawrules(deck, target, gametype) {
    const selected = []; let idx = 0;
    while (selected.length < target && idx < deck.length) {
        const id = deck[idx++];
        let ok = !selected.includes(id);
        if (ok && id === 23 && (gametype === 0 || gametype === 1)) {
            ok = selected.includes(19) || selected.includes(10);
        }
        if (ok) selected.push(id);
    }
    if (gametype === 3) {
        if (selected.includes(7) && !selected.includes(13) && !selected.includes(12)) {
            selected.splice(selected.indexOf(7), 1);
        }
        if (selected.includes(7) && selected.includes(6)) {
            selected.splice(selected.indexOf(rng.get(10) < 5 ? 7 : 6), 1);
        }
        while (selected.length < target && idx < deck.length) {
            const id = deck[idx++];
            if (!selected.includes(id)) selected.push(id);
        }
    }
    return selected;
}

// bonus odds depend on how many modifier rules landed: 3 rules means no
// bonus, 1 rule always grants one, 2 rules is a coinflip-ish reroll -
// lockbreaker (id1) is then excluded on chuzzle-in-ten and alongside the
// chain-no-bonus rule, both by rerolling
function drawbonus(rng, target, gametype, selectedrules) {
    let granted;
    if (target === 3) granted = false;
    else if (target === 1) granted = true;
    else granted = rng.get(rng.get(2) + 2) === 1;
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

    const rng = new RaptRandom();
    rng.seed(dailyseed(year, month, day));
    const extra = {};
    const deck = shuffledeck(builddeck(gametype, rng, extra), rng);
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
function itemrow(icon, alt, text) {
    return "<div class=\"rulesitem\">" + iconimg(icon, alt) + "<span>" + text + "</span></div>";
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
        html += "<div class=\"rulesdifficulty\">Difficulty: <span style=\"color:rgb("
            + today.difficulty.color.split(",").map(function(n) {return Math.round(n * 255)}).join(",")
            + ")\">" + today.difficulty.name + "</span></div>";
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
function updateruleslayout() {
    const uibox = document.querySelector(".ui").getBoundingClientRect();
    document.body.classList.toggle("showaside", uibox.left >= asideneeds);
}

rulesready.then(paintrulescontent);
window.addEventListener("resize", updateruleslayout);
updateruleslayout();

const ruleswrap = document.querySelector("[data-role=rules]");
document.querySelector(".rulesbutton").addEventListener("click", function() {
    if (ruleswrap.classList.contains("open")) {closepopup(ruleswrap)}
    else {openpopup(ruleswrap)}
});
