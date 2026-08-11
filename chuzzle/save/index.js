const appkey = "V!qSYY66wOOg8Yf7n1b7!63rmmh8b3K&+%sB16js2V7R?Zeh1591&073!l4rO594*";
const profilekey = "eh1591&073!l4rO594*V!qSYY<link _close><custom id=button;"
    + "width=(#width/2)-25;height=58;ext=Okay;></link>66wOOh8b3K&+%sB16js2V7R?"
    + "Zeh1591&073!l4rO594*V!qSYY66wOOg8Yf7n1b7!63rmm";

const line = /^([A-Za-z_][A-Za-z0-9_.]{1,40})=([\s\S]*?)(\r?)$/;
const wordpage = 512;

let held = [];
let openat = 0;
let shopitemnames = [];

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

function binaryviewof(one) {
    if (decodeprotoroot(one.bytes)) return "proto";
    if (decodechunktree(one.bytes)) return "chunks";
    return "words";
}

function sectionsof(one) {
    if (one.kind === "binary") {
        if (one.file === "puzzle.dat") return [{key: "puzzles", name: "Puzzles"}];
        if (one.file === "chuzzle1_zen.save" && zenrecord(one)) {
            return [{key: "zen", name: "Zen"}];
        }
        if (markerfields(one)) return [{key: "marker", name: "Marker"}, {key: "words", name: "Raw"}];
        if (one.file === "chuzzle.save" && classicgrid(one)) {
            return [{key: "grid", name: "Levels"}, {key: "chunks", name: "Raw"}];
        }
        const view = binaryviewof(one);
        const name = view === "proto" ? "Fields" : view === "chunks" ? "Chunks" : "Words";
        return [{key: view, name: name}];
    }
    const used = {};
    one.save.fields.forEach(function(field) {
        if (/^(current|best|alltime)_m/.test(field.name)) {used.records = true; return}
        used[fieldinfo(field.name).panel] = true;
    });
    const out = panels.filter(function(panel) {return used[panel.key]});
    return out.length ? out : [{key: "rest", name: "Other"}];
}

