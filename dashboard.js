// dashboard.js
// ---------------- Supabase config ----------------
const SUPABASE_URL = "https://ojjvkhafgurgondsopeh.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9qanZraGFmZ3VyZ29uZHNvcGVoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQ5MDkzODYsImV4cCI6MjA4MDQ4NTM4Nn0.hOLxBVqnFhJ2S1jjR0mkKUJ_bWDjZbHJD3wV0Rbbf7A"; // <-- REPLACE WITH YOUR KEY

const sb = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// ---------------- Global state ----------------
let currentUser = null;
let userLikes = new Set();

let activeConversation = null; // { type: 'dm'|'group', id, name }
let messagesChannel = null;
let groupsChannel = null;

// ---------------- Helpers ----------------
const el = id => document.getElementById(id);
const q = sel => document.querySelector(sel);
const formatTime = t => t ? new Date(t).toLocaleString() : '';

// safe encode for public url path
const pubUrl = (bucket, path) => `${SUPABASE_URL}/storage/v1/object/public/${bucket}/${encodeURIComponent(path)}`;

// ---------------- Init ----------------
document.addEventListener('DOMContentLoaded', init);

async function init(){
  wireUI();
  await loadUser();
  setupBottomTabs();
}

// ---------------- UI wiring ----------------
function wireUI(){
  el('openMessengerBtn').addEventListener('click', openMessenger);
  el('showInboxBtn').addEventListener('click', openMessenger);
  el('showCreatePostBtn').addEventListener('click', ()=> el('createPostBox').classList.remove('hidden'));
  el('postBtn').addEventListener('click', createPost);
  el('cancelPostBtn').addEventListener('click', ()=> el('createPostBox').classList.add('hidden'));

  el('avatarInput').addEventListener('change', onAvatarSelected);

  // messenger compose
  el('sendBtn').addEventListener('click', sendChatMessage);
  el('chatImageInput').addEventListener('change', onChatImageSelected);

  // create group
  el('createGroupBtn').addEventListener('click', promptCreateGroup);

  // camera for posts
  el('captureBtn').addEventListener('click', capturePhoto);
  el('closeCameraBtn').addEventListener('click', closeCamera);

  // bottom tabs
  el('tabChats').addEventListener('click', ()=> { openMessenger(); showTab('people') });
  el('tabGroups').addEventListener('click', ()=> { openMessenger(); showTab('groups') });
  el('tabProfile').addEventListener('click', ()=> { window.scrollTo({top:0,behavior:'smooth'}); });

  // search contacts
  el('contactsSearch').addEventListener('input', filterContacts);
}

// ---------------- Authentication & Profile ----------------
async function loadUser(){
  const { data } = await sb.auth.getUser();
  if(!data?.user){ window.location.href = 'login.html'; return; }
  currentUser = data.user;

  await ensureProfileExists();
  await loadProfilePanel();
  await loadUserLikes();
  await loadPosts();
}

// ensure a profiles row exists for the auth user
async function ensureProfileExists(){
  const { data } = await sb.from('profiles').select('id').eq('id', currentUser.id).maybeSingle();
  if(!data){
    const username = (currentUser.email || 'user').split('@')[0];
    await sb.from('profiles').insert({ id: currentUser.id, username });
  }
}

async function loadProfilePanel(){
  const { data } = await sb.from('profiles').select('username,avatar_url').eq('id', currentUser.id).single();
  const username = data?.username || (currentUser.email||'User').split('@')[0];
  const avatar = data?.avatar_url || null;

  el('profileUsername').textContent = username;
  el('profileEmail').textContent = currentUser.email || '';

  el('avatarInitial').textContent = username.charAt(0).toUpperCase();
  if(avatar){
    const img = document.createElement('img');
    img.src = avatar;
    el('profileAvatar').innerHTML = '';
    el('profileAvatar').appendChild(img);
  }
}

// ---------------- Avatar upload ----------------
async function onAvatarSelected(e){
  const file = e.target.files[0];
  if(!file) return;

  const path = `${currentUser.id}_${Date.now()}_${file.name}`;
  const { data, error } = await sb.storage.from('avatars').upload(path, file);

  if(error){ console.error(error); alert('Avatar upload failed'); return; }

  const url = pubUrl('avatars', data.path);
  await sb.from('profiles').update({ avatar_url: url }).eq('id', currentUser.id);
  await loadProfilePanel();
  await loadPosts();
}

