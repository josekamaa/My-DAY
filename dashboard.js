/* ==========================================================
   dashboard.js - Regenerated (safe queries, no FK join names)
   Replaces the original file. Works with Supabase JS v2.
========================================================== */

const SUPABASE_URL = "https://ojjvkhafgurgondsopeh.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9qanZraGFmZ3VyZ29uZHNvcGVoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQ5MDkzODYsImV4cCI6MjA4MDQ4NTM4Nn0.hOLxBVqnFhJ2S1jjR0mkKUJ_bWDjZbHJD3wV0Rbbf7A";

const sb = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

/* ==========================================================
   GLOBAL STATE
========================================================== */
let currentUser = null;
let userLikes = new Set();

let activeConversation = null; // { type: "dm"|"group", id, name }
let allUsersCache = []; // profiles except current user
let allProfilesCache = {}; // map id => profile for quick lookup (includes current user)
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
  checkMobileView();
  window.addEventListener('resize', checkMobileView);
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
  el("backBtn").onclick = closeMessenger;

  // Chat
  el("sendBtn").onclick = sendChatMessage;
  el("chatImageInput").onchange = () => {
    // optional: preview
  };

  // Groups - with null check for missing button
  const createGroupBtn = el("createGroupBtn");
  if (createGroupBtn) {
    createGroupBtn.onclick = createGroup;
  }

  el("leaveGroupBtn").onclick = leaveGroup;

  // Camera
  const cap = el("captureBtn");
  if (cap) cap.onclick = capturePhoto;
  const closeCam = el("closeCameraBtn");
  if (closeCam) closeCam.onclick = closeCamera;

  // Search
  const cs = el("contactsSearch");
  if (cs) cs.oninput = filterContacts;

  // Mobile bottom tabs
  if (el("tabChats")) el("tabChats").onclick = () => { openMessenger(); showInboxView(); };
  if (el("tabGroups")) el("tabGroups").onclick = () => { openMessenger(); showGroupsView(); };
  if (el("tabProfile")) el("tabProfile").onclick = () => {
    closeMessenger();
    window.scrollTo({ top: 0, behavior: "smooth" });
    setActiveTab('profile');
  };

  // Inbox tabs
  if (el("inboxTab")) el("inboxTab").onclick = () => showInboxView();
  if (el("peopleTab")) el("peopleTab").onclick = () => showPeopleView();
  if (el("groupsTab")) el("groupsTab").onclick = () => showGroupsView();
}

/* ==========================================================
   MOBILE VIEW HANDLING
========================================================== */
function checkMobileView() {
  const isMobile = window.innerWidth <= 768;
  document.body.classList.toggle('mobile-view', isMobile);
  // nothing else needed here
}

function setActiveTab(tab) {
  ['chats', 'groups', 'profile'].forEach(t => {
    const id = `tab${t.charAt(0).toUpperCase() + t.slice(1)}`;
    const elTab = el(id);
    if (!elTab) return;
    elTab.classList.remove('active');
  });
  const target = el(`tab${tab.charAt(0).toUpperCase() + tab.slice(1)}`);
  if (target) target.classList.add('active');
}

