/* ===============================
   Wish Fic Fest Prompt Bank — JS
   Supabase-only data source
   =============================== */

/* ---------- Helpers ---------- */
const STORE_KEY = 'wffpb:v7';
const $  = (s, r=document) => r.querySelector(s);
const $$ = (s, r=document) => Array.from(r.querySelectorAll(s));

function loadStore(){ try { return JSON.parse(localStorage.getItem(STORE_KEY)) || {}; } catch { return {}; } }
function saveStore(){ localStorage.setItem(STORE_KEY, JSON.stringify(state)); }

function copyToClipboard(text){
  if (navigator.clipboard && window.isSecureContext) return navigator.clipboard.writeText(text);
  return new Promise((resolve, reject)=>{
    try{
      const ta = document.createElement('textarea');
      ta.value = text; ta.setAttribute('readonly',''); ta.style.position='absolute'; ta.style.left='-9999px';
      document.body.appendChild(ta); ta.select(); ta.setSelectionRange(0, ta.value.length);
      const ok = document.execCommand('copy'); document.body.removeChild(ta);
      ok ? resolve() : reject(new Error('copy failed'));
    }catch(e){ reject(e); }
  });
}

function escapeHTML(s){
  return String(s ?? '').replace(/[&<>"']/g, m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
}
const row = (L,R) => `<div class="meta-row"><b>${L}</b><span>${R}</span></div>`;

const SHARE_BASE = (window.PUBLIC_BASE_URL || (location.origin + location.pathname)).replace(/#.*$/,'');
const shareURL = (id) => `${SHARE_BASE}#prompt-${id}`;

function truncateLead(text, max=180){
  const t = String(text || '');
  if (t.length <= max) return t;
  return t.slice(0, max).replace(/\s+\S*$/, '') + '…';
}

/* outline color by ship -> CSS pairing classes */
function pairClass(shipRaw){
  const s = (shipRaw||'').toLowerCase();
  // fix: rapihin char class (hapus slash ganda)
  const set = new Set(s.replace(/[^\w/ ,]/g,'').split(/[,\s/]+/).filter(Boolean));
  const who = ['riku','yushi','sion','jaehee'].filter(n => set.has(n));
  if (!who.length) return '';
  const key = who.sort().join('-');
  switch(key){
    case 'riku-jaehee': return 'pair-riku-jaehee';
    case 'riku-sion': return 'pair-riku-sion';
    case 'riku-yushi': return 'pair-riku-yushi';
    case 'jaehee-sion': return 'pair-sion-jaehee';
    case 'jaehee-yushi': return 'pair-yushi-jaehee';
    case 'sion-yushi': return 'pair-yushi-sion';
    case 'jaehee-riku-sion': return 'pair-riku-jaehee-sion';
    case 'jaehee-riku-yushi': return 'pair-riku-yushi-jaehee';
    case 'jaehee-sion-yushi': return 'pair-yushi-jaehee-sion';
    case 'riku-sion-yushi':  return 'pair-riku-yushi-sion';
    case 'jaehee-riku-sion-yushi': return 'pair-riku-yushi-jaehee-sion';
    default: return '';
  }
}

/* ---------- State & data ---------- */
const state = loadStore();
let prompts = []; // filled from Supabase

/* ---------- Supabase load (final, single copy) ---------- */
async function loadFromSupabase(){
  try {
    if (!window.supabase) throw new Error('supabase-js not loaded');
    if (!window.SUPABASE_URL || !window.SUPABASE_ANON_KEY) {
      throw new Error('Missing SUPABASE_URL / SUPABASE_ANON_KEY on window');
    }

    // Safari-safe: force CORS
    const client = window.supabase.createClient(
      window.SUPABASE_URL,
      window.SUPABASE_ANON_KEY,
      { global: { fetch: (url, opts) => fetch(url, { ...opts, mode: 'cors' }) } }
    );

    const sel = 'id,title,prompt,description,ship,genre,characters,rating,prompter';

    // 1) count dulu biar tahu total row (tanpa data)
    const { count, error: countErr } = await client
      .from('prompts_public')
      .select('*', { head: true, count: 'exact' });
    if (countErr) throw countErr;
    if (count == null) throw new Error('View not accessible (count=null). Check RLS / GRANT SELECT on prompts_public.');

    // 2) ambil SEMUA row via range (hindari default limit 100)
    const { data, error } = await client
      .from('prompts_public')
      .select(sel)
      .range(0, Math.max(0, count - 1))
      .order('title', { ascending: true });
    if (error) throw error;
    if (!Array.isArray(data) || !data.length) throw new Error('No rows returned from prompts_public');

    // normalize id
    prompts = data.map(r => ({ ...r, id: String(r.id) }));
  } catch (err) {
    console.error('[WFFPB] Supabase load failed:', err);
    const grid = document.getElementById('promptGrid');
    if (grid) {
      grid.innerHTML = `<p style="padding:1rem">Couldn’t load prompts from Supabase.<br><b>${escapeHTML(err.message)}</b></p>`;
    }
    throw err;
  }
}

/* ---------- Render ---------- */
const grid = $('#promptGrid');
const dlg  = $('#promptModal');
const dlgContent = $('#modalContent');

function renderAll(){
  grid.innerHTML = '';
  prompts.forEach(p => grid.appendChild(renderCard(p)));
  applyFilters();
}

function renderCard(p){
  const local = state[p.id] || {};
  const gifts = local.gifts ?? [];
  const ao3s  = local.ao3s  ?? [];
  const prompter = local.prompter ?? p.prompter ?? 'anon';
  const descText = p.description ?? '-';

  const lead = truncateLead(p.prompt || '');
  const hasMore = (p.prompt || '').length > lead.length;

  const card = document.createElement('article');
  card.className = `card ${pairClass(p.ship||'')}`;
  card.id = `prompt-${p.id}`;
  card.dataset.id = p.id;

  card.innerHTML = `
    <h3>${escapeHTML(p.title || `Prompt ${p.id}`)}</h3>
    ${p.prompt ? `
      <p class="lead" data-full="${escapeHTML(p.prompt)}" data-short="${escapeHTML(lead)}">${escapeHTML(lead)}</p>
      ${hasMore ? `<button class="link-btn" data-action="toggle-full">Read more</button>`:``}
    ` : ''}

    <div class="meta">
      ${row('Description', escapeHTML(descText))}
      ${row('Ship',        escapeHTML(p.ship||'-'))}
      ${row('Genre',       escapeHTML(p.genre||'-'))}
      ${row('Characters',  escapeHTML(p.characters||'-'))}
      ${row('Rating',      escapeHTML(p.rating||'-'))}
      <div class="meta-row">
        <b>Prompter</b>
        <span>
          <span class="prompter-text">${escapeHTML(prompter)}</span>
          <button class="chip chip-link" data-action="edit-prompter">✏️ Edit</button>
        </span>
      </div>
    </div>

    <div class="status">
      <span class="pill">🎁 Status: <b>Gifted ×${gifts.length}</b></span>
      <span class="pill">📖 AO3: <b>Links ×${ao3s.length}</b></span>
    </div>

    <div class="actions">
      <button class="btn btn-green" data-action="gift">🎁 Add Gift</button>
      <button class="btn btn-blue"  data-action="add-ao3">📚 Add AO3</button>
    </div>

    ${gifts.length ? renderGiftChips(gifts) : ''}
    ${ao3s.length   ? renderAO3Chips(ao3s)   : ''}

    <div class="share-line">
      <span>🔗 Share:</span>
      <a class="share-a" href="${shareURL(p.id)}" data-id="${p.id}">link</a>
    </div>
  `;

  card.addEventListener('click', async (e)=>{
    const aShare = e.target.closest('a.share-a');
    if (aShare){
      e.preventDefault();
      try { await copyToClipboard(aShare.href); } catch {}
      location.href = aShare.href; // open deep-link modal for everyone
      return;
    }

    const btn = e.target.closest('button[data-action]');
    if (!btn) return;
    const act = btn.dataset.action;

    if (act === 'toggle-full')   return onToggleFull(card, btn);
    if (act === 'edit-prompter') return onEditPrompter(p, card);
    if (act === 'gift')          return onGift(p, card);
    if (act === 'add-ao3')       return onAddAO3(p, card);
    if (act === 'remove-gift')   return onRemoveGift(p, card, btn.dataset.name);
    if (act === 'remove-ao3')    return onRemoveAO3(p, card, btn.dataset.url);
  });

  return card;
}

function renderCardForModal(p){
  const local = state[p.id] || {};
  const gifts = local.gifts ?? [];
  const ao3s  = local.ao3s  ?? [];
  const prompter = local.prompter ?? p.prompter ?? 'anon';
  const descText = p.description ?? '-';

  const wrap = document.createElement('article');
  wrap.className = `card ${pairClass(p.ship||'')}`;
  wrap.innerHTML = `
    <h3>${escapeHTML(p.title || `Prompt ${p.id}`)}</h3>
    ${p.prompt ? `<p class="lead">${escapeHTML(p.prompt)}</p>` : ''}

    <div class="meta">
      ${row('Description', escapeHTML(descText))}
      ${row('Ship',        escapeHTML(p.ship||'-'))}
      ${row('Genre',       escapeHTML(p.genre||'-'))}
      ${row('Characters',  escapeHTML(p.characters||'-'))}
      ${row('Rating',      escapeHTML(p.rating||'-'))}
      <div class="meta-row">
        <b>Prompter</b>
        <span>
          <span class="prompter-text">${escapeHTML(prompter)}</span>
          <button class="chip chip-link" data-action="edit-prompter">✏️ Edit</button>
        </span>
      </div>
    </div>

    <div class="status">
      <span class="pill">🎁 Status: <b>Gifted ×${gifts.length}</b></span>
      <span class="pill">📖 AO3: <b>Links ×${ao3s.length}</b></span>
    </div>

    <div class="actions">
      <button class="btn btn-green" data-action="gift">🎁 Add Gift</button>
      <button class="btn btn-blue"  data-action="add-ao3">📚 Add AO3</button>
    </div>

    ${gifts.length ? renderGiftChips(gifts) : ''}
    ${ao3s.length   ? renderAO3Chips(ao3s)   : ''}

    <div class="share-line">
      <span>🔗 Share:</span>
      <a class="share-a" href="${shareURL(p.id)}" data-id="${p.id}">link</a>
    </div>
  `;

  wrap.addEventListener('click', async (e)=>{
    const aShare = e.target.closest('a.share-a');
    if (aShare){
      e.preventDefault();
      try { await copyToClipboard(aShare.href); } catch {}
      location.href = aShare.href;
      return;
    }
    const btn = e.target.closest('button[data-action]');
    if(!btn) return;
    const act = btn.dataset.action;

    if (act === 'edit-prompter') return onEditPrompter(p, wrap);
    if (act === 'gift')          return onGift(p, wrap);
    if (act === 'add-ao3')       return onAddAO3(p, wrap);
    if (act === 'remove-gift')   return onRemoveGift(p, wrap, btn.dataset.name);
    if (act === 'remove-ao3')    return onRemoveAO3(p, wrap, btn.dataset.url);
  });

  return wrap;
}

/* ---------- Chip helpers ---------- */
function renderGiftChips(list){
  return `
    <div class="chip-row">
      ${list.map(name=>`
        <span class="chip">
          🎁 ${escapeHTML(name)}
          <button class="chip-x" data-action="remove-gift" data-name="${escapeHTML(name)}">×</button>
        </span>
      `).join('')}
    </div>
  `;
}
function renderAO3Chips(list){
  return `
    <div class="chip-row">
      ${list.map(url=>`
        <span class="chip">
          📖 <a href="${escapeHTML(url)}" target="_blank" rel="noopener">Read</a>
          <button class="chip-x" data-action="remove-ao3" data-url="${escapeHTML(url)}">×</button>
        </span>
      `).join('')}
    </div>
  `;
}

/* ---------- Actions ---------- */
function onToggleFull(card, btn){
  const p = $('.lead', card);
  const expanded = btn.getAttribute('data-expanded') === '1';
  if (expanded){ p.textContent = p.dataset.short; btn.textContent = 'Read more'; btn.setAttribute('data-expanded','0'); }
  else { p.textContent = p.dataset.full; btn.textContent = 'Read less'; btn.setAttribute('data-expanded','1'); }
}

function onEditPrompter(p, scope){
  const loc = state[p.id] || (state[p.id]={});
  const current = loc.prompter ?? p.prompter ?? 'anon';
  const val = prompt('Prompter name:', current);
  if (val === null) return;
  const trimmed = val.trim() || 'anon';
  loc.prompter = trimmed; saveStore();
  $('.prompter-text', scope).textContent = trimmed;
}

function onGift(p, scope){
  const loc = state[p.id] || (state[p.id]={});
  const who = prompt('Gift to (Twitter @ / Email):'); if(!who) return;
  loc.gifts = loc.gifts || []; loc.gifts.push(who.trim()); saveStore();

  const row0 = scope.querySelector('.chip-row');
  const html = renderGiftChips(loc.gifts);
  row0 && row0.textContent.includes('🎁') ? (row0.outerHTML = html) : scope.insertAdjacentHTML('beforeend', html);

  const pill = scope.querySelectorAll('.status .pill')[0];
  if (pill) pill.innerHTML = `🎁 Status: <b>Gifted ×${loc.gifts.length}</b>`;
}

function onRemoveGift(p, scope, name){
  const loc = state[p.id] || (state[p.id]={});
  loc.gifts = (loc.gifts||[]).filter(n => n !== name); saveStore();

  const btn = scope.querySelector(`button[data-action="remove-gift"][data-name="${CSS.escape(name)}"]`);
  btn?.parentElement?.remove();
  const pill = scope.querySelectorAll('.status .pill')[0];
  if (pill) pill.innerHTML = `🎁 Status: <b>Gifted ×${(loc.gifts||[]).length}</b>`;
}

function onAddAO3(p, scope){
  const loc = state[p.id] || (state[p.id]={});
  const url = prompt('Paste AO3 link:'); if(!url) return;
  loc.ao3s = loc.ao3s || []; loc.ao3s.push(url.trim()); saveStore();

  const rows = scope.querySelectorAll('.chip-row');
  let ao3Row = null;
  if (rows.length === 1 && !rows[0].textContent.includes('🎁')) ao3Row = rows[0];
  if (rows.length >= 2) ao3Row = rows[1];

  const html = renderAO3Chips(loc.ao3s);
  ao3Row ? (ao3Row.outerHTML = html) : scope.insertAdjacentHTML('beforeend', html);

  const pill = scope.querySelectorAll('.status .pill')[1];
  if (pill) pill.innerHTML = `📖 AO3: <b>Links ×${loc.ao3s.length}</b>`;
}

function onRemoveAO3(p, scope, url){
  const loc = state[p.id] || (state[p.id]={});
  loc.ao3s = (loc.ao3s||[]).filter(u => u !== url); saveStore();

  const btn = scope.querySelector(`button[data-action="remove-ao3"][data-url="${CSS.escape(url)}"]`);
  btn?.parentElement?.remove();
  const pill = scope.querySelectorAll('.status .pill')[1];
  if (pill) pill.innerHTML = `📖 AO3: <b>Links ×${(loc.ao3s||[]).length}</b>`;
}

/* ---------- Filters & mascot shortcuts ---------- */
function bindFiltersAndShortcuts(){
  $('#searchBar')?.addEventListener('input', applyFilters);
  $('#shipFilter')?.addEventListener('change', applyFilters);
  $('#genreFilter')?.addEventListener('change', applyFilters);
  $('#characterFilter')?.addEventListener('change', applyFilters);
  $('#ratingFilter')?.addEventListener('change', applyFilters);
  $('#ao3PostedBtn')?.addEventListener('click', t=>{
    const on = t.currentTarget.getAttribute('aria-pressed') === 'true';
    t.currentTarget.setAttribute('aria-pressed', String(!on)); applyFilters();
  });

  $$('.mascot').forEach(img=>{
    img.addEventListener('click', ()=>{
      const who = img.getAttribute('data-char') || '';
      const sel = $('#characterFilter'); if (!sel) return;
      sel.value = who; applyFilters();
      grid.scrollIntoView({behavior:'smooth', block:'start'});
    });
  });
}

function applyFilters(){
  const q = ($('#searchBar')?.value || '').trim().toLowerCase();
  const ship = $('#shipFilter')?.value || '';
  const genre = $('#genreFilter')?.value || '';
  const character = $('#characterFilter')?.value || '';
  const rating = $('#ratingFilter')?.value || '';
  const ao3Only = $('#ao3PostedBtn')?.getAttribute('aria-pressed') === 'true';

  prompts.forEach(p=>{
    const el = $(`#prompt-${p.id}`); if (!el) return;
    const loc = state[p.id] || {};
    let ok = true;

    if(q){
      const hay = (p.title+' '+(p.prompt||'')+' '+(p.ship||'')+' '+(p.characters||'')).toLowerCase();
      ok = ok && hay.includes(q);
    }
    if(ship)      ok = ok && (p.ship||'').includes(ship);
    if(genre)     ok = ok && (p.genre||'') === genre;
    if(character) ok = ok && (p.characters||'').includes(character);
    if(rating)    ok = ok && (p.rating||'') === rating;
    if(ao3Only)   ok = ok && !!((loc.ao3s && loc.ao3s.length));

    el.style.display = ok ? '' : 'none';
  });
}

/* ---------- Deep-link modal routing ---------- */
function setupModalRouting(){
  handleHashRoute();
  window.addEventListener('hashchange', handleHashRoute);

  dlg?.addEventListener('click', (e)=>{
    if (e.target.matches('[data-close]')) {
      dlg.close();
      history.replaceState(null,'', location.pathname + location.search);
    }
  });
}

function handleHashRoute(){
  const id = (location.hash || '').replace('#prompt-','');
  if (!id) { dlg?.open && dlg.close(); return; }
  openPromptModalById(id);
}

function openPromptModalById(id){
  const p = prompts.find(x => String(x.id) === String(id));
  if (!p) return;
  dlgContent.innerHTML = '';
  dlgContent.appendChild(renderCardForModal(p));
  if (typeof dlg.showModal === 'function') dlg.showModal();
  else dlg.setAttribute('open','');
}

/* ---------- Boot ---------- */
(async function boot(){
  try{
    await loadFromSupabase();     // fetch rows
    renderAll();                  // render cards
    bindFiltersAndShortcuts();    // wire filters
    setupModalRouting();          // enable deep-link modal
    if (location.hash && location.hash.startsWith('#prompt-')) handleHashRoute();
  }catch(e){
    console.error('[WFFPB] Supabase load failed:', e);
    grid.innerHTML = `<p style="padding:1rem">Couldn’t load prompts from Supabase. Check RLS/view and keys in HTML.</p>`;
  }
})();
