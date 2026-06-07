/*//////////////////////////////////////////////////////////////////////*/
/* config + state */

const defaultworker = "https://mc.coolsite.cv";
const store = window.localStorage;
const cfg = {worker: store.getItem("mcworker") || defaultworker, lowall: true};

// twitch embeds require the host domain as a parent. include the live host
// plus the known prod domains so it works locally, on pages and the custom domain.
const parents = Array.from(new Set([location.hostname, "coolsite.cv", "cv003.github.io", "localhost"].filter(Boolean)));

const state = {
  members: [],          // parsed roster
  altmap: {},           // "tw:name" -> {member, alt}
  wins: [],             // floating windows (streams + chats)
  focused: null,        // focused window id (audio)
  nextid: 1,
  avcache: JSON.parse(store.getItem("mcav") || "{}"),
  sideopen: false
};

const $ = s => document.querySelector(s);
const el = (t, c) => {const e = document.createElement(t); if (c) e.className = c; return e};
const mkey = m => m.display.toLowerCase();

/*//////////////////////////////////////////////////////////////////////*/
/* roster parsing (channels.txt) */

// line: "tubbo yt:TubboLIVE [rare]". space-separated accounts, "yt:" = youtube,
// "[rare]" fades harder, "== name ==" starts a category, "#" is a comment.
function parseroster(text){
  const members = [];
  let group = -1, label = "";

  for (const raw of text.split(/\r?\n/)){
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;

    const gh = line.match(/^==\s*(.+?)\s*==$/);
    if (gh){group++; label = gh[1]; continue}

    let notlive = false;
    const alts = [];
    for (const tok of line.split(/\s+/)){
      if (/^\[rare\]$/i.test(tok)){notlive = true; continue}
      const yt = /^yt:/i.test(tok);
      alts.push({platform: yt ? "yt" : "tw", name: tok.replace(/^yt:/i, "")});
    }
    if (!alts.length) continue;

    const primary = alts.find(a => a.platform === "tw") || alts[0];
    const m = {
      id: members.length, primary, display: primary.name,
      others: alts.filter(a => a !== primary),
      alts, notlive, group: Math.max(group, 0), label: label || "channels",
      live: false, livealt: null, viewers: 0, title: "", avatar: ""
    };
    members.push(m);
    for (const a of alts) state.altmap[a.platform + ":" + a.name.toLowerCase()] = {member: m, alt: a};
  }
  return members;
}

/*//////////////////////////////////////////////////////////////////////*/
/* sidebar render */

function platicon(p){
  const i = el("img", "picon");
  i.src = "/assets/svgs/" + (p === "yt" ? "youtube" : "twitch") + ".svg";
  return i;
}

function avatarurl(m){return m.avatar || state.avcache[mkey(m)] || "/assets/svgs/blank.svg"}

function winfor(m, alt){return state.wins.find(w => w.type === "stream" && w.member === m && w.alt === alt)}

function renderlist(){
  const q = $(".search").value.trim().toLowerCase();
  const onlineonly = $(".f-online").classList.contains("on");
  const list = $(".list");
  list.innerHTML = "";

  // group order preserved, then live first, then viewers desc, then a-z
  const rows = state.members
    .filter(m => !(q && !m.display.toLowerCase().includes(q) && !m.alts.some(a => a.name.toLowerCase().includes(q))))
    .filter(m => !(onlineonly && !m.live))
    .sort((a, b) => a.group - b.group || (b.live - a.live) || (b.viewers - a.viewers) || a.display.localeCompare(b.display));

  let col = null, lastgroup = -1;
  for (const m of rows){
    if (m.group !== lastgroup){
      col = el("div", "column");
      const g = el("div", "group");
      g.textContent = m.label;
      col.appendChild(g);
      list.appendChild(col);
      lastgroup = m.group;
    }
    col.appendChild(buildrow(m, m.primary, false));
    for (const a of m.others) col.appendChild(buildrow(m, a, true));
  }
}

