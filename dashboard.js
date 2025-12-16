/* ============================================================
   DASHBOARD.JS – FULLY WORKING GRADUATION EDITION 🎓
   Supabase v2 | RLS OFF | GitHub Pages
============================================================ */

const SUPABASE_URL = "https://ojjvkhafgurgondsopeh.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9qanZraGFmZ3VyZ29uZHNvcGVoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQ5MDkzODYsImV4cCI6MjA4MDQ"; // replace with your anon key
const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

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
   AUTH / SESSION
============================================================ */
async function loadUser() {
  const { data: { session } } = await supabaseClient.auth.getSession();

  if (!session || !session.user) {
    location.href = "login.html"; // redirect if no session
    return;
  }

  currentUser = session.user;

  // optional: display profile email
  const profileEmail = document.getElementById("profileEmail");
  if (profileEmail) profileEmail.textContent = currentUser.email;
}

/* ============================================================
   PROFILES
============================================================ */
async function loadProfiles() {
  const { data } = await supabaseClient
    .from("profiles")
    .select("id, username, avatar_url");

  profilesMap = {};
  (data || []).forEach(p => {
    profilesMap[p.id] = p;
  });
}

/* ============================================================
   POSTS
============================================================ */
async function loadPosts() {
  const container = document.getElementById("posts");
  if (!container) return;

  container.innerHTML = "";

  const { data, error } = await supabaseClient
    .from("posts")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Posts load error:", error);
    container.innerHTML = "<p>Error loading posts</p>";
    return;
  }

  if (!data || data.length === 0) {
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

  const { error } = await supabaseClient.from("posts").insert({
    user_id: currentUser.id,
    caption
  });

  if (error) {
    console.error("Post creation error:", error);
    return;
  }

  document.getElementById("caption").value = "";
  loadPosts();
}

/* ============================================================
   MESSAGING
============================================================ */
async function openDM(userId) {
  activeChat = userId;

  const box = document.getElementById("messages");
  if (!box) return;

  box.innerHTML = "";

  const { data, error } = await supabaseClient
    .from("messages")
    .select("*")
    .or(
      `and(sender_id.eq.${currentUser.id},receiver_id.eq.${userId}),
       and(sender_id.eq.${userId},receiver_id.eq.${currentUser.id})`
    )
    .order("created_at");

  if (error) {
    console.error("Messages load error:", error);
    return;
  }

  (data || []).forEach(renderMessage);
}

async function sendMessage() {
  const input = document.getElementById("messageInput");
  const text = input.value.trim();
  if (!text || !activeChat) return;

  const { error } = await supabaseClient.from("messages").insert({
    sender_id: currentUser.id,
    receiver_id: activeChat,
    message: text
  });

  if (error) {
    console.error("Message send error:", error);
    return;
  }

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
  box.scrollTop = box.scrollHeight;
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
