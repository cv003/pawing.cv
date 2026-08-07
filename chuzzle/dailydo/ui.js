let countries = {};
const countriesready = fetch("assets/static/countries.json").then(function(reply) {
    return reply.ok ? reply.json() : {};
}).then(function(got) {countries = got}).catch(function() {});

function countryname(cc) {return countries[cc] || ""}
function hasflag(cc) {return cc !== "--" && cc in countries}

/*//////////////////////////////////////////////////////////////////////*/

const joincrossings = [
    ["2018-12-18",       0], // launch
    ["2019-01-26",  145348], // ~100k  ~2019-03-07
    ["2019-03-27",  726738], // ~500k  ~2019-03-07 - 2019-04-17
    ["2019-04-20", 1453477], // ~1m    ~04-17 - 04-24
    ["2021-12-11", 7267384], // ~5m    ~10-27-2021 - 01-26-2022
];
const joindecaystart = joincrossings[joincrossings.length - 1];
const joindecayrate = 1878.86;
const joindecayk = 0.0007997261626550334; // Gulp

function estimatejoin(id) {
    const guid = Number(id);
    if (!guid || guid <= 0) return null;
    const [startkey, startguid] = joindecaystart;
    const start = new Date(startkey);
    const day = 86400000;

    if (guid >= startguid) {
        const frac = (guid - startguid) * joindecayk / joindecayrate;
        if (frac >= 1) return null;
        const days = -Math.log(1 - frac) / joindecayk;
        const at = new Date(start.getTime() + days * day);
        return at > new Date() ? null : {at: at, spread: 30};
    }
    for (let i = 0; i < joincrossings.length - 1; i++) {
        const [d0key, g0] = joincrossings[i];
        const [d1key, g1] = joincrossings[i + 1];
        if (guid < g0 || guid > g1) continue;
        const d0 = new Date(d0key), d1 = new Date(d1key);
        const frac = g0 === 0 ? guid / g1 : Math.log(guid / g0) / Math.log(g1 / g0);
        const at = new Date(d0.getTime() + frac * (d1.getTime() - d0.getTime()));
        const spread = i === joincrossings.length - 2 ? 320 : 20;
        return {at: at, spread: spread};
    }
    return null;
}
function joinlabel(id) {
    const got = estimatejoin(id);
    if (!got) return null;
    const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const tight = got.spread <= 45;
    return "~" + (tight ? months[got.at.getMonth()] + " " : "") + got.at.getFullYear();
}

/*//////////////////////////////////////////////////////////////////////*/

function readboard(text) {
    const out = [];
    for (const line of text.split(String.fromCharCode(10))) {
        const bits = line.split(String.fromCharCode(9));
        if (bits.length < 3) continue;
        const clean = tidyname(bits[1]);
        out.push({
            cc: hasflag(bits[0]) ? bits[0] : "--",
            country: bits[0],
            name: drawname(bits[1]),
            full: clean,
            hunt: clean.toUpperCase(),
            rank: out.length + 1,
            raw: bits[1],
            score: bits[2],
            id: bits[3] || ""
        });
    }
    return out;
}

const boards = [
    {key: "main", label: "Daily-Do", title: "Today's Scores"},
    {key: "gold", label: "Golden", title: "Tournament", weekly: true},
    {key: "snap", label: "Snap", title: "Snap Scores", badge: "assets/images/snap2.webp"},
    {key: "chuzzle", label: "Legacy", title: "Legacy Scores"}
];
const boardhost = "https://chuzzle.coolsite.cv/dailydo";
let boardat = 0;
let dayat = 0;

function dayback(back) {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - back);
    return d;
}

function daylabel(back) {
    const d = dayback(back);
    const pad = function(n) {return String(n).padStart(2, "0")};
    return pad(d.getDate()) + "/" + pad(d.getMonth() + 1);
}

function boardtitle() {
    if (boards[boardat].weekly || dayat === 0) return boards[boardat].title;
    if (dayat === 1) return "Yesterday's Scores";
    return daylabel(dayat) + " Scores";
}

