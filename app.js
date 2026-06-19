const config = window.SPRINGCRUSH_CONFIG || {};
const hasSupabase = Boolean(config.supabaseUrl && config.supabaseAnonKey && window.supabase);
const client = hasSupabase ? window.supabase.createClient(config.supabaseUrl, config.supabaseAnonKey) : null;

const demoImages = [
  "https://images.unsplash.com/photo-1547891654-e66ed7ebb968?auto=format&fit=crop&w=900&q=80",
  "https://images.unsplash.com/photo-1459908676235-d5f02a50184b?auto=format&fit=crop&w=900&q=80",
  "https://images.unsplash.com/photo-1513364776144-60967b0f800f?auto=format&fit=crop&w=900&q=80"
];

const demoArtworks = [
  {
    id: "demo-1",
    title: "First Bloom",
    artist_name: "Mina",
    description: "Sketchbook colors and a late afternoon club table.",
    image_url: demoImages[0],
    status: "approved"
  },
  {
    id: "demo-2",
    title: "Poster Study",
    artist_name: "Noor",
    description: "A bright layout experiment for the next meeting.",
    image_url: demoImages[1],
    status: "approved"
  },
  {
    id: "demo-3",
    title: "Paint Hands",
    artist_name: "Sam",
    description: "Process photo from a very messy studio day.",
    image_url: demoImages[2],
    status: "approved"
  }
];

const state = {
  authMode: "signin",
  session: null,
  profile: null,
  gallery: [],
  mySubmissions: [],
  pending: [],
  members: [],
  meeting: null,
  announcement: null
};

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

function toast(message) {
  const el = $("[data-toast]");
  el.textContent = message;
  el.classList.add("show");
  window.setTimeout(() => el.classList.remove("show"), 3200);
}

