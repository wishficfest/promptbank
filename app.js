/* ---------- Config ---------- */
const SUPABASE_URL      = window.SUPABASE_URL      || "https://vkeisxxfexnsuwqqmduw.supabase.co";
const SUPABASE_ANON_KEY = window.SUPABASE_ANON_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZrZWlzeHhmZXhuc3V3cXFtZHV3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTkzODc3NjUsImV4cCI6MjA3NDk2Mzc2NX0.crOPV9tLVw6ruDWPBfS1XDvc3oJDq5_9dGquD2KCBeI";
const LIST = () => document.querySelector("#promptGrid") || document.querySelector(".prompt-list");

/* ---------- Supabase (single global) ---------- */
let sb = null;
function ensureSB(){
  if (sb) return sb;
  if (!window.supabase) throw new Error("Supabase JS not loaded");
  sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  window.sb = sb;
  return sb;
}

/* ---------- State ---------- */
let PROMPTS = [];
let WRITE_MAP = {};   // { prompt_id: [ {id, prompt_id, author, ao3_url, created_at, ...} ] }

/* ---------- Small helpers ---------- */
const $  = (s, r=document) => r.querySelector(s);
const $$ = (s, r=document) => Array.from(r.querySelectorAll(s));
const S  = (v) => (v ?? "").toString();

function escapeHTML(s){
  return S(s).replace(/&/g,'&amp;').replace(/</g,'&lt;')
             .replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#039;');
}
function linkify(raw){
  const rx = /(https?:\/\/[^\s)]+)(?=[)\s]|$)/gi;
  return escapeHTML(S(raw)).replace(rx, (m)=>`<a href="${m}" target="_blank" rel="noopener">${m}</a>`);
}
function toast(msg, kind="ok", ms=2600){
  let w=$("#toastWrap");
  if(!w){
    w=document.createElement("div");
    Object.assign(w.style,{position:"fixed",right:"16px",bottom:"16px",display:"flex",gap:"8px",zIndex:"9999",flexDirection:"column"});
    w.id="toastWrap"; document.body.appendChild(w);
  }
  const t=document.createElement("div");
  Object.assign(t.style,{padding:"10px 12px",borderRadius:"10px",border:"1px solid rgba(0,0,0,.08)",boxShadow:"0 2px 8px rgba(0,0,0,.12)",maxWidth:"420px",fontSize:"13px"});
  t.style.background = kind==="ok" ? "#d1e7dd" : "#f8d7da";
  t.style.color      = kind==="ok" ? "#0f5132" : "#842029";
  t.textContent = msg; w.appendChild(t); setTimeout(()=>t.remove(), ms);
}
function toErr(err){
  if(!err) return "Unknown error";
  if(typeof err === "string") return err;
  const p=[]; if(err.message) p.push(err.message); if(err.details) p.push(err.details); if(err.hint) p.push(err.hint); if(err.code) p.push(`[${err.code}]`);
  try{ return p.join(" — ") || JSON.stringify(err);}catch{ return String(err);}
}
function row(k,v){ return `<div class="meta-row"><b>${escapeHTML(k)}</b><span>${escapeHTML(v)}</span></div>`; }
function rowHTML(k, html){ return `<div class="meta-row"><b>${escapeHTML(k)}</b><span>${html}</span></div>`; }
function shareURL(id){
  const base = `${location.origin}${location.pathname}`.replace(/index\.html$/,"");
  return `${base}?p=${encodeURIComponent(id)}`;
}
function renderEmpty(reason=""){
  const el=LIST(); if(!el) return;
  el.innerHTML = `<div class="empty"><div>No prompts to show.</div>${reason?`<div class="empty-reason">${escapeHTML(reason)}</div>`:""}</div>`;
}

/* ---------- Fetch (bulk) ---------- */
async function loadAll(limit = 1000){
  ensureSB();

  const [promRes, writeRes] = await Promise.all([
    sb.from("prompts")
      .select("id,title,prompt,ship,genre,characters,rating,votes,ao3_link,submitted_by,created_at,description,claimed,fulfilled,gifted_to")
      .order("created_at", { ascending:false })
      .limit(limit),
    sb.from("prompt_writings")
      .select("id,prompt_id,author,ao3_url,created_at")
      .order("created_at", { ascending:true })
  ]);

  if (promRes.error) throw promRes.error;
  if (writeRes.error) throw writeRes.error;

  // Map submitted_by -> prompter for UI/filters
  PROMPTS = (promRes.data || []).map(p => ({
    ...p,
    prompter: p.submitted_by ?? null
  }));

  WRITE_MAP = {};
  (writeRes.data || []).forEach(w=>{
    (WRITE_MAP[w.prompt_id] ||= []).push(w);
  });
}