function fieldhtml(save, at) {
    const field = save.fields[at];
    const info = fieldinfo(field.name);
    const stamp = readgamedate(field.value);
    const note = info.unknown ? "unknown" : info.note || (stamp && info.control !== "date" ? stamp : "");
    const kind = controlkind(field.value, info);
    return "<div class=\"row" + (iswide(kind, field.value) ? " stacked" : "") + "\">"
        + "<span class=\"rname\"><b>" + escaped(info.label) + "</b>"
        + "<i>" + escaped(field.name) + (note ? " (" + escaped(note) + ")" : "") + "</i></span>"
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

    let out = "<p class=\"aside\">" + one.bytes.length + " bytes, " + words + " little-endian words"
        + (spare ? ", " + spare + " left over." : ".") + "</p>";
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

/*//////////////////////////////////////////////////////////////////////*/

function paint() {
    const one = held[openat];
    const host = document.querySelector(".sheets");
    if (!one) {host.innerHTML = ""; return}

    const list = sectionsof(one);
    if (!list.some(function(s) {return s.key === one.section})) one.section = list[0].key;
    const now = list.find(function(s) {return s.key === one.section});

    document.querySelector(".partsrow").style.display = list.length > 1 ? "" : "none";
    document.querySelector(".parts").innerHTML = list.map(function(section) {
        return "<button type=\"button\" data-key=\"" + section.key + "\""
            + (section.key === one.section ? " class=\"on\"" : "") + ">"
            + escaped(section.name) + "</button>";
    }).join("");

    let body;
    if (one.kind === "binary" && one.file === "puzzle.dat") {
        body = puzzlepageshtml();
    } else if (one.kind === "binary" && one.section === "zen") {
        body = zenpagehtml();
    } else if (one.kind === "binary" && one.section === "marker") {
        body = markerpagehtml();
    } else if (one.kind === "binary" && one.section === "words") {
        body = wordshtml(one);
    } else if (one.kind === "binary" && one.section === "grid") {
        body = classicgridhtml(one);
    } else if (one.kind === "binary") {
        const view = binaryviewof(one);
        if (view === "proto") {
            body = "<p class=\"aside\">Google Play Services feature-flag bookkeeping, not game data.</p>"
                + protohtml(decodeprotoroot(one.bytes));
        } else if (view === "chunks") {
            body = chunkhtml(one, decodechunktree(one.bytes), []);
        } else {
            body = wordshtml(one);
        }
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
    host.innerHTML = "<section class=\"section\"><h2>" + escaped(now.name) + "</h2>"
        + body + "</section>";
}

/*//////////////////////////////////////////////////////////////////////*/

function setvalue(at, value) {
    held[openat].save.fields[at].value = value;
    document.body.classList.add("edited");
    persist();
}

function valueat(at, idx) {
    const whole = held[openat].save.fields[at].value;
    return idx == null ? whole : whole.split(",")[idx] || "0";
}

function setvalueat(at, idx, value) {
    if (idx == null) {
        setvalue(at, value);
        return;
    }
    const bits = held[openat].save.fields[at].value.split(",");
    bits[idx] = value;
    setvalue(at, bits.join(","));
}

function mirrorbackup(one) {
    const twin = held.find(function(h) {
        return h.file === one.file + ".backup"
            && h.path.slice(0, h.path.length - h.file.length) === one.path.slice(0, one.path.length - one.file.length);
    });
    if (twin) twin.bytes = new Uint8Array(one.bytes);
}

function synctrophy(idx, on) {
    const ach = held.find(function(h) {return h.file === "_achievements.dat"});
    const achid = trophydata[idx] && achtrophyof(trophydata[idx]);
    if (!ach || !achid) return;
    achtoggle(ach, achid, on);
    document.body.classList.add("edited");
    persist();
}

function setword(idx, value) {
    const one = held[openat];
    const view = new DataView(one.bytes.buffer, one.bytes.byteOffset);
    const want = Math.max(0, Math.min(4294967295, Math.floor(Number(value) || 0)));
    view.setUint32(idx * 4, want, true);
    document.body.classList.add("edited");
    persist();
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
        } else if (role === "chunkbytes") {
            const len = Number(box.dataset.len);
            const clean = box.value.replace(/\s+/g, "");
            if (!/^[0-9a-fA-F]*$/.test(clean) || clean.length !== len * 2) return;
            const off = Number(box.dataset.off);
            const bytes = held[openat].bytes;
            for (let i = 0; i < len; i++) bytes[off + i] = parseInt(clean.substr(i * 2, 2), 16);
            mirrorbackup(held[openat]);
            document.body.classList.add("edited");
            persist();
        } else if (role === "chunkfield") {
            const num = Number(box.value);
            if (!isFinite(num)) return;
            const type = box.dataset.type;
            const view = new DataView(held[openat].bytes.buffer, held[openat].bytes.byteOffset
                + Number(box.dataset.off));
            if (type === "float") view.setFloat32(0, num, true);
            else if (type === "int") view.setInt32(0, Math.trunc(num), true);
            else if (type === "uint") view.setUint32(0, Math.trunc(num), true);
            else if (type === "short") view.setInt16(0, Math.trunc(num), true);
            else if (type === "ushort") view.setUint16(0, Math.trunc(num), true);
            else held[openat].bytes[Number(box.dataset.off)] = Math.trunc(num) & 0xff;
            mirrorbackup(held[openat]);
            document.body.classList.add("edited");
            persist();
        } else if (role === "zenfield") {
            const num = Number(box.value);
            if (!isFinite(num)) return;
            const one = held[openat];
            const spot = zenrecord(one);
            if (!spot) return;
            zenwrite(one, spot, box.dataset.name, num);
            if (box.dataset.name === "slots lit") zensetlit(one, spot, Math.max(0, Math.min(5, num)));
            zenrefresh(one, spot);
            document.body.classList.add("edited");
            persist();
        } else if (role === "markerfield") {
            const num = Number(box.value);
            if (!isFinite(num)) return;
            const one = held[openat];
            const field = markerfields(one).find(function(f) {return f.off === Number(box.dataset.off)});
            markerwrite(one, field, num);
            if (field.stamp) {
                const stamp = stamphint(num);
                box.closest(".row").querySelector(".rname i").textContent =
                    field.note + (stamp ? " - " + stamp : "");
            }
            document.body.classList.add("edited");
            persist();
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
            const zeroone = button.dataset.zeroone === "1";
            const cur = held[openat].save.fields[at].value;
            const on = zeroone ? cur !== "1" : cur !== "true";
            setvalue(at, zeroone ? (on ? "1" : "0") : (on ? "true" : "false"));
            button.querySelector("img").src = "assets/images/toggle" + (on ? "on" : "off") + ".webp";
            playsound("click", 0.6);
        } else if (role === "flag") {
            const idx = Number(button.dataset.idx);
            const bits = held[openat].save.fields[at].value.split(",");
            const now = bits[idx].trim() !== "1";

            bits[idx] = now ? "1" : "0";
            button.classList.toggle("on", now);
            setvalue(at, bits.join(","));
            if (held[openat].save.fields[at].name === "GotTrophy") synctrophy(idx, now);
            playsound("click", 0.5);
        } else if (role === "listdrop") {
            const group = button.closest(".namelist");
            const sep = button.parentElement.querySelector("select").dataset.sep;
            button.parentElement.remove();
            setvalue(at, joinparts(group, sep));
            playsound("click", 0.6);
        } else if (role === "opencal") {
            const idx = button.dataset.idx == null ? null : Number(button.dataset.idx);
            const pick = button.closest(".pick");
            const open = !pick.classList.contains("open");
            document.querySelectorAll(".pick.open").forEach(function(one) {
                one.classList.remove("open");
            });
            if (open) {
                pick.classList.add("open");
                pick.querySelector(".pickmenu").innerHTML =
                    calhtml(at, valueat(at, idx), 0, idx);
            }
            playsound("click", 0.6);
        } else if (role === "calstep") {
            const idx = button.dataset.idx == null ? null : Number(button.dataset.idx);
            const pick = button.closest(".pick");
            pick.querySelector(".pickmenu").innerHTML =
                calhtml(at, valueat(at, idx), Number(button.dataset.shift), idx);
            playsound("click", 0.5);
        } else if (role === "calpick") {
            const idx = button.dataset.idx == null ? null : Number(button.dataset.idx);
            const pick = button.closest(".pick");
            setvalueat(at, idx, button.dataset.stamp);
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
        } else if (role === "piece") {
            const one = held.find(function(h) {return h.file === "puzzle.dat"});
            const tree = one && copychunktree(one.bytes);
            if (!tree || !tree.children[2]) return;
            const giftnode = tree.children[2];
            const pieceid = Number(button.dataset.piece);

            const gifts = giftlistids(giftnode);
            const giftat = gifts.indexOf(pieceid);
            const removed = giftat >= 0;
            if (removed) gifts.splice(giftat, 1);
            else gifts.push(pieceid);
            giftlistset(giftnode, gifts);
            one.bytes = encodechunktree(tree);
            document.body.classList.add("edited");
            persist();
            playsound("click", removed ? 0.5 : 0.7);
            paint();
        } else if (role === "zenslot") {
            const one = held[openat];
            const spot = zenrecord(one);
            if (!spot) return;
            const idx = Number(button.dataset.idx);
            zensetlit(one, spot, zenlit(one, spot) === idx ? idx - 1 : idx);
            playsound("click", 0.7);
            zenrefresh(one, spot);
            document.body.classList.add("edited");
            persist();
        } else if (role === "zenbool") {
            const one = held[openat];
            const spot = zenrecord(one);
            if (!spot) return;
            const on = zenread(one, spot, button.dataset.name) === 0;
            zenwrite(one, spot, button.dataset.name, on ? 1 : 0);
            playsound("click", 0.7);
            button.querySelector("img").src = "assets/images/toggle" + (on ? "on" : "off") + ".webp";
            document.body.classList.add("edited");
            persist();
        } else if (role === "bonusflag") {
            const bonus = held.find(function(h) {return h.file === "puzzlebonus.dat"});
            if (!bonus) return;
            const off = Number(button.dataset.off);
            const on = bonus.bytes[off] === 0;
            bonus.bytes[off] = on ? 1 : 0;
            button.classList.toggle("on", on);
            document.body.classList.add("edited");
            persist();
            playsound("click", on ? 0.7 : 0.5);
        } else if (role === "levelunlock") {
            const one = held[openat];
            const off = Number(button.dataset.off);
            const view = new DataView(one.bytes.buffer, one.bytes.byteOffset);
            const flags = view.getUint16(off, true);
            const on = (flags & 2) === 0;
            view.setUint16(off, on ? flags | 2 : flags & ~2, true);
            button.classList.toggle("on", on);
            const tally = document.querySelector(".tally");
            if (tally) {
                const total = document.querySelectorAll(".levelsq").length;
                const unlocked = document.querySelectorAll(".levelsq.on").length;
                tally.textContent = unlocked + " of " + total + " unlocked";
            }
            document.body.classList.add("edited");
            persist();
            playsound("click", on ? 0.7 : 0.5);
        } else if (role === "unlockalllevels") {
            const one = held[openat];
            const grid = classicgrid(one);
            if (!grid) return;
            grid.squares.forEach(function(s) {
                grid.view.setUint16(s.off, grid.view.getUint16(s.off, true) | 2, true);
            });
            document.body.classList.add("edited");
            persist();
            playsound("click", 0.7);
            paint();
        } else if (role === "listadd") {
            const group = button.closest(".namelist");
            const sep = button.dataset.sep;
            const chip = document.createElement("span");
            chip.className = "chip";
            chip.innerHTML = "<select data-at=\"" + at + "\" data-role=\"listpart\""
                + " data-sep=\"" + escaped(sep) + "\">" + itemoptions("") + "</select>"
                + "<button class=\"chipoff\" type=\"button\" data-at=\"" + at
                + "\" data-role=\"listdrop\">&times;</button>";
            group.insertBefore(chip, button);
            chip.querySelector("select").focus();
            playsound("click", 0.6);
        } else if (role === "resetfield") {
            setvalue(at, button.dataset.reset);
            button.previousElementSibling.value = button.dataset.reset;
            playsound("click", 0.7);
        } else if (role === "opentext") {
            opentextmodal(at);
            playsound("click", 0.6);
        }
    });
}

