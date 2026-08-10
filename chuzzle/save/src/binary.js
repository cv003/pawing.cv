/*
  readers and renderers for the save files that are raw binary rather than
  key=value text - _achievements.dat, the protobuf blob android drops in, and
  the game's own SyncBuffer chunk tree (chuzzarium.cfg, puzzle.dat,
  puzzlebonus.dat, chuzzle.save, chuzzle1_zen.save). split out of index.js
  once that file went past a thousand lines. writes still go through the
  handlers in index.js's wiresheet()
*/

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
    return "<div class=\"achlist\">" + rows.map(function(r) {
            const pct = Math.round(Math.max(0, Math.min(1, r.pct)) * 100);
            return "<div class=\"achrow\"><i>" + escaped(r.idtext) + "</i>"
                + "<div class=\"slide\"><input type=\"range\" min=\"0\" max=\"100\" step=\"1\""
                + " data-role=\"achpct\" data-off=\"" + r.off + "\" value=\"" + pct + "\">"
                + "<b>" + pct + "%</b></div></div>";
        }).join("") + "</div>";
}

/*//////////////////////////////////////////////////////////////////////*/

// puzzle.dat: root -> [A: puzzle count int, B: one chunk per puzzle (data
// is a 4-byte item count, one 14-byte child per collected piece: int piece
// id, bool, char, two floats), C: gifts array, D: reserved]. the per-item
// shape is confirmed byte-exact against a real save (zero leftover bytes at
// 14 bytes/item) - a purely-decompiled reading of the same call site had
// suggested a buggy 28-byte overload, corrected here by direct decoding,
// same lesson as the chuzzle1_zen.save Plane/RaptPoint mixup. see
// datainfo/README.md. real piece art comes from Puzzles_DYNA/<fname>_Color.png
// in the decompile, converted to assets/images/pieces/<fname>.webp
function puzzlepiecehtml(puzzleidx, piece, held) {
    return "<button class=\"piece" + (held ? " on" : "") + "\" type=\"button\""
        + " data-role=\"piece\" data-puzzle=\"" + puzzleidx + "\" data-piece=\"" + piece.id + "\""
        + " title=\"" + escaped(piece.name) + "\">"
        + "<img src=\"assets/images/pieces/" + escaped(piece.fname) + ".webp\" alt=\"\" draggable=\"false\">"
        + "<i>" + escaped(piece.name) + "</i></button>";
}

function bonusflagshtml() {
    const bonus = held.find(function(h) {return h.file === "puzzlebonus.dat"});
    if (!bonus) return "";
    const root = decodechunktree(bonus.bytes);
    if (!root || !root.children.length) return "";
    const child = root.children[0];
    const view = new DataView(bonus.bytes.buffer, bonus.bytes.byteOffset);
    const count = view.getUint32(child.off, true);
    const flagsoff = child.off + 4;
    let out = "";
    for (let i = 0; i < count; i++) {
        const on = bonus.bytes[flagsoff + i] !== 0;
        out += "<button class=\"bonusflag" + (on ? " on" : "") + "\" type=\"button\""
            + " data-role=\"bonusflag\" data-off=\"" + (flagsoff + i) + "\">" + (i + 1) + "</button>";
    }
    return "<div class=\"puzzlecard\"><h3>Puzzle bonuses"
        + "<i>puzzlebonus.dat, merged in - meaning of each flag isn't confirmed</i></h3>"
        + "<div class=\"bonusflags\">" + out + "</div></div>";
}

// chunk C - gHasGiftList - is a flat Array<int> living directly in one
// chunk's own data bytes (no sub-chunks): uint32 count then that many int
// ids. HasGift()/GuaranteeGift() (decompiled.c:418105/418128) read and
// write this exact list - it turned out to be the one that actually tracks
// "collected", not the per-puzzle chunks (see datainfo/README.md)
function giftlistids(node) {
    const view = new DataView(node.data.buffer, node.data.byteOffset);
    const count = view.getUint32(0, true);
    const ids = [];
    for (let i = 0; i < count; i++) ids.push(view.getInt32(4 + i * 4, true));
    return ids;
}

function giftlistset(node, ids) {
    const data = new Uint8Array(4 + ids.length * 4);
    const view = new DataView(data.buffer);
    view.setUint32(0, ids.length, true);
    ids.forEach(function(id, i) {view.setInt32(4 + i * 4, id, true)});
    node.data = data;
}

