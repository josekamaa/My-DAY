/* ================= SUPABASE SETUP ================= */
const SUPABASE_URL = "https://ojjvkhafgurgondsopeh.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9qanZraGFmZ3VyZ29uZHNvcGVoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQ5MDkzODYsImV4cCI6MjA4MDQ4NTM4Nn0.hOLxBVqnFhJ2S1jjR0mkKUJ_bWDjZbHJD3wV0Rbbf7A";
const sb = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

let currentUser = null;

/* ================= AUTH ================= */
async function loadUser() {
  const { data, error } = await sb.auth.getUser();

  if (error || !data.user) {
    location.href = "login.html";
    return;
  }

  currentUser = data.user;
  await ensureProfile();
  await loadPosts();
}

async function ensureProfile() {
  const { data } = await sb
    .from("profiles")
    .select("id")
    .eq("id", currentUser.id)
    .maybeSingle();

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

  if (!caption && !file) return;

  let media_url = null;
  let media_type = null;

  if (file) {
    const path = `${currentUser.id}/${Date.now()}_${file.name}`;
    const { error } = await sb.storage.from("posts").upload(path, file);

    if (error) {
      alert("Upload failed");
      return;
    }

    media_url = sb.storage.from("posts").getPublicUrl(path).data.publicUrl;
    media_type = file.type.startsWith("video") ? "video" : "image";
  }

  await sb.from("posts").insert({
    user_id: currentUser.id,
    caption,
    media_url,
    media_type
  });

  postCaption.value = "";
  mediaInput.value = "";
  loadPosts();
}

/* ================= OPTIMIZED FEED ================= */
async function loadPosts() {
  const { data: posts, error } = await sb
    .from("posts_feed")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Feed error:", error);
    return;
  }

  postsContainer.innerHTML = "";

  posts.forEach(post => {
    postsContainer.innerHTML += `
      <div class="card post">
        <p>${post.caption || ""}</p>

        ${
          post.media_url
            ? `<img src="${post.media_url}" />`
            : ""
        }

        <div class="actions">
          <button
            class="${post.liked_by_me ? "active" : ""}"
            onclick="toggleLike(${post.id})"
          >
            ❤️ ${post.like_count}
          </button>

          <button onclick="toggleComments(${post.id})">
            💬 ${post.comment_count}
          </button>

          ${
            post.user_id === currentUser.id
              ? `<button onclick="deletePost(${post.id})">🗑</button>`
              : ""
          }
        </div>

        <div id="comments-${post.id}" style="display:none">
          <input
            placeholder="Write a comment..."
            onkeypress="if(event.key==='Enter') addComment(${post.id}, this)"
          />
        </div>
      </div>
    `;
  });
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
      user_id: currentUser.id
    });
  }

  loadPosts();
}

/* ================= COMMENTS ================= */
function toggleComments(postId) {
  const el = document.getElementById(`comments-${postId}`);
  el.style.display = el.style.display === "none" ? "block" : "none";
  if (el.style.display === "block") el.querySelector("input").focus();
}

async function addComment(postId, input) {
  const content = input.value.trim();
  if (!content) return;

  await sb.from("post_comments").insert({
    post_id: postId,
    user_id: currentUser.id,
    content
  });

  input.value = "";
  loadPosts();
}

/* ================= DELETE ================= */
async function deletePost(postId) {
  if (!confirm("Delete this post?")) return;

  await sb.from("posts").delete().eq("id", postId);
  loadPosts();
}

/* ================= THEME ================= */
function toggleTheme() {
  document.body.classList.toggle("dark");
}

/* ================= INIT ================= */
loadUser();
