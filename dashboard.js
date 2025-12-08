/* ==========================================================
   SUPABASE INITIALIZATION
========================================================== */
const SUPABASE_URL = "https://ojjvkhafgurgondsopeh.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9qanZraGFmZ3VyZ29uZHNvcGVoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQ5MDkzODYsImV4cCI6MjA4MDQ4NTM4Nn0.hOLxBVqnFhJ2S1jjR0mkKUJ_bWDjZbHJD3wV0Rbbf7A";

const sb = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

/* ==========================================================
   GLOBAL STATE
========================================================== */
let currentUser = null;
let userLikes = new Set();

let activeConversation = null;
let allUsersCache = [];
let allGroupsCache = [];
let dmRealtime = null;
let groupRealtime = null;

let cameraStream = null;

const el = id => document.getElementById(id);
const $ = q => document.querySelector(q);

/* ==========================================================
   BOOT
========================================================== */
document.addEventListener("DOMContentLoaded", async () => {
  wireUI();
  await loadAuthUser();
  await loadUsersAndGroups();
  setupRealtimeListeners();
});

/* ==========================================================
   UI EVENTS
========================================================== */
function wireUI() {
  // FEED
  el("showCreatePostBtn").onclick = () => el("createPostBox").classList.remove("hidden");
  el("cancelPostBtn").onclick = () => el("createPostBox").classList.add("hidden");
  el("postBtn").onclick = createPost;

  // AVATAR
  el("avatarInput").onchange = uploadAvatar;

  // MESSENGER
  el("openMessengerBtn").onclick = openMessenger;
  el("showInboxBtn").onclick = openMessenger;

  // Chat
  el("sendBtn").onclick = sendChatMessage;
  el("chatImageInput").onchange = sendChatMessage;

  // Groups
  el("createGroupBtn").onclick = createGroup;
  el("leaveGroupBtn").onclick = leaveGroup;

  // Camera
  el("captureBtn").onclick = capturePhoto;
  el("closeCameraBtn").onclick = closeCamera;

  // Search
  el("contactsSearch").oninput = filterContacts;

  // Mobile bottom tabs
  el("tabChats").onclick = () => { openMessenger(); scrollToUsers(); };
  el("tabGroups").onclick = () => { openMessenger(); scrollToGroups(); };
  el("tabProfile").onclick = () => window.scrollTo({ top: 0, behavior: "smooth" });
}

/* ==========================================================
   AUTH USER
========================================================== */
async function loadAuthUser() {
  const { data } = await sb.auth.getUser();
  if (!data?.user) {
    window.location = "login.html";
    return;
  }

  currentUser = data.user;

  await ensureProfileExists();
  await loadProfileInfo();
  await loadUserLikes();
  await loadPosts();
}

async function ensureProfileExists() {
  const p = await sb.from("profiles").select("id").eq("id", currentUser.id).maybeSingle();
  if (!p.data) {
    await sb.from("profiles").insert({
      id: currentUser.id,
      username: currentUser.email.split("@")[0],
    });
  }
}

async function loadProfileInfo() {
  const { data } = await sb.from("profiles")
    .select("*")
    .eq("id", currentUser.id)
    .single();

  el("profileUsername").textContent = data.username;
  el("profileEmail").textContent = currentUser.email;

  el("avatarInitial").textContent = data.username.charAt(0).toUpperCase();

  if (data.avatar_url) {
    el("profileAvatar").innerHTML =
      `<img src="${data.avatar_url}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;">`;
  }
}

/* ==========================================================
   AVATAR UPLOAD
========================================================== */
async function uploadAvatar(ev) {
  const file = ev.target.files[0];
  if (!file) return;

  const path = `${currentUser.id}_${Date.now()}_${file.name}`;

  const upload = await sb.storage.from("avatars").upload(path, file);
  if (upload.error) return alert("Failed to upload avatar.");

  const avatarUrl = `${SUPABASE_URL}/storage/v1/object/public/avatars/${upload.data.path}`;

  await sb.from("profiles").update({ avatar_url: avatarUrl }).eq("id", currentUser.id);

  loadProfileInfo();
  loadPosts();
}

