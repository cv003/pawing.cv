/*

  opens a Chuzzle 2 save in the browser and writes it back out. nothing leaves
  the page - there is no upload anywhere in here.

  both encrypted files are a repeating-key xor and nothing else, which is all
  IOBuffer::Encrypt does. the two keys are string literals in the binary, and
  the bare "%s" in each is part of the key rather than a placeholder: Profile::
  Load memcpys the string verbatim, so dropping those two characters shifts
  everything past index 122 into noise. see datainfo/README.md.

  the file is held as latin-1 text, one character per byte, so the parts this
  page does not understand - the board in progress, the driver blob - survive
  a round trip untouched.

*/

const appkey = "V!qSYY66wOOg8Yf7n1b7!63rmmh8b3K&+%sB16js2V7R?Zeh1591&073!l4rO594*";
const profilekey = "eh1591&073!l4rO594*V!qSYY<link _close><custom id=button;"
    + "width=(#width/2)-25;height=58;ext=Okay;></link>66wOOh8b3K&+%sB16js2V7R?"
    + "Zeh1591&073!l4rO594*V!qSYY66wOOg8Yf7n1b7!63rmm";

const line = /^([A-Za-z_][A-Za-z0-9_.]{1,40})=([\s\S]*?)(\r?)$/;

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

/* try both keys and keep whichever actually reads as settings. the test is
   that the very first line is a name=value, which the unencrypted binaries
   never manage - xoring one of those does throw up the odd stray match
   further in, so counting matches alone lets chuzzarium.cfg through */
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
    return best;
}

function rebuild(save) {
    const rows = save.text.split("\n");
    save.fields.forEach(function(field) {
        rows[field.at] = field.name + "=" + field.value + field.cr;
    });
    return frombytes(rows.join("\n"));
}

/*//////////////////////////////////////////////////////////////////////*/

function escaped(text) {
    return String(text == null ? "" : text)
        .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}

function printable(value) {
    return !/[\x00-\x08\x0b-\x1f\x7f-\x9f]/.test(value);
}

function rowof(field, at) {
    const info = fieldinfo(field.name);
    const kind = info.binary || !printable(field.value) ? "blob" : valuekind(field.value);
    const stamp = readgamedate(field.value);
    const note = stamp || info.note || "";

    let control;
    if (kind === "blob") {
        control = "<span class=\"blob\">" + field.value.length + " bytes, not text</span>";
    } else if (kind === "bool") {
        control = "<button class=\"flip" + (field.value === "true" ? " on" : "") + "\""
            + " type=\"button\" data-at=\"" + at + "\">"
            + (field.value === "true" ? "Yes" : "No") + "</button>";
    } else {
        control = "<input data-at=\"" + at + "\" value=\"" + escaped(field.value) + "\""
            + (kind === "int" || kind === "float" ? " inputmode=\"decimal\"" : "")
            + (field.value.length > 30 ? " class=\"wide\"" : "") + ">";
    }
    return "<div class=\"field\" data-kind=\"" + kind + "\">"
        + "<label><b>" + escaped(info.label) + "</b>"
        + "<i>" + escaped(field.name) + (note ? " ~ " + escaped(note) : "") + "</i></label>"
        + control + "</div>";
}

function statrow(save, stat) {
    const cells = ["current", "best", "alltime"].map(function(era) {
        const at = save.fields.findIndex(function(f) {return f.name === era + "_" + stat});
        if (at < 0) return "<span class=\"missing\">-</span>";
        return "<input data-at=\"" + at + "\" inputmode=\"decimal\" value=\""
            + escaped(save.fields[at].value) + "\">";
    });
    return "<div class=\"statrow\"><span>" + escaped(prettyname(stat)) + "</span>"
        + cells.join("") + "</div>";
}

function recordspanel(save) {
    const has = statnames.filter(function(stat) {
        return save.fields.some(function(f) {return f.name === "alltime_" + stat});
    });
    if (!has.length) return "";
    return "<section class=\"panel\"><h2>Records</h2>"
        + "<div class=\"stats\"><div class=\"statrow head\"><span></span>"
        + "<span>This game</span><span>Best</span><span>All-time</span></div>"
        + has.map(function(stat) {return statrow(save, stat)}).join("")
        + "</div></section>";
}

function paint() {
    const save = held[openat] && held[openat].save;
    const host = document.querySelector(".sheets");
    if (!save) {
        host.innerHTML = "";
        return;
    }
    const bins = {};
    save.fields.forEach(function(field, at) {
        const info = fieldinfo(field.name);
        if (info.panel === "records") return;
        if (/^(current|best|alltime)_m/.test(field.name)) return;
        (bins[info.panel] = bins[info.panel] || []).push(rowof(field, at));
    });

    host.innerHTML = panels.map(function(panel) {
        if (panel.key === "records") return recordspanel(save);
        const rows = bins[panel.key];
        if (!rows || !rows.length) return "";
        return "<section class=\"panel\"><h2>" + panel.name + "</h2>"
            + "<div class=\"fields\">" + rows.join("") + "</div></section>";
    }).join("");
    wirefields();
}