function buildrow(m, alt, sub){
  const item = el("div", sub ? "item subitem" : "item");
  if (winfor(m, alt)) item.classList.add("active");
  if (!alt.live) item.classList.add(m.notlive ? "rare" : "offline");

  if (!sub){
    const av = el("img", "av");
    av.loading = "lazy"; av.src = avatarurl(m);
    av.onerror = () => {av.onerror = null; av.src = "/assets/svgs/blank.svg"};
    item.appendChild(av);
  }

  const meta = el("div", "meta");
  const nm = el("div", "nm");
  nm.appendChild(platicon(alt.platform));
  nm.appendChild(document.createTextNode(alt.name));
  meta.appendChild(nm);

  if (alt.live){
    // youtube viewer counts are not available via the basic queries, so title only
    const parts = [];
    if (alt.platform === "tw" && alt.viewers) parts.push(fmt(alt.viewers));
    if (alt.title) parts.push(alt.title);
    if (parts.length){const s = el("div", "sub"); s.textContent = parts.join(" · "); meta.appendChild(s)}
  }
  item.appendChild(meta);

  const cb = el("div", "chatbtn");
  cb.textContent = "chat"; cb.title = "add chat only";
  cb.onclick = e => {e.stopPropagation(); addwin("chat", m, {alt, videoId: alt.videoId})};
  item.appendChild(cb);

  item.onclick = () => togglealt(m, alt);
  return item;
}

function fmt(n){
  if (n >= 1000) return (n / 1000).toFixed(1).replace(/\.0$/, "") + "k watching";
  return (n || 0) + " watching";
}

/*//////////////////////////////////////////////////////////////////////*/
/* live check via worker */

async function refresh(){
  if (!cfg.worker){banner("no worker set, live status + youtube are disabled."); return}
  const btn = $(".f-refresh");
  btn.textContent = "checking...";

  const tw = new Set(), yt = new Set();
  for (const m of state.members) for (const a of m.alts){(a.platform === "tw" ? tw : yt).add(a.name)}

  try {
    // youtube /live redirects (2 subrequests each), so keep chunks well under the
    // free-tier 50-subrequest-per-invocation cap. twitch is one batched call.
    const results = await Promise.all([
      tw.size ? callworker({twitch: [...tw]}) : Promise.resolve({}),
      ...chunk([...yt], 15).map(c => callworker({youtube: c}))
    ]);
    const twres = {}, ytres = {};
    for (const r of results){Object.assign(twres, r.twitch || {}); Object.assign(ytres, r.youtube || {})}
    applyresults(twres, ytres);

    const online = state.members.filter(m => m.live).length;
    $(".count").innerHTML = "<b>" + online + "</b>/" + state.members.length;
  } catch (e){
    banner("worker request failed: " + e);
  }
  btn.textContent = "refresh";
  renderlist();
}

function callworker(params){
  const u = new URL(cfg.worker);
  if (params.twitch) u.searchParams.set("twitch", params.twitch.join(","));
  if (params.youtube) u.searchParams.set("youtube", params.youtube.join(","));
  return fetch(u.toString()).then(r => {if (!r.ok) throw new Error("http " + r.status); return r.json()});
}

function applyresults(twres, ytres){
  const av = state.avcache;
  for (const m of state.members){
    m.live = false; m.livealt = null; m.viewers = 0;
    let best = "";
    for (const a of m.alts){
      const r = a.platform === "tw" ? twres[a.name.toLowerCase()] : ytres[a.name.toLowerCase()];
      a.live = false; a.viewers = 0; a.title = "";
      if (!r) continue;
      if (r.avatar){if (a === m.primary) best = r.avatar; else if (!best) best = r.avatar}
      if (a.platform === "yt") a.videoId = r.videoId || a.videoId;
      if (r.live){
        a.live = true; a.viewers = r.viewers || 0; a.title = r.title || "";
        if (!m.live){m.live = true; m.livealt = a}
        m.viewers = Math.max(m.viewers, a.viewers);
      }
    }
    if (best){m.avatar = best; av[mkey(m)] = best}
  }
  store.setItem("mcav", JSON.stringify(av));
}

function chunk(arr, n){const out = []; for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n)); return out}

/*//////////////////////////////////////////////////////////////////////*/
/* windows: create / close */

function togglealt(m, alt){
  const w = winfor(m, alt);
  if (w){closewin(w.id); return}
  if (state.wins.filter(x => x.type === "stream").length >= 10){banner("10 streams max for performance."); return}
  addwin("stream", m, {alt, videoId: alt.videoId});
}

