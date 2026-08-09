/*

  every item the Chuzzarium shop can sell, straight out of the game's own
  data/chuzzleshop.cfg. datainfo/tools/parseshop.py turns that file into
  shop.json and packs Chuzzarium_DYNA/Icon[NNN].png into one atlas.

  the field meanings are read off Shop::Initialize, not guessed:
    type       wallpaper 1, food 2, gizmo 3, deko 4, scene 14 - the number is
               the tab the item lands in, and gizmo and deko share one
    data       atoi'd, the id the Chuzzarium builds the object from
    gizmotype  a csv of the shapes one entry can turn into, so "Snow Globe"
               with six numbers is six collectables under one shop card
    musthave   a gift id: the item is not in the shop at all until HasGift()
    cflag      a | separated list, and NOTABLE is the only flag the game reads
    init       starting state handed to the object, always "1,0-68,0" here

  one shelf per <gizmogroup>, ungrouped items first. the shelf frame is drawn
  as an svg rather than a box-shadow so the last row can stop where the items
  do and the rings still bend round the step - see drawframe().

*/

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

// scene items only appear once you own gift 109, and Shop::Initialize drops
// anything with an unmet musthave before the panel ever sees it
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

// ungrouped first with no heading, then the gizmogroups in cfg order
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

function cardof(item, at) {
    const pips = (item.notable ? "<span class=\"pip pipnotable\">Notable</span>" : "")
        + (locked(item) ? "<span class=\"pip piplocked\">Hidden</span>" : "");
    return "<button class=\"card\" type=\"button\" data-at=\"" + at + "\">"
        + pips
        + "<span class=\"icon\" style=\"" + iconstyle(item.icon, 64) + "\"></span>"
        + "<span class=\"cardname\">" + capital(escaped(item.name)) + "</span>"
        + "<span class=\"cardcost\"><img src=\"assets/coin.webp\" alt=\"\">"
        + "<b>x" + item.cost + "</b></span></button>";
}

function draw() {
    const host = document.querySelector(".shelves");
    const list = wanted();
    if (!list.length) {
        host.innerHTML = "<div class=\"empty\">Nothing matches that</div>";
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

/* the ring stack raptisoft draws round a list, from the content outward. as an
   inset box-shadow every layer keeps the element's own corner radius instead of
   shrinking it, and a rectangle cannot step in anyway - so it is drawn here as
   one path stroked several times over, widest first, with the fill last on top.
   every stroke is centred on the path, so each colour shows from the previous
   half-width out to its own, and stroke-linejoin rounds all of it including
   the inside corner of the step. */
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
    // the grid keeps its full width whatever it holds, so a shelf that does not
    // fill its last row has to be cut back to where the items actually stop
    if (stepx >= w + p - 0.5) {
        return [[-p, -p], [w + p, -p], [w + p, h + p], [-p, h + p]];
    }
    if (last.offsetTop < 1) {
        return [[-p, -p], [stepx, -p], [stepx, h + p], [-p, h + p]];
    }
    return [[-p, -p], [w + p, -p], [w + p, stepy], [stepx, stepy], [stepx, h + p], [-p, h + p]];
}

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

    svg.innerHTML = rings.map(function(ring) {
        return "<path d=\"" + d + "\" fill=\"none\" stroke=\"" + ring[0] + "\""
            + " stroke-width=\"" + (ring[1] * 2) + "\" stroke-linejoin=\"round\"></path>";
    }).join("") + "<path d=\"" + d + "\" fill=\"#f7a500\" stroke=\"none\"></path>";
}

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
    if (item.notable) rows.push(["Flag", "NOTABLE"]);
    if (item.musthave) {
        rows.push(null, ["Hidden until", "gift <b>" + item.musthave + "</b> is won"]);
    } else if (item.type === "scene") {
        rows.push(null, ["Hidden until", "gift <b>109</b> is won"]);
    }
    return "<div class=\"facts\">" + rows.map(function(row) {
        if (!row) return "<span class=\"gap\"></span>";
        return "<i>" + row[0] + "</i><u>" + row[1] + "</u>";
    }).join("") + "</div>";
}

function slugof(name) {
    return String(name || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

// item names run much longer than the "Player Info" sort of title the logo
// was built for, so the height comes down until the trimmed box fits across
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
        + "<div class=\"pricetag\"><img src=\"assets/coin.webp\" alt=\"\">"
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

// a real <select> cannot be styled anywhere near the rest of this, so the
// picker is a button and a list that opens upward out of the search bar
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
    maketabs();
    makesort();
    wire();
    draw();
    const want = new URL(location.href).searchParams.get("item");
    const found = want && book.items.find(function(item) {return slugof(item.name) === want});
    if (found) openitem(found);
}).catch(function() {
    document.querySelector(".shelves").innerHTML =
        "<div class=\"empty\">The shop data would not load</div>";
});

loadsounds(["click"]);