function escapeHtml(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function formatDate(value) {
  if (!value) return "--";
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", year: "numeric" }).format(new Date(`${value}T00:00:00`));
}

function setLiveStatus() {
  const label = $("[data-live-status]");
  label.textContent = hasSupabase ? "Live with Supabase" : "Demo mode";
}

function renderMeeting() {
  const meeting = state.meeting || {
    theme: "Open studio + first submissions",
    meeting_date: "2026-06-26",
    meeting_time: "16:30",
    room: "Art room",
    notes: "Admins can change this once Supabase is connected."
  };
  $("[data-meeting-theme]").textContent = meeting.theme;
  $("[data-meeting-date]").textContent = formatDate(meeting.meeting_date);
  $("[data-meeting-time]").textContent = meeting.meeting_time || "--";
  $("[data-meeting-room]").textContent = meeting.room || "--";
  $("[data-meeting-notes]").textContent = meeting.notes || "";

  const form = $("[data-meeting-form]");
  if (form && state.profile?.role === "admin") {
    form.theme.value = meeting.theme || "";
    form.meeting_date.value = meeting.meeting_date || "";
    form.meeting_time.value = meeting.meeting_time || "";
    form.room.value = meeting.room || "";
    form.notes.value = meeting.notes || "";
  }
}

function renderAnnouncement() {
  const announcement = state.announcement || {
    title: "Welcome to the wall",
    body: "Approved submissions appear here for everyone. Members can edit their own work, and edits go back to review."
  };
  $("[data-announcement-title]").textContent = announcement.title;
  $("[data-announcement-body]").textContent = announcement.body;

  const form = $("[data-announcement-form]");
  if (form && state.profile?.role === "admin") {
    form.title.value = announcement.title || "";
    form.body.value = announcement.body || "";
  }
}

function renderGallery() {
  const gallery = state.gallery.length ? state.gallery : demoArtworks;
  $("[data-gallery]").innerHTML = gallery
    .map(
      (art) => `
        <article class="art-card">
          <img src="${escapeHtml(art.image_url || demoImages[0])}" alt="${escapeHtml(art.title)} by ${escapeHtml(art.artist_name)}" loading="lazy">
          <div class="art-card-body">
            <h3>${escapeHtml(art.title)}</h3>
            <p>by ${escapeHtml(art.artist_name)}</p>
            <p>${escapeHtml(art.description || "")}</p>
            <span class="tag">approved</span>
          </div>
        </article>
      `
    )
    .join("");
}

function submissionMarkup(art, options = {}) {
  const controls = [];
  if (options.edit) {
    controls.push(`<button class="small-button light" type="button" data-edit-art="${art.id}">Edit</button>`);
  }
  if (options.moderate) {
    controls.push(`<button class="small-button" type="button" data-approve-art="${art.id}">Approve</button>`);
    controls.push(`<button class="small-button danger" type="button" data-reject-art="${art.id}">Reject</button>`);
  }
  return `
    <article class="submission-item">
      <img src="${escapeHtml(art.image_url || demoImages[0])}" alt="${escapeHtml(art.title)}">
      <div>
        <h4>${escapeHtml(art.title)}</h4>
        <p>${escapeHtml(art.artist_name)} · ${escapeHtml(art.status)}</p>
        <p>${escapeHtml(art.description || "")}</p>
      </div>
      ${controls.length ? `<div class="submission-controls">${controls.join("")}</div>` : ""}
    </article>
  `;
}

function renderSubmissions() {
  const mine = $("[data-my-submissions]");
  if (!state.session) {
    mine.innerHTML = `<div class="empty">Log in to submit and manage your artwork.</div>`;
  } else if (!state.mySubmissions.length) {
    mine.innerHTML = `<div class="empty">No submissions yet.</div>`;
  } else {
    mine.innerHTML = state.mySubmissions.map((art) => submissionMarkup(art, { edit: true })).join("");
  }

  const pending = $("[data-pending-list]");
  if (!pending) return;
  if (state.profile?.role !== "admin") {
    pending.innerHTML = `<div class="empty">Admin access only.</div>`;
  } else if (!state.pending.length) {
    pending.innerHTML = `<div class="empty">Nothing waiting for review.</div>`;
  } else {
    pending.innerHTML = state.pending.map((art) => submissionMarkup(art, { moderate: true })).join("");
  }
}

function renderMembers() {
  const list = $("[data-member-list]");
  if (!list) return;
  if (state.profile?.role !== "admin") {
    list.innerHTML = `<div class="empty">Admin access only.</div>`;
    return;
  }
  if (!state.members.length) {
    list.innerHTML = `<div class="empty">Members will appear here after they sign up.</div>`;
    return;
  }
  list.innerHTML = state.members
    .map((member) => `
      <article class="submission-item member-item">
        <div class="member-avatar" aria-hidden="true">${escapeHtml((member.display_name || member.email || "?").slice(0, 1).toUpperCase())}</div>
        <div>
          <h4>${escapeHtml(member.display_name || "Unnamed member")}</h4>
          <p>${escapeHtml(member.email || "No email")} · ${escapeHtml(member.role)}</p>
        </div>
      </article>
    `)
    .join("");
}

function renderAuth() {
  $$("[data-auth-mode]").forEach((button) => button.classList.toggle("active", button.dataset.authMode === state.authMode));
  $("[data-name-field]").hidden = state.authMode !== "signup";
  $("[data-auth-button]").textContent = state.authMode === "signup" ? "Create account" : "Log in";

  const authed = Boolean(state.session);
  $("[data-auth-form]").hidden = authed;
  $("[data-session-box]").hidden = !authed;
  $("[data-user-email]").textContent = state.session?.user?.email || "";
  $("[data-admin-section]").hidden = state.profile?.role !== "admin";
  $("[data-admin-link]").hidden = state.profile?.role !== "admin";
}

function renderAll() {
  setLiveStatus();
  renderAuth();
  renderMeeting();
  renderAnnouncement();
  renderGallery();
  renderSubmissions();
  renderMembers();
}

async function loadProfile() {
  if (!client || !state.session) {
    state.profile = null;
    return;
  }
  const { data, error } = await client.from("profiles").select("*").eq("id", state.session.user.id).single();
  if (error) {
    console.warn(error);
    state.profile = null;
    return;
  }
  state.profile = data;
}

async function loadPublicData() {
  if (!client) {
    renderAll();
    return;
  }

  const [art, meeting, announcement] = await Promise.all([
    client.from("artworks").select("*").eq("status", "approved").order("created_at", { ascending: false }),
    client.from("meetings").select("*").order("updated_at", { ascending: false }).limit(1).maybeSingle(),
    client.from("announcements").select("*").order("created_at", { ascending: false }).limit(1).maybeSingle()
  ]);

  if (art.error) toast(art.error.message);
  state.gallery = art.data || [];
  state.meeting = meeting.data || null;
  state.announcement = announcement.data || null;
  renderAll();
}

async function loadPrivateData() {
  if (!client || !state.session) {
    state.mySubmissions = [];
    state.pending = [];
    state.members = [];
    renderAll();
    return;
  }
  const mine = await client.from("artworks").select("*").eq("user_id", state.session.user.id).order("updated_at", { ascending: false });
  state.mySubmissions = mine.data || [];

  if (state.profile?.role === "admin") {
    const pending = await client.from("artworks").select("*").eq("status", "pending").order("updated_at", { ascending: false });
    state.pending = pending.data || [];
    const members = await client.from("profiles").select("id,email,display_name,role,created_at").order("created_at", { ascending: false });
    state.members = members.data || [];
  } else {
    state.pending = [];
    state.members = [];
  }
  renderAll();
}

async function uploadArtworkImage(file) {
  if (!file) return null;
  const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
  const path = `${state.session.user.id}/${crypto.randomUUID()}.${ext}`;
  const { error } = await client.storage.from("artwork").upload(path, file, { upsert: false });
  if (error) throw error;
  const { data } = client.storage.from("artwork").getPublicUrl(path);
  return data.publicUrl;
}

async function handleAuth(event) {
  event.preventDefault();
  if (!client) {
    toast("Add your Supabase URL and anon key in config.js first.");
    return;
  }
  const form = event.currentTarget;
  const email = form.email.value.trim();
  const password = form.password.value;

  if (state.authMode === "signup") {
    const displayName = form.display_name.value.trim();
    const { error } = await client.auth.signUp({
      email,
      password,
      options: { data: { display_name: displayName || email.split("@")[0] } }
    });
    if (error) return toast(error.message);
    toast("Account created. Check your email if confirmations are enabled.");
  } else {
    const { error } = await client.auth.signInWithPassword({ email, password });
    if (error) return toast(error.message);
    toast("You are logged in.");
  }
}

async function handleArtworkSubmit(event) {
  event.preventDefault();
  if (!client) return toast("Connect Supabase before accepting real submissions.");
  if (!state.session) return toast("Please log in before submitting artwork.");

  const form = event.currentTarget;
  const id = form.artwork_id.value;
  const file = form.image.files[0];
  let imageUrl = null;

  try {
    if (!id && !file) return toast("Choose an image for your artwork.");
    if (file) imageUrl = await uploadArtworkImage(file);

    const payload = {
      title: form.title.value.trim(),
      artist_name: form.artist_name.value.trim(),
      description: form.description.value.trim(),
      status: "pending",
      updated_at: new Date().toISOString()
    };
    if (imageUrl) payload.image_url = imageUrl;

    const result = id
      ? await client.from("artworks").update(payload).eq("id", id).eq("user_id", state.session.user.id)
      : await client.from("artworks").insert({ ...payload, user_id: state.session.user.id });

    if (result.error) throw result.error;
    form.reset();
    form.artwork_id.value = "";
    $("[data-cancel-edit]").hidden = true;
    toast(id ? "Updated and sent back to review." : "Submitted for review.");
    await Promise.all([loadPublicData(), loadPrivateData()]);
  } catch (error) {
    toast(error.message);
  }
}

async function moderateArtwork(id, status) {
  const now = new Date().toISOString();
  const { error } = await client.from("artworks").update({
    status,
    reviewed_by: state.session.user.id,
    reviewed_at: now,
    updated_at: now
  }).eq("id", id);
  if (error) return toast(error.message);
  toast(status === "approved" ? "Artwork approved." : "Artwork rejected.");
  await Promise.all([loadPublicData(), loadPrivateData()]);
}

function editArtwork(id) {
  const art = state.mySubmissions.find((item) => item.id === id);
  if (!art) return;
  const form = $("[data-art-form]");
  form.artwork_id.value = art.id;
  form.title.value = art.title;
  form.artist_name.value = art.artist_name;
  form.description.value = art.description || "";
  $("[data-cancel-edit]").hidden = false;
  location.hash = "#members";
}

async function saveMeeting(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const payload = {
    id: 1,
    theme: form.theme.value.trim(),
    meeting_date: form.meeting_date.value,
    meeting_time: form.meeting_time.value,
    room: form.room.value.trim(),
    notes: form.notes.value.trim(),
    updated_by: state.session.user.id,
    updated_at: new Date().toISOString()
  };
  const { error } = await client.from("meetings").upsert(payload);
  if (error) return toast(error.message);
  toast("Meeting updated for everyone.");
  await loadPublicData();
}

async function saveAnnouncement(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const payload = {
    title: form.title.value.trim(),
    body: form.body.value.trim(),
    created_by: state.session.user.id
  };
  const { error } = await client.from("announcements").insert(payload);
  if (error) return toast(error.message);
  toast("Announcement published.");
  await loadPublicData();
}

async function saveRole(event) {
  event.preventDefault();
  if (!client || state.profile?.role !== "admin") return toast("Admin access only.");
  const form = event.currentTarget;
  const memberEmail = form.email.value.trim();
  const newRole = form.role.value;
  const { error } = await client.rpc("set_member_role_by_email", {
    member_email: memberEmail,
    new_role: newRole
  });
  if (error) return toast(error.message);
  toast(`${memberEmail} is now ${newRole}.`);
  form.reset();
  await loadPrivateData();
}

function bindEvents() {
  $(".menu-toggle").addEventListener("click", (event) => {
    const open = $(".nav").classList.toggle("open");
    event.currentTarget.setAttribute("aria-expanded", String(open));
  });
  $$(".nav a").forEach((link) => link.addEventListener("click", () => {
    $(".nav").classList.remove("open");
    $(".menu-toggle").setAttribute("aria-expanded", "false");
  }));
  $$("[data-auth-mode]").forEach((button) => {
    button.addEventListener("click", () => {
      state.authMode = button.dataset.authMode;
      renderAuth();
    });
  });
  $("[data-auth-form]").addEventListener("submit", handleAuth);
  $("[data-signout]").addEventListener("click", async () => {
    if (client) await client.auth.signOut();
    toast("Logged out.");
  });
  $("[data-art-form]").addEventListener("submit", handleArtworkSubmit);
  $("[data-cancel-edit]").addEventListener("click", () => {
    $("[data-art-form]").reset();
    $("[data-art-form]").artwork_id.value = "";
    $("[data-cancel-edit]").hidden = true;
  });
  document.addEventListener("click", (event) => {
    const editId = event.target.closest("[data-edit-art]")?.dataset.editArt;
    const approveId = event.target.closest("[data-approve-art]")?.dataset.approveArt;
    const rejectId = event.target.closest("[data-reject-art]")?.dataset.rejectArt;
    if (editId) editArtwork(editId);
    if (approveId) moderateArtwork(approveId, "approved");
    if (rejectId) moderateArtwork(rejectId, "rejected");
  });
  $("[data-meeting-form]").addEventListener("submit", saveMeeting);
  $("[data-announcement-form]").addEventListener("submit", saveAnnouncement);
  $("[data-role-form]").addEventListener("submit", saveRole);
}

function subscribeToChanges() {
  if (!client) return;
  client
    .channel("springcrush-live")
    .on("postgres_changes", { event: "*", schema: "public", table: "artworks" }, () => {
      loadPublicData();
      loadPrivateData();
    })
    .on("postgres_changes", { event: "*", schema: "public", table: "profiles" }, loadPrivateData)
    .on("postgres_changes", { event: "*", schema: "public", table: "meetings" }, loadPublicData)
    .on("postgres_changes", { event: "*", schema: "public", table: "announcements" }, loadPublicData)
    .subscribe();
}

async function init() {
  bindEvents();
  if (client) {
    const { data } = await client.auth.getSession();
    state.session = data.session;
    await loadProfile();
    client.auth.onAuthStateChange(async (_event, session) => {
      state.session = session;
      await loadProfile();
      await loadPrivateData();
      renderAll();
    });
    subscribeToChanges();
  }
  await loadPublicData();
  await loadPrivateData();
}

init();
