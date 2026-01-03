/* ================= CONFIG ================= */
const supabaseClient = supabase.createClient(
  "https://iklvlffqzkzpbhjeighn.supabase.co",
  "sb_publishable_OkvtrXKzaUP8D_zmw3XYNA_jZLP65va" // Keep your original key here
);

/* ================= STATE ================= */
let currentUser = null;
let currentProfile = null;
let activeConvoId = null;
let msgSubscription = null;

/* ================= INIT ================= */
document.addEventListener("DOMContentLoaded", async () => {
  // 1. Theme Check
  if(localStorage.getItem('theme') === 'dark') document.body.classList.add('dark-mode');

  await checkSession();
  
  // Realtime Subscriptions
  subscribeToPosts();
  subscribeToNotifications();
});

/* ================= AUTH & USER ================= */
async function checkSession() {
  const { data } = await supabaseClient.auth.getUser();
  if (!data.user) return window.location.href = "login.html";
  currentUser = data.user;
  
  // Fetch Profile
  const { data: profile } = await supabaseClient
    .from("profiles").select("*").eq("id", currentUser.id).single();
    
  currentProfile = profile;
  updateGlobalUI();
  loadPosts();
  loadStories();
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

function toggleDarkMode() {
  document.body.classList.toggle('dark-mode');
  const theme = document.body.classList.contains('dark-mode') ? 'dark' : 'light';
  localStorage.setItem('theme', theme);
}

function logout() {
  supabaseClient.auth.signOut().then(() => window.location.href = "login.html");
}

function showSection(id) {
  document.querySelectorAll('section').forEach(s => s.classList.add('hidden'));
  document.getElementById(id + "Section").classList.remove('hidden');
  
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
  event.currentTarget.classList.add('active');

  // Specific Loaders
  if(id === 'contacts') loadContacts();
  if(id === 'inbox') loadInbox();
  if(id === 'feed') { loadPosts(); loadStories(); }
  
  // Mobile Sidebar Close
  document.getElementById("sidebar").classList.remove("active");
  document.getElementById("sidebarOverlay").classList.remove("active");
}

/* ================= FEED & STORIES ================= */
async function loadStories() {
  // Fetch stories created in last 24h
  const yesterday = new Date(Date.now() - 86400000).toISOString();
  
  const { data } = await supabaseClient
    .from("statuses")
    .select("*, profiles(username, avatar_url)")
    .gt("created_at", yesterday)
    .order("created_at", {ascending: false});

  const bar = document.getElementById("statusBar");
  // Keep the "Add Story" button, remove old stories
  while(bar.children.length > 2) bar.removeChild(bar.lastChild);

  const uniqueUsers = new Set(); // One bubble per user
  
  data.forEach(status => {
    if(uniqueUsers.has(status.user_id)) return;
    uniqueUsers.add(status.user_id);

    const div = document.createElement("div");
    div.className = "status-item";
    div.onclick = () => viewStory(status.media_url);
    div.innerHTML = `
      <img src="${status.profiles.avatar_url}" class="status-ring avatar medium">
      <span class="status-name">${status.profiles.username}</span>
    `;
    bar.appendChild(div);
  });
}

function viewStory(url) {
  // Simple view - open in new tab or modal. For simplicity: new tab
  window.open(url, '_blank');
}

function uploadStatus() {
  document.getElementById("statusInput").click();
}

async function handleStatusUpload(input) {
  const file = input.files[0];
  if(!file) return;

  const path = `stories/${currentUser.id}_${Date.now()}`;
  await supabaseClient.storage.from("status-updates").upload(path, file); // Create this bucket!
  const { data } = supabaseClient.storage.from("status-updates").getPublicUrl(path);

  await supabaseClient.from("statuses").insert({
    user_id: currentUser.id,
    media_url: data.publicUrl
  });
  alert("Story added!");
  loadStories();
}

async function loadPosts() {
  const { data } = await supabaseClient
    .from("posts")
    .select("*, profiles(username, avatar_url), post_likes(user_id)")
    .order("created_at", { ascending: false });

  const container = document.getElementById("postsContainer");
  container.innerHTML = "";

  data.forEach(post => {
    const isLiked = post.post_likes.some(l => l.user_id === currentUser.id);
    const html = `
      <div class="post">
        <div class="post-header">
          <img src="${post.profiles.avatar_url}" class="avatar small">
          <div><b>${post.profiles.username}</b><br><small style="color:grey">${new Date(post.created_at).toLocaleDateString()}</small></div>
        </div>
        <div class="post-content">${post.content || ""}</div>
        ${post.image_url ? `<img src="${post.image_url}" class="post-image">` : ""}
        <div class="post-actions">
          <button class="action-btn ${isLiked?'liked':''}" onclick="toggleLike('${post.id}')"><i class="fas fa-heart"></i> Like</button>
        </div>
      </div>
    `;
    container.innerHTML += html;
  });
}

async function createPost() {
  const text = document.getElementById("postContent").value;
  const file = document.getElementById("postImage").files[0];
  if(!text && !file) return;

  let url = null;
  if(file) {
    const path = `posts/${currentUser.id}_${Date.now()}`;
    await supabaseClient.storage.from("post-images").upload(path, file);
    const { data } = supabaseClient.storage.from("post-images").getPublicUrl(path);
    url = data.publicUrl;
  }

  await supabaseClient.from("posts").insert({ user_id: currentUser.id, content: text, image_url: url });
  document.getElementById("postContent").value = "";
  loadPosts();
}

async function toggleLike(postId) {
  // Simplified for brevity - same as before
  const { data } = await supabaseClient.from("post_likes").select("id").match({post_id: postId, user_id: currentUser.id});
  if(data.length > 0) await supabaseClient.from("post_likes").delete().eq("id", data[0].id);
  else await supabaseClient.from("post_likes").insert({post_id: postId, user_id: currentUser.id});
  loadPosts();
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
    div.style = "display:flex; justify-content:space-between; padding:15px; border-bottom:1px solid #eee; background:var(--bg-card); align-items:center;";
    div.innerHTML = `
      <div style="display:flex; gap:10px; align-items:center;">
        <img src="${u.avatar_url}" class="avatar small">
        <b>${u.username}</b>
      </div>
      <div>
        <button onclick="startChat('${u.id}')" style="margin-right:10px; color:var(--primary);"><i class="fas fa-comment"></i></button>
        <button onclick="toggleFollow('${u.id}')" class="btn-primary" style="${isFollowing ? 'background:grey' : ''}">
          ${isFollowing ? 'Unfollow' : 'Follow'}
        </button>
      </div>
    `;
    list.appendChild(div);
  });
}

