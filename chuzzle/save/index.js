const appkey = "V!qSYY66wOOg8Yf7n1b7!63rmmh8b3K&+%sB16js2V7R?Zeh1591&073!l4rO594*";
const profilekey = "eh1591&073!l4rO594*V!qSYY<link _close><custom id=button;"
    + "width=(#width/2)-25;height=58;ext=Okay;></link>66wOOh8b3K&+%sB16js2V7R?"
    + "Zeh1591&073!l4rO594*V!qSYY66wOOg8Yf7n1b7!63rmm";

const line = /^([A-Za-z_][A-Za-z0-9_.]{1,40})=([\s\S]*?)(\r?)$/;
const wordpage = 512;

let held = [];
let openat = 0;

/*//////////////////////////////////////////////////////////////////////*/

function dexor(bytes, key) {
    const out = new Uint8Array(bytes.length);
    for (let i = 0; i < bytes.length; i++) {
        out[i] = bytes[i] ^ key.charCodeAt(i % key.length);
    }
    return out;
}

function aslatin(bytes) {
    let out = "";
    for (let i = 0; i < bytes.length; i += 8192) {
        out += String.fromCharCode.apply(null, bytes.subarray(i, i + 8192));
    }
    return out;
}

function frombytes(text) {
    const out = new Uint8Array(text.length);
    for (let i = 0; i < text.length; i++) out[i] = text.charCodeAt(i) & 0xff;
    return out;
}

function scan(text) {
    const rows = text.split("\n");
    const out = [];
    rows.forEach(function(row, at) {
        const hit = line.exec(row);
        if (hit) out.push({name: hit[1], value: hit[2], cr: hit[3], at: at});
    });
    return out;
}

function readsave(bytes) {
    let best = null;
    [profilekey, appkey].forEach(function(key) {
        const text = aslatin(dexor(bytes, key));
        const fields = scan(text);
        if (!best || fields.length > best.fields.length) {
            best = {key: key, text: text, fields: fields};
        }
    });
    if (!best || !best.fields.length) return null;
    const first = best.fields[0];
    if (first.at !== 0 || first.name.length < 3) return null;
    if (best.key.indexOf(first.name) === 0) return null;
    return best;
}

// settings.txt is the same shape without the xor
function readplain(bytes) {
    const text = aslatin(bytes);
    const fields = scan(text);
    if (!fields.length || fields[0].at !== 0) return null;
    return {key: null, text: text, fields: fields};
}

function rebuild(save) {
    const rows = save.text.split("\n");
    save.fields.forEach(function(field) {
        rows[field.at] = field.name + "=" + field.value + field.cr;
    });
    return frombytes(rows.join("\n"));
}

function bytesof(one) {
    if (one.kind === "binary") return one.bytes;
    const raw = rebuild(one.save);
    return one.save.key ? dexor(raw, one.save.key) : raw;
}

/*//////////////////////////////////////////////////////////////////////*/

function sectionsof(one) {
    // a 54 kb dump is a hundred and something screens of numbers, so it gets a
    // pager inside the panel rather than that many subtabs
    if (one.kind === "binary") return [{key: "words", name: "Words"}];
    const used = {};
    one.save.fields.forEach(function(field) {
        if (/^(current|best|alltime)_m/.test(field.name)) {used.records = true; return}
        used[fieldinfo(field.name).panel] = true;
    });
    const out = panels.filter(function(panel) {return used[panel.key]});
    return out.length ? out : [{key: "rest", name: "Everything else"}];
}

function fieldhtml(save, at) {
    const field = save.fields[at];
    const info = fieldinfo(field.name);
    const stamp = readgamedate(field.value);
    const note = info.note || (stamp && info.control !== "date" ? stamp : "");
    const kind = controlkind(field.value, info);
    return "<div class=\"row" + (iswide(kind, field.value) ? " stacked" : "") + "\">"
        + "<span class=\"rname\"><b>" + escaped(info.label) + "</b>"
        + "<i>" + escaped(field.name) + (note ? " ~ " + escaped(note) : "") + "</i></span>"
        + "<span class=\"rctl\">" + controlhtml(at, field.value, info) + "</span></div>";
}

function statrow(save, stat) {
    const cells = ["current", "best", "alltime"].map(function(era) {
        const at = save.fields.findIndex(function(f) {return f.name === era + "_" + stat});
        if (at < 0) return "<span class=\"missing\">-</span>";
        return "<input data-at=\"" + at + "\" data-role=\"text\" inputmode=\"decimal\""
            + " value=\"" + escaped(save.fields[at].value) + "\">";
    });
    return "<div class=\"statrow\"><span>" + escaped(prettyname(stat)) + "</span>"
        + cells.join("") + "</div>";
}

