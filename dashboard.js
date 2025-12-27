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
let activeChatUser = null;
let activeChatId = null;
let msgSubscription = null;
let currentTheme = 'light';
let isMobile = window.innerWidth < 768;

/* ===========================================================
   HELPER FUNCTIONS
=========================================================== */
function el(id) { return document.getElementById(id); }
function qs(selector) { return document.querySelector(selector); }
function qsa(selector) { return document.querySelectorAll(selector); }

// Format relative time
function formatRelativeTime(dateString) {
  if (!dateString) return 'Just now';
  
  try {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now - date;
    const diffSec = Math.floor(diffMs / 1000);
    const diffMin = Math.floor(diffSec / 60);
    const diffHour = Math.floor(diffMin / 60);
    const diffDay = Math.floor(diffHour / 24);
    
    if (diffSec < 60) return 'Just now';
    if (diffMin < 60) return `${diffMin}m ago`;
    if (diffHour < 24) return `${diffHour}h ago`;
    if (diffDay < 7) return `${diffDay}d ago`;
    
    return date.toLocaleDateString('en-US', { 
      month: 'short', 
      day: 'numeric',
      year: diffDay > 365 ? 'numeric' : undefined
    });
  } catch (e) {
    return 'Just now';
  }
}

// Show toast notification
function showToast(message, type = 'info', duration = 3000) {
  const toastContainer = el('toastContainer');
  if (!toastContainer) return;
  
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  
  const icons = {
    success: 'fas fa-check-circle',
    error: 'fas fa-exclamation-circle',
    warning: 'fas fa-exclamation-triangle',
    info: 'fas fa-info-circle'
  };
  
  toast.innerHTML = `
    <i class="${icons[type] || icons.info}"></i>
    <div style="flex: 1;">${message}</div>
    <button class="btn-icon" onclick="this.parentElement.remove()">
      <i class="fas fa-times"></i>
    </button>
  `;
  
  toastContainer.appendChild(toast);
  
  setTimeout(() => {
    if (toast.parentElement) toast.remove();
  }, duration);
}

// Simple table existence check
async function tableExists(tableName) {
  try {
    const { error } = await sb
      .from(tableName)
      .select('*')
      .limit(1);
    
    return !error;
  } catch (error) {
    return false;
  }
}

/* ===========================================================
   THEME MANAGEMENT
=========================================================== */
function initTheme() {
  const savedTheme = localStorage.getItem('theme') || 'light';
  setTheme(savedTheme);
}

function setTheme(theme) {
  currentTheme = theme;
  document.body.setAttribute('data-theme', theme);
  localStorage.setItem('theme', theme);
  
  const icon = qs('#themeToggle i');
  if (icon) {
    icon.className = theme === 'dark' ? 'fas fa-sun' : 'fas fa-moon';
  }
}

function toggleTheme() {
  const newTheme = currentTheme === 'light' ? 'dark' : 'light';
  setTheme(newTheme);
}

/* ===========================================================
   AUTHENTICATION & USER MANAGEMENT
=========================================================== */
async function loadUser() {
  try {
    const { data, error } = await sb.auth.getUser();
    
    if (error || !data.user) {
      window.location.href = 'login.html';
      return;
    }
    
    currentUser = data.user;
    await ensureProfileExists();
    await loadUserProfile();
    
    initDashboard();
    setupEventListeners();
    
  } catch (error) {
    console.error('Error loading user:', error);
    showToast('Failed to load user data', 'error');
  }
}

async function ensureProfileExists() {
  try {
    const { data } = await sb
      .from('profiles')
      .select('id')
      .eq('id', currentUser.id)
      .maybeSingle();
      
    if (!data) {
      const username = currentUser.email?.split('@')[0] || 'user';
      const { error } = await sb.from('profiles').insert({
        id: currentUser.id,
        username: username,
        bio: 'Welcome to My-Day!',
        created_at: new Date().toISOString()
      });
      
      if (error) {
        console.error('Error creating profile:', error);
      }
    }
  } catch (error) {
    console.error('Error ensuring profile exists:', error);
  }
}

