/*

  writes a plain, uncompressed (store method) zip - enough to rebuild a
  Chuzzle2.backup folder from what is open on the page. store rather than
  deflate because correctness matters far more than a few hundred kb here,
  and it needs no compression step at all: just CRC32 and the two headers
  zip has always used.

    zipbytes([{name: "Chuzzle2.backup/sandbox/settings.txt", bytes}, ...])

*/

const crctable = (function() {
    const table = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
        let c = n;
        for (let k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
        table[n] = c >>> 0;
    }
    return table;
})();

function crc32(bytes) {
    let c = 0xffffffff;
    for (let i = 0; i < bytes.length; i++) c = crctable[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
}

// zip's own date encoding - two bytes each, DOS style, 2 second resolution.
// this only decorates the listing, nothing here reads it back
function doswhen() {
    const now = new Date();
    const time = (now.getHours() << 11) | (now.getMinutes() << 5) | (now.getSeconds() >> 1);
    const date = ((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate();
    return {time: time & 0xffff, date: date & 0xffff};
}

function u16(view, at, value) {view.setUint16(at, value, true)}
function u32(view, at, value) {view.setUint32(at, value, true)}

// Chuzzle2's own restore code turned out to need real directory entries -
// a zip that only lists files (however clearly their paths imply folders)
// silently failed to import. every ancestor folder of every file gets its
// own zero-length entry here, exactly like the backup the game itself
// writes, in the order each one is first needed
function withdirs(files) {
    const seen = new Set();
    const out = [];
    files.forEach(function(file) {
        const parts = file.name.split("/");
        let path = "";
        for (let i = 0; i < parts.length - 1; i++) {
            path += parts[i] + "/";
            if (!seen.has(path)) {seen.add(path); out.push({name: path, bytes: null})}
        }
        out.push(file);
    });
    return out;
}

function zipbytes(files) {
    const when = doswhen();
    const encoder = new TextEncoder();
    const locals = [];
    const centrals = [];
    let offset = 0;
    const entries = withdirs(files);

    entries.forEach(function(file) {
        const name = encoder.encode(file.name);
        const dir = file.bytes === null;
        const bytes = dir ? new Uint8Array(0) : file.bytes;
        const crc = dir ? 0 : crc32(bytes);
        const attr = dir ? 0x10 : 0;

        const local = new Uint8Array(30 + name.length);
        const lview = new DataView(local.buffer);
        u32(lview, 0, 0x04034b50);
        u16(lview, 4, 20); u16(lview, 6, 0); u16(lview, 8, 0);
        u16(lview, 10, when.time); u16(lview, 12, when.date);
        u32(lview, 14, crc);
        u32(lview, 18, bytes.length); u32(lview, 22, bytes.length);
        u16(lview, 26, name.length); u16(lview, 28, 0);
        local.set(name, 30);

        const central = new Uint8Array(46 + name.length);
        const cview = new DataView(central.buffer);
        u32(cview, 0, 0x02014b50);
        u16(cview, 4, 20); u16(cview, 6, 20); u16(cview, 8, 0); u16(cview, 10, 0);
        u16(cview, 12, when.time); u16(cview, 14, when.date);
        u32(cview, 16, crc);
        u32(cview, 20, bytes.length); u32(cview, 24, bytes.length);
        u16(cview, 28, name.length); u16(cview, 30, 0); u16(cview, 32, 0);
        u16(cview, 34, 0); u16(cview, 36, 0); u32(cview, 38, attr);
        u32(cview, 42, offset);
        central.set(name, 46);

        locals.push(local, bytes);
        centrals.push(central);
        offset += local.length + bytes.length;
    });

    const centralstart = offset;
    let centralsize = 0;
    centrals.forEach(function(c) {centralsize += c.length});

    const end = new Uint8Array(22);
    const eview = new DataView(end.buffer);
    u32(eview, 0, 0x06054b50);
    u16(eview, 4, 0); u16(eview, 6, 0);
    u16(eview, 8, entries.length); u16(eview, 10, entries.length);
    u32(eview, 12, centralsize); u32(eview, 16, centralstart);
    u16(eview, 20, 0);

    return new Blob([...locals, ...centrals, end]);
}