// type: "stream" | "chat". opts holds alt/videoId/rect on restore.
function addwin(type, m, opts){
  opts = opts || {};
  let alt = opts.alt || m.livealt || m.primary;
  let videoId = opts.videoId || alt.videoId;

  if (alt.platform === "yt" && !videoId){
    banner(m.display + " has no known live youtube video. refresh, or they may be offline.");
    const tw = m.alts.find(a => a.platform === "tw");
    if (!tw) return;
    alt = tw; videoId = null;
  }

  const id = state.nextid++;
  const w = {id, type, member: m, alt, platform: alt.platform, videoId, inst: null, rect: opts.rect || nextrect()};

  const node = el("div", "win");
  const bar = el("div", "bar");
  bar.appendChild(platicon(alt.platform));
  const nm = el("div", "nm");
  nm.textContent = m.display + (type === "chat" ? " chat" : "");
  bar.appendChild(nm);
  const cl = el("div", "ic"); cl.textContent = "✕"; cl.title = "close";
  cl.onclick = e => {e.stopPropagation(); closewin(id)};
  bar.appendChild(cl);
  node.appendChild(bar);

  const body = el("div", "body");
  node.appendChild(body);
  node.appendChild(el("div", "flashfx"));
  for (const h of ["e", "s", "se"]){const r = el("div", "rs " + h); r.dataset.dir = h; node.appendChild(r)}

  w.node = node; w.body = body; w.bar = bar;
  state.wins.push(w);
  $(".canvas").appendChild(node);
  applyrect(w);
  $(".empty").style.display = "none";

  dragwire(w);

  if (type === "stream"){
    if (alt.platform === "tw") makewitch(w);
    else makeyt(w);
    if (!state.focused) focuswin(id);
  } else {
    makechat(w);
  }
  renderlist();
  savesession();
}

function closewin(id){
  const i = state.wins.findIndex(w => w.id === id);
  if (i < 0) return;
  const w = state.wins[i];
  try {if (w.inst && w.platform === "yt" && w.inst.destroy) w.inst.destroy()} catch (e){}
  w.node.remove();
  state.wins.splice(i, 1);
  if (state.focused === id) state.focused = null;
  if (!state.wins.some(x => x.type === "stream")) $(".empty").style.display = "flex";
  const firststream = state.wins.find(x => x.type === "stream");
  if (!state.focused && firststream) focuswin(firststream.id);
  renderlist();
  savesession();
}

/*//////////////////////////////////////////////////////////////////////*/
/* focus (audio + flash) */

function focuswin(id){
  state.focused = id;
  for (const w of state.wins){
    if (w.type !== "stream") continue;
    const on = w.id === id;
    setmuted(w, !on);
    setquality(w, on && !cfg.lowall);
    if (on) flash(w);
  }
  savesession();
}

function flash(w){
  w.node.classList.remove("flash");
  void w.node.offsetWidth;            // reflow so the animation re-fires
  w.node.classList.add("flash");
}

function setmuted(w, muted){
  try {
    if (w.platform === "tw" && w.inst) w.inst.setMuted(muted);
    if (w.platform === "yt" && w.inst){muted ? w.inst.mute() : w.inst.unMute()}
  } catch (e){}
}

function setquality(w, high){
  try {
    if (w.platform === "tw" && w.inst){
      const qs = w.inst.getQualities ? w.inst.getQualities() : [];
      const low = qs.find(q => /160p|low/i.test(q.group || q.name || ""));
      w.inst.setQuality(high ? "auto" : (low ? low.group : "160p"));
    }
    if (w.platform === "yt" && w.inst && w.inst.setPlaybackQuality) w.inst.setPlaybackQuality(high ? "hd720" : "small");
  } catch (e){}
}

/*//////////////////////////////////////////////////////////////////////*/
/* window geometry: rects as fractions of the canvas */

function csize(){const r = $(".canvas").getBoundingClientRect(); return {w: r.width, h: r.height}}

function nextrect(){
  const off = (state.wins.length % 6) * 0.04;
  return {x: 0.06 + off, y: 0.06 + off, w: 0.46, h: 0.52};
}

function applyrect(w){
  const c = csize(), r = w.rect;
  w.node.style.left = (r.x * c.w) + "px"; w.node.style.top = (r.y * c.h) + "px";
  w.node.style.width = (r.w * c.w) + "px"; w.node.style.height = (r.h * c.h) + "px";
}

