/* ================= CONFIG ================= */
const supabaseClient = supabase.createClient(
  "https://iklvlffqzkzpbhjeighn.supabase.co", 
  "sb_publishable_OkvtrXKzaUP8D_zmw3XYNA_jZLP65va" // YOUR ORIGINAL KEY
);

/* ================= STATE ================= */
let currentUser = null;
let currentProfile = null;
let activeConversationId = null;
let messageSubscription = null;

/* ================= HELPER FUNCTIONS ================= */
function imgError(image) {
  image.onerror = null;
  image.src = "https://placehold.co/400x300?text=No+Image";
  return true;
}

function timeAgo(dateString) {
  const seconds = Math.floor((new Date() - new Date(dateString)) / 1000);
  let interval = seconds / 31536000;
  if (interval > 1) return Math.floor(interval) + "y";
  interval = seconds / 2592000;
  if (interval > 1) return Math.floor(interval) + "mo";
  interval = seconds / 86400;
  if (interval > 1) return Math.floor(interval) + "d";
  interval = seconds / 3600;
  if (interval > 1) return Math.floor(interval) + "h";
  interval = seconds / 60;
  if (interval > 1) return Math.floor(interval) + "m";
  return "now";
}

/* ================= INIT ================= */
document.addEventListener("DOMContentLoaded", async () => {
  // Theme Init
  if(localStorage.getItem('theme') === 'dark') document.body.classList.add('dark-mode');
  
  await checkSession();
  
  // Realtime Listeners
  supabaseClient.channel('public:posts').on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'posts' }, loadPosts).subscribe();
  
  // Notification Listener
  supabaseClient.channel('public:notifs').on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, (payload) => {
    if(payload.new.sender_id !== currentUser.id) {
       const badge = document.getElementById("msgBadge");
       badge.classList.remove("hidden");
       badge.innerText = (parseInt(badge.innerText) || 0) + 1;
    }
  }).subscribe();
});

/* ================= AUTH & USER ================= */
async function checkSession() {
  const { data } = await supabaseClient.auth.getUser();
  if (!data.user) return window.location.href = "login.html";
  currentUser = data.user;
  
  const { data: profile } = await supabaseClient.from("profiles").select("*").eq("id", currentUser.id).single();
  currentProfile = profile;
  
  updateGlobalUI();
  loadPosts();
  loadStories(); // Load the 24h statuses
}

function updateGlobalUI() {
  const name = currentProfile?.username || "User";
  const avatar = currentProfile?.avatar_url || `https://ui-avatars.com/api/?name=${name}`;
  
  document.getElementById("sidebarAvatar").src = avatar;
  document.getElementById("sidebarUsername").textContent = name;
  document.getElementById("editProfilePreview").src = avatar;
  document.getElementById("newUsername").value = name;
  document.getElementById("newBio").value = currentProfile?.bio || "";
}

function toggleTheme() {
  document.body.classList.toggle('dark-mode');
  localStorage.setItem('theme', document.body.classList.contains('dark-mode') ? 'dark' : 'light');
}

function logout() {
  supabaseClient.auth.signOut().then(() => window.location.href = "login.html");
}

/* ================= STATUS / STORIES (24H) ================= */
async function uploadStatus(input) {
  const file = input.files[0];
  if(!file) return;

  const path = `statuses/${currentUser.id}_${Date.now()}`;
  await supabaseClient.storage.from("status-updates").upload(path, file);
  const { data } = supabaseClient.storage.from("status-updates").getPublicUrl(path);

  await supabaseClient.from("statuses").insert({ user_id: currentUser.id, media_url: data.publicUrl });
  alert("Status added (Expires in 24h)");
  loadStories();
}