async function toggleFollow(targetId) {
  const { data } = await supabaseClient.from("follows").select("*").match({follower_id: currentUser.id, following_id: targetId});
  
  if(data.length > 0) {
    await supabaseClient.from("follows").delete().match({follower_id: currentUser.id, following_id: targetId});
  } else {
    await supabaseClient.from("follows").insert({follower_id: currentUser.id, following_id: targetId});
  }
  loadContacts();
}

/* ================= GROUPS & MESSAGING ================= */
async function createGroup() {
  const name = prompt("Enter Group Name:");
  if(!name) return;

  // 1. Create Conversation
  const { data: convo, error } = await supabaseClient
    .from("conversations")
    .insert({ is_group: true, group_name: name })
    .select()
    .single();

  if(error) return alert("Error creating group");

  // 2. Add Admin (Self)
  await supabaseClient.from("conversation_members").insert({
    conversation_id: convo.id,
    user_id: currentUser.id,
    role: 'admin'
  });

  alert("Group Created! You can now add members inside the chat (feature coming soon) or they can join.");
  loadInbox();
}

async function loadInbox() {
  // Updated to support Groups + DMs
  // Complex query: Get conversations where I am a member OR (legacy) user1/user2
  // For simplicity, we stick to the new table structure for groups, old for DMs, or normalize.
  
  // Fetch Groups
  const { data: memberOf } = await supabaseClient.from("conversation_members").select("conversation_id").eq("user_id", currentUser.id);
  const groupIds = memberOf.map(m => m.conversation_id);
  
  const { data: conversations } = await supabaseClient
    .from("conversations")
    .select("*")
    .or(`id.in.(${groupIds}),user1.eq.${currentUser.id},user2.eq.${currentUser.id}`);

  const list = document.getElementById("conversationsList");
  list.innerHTML = "";

  for(const c of conversations) {
    let name = "Chat";
    let avatar = "";
    
    if(c.is_group) {
      name = c.group_name;
      avatar = "https://ui-avatars.com/api/?name=" + name + "&background=random";
    } else {
      // DM Logic
      const otherId = c.user1 === currentUser.id ? c.user2 : c.user1;
      const { data: u } = await supabaseClient.from("profiles").select("username, avatar_url").eq("id", otherId).single();
      name = u?.username || "User";
      avatar = u?.avatar_url || "";
    }

    const div = document.createElement("div");
    div.className = "conversation-item";
    div.onclick = () => openChat(c.id, name);
    div.innerHTML = `
      <img src="${avatar}" class="avatar medium">
      <div><b>${name}</b><br><small>${c.is_group ? 'Group Chat' : 'Direct Message'}</small></div>
    `;
    list.appendChild(div);
  }
}

