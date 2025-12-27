/* ===========================================================
   SUPABASE CLIENT INITIALIZATION
=========================================================== */
const SUPABASE_URL = "https://ojjvkhafgurgondsopeh.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9qanZraGFmZ3VyZ29uZHNvcGVoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQ5MDkzODYsImV4cCI6MjA4MDQ4NTM4Nn0.hOLxBVqnFhJ2S1jjR0mkKUJ_bWDjZbHJD3wV0Rbbf7A";

const sb = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

/* ===========================================================
   GLOBAL STATE
=========================================================== */
let currentUser = null;
let currentProfile = null;
let userLikes = new Set();
let userBookmarks = new Set();
let activeChatUser = null;
let activePost = null;
let msgSubscription = null;
let notificationsSubscription = null;
let postsSubscription = null;
let cameraStream = null;
let currentTheme = 'light';

/* ===========================================================
   HELPER FUNCTIONS
=========================================================== */
function el(id) { return document.getElementById(id); }
function qs(selector) { return document.querySelector(selector); }
function qsa(selector) { return document.querySelectorAll(selector); }

// Format relative time
function formatRelativeTime(dateString) {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now - date;
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHour = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHour / 24);
  const diffWeek = Math.floor(diffDay / 7);
  const diffMonth = Math.floor(diffDay / 30);
  const diffYear = Math.floor(diffDay / 365);
  
  if (diffSec < 60) return 'just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHour < 24) return `${diffHour}h ago`;
  if (diffDay < 7) return `${diffDay}d ago`;
  if (diffWeek < 4) return `${diffWeek}w ago`;
  if (diffMonth < 12) return `${diffMonth}mo ago`;
  return `${diffYear}y ago`;
}