function puzzlepageshtml() {
    const one = held.find(function(h) {return h.file === "puzzle.dat"});
    if (!one) return "<p class=\"aside\">No puzzle.dat in this backup.</p>";
    const tree = copychunktree(one.bytes);
    if (!tree || !tree.children[1] || !tree.children[2]) {
        return "<p class=\"aside\">Couldn't parse puzzle.dat as the expected chunk shape.</p>";
    }
    // the per-puzzle item chunks (chunk B) turned out not to mean "collected"
    // at all - one real save had a piece sitting there that the player didn't
    // actually have. gHasGiftList (chunk C) is what HasGift()/GuaranteeGift()
    // actually check, and it alone matched real in-game state - see
    // datainfo/README.md. chunk B is left untouched, not read from or written
    const collected = {};
    giftlistids(tree.children[2]).forEach(function(id) {collected[id] = true});
    const cards = puzzledata.puzzles.map(function(name, idx) {
        const pieces = puzzledata.pieces.filter(function(p) {return p.puzzle === idx});
        const got = pieces.filter(function(p) {return collected[p.id]}).length;
        return "<div class=\"puzzlecard\"><h3>\"" + escaped(name) + "\"<span>" + got + " of "
            + pieces.length + "</span></h3><div class=\"piecegrid\">" + pieces.map(function(p) {
                return puzzlepiecehtml(idx, p, !!collected[p.id]);
            }).join("") + "</div></div>";
    });
    return bonusflagshtml() + cards.join("");
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

// the game's own SyncBuffer format (chuzzarium.cfg, puzzle.dat, puzzlebonus.dat,
// chuzzle.save, chuzzle1_zen.save) - a chunk is [uint32 dataLen][dataLen raw
// bytes][uint32 subChunkCount][subChunkCount more chunks], recursively, with
// one trailing uint32 (a GlobalID/object-reference table count) after the
// root chunk. every sample file has an empty (0) reference table, so that's
// the only shape confirmed byte-exact - a nonzero one is rejected rather than
// guessed at, since what follows it isn't known. see datainfo/README.md
function decodechunk(bytes, view, at, end) {
    if (at + 8 > end) return null;
    const len = view.getUint32(at, true); at += 4;
    if (at + len > end) return null;
    const off = at; at += len;
    if (at + 4 > end) return null;
    const subs = view.getUint32(at, true); at += 4;
    if (subs > 200000) return null;
    const children = [];
    for (let i = 0; i < subs; i++) {
        const sub = decodechunk(bytes, view, at, end);
        if (!sub) return null;
        children.push(sub.chunk);
        at = sub.at;
    }
    return {chunk: {off: off, len: len, children: children}, at: at};
}

function decodechunktree(bytes) {
    if (bytes.length < 12) return null;
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.length);
    const root = decodechunk(bytes, view, 0, bytes.length - 4);
    if (!root || root.at !== bytes.length - 4) return null;
    return view.getUint32(bytes.length - 4, true) === 0 ? root.chunk : null;
}

function bytehex(bytes) {
    return Array.prototype.map.call(bytes, function(b) {return b.toString(16).padStart(2, "0")}).join(" ");
}

// a mutable copy of the same tree (owned Uint8Array per node instead of an
// offset into the original buffer) for the few files where an edit needs to
// add/remove a whole chunk rather than just overwrite bytes in place -
// re-encodes back to a fresh byte array afterward
function copychunk(bytes, node) {
    return {
        data: bytes.slice(node.off, node.off + node.len),
        children: node.children.map(function(c) {return copychunk(bytes, c)}),
    };
}

function copychunktree(bytes) {
    const root = decodechunktree(bytes);
    return root ? copychunk(bytes, root) : null;
}

function encodechunk(node) {
    const kids = node.children.map(encodechunk);
    const kidlen = kids.reduce(function(n, k) {return n + k.length}, 0);
    const out = new Uint8Array(8 + node.data.length + kidlen);
    const view = new DataView(out.buffer);
    view.setUint32(0, node.data.length, true);
    out.set(node.data, 4);
    view.setUint32(4 + node.data.length, node.children.length, true);
    let at = 8 + node.data.length;
    kids.forEach(function(k) {out.set(k, at); at += k.length});
    return out;
}