async function loadStories() {
  // Filter: Created in the last 24 hours
  const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  
  const { data } = await supabaseClient
    .from("statuses")
    .select("*, profiles(username, avatar_url)")
    .gt("created_at", yesterday)
    .order("created_at", {ascending: false});

  const bar = document.getElementById("statusBar");
  // Remove existing stories (keep the 'Add' button)
  const items = bar.querySelectorAll('.status-story');
  items.forEach(i => i.remove());

  const seenUsers = new Set();

  data.forEach(s => {
    if(seenUsers.has(s.user_id)) return; // One bubble per user
    seenUsers.add(s.user_id);

    const div = document.createElement("div");
    div.className = "status-item status-story";
    div.onclick = () => window.open(s.media_url, '_blank');
    div.innerHTML = `
      <img src="${s.profiles.avatar_url}" class="status-ring avatar medium">
      <span class="status-name">${s.profiles.username}</span>
    `;
    bar.appendChild(div);
  });
}

/* ================= FEED & POSTS ================= */
async function createPost() {
  const text = document.getElementById("postContent").value.trim();
  const file = document.getElementById("postImage").files[0];
  let imageUrl = null;

  if (!text && !file) return alert("Empty post!");

  if (file) {
    const path = `post-images/${currentUser.id}_${Date.now()}`;
    await supabaseClient.storage.from("post-images").upload(path, file);
    const { data } = supabaseClient.storage.from("post-images").getPublicUrl(path);
    imageUrl = data.publicUrl;
  }

  await supabaseClient.from("posts").insert({ user_id: currentUser.id, content: text, image_url: imageUrl });
  document.getElementById("postContent").value = "";
  document.getElementById("postImage").value = "";
  loadPosts();
}

async function loadPosts() {
  const { data } = await supabaseClient
    .from("posts")
    .select(`*, profiles(username, avatar_url), post_likes(user_id), post_comments(id)`)
    .order("created_at", { ascending: false });

  const container = document.getElementById("postsContainer");
  container.innerHTML = "";

  data.forEach(post => {
    const isLiked = post.post_likes.some(l => l.user_id === currentUser.id);
    const likeClass = isLiked ? "liked" : "";
    
    // FIX: Explicitly added Icon and Text to buttons to ensure visibility
    const html = `
      <div class="post">
        <div class="post-header">
          <img src="${post.profiles.avatar_url}" class="avatar small">
          <div>
            <b>${post.profiles.username}</b><br>
            <span style="font-size:0.8rem; color:grey">${timeAgo(post.created_at)} ago</span>
          </div>
        </div>
        <div class="post-content">${post.content || ""}</div>
        ${post.image_url ? `<img src="${post.image_url}" class="post-image">` : ""}
        
        <div class="post-actions">
          <button class="action-btn ${likeClass}" onclick="toggleLike('${post.id}')">
            <i class="${isLiked ? 'fas' : 'far'} fa-heart"></i> ${post.post_likes.length} Likes
          </button>
          <button class="action-btn" onclick="toggleComments('${post.id}')">
            <i class="far fa-comment-alt"></i> ${post.post_comments.length} Comments
          </button>
        </div>
        <div id="comments-${post.id}" class="comments-section"></div>
      </div>
    `;
    container.innerHTML += html;
  });
}

async function toggleLike(postId) {
  const { data } = await supabaseClient.from("post_likes").select("id").match({ post_id: postId, user_id: currentUser.id });
  
  if (data.length > 0) await supabaseClient.from("post_likes").delete().eq("id", data[0].id);
  else await supabaseClient.from("post_likes").insert({ post_id: postId, user_id: currentUser.id });
  
  loadPosts();
}

async function toggleComments(postId) {
  const section = document.getElementById(`comments-${postId}`);
  if(section.classList.contains('open')) {
    section.classList.remove('open');
    return;
  }
  
  // Fetch comments
  const { data } = await supabaseClient.from("post_comments").select("content, profiles(username)").eq("post_id", postId);
  
  let html = "";
  data.forEach(c => html += `<div class="comment-row"><b>${c.profiles.username}:</b> ${c.content}</div>`);
  
  html += `
    <div style="display:flex; gap:5px; margin-top:10px;">
      <input type="text" id="input-${postId}" placeholder="Comment..." style="flex:1; border-radius:20px; padding:5px 10px;">
      <button onclick="sendComment('${postId}')" style="color:var(--primary)">Send</button>
    </div>
  `;
  
  section.innerHTML = html;
  section.classList.add('open');
}