// due to large amount of players this might store about ~100kb, should be fine
const boardstore = "chuzzleboards";
const boardage = 60000;

function cachekey() {return boards[boardat].key + "/" + daykey(dayback(dayat))}

function readstore() {
    try {return JSON.parse(localStorage.getItem(boardstore) || "{}")} catch (e) {}
    return {};
}

function remember(key, text) {
    if (!text) return;
    const all = readstore();
    all[key] = {text: text, at: Date.now()};
    Object.keys(all).sort(function(a, b) {return all[b].at - all[a].at})
        .slice(6).forEach(function(k) {delete all[k]});
    try {localStorage.setItem(boardstore, JSON.stringify(all))} catch (e) {}
}

function tabbed(text) {
    return text.indexOf(String.fromCharCode(9)) < 0 ? "" : text;
}

async function fetchtext(key) {
    try {
        const reply = await fetch(boardhost + "/" + key);
        if (reply.ok) return tabbed(await reply.text());
    } catch (e) {}
    return "";
}

async function fetchdays(board, backs) {
    const days = backs.map(function(b) {return daykey(dayback(b))});
    const out = {};
    try {
        const reply = await fetch(boardhost + "/" + board + "/" + days.join(","));
        if (reply.ok) {
            const got = await reply.json();
            days.forEach(function(day) {out[day] = tabbed(got[day] || "")});
        }
    } catch (e) {}
    return out;
}

function useboard(text) {
    fullboard = text ? readboard(text) : [];
    board = fullboard;
    return board.length;
}

async function loadboard() {
    const key = cachekey();
    const held = readstore()[key];
    if (held && held.text && Date.now() - held.at < boardage) {
        prefetchdays();
        return useboard(held.text);
    }
    const board = boards[boardat].key;
    const wanted = neighbours();
    const got = await fetchdays(board, wanted);
    let mine = "";
    wanted.forEach(function(back) {
        const day = daykey(dayback(back));
        const text = got[day] || "";
        remember(board + "/" + day, text);
        if (back === dayat) mine = text;
    });
    return useboard(mine);
}

function neighbours() {
    const near = [dayat];
    [nextday(dayat, 1), nextday(dayat, -1)].forEach(function(back) {
        if (back >= 0 && near.indexOf(back) < 0) near.push(back);
    });
    return near;
}

function prefetchdays() {
    const board = boards[boardat].key;
    const want = neighbours().filter(function(back) {
        const held = readstore()[board + "/" + daykey(dayback(back))];
        return !held || !held.text || Date.now() - held.at >= boardage;
    });
    if (!want.length) return;
    fetchdays(board, want).then(function(got) {
        Object.keys(got).forEach(function(day) {remember(board + "/" + day, got[day])});
    });
}

async function refreshboard() {
    if (document.body.classList.contains("fetching")) return;
    const key = cachekey();
    const text = await fetchtext(key);
    if (key !== cachekey()) return;
    remember(key, text);
    const keep = fling.at();
    useboard(text);
    board = filtered(findwant());
    repaint(keep);
    if (typeof paintrulescontent === "function") paintrulescontent(dayat);
    showfooter();
}

/*//////////////////////////////////////////////////////////////////////*/

function tintswitcher() {
    const stage = document.querySelector(".dailydo");
    const height = stage.clientHeight * cyclerspan;
    const last = activestops.length - 1;
    document.querySelectorAll(".switcher button").forEach(function(seat) {
        const box = seat.getBoundingClientRect();
        const middle = box.top + box.height / 2;
        const t = middle / height * last;
        seat.style.color = cyclerget(Math.max(0, Math.min(last - 0.001, t)));
    });
}
function nextday(from, step) {
    const gold = !!boards[boardat].weekly;
    const far = Math.max(calendarreach, from);
    const near = Math.min(0, from);
    for (let at = from + step; at >= near && at <= far; at += step) {
        if (!gold || isgoldday(at)) return at;
    }
    return -1;
}

