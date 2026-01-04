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
let selectedGroupUsers = [];

/* ================= HELPER FUNCTIONS ================= */
function imgError(image) {
  image.onerror = null;
  image.src = "https://placehold.co/400x300?text=No+Image";
  return true;
}

function timeAgo(dateString) {
  const date = new Date(dateString);
  const seconds = Math.floor((new Date() - date) / 1000);
  if (seconds > 31536000) return Math.floor(seconds / 31536000) + "y ago";
  if (seconds > 2592000) return Math.floor(seconds / 2592000) + "mo ago";
  if (seconds > 86400) return Math.floor(seconds / 86400) + "d ago";
  if (seconds > 3600) return Math.floor(seconds / 3600) + "h ago";
  if (seconds > 60) return Math.floor(seconds / 60) + "m ago";
  return "Just now";
}

/* ================= INIT & THEME ================= */
document.addEventListener("DOMContentLoaded", async () => {
  // Check Theme
  if(localStorage.getItem("theme") === "dark") toggleTheme(false);

  await checkSession();
  loadPosts();
  loadStories();

  // REAL-TIME POSTS
  supabaseClient.channel('public:posts')
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'posts' }, () => loadPosts())
    .subscribe();
});

function toggleTheme(switchState = true) {
  const body = document.body;
  if(switchState) body.classList.toggle("dark-mode");
  else body.classList.add("dark-mode");
  
  const isDark = body.classList.contains("dark-mode");
  document.getElementById("themeIcon").className = isDark ? "fas fa-sun" : "fas fa-moon";
  localStorage.setItem("theme", isDark ? "dark" : "light");
}

/* ================= AUTH & USER ================= */
async function checkSession() {
  const { data } = await supabaseClient.auth.getUser();
  if (!data.user) return window.location.href = "login.html";
  currentUser = data.user;
  await loadUserProfile();
}

async function loadUserProfile() {
  const { data } = await supabaseClient.from("profiles").select("*").eq("id", currentUser.id).single();
  currentProfile = data;
  updateGlobalUI();
}

