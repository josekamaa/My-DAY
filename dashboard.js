/* ===========================================================
   SUPABASE CLIENT
=========================================================== */
const SUPABASE_URL = "https://ojjvkhafgurgondsopeh.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9qanZraGFmZ3VyZ29uZHNvcGVoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQ5MDkzODYsImV4cCI6MjA4MDQ4NTM4Nn0.hOLxBVqnFhJ2S1jjR0mkKUJ_bWDjZbHJD3wV0Rbbf7A";

const sb = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

/* ===========================================================
   GLOBAL STATE
=========================================================== */
let currentUser = null;
let currentProfile = null;

/* ===========================================================
   HELPERS
=========================================================== */
function el(id) { return document.getElementById(id); }

function formatRelativeTime(dateString) {
  const date = new Date(dateString);
  const diff = Math.floor((Date.now() - date) / 1000);
  if (diff < 60) return 'Just now';
  if (diff < 3600) return `${Math.floor(diff/60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff/3600)}h ago`;
  return `${Math.floor(diff/86400)}d ago`;
}

/* ===========================================================
   AUTH
=========================================================== */
async function loadUser() {
  const { data } = await sb.auth.getUser();
  if (!data.user) {
    location.href = 'login.html';
    return;
  }
  currentUser = data.user;
  await loadProfile();
  await loadPosts();
}

async function loadProfile() {
  const { data } = await sb
    .from('profiles')
    .select('*')
    .eq('id', currentUser.id)
    .single();

  currentProfile = data;
}

/* ===========================================================
   LIKE SYSTEM (FIXED – NO 406 ERRORS)
=========================================================== */
async function userHasLiked(postId) {
  const { data } = await sb
    .from('post_likes')
    .select('id')
    .eq('post_id', postId)
    .eq('user_id', currentUser.id)
    .maybeSingle(); // ✅ FIX

  return !!data;
}

async function getLikeCount(postId) {
  const { count } = await sb
    .from('post_likes')
    .select('*', { count: 'exact', head: true })
    .eq('post_id', postId);

  return count || 0;
}

async function toggleLike(postId) {
  const { data: existingLike } = await sb
    .from('post_likes')
    .select('id')
    .eq('post_id', postId)
    .eq('user_id', currentUser.id)
    .maybeSingle(); // ✅ FIX

  if (existingLike) {
    await sb.from('post_likes').delete().eq('id', existingLike.id);
    return false;
  } else {
    await sb.from('post_likes').insert({
      post_id: postId,
      user_id: currentUser.id
    });
    return true;
  }
}

async function handleLike(postId) {
  const liked = await toggleLike(postId);
  const btn = document.querySelector(`button[data-like="${postId}"]`);
  const countEl = document.getElementById(`like-count-${postId}`);

  if (liked) {
    btn.classList.add('active');
    btn.querySelector('i').className = 'fas fa-heart';
  } else {
    btn.classList.remove('active');
    btn.querySelector('i').className = 'far fa-heart';
  }

  const count = await getLikeCount(postId);
  countEl.textContent = `${count} like${count !== 1 ? 's' : ''}`;
}

/* ===========================================================
   POSTS
=========================================================== */
async function loadPosts() {
  const container = el('postsContainer');
  container.innerHTML = '';

  const { data: posts } = await sb
    .from('posts')
    .select('*')
    .order('created_at', { ascending: false });

  for (const post of posts) {
    const liked = await userHasLiked(post.id);
    const likes = await getLikeCount(post.id);

    const div = document.createElement('div');
    div.className = 'post-card';

    div.innerHTML = `
      <div class="post-content">
        <p>${post.caption || ''}</p>
      </div>
      <div class="post-stats">
        <span id="like-count-${post.id}">${likes} likes</span>
      </div>
      <div class="post-actions">
        <button data-like="${post.id}" onclick="handleLike(${post.id})" class="${liked ? 'active' : ''}">
          <i class="${liked ? 'fas' : 'far'} fa-heart"></i> Like
        </button>
      </div>
    `;

    container.appendChild(div);
  }
}

/* ===========================================================
   INIT
=========================================================== */
document.addEventListener('DOMContentLoaded', loadUser);