function drawsteppers() {
    [[".swleft", nextday(dayat, 1)], [".swright", nextday(dayat, -1)]]
        .forEach(function(pair) {
            const seat = document.querySelector(pair[0]);
            const back = pair[1];
            seat.classList.toggle("gone", back < 0);
            if (back >= 0) seat.querySelector(".lbl").textContent = daylabel(back);
        });
    tintswitcher();
}

/*//////////////////////////////////////////////////////////////////////*/

function buildpicks() {
    const rail = document.querySelector(".boardpick");
    if (!rail) return;
    boards.forEach(function(spot, index) {
        const seat = document.createElement("button");
        seat.type = "button";
        if (spot.badge) {
            const icon = document.createElement("img");
            icon.src = spot.badge; icon.alt = "";
            seat.appendChild(icon);
        }
        const label = document.createElement("span");
        label.className = "lbl";
        label.textContent = spot.label;
        seat.appendChild(label);
        seat.addEventListener("click", function() {pickboard(index)});
        rail.appendChild(seat);
    });
    drawpicks();
}

function isgoldday(back) {return dayback(back).getDay() === 0}

function paintscene() {
    const gold = !!boards[boardat].weekly;
    activestops = gold ? goldstops : cyclerstops;
    document.documentElement.classList.toggle("golden", gold);
}

function drawpicks() {
    paintscene();
    const gold = !!boards[boardat].weekly;
    document.querySelectorAll(".boardpick button").forEach(function(seat, index) {
        seat.classList.toggle("on", index === boardat);
        if (boards[index].weekly) {
            seat.classList.toggle("away", !isgoldday(dayat) && !gold);
        }
    });
    const grid = document.querySelector(".calgrid");
    if (grid) grid.classList.toggle("goldonly", gold);
    document.querySelectorAll(".calgrid button[data-back]").forEach(function(cell) {
        cell.classList.toggle("picked", Number(cell.dataset.back) === dayat);
    });
}

/*//////////////////////////////////////////////////////////////////////*/

const slidespan = 260; // ms
let includerulesslide = false;
function slidemovers() {
    const movers = [document.querySelector(".dailydo:not(.ghost)"),
        document.querySelector(".dumbcontainer:not(.ghost)")];
    if (includerulesslide) movers.push(document.querySelector(".rulesaside:not(.ghost)"));
    return movers;
}
function shove(seat, across) {
    const base = seat.classList.contains("dailydo") ? "translateX(-50%) " : "";
    seat.style.transform = across ? base + "translateX(" + across + "vw)" : "";
}

function snapshot() {
    return slidemovers().map(function(seat) {
        const copy = seat.cloneNode(true);
        copy.classList.add("ghost");
        seat.parentNode.insertBefore(copy, seat);
        return copy;
    });
}

function slideswap(dir, ghosts) {
    const movers = slidemovers();
    const all = movers.concat(ghosts);
    all.forEach(function(seat) {seat.classList.add("sliding", "jumping")});
    movers.forEach(function(seat) {shove(seat, dir * -100)});
    void document.body.offsetWidth;
    all.forEach(function(seat) {seat.classList.remove("jumping")});
    movers.forEach(function(seat) {shove(seat, 0)});
    ghosts.forEach(function(seat) {shove(seat, dir * 100)});
    setTimeout(function() {
        ghosts.forEach(function(seat) {seat.remove()});
        movers.forEach(function(seat) {seat.classList.remove("sliding")});
    }, slidespan);
}

/*//////////////////////////////////////////////////////////////////////*/

async function reload(dir, dayChanged) {
    document.body.classList.add("fetching");
    const count = await loadboard();
    document.body.classList.remove("fetching");
    includerulesslide = !!dayChanged;
    const ghosts = snapshot();
    if (dayChanged && typeof paintrulescontent === "function") paintrulescontent(dayat);
    drawsteppers();
    drawpicks();
    relabellogo(document.querySelector(".dumbcontainer:not(.ghost) .logo"), boardtitle());
    measurelist(host, list);
    board = filtered(findwant());
    claimedat = findclaimed();
    paintedat = null; filled = -1;
    paintrows(0, host);
    jumptoclaimed();
    openlinkedplayer();
    showfooter();
    slideswap(dir, ghosts);
    markurl();
    marktitle(count);
}