/* ==========================================================
   AUTH USER
========================================================== */
async function loadAuthUser() {
  const resp = await sb.auth.getUser();
  const data = resp?.data;
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

/* Ensure profile row exists for authenticated user */
async function ensureProfileExists() {
  const p = await sb.from("profiles").select("id,username,avatar_url").eq("id", currentUser.id).maybeSingle();
  if (!p.data) {
    const username = currentUser.email ? currentUser.email.split("@")[0] : `user_${currentUser.id.slice(0,6)}`;
    await sb.from("profiles").insert({
      id: currentUser.id,
      username
    });
  }
}

/* Load current user's profile into UI */
async function loadProfileInfo() {
  const { data } = await sb.from("profiles")
    .select("*")
    .eq("id", currentUser.id)
    .single();

  if (!data) return;

  el("profileUsername").textContent = data.username || "User";
  el("profileEmail").textContent = currentUser.email || "";
  el("avatarInitial").textContent = (data.username || "U").charAt(0).toUpperCase();

  if (data.avatar_url) {
    el("profileAvatar").innerHTML =
      `<img src="${data.avatar_url}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;">`;
  }

  // update profile cache
  allProfilesCache[data.id] = data;
}

/* ==========================================================
   AVATAR UPLOAD
========================================================== */
async function uploadAvatar(ev) {
  const file = ev.target.files[0];
  if (!file) return;

  const path = `${currentUser.id}_${Date.now()}_${file.name}`;

  const upload = await sb.storage.from("avatars").upload(path, file);
  if (upload.error) {
    console.error("Avatar upload failed:", upload.error);
    return alert("Failed to upload avatar.");
  }

  const avatarUrl = `${SUPABASE_URL}/storage/v1/object/public/avatars/${upload.data.path}`;

  await sb.from("profiles").update({ avatar_url: avatarUrl }).eq("id", currentUser.id);

  await loadProfileInfo();
  await loadPosts();
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
    if (upload.error) {
      console.error("Media upload failed:", upload.error);
      return alert("Media upload failed.");
    }

    media_url = `${SUPABASE_URL}/storage/v1/object/public/posts/${upload.data.path}`;
    media_type = file.type.startsWith("video") ? "video" : "image";
  }

  await sb.from("posts").insert({
    user_id: currentUser.id,
    user_name: currentUser.email ? currentUser.email.split("@")[0] : "",
    caption,
    media_url,
    media_type
  });

  el("caption").value = "";
  el("mediaFile").value = "";

  el("createPostBox").classList.add("hidden");
  await loadPosts();
}

/* ==========================================================
   LOAD POSTS
========================================================== */
async function loadUserLikes() {
  const { data } = await sb.from("post_likes")
    .select("post_id")
    .eq("user_id", currentUser.id);

  userLikes = new Set((data || []).map(x => x.post_id));
}

