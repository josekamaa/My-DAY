/* ----------------------------------------------------------
   SUPABASE CLIENT
---------------------------------------------------------- */
const SUPABASE_URL = "https://ojjvkhafgurgondsopeh.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9qanZraGFmZ3VyZ29uZHNvcGVoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQ5MDkzODYsImV4cCI6MjA4MDQ4NTM4Nn0.hOLxBVqnFhJ2S1jjR0mkKUJ_bWDjZbHJD3wV0Rbbf7A"; // <-- USE ANON KEY ONLY

const sb = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

/* ----------------------------------------------------------
   GLOBAL STATE
---------------------------------------------------------- */
let currentUser = null;
let userLikes = new Set();

let activeConversation = null;  // { type:"dm"|"group", id, name }
let dmRealtime = null;
let groupRealtime = null;

let allUsersCache = [];
let allGroupsCache = [];

/* ----------------------------------------------------------
   DOM SHORTCUTS
---------------------------------------------------------- */
const el = id => document.getElementById(id);
const $ = sel => document.querySelector(sel);

/* ----------------------------------------------------------
   HELPERS
---------------------------------------------------------- */
function pubUrl(bucket, path) {
  return `${SUPABASE_URL}/storage/v1/object/public/${bucket}/${encodeURIComponent(path)}`;
}

function formatTime(ts) {
  return ts ? new Date(ts).toLocaleString() : "";
}

function escapeHTML(str) {
  return str ? str.replace(/&/g, "&amp;")
              .replace(/</g, "&lt;")
              .replace(/>/g, "&gt;") : "";
}

/* ----------------------------------------------------------
   INITIALIZE
---------------------------------------------------------- */
document.addEventListener("DOMContentLoaded", async () => {
  wireUI();
  await loadUser();
  await loadUsersAndGroups();
  setupRealtime();
});

/* ----------------------------------------------------------
   UI EVENTS
---------------------------------------------------------- */
function wireUI() {
  el("openMessengerBtn").onclick = openMessenger;
  el("showInboxBtn").onclick = openMessenger;

  el("postBtn").onclick = createPost;
  el("cancelPostBtn").onclick = () => el("createPostBox").classList.add("hidden");
  el("showCreatePostBtn").onclick = () => el("createPostBox").classList.remove("hidden");

  el("avatarInput").onchange = uploadAvatar;

  el("sendBtn").onclick = sendChatMessage;
  el("chatImageInput").onchange = sendChatMessage;

  el("createGroupBtn").onclick = createGroup;
  el("leaveGroupBtn").onclick = leaveGroup;

  // Camera
  el("captureBtn").onclick = capturePhoto;
  el("closeCameraBtn").onclick = closeCamera;

  // Mobile tabs
  el("tabChats").onclick = () => { openMessenger(); scrollToUsers(); };
  el("tabGroups").onclick = () => { openMessenger(); scrollToGroups(); };
  el("tabProfile").onclick = () => window.scrollTo({ top: 0, behavior: "smooth" });

  // Search
  el("contactsSearch").oninput = filterContacts;
}

/* ----------------------------------------------------------
   LOAD AUTH USER + PROFILE
---------------------------------------------------------- */
async function loadUser() {
  const { data } = await sb.auth.getUser();

  if (!data?.user) {
    window.location.href = "login.html";
    return;
  }

  currentUser = data.user;

  await ensureProfileExists();
  await loadProfilePanel();
  await loadUserLikes();
  await loadPosts();
}

async function ensureProfileExists() {
  const { data } = await sb
    .from("profiles")
    .select("id")
    .eq("id", currentUser.id)
    .maybeSingle();

  if (!data) {
    await sb.from("profiles").insert({
      id: currentUser.id,
      username: currentUser.email.split("@")[0]
    });
  }
}

async function loadProfilePanel() {
  const { data } = await sb
    .from("profiles")
    .select("*")
    .eq("id", currentUser.id)
    .single();

  const username = data?.username || "User";
  const avatar = data?.avatar_url;

  el("profileUsername").textContent = username;
  el("profileEmail").textContent = currentUser.email;

  el("avatarInitial").textContent = username.charAt(0).toUpperCase();

  if (avatar) {
    el("profileAvatar").innerHTML = `<img src="${avatar}" style="width:100%;height:100%;object-fit:cover">`;
  }
}

