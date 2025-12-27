/* ===========================================================
   SUPABASE CLIENT
=========================================================== */
const SUPABASE_URL = "https://ojjvkhafgurgondsopeh.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9qanZraGFmZ3VyZ29uZHNvcGVoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQ5MDkzODYsImV4cCI6MjA4MDQ4NTM4Nn0.hOLxBVqnFhJ2S1jjR0mkKUJ_bWDjZbHJD3wV0Rbbf7A";

const sb = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

/* ===========================================================
   GLOBAL STATE
=========================================================== */
let currentUser = null;
let userLikes = new Set();
let activeChatUser = null;
let msgSub = null;
let isPosting = false; // Flag to prevent duplicate posts

/* ===========================================================
   HELPER FUNCTIONS
=========================================================== */
function el(id) { return document.getElementById(id); }

// Format relative time (e.g., "2 hours ago")
function formatRelativeTime(dateString) {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now - date;
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHour = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHour / 24);
  
  if (diffSec < 60) return "just now";
  if (diffMin < 60) return `${diffMin} min${diffMin > 1 ? 's' : ''} ago`;
  if (diffHour < 24) return `${diffHour} hour${diffHour > 1 ? 's' : ''} ago`;
  if (diffDay < 7) return `${diffDay} day${diffDay > 1 ? 's' : ''} ago`;
  
  // For older posts, show actual date
  return date.toLocaleDateString('en-US', { 
    month: 'short', 
    day: 'numeric',
    year: diffDay > 365 ? 'numeric' : undefined
  });
}

// Format message time (e.g., "2:30 PM")
function formatMessageTime(dateString) {
  const date = new Date(dateString);
  return date.toLocaleTimeString('en-US', { 
    hour: '2-digit', 
    minute: '2-digit',
    hour12: true 
  });
}

/* ===========================================================
   LOAD USER + PROFILE
=========================================================== */
async function loadUser() {
  const { data } = await sb.auth.getUser();

  if (!data?.user) {
    window.location.href = "login.html";
    return;
  }

  currentUser = data.user;
  await ensureProfileExists();
  await loadProfilePanel();
  await loadUserLikes();
  loadPosts();
}

async function ensureProfileExists() {
  const { data } = await sb
    .from("profiles")
    .select("id")
    .eq("id", currentUser.id)
    .maybeSingle();

  if (!data) {
    const username = currentUser.email.split("@")[0];
    await sb.from("profiles").insert({ id: currentUser.id, username });
  }
}

async function loadProfilePanel() {
  const { data } = await sb
    .from("profiles")
    .select("*")
    .eq("id", currentUser.id)
    .single();

  const name = data?.username || "User";
  const url = data?.avatar_url || null;

  el("profileUsername").textContent = name;
  el("avatarInitial").textContent = name.charAt(0).toUpperCase();

  if (url) {
    const img = document.createElement("img");
    img.src = url;
    el("profileAvatar").innerHTML = ""; // Clear initial
    el("profileAvatar").appendChild(img);
  }
}

/* ===========================================================
   USERNAME EDITING
=========================================================== */
function openEditUsername() {
  const currentName = el("profileUsername").textContent;
  el("newUsername").value = currentName;
  updateCharCount();
  el("editUsernameBox").classList.remove("hidden");
}

function closeEditUsername() {
  el("editUsernameBox").classList.add("hidden");
}

function updateCharCount() {
  const input = el("newUsername");
  const count = input.value.length;
  const charCount = el("usernameCharCount");
  
  charCount.textContent = `${count}/30`;
  
  if (count >= 25) {
    charCount.classList.add("warning");
    charCount.classList.remove("error");
  } else if (count >= 30) {
    charCount.classList.add("error");
    charCount.classList.remove("warning");
  } else {
    charCount.classList.remove("warning", "error");
  }
}

// Add event listener for character count
if (el("newUsername")) {
  el("newUsername").addEventListener("input", updateCharCount);
}

