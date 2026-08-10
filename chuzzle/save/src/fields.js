let trophydata = [];
let statnames = [];
let panels = [];
let known = {};
let puzzledata = {puzzles: [], pieces: []};
let chuzzariumdata = {furniture: {}};

function loadfielddata() {
    return Promise.all([
        fetch("assets/static/fields.json").then(function(reply) {return reply.json()}),
        fetch("assets/static/trophies.json").then(function(reply) {return reply.json()}),
        fetch("assets/static/puzzles.json").then(function(reply) {return reply.json()}),
        fetch("assets/static/chuzzarium.json").then(function(reply) {return reply.json()}),
    ]).then(function(got) {
        known = got[0].known;
        panels = got[0].panels;
        statnames = got[0].statnames;
        trophydata = got[1];
        puzzledata = got[2];
        chuzzariumdata = got[3];
    });
}

/*//////////////////////////////////////////////////////////////////////*/

// mExplosiveChuzzlesSploded -> Explosive chuzzles sploded
function prettyname(name) {
    const cut = name.replace(/^m(?=[A-Z])/, "").replace(/_/g, " ")
        .replace(/([a-z0-9])([A-Z])/g, "$1 $2");
    return cut.charAt(0).toUpperCase() + cut.slice(1).toLowerCase();
}

function fieldinfo(name) {
    if (known[name]) return known[name];
    const seasonal = /^has_(.+)_puzzle$/.exec(name);
    if (seasonal) {
        return {panel: "puzzles", label: prettyname(seasonal[1]) + " puzzle", control: "bool01"};
    }
    return {panel: "rest", label: prettyname(name)};
}

// "20260908" is the game's own year-day-month
function readgamedate(value) {
    const hit = /^(\d{4})(\d{2})(\d{2})$/.exec(String(value).trim());
    if (!hit) return "";
    const day = Number(hit[2]);
    const month = Number(hit[3]);
    if (!day || day > 31 || !month || month > 12) return "";
    const when = new Date(Number(hit[1]), month - 1, day);
    if (when.getDate() !== day) return "";
    return when.toLocaleDateString("en-GB", {day: "numeric", month: "long", year: "numeric"});
}

function valuekind(value) {
    if (value === "true" || value === "false") return "bool";
    if (/^-?\d+$/.test(value)) return "int";
    if (/^-?\d*\.\d+$/.test(value)) return "float";
    if (/^-?\d+(,-?\d+)+$/.test(value)) return "list";
    return "text";
}