/* ==========================================================
   CREATE POST
========================================================== */
async function createPost() {
  const caption = el("caption").value.trim();
  const file = el("mediaFile").files[0];

  let media_url = null;
  let media_type = null;

  if (file) {
    const path = `${currentUser.id}_${Date.now()}_${file.name}`;
    const upload = await sb.storage.from("posts").upload(path, file);
    if (upload.error) return alert("Media upload failed.");

    media_url = `${SUPABASE_URL}/storage/v1/object/public/posts/${upload.data.path}`;
    media_type = file.type.startsWith("video") ? "video" : "image";
  }

  await sb.from("posts").insert({
    user_id: currentUser.id,
    user_name: currentUser.email.split("@")[0],
    caption,
    media_url,
    media_type
  });

  el("caption").value = "";
  el("mediaFile").value = "";

  el("createPostBox").classList.add("hidden");
  loadPosts();
}

/* ==========================================================
   LOAD POSTS
========================================================== */
async function loadUserLikes() {
  const { data } = await sb.from("post_likes")
    .select("post_id")
    .eq("user_id", currentUser.id);

  userLikes = new Set(data?.map(x => x.post_id) || []);
}

async function loadPosts() {
  const postArea = el("posts");
  postArea.innerHTML = "Loading...";

  const { data } = await sb.from("posts")
    .select("*")
    .order("created_at", { ascending: false });

  postArea.innerHTML = "";

  for (const p of data) {
    const prof = await sb.from("profiles")
      .select("username,avatar_url")
      .eq("id", p.user_id)
      .maybeSingle();

    const username = prof.data?.username ?? p.user_name;

    const div = document.createElement("div");
    div.className = "post";

    const avatar = prof.data?.avatar_url;

    div.innerHTML = `
      <div class="post-header">
        <img src="${avatar || ""}" class="avatar48" onerror="this.style.display='none'">
        <div>
          <strong>${username}</strong><br>
          <span class="muted small">${new Date(p.created_at).toLocaleString()}</span>
        </div>
      </div>

      <p>${p.caption}</p>

      ${
        p.media_type === "image"
          ? `<img src="${p.media_url}" class="post-media">`
          : p.media_type === "video"
            ? `<video controls class="post-media"><source src="${p.media_url}"></video>`
            : ""
      }

      <div class="post-actions">
        <button onclick="likePost(${p.id}, ${p.likes})">
          ${userLikes.has(p.id) ? "❤️" : "🤍"} (${p.likes})
        </button>
        <button onclick="toggleComments(${p.id})">💬 Comments</button>
      </div>

      <div id="comments-${p.id}" class="comments hidden">
        <div id="comments-list-${p.id}"></div>
        <div class="comment-input">
          <input id="comment-input-${p.id}" placeholder="Comment...">
          <button onclick="addComment(${p.id})">Send</button>
        </div>
      </div>
    `;

    postArea.appendChild(div);
    loadComments(p.id);
  }
}

/* LIKE */
async function likePost(id, likes) {
  if (userLikes.has(id)) return;

  await sb.from("post_likes").insert({ user_id: currentUser.id, post_id: id });
  await sb.from("posts").update({ likes: likes + 1 }).eq("id", id);

  loadUserLikes();
  loadPosts();
}

/* COMMENTS */
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

  data.forEach(c => {
    const dv = document.createElement("div");
    dv.innerHTML = `<strong>${c.user_name}</strong>: ${c.comment}`;
    box.appendChild(dv);
  });
}

function toggleComments(id) {
  el(`comments-${id}`).classList.toggle("hidden");
}

/* ==========================================================
   CAMERA
========================================================== */
async function openCamera() {
  el("cameraPreview").style.display = "flex";
  cameraStream = await navigator.mediaDevices.getUserMedia({ video: true });
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

    el("createPostBox").classList.remove("hidden");
  });
}

/* ==========================================================
   MESSENGER
========================================================== */
function openMessenger() {
  el("messenger").style.display = "flex";
}

function closeMessenger() {
  el("messenger").style.display = "none";
}

