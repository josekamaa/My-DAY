/* ================================================================
   dashboard.js – CLEAN REBUILD (NULL SAFE, FK-FREE, NO 400 ERRORS)
   ----------------------------------------------------------------
   - Safe inbox grouping
   - Safe DM load
   - Safe group load
   - Safe realtime listeners
   - Clean UI state management
   - Safe NULL handling
================================================================ */

const SUPABASE_URL = "https://ojjvkhafgurgondsopeh.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9qanZraGFmZ3VyZ29uZHNvcGVoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQ5MDkzODYsImV4cCI6MjA4MDQ4NTM4Nn0.hOLxBVqnFhJ2S1jjR0mkKUJ_bWDjZbHJD3wV0Rbbf7A";

const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

/* ================================================================
   GLOBAL STATE
================================================================ */

let currentUser = null;

let allProfiles = {};     // map id → profile
let peopleList = [];       // all profiles except self
let groupList = [];
let activeChat = null;     // { type: 'dm'|'group', id, name }

let dmChannel = null;
let groupChannel = null;

/* ================================================================
   INITIAL LOAD
================================================================ */

document.addEventListener("DOMContentLoaded", async () => {
  setupUIEvents();
  await loadAuthUser();
  await loadProfiles();
  await loadGroups();
  setupRealtimeListeners();
});

/* ================================================================
   AUTH USER
================================================================ */

async function loadAuthUser() {
  const { data } = await supabaseClient.auth.getUser();

  if (!data?.user) {
    location.href = "login.html";
    return;
  }

  currentUser = data.user;
  await ensureProfileExists();
  await loadOwnProfile();
}

/* Create a profile row if missing */
async function ensureProfileExists() {
  const { data } = await supabaseClient
    .from("profiles")
    .select("id")
    .eq("id", currentUser.id)
    .maybeSingle();

  if (!data) {
    await supabaseClient.from("profiles").insert({
      id: currentUser.id,
      username: currentUser.email.split("@")[0]
    });
  }
}

/* Load current user profile for UI */
async function loadOwnProfile() {
  const { data } = await supabaseClient
    .from("profiles")
    .select("*")
    .eq("id", currentUser.id)
    .single();

  if (!data) return;

  document.getElementById("profileUsername").textContent = data.username;
  document.getElementById("profileEmail").textContent = currentUser.email;

  if (data.avatar_url) {
    document.getElementById("profileAvatar").innerHTML =
      `<img src="${data.avatar_url}" class="avatar-full">`;
  }

  allProfiles[data.id] = data;
}

/* ================================================================
   PROFILES + GROUPS
================================================================ */

async function loadProfiles() {
  const { data } = await supabaseClient.from("profiles")
    .select("id,username,avatar_url")
    .order("username");

  allProfiles = {};
  peopleList = [];

  (data || []).forEach(p => {
    allProfiles[p.id] = p;
    if (p.id !== currentUser.id) peopleList.push(p);
  });

  renderPeopleList();
}

async function loadGroups() {
  const { data } = await supabaseClient.from("groups")
    .select("*")
    .order("created_at", { ascending: false });

  groupList = data || [];
  renderGroupList();
}

/* ================================================================
   UI EVENT SETUP
================================================================ */

function setupUIEvents() {
  document.getElementById("openMessengerBtn").onclick = openMessenger;
  document.getElementById("showInboxBtn").onclick = openMessenger;

  document.getElementById("backBtn").onclick = closeMessenger;

  document.getElementById("sendBtn").onclick = sendMessage;

  document.getElementById("avatarInput").onchange = uploadAvatar;

  document.getElementById("chatImageInput").onchange = () => {};
}

/* ================================================================
   MESSENGER UI
================================================================ */

function openMessenger() {
  document.getElementById("messenger").style.display = "flex";
  renderInbox();
}

function closeMessenger() {
  document.getElementById("messenger").style.display = "none";
}

/* ================================================================
   INBOX (NULL SAFE, FK FREE)
================================================================ */

