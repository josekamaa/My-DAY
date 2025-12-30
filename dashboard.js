const SUPABASE_URL = "https://ojjvkhafgurgondsopeh.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9qanZraGFmZ3VyZ29uZHNvcGVoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQ5MDkzODYsImV4cCI6MjA4MDQ4NTM4Nn0.hOLxBVqnFhJ2S1jjR0mkKUJ_bWDjZbHJD3wV0Rbbf7A";
const sb = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

let currentUser = null;
let theme = "light";

/* ================= AUTH ================= */
async function loadUser() {
  const { data } = await sb.auth.getUser();
  if (!data.user) return location.href = "login.html";
  currentUser = data.user;
  await ensureProfile();
  loadPosts();
}

async function ensureProfile() {
  const { data } = await sb.from("profiles").select("id").eq("id", currentUser.id).maybeSingle();
  if (!data) {
    await sb.from("profiles").insert({
      id: currentUser.id,
      username: currentUser.email.split("@")[0],
      created_at: new Date()
    });
  }
}

/* ================= POSTS ================= */
async function submitPost() {
  const caption = postCaption.value.trim();
  const file = mediaInput.files[0];

  let media_url = null;
  let media_type = null;

  if (file) {
    const path = `${currentUser.id}_${Date.now()}`;
    await sb.storage.from("posts").upload(path, file);
    media_url = sb.storage.from("posts").getPublicUrl(path).data.publicUrl;
    media_type = file.type.startsWith("video") ? "video" : "image";
  }

  await sb.from("posts").insert({
    user_id: currentUser.id,
    caption,
    media_url,
    media_type,
    created_at: new Date()
  });

  postCaption.value = "";
  mediaInput.value = "";
  loadPosts();
}

async function loadPosts() {
  const { data: posts } = await sb
    .from("posts")
    .select("*")
    .order("created_at", { ascending:false });

  postsContainer.innerHTML = "";

  for (const post of posts) {
    const likes = await getLikeCount(post.id);
    const liked = await userLiked(post.id);
    const comments = await getCommentCount(post.id);

    postsContainer.innerHTML += `
      <div class="card post">
        <p>${post.caption || ""}</p>
        ${post.media_url ? `<img src="${post.media_url}">` : ""}
        <div class="actions">
          <button class="${liked ? "active" : ""}" onclick="toggleLike(${post.id})">
            ❤️ ${likes}
          </button>
          <button onclick="toggleComments(${post.id})">
            💬 ${comments}
          </button>
        </div>
        <div id="comments-${post.id}" style="display:none">
          <input placeholder="Write a comment"
            onkeypress="if(event.key==='Enter') addComment(${post.id}, this)">
        </div>
      </div>
    `;
  }
}

/* ================= LIKES ================= */
async function toggleLike(postId) {
  const { data } = await sb
    .from("post_likes")
    .select("id")
    .eq("post_id", postId)
    .eq("user_id", currentUser.id)
    .maybeSingle();

  if (data) {
    await sb.from("post_likes").delete().eq("id", data.id);
  } else {
    await sb.from("post_likes").insert({
      post_id: postId,
      user_id: currentUser.id,
      created_at: new Date()
    });
  }
  loadPosts();
}

async function getLikeCount(postId) {
  const { count } = await sb
    .from("post_likes")
    .select("*", { count:"exact", head:true })
    .eq("post_id", postId);
  return count || 0;
}

async function userLiked(postId) {
  const { data } = await sb
    .from("post_likes")
    .select("id")
    .eq("post_id", postId)
    .eq("user_id", currentUser.id)
    .maybeSingle();
  return !!data;
}

/* ================= COMMENTS ================= */
function toggleComments(postId) {
  const el = document.getElementById(`comments-${postId}`);
  el.style.display = el.style.display === "none" ? "block" : "none";
}

async function addComment(postId, input) {
  if (!input.value.trim()) return;

  await sb.from("post_comments").insert({
    post_id: postId,
    user_id: currentUser.id,
    content: input.value,
    created_at: new Date()
  });

  input.value = "";
  loadPosts();
}

async function getCommentCount(postId) {
  const { count } = await sb
    .from("post_comments")
    .select("*", { count:"exact", head:true })
    .eq("post_id", postId);
  return count || 0;
}

/* ================= THEME ================= */
function toggleTheme() {
  theme = theme === "light" ? "dark" : "light";
  document.body.style.background = theme === "dark" ? "#0f172a" : "#f4f6fb";
}

loadUser();
