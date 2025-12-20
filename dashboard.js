// dashboard.js
// --------------- Supabase config ---------------
const SUPABASE_URL = "https://ojjvkhafgurgondsopeh.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9qanZraGFmZ3VyZ29uZHNvcGVoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQ5MDkzODYsImV4cCI6MjA4MDQ4NTM4Nn0.hOLxBVqnFhJ2S1jjR0mkKUJ_bWDjZbHJD3wV0Rbbf7A";

const supabase = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// state
let currentUser = null;
let userLikes = new Set();
let messageSubscription = null;
let activeChatUser = null; // { id, username, avatar_url }

// ---------- Utilities ----------
function el(id){ return document.getElementById(id); }
function formatTime(ts){
  try { return new Date(ts).toLocaleString(); } catch(e){ return ""; }
}

// ---------- Load session & profile ----------
async function loadUser(){
  const { data, error } = await supabase.auth.getUser();
  if (error) { console.error(error); }
  if (!data?.user) {
    alert("You must be logged in!");
    window.location.href = "login.html";
    return;
  }
  currentUser = data.user;
  await ensureProfileExists();
  await loadProfilePanel();
  await loadUserLikes();
  loadPosts();
}

async function ensureProfileExists(){
  // If profiles row doesn't exist, create one with default username (email prefix)
  const { data } = await supabase
    .from("profiles")
    .select("id")
    .eq("id", currentUser.id)
    .maybeSingle();

  if (!data) {
    const username = currentUser.email ? currentUser.email.split("@")[0] : "user";
    await supabase.from("profiles").insert({ id: currentUser.id, username });
  }
}

async function loadProfilePanel(){
  const { data } = await supabase
    .from("profiles")
    .select("username, avatar_url")
    .eq("id", currentUser.id)
    .single();

  const username = data?.username || (currentUser.email ? currentUser.email.split("@")[0] : "User");
  const avatarUrl = data?.avatar_url || null;

  el("profileUsername").textContent = username;
  el("avatarInitial").textContent = username.charAt(0).toUpperCase();

  if (avatarUrl) {
    const img = document.createElement("img");
    img.src = avatarUrl;
    img.alt = "avatar";
    const container = el("profileAvatar");
    container.innerHTML = "";
    container.appendChild(img);
  }
}

// avatar input handler
el("avatarInput").addEventListener("change", async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const fileName = `${currentUser.id}_${Date.now()}_${file.name}`;
  const { data, error } = await supabase.storage.from("avatars").upload(fileName, file, { cacheControl: "3600", upsert: false });
  if (error) {
    console.error("Avatar upload error", error);
    alert("Failed to upload avatar");
    return;
  }
  const publicUrl = `${SUPABASE_URL}/storage/v1/object/public/avatars/${encodeURIComponent(data.path)}`;
  // update profile
  const { error: up } = await supabase.from("profiles").update({ avatar_url: publicUrl }).eq("id", currentUser.id);
  if (up) {
    console.error(up);
    alert("Failed to save avatar URL");
    return;
  }
  await loadProfilePanel();
  loadPosts(); // refresh feed to show avatar
});

// ---------- Posts (create, load) ----------
async function createPost(){
  const caption = el("caption").value.trim();
  const media = el("mediaFile").files[0];
  if (!caption && !media) { alert("Write something or upload media"); return; }

  let mediaUrl = null, mediaType = null;
  if (media) {
    const fileName = `${Date.now()}_${media.name}`;
    const { data, error } = await supabase.storage.from("posts").upload(fileName, media);
    if (error) { console.error(error); alert("Media upload failed"); return; }
    mediaUrl = `${SUPABASE_URL}/storage/v1/object/public/posts/${encodeURIComponent(data.path)}`;
    mediaType = media.type.startsWith("video") ? "video" : "image";
  }

  const userName = (currentUser.email ? currentUser.email.split("@")[0] : "user");
  const { error } = await supabase.from("posts").insert([{
    user_id: currentUser.id, user_name: userName, caption, media_url: mediaUrl, media_type: mediaType, likes: 0
  }]);
  if (error) { console.error(error); alert("Failed to create post"); return; }

  el("caption").value = "";
  el("mediaFile").value = "";
  el("createPostBox").classList.add("hidden");
  loadPosts();
}