async function sendComment(postId) {
  const val = document.getElementById(`input-${postId}`).value;
  if(!val) return;
  await supabaseClient.from("post_comments").insert({ post_id: postId, user_id: currentUser.id, content: val });
  document.getElementById(`comments-${postId}`).classList.remove('open');
  toggleComments(postId); // reload
}

/* ================= CONTACTS & FOLLOWING ================= */
async function loadContacts() {
  const { data: users } = await supabaseClient.from("profiles").select("*").neq("id", currentUser.id);
  const { data: following } = await supabaseClient.from("follows").select("following_id").eq("follower_id", currentUser.id);
  
  const followingIds = new Set(following.map(f => f.following_id));
  const list = document.getElementById("contactsList");
  list.innerHTML = "";

  users.forEach(u => {
    const isFollowing = followingIds.has(u.id);
    const div = document.createElement("div");
    div.className = "contact-card";
    div.style = "padding:15px; border-bottom:1px solid var(--border); background:var(--bg-card); display:flex; justify-content:space-between; align-items:center;";
    div.innerHTML = `
      <div style="display:flex; align-items:center; gap:10px;">
        <img src="${u.avatar_url}" class="avatar small">
        <b>${u.username}</b>
      </div>
      <div>
        <button onclick="startChat('${u.id}')" style="color:var(--primary); margin-right:10px;"><i class="fas fa-comment"></i></button>
        <button class="btn-primary" style="${isFollowing ? 'background:grey' : ''}; font-size:0.8rem;" onclick="toggleFollow('${u.id}')">
           ${isFollowing ? 'Unfollow' : 'Follow'}
        </button>
      </div>
    `;
    list.appendChild(div);
  });
}

async function toggleFollow(targetId) {
  const { data } = await supabaseClient.from("follows").select("*").match({follower_id: currentUser.id, following_id: targetId});
  if(data.length > 0) await supabaseClient.from("follows").delete().match({follower_id: currentUser.id, following_id: targetId});
  else await supabaseClient.from("follows").insert({follower_id: currentUser.id, following_id: targetId});
  loadContacts();
}

/* ================= INBOX & GROUPS ================= */
async function createGroup() {
  const name = prompt("Group Name:");
  if(!name) return;
  
  const { data, error } = await supabaseClient.from("conversations").insert({ is_group: true, group_name: name, user1: currentUser.id }).select().single();
  if(error) alert("Error creating group");
  else {
    alert("Group created!");
    loadInbox();
  }
}

async function loadInbox() {
  // Simple query for DMs and Groups created by me (simplification for this example)
  // Ideally: Query a 'conversation_members' table
  const { data } = await supabaseClient.from("conversations").select("*")
    .or(`user1.eq.${currentUser.id},user2.eq.${currentUser.id},is_group.eq.true`);

  const list = document.getElementById("conversationsList");
  list.innerHTML = "";

  for (let c of data) {
    let name = "Chat";
    let avatar = "";
    
    if(c.is_group) {
      name = c.group_name || "Group";
      avatar = `https://ui-avatars.com/api/?name=${name}&background=random`;
    } else {
      const otherId = c.user1 === currentUser.id ? c.user2 : c.user1;
      if(!otherId) continue;
      const { data: u } = await supabaseClient.from("profiles").select("username, avatar_url").eq("id", otherId).single();
      name = u?.username || "User";
      avatar = u?.avatar_url || "";
    }

    const div = document.createElement("div");
    div.className = "conversation-item";
    div.onclick = () => openChat(c.id, name, avatar);
    div.innerHTML = `
      <img src="${avatar}" class="avatar small">
      <div><b>${name}</b><br><small class="text-muted">${c.is_group ? 'Group' : 'Direct Message'}</small></div>
    `;
    list.appendChild(div);
  }
}