async function saveUsername() {
  const newUsername = el("newUsername").value.trim();
  
  if (!newUsername) {
    return alert("Username cannot be empty");
  }
  
  if (newUsername.length > 30) {
    return alert("Username must be 30 characters or less");
  }
  
  const btn = el("saveUsernameBtn");
  btn.disabled = true;
  btn.textContent = "Saving...";
  
  try {
    const { error } = await sb
      .from("profiles")
      .update({ username: newUsername })
      .eq("id", currentUser.id);
    
    if (error) throw error;
    
    el("profileUsername").textContent = newUsername;
    el("avatarInitial").textContent = newUsername.charAt(0).toUpperCase();
    closeEditUsername();
    loadPosts(); // Refresh posts to show updated username
  } catch (err) {
    console.error(err);
    alert("Failed to update username. Please try again.");
  } finally {
    btn.disabled = false;
    btn.textContent = "Save Changes";
  }
}

/* ===========================================================
   AVATAR UPLOAD
=========================================================== */
el("avatarInput").addEventListener("change", async (e) => {
  const file = e.target.files[0];
  if (!file) return;

  const path = `${currentUser.id}_${Date.now()}_${file.name}`;

  const { data, error } = await sb
    .storage.from("avatars")
    .upload(path, file);

  if (error) return alert("Avatar upload failed");

  const url = `${SUPABASE_URL}/storage/v1/object/public/avatars/${encodeURIComponent(data.path)}`;

  await sb.from("profiles")
    .update({ avatar_url: url })
    .eq("id", currentUser.id);

  loadProfilePanel();
  loadPosts();
});

/* ===========================================================
   CREATE POST (WITH DUPLICATE PREVENTION)
=========================================================== */
async function createPost() {
  // Prevent double clicks
  if (isPosting) return;

  const caption = el("caption").value.trim();
  const media = el("mediaFile") ? el("mediaFile").files[0] : null;

  if (!caption && !media) {
    return alert("Write something or upload media");
  }

  // Lock UI
  isPosting = true;
  const btn = el("postBtn");
  const originalText = btn.textContent;
  
  btn.disabled = true;
  btn.textContent = "Posting...";
  btn.style.opacity = "0.7";

  try {
    let mediaUrl = null;
    let mediaType = null;

    if (media) {
      const path = `${Date.now()}_${media.name}`;
      const { data, error } = await sb
        .storage.from("posts")
        .upload(path, media);

      if (error) throw error;

      mediaUrl = `${SUPABASE_URL}/storage/v1/object/public/posts/${encodeURIComponent(data.path)}`;
      mediaType = media.type.startsWith("video") ? "video" : "image";
    }

    const { error: insertError } = await sb.from("posts").insert({
      user_id: currentUser.id,
      user_name: currentUser.email.split("@")[0],
      caption,
      media_url: mediaUrl,
      media_type: mediaType,
      likes: 0
    });

    if (insertError) throw insertError;

    // Reset Form
    el("caption").value = "";
    if (el("mediaFile")) el("mediaFile").value = "";
    
    toggleCreatePost(); // Close modal
    loadPosts();        // Refresh feed

  } catch (err) {
    console.error(err);
    alert("Failed to post. Please try again.");
  } finally {
    // Unlock UI
    isPosting = false;
    btn.disabled = false;
    btn.textContent = originalText;
    btn.style.opacity = "1";
  }
}

function toggleCreatePost() {
  const box = el("createPostBox");
  if (box) box.classList.toggle("hidden");
}

/* ===========================================================
   LOAD POSTS WITH TIMESTAMPS
=========================================================== */
async function loadUserLikes() {
  const { data } = await sb.from("post_likes")
    .select("post_id")
    .eq("user_id", currentUser.id);

  userLikes = new Set(data?.map(x => x.post_id) || []);
}

