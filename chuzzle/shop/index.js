const shopfile = "shop.json";
const atlascols = 16;
const atlascell = 64;
const gridgap = 2;

let book = {items: [], groups: []};
let tabat = "All";
let sortat = "shop";

const tabs = ["All", "Food", "Fun Stuff", "Wallpapers"];
const sorts = [
    {key: "shop", label: "Shop order"},
    {key: "cheap", label: "Cheapest first"},
    {key: "dear", label: "Priciest first"},
    {key: "name", label: "By name"},
];

function locked(item) {return !!item.musthave || item.type === "scene"}

function capital(text) {
    const s = String(text == null ? "" : text);
    return s.charAt(0).toUpperCase() + s.slice(1);
}

function iconstyle(icon, cell) {
    const scale = cell / atlascell;
    return "background-position: " + (-(icon % atlascols) * cell) + "px "
        + (-Math.floor(icon / atlascols) * cell) + "px;"
        + "background-size: " + (atlascols * cell) + "px "
        + Math.round(704 * scale) + "px";
}

function groupof(name) {
    return book.groups.find(function(g) {return g.name === name}) || null;
}

function escaped(text) {
    return String(text == null ? "" : text)
        .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}

/*//////////////////////////////////////////////////////////////////////*/

function wanted() {
    const box = document.querySelector(".findbox input");
    const hunt = (box ? box.value : "").trim().toUpperCase();
    return book.items.filter(function(item) {
        if (tabat !== "All" && item.tab !== tabat) return false;
        if (!hunt) return true;
        return (item.name || "").toUpperCase().indexOf(hunt) >= 0
            || (item.desc || "").toUpperCase().indexOf(hunt) >= 0
            || (item.group || "").toUpperCase().indexOf(hunt) >= 0
            || (item.type || "").toUpperCase().indexOf(hunt) >= 0;
    });
}

function sorted(list) {
    const byname = function(a, b) {return (a.name || "").localeCompare(b.name || "")};
    if (sortat === "cheap") return list.slice().sort(function(a, b) {return a.cost - b.cost || byname(a, b)});
    if (sortat === "dear") return list.slice().sort(function(a, b) {return b.cost - a.cost || byname(a, b)});
    if (sortat === "name") return list.slice().sort(byname);
    return list;
}

function shelved(list) {
    const loose = list.filter(function(item) {return !item.group});
    const out = loose.length ? [{name: null, items: sorted(loose)}] : [];
    book.groups.forEach(function(group) {
        const mine = list.filter(function(item) {return item.group === group.name});
        if (mine.length) out.push({name: group.name, group: group, items: sorted(mine)});
    });
    const known = book.groups.map(function(g) {return g.name});
    const strays = {};
    list.forEach(function(item) {
        if (item.group && known.indexOf(item.group) < 0) {
            (strays[item.group] = strays[item.group] || []).push(item);
        }
    });
    Object.keys(strays).forEach(function(name) {
        out.push({name: name, items: sorted(strays[name])});
    });
    return out;
}

/*//////////////////////////////////////////////////////////////////////*/

function tintof(item) {
    if (locked(item)) return "grey";
    return item.notable ? "gold" : "plain";
}

function cardof(item, at) {
    return "<button class=\"card\" type=\"button\" data-at=\"" + at + "\""
        + " data-tint=\"" + tintof(item) + "\">"
        + "<span class=\"icon\" style=\"" + iconstyle(item.icon, 64) + "\"></span>"
        + "<span class=\"cardname\">" + capital(escaped(item.name)) + "</span>"
        + "<span class=\"cardcost\"><img class=\"coin\" src=\"assets/coin.webp\" alt=\"\">"
        + "<b>x" + item.cost + "</b></span></button>";
}

function draw() {
    const host = document.querySelector(".shelves");
    const list = wanted();
    if (!list.length) {
        host.innerHTML = "<div class=\"empty\">No matches...</div>";
        return;
    }
    host.innerHTML = shelved(list).map(function(rack) {
        return "<section class=\"shelfwrap\">"
            + (rack.name ? "<h2 class=\"shelftitle\">" + escaped(rack.name) + "</h2>" : "")
            + "<div class=\"shelf\"><svg class=\"frame\" aria-hidden=\"true\"></svg>"
            + "<div class=\"grid\">"
            + rack.items.map(function(item) {return cardof(item, book.items.indexOf(item))}).join("")
            + "</div></div></section>";
    }).join("");
    watchshelves();
}