// Format date for display
function formatDate(dateString) {
  const date = new Date(dateString);
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

// Show toast notification
function showToast(message, type = 'info', duration = 3000) {
  const toastContainer = el('toastContainer');
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  
  const icons = {
    success: 'fas fa-check-circle',
    error: 'fas fa-exclamation-circle',
    warning: 'fas fa-exclamation-triangle',
    info: 'fas fa-info-circle'
  };
  
  toast.innerHTML = `
    <i class="${icons[type]} toast-icon"></i>
    <div class="toast-content">${message}</div>
    <button class="toast-close" onclick="this.parentElement.remove()">
      <i class="fas fa-times"></i>
    </button>
  `;
  
  toastContainer.appendChild(toast);
  
  if (duration > 0) {
    setTimeout(() => {
      if (toast.parentElement) {
        toast.remove();
      }
    }, duration);
  }
  
  return toast;
}

// Debounce function
function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

// Truncate text
function truncateText(text, maxLength) {
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength) + '...';
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
  if (theme === 'dark') {
    icon.className = 'fas fa-sun';
  } else {
    icon.className = 'fas fa-moon';
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
  const { data, error } = await sb.auth.getUser();
  
  if (error || !data.user) {
    window.location.href = 'login.html';
    return;
  }
  
  currentUser = data.user;
  await ensureProfileExists();
  await loadUserProfile();
  await loadUserLikes();
  await loadUserBookmarks();
  
  // Initialize all dashboard components
  initDashboard();
  setupEventListeners();
  setupSubscriptions();
}

async function ensureProfileExists() {
  const { data } = await sb
    .from('profiles')
    .select('id')
    .eq('id', currentUser.id)
    .maybeSingle();
    
  if (!data) {
    const username = currentUser.email.split('@')[0];
    await sb.from('profiles').insert({
      id: currentUser.id,
      username: username,
      bio: 'Welcome to My-Day!',
      created_at: new Date().toISOString()
    });
  }
}

async function loadUserProfile() {
  const { data, error } = await sb
    .from('profiles')
    .select('*')
    .eq('id', currentUser.id)
    .single();
    
  if (error) {
    console.error('Error loading profile:', error);
    return;
  }
  
  currentProfile = data;
  updateProfileUI();
}

function updateProfileUI() {
  if (!currentProfile) return;
  
  // Update profile card
  el('profileUsername').textContent = currentProfile.username;
  el('profileBio').textContent = currentProfile.bio || 'Welcome to My-Day!';
  el('avatarInitial').textContent = currentProfile.username.charAt(0).toUpperCase();
  
  // Update header avatar
  el('headerAvatar').innerHTML = `
    <span class="avatar-initial">${currentProfile.username.charAt(0).toUpperCase()}</span>
  `;
  
  // Update create post avatar
  el('createPostAvatar').innerHTML = `
    <span class="avatar-initial">${currentProfile.username.charAt(0).toUpperCase()}</span>
  `;
  
  // Update modal post avatar
  el('modalPostAvatar').innerHTML = `
    <span class="avatar-initial">${currentProfile.username.charAt(0).toUpperCase()}</span>
  `;
  el('modalPostName').textContent = currentProfile.username;
  
  // Update edit profile modal
  el('editUsername').value = currentProfile.username;
  el('editBio').value = currentProfile.bio || '';
  el('editLocation').value = currentProfile.location || '';
  el('editWebsite').value = currentProfile.website || '';
  el('editAvatarInitial').textContent = currentProfile.username.charAt(0).toUpperCase();
  
  // Update avatar image if exists
  if (currentProfile.avatar_url) {
    updateAvatarImages(currentProfile.avatar_url);
  }
}

function updateAvatarImages(avatarUrl) {
  const avatars = qsa('.avatar, .post-input-avatar, .chat-avatar, .online-avatar, .contact-avatar');
  avatars.forEach(avatar => {
    const existingImg = avatar.querySelector('img');
    if (existingImg) {
      existingImg.src = avatarUrl;
    } else {
      const img = document.createElement('img');
      img.src = avatarUrl;
      img.alt = currentProfile.username;
      avatar.innerHTML = '';
      avatar.appendChild(img);
    }
  });
}

/* ===========================================================
   PROFILE EDITING
=========================================================== */
function openEditProfile() {
  el('editProfileModal').classList.add('active');
}

function closeEditProfileModal() {
  el('editProfileModal').classList.remove('active');
}

async function saveProfile() {
  const username = el('editUsername').value.trim();
  const bio = el('editBio').value.trim();
  const location = el('editLocation').value.trim();
  const website = el('editWebsite').value.trim();
  
  if (!username) {
    showToast('Username is required', 'error');
    return;
  }
  
  const btn = el('saveProfileBtn');
  btn.disabled = true;
  btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Saving...';
  
  try {
    const { error } = await sb
      .from('profiles')
      .update({
        username,
        bio,
        location,
        website,
        updated_at: new Date().toISOString()
      })
      .eq('id', currentUser.id);
      
    if (error) throw error;
    
    await loadUserProfile();
    showToast('Profile updated successfully!', 'success');
    closeEditProfileModal();
  } catch (error) {
    console.error('Error updating profile:', error);
    showToast('Failed to update profile', 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Save Changes';
  }
}

// Avatar upload
el('avatarUpload')?.addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  
  if (!file.type.startsWith('image/')) {
    showToast('Please select an image file', 'error');
    return;
  }
  
  if (file.size > 5 * 1024 * 1024) { // 5MB limit
    showToast('Image size must be less than 5MB', 'error');
    return;
  }
  
  const btn = el('saveProfileBtn');
  btn.disabled = true;
  btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Uploading...';
  
  try {
    const fileExt = file.name.split('.').pop();
    const fileName = `${currentUser.id}_${Date.now()}.${fileExt}`;
    
    const { error: uploadError } = await sb.storage
      .from('avatars')
      .upload(fileName, file);
      
    if (uploadError) throw uploadError;
    
    const { data: { publicUrl } } = sb.storage
      .from('avatars')
      .getPublicUrl(fileName);
    
    const { error: updateError } = await sb
      .from('profiles')
      .update({ avatar_url: publicUrl })
      .eq('id', currentUser.id);
      
    if (updateError) throw updateError;
    
    currentProfile.avatar_url = publicUrl;
    updateAvatarImages(publicUrl);
    showToast('Avatar updated successfully!', 'success');
  } catch (error) {
    console.error('Error uploading avatar:', error);
    showToast('Failed to upload avatar', 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Save Changes';
  }
});

/* ===========================================================
   POST MANAGEMENT
=========================================================== */
async function loadUserLikes() {
  const { data } = await sb
    .from('post_likes')
    .select('post_id')
    .eq('user_id', currentUser.id);
    
  userLikes = new Set(data?.map(x => x.post_id) || []);
}

async function loadUserBookmarks() {
  const { data } = await sb
    .from('post_bookmarks')
    .select('post_id')
    .eq('user_id', currentUser.id);
    
  userBookmarks = new Set(data?.map(x => x.post_id) || []);
}

async function loadPosts() {
  const postsContainer = el('postsContainer');
  postsContainer.innerHTML = `
    <div class="skeleton skeleton-post"></div>
    <div class="skeleton skeleton-post"></div>
    <div class="skeleton skeleton-post"></div>
  `;
  
  const { data: posts, error } = await sb
    .from('posts')
    .select(`
      *,
      profiles!inner (
        username,
        avatar_url
      ),
      comments(count),
      post_likes(count)
    `)
    .order('created_at', { ascending: false })
    .limit(20);
    
  if (error) {
    console.error('Error loading posts:', error);
    postsContainer.innerHTML = '<p class="text-center">Failed to load posts</p>';
    return;
  }
  
  postsContainer.innerHTML = '';
  
  if (posts.length === 0) {
    postsContainer.innerHTML = `
      <div class="post-card" style="text-align: center; padding: 40px 20px;">
        <i class="fas fa-newspaper" style="font-size: 48px; color: var(--text-lighter); margin-bottom: 16px;"></i>
        <h3>No posts yet</h3>
        <p>Be the first to post something!</p>
        <button class="btn btn-primary mt-4" onclick="openCreatePostModal()">
          <i class="fas fa-plus"></i> Create First Post
        </button>
      </div>
    `;
    return;
  }
  
  // Update post count
  el('postCount').textContent = posts.length;
  
  for (const post of posts) {
    const postElement = createPostElement(post);
    postsContainer.appendChild(postElement);
  }
}

function createPostElement(post) {
  const div = document.createElement('div');
  div.className = 'post-card';
  div.id = `post-${post.id}`;
  
  const isLiked = userLikes.has(post.id);
  const isBookmarked = userBookmarks.has(post.id);
  const likeCount = post.post_likes?.[0]?.count || 0;
  const commentCount = post.comments?.[0]?.count || 0;
  
  // Format time
  const postTime = formatRelativeTime(post.created_at);
  const fullPostTime = formatDate(post.created_at);
  
  let mediaHTML = '';
  if (post.media_url) {
    if (post.media_type === 'image') {
      mediaHTML = `
        <div class="post-media">
          <img src="${post.media_url}" alt="Post image" loading="lazy" 
               onclick="openMediaViewer('${post.media_url}', 'image')">
        </div>
      `;
    } else if (post.media_type === 'video') {
      mediaHTML = `
        <div class="post-media">
          <video src="${post.media_url}" controls onclick="this.paused ? this.play() : this.pause();"></video>
        </div>
      `;
    }
  }
  
  div.innerHTML = `
    <div class="post-header">
      <div class="post-user-info">
        <div class="post-avatar">
          ${post.profiles.avatar_url 
            ? `<img src="${post.profiles.avatar_url}" alt="${post.profiles.username}">`
            : `<span class="avatar-initial" style="width: 40px; height: 40px; font-size: 16px;">${post.profiles.username.charAt(0).toUpperCase()}</span>`
          }
        </div>
        <div class="post-user-details">
          <div class="post-username">${post.profiles.username}</div>
          <div class="post-time" title="${fullPostTime}">${postTime}</div>
        </div>
      </div>
      <div class="post-menu">
        <button class="post-menu-btn" onclick="togglePostMenu(${post.id})">
          <i class="fas fa-ellipsis-h"></i>
        </button>
        <div class="notification-dropdown post-menu-dropdown" id="post-menu-${post.id}" style="display: none; position: absolute; right: 0; top: 100%; min-width: 200px;">
          <div class="notification-list">
            <button class="nav-item" onclick="sharePost(${post.id})">
              <i class="fas fa-share nav-icon"></i>
              <span>Share</span>
            </button>
            <button class="nav-item" onclick="savePost(${post.id})">
              <i class="fas fa-bookmark nav-icon"></i>
              <span>${isBookmarked ? 'Unsave Post' : 'Save Post'}</span>
            </button>
            <button class="nav-item" onclick="reportPost(${post.id})">
              <i class="fas fa-flag nav-icon"></i>
              <span>Report Post</span>
            </button>
            ${post.user_id === currentUser.id ? `
              <hr style="margin: var(--space-sm) 0;">
              <button class="nav-item" onclick="editPost(${post.id})">
                <i class="fas fa-edit nav-icon"></i>
                <span>Edit Post</span>
              </button>
              <button class="nav-item" onclick="deletePost(${post.id})" style="color: var(--danger);">
                <i class="fas fa-trash nav-icon"></i>
                <span>Delete Post</span>
              </button>
            ` : ''}
          </div>
        </div>
      </div>
    </div>
    
    <div class="post-content">
      <div class="post-text">${post.caption || ''}</div>
      ${mediaHTML}
    </div>
    
    <div class="post-stats">
      <div class="post-likes">
        <i class="fas fa-heart" style="color: var(--danger);"></i>
        <span>${likeCount} likes</span>
      </div>
      <div class="post-comments">
        <span>${commentCount} comments</span>
      </div>
      <div class="post-shares">
        <span>${post.shares || 0} shares</span>
      </div>
    </div>
    
    <div class="post-actions-container">
      <button class="post-action ${isLiked ? 'active' : ''}" onclick="likePost(${post.id})" id="like-btn-${post.id}">
        <i class="${isLiked ? 'fas' : 'far'} fa-heart"></i>
        <span>${isLiked ? 'Liked' : 'Like'}</span>
      </button>
      <button class="post-action" onclick="toggleComments(${post.id})">
        <i class="far fa-comment"></i>
        <span>Comment</span>
      </button>
      <button class="post-action" onclick="sharePost(${post.id})">
        <i class="fas fa-share"></i>
        <span>Share</span>
      </button>
      <button class="post-action ${isBookmarked ? 'active' : ''}" onclick="bookmarkPost(${post.id})" id="bookmark-btn-${post.id}">
        <i class="${isBookmarked ? 'fas' : 'far'} fa-bookmark"></i>
        <span>${isBookmarked ? 'Saved' : 'Save'}</span>
      </button>
    </div>
    
    <div class="comments-section" id="comments-${post.id}">
      <div class="comments-list" id="comments-list-${post.id}">
        <!-- Comments loaded dynamically -->
      </div>
      <div class="comment-form">
        <div class="post-input-avatar" style="width: 32px; height: 32px;">
          ${currentProfile?.avatar_url 
            ? `<img src="${currentProfile.avatar_url}" alt="${currentProfile.username}">`
            : `<span class="avatar-initial" style="width: 32px; height: 32px; font-size: 14px;">${currentProfile?.username?.charAt(0).toUpperCase() || 'U'}</span>`
          }
        </div>
        <input type="text" class="comment-input" id="comment-input-${post.id}" placeholder="Write a comment..." 
               onkeypress="if(event.key === 'Enter') addComment(${post.id})">
      </div>
    </div>
  `;
  
  return div;
}

async function likePost(postId) {
  const likeBtn = el(`like-btn-${postId}`);
  const likeIcon = likeBtn.querySelector('i');
  const likeText = likeBtn.querySelector('span');
  
  if (userLikes.has(postId)) {
    // Unlike
    await sb.from('post_likes').delete()
      .eq('post_id', postId)
      .eq('user_id', currentUser.id);
    
    userLikes.delete(postId);
    likeIcon.className = 'far fa-heart';
    likeText.textContent = 'Like';
    likeBtn.classList.remove('active');
    
    // Update like count
    const postStats = likeBtn.closest('.post-card').querySelector('.post-likes span');
    const currentCount = parseInt(postStats.textContent) || 0;
    postStats.textContent = `${currentCount - 1} likes`;
  } else {
    // Like
    await sb.from('post_likes').insert({
      post_id: postId,
      user_id: currentUser.id
    });
    
    userLikes.add(postId);
    likeIcon.className = 'fas fa-heart';
    likeText.textContent = 'Liked';
    likeBtn.classList.add('active');
    
    // Add animation
    const heart = document.createElement('div');
    heart.innerHTML = '<i class="fas fa-heart" style="color: var(--danger);"></i>';
    heart.style.cssText = `
      position: absolute;
      font-size: 24px;
      pointer-events: none;
      animation: floatUp 1s ease-out forwards;
    `;
    
    likeBtn.appendChild(heart);
    setTimeout(() => heart.remove(), 1000);
    
    // Update like count
    const postStats = likeBtn.closest('.post-card').querySelector('.post-likes span');
    const currentCount = parseInt(postStats.textContent) || 0;
    postStats.textContent = `${currentCount + 1} likes`;
    
    // Send notification if not own post
    const post = await sb.from('posts').select('user_id').eq('id', postId).single();
    if (post.data && post.data.user_id !== currentUser.id) {
      await sendNotification(post.data.user_id, 'like', postId);
    }
  }
}

async function bookmarkPost(postId) {
  const bookmarkBtn = el(`bookmark-btn-${postId}`);
  const bookmarkIcon = bookmarkBtn.querySelector('i');
  const bookmarkText = bookmarkBtn.querySelector('span');
  
  if (userBookmarks.has(postId)) {
    // Remove bookmark
    await sb.from('post_bookmarks').delete()
      .eq('post_id', postId)
      .eq('user_id', currentUser.id);
    
    userBookmarks.delete(postId);
    bookmarkIcon.className = 'far fa-bookmark';
    bookmarkText.textContent = 'Save';
    bookmarkBtn.classList.remove('active');
  } else {
    // Add bookmark
    await sb.from('post_bookmarks').insert({
      post_id: postId,
      user_id: currentUser.id
    });
    
    userBookmarks.add(postId);
    bookmarkIcon.className = 'fas fa-bookmark';
    bookmarkText.textContent = 'Saved';
    bookmarkBtn.classList.add('active');
  }
}

async function toggleComments(postId) {
  const commentsSection = el(`comments-${postId}`);
  commentsSection.classList.toggle('active');
  
  if (commentsSection.classList.contains('active')) {
    await loadComments(postId);
  }
}

async function loadComments(postId) {
  const commentsList = el(`comments-list-${postId}`);
  commentsList.innerHTML = '<p class="text-center">Loading comments...</p>';
  
  const { data: comments, error } = await sb
    .from('comments')
    .select(`
      *,
      profiles (
        username,
        avatar_url
      )
    `)
    .eq('post_id', postId)
    .order('created_at', { ascending: true });
    
  if (error) {
    commentsList.innerHTML = '<p class="text-center">Failed to load comments</p>';
    return;
  }
  
  commentsList.innerHTML = '';
  
  if (comments.length === 0) {
    commentsList.innerHTML = '<p class="text-center">No comments yet. Be the first to comment!</p>';
    return;
  }
  
  for (const comment of comments) {
    const commentElement = createCommentElement(comment);
    commentsList.appendChild(commentElement);
  }
}

function createCommentElement(comment) {
  const div = document.createElement('div');
  div.className = 'comment-item';
  
  const commentTime = formatRelativeTime(comment.created_at);
  
  div.innerHTML = `
    <div class="comment-avatar">
      ${comment.profiles.avatar_url 
        ? `<img src="${comment.profiles.avatar_url}" alt="${comment.profiles.username}">`
        : `<span class="avatar-initial" style="width: 32px; height: 32px; font-size: 14px;">${comment.profiles.username.charAt(0).toUpperCase()}</span>`
      }
    </div>
    <div class="comment-content">
      <div class="comment-header">
        <div class="comment-username">${comment.profiles.username}</div>
        <div class="comment-time" title="${formatDate(comment.created_at)}">${commentTime}</div>
      </div>
      <div class="comment-text">${comment.comment}</div>
    </div>
  `;
  
  return div;
}

async function addComment(postId) {
  const commentInput = el(`comment-input-${postId}`);
  const comment = commentInput.value.trim();
  
  if (!comment) return;
  
  const { error } = await sb.from('comments').insert({
    post_id: postId,
    user_id: currentUser.id,
    comment: comment
  });
  
  if (error) {
    showToast('Failed to post comment', 'error');
    return;
  }
  
  commentInput.value = '';
  await loadComments(postId);
  
  // Send notification if not own post
  const post = await sb.from('posts').select('user_id').eq('id', postId).single();
  if (post.data && post.data.user_id !== currentUser.id) {
    await sendNotification(post.data.user_id, 'comment', postId);
  }
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
  el('postFeeling').style.display = 'none';
}

async function submitPost() {
  const caption = el('postCaption').value.trim();
  const privacy = el('postPrivacy').value;
  const mediaFile = el('mediaInput').files[0];
  const feeling = el('postFeeling').dataset.feeling;
  
  if (!caption && !mediaFile) {
    showToast('Please add some text or media to your post', 'error');
    return;
  }
  
  const btn = el('submitPostBtn');
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
      caption: caption,
      media_url: mediaUrl,
      media_type: mediaType,
      privacy: privacy,
      feeling: feeling || null,
      likes: 0,
      shares: 0
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

el('mediaInput')?.addEventListener('change', function(e) {
  const file = e.target.files[0];
  if (!file) return;
  
  const preview = el('mediaPreview');
  const previewContainer = el('postMediaPreview');
  
  if (file.type.startsWith('image/')) {
    const reader = new FileReader();
    reader.onload = function(e) {
      preview.src = e.target.result;
      previewContainer.style.display = 'block';
    };
    reader.readAsDataURL(file);
  } else if (file.type.startsWith('video/')) {
    preview.src = '';
    previewContainer.style.display = 'block';
    preview.innerHTML = `
      <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; height: 200px; color: var(--text-lighter);">
        <i class="fas fa-video" style="font-size: 48px; margin-bottom: 16px;"></i>
        <span>Video selected: ${file.name}</span>
      </div>
    `;
  }
});

function removeMedia() {
  el('mediaInput').value = '';
  el('postMediaPreview').style.display = 'none';
}

function openFeelingPickerModal() {
  el('feelingModal').classList.add('active');
  populateFeelings();
}

function closeFeelingModal() {
  el('feelingModal').classList.remove('active');
}

function populateFeelings() {
  const feelingsGrid = qs('.feelings-grid');
  const feelings = [
    { emoji: '😊', text: 'Happy' },
    { emoji: '😢', text: 'Sad' },
    { emoji: '😮', text: 'Surprised' },
    { emoji: '😍', text: 'Loved' },
    { emoji: '😠', text: 'Angry' },
    { emoji: '😴', text: 'Tired' },
    { emoji: '🤒', text: 'Sick' },
    { emoji: '🎉', text: 'Celebrating' },
    { emoji: '✈️', text: 'Traveling' },
    { emoji: '🍕', text: 'Eating' },
    { emoji: '💪', text: 'Working Out' },
    { emoji: '🎵', text: 'Listening to Music' }
  ];
  
  feelingsGrid.innerHTML = '';
  
  feelings.forEach(feeling => {
    const btn = document.createElement('button');
    btn.className = 'post-action-btn';
    btn.style.flexDirection = 'column';
    btn.innerHTML = `
      <span style="font-size: 24px;">${feeling.emoji}</span>
      <span style="font-size: 12px;">${feeling.text}</span>
    `;
    btn.onclick = () => selectFeeling(feeling.emoji, feeling.text);
    feelingsGrid.appendChild(btn);
  });
}

function selectFeeling(emoji, text) {
  const feelingContainer = el('postFeeling');
  const feelingText = el('feelingText');
  
  feelingText.textContent = `${emoji} Feeling ${text}`;
  feelingContainer.dataset.feeling = text;
  feelingContainer.style.display = 'flex';
  
  closeFeelingModal();
}

function removeFeeling() {
  el('postFeeling').style.display = 'none';
  el('postFeeling').dataset.feeling = '';
}

/* ===========================================================
   CAMERA FUNCTIONALITY
=========================================================== */
async function openCameraModal() {
  el('cameraModal').classList.add('active');
  
  try {
    cameraStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'user' },
      audio: false
    });
    
    const video = el('cameraVideo');
    video.srcObject = cameraStream;
  } catch (error) {
    console.error('Camera error:', error);
    showToast('Camera access denied or unavailable', 'error');
    closeCameraModal();
  }
}