/*//////////////////////////////////////////////////////////////////////*/

function marktitle(count) {
    document.title = (dayat === calendarreach ? "Partial " : "")
        + boards[boardat].label + " for " + daylabel(dayat)
        + "! (" + count + ")";
}

function markurl() {
    const url = new URL(location.href);
    if (boardat > 0) {url.searchParams.set("board", boards[boardat].key)}
    else {url.searchParams.delete("board")}
    if (dayat !== 0) {url.searchParams.set("day", daykey(dayback(dayat)))}
    else {url.searchParams.delete("day")}
    history.replaceState(null, "", url);
}

function readurl() {
    const got = new URL(location.href).searchParams;
    const key = got.get("board");
    const at = boards.findIndex(function(spot) {return spot.key === key});
    if (at > 0) boardat = at;

    const want = (got.get("day") || "").replace(/-/g, "");
    if (/^\d{8}$/.test(want)) {
        const asked = new Date(Number(want.slice(0, 4)),
            Number(want.slice(6, 8)) - 1, Number(want.slice(4, 6)));
        const step = Math.round((dayback(0) - asked) / 86400000);
        if (asked.getDate() === Number(want.slice(4, 6)) && Math.abs(step) < 3700) {
            dayat = step;
        }
    }
    if (boards[boardat].weekly && !isgoldday(dayat)) {
        const near = nextday(dayat, 1);
        if (near >= 0) dayat = near;
    }
}

function switchday(step) {
    const want = nextday(dayat, step);
    if (want < 0) return;
    dayat = want;
    reload(step, true);
}
function pickday(back) {
    if (back === dayat || back < 0 || back > calendarreach) return;
    const dir = back > dayat ? 1 : -1;
    dayat = back;
    reload(dir, true);
}

const boardscrolls = {};
function pickboard(index) {
    if (index === boardat) return;
    boardscrolls[boards[boardat].key] = fling.at();
    const dir = index > boardat ? -1 : 1;
    boardat = index;
    reload(dir).then(function() {
        const saved = boardscrolls[boards[boardat].key];
        if (saved !== undefined) fling.jump(saved);
        else if (claimedat < 0) fling.jump(0);
        playsound("shuffle", 0.7);
    });
}

/*//////////////////////////////////////////////////////////////////////*/

function showfooter() {
    const played = claimedat >= 0 && board[claimedat]
        && Number(board[claimedat].score) > 0;
    const seat = document.querySelector(".todaybutton");
    if (!seat) return;
    seat.querySelector("img").src = played
        ? "assets/images/redo.png" : "assets/images/play.png";
    seat.title = played ? "Play Chuzzle 2 again" : "Play Chuzzle 2";
}

/*//////////////////////////////////////////////////////////////////////*/

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
        tip.textContent = countryname(entry.country) || entry.country;
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

/*//////////////////////////////////////////////////////////////////////*/

function readclaim() {
    try {return JSON.parse(localStorage.getItem("chuzzleclaim") || "null")} catch (e) {}
    return null;
}
function realid(id) {return !!id && id !== "0"}