async function loadPosts() {
  const postsDiv = el("posts");
  postsDiv.innerHTML = "<p>Loading...</p>";

  const { data: posts } = await sb
    .from("posts")
    .select("*")
    .order("created_at", { ascending: false });

  postsDiv.innerHTML = "";

  for (const post of posts) {
    const prof = await sb
      .from("profiles")
      .select("*")
      .eq("id", post.user_id)
      .maybeSingle();

    const avatarUrl = prof?.avatar_url || null;
    const username = prof?.username || post.user_name;
    const timestamp = formatRelativeTime(post.created_at);

    const div = document.createElement("div");
    div.className = "post";

    // Use "avatar" class for CSS consistency (Circle shape)
    const avatarHTML = avatarUrl
      ? `<div class="avatar"><img src="${avatarUrl}" alt="${username}"></div>`
      : `<div class="avatar"><span style="font-size:16px;">${username.charAt(0).toUpperCase()}</span></div>`;

    let mediaHTML = "";
    if (post.media_type === "image")
      mediaHTML = `<img src="${post.media_url}" alt="Post image">`;
    if (post.media_type === "video")
      mediaHTML = `<video src="${post.media_url}" controls></video>`;

    div.innerHTML = `
      <div class="post-header">
        <div class="post-user">
          ${avatarHTML}
          <div>
            <strong>${username}</strong>
            <div class="post-time">${timestamp}</div>
          </div>
        </div>
      </div>
      <div class="post-content">
        <p>${post.caption || ""}</p>
        ${mediaHTML}
      </div>
      <div class="actions" style="margin:10px 14px;">
        <button class="btn ghost" style="padding:6px 12px; font-size:13px; color:#333;" onclick="likePost(${post.id}, ${post.likes})">
          ${userLikes.has(post.id) ? "❤️" : "🤍"} Like (${post.likes})
        </button>
        <button class="btn ghost" style="padding:6px 12px; font-size:13px; color:#333;" onclick="toggleComments(${post.id})">💬 Comments</button>
      </div>

      <div class="comments-section" id="comments-${post.id}" style="display:none; padding:0 14px 14px;">
        <h4 style="margin:10px 0 6px;">Comments</h4>
        <div id="comments-list-${post.id}" style="margin-bottom:10px; font-size:14px;"></div>

        <div class="comment-box" style="display:flex; gap:8px;">
          <input id="comment-input-${post.id}" placeholder="Write a comment..." style="flex:1; padding:8px; border-radius:6px; border:1px solid #ddd;">
          <button class="btn" style="padding:6px 12px;" onclick="addComment(${post.id})">Send</button>
        </div>
      </div>
    `;

    postsDiv.appendChild(div);
    loadComments(post.id);
  }
}

/* ===========================================================
   INTERACTIONS
=========================================================== */
async function likePost(postId, likes) {
  if (userLikes.has(postId)) {
    // Unlike post
    await sb.from("post_likes").delete()
      .eq("post_id", postId)
      .eq("user_id", currentUser.id);
    await sb.from("posts").update({ likes: likes - 1 }).eq("id", postId);
  } else {
    // Like post
    await sb.from("post_likes").insert({ post_id: postId, user_id: currentUser.id });
    await sb.from("posts").update({ likes: likes + 1 }).eq("id", postId);
  }

  loadUserLikes();
  loadPosts();
}

async function addComment(postId) {
  const box = el(`comment-input-${postId}`);
  const text = box.value.trim();
  if (!text) return;

  await sb.from("comments").insert({
    post_id: postId,
    user_id: currentUser.id,
    user_name: currentUser.email.split("@")[0],
    comment: text
  });

  box.value = "";
  loadComments(postId);
}

async function loadComments(postId) {
  const { data } = await sb
    .from("comments")
    .select("*")
    .eq("post_id", postId)
    .order("created_at");

  const container = el(`comments-list-${postId}`);
  container.innerHTML = "";

  for (const c of data) {
    const div = document.createElement("div");
    div.style.marginBottom = "8px";
    div.style.padding = "8px";
    div.style.background = "var(--hover)";
    div.style.borderRadius = "8px";
    div.innerHTML = `
      <div style="display:flex; justify-content:space-between; margin-bottom:4px;">
        <strong>${c.user_name}</strong>
        <span style="font-size:11px; color:var(--muted);">${formatRelativeTime(c.created_at)}</span>
      </div>
      <span>${c.comment}</span>
    `;
    container.appendChild(div);
  }
}