function closeCameraModal() {
  el('cameraModal').classList.remove('active');
  
  if (cameraStream) {
    cameraStream.getTracks().forEach(track => track.stop());
    cameraStream = null;
  }
}

function switchCamera() {
  if (!cameraStream) return;
  
  const videoTrack = cameraStream.getVideoTracks()[0];
  const constraints = videoTrack.getConstraints();
  
  if (constraints.facingMode === 'user') {
    videoTrack.applyConstraints({ facingMode: 'environment' });
  } else {
    videoTrack.applyConstraints({ facingMode: 'user' });
  }
}

function capturePhoto() {
  const video = el('cameraVideo');
  const canvas = el('photoCanvas');
  const context = canvas.getContext('2d');
  
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  context.drawImage(video, 0, 0, canvas.width, canvas.height);
  
  canvas.toBlob(async function(blob) {
    const file = new File([blob], `photo_${Date.now()}.png`, { type: 'image/png' });
    
    // Set file to media input
    const dataTransfer = new DataTransfer();
    dataTransfer.items.add(file);
    el('mediaInput').files = dataTransfer.files;
    
    // Trigger change event
    el('mediaInput').dispatchEvent(new Event('change'));
    
    closeCameraModal();
    openCreatePostModal();
  });
}

/* ===========================================================
   MESSENGER FUNCTIONALITY
=========================================================== */
function openMessengerModal() {
  el('messengerModal').classList.add('active');
  loadChats();
}

