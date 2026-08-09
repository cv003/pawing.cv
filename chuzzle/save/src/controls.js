/*

  the widgets a value gets, picked from its shape. everything writes back into
  one string, since that is all the file holds - a list control re-joins its
  own boxes rather than keeping a parsed copy anywhere.

  each control carries data-at (which field) and, where it is a list, data-idx.
  index.js has one delegated listener for the lot.

*/

function escaped(text) {
    return String(text == null ? "" : text)
        .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}

function printable(value) {
    return !/[\x00-\x08\x0b-\x1f\x7f-\x9f]/.test(value);
}

function controlkind(value, info) {
    if (info.binary || !printable(value)) return "blob";
    if (info.control) return info.control;
    if (value === "true" || value === "false") return "bool";
    if (/^[01](,[01])+$/.test(value)) return "flags";
    if (/^-?\d+(,-?\d+)+$/.test(value)) return "numlist";
    if (/^-?\d+$/.test(value)) return "int";
    if (/^-?\d*\.\d+$/.test(value)) return "float";
    return "text";
}

/*//////////////////////////////////////////////////////////////////////*/

function boolbox(at, value) {
    const on = value === "true";
    return "<button class=\"switch" + (on ? " on" : "") + "\" type=\"button\""
        + " data-at=\"" + at + "\" data-role=\"bool\">"
        + (on ? "On" : "Off") + "</button>";
}

function textbox(at, value, kind) {
    return "<input data-at=\"" + at + "\" data-role=\"text\""
        + " value=\"" + escaped(value) + "\""
        + (kind === "int" || kind === "float" ? " inputmode=\"decimal\"" : "")
        + (value.length > 34 ? " class=\"wide\"" : "") + ">";
}

function volumebox(at, value) {
    const level = Math.round(Math.max(0, Math.min(1, parseFloat(value) || 0)) * 100);
    return "<div class=\"slide\"><input type=\"range\" min=\"0\" max=\"100\" step=\"1\""
        + " data-at=\"" + at + "\" data-role=\"volume\" value=\"" + level + "\">"
        + "<b>" + level + "%</b></div>";
}

// the game writes year-day-month, which no date input will take
function datebox(at, value) {
    const hit = /^(\d{4})(\d{2})(\d{2})$/.exec(value);
    const iso = hit ? hit[1] + "-" + hit[3] + "-" + hit[2] : "";
    return "<div class=\"slide\"><input type=\"date\" data-at=\"" + at + "\""
        + " data-role=\"date\" value=\"" + iso + "\">"
        + "<b>" + escaped(value) + "</b></div>";
}

function flagsbox(at, value) {
    const bits = value.split(",");
    return "<div class=\"flags\">" + bits.map(function(bit, idx) {
        return "<button class=\"flag" + (bit.trim() === "1" ? " on" : "") + "\" type=\"button\""
            + " data-at=\"" + at + "\" data-role=\"flag\" data-idx=\"" + idx + "\""
            + " title=\"#" + (idx + 1) + "\">" + (idx + 1) + "</button>";
    }).join("") + "</div>";
}

function numlistbox(at, value) {
    const bits = value.split(",");
    const wide = bits.length > 6;
    return "<div class=\"numlist" + (wide ? " grid" : "") + "\">"
        + bits.map(function(bit, idx) {
            return "<label class=\"slot\">" + (wide ? "<i>" + (idx + 1) + "</i>" : "")
                + "<input data-at=\"" + at + "\" data-role=\"listpart\" data-sep=\",\""
                + " data-idx=\"" + idx + "\" inputmode=\"decimal\""
                + " value=\"" + escaped(bit) + "\"></label>";
        }).join("") + "</div>";
}

function namelistbox(at, value, sep) {
    // a trailing separator is how the game marks the end, so it is kept
    const tail = value.endsWith(sep);
    const bits = value.split(sep).filter(function(bit, idx, all) {
        return bit !== "" || idx < all.length - 1;
    });
    return "<div class=\"namelist\" data-tail=\"" + (tail ? 1 : 0) + "\">"
        + bits.map(function(bit, idx) {
            return "<span class=\"chip\"><input data-at=\"" + at + "\" data-role=\"listpart\""
                + " data-sep=\"" + escaped(sep) + "\" data-idx=\"" + idx + "\""
                + " list=\"shopitems\" value=\"" + escaped(bit) + "\">"
                + "<button class=\"drop\" type=\"button\" data-at=\"" + at + "\""
                + " data-role=\"listdrop\" data-idx=\"" + idx + "\">&times;</button></span>";
        }).join("")
        + "<button class=\"add\" type=\"button\" data-at=\"" + at + "\" data-role=\"listadd\""
        + " data-sep=\"" + escaped(sep) + "\">Add</button></div>";
}

function blobbox(value) {
    return "<span class=\"blob\">" + value.length + " bytes, not text</span>";
}

function controlhtml(at, value, info) {
    const kind = controlkind(value, info);
    if (kind === "blob") return blobbox(value);
    if (kind === "bool") return boolbox(at, value);
    if (kind === "volume") return volumebox(at, value);
    if (kind === "date") return datebox(at, value);
    if (kind === "flags") return flagsbox(at, value);
    if (kind === "numlist") return numlistbox(at, value);
    if (kind === "namelist") return namelistbox(at, value, info.sep || ",");
    return textbox(at, value, kind);
}

/*//////////////////////////////////////////////////////////////////////*/

// a list control keeps no state of its own, so a change re-reads every box in
// the same group and joins them again
function joinparts(host, sep) {
    const parts = Array.prototype.map.call(host.querySelectorAll("input"), function(box) {
        return box.value;
    });
    if (host.classList.contains("namelist") && host.dataset.tail === "1") parts.push("");
    return parts.join(sep);
}
