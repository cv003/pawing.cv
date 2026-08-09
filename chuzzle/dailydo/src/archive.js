/*

  raptisoft only keeps a board for fourteen days, and the last day or two of
  that is already half wiped, so the oldest cells of the calendar come back
  empty. the worker archives each day to a github release as an xlsx, and this
  reads one back when the live fetch has nothing.

  the file has to come through the worker: github 302s release assets to an
  azure blob that sends no access-control-allow-origin, so fetching one
  straight from the page is blocked whatever you do.

  no zip library here - workers/chuzzle/sheet.js writes these, so the shape is
  known exactly. every part is deflate-raw, every string is inline, there are
  no shared strings and no styles, and DecompressionStream does the rest.

*/

const archivehost = "https://chuzzle.coolsite.cv/sheet";

function readu16(view, at) {return view.getUint16(at, true)}
function readu32(view, at) {return view.getUint32(at, true)}

async function inflate(bytes) {
    const stream = new Blob([bytes]).stream()
        .pipeThrough(new DecompressionStream("deflate-raw"));
    return new Uint8Array(await new Response(stream).arrayBuffer());
}

// walks the central directory backwards from the end of central directory
// record, which is the only reliable way in - local headers alone do not say
// where the next one starts once a name length varies
async function unzip(buffer) {
    const all = new Uint8Array(buffer);
    const view = new DataView(buffer);
    let eocd = -1;
    for (let at = all.length - 22; at >= 0 && at > all.length - 65558; at--) {
        if (readu32(view, at) === 0x06054b50) {eocd = at; break}
    }
    if (eocd < 0) throw new Error("not a zip");

    const count = readu16(view, eocd + 10);
    let at = readu32(view, eocd + 16);
    const out = {};
    const decoder = new TextDecoder();

    for (let i = 0; i < count; i++) {
        if (readu32(view, at) !== 0x02014b50) break;
        const how = readu16(view, at + 10);
        const packed = readu32(view, at + 20);
        const namelen = readu16(view, at + 28);
        const extralen = readu16(view, at + 30);
        const commentlen = readu16(view, at + 32);
        const head = readu32(view, at + 42);
        const name = decoder.decode(all.subarray(at + 46, at + 46 + namelen));

        // the local header repeats the lengths and they can differ from the
        // central copy, so the data offset has to be read from there
        const localname = readu16(view, head + 26);
        const localextra = readu16(view, head + 28);
        const from = head + 30 + localname + localextra;
        const raw = all.subarray(from, from + packed);
        out[name] = decoder.decode(how === 8 ? await inflate(raw) : raw);

        at += 46 + namelen + extralen + commentlen;
    }
    return out;
}

/*//////////////////////////////////////////////////////////////////////*/

const rowtag = /<row[^>]*>([\s\S]*?)<\/row>/g;
const celltag = /<c\b([^>]*)>([\s\S]*?)<\/c>/g;
const inlinetext = /<t[^>]*>([\s\S]*?)<\/t>/;
const plainvalue = /<v>([\s\S]*?)<\/v>/;

function unescapexml(s) {
    return s.replace(/&lt;/g, "<").replace(/&gt;/g, ">")
        .replace(/&quot;/g, "\"").replace(/&apos;/g, "'").replace(/&amp;/g, "&");
}

function sheetrows(xml) {
    const rows = [];
    let row;
    rowtag.lastIndex = 0;
    while ((row = rowtag.exec(xml))) {
        const cells = [];
        let cell;
        celltag.lastIndex = 0;
        while ((cell = celltag.exec(row[1]))) {
            const inline = inlinetext.exec(cell[2]);
            if (inline) {cells.push(unescapexml(inline[1])); continue}
            const plain = plainvalue.exec(cell[2]);
            cells.push(plain ? unescapexml(plain[1]) : "");
        }
        rows.push(cells);
    }
    return rows;
}

// workbook.xml lists the sheets in the same order as sheet1..sheetN
function sheetnames(xml) {
    const out = [];
    const re = /<sheet\b[^>]*\bname="([^"]*)"/g;
    let m;
    while ((m = re.exec(xml))) out.push(unescapexml(m[1]));
    return out;
}

async function readworkbook(buffer) {
    const parts = await unzip(buffer);
    const names = sheetnames(parts["xl/workbook.xml"] || "");
    const out = {};
    names.forEach(function(name, i) {
        const xml = parts["xl/worksheets/sheet" + (i + 1) + ".xml"];
        if (xml) out[name] = sheetrows(xml);
    });
    return out;
}

/*//////////////////////////////////////////////////////////////////////*/

const books = {};
let daylist = null;
let keptdays = [];

// the resolved list, for callers that cannot wait on a promise - empty until
// the fetch lands, so treat a miss as "not yet known" rather than "not there"
function archivedaysnow() {return keptdays}

// which days have a release at all, asked once. without this every old day
// would cost a workbook fetch just to find out there is nothing to fetch
function archivedays() {
    if (!daylist) {
        daylist = fetch(archivehost.replace(/\/sheet$/, "/days")).then(function(reply) {
            return reply.ok ? reply.json() : [];
        }).then(function(days) {
            keptdays = days;
            return days;
        }).catch(function() {return []});
    }
    return daylist;
}

async function hasarchive(day) {
    return (await archivedays()).indexOf(day) >= 0;
}

// hands back the same tab separated shape the live endpoint does, so readboard
// can take it without knowing where it came from
async function archivetext(day, boardkey) {
    if (!(day in books)) {
        books[day] = fetch(archivehost + "/" + day).then(function(reply) {
            return reply.ok ? reply.arrayBuffer() : null;
        }).then(function(raw) {
            return raw ? readworkbook(raw) : null;
        }).catch(function() {return null});
    }
    const book = await books[day];
    const rows = book && book[boardkey];
    if (!rows || rows.length < 2) return "";
    // row one is the country/name/score/guid header the workbook writes
    return rows.slice(1).map(function(cells) {return cells.join("\t")}).join("\n");
}
