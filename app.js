const config = window.SPRINGCRUSH_CONFIG || {};
const hasSupabase = Boolean(config.supabaseUrl && config.supabaseAnonKey && window.supabase);
const client = hasSupabase ? window.supabase.createClient(config.supabaseUrl, config.supabaseAnonKey) : null;

const demoImages = [
  "https://images.unsplash.com/photo-1547891654-e66ed7ebb968?auto=format&fit=crop&w=900&q=80"
];

const state = {
  authMode: "signin",
  session: null,
  profile: null,
  gallery: [],
  mySubmissions: [],
  pending: [],
  approved: [],
  members: [],
  meeting: null,
  attendance: [],
  announcement: null,
  announcements: [],
  albums: [],
  monthlyTheme: null,
  featuredArtist: null,
  profiles: [],
  comments: [],
  competitions: [],
  competitionEntries: [],
  competitionVotes: [],
  settings: {
    animations_enabled: true
  },
  backendIssue: ""
};

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

function toast(message) {
  const el = $("[data-toast]");
  if (!el) return;
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

// Compress an image client-side to reduce Supabase storage usage.
async function compressImage(file, maxWidth = 1024, quality = 0.72) {
  if (!file || !file.type?.startsWith?.("image/")) return file;
  try {
    const bitmap = await createImageBitmap(file);
    const ratio = Math.min(1, maxWidth / bitmap.width);
    const width = Math.max(1, Math.round(bitmap.width * ratio));
    const height = Math.max(1, Math.round(bitmap.height * ratio));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(bitmap, 0, 0, width, height);
    // Prefer WebP (smaller), fall back to JPEG if not supported.
    let mime = "image/webp";
    let blob = await new Promise((res) => canvas.toBlob(res, mime, quality));
    if (!blob) {
      mime = "image/jpeg";
      blob = await new Promise((res) => canvas.toBlob(res, mime, quality));
    }
    if (!blob) return file;
    const ext = mime.split("/")[1] || "jpg";
    const name = (file.name || "image").replace(/\.[^/.]+$/, "") + `.${ext}`;
    return new File([blob], name, { type: mime });
  } catch (err) {
    console.warn("Image compression failed", err);
    return file;
  }
}

function formatDate(value) {
  if (!value) return "--";
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", year: "numeric" }).format(new Date(`${value}T00:00:00`));
}

function setLiveStatus() {
  const label = $("[data-live-status]");
  if (!label) return;
  label.textContent = state.backendIssue ? "Supabase setup needed" : "Live with Supabase";
}

function renderMeeting() {
  const title = $("[data-meeting-theme]");
  if (!title) return;
  const meeting = state.meeting || (!hasSupabase ? {
    theme: "Open studio + first submissions",
    meeting_date: "2026-06-26",
    meeting_time: "16:30",
    room: "Art room",
    notes: "Admins can change this once Supabase is connected."
  } : {
    theme: "No meeting scheduled",
    meeting_date: "",
    meeting_time: "",
    room: "--",
    notes: "Admins can publish the next meeting from the admin page."
  });

  title.textContent = meeting.theme;
  $("[data-meeting-date]").textContent = formatDate(meeting.meeting_date);
  $("[data-meeting-time]").textContent = meeting.meeting_time || "--";
  $("[data-meeting-room]").textContent = meeting.room || "--";
  $("[data-meeting-notes]").textContent = meeting.notes || "";

  const form = $("[data-meeting-form]");
  if (form && state.profile?.role === "admin") {
    form.theme.value = state.meeting?.theme || "";
    form.meeting_date.value = state.meeting?.meeting_date || "";
    form.meeting_time.value = state.meeting?.meeting_time || "";
    form.room.value = state.meeting?.room || "";
    form.notes.value = state.meeting?.notes || "";
  }

  const meta = $("[data-meeting-meta]");
  if (meta) {
    meta.textContent = state.meeting?.updated_by_email
      ? `Last updated by ${state.meeting.updated_by_email} on ${new Date(state.meeting.updated_at).toLocaleString()}`
      : "No meeting has been published yet.";
  }

  const attendanceSummary = $("[data-attendance-summary]");
  if (attendanceSummary) {
    if (!state.session) attendanceSummary.textContent = "Log in to mark attendance.";
    else if (!state.meeting) attendanceSummary.textContent = "No active meeting to attend.";
    else {
      const attending = state.attendance.some((row) => row.user_id === state.session.user.id);
      attendanceSummary.textContent = attending
        ? "You are marked as attending."
        : "You are not marked as attending yet.";
    }
  }

  const attendButton = $("[data-attend-meeting]");
  if (attendButton) {
    const attending = state.attendance.some((row) => row.user_id === state.session?.user?.id);
    attendButton.textContent = attending ? "Cancel attendance" : "Mark me attending";
    attendButton.disabled = !state.session || !state.meeting;
  }
}

function renderAnnouncement() {
  const title = $("[data-announcement-title]");
  if (!title) return;
  const announcement = state.announcement || (!hasSupabase ? {
    title: "Welcome to the wall",
    body: "Approved submissions appear here for everyone. Members can edit their own work, and edits go back to review."
  } : {
    title: "No announcement yet",
    body: "Admins can publish updates from the admin page."
  });

  title.textContent = announcement.title;
  $("[data-announcement-body]").textContent = announcement.body;

  const form = $("[data-announcement-form]");
  if (form && state.profile?.role === "admin") {
    form.title.value = "";
    form.body.value = "";
  }
}

function renderGallery() {
  const galleryEl = $("[data-gallery]");
  if (!galleryEl) return;
  if (!state.gallery.length) {
    galleryEl.innerHTML = `<div class="empty gallery-empty">No approved artwork yet.</div>`;
    return;
  }
  galleryEl.innerHTML = state.gallery.map((art) => {
    const comments = state.comments.filter((comment) => comment.artwork_id === art.id);
    return `
    <article class="art-card">
      <img src="${escapeHtml(art.image_url || demoImages[0])}" alt="${escapeHtml(art.title)} by ${escapeHtml(art.artist_name)}" loading="lazy">
      <div class="art-card-body">
        <h3>${escapeHtml(art.title)}</h3>
        <p>by ${escapeHtml(art.artist_name)}</p>
        <p>${escapeHtml(art.description || "")}</p>
        <span class="tag">approved</span>
        <div class="comments-block">
          <h4>Comments</h4>
          ${comments.length ? comments.map((comment) => `
            <p><strong>${escapeHtml(comment.display_name || comment.email || "Member")}:</strong> ${escapeHtml(comment.body)}</p>
          `).join("") : `<p>No comments yet.</p>`}
          <form class="comment-form" data-comment-form="${art.id}">
            <input type="text" name="body" maxlength="280" placeholder="Add a kind comment" required />
            <button class="small-button" type="submit">Post</button>
          </form>
        </div>
      </div>
    </article>
  `;
  }).join("");
}

function submissionMarkup(art, options = {}) {
  const controls = [];
  if (options.edit) controls.push(`<button class="small-button light" type="button" data-edit-art="${art.id}">Edit</button>`);
  if (options.moderate) {
    controls.push(`<button class="small-button" type="button" data-approve-art="${art.id}">Approve</button>`);
    controls.push(`<button class="small-button danger" type="button" data-reject-art="${art.id}">Reject</button>`);
  }
  if (options.remove) controls.push(`<button class="small-button danger" type="button" data-delete-art="${art.id}">Remove from gallery</button>`);

  return `
    <article class="submission-item">
      <img src="${escapeHtml(art.image_url || demoImages[0])}" alt="${escapeHtml(art.title)}">
      <div>
        <h4>${escapeHtml(art.title)}</h4>
        <p>${escapeHtml(art.artist_name)} - ${escapeHtml(art.status)}</p>
        <p>${escapeHtml(art.description || "")}</p>
      </div>
      ${controls.length ? `<div class="submission-controls">${controls.join("")}</div>` : ""}
    </article>
  `;
}

function renderSubmissions() {
  const mine = $("[data-my-submissions]");
  if (mine) {
    if (!state.session) mine.innerHTML = `<div class="empty">Log in to submit and manage your artwork.</div>`;
    else if (!state.mySubmissions.length) mine.innerHTML = `<div class="empty">No submissions yet.</div>`;
    else mine.innerHTML = state.mySubmissions.map((art) => submissionMarkup(art, { edit: true })).join("");
  }

  const pending = $("[data-pending-list]");
  if (pending) {
    if (state.profile?.role !== "admin") pending.innerHTML = `<div class="empty">Admin access only.</div>`;
    else if (!state.pending.length) pending.innerHTML = `<div class="empty">Nothing waiting for review.</div>`;
    else pending.innerHTML = state.pending.map((art) => submissionMarkup(art, { moderate: true })).join("");
  }

  const approved = $("[data-approved-list]");
  if (approved) {
    if (state.profile?.role !== "admin") approved.innerHTML = `<div class="empty">Admin access only.</div>`;
    else if (!state.approved.length) approved.innerHTML = `<div class="empty">No approved artwork yet.</div>`;
    else approved.innerHTML = state.approved.map((art) => submissionMarkup(art, { remove: true })).join("");
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
  const query = ($("[data-member-search]")?.value || "").trim().toLowerCase();
  const members = state.members.filter((member) => {
    const haystack = `${member.display_name || ""} ${member.email || ""}`.toLowerCase();
    return !query || haystack.includes(query);
  });
  if (!members.length) {
    list.innerHTML = `<div class="empty">No members match that search.</div>`;
    return;
  }
  list.innerHTML = members.map((member) => `
    <article class="submission-item member-item">
      <div class="member-avatar" aria-hidden="true">${escapeHtml((member.display_name || member.email || "?").slice(0, 1).toUpperCase())}</div>
      <div>
        <h4>${escapeHtml(member.display_name || "Unnamed member")}</h4>
        <p>${escapeHtml(member.email || "No email")} - ${escapeHtml(member.role)}</p>
      </div>
      <div class="submission-controls">
        <button class="small-button light" type="button" data-select-member="${escapeHtml(member.email || "")}" data-select-member-name="${escapeHtml(member.display_name || member.email || "Unnamed member")}">Select</button>
        <button class="small-button" type="button" data-quick-role="${escapeHtml(member.email || "")}" data-role-value="admin">Make admin</button>
        <button class="small-button light" type="button" data-quick-role="${escapeHtml(member.email || "")}" data-role-value="member">Make member</button>
      </div>
    </article>
  `).join("");
}

function renderFeaturedArtistPicker() {
  const select = $("[data-featured-member]");
  if (!select) return;
  if (state.profile?.role !== "admin") {
    select.innerHTML = `<option value="">Admin access only</option>`;
    select.disabled = true;
    return;
  }
  select.disabled = false;
  const members = state.members.filter((member) => member.email || member.display_name);
  select.innerHTML = members.length
    ? `<option value="">Choose the top artist</option>${members.map((member) => {
      const name = member.display_name || "Unnamed member";
      const email = member.email || "no email";
      const focus = member.specialty ? ` - ${member.specialty}` : "";
      return `<option value="${escapeHtml(member.id)}">${escapeHtml(name)} (${escapeHtml(email)})${escapeHtml(focus)}</option>`;
    }).join("")}`
    : `<option value="">Members will appear after they sign up</option>`;
}

function renderAlbumManager() {
  const manager = $("[data-album-manager]");
  const picker = $("[data-album-picker]");
  if (picker) {
    if (state.profile?.role !== "admin") {
      picker.innerHTML = `<option value="">Admin access only</option>`;
      picker.disabled = true;
    } else {
      picker.disabled = false;
      picker.innerHTML = state.albums.length
        ? `<option value="">Choose an album</option>${state.albums.map((album) => `<option value="${escapeHtml(album.id)}">${escapeHtml(album.title)}</option>`).join("")}`
        : `<option value="">Create an album first</option>`;
    }
  }
  if (!manager) return;
  if (state.profile?.role !== "admin") {
    manager.innerHTML = `<div class="empty">Admin access only.</div>`;
    return;
  }
  if (!state.albums.length) {
    manager.innerHTML = `<div class="empty">Albums will appear here after you publish them.</div>`;
    return;
  }
  manager.innerHTML = state.albums.map((album) => {
    const photos = Array.isArray(album.photo_urls) ? album.photo_urls.filter(Boolean) : [];
    const cover = album.cover_url || photos[0] || "";
    const photoSet = [...new Set([cover, ...photos].filter(Boolean))];
    return `
      <article class="album-admin-item">
        <div>
          <h4>${escapeHtml(album.title)}</h4>
          <p>${photoSet.length ? `${photoSet.length} photo${photoSet.length === 1 ? "" : "s"}` : "No uploaded photos"}</p>
        </div>
        ${photoSet.length ? `
          <div class="album-admin-grid">
            ${photoSet.map((photo) => `
              <div class="album-admin-photo">
                <img src="${escapeHtml(photo)}" alt="${escapeHtml(album.title)} photo" loading="lazy">
                <button class="small-button danger" type="button" data-remove-album-photo="${escapeHtml(album.id)}" data-photo-url="${escapeHtml(photo)}">Remove</button>
              </div>
            `).join("")}
          </div>
        ` : ""}
      </article>
    `;
  }).join("");
}

function renderAnnouncements() {
  const list = $("[data-announcement-list]");
  if (!list) return;
  if (state.profile?.role !== "admin") {
    list.innerHTML = `<div class="empty">Admin access only.</div>`;
    return;
  }
  if (!state.announcements.length) {
    list.innerHTML = `<div class="empty">No announcements have been published yet.</div>`;
    return;
  }
  list.innerHTML = state.announcements.map((announcement) => `
    <article class="submission-item notice-item">
      <div class="member-avatar" aria-hidden="true">${announcement.is_active ? "A" : "X"}</div>
      <div>
        <h4>${escapeHtml(announcement.title)}</h4>
        <p>${announcement.is_active ? "active" : "archived"} - ${escapeHtml(new Date(announcement.created_at).toLocaleString())}</p>
        <p>published by ${escapeHtml(announcement.created_by_email || announcement.created_by || "unknown admin")}</p>
        <p>${escapeHtml(announcement.body || "")}</p>
      </div>
      ${announcement.is_active ? `<div class="submission-controls"><button class="small-button danger" type="button" data-archive-announcement="${announcement.id}">Remove announcement</button></div>` : ""}
    </article>
  `).join("");
}

function renderCommunity() {
  const themeEl = $("[data-monthly-theme]");
  if (themeEl) {
    themeEl.innerHTML = state.monthlyTheme
      ? `<h2>${escapeHtml(state.monthlyTheme.title)}</h2><p>${escapeHtml(state.monthlyTheme.description || "")}</p>`
      : `<h2>No theme yet</h2><p>Admins can publish this month&apos;s creative theme.</p>`;
  }

  const featuredEl = $("[data-featured-artist]");
  if (featuredEl) {
    featuredEl.innerHTML = state.featuredArtist
      ? `<h2>${escapeHtml(state.featuredArtist.name)}</h2><p>${escapeHtml(state.featuredArtist.bio || "")}</p><span class="tag">${escapeHtml(state.featuredArtist.specialty || "featured artist")}</span>`
      : `<h2>No featured artist yet</h2><p>Admins can spotlight one club member.</p>`;
  }

  const albumsEl = $("[data-albums]");
  if (albumsEl) {
    albumsEl.innerHTML = state.albums.length
      ? state.albums.map((album) => {
        const photos = Array.isArray(album.photo_urls) ? album.photo_urls.filter(Boolean) : [];
        const cover = album.cover_url || photos[0] || demoImages[0];
        const photoSet = [...new Set([cover, ...photos].filter(Boolean))];
        return `
          <article class="art-card album-card" data-album-id="${escapeHtml(album.id)}">
            <div class="album-carousel" data-album-carousel="${escapeHtml(album.id)}" data-current-index="0">
              ${photoSet.map((photo, idx) => `<img src="${escapeHtml(photo)}" alt="${escapeHtml(album.title)} photo" loading="lazy" data-index="${idx}" ${idx === 0 ? "" : "hidden"}>`).join("")}
              <div class="album-nav">
                <button class="small-button light" type="button" data-album-prev="${escapeHtml(album.id)}" aria-label="Previous photo">‹</button>
                <button class="small-button light" type="button" data-album-next="${escapeHtml(album.id)}" aria-label="Next photo">›</button>
              </div>
            </div>
            <div class="art-card-body">
              <h3>${escapeHtml(album.title)}</h3>
              <p>${escapeHtml(album.description || "")}</p>
              ${photoSet.length ? `<div class="album-strip" aria-hidden="true">${photoSet.slice(0, 6).map((photo) => `<img src="${escapeHtml(photo)}" alt="" loading="lazy">`).join("")}</div>` : ""}
              ${album.album_url ? `<a class="button ghost" href="${escapeHtml(album.album_url)}" target="_blank" rel="noreferrer">Open album</a>` : ""}
              ${state.profile?.role === "admin" ? `<button class="small-button danger" type="button" data-delete-album="${escapeHtml(album.id)}">Delete album</button>` : ""}
            </div>
          </article>
        `;
      }).join("")
      : `<div class="empty gallery-empty">No event photo albums yet.</div>`;
  }

  const profilesEl = $("[data-public-profiles]");
  if (profilesEl) {
    const publicProfiles = state.profiles.filter((profile) => profile.is_public);
    profilesEl.innerHTML = publicProfiles.length
      ? publicProfiles.map((profile) => `
        <article class="submission-item member-item">
          <div class="member-avatar" aria-hidden="true">${escapeHtml((profile.display_name || profile.email || "?").slice(0, 1).toUpperCase())}</div>
          <div>
            <h4>${escapeHtml(profile.display_name || "Unnamed member")}</h4>
            <p>${escapeHtml(profile.specialty || "member artist")}</p>
            <p>${escapeHtml(profile.bio || "")}</p>
          </div>
        </article>
      `).join("")
      : `<div class="empty">No public member profiles yet.</div>`;
  }
}

function renderAttendance() {
  const list = $("[data-attendance-list]");
  if (!list) return;
  if (state.profile?.role !== "admin") {
    list.innerHTML = `<div class="empty">Admin access only.</div>`;
    return;
  }
  if (!state.attendance.length) {
    list.innerHTML = `<div class="empty">No one has marked attendance yet.</div>`;
    return;
  }
  list.innerHTML = state.attendance.map((row) => `
    <article class="submission-item member-item">
      <div class="member-avatar" aria-hidden="true">${escapeHtml((row.display_name || row.email || "?").slice(0, 1).toUpperCase())}</div>
      <div>
        <h4>${escapeHtml(row.display_name || "Unnamed member")}</h4>
        <p>${escapeHtml(row.email || "No email")} - ${escapeHtml(new Date(row.created_at).toLocaleString())}</p>
      </div>
    </article>
  `).join("");
}

function renderAuth() {
  $$("[data-auth-mode]").forEach((button) => button.classList.toggle("active", button.dataset.authMode === state.authMode));
  const nameField = $("[data-name-field]");
  const authButton = $("[data-auth-button]");
  if (nameField) nameField.hidden = state.authMode !== "signup";
  if (authButton) authButton.textContent = state.authMode === "signup" ? "Create account" : "Log in";

  const authed = Boolean(state.session);
  const authForm = $("[data-auth-form]");
  const sessionBox = $("[data-session-box]");
  const userEmail = $("[data-user-email]");
  const adminSection = $("[data-admin-section]");
  const adminLink = $("[data-admin-link]");
  if (authForm) authForm.hidden = authed;
  if (sessionBox) sessionBox.hidden = !authed;
  if (userEmail) userEmail.textContent = state.session?.user?.email || "";
  if (adminSection) adminSection.hidden = state.profile?.role !== "admin";
  if (adminLink) adminLink.hidden = state.profile?.role !== "admin";

  const profileForm = $("[data-profile-form]");
  if (profileForm && state.profile) {
    profileForm.display_name.value = state.profile.display_name || "";
    profileForm.bio.value = state.profile.bio || "";
    profileForm.specialty.value = state.profile.specialty || "";
    profileForm.is_public.checked = Boolean(state.profile.is_public);
  }
}

function renderSettings() {
  document.body.classList.toggle("animations-on", Boolean(state.settings.animations_enabled));
  const toggle = $("[data-animation-toggle]");
  if (toggle) toggle.checked = Boolean(state.settings.animations_enabled);
}

function enforceAdminControls() {
  if (state.profile?.role !== "admin") {
    $$('[data-delete-album]').forEach((btn) => btn.remove());
    $$('[data-delete-competition]').forEach((btn) => btn.remove());
  }
}

function renderCompetitionCarousel() {
  const carouselEl = $("[data-competition-carousel]");
  const active = state.competitions.find((c) => c.is_active) || null;
  if (!carouselEl) return;
  const entries = active ? state.competitionEntries.filter((e) => e.competition_id === active.id) : [];
  if (!entries.length) {
    carouselEl.innerHTML = `<div class="empty">No entries yet.</div>`;
    return;
  }
  // render images inside carousel
  carouselEl.dataset.currentIndex = carouselEl.dataset.currentIndex || '0';
  carouselEl.innerHTML = `${entries.map((entry, idx) => `<img src="${escapeHtml(entry.image_url || demoImages[0])}" alt="${escapeHtml(entry.title)}" data-index="${idx}" ${idx === 0 ? '' : 'hidden'} loading="lazy">`).join("")}`;
}

function renderAll() {
  setLiveStatus();
  renderAuth();
  renderMeeting();
  renderAnnouncement();
  renderGallery();
  renderSubmissions();
  renderMembers();
  renderFeaturedArtistPicker();
  renderAlbumManager();
  renderAnnouncements();
  renderAttendance();
  renderCommunity();
  renderCompetitions();
  renderCompetitionManager();
  renderSettings();
}

function renderCompetitionManager() {
  const manager = $("[data-competition-manager]");
  if (!manager) return;
  if (state.profile?.role !== "admin") {
    manager.innerHTML = `<div class="empty">Admin access only.</div>`;
    return;
  }
  if (!state.competitions.length) {
    manager.innerHTML = `<div class="empty">No competitions yet.</div>`;
    return;
  }
  manager.innerHTML = state.competitions.map((c) => `
    <article class="submission-item">
      <div>
        <h4>${escapeHtml(c.title)}</h4>
        <p>${escapeHtml(c.theme || "")}</p>
        <p>${escapeHtml(c.description || "")}</p>
        <p>Created by ${escapeHtml(c.created_by_email || "")}</p>
      </div>
      <div class="submission-controls">
        <button class="small-button danger" type="button" data-delete-competition="${escapeHtml(c.id)}">Delete</button>
      </div>
    </article>
  `).join("");
}

async function loadProfile() {
  if (!client || !state.session) {
    state.profile = null;
    return;
  }
  const { data, error } = await client.from("profiles").select("*").eq("id", state.session.user.id).single();
  state.profile = error ? null : data;
}

async function loadPublicData() {
  if (!client) {
    renderAll();
    return;
  }

  const [art, meeting, announcement, animationSetting, albums, monthlyTheme, featuredArtist, profiles, comments, competitions, competitionEntries, competitionVotes] = await Promise.all([
    client.from("artworks").select("*").eq("status", "approved").order("created_at", { ascending: false }),
    client.from("meetings").select("*").order("updated_at", { ascending: false }).limit(1).maybeSingle(),
    client.from("announcements").select("*").eq("is_active", true).order("created_at", { ascending: false }).limit(1).maybeSingle(),
    client.from("site_settings").select("*").eq("key", "animations_enabled").maybeSingle(),
    client.from("event_albums").select("*").order("created_at", { ascending: false }),
    client.from("monthly_themes").select("*").eq("is_active", true).order("created_at", { ascending: false }).limit(1).maybeSingle(),
    client.from("featured_artists").select("*").eq("is_active", true).order("created_at", { ascending: false }).limit(1).maybeSingle(),
    client.from("profiles").select("id,email,display_name,bio,specialty,is_public").eq("is_public", true).order("display_name", { ascending: true }),
    client.from("artwork_comments").select("*").order("created_at", { ascending: true }),
    client.from("competitions").select("*").order("created_at", { ascending: false }),
    client.from("competition_entries").select("*").order("created_at", { ascending: false }),
    client.from("competition_votes").select("*")
  ]);

  const setupError = [art.error, meeting.error, announcement.error, animationSetting.error, albums.error, monthlyTheme.error, featuredArtist.error, profiles.error, comments.error, competitions.error, competitionEntries.error, competitionVotes.error].find((error) =>
    error?.message?.includes("schema cache") || error?.code === "PGRST205"
  );
  if (setupError) {
    state.backendIssue = "Supabase tables are not installed yet. Run supabase-schema.sql in Supabase SQL Editor.";
    state.gallery = [];
    state.meeting = null;
    state.attendance = [];
    state.announcement = null;
    state.albums = [];
    state.monthlyTheme = null;
    state.featuredArtist = null;
    state.profiles = [];
    state.comments = [];
    state.competitions = [];
    state.competitionEntries = [];
    state.competitionVotes = [];
    renderAll();
    toast(state.backendIssue);
    return;
  }

  if (art.error) toast(art.error.message);
  state.backendIssue = "";
  state.gallery = art.data || [];
  state.meeting = meeting.data || null;
  state.announcement = announcement.data || null;
  state.settings.animations_enabled = animationSetting.data?.value ?? true;
  state.albums = albums.data || [];
  state.monthlyTheme = monthlyTheme.data || null;
  state.featuredArtist = featuredArtist.data || null;
  state.profiles = profiles.data || [];
  state.comments = comments.data || [];
  state.competitions = competitions.data || [];
  state.competitionEntries = competitionEntries.data || [];
  state.competitionVotes = competitionVotes.data || [];
  renderAll();
}

async function loadPrivateData() {
  if (!client || !state.session) {
    state.mySubmissions = [];
    state.pending = [];
    state.approved = [];
    state.members = [];
    state.announcements = [];
    state.attendance = [];
    renderAll();
    return;
  }

  const mine = await client.from("artworks").select("*").eq("user_id", state.session.user.id).order("updated_at", { ascending: false });
  state.mySubmissions = mine.data || [];

  if (state.profile?.role === "admin") {
    const [pending, approved, members, announcements, attendance] = await Promise.all([
      client.from("artworks").select("*").eq("status", "pending").order("updated_at", { ascending: false }),
      client.from("artworks").select("*").eq("status", "approved").order("updated_at", { ascending: false }),
      client.from("profiles").select("id,email,display_name,role,bio,specialty,is_public,created_at").order("created_at", { ascending: false }),
      client.from("announcements").select("*").order("created_at", { ascending: false }),
      client.from("meeting_attendance").select("*").eq("meeting_id", 1).order("created_at", { ascending: false })
    ]);
    state.pending = pending.data || [];
    state.approved = approved.data || [];
    state.members = members.data || [];
    state.announcements = announcements.data || [];
    state.attendance = attendance.data || [];
  } else {
    state.pending = [];
    state.approved = [];
    state.members = [];
    state.announcements = [];
    const attendance = await client.from("meeting_attendance").select("*").eq("meeting_id", 1);
    state.attendance = attendance.data || [];
  }
  renderAll();
}

async function uploadStorageImage(file, folder = "artwork") {
  if (!file) return null;
  try {
    // compress to save Supabase storage
    const compressed = await compressImage(file, 1024, 0.72);
    const ext = (compressed.type || "").split("/").pop()?.toLowerCase() || compressed.name.split(".").pop()?.toLowerCase() || "jpg";
    const path = `${state.session.user.id}/${folder}/${crypto.randomUUID()}.${ext}`;
    const { error } = await client.storage.from("artwork").upload(path, compressed, { upsert: false });
    if (error) throw error;
    const { data } = client.storage.from("artwork").getPublicUrl(path);
    return data.publicUrl;
  } catch (err) {
    throw err;
  }
}

async function uploadArtworkImage(file) {
  return uploadStorageImage(file, "artwork");
}

async function handleAuth(event) {
  event.preventDefault();
  if (!client) return toast("Connect Supabase before logging in.");
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
    const cancelEdit = $("[data-cancel-edit]");
    if (cancelEdit) cancelEdit.hidden = true;
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

async function deleteArtwork(id) {
  if (!client || state.profile?.role !== "admin") return toast("Admin access only.");
  const { error } = await client.from("artworks").delete().eq("id", id);
  if (error) return toast(error.message);
  toast("Artwork removed from the gallery.");
  await Promise.all([loadPublicData(), loadPrivateData()]);
}

async function deleteAlbum(albumId) {
  if (!client || state.profile?.role !== "admin") return toast("Admin access only.");
  const album = state.albums.find((a) => a.id === albumId);
  const { error } = await client.from("event_albums").delete().eq("id", albumId);
  if (error) return toast(error.message);

  // remove photos from storage if possible
  try {
    if (album && Array.isArray(album.photo_urls) && album.photo_urls.length) {
      const paths = album.photo_urls.map(storagePathFromPublicUrl).filter(Boolean);
      if (paths.length) await client.storage.from("artwork").remove(paths);
    }
  } catch (err) {
    // non-fatal: storage removal failed
    console.warn("Failed to remove album photos from storage", err);
  }

  toast("Album deleted.");
  await loadPublicData();
}

function editArtwork(id) {
  const art = state.mySubmissions.find((item) => item.id === id);
  if (!art) return;
  const form = $("[data-art-form]");
  if (!form) return;
  form.artwork_id.value = art.id;
  form.title.value = art.title;
  form.artist_name.value = art.artist_name;
  form.description.value = art.description || "";
  const cancelEdit = $("[data-cancel-edit]");
  if (cancelEdit) cancelEdit.hidden = false;
  if (!location.pathname.endsWith("members.html")) location.href = "members.html";
}

async function saveMeeting(event) {
  event.preventDefault();
  if (!client || state.profile?.role !== "admin") return toast("Admin access only.");
  const form = event.currentTarget;
  const payload = {
    id: 1,
    theme: form.theme.value.trim(),
    meeting_date: form.meeting_date.value,
    meeting_time: form.meeting_time.value,
    room: form.room.value.trim(),
    notes: form.notes.value.trim(),
    updated_by: state.session.user.id,
    updated_by_email: state.session.user.email || "",
    updated_at: new Date().toISOString()
  };
  const { error } = await client.from("meetings").upsert(payload);
  if (error) return toast(error.message);
  toast("Meeting updated for everyone.");
  await loadPublicData();
}

async function toggleAttendance() {
  if (!client) return toast("Connect Supabase first.");
  if (!state.session) return toast("Log in to mark attendance.");
  if (!state.meeting) return toast("No active meeting to attend.");

  const attending = state.attendance.some((row) => row.user_id === state.session.user.id);
  if (attending) {
    const { error } = await client
      .from("meeting_attendance")
      .delete()
      .eq("meeting_id", 1)
      .eq("user_id", state.session.user.id);
    if (error) return toast(error.message);
    toast("Attendance canceled.");
  } else {
    const { error } = await client.from("meeting_attendance").insert({
      meeting_id: 1,
      user_id: state.session.user.id,
      display_name: state.profile?.display_name || state.session.user.email?.split("@")[0] || "",
      email: state.session.user.email || ""
    });
    if (error) return toast(error.message);
    toast("You are marked as attending.");
  }
  await loadPrivateData();
}

async function deleteMeeting() {
  if (!client || state.profile?.role !== "admin") return toast("Admin access only.");
  const { error } = await client.from("meetings").delete().eq("id", 1);
  if (error) return toast(error.message);
  state.meeting = null;
  toast("Meeting removed.");
  await loadPublicData();
}

async function saveAnnouncement(event) {
  event.preventDefault();
  if (!client || state.profile?.role !== "admin") return toast("Admin access only.");
  const form = event.currentTarget;
  const payload = {
    title: form.title.value.trim(),
    body: form.body.value.trim(),
    created_by: state.session.user.id,
    created_by_email: state.session.user.email || "",
    is_active: true
  };
  const { error } = await client.from("announcements").insert(payload);
  if (error) return toast(error.message);
  form.reset();
  toast("Announcement published.");
  await Promise.all([loadPublicData(), loadPrivateData()]);
}

async function archiveAnnouncement(id) {
  if (!client || state.profile?.role !== "admin") return toast("Admin access only.");
  const { error } = await client
    .from("announcements")
    .update({ is_active: false, archived_at: new Date().toISOString() })
    .eq("id", id);
  if (error) return toast(error.message);
  toast("Announcement removed and kept in history.");
  await Promise.all([loadPublicData(), loadPrivateData()]);
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

async function saveSettings(event) {
  event.preventDefault();
  if (!client || state.profile?.role !== "admin") return toast("Admin access only.");
  const enabled = Boolean($("[data-animation-toggle]")?.checked);
  const { error } = await client.from("site_settings").upsert({
    key: "animations_enabled",
    value: enabled,
    updated_by: state.session.user.id,
    updated_at: new Date().toISOString()
  });
  if (error) return toast(error.message);
  state.settings.animations_enabled = enabled;
  renderSettings();
  toast("Style settings saved.");
}

async function saveAlbum(event) {
  event.preventDefault();
  if (!client || state.profile?.role !== "admin") return toast("Admin access only.");
  const form = event.currentTarget;
  const { error } = await client.from("event_albums").insert({
    title: form.title.value.trim(),
    description: form.description.value.trim(),
    cover_url: "",
    photo_urls: [],
    album_url: form.album_url.value.trim(),
    created_by: state.session.user.id,
    created_by_email: state.session.user.email || ""
  });
  if (error) return toast(error.message);
  form.reset();
  toast("Album created. Choose it below to add photos.");
  await loadPublicData();
}

async function addPhotosToAlbum(event) {
  event.preventDefault();
  if (!client || state.profile?.role !== "admin") return toast("Admin access only.");
  const form = event.currentTarget;
  const album = state.albums.find((item) => item.id === form.album_id.value);
  if (!album) return toast("Choose an album first.");
  const files = [...(form.photos?.files || [])];
  if (!files.length) return toast("Choose photos to upload.");
  try {
    const uploadedPhotos = [];
    for (const file of files) {
      uploadedPhotos.push(await uploadStorageImage(file, "albums"));
    }
    const currentPhotos = Array.isArray(album.photo_urls) ? album.photo_urls : [];
    const nextPhotos = [...currentPhotos, ...uploadedPhotos];
    const { error } = await client.from("event_albums").update({
      photo_urls: nextPhotos,
      cover_url: album.cover_url || uploadedPhotos[0] || ""
    }).eq("id", album.id);
    if (error) return toast(error.message);
    form.reset();
    toast("Photos added to album.");
    await loadPublicData();
  } catch (error) {
    toast(error.message || "Could not upload album photos.");
  }
}

function storagePathFromPublicUrl(url) {
  const marker = "/storage/v1/object/public/artwork/";
  const index = url.indexOf(marker);
  if (index === -1) return "";
  return decodeURIComponent(url.slice(index + marker.length).split("?")[0]);
}

async function removeAlbumPhoto(albumId, photoUrl) {
  if (!client || state.profile?.role !== "admin") return toast("Admin access only.");
  const album = state.albums.find((item) => item.id === albumId);
  if (!album) return toast("Album not found.");

  const remainingPhotos = (Array.isArray(album.photo_urls) ? album.photo_urls : []).filter((url) => url !== photoUrl);
  const nextCover = album.cover_url === photoUrl ? (remainingPhotos[0] || "") : album.cover_url;
  const { error } = await client.from("event_albums").update({
    photo_urls: remainingPhotos,
    cover_url: nextCover
  }).eq("id", albumId);
  if (error) return toast(error.message);

  const storagePath = storagePathFromPublicUrl(photoUrl);
  if (storagePath) {
    await client.storage.from("artwork").remove([storagePath]);
  }

  toast("Photo removed from album.");
  await loadPublicData();
}

async function saveMonthlyTheme(event) {
  event.preventDefault();
  if (!client || state.profile?.role !== "admin") return toast("Admin access only.");
  const form = event.currentTarget;
  await client.from("monthly_themes").update({ is_active: false }).eq("is_active", true);
  const { error } = await client.from("monthly_themes").insert({
    title: form.title.value.trim(),
    description: form.description.value.trim(),
    month_label: form.month_label.value.trim(),
    is_active: true,
    created_by: state.session.user.id,
    created_by_email: state.session.user.email || ""
  });
  if (error) return toast(error.message);
  form.reset();
  toast("Monthly theme published.");
  await loadPublicData();
}

async function saveFeaturedArtist(event) {
  event.preventDefault();
  if (!client || state.profile?.role !== "admin") return toast("Admin access only.");
  const form = event.currentTarget;
  const member = state.members.find((item) => item.id === form.profile_id.value);
  if (!member) return toast("Choose a member to feature.");
  await client.from("featured_artists").update({ is_active: false }).eq("is_active", true);
  const { error } = await client.from("featured_artists").insert({
    profile_id: member.id,
    name: member.display_name || member.email || "Featured artist",
    bio: form.bio.value.trim() || member.bio || "",
    specialty: member.specialty || "featured artist",
    is_active: true,
    created_by: state.session.user.id,
    created_by_email: state.session.user.email || ""
  });
  if (error) return toast(error.message);
  form.reset();
  toast("Featured artist updated.");
  await loadPublicData();
}

// --- Competitions: admin can create competitions; members can submit entries and vote ---
function renderCompetitions() {
  const feat = $("[data-competitions]");
  if (feat) {
    const active = state.competitions.find((c) => c.is_active) || null;
    feat.innerHTML = active
      ? `<h2>${escapeHtml(active.title)}</h2><p>${escapeHtml(active.description || "")}</p><p><strong>Theme:</strong> ${escapeHtml(active.theme || "")}</p>${state.profile?.role === "admin" ? `<div class="moderation-actions"><button class="small-button danger" type="button" data-delete-competition="${escapeHtml(active.id)}">Delete competition</button></div>` : ""}`
      : (state.profile?.role === "admin" ? `<form data-competition-form class="form album-upload-form"><label>Title<input name="title" required></label><label>Theme<input name="theme"></label><label>Description<textarea name="description"></textarea></label><button class="button" type="submit">Create competition</button></form>` : `<p>No active competition.</p>`);
  }

  const area = $("[data-competition-area]");
  if (!area) return;
  if (!state.competitions.length) {
    area.innerHTML = `<div class="empty">No competitions yet.</div>`;
    return;
  }
  area.innerHTML = state.competitions.map((comp) => {
    const entries = state.competitionEntries.filter((e) => e.competition_id === comp.id);
    return `
      <article class="art-card album-card">
        <div class="art-card-body">
          <h3>${escapeHtml(comp.title)}</h3>
          <p>${escapeHtml(comp.description || "")}</p>
          <p class="eyebrow">Theme: ${escapeHtml(comp.theme || "")}</p>
          ${comp.is_active ? `<form data-competition-entry-form data-comp-id="${escapeHtml(comp.id)}" class="album-upload-form"><label>Title<input name="title" required></label><label>Your name<input name="artist_name" value="${escapeHtml(state.profile?.display_name || state.session?.user?.email?.split("@")[0] || "")}" required></label><label>Image<input name="image" type="file" accept="image/*" required></label><button class="button" type="submit">Submit entry</button></form>` : `<div class="empty">Competition is closed.</div>`}
          ${entries.length ? `<div class="gallery-grid">${entries.map((entry) => {
            const voteCount = state.competitionVotes.filter((v) => v.entry_id === entry.id).length;
            const userVoted = state.competitionVotes.some((v) => v.entry_id === entry.id && v.user_id === state.session?.user?.id);
            return `
              <article class="submission-item">
                <img src="${escapeHtml(entry.image_url || demoImages[0])}" alt="${escapeHtml(entry.title)}">
                <div>
                  <h4>${escapeHtml(entry.title)}</h4>
                  <p>by ${escapeHtml(entry.artist_name)}</p>
                  <p>Votes: ${voteCount}</p>
                </div>
                <div class="submission-controls">${state.session ? `<button class="small-button" type="button" data-vote-entry="${escapeHtml(entry.id)}">${userVoted ? 'Unvote' : 'Vote'}</button>` : ''}</div>
              </article>
            `;
          }).join("")}</div>` : `<div class="empty">No entries yet.</div>`}
        </div>
      </article>
    `;
  }).join("");
}

async function saveCompetition(event) {
  event.preventDefault();
  if (!client || state.profile?.role !== "admin") return toast("Admin access only.");
  const form = event.currentTarget;
  const { error } = await client.from("competitions").insert({
    title: form.title.value.trim(),
    theme: form.theme.value.trim(),
    description: form.description.value.trim(),
    is_active: true,
    created_by: state.session.user.id,
    created_by_email: state.session.user.email || ""
  });
  if (error) return toast(error.message);
  form.reset();
  toast("Competition created.");
  await loadPublicData();
}

async function submitCompetitionEntry(event) {
  event.preventDefault();
  if (!client || !state.session) return toast("Log in to submit entries.");
  const form = event.currentTarget;
  const compId = form.dataset.compId;
  const file = form.image.files[0];
  if (!file) return toast("Choose an image.");
  try {
    const imageUrl = await uploadStorageImage(file, "albums");
    const payload = {
      competition_id: compId,
      title: form.title.value.trim(),
      artist_name: form.artist_name.value.trim() || state.profile?.display_name || state.session.user.email?.split("@")[0],
      image_url: imageUrl,
      user_id: state.session.user.id,
      created_at: new Date().toISOString()
    };
    const { error } = await client.from("competition_entries").insert(payload);
    if (error) return toast(error.message);
    form.reset();
    toast("Entry submitted.");
    await loadPublicData();
  } catch (err) {
    toast(err.message || "Failed to submit entry.");
  }
}

async function voteEntry(entryId) {
  if (!client || !state.session) return toast("Log in to vote.");
  const existing = state.competitionVotes.find((v) => v.entry_id === entryId && v.user_id === state.session.user.id);
  if (existing) {
    const { error } = await client.from("competition_votes").delete().eq("id", existing.id);
    if (error) return toast(error.message);
    toast("Vote removed.");
  } else {
    const { error } = await client.from("competition_votes").insert({ entry_id: entryId, user_id: state.session.user.id, created_at: new Date().toISOString() });
    if (error) return toast(error.message);
    toast("Vote recorded.");
  }
  await loadPublicData();
}

async function deleteCompetition(competitionId) {
  if (!client || state.profile?.role !== "admin") return toast("Admin access only.");
  const { error } = await client.from("competitions").delete().eq("id", competitionId);
  if (error) return toast(error.message);
  toast("Competition deleted.");
  await loadPublicData();
}

async function saveProfile(event) {
  event.preventDefault();
  if (!client || !state.session) return toast("Log in first.");
  const form = event.currentTarget;
  const { error } = await client.from("profiles").update({
    display_name: form.display_name.value.trim(),
    bio: form.bio.value.trim(),
    specialty: form.specialty.value.trim(),
    is_public: form.is_public.checked
  }).eq("id", state.session.user.id);
  if (error) return toast(error.message);
  toast("Profile saved.");
  await loadProfile();
  await loadPublicData();
}

async function saveComment(event) {
  event.preventDefault();
  if (!client || !state.session) return toast("Log in to comment.");
  const form = event.currentTarget;
  const artworkId = form.dataset.commentForm;
  const { error } = await client.from("artwork_comments").insert({
    artwork_id: artworkId,
    user_id: state.session.user.id,
    display_name: state.profile?.display_name || state.session.user.email?.split("@")[0] || "",
    email: state.session.user.email || "",
    body: form.body.value.trim()
  });
  if (error) return toast(error.message);
  form.reset();
  toast("Comment posted.");
  await loadPublicData();
}

function selectMember(email, name) {
  const emailInput = $("[data-selected-member-email]");
  const label = $("[data-selected-member]");
  if (emailInput) emailInput.value = email;
  if (label) label.textContent = email ? `${name} - ${email}` : "No member selected";
}

async function updateRoleForEmail(email, role) {
  if (!client || state.profile?.role !== "admin") return toast("Admin access only.");
  if (!email) return toast("Select a member first.");
  const { error } = await client.rpc("set_member_role_by_email", {
    member_email: email,
    new_role: role
  });
  if (error) return toast(error.message);
  toast(`${email} is now ${role}.`);
  await loadPrivateData();
}

function bindEvents() {
  const menuToggle = $(".menu-toggle");
  if (menuToggle) menuToggle.addEventListener("click", (event) => {
    const open = $(".nav").classList.toggle("open");
    event.currentTarget.setAttribute("aria-expanded", String(open));
  });
  $$(".nav a").forEach((link) => link.addEventListener("click", () => {
    const nav = $(".nav");
    if (nav) nav.classList.remove("open");
    if (menuToggle) menuToggle.setAttribute("aria-expanded", "false");
  }));
  $$("[data-auth-mode]").forEach((button) => {
    button.addEventListener("click", () => {
      state.authMode = button.dataset.authMode;
      renderAuth();
    });
  });

  const authForm = $("[data-auth-form]");
  if (authForm) authForm.addEventListener("submit", handleAuth);
  const signout = $("[data-signout]");
  if (signout) signout.addEventListener("click", async () => {
    if (client) await client.auth.signOut();
    toast("Logged out.");
  });
  const artForm = $("[data-art-form]");
  if (artForm) artForm.addEventListener("submit", handleArtworkSubmit);
  const cancelEdit = $("[data-cancel-edit]");
  if (cancelEdit) cancelEdit.addEventListener("click", () => {
    const form = $("[data-art-form]");
    if (form) {
      form.reset();
      form.artwork_id.value = "";
    }
    cancelEdit.hidden = true;
  });

  document.addEventListener("click", (event) => {
    const editId = event.target.closest("[data-edit-art]")?.dataset.editArt;
    const approveId = event.target.closest("[data-approve-art]")?.dataset.approveArt;
    const rejectId = event.target.closest("[data-reject-art]")?.dataset.rejectArt;
    const deleteId = event.target.closest("[data-delete-art]")?.dataset.deleteArt;
    const archiveAnnouncementId = event.target.closest("[data-archive-announcement]")?.dataset.archiveAnnouncement;
    const removeAlbumPhotoButton = event.target.closest("[data-remove-album-photo]");
    const selectedMember = event.target.closest("[data-select-member]");
    const quickRole = event.target.closest("[data-quick-role]");
    const albumNext = event.target.closest("[data-album-next]");
    const albumPrev = event.target.closest("[data-album-prev]")?.dataset.albumPrev ? event.target.closest("[data-album-prev]") : null;
    const deleteAlbumBtn = event.target.closest("[data-delete-album]");
    const voteBtn = event.target.closest("[data-vote-entry]");
    const deleteCompetitionBtn = event.target.closest("[data-delete-competition]");

    if (editId) editArtwork(editId);
    if (approveId) moderateArtwork(approveId, "approved");
    if (rejectId) moderateArtwork(rejectId, "rejected");
    if (deleteId) deleteArtwork(deleteId);
    if (archiveAnnouncementId) archiveAnnouncement(archiveAnnouncementId);
    if (removeAlbumPhotoButton) removeAlbumPhoto(removeAlbumPhotoButton.dataset.removeAlbumPhoto, removeAlbumPhotoButton.dataset.photoUrl);
    if (selectedMember) selectMember(selectedMember.dataset.selectMember, selectedMember.dataset.selectMemberName);
    if (quickRole) updateRoleForEmail(quickRole.dataset.quickRole, quickRole.dataset.roleValue);

    if (albumNext) {
      const id = albumNext.dataset.albumNext;
      const carousel = document.querySelector(`[data-album-carousel="${id}"]`);
      if (carousel) {
        const imgs = [...carousel.querySelectorAll('img')];
        const current = parseInt(carousel.dataset.currentIndex || '0', 10) || 0;
        const next = (current + 1) % imgs.length;
        imgs.forEach((img) => img.hidden = img.dataset.index !== String(next));
        carousel.dataset.currentIndex = String(next);
      }
    }

    if (albumPrev) {
      const id = albumPrev.dataset.albumPrev;
      const carousel = document.querySelector(`[data-album-carousel="${id}"]`);
      if (carousel) {
        const imgs = [...carousel.querySelectorAll('img')];
        const current = parseInt(carousel.dataset.currentIndex || '0', 10) || 0;
        const prev = (current - 1 + imgs.length) % imgs.length;
        imgs.forEach((img) => img.hidden = img.dataset.index !== String(prev));
        carousel.dataset.currentIndex = String(prev);
      }
    }

    // competition carousel controls
    const compNext = event.target.closest('[data-competition-next]');
    const compPrev = event.target.closest('[data-competition-prev]');
    if (compNext) {
      const carousel = document.querySelector('[data-competition-carousel]');
      if (carousel) {
        const imgs = [...carousel.querySelectorAll('img')];
        if (imgs.length) {
          const current = parseInt(carousel.dataset.currentIndex || '0', 10) || 0;
          const next = (current + 1) % imgs.length;
          imgs.forEach((img) => img.hidden = img.dataset.index !== String(next));
          carousel.dataset.currentIndex = String(next);
        }
      }
    }
    if (compPrev) {
      const carousel = document.querySelector('[data-competition-carousel]');
      if (carousel) {
        const imgs = [...carousel.querySelectorAll('img')];
        if (imgs.length) {
          const current = parseInt(carousel.dataset.currentIndex || '0', 10) || 0;
          const prev = (current - 1 + imgs.length) % imgs.length;
          imgs.forEach((img) => img.hidden = img.dataset.index !== String(prev));
          carousel.dataset.currentIndex = String(prev);
        }
      }
    }

    if (deleteAlbumBtn) {
      deleteAlbum(deleteAlbumBtn.dataset.deleteAlbum);
    }

    if (voteBtn) {
      voteEntry(voteBtn.dataset.voteEntry);
    }

    if (deleteCompetitionBtn) {
      deleteCompetition(deleteCompetitionBtn.dataset.deleteCompetition);
    }
  });

  const meetingForm = $("[data-meeting-form]");
  if (meetingForm) meetingForm.addEventListener("submit", saveMeeting);
  const deleteMeetingButton = $("[data-delete-meeting]");
  if (deleteMeetingButton) deleteMeetingButton.addEventListener("click", deleteMeeting);
  const attendMeetingButton = $("[data-attend-meeting]");
  if (attendMeetingButton) attendMeetingButton.addEventListener("click", toggleAttendance);
  const announcementForm = $("[data-announcement-form]");
  if (announcementForm) announcementForm.addEventListener("submit", saveAnnouncement);
  const roleForm = $("[data-role-form]");
  if (roleForm) roleForm.addEventListener("submit", saveRole);
  const memberSearch = $("[data-member-search]");
  if (memberSearch) memberSearch.addEventListener("input", renderMembers);
  const settingsForm = $("[data-settings-form]");
  if (settingsForm) settingsForm.addEventListener("submit", saveSettings);
  const albumForm = $("[data-album-form]");
  if (albumForm) albumForm.addEventListener("submit", saveAlbum);
  const albumPhotoForm = $("[data-album-photo-form]");
  if (albumPhotoForm) albumPhotoForm.addEventListener("submit", addPhotosToAlbum);
  const themeForm = $("[data-theme-form]");
  if (themeForm) themeForm.addEventListener("submit", saveMonthlyTheme);
  const featuredForm = $("[data-featured-form]");
  if (featuredForm) featuredForm.addEventListener("submit", saveFeaturedArtist);
  const profileForm = $("[data-profile-form]");
  if (profileForm) profileForm.addEventListener("submit", saveProfile);

  const competitionForm = $("[data-competition-form]");
  if (competitionForm) competitionForm.addEventListener("submit", saveCompetition);
  const competitionEntryForm = $("[data-competition-entry-form]");
  if (competitionEntryForm) competitionEntryForm.addEventListener("submit", submitCompetitionEntry);

  document.addEventListener("submit", (event) => {
    if (event.target.matches("[data-comment-form]")) return saveComment(event);
    if (event.target.matches("[data-competition-entry-form]")) return submitCompetitionEntry(event);
  });
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
    .on("postgres_changes", { event: "*", schema: "public", table: "meeting_attendance" }, loadPrivateData)
    .on("postgres_changes", { event: "*", schema: "public", table: "announcements" }, () => {
      loadPublicData();
      loadPrivateData();
    })
    .on("postgres_changes", { event: "*", schema: "public", table: "event_albums" }, loadPublicData)
    .on("postgres_changes", { event: "*", schema: "public", table: "site_settings" }, loadPublicData)
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
