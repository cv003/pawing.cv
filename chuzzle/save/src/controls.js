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
    return kind === "namelist" || kind === "flags" || kind === "trophies" || kind === "datelist"
        || (kind === "numlist" && value.split(",").length > 4);
}

/*//////////////////////////////////////////////////////////////////////*/

// the whole switch - track, knob, ring and label - is one baked texture in
// FunDialog.png (off at (59,93)-(145,123), on at (122,125)-(208,155)), so the
// two states are just an image swap rather than anything built from parts
function boolbox(at, value) {
    const on = value === "true";
    return "<button class=\"toggle\" type=\"button\""
        + " data-at=\"" + at + "\" data-role=\"bool\">"
        + "<img src=\"assets/toggle" + (on ? "on" : "off") + ".webp\" alt=\"\" draggable=\"false\">"
        + "</button>";
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

// idx is set only inside a datelist - one field holding several comma dates
function pickattrs(at, idx) {
    return " data-at=\"" + at + "\"" + (idx == null ? "" : " data-idx=\"" + idx + "\"");
}

function datebox(at, value, idx) {
    const when = readstamp(value);
    return "<div class=\"pick date\"" + pickattrs(at, idx) + ">"
        + "<button class=\"picknow\" type=\"button\" data-role=\"opencal\"" + pickattrs(at, idx) + ">"
        + (when ? escaped(saydate(when)) : "Not a date")
        + "<span class=\"caret\">^</span></button>"
        + "<div class=\"pickmenu cal\"></div></div>";
}

// the grid is rebuilt on every month step, so it takes the month to show -
// styled after the daily-do's own calendar (dailydo/index.css .calgrid)
function calhtml(at, value, shift, idx) {
    const now = readstamp(value) || new Date();
    const view = new Date(now.getFullYear(), now.getMonth() + (shift || 0), 1);
    const first = (view.getDay() + 6) % 7;
    const days = new Date(view.getFullYear(), view.getMonth() + 1, 0).getDate();
    const attrs = pickattrs(at, idx);

    let out = "<div class=\"calhead\">"
        + "<button type=\"button\" data-role=\"calstep\"" + attrs
        + " data-shift=\"" + ((shift || 0) - 1) + "\">&lt;</button>"
        + "<span>" + monthnames[view.getMonth()] + " " + view.getFullYear() + "</span>"
        + "<button type=\"button\" data-role=\"calstep\"" + attrs
        + " data-shift=\"" + ((shift || 0) + 1) + "\">&gt;</button></div><div class=\"calgrid\">";
    out += daynames.map(function(one) {return "<span class=\"wd\">" + one + "</span>"}).join("");
    for (let i = 0; i < first; i++) out += "<span class=\"pad\"></span>";
    for (let day = 1; day <= days; day++) {
        const same = now.getDate() === day && now.getMonth() === view.getMonth()
            && now.getFullYear() === view.getFullYear();
        out += "<button type=\"button\" data-role=\"calpick\"" + attrs
            + " data-stamp=\"" + writestamp(new Date(view.getFullYear(), view.getMonth(), day))
            + "\"" + (same ? " class=\"on\"" : "") + ">" + day + "</button>";
    }
    return out + "</div>";
}

// LastDailySeed: a couple of comma-joined date stamps rather than one
function datelistbox(at, value) {
    const bits = value.split(",");
    return "<div class=\"numlist datelist\">" + bits.map(function(bit, idx) {
        return "<label class=\"slot\"><i>" + (idx + 1) + "</i>" + datebox(at, bit, idx) + "</label>";
    }).join("") + "</div>";
}

/*//////////////////////////////////////////////////////////////////////*/

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

/* the trophy blurbs are MLRender source, straight out of the binary - see
   fields.js. only three tags ever show up in them: <color X> runs until the
   next <color> or the end, <BR> is a line break, and <if #cond==0>...</if>
   wraps DAILY DUDE's one conditional reminder. #got_daily_dude can't be
   evaluated from a save file alone, so the wrapper is dropped and the text
   inside is always shown rather than guessed at */
function mltohtml(text) {
    const flat = String(text).replace(/<\/?if[^>]*>/gi, "").replace(/<br\s*\/?>/gi, "\n");
    const runs = flat.split(/<color\s+([^>]+)>/i);
    let out = escaped(runs[0]).replace(/\n/g, "<br>");
    for (let i = 1; i < runs.length; i += 2) {
        out += "<span style=\"color:" + csscolor(runs[i]) + "\">"
            + escaped(runs[i + 1] || "").replace(/\n/g, "<br>") + "</span>";
    }
    return out;
}

/* GotTrophy: one card per trophy with its real name and description, pulled
   from the binary itself. #25 is blank on purpose, it is never assigned in
   the game's own table. clicking a card toggles it, same as the plain flag
   buttons everywhere else. two to a row, same as the numbered grid controls */
function trophybox(at, value) {
    const bits = value.split(",");
    const on = bits.filter(function(bit) {return bit.trim() === "1"}).length;
    return "<div class=\"flagwrap\"><span class=\"tally\">" + on + " of " + bits.length
        + " held</span><div class=\"trophies\">" + bits.map(function(bit, idx) {
            const troph = trophydata[idx] || {name: "", desc: ""};
            const held = bit.trim() === "1";
            if (!troph.name) {
                return "<div class=\"trophy empty\"><i>#" + (idx + 1) + " - unused</i></div>";
            }
            return "<button class=\"trophy" + (held ? " on" : "") + "\" type=\"button\""
                + " data-at=\"" + at + "\" data-role=\"flag\" data-idx=\"" + idx + "\">"
                + "<span class=\"trophyicon\"></span>"
                + "<span class=\"trophytext\"><b>" + escaped(troph.name) + "</b>"
                + "<i>" + mltohtml(troph.desc) + "</i></span></button>";
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
    if (kind === "trophies") return trophybox(at, value);
    if (kind === "blob") return blobbox(value);
    if (kind === "bool") return boolbox(at, value);
    if (kind === "volume") return volumebox(at, value);
    if (kind === "date") return datebox(at, value);
    if (kind === "datelist") return datelistbox(at, value);
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