function wirefields() {
    const save = held[openat].save;
    document.querySelectorAll(".sheets input").forEach(function(box) {
        box.addEventListener("input", function() {
            save.fields[Number(box.dataset.at)].value = box.value;
            touched();
        });
    });
    document.querySelectorAll(".sheets .flip").forEach(function(button) {
        button.addEventListener("click", function() {
            const field = save.fields[Number(button.dataset.at)];
            field.value = field.value === "true" ? "false" : "true";
            button.classList.toggle("on", field.value === "true");
            button.textContent = field.value === "true" ? "Yes" : "No";
            playsound("click", 0.6);
            touched();
        });
    });
}

function touched() {
    document.body.classList.add("edited");
}

// the bar only turns up once a file is in, so its room is measured then
function clearbar() {
    const bar = document.querySelector(".bar");
    const tall = document.body.classList.contains("loaded") ? bar.offsetHeight + 24 : 0;
    document.body.style.paddingBottom = tall + "px";
}
window.addEventListener("resize", clearbar);

/*//////////////////////////////////////////////////////////////////////*/

function drawtabs() {
    const seat = document.querySelector(".tabs");
    seat.innerHTML = held.map(function(one, at) {
        return "<button type=\"button\" class=\"" + (at === openat ? "on" : "") + "\""
            + " data-at=\"" + at + "\">" + escaped(one.label) + "</button>";
    }).join("");
    seat.querySelectorAll("button").forEach(function(button) {
        button.addEventListener("click", function() {
            openat = Number(button.dataset.at);
            playsound("click", 0.7);
            drawtabs();
            paint();
        });
    });
    document.body.classList.toggle("many", held.length > 1);
}

function say(what, bad) {
    const seat = document.querySelector(".shout");
    seat.textContent = what;
    seat.classList.toggle("bad", !!bad);
}

function shortname(path) {
    const bits = path.split("/").filter(Boolean);
    const file = bits[bits.length - 1];
    const owner = bits[bits.length - 2];
    if (file === "profile.cfg" && owner) return owner;
    return file;
}

async function take(files) {
    const found = [];
    const extras = [];
    for (const file of files) {
        const bytes = new Uint8Array(await file.arrayBuffer());
        if (/\.(zip|backup)$/i.test(file.name) || (bytes[0] === 0x50 && bytes[1] === 0x4b)) {
            const parts = await unzip(bytes.buffer);
            if (!parts) {extras.push(file.name + " is not a readable zip"); continue}
            parts.forEach(function(part) {
                if (!/\.cfg$/i.test(part.name)) {
                    extras.push(part.name.split("/").pop() + " (" + part.bytes.length + " bytes)");
                    return;
                }
                const save = readsave(part.bytes);
                if (save) found.push({label: shortname(part.name), file: part.name.split("/").pop(), save: save});
                else extras.push(part.name.split("/").pop() + " (not encrypted settings)");
            });
            continue;
        }
        const save = readsave(bytes);
        if (save) found.push({label: shortname(file.name), file: file.name, save: save});
        else extras.push(file.name + " did not decode");
    }

    if (!found.length) {
        say("Nothing in there decoded as a Chuzzle save" + (extras.length ? " ~ " + extras[0] : ""), true);
        return;
    }
    // the profile with the most in it opens first, not whatever the zip
    // happened to list first
    found.sort(function(a, b) {return b.save.fields.length - a.save.fields.length});
    held = found;
    openat = 0;
    document.body.classList.add("loaded");
    document.body.classList.remove("edited");
    drawtabs();
    paint();
    clearbar();
    say(found.length + (found.length === 1 ? " file read" : " files read")
        + (extras.length ? ", " + extras.length + " left alone" : "") + ". Nothing was uploaded.");
    document.querySelector(".leftalone").innerHTML = extras.length
        ? "<b>Left alone:</b> " + extras.map(escaped).join(", ")
        : "";
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

    document.querySelector(".dosave").addEventListener("click", function() {
        const one = held[openat];
        if (!one) return;
        playsound("click", 0.7);
        grab(dexor(rebuild(one.save), one.save.key), one.file, "application/octet-stream");
        document.body.classList.remove("edited");
    });
    document.querySelector(".dotext").addEventListener("click", function() {
        const one = held[openat];
        if (!one) return;
        playsound("click", 0.7);
        grab(frombytes(rebuild(one.save)), one.file.replace(/\.cfg$/, "") + ".txt", "text/plain");
    });
}

wire();
loadsounds(["click"]);