function toggleComments(id) {
  const section = el(`comments-${id}`);
  section.style.display = section.style.display === "none" ? "block" : "none";
}

/* ===========================================================
   CAMERA
=========================================================== */
let cameraStream = null;

async function openCamera() {
  if (!el("cameraPreview")) return alert("Camera UI missing");
  
  el("cameraPreview").style.display = "flex";
  const video = el("cameraVideo");

  try {
    cameraStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user" },
        audio: false
    });
    video.srcObject = cameraStream;
  } catch (e) {
      alert("Camera access denied or unavailable");
      el("cameraPreview").style.display = "none";
  }
}

function closeCamera() {
  if (cameraStream) {
    cameraStream.getTracks().forEach(t => t.stop());
  }
  if (el("cameraPreview")) el("cameraPreview").style.display = "none";
}

function capturePhoto() {
  const video = el("cameraVideo");
  const canvas = el("photoCanvas");
  
  if (!video || !canvas) return;

  const ctx = canvas.getContext("2d");
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  ctx.drawImage(video, 0, 0);

  canvas.toBlob(blob => {
    const file = new File([blob], `photo_${Date.now()}.png`, { type: "image/png" });

    const dt = new DataTransfer();
    dt.items.add(file);
    
    // Set file to input
    if (el("mediaFile")) el("mediaFile").files = dt.files;

    closeCamera();
    
    // Open Create Post Modal
    const box = el("createPostBox");
    if (box) box.classList.remove("hidden");
  });
}

/* ===========================================================
   MODERN MESSENGER SYSTEM
=========================================================== */
if (el("inboxBtn")) el("inboxBtn").addEventListener("click", openMessenger);

function openMessenger() {
  el("messenger").style.display = "flex";
  loadUserList();
  subscribeMessages();
}

function closeMessenger() {
  el("messenger").style.display = "none";
  activeChatUser = null;

  if (msgSub) {
    msgSub.unsubscribe();
    msgSub = null;
  }
}

async function loadUserList() {
  const { data } = await sb.from("profiles").select("*").neq("id", currentUser.id);

  const list = el("userList");
  list.innerHTML = "";

  data.forEach(u => {
    const row = document.createElement("div");
    row.className = "user-item";
    row.onclick = () => openChat(u);
    
    // Get last message for preview
    getLastMessage(u.id).then(lastMsg => {
      const avatarHTML = u.avatar_url 
        ? `<img src="${u.avatar_url}" alt="${u.username}">` 
        : u.username.charAt(0).toUpperCase();
      
      const lastMsgPreview = lastMsg 
        ? `<p>${lastMsg.message.length > 30 ? lastMsg.message.substring(0, 30) + '...' : lastMsg.message}</p>`
        : '<p>No messages yet</p>';
      
      row.innerHTML = `
        <div class="user-avatar">
          ${avatarHTML}
        </div>
        <div class="user-info">
          <h4>${u.username}</h4>
          ${lastMsgPreview}
        </div>
        <div class="user-status online"></div>
      `;
    });
    
    list.appendChild(row);
  });
}

async function getLastMessage(userId) {
  const { data } = await sb
    .from("messages")
    .select("*")
    .or(`and(sender_id.eq.${currentUser.id},receiver_id.eq.${userId}),and(sender_id.eq.${userId},receiver_id.eq.${currentUser.id})`)
    .order("created_at", { ascending: false })
    .limit(1);
  
  return data?.[0] || null;
}