/* ----------------------------------------------------------
   AVATAR UPLOAD
---------------------------------------------------------- */
async function uploadAvatar(ev) {
  const file = ev.target.files[0];
  if (!file) return;

  const path = `${currentUser.id}_${Date.now()}_${file.name}`;

  const { data, error } = await sb.storage
    .from("avatars")
    .upload(path, file);

  if (error) return alert("Avatar upload failed.");

  const url = pubUrl("avatars", data.path);

  await sb
    .from("profiles")
    .update({ avatar_url: url })
    .eq("id", currentUser.id);

  loadProfilePanel();
  loadPosts();
}

/* ----------------------------------------------------------
   POSTS
---------------------------------------------------------- */
async function loadUserLikes() {
  const { data } = await sb.from("post_likes")
    .select("post_id")
    .eq("user_id", currentUser.id);

  userLikes = new Set(data?.map(x => x.post_id) || []);
}

async function loadPosts() {
  const postBox = el("posts");
  postBox.innerHTML = "Loading...";

  const { data } = await sb
    .from("posts")
    .select("*")
    .order("created_at", { ascending: false });

  postBox.innerHTML = "";

  for (const p of data) {
    const prof = await sb
      .from("profiles")
      .select("*")
      .eq("id", p.user_id)
      .maybeSingle();

    const username = prof.data?.username || p.user_name;
    const avatar = prof.data?.avatar_url;

    const div = document.createElement("div");
    div.className = "post";

    let avatarHtml = avatar
      ? `<img src="${avatar}" style="width:42px;height:42px;border-radius:50%;">`
      : `<div style="width:42px;height:42px;border-radius:50%;background:#4a90e2;color:#fff;display:flex;align-items:center;justify-content:center">${username.charAt(0).toUpperCase()}</div>`;

    let media = "";
    if (p.media_type === "image")
      media = `<img src="${p.media_url}" style="width:100%;margin-top:8px;border-radius:8px">`;
    if (p.media_type === "video")
      media = `<video src="${p.media_url}" controls style="width:100%;margin-top:8px;border-radius:8px"></video>`;

    div.innerHTML = `
      <div style="display:flex;align-items:center;gap:10px;">
        ${avatarHtml}
        <div>
          <strong>${username}</strong><br>
          <span class="muted small">${formatTime(p.created_at)}</span>
        </div>
      </div>
      <p style="margin-top:8px">${p.caption}</p>
      ${media}
      <div style="margin-top:10px;display:flex;gap:10px;">
        <button class="btn ghost" onclick="likePost(${p.id}, ${p.likes})">
          ${userLikes.has(p.id) ? "❤️" : "🤍"} Like (${p.likes})
        </button>
        <button class="btn ghost" onclick="toggleComments(${p.id})">💬 Comments</button>
      </div>

      <div id="comments-${p.id}" class="comments-section hidden" style="margin-top:10px;">
        <div id="comments-list-${p.id}"></div>
        <div style="display:flex;gap:6px;margin-top:6px">
          <input id="comment-input-${p.id}" placeholder="Comment..." style="flex:1;padding:6px;border:1px solid #ccc;border-radius:8px">
          <button class="btn" onclick="addComment(${p.id})">Send</button>
        </div>
      </div>
    `;

    postBox.appendChild(div);
    loadComments(p.id);
  }
}

async function likePost(id, likes) {
  if (userLikes.has(id)) return;

  await sb.from("post_likes").insert({
    post_id: id,
    user_id: currentUser.id
  });

  await sb.from("posts")
    .update({ likes: likes + 1 })
    .eq("id", id);

  loadUserLikes();
  loadPosts();
}

async function addComment(id) {
  const input = el(`comment-input-${id}`);
  const text = input.value.trim();
  if (!text) return;

  await sb.from("comments").insert({
    post_id: id,
    user_id: currentUser.id,
    user_name: currentUser.email.split("@")[0],
    comment: text
  });

  input.value = "";
  loadComments(id);
}

