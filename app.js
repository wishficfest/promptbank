/* ===============================
   Wish Fic Fest Prompt Bank — JS
   AO3-only + filters + colored borders
   + Share link with in-page Preview (header tinted by ship)
   =============================== */

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
  window.sb = sb; // expose for console helpers
  return sb;
}

/* ---------- State ---------- */
let PROMPTS = [];      // rows from prompts_public
let WRITE_MAP = {};    // { prompt_id: [ {id,author,ao3_url,created_at}, ... ] }

/* ---------- Small helpers ---------- */
const $  = (s, r=document) => r.querySelector(s);
const $$ = (s, r=document) => Array.from(r.querySelectorAll(s));
const S  = (v) => (v ?? "").toString();

function escapeHTML(s){
  return S(s)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;')
    .replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#039;');
}
function toast(msg, kind="ok", ms=2800){
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
function shareURL(id){
  const base = `${location.origin}${location.pathname}`.replace(/index\.html$/,"");
  return `${base}?p=${encodeURIComponent(id)}`;
}
function renderEmpty(reason=""){
  const el=LIST(); if(!el) return;
  el.innerHTML = `<div class="empty"><div>No prompts to show.</div>${reason?`<div class="empty-reason">${escapeHTML(reason)}</div>`:""}</div>`;
}

/* ---------- Fetch (bulk) ---------- */
async function loadAll(limit=400){
  ensureSB();
  const [{ data: prompts, error: e1 }, { data: writings, error: e2 }] = await Promise.all([
    sb.from("prompts_public").select("*").order("created_at",{ascending:false}).limit(limit),
    sb.from("prompt_writings").select("id, prompt_id, author, ao3_url, created_at").order("created_at",{ascending:true})
  ]);
  if(e1) throw e1;
  if(e2) throw e2;

  PROMPTS = prompts || [];

  WRITE_MAP = {};
  (writings || []).forEach(w=>{
    (WRITE_MAP[w.prompt_id] ||= []).push(w);
  });
}

/* ---------- AO3 helpers ---------- */
function getWritings(pid){ return WRITE_MAP[pid] || []; }
function hasAo3(pid){ return getWritings(pid).some(w => !!w.ao3_url); }

/* ---------- Pair color class ---------- */
const KNOWN = new Set([
  "riku-yushi","riku-sion","riku-jaehee","yushi-sion","yushi-jaehee","sion-jaehee",
  "riku-yushi-jaehee","riku-yushi-sion","riku-jaehee-sion","yushi-jaehee-sion",
  "riku-yushi-jaehee-sion"
]);
function normTokens(s){
  return S(s).toLowerCase()
    .split(/[\/,]/).map(x=>x.trim()).filter(Boolean)
    .map(x => ({ riku:"riku", yushi:"yushi", sion:"sion", jaehee:"jaehee" }[x] || x));
}
function choosePairKey(ship){
  const t = Array.from(new Set(normTokens(ship))).sort();
  if(t.length>=4){ const k=t.slice(0,4).join("-"); if(KNOWN.has(k)) return k; }
  if(t.length>=3){
    for(let i=0;i<t.length;i++)
      for(let j=i+1;j<t.length;j++)
        for(let k=j+1;k<t.length;k++){
          const key=[t[i],t[j],t[k]].join("-");
          if(KNOWN.has(key)) return key;
        }
  }
  if(t.length>=2){
    const k = [t[0], t[1]].join("-");
    if(KNOWN.has(k)) return k;
    for(let i=0;i<t.length;i++)
      for(let j=i+1;j<t.length;j++){
        const k2=[t[i],t[j]].join("-");
        if(KNOWN.has(k2)) return k2;
      }
  }
  return null;
}
function applyPairClass(el, ship){
  if (!el) return;
  const key = choosePairKey(ship || "");
  if(key) el.classList.add(`pair-${key}`);
}

/* ---------- Chips renderer ---------- */
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

/* ---------- Card ---------- */
function renderCard(p){
  const card = document.createElement("div");
  card.className = "card";
  card.dataset.id = p.id;
  applyPairClass(card, p.ship);

  const full  = S(p.prompt);
  const short = full.length > 170 ? full.slice(0,165) + "…" : full;
  const hasMore = full.length > short.length;

  const ao3Count = getWritings(p.id).filter(w=>!!w.ao3_url).length;

  card.innerHTML = `
    <h3>${escapeHTML(p.title || "Prompt")}</h3>
    ${full ? `
      <p class="prompt-text lead" data-full="${escapeHTML(full)}" data-short="${escapeHTML(short)}">${escapeHTML(short)}</p>
      ${hasMore ? `<button class="link-btn" data-action="toggle-full">Read more</button>` : ``}
    ` : ``}

    <div class="meta">
      ${row("Description", S(p.description || "-"))}
      ${row("Ship",       S(p.ship || "-"))}
      ${row("Genre",      S(p.genre || "-"))}
      ${row("Characters", S(p.characters || "-"))}
      ${row("Rating",     S(p.rating || "-"))}
      <div class="meta-row"><b>Prompter</b><span class="prompter-text">${escapeHTML(S(p.prompter || "anon"))}</span></div>
    </div>

    <div class="pill">📖 AO3: <b>Links ×${ao3Count}</b></div>

    <div class="actions">
      <button class="btn" data-action="add-ao3-written">📚 Add AO3 Written by</button>
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
  const count = getWritings(pid).filter(w=>!!w.ao3_url).length;
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

/* --- preview tint styles (override inline bg) --- */
function ensurePreviewTintStyles(){
  if (document.getElementById("pvTintStyles")) return;

  const css = `
  .preview-card{ border-color:#e5e5e5; }

  .preview-card.pair-riku-yushi{ border-color: var(--c-riku-yushi) !important; }
  .preview-card.pair-riku-sion{ border-color: var(--c-riku-sion) !important; }
  .preview-card.pair-riku-jaehee{ border-color: var(--c-riku-jaehee) !important; }
  .preview-card.pair-yushi-sion{ border-color: var(--c-yushi-sion) !important; }
  .preview-card.pair-yushi-jaehee{ border-color: var(--c-yushi-jaehee) !important; }
  .preview-card.pair-sion-jaehee{ border-color: var(--c-sion-jaehee) !important; }
  .preview-card.pair-riku-yushi-jaehee{ border-color: var(--c-riku-yushi-jaehee) !important; }
  .preview-card.pair-riku-yushi-sion{ border-color: var(--c-riku-yushi-sion) !important; }
  .preview-card.pair-riku-jaehee-sion{ border-color: var(--c-riku-jaehee-sion) !important; }
  .preview-card.pair-yushi-jaehee-sion{ border-color: var(--c-yushi-jaehee-sion) !important; }
  .preview-card.pair-riku-yushi-jaehee-sion{ border-color: var(--c-riku-yushi-jaehee-sion) !important; }

  .preview-card .pv-head{ color:#111; } /* default */
  .preview-card.pair-riku-yushi   .pv-head{ background: var(--c-riku-yushi)   !important; color:#fff !important; }
  .preview-card.pair-riku-sion    .pv-head{ background: var(--c-riku-sion)    !important; color:#fff !important; }
  .preview-card.pair-riku-jaehee  .pv-head{ background: var(--c-riku-jaehee)  !important; color:#fff !important; }
  .preview-card.pair-yushi-sion   .pv-head{ background: var(--c-yushi-sion)   !important; color:#fff !important; }
  .preview-card.pair-yushi-jaehee .pv-head{ background: var(--c-yushi-jaehee) !important; color:#fff !important; }
  .preview-card.pair-sion-jaehee  .pv-head{ background: var(--c-sion-jaehee)  !important; color:#fff !important; }
  .preview-card.pair-riku-yushi-jaehee .pv-head{ background: var(--c-riku-yushi-jaehee) !important; color:#fff !important; }
  .preview-card.pair-riku-yushi-sion   .pv-head{ background: var(--c-riku-yushi-sion)   !important; color:#fff !important; }
  .preview-card.pair-riku-jaehee-sion  .pv-head{ background: var(--c-riku-jaehee-sion)  !important; color:#fff !important; }
  .preview-card.pair-yushi-jaehee-sion .pv-head{ background: var(--c-yushi-jaehee-sion) !important; color:#fff !important; }
  .preview-card.pair-riku-yushi-jaehee-sion .pv-head{ background: var(--c-riku-yushi-jaehee-sion) !important; color:#fff !important; }

  .preview-card .pv-head .btn{ background:#fff; color:#111; border:1px solid rgba(0,0,0,.15); }
  `;
  const style = document.createElement("style");
  style.id = "pvTintStyles";
  style.textContent = css;
  document.head.appendChild(style);
}

function buildPreviewHTML(p){
  const links = getWritings(p.id).filter(w => !!w.ao3_url);
  return `
    <div class="preview-card" role="dialog" aria-modal="true" style="
      pointer-events:auto;
      max-width:760px;width:calc(100% - 24px);
      margin:12px auto;
      background:#fff; border:1px solid #e5e5e5; border-radius:14px;
      box-shadow:0 18px 50px rgba(0,0,0,.18); overflow:hidden">
      <div class="pv-head" style="display:flex;align-items:center;gap:10px;padding:12px 14px;border-bottom:1px solid #eee;background:#fafafa">
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

  ensurePreviewTintStyles();

  const host = ensurePreviewHost();
  host.innerHTML = buildPreviewHTML(p);

  const pv   = host.querySelector(".preview-card");
  const head = host.querySelector(".pv-head");
  applyPairClass(pv,   p.ship);   // tint card border
  applyPairClass(head, p.ship);   // tint header bg

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
function splitNames(s){ return norm(s).split(/[\/,]/).map(x=>x.trim()).filter(Boolean); }

function shipMatches(pship, selected){
  const need = splitNames(selected);
  if(!need.length) return true;
  const hay = splitNames(pship);
  return need.every(n => hay.includes(n));
}
function contains(field, q){
  if(!q) return true;
  return norm(field).includes(norm(q));
}
function matchesSearch(p, q){
  if(!q) return true;
  const hay = [p.title, p.prompt, p.description, p.ship, p.genre, p.characters, p.rating, p.prompter]
    .map(S).join(" • ");
  return contains(hay, q);
}

function applyFilters(){
  const list = LIST(); if(!list) return;
  list.innerHTML = "";

  const q       = $("#searchBar")?.value || "";
  const fShip   = $("#shipFilter")?.value || "";
  const fGenre  = $("#genreFilter")?.value || "";
  const fChar   = $("#characterFilter")?.value || "";
  const fRate   = $("#ratingFilter")?.value || "";
  const ao3Btn  = $("#ao3PostedBtn");
  const ao3Mode = ao3Btn && ao3Btn.getAttribute("aria-pressed")==="true" ? "has" : "all";

  let rows = PROMPTS.slice();

  if (ao3Mode === "has") rows = rows.filter(p => hasAo3(p.id));
  rows = rows.filter(p => matchesSearch(p, q));
  rows = rows.filter(p => shipMatches(p.ship || "", fShip));
  rows = rows.filter(p => contains(p.genre || "", fGenre));
  rows = rows.filter(p => contains((p.characters || "") + " " + (p.ship || ""), fChar));
  rows = rows.filter(p => contains(p.rating || "", fRate));

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

  $$(".mascot[data-char]").forEach(img=>{
    img.addEventListener("click", ()=>{
      const who = img.getAttribute("data-char") || "";
      const sel = $("#characterFilter"); if(sel){ sel.value = who; }
      applyFilters();
    });
  });
}

/* ---------- Boot ---------- */
window.addEventListener("unhandledrejection", (e)=>toast(toErr(e.reason), "err"));
window.addEventListener("error", (e)=> e.message && toast(e.message, "err"));

document.addEventListener("DOMContentLoaded", async ()=>{
  try{
    await loadAll(400);
    wireFilters();
    applyFilters();
    const pid = getParam("p");
    if (pid) setTimeout(()=> openPreview(pid), 80);
  }catch(e){
    console.error(e);
    renderEmpty(toErr(e));
  }
});

/* ---------- Public helpers used elsewhere ---------- */
async function addAo3Written(promptId) {
  const author = prompt('Author?'); if (!author) return;
  const ao3    = prompt('AO3 URL?'); if (!ao3) return;

  ensureSB();
  const { error } = await sb
    .from('prompt_writings')
    .insert([{ prompt_id: promptId, author, ao3_url: ao3 }]);

  if (error) { alert('Gagal: ' + (error.message || 'Unknown')); return; }
  await refreshOneCard(promptId);
}

async function saveAnnotations(promptId, { ao3_links, prompter_override }) {
  ensureSB();
  const payload = { prompt_id: promptId, ao3_links, prompter_override };
  const { error } = await sb
    .from('prompt_annotations')
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
  }catch(e){ /* ignore */ }

  const p = PROMPTS.find(x => x.id === promptId);
  if (!p) return;
  const fresh = renderCard(p);
  old.replaceWith(fresh);
}

/* ---------- Internal AO3 actions for buttons ---------- */
async function onAddAo3Written(promptId){
  const authorRaw = prompt("Author name / handle:");
  if (!authorRaw) return;
  const author = authorRaw.trim();
  if (!author) { alert("Author cannot be empty."); return; }

  const urlRaw = prompt("AO3 URL:");
  if (!urlRaw) return;
  const ao3 = urlRaw.trim();
  if (!ao3) { alert("AO3 URL cannot be empty."); return; }

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
