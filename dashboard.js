/* ================= SUPABASE SETUP ================= */
const SUPABASE_URL = "https://ojjvkhafgurgondsopeh.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9qanZraGFmZ3VyZ29uZHNvcGVoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQ5MDkzODYsImV4cCI6MjA4MDQ4NTM4Nn0.hOLxBVqnFhJ2S1jjR0mkKUJ_bWDjZbHJD3wV0Rbbf7A"; // <-- put your real anon key
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
      username: currentUser.email.split("@")[0]
    });
  }
}

/* ================= CREATE POST ================= */
async function submitPost() {
  if (submitPost.loading) return;
  submitPost.loading = true;

  const caption = postCaption.value.trim();
  const file = mediaInput.files[0];

  if (!caption && !file) {
    submitPost.loading = false;
    return;
  }

  let media_url = null;
  let media_type = null;

  if (file) {
    const path = `${currentUser.id}/${Date.now()}_${file.name}`;
    const { error } = await sb.storage.from("posts").upload(path, file);

    if (error) {
      alert("Media upload failed");
      submitPost.loading = false;
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
  submitPost.loading = false;

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

        ${post.media_url ? `<img src="${post.media_url}" />` : ""}

        <div class="actions">
          <button
            class="${post.liked_by_me ? "active" : ""}"
            onclick="toggleLike(event, ${post.id})"
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

/* ================= OPTIMISTIC LIKES ================= */
async function toggleLike(event, postId) {
  const btn = event.target;
  if (btn.disabled) return;

  btn.disabled = true;

  const liked = btn.classList.contains("active");
  let count = parseInt(btn.textContent.replace("❤️", "").trim(), 10);

  // Optimistic UI
  if (liked) {
    btn.classList.remove("active");
    btn.textContent = `❤️ ${count - 1}`;
  } else {
    btn.classList.add("active");
    btn.textContent = `❤️ ${count + 1}`;
  }

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

  btn.disabled = false;
}

/* ================= COMMENTS ================= */
function toggleComments(postId) {
  const el = document.getElementById(`comments-${postId}`);
  const visible = el.style.display === "block";

  el.style.display = visible ? "none" : "block";

  if (!visible) {
    const input = el.querySelector("input");
    setTimeout(() => input && input.focus(), 0);
  }
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

/* ================= DELETE POST ================= */
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