async function loadUserProfile() {
  try {
    const { data, error } = await sb
      .from('profiles')
      .select('*')
      .eq('id', currentUser.id)
      .single();
      
    if (error) throw error;
    
    currentProfile = data;
    updateProfileUI();
    
  } catch (error) {
    console.error('Error loading profile:', error);
  }
}

function updateProfileUI() {
  if (!currentProfile) return;
  
  const initial = (currentProfile.username || 'U').charAt(0).toUpperCase();
  
  // Update all places that show the user's initial
  const avatarElements = qsa('.avatar-initial, [id*="Initial"]');
  avatarElements.forEach(el => {
    if (el.id.includes('Initial') || el.className.includes('avatar-initial')) {
      el.textContent = initial;
    }
  });
  
  // Update text elements
  if (el('profileUsername')) el('profileUsername').textContent = currentProfile.username || 'User';
  if (el('profileBio')) el('profileBio').textContent = currentProfile.bio || 'Welcome to My-Day!';
  if (el('modalPostName')) el('modalPostName').textContent = currentProfile.username || 'User';
  if (el('editUsername')) el('editUsername').value = currentProfile.username || '';
  if (el('editBio')) el('editBio').value = currentProfile.bio || '';
  if (el('editLocation')) el('editLocation').value = currentProfile.location || '';
  
  // Update avatar image if exists
  if (currentProfile.avatar_url) {
    updateAvatarImages(currentProfile.avatar_url);
  }
}

function updateAvatarImages(avatarUrl) {
  const avatars = qsa('.avatar, .post-input-avatar, .chat-avatar, .online-avatar, .contact-avatar');
  avatars.forEach(avatar => {
    const img = document.createElement('img');
    img.src = avatarUrl;
    img.alt = currentProfile.username;
    img.onerror = () => {
      const initial = (currentProfile.username || 'U').charAt(0).toUpperCase();
      avatar.innerHTML = `<span class="avatar-initial">${initial}</span>`;
    };
    avatar.innerHTML = '';
    avatar.appendChild(img);
  });
}

/* ===========================================================
   POSTS MANAGEMENT - SIMPLIFIED
=========================================================== */
async function loadPosts() {
  const postsContainer = el('postsContainer');
  if (!postsContainer) return;
  
  postsContainer.innerHTML = `
    <div class="skeleton skeleton-post"></div>
    <div class="skeleton skeleton-post"></div>
  `;
  
  try {
    // Get posts
    const { data: posts, error } = await sb
      .from('posts')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(10);
      
    if (error) throw error;
    
    postsContainer.innerHTML = '';
    
    if (!posts || posts.length === 0) {
      postsContainer.innerHTML = `
        <div class="post-card" style="text-align: center; padding: 40px 20px;">
          <i class="fas fa-newspaper" style="font-size: 48px; color: var(--muted); margin-bottom: 16px;"></i>
          <h3>No posts yet</h3>
          <p>Be the first to post something!</p>
          <button class="btn btn-primary mt-4" onclick="openCreatePostModal()">
            <i class="fas fa-plus"></i> Create First Post
          </button>
        </div>
      `;
      return;
    }
    
    // Get user profiles for these posts
    const userIds = [...new Set(posts.map(p => p.user_id))];
    const { data: profiles } = await sb
      .from('profiles')
      .select('id, username, avatar_url')
      .in('id', userIds);
      
    const profileMap = {};
    profiles?.forEach(p => {
      profileMap[p.id] = p;
    });
    
    // Update post count
    if (el('postCount')) el('postCount').textContent = posts.length;
    
    // Create post elements
    for (const post of posts) {
      const postIdStr = post.id.toString();
      const profile = profileMap[post.user_id] || { username: 'Unknown User', avatar_url: null };
      
      const postElement = createPostElement(post, profile, postIdStr);
      postsContainer.appendChild(postElement);
    }
    
  } catch (error) {
    console.error('Error loading posts:', error);
    postsContainer.innerHTML = '<p class="text-center">Failed to load posts</p>';
  }
}

