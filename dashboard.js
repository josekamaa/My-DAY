const supabaseClient = supabase.createClient(
  "https://iklvlffqzkzpbhjeighn.supabase.co",
  "sb_publishable_OkvtrXKzaUP8D_zmw3XYNA_jZLP65va"
);

let currentUser, currentProfile;

/* INIT */
document.addEventListener("DOMContentLoaded", async () => {
  await loadUser();
  loadPosts();
});

/* USER */
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

function updateProfileUI() {
  headerAvatar.src = currentProfile.avatar_url || "default.png";
  sidebarAvatar.src = currentProfile.avatar_url || "default.png";
  sidebarUsername.textContent = currentProfile.username;
}

/* POSTS */
async function createPost() {
  const text = postContent.value.trim();
  const image = postImage.files[0];
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

  postContent.value = "";
  postImage.value = "";
  loadPosts();
}

async function loadPosts() {
  const { data } = await supabaseClient
    .from("posts")
    .select(`
      id, content, image_url, created_at,
      profiles(username, avatar_url),
      post_comments(id)
    `)
    .order("created_at", { ascending: false });

  postsContainer.innerHTML = "";

  data.forEach(p => {
    const div = document.createElement("div");
    div.className = "post";

    div.innerHTML = `
      <div class="post-header">
        <img src="${p.profiles.avatar_url || 'default.png'}" class="avatar small">
        <strong>${p.profiles.username}</strong>
        <span>${new Date(p.created_at).toLocaleString()}</span>
      </div>

      <p>${p.content || ""}</p>
      ${p.image_url ? `<img src="${p.image_url}" class="post-image">` : ""}

      <button onclick="toggleComments(${p.id})">
        💬 Comments (${p.post_comments.length})
      </button>

      <div id="comments-${p.id}" class="comments hidden"></div>
    `;
    postsContainer.appendChild(div);
  });
}

/* COMMENTS */
async function toggleComments(postId) {
  const box = document.getElementById(`comments-${postId}`);
  box.classList.toggle("hidden");

  if (!box.innerHTML) {
    const { data } = await supabaseClient
      .from("post_comments")
      .select("content, profiles(username)")
      .eq("post_id", postId);

    box.innerHTML = `
      ${data.map(c => `<p><b>${c.profiles.username}</b>: ${c.content}</p>`).join("")}
      <input id="comment-${postId}" placeholder="Write comment">
      <button onclick="addComment(${postId})">Send</button>
    `;
  }
}

async function addComment(postId) {
  const input = document.getElementById(`comment-${postId}`);
  if (!input.value) return;

  await supabaseClient.from("post_comments").insert({
    post_id: postId,
    user_id: currentUser.id,
    content: input.value
  });

  input.value = "";
  toggleComments(postId);
  toggleComments(postId);
}

/* PROFILE */
function openProfile() {
  feedSection.classList.add("hidden");
  profileSection.classList.remove("hidden");
  usernameInput.value = currentProfile.username;
}

async function saveProfile() {
  let avatarUrl = currentProfile.avatar_url;
  const avatar = avatarInput.files[0];

  if (avatar) {
    const path = `${currentUser.id}-${Date.now()}`;
    await supabaseClient.storage.from("avatars").upload(path, avatar);
    avatarUrl = supabaseClient.storage.from("avatars").getPublicUrl(path).data.publicUrl;
  }

  await supabaseClient.from("profiles").update({
    username: usernameInput.value,
    avatar_url: avatarUrl
  }).eq("id", currentUser.id);

  await loadUser();
  profileSection.classList.add("hidden");
  feedSection.classList.remove("hidden");
}

/* LOGOUT */
async function logout() {
  await supabaseClient.auth.signOut();
  location.href = "login.html";
}
