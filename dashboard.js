/* ===========================================================
   SUPABASE CLIENT
=========================================================== */
const SUPABASE_URL = "https://ojjvkhafgurgondsopeh.supabase.co";
// Note: Ensure this is your ANON key, not service_role
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9qanZraGFmZ3VyZ29uZHNvcGVoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQ5MDkzODYsImV4cCI6MjA4MDQ4NTM4Nn0.hOLxBVqnFhJ2S1jjR0mkKUJ_bWDjZbHJD3wV0Rbbf7A";

const sb = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

/* ===========================================================
   GLOBAL STATE
=========================================================== */
let currentUser = null;
let userLikes = new Set();
let activeChatUser = null;
let msgSub = null;

/* ===========================================================
   SHORTCUT
=========================================================== */
function el(id) { return document.getElementById(id); }

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
    // Clear initial and add image
    el("profileAvatar").innerHTML = "";
    el("profileAvatar").appendChild(img);
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
   CREATE POST
=========================================================== */
async function createPost() {
  const caption = el("caption").value.trim(); // Ensure this ID exists in HTML, otherwise use prompt or add input
  // Note: Your HTML didn't explicitly show 'caption' ID in the snippet provided, 
  // but this logic assumes a create post form exists or uses the hidden one.
  // If using the hidden box, ensure inputs match IDs.
  
  // Based on your code structure, assuming 'mediaFile' is the file input
  const media = el("mediaFile") ? el("mediaFile").files[0] : null; 

  // Since the provided HTML has a "Create Post" button calling toggleCreatePost(), 
  // but the modal content wasn't fully visible in the snippet, 
  // ensure you have <input id="caption"> and <input type="file" id="mediaFile"> in your HTML.
  
  // For safety in this "clean" version, I will assume the elements exist as per your original JS.
  if (!el("caption")) return alert("Missing caption input in HTML");

  const capVal = el("caption").value.trim();
  
  if (!capVal && !media) {
    return alert("Write something or upload media");
  }

  let mediaUrl = null;
  let mediaType = null;

  if (media) {
    const path = `${Date.now()}_${media.name}`;
    const { data, error } = await sb
      .storage.from("posts")
      .upload(path, media);

    if (error) return alert("Upload failed");

    mediaUrl = `${SUPABASE_URL}/storage/v1/object/public/posts/${encodeURIComponent(data.path)}`;
    mediaType = media.type.startsWith("video") ? "video" : "image";
  }

  await sb.from("posts").insert({
    user_id: currentUser.id,
    user_name: currentUser.email.split("@")[0],
    caption: capVal,
    media_url: mediaUrl,
    media_type: mediaType,
    likes: 0
  });

  el("caption").value = "";
  if(el("mediaFile")) el("mediaFile").value = "";
  el("createPostBox").classList.add("hidden");

  loadPosts();
}

/* ===========================================================
   LOAD POSTS (FIXED AVATAR CLASS)
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

    const avatarUrl = prof.data?.avatar_url || null;
    const username = prof.data?.username || post.user_name;

    const div = document.createElement("div");
    div.className = "post";

    // --- FIX APPLIED HERE ---
    // Changed class "user-avatar" to "avatar" to match CSS
    const avatarHTML = avatarUrl
      ? `<div class="avatar"><img src="${avatarUrl}"></div>`
      : `<div class="avatar"><img src=""></div>`; // Placeholder if empty

    let mediaHTML = "";
    if (post.media_type === "image")
      mediaHTML = `<img src="${post.media_url}" style="width:100%;border-radius:8px;margin-top:8px;">`;
    if (post.media_type === "video")
      mediaHTML = `<video src="${post.media_url}" controls style="width:100%;border-radius:8px;margin-top:8px;"></video>`;

    div.innerHTML = `
      <div class="post-header">
        ${avatarHTML}
        <strong>${username}</strong>
      </div>
      <div class="post-content">
        <p>${post.caption || ""}</p>
        ${mediaHTML}
      </div>
      <div class="actions" style="margin:10px 14px;">
        <button class="btn ghost" style="padding:6px 12px; font-size:13px;" onclick="likePost(${post.id}, ${post.likes})">
          ${userLikes.has(post.id) ? "❤️" : "🤍"} Like (${post.likes})
        </button>
        <button class="btn ghost" style="padding:6px 12px; font-size:13px;" onclick="toggleComments(${post.id})">💬 Comments</button>
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
   LIKE POST
=========================================================== */
async function likePost(postId, likes) {
  if (userLikes.has(postId)) return alert("Already liked");

  await sb.from("post_likes").insert({ post_id: postId, user_id: currentUser.id });
  await sb.from("posts").update({ likes: likes + 1 }).eq("id", postId);

  loadUserLikes(); // Refresh local set
  loadPosts();
}

