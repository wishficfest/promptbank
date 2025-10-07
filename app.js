/* ===============================
   Wish Fic Fest Prompt Bank — JS
   Patch: restore Read more + remove Description editing
   Keep: share-link auto-copy, gifts/ao3 multi, prompter edit, filters, pairing colors
   =============================== */

/* ---------- Helpers ---------- */
const STORE_KEY = 'wffpb:v5';
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

/* outline color by ship (maps to CSS classes you already have) */
function pairClass(shipRaw){
  const s = (shipRaw||'').toLowerCase();
  const set = new Set(
    s.replace(/[^\w/ ,]/g,'')
     .split(/[,\s/]+/)
     .filter(Boolean)
  );
  const has = n => set.has(n);
  const who = ['riku','yushi','sion','jaehee'].filter(has);
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

/* ---------- Demo data (fallback bila belum ambil dari DB) ---------- */
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
 state shape per id:
 {
   gifts: [ "name", ... ],
   ao3s:  [ "url", ... ],
   prompter: "name",
   // description (jika sudah tersimpan sebelumnya) dipakai, tp tdk bisa diedit lagi
 }
*/

/* ---------- Data source (fallback to local) ---------- */
let prompts = FALLBACK_PROMPTS;

/* ---------- Render ---------- */
const grid = $('#promptGrid');
renderAll();
bindFiltersAndShortcuts();

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
  const descText = local.description ?? p.description ?? '-';

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
    // Share: auto copy
    const aShare = e.target.closest('a.share-a');
    if (aShare){
      e.preventDefault();
      try { await copyToClipboard(aShare.href); } catch {}
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

/* ---------- Actions ---------- */
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

function onEditPrompter(p, card){
  const loc = state[p.id] || (state[p.id]={});
  const current = loc.prompter ?? p.prompter ?? 'anon';
  const val = prompt('Prompter name:', current);
  if (val === null) return;
  const trimmed = val.trim() || 'anon';
  loc.prompter = trimmed;
  saveStore();
  $('.prompter-text', card).textContent = trimmed;
}

function onGift(p, card){
  const loc = state[p.id] || (state[p.id]={});
  const who = prompt('Gift to (Twitter @ / Email):');
  if(!who) return;
  loc.gifts = loc.gifts || [];
  loc.gifts.push(who.trim());
  saveStore();

  // re-render chips + count
  const giftRow = card.querySelector('.chip-row');
  if (giftRow) giftRow.outerHTML = renderGiftChips(loc.gifts);
  else card.insertAdjacentHTML('beforeend', renderGiftChips(loc.gifts));
  $('.status .pill', card).innerHTML = `🎁 Status: <b>Gifted ×${loc.gifts.length}</b>`;
}

function onRemoveGift(p, card, name){
  const loc = state[p.id] || (state[p.id]={});
  loc.gifts = (loc.gifts||[]).filter(n => n !== name);
  saveStore();
  const chipBtn = card.querySelector(`button[data-action="remove-gift"][data-name="${CSS.escape(name)}"]`);
  chipBtn?.parentElement?.remove();
  $('.status .pill', card).innerHTML = `🎁 Status: <b>Gifted ×${(loc.gifts||[]).length}</b>`;
}

function onAddAO3(p, card){
  const loc = state[p.id] || (state[p.id]={});
  const url = prompt('Paste AO3 link:');
  if(!url) return;
  loc.ao3s = loc.ao3s || [];
  loc.ao3s.push(url.trim());
  saveStore();

  const rows = card.querySelectorAll('.chip-row');
  const ao3RowExisting = rows.length === 2 ? rows[1] : (rows.length === 1 && rows[0].textContent.includes('🎁') ? null : rows[0]);
  if (ao3RowExisting) ao3RowExisting.outerHTML = renderAO3Chips(loc.ao3s);
  else card.insertAdjacentHTML('beforeend', renderAO3Chips(loc.ao3s));

  card.querySelectorAll('.status .pill')[1].innerHTML = `📖 AO3: <b>Links ×${loc.ao3s.length}</b>`;
}

function onRemoveAO3(p, card, url){
  const loc = state[p.id] || (state[p.id]={});
  loc.ao3s = (loc.ao3s||[]).filter(u => u !== url);
  saveStore();

  const chipBtn = card.querySelector(`button[data-action="remove-ao3"][data-url="${CSS.escape(url)}"]`);
  chipBtn?.parentElement?.remove();
  card.querySelectorAll('.status .pill')[1].innerHTML = `📖 AO3: <b>Links ×${(loc.ao3s||[]).length}</b>`;
}

/* ---------- Filters (unchanged) ---------- */
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

  // mascot shortcuts -> filter by character
  $$('.mascot').forEach(img=>{
    img.addEventListener('click', ()=>{
      const who = img.alt?.trim();
      if(!who) return;
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