function getPrompt(pid){ return PROMPTS.find(x => x.id === pid) || null; }

/* ---------- AO3 helpers ---------- */
function getWritings(pid){ return WRITE_MAP[pid] || []; }
function hasAo3(pid){
  const p = getPrompt(pid);
  const viaPrompt = !!(p && p.ao3_link);
  const viaChild  = getWritings(pid).some(w => !!w.ao3_url);
  return viaPrompt || viaChild;
}

/* ---------- Ship parsing ---------- */
const SEP_RE = /[\/,×]|\s+x\s+|,/gi;
function normTokens(s){
  return (s ?? "")
    .toLowerCase()
    .split(SEP_RE)
    .map(x=>x.trim())
    .filter(Boolean)
    .map(x => ({ riku:"riku", yushi:"yushi", sion:"sion", jaehee:"jaehee" }[x] || x));
}
const KNOWN = new Set([
  "riku-yushi","riku-sion","riku-jaehee","yushi-sion","yushi-jaehee","sion-jaehee",
  "riku-yushi-jaehee","riku-yushi-sion","riku-jaehee-sion","yushi-jaehee-sion",
  "riku-yushi-jaehee-sion"
]);
function choosePairKey(ship){
  const t = Array.from(new Set(normTokens(ship))).sort();
  if(!t.length) return null;
  if(t.length>=4){ const k=t.slice(0,4).join("-"); if(KNOWN.has(k)) return k; }
  if(t.length===3){
    for(let i=0;i<t.length;i++){
      const key=[t[(i)%3],t[(i+1)%3],t[(i+2)%3]].sort().join("-");
      if(KNOWN.has(key)) return key;
    }
  }
  if(t.length===2){
    const k=[t[0],t[1]].join("-");
    if(KNOWN.has(k)) return k;
  }
  return null;
}

/* ======== Color engine ======== */
const PALETTE = [
  "#3b82f6","#f472b6","#22c55e","#f59e0b","#a78bfa","#06b6d4",
  "#ef4444","#10b981","#8b5cf6","#0ea5e9","#e11d48","#2563eb",
  "#84cc16","#fb7185","#f97316","#14b8a6","#9333ea","#4f46e5"
];
const SOLO_COLORS = { riku:"#4098ff", yushi:"#4098ff", sion:"#ff5fa2", jaehee:"#ff5fa2" };
const PAIR_COLORS = {
  "riku-yushi":"#218BB8","yushi-sion":"#4098ff","riku-sion":"#17a2a4",
  "yushi-jaehee":"#ff5fa2","riku-jaehee":"#a06ce2","sion-jaehee":"#22c55e",
  "riku-yushi-sion":"#f59e0b","riku-yushi-jaehee":"#6366f1",
  "riku-jaehee-sion":"#9b59b6","yushi-jaehee-sion":"#00bcd4",
  "riku-yushi-jaehee-sion":"#f43f5e"
};
function hashStr(s){ let h=0; for(let i=0;i<s.length;i++){ h=(h<<5)-h+s.charCodeAt(i); h|=0; } return Math.abs(h); }
function colorFromHash(s){ return PALETTE[hashStr(s||"wish")%PALETTE.length]; }
function colorForShip(ship){
  const tokens = normTokens(ship);
  const key = choosePairKey(ship);
  if (key && PAIR_COLORS[key]) return PAIR_COLORS[key];
  if (tokens.length === 1 && SOLO_COLORS[tokens[0]]) return SOLO_COLORS[tokens[0]];
  const hasBlue = tokens.some(t => t==="riku" || t==="yushi");
  const hasPink = tokens.some(t => t==="sion" || t==="jaehee");
  if (hasBlue && !hasPink) return "#4098ff";
  if (hasPink && !hasBlue) return "#ff5fa2";
  return colorFromHash(String(ship));
}
function applyPairClass(el, ship){
  if (!el) return;
  el.style.setProperty("--pair", colorForShip(ship || ""));
  const key = choosePairKey(ship || "");
  if (key) el.classList.add(`pair-${key}`);
}