/* ===========================================================
   COMMENTS
=========================================================== */
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
    div.style.marginBottom = "4px";
    div.innerHTML = `<strong>${c.user_name}:</strong> <span>${c.comment}</span>`;
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
  // Ensure the camera preview elements exist in your HTML
  if(!el("cameraPreview")) {
      // If the HTML structure for camera isn't there, we just alert (or you can insert it dynamically)
      // Assuming your HTML has a hidden div for this overlay
      return alert("Camera preview element missing in HTML");
  }
  
  el("cameraPreview").style.display = "flex";
  const video = el("cameraVideo");

  try {
    cameraStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user" },
        audio: false
    });
    video.srcObject = cameraStream;
  } catch(e) {
      alert("Could not access camera");
      el("cameraPreview").style.display = "none";
  }
}

function closeCamera() {
  if (cameraStream) {
    cameraStream.getTracks().forEach(t => t.stop());
  }
  if(el("cameraPreview")) el("cameraPreview").style.display = "none";
}

function capturePhoto() {
  const video = el("cameraVideo");
  const canvas = el("photoCanvas");
  
  if(!video || !canvas) return;

  const ctx = canvas.getContext("2d");
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  ctx.drawImage(video, 0, 0);

  canvas.toBlob(blob => {
    const file = new File([blob], `photo_${Date.now()}.png`, { type: "image/png" });

    const dt = new DataTransfer();
    dt.items.add(file);
    
    // Assign to the file input used by createPost
    if(el("mediaFile")) el("mediaFile").files = dt.files;

    closeCamera();
    
    // Show create post box if it exists
    if(el("createPostBox")) el("createPostBox").classList.remove("hidden");
  });
}

/* ===========================================================
   MESSENGER SYSTEM
=========================================================== */
if(el("inboxBtn")) el("inboxBtn").addEventListener("click", openMessenger);

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
    // Styles handled by CSS class 'user-list > div', but we add specifics here if needed
    
    const initial = u.username.charAt(0).toUpperCase();
    const avatarImg = u.avatar_url 
        ? `<img src="${u.avatar_url}" style="width:100%;height:100%;object-fit:cover;">` 
        : initial;

    row.innerHTML = `
      <div style="width:40px;height:40px;border-radius:50%;overflow:hidden;background:#4a90e2;color:#fff;display:flex;align-items:center;justify-content:center;flex-shrink:0;">
        ${avatarImg}
      </div>
      <strong>${u.username}</strong>
    `;

    row.onclick = () => openChat(u);
    list.appendChild(row);
  });
}

async function openChat(user) {
  activeChatUser = user;
  el("messagesList").innerHTML = "";

  // Note: RLS policies must allow this OR
  const { data } = await sb
    .from("messages")
    .select("*")
    .or(`and(sender_id.eq.${currentUser.id},receiver_id.eq.${user.id}),and(sender_id.eq.${user.id},receiver_id.eq.${currentUser.id})`)
    .order("created_at", { ascending: true });

  if(data) data.forEach(renderMessage);
}

function renderMessage(msg) {
  const div = document.createElement("div");
  div.className = "msg" + (msg.sender_id === currentUser.id ? " me" : "");
  div.textContent = msg.message;
  // Optional: add data-time attribute for CSS
  div.setAttribute("data-time", new Date(msg.created_at).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}));

  el("messagesList").appendChild(div);
  el("messagesList").scrollTop = el("messagesList").scrollHeight;
}

async function sendMessage() {
  const input = el("messageInput");
  const text = input.value.trim();
  if (!text || !activeChatUser) return;

  await sb.from("messages").insert({
    sender_id: currentUser.id,
    receiver_id: activeChatUser.id,
    message: text
  });

  input.value = "";
}

function subscribeMessages() {
  if (msgSub) return;

  msgSub = sb.channel("messages")
    .on("postgres_changes",
      { event: "INSERT", schema: "public", table: "messages" },
      payload => {
        const msg = payload.new;

        if (!activeChatUser) return;
        const isBetween =
          (msg.sender_id === currentUser.id && msg.receiver_id === activeChatUser.id) ||
          (msg.sender_id === activeChatUser.id && msg.receiver_id === currentUser.id);

        if (isBetween) renderMessage(msg);
      })
    .subscribe();
}

/* ===========================================================
   TOGGLE CREATE POST
=========================================================== */
function toggleCreatePost() {
  // Check if the element exists. In your HTML it wasn't explicitly shown but the script referenced it.
  // If it's a modal, ensure <div id="createPostBox" class="hidden">...</div> exists.
  const box = el("createPostBox");
  if(box) box.classList.toggle("hidden");
  else {
      // Fallback if the modal HTML is missing: simple prompt flow
      const cap = prompt("Post Caption:");
      if(cap) {
          // Shim for quick posting without modal
           sb.from("posts").insert({
            user_id: currentUser.id,
            user_name: currentUser.email.split("@")[0],
            caption: cap,
            likes: 0
          }).then(loadPosts);
      }
  }
}

/* ===========================================================
   INIT
=========================================================== */
loadUser();
       