function encodechunktree(root) {
    const body = encodechunk(root);
    const out = new Uint8Array(body.length + 4);
    out.set(body, 0);
    return out; // trailing reference-table count stays zero
}

// path is the list of child-indices from the root, e.g. [1,2,4] = root's
// 2nd child's 3rd child's 5th child - it identifies a node's position in
// the tree so a semantic overlay can be draped over the otherwise-generic
// chunk reader without changing how bytes are actually read or written.
// labels/shapes below only cover what the decompile work in datainfo/
// actually confirmed - see datainfo/README.md for what each field size and
// offset is based on, and where the semantics (not just the byte layout)
// are still a guess rather than a confirmed name
const chunkpiece = [
    {name: "char 1", type: "char"}, {name: "int 1", type: "int"},
    {name: "point 1 x", type: "float"}, {name: "point 1 y", type: "float"},
    {name: "point 2 x", type: "float"}, {name: "point 2 y", type: "float"},
    {name: "point 3 x", type: "float"}, {name: "point 3 y", type: "float"},
    {name: "float 1", type: "float"}, {name: "float 2", type: "float"}, {name: "bool 1", type: "bool"},
    {name: "float 3", type: "float"}, {name: "float 4", type: "float"}, {name: "bool 2", type: "bool"},
    {name: "char 2", type: "char"}, {name: "char 3", type: "char"}, {name: "float 5", type: "float"},
    {name: "bool 3", type: "bool"}, {name: "bool 4", type: "bool"},
    {name: "point 4 x", type: "float"}, {name: "point 4 y", type: "float"},
    {name: "float 6", type: "float"}, {name: "char 4", type: "char"},
];
const chunkrect = [
    {name: "x", type: "float"}, {name: "y", type: "float"},
    {name: "w", type: "float"}, {name: "h", type: "float"},
];
// Board::SyncZen - the cash-out popup (decompiled.c:94824-95247) confirms
// the reward tier names (zenchuzzle/zenrainbow/zentrinkets/goldtrinkets/
// rainbowtrinkets); the rest are display names for confirmed mechanisms
// (UpdateZen/LevelupZen, decompiled.c:162429/209806), not in-binary labels
const chunkzen = [
    {name: "has zen data", type: "bool"}, {name: "int 1", type: "int"},
    {name: "trinkets", type: "int"}, {name: "gold trinkets", type: "int"},
    {name: "rainbow trinkets", type: "int"}, {name: "session active", type: "bool"},
    {name: "combo meter", type: "float"}, {name: "level progress", type: "float"},
    {name: "slots lit", type: "char"},
    {name: "rainbow slot 1", type: "float"}, {name: "rainbow slot 2", type: "float"},
    {name: "rainbow slot 3", type: "float"}, {name: "rainbow slot 4", type: "float"},
    {name: "rainbow slot 5", type: "float"}, {name: "float 2", type: "float"},
    {name: "rainbow anim 1", type: "float"}, {name: "rainbow anim 2", type: "float"},
    {name: "rainbow anim 3", type: "float"}, {name: "rainbow anim 4", type: "float"},
    {name: "rainbow anim 5", type: "float"}, {name: "float 3", type: "float"},
    {name: "leveling up", type: "bool"}, {name: "fizz meter", type: "float"},
    {name: "rainbows finished", type: "int"}, {name: "rainbow bar", type: "float"},
    {name: "fizz active", type: "bool"},
];