/* ---------- Genre canonicalization ---------- */
const GENRE_CANON = [
  // Core tone
  "Angst","Light Angst","Heavy Angst","Angst with Happy Ending","Sad Ending",
  "Unrequited Love","Dark Romance","Toxic Relationship","Addictive Love","Major Character Death",

  // Romance & dynamics
  "Fluff","Friends to Lovers","Strangers to Lovers","Rivals to Lovers","Enemies to Lovers",
  "Strangers → Friends → Lovers","Established Relationship","Arranged Marriage",
  "Secret Relationship","Jealousy","Mutual Pining","Yearning","Cheating",
  "Power Imbalance","Bed Sharing","Getting Together","Stranger → Lover → Stranger",
  "Exes to Lovers","Grumpy×Sunshine",

  // Heat / NSFW
  "High Sexual Tension","NSFW","Post-sex Activity / After-care / Nudity",
  "Voyeurism","Shower Sex","Hotel Room","Backstage Kiss","Damp Skin","Adrenaline Rush","Hookups",

  // Setting/genre
  "Canon Compliant","Omegaverse","Idol AU","Music AU",
  "Fantasy","Magical Realism","Urban Legend","Dystopian","Multiverse","Mystery","Adventure",
  "Slice of Life","Summer Romance","First Love","First Kiss","Family","Friendship/Brothership",
  "Zombie Apocalypse","Highschool Crushes","Road Trip",

  // Character / POV (yang ada di data)
  "M/M","Husbands","Riku-centric","Jaehee-centric","Yushi-centric","Yut-centric","Sion-centric",
  "Soft Sion","Sion is Whipped","Cat-Hybrid Riku × Human Sion",
  "Critical Illness","Body Dysmorphia","Identity Crisis","Mental Health",

  // NEW / fixes
  "Fake Dating","Boypussy Yushi","Degradation","Sick","Mpreg",
  "Hurt/Comfort","Hurt No Comfort","Crack","Slow Burn","Miscommunication","Age Gap"
];

const TAG_SYNONYMS = {
  // Omegaverse
  "aboverse":"Omegaverse","omega verse":"Omegaverse","omega!riku":"Omegaverse","alpha!jaehee":"Omegaverse",

  // Angst family
  "angst":"Angst","heavy angst":"Heavy Angst","#heavy angst":"Heavy Angst",
  "a little bit angst":"Light Angst","kinda-angst":"Light Angst","heavy angst/angst":"Heavy Angst",
  "angst with a happy ending":"Angst with Happy Ending","mcd":"Major Character Death",
  "major character death":"Major Character Death","sad ending":"Sad Ending","unrequited love":"Unrequited Love",

  // Romance dynamics
  "friends to lovers":"Friends to Lovers","strangers to lovers":"Strangers to Lovers",
  "rivals to lovers":"Rivals to Lovers","enemies to lovers":"Enemies to Lovers",
  "strangers to friends to lovers":"Strangers → Friends → Lovers",
  "exes to lovers":"Exes to Lovers",
  "fake/pretending relationship":"Fake Dating","fake,pretending relationship":"Fake Dating","fake pretending relationship":"Fake Dating",
  "getting together":"Getting Together","grumpyxsunshine":"Grumpy×Sunshine","grumpy x sunshine":"Grumpy×Sunshine",

  // Pining / tension
  "mutual pinning":"Mutual Pining","pinning":"Mutual Pining","pining":"Mutual Pining","yearning":"Yearning",
  "sexual tension":"High Sexual Tension","high sexual tension":"High Sexual Tension",

  // Heat / NSFW
  "nsfw":"NSFW",
  "post-sex activity":"Post-sex Activity / After-care / Nudity","after-care":"Post-sex Activity / After-care / Nudity",
  "mention of sex":"Post-sex Activity / After-care / Nudity","nudity":"Post-sex Activity / After-care / Nudity",
  "voyeurism":"Voyeurism","shower sex":"Shower Sex","hotel room":"Hotel Room","backstage kiss":"Backstage Kiss",
  "damp skin":"Damp Skin","adrenaline rush":"Adrenaline Rush","hookups":"Hookups","filming":"Filming",

  // Setting
  "canon":"Canon Compliant","canon compliant":"Canon Compliant",
  "music au":"Music AU","idol au":"Idol AU",
  "urban legend":"Urban Legend","multiverse":"Multiverse",
  "slice of life":"Slice of Life","sloce of life":"Slice of Life",
  "summer romance":"Summer Romance","first love":"First Love","first kiss":"First Kiss",
  "family":"Family","friendship":"Friendship/Brothership","brothership":"Friendship/Brothership",
  "road trip":"Road Trip","zombie apocalypse":"Zombie Apocalypse","highschool crushes":"Highschool Crushes",

  // Character specific / centric POV
  "sion centric":"Sion-centric","soft sion":"Soft Sion","sion is whipped":"Sion is Whipped",
  "riku centric":"Riku-centric","jaehee centric":"Jaehee-centric","yushi centric":"Yushi-centric",
  "yut centric":"Yut-centric","yut-centric":"Yut-centric",

  // Pairing formats
  "m/m":"M/M","m,m":"M/M","m , m":"M/M","m / m":"M/M","mm":"M/M","m m":"M/M",
  "f/m":"", // hide F/M

  // Missed / fixes
  "hurt no comfort":"Hurt No Comfort","hnc":"Hurt No Comfort",
  "miscommunication":"Miscommunication","misscommunication":"Miscommunication","misscomunication":"Miscommunication",
  "identity crisis":"Identity Crisis","mental health":"Mental Health",
  "age":"Age Gap","age gap":"Age Gap",

  // Body / health
  "critical illness":"Critical Illness","body dysmorphia":"Body Dysmorphia",

  // Specials
  "cat hybrid riku|human sion":"Cat-Hybrid Riku × Human Sion",

  // New per request
  "fake dating":"Fake Dating",
  "boypussy yushi":"Boypussy Yushi","boypussy":"Boypussy Yushi",
  "degradation":"Degradation",
  "sick":"Sick","hurt,comfort":"Hurt/Comfort","hurt comfort":"Hurt/Comfort","hurt , comfort":"Hurt/Comfort",
  "mpreg":"Mpreg","male pregnancy":"Mpreg","mpreg | male pregnancy":"Mpreg",
  "crack":"Crack","slow burn":"Slow Burn"
};

