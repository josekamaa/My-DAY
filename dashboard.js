/* ================= SUPABASE ================= */
const SUPABASE_URL = "https://iklvlffqzkzpbhjeighn.supabase.co";
const SUPABASE_KEY = "sb_publishable_OkvtrXKzaUP8D_zmw3XYNA_jZLP65va";
const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

/* ================= GLOBAL ================= */
let currentUser = null;
let currentProfile = null;
let currentConversationId = null;
let messageChannel = null;

/* ================= INIT ================= */
document.addEventListener("DOMContentLoaded", async () => {
  await loadUser();
  await loadPosts();
});

/* ================= AUTH ================= */
async function loadUser() {
  const { data } = await supabaseClient.auth.getUser();
  if (!data.user) return (location.href = "login.html");

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
  const i = currentProfile.username[0].toUpperCase();
  headerAvatar.textContent = i;
  sidebarAvatar.textContent = i;
  sidebarUsername.textContent = currentProfile.username;
}

/* ================= SIDEBAR ================= */
function toggleSidebar() {
  sidebar.classList.add("active");
  sidebarOverlay.classList.add("active");
}
function closeSidebar() {
  sidebar.classList.remove("active");
  sidebarOverlay.classList.remove("active");
}

/* ================= NAV ================= */
function hideAll() {
  feedSection.classList.add("hidden");
  contactsSection.classList.add("hidden");
  inboxSection.classList.add("hidden");
}
function showFeed() {
  hideAll();
  feedSection.classList.remove("hidden");
  closeSidebar();
}
function showContacts() {
  hideAll();
  contactsSection.classList.remove("hidden");
  closeSidebar();
  loadContacts();
}
function showInbox() {
  hideAll();
  inboxSection.classList.remove("hidden");
  closeSidebar();
  loadConversations();
}

/* ================= POSTS ================= */
async function createPost() {
  const content = postContent.value.trim();
  if (!content) return;

  await supabaseClient.from("posts").insert({
    user_id: currentUser.id,
    content
  });
  postContent.value = "";
  loadPosts();
}

async function loadPosts() {
  const { data } = await supabaseClient
    .from("posts")
    .select("id,content,profiles(username)")
    .order("created_at", { ascending: false });

  postsContainer.innerHTML = "";
  data.forEach(p => {
    const div = document.createElement("div");
    div.className = "post";
    div.innerHTML = `<strong>${p.profiles.username}</strong><p>${p.content}</p>`;
    postsContainer.appendChild(div);
  });
}

/* ================= CONTACTS ================= */
async function loadContacts() {
  const { data } = await supabaseClient
    .from("profiles")
    .select("id,username")
    .neq("id", currentUser.id);

  contactsList.innerHTML = "";
  data.forEach(u => {
    const div = document.createElement("div");
    div.className = "contact";
    div.innerHTML = `
      <div class="avatar small">${u.username[0].toUpperCase()}</div>
      <span>${u.username}</span>
      <button onclick="openChat('${u.id}','${u.username}')">Chat</button>
    `;
    contactsList.appendChild(div);
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

  let convo = data;
  if (!convo) {
    const { data: c } = await supabaseClient
      .from("conversations")
      .insert({ user1: currentUser.id, user2: userId })
      .select()
      .single();
    convo = c;
  }

  showInbox();
  openConversation(convo.id, username);
}

async function loadConversations() {
  const { data } = await supabaseClient
    .from("conversations")
    .select("id,user1,user2,messages(content,created_at)");

  conversationsList.innerHTML = "";
  for (const c of data) {
    const other =
      c.user1 === currentUser.id ? c.user2 : c.user1;

    const { data: p } = await supabaseClient
      .from("profiles")
      .select("username")
      .eq("id", other)
      .single();

    const last = c.messages?.sort(
      (a, b) => new Date(b.created_at) - new Date(a.created_at)
    )[0];

    const div = document.createElement("div");
    div.className = "conversation";
    div.innerHTML = `<strong>${p.username}</strong><p>${last?.content || ""}</p>`;
    div.onclick = () => openConversation(c.id, p.username);
    conversationsList.appendChild(div);
  }
}

async function openConversation(id, username) {
  currentConversationId = id;
  chatHeader.textContent = username;

  if (messageChannel) supabaseClient.removeChannel(messageChannel);

  messageChannel = supabaseClient
    .channel("msg-" + id)
    .on(
      "postgres_changes",
      { event: "INSERT", table: "messages", filter: `conversation_id=eq.${id}` },
      payload => renderMessage(payload.new)
    )
    .subscribe();

  loadMessages();
}

async function loadMessages() {
  const { data } = await supabaseClient
    .from("messages")
    .select("*")
    .eq("conversation_id", currentConversationId)
    .order("created_at");

  messagesContainer.innerHTML = "";
  data.forEach(renderMessage);
}

function renderMessage(msg) {
  const div = document.createElement("div");
  div.className = msg.sender_id === currentUser.id ? "message me" : "message";

  if (msg.content.startsWith("http")) {
    div.innerHTML = `<img src="${msg.content}" class="chat-image">`;
  } else {
    div.textContent = msg.content;
  }

  messagesContainer.appendChild(div);
  messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

async function sendMessage() {
  const text = messageInput.value.trim();
  const file = imageInput.files[0];
  let content = text;

  if (file) {
    const path = `${currentConversationId}/${Date.now()}-${file.name}`;
    await supabaseClient.storage.from("chat-images").upload(path, file);
    content = supabaseClient.storage.from("chat-images").getPublicUrl(path).data.publicUrl;
  }

  if (!content) return;

  await supabaseClient.from("messages").insert({
    conversation_id: currentConversationId,
    sender_id: currentUser.id,
    content
  });

  messageInput.value = "";
  imageInput.value = "";
}

/* ================= LOGOUT ================= */
async function logout() {
  await supabaseClient.auth.signOut();
  location.href = "login.html";
      }
