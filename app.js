/* ===============================
   Wish Fic Fest Prompt Bank — JS
   - Multi gift & AO3 links (+ remove)
   - Edit Prompter only
   - Read more on cards
   - Pairing color outlines
   - Filters + Mascot shortcuts
   - Share: copy link AND navigate to #prompt-<id>
   - Deep-link modal: open full prompt from hash
   =============================== */

/* ---------- Helpers ---------- */
const STORE_KEY = 'wffpb:v6';
const $  = (s, r=document) => r.querySelector(s);
const $$ = (s, r=document) => Array.from(r.querySelectorAll(s));

function loadStore(){
  try{ return JSON.parse(localStorage.getItem(STORE_KEY)) || {}; }
  catch{ return {}; }
}
function saveStore(){
  localStorage.setItem(STORE_KEY, JSON.stringify(state));
}

/* robust copy (works https & file://) */
function copyToClipboard(text){
  if (navigator.clipboard && window.isSecureContext) {
    return navigator.clipboard.writeText(text);
  }
  return new Promise((resolve, reject)=>{
    try{
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly','');
      ta.style.position = 'absolute';
      ta.style.left = '-9999px';
      document.body.appendChild(ta);
      ta.select(); ta.setSelectionRange(0, ta.value.length);
      const ok = document.execCommand('copy');
      document.body.removeChild(ta);
      ok ? resolve() : reject(new Error('copy failed'));
    }catch(e){ reject(e); }
  });
}