// ---------------- Posts (feed) ----------------
async function createPost(){
  const caption = el('caption').value.trim();
  const media = el('mediaFile').files[0];

  if(!caption && !media){ alert('Write something or add media'); return; }

  let media_url = null, media_type = null;
  if(media){
    const path = `${Date.now()}_${media.name}`;
    const { data, error } = await sb.storage.from('posts').upload(path, media);
    if(error){ console.error(error); alert('Upload failed'); return; }
    media_url = pubUrl('posts', data.path);
    media_type = media.type.startsWith('video') ? 'video' : 'image';
  }

  await sb.from('posts').insert({
    user_id: currentUser.id,
    user_name: currentUser.email.split('@')[0],
    caption,
    media_url,
    media_type,
    likes: 0
  });

  el('caption').value = '';
  el('mediaFile').value = '';
  el('createPostBox').classList.add('hidden');

  await loadPosts();
}

async function loadUserLikes(){
  const { data } = await sb.from('post_likes').select('post_id').eq('user_id', currentUser.id);
  userLikes = new Set((data||[]).map(d => d.post_id));
}

async function loadPosts(){
  const postsDiv = el('posts');
  postsDiv.innerHTML = '<div class="muted">Loading...</div>';

  const { data: posts } = await sb.from('posts').select('*').order('created_at', { ascending:false });

  postsDiv.innerHTML = '';
  if(!posts || posts.length===0){ postsDiv.innerHTML = '<div class="muted">No posts yet</div>'; return; }

  for(const post of posts){
    const profile = await sb.from('profiles').select('username,avatar_url').eq('id', post.user_id).maybeSingle();
    const username = profile.data?.username || post.user_name || 'User';
    const avatar = profile.data?.avatar_url || null;

    const card = document.createElement('div');
    card.className = 'post';

    const avatarImg = avatar ? `<div style="width:42px;height:42px;border-radius:50%;overflow:hidden"><img src="${avatar}" style="width:100%;height:100%;object-fit:cover"></div>` :
                               `<div style="width:42px;height:42px;border-radius:50%;display:flex;align-items:center;justify-content:center;background:var(--accent);color:#fff">${username.charAt(0).toUpperCase()}</div>`;

    let mediaHTML = '';
    if(post.media_type === 'image' && post.media_url) mediaHTML = `<img src="${post.media_url}" style="width:100%;margin-top:8px;border-radius:8px;max-height:500px;object-fit:cover">`;
    if(post.media_type === 'video' && post.media_url) mediaHTML = `<video src="${post.media_url}" controls style="width:100%;margin-top:8px;border-radius:8px;max-height:400px"></video>`;

    card.innerHTML = `
      <div style="display:flex;gap:10px;align-items:center">
        ${avatarImg}
        <div>
          <div style="font-weight:700">${username}</div>
          <div class="muted small">${formatTime(post.created_at)}</div>
        </div>
      </div>
      <p style="margin-top:8px">${post.caption || ''}</p>
      ${mediaHTML}
      <div style="display:flex;gap:8px;margin-top:8px">
        <button class="btn ghost" onclick="likePost(${post.id}, ${post.likes})">${userLikes.has(post.id)?'❤️':'🤍'} Like (${post.likes})</button>
        <button class="btn ghost" onclick="toggleComments(${post.id})">💬 Comments</button>
      </div>
      <div class="comments-section hidden" id="comments-${post.id}">
        <div id="comments-list-${post.id}"></div>
        <div style="display:flex;gap:8px;margin-top:8px">
          <input id="comment-input-${post.id}" placeholder="Write a comment..." style="flex:1;padding:8px;border-radius:8px;border:1px solid #eee">
          <button class="btn" onclick="addComment(${post.id})">Send</button>
        </div>
      </div>
    `;

    postsDiv.appendChild(card);
    loadComments(post.id);
  }
}

async function likePost(postId, currentLikes){
  if(userLikes.has(postId)){ alert('Already liked'); return; }
  await sb.from('post_likes').insert({ post_id: postId, user_id: currentUser.id });
  await sb.from('posts').update({ likes: currentLikes + 1 }).eq('id', postId);
  await loadUserLikes();
  await loadPosts();
}