async function loadComments(id) {
  const { data } = await sb.from("comments")
    .select("*")
    .eq("post_id", id)
    .order("created_at");

  const box = el(`comments-list-${id}`);
  box.innerHTML = "";

  for (const c of data) {
    const dv = document.createElement("div");
    dv.innerHTML = `<strong>${c.user_name}</strong>: ${c.comment}`;
    box.appendChild(dv);
  }
}

function toggleComments(id) {
  el(`comments-${id}`).classList.toggle("hidden");
}

/* ----------------------------------------------------------
   CAMERA
---------------------------------------------------------- */
let cameraStream = null;

async function openCamera() {
  el("cameraPreview").style.display = "flex";
  cameraStream = await navigator.mediaDevices.getUserMedia({
    video: { facingMode: "user" },
    audio: false
  });
  el("cameraVideo").srcObject = cameraStream;
}

function closeCamera() {
  if (cameraStream) cameraStream.getTracks().forEach(t => t.stop());
  el("cameraPreview").style.display = "none";
}

function capturePhoto() {
  const video = el("cameraVideo");
  const canvas = el("photoCanvas");

  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;

  canvas.getContext("2d").drawImage(video, 0, 0);

  canvas.toBlob(blob => {
    const file = new File([blob], `photo_${Date.now()}.png`, { type: "image/png" });
    const dt = new DataTransfer();
    dt.items.add(file);

    el("mediaFile").files = dt.files;

    closeCamera();
    el("createPostBox").classList.remove("hidden");
  });
}

/* ----------------------------------------------------------
   MESSENGER LAYOUT
---------------------------------------------------------- */
function openMessenger() {
  el("messenger").style.display = "flex";
}

function closeMessenger() {
  el("messenger").style.display = "none";
}

/* ----------------------------------------------------------
   LOAD USERS & GROUPS
---------------------------------------------------------- */
async function loadUsersAndGroups() {
  const users = await sb.from("profiles")
    .select("id,username,avatar_url")
    .neq("id", currentUser.id);

  allUsersCache = users.data || [];

  const groups = await sb.from("groups")
    .select("*")
    .order("created_at", { ascending: false });

  allGroupsCache = groups.data || [];

  renderUsersList();
  renderGroupsList();

  fillAddMemberSelect();
}

/* USERS */
function renderUsersList() {
  const list = el("usersList");
  list.innerHTML = "";

  allUsersCache.forEach(u => {
    const row = document.createElement("div");
    row.className = "list-row";
    row.innerHTML = `
      <div style="width:42px;height:42px;border-radius:50%;overflow:hidden;background:#4a90e2;color:#fff;display:flex;align-items:center;justify-content:center">
        ${u.avatar_url ? `<img src="${u.avatar_url}" style="width:100%;height:100%;object-fit:cover">` : u.username.charAt(0).toUpperCase()}
      </div>
      <div style="flex:1">
        <strong>${u.username}</strong>
      </div>
    `;
    row.onclick = () => openDM(u);
    list.appendChild(row);
  });
}

/* GROUPS */
function renderGroupsList() {
  const list = el("groupsList");
  list.innerHTML = "";

  allGroupsCache.forEach(g => {
    const row = document.createElement("div");
    row.className = "list-row";
    row.innerHTML = `
      <div style="width:42px;height:42px;border-radius:10px;background:#eef2ff;display:flex;align-items:center;justify-content:center">G</div>
      <div style="flex:1"><strong>${g.name}</strong></div>
    `;
    row.onclick = () => openGroupChat(g);
    list.appendChild(row);
  });
}