/*//////////////////////////////////////////////////////////////////////*/

function opentextmodal(at) {
    const host = document.createElement("div");
    host.innerHTML = richtextmodalhtml(at, held[openat].save.fields[at].value);
    const modal = host.firstElementChild;
    document.body.appendChild(modal);
    document.body.classList.add("modalopen");

    const close = function() {
        modal.remove();
        document.body.classList.remove("modalopen");
    };
    modal.addEventListener("click", function(e) {
        if (e.target.dataset.role === "closetext") close();
    });
    modal.querySelector("[data-role=textsource]").addEventListener("input", function(e) {
        setvalue(at, e.target.value);
        modal.querySelector("[data-role=textpreview]").innerHTML = newshtml(e.target.value);
    });
}

/*//////////////////////////////////////////////////////////////////////*/

function hastab(one) {
    return one.file !== "puzzlebonus.dat" && one.file !== "storage-info.pb"
        && one.file !== "_achievements.dat" && !/\.backup$/.test(one.file);
}

function stripof(seat, mine) {
    const strip = document.querySelector(seat);
    const rows = held.map(function(one, at) {return {one: one, at: at}})
        .filter(function(pair) {return pair.one.profile === mine && hastab(pair.one)});
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

// tab names!
const filenames = {
    "chuzzle2.cfg": "App settings",
    "settings.txt": "System",
    "chuzzarium.cfg": "Chuzzarium",
    "chuzzle.save": "Classic",
    "chuzzle1_zen.save": "Zen",
    "puzzle.dat": "Puzzles",
    "puzzlebonus.dat": "Puzzle bonuses",
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
    const base = {label: shortname(name), file: file, path: name,
        profile: file === "profile.cfg"};
    const crypt = readsave(bytes);
    if (crypt) return Object.assign(base, {kind: "settings", save: crypt});
    const plain = readplain(bytes);
    if (plain) return Object.assign(base, {kind: "plain", save: plain});
    return Object.assign(base, {kind: "binary", bytes: new Uint8Array(bytes)});
}

/*//////////////////////////////////////////////////////////////////////*/

const storekey = "chuzzlesave";
const homekey = "chuzzlesavehome";

function sethome(home) {
    document.body.classList.toggle("athome", home);
    try {
        if (home) localStorage.setItem(homekey, "1");
        else localStorage.removeItem(homekey);
    } catch (e) {}
}

function washome() {
    try {return localStorage.getItem(homekey) === "1"}
    catch (e) {return false}
}

function tobase64(bytes) {return btoa(aslatin(bytes))}
function frombase64(text) {return frombytes(atob(text))}

function serialize() {
    return {
        openat: openat,
        files: held.map(function(one) {
            const base = {label: one.label, file: one.file, path: one.path,
                profile: one.profile, kind: one.kind, section: one.section, page: one.page};
            if (one.kind === "binary") return Object.assign(base, {bytes64: tobase64(one.bytes)});
            return Object.assign(base, {
                key: one.save.key, text: one.save.text, fields: one.save.fields,
            });
        }),
    };
}

function persist() {
    if (!held.length) return;
    try {localStorage.setItem(storekey, JSON.stringify(serialize()))}
    catch (e) {}
}

function restore() {
    let raw;
    try {raw = localStorage.getItem(storekey)}
    catch (e) {return false}
    if (!raw) return false;
    let book;
    try {book = JSON.parse(raw)}
    catch (e) {return false}
    if (!book || !Array.isArray(book.files) || !book.files.length) return false;

    held = book.files.map(function(one) {
        if (one.kind === "binary") {
            return {label: one.label, file: one.file, path: one.path, profile: one.profile,
                kind: "binary", section: one.section, page: one.page,
                bytes: frombase64(one.bytes64)};
        }
        return {label: one.label, file: one.file, path: one.path, profile: one.profile,
            kind: one.kind, section: one.section, page: one.page,
            save: {key: one.key, text: one.text, fields: one.fields}};
    });
    openat = Math.max(0, Math.min(held.length - 1, book.openat || 0));
    return true;
}

function forgetsave() {
    try {localStorage.removeItem(storekey)} catch (e) {}
    held = [];
    openat = 0;
}

async function take(files) {
    await fielddataready;
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
    const rank = {settings: 0, plain: 1, binary: 2};
    found.sort(function(a, b) {
        return rank[a.kind] - rank[b.kind]
            || (b.save ? b.save.fields.length : 0) - (a.save ? a.save.fields.length : 0);
    });
    held = found;
    openat = 0;
    document.body.classList.add("loaded");
    document.body.classList.remove("edited");
    sethome(false);
    drawtabs();
    paint();
    persist();
    const settings = found.filter(function(one) {return one.kind !== "binary"}).length;
    say(found.length + " files opened, " + settings + " of them as settings."
        + " Nothing was uploaded.");
}

/*//////////////////////////////////////////////////////////////////////*/

function zipname() {
    const top = held[0].path.split("/")[0];
    const shared = held.every(function(one) {return one.path.split("/")[0] === top});
    return (shared && held[0].path.indexOf("/") >= 0 ? top : "chuzzle-save") + ".zip";
}

function saveeverything() {
    const files = held.map(function(one) {return {name: one.path, bytes: bytesof(one)}});
    grab(zipbytes(files), zipname());
}

function grab(blob, name) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = name;
    link.click();
    setTimeout(function() {URL.revokeObjectURL(url)}, 4000);
}

function loadnames() {
    fetch("../shop/shop.json").then(function(reply) {
        return reply.ok ? reply.json() : null;
    }).then(function(book) {
        if (!book) return;
        shopitemnames = book.items.map(function(item) {return item.name});
        if (document.body.classList.contains("loaded")) paint();
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
        sethome(!document.body.classList.contains("athome"));
        window.scrollTo(0, 0);
    });

    document.querySelector(".dosave").addEventListener("click", function() {
        if (!held.length) return;
        playsound("click", 0.7);
        saveeverything();
        document.body.classList.remove("edited");
    });
}

wire(); wiresheet();
loadnames();
loadsounds(["click"]);

const fielddataready = loadfielddata();
fielddataready.then(function() {
    if (restore()) {
        document.body.classList.add("loaded");
        document.body.classList.toggle("athome", washome());
        drawtabs();
        paint();
    } else {
        sethome(false);
    }
});