/* ==========================================================
   LOAD USERS + GROUPS
========================================================== */
async function loadUsersAndGroups() {
  const { data: users } = await sb.from("profiles")
    .select("id,username,avatar_url")
    .neq("id", currentUser.id);

  allUsersCache = users || [];

  const { data: groups } = await sb.from("groups")
    .select("*")
    .order("created_at", { ascending: false });

  allGroupsCache = groups || [];

  renderUsersList();
  renderGroupsList();
  populateAddMemberSelect();
}

/* USERS LIST */
function renderUsersList() {
  const box = el("usersList");
  box.innerHTML = "";

  allUsersCache.forEach(u => {
    const row = document.createElement("div");
    row.className = "list-row";

    row.innerHTML = `
      <div class="avatar48">
        ${u.avatar_url ? `<img src="${u.avatar_url}">` : u.username.charAt(0)}
      </div>
      <div class="list-name">${u.username}</div>
    `;

    row.onclick = () => openDM(u);
    box.appendChild(row);
  });
}

/* GROUPS LIST */
function renderGroupsList() {
  const box = el("groupsList");
  box.innerHTML = "";

  allGroupsCache.forEach(g => {
    const row = document.createElement("div");
    row.className = "list-row";

    row.innerHTML = `
      <div class="group-icon">G</div>
      <div class="list-name">${g.name}</div>
    `;

    row.onclick = () => openGroupChat(g);
    box.appendChild(row);
  });
}

/* SEARCH CONTACTS */
function filterContacts() {
  const term = el("contactsSearch").value.toLowerCase();

  const users = allUsersCache.filter(u => u.username.toLowerCase().includes(term));
  const groups = allGroupsCache.filter(g => g.name.toLowerCase().includes(term));

  el("usersList").innerHTML = "";
  users.forEach(u => {
    const r = document.createElement("div");
    r.className = "list-row";
    r.innerHTML = `
      <div class="avatar48">${u.avatar_url ? `<img src="${u.avatar_url}">` : u.username[0]}</div>
      <div>${u.username}</div>
    `;
    r.onclick = () => openDM(u);
    el("usersList").appendChild(r);
  });

  el("groupsList").innerHTML = "";
  groups.forEach(g => {
    const r = document.createElement("div");
    r.className = "list-row";
    r.innerHTML = `<div class="group-icon">G</div><div>${g.name}</div>`;
    r.onclick = () => openGroupChat(g);
    el("groupsList").appendChild(r);
  });
}

/* SCROLL HELPERS */
function scrollToUsers() { el("usersList").scrollIntoView({ behavior: "smooth" }); }
function scrollToGroups() { el("groupsList").scrollIntoView({ behavior: "smooth" }); }

/* ==========================================================
   DIRECT MESSAGE
========================================================== */
async function openDM(user) {
  activeConversation = { type: "dm", id: user.id, name: user.username };

  el("chatHead").textContent = user.username;
  el("leaveGroupBtn").style.display = "none";
  el("groupDetails").classList.add("hidden");

  const { data } = await sb.from("messages")
    .select("*")
    .or(`
      and(sender_id.eq.${currentUser.id}, receiver_id.eq.${user.id}),
      and(sender_id.eq.${user.id}, receiver_id.eq.${currentUser.id})
    `)
    .order("created_at");

  renderMessages(data || []);
}

/* ==========================================================
   GROUP CHAT
========================================================== */
async function openGroupChat(g) {
  activeConversation = { type: "group", id: g.id, name: g.name };

  el("chatHead").textContent = g.name;
  el("leaveGroupBtn").style.display = "inline-block";
  el("groupDetails").classList.remove("hidden");

  await loadGroupMembers(g.id);

  const { data } = await sb.from("group_messages")
    .select("*")
    .eq("group_id", g.id)
    .order("created_at");

  renderMessages(data || []);
}

