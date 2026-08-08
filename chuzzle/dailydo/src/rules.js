let rules = null;
const rulesready = fetch("assets/static/rules.jsonc").then(function(reply) {
    return reply.ok ? reply.text() : "";
}).then(function(text) {
    const stripped = text.replace(/^\s*\/\/.*$/gm, "");
    rules = stripped.trim() ? JSON.parse(stripped) : null;
}).catch(function() {});

/*//////////////////////////////////////////////////////////////////////*/

class RaptRandom {
    constructor() {
        this.ring = new Array(55).fill(0); this.j = 0; this.k = 31;
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
    get(n) {
        if (n <= 0) return 0;
        const mask = 0x3fffffff;
        const sum = (this.ring[this.k] + this.ring[this.j]) & mask;
        this.ring[this.j] = sum;
        this.j = (this.j === 54) ? 0 : this.j + 1;
        this.k = (this.k === 54) ? 0 : this.k + 1;
        return Math.floor(((sum >>> 6) & 0xffffff) * n / 0x1000000);
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
function buildgametypepool(seed, golden) {
    const rng = new RaptRandom();
    rng.seed(seed);
    const pool = [];
    for (let slot = 0; slot < 35; slot++) {
        let id;
        do {
            id = gametypebag[rng.get(gametypebag.length)];
            if (golden && (id | 1) === 3) {
                id = -1;
            } else if (slot !== 0 && (id | 1) === 3) {
                if (id === pool[slot - 1]) id = -1;
            } else if (slot > 1 && id < 5 && ((1 << id) & 0x13) !== 0) {
                if (id === pool[slot - 1] && id === pool[slot - 2]) id = -1;
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
    if ((gametype === 0 || gametype === 1) && day % 3 === 1) push(19);

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

// csscolor lives in src/global.js now, the news markup wants the same parser

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

const previewdays = 6;
function upcominghtml(date) {
    const rows = [];
    for (let i = 1; i <= previewdays; i++) {
        const at = new Date(date.getFullYear(), date.getMonth(), date.getDate() + i);
        const out = computerulesfordate(at);
        const gt = rules.gametype[out.gametype];
        if (!gt) continue;
        const label = at.toLocaleDateString("en", {weekday: "short", month: "short", day: "numeric"});
        rows.push("<div class=\"previewrow\">" + iconimg(gt.icon, gt.name)
            + "<span><b class=\"previewdate\">" + escapehtml(label) + "</b>"
            + "<b class=\"previewgametype\" style=\"color:" + csscolor(gt.color) + "\">"
            + escapehtml(gt.name) + "</b></span></div>");
    }
    return rows.join("");
}

function glossaryhtml() {
    let html = "<div class=\"glossaryhead\">Gametypes</div>";
    html += rules.gametype.map(function(gt) {return itemrow(gt.icon, gt.name, gt.text)}).join("");
    html += "<div class=\"glossaryhead\">Rules</div>";
    html += rules.rules.map(function(entry) {
        const text = entry.id === 20 ? entry.text.replace("%s", "a colour").replace("%s", "double/triple")
            : entry.text;
        return itemrow(entry.icon, "", text);
    }).join("");
    html += "<div class=\"glossaryhead\">Bonuses</div>";
    html += rules.bonus.map(function(bonus) {return itemrow(bonus.icon, bonus.name, bonus.text)}).join("");
    return html;
}

function paintextras() {
    if (!rules) return;
    document.querySelectorAll(".upcomingcontent").forEach(function(seat) {
        seat.innerHTML = upcominghtml(typeof dayback === "function" ? dayback(0) : new Date());
        seat.scrollTop = 0;
    });
    document.querySelectorAll(".glossarycontent").forEach(function(seat) {
        seat.innerHTML = glossaryhtml();
        seat.scrollTop = 0;
    });
}

const ruleswrap = document.querySelector("[data-role=rules]");
const upcomingwrap = document.querySelector("[data-role=upcoming]");
const glossarywrap = document.querySelector("[data-role=glossary]");
function openextra(wrap) {
    function launch() {
        openpopup(wrap);
        const content = wrap.querySelector(".upcomingcontent, .glossarycontent");
        if (content) content.scrollTop = 0;
    }
    if (ruleswrap.classList.contains("open")) {
        closepopup(ruleswrap);
        setTimeout(launch, popupwait);
    } else {
        launch();
    }
}
document.addEventListener("click", function(e) {
    if (e.target.closest(".upcominglink")) openextra(upcomingwrap);
    if (e.target.closest(".glossarylink")) openextra(glossarywrap);
});

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
    html += "<div class=\"rulesextrarow\">"
        + "<button type=\"button\" class=\"upcominglink\">Upcoming</button>"
        + "<button type=\"button\" class=\"glossarylink\">Glossary</button>"
        + "</div>";
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
    paintextras();
}

/*//////////////////////////////////////////////////////////////////////*/

const asideneeds = 300;
const rulesbutton = document.querySelector(".rulesbutton");
function updateruleslayout() {
    const wasaside = document.body.classList.contains("showaside");
    const uibox = document.querySelector(".ui").getBoundingClientRect();
    const isaside = uibox.left >= asideneeds;
    document.body.classList.toggle("showaside", isaside);
    if (isaside && !wasaside) {
        [ruleswrap, upcomingwrap, glossarywrap].forEach(function(wrap) {
            if (wrap.classList.contains("open")) closepopup(wrap);
        });
    }

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

document.querySelector(".rulesbutton").addEventListener("click", function() {
    if (ruleswrap.classList.contains("open")) {closepopup(ruleswrap)}
    else {openpopup(ruleswrap)}
});