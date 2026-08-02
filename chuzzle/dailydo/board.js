/*//////////////////////////////////////////////////////////////////////*/

/* row colours, straight out of DailyDoKit::DailyDoKit. the game feeds eight
   corners through Color::Pastel(0.5) and samples the resulting cycler at
   (row y / list height) * 7, wrapping past the end. the list is a palindrome
   around green, which is why the sweep mirrors instead of jumping. */
const cyclercorners = [
    [0, 0, 1], [1, 0, 1], [1, 0, 0], [1, 0.5, 0],
    [0, 1, 0], [1, 0.5, 0], [1, 0, 0], [1, 0, 1]
];
const cyclerspan = 0.875;

function pastel(v, floor) {return Math.max(floor, Math.min(1, v * 1.5))}

const cyclerstops = cyclercorners.map(function(c) {
    return c.map(function(v) {return pastel(v, 0.5)});
});

function cyclerget(t) {
    const last = cyclerstops.length - 1;
    let at = t % last;
    if (at < 0) at += last;
    const lo = Math.floor(at); const mix = at - lo;
    const a = cyclerstops[lo]; const b = cyclerstops[lo + 1];
    const ch = a.map(function(v, i) {return Math.round(255 * (v + (b[i] - v) * mix))});
    return "rgb(" + ch[0] + "," + ch[1] + "," + ch[2] + ")";
}

/* only the rows on screen exist as elements; a pool of about fifty gets
   repositioned and refilled as the list moves. 3800 live rows with a flag
   each would blow the compositor apart. */
let board = []; let pool = []; let rowheight = 0; let claimedat = -1;
let padtop = 0; let padbottom = 0; let filled = -1; let strip = null;

function poolsize(host) {
    return rowheight ? Math.ceil(host.clientHeight / rowheight) + 4 : 0;
}

function setdigits(cell, text) {
    while (cell.childNodes.length > text.length) cell.lastChild.remove();
    while (cell.childNodes.length < text.length) {
        cell.appendChild(document.createElement("d"));
    }
    for (let i = 0; i < text.length; i++) cell.childNodes[i].textContent = text[i];
}

function makerow() {
    const row = document.createElement("div");
    const rank = document.createElement("rank");
    const name = document.createElement("name");
    const flag = document.createElement("img");
    const score = document.createElement("score");
    row.append(rank, name, flag, score);
    row.parts = {rank: rank, name: name, flag: flag, score: score};
    return row;
}

function measurelist(host, list) {
    const style = getComputedStyle(list);
    padtop = parseFloat(style.paddingTop) || 0;
    padbottom = parseFloat(style.paddingBottom) || 0;

    if (!strip) {
        strip = document.createElement("hilite");
        list.insertBefore(strip, list.firstChild);
    }

    const probe = makerow();
    probe.parts.rank.textContent = "1.";
    probe.parts.name.textContent = "SAMPLE";
    probe.parts.score.textContent = "1000";
    probe.parts.flag.src = "assets/images/flags/--.png";
    list.appendChild(probe);
    rowheight = probe.offsetHeight;
    probe.remove();

    /* "1." through "3851." plus the stop, so short boards lose the dead
       column the widest rank would have reserved */
    list.style.setProperty("--rankcells", String(board.length).length + 1);

    paintedat = null;
    const want = poolsize(host);
    while (pool.length > want) pool.pop().remove();
    while (pool.length < want) {
        const row = makerow();
        list.appendChild(row);
        pool.push(row);
    }
    filled = -1;
}

function contentheight() {return padtop + board.length * rowheight + padbottom}

let paintedat = null;

function paintrows(at, host) {
    if (!rowheight || !pool.length) return;
    if (paintedat === at) return;
    paintedat = at;
    const height = host.clientHeight * cyclerspan;
    const last = cyclerstops.length - 1;
    const first = Math.max(0, Math.min(board.length - pool.length,
        Math.floor((at - padtop) / rowheight) - 2));

    for (let slot = 0; slot < pool.length; slot++) {
        const index = first + slot;
        const row = pool[slot];
        if (index >= board.length) {row.style.display = "none"; continue}
        const entry = board[index];
        if (filled !== first) {
            row.style.display = "";
            row.parts.rank.textContent = (index + 1) + ".";
            row.parts.name.textContent = entry.name;
            setdigits(row.parts.score, entry.score);
            row.parts.flag.src = "assets/images/flags/" + entry.cc + ".png";
            row.dataset.id = entry.id;
            row.dataset.at = index;
            row.classList.toggle("mine", index === claimedat);
        }
        const top = padtop + index * rowheight - at;
        row.style.top = top + "px";
        const t = (top + rowheight / 2) / height * last;
        /* stop just short of the end: cyclerget wraps, so exactly last is blue again */
        row.style.color = cyclerget(Math.max(0, Math.min(last - 0.001, t)));
    }
    filled = first;

    if (strip) {
        strip.classList.toggle("on", claimedat >= 0);
        if (claimedat >= 0) {
            /* 40 game units tall on a 25 unit pitch, and its centre sits
               10 above the text where the row's own centre sits 7.5 */
            const band = rowheight * 1.6;
            strip.style.height = band + "px";
            strip.style.top = (padtop + (claimedat + 0.5) * rowheight - at
                - band / 2 - rowheight * 0.1) + "px";
        }
    }
}