function recordshtml(save) {
    const has = statnames.filter(function(stat) {
        return save.fields.some(function(f) {return f.name === "alltime_" + stat});
    });
    return "<div class=\"stats\"><div class=\"statrow head\"><span></span>"
        + "<span>This game</span><span>Best</span><span>All-time</span></div>"
        + has.map(function(stat) {return statrow(save, stat)}).join("") + "</div>";
}

function wordshtml(one) {
    const words = Math.floor(one.bytes.length / 4);
    const view = new DataView(one.bytes.buffer, one.bytes.byteOffset, words * 4);
    const spare = one.bytes.length % 4;
    const pages = Math.max(1, Math.ceil(words / wordpage));
    one.page = Math.max(0, Math.min(pages - 1, one.page || 0));
    const from = one.page * wordpage;
    const to = Math.min(words, from + wordpage);

    let out = "<p class=\"aside\">Nobody has written a reader for this one yet, so it opens"
        + " as little-endian 32 bit words. " + one.bytes.length + " bytes, " + words + " words"
        + (spare ? ", and " + spare + " bytes over that stay as they are." : ".")
        + "</p>";
    if (pages > 1) {
        out += "<div class=\"pager\">"
            + "<button type=\"button\" data-role=\"page\" data-page=\"" + (one.page - 1)
            + "\"" + (one.page ? "" : " disabled") + ">Back</button>"
            + "<span>Words " + from + " to " + (to - 1) + " of " + words + "</span>"
            + "<button type=\"button\" data-role=\"page\" data-page=\"" + (one.page + 1)
            + "\"" + (one.page + 1 < pages ? "" : " disabled") + ">More</button></div>";
    }
    out += "<div class=\"words\">";
    for (let i = from; i < to; i++) {
        out += "<label class=\"slot\"><i>" + (i * 4) + "</i>"
            + "<input data-word=\"" + i + "\" data-role=\"word\" inputmode=\"numeric\""
            + " value=\"" + view.getUint32(i * 4, true) + "\"></label>";
    }
    return out + "</div>";
}

function paint() {
    const one = held[openat];
    const host = document.querySelector(".sheets");
    if (!one) {host.innerHTML = ""; return}

    const list = sectionsof(one);
    if (!list.some(function(s) {return s.key === one.section})) one.section = list[0].key;
    const now = list.find(function(s) {return s.key === one.section});

    document.querySelector(".parts").innerHTML = list.map(function(section) {
        return "<button type=\"button\" data-key=\"" + section.key + "\""
            + (section.key === one.section ? " class=\"on\"" : "") + ">"
            + escaped(section.name) + "</button>";
    }).join("");

    let body;
    if (one.kind === "binary") {
        body = wordshtml(one);
    } else if (one.section === "records") {
        body = recordshtml(one.save);
    } else {
        const rows = [];
        one.save.fields.forEach(function(field, at) {
            if (/^(current|best|alltime)_m/.test(field.name)) return;
            if (fieldinfo(field.name).panel === one.section) rows.push(fieldhtml(one.save, at));
        });
        body = "<div class=\"group\">" + rows.join("") + "</div>";
    }
    host.innerHTML = "<section class=\"panel\"><h2>" + escaped(now.name) + "</h2>"
        + body + "</section>";
}

/*//////////////////////////////////////////////////////////////////////*/

function setvalue(at, value) {
    held[openat].save.fields[at].value = value;
    document.body.classList.add("edited");
}

function setword(idx, value) {
    const one = held[openat];
    const view = new DataView(one.bytes.buffer, one.bytes.byteOffset);
    const want = Math.max(0, Math.min(4294967295, Math.floor(Number(value) || 0)));
    view.setUint32(idx * 4, want, true);
    document.body.classList.add("edited");
}