async function addComment(postId){
  const input = el(`comment-input-${postId}`);
  const text = input.value.trim();
  if(!text) return;
  await sb.from('comments').insert({
    post_id: postId, user_id: currentUser.id, user_name: currentUser.email.split('@')[0], comment: text
  });
  input.value = '';
  loadComments(postId);
}

async function loadComments(postId){
  const { data } = await sb.from('comments').select('*').eq('post_id', postId).order('created_at', { ascending:true });
  const list = el(`comments-list-${postId}`);
  list.innerHTML = '';
  (data||[]).forEach(c => {
    const d = document.createElement('div');
    d.style.marginBottom = '8px';
    d.innerHTML = `<strong>${c.user_name}</strong><div>${c.comment}</div>`;
    list.appendChild(d);
  });
}

function toggleComments(id){
  const sec = el(`comments-${id}`);
  sec.classList.toggle('hidden');
}

// ---------------- Camera for posts ----------------
let cameraStream = null;
async function openCamera(){
  try{
    el('cameraPreview').style.display = 'flex';
    cameraStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' }, audio:false });
    el('cameraVideo').srcObject = cameraStream;
  }catch(e){ alert('Camera access failed: ' + e.message) }
}
function closeCamera(){
  if(cameraStream) cameraStream.getTracks().forEach(t=>t.stop());
  el('cameraPreview').style.display = 'none';
}
function capturePhoto(){
  const video = el('cameraVideo');
  const canvas = el('photoCanvas');
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(video,0,0);
  canvas.toBlob(blob=>{
    const file = new File([blob], `photo_${Date.now()}.png`, { type:'image/png' });
    const dt = new DataTransfer(); dt.items.add(file);
    el('mediaFile').files = dt.files;
    closeCamera();
    el('createPostBox').classList.remove('hidden');
  }, 'image/png');
}

// ---------------- Messenger Open/Close ----------------
function openMessenger(){
  el('messenger').style.display = 'flex';
  loadUsersAndGroups();
  subscribeToMessages();
  subscribeToGroupMessages();
}

function closeMessenger(){
  el('messenger').style.display = 'none';
  activeConversation = null;
  if(messagesChannel) { messagesChannel.unsubscribe(); messagesChannel = null; }
  if(groupsChannel) { groupsChannel.unsubscribe(); groupsChannel = null; }
  el('messagesList').innerHTML = '';
}

// ---------------- Load users & groups ----------------
let allUsersCache = [];
let allGroupsCache = [];

async function loadUsersAndGroups(){
  // load profiles (exclude current)
  const { data: users } = await sb.from('profiles').select('id,username,avatar_url').neq('id', currentUser.id);
  allUsersCache = users || [];

  const { data: groups } = await sb.from('groups').select('*').order('created_at', { ascending:false });
  allGroupsCache = groups || [];

  renderUserList();
  renderGroupList();
  populateAddMemberSelect();
}

function renderUserList(){
  const list = el('usersList'); list.innerHTML = '';
  (allUsersCache||[]).forEach(u=>{
    const row = document.createElement('div');
    row.className = 'list-row';
    row.innerHTML = `
      <div style="width:42px;height:42px;border-radius:50%;overflow:hidden;background:var(--accent);color:#fff;display:flex;align-items:center;justify-content:center">
        ${u.avatar_url ? `<img src="${u.avatar_url}" style="width:100%;height:100%;object-fit:cover">` : (u.username||'U').charAt(0).toUpperCase()}
      </div>
      <div style="flex:1"><strong>${u.username || u.id.slice(0,8)}</strong><div class="small muted">Tap to message</div></div>
    `;
    row.onclick = ()=> openDirectChat(u);
    list.appendChild(row);
  });
}

function renderGroupList(){
  const list = el('groupsList'); list.innerHTML = '';
  (allGroupsCache||[]).forEach(g=>{
    const row = document.createElement('div');
    row.className = 'list-row';
    row.innerHTML = `<div style="width:42px;height:42px;border-radius:8px;background:#eef2ff;display:flex;align-items:center;justify-content:center"><strong>G</strong></div>
                     <div style="flex:1"><strong>${g.name}</strong><div class="small muted">Tap to open group</div></div>`;
    row.onclick = ()=> openGroupChat(g);
    list.appendChild(row);
  });
}

