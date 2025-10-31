
/* ---------- Config ---------- */
const SUPABASE_URL      = window.SUPABASE_URL      || "https://vkeisxxfexnsuwqqmduw.supabase.co";
const SUPABASE_ANON_KEY = window.SUPABASE_ANON_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZrZWlzeHhmZXhuc3V3cXFtZHV3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTkzODc3NjUsImV4cCI6MjA3NDk2Mzc2NX0.crOPV9tLVw6ruDWPBfS1XDvc3oJDq5_9dGquD2KCBeI";
const LIST = () => document.querySelector("#promptGrid") || document.querySelector(".prompt-list");

/* ---------- Supabase ---------- */
let sb = null;
function ensureSB(){
  if (sb) return sb;
  if (!window.supabase) throw new Error("Supabase JS not loaded");
  sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
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
function shareURL(id){ return `#prompt-${encodeURIComponent(id)}`; }
function renderEmpty(reason=""){
  const el=LIST(); if(!el) return; el.innerHTML = `<div class="empty"><div>No prompts to show.</div>${reason?`<div class="empty-reason">${escapeHTML(reason)}</div>`:""}</div>`;
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

  // build map
  WRITE_MAP = {};
  (writings || []).forEach(w=>{
    const pid = w.prompt_id;
    (WRITE_MAP[pid] ||= []).push(w);
  });
}

/* ---------- AO3 helpers ---------- */
function getWritings(pid){ return WRITE_MAP[pid] || []; }
function hasAo3(pid){ return getWritings(pid).some(w => !!w.ao3_url); }

/* ---------- Pair color class (matches your CSS) ---------- */
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
    // try every 3-combo that is known
    for(let i=0;i<t.length;i++){
      for(let j=i+1;j<t.length;j++){
        for(let k=j+1;k<t.length;k++){
          const key=[t[i],t[j],t[k]].join("-");
          if(KNOWN.has(key)) return key;
        }
      }
    }
  }
  if(t.length>=2){
    // prefer the first two tokens as written order-agnostic
    const k = [t[0], t[1]].join("-");
    if(KNOWN.has(k)) return k;
    // also try any other pair found
    for(let i=0;i<t.length;i++){
      for(let j=i+1;j<t.length;j++){
        const k2=[t[i],t[j]].join("-");
        if(KNOWN.has(k2)) return k2;
      }
    }
  }
  return null;
}
function applyPairClass(card, ship){
  const key = choosePairKey(ship || "");
  if(key) card.classList.add(`pair-${key}`);
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

  return card;
}

function refreshCardUI(card, pid){
  // update pill count
  const count = getWritings(pid).filter(w=>!!w.ao3_url).length;
  const pill = card.querySelector(".pill");
  if (pill) pill.innerHTML = `📖 AO3: <b>Links ×${count}</b>`;

  // replace chips row
  const chips = card.querySelector('[data-row="ao3-written"]');
  const html  = renderAO3WrittenChips(pid);
  if (chips) chips.outerHTML = html;
  else card.insertAdjacentHTML("beforeend", html);
}

/* ---------- AO3 actions (DB) ---------- */
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

  // push to map
  (WRITE_MAP[promptId] ||= []).push(data);
  toast("AO3 Written-by added ✅", "ok");
}

async function onRemoveAo3Written(writingId, promptId){
  ensureSB();
  const { error } = await sb.from("prompt_writings").delete().eq("id", writingId);
  if (error){ toast(toErr(error), "err"); return; }

  // remove from map
  WRITE_MAP[promptId] = (WRITE_MAP[promptId] || []).filter(w => w.id !== writingId);
  toast("Removed", "ok");
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

  // mascot quick character filter
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
  }catch(e){
    console.error(e);
    renderEmpty(toErr(e));
  }
});

async function addAo3Written(promptId) {
  const author = prompt('Author?'); if (!author) return;
  const ao3    = prompt('AO3 URL?'); if (!ao3) return;

  const { error } = await window.sb
    .from('prompt_writings')
    .insert([{ prompt_id: promptId, author, ao3_url: ao3 }]);

  if (error) { alert('Gagal: ' + (error.message || 'Unknown')); return; }

  // refresh kartu (ao3_count akan ikut update dari view)
  await refreshOneCard(promptId);
}
async function saveAnnotations(promptId, { ao3_links, prompter_override }) {
  const payload = { prompt_id: promptId, ao3_links, prompter_override };
  const { error } = await window.sb
    .from('prompt_annotations')
    .upsert(payload, { onConflict: 'prompt_id' }); // butuh index unik di atas

  if (error) alert('Gagal simpan annotation: ' + error.message);
}

async function refreshOneCard(promptId) {
  const card = document.querySelector(`[data-id="${promptId}"]`);
  if (!card) return;
  card.innerHTML = renderCard(PROMPTS.find(p => p.id === promptId));
}