function relayout(){for (const w of state.wins) applyrect(w)}

// windows-style snap zone for a pointer position inside the canvas
function snapzone(px, py){
  const c = csize(), e = 44;
  const L = px < e, R = px > c.w - e, T = py < e, B = py > c.h - e;
  if (T && L) return {x: 0, y: 0, w: .5, h: .5};
  if (T && R) return {x: .5, y: 0, w: .5, h: .5};
  if (B && L) return {x: 0, y: .5, w: .5, h: .5};
  if (B && R) return {x: .5, y: .5, w: .5, h: .5};
  if (L) return {x: 0, y: 0, w: .5, h: 1};
  if (R) return {x: .5, y: 0, w: .5, h: 1};
  if (T) return {x: 0, y: 0, w: 1, h: 1};
  if (B) return {x: 0, y: .5, w: 1, h: .5};
  return null;
}

function showghost(zone){
  const g = $(".ghost");
  if (!zone){g.classList.remove("on"); return}
  const c = csize();
  g.style.left = (zone.x * c.w) + "px"; g.style.top = (zone.y * c.h) + "px";
  g.style.width = (zone.w * c.w) + "px"; g.style.height = (zone.h * c.h) + "px";
  g.classList.add("on");
}

/*//////////////////////////////////////////////////////////////////////*/
/* drag + resize */

function dragwire(w){
  w.bar.addEventListener("pointerdown", e => {
    if (e.target.classList.contains("ic")) return;
    if (w.type === "stream") focuswin(w.id);
    startdrag(w, e);
  });
  for (const h of w.node.querySelectorAll(".rs")){
    h.addEventListener("pointerdown", e => {e.stopPropagation(); startresize(w, e, h.dataset.dir)});
  }
}

function startdrag(w, e){
  e.preventDefault();
  raise(w);
  const c = csize();
  const sx = e.clientX, sy = e.clientY;
  const ox = w.rect.x * c.w, oy = w.rect.y * c.h;
  let zone = null;
  mask(true); w.node.classList.add("dragging");

  function move(ev){
    let nx = ox + (ev.clientX - sx), ny = oy + (ev.clientY - sy);
    nx = Math.max(0, Math.min(nx, c.w - 60)); ny = Math.max(0, Math.min(ny, c.h - 28));
    w.node.style.left = nx + "px"; w.node.style.top = ny + "px";
    const rc = $(".canvas").getBoundingClientRect();
    zone = snapzone(ev.clientX - rc.left, ev.clientY - rc.top);
    showghost(zone);
  }
  function up(){
    document.removeEventListener("pointermove", move);
    document.removeEventListener("pointerup", up);
    mask(false); showghost(null); w.node.classList.remove("dragging");
    if (zone) w.rect = zone;
    else w.rect = {x: parseFloat(w.node.style.left) / c.w, y: parseFloat(w.node.style.top) / c.h, w: w.rect.w, h: w.rect.h};
    applyrect(w); savesession();
  }
  document.addEventListener("pointermove", move);
  document.addEventListener("pointerup", up);
}

function startresize(w, e, dir){
  e.preventDefault();
  raise(w);
  const c = csize();
  const sx = e.clientX, sy = e.clientY;
  const ow = w.rect.w * c.w, oh = w.rect.h * c.h;
  mask(true);

  function move(ev){
    let nw = ow, nh = oh;
    if (dir.includes("e")) nw = Math.max(180, ow + (ev.clientX - sx));
    if (dir.includes("s")) nh = Math.max(130, oh + (ev.clientY - sy));
    w.node.style.width = nw + "px"; w.node.style.height = nh + "px";
  }
  function up(){
    document.removeEventListener("pointermove", move);
    document.removeEventListener("pointerup", up);
    mask(false);
    w.rect = {x: w.rect.x, y: w.rect.y, w: parseFloat(w.node.style.width) / c.w, h: parseFloat(w.node.style.height) / c.h};
    savesession();
  }
  document.addEventListener("pointermove", move);
  document.addEventListener("pointerup", up);
}

function raise(w){
  let z = 10;
  for (const x of state.wins) z = Math.max(z, parseInt(x.node.style.zIndex) || 10);
  w.node.style.zIndex = z + 1;
}

function mask(on){$(".dragmask").classList.toggle("on", on)}

