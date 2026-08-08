// country:UA / country:Ukraine / country:-- / country:Unknown
// type:guest / type:user
// guid:845934 / id:438290 / playerid:34392 / userid:20284
// rank:<10 / rank:>69 / rank:<=190 / rank:42
// score:<103 / score:>690 / score:<=54823 / score:1000

const filterkeys = {
    country: "country", type: "type",
    guid: "id", id: "id", playerid: "id", userid: "id",
    rank: "rank", score: "score",
};

function parsecompare(raw) {
    const m = /^(<=|>=|<|>|=)?\s*(.+)$/.exec(raw.trim());
    return {op: (m && m[1]) || "=", num: Number(m && m[2])};
}
function comparenum(actual, cmp) {
    if (Number.isNaN(cmp.num)) return true;
    if (cmp.op === "<") return actual < cmp.num;
    if (cmp.op === ">") return actual > cmp.num;
    if (cmp.op === "<=") return actual <= cmp.num;
    if (cmp.op === ">=") return actual >= cmp.num;
    return actual === cmp.num;
}

function countrymatches(entry, raw) {
    const want = raw.trim().toLowerCase();
    if (want === "--" || want === "unknown") return entry.cc === "--";
    if (entry.cc.toLowerCase() === want) return true;
    const name = (typeof countryname === "function" ? countryname(entry.country) : "") || "";
    return name.toLowerCase() === want || name.toLowerCase().indexOf(want) >= 0;
}

const filtertoken = /(\w+):(\S+)/g;

function parsesearch(text) {
    const filters = [];
    const rest = String(text).replace(filtertoken, function(whole, key, value) {
        const norm = filterkeys[key.toLowerCase()];
        if (!norm) return whole;
        filters.push({key: norm, value: value});
        return "";
    }).trim();
    return {filters: filters, rest: rest};
}

function matchesfilters(entry, filters) {
    return filters.every(function(f) {
        if (f.key === "country") return countrymatches(entry, f.value);
        if (f.key === "type") {
            const want = f.value.trim().toLowerCase();
            const guest = isguest(entry.full);
            if (want === "guest") return guest;
            if (want === "user") return !guest;
            return true;
        }
        if (f.key === "id") return entry.id.indexOf(f.value.trim()) >= 0;
        if (f.key === "rank") return comparenum(entry.rank, parsecompare(f.value));
        if (f.key === "score") return comparenum(Number(entry.score), parsecompare(f.value));
        return true;
    });
}
