/* ============================================================
   DASHBOARD.JS – CLEAN, STABLE, GRADUATION BUILD 🎓
   Supabase v2 | RLS OFF | GitHub Pages SAFE
============================================================ */

const SUPABASE_URL = "https://ojjvkhafgurgondsopeh.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9qanZraGFmZ3VyZ29uZHNvcGVoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQ5MDkzODYsImV4cCI6MjA4MDQ"; // keep same key

const supabaseClient = supabase.createClient(
  SUPABASE_URL,
  SUPABASE_KEY
);

/* ============================================================
   GLOBAL STATE
============================================================ */

let currentUser = null;
let profilesMap = {};
let activeChat = null;

/* ============================================================
   INIT
============================================================ */

document.addEventListener("DOMContentLoaded", async () => {
  await loadUser();
  await loadProfiles();
  await loadPosts();
  setupEvents();
});

/* ============================================================
   AUTH
============================================================ */

async function loadUser() {
  const { data } = await supabaseClient.auth.getUser();
  if (!data?.user) {
    location.href = "login.html";
    return;
  }
  currentUser = data.user;
}

/* ============================================================
   PROFILES
============================================================ */

async function loadProfiles() {
  const { data } = await supabaseClient
    .from("profiles")
    .select("id, username, avatar_url");

  (data || []).forEach(p => {
    profilesMap[p.id] = p;
  });
}

/* ============================================================
   POSTS (FIXED – NO FK REQUIRED)
============================================================ */

async function loadPosts() {
  const container = document.getElementById("posts");
  container.innerHTML = "";

  const { data, error } = await supabaseClient
    .from("posts")
    .select("*")
    .order("created_at", { ascending: false });

  if (error || !data || data.length === 0) {
    container.innerHTML = "<p>No posts yet</p>";
    return;
  }

  data.forEach(post => {
    const profile = profilesMap[post.user_id] || {};
    const div = document.createElement("div");
    div.className = "post";

    div.innerHTML = `
      <strong>${escape(profile.username || "Unknown")}</strong>
      <div class="time">${new Date(post.created_at).toLocaleString()}</div>
      <p>${escape(post.caption || "")}</p>
      ${post.media_url ? `<img src="${post.media_url}" class="post-media">` : ""}
    `;

    container.appendChild(div);
  });
}

/* ============================================================
   CREATE POST
============================================================ */

async function createPost() {
  const caption = document.getElementById("caption").value.trim();
  if (!caption) return;

  await supabaseClient.from("posts").insert({
    user_id: currentUser.id,
    caption
  });

  document.getElementById("caption").value = "";
  loadPosts();
}

/* ============================================================
   MESSAGING (FIXED OR QUERY)
============================================================ */

async function openDM(userId) {
  activeChat = userId;
  const box = document.getElementById("messages");
  box.innerHTML = "";

  const { data } = await supabaseClient
    .from("messages")
    .select("*")
    .or(
      `and(sender_id.eq.${currentUser.id},receiver_id.eq.${userId}),
       and(sender_id.eq.${userId},receiver_id.eq.${currentUser.id})`
    )
    .order("created_at");

  (data || []).forEach(renderMessage);
}

async function sendMessage() {
  const input = document.getElementById("messageInput");
  const text = input.value.trim();
  if (!text || !activeChat) return;

  await supabaseClient.from("messages").insert({
    sender_id: currentUser.id,
    receiver_id: activeChat,
    message: text
  });

  input.value = "";
  openDM(activeChat);
}

function renderMessage(msg) {
  const box = document.getElementById("messages");
  const div = document.createElement("div");
  div.className = msg.sender_id === currentUser.id ? "me" : "other";

  div.innerHTML = `
    <div>${escape(msg.message)}</div>
    <small>${new Date(msg.created_at).toLocaleTimeString()}</small>
  `;

  box.appendChild(div);
}

/* ============================================================
   EVENTS
============================================================ */

function setupEvents() {
  document.getElementById("postBtn")?.addEventListener("click", createPost);
  document.getElementById("sendBtn")?.addEventListener("click", sendMessage);
}

/* ============================================================
   HELPERS
============================================================ */

function escape(str = "") {
  return str.replace(/[&<>"']/g, m => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[m]);
}
