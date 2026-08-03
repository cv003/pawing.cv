let countrynames = {};
let knownflags = new Set();
const countriesready = fetch("countries.json").then(function(reply) {
    return reply.ok ? reply.json() : {};
}).then(function(got) {
    countrynames = got.names || {};
    knownflags = new Set(got.flags || []);
}).catch(function() {});

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
const boardhost = "https://dailydo.coolsite.cv";
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
    const all = readstore();
    all[key] = {text: text, at: Date.now()};
    Object.keys(all).sort(function(a, b) {return all[b].at - all[a].at})
        .slice(6).forEach(function(k) {delete all[k]});
    try {localStorage.setItem(boardstore, JSON.stringify(all))} catch (e) {}
}

async function fetchtext(key) {
    let text = "";
    try {
        const reply = await fetch(boardhost + "/" + key);
        if (reply.ok) text = await reply.text();
    } catch (e) {}
    return text.indexOf(String.fromCharCode(9)) < 0 ? "" : text;
}

function useboard(text) {
    fullboard = text ? readboard(text) : [];
    board = fullboard;
    return board.length;
}

async function loadboard() {
    const key = cachekey();
    const held = readstore()[key];
    if (held && Date.now() - held.at < boardage) return useboard(held.text);
    const text = await fetchtext(key);
    remember(key, text);
    return useboard(text);
}

// only refreshes every minute, or postponed if not viewing the leaderboard
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
// the tournament skips the six empty days, so it walks sunday to sunday
// a url can drop you outside the window, so the walk back in stays open
// while the walk further out stops at whichever end you came from
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

const slidespan = 260;
function slidemovers() {
    return [document.querySelector(".dailydo:not(.ghost)"),
        document.querySelector(".dumbcontainer:not(.ghost)")];
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

async function reload(dir) {
    document.body.classList.add("fetching");
    const count = await loadboard();
    document.body.classList.remove("fetching");
    const ghosts = snapshot();
    drawsteppers();
    drawpicks();
    relabellogo(document.querySelector(".dumbcontainer:not(.ghost) .logo"), boardtitle());
    measurelist(host, list);
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
    document.title = boards[boardat].label + " for " + daylabel(dayat)
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

// any real date is allowed here, not just the fourteen the ui can reach
// the server answers empty outside its window, which is the point of it
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
    // the tournament's own default is the sunday just gone, not today
    if (boards[boardat].weekly && !isgoldday(dayat)) {
        const near = nextday(dayat, 1);
        if (near >= 0) dayat = near;
    }
}

function switchday(step) {
    const want = nextday(dayat, step);
    if (want < 0) return;
    dayat = want;
    reload(step);
}

function pickday(back) {
    if (back === dayat || back < 0 || back > calendarreach) return;
    const dir = back > dayat ? 1 : -1;
    dayat = back;
    reload(dir);
}

function pickboard(index) {
    if (index === boardat) return;
    const dir = index > boardat ? -1 : 1;
    boardat = index;
    reload(dir).then(function() {playsound("shuffle", 0.7)});
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

/*//////////////////////////////////////////////////////////////////////*/

function readclaim() {
    try {return JSON.parse(localStorage.getItem("chuzzleclaim") || "null")} catch (e) {}
    return null;
}

// try guid first since it's possible that the person changed their nickname
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

// ?player=[id] jumps to the player row if it exists in the set leaderboard
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
        const country = countrynames[entry.country] || entry.country;
        const facts = [
            ["Nickname", entry.full],
            ["Country", flag + country],
            ["Player ID", entry.id || "unknown"],
            null,
            ["Today's Rank", "#" + entry.rank],
            ["Today's Score", Number(entry.score).toLocaleString("en")]
        ];
        const held = readclaim();
        const mine = held && held.guid && held.guid === entry.id;

        const button = mine || !held
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

const calendarreach = 13;

function daykey(date) {
    const pad = function(n) {return String(n).padStart(2, "0")};
    return date.getFullYear() + "-" + pad(date.getDate()) + "-" + pad(date.getMonth() + 1);
}

/* this would "usually" go from sunday, but, like, are you people insane?? sunday as first day of the week?? hell no!!!!! */
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

/* ..function slop 😭 */

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

const playpackage = "com.raptisoft.Chuzzle2";
const playpage = "https://play.google.com/store/apps/details?id=" + playpackage;

// a desk has nowhere to send the protocol, so it gets the phone to scan
document.querySelector(".todaybutton").addEventListener("click", function() {
    if (/android/i.test(navigator.userAgent)) {
        location.href = "market://launch?id=" + playpackage; /* discovered this 4 months ago, i'm not sure if this protocol command is properly documented at all */
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

// closest() rather than target: a press usually lands on a label or an icon
// the rail stays quiet here, it shuffles once its board has landed instead
document.addEventListener("click", function(e) {
    const seat = e.target.closest && e.target.closest("button");
    if (seat && !seat.closest(".boardpick")) playsound("click", 0.7);
});