async function loadInbox() {
  const filter = `(sender_id.eq.${currentUser.id},receiver_id.eq.${currentUser.id})`;

  const { data, error } = await supabaseClient
    .from("messages")
    .select("id,sender_id,receiver_id,message,image_url,created_at,read")
    .or(filter)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Inbox load error:", error);
    return [];
  }

  const inbox = {};

  (data || []).forEach(msg => {
    if (!msg.sender_id || !msg.receiver_id) return;

    const other =
      msg.sender_id === currentUser.id ? msg.receiver_id : msg.sender_id;

    if (!other) return;

    if (!inbox[other]) {
      inbox[other] = {
        user_id: other,
        username: allProfiles[other]?.username || "Unknown",
        avatar_url: allProfiles[other]?.avatar_url || null,
        last_message: msg.message || (msg.image_url ? "📷 Image" : ""),
        last_time: msg.created_at,
        unread: msg.receiver_id === currentUser.id && !msg.read
      };
    } else {
      if (msg.receiver_id === currentUser.id && !msg.read) {
        inbox[other].unread = true;
      }
    }
  });

  return Object.values(inbox).sort(
    (a, b) => new Date(b.last_time) - new Date(a.last_time)
  );
}

async function renderInbox() {
  const list = document.getElementById("inboxList");
  list.innerHTML = "Loading…";

  const inbox = await loadInbox();
  list.innerHTML = "";

  if (!inbox.length) {
    list.innerHTML = `<div class="empty">No messages yet</div>`;
    return;
  }

  inbox.forEach(conv => {
    const row = document.createElement("div");
    row.className = "list-row";

    row.innerHTML = `
      <div class="avatar48">
        ${conv.avatar_url ?
        `<img src="${conv.avatar_url}">`
        : conv.username.charAt(0)}
      </div>
      <div class="list-name">
        <strong>${escape(conv.username)}</strong><br>
        <span class="muted small">${escape(conv.last_message)}</span>
      </div>
      ${conv.unread ? `<span class="unread-dot"></span>` : ""}
    `;

    row.onclick = () =>
      openDM({ id: conv.user_id, username: conv.username, avatar_url: conv.avatar_url });

    list.appendChild(row);
  });
}

/* ================================================================
   DIRECT MESSAGE SCREEN
================================================================ */

async function openDM(user) {
  activeChat = { type: "dm", id: user.id, name: user.username };

  document.getElementById("chatHead").textContent = user.username;
  document.getElementById("groupDetails").classList.add("hidden");
  document.getElementById("leaveGroupBtn").style.display = "none";

  const filter = `(sender_id.eq.${currentUser.id},receiver_id.eq.${currentUser.id})`;

  let { data } = await supabaseClient
    .from("messages")
    .select("id,sender_id,receiver_id,message,image_url,created_at")
    .or(filter)
    .order("created_at");

  data = data.filter(
    m =>
      (m.sender_id === currentUser.id && m.receiver_id === user.id) ||
      (m.sender_id === user.id && m.receiver_id === currentUser.id)
  );

  renderMessages(data);
}

/* ================================================================
   GROUP CHAT
================================================================ */

async function openGroupChat(group) {
  activeChat = { type: "group", id: group.id, name: group.name };

  document.getElementById("chatHead").textContent = group.name;
  document.getElementById("groupDetails").classList.remove("hidden");
  document.getElementById("leaveGroupBtn").style.display = "inline-block";

  const { data } = await supabaseClient
    .from("group_messages")
    .select("id,group_id,sender_id,message,image_url,created_at")
    .eq("group_id", group.id)
    .order("created_at");

  renderMessages(data);
}

/* ================================================================
   RENDER MESSAGES
================================================================ */

function renderMessages(list) {
  const box = document.getElementById("messagesList");
  box.innerHTML = "";

  (list || []).forEach(addMessageBubble);

  box.scrollTop = box.scrollHeight;
}

function addMessageBubble(msg) {
  const box = document.getElementById("messagesList");

  const me = msg.sender_id === currentUser.id;

  const div = document.createElement("div");
  div.className = "msg " + (me ? "me" : "other");

  const time = new Date(msg.created_at).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit"
  });

  div.innerHTML = `
    ${msg.message ? `<div class="msg-text">${escape(msg.message)}</div>` : ""}
    ${msg.image_url ? `<img class="msg-img" src="${msg.image_url}">` : ""}
    <div class="msg-time">${time}</div>
  `;

  box.appendChild(div);
}

