/** ===== Supabase ===== */
const sb = window.supabaseClient;

/** ===== STATE ===== */
let prompts = [];
let lovedSet = new Set();
let surpriseToggle = 0;
let wired = { filters: false, mascots: false, auth: false, admin: false };

/** ===== Helpers ===== */
const $  = (s) => document.querySelector(s);
const $$ = (s) => Array.from(document.querySelectorAll(s));
const S  = (v) => (v ?? "").toString();
const nonEmpty = (v) => !!S(v).trim();
const has = (hay, needle) => S(hay).toLowerCase().includes(S(needle).toLowerCase());
const shipClass = (ship) => "ship-" + S(ship).toLowerCase().replace(/\s+/g,"").replace(/\//g,"-");

/** Identity (anon key + local username for guests) */
const ANON_KEY   = "pb_anon_key";
const LOCAL_NAME = "pb_username";
function getAnonKey(){
  let k = localStorage.getItem(ANON_KEY);
  if (!k) {
    k = (crypto?.randomUUID?.() || (Date.now().toString(36) + Math.random().toString(36).slice(2)));
    localStorage.setItem(ANON_KEY, k);
  }
  return k;
}

/** ===== Load prompts + my loves ===== */
async function loadPrompts() {
  try {
    let { data, error } = await sb
      .from("prompts_public")
      .select("id,title,body,description,prompt,ship,genre,characters,rating,submitted_by,ao3_link,loves,claimed,gifted_to,created_at")
      .order("created_at", { ascending: false });

    if (error || !data?.length) {
      const fb = await sb.from("prompts").select("*").order("created_at", { ascending: false });
      if (fb.error) throw fb.error;
      data = (fb.data || []).map((r) => ({
        id: r.id,
        title: r.title,
        body: r.body || r.description || r.prompt || "",
        description: r.description,
        prompt: r.prompt,
        ship: r.ship, genre: r.genre, characters: r.characters, rating: r.rating,
        submitted_by: r.submitted_by, ao3_link: r.ao3_link, loves: r.loves,
        claimed: r.claimed, gifted_to: r.gifted_to, created_at: r.created_at,
      }));
    } else {
      data = data.map((r) => ({ ...r, body: r.body || r.description || r.prompt || "" }));
    }
    prompts = data || [];
  } catch (err) {
    console.warn("read error:", err.message);
    prompts = [];
  }

  // preload my loves
  try {
    const { data: ids, error } = await sb.rpc("list_my_loves", { p_anon_key: getAnonKey() });
    if (!error && Array.isArray(ids)) lovedSet = new Set(ids.map(String));
  } catch (e) {
    console.warn("list_my_loves:", e.message);
    lovedSet = new Set();
  }

  renderPrompts(prompts);

  if (!wired.filters) { wireFilters(); wired.filters = true; }
  if (!wired.mascots) { wireMascots(); wired.mascots = true; }
  if (!wired.auth)    { wireAuth();    wired.auth = true; }
  if (!wired.admin)   { wireAdmin();   wired.admin = true; }
}

/** ===== Render ===== */
function renderPrompts(list) {
  const grid = $("#promptGrid");
  grid.innerHTML = "";

  if (!list?.length) {
    grid.innerHTML = `<p style="text-align:center;color:#666">No prompts found ✨</p>`;
    return;
  }

  list.forEach((p) => {
    const loves = Number(p.loves || 0);
    const ship  = p.ship || "";
    const full  = S(p.body || p.description || p.prompt);
    const isLong = full.length > 260;
    const short = isLong ? full.slice(0, 240) + "..." : full;
    const mineLoved = lovedSet.has(String(p.id));

    const card = document.createElement("article");
    card.className = `prompt-card ${shipClass(ship)}`;
    card.dataset.ship = ship;

    const ao3Btn = nonEmpty(p.ao3_link)
      ? `<a class="ao3-btn" href="${p.ao3_link}" target="_blank" rel="noopener">📖 Read on AO3</a>`
      : "";

    card.innerHTML = `
      <h3>${S(p.title) || "Prompt"}</h3>

      <div class="prompt-excerpt">
        <span class="excerpt-text">${short}</span>
        ${isLong ? `<span class="link-muted show-more">Show more</span>` : ""}
      </div>

      <div class="meta">
        <div class="head">Prompt</div>
        <div class="row"><strong>Ship:</strong> ${S(p.ship) || "-"}</div>
        <div class="row"><strong>Genre:</strong> ${S(p.genre) || "-"}</div>
        <div class="row"><strong>Characters:</strong> ${S(p.characters) || "-"}</div>
        <div class="row"><strong>Rating:</strong> ${S(p.rating) || "-"}</div>
        <div class="row"><strong>Prompter:</strong> ${S(p.submitted_by) || "anon"}</div>
      </div>

      <div class="card-actions">
        ${ao3Btn}
        <button class="heart-btn ${mineLoved ? "active" : ""}" data-id="${p.id}" title="${mineLoved ? "Loved" : "Love"}">❤️</button>
        <span class="count" data-count="${p.id}">${loves}</span>
        <button class="gift-toggle" data-id="${p.id}">🎁 Gift</button>
      </div>

      <div class="gift-inline" id="gift-${p.id}">
        <input type="text" placeholder="Enter username or email" />
        <button class="btn send-gift" data-id="${p.id}">Send Gift</button>
        <button class="btn cancel-gift" data-id="${p.id}">Cancel</button>
      </div>
    `;

    grid.appendChild(card);

    const more = card.querySelector(".show-more");
    if (more) {
      more.addEventListener("click", () => {
        const ex = card.querySelector(".excerpt-text");
        const open = more.dataset.open === "1";
        ex.textContent   = open ? short : full;
        more.textContent = open ? "Show more" : "Show less";
        more.dataset.open = open ? "0" : "1";
      });
    }
  });

  wireLoveButtons();
  wireGiftInline();
}

/** ===== ❤️ Love TOGGLE (add/unlove) — correct arg shapes ===== */
function wireLoveButtons() {
  $$(".heart-btn").forEach((btn) => {
    btn.onclick = async (e) => {
      const id = e.currentTarget.dataset.id;
      const countEl = document.querySelector(`[data-count="${id}"]`);
      const wasLoved = lovedSet.has(String(id));
      const before = Number(countEl?.textContent || 0);

      // Optimistic UI + lock
      const delta = wasLoved ? -1 : +1;
      const optimistic = Math.max(0, before + delta);
      btn.disabled = true;
      btn.classList.toggle("active", !wasLoved);
      btn.setAttribute("aria-pressed", !wasLoved ? "true" : "false");
      btn.title = !wasLoved ? "Loved" : "Love";
      if (countEl) countEl.textContent = String(optimistic);

      try {
        // Ask guest display name once on "add"
        if (!wasLoved) {
          const { data } = await sb.auth.getUser();
          const loggedIn = !!data?.user;
          if (!loggedIn && !localStorage.getItem(LOCAL_NAME)) {
            const picked = prompt("Add a display name for kudos? (optional)");
            const nm = (picked || "").trim().slice(0, 40);
            if (nm) localStorage.setItem(LOCAL_NAME, nm);
          }
        }

        // Build args depending on add/remove
        const userNameFromSession =
          (await sb.auth.getUser().then(r => r?.data?.user?.user_metadata?.full_name || "").catch(()=> "")) || "";
        const username = userNameFromSession || localStorage.getItem(LOCAL_NAME) || null;

        const rpc  = wasLoved ? "remove_love" : "add_love";
        const args = wasLoved
          ? { p_prompt_id: id, p_anon_key: getAnonKey() } // REMOVE: 2 args (uuid, text)
          : { p_prompt_id: id, p_anon_key: getAnonKey(), p_username: username }; // ADD: 3 args

        const { data: serverVal, error } = await sb.rpc(rpc, args);
        if (error) throw error;

        // Use server total if valid
        const serverTotal =
          (typeof serverVal === "number" && Number.isFinite(serverVal)) ? serverVal : optimistic;

        if (countEl) countEl.textContent = String(Math.max(0, serverTotal));

        // Sync local state
        if (wasLoved) lovedSet.delete(String(id)); else lovedSet.add(String(id));
        const i = prompts.findIndex((p) => String(p.id) === String(id));
        if (i !== -1) prompts[i].loves = serverTotal;
      } catch (err) {
        // Revert on error
        btn.classList.toggle("active", wasLoved);
        btn.setAttribute("aria-pressed", wasLoved ? "true" : "false");
        btn.title = wasLoved ? "Loved" : "Love";
        if (countEl) countEl.textContent = String(before);
        alert(`Failed to love: ${err.message || err}`);
      } finally {
        btn.disabled = false;
      }
    };
  });
}

/** ===== Gift inline ===== */
function wireGiftInline() {
  $$(".gift-toggle").forEach((btn) => {
    btn.onclick = () => {
      const id = btn.dataset.id;
      const box = $(`#gift-${id}`);
      const open = box.style.display === "flex";
      box.style.display = open ? "none" : "flex";
      btn.classList.toggle("active", !open);
    };
  });
  $$(".cancel-gift").forEach((btn) => {
    btn.onclick = () => {
      const id = btn.dataset.id;
      $(`#gift-${id}`).style.display = "none";
      document.querySelector(`.gift-toggle[data-id="${id}"]`)?.classList.remove("active");
    };
  });
  $$(".send-gift").forEach((btn) => {
    btn.onclick = async () => {
      const id = btn.dataset.id;
      const input = document.querySelector(`#gift-${id} input`);
      const to = S(input.value).trim();
      if (!to) return;
      const { error } = await sb.from("prompts").update({ gifted_to: to, claimed: true }).eq("id", id);
      if (error) { alert("Gift failed: " + error.message); return; }
      input.value = ""; $(`#gift-${id}`).style.display = "none";
      document.querySelector(`.gift-toggle[data-id="${id}"]`)?.classList.remove("active");
      alert("Gift saved ✅");
    };
  });
}

/** ===== Filters & Toggles ===== */
function wireFilters() {
  let t;
  $("#searchBar")?.addEventListener("input", () => {
    clearTimeout(t); t = setTimeout(() => applyFilters(), 120);
  });
  ["shipFilter","genreFilter","characterFilter","ratingFilter"].forEach((id) =>
    $(`#${id}`)?.addEventListener("change", applyFilters)
  );
  $("#ao3PostedBtn")?.addEventListener("click", function(){ this.classList.toggle("active"); applyFilters(); });
  $("#lovedFilterBtn")?.addEventListener("click", function(){ this.classList.toggle("active"); applyFilters(); });
  $("#randomPrompt")?.addEventListener("click", () => {
    surpriseToggle++;
    if (surpriseToggle % 2 === 1) {
      const pool = applyFilters(true);
      if (pool.length) renderPrompts([pool[Math.floor(Math.random()*pool.length)]]);
    } else { applyFilters(); }
  });
}
function wireMascots() {
  $$(".mascot").forEach((img) => {
    img.addEventListener("click", () => {
      $("#characterFilter").value = S(img.dataset.character);
      applyFilters();
    });
  });
}
function applyFilters(returnOnly=false) {
  const search = S($("#searchBar")?.value);
  const ship   = S($("#shipFilter")?.value);
  const genre  = S($("#genreFilter")?.value);
  const ch     = S($("#characterFilter")?.value);
  const rating = S($("#ratingFilter")?.value);
  const ao3Only   = $("#ao3PostedBtn")?.classList.contains("active");
  const lovedOnly = $("#lovedFilterBtn")?.classList.contains("active");

  let list = prompts.filter((p) => {
    const ok =
      (!ship   || has(p.ship, ship)) &&
      (!genre  || has(p.genre, genre)) &&
      (!ch     || has(p.characters, ch)) &&
      (!rating || S(p.rating) === rating) &&
      (!ao3Only   || nonEmpty(p.ao3_link)) &&
      (!lovedOnly || Number(p.loves || 0) > 0);
    if (!ok) return false;
    const hay = `${S(p.title)} ${S(p.body || p.description || p.prompt)}`;
    return !search ? true : has(hay, search);
  });

  if (returnOnly) return list;
  renderPrompts(list);
  return list;
}

/** ===== Auth (signup name required; signin username/email; forgot email only) ===== */
function wireAuth(){
  const authModal   = $("#authModal");
  const title       = $("#authTitle");
  const msg         = $("#authMsg");
  const form        = $("#authForm");
  const nameInput   = $("#authName");
  const idField     = $("#authEmailOrUser");
  const pass        = $("#authPassword");
  const forgotWrap  = $("#forgotWrap");
  const forgotEmail = $("#forgotEmail");

  const showForm = () => {
    form.style.display = "block";
    if (form.dataset.mode === "signup") nameInput.required = true;
    else nameInput.required = false;
    idField.required = true;
    pass.required = true;
  };
  const hideForm = () => {
    form.style.display = "none";
    nameInput.required = false;
    idField.required   = false;
    pass.required      = false;
  };

  $("#openSignUp")?.addEventListener("click", (e) => {
    e.preventDefault();
    title.textContent = "Sign up";
    form.dataset.mode = "signup";
    nameInput.style.display = "block";
    forgotWrap.style.display = "none";
    showForm();
    authModal.classList.add("show");
  });

  $("#openSignIn")?.addEventListener("click", (e) => {
    e.preventDefault();
    title.textContent = "Sign in";
    form.dataset.mode = "signin";
    nameInput.style.display = "none";
    forgotWrap.style.display = "none";
    showForm();
    authModal.classList.add("show");
  });

  // Forgot: hanya email + reset
  $("#openForgot")?.addEventListener("click", (e) => {
    e.preventDefault();
    title.textContent = "Forgot password";
    form.dataset.mode = "forgot";
    nameInput.style.display = "none";
    forgotWrap.style.display = "block";
    hideForm();
    authModal.classList.add("show");
  });

  $$("[data-close]").forEach((b) =>
    b.addEventListener("click", () => authModal.classList.remove("show"))
  );

  // submit signup/signin
  form?.addEventListener("submit", async (e) => {
    e.preventDefault();
    msg.textContent = "";
    const mode = form.dataset.mode;

    try {
      if (mode === "signup") {
        const displayName = (nameInput.value || "").trim();
        if (!displayName) { msg.textContent = "Display name is required."; return; }
        const email = (idField.value || "").trim();
        if (!email) { msg.textContent = "Email is required."; return; }

        const { error } = await sb.auth.signUp({
          email,
          password: pass.value,
          options: { data: { full_name: displayName, username: displayName } }
        });
        if (error) throw error;

        localStorage.setItem(LOCAL_NAME, displayName);
        msg.textContent = "Check your inbox to confirm.";
      }

      if (mode === "signin") {
        let identifier = (idField.value || "").trim();
        if (!identifier) { msg.textContent = "Enter email or username."; return; }

        // username -> email via RPC
        if (!identifier.includes("@")) {
          const { data, error } = await sb.rpc("email_for_username", { p_username: identifier });
          if (error) throw error;
          if (!data) throw new Error("Username not found.");
          identifier = data;
        }

        const { error: signErr } = await sb.auth.signInWithPassword({
          email: identifier,
          password: pass.value
        });
        if (signErr) throw signErr;

        msg.textContent = "Signed in ✔";
      }
    } catch (err) {
      msg.textContent = err.message || String(err);
    }
  });

  // forgot reset link
  $("#sendReset")?.addEventListener("click", async () => {
    msg.textContent = "";
    try {
      const email = (forgotEmail.value || "").trim();
      if (!email) throw new Error("Enter your email.");
      const { error } = await sb.auth.resetPasswordForEmail(email, {
        redirectTo: window.location.origin + "/reset-complete.html",
      });
      if (error) throw error;
      msg.textContent = "Reset link sent. Check your email.";
    } catch (err) {
      msg.textContent = err.message || String(err);
    }
  });
}

/** ===== Admin ===== */
function wireAdmin(){
  const modal = $("#adminModal");
  $("#openAdmin")?.addEventListener("click", (e) => { e.preventDefault(); modal.classList.add("show"); });
  $$("[data-close]").forEach((b) => b.addEventListener("click", () => modal.classList.remove("show")));
  $("#goAdmin")?.addEventListener("click", () => {
    const u = S($("#adminUser")?.value).trim();
    const p = S($("#adminPass")?.value).trim();
    if (u === "Mods" && p === "dyu2ba4di3") window.location.href = "admin.html";
    else alert("Wrong admin credentials");
  });
}

/** ===== Boot ===== */
loadPrompts();