function chunkinfo(file, path) {
    if (file === "puzzle.dat") {
        if (path.length === 1) {
            return [null, "Puzzle count", "Puzzles", "Gifts unlocked", "(reserved)"][path[0]] || null;
        }
        if (path.length === 2 && path[0] === 1) {
            const name = puzzledata.puzzles[path[1]];
            return {label: name ? "\"" + name + "\"" : "Puzzle " + path[1]};
        }
        if (path.length === 3 && path[0] === 1) return {label: "Piece " + (path[2] + 1)};
    } else if (file === "chuzzarium.cfg") {
        if (path.length === 1) {
            const label = ["Chuzzarium state", "Rooms", "Placed items", "Item queue A", "Item queue B"][path[0]];
            return label ? {label: label} : null;
        }
        if (path.length === 2 && path[0] === 1) {
            return {label: "Room " + (path[1] + 1),
                shape: [{name: "short 1", type: "short"}, {name: "short 2", type: "short"}].concat(chunkrect)};
        }
    } else if (file === "chuzzle1_zen.save") {
        if (path.length === 1) {
            if (path[0] === 0) return {label: "Game state"};
            if (path[0] === 2) return {label: "Board rect", shape: chunkrect};
        }
        if (path.length === 2 && path[0] === 1) {
            const label = ["Board state", "Eggs", "Chuzzle grid", "Zen progress", "(quest flag)", "Stunt pieces"];
            if (path[1] === 3) return {label: "Zen progress", shape: chunkzen};
            return label[path[1]] ? {label: label[path[1]]} : null;
        }
        if (path.length === 3 && path[0] === 1 && path[1] === 2) {
            return {label: "Piece " + (path[2] + 1), shape: chunkpiece};
        }
    } else if (file === "chuzzle.save") {
        if (path.length === 1) {
            const label = ["Overworld state (has a confirmed engine bug - see datainfo/README)",
                "Grid squares", "Containers", "Extra"][path[0]];
            return label ? {label: label} : null;
        }
        if (path.length === 2 && path[0] === 1) {
            return {label: "Square " + (path[1] + 1), shape: [
                {name: "short 1", type: "short"}, {name: "int 1", type: "int"},
                {name: "char 1", type: "char"}, {name: "char 2", type: "char"}, {name: "char 3", type: "char"},
                {name: "bool 1", type: "bool"}, {name: "int 2", type: "int"},
            ]};
        }
        if (path.length === 2 && path[0] === 2) return {label: "Container " + (path[1] + 1)};
    }
    return null;
}

const chunktypesize = {char: 1, bool: 1, short: 2, ushort: 2, int: 4, uint: 4, float: 4};

function chunktypedhtml(one, off, field) {
    const view = new DataView(one.bytes.buffer, one.bytes.byteOffset + off, chunktypesize[field.type]);
    const value = field.type === "float" ? view.getFloat32(0, true).toFixed(3)
        : field.type === "int" ? view.getInt32(0, true)
        : field.type === "uint" ? view.getUint32(0, true)
        : field.type === "short" ? view.getInt16(0, true)
        : field.type === "ushort" ? view.getUint16(0, true)
        : one.bytes[off];
    return "<label class=\"chunkfield\"><i>" + escaped(field.name) + "</i>"
        + "<input data-role=\"chunkfield\" data-off=\"" + off + "\" data-type=\"" + field.type
        + "\" inputmode=\"decimal\" value=\"" + value + "\"></label>";
}

// a furniture/piece id showing up as a plain 4-byte int is otherwise
// meaningless - naming it when it matches a known table (from
// puzzledata.cfg or Chuzzarium's item-type switch) costs nothing since
// it's a read-only hint alongside the still-editable hex, not a structural
// guess about the chunk layout itself
// scoped to chuzzarium furniture ids only - puzzle.dat piece ids (1-99ish)
// collide constantly with ordinary small counts elsewhere in that file (a
// puzzle's own item-count is indistinguishable from a piece id by value
// alone), and pieces never actually sit in a bare 4-byte leaf on their own,
// so there's no safe attachment point for that hint there
function chunkidhint(file, value) {
    return file === "chuzzarium.cfg" ? chuzzariumdata.furniture[value] || "" : "";
}

function chunkleafhtml(one, chunk, path) {
    const bytes = one.bytes.subarray(chunk.off, chunk.off + chunk.len);
    let hint = "";
    if (chunk.len === 4) {
        const view = new DataView(one.bytes.buffer, one.bytes.byteOffset + chunk.off, 4);
        const num = view.getInt32(0, true);
        const named = chunkidhint(one.file, num);
        hint = " <i>(int " + num + (named ? " - " + escaped(named) : "")
            + ", float " + view.getFloat32(0, true).toFixed(3) + ")</i>";
    } else if (printablebytes(bytes) && chunk.len > 1) {
        hint = " <i>\"" + escaped(aslatin(bytes)) + "\"</i>";
    }
    return "<div class=\"chunkleaf\"><input data-role=\"chunkbytes\" data-off=\"" + chunk.off
        + "\" data-len=\"" + chunk.len + "\" value=\"" + escaped(bytehex(bytes)) + "\">" + hint + "</div>";
}