// try guid first since it's possible that the person changed their nickname
function findclaimed() {
    const held = readclaim();
    if (!held || !board.length) return -1;
    if (realid(held.guid)) {
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

// ?player=[id] jumps to the player row if it exists in the set leaderboard
function openlinkedplayer() {
    const want = new URL(location.href).searchParams.get("player");
    if (!realid(want)) return;
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

/*//////////////////////////////////////////////////////////////////////*/

function filtered(want) {
    if (!want) return fullboard;
    return fullboard.filter(function(e) {
        return e.hunt.indexOf(want) >= 0 || e.id.indexOf(want) >= 0;
    });
}

function findwant() {
    const box = document.querySelector(".findbox input");
    return box ? box.value.trim().toUpperCase() : "";
}

function repaint(keepat) {
    measurelist(host, list);
    claimedat = findclaimed();
    paintedat = null; filled = -1;
    fling.jump(keepat);
}

function runfind(want) {
    const next = filtered(want);
    if (next.length === board.length && next[0] === board[0]) return;
    board = next;
    repaint(0);
}

function makefinder() {
    const box = document.querySelector(".findbox input");
    const clear = document.querySelector(".findbox .clearfind");
    if (!box) return;
    let pending = 0;
    const settle = function() {
        clearTimeout(pending);
        pending = setTimeout(function() {
            runfind(box.value.trim().toUpperCase());
        }, 90);
        document.querySelector(".findbox").classList.toggle("typed", box.value !== "");
    };
    box.addEventListener("input", settle);
    if (clear) {
        clear.addEventListener("click", function() {
            box.value = "";
            settle();
            box.focus();
        });
    }
}

/*//////////////////////////////////////////////////////////////////////*/

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
        playsound("click", 0.7);
        const flag = "<img src=\"assets/images/flags/" + entry.cc + ".png\" alt=\"\">";
        const country = countryname(entry.country) || entry.country;

        const noguid = !realid(entry.id);
        const joined = noguid ? null : joinlabel(entry.id);
        const facts = [
            ["Nickname", entry.full],
            ["Country", flag + country],
            ["Player ID", noguid ? "<b class=\"noid\">[invalid]</b>" : entry.id],
        ];
        if (joined) facts.push(["Joined about", joined]);
        facts.push(null,
            ["This day's Rank", "#" + entry.rank],
            ["This day's Score", Number(entry.score).toLocaleString("en")]);
        relabellogo(wrap.querySelector(".logo"),
            /^PLAYER\s*\d*$/.test(entry.full) ? "Guest Info" : "Player Info");
        const held = readclaim();
        const mine = held && held.guid && held.guid === entry.id;

        const button = !noguid && (mine || !held)
            ? "<button class=\"claim\" type=\"button\">"
                + (mine ? "Forget me" : "This is me") + "</button>"
            : "";
        body.innerHTML = '<div class="facts">' + facts.map(function(f) {
            if (!f) return '<span class="gap"></span>';
            return "<i>" + f[0] + "</i><u>" + f[1] + "</u>";
        }).join("") + "</div>" + button;

        if (button) body.querySelector(".claim").onclick = function() {
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
            showfooter();
        };
        if (!noguid) {
            const url = new URL(location.href);
            url.searchParams.set("player", entry.id);
            history.replaceState(null, "", url);
        }
        openpopup(wrap);
    });
}

/*//////////////////////////////////////////////////////////////////////*/

const calendarreach = 13;

function daykey(date) {
    const pad = function(n) {return String(n).padStart(2, "0")};
    return date.getFullYear() + "-" + pad(date.getDate()) + "-" + pad(date.getMonth() + 1);
}

// this would "usually" go from sunday, but, like, are you people insane?? sunday as first day of the week?? hell no!!!!!
function buildcalendar() {
    const grid = document.querySelector(".calgrid");
    if (!grid) return;
    const names = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"];
    const day = 86400000;
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const start = new Date(today.getTime() - (calendarreach + 7) * day);
    start.setDate(start.getDate() - ((start.getDay() + 6) % 7));
    const oldest = today.getTime() - calendarreach * day;
    const newest = today.getTime();

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
        const weekend = at.getDay() === 0;
        if (at.getTime() >= oldest && at.getTime() <= newest) {
            cell.className = "live" + (at.getTime() === today.getTime() ? " today" : "")
                + (weekend ? " weekend" : "");
            cell.dataset.day = daykey(at);
            const back = Math.round((today.getTime() - at.getTime()) / day);
            if (back >= 0 && back <= calendarreach) cell.dataset.back = back;
            if (back === calendarreach) cell.classList.add("thin");
        } else if (weekend) {
            cell.className = "weekend";
        }
        grid.appendChild(cell);
    }
    grid.addEventListener("click", function(e) {
        const cell = e.target.closest("button[data-back]");
        if (!cell) return;
        closepopup(document.querySelector("[data-role=calendar]"));
        pickday(Number(cell.dataset.back));
    });
}