/*//////////////////////////////////////////////////////////////////////*/
/* embeds: twitch + youtube apis */

let twitchready = loadscript("https://embed.twitch.tv/embed/v1.js", () => window.Twitch && window.Twitch.Player);
let ytready = new Promise(res => {window.onYouTubeIframeAPIReady = res});
loadscript("https://www.youtube.com/iframe_api");

function makewitch(w){
  twitchready.then(() => {
    w.inst = new window.Twitch.Player(w.body, {
      channel: w.alt.name, parent: parents, muted: true, autoplay: true, width: "100%", height: "100%"
    });
    w.inst.addEventListener(window.Twitch.Player.READY, () => {
      setmuted(w, w.id !== state.focused);
      setquality(w, w.id === state.focused && !cfg.lowall);
    });
  });
}

function makeyt(w){
  const div = el("div");
  w.body.appendChild(div);
  ytready.then(() => {
    w.inst = new window.YT.Player(div, {
      videoId: w.videoId,
      playerVars: {autoplay: 1, mute: 1, playsinline: 1, modestbranding: 1, rel: 0},
      events: {onReady: () => {
        setmuted(w, w.id !== state.focused);
        setquality(w, w.id === state.focused && !cfg.lowall);
      }}
    });
  });
}

function makechat(w){
  const fr = el("iframe");
  fr.allow = "autoplay";
  if (w.platform === "tw"){
    fr.src = "https://www.twitch.tv/embed/" + encodeURIComponent(w.alt.name) + "/chat?darkpopout&" + parents.map(p => "parent=" + p).join("&");
  } else {
    fr.src = "https://www.youtube.com/live_chat?v=" + encodeURIComponent(w.videoId) + "&embed_domain=" + location.hostname;
  }
  w.body.appendChild(fr);
}

function loadscript(src, test){
  return new Promise(res => {
    const s = document.createElement("script");
    s.src = src; s.async = true;
    s.onload = () => res(test ? wait(test) : true);
    document.head.appendChild(s);
  });
}
function wait(test){return new Promise(res => {const t = setInterval(() => {if (test()){clearInterval(t); res(true)}}, 50)})}

/*//////////////////////////////////////////////////////////////////////*/
/* session persistence */

function savesession(){
  const wins = state.wins.map(w => ({type: w.type, platform: w.platform, name: w.alt.name, videoId: w.videoId || null, rect: w.rect}));
  store.setItem("mcsession", JSON.stringify({wins, focused: state.wins.findIndex(w => w.id === state.focused), sideopen: state.sideopen}));
}

function restoresession(){
  let s; try {s = JSON.parse(store.getItem("mcsession") || "{}")} catch (e){return}
  if (s.sideopen) setside(true);
  if (!s.wins) return;
  for (const sw of s.wins){
    const ref = state.altmap[sw.platform + ":" + sw.name.toLowerCase()];
    if (!ref) continue;
    addwin(sw.type, ref.member, {alt: ref.alt, videoId: sw.videoId, rect: sw.rect});
  }
  if (typeof s.focused === "number" && state.wins[s.focused]) focuswin(state.wins[s.focused].id);
}

/*//////////////////////////////////////////////////////////////////////*/
/* ui wiring */

function setside(on){state.sideopen = on; $(".app").classList.toggle("sideopen", on); savesession()}

function banner(msg){
  let b = $(".banner");
  if (!b){b = el("div", "banner"); document.body.appendChild(b)}
  b.textContent = msg;
  clearTimeout(b._t); b._t = setTimeout(() => b.remove(), 6000);
}

function wire(){
  $(".burger").onclick = () => setside(!state.sideopen);
  $(".search").addEventListener("input", renderlist);
  $(".f-online").onclick = e => {e.currentTarget.classList.toggle("on"); renderlist()};
  $(".f-refresh").onclick = refresh;
  let rt;
  window.addEventListener("resize", () => {clearTimeout(rt); rt = setTimeout(relayout, 120)});
}

/*//////////////////////////////////////////////////////////////////////*/
/* boot */

async function boot(){
  wire();
  try {state.members = parseroster(await fetch("channels.txt").then(r => r.text()))}
  catch (e){banner("could not load channels.txt: " + e); state.members = []}
  renderlist();
  restoresession();
  refresh();
}

boot();