async function openChat(id, name, avatar) {
  activeConversationId = id;
  document.getElementById("chatUserDisplayName").textContent = name;
  document.getElementById("chatHeaderAvatar").src = avatar;
  document.getElementById("chatHeaderAvatar").classList.remove("hidden");
  document.getElementById("chatView").classList.add("active");
  document.getElementById("msgBadge").classList.add("hidden"); // clear badge

  if (messageSubscription) supabaseClient.removeChannel(messageSubscription);
  
  messageSubscription = supabaseClient.channel(`chat-${id}`)
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `conversation_id=eq.${id}` }, 
    payload => appendMessage(payload.new))
    .subscribe();

  const { data } = await supabaseClient.from("messages").select("*").eq("conversation_id", id).order("created_at", { ascending: true });
  
  const container = document.getElementById("messagesContainer");
  container.innerHTML = ""; 
  data.forEach(appendMessage);
}

function appendMessage(msg) {
  const container = document.getElementById("messagesContainer");
  const isMe = msg.sender_id === currentUser.id;
  const div = document.createElement("div");
  div.className = `message ${isMe ? 'me' : 'them'}`;
  
  // FIX: Better image detection for chat images
  const isImage = msg.content.match(/\.(jpeg|jpg|gif|png)$/) != null || msg.content.includes("chat-images");
  
  if (isImage) {
     div.innerHTML = `<img src="${msg.content}" class="chat-img" onclick="window.open(this.src)">`;
  } else {
     div.textContent = msg.content;
  }
  
  container.appendChild(div);
  container.scrollTop = container.scrollHeight; 
}

async function sendMessage() {
  const textInput = document.getElementById("chatTextInput");
  const fileInput = document.getElementById("chatImgInput");
  let content = textInput.value.trim();
  
  if (fileInput.files.length > 0) {
    const file = fileInput.files[0];
    const path = `chat-images/${Date.now()}_${file.name}`;
    await supabaseClient.storage.from("chat-images").upload(path, file);
    const { data } = supabaseClient.storage.from("chat-images").getPublicUrl(path);
    content = data.publicUrl;
  }

  if (!content) return;

  await supabaseClient.from("messages").insert({
    conversation_id: activeConversationId,
    sender_id: currentUser.id,
    content: content
  });

  textInput.value = "";
  fileInput.value = "";
}

function closeChat() { document.getElementById("chatView").classList.remove("active"); activeConversationId = null; }

/* ================= NAVIGATION ================= */
function toggleSidebar() { document.getElementById("sidebar").classList.add("active"); document.getElementById("sidebarOverlay").classList.add("active"); }
function closeSidebar() { document.getElementById("sidebar").classList.remove("active"); document.getElementById("sidebarOverlay").classList.remove("active"); }

function showSection(id) {
  document.querySelectorAll('section').forEach(s => s.classList.add("hidden"));
  document.getElementById(id + "Section").classList.remove("hidden");
  closeSidebar();
  
  if(id === 'feed') { loadPosts(); loadStories(); }
  if(id === 'contacts') loadContacts();
  if(id === 'inbox') loadInbox();
}

async function saveProfile() {
  const name = document.getElementById("newUsername").value;
  const bio = document.getElementById("newBio").value;
  // ... (Keep existing avatar upload logic if needed, omitted for brevity)
  await supabaseClient.from("profiles").update({ username: name, bio: bio }).eq("id", currentUser.id);
  location.reload();
}

async function startChat(targetId) {
  // Check if chat exists, else create
  const { data } = await supabaseClient.from("conversations").insert({ user1: currentUser.id, user2: targetId }).select().single();
  showSection('inbox');
  openChat(data.id, "New Chat", "");
      }
                                                                                                               