/*//////////////////////////////////////////////////////////////////////*/

// ..function slop 😭
makeprofile();
makefinder();
buildrings();
buildcalendar();
makeidtip();

const fling = makefling(document.querySelector(".scroller"), document.querySelector(".scores"));
const host = document.querySelector(".scroller");
const list = document.querySelector(".scores");

readurl();
buildpicks();
drawsteppers();

document.querySelector(".swleft").addEventListener("click", function() {switchday(1)});
document.querySelector(".swright").addEventListener("click", function() {switchday(-1)});

const fontsdone = document.fonts && document.fonts.ready
    ? document.fonts.ready : Promise.resolve();

Promise.all([countriesready.then(loadboard), fontsdone]).then(function(got) {
    const count = got[0];
    paintscene();
    drawpicks();
    relabellogo(document.querySelector(".dumbcontainer .logo"), boardtitle());
    measurelist(host, list);
    claimedat = findclaimed();
    paintrows(0, host);
    jumptoclaimed();
    openlinkedplayer();
    showfooter();
    markurl();
    if (count) marktitle(count);
    setInterval(refreshboard, boardage);
});

document.addEventListener("visibilitychange", function() {
    if (document.hidden) return;
    const held = readstore()[cachekey()];
    if (!held || Date.now() - held.at >= boardage) refreshboard();
});
window.addEventListener("resize", function() {
    const keep = fling.at();
    measurelist(host, list);
    paintedat = null;
    fling.jump(keep);
    tintswitcher();
});

/*//////////////////////////////////////////////////////////////////////*/

// 100ms seems most accurate but idk
const popupwait = 100;
function openpopup(wrap) {
    wrap.classList.remove("closing");
    wrap.classList.add("open");
    trimpending(wrap);
    clearTimeout(wrap.settletimer);
    wrap.settletimer = setTimeout(function() {wrap.classList.add("settled")}, popupwait);
    startburst(wrap);
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
    stopburst(wrap);
    if (wrap.dataset.role === "profile") {
        const url = new URL(location.href);
        url.searchParams.delete("player");
        history.replaceState(null, "", url);
    }
    if (wrap.dataset.returnTo && !document.body.classList.contains("showaside")) {
        const target = document.querySelector("[data-role=" + wrap.dataset.returnTo + "]");
        if (target) setTimeout(function() {openpopup(target)}, popupwait);
    }
}

/*//////////////////////////////////////////////////////////////////////*/

// yay!! colorful!!
const burstcolors = [
    "#ff3b30", "#34d139", "#3478ff", 
    "#ffe600", "#ff33f6", "#33e8ff"
];
let burstcolorat = 0;
const burstinterval = 420; // ~25 frames at plausible 60fps

function burstlayerof(wrap) {
    let layer = wrap.querySelector(".burstlayer");
    if (!layer) {
        layer = document.createElement("div");
        layer.className = "burstlayer";
        wrap.insertBefore(layer, wrap.querySelector(".popup"));
    }
    return layer;
}

