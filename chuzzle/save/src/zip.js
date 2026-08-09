/*

  just enough zip to open a Chuzzle2.backup an android backup hands you. the
  central directory is walked from the end of central directory record, since
  local headers alone do not say where the next one starts once a name length
  varies, and every deflated part goes through DecompressionStream.

*/

function readu16(view, at) {return view.getUint16(at, true)}
function readu32(view, at) {return view.getUint32(at, true)}

async function inflateraw(bytes) {
    const stream = new Blob([bytes]).stream()
        .pipeThrough(new DecompressionStream("deflate-raw"));
    return new Uint8Array(await new Response(stream).arrayBuffer());
}

async function unzip(buffer) {
    const all = new Uint8Array(buffer);
    const view = new DataView(buffer);
    let eocd = -1;
    for (let at = all.length - 22; at >= 0 && at > all.length - 65558; at--) {
        if (readu32(view, at) === 0x06054b50) {eocd = at; break}
    }
    if (eocd < 0) return null;

    const count = readu16(view, eocd + 10);
    let at = readu32(view, eocd + 16);
    const out = [];
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
        if (!name.endsWith("/")) {
            out.push({name: name, bytes: how === 8 ? await inflateraw(raw) : raw});
        }
        at += 46 + namelen + extralen + commentlen;
    }
    return out;
}