function createPostElement(post, profile, postIdStr) {
  const div = document.createElement('div');
  div.className = 'post-card';
  div.id = `post-${post.id}`;
  
  const postTime = formatRelativeTime(post.created_at);
  const username = profile?.username || 'Unknown User';
  const avatarInitial = username.charAt(0).toUpperCase();
  
  let mediaHTML = '';
  if (post.media_url) {
    if (post.media_type === 'image') {
      mediaHTML = `
        <div class="post-media">
          <img src="${post.media_url}" alt="Post image" loading="lazy">
        </div>
      `;
    } else if (post.media_type === 'video') {
      mediaHTML = `
        <div class="post-media">
          <video src="${post.media_url}" controls></video>
        </div>
      `;
    }
  }
  
  div.innerHTML = `
    <div class="post-header">
      <div class="post-user-info">
        <div class="post-avatar">
          ${profile?.avatar_url 
            ? `<img src="${profile.avatar_url}" alt="${username}">`
            : `<span class="avatar-initial" style="width:40px;height:40px;font-size:16px;display:flex;align-items:center;justify-content:center;">${avatarInitial}</span>`
          }
        </div>
        <div class="post-user-details">
          <div class="post-username">${username}</div>
          <div class="post-time">${postTime}</div>
        </div>
      </div>
      <button class="post-menu-btn" onclick="showToast('Post menu coming soon!', 'info')">
        <i class="fas fa-ellipsis-h"></i>
      </button>
    </div>
    
    <div class="post-content">
      <div class="post-text">${post.caption || ''}</div>
      ${mediaHTML}
    </div>
    
    <div class="post-stats">
      <div class="post-likes">
        <i class="fas fa-heart" style="color: var(--danger);"></i>
        <span>0 likes</span>
      </div>
      <div class="post-comments">
        <span>0 comments</span>
      </div>
    </div>
    
    <div class="post-actions-container">
      <button class="post-action" onclick="showToast('Like feature coming soon!', 'info')">
        <i class="far fa-heart"></i>
        <span>Like</span>
      </button>
      <button class="post-action" onclick="showToast('Comment feature coming soon!', 'info')">
        <i class="far fa-comment"></i>
        <span>Comment</span>
      </button>
      <button class="post-action" onclick="showToast('Share feature coming soon!', 'info')">
        <i class="fas fa-share"></i>
        <span>Share</span>
      </button>
    </div>
  `;
  
  return div;
}

/* ===========================================================
   POST CREATION
=========================================================== */
function openCreatePostModal() {
  el('createPostModal').classList.add('active');
}

function closeCreatePostModal() {
  el('createPostModal').classList.remove('active');
  el('postCaption').value = '';
  el('postMediaPreview').style.display = 'none';
  el('mediaInput').value = '';
}