async function loadPosts() {
  const postArea = el("posts");
  if (!postArea) return;
  postArea.innerHTML = "Loading...";

  const { data } = await sb.from("posts")
    .select("*")
    .order("created_at", { ascending: false });

  postArea.innerHTML = "";

  for (const p of (data || [])) {
    // attempt to get profile from cache
    const profResp = await sb.from("profiles").select("username,avatar_url").eq("id", p.user_id).maybeSingle();
    const prof = profResp?.data;
    const username = prof?.username ?? p.user_name ?? "User";

    const div = document.createElement("div");
    div.className = "post";

    const avatar = prof?.avatar_url;

    div.innerHTML = `
      <div class="post-header">
        ${avatar ? `<img src="${avatar}" class="avatar48" onerror="this.style.display='none'">` : `<div class="avatar48">${username.charAt(0)}</div>`}
        <div>
          <strong>${escapeHTML(username)}</strong><br>
          <span class="muted small">${new Date(p.created_at).toLocaleString()}</span>
        </div>
      </div>

      <p>${escapeHTML(p.caption || "")}</p>

      ${
        p.media_type === "image"
          ? `<img src="${p.media_url}" class="post-media">`
          : p.media_type === "video"
            ? `<video controls class="post-media"><source src="${p.media_url}"></video>`
            : ""
      }

      <div class="post-actions">
        <button onclick="likePost(${p.id}, ${p.likes || 0})">
          ${userLikes.has(p.id) ? "❤️" : "🤍"} (${p.likes || 0})
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
    await loadComments(p.id);
  }
}

/* LIKE */
async function likePost(id, likes) {
  if (userLikes.has(id)) return;

  await sb.from("post_likes").insert({ user_id: currentUser.id, post_id: id });
  await sb.from("posts").update({ likes: likes + 1 }).eq("id", id);

  await loadUserLikes();
  await loadPosts();
}

/* COMMENTS */
async function addComment(id) {
  const input = el(`comment-input-${id}`);
  if (!input) return;
  const text = input.value.trim();
  if (!text) return;

  await sb.from("comments").insert({
    post_id: id,
    user_id: currentUser.id,
    user_name: currentUser.email ? currentUser.email.split("@")[0] : "",
    comment: text
  });

  input.value = "";
  await loadComments(id);
}

async function loadComments(id) {
  const { data } = await sb.from("comments")
    .select("*")
    .eq("post_id", id)
    .order("created_at", { ascending: true });

  const box = el(`comments-list-${id}`);
  if (!box) return;
  box.innerHTML = "";

  (data || []).forEach(c => {
    const dv = document.createElement("div");
    dv.innerHTML = `<strong>${escapeHTML(c.user_name)}</strong>: ${escapeHTML(c.comment)}`;
    box.appendChild(dv);
  });
}

function toggleComments(id) {
  const elc = el(`comments-${id}`);
  if (elc) elc.classList.toggle("hidden");
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
  if (!video || !canvas) return;

  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  canvas.getContext("2d").drawImage(video, 0, 0);

  canvas.toBlob(blob => {
    const file = new File([blob], `photo_${Date.now()}.png`, { type: "image/png" });
    const dt = new DataTransfer();
    dt.items.add(file);
    el("mediaFile").files = dt.files;

    el("createPostBox").classList.remove("hidden");
    closeCamera();
  });
}

/* ==========================================================
   MESSENGER
   - All queries avoid named FK joins.
   - Profiles are attached client-side using caches.
========================================================== */
function openMessenger() {
  el("messenger").style.display = "flex";
  setActiveTab('chats');
  showInboxView();
  renderInbox(); // refresh
}

function closeMessenger() {
  el("messenger").style.display = "none";
  el("messenger").classList.remove('chat-active');
}

/* ==========================================================
   INBOX FEATURE
   - Query messages where user is sender OR receiver with safe .or()
   - Build conversation list by 'other user' and attach profile info
========================================================== */
async function loadInboxConversations() {
  try {
    // Get all messages where current user is sender or receiver, newest first
    const orFilter = `(sender_id.eq.${currentUser.id},receiver_id.eq.${currentUser.id})`;
    const { data, error } = await sb.from("messages")
      .select("id,sender_id,receiver_id,message,image_url,created_at,read")
      .or(orFilter)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Error loading conversations:", error);
      return [];
    }

    const conversations = {};

    (data || []).forEach(msg => {
      // identify other user in conversation
      const otherId = (msg.sender_id === currentUser.id) ? msg.receiver_id : msg.sender_id;
      if (!otherId) return; // skip malformed rows

      const existing = conversations[otherId];
      const isUnread = (msg.receiver_id === currentUser.id && !msg.read);

      if (!existing) {
        conversations[otherId] = {
          user_id: otherId,
          username: (allProfilesCache[otherId] && allProfilesCache[otherId].username) || 'Unknown',
          avatar_url: (allProfilesCache[otherId] && allProfilesCache[otherId].avatar_url) || null,
          last_message: msg.message || (msg.image_url ? '📷 Image' : ''),
          last_time: msg.created_at,
          unread: isUnread,
          messages_count: 1
        };
      } else {
        // update last message/time if this one is newer (we queried newest first so first seen is newest)
        conversations[otherId].messages_count++;
        if (isUnread) conversations[otherId].unread = true;
      }
    });

    // convert to sorted array
    return Object.values(conversations).sort((a, b) => new Date(b.last_time) - new Date(a.last_time));
  } catch (err) {
    console.error("Failed to load conversations:", err);
    return [];
  }
}

async function renderInbox() {
  const inboxContainer = el("inboxList");
  if (!inboxContainer) return;

  inboxContainer.innerHTML = "<div class='loading'>Loading conversations...</div>";

  const conversations = await loadInboxConversations();

  inboxContainer.innerHTML = "";

  if (!conversations || conversations.length === 0) {
    inboxContainer.innerHTML = `
      <div class="empty-state">
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
        </svg>
        <h4>No messages yet</h4>
        <p class="text-muted">Start a conversation with someone!</p>
      </div>
    `;
    return;
  }

  conversations.forEach(conv => {
    const row = document.createElement("div");
    row.className = "list-row inbox-conversation";
    row.dataset.userId = conv.user_id;

    const lastMsg = conv.last_message.length > 30
      ? conv.last_message.substring(0, 30) + "..."
      : conv.last_message;

    const time = new Date(conv.last_time).toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit'
    });

    row.innerHTML = `
      <div class="avatar48">
        ${conv.avatar_url ? `<img src="${conv.avatar_url}" alt="${escapeHTML(conv.username)}">` : escapeHTML((conv.username || 'U').charAt(0))}
      </div>
      <div class="conversation-info">
        <div class="conversation-header">
          <strong>${escapeHTML(conv.username)}</strong>
          <span class="conversation-time">${time}</span>
        </div>
        <div class="conversation-preview">
          ${escapeHTML(lastMsg)}
          ${conv.unread ? '<span class="unread-badge"></span>' : ''}
        </div>
      </div>
    `;

    row.onclick = async () => {
      const user = {
        id: conv.user_id,
        username: conv.username,
        avatar_url: conv.avatar_url
      };
      await openDM(user);
      if (window.innerWidth <= 768) {
        el("messenger").classList.add('chat-active');
      }
    };

    inboxContainer.appendChild(row);
  });
}

/* ==========================================================
   LOAD USERS + GROUPS
   - caches profiles to attach client-side
========================================================== */
async function loadUsersAndGroups() {
  // load all profiles (exclude current user for people list)
  const { data: profiles } = await sb.from("profiles")
    .select("id,username,avatar_url")
    .order("username", { ascending: true });

  allUsersCache = (profiles || []).filter(p => p.id !== currentUser.id);
  allProfilesCache = {};
  (profiles || []).forEach(p => { allProfilesCache[p.id] = p; });

  // load groups
  const { data: groups } = await sb.from("groups").select("*").order("created_at", { ascending: false });
  allGroupsCache = groups || [];

  renderUsersList();
  renderGroupsList();
  populateAddMemberSelect();
  await renderInbox();
}

/* VIEW MANAGEMENT */
function showInboxView() {
  el("inboxView").classList.remove("hidden");
  el("peopleView").classList.add("hidden");
  el("groupsView").classList.add("hidden");
  el("inboxTab").classList.add("active");
  el("peopleTab").classList.remove("active");
  el("groupsTab").classList.remove("active");
}

function showPeopleView() {
  el("inboxView").classList.add("hidden");
  el("peopleView").classList.remove("hidden");
  el("groupsView").classList.add("hidden");
  el("inboxTab").classList.remove("active");
  el("peopleTab").classList.add("active");
  el("groupsTab").classList.remove("active");
  renderUsersList();
}

function showGroupsView() {
  el("inboxView").classList.add("hidden");
  el("peopleView").classList.add("hidden");
  el("groupsView").classList.remove("hidden");
  el("inboxTab").classList.remove("active");
  el("peopleTab").classList.remove("active");
  el("groupsTab").classList.add("active");
  renderGroupsList();
}

/* USERS LIST */
function renderUsersList() {
  const box = el("usersList");
  if (!box) return;
  box.innerHTML = "";

  allUsersCache.forEach(u => {
    const row = document.createElement("div");
    row.className = "list-row";

    row.innerHTML = `
      <div class="avatar48">
        ${u.avatar_url ? `<img src="${u.avatar_url}">` : escapeHTML(u.username.charAt(0))}
      </div>
      <div class="list-name">${escapeHTML(u.username)}</div>
    `;

    row.onclick = async () => {
      await openDM(u);
      if (window.innerWidth <= 768) {
        el("messenger").classList.add('chat-active');
      }
    };
    box.appendChild(row);
  });
}

/* GROUPS LIST */
function renderGroupsList() {
  const box = el("groupsList");
  if (!box) return;
  box.innerHTML = "";

  allGroupsCache.forEach(g => {
    const row = document.createElement("div");
    row.className = "list-row";

    row.innerHTML = `
      <div class="group-icon">G</div>
      <div class="list-name">${escapeHTML(g.name)}</div>
    `;

    row.onclick = async () => {
      await openGroupChat(g);
      if (window.innerWidth <= 768) {
        el("messenger").classList.add('chat-active');
      }
    };
    box.appendChild(row);
  });
}

/* SEARCH CONTACTS */
function filterContacts() {
  const term = (el("contactsSearch")?.value || "").toLowerCase();

  const users = allUsersCache.filter(u => (u.username || "").toLowerCase().includes(term));
  const groups = allGroupsCache.filter(g => (g.name || "").toLowerCase().includes(term));

  // Update users list in people view
  const usersList = el("usersList");
  if (usersList) {
    usersList.innerHTML = "";
    users.forEach(u => {
      const r = document.createElement("div");
      r.className = "list-row";
      r.innerHTML = `
        <div class="avatar48">${u.avatar_url ? `<img src="${u.avatar_url}">` : escapeHTML(u.username[0])}</div>
        <div>${escapeHTML(u.username)}</div>
      `;
      r.onclick = async () => {
        await openDM(u);
        if (window.innerWidth <= 768) el("messenger").classList.add('chat-active');
      };
      usersList.appendChild(r);
    });
  }

  // Update groups list in groups view
  const groupsList = el("groupsList");
  if (groupsList) {
    groupsList.innerHTML = "";
    groups.forEach(g => {
      const r = document.createElement("div");
      r.className = "list-row";
      r.innerHTML = `<div class="group-icon">G</div><div>${escapeHTML(g.name)}</div>`;
      r.onclick = async () => {
        await openGroupChat(g);
        if (window.innerWidth <= 768) el("messenger").classList.add('chat-active');
      };
      groupsList.appendChild(r);
    });
  }
}

/* ==========================================================
   DIRECT MESSAGE
   - Uses safe .or() that doesn't depend on FK names
   - Filters client-side to show only the 2-user conversation
========================================================== */
async function openDM(user) {
  activeConversation = { type: "dm", id: user.id, name: user.username };

  el("chatHead").textContent = user.username;
  el("leaveGroupBtn").style.display = "none";
  el("groupDetails").classList.add("hidden");

  // Show back button on mobile
  const backToInboxBtn = el("backToInboxBtn");
  if (backToInboxBtn) {
    backToInboxBtn.style.display = window.innerWidth <= 768 ? "inline-flex" : "none";
  }

  // Query messages where either side is current user; then filter to only messages between current and selected user.
  // This avoids complex SQL with named FK joins.
  const orFilter = `(sender_id.eq.${currentUser.id},receiver_id.eq.${currentUser.id})`;
  const { data, error } = await sb.from("messages")
    .select("id,sender_id,receiver_id,message,image_url,created_at,read")
    .or(orFilter)
    .order("created_at", { ascending: true });

  if (error) {
    console.error("Error loading messages:", error);
    return;
  }

  const filteredMessages = (data || []).filter(msg =>
    (msg.sender_id === currentUser.id && msg.receiver_id === user.id) ||
    (msg.sender_id === user.id && msg.receiver_id === currentUser.id)
  );

  renderMessages(filteredMessages);
}

/* ==========================================================
   GROUP CHAT
========================================================== */
async function openGroupChat(g) {
  activeConversation = { type: "group", id: g.id, name: g.name };

  el("chatHead").textContent = g.name;
  el("leaveGroupBtn").style.display = "inline-block";
  el("groupDetails").classList.remove("hidden");

  // Show back button on mobile
  const backToInboxBtn = el("backToInboxBtn");
  if (backToInboxBtn) {
    backToInboxBtn.style.display = window.innerWidth <= 768 ? "inline-flex" : "none";
  }

  await loadGroupMembers(g.id);

  const { data, error } = await sb.from("group_messages")
    .select("id,group_id,sender_id,message,image_url,created_at")
    .eq("group_id", g.id)
    .order("created_at", { ascending: true });

  if (error) {
    console.error("Error loading group messages:", error);
    renderMessages([]);
    return;
  }

  renderMessages(data || []);
}

async function loadGroupMembers(groupId) {
  const { data } = await sb.from("group_members").select("user_id").eq("group_id", groupId);

  const ids = (data || []).map(x => x.user_id);
  if (ids.length === 0) {
    el("groupMembers").innerHTML = "<div class='text-muted small'>No members</div>";
    populateAddMemberSelect();
    return;
  }

  const { data: profiles } = await sb.from("profiles").select("id,username,avatar_url").in("id", ids);

  const box = el("groupMembers");
  if (!box) return;
  box.innerHTML = "";

  (profiles || []).forEach(p => {
    const dv = document.createElement("div");
    dv.className = "member";
    dv.innerHTML = `
      <div class="avatar48">${p.avatar_url ? `<img src="${p.avatar_url}">` : escapeHTML(p.username[0])}</div>
      <div>${escapeHTML(p.username)}</div>
    `;
    box.appendChild(dv);
  });

  // Refresh add member select options
  await populateAddMemberSelect();
}

/* ADD MEMBER SELECT */
async function populateAddMemberSelect() {
  const sel = el("addMemberSelect");
  if (!sel) return;

  // Re-fetch users to ensure latest
  const { data: profiles } = await sb.from("profiles").select("id,username").order("username", { ascending: true });
  const users = (profiles || []).filter(p => p.id !== currentUser.id);

  sel.innerHTML = `<option value="">Add user...</option>`;
  users.forEach(u => {
    const opt = document.createElement("option");
    opt.value = u.id;
    opt.textContent = u.username;
    sel.appendChild(opt);
  });

  el("addMemberBtn").onclick = async () => {
    const id = sel.value;
    if (!id || activeConversation?.type !== "group") return;

    await sb.from("group_members").insert({
      group_id: activeConversation.id,
      user_id: id
    });

    await openGroupChat({ id: activeConversation.id, name: activeConversation.name });
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

  if (error) {
    console.error("Failed to create group:", error);
    return alert("Failed to create group");
  }

  await sb.from("group_members").insert({
    group_id: data.id,
    user_id: currentUser.id
  });

  await loadUsersAndGroups();
  await openGroupChat(data);
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
  await loadUsersAndGroups();
}

/* ==========================================================
   RENDER MESSAGES
========================================================== */
function renderMessages(list) {
  const box = el("messagesList");
  if (!box) return;
  box.innerHTML = "";
  (list || []).forEach(addMessageBubble);
  box.scrollTop = box.scrollHeight;
}

function addMessageBubble(m) {
  const box = el("messagesList");
  if (!box) return;
  const div = document.createElement("div");

  const isMine = m.sender_id === currentUser.id;
  div.className = "msg " + (isMine ? "me" : "other");

  let text = m.message ? `<div class="msg-content">${escapeHTML(m.message)}</div>` : "";
  let img = m.image_url ? `<img class="chat-image" src="${m.image_url}">` : "";

  const time = m.created_at ? new Date(m.created_at).toLocaleTimeString() : "";

  div.innerHTML = `${text}${img}<div class="time">${escapeHTML(time)}</div>`;

  box.appendChild(div);
  box.scrollTop = box.scrollHeight;
}

/* ==========================================================
   SEND MESSAGE
========================================================== */
async function sendChatMessage() {
  if (!activeConversation) return;

  const text = (el("messageInput")?.value || "").trim();
  const file = el("chatImageInput")?.files?.[0];

  let image_url = null;

  if (file) {
    const path = `${currentUser.id}_${Date.now()}_${file.name}`;
    const upload = await sb.storage.from("chat_images").upload(path, file);
    if (upload.error) {
      console.error("Image upload failed:", upload.error);
      return alert("Image upload failed.");
    }
    image_url = `${SUPABASE_URL}/storage/v1/object/public/chat_images/${upload.data.path}`;
  }

  if (activeConversation.type === "dm") {
    await sb.from("messages").insert({
      sender_id: currentUser.id,
      receiver_id: activeConversation.id,
      message: text || null,
      image_url
    });
  } else if (activeConversation.type === "group") {
    await sb.from("group_messages").insert({
      group_id: activeConversation.id,
      sender_id: currentUser.id,
      message: text || null,
      image_url
    });
  }

  if (el("messageInput")) el("messageInput").value = "";
  if (el("chatImageInput")) el("chatImageInput").value = "";

  // refresh view
  if (activeConversation.type === "dm") {
    // re-open to refresh
    await openDM({ id: activeConversation.id, username: activeConversation.name });
  } else {
    await openGroupChat({ id: activeConversation.id, name: activeConversation.name });
  }

  // Refresh inbox to reflect last message
  await renderInbox();
}

/* ==========================================================
   REALTIME
   - Listens for INSERT on messages and group_messages
   - Updates UI if relevant to active conversation
========================================================== */
function setupRealtimeListeners() {
  if (dmRealtime) {
    try { dmRealtime.unsubscribe(); } catch (e) {}
    dmRealtime = null;
  }
  if (groupRealtime) {
    try { groupRealtime.unsubscribe(); } catch (e) {}
    groupRealtime = null;
  }

  // Direct messages channel
  dmRealtime = sb.channel("dm_messages")
    .on(
      "postgres_changes",
      { event: "INSERT", schema: "public", table: "messages" },
      payload => {
        const msg = payload.new;
        // ensure this message touches currentUser
        if (msg.sender_id !== currentUser.id && msg.receiver_id !== currentUser.id) return;

        // If the DM with this 'other' is open, and message belongs to that DM, add bubble
        if (activeConversation?.type === "dm") {
          const other = activeConversation.id;
          const relevant =
            (msg.sender_id === currentUser.id && msg.receiver_id === other) ||
            (msg.sender_id === other && msg.receiver_id === currentUser.id);

          if (relevant) addMessageBubble(msg);
        }

        // Refresh inbox to show latest item
        renderInbox();
      }
    )
    .subscribe();

  // Group messages channel
  groupRealtime = sb.channel("group_messages")
    .on(
      "postgres_changes",
      { event: "INSERT", schema: "public", table: "group_messages" },
      payload => {
        const gm = payload.new;
        if (activeConversation?.type === "group" && gm.group_id === activeConversation.id) {
          addMessageBubble(gm);
        }
      }
    )
    .subscribe();
}

/* ==========================================================
   UTILITIES
========================================================== */
function escapeHTML(str) {
  if (!str && str !== 0) return "";
  return String(str)
    .replace(/&/g,"&amp;")
    .replace(/</g,"&lt;")
    .replace(/>/g,"&gt;")
    .replace(/"/g,"&quot;")
    .replace(/'/g,"&#039;");
}

window.escapeHTML = escapeHTML; // expose for inline handlers like onclick

/* ==========================================================
   Initial rendering hooks (in case HTML triggers them)
========================================================== */

// ensure inbox renders at least once after boot
setTimeout(() => {
  if (document.readyState === "complete") {
    renderInbox().catch(()=>{});
  }
}, 1000);