async function loadGroupMembers(groupId) {
  const { data } = await sb.from("group_members").select("user_id").eq("group_id", groupId);

  const ids = data?.map(x => x.user_id) || [];

  const profiles = ids.length
    ? (await sb.from("profiles").select("id,username,avatar_url").in("id", ids)).data
    : [];

  const box = el("groupMembers");
  box.innerHTML = "";

  profiles.forEach(p => {
    const dv = document.createElement("div");
    dv.className = "member";
    dv.innerHTML = `
      <div class="avatar48">${p.avatar_url ? `<img src="${p.avatar_url}">` : p.username[0]}</div>
      <div>${p.username}</div>
    `;
    box.appendChild(dv);
  });

  populateAddMemberSelect();
}

/* ADD MEMBER SELECT */
function populateAddMemberSelect() {
  const sel = el("addMemberSelect");
  if (!sel) return;

  sel.innerHTML = `<option value="">Add user...</option>`;

  allUsersCache.forEach(u => {
    const opt = document.createElement("option");
    opt.value = u.id;
    opt.textContent = u.username;
    sel.appendChild(opt);
  });

  el("addMemberBtn").onclick = async () => {
    const id = sel.value;
    if (!id || activeConversation?.type !== "group")
      return;

    await sb.from("group_members").insert({
      group_id: activeConversation.id,
      user_id: id
    });

    openGroupChat({ id: activeConversation.id, name: activeConversation.name });
  };
}

/* CREATE GROUP */
async function createGroup() {
  const name = prompt("Group name:");
  if (!name) return;

  const { data, error } = await sb.from("groups")
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

  activeConversation = null;
  el("messagesList").innerHTML = "";
  loadUsersAndGroups();
}

/* ==========================================================
   RENDER MESSAGES
========================================================== */
function renderMessages(list) {
  const box = el("messagesList");
  box.innerHTML = "";
  list.forEach(addMessageBubble);
  box.scrollTop = box.scrollHeight;
}

function addMessageBubble(m) {
  const box = el("messagesList");
  const div = document.createElement("div");

  const isMine = m.sender_id === currentUser.id;
  div.className = "msg " + (isMine ? "me" : "");

  let text = m.message ? `<div>${escapeHTML(m.message)}</div>` : "";
  let img = m.image_url ? `<img class="chat-image" src="${m.image_url}">` : "";

  div.innerHTML = `${text}${img}<div class="time">${new Date(m.created_at).toLocaleTimeString()}</div>`;

  box.appendChild(div);
  box.scrollTop = box.scrollHeight;
}

function escapeHTML(str) {
  return str ? str.replace(/&/g,"&amp;").replace(/</g,"&lt;") : "";
}

/* ==========================================================
   SEND MESSAGE
========================================================== */
async function sendChatMessage() {
  if (!activeConversation) return;

  const text = el("messageInput").value.trim();
  const file = el("chatImageInput").files[0];

  let image_url = null;

  if (file) {
    const path = `${currentUser.id}_${Date.now()}_${file.name}`;
    const upload = await sb.storage.from("chat_images").upload(path, file);
    if (upload.error) return alert("Image upload failed.");

    image_url = `${SUPABASE_URL}/storage/v1/object/public/chat_images/${upload.data.path}`;
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

/* ==========================================================
   REALTIME
========================================================== */
function setupRealtimeListeners() {
  // Direct messages
  dmRealtime = sb.channel("dm_messages")
    .on(
      "postgres_changes",
      { event: "INSERT", schema: "public", table: "messages" },
      payload => {
        const msg = payload.new;

        if (!activeConversation || activeConversation.type !== "dm") return;

        const other = activeConversation.id;

        const relevant =
          (msg.sender_id === currentUser.id && msg.receiver_id === other) ||
          (msg.sender_id === other && msg.receiver_id === currentUser.id);

        if (relevant) addMessageBubble(msg);
      }
    )
    .subscribe();

  // Group messages
  groupRealtime = sb.channel("group_messages")
    .on(
      "postgres_changes",
      { event: "INSERT", schema: "public", table: "group_messages" },
      payload => {
        if (activeConversation?.type !== "group") return;
        if (payload.new.group_id === activeConversation.id)
          addMessageBubble(payload.new);
      }
    )
    .subscribe();
}