function chunkhtml(one, chunk, path) {
    const info = chunkinfo(one.file, path) || {};
    let out = info.label ? "<div class=\"chunklabel\">" + escaped(info.label) + "</div>" : "";
    if (info.shape && info.shape.reduce(function(n, f) {return n + chunktypesize[f.type]}, 0) === chunk.len) {
        let off = chunk.off;
        out += "<div class=\"chunktyped\">" + info.shape.map(function(f) {
            const html = chunktypedhtml(one, off, f);
            off += chunktypesize[f.type];
            return html;
        }).join("") + "</div>";
    } else if (chunk.len) {
        out += chunkleafhtml(one, chunk, path);
    } else if (!chunk.children.length) {
        out += "<div class=\"chunkleaf empty\">empty</div>";
    }
    if (chunk.children.length) {
        out += "<div class=\"chunklist\">" + chunk.children.map(function(c, i) {
            return "<div class=\"chunknode\">" + chunkhtml(one, c, path.concat(i)) + "</div>";
        }).join("") + "</div>";
    }
    return out;
}

/*//////////////////////////////////////////////////////////////////////*/

/* the zen record (chunk [1,3], 89 bytes, laid out by Board::SyncZen) is the
   only part of chuzzle1_zen.save that survives a session - everything else in
   there is a snapshot of one paused board. Board::UpdateZen
   (decompiled.c:162451) and Board::LevelupZen (:209806) between them pin down
   what each counter does, and Game::CashOutZen prices every tier and totals
   them at decompiled.c:95243, so the whole record can be shown as plain
   counters with a live coin total instead of a hex box. the raw chunk view is
   still one subtab over for the four fields that have no confirmed meaning */

const zenprice = {slot: 2, bar: 15, trinkets: 150, gold: 1000, rainbow: 7500};

function zenrecord(one) {
    const root = decodechunktree(one.bytes);
    const chunk = root && root.children[1] && root.children[1].children[3];
    if (!chunk || chunk.len !== 89) return null;
    const spot = {};
    let off = chunk.off;
    chunkzen.forEach(function(f) {spot[f.name] = {off: off, type: f.type}; off += chunktypesize[f.type]});
    return spot;
}

function zenread(one, spot, name) {
    const f = spot[name];
    const view = new DataView(one.bytes.buffer, one.bytes.byteOffset + f.off);
    if (f.type === "float") return view.getFloat32(0, true);
    if (f.type === "int") return view.getInt32(0, true);
    return one.bytes[f.off];
}

function zenwrite(one, spot, name, value) {
    const f = spot[name];
    const view = new DataView(one.bytes.buffer, one.bytes.byteOffset + f.off);
    if (f.type === "float") view.setFloat32(0, value, true);
    else if (f.type === "int") view.setInt32(0, Math.trunc(value), true);
    else one.bytes[f.off] = Math.trunc(value) & 0xff;
}

// a slot counts as lit when its fill float is negative - that's the exact test
// CashOutZen uses (decompiled.c:94793), and UpdateZen lights slot n by writing
// -90 into it, left to right, keeping "slots lit" as the running index
function zenlit(one, spot) {
    let n = 0;
    for (let i = 1; i <= 5; i++) if (zenread(one, spot, "rainbow slot " + i) < 0) n++;
    return n;
}

function zensetlit(one, spot, want) {
    for (let i = 1; i <= 5; i++) {
        zenwrite(one, spot, "rainbow slot " + i, i <= want ? -90 : 0);
        zenwrite(one, spot, "rainbow anim " + i, i <= want ? -90 : 0);
    }
    zenwrite(one, spot, "slots lit", want);
}

function zentotal(one, spot) {
    return zenlit(one, spot) * zenprice.slot
        + Math.trunc(zenread(one, spot, "rainbow bar")) * zenprice.bar
        + zenread(one, spot, "trinkets") * zenprice.trinkets
        + zenread(one, spot, "gold trinkets") * zenprice.gold
        + zenread(one, spot, "rainbow trinkets") * zenprice.rainbow;
}

