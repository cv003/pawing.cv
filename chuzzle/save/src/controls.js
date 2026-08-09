/*

  the widgets a value gets, picked from its shape. everything writes back into
  one string, since that is all the file holds - a list control re-joins its
  own boxes rather than keeping a parsed copy anywhere.

  the toggle and the slider are the game's own, off datainfo/media/settings:
  a dark #2d0027 pill with the knob to the right for off and to the left with
  an orange ring for on, and a purple track with a navy groove and a gold star
  for a thumb.

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

// the ones that need a whole row to themselves
function iswide(kind, value) {
    return kind === "namelist" || kind === "flags"
        || (kind === "numlist" && value.split(",").length > 4);
}

/*//////////////////////////////////////////////////////////////////////*/

function boolbox(at, value) {
    const on = value === "true";
    return "<button class=\"toggle" + (on ? " on" : "") + "\" type=\"button\""
        + " data-at=\"" + at + "\" data-role=\"bool\">"
        + "<span class=\"knob\">" + (on ? "on" : "off") + "</span></button>";
}

function textbox(at, value, kind) {
    return "<input data-at=\"" + at + "\" data-role=\"text\""
        + " value=\"" + escaped(value) + "\""
        + (kind === "int" || kind === "float" ? " inputmode=\"decimal\"" : "")
        + (value.length > 30 ? " class=\"wide\"" : "") + ">";
}

function volumebox(at, value) {
    const level = Math.round(Math.max(0, Math.min(1, parseFloat(value) || 0)) * 100);
    return "<div class=\"slide\"><input type=\"range\" min=\"0\" max=\"100\" step=\"1\""
        + " data-at=\"" + at + "\" data-role=\"volume\" value=\"" + level + "\">"
        + "<b>" + level + "%</b></div>";
}

/*//////////////////////////////////////////////////////////////////////*/

const monthnames = ["January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"];
const daynames = ["M", "T", "W", "T", "F", "S", "S"];

// the game writes year-day-month, so nothing native will take it
function readstamp(value) {
    const hit = /^(\d{4})(\d{2})(\d{2})$/.exec(String(value).trim());
    if (!hit) return null;
    const day = Number(hit[2]);
    const month = Number(hit[3]);
    if (!day || day > 31 || !month || month > 12) return null;
    const when = new Date(Number(hit[1]), month - 1, day);
    return when.getDate() === day ? when : null;
}

function writestamp(when) {
    const pad = function(n) {return String(n).padStart(2, "0")};
    return String(when.getFullYear()) + pad(when.getDate()) + pad(when.getMonth() + 1);
}

function saydate(when) {
    return when.toLocaleDateString("en-GB", {day: "numeric", month: "long", year: "numeric"});
}

function datebox(at, value) {
    const when = readstamp(value);
    return "<div class=\"pick date\" data-at=\"" + at + "\">"
        + "<button class=\"picknow\" type=\"button\" data-role=\"opencal\" data-at=\"" + at + "\">"
        + (when ? escaped(saydate(when)) : "Not a date")
        + "<span class=\"caret\">^</span></button>"
        + "<div class=\"pickmenu cal\"></div></div>";
}

// the grid is rebuilt on every month step, so it takes the month to show
function calhtml(at, value, shift) {
    const now = readstamp(value) || new Date();
    const view = new Date(now.getFullYear(), now.getMonth() + (shift || 0), 1);
    const first = (view.getDay() + 6) % 7;
    const days = new Date(view.getFullYear(), view.getMonth() + 1, 0).getDate();

    let out = "<div class=\"calhead\">"
        + "<button type=\"button\" data-role=\"calstep\" data-at=\"" + at + "\""
        + " data-shift=\"" + ((shift || 0) - 1) + "\">&lt;</button>"
        + "<span>" + monthnames[view.getMonth()] + " " + view.getFullYear() + "</span>"
        + "<button type=\"button\" data-role=\"calstep\" data-at=\"" + at + "\""
        + " data-shift=\"" + ((shift || 0) + 1) + "\">&gt;</button></div><div class=\"calgrid\">";
    out += daynames.map(function(one) {return "<i>" + one + "</i>"}).join("");
    for (let i = 0; i < first; i++) out += "<span></span>";
    for (let day = 1; day <= days; day++) {
        const same = now.getDate() === day && now.getMonth() === view.getMonth()
            && now.getFullYear() === view.getFullYear();
        out += "<button type=\"button\" data-role=\"calpick\" data-at=\"" + at + "\""
            + " data-stamp=\"" + writestamp(new Date(view.getFullYear(), view.getMonth(), day))
            + "\"" + (same ? " class=\"on\"" : "") + ">" + day + "</button>";
    }
    return out + "</div>";
}

/*//////////////////////////////////////////////////////////////////////*/

/* GotTrophy is the one 40-long flag list with a real identity per slot - the
   trophy room shows a name and blurb per index, but those come off the
   server's language table (RComm), not anything in the apk, so there is no
   local source to pull them from. the grid stays numbered rather than
   guessing at names that would just be wrong */
function flagsbox(at, value) {
    const bits = value.split(",");
    const on = bits.filter(function(bit) {return bit.trim() === "1"}).length;
    return "<div class=\"flagwrap\"><span class=\"tally\">" + on + " of " + bits.length
        + " held</span><div class=\"flags\">" + bits.map(function(bit, idx) {
            return "<button class=\"flag" + (bit.trim() === "1" ? " on" : "") + "\" type=\"button\""
                + " data-at=\"" + at + "\" data-role=\"flag\" data-idx=\"" + idx + "\""
                + " title=\"trophy #" + (idx + 1) + "\">"
                + (idx + 1) + "</button>";
        }).join("") + "</div></div>";
}

function numlistbox(at, value) {
    const bits = value.split(",");
    const wide = bits.length > 4;
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
                + "<button class=\"chipoff\" type=\"button\" data-at=\"" + at + "\""
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
