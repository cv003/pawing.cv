let rules = null;
const rulesready = fetch("assets/static/rules.jsonc").then(function(reply) {
    return reply.ok ? reply.text() : "";
}).then(function(text) {
    const stripped = text.replace(/^\s*\/\/.*$/gm, "");
    rules = stripped.trim() ? JSON.parse(stripped) : null;
}).catch(function() {});

/*//////////////////////////////////////////////////////////////////////*/

// legacy: true picks RaptRandom::GetLegacy (pre-2.70 - power-of-2 mask then
// a true modulo, which has the classic modulo-bias problem for non-power-
// of-2 n) instead of GetNew (2.70+ - multiply-shift, no bias). both share
// the same ring/seed - only the draw math differs
class RaptRandom {
    constructor(legacy) {
        this.ring = new Array(55).fill(0); this.j = 0; this.k = 31;
        this.legacy = !!legacy;
    }
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
    // advances the ring and returns the raw 24-bit fraction shared by both
    // get() variants below
    draw() {
        const mask = 0x3fffffff;
        const sum = (this.ring[this.k] + this.ring[this.j]) & mask;
        this.ring[this.j] = sum;
        this.j = (this.j === 54) ? 0 : this.j + 1;
        this.k = (this.k === 54) ? 0 : this.k + 1;
        return (sum >>> 6) & 0xffffff;
    }
    get(n) {
        return this.legacy ? this.getlegacy(n) : this.getnew(n);
    }
    getnew(n) {
        if (n <= 0) return 0;
        return Math.floor(this.draw() * n / 0x1000000);
    }
    getlegacy(n) {
        if (n === 0) return 0;
        const frac = this.draw();
        // smallest power of two >= n, matching the decompile's own
        // do/while doubling loop exactly (not just 1 << ceil(log2(n)))
        let b = 2, a;
        do {a = b; b = a << 1} while (a < n);
        const masked = frac & (a - 1);
        return masked % n;
    }
}

function monthlyseed(year, month) {
    return parseInt(String(year) + String(month).padStart(2, "0"));
}
function dailyseed(year, month, day) {
    return parseInt(String(year) + String(day).padStart(2, "0") + String(month).padStart(2, "0"));
}

/*//////////////////////////////////////////////////////////////////////*/

