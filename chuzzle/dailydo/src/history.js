const sparkdays = 14; // across the last two weeks
const sparkwide = 300;
const sparktall = 100;
const sparkleft = 42;
const sparkright = 294;

const daytexts = {};

function historydays() {
    const gold = !!boards[boardat].weekly;
    const out = [];
    for (let back = 0; back < sparkdays * 3 && out.length < sparkdays; back++) {
        if (back > calendaroldest()) break;
        if (gold && !isgoldday(back)) continue;
        if (!dayopen(back)) continue;
        out.push(back);
    }
    return out.reverse();
}

/*//////////////////////////////////////////////////////////////////////*/

function heldtext(key) {
    const held = readstore()[key];
    return (held && held.text && Date.now() - held.at < boardage) ? held.text : "";
}

async function daytext(boardkey, back, live) {
    const day = daykey(dayback(back));
    const key = boardkey + "/" + day;
    if (key in daytexts) return daytexts[key];

    let text = live[day] || heldtext(key) || "";
    if (typeof hasarchive === "function" && await hasarchive(day)) {
        const kept = await archivetext(day, boardkey);
        if (kept && kept.split(String.fromCharCode(10)).length
            > text.split(String.fromCharCode(10)).length) {
            text = kept;
        }
    }
    daytexts[key] = text;
    return text;
}

function seatin(text, id) {
    if (!text) return null;
    const lines = text.split(String.fromCharCode(10));
    for (let i = 0; i < lines.length; i++) {
        const bits = lines[i].split(String.fromCharCode(9));
        if (bits.length > 3 && bits[3] === id) {
            return {rank: i + 1, score: Number(bits[2]) || 0, total: lines.length};
        }
    }
    return {rank: 0, score: 0, total: lines.length};
}

async function loadhistory(boardkey, id) {
    const backs = historydays();
    const missing = backs.filter(function(back) {
        return !((boardkey + "/" + daykey(dayback(back))) in daytexts)
            && !heldtext(boardkey + "/" + daykey(dayback(back)));
    });
    const live = missing.length ? await fetchdays(boardkey, missing) : {};

    const out = [];
    for (const back of backs) {
        const text = await daytext(boardkey, back, live);
        const seat = seatin(text, id);
        out.push({back: back, label: daylabel(back), played: !!(seat && seat.rank),
            rank: seat ? seat.rank : 0, score: seat ? seat.score : 0,
            total: seat ? seat.total : 0});
    }
    return out;
}

/*//////////////////////////////////////////////////////////////////////*/

function sparkband(points) {
    const seats = points.filter(function(p) {return p.played})
        .map(function(p) {return p.rank});
    if (!seats.length) return {best: 1, worst: 2};
    const best = Math.min(...seats);
    const worst = Math.max(...seats);
    if (best === worst) return {best: Math.max(1, best - 1), worst: worst + 1};
    const air = Math.max(1, (worst - best) * 0.12);
    return {best: Math.max(1, Math.round(best - air)), worst: Math.round(worst + air)};
}

function sparkpath(points, band) {
    const step = points.length > 1 ? (sparkright - sparkleft) / (points.length - 1) : 0;
    const seatof = function(p, i) {
        const t = (band.worst - p.rank) / (band.worst - band.best);
        return [sparkleft + i * step, sparktall - 7 - t * (sparktall - 18)];
    };
    const runs = [];
    let run = [];
    points.forEach(function(p, i) {
        if (!p.played) {if (run.length > 1) runs.push(run); run = []; return}
        run.push(seatof(p, i));
    });
    if (run.length > 1) runs.push(run);
    return {
        runs: runs,
        dots: points.map(function(p, i) {
            if (!p.played) return null;
            const at = seatof(p, i);
            return {x: at[0], y: at[1], p: p};
        }).filter(Boolean),
    };
}

function sparksvg(points) {
    const band = sparkband(points);
    const shape = sparkpath(points, band);
    const best = shape.dots.reduce(function(a, b) {
        return !a || b.p.rank < a.p.rank ? b : a;
    }, null);

    const lines = shape.runs.map(function(run) {
        const d = run.map(function(pt, i) {
            return (i ? "L" : "M") + pt[0].toFixed(1) + " " + pt[1].toFixed(1);
        }).join(" ");
        const under = "M" + run[0][0].toFixed(1) + " " + sparktall
            + " " + d.slice(1) + " L" + run[run.length - 1][0].toFixed(1) + " " + sparktall + "Z";
        return "<path class=\"sparkfill\" d=\"" + under + "\"></path>"
            + "<path class=\"sparkline\" d=\"" + d + "\"></path>";
    }).join("");

    const step = points.length > 1 ? (sparkright - sparkleft) / (points.length - 1) : 0;
    const misses = points.map(function(p, i) {
        if (p.played) return "";
        return "<circle class=\"sparkgap\" cx=\"" + (sparkleft + i * step).toFixed(1) + "\""
            + " cy=\"" + (sparktall - 4) + "\" r=\"2\"></circle>";
    }).join("");

    const dots = shape.dots.map(function(dot) {
        return "<circle class=\"sparkdot" + (dot === best ? " sparkbest" : "") + "\""
            + " cx=\"" + dot.x.toFixed(1) + "\" cy=\"" + dot.y.toFixed(1) + "\""
            + " r=\"" + (dot === best ? 5 : 3.2) + "\">"
            + "<title>" + dot.p.label + " ~ #" + dot.p.rank + ", "
            + dot.p.score.toLocaleString("en") + "</title></circle>";
    }).join("");

    const scale = shape.dots.length
        ? "<text class=\"sparktick\" x=\"36\" y=\"12\">#" + band.best + "</text>"
            + "<text class=\"sparktick\" x=\"36\" y=\"" + (sparktall - 5) + "\">#"
            + band.worst + "</text>"
        : "";

    return "<svg class=\"spark\" viewBox=\"0 0 " + sparkwide + " " + sparktall + "\""
        + " role=\"img\">" + lines + misses + dots + scale + "</svg>";
}

function sparkcaption(points) {
    const unit = boards[boardat].weekly ? " weeks" : " days";
    const played = points.filter(function(p) {return p.played});
    if (!played.length) return "No scores in the last " + points.length + unit;
    const best = played.reduce(function(a, b) {return b.rank < a.rank ? b : a});
    return "Best <b>#" + best.rank + "</b> on <b>" + best.label + "</b>"
        + ", played <b>" + played.length + "</b> of " + points.length + unit;
}

function sparkblock(points) {
    if (points.length < 3) return "";
    return "<div class=\"sparkbox\">"
        + "<i>Score history</i>"
        + sparksvg(points)
        + "<div class=\"sparkaxis\"><span>" + points[0].label + "</span>"
        + "<span>" + points[points.length - 1].label + "</span></div>"
        + "<u>" + sparkcaption(points) + "</u></div>";
}

/*//////////////////////////////////////////////////////////////////////*/

let sparktoken = 0;
function drawhistory(body, boardkey, id) {
    const seat = body.querySelector(".sparkbox");
    if (!seat) return;
    const mine = ++sparktoken;
    loadhistory(boardkey, id).then(function(points) {
        if (mine !== sparktoken || !seat.isConnected) return;
        seat.outerHTML = sparkblock(points) || "";
    }).catch(function() {
        if (mine === sparktoken && seat.isConnected) seat.remove();
    });
}

function sparkloading() {
    return "<div class=\"sparkbox waiting\"><i>Score history</i>"
        + "<span class=\"sparkwait\">Loading, one second...</span></div>";
}