// filter contacts by search input
function filterContacts(){
  const qv = el('contactsSearch').value.toLowerCase();
  // users
  const ulist = el('usersList'); ulist.innerHTML = '';
  (allUsersCache||[]).filter(u => (u.username||'').toLowerCase().includes(qv)).forEach(u=>{
    const row = document.createElement('div');
    row.className = 'list-row';
    row.innerHTML = `<div style="width:42px;height:42px;border-radius:50%;overflow:hidden;background:var(--accent);color:#fff;display:flex;align-items:center;justify-content:center">${u.avatar_url?`<img src="${u.avatar_url}" style="width:100%;height:100%;object-fit:cover">`:(u.username||'U').charAt(0).toUpperCase()}</div><div style="flex:1"><strong>${u.username}</strong></div>`;
    row.onclick = ()=> openDirectChat(u);
    ulist.appendChild(row);
  });
  // groups
  const glist = el('groupsList'); glist.innerHTML = '';
  (allGroupsCache||[]).filter(g => (g.name||'').toLowerCase().includes(qv)).forEach(g=>{
    const row = document.createElement('div');
    row.className = 'list-row';
    row.innerHTML = `<div style="width:42px;height:42px;border-radius:8px;background:#eef2ff;display:flex;align-items:center;justify-content:center"><strong>G</strong></div><div style="flex:1"><strong>${g.name}</strong></div>`;
    row.onclick = ()=> openGroupChat(g);
    glist.appendChild(row);
  });
}

// ---------------- Open chats ----------------
async function openDirectChat(user){
  activeConversation = { type:'dm', id: user.id, name: user.username || user.id.slice(0,8) };
  el('chatHead').textContent = activeConversation.name;
  el('leaveGroupBtn').style.display = 'none';
  el('groupDetails').classList.add('hidden');
  el('chatInfo').classList.remove('hidden');

  // load last messages between
  const { data } = await sb.from('messages')
    .select('*')
    .or(`and(sender_id.eq.${currentUser.id},receiver_id.eq.${user.id}),and(sender_id.eq.${user.id},receiver_id.eq.${currentUser.id})`)
    .order('created_at', { ascending:true });
  renderMessages(data || []);
}

async function openGroupChat(group){
  activeConversation = { type:'group', id: group.id, name: group.name };
  el('chatHead').textContent = `${group.name}`;
  el('leaveGroupBtn').style.display = 'inline-block';
  el('groupDetails').classList.remove('hidden');
  el('chatInfo').classList.add('hidden');

  // load group members
  const { data: members } = await sb.from('group_members').select('user_id,profiles(username,avatar_url)').eq('group_id', group.id).leftJoin('profiles', 'profiles.id', 'group_members.user_id');
  // above leftJoin may not be available with this pattern in supabase; using simple approach:
  const gm = await sb.from('group_members').select('user_id').eq('group_id', group.id);
  const memberIds = gm.data ? gm.data.map(m => m.user_id) : [];
  const profiles = memberIds.length ? (await sb.from('profiles').select('id,username,avatar_url').in('id', memberIds)).data : [];
  // show members
  const membersContainer = el('groupMembers'); membersContainer.innerHTML = '';
  (profiles||[]).forEach(p => {
    const eldiv = document.createElement('div');
    eldiv.style.display = 'flex'; eldiv.style.flexDirection='column'; eldiv.style.alignItems='center';
    eldiv.innerHTML = `<div style="width:48px;height:48px;border-radius:50%;overflow:hidden">${p.avatar_url?`<img src="${p.avatar_url}" style="width:100%;height:100%;object-fit:cover">`:(p.username||'U').charAt(0).toUpperCase()}</div><div class="small">${p.username}</div>`;
    membersContainer.appendChild(eldiv);
  });

  // populate add member select
  populateAddMemberSelect();

  // load group messages
  const { data } = await sb.from('group_messages').select('*').eq('group_id', group.id).order('created_at', { ascending:true });
  renderMessages(data || []);
}