function updateGlobalUI() {
  const name = currentProfile.username || "User";
  const avatar = currentProfile.avatar_url || `https://ui-avatars.com/api/?name=${name}&background=2563eb&color=fff`;
  
  ["headerAvatar", "sidebarAvatar", "editProfilePreview"].forEach(id => {
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
  ["feedSection", "contactsSection", "inboxSection", "profileSection"].forEach(id => {
    document.getElementById(id).classList.add("hidden");
  });
  
  document.querySelectorAll('.sidebar button').forEach(b => b.classList.remove('active'));
  document.getElementById(sectionName + "Section").classList.remove("hidden");
  closeSidebar();

  if (sectionName === "contacts") loadContacts();
  if (sectionName === "inbox") loadInbox();
}

/* ================= STORIES (STATUS) ================= */
async function uploadStory(input) {
  const file = input.files[0];
  if (!file) return;

  const path = `statuses/${currentUser.id}_${Date.now()}`;
  await supabaseClient.storage.from("statuses").upload(path, file);
  const { data } = supabaseClient.storage.from("statuses").getPublicUrl(path);

  await supabaseClient.from("statuses").insert({ user_id: currentUser.id, media_url: data.publicUrl });
  alert("Story added!");
  loadStories();
}

async function loadStories() {
  const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  
  const { data } = await supabaseClient
    .from("statuses")
    .select("*, profiles(username, avatar_url)")
    .gt("created_at", yesterday)
    .order("created_at", { ascending: false });

  const container = document.getElementById("storiesContainer");
  // Keep first child (Add button), remove rest
  while (container.children.length > 1) container.removeChild(container.lastChild);

  data.forEach(story => {
    const avatar = story.profiles.avatar_url || `https://ui-avatars.com/api/?name=${story.profiles.username}`;
    const html = `
      <div class="story-item" onclick="viewStory('${story.media_url}')">
        <div class="story-ring">
          <img src="${avatar}" class="avatar small">
        </div>
        <span>${story.profiles.username}</span>
      </div>
    `;
    container.insertAdjacentHTML('beforeend', html);
  });
}

function viewStory(url) {
  const win = window.open("", "_blank");
  win.document.write(`<body style="background:black;margin:0;display:flex;justify-content:center;align-items:center;height:100vh;">
    <img src="${url}" style="max-height:100%;max-width:100%;">
  </body>`);
}

/* ================= FEED (POSTS) ================= */
async function createPost() {
  const text = document.getElementById("postContent").value.trim();
  const file = document.getElementById("postImage").files[0];
  let imageUrl = null;

  if (!text && !file) return alert("Write something!");

  if (file) {
    const path = `${currentUser.id}/${Date.now()}_${file.name}`;
    await supabaseClient.storage.from("post-images").upload(path, file);
    const { data } = supabaseClient.storage.from("post-images").getPublicUrl(path);
    imageUrl = data.publicUrl;
  }

  await supabaseClient.from("posts").insert({ user_id: currentUser.id, content: text, image_url: imageUrl });
  document.getElementById("postContent").value = "";
  document.getElementById("postImage").value = "";
}

async function loadPosts() {
  const { data } = await supabaseClient
    .from("posts")
    .select(`*, profiles(username, avatar_url), post_likes(user_id)`)
    .order("created_at", { ascending: false });

  const container = document.getElementById("postsContainer");
  container.innerHTML = "";

  data.forEach(post => {
    const isLiked = post.post_likes.some(l => l.user_id === currentUser.id);
    const avatar = post.profiles.avatar_url || `https://ui-avatars.com/api/?name=${post.profiles.username}`;
    
    // Download and Share buttons added below
    const html = `
      <div class="post">
        <div class="post-header">
          <img src="${avatar}" class="avatar small">
          <div><strong>${post.profiles.username}</strong><span>${timeAgo(post.created_at)}</span></div>
        </div>
        <div class="post-content">${post.content || ""}</div>
        ${post.image_url ? `<img src="${post.image_url}" class="post-image" onerror="imgError(this)">` : ""}
        
        <div class="post-actions">
          <button class="action-btn ${isLiked ? 'liked' : ''}" onclick="toggleLike(${post.id})">
            <i class="${isLiked ? 'fas' : 'far'} fa-heart"></i> ${post.post_likes.length}
          </button>
          <button class="action-btn" onclick="downloadImage('${post.image_url}')" ${!post.image_url ? 'disabled' : ''}>
            <i class="fas fa-download"></i>
          </button>
          <button class="action-btn" onclick="sharePost('${post.content}')">
            <i class="fas fa-share-alt"></i>
          </button>
        </div>
      </div>
    `;
    container.innerHTML += html;
  });
}

async function toggleLike(postId) {
  const { data: existing } = await supabaseClient.from("post_likes").select("id").match({ post_id: postId, user_id: currentUser.id }).maybeSingle();
  if (existing) await supabaseClient.from("post_likes").delete().eq("id", existing.id);
  else await supabaseClient.from("post_likes").insert({ post_id: postId, user_id: currentUser.id });
  loadPosts();
}

async function downloadImage(url) {
  if(!url || url === "null") return;
  try {
    const response = await fetch(url);
    const blob = await response.blob();
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = "post-" + Date.now();
    link.click();
  } catch(e) { alert("Download failed (CORS limitation)"); }
}

function sharePost(content) {
  if(navigator.share) navigator.share({ title: 'My-Day', text: content, url: window.location.href });
  else {
    navigator.clipboard.writeText(content);
    alert("Post text copied!");
  }
}

/* ================= CONTACTS & FOLLOWS ================= */
async function loadContacts() {
  const { data: users } = await supabaseClient.from("profiles").select("*").neq("id", currentUser.id);
  const { data: following } = await supabaseClient.from("follows").select("following_id").eq("follower_id", currentUser.id);
  
  const followingIds = following.map(f => f.following_id);
  const container = document.getElementById("contactsList");
  container.innerHTML = "";

  users.forEach(user => {
    const isFollowing = followingIds.includes(user.id);
    const avatar = user.avatar_url || `https://ui-avatars.com/api/?name=${user.username}`;
    
    const div = document.createElement("div");
    div.className = "contact-card";
    div.innerHTML = `
      <div style="display:flex; align-items:center; gap:10px;">
        <img src="${avatar}" class="avatar small">
        <strong>${user.username}</strong>
      </div>
      <div style="display:flex; gap:5px;">
        <button class="btn-primary" style="font-size:0.8rem; background:${isFollowing ? '#ef4444' : ''}" 
          onclick="toggleFollow('${user.id}', this)">${isFollowing ? 'Unfollow' : 'Follow'}</button>
        <button class="btn-primary" style="font-size:0.8rem;" onclick="startNewChat('${user.id}')">Msg</button>
      </div>
    `;
    container.appendChild(div);
  });
}

async function toggleFollow(targetId, btn) {
  const { data: exists } = await supabaseClient.from("follows").select("id").match({ follower_id: currentUser.id, following_id: targetId }).maybeSingle();
  
  if (exists) {
    await supabaseClient.from("follows").delete().eq("id", exists.id);
    btn.textContent = "Follow";
    btn.style.background = "var(--primary)";
  } else {
    await supabaseClient.from("follows").insert({ follower_id: currentUser.id, following_id: targetId });
    btn.textContent = "Unfollow";
    btn.style.background = "#ef4444";
  }
}

/* ================= INBOX & GROUPS ================= */
async function loadInbox() {
  // 1. Get conversations where I am a member
  const { data: memberships } = await supabaseClient
    .from("conversation_members")
    .select("conversation_id")
    .eq("user_id", currentUser.id);

  const convoIds = memberships.map(m => m.conversation_id);
  
  // 2. Add legacy 1-on-1 conversations (checking old method for backward compatibility)
  const { data: legacy } = await supabaseClient
    .from("conversations")
    .select("id")
    .or(`user1.eq.${currentUser.id},user2.eq.${currentUser.id}`);
  
  const allIds = [...new Set([...convoIds, ...legacy.map(c => c.id)])];

  if(allIds.length === 0) return;

  const { data: convos } = await supabaseClient
    .from("conversations")
    .select("*")
    .in("id", allIds);

  const list = document.getElementById("conversationsList");
  list.innerHTML = "";

  for (let c of convos) {
    let name = "Chat";
    let avatar = "";
    
    if (c.is_group) {
      name = c.group_name;
      avatar = `https://ui-avatars.com/api/?name=${name}&background=random`;
    } else {
      // Logic for 1-on-1 naming
      const otherId = c.user1 === currentUser.id ? c.user2 : c.user1;
      // If legacy table has nulls, we might need to fetch members
      // Simplifying assumption: if user1/2 are present use them
      if(otherId) {
        const { data: u } = await supabaseClient.from("profiles").select("username, avatar_url").eq("id", otherId).single();
        if(u) { name = u.username; avatar = u.avatar_url || `https://ui-avatars.com/api/?name=${name}`; }
      }
    }

    const div = document.createElement("div");
    div.className = "conversation-item";
    div.onclick = () => openChat(c.id, name, avatar);
    div.innerHTML = `
      <img src="${avatar}" class="avatar small">
      <div class="conversation-info">
        <h4>${name}</h4>
        <p style="font-size:0.8rem; color:gray;">${c.is_group ? 'Group Chat' : 'Direct Message'}</p>
      </div>
    `;
    list.appendChild(div);
  }
}

async function startNewChat(targetId) {
  // Simple 1-on-1 creation
  const { data: existing } = await supabaseClient.from("conversations")
    .select("id")
    .or(`and(user1.eq.${currentUser.id},user2.eq.${targetId}),and(user1.eq.${targetId},user2.eq.${currentUser.id})`)
    .maybeSingle();

  if (existing) {
    showSection("inbox");
  } else {
    const { data: newConvo } = await supabaseClient.from("conversations").insert({ user1: currentUser.id, user2: targetId }).select().single();
    // Also add to members table for future proofing
    await supabaseClient.from("conversation_members").insert([
      { conversation_id: newConvo.id, user_id: currentUser.id },
      { conversation_id: newConvo.id, user_id: targetId }
    ]);
    showSection("inbox");
  }
}

/* ================= GROUP CHAT LOGIC ================= */
async function openGroupModal() {
  document.getElementById("groupModal").classList.add("active");
  const { data } = await supabaseClient.from("profiles").select("*").neq("id", currentUser.id);
  const list = document.getElementById("groupUserList");
  list.innerHTML = "";
  selectedGroupUsers = [];

  data.forEach(user => {
    const div = document.createElement("div");
    div.className = "user-select-item";
    div.innerHTML = `
      <span>${user.username}</span>
      <input type="checkbox" onchange="toggleGroupUser('${user.id}', this.checked)">
    `;
    list.appendChild(div);
  });
}

function toggleGroupUser(uid, checked) {
  if(checked) selectedGroupUsers.push(uid);
  else selectedGroupUsers = selectedGroupUsers.filter(id => id !== uid);
}

async function createGroupChat() {
  const name = document.getElementById("groupName").value;
  if(!name || selectedGroupUsers.length === 0) return alert("Enter name and select members");

  const { data: convo } = await supabaseClient
    .from("conversations")
    .insert({ is_group: true, group_name: name })
    .select().single();

  const members = [{ conversation_id: convo.id, user_id: currentUser.id }];
  selectedGroupUsers.forEach(uid => members.push({ conversation_id: convo.id, user_id: uid }));
  
  await supabaseClient.from("conversation_members").insert(members);
  
  document.getElementById("groupModal").classList.remove("active");
  loadInbox();
}

/* ================= CHAT MESSAGING ================= */
async function openChat(convoId, name, avatar) {
  activeConversationId = convoId;
  document.getElementById("chatUserDisplayName").textContent = name;
  document.getElementById("chatView").classList.add("active");

  if (messageSubscription) supabaseClient.removeChannel(messageSubscription);
  
  messageSubscription = supabaseClient.channel(`chat-${convoId}`)
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `conversation_id=eq.${convoId}` }, 
    payload => appendMessage(payload.new))
    .subscribe();

  const { data } = await supabaseClient.from("messages").select("*").eq("conversation_id", convoId).order("created_at", { ascending: true });
  const container = document.getElementById("messagesContainer");
  container.innerHTML = "";
  data.forEach(appendMessage);
}

