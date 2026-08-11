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
// most bool fields store "true"/"false", but a few (the char-typed
// has_<season>_puzzle flags) store a plain "1"/"0" - data-zeroone tells
// index.js which pair to write back on toggle rather than guessing
function boolbox(at, value, kind) {
    const zeroone = kind === "bool01";
    const on = zeroone ? value === "1" : value === "true";
    return "<button class=\"toggle\" type=\"button\""
        + " data-at=\"" + at + "\" data-role=\"bool\"" + (zeroone ? " data-zeroone=\"1\"" : "") + ">"
        + "<img src=\"assets/images/toggle" + (on ? "on" : "off") + ".webp\" alt=\"\" draggable=\"false\">"
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

/* MLRender source, straight out of the binary - see fields.js. the trophy
   blurbs only ever use three tags: <color X> runs until the next <color> or
   the end, <BR> is a line break, and <if #cond==0>...</if> wraps DAILY
   DUDE's one conditional reminder (#got_daily_dude can't be evaluated from
   a save file alone, so the wrapper is dropped and the text inside is
   always shown rather than guessed at). LastNews is the same format but a
   full popup layout with tags trophy blurbs never use - <br N> (a spacing
   parameter), <link URL;text> (kept as text, URL dropped - a preview pane
   isn't a place to open one from anyway), and layout-only ones
   (<setup>/<page>/<center>/<font>/<blink>/<img>/<os ...>/<valign>) with no
   plain-text equivalent worth building. those get a blanket strip at the
   end rather than a named case each, so a markup tag this hasn't seen
   before disappears instead of leaking into the preview as literal text */
function mltohtml(text) {
    const flat = String(text).replace(/<\/?if[^>]*>/gi, "")
        .replace(/<link[^>]*>/gi, "").replace(/<\/link>/gi, "")
        .replace(/(<br[^>]*>\s*){2,}/gi, "\n").replace(/<br[^>]*>/gi, "\n");
    const runs = flat.split(/<color\s+([^>]+)>/i);
    const clean = function(run) {return escaped(run).replace(/&lt;[^&]*&gt;/g, "")};
    let out = clean(runs[0]).replace(/\n/g, "<br>");
    for (let i = 1; i < runs.length; i += 2) {
        out += "<span style=\"color:" + csscolor(runs[i]) + "\">"
            + clean(runs[i + 1] || "").replace(/\n/g, "<br>") + "</span>";
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

// a fixed set of item names, not free text - a chip that isn't one of them
// (an id the shop doesn't know, or one from before a rename) stays selected
// and marked unknown rather than silently dropped
function itemoptions(bit) {
    const found = shopitemnames.indexOf(bit) >= 0;
    let out = bit ? "" : "<option value=\"\"" + (found ? "" : " selected") + "></option>";
    if (bit && !found) {
        out += "<option value=\"" + escaped(bit) + "\" selected>(unknown) " + escaped(bit) + "</option>";
    }
    return out + shopitemnames.map(function(name) {
        return "<option value=\"" + escaped(name) + "\"" + (name === bit ? " selected" : "") + ">"
            + escaped(name) + "</option>";
    }).join("");
}

function namelistbox(at, value, sep) {
    // a trailing separator is how the game marks the end, so it is kept
    const tail = value.endsWith(sep);
    const bits = value.split(sep).filter(function(bit, idx, all) {
        return bit !== "" || idx < all.length - 1;
    });
    return "<div class=\"namelist\" data-tail=\"" + (tail ? 1 : 0) + "\">"
        + bits.map(function(bit, idx) {
            return "<span class=\"chip\"><select data-at=\"" + at + "\" data-role=\"listpart\""
                + " data-sep=\"" + escaped(sep) + "\" data-idx=\"" + idx + "\">"
                + itemoptions(bit) + "</select>"
                + "<button class=\"chipoff\" type=\"button\" data-at=\"" + at + "\""
                + " data-role=\"listdrop\" data-idx=\"" + idx + "\">&times;</button></span>";
        }).join("")
        + "<button class=\"add\" type=\"button\" data-at=\"" + at + "\" data-role=\"listadd\""
        + " data-sep=\"" + escaped(sep) + "\">Add</button></div>";
}

function blobbox(value) {
    return "<span class=\"blob\">" + value.length + " bytes, not text</span>";
}

// a fixed short list of real values (PrivacyPolicy's two ad-consent strings,
// so far) - a stored value outside the list stays selected and marked
// unknown, same honesty rule as the shop item chips above
function pickbox(at, value, options) {
    const found = options.some(function(o) {return o.value === value});
    let out = found ? "" : "<option value=\"" + escaped(value) + "\" selected>(unknown) "
        + escaped(value) + "</option>";
    out += options.map(function(o) {
        return "<option value=\"" + escaped(o.value) + "\"" + (o.value === value ? " selected" : "") + ">"
            + escaped(o.label) + "</option>";
    }).join("");
    return "<select data-at=\"" + at + "\" data-role=\"text\">" + out + "</select>";
}

// CurrentProfile is a free-text folder name naming whichever profile.cfg is
// active - a dropdown of the profiles actually in this backup beats typing
// one by hand, but a name that doesn't match any loaded profile (a backup
// missing that folder, or one renamed since) stays selected and editable
// rather than silently swapped for the first one in the list
function profilebox(at, value) {
    const names = held.filter(function(one) {return one.profile})
        .map(function(one) {return one.path.split("/").filter(Boolean).slice(-2)[0]});
    const found = names.indexOf(value) >= 0;
    let out = found ? "" : "<option value=\"" + escaped(value) + "\" selected>(not in this backup) "
        + escaped(value) + "</option>";
    out += names.map(function(name) {
        return "<option value=\"" + escaped(name) + "\"" + (name === value ? " selected" : "") + ">"
            + escaped(name) + "</option>";
    }).join("");
    return "<select data-at=\"" + at + "\" data-role=\"text\">" + out + "</select>";
}

// LastNews is MLRender source for the whole news popup - same markup as the
// trophy blurbs, just paragraphs long instead of a sentence, so a single-line
// text box was unreadable and unusable. shows a live mltohtml() preview
// beside the raw source in a modal rather than fake a full markup editor
function richtextbox(at, value) {
    return "<button class=\"richtextopen\" type=\"button\" data-role=\"opentext\" data-at=\"" + at + "\">"
        + "Edit (" + value.length + " characters)</button>";
}

function richtextmodalhtml(at, value) {
    return "<div class=\"modalback\" data-role=\"closetext\">"
        + "<div class=\"modal\">"
        + "<div class=\"modalhead\"><b>Last news</b>"
        + "<button type=\"button\" data-role=\"closetext\">&times;</button></div>"
        + "<div class=\"modalbody\">"
        + "<textarea data-at=\"" + at + "\" data-role=\"textsource\" spellcheck=\"false\">"
        + escaped(value) + "</textarea>"
        + "<div class=\"modalpreview\"><div class=\"newscard\" data-role=\"textpreview\">"
        + mltohtml(value) + "</div></div>"
        + "</div></div></div>";
}

// announcedpuzzletoday only ever gets compared against "today" as an opaque
// day-count (see datainfo/README) - there is no reachable date to decode it
// into, so the useful control isn't a picker, it's a way to force the two
// sides of that comparison to differ again so the game announces on next load
function resettablebox(at, value, resetto) {
    return "<div class=\"resettable\">" + textbox(at, value, "int")
        + "<button type=\"button\" data-role=\"resetfield\" data-at=\"" + at + "\""
        + " data-reset=\"" + resetto + "\">Clear</button></div>";
}

function controlhtml(at, value, info) {
    const kind = controlkind(value, info);
    if (kind === "trophies") return trophybox(at, value);
    if (kind === "blob") return blobbox(value);
    if (kind === "bool" || kind === "bool01") return boolbox(at, value, kind);
    if (kind === "volume") return volumebox(at, value);
    if (kind === "date") return datebox(at, value);
    if (kind === "datelist") return datelistbox(at, value);
    if (kind === "flags") return flagsbox(at, value);
    if (kind === "numlist") return numlistbox(at, value);
    if (kind === "namelist") return namelistbox(at, value, info.sep || ",");
    if (kind === "pick") return pickbox(at, value, info.options);
    if (kind === "profile") return profilebox(at, value);
    if (kind === "richtext") return richtextbox(at, value);
    if (kind === "resettable") return resettablebox(at, value, info.resetto || "0");
    return textbox(at, value, kind);
}

/*//////////////////////////////////////////////////////////////////////*/

// a list control keeps no state of its own, so a change re-reads every box in
// the same group and joins them again
function joinparts(host, sep) {
    const parts = Array.prototype.map.call(host.querySelectorAll("input, select"), function(box) {
        return box.value;
    });
    if (host.classList.contains("namelist") && host.dataset.tail === "1") parts.push("");
    return parts.join(sep);
}