/*//////////////////////////////////////////////////////////////////////*/

const rings = [
    ["rgba(0,0,0,0.55)", 15],
    ["#8b0aa2", 13],
    ["#8a0820", 9],
    ["#ff2500", 7],
    ["#ffeb00", 4],
    ["#ffa900", 2],
    ["#c67228", 1],
];
const framepad = 2;
const frameroom = 18;
const framecurve = 7;

function roundpath(points, radius) {
    const n = points.length;
    let out = "";
    for (let i = 0; i < n; i++) {
        const prev = points[(i + n - 1) % n];
        const here = points[i];
        const next = points[(i + 1) % n];
        const back = [prev[0] - here[0], prev[1] - here[1]];
        const on = [next[0] - here[0], next[1] - here[1]];
        const backlen = Math.hypot(back[0], back[1]) || 1;
        const onlen = Math.hypot(on[0], on[1]) || 1;
        const r = Math.min(radius, backlen / 2, onlen / 2);
        const a = [here[0] + back[0] / backlen * r, here[1] + back[1] / backlen * r];
        const b = [here[0] + on[0] / onlen * r, here[1] + on[1] / onlen * r];
        out += (i ? "L" : "M") + a[0].toFixed(1) + " " + a[1].toFixed(1)
            + "Q" + here[0].toFixed(1) + " " + here[1].toFixed(1)
            + " " + b[0].toFixed(1) + " " + b[1].toFixed(1);
    }
    return out + "Z";
}

function frameshape(grid) {
    const cards = grid.querySelectorAll(".card");
    if (!cards.length) return null;
    const w = grid.offsetWidth;
    const h = grid.offsetHeight;
    const last = cards[cards.length - 1];
    const stepx = last.offsetLeft + last.offsetWidth + framepad;
    const stepy = last.offsetTop - gridgap + framepad;
    const p = framepad;
    if (stepx >= w + p - 0.5) {
        return [[-p, -p], [w + p, -p], [w + p, h + p], [-p, h + p]];
    }
    if (last.offsetTop < 1) {
        return [[-p, -p], [stepx, -p], [stepx, h + p], [-p, h + p]];
    }
    return [[-p, -p], [w + p, -p], [w + p, stepy], [stepx, stepy], [stepx, h + p], [-p, h + p]];
}

const tints = {
    plain: ["#8b53a2", "#590c74"],
    grey: ["#8e8e93", "#3a3a40"],
    gold: ["#d8ae43", "#6f4c06"],
};

function shelfgradient(id, kind, top, bottom) {
    const pair = tints[kind] || tints.plain;
    return "<linearGradient id=\"" + id + "\" gradientUnits=\"userSpaceOnUse\""
        + " x1=\"0\" y1=\"" + top + "\" x2=\"0\" y2=\"" + bottom + "\">"
        + "<stop offset=\"0%\" stop-color=\"" + pair[0] + "\"></stop>"
        + "<stop offset=\"6%\" stop-color=\"" + pair[1] + "\"></stop>"
        + "<stop offset=\"94%\" stop-color=\"" + pair[1] + "\"></stop>"
        + "<stop offset=\"100%\" stop-color=\"" + pair[0] + "\"></stop>"
        + "</linearGradient>";
}

let framecount = 0;