async function loadUserLikes(){
  if (!currentUser) return;
  const { data } = await supabase.from("post_likes").select("post_id").eq("user_id", currentUser.id);
  userLikes = new Set((data || []).map(d => d.post_id));
}

async function loadPosts(){
  const postsDiv = el("posts");
  postsDiv.innerHTML = "<div class='post-box'>Loading posts...</div>";

  const { data: posts, error } = await supabase.from("posts").select("*").order("created_at", { ascending:false });
  if (error) { postsDiv.innerHTML = "<div class='post-box'>Failed to load posts</div>"; console.error(error); return; }
  postsDiv.innerHTML = "";

  for (const post of posts) {
    let userName = post.user_name || "User";
    let avatarHTML = `<div class="user-avatar">${userName.charAt(0).toUpperCase()}</div>`;

    // try to fetch profile avatar if exists
    if (post.user_id) {
      const { data: profile } = await supabase.from("profiles").select("avatar_url,username").eq("id", post.user_id).maybeSingle();
      if (profile?.avatar_url) {
        avatarHTML = `<div class="user-avatar"><img src="${profile.avatar_url}" style="width:40px;height:40px;border-radius:50%;object-fit:cover;"></div>`;
        userName = profile.username || userName;
      } else if (profile?.username) {
        userName = profile.username;
      }
    }

    let mediaHTML = "";
    if (post.media_type === "image" && post.media_url) mediaHTML = `<img src="${post.media_url}" alt="post image" style="width:100%;border-radius:8px;margin-top:8px;max-height:500px;object-fit:cover;">`;
    if (post.media_type === "video" && post.media_url) mediaHTML = `<video src="${post.media_url}" controls style="width:100%;border-radius:8px;margin-top:8px;max-height:400px;"></video>`;

    const hasLiked = userLikes.has(post.id);
    const likeBtn = `<button class="${hasLiked ? 'liked' : ''}" onclick="likePost(${post.id}, ${post.likes})">${hasLiked ? '❤️' : '🤍'} Like (${post.likes})</button>`;

    const postHtml = document.createElement("div");
    postHtml.className = "post";
    postHtml.id = `post-${post.id}`;
    postHtml.innerHTML = `
      <div class="post-header">
        ${avatarHTML}
        <div style="display:flex;flex-direction:column;">
          <div style="font-weight:600;">${userName}</div>
          <div style="font-size:12px;color:#666;">${formatTime(post.created_at)}</div>
        </div>
      </div>
      <p style="margin-top:10px;">${post.caption || ""}</p>
      ${mediaHTML}
      <div class="actions">
        ${likeBtn}
        <button onclick="toggleComments(${post.id})">💬 Comments</button>
      </div>
      <div class="comments-section" id="comments-${post.id}" style="display:none;">
        <h4>Comments</h4>
        <div id="comments-list-${post.id}"></div>
        <div class="comment-box" style="display:flex;gap:8px;margin-top:8px;">
          <input type="text" id="comment-input-${post.id}" placeholder="Write a comment..." style="flex:1;padding:8px;border-radius:8px;border:1px solid #ddd;">
          <button onclick="addComment(${post.id})">Send</button>
        </div>
      </div>
    `;
    postsDiv.appendChild(postHtml);
    loadComments(post.id);
  }
}

// like post
async function likePost(postId, currentLikes){
  if (!currentUser) { alert("Please login"); return; }
  if (userLikes.has(postId)) { alert("You already liked this post"); return; }

  const { error: likeError } = await supabase.from("post_likes").insert([{ post_id: postId, user_id: currentUser.id }]);
  if (likeError) { console.error(likeError); return; }

  const { error } = await supabase.from("posts").update({ likes: currentLikes + 1 }).eq("id", postId);
  if (!error) {
    userLikes.add(postId);
    loadPosts();
  }
}