async function openChat(id, name) {
  activeConvoId = id;
  document.getElementById("chatView").classList.add("active");
  document.getElementById("chatName").innerText = name;
  
  // Load Messages
  const { data } = await supabaseClient
    .from("messages")
    .select("*")
    .eq("conversation_id", id)
    .order("created_at", {ascending: true});
    
  const box = document.getElementById("messagesContainer");
  box.innerHTML = "";
  data.forEach(displayMessage);
  box.scrollTop = box.scrollHeight;

  // Subscribe to new messages
  if(msgSubscription) supabaseClient.removeChannel(msgSubscription);
  msgSubscription = supabaseClient.channel('chat-'+id)
    .on('postgres_changes', {event: 'INSERT', schema: 'public', table: 'messages', filter: `conversation_id=eq.${id}`}, 
    payload => {
      displayMessage(payload.new);
      box.scrollTop = box.scrollHeight;
    })
    .subscribe();
}

function displayMessage(msg) {
  const box = document.getElementById("messagesContainer");
  const div = document.createElement("div");
  div.className = `message ${msg.sender_id === currentUser.id ? 'me' : 'them'}`;
  div.innerText = msg.content;
  box.appendChild(div);
}

async function sendMessage() {
  const input = document.getElementById("chatInput");
  const text = input.value.trim();
  if(!text) return;
  
  await supabaseClient.from("messages").insert({
    conversation_id: activeConvoId,
    sender_id: currentUser.id,
    content: text
  });
  input.value = "";
}

async function startChat(otherId) {
  // Check existing DM
  const { data } = await supabaseClient.from("conversations")
    .select("*")
    .or(`and(user1.eq.${currentUser.id},user2.eq.${otherId}),and(user1.eq.${otherId},user2.eq.${currentUser.id})`)
    .single();
    
  if(data) {
    showSection('inbox');
    openChat(data.id, "Chat"); 
  } else {
    // Create new DM
    const { data: newChat } = await supabaseClient.from("conversations").insert({user1: currentUser.id, user2: otherId}).select().single();
    showSection('inbox');
    openChat(newChat.id, "New Chat");
  }
}

/* ================= UTILS & NOTIFICATIONS ================= */
function subscribeToNotifications() {
  supabaseClient
    .channel('public:messages')
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, payload => {
       if(payload.new.sender_id !== currentUser.id) {
         // Show badge
         const badge = document.getElementById("msgBadge");
         badge.classList.remove("hidden");
         badge.innerText = parseInt(badge.innerText) + 1;
         
         // If on mobile, vibrate
         if(navigator.vibrate) navigator.vibrate(200);
       }
    })
    .subscribe();
}

function subscribeToPosts() {
  supabaseClient
    .channel('public:posts')
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'posts' }, () => {
      loadPosts(); // Auto refresh feed
    })
    .subscribe();
}

/* ================= NAVIGATION ================= */
function toggleSidebar() { document.getElementById("sidebar").classList.add("active"); document.getElementById("sidebarOverlay").classList.add("active"); }
function closeSidebar() { document.getElementById("sidebar").classList.remove("active"); document.getElementById("sidebarOverlay").classList.remove("active"); }
function closeChat() { document.getElementById("chatView").classList.remove("active"); activeConvoId = null; }
    
