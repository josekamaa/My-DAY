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
  await loadPosts();
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
   POSTS
================================================================ */

async function loadPosts() {
  const { data } = await supabaseClient
    .from("posts")
    .select("*, profiles(username, avatar_url)")
    .order("created_at", { ascending: false });

  const container = document.getElementById("posts");
  container.innerHTML = "";

  if (!data || data.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
          <path d="M3 9h18"/>
          <path d="M9 21V9"/>
        </svg>
        <h4>No posts yet</h4>
        <p class="text-muted">Be the first to create a post!</p>
      </div>
    `;
    return;
  }

  data.forEach(post => {
    const postDiv = document.createElement("div");
    postDiv.className = "post";
    
    postDiv.innerHTML = `
      <div class="post-header">
        <div class="avatar48">
          ${post.profiles?.avatar_url 
            ? `<img src="${post.profiles.avatar_url}" alt="${post.profiles.username}">`
            : (post.profiles?.username?.charAt(0) || "U")}
        </div>
        <div>
          <strong>${escape(post.profiles?.username || "Unknown")}</strong>
          <div class="text-muted small">${new Date(post.created_at).toLocaleString()}</div>
        </div>
      </div>
      <p style="margin-top: 8px;">${escape(post.caption || "")}</p>
      ${post.media_url 
        ? `<img src="${post.media_url}" class="post-media" alt="Post media">` 
        : ""}
    `;

    container.appendChild(postDiv);
  });
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

  // Post creation buttons
  document.getElementById("showCreatePostBtn").onclick = () => {
    document.getElementById("createPostBox").classList.remove("hidden");
    document.getElementById("showCreatePostBtn").classList.add("active");
    document.getElementById("showFeedBtn").classList.remove("active");
  };

  document.getElementById("showFeedBtn").onclick = () => {
    document.getElementById("createPostBox").classList.add("hidden");
    document.getElementById("showFeedBtn").classList.add("active");
    document.getElementById("showCreatePostBtn").classList.remove("active");
    loadPosts();
  };

  document.getElementById("postBtn").onclick = createPost;
  document.getElementById("cancelPostBtn").onclick = () => {
    document.getElementById("createPostBox").classList.add("hidden");
    document.getElementById("caption").value = "";
    document.getElementById("mediaFile").value = "";
    document.getElementById("showFeedBtn").classList.add("active");
    document.getElementById("showCreatePostBtn").classList.remove("active");
  };

  // Inbox tabs
  document.getElementById("inboxTab").onclick = () => switchInboxTab("inbox");
  document.getElementById("peopleTab").onclick = () => switchInboxTab("people");
  document.getElementById("groupsTab").onclick = () => switchInboxTab("groups");
}

/* ================================================================
   MESSENGER UI
================================================================ */

function openMessenger() {
  document.getElementById("messenger").style.display = "flex";
  switchInboxTab("inbox");
  renderInbox();
}

function closeMessenger() {
  document.getElementById("messenger").style.display = "none";
}

function switchInboxTab(tab) {
  // Reset all tabs
  document.getElementById("inboxTab").classList.remove("active");
  document.getElementById("peopleTab").classList.remove("active");
  document.getElementById("groupsTab").classList.remove("active");
  
  // Hide all views
  document.getElementById("inboxView").classList.add("hidden");
  document.getElementById("peopleView").classList.add("hidden");
  document.getElementById("groupsView").classList.add("hidden");
  
  // Activate selected tab
  document.getElementById(`${tab}Tab`).classList.add("active");
  document.getElementById(`${tab}View`).classList.remove("hidden");
  
  // Load content if needed
  if (tab === "inbox") renderInbox();
  if (tab === "people") renderPeopleList();
  if (tab === "groups") renderGroupList();
}

/* ================================================================
   INBOX (FIXED SYNTAX - NO 400 ERRORS)
================================================================ */

async function loadInbox() {
  // CORRECT SYNTAX: No parentheses, just comma-separated conditions
  const { data, error } = await supabaseClient
    .from("messages")
    .select("id,sender_id,receiver_id,message,image_url,created_at,read")
    .or(`sender_id.eq.${currentUser.id},receiver_id.eq.${currentUser.id}`)
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
      const existingTime = new Date(inbox[other].last_time);
      const newTime = new Date(msg.created_at);
      if (msg.receiver_id === currentUser.id && !msg.read && newTime > existingTime) {
        inbox[other].unread = true;
        inbox[other].last_message = msg.message || (msg.image_url ? "📷 Image" : "");
        inbox[other].last_time = msg.created_at;
      }
    }
  });

  return Object.values(inbox).sort(
    (a, b) => new Date(b.last_time) - new Date(a.last_time)
  );
}

async function renderInbox() {
  const list = document.getElementById("inboxList");
  list.innerHTML = `<div class="loading">Loading…</div>`;

  const inbox = await loadInbox();
  list.innerHTML = "";

  if (!inbox.length) {
    list.innerHTML = `
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

  inbox.forEach(conv => {
    const row = document.createElement("div");
    row.className = "list-row";

    const avatarContent = conv.avatar_url 
      ? `<img src="${conv.avatar_url}" alt="${conv.username}">`
      : conv.username.charAt(0);

    row.innerHTML = `
      <div class="avatar48">
        ${avatarContent}
      </div>
      <div class="conversation-info">
        <div class="conversation-header">
          <strong>${escape(conv.username)}</strong>
          <span class="conversation-time">${formatTime(conv.last_time)}</span>
        </div>
        <div class="conversation-preview">
          <span>${escape(conv.last_message)}</span>
          ${conv.unread ? '<span class="unread-badge"></span>' : ''}
        </div>
      </div>
    `;

    row.onclick = () => openDM({ 
      id: conv.user_id, 
      username: conv.username, 
      avatar_url: conv.avatar_url 
    });

    list.appendChild(row);
  });
}

/* ================================================================
   DIRECT MESSAGE SCREEN (FIXED SYNTAX)
================================================================ */

async function openDM(user) {
  activeChat = { type: "dm", id: user.id, name: user.username };

  document.getElementById("chatHead").textContent = user.username;
  document.getElementById("groupDetails").classList.add("hidden");
  document.getElementById("leaveGroupBtn").style.display = "none";
  document.getElementById("backToInboxBtn").classList.remove("hidden");
  
  // Update UI for mobile
  document.getElementById("messenger").classList.add("chat-active");

  // CORRECT SYNTAX: Use .or() with proper format
  let { data } = await supabaseClient
    .from("messages")
    .select("id,sender_id,receiver_id,message,image_url,created_at")
    .or(`sender_id.eq.${currentUser.id},receiver_id.eq.${user.id}`)
    .order("created_at");

  // Filter for conversation between current user and selected user
  data = (data || []).filter(
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
  document.getElementById("groupTitle").textContent = group.name;
  document.getElementById("groupDetails").classList.remove("hidden");
  document.getElementById("leaveGroupBtn").style.display = "inline-block";
  document.getElementById("backToInboxBtn").classList.remove("hidden");
  
  // Update UI for mobile
  document.getElementById("messenger").classList.add("chat-active");

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

  if (!list || list.length === 0) {
    box.innerHTML = `
      <div class="empty-state">
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
        </svg>
        <h4>No messages yet</h4>
        <p class="text-muted">Send the first message!</p>
      </div>
    `;
    return;
  }

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

  let content = "";
  if (msg.message) {
    content += `<div class="msg-content">${escape(msg.message)}</div>`;
  }
  if (msg.image_url) {
    content += `<img src="${msg.image_url}" class="chat-image" alt="Chat image">`;
  }
  content += `<div class="time">${time}</div>`;

  div.innerHTML = content;
  box.appendChild(div);
}

/* ================================================================
   SEND MESSAGE
================================================================ */

async function sendMessage() {
  if (!activeChat) return;

  const text = document.getElementById("messageInput").value.trim();
  const file = document.getElementById("chatImageInput").files[0];

  if (!text && !file) return;

  let image_url = null;

  if (file) {
    const path = `${currentUser.id}_${Date.now()}_${file.name}`;
    const { data, error } = await supabaseClient
      .storage
      .from("chat_images")
      .upload(path, file);

    if (error) {
      console.error("Image upload error:", error);
      return;
    }

    image_url = `${SUPABASE_URL}/storage/v1/object/public/chat_images/${data.path}`;
  }

  if (activeChat.type === "dm") {
    await supabaseClient.from("messages").insert({
      sender_id: currentUser.id,
      receiver_id: activeChat.id,
      message: text || null,
      image_url,
      read: false
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

  // Refresh current chat
  if (activeChat.type === "dm") {
    await openDM({ id: activeChat.id, username: activeChat.name });
  } else {
    await openGroupChat({ id: activeChat.id, name: activeChat.name });
  }

  renderInbox();
}

/* ================================================================
   CREATE POST
================================================================ */

async function createPost() {
  const caption = document.getElementById("caption").value.trim();
  const mediaFile = document.getElementById("mediaFile").files[0];

  if (!caption && !mediaFile) {
    alert("Please add a caption or media");
    return;
  }

  let media_url = null;

  if (mediaFile) {
    const path = `${currentUser.id}_${Date.now()}_${mediaFile.name}`;
    const { data, error } = await supabaseClient
      .storage
      .from("post_media")
      .upload(path, mediaFile);

    if (error) {
      console.error("Media upload error:", error);
      return;
    }

    media_url = `${SUPABASE_URL}/storage/v1/object/public/post_media/${data.path}`;
  }

  const { error } = await supabaseClient.from("posts").insert({
    user_id: currentUser.id,
    caption: caption || null,
    media_url
  });

  if (error) {
    console.error("Post creation error:", error);
    return;
  }

  // Reset form and refresh feed
  document.getElementById("caption").value = "";
  document.getElementById("mediaFile").value = "";
  document.getElementById("createPostBox").classList.add("hidden");
  document.getElementById("showFeedBtn").classList.add("active");
  document.getElementById("showCreatePostBtn").classList.remove("active");

  await loadPosts();
}

/* ================================================================
   AVATAR UPLOAD
================================================================ */

async function uploadAvatar(e) {
  const file = e.target.files[0];
  if (!file) return;

  const path = `${currentUser.id}_${Date.now()}_${file.name}`;

  const { data, error } = await supabaseClient.storage
    .from("avatars")
    .upload(path, file);

  if (error) {
    console.error("Avatar upload error:", error);
    return;
  }

  const url = `${SUPABASE_URL}/storage/v1/object/public/avatars/${data.path}`;

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

      if (relevant) {
        addMessageBubble(msg);
      }
      
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

  if (peopleList.length === 0) {
    box.innerHTML = `
      <div class="empty-state">
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
          <circle cx="12" cy="7" r="4"/>
        </svg>
        <h4>No other users</h4>
        <p class="text-muted">You're the only one here</p>
      </div>
    `;
    return;
  }

  peopleList.forEach(p => {
    const div = document.createElement("div");
    div.className = "list-row";

    const avatarContent = p.avatar_url 
      ? `<img src="${p.avatar_url}" alt="${p.username}">`
      : p.username.charAt(0);

    div.innerHTML = `
      <div class="avatar48">
        ${avatarContent}
      </div>
      <div class="conversation-info">
        <div class="conversation-header">
          <strong>${escape(p.username)}</strong>
        </div>
      </div>
    `;

    div.onclick = () => openDM(p);

    box.appendChild(div);
  });
}

function renderGroupList() {
  const box = document.getElementById("groupsList");
  box.innerHTML = "";

  if (groupList.length === 0) {
    box.innerHTML = `
      <div class="empty-state">
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
          <circle cx="9" cy="7" r="4"/>
          <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
          <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
        </svg>
        <h4>No groups yet</h4>
        <p class="text-muted">Create your first group!</p>
      </div>
    `;
    return;
  }

  groupList.forEach(g => {
    const div = document.createElement("div");
    div.className = "list-row";

    div.innerHTML = `
      <div class="group-icon">G</div>
      <div class="conversation-info">
        <div class="conversation-header">
          <strong>${escape(g.name)}</strong>
        </div>
        <div class="conversation-preview">
          ${g.description || "No description"}
        </div>
      </div>
    `;

    div.onclick = () => openGroupChat(g);

    box.appendChild(div);
  });
}

/* ================================================================
   UTIL FUNCTIONS
================================================================ */

function escape(str) {
  return String(str || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function formatTime(dateString) {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now - date;
  const diffHours = diffMs / (1000 * 60 * 60);
  
  if (diffHours < 24) {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  } else if (diffHours < 48) {
    return "Yesterday";
  } else {
    return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
  }
}
