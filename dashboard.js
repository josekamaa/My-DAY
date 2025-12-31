/* ================= SUPABASE ================= */
const SUPABASE_URL = "https://iklvlffqzkzpbhjeighn.supabase.co";
const SUPABASE_KEY = "sb_publishable_OkvtrXKzaUP8D_zmw3XYNA_jZLP65va"; // keep same as before
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
  const { data, error } = await supabaseClient.auth.getUser();
  if (!data.user) {
    location.href = "login.html";
    return;
  }

  currentUser = data.user;

  const { data: profile } = await supabaseClient
    .from("profiles")
    .select("*")
    .eq("id", currentUser.id)
    .single();

  currentProfile = profile;
  updateProfileUI();
}

function updateProfileUI() {
  const initial = currentProfile.username.charAt(0).toUpperCase();

  document.getElementById("headerAvatar").textContent = initial;
  document.getElementById("sidebarAvatar").textContent = initial;
  document.getElementById("sidebarUsername").textContent = currentProfile.username;
}

/* ================= SIDEBAR ================= */
function toggleSidebar() {
  document.getElementById("sidebar").classList.add("active");
  document.getElementById("sidebarOverlay").classList.add("active");
}

function closeSidebar() {
  document.getElementById("sidebar").classList.remove("active");
  document.getElementById("sidebarOverlay").classList.remove("active");
}

function showFeed() {
  closeSidebar();
}

/* ================= POSTS ================= */
async function createPost() {
  const content = document.getElementById("postContent").value.trim();
  if (!content) return;

  const { error } = await supabaseClient.from("posts").insert({
    user_id: currentUser.id,
    content: content
  });

  if (!error) {
    document.getElementById("postContent").value = "";
    loadPosts();
  }
}

async function loadPosts() {
  const { data, error } = await supabaseClient
    .from("posts")
    .select(`
      id,
      content,
      created_at,
      profiles (
        username
      )
    `)
    .order("created_at", { ascending: false });

  const container = document.getElementById("postsContainer");
  container.innerHTML = "";

  data.forEach(post => {
    const div = document.createElement("div");
    div.className = "post";
    div.innerHTML = `
      <div class="post-header">
        <strong>${post.profiles.username}</strong>
        <span>${new Date(post.created_at).toLocaleString()}</span>
      </div>
      <p>${post.content}</p>
    `;
    container.appendChild(div);
  });
}

/* ================= LOGOUT ================= */
async function logout() {
  await supabaseClient.auth.signOut();
  location.href = "login.html";
}