function closeMessengerModal() {
  el('messengerModal').classList.remove('active');
  activeChatUser = null;
  
  if (msgSubscription) {
    msgSubscription.unsubscribe();
    msgSubscription = null;
  }
}

async function loadChats() {
  const chatsContainer = el('messengerChats');
  chatsContainer.innerHTML = '<p class="text-center">Loading chats...</p>';
  
  const { data: chats, error } = await sb
    .from('chats')
    .select(`
      *,
      user1:profiles!chats_user1_id_fkey(username, avatar_url),
      user2:profiles!chats_user2_id_fkey(username, avatar_url)
    `)
    .or(`user1_id.eq.${currentUser.id},user2_id.eq.${currentUser.id}`)
    .order('updated_at', { ascending: false });
    
  if (error) {
    chatsContainer.innerHTML = '<p class="text-center">Failed to load chats</p>';
    return;
  }
  
  chatsContainer.innerHTML = '';
  
  if (chats.length === 0) {
    chatsContainer.innerHTML = `
      <div class="text-center" style="padding: 40px 20px; color: var(--text-lighter);">
        <i class="fas fa-comments" style="font-size: 48px; margin-bottom: 16px; opacity: 0.5;"></i>
        <h4>No conversations yet</h4>
        <p>Start a conversation with someone!</p>
      </div>
    `;
    return;
  }
  
  for (const chat of chats) {
    const otherUser = chat.user1_id === currentUser.id ? chat.user2 : chat.user1;
    const chatElement = createChatElement(chat, otherUser);
    chatsContainer.appendChild(chatElement);
  }
}