/* ================================================================
   SEND MESSAGE
================================================================ */

async function sendMessage() {
  if (!activeChat) return;

  const text = document.getElementById("messageInput").value.trim();
  const file = document.getElementById("chatImageInput").files[0];

  let image_url = null;

  if (file) {
    const path = `${currentUser.id}_${Date.now()}_${file.name}`;
    const upload = await supabaseClient
      .storage
      .from("chat_images")
      .upload(path, file);

    image_url = `${SUPABASE_URL}/storage/v1/object/public/chat_images/${upload.data.path}`;
  }

  if (activeChat.type === "dm") {
    await supabaseClient.from("messages").insert({
      sender_id: currentUser.id,
      receiver_id: activeChat.id,
      message: text || null,
      image_url
    });
  }

  if (activeChat.type === "group") {
    await supabaseClient.from("group_messages").insert({
      group_id: activeChat.id,
      sender_id: currentUser.id,
      message: text || null,
      image_url
    });
  }

  document.getElementById("messageInput").value = "";
  document.getElementById("chatImageInput").value = "";

  if (activeChat.type === "dm") {
    await openDM({ id: activeChat.id, username: activeChat.name });
  } else {
    await openGroupChat({ id: activeChat.id, name: activeChat.name });
  }

  renderInbox();
}

/* ================================================================
   AVATAR UPLOAD
================================================================ */

async function uploadAvatar(e) {
  const file = e.target.files[0];
  if (!file) return;

  const path = `${currentUser.id}_${Date.now()}_${file.name}`;

  const upload = await supabaseClient.storage
    .from("avatars")
    .upload(path, file);

  const url = `${SUPABASE_URL}/storage/v1/object/public/avatars/${upload.data.path}`;

  await supabaseClient.from("profiles")
    .update({ avatar_url: url })
    .eq("id", currentUser.id);

  await loadOwnProfile();
}

/* ================================================================
   REALTIME LISTENERS
================================================================ */

function setupRealtimeListeners() {
  if (dmChannel) dmChannel.unsubscribe();
  if (groupChannel) groupChannel.unsubscribe();

  dmChannel = supabaseClient.channel("dm")
    .on("postgres_changes", {
      event: "INSERT",
      schema: "public",
      table: "messages"
    }, payload => {
      const msg = payload.new;

      if (!activeChat) return;

      const relevant =
        activeChat.type === "dm" &&
        (msg.sender_id === activeChat.id || msg.receiver_id === activeChat.id);

      if (relevant) addMessageBubble(msg);
      renderInbox();
    })
    .subscribe();

  groupChannel = supabaseClient.channel("group")
    .on("postgres_changes", {
      event: "INSERT",
      schema: "public",
      table: "group_messages"
    }, payload => {
      const msg = payload.new;

      if (activeChat?.type === "group" && msg.group_id === activeChat.id) {
        addMessageBubble(msg);
      }
    })
    .subscribe();
}

/* ================================================================
   RENDER PEOPLE + GROUPS
================================================================ */

function renderPeopleList() {
  const box = document.getElementById("usersList");
  box.innerHTML = "";

  peopleList.forEach(p => {
    const div = document.createElement("div");
    div.className = "list-row";

    div.innerHTML = `
      <div class="avatar48">
        ${p.avatar_url ? `<img src="${p.avatar_url}">` : p.username.charAt(0)}
      </div>
      <div class="list-name">${escape(p.username)}</div>
    `;

    div.onclick = () => openDM(p);

    box.appendChild(div);
  });
}

function renderGroupList() {
  const box = document.getElementById("groupsList");
  box.innerHTML = "";

  groupList.forEach(g => {
    const div = document.createElement("div");
    div.className = "list-row";

    div.innerHTML = `
      <div class="group-icon">G</div>
      <div class="list-name">${escape(g.name)}</div>
    `;

    div.onclick = () => openGroupChat(g);

    box.appendChild(div);
  });
}

/* ================================================================
   UTIL
================================================================ */

function escape(str) {
  return String(str || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