/* SEARCH */
function filterContacts() {
  const term = el("contactsSearch").value.toLowerCase();

  const filteredUsers = allUsersCache.filter(u =>
    u.username.toLowerCase().includes(term)
  );

  const filteredGroups = allGroupsCache.filter(g =>
    g.name.toLowerCase().includes(term)
  );

  /* RENDER USERS */
  const ul = el("usersList");
  ul.innerHTML = "";
  filteredUsers.forEach(u => {
    const row = document.createElement("div");
    row.className = "list-row";
    row.innerHTML = `
      <div style="width:42px;height:42px;border-radius:50%;overflow:hidden;background:#4a90e2;color:#fff;display:flex;align-items:center;justify-content:center">
        ${u.avatar_url ? `<img src="${u.avatar_url}" style="width:100%;height:100%;object-fit:cover">` : u.username.charAt(0).toUpperCase()}
      </div>
      <div style="flex:1"><strong>${u.username}</strong></div>
    `;
    row.onclick = () => openDM(u);
    ul.appendChild(row);
  });

  /* RENDER GROUPS */
  const gl = el("groupsList");
  gl.innerHTML = "";
  filteredGroups.forEach(g => {
    const row = document.createElement("div");
    row.className = "list-row";
    row.innerHTML = `
      <div style="width:42px;height:42px;border-radius:10px;background:#eef2ff;display:flex;align-items:center;justify-content:center">G</div>
      <div style="flex:1"><strong>${g.name}</strong></div>
    `;
    row.onclick = () => openGroupChat(g);
    gl.appendChild(row);
  });
}

/* SCROLL HELPERS (mobile tabs) */
function scrollToUsers() { el("usersList").scrollIntoView({ behavior:"smooth" }); }
function scrollToGroups() { el("groupsList").scrollIntoView({ behavior:"smooth" }); }

/* ----------------------------------------------------------
   DIRECT MESSAGE (DM)
---------------------------------------------------------- */
async function openDM(user) {
  activeConversation = {
    type: "dm",
    id: user.id,
    name: user.username
  };

  el("chatHead").textContent = user.username;
  el("leaveGroupBtn").style.display = "none";
  el("groupDetails").classList.add("hidden");
  el("chatInfo").classList.remove("hidden");

  const { data } = await sb
    .from("messages")
    .select("*")
    .or(`
      and(sender_id.eq.${currentUser.id}, receiver_id.eq.${user.id}),
      and(sender_id.eq.${user.id}, receiver_id.eq.${currentUser.id})
    `)
    .order("created_at");

  renderMessages(data || []);
}

/* ----------------------------------------------------------
   GROUP CHAT
---------------------------------------------------------- */
async function openGroupChat(g) {
  activeConversation = {
    type: "group",
    id: g.id,
    name: g.name
  };

  el("chatHead").textContent = g.name;
  el("leaveGroupBtn").style.display = "inline-block";
  el("groupDetails").classList.remove("hidden");
  el("chatInfo").classList.add("hidden");

  await loadGroupMembers(g.id);

  const { data } = await sb
    .from("group_messages")
    .select("*")
    .eq("group_id", g.id)
    .order("created_at");

  renderMessages(data || []);
}

async function loadGroupMembers(groupId) {
  const { data } = await sb
    .from("group_members")
    .select("user_id")
    .eq("group_id", groupId);

  const ids = data?.map(x => x.user_id) || [];

  const profiles = ids.length
    ? (await sb.from("profiles")
        .select("id,username,avatar_url")
        .in("id", ids)).data
    : [];

  const container = el("groupMembers");
  container.innerHTML = "";

  profiles.forEach(p => {
    const dv = document.createElement("div");
    dv.style.textAlign = "center";
    dv.innerHTML = `
      <div style="width:48px;height:48px;border-radius:50%;overflow:hidden;margin:auto">
        ${p.avatar_url ? `<img src="${p.avatar_url}" style="width:100%;height:100%;object-fit:cover">` : p.username.charAt(0).toUpperCase()}
      </div>
      <div class="small">${p.username}</div>
    `;
    container.appendChild(dv);
  });

  fillAddMemberSelect();
}

function fillAddMemberSelect() {
  const sel = el("addMemberSelect");
  if (!sel) return;

  sel.innerHTML = `<option value="">Select user</option>`;

  allUsersCache.forEach(u => {
    const opt = document.createElement("option");
    opt.value = u.id;
    opt.textContent = u.username;
    sel.appendChild(opt);
  });

  el("addMemberBtn").onclick = async () => {
    const userId = sel.value;
    if (!userId || !activeConversation || activeConversation.type !== "group")
      return alert("Select a group + user.");

    await sb.from("group_members")
      .insert({
        group_id: activeConversation.id,
        user_id: userId
      });

    openGroupChat({ id: activeConversation.id, name: activeConversation.name });
  };
}