function spawnburststar(wrap, elapsed) {
    const box = wrap.querySelector(".popup").getBoundingClientRect();
    const slot = Math.floor(Math.random() * 6);
    const x = box.left + slot * (box.width / 5);
    const y = Math.random() < 0.5 ? box.top - 16 : box.bottom + 16;
    const cx = box.left + box.width / 2;
    const cy = box.top + box.height / 2;
    let dx = x - cx, dy = y - cy - 12;
    const len = Math.hypot(dx, dy) || 1;
    dx /= len; dy /= len;

    const reach = Math.hypot(window.innerWidth, window.innerHeight) * 0.9;
    const seat = document.createElement("div");
    seat.className = "burststar";
    seat.style.left = x + "px";
    seat.style.top = y + "px";
    seat.style.setProperty("--sz", (0.75 + Math.random() * 0.35).toFixed(2));
    seat.style.setProperty("--dx", (dx * reach).toFixed(1) + "px");
    seat.style.setProperty("--dy", (dy * reach).toFixed(1) + "px");

    if (elapsed) seat.style.animationDelay = "-" + elapsed + "s";
    seat.innerHTML = "<img src=\"assets/images/star.png\" alt=\"\">";

    seat.addEventListener("animationend", function(e) {
        if (e.animationName === "burststarfly") seat.remove();
    });
    burstlayerof(wrap).appendChild(seat);
}
function spawnburstcircle(wrap, elapsed) {
    const box = wrap.querySelector(".popup").getBoundingClientRect();
    const seat = document.createElement("div");
    seat.className = "burstcircle";
    seat.style.left = (box.left + box.width / 2) + "px";
    seat.style.top = (box.top + box.height / 2) + "px";
    seat.style.width = seat.style.height = (box.height * 1.3) + "px";
    seat.style.color = burstcolors[burstcolorat % burstcolors.length];
    burstcolorat++;
    if (elapsed) seat.style.animationDelay = "-" + elapsed + "s";
    seat.addEventListener("animationend", function() {seat.remove()});
    burstlayerof(wrap).appendChild(seat);
}

const starlife = 2.6;
const circlelife = 1.6;

function startburst(wrap) {
    stopburst(wrap);
    wrap.burstseed = setTimeout(function() {
        for (let t = 0; t < starlife; t += burstinterval / 1000) {
            spawnburststar(wrap, Math.random() * starlife);
        }
        for (let t = 0; t < circlelife; t += burstinterval / 1000) {
            spawnburstcircle(wrap, Math.random() * circlelife);
        }
    }, popupwait);
    wrap.burststimer = setInterval(function() {spawnburststar(wrap)}, burstinterval);
    wrap.burstctimer = setInterval(function() {spawnburstcircle(wrap)}, burstinterval);
}
function stopburst(wrap) {
    clearTimeout(wrap.burstseed);
    clearInterval(wrap.burststimer);
    clearInterval(wrap.burstctimer);
    const layer = wrap.querySelector(".burstlayer");
    if (layer) layer.innerHTML = "";
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

document.querySelectorAll(".calwrap").forEach(function(wrap) {
    let downat = null;
    wrap.addEventListener("pointerdown", function(e) {
        downat = e.target === wrap ? {x: e.clientX, y: e.clientY} : null;
    });
    wrap.addEventListener("pointerup", function(e) {
        if (!downat) return;
        const moved = Math.abs(e.clientX - downat.x) > 6 || Math.abs(e.clientY - downat.y) > 6;
        downat = null;
        if (e.target === wrap && !moved) closepopup(wrap);
    });
});

const playpackage = "com.raptisoft.Chuzzle2";
const playpage = "https://play.google.com/store/apps/details?id=" + playpackage;
const applepage = "https://apps.apple.com/app/id1367469846";

function onios() {
    return /iphone|ipad|ipod/i.test(navigator.userAgent)
        || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}
document.querySelector(".todaybutton").addEventListener("click", function() {
    if (/android/i.test(navigator.userAgent)) {
        location.href = "market://launch?id=" + playpackage; // discovered this 4 months ago, i'm not sure if this protocol command is properly documented at all
        return;
    }
    if (onios()) {
        location.href = applepage;
        return;
    }
    openpopup(document.querySelector("[data-role=qr]"));
});
window.addEventListener("keydown", function(e) {
    if (e.key !== "Escape") return;
    document.querySelectorAll(".calwrap.open").forEach(closepopup);
});

/*//////////////////////////////////////////////////////////////////////*/

loadsounds(["click", "shuffle"]);

document.addEventListener("click", function(e) {
    const seat = e.target.closest && e.target.closest("button");
    if (seat && !seat.closest(".boardpick")) playsound("click", 0.7);
});