/* three rings of stars turning behind the pillars. only the top of each
   ring clears the screen, so you see about four sliding along an arch. the
   stars counter-rotate so they never tip over. */
const rings = [
    {y: 0.94, r: 0.60, n: 15, size: 0.115, secs: 150},
    {y: 1.22, r: 0.55, n: 14, size: 0.1, secs: 122},
    {y: 1.48, r: 0.50, n: 13, size: 0.085, secs: 98}
];

function buildrings() {
    const host = document.querySelector(".bigstars");
    if (!host) return;
    rings.forEach(function(spec, index) {
        const clip = document.createElement("div");
        clip.className = "ringclip";
        clip.style.top = "calc(var(--u) * " + spec.y + ")";
        clip.style.width = "calc(var(--u) * " + (spec.r * 2 + spec.size) + ")";
        clip.style.height = "calc(var(--u) * " + (spec.r * 2 + spec.size) + ")";
        const ring = document.createElement("div");
        ring.className = "ring";
        ring.style.animationDuration = spec.secs + "s";
        if (index % 2) ring.style.animationDirection = "reverse";
        for (let i = 0; i < spec.n; i++) {
            const angle = (i / spec.n) * Math.PI * 2;
            const star = document.createElement("img");
            star.src = "assets/images/star.png";
            star.alt = "";
            star.style.left = "calc(var(--u) * " + (Math.sin(angle) * spec.r).toFixed(4) + ")";
            star.style.top = "calc(var(--u) * " + (-Math.cos(angle) * spec.r).toFixed(4) + ")";
            star.style.width = "calc(var(--u) * " + spec.size + ")";
            star.style.transform = "translate(-50%, -50%) rotate("
                + (angle * 180 / Math.PI).toFixed(1) + "deg)";
            ring.appendChild(star);
        }
        clip.appendChild(ring);
        host.appendChild(clip);
    });
}

/*//////////////////////////////////////////////////////////////////////*/

/* blippo has no glyph for these, and the game shows a question mark
   wherever a name uses something it cannot draw. */
const drawable = new Set(
    "!\"#$%&'()*+,-.0123456789:;=?@ABCDEFGHIJKLMNOPQRSTUVWXYZ[]{} ".split("")
);

const namecap = 15;
function tidyname(text) {
    let out = text.replace(/%%/g, "%").replace(/%(?= )/g, "");
    out = out.replace(/%([0-9a-f]{2})/gi, function(whole, hex) {
        const code = parseInt(hex, 16);
        return code >= 32 ? String.fromCharCode(code) : whole;
    });
    return out;
}

function drawname(text) {
    text = tidyname(text);
    const clean = text.toUpperCase().split("").map(function(c) {
        return drawable.has(c) ? c : "?";
    }).join("");
    return clean.length > namecap ? clean.slice(0, namecap) + " ..." : clean;
}

/*//////////////////////////////////////////////////////////////////////*/

/* the list is flung rather than scrolled: drag or wheel adds velocity and
   friction bleeds it off. dragging past either end meets rising resistance
   and springs back once let go. */
const overreach = 0.35; const springback = 0.16; const rub = 0.955;

function makefling(host, list) {
    let at = 0; let velocity = 0; let dragging = false;
    let lastY = 0; let lastTime = 0; let running = false;

    function limit() {return Math.max(0, contentheight() - host.clientHeight)}
    function place() {paintrows(at, host)}
    function past() {
        if (at < 0) return at;
        if (at > limit()) return at - limit();
        return 0;
    }

    function step() {
        const out = past();
        if (dragging) {
            place();
            requestAnimationFrame(step);
            return;
        }
        if (out !== 0) {
            at -= out * springback;
            velocity = 0;
            if (Math.abs(out) < 0.4) {at = out < 0 ? 0 : limit()}
        } else {
            at += velocity;
            velocity *= rub;
            if (Math.abs(velocity) < 0.05) velocity = 0;
        }
        place();
        if (velocity === 0 && past() === 0) {running = false; return}
        requestAnimationFrame(step);
    }
    function kick() {if (!running) {running = true; requestAnimationFrame(step)}}

    host.addEventListener("wheel", function(e) {
        e.preventDefault();
        velocity += e.deltaY * 0.22;
        kick();
    }, {passive: false});

    host.addEventListener("pointerdown", function(e) {
        dragging = true; velocity = 0;
        lastY = e.clientY; lastTime = e.timeStamp;
        host.setPointerCapture(e.pointerId);
        host.classList.add("dragging");
        kick();
    });
    host.addEventListener("pointermove", function(e) {
        if (!dragging) return;
        const moved = e.clientY - lastY;
        const gap = Math.max(1, e.timeStamp - lastTime);
        /* outside the ends the list only follows part of the drag */
        at -= past() === 0 ? moved : moved * overreach;
        velocity = -moved / gap * 16;
        lastY = e.clientY; lastTime = e.timeStamp;
    });
    function letgo() {
        if (!dragging) return;
        dragging = false;
        host.classList.remove("dragging");
        kick();
    }
    host.addEventListener("pointerup", letgo);
    host.addEventListener("pointercancel", letgo);
    host.addEventListener("lostpointercapture", letgo);

    return {
        at: function() {return at},
        jump: function(to) {
            at = Math.max(0, Math.min(limit(), to));
            velocity = 0;
            place();
        }
    };
}