// populate add member select (users not in group)
async function populateAddMemberSelect(){
  const sel = el('addMemberSelect');
  if(!sel) return;
  sel.innerHTML = '<option value="">Select a user</option>';
  const { data } = await sb.from('profiles').select('id,username').neq('id', currentUser.id);
  (data || []).forEach(u => {
    const opt = document.createElement('option');
    opt.value = u.id; opt.textContent = u.username || u.id.slice(0,8);
    sel.appendChild(opt);
  });

  el('addMemberBtn').onclick = async ()=>{
    const userId = sel.value;
    if(!userId || !activeConversation || activeConversation.type !== 'group') return alert('Choose a user and open a group');
    await sb.from('group_members').insert({ group_id: activeConversation.id, user_id: userId });
    openGroupChat({ id: activeConversation.id, name: activeConversation.name });
  };
}

// ---------------- Create group ----------------
async function promptCreateGroup(){
  const name = prompt('Group name');
  if(!name) return;
  const { data, error } = await sb.from('groups').insert({ name, created_by: currentUser.id }).select().single();
  if(error){ console.error(error); alert('Failed to create group'); return; }
  // auto-add creator as member
  await sb.from('group_members').insert({ group_id: data.id, user_id: currentUser.id });
  await loadUsersAndGroups();
  openGroupChat(data);
}

// ---------------- Messages rendering ----------------
function renderMessages(list){
  const container = el('messagesList');
  container.innerHTML = '';
  (list||[]).forEach(m => {
    const div = document.createElement('div');
    div.className = 'msg' + (m.sender_id === currentUser.id ? ' me' : '');
    const txt = m.message ? `<div>${escapeHtml(m.message)}</div>` : '';
    const img = m.image_url ? `<img src="${m.image_url}" class="chat-image">` : '';
    const meta = `<div class="time">${formatTime(m.created_at)}</div>`;
    div.innerHTML = `${txt}${img}${meta}`;
    container.appendChild(div);
  });
  container.scrollTop = container.scrollHeight;
}

function escapeHtml(str){
  if(!str) return '';
  return str.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;');
}

// ---------------- Send messages (DM or Group) ----------------
async function sendChatMessage(){
  const text = el('messageInput').value.trim();
  const file = el('chatImageInput').files[0];
  if(!activeConversation){ alert('Select a chat'); return; }

  if(activeConversation.type === 'dm'){
    // individual message
    let image_url = null;
    if(file){
      const path = `${currentUser.id}_${Date.now()}_${file.name}`;
      const { data, error } = await sb.storage.from('chat_images').upload(path, file);
      if(error){ console.error(error); alert('Image upload failed'); return; }
      image_url = pubUrl('chat_images', data.path);
    }
    await sb.from('messages').insert({
      sender_id: currentUser.id,
      receiver_id: activeConversation.id,
      message: text || null,
      image_url
    });
  } else {
    // group message
    let image_url = null;
    if(file){
      const path = `${currentUser.id}_${Date.now()}_${file.name}`;
      const { data, error } = await sb.storage.from('chat_images').upload(path, file);
      if(error){ console.error(error); alert('Image upload failed'); return; }
      image_url = pubUrl('chat_images', data.path);
    }
    await sb.from('group_messages').insert({
      group_id: activeConversation.id,
      sender_id: currentUser.id,
      message: text || null,
      image_url
    });
  }
  el('messageInput').value = '';
  el('chatImageInput').value = '';
  // rendering will come from realtime subscription (or you can append optimistically)
}

// ---------------- Chat image input helper ----------------
function onChatImageSelected(){ /* noop - file read occurs on send */ }

// ---------------- Subscriptions (Realtime) ----------------
function subscribeToMessages(){
  if(messagesChannel) return;

  messagesChannel = sb.channel('public:messages')
    .on('postgres_changes', { event:'INSERT', schema:'public', table:'messages' }, payload => {
      const msg = payload.new;
      // If DM is open and matches sender/receiver, append
      if(activeConversation && activeConversation.type === 'dm'){
        const other = activeConversation.id;
        const isBetween = (msg.sender_id === currentUser.id && msg.receiver_id === other) ||
                          (msg.sender_id === other && msg.receiver_id === currentUser.id);
        if(isBetween){
          // append
          const existing = el('messagesList');
          const div = document.createElement('div');
          div.className = 'msg' + (msg.sender_id === currentUser.id ? ' me' : '');
          const txt = msg.message ? `<div>${escapeHtml(msg.message)}</div>` : '';
          const img = msg.image_url ? `<img src="${msg.image_url}" class="chat-image">` : '';
          div.innerHTML = `${txt}${img}<div class="time">${formatTime(msg.created_at)}</div>`;
          existing.appendChild(div);
          existing.scrollTop = existing.scrollHeight;
        }
      }
    })
    .subscribe();
}