function createChatElement(chat, otherUser) {
  const div = document.createElement('div');
  div.className = 'chat-item';
  div.onclick = () => openChat(chat.id, otherUser);
  
  const lastMessageTime = chat.last_message_at ? formatRelativeTime(chat.last_message_at) : '';
  
  div.innerHTML = `
    <div class="chat-avatar">
      ${otherUser.avatar_url 
        ? `<img src="${otherUser.avatar_url}" alt="${otherUser.username}">`
        : `<span class="avatar-initial">${otherUser.username.charAt(0).toUpperCase()}</span>`
      }
    </div>
    <div class="chat-info">
      <div class="chat-name">${otherUser.username}</div>
      <div class="chat-preview">${chat.last_message || 'No messages yet'}</div>
    </div>
    <div class="chat-meta">
      <div class="chat-time">${lastMessageTime}</div>
      ${chat.unread_count > 0 ? `<div class="chat-unread">${chat.unread_count}</div>` : ''}
    </div>
  `;
  
  return div;
}

async function openChat(chatId, user) {
  activeChatUser = user;
  
  // Update chat header
  el('chatUserName').textContent = user.username;
  el('chatUserStatus').textContent = 'Online';
  
  el('chatUserAvatar').innerHTML = user.avatar_url 
    ? `<img src="${user.avatar_url}" alt="${user.username}">`
    : `<span class="avatar-initial">${user.username.charAt(0).toUpperCase()}</span>`;
  
  // Load messages
  await loadMessages(chatId);
  
  // Subscribe to new messages
  subscribeToMessages(chatId);
}

