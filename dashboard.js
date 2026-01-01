/* ================= SUPABASE ================= */
const SUPABASE_URL = "https://iklvlffqzkzpbhjeighn.supabase.co";
const SUPABASE_KEY = "sb_publishable_OkvtrXKzaUP8D_zmw3XYNA_jZLP65va";
const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

/* ================= GLOBAL ================= */
let currentUser = null;
let currentProfile = null;
let currentConversationId = null;

/* ================= INIT ================= */
document.addEventListener("DOMContentLoaded", async () => {
  await loadUser();
  await loadPosts();
});

/* ================= AUTH ================= */
async function loadUser() {
  const { data } = await supabaseClient.auth.getUser();
  if (!data.user) {
    location.href = "login.html";
    return;
  }

  currentUser = data.user;

  const { data: profile } = await supabaseClient
    .from("profiles")
    .select("*")
    .eq("id", currentUser.id)
    .single();

  currentProfile = profile;
  updateProfileUI();
}

function updateProfileUI() {
  const initial = currentProfile.username.charAt(0).toUpperCase();
  document.getElementById("headerAvatar").textContent = initial;
  document.getElementById("sidebarAvatar").textContent = initial;
  document.getElementById("sidebarUsername").textContent = currentProfile.username;
}

/* ================= SIDEBAR ================= */
function toggleSidebar() {
  document.getElementById("sidebar").classList.add("active");
  document.getElementById("sidebarOverlay").classList.add("active");
}

function closeSidebar() {
  document.getElementById("sidebar").classList.remove("active");
  document.getElementById("sidebarOverlay").classList.remove("active");
}

/* ================= NAV ================= */
function showFeed() {
  hideAll();
  document.getElementById("feedSection").classList.remove("hidden");
  closeSidebar();
}

function showContacts() {
  hideAll();
  document.getElementById("contactsSection").classList.remove("hidden");
  closeSidebar();
  loadContacts();
}

function showInbox() {
  hideAll();
  document.getElementById("inboxSection").classList.remove("hidden");
  closeSidebar();
  loadConversations();
}

function hideAll() {
  document.getElementById("feedSection").classList.add("hidden");
  document.getElementById("contactsSection").classList.add("hidden");
  document.getElementById("inboxSection").classList.add("hidden");
}

/* ================= POSTS ================= */
async function createPost() {
  const content = document.getElementById("postContent").value.trim();
  if (!content) return;

  await supabaseClient.from("posts").insert({
    user_id: currentUser.id,
    content
  });

  document.getElementById("postContent").value = "";
  loadPosts();
}

async function loadPosts() {
  const { data } = await supabaseClient
    .from("posts")
    .select(`
      id, content, created_at,
      profiles(username),
      post_likes(user_id),
      post_comments(id, content, profiles(username))
    `)
    .order("created_at", { ascending: false });

  const container = document.getElementById("postsContainer");
  container.innerHTML = "";

  data.forEach(post => {
    const liked = post.post_likes.some(l => l.user_id === currentUser.id);

    const div = document.createElement("div");
    div.className = "post";
    div.innerHTML = `
      <strong>${post.profiles.username}</strong>
      <p>${post.content}</p>
      <button onclick="toggleLike(${post.id}, ${liked})">
        ${liked ? "❤️" : "🤍"} ${post.post_likes.length}
      </button>
    `;
    container.appendChild(div);
  });
}

async function toggleLike(postId, liked) {
  if (liked) {
    await supabaseClient.from("post_likes").delete()
      .eq("post_id", postId)
      .eq("user_id", currentUser.id);
  } else {
    await supabaseClient.from("post_likes").insert({
      post_id: postId,
      user_id: currentUser.id
    });
  }
  loadPosts();
}

/* ================= CONTACTS ================= */
async function loadContacts() {
  const { data } = await supabaseClient
    .from("profiles")
    .select("id, username")
    .neq("id", currentUser.id);

  const list = document.getElementById("contactsList");
  list.innerHTML = "";

  if (!data || data.length === 0) {
    list.innerHTML = "<p>No contacts</p>";
    return;
  }

  data.forEach(user => {
    const div = document.createElement("div");
    div.className = "contact";
    div.innerHTML = `
      <div class="avatar small">${user.username[0].toUpperCase()}</div>
      <span>${user.username}</span>
      <button onclick="openChat('${user.id}', '${user.username}')">Chat</button>
    `;
    list.appendChild(div);
  });
}

/* ================= INBOX ================= */
async function openChat(userId, username) {
  const { data } = await supabaseClient
    .from("conversations")
    .select("*")
    .or(
      `and(user1.eq.${currentUser.id},user2.eq.${userId}),
       and(user1.eq.${userId},user2.eq.${currentUser.id})`
    )
    .single();

  let conversation = data;

  if (!conversation) {
    const { data: created } = await supabaseClient
      .from("conversations")
      .insert({
        user1: currentUser.id,
        user2: userId
      })
      .select()
      .single();

    conversation = created;
  }

  currentConversationId = conversation.id;
  showInbox();
  openConversation(conversation.id, username);
}

async function loadConversations() {
  const { data } = await supabaseClient.from("conversations").select("*");
  const list = document.getElementById("conversationsList");
  list.innerHTML = "";

  if (!data || data.length === 0) {
    list.innerHTML = "<p>No conversations</p>";
    return;
  }

  data.forEach(conv => {
    const div = document.createElement("div");
    div.className = "conversation";
    div.textContent = "Conversation";
    div.onclick = () => openConversation(conv.id);
    list.appendChild(div);
  });
}

async function openConversation(id, username = "Chat") {
  currentConversationId = id;
  document.getElementById("chatHeader").textContent = username;
  loadMessages();
}

async function loadMessages() {
  const { data } = await supabaseClient
    .from("messages")
    .select("*")
    .eq("conversation_id", currentConversationId)
    .order("created_at");

  const box = document.getElementById("messagesContainer");
  box.innerHTML = "";

  data.forEach(msg => {
    const div = document.createElement("div");
    div.className = msg.sender_id === currentUser.id ? "message me" : "message";
    div.textContent = msg.content;
    box.appendChild(div);
  });

  box.scrollTop = box.scrollHeight;
}

async function sendMessage() {
  const input = document.getElementById("messageInput");
  if (!input.value || !currentConversationId) return;

  await supabaseClient.from("messages").insert({
    conversation_id: currentConversationId,
    sender_id: currentUser.id,
    content: input.value
  });

  input.value = "";
  loadMessages();
}

/* ================= LOGOUT ================= */
async function logout() {
  await supabaseClient.auth.signOut();
  location.href = "login.html";
                                       }