function appendMessage(msg) {
  const container = document.getElementById("messagesContainer");
  const isMe = msg.sender_id === currentUser.id;
  
  const div = document.createElement("div");
  div.className = `message ${isMe ? 'me' : 'them'}`;
  
  if (msg.content.includes("http") && msg.content.includes("supab")) {
     div.innerHTML = `<img src="${msg.content}" style="max-width:200px; border-radius:10px;">`;
  } else {
     div.textContent = msg.content;
  }
  container.appendChild(div);
  container.scrollTop = container.scrollHeight;
}

function closeChat() {
  document.getElementById("chatView").classList.remove("active");
  activeConversationId = null;
}

async function sendMessage() {
  const text = document.getElementById("chatTextInput").value.trim();
  const file = document.getElementById("chatImgInput").files[0];
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
  
  document.getElementById("chatTextInput").value = "";
  document.getElementById("chatImgInput").value = "";
}

/* ================= SEARCH & PROFILE ================= */
function handleSearch(query) {
  query = query.toLowerCase();
  if (!document.getElementById("feedSection").classList.contains("hidden")) {
    document.querySelectorAll(".post").forEach(p => p.style.display = p.innerText.toLowerCase().includes(query) ? "block" : "none");
  }
  if (!document.getElementById("contactsSection").classList.contains("hidden")) {
    document.querySelectorAll(".contact-card").forEach(c => c.style.display = c.innerText.toLowerCase().includes(query) ? "flex" : "none");
  }
}

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
  
