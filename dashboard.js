/* ================= SUPABASE ================= */
const supabaseClient = supabase.createClient(
  "https://iklvlffqzkzpbhjeighn.supabase.co",
  "sb_publishable_OkvtrXKzaUP8D_zmw3XYNA_jZLP65va"
);

/* ================= GLOBAL ================= */
let currentUser = null;
let currentProfile = null;
let currentConversationId = null;
let messageChannel = null;

/* ================= INIT ================= */
document.addEventListener("DOMContentLoaded", async () => {
  await loadUser();
  loadPosts();
});

/* ================= USER ================= */
async function loadUser() {
  const { data } = await supabaseClient.auth.getUser();
  if (!data.user) return location.href = "login.html";

  currentUser = data.user;

  const { data: profile } = await supabaseClient
    .from("profiles")
    .select("*")
    .eq("id", currentUser.id)
    .single();

  currentProfile = profile;
  updateProfileUI();
}

function avatarFallback(name) {
  return `https://ui-avatars.com/api/?background=0D8ABC&color=fff&name=${name}`;
}

function updateProfileUI() {
  const avatar = currentProfile.avatar_url || avatarFallback(currentProfile.username);
  headerAvatar.src = avatar;
  sidebarAvatar.src = avatar;
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
  profileSection.classList.add("hidden");
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

function showProfile() {
  hideAll();
  profileSection.classList.remove("hidden");
  usernameInput.value = currentProfile.username;
  closeSidebar();
}

/* ================= POSTS ================= */
async function createPost() {
  const text = postContent.value.trim();
  const image = postImage.files[0];
  let imageUrl = null;

  if (image) {
    const path = `${currentUser.id}/${Date.now()}-${image.name}`;
    await supabaseClient.storage.from("post-images").upload(path, image);
    imageUrl = supabaseClient.storage.from("post-images").getPublicUrl(path).data.publicUrl;
  }

  if (!text && !imageUrl) return;

  await supabaseClient.from("posts").insert({
    user_id: currentUser.id,
    content: text,
    image_url: imageUrl
  });

  postContent.value = "";
  postImage.value = "";
  loadPosts();
}

async function loadPosts() {
  const { data } = await supabaseClient
    .from("posts")
    .select(`
      id, content, image_url, created_at,
      profiles(username, avatar_url),
      post_comments(id)
    `)
    .order("created_at", { ascending: false });

  postsContainer.innerHTML = "";

  data.forEach(p => {
    const avatar = p.profiles.avatar_url || avatarFallback(p.profiles.username);

    const div = document.createElement("div");
    div.className = "post";
    div.innerHTML = `
      <div class="post-header">
        <img src="${avatar}" class="avatar small">
        <strong>${p.profiles.username}</strong>
        <span>${new Date(p.created_at).toLocaleString()}</span>
      </div>

      <p>${p.content || ""}</p>
      ${p.image_url ? `<img src="${p.image_url}" class="post-image">` : ""}

      <button onclick="toggleComments(${p.id})">
        💬 Comments (${p.post_comments.length})
      </button>

      <div id="comments-${p.id}" class="comments hidden"></div>
    `;
    postsContainer.appendChild(div);
  });
}

/* ================= COMMENTS ================= */
async function toggleComments(postId) {
  const box = document.getElementById(`comments-${postId}`);
  box.classList.toggle("hidden");

  if (!box.innerHTML) {
    const { data } = await supabaseClient
      .from("post_comments")
      .select("content, profiles(username)")
      .eq("post_id", postId);

    box.innerHTML = `
      ${data.map(c => `<p><b>${c.profiles.username}</b>: ${c.content}</p>`).join("")}
      <input id="comment-${postId}" placeholder="Write comment">
      <button onclick="addComment(${postId})">Send</button>
    `;
  }
}

async function addComment(postId) {
  const input = document.getElementById(`comment-${postId}`);
  if (!input.value.trim()) return;

  await supabaseClient.from("post_comments").insert({
    post_id: postId,
    user_id: currentUser.id,
    content: input.value
  });

  document.getElementById(`comments-${postId}`).innerHTML = "";
  toggleComments(postId);
}

/* ================= CONTACTS ================= */
async function loadContacts() {
  const { data } = await supabaseClient
    .from("profiles")
    .select("id, username")
    .neq("id", currentUser.id);

  contactsList.innerHTML = "";
  data.forEach(u => {
    const div = document.createElement("div");
    div.className = "contact";
    div.innerHTML = `
      <img src="${u.avatar_url || avatarFallback(u.username)}" class="avatar small">
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
    const other = c.user1 === currentUser.id ? c.user2 : c.user1;
    const { data: p } = await supabaseClient.from("profiles").select("username").eq("id", other).single();
    const last = c.messages?.sort((a,b)=>new Date(b.created_at)-new Date(a.created_at))[0];

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
    .channel("messages-" + id)
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

/* ================= PROFILE ================= */
async function saveProfile() {
  let avatarUrl = currentProfile.avatar_url;
  const avatar = avatarInput.files[0];

  if (avatar) {
    const path = `${currentUser.id}-${Date.now()}`;
    await supabaseClient.storage.from("avatars").upload(path, avatar);
    avatarUrl = supabaseClient.storage.from("avatars").getPublicUrl(path).data.publicUrl;
  }

  await supabaseClient.from("profiles").update({
    username: usernameInput.value,
    avatar_url: avatarUrl
  }).eq("id", currentUser.id);

  await loadUser();
  showFeed();
}

/* ================= LOGOUT ================= */
async function logout() {
  await supabaseClient.auth.signOut();
  location.href = "login.html";
      }