function escapeHTML(s){
  return String(s ?? '').replace(/[&<>"']/g, m => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  }[m]));
}
const row = (L,R) => `<div class="meta-row"><b>${L}</b><span>${R}</span></div>`;
const shareURL = (id) => `${location.origin}${location.pathname}#prompt-${id}`;

function truncateLead(text, max=180){
  const t = String(text || '');
  if (t.length <= max) return t;
  return t.slice(0, max).replace(/\s+\S*$/, '') + '…';
}

/* outline color by ship (maps to your CSS pairing classes) */
function pairClass(shipRaw){
  const s = (shipRaw||'').toLowerCase();
  const set = new Set(
    s.replace(/[^\w/ ,]/g,'')
     .split(/[,\s/]+/)
     .filter(Boolean)
  );
  const who = ['riku','yushi','sion','jaehee'].filter(n => set.has(n));
  if (!who.length) return '';
  const key = who.sort().join('-'); // alphabetical

  switch(key){
    // 2
    case 'riku-jaehee': return 'pair-riku-jaehee';
    case 'riku-sion': return 'pair-riku-sion';
    case 'riku-yushi': return 'pair-riku-yushi';
    case 'jaehee-sion': return 'pair-sion-jaehee';
    case 'jaehee-yushi': return 'pair-yushi-jaehee';
    case 'sion-yushi': return 'pair-yushi-sion';
    // 3
    case 'jaehee-riku-sion': return 'pair-riku-jaehee-sion';
    case 'jaehee-riku-yushi': return 'pair-riku-yushi-jaehee';
    case 'jaehee-sion-yushi': return 'pair-yushi-jaehee-sion';
    case 'riku-sion-yushi':  return 'pair-riku-yushi-sion';
    // 4
    case 'jaehee-riku-sion-yushi': return 'pair-riku-yushi-jaehee-sion';
    default: return '';
  }
}

/* ---------- Demo data (fallback; replace with Supabase later) ---------- */
const FALLBACK_PROMPTS = [
  { id:'5',  title:'Prompt 5',
    prompt:"Pure fluff! I have no spicy thought about this one but if this leads to something spicy, I don’t really mind.",
    ship:'Sion,Riku, Riku,Yushi', genre:'-', characters:'Sion,Riku,Yushi', rating:'Mature', prompter:'anon'
  },
  { id:'4', title:'Prompt 4',
    prompt:"Sion pikir, ditaksir sama adik temennya sendiri itu nggak mungkin, karena ya...adik temennya adiknya juga kan? Tapi ditaksir Jaehee, beyond his imagination.",
    ship:'Sion,Jaehee', genre:'-', characters:'Sion, Jaehee', rating:'Mature', prompter:'anon'
  },
  { id:'19', title:'Prompt 19',
    prompt:"Inspired by any song from reputation album and make it one,both of them a famous person (either as athlete,artist,actor etc)",
    ship:'Sion,Riku, Sion,Jaehee, Riku,Yushi', genre:'-', characters:'Sion, Riku, Jaehee, Yushi', rating:'Mature', prompter:'anon'
  },
  { id:'3', title:'Prompt 3',
    prompt:'"BFF Kulyut dan BFF Daengsyon masing-masing ngasih main dare or dare..."',
    ship:'Sion/Jaehee, Riku/Yushi', genre:'Truth or dare', characters:'Sion, Jaehee, Riku, Yushi', rating:'Mature', prompter:'anon'
  },
  { id:'2', title:'Prompt 2',
    prompt:'Setiap sore, perjalanan pulang di bus selalu sama—aku duduk di kursi dekat jendela, dia di sebelahku. Tak pernah ada kata yang keluar di antara kami, hanya kehadiran yang anehnya nyaman. Hingga suatu sore, suara isak pelan memecah kebisuan. Saat matanya yang merah bertemu denganku, aku tahu—perjalanan pulang kami tak akan pernah sama lagi.',
    ship:'Yushi/Sion', genre:'Angst', characters:'Yushi, Sion', rating:'Explicit', prompter:'anon',
    ao3s:['https://archiveofourown.org/collections/WishfulThoughtsFest2025/works/71557431']
  },
];

/* ---------- State ---------- */
const state = loadStore();
/*
 state per id (example):
 {
   gifts:    ["naya","sha"],
   ao3s:     ["https://..."],
   prompter: "anon"
 }
*/

/* ---------- Data source (fallback to local) ---------- */
let prompts = FALLBACK_PROMPTS;

/* ---------- Render ---------- */
const grid = $('#promptGrid');
const dlg  = $('#promptModal');
const dlgContent = $('#modalContent');

renderAll();
bindFiltersAndShortcuts();
setupModalRouting();  // open modal if hash present

function renderAll(){
  grid.innerHTML = '';
  prompts.forEach(p => grid.appendChild(renderCard(p)));
  applyFilters();
}

function renderCard(p){
  const local = state[p.id] || {};
  const gifts = local.gifts ?? [];
  const ao3s  = local.ao3s  ?? (p.ao3s || []);
  const prompter = local.prompter ?? p.prompter ?? 'anon';
  const descText = p.description ?? '-';

  const card = document.createElement('article');
  card.className = `card ${pairClass(p.ship||'')}`;
  card.id = `prompt-${p.id}`;
  card.dataset.id = p.id;

  // Title + Read more logic
  const lead = truncateLead(p.prompt || '');
  const hasMore = (p.prompt || '').length > lead.length;

  card.innerHTML = `
    <h3>${escapeHTML(p.title || `Prompt ${p.id}`)}</h3>
    ${p.prompt ? `
      <p class="lead" data-full="${escapeHTML(p.prompt)}" data-short="${escapeHTML(lead)}">
        ${escapeHTML(lead)}
      </p>
      ${hasMore ? `<button class="link-btn" data-action="toggle-full">Read more</button>`:''}
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

  /* events */
  card.addEventListener('click', async (e)=>{
    // Share: copy + navigate to hash (so deep-link preview works for anyone)
    const aShare = e.target.closest('a.share-a');
    if (aShare){
      e.preventDefault();
      try { await copyToClipboard(aShare.href); } catch {}
      location.href = aShare.href;  // triggers hashchange -> modal opens
      return;
    }

    const btn = e.target.closest('button[data-action]');
    if(!btn) return;
    const act = btn.dataset.action;

    if (act === 'toggle-full')  return onToggleFull(card, btn);
    if (act === 'edit-prompter')return onEditPrompter(p, card);
    if (act === 'gift')         return onGift(p, card);
    if (act === 'add-ao3')      return onAddAO3(p, card);
    if (act === 'remove-gift')  return onRemoveGift(p, card, btn.dataset.name);
    if (act === 'remove-ao3')   return onRemoveAO3(p, card, btn.dataset.url);
  });

  return card;
}

/* modal version: always full text (no Read more button) */
function renderCardForModal(p){
  const local = state[p.id] || {};
  const gifts = local.gifts ?? [];
  const ao3s  = local.ao3s  ?? (p.ao3s || []);
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

  /* delegate same actions inside modal */
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

    if (act === 'edit-prompter')return onEditPrompter(p, wrap);
    if (act === 'gift')         return onGift(p, wrap);
    if (act === 'add-ao3')      return onAddAO3(p, wrap);
    if (act === 'remove-gift')  return onRemoveGift(p, wrap, btn.dataset.name);
    if (act === 'remove-ao3')   return onRemoveAO3(p, wrap, btn.dataset.url);
  });

  return wrap;
}

/* ---------- Render helpers (chips) ---------- */
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

/* ---------- Card actions ---------- */
function onToggleFull(card, btn){
  const p = $('.lead', card);
  const expanded = btn.getAttribute('data-expanded') === '1';
  if (expanded){
    p.textContent = p.dataset.short;
    btn.textContent = 'Read more';
    btn.setAttribute('data-expanded','0');
  } else {
    p.textContent = p.dataset.full;
    btn.textContent = 'Read less';
    btn.setAttribute('data-expanded','1');
  }
}