function subscribeToGroupMessages(){
  if(groupsChannel) return;

  groupsChannel = sb.channel('public:group_messages')
    .on('postgres_changes', { event:'INSERT', schema:'public', table:'group_messages' }, payload => {
      const g = payload.new;
      if(activeConversation && activeConversation.type === 'group' && activeConversation.id === g.group_id){
        const existing = el('messagesList');
        const div = document.createElement('div');
        div.className = 'msg' + (g.sender_id === currentUser.id ? ' me' : '');
        const txt = g.message ? `<div>${escapeHtml(g.message)}</div>` : '';
        const img = g.image_url ? `<img src="${g.image_url}" class="chat-image">` : '';
        div.innerHTML = `${txt}${img}<div class="time">${formatTime(g.created_at)}</div>`;
        existing.appendChild(div);
        existing.scrollTop = existing.scrollHeight;
      }
    })
    .subscribe();
}

// ---------------- Group membership (leave) ----------------
el('leaveGroupBtn').addEventListener('click', async ()=>{
  if(!activeConversation || activeConversation.type !== 'group') return;
  const ok = confirm('Leave this group?');
  if(!ok) return;
  await sb.from('group_members').delete().match({ group_id: activeConversation.id, user_id: currentUser.id });
  alert('You left the group');
  loadUsersAndGroups();
  el('messagesList').innerHTML = '';
  activeConversation = null;
});

// ---------------- Load all users & groups (reuse) ----------------
async function loadUsersAndGroups(){
  // groups
  const { data: groups } = await sb.from('groups').select('*').order('created_at', { ascending:false });
  allGroupsCache = groups || [];
  // users
  const { data: users } = await sb.from('profiles').select('id,username,avatar_url').neq('id', currentUser.id);
  allUsersCache = users || [];

  renderGroupList();
  renderUserList();
  populateAddMemberSelect(); // for right panel
}

let allUsersCache = [];
let allGroupsCache = [];

function renderUserList(){
  const list = el('usersList');
  list.innerHTML = '';
  (allUsersCache||[]).forEach(u=>{
    const row = document.createElement('div');
    row.className = 'list-row';
    row.innerHTML = `<div style="width:42px;height:42px;border-radius:50%;overflow:hidden">${u.avatar_url?`<img src="${u.avatar_url}" style="width:100%;height:100%;object-fit:cover">`:(u.username||'U').charAt(0).toUpperCase()}</div>
                     <div style="flex:1"><strong>${u.username}</strong><div class="small muted">Tap to chat</div></div>`;
    row.onclick = ()=> openDirectChat(u);
    list.appendChild(row);
  });
}

function renderGroupList(){
  const list = el('groupsList'); list.innerHTML = '';
  (allGroupsCache||[]).forEach(g=>{
    const row = document.createElement('div');
    row.className = 'list-row';
    row.innerHTML = `<div style="width:42px;height:42px;border-radius:8px;background:#eef2ff;display:flex;align-items:center;justify-content:center"><strong>G</strong></div>
                     <div style="flex:1"><strong>${g.name}</strong><div class="small muted">Tap to open</div></div>`;
    row.onclick = ()=> openGroupChat(g);
    list.appendChild(row);
  });
}

// ---------------- Utility: show tabs on small screens ----------------
function setupBottomTabs(){ /* already wired in wireUI */ }
function showTab(which){
  // which: 'people' or 'groups' or 'profile'
  if(which === 'people'){ /* visually scroll to people list on mobile */ el('usersList').scrollIntoView({behavior:'smooth'}); }
  if(which === 'groups'){ el('groupsList').scrollIntoView({behavior:'smooth'}); }
  if(which === 'profile'){ window.scrollTo({top:0,behavior:'smooth'}); }
}

// escape helper already defined

// ---------------- Clean-up & initial load ----------------
async function initialLoad(){
  await loadUser();
  await loadUsersAndGroups();
}
initialLoad();