function drawframe(shelf) {
    const grid = shelf.querySelector(".grid");
    const svg = shelf.querySelector(".frame");
    const shape = frameshape(grid);
    if (!shape) {svg.innerHTML = ""; return}

    const w = grid.offsetWidth + frameroom * 2;
    const h = grid.offsetHeight + frameroom * 2;
    svg.setAttribute("viewBox", "0 0 " + w + " " + h);
    svg.setAttribute("width", w);
    svg.setAttribute("height", h);
    const d = roundpath(shape.map(function(pt) {
        return [pt[0] + frameroom, pt[1] + frameroom];
    }), framecurve);

    const tag = shelf.dataset.frame || (shelf.dataset.frame = "sh" + (++framecount));
    const defs = "<defs><clipPath id=\"" + tag + "clip\"><path d=\"" + d + "\"></path></clipPath>"
        + Object.keys(tints).map(function(kind) {
            return shelfgradient(tag + kind, kind, frameroom, frameroom + grid.offsetHeight);
        }).join("") + "</defs>";

    const seats = Array.prototype.map.call(grid.querySelectorAll(".card"), function(card) {
        return "<rect x=\"" + (card.offsetLeft + frameroom) + "\" y=\"" + (card.offsetTop + frameroom)
            + "\" width=\"" + card.offsetWidth + "\" height=\"" + card.offsetHeight
            + "\" fill=\"url(#" + tag + (card.dataset.tint || "plain") + ")\"></rect>";
    }).join("");

    svg.innerHTML = defs + rings.map(function(ring) {
        return "<path d=\"" + d + "\" fill=\"none\" stroke=\"" + ring[0] + "\""
            + " stroke-width=\"" + (ring[1] * 2) + "\" stroke-linejoin=\"round\"></path>";
    }).join("")
        + "<path d=\"" + d + "\" fill=\"#f7a500\" stroke=\"none\"></path>"
        + "<g clip-path=\"url(#" + tag + "clip)\">" + seats + "</g>";
}

function clearbar() {
    const bar = document.querySelector(".bar");
    if (bar) document.body.style.paddingBottom = (bar.offsetHeight + 28) + "px";
}
window.addEventListener("resize", clearbar);

let watcher = null;
function watchshelves() {
    if (!watcher && window.ResizeObserver) {
        watcher = new ResizeObserver(function(hits) {
            hits.forEach(function(hit) {drawframe(hit.target.closest(".shelf"))});
        });
    }
    document.querySelectorAll(".shelf").forEach(function(shelf) {
        drawframe(shelf);
        if (watcher) watcher.observe(shelf.querySelector(".grid"));
    });
    clearbar();
}

/*//////////////////////////////////////////////////////////////////////*/

function facts(item) {
    const group = item.group ? groupof(item.group) : null;
    const rows = [
        ["Kind", capital(escaped(item.type)) + " <b>(" + item.kind + ")</b>"],
        ["Shop tab", escaped(item.tab)],
    ];
    if (item.group) rows.push(["Group", escaped(item.group)]);
    if (group && group.season) rows.push(["Season", escaped(group.season)]);
    rows.push(null, ["Object id", escaped(item.raw)]);
    if (item.gizmotype.length > 1) {
        rows.push(["Variants", item.gizmotype.length + " <b>("
            + item.gizmotype.join(", ") + ")</b>"]);
    } else if (item.gizmotype.length === 1 && item.gizmotype[0] !== 0) {
        rows.push(["Gizmo type", String(item.gizmotype[0])]);
    }
    rows.push(["Icon", "#" + item.icon]);
    if (item.init) rows.push(["Init", escaped(item.init)]);
    if (item.notable) rows.push(["Flag", "Notable!"]);
    if (item.musthave) {
        rows.push(null, ["Hidden until", "Gift <b>" + item.musthave + "</b> is won"]);
    } else if (item.type === "scene") {
        rows.push(null, ["Hidden until", "Gift <b>109</b> is won"]);
    }
    return "<div class=\"facts\">" + rows.map(function(row) {
        if (!row) return "<span class=\"gap\"></span>";
        return "<i>" + row[0] + "</i><u>" + row[1] + "</u>";
    }).join("") + "</div>";
}

