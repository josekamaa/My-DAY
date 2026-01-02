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
  // Uses UI Avatars service for cleaner fallbacks
  const cleanName = name ? name.replace(/\s+/g, '+') : 'User';
  return `https://ui-avatars.com/api/?background=0D8ABC&color=fff&rounded=true&bold=true&name=${cleanName}`;
}

function updateProfileUI() {
  const avatar = currentProfile.avatar_url || avatarFallback(currentProfile.username);
  // Safe optional chaining checks
  if (document.getElementById("headerAvatar")) document.getElementById("headerAvatar").src = avatar;
  if (document.getElementById("sidebarAvatar")) document.getElementById("sidebarAvatar").src = avatar;
  if (document.getElementById("editProfilePreview")) document.getElementById("editProfilePreview").src = avatar;
  if (document.getElementById("sidebarUsername")) document.getElementById("sidebarUsername").textContent = currentProfile.username;
}

/* ================= SIDEBAR ================= */
function toggleSidebar() {
  const sidebar = document.getElementById("sidebar");
  const overlay = document.getElementById("sidebarOverlay");
  sidebar.classList.add("active");
  overlay.classList.add("active");
}

function closeSidebar() {
  const sidebar = document.getElementById("sidebar");
  const overlay = document.getElementById("sidebarOverlay");
  sidebar.classList.remove("active");
  overlay.classList.remove("active");
}

/* ================= NAV ================= */
function hideAll() {
  document.getElementById("feedSection").classList.add("hidden");
  document.getElementById("contactsSection").classList.add("hidden");
  document.getElementById("inboxSection").classList.add("hidden");
  document.getElementById("profileSection").classList.add("hidden");
}

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
  // Reset mobile view
  document.getElementById("chatCol").classList.remove("active");
}

function showProfile() {
  hideAll();
  document.getElementById("profileSection").classList.remove("hidden");
  document.getElementById("usernameInput").value = currentProfile.username;
  closeSidebar();
}

/* ================= POSTS & LIKES ================= */
async function createPost() {
  const textInput = document.getElementById("postContent");
  const imageInput = document.getElementById("postImage");
  
  const text = textInput.value.trim();
  const image = imageInput.files[0];
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

  textInput.value = "";
  imageInput.value = "";
  loadPosts();
}

async function loadPosts() {
  // Fetch posts with author info, comments, and likes
  const { data } = await supabaseClient
    .from("posts")
    .select(`
      id, content, image_url, created_at,
      profiles(username, avatar_url),
      post_comments(id),
      post_likes(user_id)
    `)
    .order("created_at", { ascending: false });

  const container = document.getElementById("postsContainer");
  container.innerHTML = "";

  data.forEach(p => {
    const avatar = p.profiles.avatar_url || avatarFallback(p.profiles.username);
    
    // Calculate Likes
    const likeCount = p.post_likes.length;
    const iLikedIt = p.post_likes.some(like => like.user_id === currentUser.id);
    const likeClass = iLikedIt ? "liked" : "";
    const likeIcon = iLikedIt ? "fas fa-heart" : "far fa-heart";

    const div = document.createElement("div");
    div.className = "post";
    div.innerHTML = `
      <div class="post-header">
        <img src="${avatar}" class="avatar small">
        <div>
            <strong>${p.profiles.username}</strong><br>
            <span>${new Date(p.created_at).toLocaleString()}</span>
        </div>
      </div>

      <div class="post-content">
        ${p.content ? `<p>${p.content}</p>` : ""}
      </div>
      
      ${p.image_url ? `<img src="${p.image_url}" class="post-image">` : ""}

      <div class="post-actions">
        <button class="action-btn ${likeClass}" onclick="toggleLike(${p.id})">
            <i class="${likeIcon}"></i> ${likeCount} Like${likeCount !== 1 ? 's' : ''}
        </button>
        <button class="action-btn" onclick="toggleComments(${p.id})">
            <i class="far fa-comment"></i> ${p.post_comments.length} Comments
        </button>
      </div>

      <div id="comments-${p.id}" class="comments-section hidden"></div>
    `;
    container.appendChild(div);
  });
}