// comments (same as before)
async function addComment(postId){ /* keep original implementation */
  const inp = el(`comment-input-${postId}`);
  if (!inp) return;
  const commentText = inp.value.trim();
  if (!commentText) return;
  const userName = (currentUser.email ? currentUser.email.split("@")[0] : "user");
  const { error } = await supabase.from("comments").insert([{ post_id: postId, user_id: currentUser.id, user_name: userName, comment: commentText }]);
  if (error) { console.error(error); alert("Failed to add comment"); return; }
  inp.value = "";
  loadComments(postId);
}
async function loadComments(postId){
  const commentList = el(`comments-list-${postId}`);
  if (!commentList) return;
  const { data: comments } = await supabase.from("comments").select("*").eq("post_id", postId).order("created_at", { ascending:true });
  commentList.innerHTML = "";
  if (!comments || comments.length === 0) return;
  comments.forEach(c => {
    const userName = c.user_name || (c.user_id ? c.user_id.slice(0,8) : "User");
    const div = document.createElement("div");
    div.className = "comment";
    div.style.marginBottom = "8px";
    div.innerHTML = `<div style="font-weight:600;">${userName}</div><div>${c.comment}</div>`;
    commentList.appendChild(div);
  });
}

// toggle comments
function toggleComments(postId){
  const section = el(`comments-${postId}`);
  if (!section) return;
  section.style.display = section.style.display === "none" ? "block" : "none";
}

// ---------- Camera (same) ----------
let cameraStream = null;
async function openCamera(){
  try {
    el("cameraPreview").style.display = "flex";
    const video = el("cameraVideo");
    cameraStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user" }, audio:false });
    video.srcObject = cameraStream;
  } catch (err) { alert("Could not access camera: " + err.message); }
}
function closeCamera(){
  if (cameraStream) {
    cameraStream.getTracks().forEach(t => t.stop());
    cameraStream = null;
  }
  el("cameraPreview").style.display = "none";
}
function capturePhoto(){
  const video = el("cameraVideo");
  const canvas = el("photoCanvas");
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  const ctx = canvas.getContext("2d");
  ctx.drawImage(video,0,0,canvas.width,canvas.height);
  canvas.toBlob(blob => {
    const file = new File([blob], `photo_${Date.now()}.png`, { type: "image/png" });
    const dt = new DataTransfer();
    dt.items.add(file);
    el("mediaFile").files = dt.files;
    el("createPostBox").classList.remove("hidden");
    el("createPostBox").scrollIntoView({ behavior:"smooth" });
    closeCamera();
  }, "image/png");
}

// ---------- Messenger (full-screen) ----------
el("inboxBtn").addEventListener("click", openMessenger);

async function openMessenger(){
  el("messenger").style.display = "flex";
  el("messengerUserName").textContent = (currentUser?.email ? currentUser.email.split("@")[0] : "");
  await loadUserList();
  subscribeToMessages();
}

function closeMessenger(){
  el("messenger").style.display = "none";
  // unsubscribe from real-time channel if desired
  if (messageSubscription && typeof messageSubscription.unsubscribe === "function"){
    messageSubscription.unsubscribe();
    messageSubscription = null;
  }
  activeChatUser = null;
  el("messagesList").innerHTML = "";
}

// load list of registered users (excluding the currentUser)
async function loadUserList(){
  const { data: users, error } = await supabase.from("profiles").select("id, username, avatar_url").neq("id", currentUser.id);
  if (error) { console.error(error); return; }
  const list = el("userList");
  list.innerHTML = "";
  (users || []).forEach(u => {
    const row = document.createElement("div");
    row.style.display = "flex"; row.style.gap = "10px"; row.style.alignItems = "center"; row.style.padding = "8px"; row.style.cursor = "pointer";
    row.onmouseover = () => row.style.background = "#f7f7f7";
    row.onmouseout = () => row.style.background = "transparent";
    row.onclick = () => openChatWith(u);
    row.innerHTML = `
      <div style="width:42px;height:42px;border-radius:50%;overflow:hidden;background:#4a90e2;">
        ${u.avatar_url ? `<img src="${u.avatar_url}" style="width:42px;height:42px;object-fit:cover;">` : `<div style="width:42px;height:42px;display:flex;align-items:center;justify-content:center;color:#fff;font-weight:700;">${(u.username||'U').charAt(0).toUpperCase()}</div>`}
      </div>
      <div>
        <div style="font-weight:600;">${u.username || u.id.slice(0,8)}</div>
        <div style="font-size:12px;color:#666;">Tap to chat</div>
      </div>
    `;
    list.appendChild(row);
  });
}