function wiresheet() {
    const host = document.querySelector(".sheets");
    host.addEventListener("input", function(e) {
        const box = e.target;
        const role = box.dataset.role;
        if (role === "text") {
            setvalue(Number(box.dataset.at), box.value);
        } else if (role === "word") {
            setword(Number(box.dataset.word), box.value);
        } else if (role === "volume") {
            setvalue(Number(box.dataset.at), (box.value / 100).toFixed(6));
            box.parentElement.querySelector("b").textContent = box.value + "%";
        } else if (role === "date") {
            const bits = box.value.split("-");
            const stamp = bits.length === 3 ? bits[0] + bits[2] + bits[1] : "0";
            setvalue(Number(box.dataset.at), stamp);
            box.parentElement.querySelector("b").textContent = stamp;
        } else if (role === "listpart") {
            const group = box.closest(".numlist, .namelist");
            setvalue(Number(box.dataset.at), joinparts(group, box.dataset.sep));
        }
    });

    host.addEventListener("click", function(e) {
        const button = e.target.closest("button[data-role]");
        if (!button) return;
        const role = button.dataset.role;
        const at = Number(button.dataset.at);
        if (role === "bool") {
            const on = held[openat].save.fields[at].value !== "true";
            setvalue(at, on ? "true" : "false");
            button.classList.toggle("on", on);
            button.textContent = on ? "On" : "Off";
            playsound("click", 0.6);
        } else if (role === "flag") {
            const group = button.closest(".flags");
            button.classList.toggle("on");
            const bits = Array.prototype.map.call(group.querySelectorAll(".flag"), function(one) {
                return one.classList.contains("on") ? "1" : "0";
            });
            setvalue(at, bits.join(","));
            playsound("click", 0.5);
        } else if (role === "listdrop") {
            const group = button.closest(".namelist");
            const sep = button.parentElement.querySelector("input").dataset.sep;
            button.parentElement.remove();
            setvalue(at, joinparts(group, sep));
            playsound("click", 0.6);
        } else if (role === "opencal") {
            const pick = button.closest(".pick");
            const open = !pick.classList.contains("open");
            document.querySelectorAll(".pick.open").forEach(function(one) {
                one.classList.remove("open");
            });
            if (open) {
                pick.classList.add("open");
                pick.querySelector(".pickmenu").innerHTML =
                    calhtml(at, held[openat].save.fields[at].value, 0);
            }
            playsound("click", 0.6);
        } else if (role === "calstep") {
            const pick = button.closest(".pick");
            pick.querySelector(".pickmenu").innerHTML =
                calhtml(at, held[openat].save.fields[at].value, Number(button.dataset.shift));
            playsound("click", 0.5);
        } else if (role === "calpick") {
            const pick = button.closest(".pick");
            setvalue(at, button.dataset.stamp);
            pick.querySelector(".picknow").innerHTML =
                escaped(saydate(readstamp(button.dataset.stamp)))
                + "<span class=\"caret\">^</span>";
            pick.classList.remove("open");
            playsound("click", 0.7);
        } else if (role === "page") {
            held[openat].page = Number(button.dataset.page);
            playsound("click", 0.7);
            paint();
            window.scrollTo(0, 0);
        } else if (role === "listadd") {
            const group = button.closest(".namelist");
            const sep = button.dataset.sep;
            const chip = document.createElement("span");
            chip.className = "chip";
            chip.innerHTML = "<input data-at=\"" + at + "\" data-role=\"listpart\""
                + " data-sep=\"" + escaped(sep) + "\" list=\"shopitems\" value=\"\">"
                + "<button class=\"drop\" type=\"button\" data-at=\"" + at
                + "\" data-role=\"listdrop\">&times;</button>";
            group.insertBefore(chip, button);
            chip.querySelector("input").focus();
            playsound("click", 0.6);
        }
    });
}

/*//////////////////////////////////////////////////////////////////////*/

function stripof(seat, mine) {
    const strip = document.querySelector(seat);
    const rows = held.map(function(one, at) {return {one: one, at: at}})
        .filter(function(pair) {return pair.one.profile === mine});
    strip.innerHTML = rows.map(function(pair) {
        return "<button type=\"button\" data-at=\"" + pair.at + "\""
            + (pair.at === openat ? " class=\"on\"" : "") + ">"
            + escaped(pair.one.label) + "</button>";
    }).join("");
    strip.parentElement.style.display = rows.length ? "" : "none";
}

function drawtabs() {
    stripof(".files", true);
    stripof(".others", false);
}

function say(what, bad) {
    const seat = document.querySelector(".shout");
    seat.textContent = what;
    seat.classList.toggle("bad", !!bad);
}

// what each file in a backup actually is, rather than what it is called
const filenames = {
    "chuzzle2.cfg": "App settings",
    "settings.txt": "System",
    "chuzzarium.cfg": "Chuzzarium",
    "chuzzarium.cfg.backup": "Chuzzarium backup",
    "chuzzle.save": "Chuzzle 2 game",
    "chuzzle1_zen.save": "Chuzzle 1 zen",
    "puzzle.dat": "Puzzles",
    "puzzlebonus.dat": "Puzzle bonuses",
    "_achievements.dat": "Achievements",
    "storage-info.pb": "Storage info",
    "profileInstalled": "Install marker",
};

function shortname(path) {
    const bits = path.split("/").filter(Boolean);
    const file = bits[bits.length - 1];
    const owner = bits[bits.length - 2];
    if (file === "profile.cfg" && owner) return owner;
    return filenames[file] || file;
}