/* CREATE GROUP */
async function createGroup() {
  const name = prompt("Group name:");
  if (!name) return;

  const { data, error } = await sb
    .from("groups")
    .insert({ name, created_by: currentUser.id })
    .select()
    .single();

  if (error) return alert("Failed to create group");

  await sb.from("group_members").insert({
    group_id: data.id,
    user_id: currentUser.id
  });

  await loadUsersAndGroups();
  openGroupChat(data);
}

/* LEAVE GROUP */
async function leaveGroup() {
  if (!activeConversation || activeConversation.type !== "group") return;

  const ok = confirm("Leave this group?");
  if (!ok) return;

  await sb.from("group_members")
    .delete()
    .match({
      group_id: activeConversation.id,
      user_id: currentUser.id
    });

  alert("You left the group.");
  activeConversation = null;
  el("messagesList").innerHTML = "";
  loadUsersAndGroups();
}

/* ----------------------------------------------------------
   MESSAGES RENDERING
---------------------------------------------------------- */
function renderMessages(list) {
  const box = el("messagesList");
  box.innerHTML = "";

  list.forEach(m => {
    addMessageBubble(m);
  });

  box.scrollTop = box.scrollHeight;
}

function addMessageBubble(m) {
  const box = el("messagesList");

  const div = document.createElement("div");
  div.className = "msg" + (m.sender_id === currentUser.id ? " me" : "");

  const txt = m.message ? `<div>${escapeHTML(m.message)}</div>` : "";
  const img = m.image_url ? `<img src="${m.image_url}" class="chat-image">` : "";

  div.innerHTML = `${txt}${img}<div class="time">${formatTime(m.created_at)}</div>`;

  box.appendChild(div);
  box.scrollTop = box.scrollHeight;
}

/* ----------------------------------------------------------
   SEND MESSAGE (DM or GROUP)
---------------------------------------------------------- */
async function sendChatMessage() {
  if (!activeConversation) return alert("Select a chat.");

  const text = el("messageInput").value.trim();
  const file = el("chatImageInput").files[0];

  let image_url = null;

  if (file) {
    const path = `${currentUser.id}_${Date.now()}_${file.name}`;
    const upload = await sb.storage
      .from("chat_images")
      .upload(path, file);

    if (upload.error) {
      alert("Image upload failed.");
      return;
    }

    image_url = pubUrl("chat_images", upload.data.path);
  }

  if (activeConversation.type === "dm") {
    await sb.from("messages").insert({
      sender_id: currentUser.id,
      receiver_id: activeConversation.id,
      message: text || null,
      image_url
    });
  }

  if (activeConversation.type === "group") {
    await sb.from("group_messages").insert({
      group_id: activeConversation.id,
      sender_id: currentUser.id,
      message: text || null,
      image_url
    });
  }

  el("messageInput").value = "";
  el("chatImageInput").value = "";
}

/* ----------------------------------------------------------
   REALTIME SUBSCRIPTIONS
---------------------------------------------------------- */
function setupRealtime() {
  dmRealtime = sb
    .channel("dm-messages")
    .on(
      "postgres_changes",
      { event: "INSERT", table: "messages", schema: "public" },
      payload => {
        const msg = payload.new;

        if (!activeConversation || activeConversation.type !== "dm") return;

        const otherId = activeConversation.id;

        const relevant =
          (msg.sender_id === currentUser.id && msg.receiver_id === otherId) ||
          (msg.sender_id === otherId && msg.receiver_id === currentUser.id);

        if (relevant) addMessageBubble(msg);
      }
    )
    .subscribe();

  groupRealtime = sb
    .channel("group-messages")
    .on(
      "postgres_changes",
      { event: "INSERT", table: "group_messages", schema: "public" },
      payload => {
        const msg = payload.new;

        if (!activeConversation || activeConversation.type !== "group") return;
        if (msg.group_id === activeConversation.id) addMessageBubble(msg);
      }
    )
    .subscribe();
}