// open chat with selected user
async function openChatWith(user){
  activeChatUser = user;
  el("messagesList").innerHTML = "";
  // load last 100 messages between currentUser and selected user
  const { data: msgs, error } = await supabase
    .from("messages")
    .select("*")
    .or(`and(sender_id.eq.${currentUser.id},receiver_id.eq.${user.id}),and(sender_id.eq.${user.id},receiver_id.eq.${currentUser.id})`)
    .order("created_at", { ascending: true })
    .limit(500);
  if (error) { console.error(error); return; }
  (msgs || []).forEach(renderMessage);
  // scroll to bottom
  const mlist = el("messagesList");
  setTimeout(()=> mlist.scrollTop = mlist.scrollHeight, 50);
}

// render single message object
function renderMessage(msg){
  const container = el("messagesList");
  const wrapper = document.createElement("div");
  wrapper.className = "msg-row";
  const isMe = msg.sender_id === currentUser.id;
  const box = document.createElement("div");
  box.className = "msg" + (isMe ? " me" : "");
  box.innerHTML = `<div style="font-size:12px;color:inherit">${msg.message}</div><div style="font-size:10px;color:rgba(0,0,0,0.45);margin-top:6px;">${formatTime(msg.created_at)}</div>`;
  wrapper.appendChild(box);
  container.appendChild(wrapper);
  container.scrollTop = container.scrollHeight;
}

// send message
async function sendMessage(){
  const text = el("messageInput").value.trim();
  if (!text || !activeChatUser) return;
  const payload = { sender_id: currentUser.id, receiver_id: activeChatUser.id, message: text };
  const { error } = await supabase.from("messages").insert([payload]);
  if (error) { console.error(error); alert("Failed to send message"); return; }
  el("messageInput").value = "";
  // Note: the realtime subscription will render the incoming message (including this user's new message)
}

// subscribe to messages table (realtime)
function subscribeToMessages(){
  // If already subscribed, skip
  if (messageSubscription) return;

  // create a channel that listens to INSERTs on messages
  // supabase-js v2 channel API:
  messageSubscription = supabase.channel('public:messages')
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, payload => {
      const msg = payload.new;
      // If the message belongs to the current open chat, render it
      const otherId = activeChatUser?.id;
      if (!otherId) return; // no active chat
      const isBetween = (msg.sender_id === currentUser.id && msg.receiver_id === otherId) ||
                        (msg.sender_id === otherId && msg.receiver_id === currentUser.id);
      if (isBetween) renderMessage(msg);
      // optionally highlight new message in user list if needed
    })
    .subscribe(status => {
      // subscription acknowledged
      console.log('messages subscription status:', status);
    });
}

// ---------- Initialization ----------
loadUser();

// expose some functions to the window so inline onclick in HTML works
window.toggleCreatePost = function(){
  const box = el("createPostBox");
  box.classList.toggle("hidden");
  if (!box.classList.contains("hidden")) box.scrollIntoView({ behavior:"smooth" });
};
window.openCamera = openCamera;
window.closeCamera = closeCamera;
window.capturePhoto = capturePhoto;
window.startVoiceCall = function(){ alert("Voice call placeholder"); };
window.startVideoCall = function(){ alert("Video call placeholder"); };
window.createPost = createPost;
window.addComment = addComment;
window.toggleComments = toggleComments;
window.likePost = likePost;

// make sendMessage available globally
window.sendMessage = sendMessage;
window.openMessenger = openMessenger;
window.closeMessenger = closeMessenger;