function readone(name, bytes) {
    if (!bytes.length) return null;
    const file = name.split("/").pop();
    const base = {label: shortname(name), file: file, profile: file === "profile.cfg"};
    const crypt = readsave(bytes);
    if (crypt) return Object.assign(base, {kind: "settings", save: crypt});
    const plain = readplain(bytes);
    if (plain) return Object.assign(base, {kind: "plain", save: plain});
    return Object.assign(base, {kind: "binary", bytes: new Uint8Array(bytes)});
}

async function take(files) {
    const found = [];
    for (const file of files) {
        const bytes = new Uint8Array(await file.arrayBuffer());
        if (bytes[0] === 0x50 && bytes[1] === 0x4b) {
            const parts = await unzip(bytes.buffer);
            if (parts) {
                parts.forEach(function(part) {
                    const one = readone(part.name, part.bytes);
                    if (one) found.push(one);
                });
                continue;
            }
        }
        const one = readone(file.name, bytes);
        if (one) found.push(one);
    }

    if (!found.length) {
        say("Nothing in there opened", true);
        return;
    }
    // the richest profile first, then the plain text, then the raw dumps
    const rank = {settings: 0, plain: 1, binary: 2};
    found.sort(function(a, b) {
        return rank[a.kind] - rank[b.kind]
            || (b.save ? b.save.fields.length : 0) - (a.save ? a.save.fields.length : 0);
    });
    held = found;
    openat = 0;
    document.body.classList.add("loaded");
    document.body.classList.remove("edited", "athome");
    drawtabs();
    paint();
    const settings = found.filter(function(one) {return one.kind !== "binary"}).length;
    say(found.length + " files opened, " + settings + " of them as settings."
        + " Nothing was uploaded.");
}

/*//////////////////////////////////////////////////////////////////////*/

function grab(bytes, name, type) {
    const url = URL.createObjectURL(new Blob([bytes], {type: type}));
    const link = document.createElement("a");
    link.href = url;
    link.download = name;
    link.click();
    setTimeout(function() {URL.revokeObjectURL(url)}, 4000);
}

/* the prize lists hold shop item names, so the shop's own data feeds the
   suggestions - one fetch of a file already sitting in the repo */
function loadnames() {
    fetch("../shop/shop.json").then(function(reply) {
        return reply.ok ? reply.json() : null;
    }).then(function(book) {
        if (!book) return;
        document.querySelector("#shopitems").innerHTML = book.items.map(function(item) {
            return "<option value=\"" + escaped(item.name) + "\"></option>";
        }).join("");
    }).catch(function() {});
}

function wire() {
    const picker = document.querySelector(".picker input");
    picker.addEventListener("change", function() {take(picker.files)});

    const drop = document.querySelector(".drop");
    ["dragenter", "dragover"].forEach(function(name) {
        drop.addEventListener(name, function(e) {
            e.preventDefault();
            drop.classList.add("over");
        });
    });
    ["dragleave", "drop"].forEach(function(name) {
        drop.addEventListener(name, function(e) {
            e.preventDefault();
            drop.classList.remove("over");
        });
    });
    drop.addEventListener("drop", function(e) {
        if (e.dataTransfer && e.dataTransfer.files.length) take(e.dataTransfer.files);
    });

    document.querySelector(".topbar").addEventListener("click", function(e) {
        const part = e.target.closest(".parts button[data-key]");
        if (!part) return;
        held[openat].section = part.dataset.key;
        playsound("click", 0.7);
        paint();
        window.scrollTo(0, 0);
    });
    document.querySelector(".filerows").addEventListener("click", function(e) {
        const button = e.target.closest("button[data-at]");
        if (!button) return;
        openat = Number(button.dataset.at);
        playsound("click", 0.7);
        drawtabs();
        paint();
        window.scrollTo(0, 0);
    });
    document.addEventListener("click", function(e) {
        if (e.target.closest(".pick")) return;
        document.querySelectorAll(".pick.open").forEach(function(one) {
            one.classList.remove("open");
        });
    });

    document.querySelector(".back").addEventListener("click", function() {
        playsound("click", 0.7);
        document.body.classList.toggle("athome");
        window.scrollTo(0, 0);
    });

    document.querySelector(".dosave").addEventListener("click", function() {
        const one = held[openat];
        if (!one) return;
        playsound("click", 0.7);
        grab(bytesof(one), one.file, "application/octet-stream");
        document.body.classList.remove("edited");
    });
}

wire();
wiresheet();
loadnames();
loadsounds(["click"]);
