/* ================= CONFIG ================= */
const supabaseClient = supabase.createClient(
  "https://iklvlffqzkzpbhjeighn.supabase.co",
  "sb_publishable_OkvtrXKzaUP8D_zmw3XYNA_jZLP65va"
);

/* ================= STATE ================= */
let currentUser = null;
let currentProfile = null;
let activeConversationId = null;
let messageSubscription = null;

/* ================= INIT ================= */
document.addEventListener("DOMContentLoaded", async () => {
  await checkSession();
  loadPosts();
});

// Helper for broken images
function imgError(image) {
  image.onerror = null;
  image.src = "https://placehold.co/400x300?text=Image+Unavailable";
  return true;
}

/* ================= AUTH & USER ================= */
async function checkSession() {
  const { data } = await supabaseClient.auth.getUser();
  if (!data.user) return window.location.href = "login.html";
  currentUser = data.user;
  await loadUserProfile();
}

async function loadUserProfile() {
  const { data } = await supabaseClient
    .from("profiles")
    .select("*")
    .eq("id", currentUser.id)
    .single();

  currentProfile = data;
  updateGlobalUI();
}

function updateGlobalUI() {
  const name = currentProfile.username || "User";
  const avatar = currentProfile.avatar_url || `https://ui-avatars.com/api/?name=${name}&background=0D8ABC&color=fff`;
  
  // Update all avatar instances safely
  const els = ["headerAvatar", "sidebarAvatar", "editProfilePreview"];
  els.forEach(id => {
    const el = document.getElementById(id);
    if(el) el.src = avatar;
  });
  
  document.getElementById("sidebarUsername").textContent = name;
  document.getElementById("newUsername").value = name;
}

function logout() {
  supabaseClient.auth.signOut().then(() => window.location.href = "login.html");
}

/* ================= NAVIGATION ================= */
function toggleSidebar() {
  document.getElementById("sidebar").classList.add("active");
  document.getElementById("sidebarOverlay").classList.add("active");
}
function closeSidebar() {
  document.getElementById("sidebar").classList.remove("active");
  document.getElementById("sidebarOverlay").classList.remove("active");
}

function showSection(sectionName) {
  // Hide all sections
  ["feedSection", "contactsSection", "inboxSection", "profileSection"].forEach(id => {
    document.getElementById(id).classList.add("hidden");
  });
  
  // Show target
  document.getElementById(sectionName + "Section").classList.remove("hidden");
  closeSidebar();

  // Load data if needed
  if (sectionName === "contacts") loadContacts();
  if (sectionName === "inbox") loadInbox();
}

/* ================= FEED (POSTS) ================= */
async function createPost() {
  const text = document.getElementById("postContent").value.trim();
  const file = document.getElementById("postImage").files[0];
  let imageUrl = null;

  if (!text && !file) return alert("Write something or pick an image!");

  if (file) {
    const path = `${currentUser.id}/${Date.now()}_${file.name}`;
    await supabaseClient.storage.from("post-images").upload(path, file);
    const { data } = supabaseClient.storage.from("post-images").getPublicUrl(path);
    imageUrl = data.publicUrl;
  }

  await supabaseClient.from("posts").insert({
    user_id: currentUser.id,
    content: text,
    image_url: imageUrl
  });

  document.getElementById("postContent").value = "";
  document.getElementById("postImage").value = "";
  loadPosts();
}

