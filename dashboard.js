/* ================= SUPABASE ================= */
const SUPABASE_URL = "https://iklvlffqzkzpbhjeighn.supabase.co";
const SUPABASE_KEY = "sb_publishable_OkvtrXKzaUP8D_zmw3XYNA_jZLP65va";
const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

/* ================= GLOBAL ================= */
let currentUser = null;
let currentProfile = null;

/* ================= INIT ================= */
document.addEventListener("DOMContentLoaded", () => {
  init();
});

async function init() {
  await loadUser();
  await loadPosts();
}

/* ================= AUTH ================= */
async function loadUser() {
  const { data } = await supabaseClient.auth.getUser();

  if (!data.user) {
    location.href = "login.html";
    return;
  }

  currentUser = data.user;

  const { data: profile, error } = await supabaseClient
    .from("profiles")
    .select("*")
    .eq("id", currentUser.id)
    .single();

  if (error) {
    console.error("Profile error:", error);
    return;
  }

  currentProfile = profile;
  updateProfileUI();
}

function updateProfileUI() {
  const initial = currentProfile.username.charAt(0).toUpperCase();

  document.getElementById("headerAvatar").textContent = initial;
  document.getElementById("sidebarAvatar").textContent = initial;
  document.getElementById("sidebarUsername").textContent =
    currentProfile.username;
}

/* ================= SIDEBAR / NAV ================= */
function toggleSidebar() {
  document.getElementById("sidebar").classList.add("active");
  document.getElementById("sidebarOverlay").classList.add("active");
}

function closeSidebar() {
  document.getElementById("sidebar").classList.remove("active");
  document.getElementById("sidebarOverlay").classList.remove("active");
}

function showFeed() {
  document.getElementById("contactsSection").classList.add("hidden");
  document.getElementById("feedSection").classList.remove("hidden");
  closeSidebar();
}

function showContacts() {
  document.getElementById("feedSection").classList.add("hidden");
  document.getElementById("contactsSection").classList.remove("hidden");
  closeSidebar();
  loadContacts();
}

/* ================= POSTS ================= */
async function createPost() {
  const content = document.getElementById("postContent").value.trim();
  if (!content) return;

  const { error } = await supabaseClient.from("posts").insert({
    user_id: currentUser.id,
    content
  });

  if (error) {
    console.error("Post error:", error);
    return;
  }

  document.getElementById("postContent").value = "";
  loadPosts();
}

async function loadPosts() {
  const { data, error } = await supabaseClient
    .from("posts")
    .select(`
      id,
      content,
      created_at,
      profiles ( username ),
      post_likes ( user_id ),
      post_comments (
        id,
        content,
        created_at,
        profiles ( username )
      )
    `)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Load posts error:", error);
    return;
  }

  const container = document.getElementById("postsContainer");
  container.innerHTML = "";

  data.forEach(post => {
    const likedByMe = post.post_likes.some(
      like => like.user_id === currentUser.id
    );

    const div = document.createElement("div");
    div.className = "post";

    div.innerHTML = `
      <div class="post-header">
        <strong>${post.profiles.username}</strong>
        <span>${new Date(post.created_at).toLocaleString()}</span>
      </div>

      <p>${post.content}</p>

      <button class="like-btn" onclick="toggleLike(${post.id}, ${likedByMe})">
        ${likedByMe ? "❤️" : "🤍"} ${post.post_likes.length}
      </button>

      <div class="comments">
        ${post.post_comments
          .map(
            c => `
          <div class="comment">
            <strong>${c.profiles.username}</strong>: ${c.content}
          </div>
        `
          )
          .join("")}

        <div class="add-comment">
          <input
            type="text"
            placeholder="Write a comment..."
            id="comment-${post.id}"
          />
          <button onclick="addComment(${post.id})">Post</button>
        </div>
      </div>
    `;

    container.appendChild(div);
  });
}

/* ================= LIKES ================= */
async function toggleLike(postId, liked) {
  if (liked) {
    await supabaseClient
      .from("post_likes")
      .delete()
      .eq("post_id", postId)
      .eq("user_id", currentUser.id);
  } else {
    await supabaseClient.from("post_likes").insert({
      post_id: postId,
      user_id: currentUser.id
    });
  }

  loadPosts();
}

/* ================= COMMENTS ================= */
async function addComment(postId) {
  const input = document.getElementById(`comment-${postId}`);
  const content = input.value.trim();
  if (!content) return;

  await supabaseClient.from("post_comments").insert({
    post_id: postId,
    user_id: currentUser.id,
    content
  });

  input.value = "";
  loadPosts();
}

/* ================= CONTACTS ================= */
async function loadContacts() {
  const { data, error } = await supabaseClient
    .from("profiles")
    .select("id, username")
    .neq("id", currentUser.id)
    .order("username");

  const container = document.getElementById("contactsList");
  container.innerHTML = "";

  if (error) {
    console.error("Contacts error:", error);
    container.innerHTML = "<p>Error loading contacts</p>";
    return;
  }

  if (!data || data.length === 0) {
    container.innerHTML = "<p>No contacts yet.</p>";
    return;
  }

  data.forEach(user => {
    const div = document.createElement("div");
    div.className = "contact";
    div.innerHTML = `
      <div class="avatar small">${user.username[0].toUpperCase()}</div>
      <span>${user.username}</span>
      <button onclick="openChat('${user.id}', '${user.username}')">Chat</button>
    `;
    container.appendChild(div);
  });
}

function openChat(userId, username) {
  alert(`Chat with ${username} coming next 😄`);
}

/* ================= LOGOUT ================= */
async function logout() {
  await supabaseClient.auth.signOut();
  location.href = "login.html";
    }