function slugof(name) {
    return String(name || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function fitlogo(svg) {
    const box = (svg.getAttribute("viewBox") || "").split(/\s+/).map(Number);
    if (box.length < 4 || !box[2] || !box[3]) return;
    const room = svg.parentElement.clientWidth * 0.92;
    svg.style.height = Math.min(70, room * box[3] / box[2]) + "px";
}

function openitem(item) {
    const wrap = document.querySelector("[data-role=item]");
    const url = new URL(location.href);
    url.searchParams.set("item", slugof(item.name));
    history.replaceState(null, "", url);
    relabellogo(wrap.querySelector(".logo"), capital(item.name));
    fitlogo(wrap.querySelector(".logo"));
    wrap.querySelector(".itembody").innerHTML =
        "<span class=\"bigicon\" style=\"" + iconstyle(item.icon, 96) + "\"></span>"
        + (item.desc ? "<div class=\"blurb\">" + escaped(item.desc) + "</div>" : "")
        + "<div class=\"pricetag\"><img class=\"coin\" src=\"assets/coin.webp\" alt=\"\">"
        + "<b>x" + item.cost.toLocaleString("en") + "</b></div>"
        + facts(item);
    openpopup(wrap);
}

/*//////////////////////////////////////////////////////////////////////*/

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
    const url = new URL(location.href);
    url.searchParams.delete("item");
    history.replaceState(null, "", url);
    clearTimeout(wrap.settletimer);
    wrap.classList.remove("settled");
    wrap.classList.add("closing");
    wrap.settletimer = setTimeout(function() {
        wrap.classList.remove("open", "closing");
    }, popupwait);
}

/*//////////////////////////////////////////////////////////////////////*/

function maketabs() {
    const seat = document.querySelector(".tabs");
    seat.innerHTML = tabs.map(function(name) {
        return "<button type=\"button\" class=\"" + (name === tabat ? "on" : "") + "\">"
            + name + "</button>";
    }).join("");
    seat.querySelectorAll("button").forEach(function(button) {
        button.addEventListener("click", function() {
            tabat = button.textContent;
            playsound("click", 0.7);
            maketabs();
            draw();
        });
    });
}

function makesort() {
    const pick = document.querySelector(".sortpick");
    const now = pick.querySelector(".sortnow");
    const menu = pick.querySelector(".sortmenu");
    menu.innerHTML = sorts.map(function(one) {
        return "<button type=\"button\" data-sort=\"" + one.key + "\""
            + (one.key === sortat ? " class=\"on\"" : "") + ">" + one.label + "</button>";
    }).join("");

    now.onclick = function(e) {
        e.stopPropagation();
        playsound("click", 0.6);
        pick.classList.toggle("open");
    };
    menu.querySelectorAll("button").forEach(function(button) {
        button.onclick = function(e) {
            e.stopPropagation();
            sortat = button.dataset.sort;
            playsound("click", 0.7);
            pick.classList.remove("open");
            makesort();
            draw();
        };
    });
    const label = sorts.find(function(one) {return one.key === sortat});
    now.innerHTML = (label ? label.label : "Sort") + "<span class=\"caret\">^</span>";
}

function wire() {
    const box = document.querySelector(".findbox input");
    const clear = document.querySelector(".clearfind");
    let pending = 0;
    box.addEventListener("input", function() {
        document.querySelector(".findbox").classList.toggle("typed", box.value !== "");
        clearTimeout(pending);
        pending = setTimeout(draw, 90);
    });
    clear.addEventListener("click", function() {
        box.value = "";
        document.querySelector(".findbox").classList.remove("typed");
        draw();
        box.focus();
    });

    document.querySelector(".shelves").addEventListener("click", function(e) {
        const card = e.target.closest("button.card");
        if (!card) return;
        playsound("click", 0.7);
        openitem(book.items[Number(card.dataset.at)]);
    });

    const wrap = document.querySelector("[data-role=item]");
    wrap.querySelector(".closebtn").addEventListener("click", function() {
        playsound("click", 0.7);
        closepopup(wrap);
    });
    wrap.addEventListener("click", function(e) {
        if (e.target === wrap) closepopup(wrap);
    });
    document.addEventListener("keydown", function(e) {
        if (e.key !== "Escape") return;
        document.querySelector(".sortpick").classList.remove("open");
        closepopup(wrap);
    });
    document.addEventListener("click", function() {
        document.querySelector(".sortpick").classList.remove("open");
    });
}

fetch(shopfile).then(function(reply) {
    return reply.json();
}).then(function(got) {
    book = got;
    maketabs(); makesort();
    wire(); draw();
    const want = new URL(location.href).searchParams.get("item");
    const found = want && book.items.find(function(item) {return slugof(item.name) === want});
    if (found) openitem(found);
}).catch(function() {
    document.querySelector(".shelves").innerHTML = "<div class=\"empty\">Couldn't load data :(</div>";
});
loadsounds(["click"]);