async function loadPosts() {
  const { data } = await supabaseClient
    .from("posts")
    .select(`
      *,
      profiles(username, avatar_url),
      post_likes(user_id),
      post_comments(id)
    `)
    .order("created_at", { ascending: false });

  const container = document.getElementById("postsContainer");
  container.innerHTML = "";

  data.forEach(post => {
    const isLiked = post.post_likes.some(l => l.user_id === currentUser.id);
    const likeClass = isLiked ? "liked" : "";
    const likeIcon = isLiked ? "fas fa-heart" : "far fa-heart";
    const avatar = post.profiles.avatar_url || `https://ui-avatars.com/api/?name=${post.profiles.username}`;

    const html = `
      <div class="post">
        <div class="post-header">
          <img src="${avatar}" class="avatar small" onerror="this.src='https://ui-avatars.com/api/?name=?'">
          <div>
            <strong>${post.profiles.username}</strong>
            <span>${new Date(post.created_at).toLocaleDateString()}</span>
          </div>
        </div>

        <div class="post-content">
          ${post.content || ""}
        </div>
        
        ${post.image_url ? `<img src="${post.image_url}" class="post-image" onerror="imgError(this)">` : ""}

        <div class="post-stats">
          <span>${post.post_likes.length} Likes</span>
          <span>${post.post_comments.length} Comments</span>
        </div>

        <div class="post-actions">
          <button class="action-btn ${likeClass}" onclick="toggleLike(${post.id})">
            <i class="${likeIcon}"></i> Like
          </button>
          <button class="action-btn" onclick="toggleComments(${post.id})">
            <i class="far fa-comment-alt"></i> Comment
          </button>
        </div>

        <div id="comments-${post.id}" class="comments-section">
          </div>
      </div>
    `;
    container.innerHTML += html;
  });
}

/* ================= LIKES & COMMENTS ================= */
async function toggleLike(postId) {
  const { data: existing } = await supabaseClient
    .from("post_likes")
    .select("id")
    .match({ post_id: postId, user_id: currentUser.id })
    .maybeSingle();

  if (existing) {
    await supabaseClient.from("post_likes").delete().eq("id", existing.id);
  } else {
    await supabaseClient.from("post_likes").insert({ post_id: postId, user_id: currentUser.id });
  }
  loadPosts(); // Reload to update UI
}

async function toggleComments(postId) {
  const div = document.getElementById(`comments-${postId}`);
  
  if (div.classList.contains("open")) {
    div.classList.remove("open");
    return;
  }

  // Load comments
  const { data } = await supabaseClient
    .from("post_comments")
    .select("content, profiles(username)")
    .eq("post_id", postId);

  let html = `<div class="comment-list">`;
  data.forEach(c => {
    html += `<div class="comment-row"><b>${c.profiles.username}:</b> ${c.content}</div>`;
  });
  html += `</div>
    <div class="comment-input-group">
      <input type="text" id="input-${postId}" placeholder="Write a comment..." />
      <button class="btn-blue" onclick="sendComment(${postId})">Post</button>
    </div>`;
  
  div.innerHTML = html;
  div.classList.add("open");
}

async function sendComment(postId) {
  const input = document.getElementById(`input-${postId}`);
  if (!input.value) return;
  
  await supabaseClient.from("post_comments").insert({
    post_id: postId,
    user_id: currentUser.id,
    content: input.value
  });
  
  // Refresh comments view
  div = document.getElementById(`comments-${postId}`);
  div.classList.remove("open"); 
  toggleComments(postId); 
}

/* ================= INBOX & CHAT ================= */
async function loadInbox() {
  const { data } = await supabaseClient
    .from("conversations")
    .select(`id, user1, user2`);

  const list = document.getElementById("conversationsList");
  list.innerHTML = "";

  for (let convo of data) {
    const otherId = convo.user1 === currentUser.id ? convo.user2 : convo.user1;
    // Get other user details
    const { data: otherUser } = await supabaseClient
      .from("profiles").select("username, avatar_url").eq("id", otherId).single();

    if (!otherUser) continue;

    const div = document.createElement("div");
    div.className = "conversation-item";
    div.onclick = () => openChat(convo.id, otherUser.username, otherId);
    div.innerHTML = `
      <img src="${otherUser.avatar_url || 'https://ui-avatars.com/api/?name='+otherUser.username}" class="avatar small">
      <div class="conversation-info">
        <h4>${otherUser.username}</h4>
        <p>Tap to chat</p>
      </div>
    `;
    list.appendChild(div);
  }
}