const gametypebag = [0, 0, 0, 1, 1, 2, 3, 3, 4, 4];
function buildgametypepool(seed, legacy) {
    const rng = new RaptRandom(legacy);
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

const rulemasks = {
    5: 0x40001, 6: 0x0010, 7: 0x1000, 8: 0x0010, 9: 0x0300, 10: 0x0c80,
    12: 0x0020, 13: 0x0040, 14: 0x2c00, 17: 0x0000, 18: 0x4000, 19: 0x43000,
    20: 0x0300, 21: 0x0010, 22: 0x0000, 23: 0x8000, 24: 0x0000, 25: 0xc000,
    26: 0x4000, 27: 0x4000, 28: 0x10000, 29: 0x10000, 30: 0x20000, 31: 0x42001,
};
const gametypeinhmask = {2: 0x0400, 3: 0x0800};

function builddeck(gametype, day, rng, extra) {
    const deck = [];
    const push = function(id, times) {for (let i = 0; i < (times || 1); i++) deck.push(id)};

    if (gametype !== 4) push(5);

    const picked = [6];
    const comboroll = rng.get(2);
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
    // pre-2.70 (rng.legacy), rule 19 has no day-of-month gate at all - that
    // condition was added in 2.70 alongside rules 30/31 below, which don't
    // exist pre-2.70 and never get pushed onto the deck in legacy mode
    if ((gametype === 0 || gametype === 1) && (rng.legacy || day % 3 === 1)) push(19);

    extra.colour = ["Red", "Green", "Blue", "Orange", "Yellow", "Purple"][rng.get(6)];
    extra.multiplier = ["double", "triple"][rng.get(2)];
    push(20);

    push(23, (gametype === 0 || gametype === 1) ? 3 : 2);
    push(25);
    push(26);
    push(27);
    push(28);
    push(29);
    if (!rng.legacy) {
        if (gametype !== 2) push(30);
        if (day % 3 === 0) push(31);
    }
    return deck;
}

function shuffledeck(deck, rng) {
    const n = deck.length;
    for (let i = 0; i < n; i++) {
        let draw;
        do {draw = rng.get(n)} while (draw === i);
        const t = deck[i]; deck[i] = deck[draw]; deck[draw] = t;
    }
    return deck;
}

function drawtarget(rng) {
    if (rng.get(12) === 1) return 3;
    return rng.get(20) === 1 ? 1 : 2;
}

function drawrules(deck, target, gametype) {
    const selected = []; let idx = 0;
    let usedmask = gametypeinhmask[gametype] || 0;
    function tryadd(id) {
        let ok = (rulemasks[id] & usedmask) === 0;
        if (ok && id === 22 && (gametype === 0 || gametype === 1)) {
            ok = selected.includes(19) || selected.includes(10);
        }
        if (ok) {selected.push(id); usedmask |= rulemasks[id]}
        return ok;
    }
    function remove(id) {
        selected.splice(selected.indexOf(id), 1);
        usedmask = selected.reduce(function(m, sid) {return m | rulemasks[sid]}, gametypeinhmask[gametype] || 0);
    }
    while (selected.length < target && idx < deck.length) tryadd(deck[idx++]);
    if (gametype === 3) {
        if (selected.includes(7) && !selected.includes(13) && !selected.includes(12)) remove(7);
        if (selected.includes(7) && selected.includes(6)) remove(rng.get(10) < 5 ? 7 : 6);
        while (selected.length < target && idx < deck.length) tryadd(deck[idx++]);
    }
    return selected;
}

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

function drawdifficulty(rng, gametype) {
    if (gametype === 3) return null;
    const roll = rng.get(5);
    if (roll <= 2) return {name: "Easiest!", color: "0,1,0"};
    if (roll === 3) return {name: "Medium!", color: "1,1,0"};
    return {name: "Hard!", color: "1,0,0"};
}

function computerulesfordate(date, legacy) {
    const year = date.getFullYear(), month = date.getMonth() + 1, day = date.getDate();

    const pool = buildgametypepool(monthlyseed(year, month), legacy);
    const gametype = pool[day];

    const rng = new RaptRandom(legacy);
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

function csscolor(raw) {
    if (/^gr[ae]y$/i.test(raw)) return "#e8e8f0";
    if (!/^[\d.]+,[\d.]+,[\d.]+$/.test(raw)) return raw;
    const [r, g, b] = raw.split(",").map(function(n) {return Math.round(n * 255)});
    return "rgb(" + r + "," + g + "," + b + ")";
}

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
// persisted so a visitor whose app isn't on the beta track doesn't have to
// re-pick "normal" every visit - see report_rulevariants_270.md for what
// this does and doesn't cover (RNG formula + rules 19/30/31, not the
// second gRandom reseed, which is a no-op for a from-scratch reimplementation either way)
let legacymode = localStorage.getItem("chuzzlerulesmode") === "legacy";
function togglerulesmode() {
    legacymode = !legacymode;
    try {localStorage.setItem("chuzzlerulesmode", legacymode ? "legacy" : "new")} catch (e) {}
    paintrulescontent();
}
document.addEventListener("click", function(e) {
    if (e.target.closest(".rulesmode")) togglerulesmode();
});

function rulescontenthtml(date) {
    if (!rules) return "";
    const today = computerulesfordate(date, legacymode);
    const gt = rules.gametype[today.gametype];
    if (!gt) return "";

    let html = "<button type=\"button\" class=\"rulesmode\">"
        + (legacymode ? "Normal (2.69)" : "Beta (2.70)") + "</button>";
    html += itemrow(gt.icon, gt.name, gt.text);
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

    document.querySelectorAll(".rulescontent").forEach(function(seat) {
        if (!seat.closest(".ghost")) seat.innerHTML = html;
    });

    const title = rulestitlefor(back);
    document.querySelectorAll(".rulestitle").forEach(function(el) {
        if (!el.closest(".ghost")) el.textContent = title;
    });
}

/*//////////////////////////////////////////////////////////////////////*/

const asideneeds = 300;
const rulesbutton = document.querySelector(".rulesbutton");
function updateruleslayout() {
    const uibox = document.querySelector(".ui").getBoundingClientRect();
    document.body.classList.toggle("showaside", uibox.left >= asideneeds);

    const play = document.querySelector(".todaybutton").getBoundingClientRect();
    const size = rulesbutton.getBoundingClientRect().height;

    rulesbutton.style.left = (play.left + play.width / 2 - size / 2) + "px";
    rulesbutton.style.top = (play.top - size - 8) + "px";
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