function canonTag(raw){
  if(!raw) return "";
  const k = String(raw).toLowerCase().trim();
  const cleaned = k.replace(/[()#?!.,’“”"]/g,"").replace(/\s+/g," ").trim();
  const hit = TAG_SYNONYMS[cleaned] || TAG_SYNONYMS[cleaned.replace(/\s*-\s*/g," ")] || null;
  if (hit !== null && hit !== undefined) return hit;
  return cleaned
    .replace(/\bomega verse\b/,"Omegaverse")
    .replace(/\bslowburn\b/,"Slow Burn")
    .replace(/\bslow burn\b/,"Slow Burn")
    .replace(/\bcanon compliant\b/,"Canon Compliant")
    .replace(/\bslice of life\b/,"Slice of Life")
    .replace(/\bfluff\b/,"Fluff")
    .replace(/\bangst\b/,"Angst")
    .replace(/\bmcd\b/,"Major Character Death");
}
function promptHasGenre(p, selected){
  if(!selected) return true;
  const want = String(selected).trim().toLowerCase();
  const tags = S(p.genre || "")
    .split(/[;,]/)
    .map(s => canonTag(s))
    .filter(Boolean)
    .map(s => s.toLowerCase());
  return tags.some(t => t === want);
}
function populateGenreFilter(){
  const sel = document.querySelector("#genreFilter");
  if (!sel) return;
  const prev = sel.value;
  sel.innerHTML = "";
  const all = document.createElement("option");
  all.value = ""; all.textContent = "All Genres";
  sel.appendChild(all);
  GENRE_CANON.forEach(g => {
    const opt = document.createElement("option");
    opt.value = g; opt.textContent = g;
    sel.appendChild(opt);
  });
  if ([...sel.options].some(o => o.value === prev)) sel.value = prev;
}

/* ---------- Rating canonicalization ---------- */
const RATING_CANON = ["Not Rated","Mature","Explicit"];
const RATING_SYNONYMS = {
  "not rated":"Not Rated","notrated":"Not Rated","unrated":"Not Rated",
  "general":"General","g":"General",
  "teen":"Teen","t":"Teen",
  "mature":"Mature","m":"Mature",
  "explicit":"Explicit","e":"Explicit"
};
function canonRating(raw){
  if(!raw) return "";
  const k = String(raw).toLowerCase().trim();
  return RATING_SYNONYMS[k] || raw.toString().trim();
}
function promptHasRating(p, selected){
  if(!selected) return true;
  const want = canonRating(selected).toLowerCase();
  const have = canonRating(p.rating || "").toLowerCase();
  return want ? (have === want) : true;
}
function populateRatingFilter(){
  const sel = document.querySelector("#ratingFilter");
  if (!sel) return;
  const prev = sel.value;
  sel.innerHTML = "";
  const all = document.createElement("option");
  all.value = ""; all.textContent = "All Ratings";
  sel.appendChild(all);
  RATING_CANON.forEach(r=>{
    const opt = document.createElement("option");
    opt.value = r; opt.textContent = r;
    sel.appendChild(opt);
  });
  if ([...sel.options].some(o => o.value === prev)) sel.value = prev;
}

/* ---------- Card ---------- */
function renderAO3WrittenChips(pid){
  const arr = getWritings(pid).filter(w=>!!w.ao3_url);
  return `
    <div class="chips" data-row="ao3-written">
      ${arr.map(w=>{
        const name = (w.author ?? "").trim() || "(anon)";
        const url  = (w.ao3_url ?? "").trim();
        return `
          <span class="chip">
            ✍️ ${escapeHTML(name)} · <a href="${escapeHTML(url)}" target="_blank" rel="noopener">Read</a>
            <button class="chip-x" title="remove" data-action="remove-ao3-written" data-wid="${escapeHTML(w.id)}">×</button>
          </span>
        `;
      }).join("")}
    </div>
  `;
}

function renderCard(p){
  const card = document.createElement("div");
  card.className = "card";
  card.dataset.id = p.id;
  applyPairClass(card, p.ship);

  const full  = S(p.prompt);
  const short = full.length > 170 ? full.slice(0,165) + "…" : full;
  const hasMore = full.length > short.length;

  const ao3Base = p.ao3_link ? 1 : 0;
  const ao3Count = ao3Base + getWritings(p.id).filter(w=>!!w.ao3_url).length;

  card.innerHTML = `
    <div class="card-head"><h3>${escapeHTML(p.title || "Prompt")}</h3></div>
    ${full ? `
      <p class="prompt-text lead" data-full="${escapeHTML(full)}" data-short="${escapeHTML(short)}">${escapeHTML(short)}</p>
      ${hasMore ? `<button class="link-btn" data-action="toggle-full">Read more</button>` : ``}
    ` : ``}

    <div class="meta">
      ${rowHTML("Description", linkify(S(p.description || "-")))}
      ${row("Ship",       S(p.ship || "-"))}
      ${row("Genre",      S(p.genre || "-"))}
      ${row("Characters", S(p.characters || "-"))}
      ${row("Rating",     S(p.rating || "-"))}
      <div class="meta-row"><b>Prompter</b><span class="prompter-text">${escapeHTML(S(p.submitted_by || p.prompter || "anon"))}</span></div>
      ${p.ao3_link ? rowHTML("AO3 (base)", `<a href="${escapeHTML(p.ao3_link)}" target="_blank" rel="noopener">Open</a>`) : ""}
    </div>

    <div class="pill">📖 Works: <b>Links ×${ao3Count}</b></div>

    <div class="actions">
      <button class="btn" data-action="add-ao3-written">📚 Add Writing Link</button>
    </div>

    ${renderAO3WrittenChips(p.id)}

    <div class="share-line">
      <span>🔗 Share:</span>
      <a class="share-a" href="${shareURL(p.id)}" data-id="${p.id}">link</a>
    </div>
  `;

  card.addEventListener("click", async (e)=>{
    const btn = e.target.closest("[data-action]");
    if(!btn) return;
    const act = btn.dataset.action;

    if (act === "toggle-full"){
      const pEl = card.querySelector(".lead");
      const showFull = pEl.textContent === pEl.dataset.full;
      pEl.textContent = showFull ? pEl.dataset.short : pEl.dataset.full;
      btn.textContent = showFull ? "Read more" : "Read less";
      return;
    }

    if (act === "add-ao3-written"){
      await onAddAo3Written(p.id);
      refreshCardUI(card, p.id);
      return;
    }

    if (act === "remove-ao3-written"){
      const wid = btn.dataset.wid;
      await onRemoveAo3Written(wid, p.id);
      refreshCardUI(card, p.id);
      return;
    }
  });

  card.querySelector(".share-a")?.addEventListener("click", (e)=>{
    e.preventDefault();
    copyAndPreview(e.currentTarget.dataset.id);
  });

  return card;
}

function refreshCardUI(card, pid){
  const p = getPrompt(pid);
  const base = p && p.ao3_link ? 1 : 0;
  const count = base + getWritings(pid).filter(w=>!!w.ao3_url).length;

  const pill = card.querySelector(".pill");
  if (pill) pill.innerHTML = `📖 AO3: <b>Links ×${count}</b>`;

  const chips = card.querySelector('[data-row="ao3-written"]');
  const html  = renderAO3WrittenChips(pid);
  if (chips) chips.outerHTML = html;
  else card.insertAdjacentHTML("beforeend", html);
}

/* ---------- Share + Preview ---------- */
async function copyAndPreview(id){
  const url = shareURL(id);
  try{
    await navigator.clipboard.writeText(url);
    toast("Share link copied ✓");
  }catch{
    prompt("Copy this link:", url);
  }
  history.pushState(null, "", `?p=${encodeURIComponent(id)}`);
  openPreview(id);
}
function getParam(name){ return new URLSearchParams(location.search).get(name); }

function ensurePreviewHost(){
  let host = $("#previewHost");
  if (host) return host;
  host = document.createElement("div");
  host.id = "previewHost";
  Object.assign(host.style, {
    position:"fixed", left:0, right:0, top:0, zIndex:9998,
    display:"flex", justifyContent:"center", pointerEvents:"none"
  });
  document.body.appendChild(host);
  return host;
}

function buildPreviewHTML(p){
  const links = [
    ...(p.ao3_link ? [{ author: "(base)", ao3_url: p.ao3_link }] : []),
    ...getWritings(p.id).filter(w => !!w.ao3_url)
  ];
  return `
    <div class="preview-card" role="dialog" aria-modal="true" style="pointer-events:auto;margin:12px auto;overflow:hidden">
      <div class="pv-head" style="display:flex;align-items:center;gap:10px;padding:12px 14px;border-bottom:1px solid rgba(0,0,0,.05)">
        <strong style="font-size:16px">Preview — ${escapeHTML(p.title ? `Prompt ${p.title}` : "Prompt")}</strong>
        <div style="margin-left:auto;display:flex;gap:8px">
          <button data-pv="copy" class="btn">Copy link</button>
          <button data-pv="close" class="btn">Close</button>
        </div>
      </div>
      <div style="padding:14px">
        ${p.prompt ? `<p style="margin:0 0 8px 0; line-height:1.45">${escapeHTML(p.prompt)}</p>` : ""}
        <div style="display:grid;grid-template-columns:120px 1fr;gap:6px 10px">
          <div style="color:#666">Ship</div><div>${escapeHTML(p.ship || "-")}</div>
          <div style="color:#666">Genre</div><div>${escapeHTML(p.genre || "-")}</div>
          <div style="color:#666">Characters</div><div>${escapeHTML(p.characters || "-")}</div>
        </div>
        <div style="margin-top:10px;display:flex;flex-wrap:wrap;gap:8px">
          ${links.length
            ? links.map(w => `<a class="btn" target="_blank" rel="noopener" href="${escapeHTML(w.ao3_url)}">Read ${escapeHTML(w.author || "anon")}</a>`).join("")
            : `<span style="color:#666">No AO3 links yet.</span>`}
        </div>
      </div>
    </div>
  `;
}

function openPreview(id){
  const p = PROMPTS.find(x => x.id === id);
  if (!p){ toast("Prompt not found","err"); return; }

  const host = ensurePreviewHost();
  host.innerHTML = buildPreviewHTML(p);

  const pv = host.querySelector(".preview-card");
  applyPairClass(pv, p.ship);

  const close = ()=>{ host.innerHTML = ""; history.replaceState(null,"",location.pathname + location.hash); };
  host.querySelector('[data-pv="close"]').addEventListener("click", close);
  host.querySelector('[data-pv="copy"]').addEventListener("click", async ()=>{
    const url = shareURL(id);
    try{ await navigator.clipboard.writeText(url); toast("Link copied ✓"); }
    catch{ prompt("Copy this link:", url); }
  });

  function outside(e){
    const card = host.querySelector(".preview-card");
    if (card && !card.contains(e.target)){ close(); window.removeEventListener("mousedown", outside); }
  }
  window.addEventListener("mousedown", outside);

  const el = LIST()?.querySelector(`.card[data-id="${CSS.escape(id)}"]`);
  if (el){ el.scrollIntoView({behavior:"smooth",block:"center"}); el.classList.add("pulse"); setTimeout(()=>el.classList.remove("pulse"),1400); }
}

/* ---------- Filters ---------- */
function norm(s){ return S(s).toLowerCase().replace(/\s+/g,' ').trim(); }
function splitNames(s){ return norm(s).split(SEP_RE).map(x=>x.trim()).filter(Boolean); }

// Exact-two-name ship match
function shipMatches(pship, selected){
  const need = Array.from(new Set(splitNames(selected)));
  if(!need.length) return true;
  const hay = Array.from(new Set(splitNames(pship)));
  if (need.length === 2){
    return hay.length === 2 && need.every(n => hay.includes(n));
  }
  return need.every(n => hay.includes(n));
}

function contains(field, q){ if(!q) return true; return norm(field).includes(norm(q)); }
function matchesSearch(p, q){
  if(!q) return true;
  const hay = [p.title, p.prompt, p.description, p.ship, p.genre, p.characters, p.rating, p.prompter, p.submitted_by]
    .map(S).join(" • ");
  return contains(hay, q);
}

/* ---------- Order helper: Prompt 1 → ... ---------- */
function __promptOrderNumber__(title){
  const m = String(title || "").match(/(\d+)/);
  return m ? parseInt(m[1],10) : Number.POSITIVE_INFINITY;
}

/* ---------- Apply filters (AO3 + Genre + Rating + others) ---------- */
function applyFilters(){
  const list = LIST(); if(!list) return;
  list.innerHTML = "";

  const q      = $("#searchBar")?.value || "";
  const fShip  = $("#shipFilter")?.value || "";
  const fGenre = $("#genreFilter")?.value || "";
  const fChar  = $("#characterFilter")?.value || "";
  const fRate  = $("#ratingFilter")?.value || "";

  const ao3Btn  = $("#ao3PostedBtn");
  const ao3Only = ao3Btn && ao3Btn.getAttribute("aria-pressed")==="true";

  let rows = PROMPTS.slice();

  if (ao3Only) rows = rows.filter(p => hasAo3(p.id));
  rows = rows.filter(p => matchesSearch(p, q));
  rows = rows.filter(p => shipMatches(p.ship || "", fShip));
  rows = rows.filter(p => promptHasGenre(p, fGenre));
  rows = rows.filter(p => contains((p.characters || "") + " " + (p.ship || ""), fChar));
  rows = rows.filter(p => promptHasRating(p, fRate));

  rows.sort((a,b)=> __promptOrderNumber__(a.title) - __promptOrderNumber__(b.title));

  rows.forEach(p => list.appendChild(renderCard(p)));
  if(!rows.length) renderEmpty("No results for current filters");
}

function wireFilters(){
  $("#searchBar")?.addEventListener("input", applyFilters);
  $("#shipFilter")?.addEventListener("change", applyFilters);
  $("#genreFilter")?.addEventListener("change", applyFilters);
  $("#characterFilter")?.addEventListener("change", applyFilters);
  $("#ratingFilter")?.addEventListener("change", applyFilters);

  const pill = $("#ao3PostedBtn");
  if(pill){
    pill.addEventListener("click", ()=>{
      const pressed = pill.getAttribute("aria-pressed")==="true";
      pill.setAttribute("aria-pressed", String(!pressed));
      applyFilters();
    });
  }

  // Mascot quick filters
  $$(".mascot[data-char]").forEach(img=>{
    img.addEventListener("click", ()=>{
      const who = img.getAttribute("data-char") || "";
      const sel = $("#characterFilter"); if(sel){ sel.value = who; }
      applyFilters();
    });
  });
}

/* ---------- Hide empty genres from dropdown ---------- */
function pruneEmptyGenres() {
  const present = new Set();
  PROMPTS.forEach(p=>{
    String(p.genre||"").split(/[;,]/).forEach(t=>{
      const k = canonTag(t);
      if (k) present.add(k.toLowerCase());
    });
  });
  const sel = document.querySelector("#genreFilter");
  if (!sel) return;
  [...sel.options].forEach(opt=>{
    if (!opt.value) return; // keep "All Genres"
    if (!present.has(String(opt.value).toLowerCase())) opt.remove();
  });
}

/* ---------- Boot ---------- */
window.addEventListener("unhandledrejection", (e)=>toast(toErr(e.reason), "err"));
window.addEventListener("error", (e)=> e.message && toast(e.message, "err"));

document.addEventListener("DOMContentLoaded", async ()=>{
  try{
    await loadAll(1000);
    populateGenreFilter();
    pruneEmptyGenres();
    populateRatingFilter();
    wireFilters();
    applyFilters();
    const pid = getParam("p");
    if (pid) setTimeout(()=> openPreview(pid), 80);
  }catch(e){
    console.error(e);
    renderEmpty(toErr(e));
  }
});

/* ---------- Public helpers (optional admin) ---------- */
async function addAo3Written(promptId) {
  const author = prompt('Author?'); if (!author) return;
  const ao3 = prompt('Writing link (AO3 / Medium / GDocs / etc)?'); if (!ao3) return;

  ensureSB();
  const { error } = await sb.from('prompt_writings')
    .insert([{ prompt_id: promptId, author, ao3_url: ao3 }]);

  if (error) { alert('Gagal: ' + (error.message || 'Unknown')); return; }
  await refreshOneCard(promptId);
}
async function saveAnnotations(promptId, { ao3_links, prompter_override }) {
  ensureSB();
  const payload = { prompt_id: promptId, ao3_links, prompter_override };
  const { error } = await sb.from('prompt_annotations')
    .upsert(payload, { onConflict: 'prompt_id' });
  if (error) alert('Gagal simpan annotation: ' + error.message);
}
async function refreshOneCard(promptId) {
  const list = LIST(); if (!list) return;
  const old = list.querySelector(`[data-id="${CSS.escape(promptId)}"]`);
  if (!old) return;

  try{
    const { data } = await sb.from("prompt_writings")
      .select("id, author, ao3_url, created_at")
      .eq("prompt_id", promptId)
      .order("created_at", { ascending: true });
    WRITE_MAP[promptId] = data || [];
  }catch(e){}

  const p = getPrompt(promptId);
  if (!p) return;
  const fresh = renderCard(p);
  old.replaceWith(fresh);
}

/* ---------- Internal AO3 actions ---------- */
async function onAddAo3Written(promptId){
  const authorRaw = prompt("Author name / Pen Name:"); if (!authorRaw) return;
  const author = authorRaw.trim(); if (!author) { alert("Author cannot be empty."); return; }
  const urlRaw = prompt("Writing Link (AO3 / Medium / GDocs / etc):"); if (!urlRaw) return;
  const ao3 = urlRaw.trim(); if (!ao3) { alert("Writing Link cannot be empty."); return; }

  ensureSB();
  const { data, error } = await sb.from("prompt_writings")
    .insert([{ prompt_id: promptId, author, ao3_url: ao3 }])
    .select("id, prompt_id, author, ao3_url, created_at")
    .single();

  if (error){ toast(toErr(error), "err"); return; }
  (WRITE_MAP[promptId] ||= []).push(data);
  toast("AO3 Written-by added ✅", "ok");
}
async function onRemoveAo3Written(writingId, promptId){
  ensureSB();
  const { error } = await sb.from("prompt_writings").delete().eq("id", writingId);
  if (error){ toast(toErr(error), "err"); return; }
  WRITE_MAP[promptId] = (WRITE_MAP[promptId] || []).filter(w => w.id !== writingId);
  toast("Removed", "ok");
}

/* ---------- Extra synonyms (optional extension) ---------- */
Object.assign(TAG_SYNONYMS, {
  "m/m":"M/M","m,m":"M/M","m , m":"M/M","m / m":"M/M","mm":"M/M","m m":"M/M",
  "hurt no comfort":"Hurt No Comfort","hurt-no-comfort":"Hurt No Comfort","hnc":"Hurt No Comfort","hurt without comfort":"Hurt No Comfort",
  "identity crisis":"Identity Crisis","mental health":"Mental Health",
  "stranger to lover to stranger again":"Stranger → Lover → Stranger",
  "strangers to lovers to strangers again":"Stranger → Lover → Stranger",
  "stranger→lover→stranger":"Stranger → Lover → Stranger",
  "stranger - lover - stranger":"Stranger → Lover → Stranger",
  "hurt,comfort":"Hurt/Comfort","hurt comfort":"Hurt/Comfort","hurt , comfort":"Hurt/Comfort",
  "highschool crushes":"Highschool Crushes","zombie apocalypse":"Zombie Apocalypse",
  "older/younger dynamic":"", "riku-centric":"", "jaehee-centric":"", "sion centric":""
});