async function openChat(convoId, username) {
  activeConversationId = convoId;
  document.getElementById("chatUserDisplayName").textContent = username;
  
  // Mobile UI Transition
  document.getElementById("chatView").classList.add("active");
  document.getElementById("chatInputArea").style.visibility = "visible";

  // Realtime Setup
  if (messageSubscription) supabaseClient.removeChannel(messageSubscription);
  
  messageSubscription = supabaseClient.channel(`chat-${convoId}`)
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `conversation_id=eq.${convoId}` }, 
    payload => appendMessage(payload.new))
    .subscribe();

  // Load existing messages
  const { data } = await supabaseClient
    .from("messages")
    .select("*")
    .eq("conversation_id", convoId)
    .order("created_at", { ascending: true });

  const container = document.getElementById("messagesContainer");
  container.innerHTML = ""; // Clear placeholder
  data.forEach(appendMessage);
}

function appendMessage(msg) {
  const container = document.getElementById("messagesContainer");
  const isMe = msg.sender_id === currentUser.id;
  
  const div = document.createElement("div");
  div.className = `message ${isMe ? 'me' : 'them'}`;
  
  if (msg.content.startsWith("http") && (msg.content.includes("supab") || msg.content.includes("img"))) {
     div.innerHTML = `<img src="${msg.content}" class="chat-img" onerror="imgError(this)">`;
  } else {
     div.textContent = msg.content;
  }
  
  container.appendChild(div);
  container.scrollTop = container.scrollHeight; // Auto scroll to bottom
}

function closeChat() {
  document.getElementById("chatView").classList.remove("active");
  activeConversationId = null;
}

async function sendMessage() {
  const textInput = document.getElementById("chatTextInput");
  const fileInput = document.getElementById("chatImgInput");
  
  const text = textInput.value.trim();
  const file = fileInput.files[0];
  let content = text;

  if (!text && !file) return;

  if (file) {
    const path = `chat/${Date.now()}_${file.name}`;
    await supabaseClient.storage.from("chat-images").upload(path, file);
    const { data } = supabaseClient.storage.from("chat-images").getPublicUrl(path);
    content = data.publicUrl;
  }

  await supabaseClient.from("messages").insert({
    conversation_id: activeConversationId,
    sender_id: currentUser.id,
    content: content
  });

  textInput.value = "";
  fileInput.value = "";
}

/* ================= CONTACTS ================= */
async function loadContacts() {
  const { data } = await supabaseClient.from("profiles").select("*").neq("id", currentUser.id);
  const container = document.getElementById("contactsList");
  container.innerHTML = "";

  data.forEach(user => {
    const div = document.createElement("div");
    div.className = "contact-card";
    div.innerHTML = `
      <div style="display:flex; align-items:center; gap:10px;">
        <img src="${user.avatar_url || 'https://ui-avatars.com/api/?name='+user.username}" class="avatar small">
        <strong>${user.username}</strong>
      </div>
      <button class="btn-blue" onclick="startNewChat('${user.id}')">Message</button>
    `;
    container.appendChild(div);
  });
}

async function startNewChat(targetUserId) {
  // Check if chat exists
  const { data: existing } = await supabaseClient.from("conversations")
    .select("id")
    .or(`and(user1.eq.${currentUser.id},user2.eq.${targetUserId}),and(user1.eq.${targetUserId},user2.eq.${currentUser.id})`)
    .maybeSingle();

  if (existing) {
    showSection("inbox");
    // We need to fetch username to open chat correctly, but lazy load handles it in inbox
  } else {
    await supabaseClient.from("conversations").insert({ user1: currentUser.id, user2: targetUserId });
    showSection("inbox");
  }
}

/* ================= PROFILE ================= */
async function saveProfile() {
  const newName = document.getElementById("newUsername").value;
  const file = document.getElementById("newAvatar").files[0];
  let avatarUrl = currentProfile.avatar_url;

  if (file) {
    const path = `avatars/${currentUser.id}_${Date.now()}`;
    await supabaseClient.storage.from("avatars").upload(path, file);
    const { data } = supabaseClient.storage.from("avatars").getPublicUrl(path);
    avatarUrl = data.publicUrl;
  }

  await supabaseClient.from("profiles").update({ username: newName, avatar_url: avatarUrl }).eq("id", currentUser.id);
  alert("Profile Saved!");
  location.reload();
}
  