function onEditPrompter(p, scope){
  const loc = state[p.id] || (state[p.id]={});
  const current = loc.prompter ?? p.prompter ?? 'anon';
  const val = prompt('Prompter name:', current);
  if (val === null) return;
  const trimmed = val.trim() || 'anon';
  loc.prompter = trimmed;
  saveStore();
  $('.prompter-text', scope).textContent = trimmed;
}

function onGift(p, scope){
  const loc = state[p.id] || (state[p.id]={});
  const who = prompt('Gift to (Twitter @ / Email):');
  if(!who) return;
  loc.gifts = loc.gifts || [];
  loc.gifts.push(who.trim());
  saveStore();

  const chipWrap = scope.querySelectorAll('.chip-row')[0];
  const html = renderGiftChips(loc.gifts);
  chipWrap ? (chipWrap.outerHTML = html) : scope.insertAdjacentHTML('beforeend', html);

  // update count pill
  const pill = scope.querySelectorAll('.status .pill')[0];
  if (pill) pill.innerHTML = `🎁 Status: <b>Gifted ×${loc.gifts.length}</b>`;
}

function onRemoveGift(p, scope, name){
  const loc = state[p.id] || (state[p.id]={});
  loc.gifts = (loc.gifts||[]).filter(n => n !== name);
  saveStore();

  const chipBtn = scope.querySelector(`button[data-action="remove-gift"][data-name="${CSS.escape(name)}"]`);
  chipBtn?.parentElement?.remove();
  const pill = scope.querySelectorAll('.status .pill')[0];
  if (pill) pill.innerHTML = `🎁 Status: <b>Gifted ×${(loc.gifts||[]).length}</b>`;
}

function onAddAO3(p, scope){
  const loc = state[p.id] || (state[p.id]={});
  const url = prompt('Paste AO3 link:');
  if(!url) return;
  loc.ao3s = loc.ao3s || [];
  loc.ao3s.push(url.trim());
  saveStore();

  // find (or insert) the AO3 chip row
  const rows = scope.querySelectorAll('.chip-row');
  let ao3Row = null;
  if (!rows.length) ao3Row = null;
  else if (rows.length === 1) ao3Row = rows[0].textContent.includes('🎁') ? null : rows[0];
  else ao3Row = rows[1];

  const html = renderAO3Chips(loc.ao3s);
  ao3Row ? (ao3Row.outerHTML = html) : scope.insertAdjacentHTML('beforeend', html);

  const pill = scope.querySelectorAll('.status .pill')[1];
  if (pill) pill.innerHTML = `📖 AO3: <b>Links ×${loc.ao3s.length}</b>`;
}

function onRemoveAO3(p, scope, url){
  const loc = state[p.id] || (state[p.id]={});
  loc.ao3s = (loc.ao3s||[]).filter(u => u !== url);
  saveStore();

  const chipBtn = scope.querySelector(`button[data-action="remove-ao3"][data-url="${CSS.escape(url)}"]`);
  chipBtn?.parentElement?.remove();
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
    t.currentTarget.setAttribute('aria-pressed', String(!on));
    applyFilters();
  });

  // Mascot click -> set character filter (All clears it)
  $$('.mascot').forEach(img=>{
    img.addEventListener('click', ()=>{
      const who = img.getAttribute('data-char') || '';
      const sel = $('#characterFilter');
      if (!sel) return;
      sel.value = who;
      applyFilters();
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
    const el = $(`#prompt-${p.id}`);
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
    if(ao3Only)   ok = ok && !!((loc.ao3s && loc.ao3s.length) || (p.ao3s && p.ao3s.length));

    el.style.display = ok ? '' : 'none';
  });
}

/* ---------- Deep-link modal routing ---------- */
function setupModalRouting(){
  // open if current hash has a prompt id
  handleHashRoute();

  // open/close on hash change
  window.addEventListener('hashchange', handleHashRoute);

  // close button inside dialog
  dlg?.addEventListener('click', (e)=>{
    if (e.target.matches('[data-close]')) {
      dlg.close();
      // clear hash but keep page position
      history.replaceState(null, '', location.pathname + location.search);
    }
  });
}

function handleHashRoute(){
  const id = (location.hash || '').replace('#prompt-','');
  if (!id) { dlg?.open && dlg.close(); return; }

  // Ensure grid is rendered; then open the modal
  const p = prompts.find(x => String(x.id) === String(id));
  if (!p) return;

  openPromptModalById(id);
}

function openPromptModalById(id){
  const p = prompts.find(x => String(x.id) === String(id));
  if (!p) return;

  dlgContent.innerHTML = '';
  dlgContent.appendChild(renderCardForModal(p));
  if (typeof dlg.showModal === 'function') dlg.showModal();
  else dlg.setAttribute('open',''); // fallback if <dialog> not supported
}