// New Function: Handle Likes
async function toggleLike(postId) {
  // Check if liked already
  const { data: existingLike } = await supabaseClient
    .from("post_likes")
    .select("id")
    .match({ post_id: postId, user_id: currentUser.id })
    .maybeSingle();

  if (existingLike) {
    // Unlike
    await supabaseClient.from("post_likes").delete().eq("id", existingLike.id);
  } else {
    // Like
    await supabaseClient.from("post_likes").insert({ post_id: postId, user_id: currentUser.id });
  }
  
  // Reload to update UI (Optimization: could update local DOM manually, but reload is safer for sync)
  loadPosts();
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
      <div id="comment-list-${postId}">
        ${data.map(c => `<p style="margin-bottom:5px;"><b>${c.profiles.username}</b>: ${c.content}</p>`).join("")}
      </div>
      <div class="comment-input-area">
        <input id="comment-input-${postId}" placeholder="Write a comment...">
        <button class="btn-primary" onclick="addComment(${postId})">Send</button>
      </div>
    `;
  }
}

async function addComment(postId) {
  const input = document.getElementById(`comment-input-${postId}`);
  if (!input.value.trim()) return;

  await supabaseClient.from("post_comments").insert({
    post_id: postId,
    user_id: currentUser.id,
    content: input.value
  });

  // Refresh comment list logic
  document.getElementById(`comments-${postId}`).innerHTML = "";
  toggleComments(postId);
  // Also reload posts to update comment count
  loadPosts(); 
}

/* ================= CONTACTS ================= */
async function loadContacts() {
  const { data } = await supabaseClient
    .from("profiles")
    .select("id, username, avatar_url")
    .neq("id", currentUser.id);

  const list = document.getElementById("contactsList");
  list.innerHTML = "";
  
  data.forEach(u => {
    const div = document.createElement("div");
    div.className = "contact";
    div.innerHTML = `
      <img src="${u.avatar_url || avatarFallback(u.username)}" class="avatar small">
      <span>${u.username}</span>
      <button onclick="openChat('${u.id}','${u.username}')">Message</button>
    `;
    list.appendChild(div);
  });
}

/* ================= INBOX ================= */
async function openChat(userId, username) {
  // Check existing conversation
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
    // Create new if none exists
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

  const list = document.getElementById("conversationsList");
  list.innerHTML = "";

  for (const c of data) {
    const otherUserId = c.user1 === currentUser.id ? c.user2 : c.user1;
    const { data: p } = await supabaseClient.from("profiles").select("username, avatar_url").eq("id", otherUserId).single();
    
    // Sort messages locally to find the last one
    const lastMsg = c.messages?.sort((a,b)=>new Date(b.created_at)-new Date(a.created_at))[0];
    const preview = lastMsg 
        ? (lastMsg.content.startsWith('http') ? 'Sent an image' : lastMsg.content) 
        : 'No messages yet';

    const div = document.createElement("div");
    div.className = "conversation";
    if(currentConversationId === c.id) div.classList.add("active");
    
    div.innerHTML = `
        <div style="display:flex; align-items:center; gap:10px;">
            <img src="${p.avatar_url || avatarFallback(p.username)}" class="avatar small">
            <div>
                <strong>${p.username}</strong>
                <p style="font-size:0.8rem; color:#666; margin-top:2px;">${preview.substring(0, 30)}...</p>
            </div>
        </div>
    `;
    div.onclick = () => openConversation(c.id, p.username);
    list.appendChild(div);
  }
}

async function openConversation(id, username) {
  currentConversationId = id;
  
  // Update UI headers
  document.getElementById("chatUserName").textContent = username;
  document.getElementById("chatInputArea").classList.remove("hidden");
  
  // Highlight active conversation
  const allConvos = document.querySelectorAll('.conversation');
  allConvos.forEach(el => el.classList.remove('active'));

  // Mobile: Slide in chat
  document.getElementById("chatCol").classList.add("active");

  // Realtime Setup
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

function closeChatMobile() {
    document.getElementById("chatCol").classList.remove("active");
    currentConversationId = null;
}

async function loadMessages() {
  const container = document.getElementById("messagesContainer");
  container.innerHTML = '<p style="text-align:center;">Loading...</p>';

  const { data } = await supabaseClient
    .from("messages")
    .select("*")
    .eq("conversation_id", currentConversationId)
    .order("created_at");

  container.innerHTML = "";
  data.forEach(renderMessage);
  scrollToBottom();
}

function renderMessage(msg) {
  const container = document.getElementById("messagesContainer");
  const div = document.createElement("div");
  // Distinguish 'me' vs 'them'
  div.className = msg.sender_id === currentUser.id ? "message me" : "message them";

  if (msg.content.startsWith("http")) {
    div.innerHTML = `<img src="${msg.content}" class="chat-image" onclick="window.open('${msg.content}')">`;
  } else {
    div.textContent = msg.content;
  }

  container.appendChild(div);
  scrollToBottom();
}

function scrollToBottom() {
    const container = document.getElementById("messagesContainer");
    container.scrollTop = container.scrollHeight;
}

async function sendMessage() {
  const textInput = document.getElementById("messageInput");
  const fileInput = document.getElementById("imageInput");
  
  const text = textInput.value.trim();
  const file = fileInput.files[0];
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

  textInput.value = "";
  fileInput.value = "";
  
  // Update sidebar preview
  loadConversations();
}

/* ================= PROFILE ================= */
async function saveProfile() {
  let avatarUrl = currentProfile.avatar_url;
  const avatar = document.getElementById("avatarInput").files[0];
  const newUsername = document.getElementById("usernameInput").value;

  if (avatar) {
    const path = `${currentUser.id}-${Date.now()}`;
    await supabaseClient.storage.from("avatars").upload(path, avatar);
    avatarUrl = supabaseClient.storage.from("avatars").getPublicUrl(path).data.publicUrl;
  }

  await supabaseClient.from("profiles").update({
    username: newUsername,
    avatar_url: avatarUrl
  }).eq("id", currentUser.id);

  alert("Profile updated!");
  await loadUser();
  showFeed();
}

/* ================= LOGOUT ================= */
async function logout() {
  await supabaseClient.auth.signOut();
  location.href = "login.html";
                                                        }