function zenrowhtml(one, spot, title, note, name, round) {
    const raw = zenread(one, spot, name);
    const value = round ? Math.round(raw * 1000) / 1000 : raw;
    return "<div class=\"row\"><p class=\"rname\"><b>" + escaped(title) + "</b>"
        + (note ? "<i>" + escaped(note) + "</i>" : "") + "</p><span class=\"rctl\">"
        + "<input data-role=\"zenfield\" data-name=\"" + escaped(name)
        + "\" inputmode=\"decimal\" value=\"" + value + "\"></span></div>";
}

function zenboolhtml(one, spot, title, note, name) {
    const on = zenread(one, spot, name) !== 0;
    return "<div class=\"row\"><p class=\"rname\"><b>" + escaped(title) + "</b>"
        + (note ? "<i>" + escaped(note) + "</i>" : "") + "</p><span class=\"rctl\">"
        + "<button class=\"toggle\" type=\"button\" data-role=\"zenbool\" data-name=\"" + escaped(name)
        + "\"><img src=\"assets/images/toggle" + (on ? "on" : "off")
        + ".webp\" alt=\"\" draggable=\"false\"></button></span></div>";
}

// patches the derived bits in place rather than repainting, since a repaint
// mid-typing would drop the caret out of whatever box you're editing
function zenrefresh(one, spot) {
    const total = document.querySelector(".zentotal");
    if (total) total.textContent = zentotal(one, spot) + " coins";
    const lit = zenlit(one, spot);
    document.querySelectorAll(".zenslot").forEach(function(button) {
        button.classList.toggle("on", Number(button.dataset.idx) <= lit);
    });
    const count = document.querySelector("[data-role=\"zenfield\"][data-name=\"slots lit\"]");
    if (count && count !== document.activeElement) count.value = zenread(one, spot, "slots lit");
}

function zenpagehtml() {
    const one = held[openat];
    const spot = zenrecord(one);
    if (!spot) return "<div class=\"group\"><div class=\"row\"><p class=\"rname\"><b>No zen record"
        + "</b><i>this file has no saved zen session</i></p></div></div>";

    const lit = zenlit(one, spot);
    const slots = [1, 2, 3, 4, 5].map(function(i) {
        return "<button class=\"zenslot" + (i <= lit ? " on" : "") + "\" type=\"button\""
            + " data-role=\"zenslot\" data-idx=\"" + i + "\">" + i + "</button>";
    }).join("");

    return "<div class=\"group\">"
        + zenrowhtml(one, spot, "Trinkets", "150 coins each, a 7th rolls into a gold one", "trinkets")
        + zenrowhtml(one, spot, "Gold trinkets", "1000 coins each, a 6th rolls into a rainbow one", "gold trinkets")
        + zenrowhtml(one, spot, "Rainbow trinkets", "7500 coins each, no cap", "rainbow trinkets")
        + zenrowhtml(one, spot, "Rainbow bar", "15 coins each, 0 to 6 - filling it to 6 grants the COLOR OF ZEN trophy", "rainbow bar", true)
        + zenrowhtml(one, spot, "Rainbows finished", "how many times the bar has filled and reset", "rainbows finished")
        + "<div class=\"row\"><p class=\"rname\"><b>Rainbow slots</b>"
        + "<i>2 coins each, lit left to right</i></p>"
        + "<span class=\"rctl\"><span class=\"zenslots\">" + slots + "</span></span></div>"
        + "<div class=\"row\"><p class=\"rname\"><b>Worth on cash out</b>"
        + "<i>what the game would pay for everything above</i></p>"
        + "<span class=\"rctl\"><b class=\"zentotal\">" + zentotal(one, spot) + " coins</b></span></div>"
        + "</div>"
        + "<div class=\"group zensecond\">"
        + zenboolhtml(one, spot, "Session in progress", "a board is paused mid-run", "session active")
        + zenrowhtml(one, spot, "Level bar", "0 to 10000, lights the next slot on the way up", "level progress", true)
        + zenrowhtml(one, spot, "Slots lit", "the game's own count, kept in step with the buttons above", "slots lit")
        + zenrowhtml(one, spot, "Combo meter", "grows while a run is going", "combo meter", true)
        + zenrowhtml(one, spot, "Fizz meter", "0 to 3, the end-of-bar particle burst", "fizz meter", true)
        + "</div>";
}