async function openChat(user) {
  activeChatUser = user;
  
  // Update chat header
  el("chatUserName").textContent = user.username;
  el("chatUserStatus").textContent = "Online";
  
  const avatarHTML = user.avatar_url 
    ? `<img src="${user.avatar_url}" alt="${user.username}">` 
    : user.username.charAt(0).toUpperCase();
  
  el("chatAvatar").innerHTML = avatarHTML;
  
  // Clear and load messages
  el("messagesList").innerHTML = "";
  
  const { data } = await sb
    .from("messages")
    .select("*")
    .or(`and(sender_id.eq.${currentUser.id},receiver_id.eq.${user.id}),and(sender_id.eq.${user.id},receiver_id.eq.${currentUser.id})`)
    .order("created_at", { ascending: true });

  if (data && data.length > 0) {
    data.forEach(renderMessage);
  } else {
    el("messagesList").innerHTML = `
      <div class="welcome-message" style="text-align:center;padding:40px 20px;color:var(--muted);">
        <i class="fas fa-comments" style="font-size:48px;margin-bottom:16px;opacity:0.5;"></i>
        <h3 style="margin:0 0 8px 0;">No messages yet</h3>
        <p>Send your first message to ${user.username}</p>
      </div>
    `;
  }
  
  // Mark user as active in list
  document.querySelectorAll('.user-item').forEach(item => {
    item.classList.remove('active');
    if (item.querySelector('h4')?.textContent === user.username) {
      item.classList.add('active');
    }
  });
}

function renderMessage(msg) {
  const welcomeMsg = document.querySelector('.welcome-message');
  if (welcomeMsg) welcomeMsg.remove();
  
  const div = document.createElement("div");
  div.className = "msg" + (msg.sender_id === currentUser.id ? " me" : " other");
  
  const time = formatMessageTime(msg.created_at);
  
  div.innerHTML = `
    <div>${msg.message}</div>
    <div class="msg-time">${time}</div>
  `;
  
  el("messagesList").appendChild(div);
  el("messagesList").scrollTop = el("messagesList").scrollHeight;
}

async function sendMessage() {
  const input = el("messageInput");
  const text = input.value.trim();
  if (!text || !activeChatUser) return;

  const btn = input.nextElementSibling;
  btn.disabled = true;
  btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';

  try {
    const { error } = await sb.from("messages").insert({
      sender_id: currentUser.id,
      receiver_id: activeChatUser.id,
      message: text
    });

    if (error) throw error;

    input.value = "";
    input.style.height = 'auto';
    
    // Refresh user list to update last message preview
    loadUserList();
  } catch (err) {
    console.error(err);
    alert("Failed to send message. Please try again.");
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<i class="fas fa-paper-plane"></i>';
  }
}

function subscribeMessages() {
  if (msgSub) return;

  msgSub = sb.channel("messages")
    .on("postgres_changes",
      { event: "INSERT", schema: "public", table: "messages" },
      async (payload) => {
        const msg = payload.new;
        if (!activeChatUser) {
          // Refresh user list for new message indicators
          loadUserList();
          return;
        }
        
        const isBetween =
          (msg.sender_id === currentUser.id && msg.receiver_id === activeChatUser.id) ||
          (msg.sender_id === activeChatUser.id && msg.receiver_id === currentUser.id);

        if (isBetween) {
          renderMessage(msg);
        }
      })
    .subscribe();
}

// Auto-resize textarea
if (el("messageInput")) {
  el("messageInput").addEventListener("input", function() {
    this.style.height = 'auto';
    this.style.height = (this.scrollHeight) + 'px';
  });
  
  // Send message on Enter (but allow Shift+Enter for new line)
  el("messageInput").addEventListener("keydown", function(e) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  });
}

// Contact search functionality
if (el("searchContacts")) {
  el("searchContacts").addEventListener("input", function() {
    const searchTerm = this.value.toLowerCase();
    const users = document.querySelectorAll('.user-item');
    
    users.forEach(user => {
      const username = user.querySelector('h4')?.textContent.toLowerCase() || '';
      const shouldShow = username.includes(searchTerm);
      user.style.display = shouldShow ? 'flex' : 'none';
    });
  });
}

/* ===========================================================
   INIT
=========================================================== */
loadUser();