async function loadMessages(chatId) {
  const messagesContainer = el('chatMessages');
  messagesContainer.innerHTML = '<p class="text-center">Loading messages...</p>';
  
  const { data: messages, error } = await sb
    .from('messages')
    .select(`
      *,
      sender:profiles!messages_sender_id_fkey(username, avatar_url)
    `)
    .eq('chat_id', chatId)
    .order('created_at', { ascending: true });
    
  if (error) {
    messagesContainer.innerHTML = '<p class="text-center">Failed to load messages</p>';
    return;
  }
  
  messagesContainer.innerHTML = '';
  
  if (messages.length === 0) {
    messagesContainer.innerHTML = `
      <div class="text-center" style="padding: 40px 20px; color: var(--text-lighter);">
        <i class="fas fa-comment" style="font-size: 48px; margin-bottom: 16px; opacity: 0.5;"></i>
        <h4>No messages yet</h4>
        <p>Send your first message to ${activeChatUser?.username || 'this user'}!</p>
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
  const input = el('chatInput');
  const content = input.value.trim();
  
  if (!content || !activeChatUser) return;
  
  // Find or create chat
  const { data: existingChat } = await sb
    .from('chats')
    .select('id')
    .or(`and(user1_id.eq.${currentUser.id},user2_id.eq.${activeChatUser.id}),and(user1_id.eq.${activeChatUser.id},user2_id.eq.${currentUser.id})`)
    .maybeSingle();
    
  let chatId;
  
  if (existingChat) {
    chatId = existingChat.id;
  } else {
    const { data: newChat } = await sb
      .from('chats')
      .insert({
        user1_id: currentUser.id,
        user2_id: activeChatUser.id
      })
      .select('id')
      .single();
      
    chatId = newChat.id;
  }
  
  // Send message
  await sb.from('messages').insert({
    chat_id: chatId,
    sender_id: currentUser.id,
    content: content
  });
  
  // Update chat
  await sb
    .from('chats')
    .update({
      last_message: content,
      last_message_at: new Date().toISOString(),
      unread_count: sb.raw('unread_count + 1')
    })
    .eq('id', chatId);
    
  input.value = '';
  
  // Send notification
  await sendNotification(activeChatUser.id, 'message', chatId);
}

function subscribeToMessages(chatId) {
  if (msgSubscription) {
    msgSubscription.unsubscribe();
  }
  
  msgSubscription = sb
    .channel('messages')
    .on('postgres_changes', {
      event: 'INSERT',
      schema: 'public',
      table: 'messages',
      filter: `chat_id=eq.${chatId}`
    }, (payload) => {
      const message = payload.new;
      if (message.sender_id !== currentUser.id) {
        const messageElement = createMessageElement(message);
        el('chatMessages').appendChild(messageElement);
        el('chatMessages').scrollTop = el('chatMessages').scrollHeight;
      }
    })
    .subscribe();
}

/* ===========================================================
   NOTIFICATIONS
=========================================================== */
async function loadNotifications() {
  const notificationList = el('notificationList');
  notificationList.innerHTML = '<p class="text-center">Loading notifications...</p>';
  
  const { data: notifications, error } = await sb
    .from('notifications')
    .select(`
      *,
      sender:profiles!notifications_sender_id_fkey(username, avatar_url)
    `)
    .eq('receiver_id', currentUser.id)
    .order('created_at', { ascending: false })
    .limit(10);
    
  if (error) {
    notificationList.innerHTML = '<p class="text-center">Failed to load notifications</p>';
    return;
  }
  
  notificationList.innerHTML = '';
  
  if (notifications.length === 0) {
    notificationList.innerHTML = '<p class="text-center">No notifications yet</p>';
    return;
  }
  
  for (const notification of notifications) {
    const notificationElement = createNotificationElement(notification);
    notificationList.appendChild(notificationElement);
  }
}

function createNotificationElement(notification) {
  const div = document.createElement('div');
  div.className = `notification-item ${notification.read ? '' : 'unread'}`;
  div.onclick = () => handleNotificationClick(notification);
  
  const icons = {
    like: 'fas fa-heart',
    comment: 'fas fa-comment',
    follow: 'fas fa-user-plus',
    message: 'fas fa-envelope',
    share: 'fas fa-share'
  };
  
  const colors = {
    like: 'danger',
    comment: 'primary',
    follow: 'success',
    message: 'info',
    share: 'warning'
  };
  
  const notificationTime = formatRelativeTime(notification.created_at);
  const message = getNotificationMessage(notification);
  
  div.innerHTML = `
    <div class="notification-icon ${notification.type}" style="background: var(--${colors[notification.type]});">
      <i class="${icons[notification.type]}"></i>
    </div>
    <div class="notification-content">
      <div>${message}</div>
      <div class="notification-time">${notificationTime}</div>
    </div>
  `;
  
  return div;
}

function getNotificationMessage(notification) {
  const sender = notification.sender?.username || 'Someone';
  
  switch (notification.type) {
    case 'like':
      return `<strong>${sender}</strong> liked your post`;
    case 'comment':
      return `<strong>${sender}</strong> commented on your post`;
    case 'follow':
      return `<strong>${sender}</strong> started following you`;
    case 'message':
      return `<strong>${sender}</strong> sent you a message`;
    case 'share':
      return `<strong>${sender}</strong> shared your post`;
    default:
      return 'You have a new notification';
  }
}

async function sendNotification(receiverId, type, referenceId) {
  try {
    await sb.from('notifications').insert({
      sender_id: currentUser.id,
      receiver_id: receiverId,
      type: type,
      reference_id: referenceId,
      read: false
    });
  } catch (error) {
    console.error('Error sending notification:', error);
  }
}

function handleNotificationClick(notification) {
  // Mark as read
  sb.from('notifications')
    .update({ read: true })
    .eq('id', notification.id)
    .then(() => {
      // Navigate to relevant content
      switch (notification.type) {
        case 'like':
        case 'comment':
        case 'share':
          // Scroll to post
          const postElement = el(`post-${notification.reference_id}`);
          if (postElement) {
            postElement.scrollIntoView({ behavior: 'smooth' });
            postElement.style.animation = 'pulse 2s';
            setTimeout(() => {
              postElement.style.animation = '';
            }, 2000);
          }
          break;
        case 'message':
          openMessengerModal();
          break;
        case 'follow':
          // Show profile
          break;
      }
      
      // Close dropdown
      el('notificationDropdown').classList.remove('active');
    });
}

/* ===========================================================
   ONLINE CONTACTS & STORIES
=========================================================== */
async function loadOnlineContacts() {
  const onlineList = el('onlineList');
  const contactsList = el('contactsList');
  
  const { data: users, error } = await sb
    .from('profiles')
    .select('id, username, avatar_url, last_seen')
    .neq('id', currentUser.id)
    .order('last_seen', { ascending: false })
    .limit(10);
    
  if (error) {
    console.error('Error loading contacts:', error);
    return;
  }
  
  // Update online list
  onlineList.innerHTML = '';
  users.slice(0, 5).forEach(user => {
    const isOnline = new Date() - new Date(user.last_seen) < 5 * 60 * 1000; // 5 minutes
    if (isOnline) {
      const userElement = createOnlineUserElement(user);
      onlineList.appendChild(userElement);
    }
  });
  
  // Update contacts list
  contactsList.innerHTML = '';
  users.forEach(user => {
    const contactElement = createContactElement(user);
    contactsList.appendChild(contactElement);
  });
}

function createOnlineUserElement(user) {
  const div = document.createElement('div');
  div.className = 'online-user';
  
  div.innerHTML = `
    <div class="online-avatar">
      ${user.avatar_url 
        ? `<img src="${user.avatar_url}" alt="${user.username}">`
        : `<span class="avatar-initial" style="width: 32px; height: 32px; font-size: 14px;">${user.username.charAt(0).toUpperCase()}</span>`
      }
      <div class="online-status"></div>
    </div>
    <div>${user.username}</div>
  `;
  
  return div;
}

function createContactElement(user) {
  const div = document.createElement('div');
  div.className = 'contact-item';
  div.onclick = () => openChat(null, user);
  
  const isOnline = new Date() - new Date(user.last_seen) < 5 * 60 * 1000;
  
  div.innerHTML = `
    <div class="contact-avatar">
      ${user.avatar_url 
        ? `<img src="${user.avatar_url}" alt="${user.username}">`
        : `<span class="avatar-initial" style="width: 36px; height: 36px; font-size: 16px;">${user.username.charAt(0).toUpperCase()}</span>`
      }
      ${isOnline ? '<div class="contact-status"></div>' : ''}
    </div>
    <div class="contact-info">
      <div class="contact-name">${user.username}</div>
      <div class="contact-status-text">${isOnline ? 'Online' : 'Offline'}</div>
    </div>
  `;
  
  return div;
}

async function loadStories() {
  const storiesContainer = el('storiesContainer');
  
  const { data: stories, error } = await sb
    .from('stories')
    .select(`
      *,
      profiles (
        username,
        avatar_url
      )
    `)
    .gt('expires_at', new Date().toISOString())
    .order('created_at', { ascending: false })
    .limit(10);
    
  if (error) {
    console.error('Error loading stories:', error);
    return;
  }
  
  storiesContainer.innerHTML = '';
  
  // Add story button
  const addStory = document.createElement('div');
  addStory.className = 'story-item story-add';
  addStory.onclick = () => showToast('Story creation coming soon!', 'info');
  addStory.innerHTML = `
    <div class="story-avatar">
      <i class="fas fa-plus"></i>
    </div>
    <div class="story-user">Add Story</div>
  `;
  storiesContainer.appendChild(addStory);
  
  // Add stories
  stories.forEach(story => {
    const storyElement = createStoryElement(story);
    storiesContainer.appendChild(storyElement);
  });
}

function createStoryElement(story) {
  const div = document.createElement('div');
  div.className = 'story-item';
  
  div.innerHTML = `
    <div class="story-avatar">
      ${story.media_url 
        ? `<img src="${story.media_url}" alt="${story.profiles.username}'s story">`
        : `<span style="display: flex; align-items: center; justify-content: center; width: 100%; height: 100%; color: white; font-size: 24px;">${story.profiles.username.charAt(0).toUpperCase()}</span>`
      }
    </div>
    <div class="story-user">${story.profiles.username}</div>
  `;
  
  return div;
}

/* ===========================================================
   EVENTS
=========================================================== */
async function loadEvents() {
  const eventsList = el('eventsList');
  
  const events = [
    {
      id: 1,
      title: 'Tech Conference 2024',
      date: '2024-03-15',
      location: 'San Francisco'
    },
    {
      id: 2,
      title: 'Product Launch Party',
      date: '2024-03-20',
      location: 'New York'
    },
    {
      id: 3,
      title: 'Team Building Workshop',
      date: '2024-03-25',
      location: 'Remote'
    }
  ];
  
  eventsList.innerHTML = '';
  
  events.forEach(event => {
    const eventElement = createEventElement(event);
    eventsList.appendChild(eventElement);
  });
}

function createEventElement(event) {
  const div = document.createElement('div');
  div.className = 'event-item';
  
  const eventDate = new Date(event.date);
  const day = eventDate.getDate();
  const month = eventDate.toLocaleDateString('en-US', { month: 'short' });
  
  div.innerHTML = `
    <div class="event-date">
      <div class="event-day">${day}</div>
      <div class="event-month">${month}</div>
    </div>
    <div class="event-details">
      <div class="event-title">${event.title}</div>
      <div class="event-time">${event.location}</div>
    </div>
  `;
  
  return div;
}

/* ===========================================================
   INITIALIZATION
=========================================================== */
function initDashboard() {
  // Load initial data
  loadPosts();
  loadOnlineContacts();
  loadStories();
  loadEvents();
  loadNotifications();
  
  // Update user status
  updateUserStatus();
  setInterval(updateUserStatus, 60000); // Update every minute
}

function updateUserStatus() {
  if (!currentUser) return;
  
  sb.from('profiles')
    .update({ last_seen: new Date().toISOString() })
    .eq('id', currentUser.id)
    .then(() => {
      // Status updated
    });
}

function setupEventListeners() {
  // Theme toggle
  el('themeToggle').addEventListener('click', toggleTheme);
  
  // Notification dropdown
  el('notificationBtn').addEventListener('click', function(e) {
    e.stopPropagation();
    el('notificationDropdown').classList.toggle('active');
  });
  
  // User menu dropdown
  el('userMenuBtn').addEventListener('click', function(e) {
    e.stopPropagation();
    el('userMenuDropdown').classList.toggle('active');
  });
  
  // Messenger button
  el('messengerBtn').addEventListener('click', openMessengerModal);
  
  // Logout
  el('logoutBtn').addEventListener('click', async () => {
    await sb.auth.signOut();
    window.location.href = 'login.html';
  });
  
  // Close dropdowns when clicking outside
  document.addEventListener('click', function(e) {
    if (!e.target.closest('.notification-wrapper')) {
      el('notificationDropdown').classList.remove('active');
    }
    if (!e.target.closest('.user-menu-wrapper')) {
      el('userMenuDropdown').classList.remove('active');
    }
  });
  
  // Search functionality
  const searchInput = qs('.search-input');
  searchInput.addEventListener('input', debounce(function(e) {
    const query = e.target.value.trim();
    if (query.length > 2) {
      performSearch(query);
    }
  }, 300));
  
  // Feed tabs
  qsa('.feed-tab').forEach(tab => {
    tab.addEventListener('click', function() {
      qsa('.feed-tab').forEach(t => t.classList.remove('active'));
      this.classList.add('active');
      const feedType = this.dataset.feed;
      loadFeed(feedType);
    });
  });
  
  // Navigation tabs
  qsa('.nav-item').forEach(item => {
    item.addEventListener('click', function(e) {
      if (this.href === '#') e.preventDefault();
      qsa('.nav-item').forEach(i => i.classList.remove('active'));
      this.classList.add('active');
      const tab = this.dataset.tab;
      // Handle tab switching
    });
  });
}

function setupSubscriptions() {
  // Subscribe to new posts
  postsSubscription = sb
    .channel('posts')
    .on('postgres_changes', {
      event: 'INSERT',
      schema: 'public',
      table: 'posts'
    }, (payload) => {
      const newPost = payload.new;
      if (newPost.user_id !== currentUser.id) {
        showToast(`${newPost.user_name || 'Someone'} posted something new!`, 'info');
        // Add new post to feed
        const postElement = createPostElement(newPost);
        el('postsContainer').prepend(postElement);
      }
    })
    .subscribe();
  
  // Subscribe to notifications
  notificationsSubscription = sb
    .channel('notifications')
    .on('postgres_changes', {
      event: 'INSERT',
      schema: 'public',
      table: 'notifications',
      filter: `receiver_id=eq.${currentUser.id}`
    }, (payload) => {
      const notification = payload.new;
      const notificationElement = createNotificationElement(notification);
      el('notificationList').prepend(notificationElement);
      
      // Update badge
      const badge = qs('.notification-badge');
      const currentCount = parseInt(badge.textContent) || 0;
      badge.textContent = currentCount + 1;
      
      // Show toast
      const message = getNotificationMessage(notification);
      showToast(message, 'info');
    })
    .subscribe();
}

async function performSearch(query) {
  // Implement search functionality
  const { data: results, error } = await sb
    .from('posts')
    .select(`
      *,
      profiles (
        username,
        avatar_url
      )
    `)
    .or(`caption.ilike.%${query}%,user_name.ilike.%${query}%`)
    .order('created_at', { ascending: false })
    .limit(10);
    
  if (error) {
    console.error('Search error:', error);
    return;
  }
  
  // Display search results
  // This is a simplified version - you might want to create a dedicated search results view
  console.log('Search results:', results);
}

async function loadFeed(feedType) {
  // Implement different feed types
  let query = sb
    .from('posts')
    .select(`
      *,
      profiles!inner (
        username,
        avatar_url
      ),
      comments(count),
      post_likes(count)
    `)
    .order('created_at', { ascending: false });
    
  switch (feedType) {
    case 'following':
      // Get following users
      const { data: following } = await sb
        .from('follows')
        .select('following_id')
        .eq('follower_id', currentUser.id);
        
      const followingIds = following?.map(f => f.following_id) || [];
      query = query.in('user_id', [...followingIds, currentUser.id]);
      break;
      
    case 'popular':
      query = query.order('likes', { ascending: false });
      break;
  }
  
  const { data: posts } = await query.limit(20);
  
  // Update posts container
  const postsContainer = el('postsContainer');
  postsContainer.innerHTML = '';
  
  if (posts.length === 0) {
    postsContainer.innerHTML = `
      <div class="post-card" style="text-align: center; padding: 40px 20px;">
        <i class="fas fa-newspaper" style="font-size: 48px; color: var(--text-lighter); margin-bottom: 16px;"></i>
        <h3>No posts found</h3>
        <p>Try changing your feed settings or follow more people!</p>
      </div>
    `;
    return;
  }
  
  for (const post of posts) {
    const postElement = createPostElement(post);
    postsContainer.appendChild(postElement);
  }
}

/* ===========================================================
   UTILITY POST FUNCTIONS
=========================================================== */
function togglePostMenu(postId) {
  const menu = el(`post-menu-${postId}`);
  menu.style.display = menu.style.display === 'block' ? 'none' : 'block';
}

async function sharePost(postId) {
  const post = await sb.from('posts').select('*').eq('id', postId).single();
  
  if (navigator.share) {
    try {
      await navigator.share({
        title: 'Check out this post on My-Day',
        text: post.data.caption,
        url: window.location.href
      });
      
      // Increment share count
      await sb
        .from('posts')
        .update({ shares: (post.data.shares || 0) + 1 })
        .eq('id', postId);
    } catch (error) {
      console.log('Share cancelled:', error);
    }
  } else {
    // Fallback: copy to clipboard
    const shareUrl = `${window.location.origin}?post=${postId}`;
    navigator.clipboard.writeText(shareUrl).then(() => {
      showToast('Link copied to clipboard!', 'success');
    });
  }
}

async function savePost(postId) {
  await bookmarkPost(postId);
}

function reportPost(postId) {
  showToast('Report submitted. Thank you for helping keep My-Day safe!', 'info');
}

function editPost(postId) {
  activePost = postId;
  // Load post data and open edit modal
  showToast('Edit post feature coming soon!', 'info');
}

async function deletePost(postId) {
  if (!confirm('Are you sure you want to delete this post? This action cannot be undone.')) {
    return;
  }
  
  try {
    await sb.from('posts').delete().eq('id', postId);
    showToast('Post deleted successfully', 'success');
    el(`post-${postId}`).remove();
  } catch (error) {
    console.error('Error deleting post:', error);
    showToast('Failed to delete post', 'error');
  }
}

/* ===========================================================
   START APPLICATION
=========================================================== */
// Initialize theme first
initTheme();

// Load user and initialize dashboard
document.addEventListener('DOMContentLoaded', function() {
  loadUser();
  
  // Auto-resize textareas
  const textareas = qsa('textarea');
  textareas.forEach(textarea => {
    textarea.addEventListener('input', function() {
      this.style.height = 'auto';
      this.style.height = (this.scrollHeight) + 'px';
    });
  });
  
  // Character counters
  const usernameInput = el('editUsername');
  const bioInput = el('editBio');
  
  if (usernameInput) {
    usernameInput.addEventListener('input', function() {
      el('usernameCharCount').textContent = `${this.value.length}/30`;
    });
  }
  
  if (bioInput) {
    bioInput.addEventListener('input', function() {
      el('bioCharCount').textContent = `${this.value.length}/150`;
    });
  }
});
