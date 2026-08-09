const shopfile = "store.json";
const atlascols = 16;
const atlascell = 64;

let book = {items: [], groups: []};
let tabat = "All";
let sortat = "shop";

const tabs = ["All", "Food", "Fun Stuff", "Wallpapers"];

function locked(item) {return !!item.musthave || item.type === "scene"}

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

/*//////////////////////////////////////////////////////////////////////*/

function escaped(text) {
    return String(text == null ? "" : text)
        .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}

function wanted() {
    const box = document.querySelector(".findbox input");
    const hunt = (box ? box.value : "").trim().toUpperCase();
    let out = book.items.filter(function(item) {
        if (tabat !== "All" && item.tab !== tabat) return false;
        if (!hunt) return true;
        return (item.name || "").toUpperCase().indexOf(hunt) >= 0
            || (item.desc || "").toUpperCase().indexOf(hunt) >= 0
            || (item.group || "").toUpperCase().indexOf(hunt) >= 0
            || (item.type || "").toUpperCase().indexOf(hunt) >= 0;
    });
    const bynum = function(a, b) {return a - b};
    const byname = function(a, b) {return (a.name || "").localeCompare(b.name || "")};
    if (sortat === "cheap") out = out.slice().sort(function(a, b) {return bynum(a.cost, b.cost) || byname(a, b)});
    if (sortat === "dear") out = out.slice().sort(function(a, b) {return bynum(b.cost, a.cost) || byname(a, b)});
    if (sortat === "name") out = out.slice().sort(byname);
    if (sortat === "group") {
        out = out.slice().sort(function(a, b) {
            return (a.group || "~").localeCompare(b.group || "~") || byname(a, b);
        });
    }
    return out;
}

function cardof(item, at) {
    const season = item.group && groupof(item.group) && groupof(item.group).season;
    const pips = (item.notable ? "<span class=\"pip pipnotable\">notable</span>" : "")
        + (season ? "<span class=\"pip pipseason\">" + escaped(season) + "</span>"
            : locked(item) ? "<span class=\"pip piplocked\">hidden</span>" : "");
    return "<button class=\"card\" type=\"button\" data-at=\"" + at + "\">"
        + pips
        + "<span class=\"icon\" style=\"" + iconstyle(item.icon, 64) + "\"></span>"
        + "<span class=\"cardname\">" + escaped(item.name) + "</span>"
        + "<span class=\"cardcost\"><img src=\"assets/coin.webp\" alt=\"\">"
        + item.cost + "</span></button>";
}

function draw() {
    const grid = document.querySelector(".grid");
    const list = wanted();
    grid.dataset.shown = list.map(function(item) {return book.items.indexOf(item)}).join(",");
    grid.innerHTML = list.length
        ? list.map(function(item) {return cardof(item, book.items.indexOf(item))}).join("")
        : "<div class=\"empty\">nothing matches that</div>";

    const spent = list.reduce(function(sum, item) {return sum + item.cost}, 0);
    document.querySelector(".tally").textContent = list.length + " items"
        + (list.length ? " ~ " + spent.toLocaleString("en") + " coins for the lot" : "");
}

/*//////////////////////////////////////////////////////////////////////*/

function facts(item) {
    const group = item.group ? groupof(item.group) : null;
    const rows = [
        ["Kind", escaped(item.type) + " <b>(" + item.kind + ")</b>"],
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
    if (item.notable) rows.push(["Flag", "Notable"]);
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
    relabellogo(wrap.querySelector(".logo"), item.name);
    fitlogo(wrap.querySelector(".logo"));
    wrap.querySelector(".itembody").innerHTML =
        "<span class=\"bigicon\" style=\"" + iconstyle(item.icon, 96) + "\"></span>"
        + (item.desc ? "<div class=\"blurb\">" + escaped(item.desc) + "</div>" : "")
        + "<div class=\"pricetag\"><img src=\"assets/coin.webp\" alt=\"\">"
        + item.cost.toLocaleString("en") + "</div>"
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
    document.querySelector(".sort").addEventListener("change", function(e) {
        sortat = e.target.value;
        draw();
    });

    document.querySelector(".grid").addEventListener("click", function(e) {
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
        if (e.key === "Escape") closepopup(wrap);
    });
}

fetch(shopfile).then(function(reply) {
    return reply.json();
}).then(function(got) {
    book = got;
    maketabs();
    wire();
    draw();
    const want = new URL(location.href).searchParams.get("item");
    const found = want && book.items.find(function(item) {return slugof(item.name) === want});
    if (found) openitem(found);
}).catch(function() {
    document.querySelector(".grid").innerHTML =
        "<div class=\"empty\">Couldn't load :(</div>";
});

loadsounds(["click"]);