async function submitPost() {
  const caption = el('postCaption').value.trim();
  const privacy = el('postPrivacy').value || 'public';
  const mediaFile = el('mediaInput').files[0];
  
  if (!caption && !mediaFile) {
    showToast('Please add some text or media to your post', 'error');
    return;
  }
  
  const btn = el('submitPostBtn');
  if (!btn) return;
  
  btn.disabled = true;
  btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Posting...';
  
  try {
    let mediaUrl = null;
    let mediaType = null;
    
    if (mediaFile) {
      const fileExt = mediaFile.name.split('.').pop();
      const fileName = `${currentUser.id}_${Date.now()}.${fileExt}`;
      
      const { error: uploadError } = await sb.storage
        .from('posts')
        .upload(fileName, mediaFile);
        
      if (uploadError) throw uploadError;
      
      const { data: { publicUrl } } = sb.storage
        .from('posts')
        .getPublicUrl(fileName);
      
      mediaUrl = publicUrl;
      mediaType = mediaFile.type.startsWith('video') ? 'video' : 'image';
    }
    
    const postData = {
      user_id: currentUser.id,
      caption: caption || '',
      media_url: mediaUrl,
      media_type: mediaType,
      privacy: privacy,
      created_at: new Date().toISOString()
    };
    
    const { error } = await sb.from('posts').insert(postData);
    
    if (error) throw error;
    
    showToast('Post created successfully!', 'success');
    closeCreatePostModal();
    await loadPosts();
  } catch (error) {
    console.error('Error creating post:', error);
    showToast('Failed to create post', 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Post';
  }
}

function openPhotoPickerModal() {
  el('mediaInput').click();
}

document.addEventListener('DOMContentLoaded', () => {
  const mediaInput = el('mediaInput');
  if (mediaInput) {
    mediaInput.addEventListener('change', function(e) {
      const file = e.target.files[0];
      if (!file) return;
      
      const preview = el('mediaPreview');
      const previewContainer = el('postMediaPreview');
      
      if (!preview || !previewContainer) return;
      
      if (file.type.startsWith('image/')) {
        const reader = new FileReader();
        reader.onload = function(e) {
          preview.src = e.target.result;
          previewContainer.style.display = 'block';
        };
        reader.readAsDataURL(file);
      } else if (file.type.startsWith('video/')) {
        previewContainer.innerHTML = `
          <div style="padding: 20px; text-align: center; background: var(--hover); border-radius: var(--radius);">
            <i class="fas fa-video" style="font-size: 48px; color: var(--muted); margin-bottom: 16px;"></i>
            <div>Video selected: ${file.name}</div>
          </div>
        `;
        previewContainer.style.display = 'block';
      }
    });
  }
});

function removeMedia() {
  el('mediaInput').value = '';
  el('postMediaPreview').style.display = 'none';
}

/* ===========================================================
   CONTACTS & ONLINE USERS
=========================================================== */
async function loadContacts() {
  try {
    const { data: users, error } = await sb
      .from('profiles')
      .select('id, username, avatar_url')
      .neq('id', currentUser.id)
      .order('username')
      .limit(10);
      
    if (error) throw error;
    
    const onlineList = el('onlineList');
    const contactsList = el('contactsList');
    
    if (onlineList) {
      onlineList.innerHTML = '';
      users.slice(0, 5).forEach(user => {
        const userElement = createOnlineUserElement(user);
        onlineList.appendChild(userElement);
      });
    }
    
    if (contactsList) {
      contactsList.innerHTML = '';
      users.forEach(user => {
        const contactElement = createContactElement(user);
        contactsList.appendChild(contactElement);
      });
    }
    
  } catch (error) {
    console.error('Error loading contacts:', error);
  }
}

function createOnlineUserElement(user) {
  const div = document.createElement('div');
  div.className = 'online-user';
  
  const avatarInitial = (user.username || 'U').charAt(0).toUpperCase();
  
  div.innerHTML = `
    <div class="online-avatar">
      ${user.avatar_url 
        ? `<img src="${user.avatar_url}" alt="${user.username}">`
        : `<span style="width:32px;height:32px;border-radius:50%;background:var(--primary);color:white;display:flex;align-items:center;justify-content:center;">${avatarInitial}</span>`
      }
      <div class="online-status"></div>
    </div>
    <div>${user.username}</div>
  `;
  
  div.onclick = () => startChatWithUser(user);
  
  return div;
}

function createContactElement(user) {
  const div = document.createElement('div');
  div.className = 'contact-item';
  
  const avatarInitial = (user.username || 'U').charAt(0).toUpperCase();
  
  div.innerHTML = `
    <div class="contact-avatar">
      ${user.avatar_url 
        ? `<img src="${user.avatar_url}" alt="${user.username}">`
        : `<span style="width:36px;height:36px;border-radius:50%;background:var(--primary);color:white;display:flex;align-items:center;justify-content:center;font-size:16px;">${avatarInitial}</span>`
      }
      <div class="contact-status"></div>
    </div>
    <div class="contact-info">
      <div class="contact-name">${user.username}</div>
      <div class="contact-status-text">Online</div>
    </div>
  `;
  
  div.onclick = () => startChatWithUser(user);
  
  return div;
}

function refreshContacts() {
  loadContacts();
  showToast('Contacts refreshed', 'success');
}

/* ===========================================================
   MESSENGER SYSTEM - SIMPLIFIED WORKING VERSION
=========================================================== */
function openMessenger() {
  el('messengerModal').classList.add('active');
  loadChats();
}

function closeMessenger() {
  el('messengerModal').classList.remove('active');
  activeChatUser = null;
  activeChatId = null;
  
  if (msgSubscription) {
    msgSubscription.unsubscribe();
    msgSubscription = null;
  }
}

async function loadChats() {
  const chatsContainer = el('messengerChats');
  if (!chatsContainer) return;
  
  chatsContainer.innerHTML = '<p class="text-center">Loading chats...</p>';
  
  try {
    // First check if chats table exists
    const chatsExist = await tableExists('chats');
    
    if (!chatsExist) {
      // Show empty state
      chatsContainer.innerHTML = `
        <div class="text-center" style="padding: 40px 20px; color: var(--muted);">
          <i class="fas fa-comments" style="font-size: 48px; margin-bottom: 16px; opacity: 0.5;"></i>
          <h4>No conversations yet</h4>
          <p>Start a conversation with someone!</p>
        </div>
      `;
      return;
    }
    
    // Get chats where current user is involved
    const { data: chats, error } = await sb
      .from('chats')
      .select('*')
      .or(`user1_id.eq.${currentUser.id},user2_id.eq.${currentUser.id}`)
      .order('updated_at', { ascending: false });
      
    if (error) {
      chatsContainer.innerHTML = '<p class="text-center">No conversations yet</p>';
      return;
    }
    
    chatsContainer.innerHTML = '';
    
    if (!chats || chats.length === 0) {
      chatsContainer.innerHTML = `
        <div class="text-center" style="padding: 40px 20px; color: var(--muted);">
          <i class="fas fa-comments" style="font-size: 48px; margin-bottom: 16px; opacity: 0.5;"></i>
          <h4>No conversations yet</h4>
          <p>Start a conversation with someone!</p>
        </div>
      `;
      return;
    }
    
    // Get user details for each chat
    for (const chat of chats) {
      const otherUserId = chat.user1_id === currentUser.id ? chat.user2_id : chat.user1_id;
      
      // Get other user's profile
      const { data: otherUser } = await sb
        .from('profiles')
        .select('username, avatar_url')
        .eq('id', otherUserId)
        .single();
      
      const chatElement = createChatElement(chat, otherUser || { username: 'Unknown User', avatar_url: null });
      chatsContainer.appendChild(chatElement);
    }
    
  } catch (error) {
    console.error('Error loading chats:', error);
    chatsContainer.innerHTML = '<p class="text-center">Failed to load chats</p>';
  }
}

function createChatElement(chat, otherUser) {
  const div = document.createElement('div');
  div.className = 'chat-item';
  
  const lastMessageTime = chat.last_message_at ? formatRelativeTime(chat.last_message_at) : '';
  const username = otherUser?.username || 'Unknown User';
  const avatarInitial = username.charAt(0).toUpperCase();
  
  div.innerHTML = `
    <div class="chat-avatar">
      ${otherUser?.avatar_url 
        ? `<img src="${otherUser.avatar_url}" alt="${username}">`
        : `<span style="width:48px;height:48px;border-radius:50%;background:var(--primary);color:white;display:flex;align-items:center;justify-content:center;font-size:18px;">${avatarInitial}</span>`
      }
    </div>
    <div class="chat-info">
      <div class="chat-name">${username}</div>
      <div class="chat-preview">${chat.last_message || 'No messages yet'}</div>
    </div>
    <div class="chat-meta">
      <div class="chat-time">${lastMessageTime}</div>
      ${chat.unread_count > 0 ? `<div class="chat-unread">${chat.unread_count}</div>` : ''}
    </div>
  `;
  
  div.onclick = () => openChat(chat.id, otherUser);
  
  return div;
}

async function openChat(chatId, user) {
  activeChatUser = user;
  activeChatId = chatId;
  
  // Update chat header
  if (el('chatUserName')) el('chatUserName').textContent = user.username || 'Unknown User';
  if (el('chatUserStatus')) el('chatUserStatus').textContent = 'Online';
  
  const avatarInitial = (user.username || 'U').charAt(0).toUpperCase();
  if (el('chatUserAvatar')) {
    el('chatUserAvatar').innerHTML = user.avatar_url 
      ? `<img src="${user.avatar_url}" alt="${user.username}">`
      : `<span style="width:48px;height:48px;border-radius:50%;background:var(--primary);color:white;display:flex;align-items:center;justify-content:center;font-size:18px;">${avatarInitial}</span>`;
  }
  
  // Load messages
  await loadMessages(chatId);
  
  // Update active state in list
  qsa('.chat-item').forEach(item => item.classList.remove('active'));
  const activeItem = Array.from(qsa('.chat-item')).find(item => {
    const name = item.querySelector('.chat-name');
    return name && name.textContent === user.username;
  });
  if (activeItem) activeItem.classList.add('active');
}

async function loadMessages(chatId) {
  const messagesContainer = el('chatMessages');
  if (!messagesContainer) return;
  
  messagesContainer.innerHTML = '<p class="text-center">Loading messages...</p>';
  
  try {
    // Check if messages table exists
    const messagesExist = await tableExists('messages');
    
    if (!messagesExist) {
      messagesContainer.innerHTML = `
        <div class="text-center" style="padding: 40px 20px; color: var(--muted);">
          <i class="fas fa-comment" style="font-size: 48px; margin-bottom: 16px; opacity: 0.5;"></i>
          <h4>No messages yet</h4>
          <p>Send your first message!</p>
        </div>
      `;
      return;
    }
    
    const { data: messages, error } = await sb
      .from('messages')
      .select('*')
      .eq('chat_id', chatId)
      .order('created_at', { ascending: true });
      
    if (error) {
      console.error('Error loading messages:', error);
      messagesContainer.innerHTML = '<p class="text-center">No messages yet</p>';
      return;
    }
    
    messagesContainer.innerHTML = '';
    
    if (!messages || messages.length === 0) {
      messagesContainer.innerHTML = `
        <div class="text-center" style="padding: 40px 20px; color: var(--muted);">
          <i class="fas fa-comment" style="font-size: 48px; margin-bottom: 16px; opacity: 0.5;"></i>
          <h4>No messages yet</h4>
          <p>Send your first message!</p>
        </div>
      `;
      return;
    }
    
    for (const message of messages) {
      const messageElement = createMessageElement(message);
      messagesContainer.appendChild(messageElement);
    }
    
    // Scroll to bottom
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
    
  } catch (error) {
    console.error('Error loading messages:', error);
    messagesContainer.innerHTML = '<p class="text-center">Failed to load messages</p>';
  }
}

function createMessageElement(message) {
  const div = document.createElement('div');
  div.className = `message ${message.sender_id === currentUser.id ? 'sent' : 'received'}`;
  
  const messageTime = formatRelativeTime(message.created_at);
  
  div.innerHTML = `
    <div>${message.content}</div>
    <div class="message-time">${messageTime}</div>
  `;
  
  return div;
}

async function sendChatMessage() {
  if (!activeChatUser || !activeChatId) {
    showToast('Please select a conversation first', 'warning');
    return;
  }
  
  const input = el('chatInput');
  if (!input) return;
  
  const content = input.value.trim();
  
  if (!content) {
    showToast('Please enter a message', 'warning');
    return;
  }
  
  try {
    // First, ensure chats table exists and has the chat
    const { data: chat } = await sb
      .from('chats')
      .select('id')
      .eq('id', activeChatId)
      .single();
    
    if (!chat) {
      showToast('Chat not found', 'error');
      return;
    }
    
    // Send message
    const { error } = await sb.from('messages').insert({
      chat_id: activeChatId,
      sender_id: currentUser.id,
      content: content,
      created_at: new Date().toISOString()
    });
    
    if (error) {
      console.error('Error sending message:', error);
      
      // If the error is about missing chat_id column, create the table
      if (error.message.includes('chat_id') || error.message.includes('column')) {
        showToast('Messaging system needs setup. Please run the SQL commands first.', 'error');
        return;
      }
      
      throw error;
    }
    
    // Update chat with last message
    await sb
      .from('chats')
      .update({
        last_message: content.length > 50 ? content.substring(0, 47) + '...' : content,
        last_message_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .eq('id', activeChatId);
    
    input.value = '';
    
    // Add message to UI
    const messagesContainer = el('chatMessages');
    if (messagesContainer) {
      const messageElement = createMessageElement({
        chat_id: activeChatId,
        sender_id: currentUser.id,
        content: content,
        created_at: new Date().toISOString()
      });
      messagesContainer.appendChild(messageElement);
      messagesContainer.scrollTop = messagesContainer.scrollHeight;
    }
    
    // Reload chats list
    await loadChats();
    
  } catch (error) {
    console.error('Error sending message:', error);
    showToast('Failed to send message', 'error');
  }
}

async function startChatWithUser(user) {
  try {
    // Check if chat already exists
    const { data: existingChat } = await sb
      .from('chats')
      .select('id')
      .or(`and(user1_id.eq.${currentUser.id},user2_id.eq.${user.id}),and(user1_id.eq.${user.id},user2_id.eq.${currentUser.id})`)
      .maybeSingle();
    
    let chatId;
    
    if (existingChat) {
      chatId = existingChat.id;
    } else {
      // Create new chat
      const { data: newChat, error } = await sb
        .from('chats')
        .insert({
          user1_id: currentUser.id,
          user2_id: user.id,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          last_message: 'Chat started',
          last_message_at: new Date().toISOString(),
          unread_count: 0
        })
        .select('id')
        .single();
      
      if (error) {
        console.error('Error creating chat:', error);
        showToast('Failed to create chat. Please ensure chats table exists.', 'error');
        return;
      }
      
      chatId = newChat.id;
    }
    
    // Open messenger and the chat
    openMessenger();
    setTimeout(() => {
      openChat(chatId, user);
    }, 100);
    
  } catch (error) {
    console.error('Error starting chat:', error);
    showToast('Failed to start conversation. Chat system may need setup.', 'error');
  }
}

function startNewChat() {
  showToast('Start new chat feature coming soon!', 'info');
}

/* ===========================================================
   INITIALIZATION
=========================================================== */
function initDashboard() {
  loadPosts();
  loadContacts();
}

function setupEventListeners() {
  // Theme toggle
  if (el('themeToggle')) {
    el('themeToggle').addEventListener('click', toggleTheme);
  }
  
  // Messenger button
  if (el('messengerBtn')) {
    el('messengerBtn').addEventListener('click', openMessenger);
  }
  
  // Chat input enter key
  const chatInput = el('chatInput');
  if (chatInput) {
    chatInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendChatMessage();
      }
    });
  }
  
  // Auto-resize textareas
  qsa('textarea').forEach(textarea => {
    textarea.addEventListener('input', function() {
      this.style.height = 'auto';
      this.style.height = (this.scrollHeight) + 'px';
    });
  });
}

/* ===========================================================
   START APPLICATION
=========================================================== */
// Initialize theme first
initTheme();

// Load user and initialize dashboard
document.addEventListener('DOMContentLoaded', () => {
  loadUser();
});

// Helper functions for missing features
function openFeelingPickerModal() {
  showToast('Feeling picker coming soon!', 'info');
}

function openCameraModal() {
  showToast('Camera feature coming soon!', 'info');
}

function loadFollowingPosts() {
  showToast('Loading posts from people you follow...', 'info');
  loadPosts();
}

function loadPopularPosts() {
  showToast('Loading popular posts...', 'info');
  loadPosts();
}

function showNotifications() {
  showToast('Notifications feature coming soon!', 'info');
}

function openEditProfile() {
  el('editProfileModal').classList.add('active');
}

function markAllNotificationsAsRead() {
  showToast('All notifications marked as read', 'success');
}
