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

// classifies an unreadable file's bytes so both the tab label and the body
// agree on which of the three binary views applies - cheap enough to redo
// on every paint since even chuzzarium.cfg's 54KB fails the protobuf check
// on its very first tag
function binaryviewof(one) {
    if (one.file === "_achievements.dat" && parseachievements(one.bytes)) return "achievements";
    if (decodeprotoroot(one.bytes)) return "proto";
    return "words";
}

function sectionsof(one) {
    if (one.kind === "binary") {
        const view = binaryviewof(one);
        const name = view === "achievements" ? "Achievements" : view === "proto" ? "Fields" : "Words";
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

    let out = "<p class=\"aside\">No reader for this one yet, so it opens"
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

// _achievements.dat: uint32 count, then that many {uint32 len, char id[len]
// (a null-terminated Play Games achievement id, or the literal "DAILY_DUDE"
// for the one local-only trophy with no cloud id), float32 percent}. found by
// hand-decoding the hex - it round-trips to zero leftover bytes on a real
// save, so the shape is trustworthy even without a decompile reference
function parseachievements(bytes) {
    if (bytes.length < 4) return null;
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.length);
    let at = 0;
    const count = view.getUint32(at, true); at += 4;
    if (count > 10000) return null;
    const rows = [];
    for (let i = 0; i < count; i++) {
        if (at + 4 > bytes.length) return null;
        const len = view.getUint32(at, true); at += 4;
        if (len > 1000 || at + len + 4 > bytes.length) return null;
        const idtext = aslatin(bytes.subarray(at, at + len)).replace(/\0+$/, "");
        at += len;
        const off = at;
        const pct = view.getFloat32(at, true); at += 4;
        rows.push({idtext: idtext, pct: pct, off: off});
    }
    return at === bytes.length ? rows : null;
}

function achievementshtml(rows) {
    return "<p class=\"aside\">" + rows.length + " cached Play Games achievement entries, decoded"
        + " by shape (no schema needed - see datainfo/README.md). Percent is editable; the id itself"
        + " is read-only, an opaque Play Games id except for the one local-only <b>DAILY_DUDE</b>"
        + " entry.</p><div class=\"achlist\">" + rows.map(function(r) {
            const pct = Math.round(Math.max(0, Math.min(1, r.pct)) * 100);
            return "<div class=\"achrow\"><i>" + escaped(r.idtext) + "</i>"
                + "<div class=\"slide\"><input type=\"range\" min=\"0\" max=\"100\" step=\"1\""
                + " data-role=\"achpct\" data-off=\"" + r.off + "\" value=\"" + pct + "\">"
                + "<b>" + pct + "%</b></div></div>";
        }).join("") + "</div>";
}

/*//////////////////////////////////////////////////////////////////////*/

// a generic protobuf wire-format walker - no .proto schema, so field names
// are unknown, but the shape (field number, wire type, nested messages) is
// enough to make an otherwise-opaque blob readable. read-only: re-encoding
// without the schema risks silently mangling packed/nested fields
function readvarint(bytes, at) {
    let result = 0n, shift = 0n;
    while (at < bytes.length) {
        const b = bytes[at++];
        result |= BigInt(b & 0x7f) << shift;
        if (!(b & 0x80)) return {value: result, at: at};
        shift += 7n;
        if (shift > 63n) return null;
    }
    return null;
}

function decodeproto(bytes, start, end, depth) {
    if (depth > 6) return null;
    const out = [];
    let at = start;
    while (at < end) {
        const tag = readvarint(bytes, at);
        if (!tag) return null;
        const field = Number(tag.value >> 3n);
        const wire = Number(tag.value & 7n);
        at = tag.at;
        if (field === 0 || field > 5000) return null;
        const entry = {field: field, wire: wire};
        if (wire === 0) {
            const v = readvarint(bytes, at);
            if (!v) return null;
            entry.value = v.value;
            at = v.at;
        } else if (wire === 1) {
            if (at + 8 > end) return null;
            entry.value = new DataView(bytes.buffer, bytes.byteOffset + at, 8).getBigUint64(0, true);
            at += 8;
        } else if (wire === 2) {
            const len = readvarint(bytes, at);
            if (!len) return null;
            at = len.at;
            const l = Number(len.value);
            if (l < 0 || at + l > end) return null;
            entry.bytes = bytes.subarray(at, at + l);
            entry.nested = decodeproto(bytes, at, at + l, depth + 1);
            at += l;
        } else if (wire === 5) {
            if (at + 4 > end) return null;
            entry.value = new DataView(bytes.buffer, bytes.byteOffset + at, 4).getUint32(0, true);
            at += 4;
        } else {
            return null;
        }
        out.push(entry);
    }
    return out;
}

function decodeprotoroot(bytes) {
    const out = decodeproto(bytes, 0, bytes.length, 0);
    return out && out.length ? out : null;
}

function printablebytes(bytes) {
    for (let i = 0; i < bytes.length; i++) {
        const b = bytes[i];
        if (b !== 9 && b !== 10 && b !== 13 && (b < 32 || b > 126)) return false;
    }
    return true;
}

function protohtml(entries) {
    return "<div class=\"protolist\">" + entries.map(function(e) {
        let val;
        if (e.wire === 2 && e.nested) {
            val = protohtml(e.nested);
        } else if (e.wire === 2 && printablebytes(e.bytes)) {
            val = "<span class=\"protostr\">" + escaped(aslatin(e.bytes)) + "</span>";
        } else if (e.wire === 2) {
            val = "<span class=\"protoraw\">" + e.bytes.length + " bytes: "
                + Array.prototype.map.call(e.bytes, function(b) {
                    return b.toString(16).padStart(2, "0");
                }).join(" ") + "</span>";
        } else {
            val = "<span class=\"protoraw\">" + String(e.value) + "</span>";
        }
        return "<div class=\"protofield\"><b>field " + e.field + "</b>" + val + "</div>";
    }).join("") + "</div>";
}

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
    if (one.kind === "binary") {
        const view = binaryviewof(one);
        if (view === "achievements") {
            body = achievementshtml(parseachievements(one.bytes));
        } else if (view === "proto") {
            body = "<p class=\"aside\">Decoded as protobuf - field numbers only, since the .proto"
                + " schema isn't available to name them. Read-only, to avoid mangling anything"
                + " packed or nested on save.</p>" + protohtml(decodeprotoroot(one.bytes));
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

// datelist buttons carry data-idx so a comma slot is read/written on its own
// rather than the whole field - plain single-date pickers just omit it
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
        } else if (role === "achpct") {
            const one = held[openat];
            new DataView(one.bytes.buffer, one.bytes.byteOffset)
                .setFloat32(Number(box.dataset.off), box.value / 100, true);
            box.parentElement.querySelector("b").textContent = box.value + "%";
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

// tab names!
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
    document.body.classList.remove("edited", "athome");
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
        document.body.classList.toggle("athome");
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
        drawtabs();
        paint();
    }
});
