/* ===========================================================
   SUPABASE CLIENT
=========================================================== */
const SUPABASE_URL = 'https://iklvlffqzkzpbhjeighn.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_OkvtrXKzaUP8D_zmw3XYNA_jZLP65va';
const sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

/* ===========================================================
   GLOBAL STATE
=========================================================== */
let currentUser = null;
let currentProfile = null;
let activeConversationId = null;
let activeChatUser = null;

/* ===========================================================
   HELPERS
=========================================================== */
const el = id => document.getElementById(id);
const qs = s => document.querySelector(s);
const qsa = s => document.querySelectorAll(s);

function showToast(msg) {
  console.log(msg); // replace with your UI toast
}

/* ===========================================================
   INSTAGRAM-LEVEL TIMESTAMPS
=========================================================== */
function timeAgo(date) {
  const seconds = Math.floor((Date.now() - new Date(date)) / 1000);
  if (seconds < 60) return 'Just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d`;
  return new Date(date).toLocaleDateString();
}

/* ===========================================================
   AUTH + PROFILE
=========================================================== */
async function loadUser() {
  const { data } = await sb.auth.getUser();
  if (!data?.user) return location.href = 'login.html';

  currentUser = data.user;
  await ensureProfile();
  await loadProfile();
  initDashboard();
}

async function ensureProfile() {
  const { data } = await sb
    .from('profiles')
    .select('id')
    .eq('id', currentUser.id)
    .maybeSingle();

  if (!data) {
    await sb.from('profiles').insert({
      id: currentUser.id,
      username: currentUser.email.split('@')[0]
    });
  }
}

async function loadProfile() {
  const { data } = await sb
    .from('profiles')
    .select('*')
    .eq('id', currentUser.id)
    .single();

  currentProfile = data;
  updateProfileUI();
}

function updateProfileUI() {
  const initial = currentProfile.username[0].toUpperCase();
  qsa('.avatar-initial').forEach(a => a.textContent = initial);
  qsa('.avatar img').forEach(img => img.src = currentProfile.avatar_url);
}

/* ===========================================================
   DASHBOARD INIT
=========================================================== */
function initDashboard() {
  loadFeed();
  loadContacts();
  setupListeners();
}

/* ===========================================================
   POSTS / FEED
=========================================================== */
async function loadFeed() {
  const feed = el('postsContainer');
  feed.innerHTML = '';

  const { data: posts } = await sb
    .from('posts')
    .select(`
      id, caption, image_url, created_at,
      profiles:user_id (username, avatar_url)
    `)
    .order('created_at', { ascending: false });

  posts.forEach(post => feed.appendChild(renderPost(post)));
}

function renderPost(post) {
  const div = document.createElement('div');
  div.className = 'post-card';

  const profile = post.profiles;
  const avatar = profile.avatar_url
    ? `<img src="${profile.avatar_url}">`
    : `<span class="avatar-initial">${profile.username[0]}</span>`;

  div.innerHTML = `
    <div class="post-header">
      <div class="avatar">${avatar}</div>
      <div>
        <strong>${profile.username}</strong>
        <div class="post-time">${timeAgo(post.created_at)}</div>
      </div>
    </div>

    <div class="post-body">
      <p>${post.caption || ''}</p>
      ${post.image_url ? `<img src="${post.image_url}" loading="lazy">` : ''}
    </div>

    <div class="post-actions">
      <button onclick="likePost('${post.id}')">❤️</button>
      <button onclick="openComments('${post.id}')">💬</button>
    </div>
  `;
  return div;
}

/* ===========================================================
   LIKES
=========================================================== */
async function likePost(postId) {
  const { data } = await sb
    .from('post_likes')
    .select('id')
    .eq('post_id', postId)
    .eq('user_id', currentUser.id)
    .maybeSingle();

  if (data) {
    await sb.from('post_likes').delete().eq('id', data.id);
  } else {
    await sb.from('post_likes').insert({
      post_id: postId,
      user_id: currentUser.id
    });
  }
}

/* ===========================================================
   COMMENTS
=========================================================== */
async function openComments(postId) {
  console.log('Open comments for', postId);
}

/* ===========================================================
   CONTACTS
=========================================================== */
async function loadContacts() {
  const list = el('contactsList');
  list.innerHTML = '';

  const { data } = await sb
    .from('profiles')
    .select('id, username, avatar_url')
    .neq('id', currentUser.id);

  data.forEach(user => {
    const div = document.createElement('div');
    div.className = 'contact';
    div.innerHTML = `
      ${user.avatar_url
        ? `<img src="${user.avatar_url}">`
        : `<span class="avatar-initial">${user.username[0]}</span>`}
      <span>${user.username}</span>
    `;
    div.onclick = () => openConversation(user);
    list.appendChild(div);
  });
}

/* ===========================================================
   INBOX — NO OR HACKS
=========================================================== */
async function openConversation(user) {
  activeChatUser = user;

  const ordered = [currentUser.id, user.id].sort();
  const { data: convo } = await sb
    .from('conversations')
    .select('*')
    .eq('user_one', ordered[0])
    .eq('user_two', ordered[1])
    .maybeSingle();

  if (convo) {
    activeConversationId = convo.id;
  } else {
    const { data } = await sb.from('conversations').insert({
      user_one: ordered[0],
      user_two: ordered[1]
    }).select().single();

    activeConversationId = data.id;
  }

  loadMessages();
}

async function loadMessages() {
  const box = el('chatMessages');
  box.innerHTML = '';

  const { data } = await sb
    .from('messages')
    .select('*')
    .eq('conversation_id', activeConversationId)
    .order('created_at');

  data.forEach(msg => {
    const div = document.createElement('div');
    div.className = msg.sender_id === currentUser.id ? 'sent' : 'received';
    div.innerHTML = `
      <p>${msg.content}</p>
      <span>${timeAgo(msg.created_at)}</span>
    `;
    box.appendChild(div);
  });

  box.scrollTop = box.scrollHeight;
}

async function sendChatMessage() {
  const input = el('chatInput');
  if (!input.value.trim()) return;

  await sb.from('messages').insert({
    conversation_id: activeConversationId,
    sender_id: currentUser.id,
    content: input.value
  });

  input.value = '';
  loadMessages();
}

/* ===========================================================
   EVENTS
=========================================================== */
function setupListeners() {
  el('sendMessageBtn')?.addEventListener('click', sendChatMessage);
}

/* ===========================================================
   START
=========================================================== */
document.addEventListener('DOMContentLoaded', loadUser);
