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

// Format relative time - FIXED to handle null/undefined dates
function formatRelativeTime(dateString) {
  if (!dateString) return 'Unknown time';
  
  try {
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return 'Unknown time';
    
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
  } catch (error) {
    console.error('Error formatting time:', error);
    return 'Unknown time';
  }
}

// Format date for display
function formatDate(dateString) {
  if (!dateString) return 'Unknown date';
  
  try {
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return 'Unknown date';
    
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  } catch (error) {
    console.error('Error formatting date:', error);
    return 'Unknown date';
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
    <i class="${icons[type] || icons.info} toast-icon"></i>
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
  if (!text) return '';
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
  if (icon) {
    if (theme === 'dark') {
      icon.className = 'fas fa-sun';
    } else {
      icon.className = 'fas fa-moon';
    }
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
    await loadUserLikes();
    await loadUserBookmarks();
    
    // Initialize all dashboard components
    initDashboard();
    setupEventListeners();
    
    // Setup subscriptions if tables exist
    setTimeout(() => {
      try {
        setupSubscriptions();
      } catch (error) {
        console.log('Subscriptions not available yet');
      }
    }, 1000);
    
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
      const username = currentUser.email.split('@')[0];
      await sb.from('profiles').insert({
        id: currentUser.id,
        username: username,
        bio: 'Welcome to My-Day!',
        created_at: new Date().toISOString()
      });
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
    showToast('Failed to load profile', 'error');
  }
}

function updateProfileUI() {
  if (!currentProfile) return;
  
  // Update profile card
  const usernameEl = el('profileUsername');
  const bioEl = el('profileBio');
  const avatarInitial = el('avatarInitial');
  
  if (usernameEl) usernameEl.textContent = currentProfile.username || 'User';
  if (bioEl) bioEl.textContent = currentProfile.bio || 'Welcome to My-Day!';
  if (avatarInitial) avatarInitial.textContent = (currentProfile.username || 'U').charAt(0).toUpperCase();
  
  // Update header avatar
  const headerAvatar = el('headerAvatar');
  if (headerAvatar) {
    headerAvatar.innerHTML = `
      <span class="avatar-initial">${(currentProfile.username || 'U').charAt(0).toUpperCase()}</span>
    `;
  }
  
  // Update create post avatar
  const createPostAvatar = el('createPostAvatar');
  if (createPostAvatar) {
    createPostAvatar.innerHTML = `
      <span class="avatar-initial">${(currentProfile.username || 'U').charAt(0).toUpperCase()}</span>
    `;
  }
  
  // Update modal post avatar
  const modalPostAvatar = el('modalPostAvatar');
  const modalPostName = el('modalPostName');
  if (modalPostAvatar && modalPostName) {
    modalPostAvatar.innerHTML = `
      <span class="avatar-initial">${(currentProfile.username || 'U').charAt(0).toUpperCase()}</span>
    `;
    modalPostName.textContent = currentProfile.username || 'User';
  }
  
  // Update edit profile modal
  const editUsername = el('editUsername');
  const editBio = el('editBio');
  const editLocation = el('editLocation');
  const editWebsite = el('editWebsite');
  const editAvatarInitial = el('editAvatarInitial');
  
  if (editUsername) editUsername.value = currentProfile.username || '';
  if (editBio) editBio.value = currentProfile.bio || '';
  if (editLocation) editLocation.value = currentProfile.location || '';
  if (editWebsite) editWebsite.value = currentProfile.website || '';
  if (editAvatarInitial) editAvatarInitial.textContent = (currentProfile.username || 'U').charAt(0).toUpperCase();
  
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

function updateCharCount(inputId, countId, maxLength) {
  const input = el(inputId);
  const count = el(countId);
  if (!input || !count) return;
  
  const length = input.value.length;
  count.textContent = `${length}/${maxLength}`;
  
  count.classList.remove('warning', 'error');
  if (length >= maxLength * 0.8) {
    count.classList.add('warning');
  }
  if (length >= maxLength) {
    count.classList.add('error');
  }
}

async function saveProfile() {
  const username = el('editUsername')?.value.trim();
  const bio = el('editBio')?.value.trim();
  const location = el('editLocation')?.value.trim();
  const website = el('editWebsite')?.value.trim();
  
  if (!username) {
    showToast('Username is required', 'error');
    return;
  }
  
  if (username.length > 30) {
    showToast('Username must be 30 characters or less', 'error');
    return;
  }
  
  const btn = el('saveProfileBtn');
  if (!btn) return;
  
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
document.addEventListener('DOMContentLoaded', () => {
  const avatarUpload = el('avatarUpload');
  if (avatarUpload) {
    avatarUpload.addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      
      if (!file.type.startsWith('image/')) {
        showToast('Please select an image file', 'error');
        return;
      }
      
      if (file.size > 5 * 1024 * 1024) {
        showToast('Image size must be less than 5MB', 'error');
        return;
      }
      
      const btn = el('saveProfileBtn');
      if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Uploading...';
      }
      
      try {
        const fileExt = file.name.split('.').pop();
        const fileName = `${currentUser.id}_${Date.now()}.${fileExt}`;
        
        const { error: uploadError } = await sb.storage
          .from('avatars')
          .upload(fileName, file, {
            cacheControl: '3600',
            upsert: false
          });
          
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
        if (btn) {
          btn.disabled = false;
          btn.textContent = 'Save Changes';
        }
      }
    });
  }
});

/* ===========================================================
   POST LIKES & BOOKMARKS MANAGEMENT
=========================================================== */
async function loadUserLikes() {
  try {
    const { data, error } = await sb
      .from('post_likes')
      .select('post_id')
      .eq('user_id', currentUser.id);
      
    if (error) {
      // Table might not exist yet
      console.log('post_likes table not available');
      userLikes = new Set();
      return;
    }
    
    userLikes = new Set(data?.map(x => x.post_id?.toString()) || []);
  } catch (error) {
    console.error('Error loading user likes:', error);
    userLikes = new Set();
  }
}

async function loadUserBookmarks() {
  try {
    const { data, error } = await sb
      .from('post_bookmarks')
      .select('post_id')
      .eq('user_id', currentUser.id);
      
    if (error) {
      // Table might not exist yet
      console.log('post_bookmarks table not available');
      userBookmarks = new Set();
      return;
    }
    
    userBookmarks = new Set(data?.map(x => x.post_id?.toString()) || []);
  } catch (error) {
    console.error('Error loading user bookmarks:', error);
    userBookmarks = new Set();
  }
}

/* ===========================================================
   POSTS MANAGEMENT WITH CORRECT TIME HANDLING
=========================================================== */
async function loadPosts() {
  const postsContainer = el('postsContainer');
  if (!postsContainer) return;
  
  postsContainer.innerHTML = `
    <div class="skeleton skeleton-post"></div>
    <div class="skeleton skeleton-post"></div>
    <div class="skeleton skeleton-post"></div>
  `;
  
  try {
    // Get posts with CORRECT time field - using created_at
    const { data: posts, error: postsError } = await sb
      .from('posts')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(20);
      
    if (postsError) throw postsError;
    
    postsContainer.innerHTML = '';
    
    if (!posts || posts.length === 0) {
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
    
    // Get user profiles for these posts
    const userIds = [...new Set(posts.map(p => p.user_id))];
    const { data: profiles, error: profilesError } = await sb
      .from('profiles')
      .select('id, username, avatar_url')
      .in('id', userIds);
      
    if (profilesError) throw profilesError;
    
    const profileMap = {};
    profiles?.forEach(p => {
      profileMap[p.id] = p;
    });
    
    // Get like counts for each post
    const postIds = posts.map(p => p.id);
    let likeCountsMap = {};
    
    try {
      const { data: likeCounts } = await sb
        .from('post_likes')
        .select('post_id')
        .in('post_id', postIds);
      
      // Count likes per post
      likeCounts?.forEach(like => {
        const postId = like.post_id?.toString();
        if (postId) {
          likeCountsMap[postId] = (likeCountsMap[postId] || 0) + 1;
        }
      });
    } catch (error) {
      console.log('Could not load like counts');
    }
    
    // Get comment counts for each post
    let commentCountsMap = {};
    
    try {
      const { data: commentCounts } = await sb
        .from('comments')
        .select('post_id')
        .in('post_id', postIds);
      
      // Count comments per post
      commentCounts?.forEach(comment => {
        const postId = comment.post_id?.toString();
        if (postId) {
          commentCountsMap[postId] = (commentCountsMap[postId] || 0) + 1;
        }
      });
    } catch (error) {
      console.log('Could not load comment counts');
    }
    
    // Create post elements
    for (const post of posts) {
      const profile = profileMap[post.user_id];
      const postIdStr = post.id?.toString();
      const likeCount = likeCountsMap[postIdStr] || 0;
      const commentCount = commentCountsMap[postIdStr] || 0;
      
      const postWithData = {
        ...post,
        profiles: profile || { username: 'Unknown User', avatar_url: null },
        post_likes: [{ count: likeCount }],
        comments: [{ count: commentCount }]
      };
      
      const postElement = createPostElement(postWithData);
      postsContainer.appendChild(postElement);
    }
    
  } catch (error) {
    console.error('Error loading posts:', error);
    postsContainer.innerHTML = '<p class="text-center">Failed to load posts. Please try again later.</p>';
  }
}

function createPostElement(post) {
  const div = document.createElement('div');
  div.className = 'post-card';
  
  // Use the post ID as a string for comparisons
  const postIdStr = post.id?.toString() || '';
  const isLiked = userLikes.has(postIdStr);
  const isBookmarked = userBookmarks.has(postIdStr);
  const likeCount = post.post_likes?.[0]?.count || 0;
  const commentCount = post.comments?.[0]?.count || 0;
  
  // Use created_at field for timestamp - FIXED
  const postTime = formatRelativeTime(post.created_at || post.updated_at);
  const fullPostTime = formatDate(post.created_at || post.updated_at);
  
  // Get username and avatar
  const username = post.profiles?.username || 'Unknown User';
  const avatarUrl = post.profiles?.avatar_url;
  const avatarInitial = username.charAt(0).toUpperCase();
  
  let mediaHTML = '';
  if (post.media_url) {
    if (post.media_type === 'image') {
      mediaHTML = `
        <div class="post-media">
          <img src="${post.media_url}" alt="Post image" loading="lazy" 
               onclick="openMediaViewer('${post.media_url}', 'image')"
               style="cursor: pointer;">
        </div>
      `;
    } else if (post.media_type === 'video') {
      mediaHTML = `
        <div class="post-media">
          <video src="${post.media_url}" controls 
                 onclick="this.paused ? this.play() : this.pause();"
                 style="cursor: pointer;"></video>
        </div>
      `;
    }
  }
  
  div.innerHTML = `
    <div class="post-header">
      <div class="post-user-info">
        <div class="post-avatar">
          ${avatarUrl 
            ? `<img src="${avatarUrl}" alt="${username}" onerror="this.onerror=null; this.parentElement.innerHTML='<span class=\'avatar-initial\' style=\'width:40px;height:40px;font-size:16px;display:flex;align-items:center;justify-content:center;\'>${avatarInitial}</span>';">`
            : `<span class="avatar-initial" style="width:40px;height:40px;font-size:16px;display:flex;align-items:center;justify-content:center;">${avatarInitial}</span>`
          }
        </div>
        <div class="post-user-details">
          <div class="post-username">${username}</div>
          <div class="post-time" title="${fullPostTime}">${postTime}</div>
        </div>
      </div>
      <div class="post-menu">
        <button class="post-menu-btn" onclick="togglePostMenu('${postIdStr}')">
          <i class="fas fa-ellipsis-h"></i>
        </button>
        <div class="notification-dropdown post-menu-dropdown" id="post-menu-${postIdStr}" style="display: none; position: absolute; right: 0; top: 100%; min-width: 200px; z-index: 1000;">
          <div class="notification-list">
            <button class="nav-item" onclick="sharePost('${postIdStr}')">
              <i class="fas fa-share nav-icon"></i>
              <span>Share</span>
            </button>
            <button class="nav-item" onclick="bookmarkPost('${postIdStr}')">
              <i class="fas fa-bookmark nav-icon"></i>
              <span>${isBookmarked ? 'Unsave Post' : 'Save Post'}</span>
            </button>
            <button class="nav-item" onclick="reportPost('${postIdStr}')">
              <i class="fas fa-flag nav-icon"></i>
              <span>Report Post</span>
            </button>
            ${post.user_id === currentUser.id ? `
              <hr style="margin: var(--space-sm) 0;">
              <button class="nav-item" onclick="editPost('${postIdStr}')">
                <i class="fas fa-edit nav-icon"></i>
                <span>Edit Post</span>
              </button>
              <button class="nav-item" onclick="deletePost('${postIdStr}')" style="color: var(--danger);">
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
        <span>${likeCount} ${likeCount === 1 ? 'like' : 'likes'}</span>
      </div>
      <div class="post-comments">
        <span>${commentCount} ${commentCount === 1 ? 'comment' : 'comments'}</span>
      </div>
      <div class="post-shares">
        <span>${post.shares || 0} ${post.shares === 1 ? 'share' : 'shares'}</span>
      </div>
    </div>
    
    <div class="post-actions-container">
      <button class="post-action ${isLiked ? 'active' : ''}" onclick="likePost('${postIdStr}')" id="like-btn-${postIdStr}">
        <i class="${isLiked ? 'fas' : 'far'} fa-heart"></i>
        <span>${isLiked ? 'Liked' : 'Like'}</span>
      </button>
      <button class="post-action" onclick="toggleComments('${postIdStr}')">
        <i class="far fa-comment"></i>
        <span>Comment</span>
      </button>
      <button class="post-action" onclick="sharePost('${postIdStr}')">
        <i class="fas fa-share"></i>
        <span>Share</span>
      </button>
      <button class="post-action ${isBookmarked ? 'active' : ''}" onclick="bookmarkPost('${postIdStr}')" id="bookmark-btn-${postIdStr}">
        <i class="${isBookmarked ? 'fas' : 'far'} fa-bookmark"></i>
        <span>${isBookmarked ? 'Saved' : 'Save'}</span>
      </button>
    </div>
    
    <div class="comments-section" id="comments-${postIdStr}" style="display: none;">
      <div class="comments-list" id="comments-list-${postIdStr}">
        <!-- Comments loaded dynamically -->
      </div>
      <div class="comment-form">
        <div class="post-input-avatar" style="width: 32px; height: 32px;">
          ${currentProfile?.avatar_url 
            ? `<img src="${currentProfile.avatar_url}" alt="${currentProfile.username}" 
                 onerror="this.onerror=null; this.parentElement.innerHTML='<span class=\'avatar-initial\' style=\'width:32px;height:32px;font-size:14px;display:flex;align-items:center;justify-content:center;\'>${(currentProfile?.username || 'U').charAt(0).toUpperCase()}</span>';">`
            : `<span class="avatar-initial" style="width: 32px; height: 32px; font-size: 14px; display: flex; align-items: center; justify-content: center;">
                ${(currentProfile?.username || 'U').charAt(0).toUpperCase()}
               </span>`
          }
        </div>
        <input type="text" class="comment-input" id="comment-input-${postIdStr}" placeholder="Write a comment..." 
               onkeypress="if(event.key === 'Enter') addComment('${postIdStr}')">
      </div>
    </div>
  `;
  
  return div;
}

/* ===========================================================
   POST INTERACTIONS
=========================================================== */
async function likePost(postId) {
  const postIdNum = parseInt(postId);
  if (isNaN(postIdNum)) return;
  
  const likeBtn = el(`like-btn-${postId}`);
  if (!likeBtn) return;
  
  const likeIcon = likeBtn.querySelector('i');
  const likeText = likeBtn.querySelector('span');
  
  try {
    if (userLikes.has(postId)) {
      // Unlike - FIXED to use numeric post_id
      await sb.from('post_likes').delete()
        .eq('post_id', postIdNum)
        .eq('user_id', currentUser.id);
      
      userLikes.delete(postId);
      if (likeIcon) likeIcon.className = 'far fa-heart';
      if (likeText) likeText.textContent = 'Like';
      likeBtn.classList.remove('active');
      
      // Update like count display
      const postStats = likeBtn.closest('.post-card')?.querySelector('.post-likes span');
      if (postStats) {
        const currentCount = parseInt(postStats.textContent) || 0;
        postStats.textContent = `${Math.max(0, currentCount - 1)} ${Math.max(0, currentCount - 1) === 1 ? 'like' : 'likes'}`;
      }
    } else {
      // Like - FIXED to use numeric post_id
      await sb.from('post_likes').insert({
        post_id: postIdNum,
        user_id: currentUser.id
      });
      
      userLikes.add(postId);
      if (likeIcon) likeIcon.className = 'fas fa-heart';
      if (likeText) likeText.textContent = 'Liked';
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
      
      // Update like count display
      const postStats = likeBtn.closest('.post-card')?.querySelector('.post-likes span');
      if (postStats) {
        const currentCount = parseInt(postStats.textContent) || 0;
        postStats.textContent = `${currentCount + 1} ${currentCount + 1 === 1 ? 'like' : 'likes'}`;
      }
      
      // Send notification if not own post
      const post = await sb.from('posts').select('user_id').eq('id', postIdNum).single();
      if (post.data && post.data.user_id !== currentUser.id) {
        await sendNotification(post.data.user_id, 'like', postIdNum);
      }
    }
  } catch (error) {
    console.error('Error liking post:', error);
    showToast('Failed to like post', 'error');
  }
}

async function bookmarkPost(postId) {
  const postIdNum = parseInt(postId);
  if (isNaN(postIdNum)) return;
  
  const bookmarkBtn = el(`bookmark-btn-${postId}`);
  if (!bookmarkBtn) return;
  
  const bookmarkIcon = bookmarkBtn.querySelector('i');
  const bookmarkText = bookmarkBtn.querySelector('span');
  
  try {
    if (userBookmarks.has(postId)) {
      // Remove bookmark
      await sb.from('post_bookmarks').delete()
        .eq('post_id', postIdNum)
        .eq('user_id', currentUser.id);
      
      userBookmarks.delete(postId);
      if (bookmarkIcon) bookmarkIcon.className = 'far fa-bookmark';
      if (bookmarkText) bookmarkText.textContent = 'Save';
      bookmarkBtn.classList.remove('active');
    } else {
      // Add bookmark
      await sb.from('post_bookmarks').insert({
        post_id: postIdNum,
        user_id: currentUser.id
      });
      
      userBookmarks.add(postId);
      if (bookmarkIcon) bookmarkIcon.className = 'fas fa-bookmark';
      if (bookmarkText) bookmarkText.textContent = 'Saved';
      bookmarkBtn.classList.add('active');
    }
  } catch (error) {
    console.error('Error bookmarking post:', error);
    showToast('Failed to bookmark post', 'error');
  }
}

async function toggleComments(postId) {
  const commentsSection = el(`comments-${postId}`);
  if (!commentsSection) return;
  
  commentsSection.classList.toggle('active');
  
  if (commentsSection.classList.contains('active')) {
    await loadComments(postId);
  }
}

async function loadComments(postId) {
  const postIdNum = parseInt(postId);
  if (isNaN(postIdNum)) return;
  
  const commentsList = el(`comments-list-${postId}`);
  if (!commentsList) return;
  
  commentsList.innerHTML = '<p class="text-center">Loading comments...</p>';
  
  try {
    const { data: comments, error } = await sb
      .from('comments')
      .select(`
        *,
        profiles (
          username,
          avatar_url
        )
      `)
      .eq('post_id', postIdNum)
      .order('created_at', { ascending: true });
      
    if (error) {
      // Table might not exist yet
      commentsList.innerHTML = '<p class="text-center">Comments feature coming soon!</p>';
      return;
    }
    
    commentsList.innerHTML = '';
    
    if (!comments || comments.length === 0) {
      commentsList.innerHTML = '<p class="text-center">No comments yet. Be the first to comment!</p>';
      return;
    }
    
    for (const comment of comments) {
      const commentElement = createCommentElement(comment);
      commentsList.appendChild(commentElement);
    }
    
  } catch (error) {
    console.error('Error loading comments:', error);
    commentsList.innerHTML = '<p class="text-center">Failed to load comments</p>';
  }
}

function createCommentElement(comment) {
  const div = document.createElement('div');
  div.className = 'comment-item';
  
  const commentTime = formatRelativeTime(comment.created_at);
  const username = comment.profiles?.username || 'Unknown User';
  const avatarInitial = username.charAt(0).toUpperCase();
  
  div.innerHTML = `
    <div class="comment-avatar">
      ${comment.profiles?.avatar_url 
        ? `<img src="${comment.profiles.avatar_url}" alt="${username}" 
             onerror="this.onerror=null; this.parentElement.innerHTML='<span class=\'avatar-initial\' style=\'width:32px;height:32px;font-size:14px;display:flex;align-items:center;justify-content:center;\'>${avatarInitial}</span>';">`
        : `<span class="avatar-initial" style="width:32px;height:32px;font-size:14px;display:flex;align-items:center;justify-content:center;">${avatarInitial}</span>`
      }
    </div>
    <div class="comment-content">
      <div class="comment-header">
        <div class="comment-username">${username}</div>
        <div class="comment-time" title="${formatDate(comment.created_at)}">${commentTime}</div>
      </div>
      <div class="comment-text">${comment.comment}</div>
    </div>
  `;
  
  return div;
}

async function addComment(postId) {
  const postIdNum = parseInt(postId);
  if (isNaN(postIdNum)) return;
  
  const commentInput = el(`comment-input-${postId}`);
  if (!commentInput) return;
  
  const comment = commentInput.value.trim();
  if (!comment) {
    showToast('Please enter a comment', 'warning');
    return;
  }
  
  try {
    const { error } = await sb.from('comments').insert({
      post_id: postIdNum,
      user_id: currentUser.id,
      comment: comment
    });
    
    if (error) {
      // Table might not exist yet
      showToast('Comments feature coming soon!', 'info');
      return;
    }
    
    commentInput.value = '';
    await loadComments(postId);
    
    // Send notification if not own post
    const post = await sb.from('posts').select('user_id').eq('id', postIdNum).single();
    if (post.data && post.data.user_id !== currentUser.id) {
      await sendNotification(post.data.user_id, 'comment', postIdNum);
    }
    
    showToast('Comment added!', 'success');
  } catch (error) {
    console.error('Error adding comment:', error);
    showToast('Failed to add comment', 'error');
  }
}

/* ===========================================================
   POST UTILITY FUNCTIONS
=========================================================== */
function togglePostMenu(postId) {
  const menu = el(`post-menu-${postId}`);
  if (!menu) return;
  
  menu.style.display = menu.style.display === 'block' ? 'none' : 'block';
  
  // Close other open menus
  qsa('.post-menu-dropdown').forEach(otherMenu => {
    if (otherMenu.id !== menu.id) {
      otherMenu.style.display = 'none';
    }
  });
}

async function sharePost(postId) {
  const postIdNum = parseInt(postId);
  if (isNaN(postIdNum)) return;
  
  try {
    const { data: post } = await sb.from('posts').select('*').eq('id', postIdNum).single();
    
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
          .eq('id', postIdNum);
          
        showToast('Post shared!', 'success');
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
  } catch (error) {
    console.error('Error sharing post:', error);
    showToast('Failed to share post', 'error');
  }
}

function reportPost(postId) {
  showToast('Report submitted. Thank you for helping keep My-Day safe!', 'info');
}

function editPost(postId) {
  activePost = postId;
  showToast('Edit post feature coming soon!', 'info');
}

async function deletePost(postId) {
  const postIdNum = parseInt(postId);
  if (isNaN(postIdNum)) return;
  
  if (!confirm('Are you sure you want to delete this post? This action cannot be undone.')) {
    return;
  }
  
  try {
    await sb.from('posts').delete().eq('id', postIdNum);
    showToast('Post deleted successfully', 'success');
    el(`post-${postId}`)?.remove();
  } catch (error) {
    console.error('Error deleting post:', error);
    showToast('Failed to delete post', 'error');
  }
}

function openMediaViewer(url, type) {
  // Simple media viewer
  if (type === 'image') {
    window.open(url, '_blank');
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
  const caption = el('postCaption');
  const mediaPreview = el('postMediaPreview');
  const postFeeling = el('postFeeling');
  const mediaInput = el('mediaInput');
  
  if (caption) caption.value = '';
  if (mediaPreview) mediaPreview.style.display = 'none';
  if (postFeeling) postFeeling.style.display = 'none';
  if (mediaInput) mediaInput.value = '';
}

async function submitPost() {
  const caption = el('postCaption')?.value.trim();
  const privacy = el('postPrivacy')?.value || 'public';
  const mediaFile = el('mediaInput')?.files?.[0];
  const feeling = el('postFeeling')?.dataset?.feeling;
  
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
        .upload(fileName, mediaFile, {
          cacheControl: '3600',
          upsert: false
        });
        
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
      feeling: feeling || null,
      likes: 0,
      shares: 0,
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
          preview.style.display = 'block';
          previewContainer.style.display = 'block';
        };
        reader.readAsDataURL(file);
      } else if (file.type.startsWith('video/')) {
        preview.src = '';
        preview.style.display = 'none';
        previewContainer.innerHTML = `
          <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; height: 200px; color: var(--text-lighter); background: var(--hover); border-radius: var(--radius);">
            <i class="fas fa-video" style="font-size: 48px; margin-bottom: 16px;"></i>
            <span>Video selected: ${file.name}</span>
          </div>
        `;
        previewContainer.style.display = 'block';
      }
    });
  }
});

function removeMedia() {
  const mediaInput = el('mediaInput');
  const previewContainer = el('postMediaPreview');
  
  if (mediaInput) mediaInput.value = '';
  if (previewContainer) previewContainer.style.display = 'none';
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
  if (!feelingsGrid) return;
  
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
  
  if (!feelingContainer || !feelingText) return;
  
  feelingText.textContent = `${emoji} Feeling ${text}`;
  feelingContainer.dataset.feeling = text;
  feelingContainer.style.display = 'flex';
  
  closeFeelingModal();
}

function removeFeeling() {
  const feelingContainer = el('postFeeling');
  if (feelingContainer) {
    feelingContainer.style.display = 'none';
    feelingContainer.dataset.feeling = '';
  }
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
    if (video) video.srcObject = cameraStream;
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
  
  if (!video || !canvas) return;
  
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
   CONTACTS & ONLINE USERS
=========================================================== */
async function loadOnlineContacts() {
  try {
    const { data: users, error } = await sb
      .from('profiles')
      .select('id, username, avatar_url')
      .neq('id', currentUser.id)
      .limit(8);
      
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
    // Hide the sections that failed
    const onlineFriends = qs('.online-friends');
    const contactsWidget = qs('#contactsList')?.closest('.widget');
    
    if (onlineFriends) onlineFriends.style.display = 'none';
    if (contactsWidget) contactsWidget.style.display = 'none';
  }
}

function createOnlineUserElement(user) {
  const div = document.createElement('div');
  div.className = 'online-user';
  
  const avatarInitial = (user.username || 'U').charAt(0).toUpperCase();
  
  div.innerHTML = `
    <div class="online-avatar">
      ${user.avatar_url 
        ? `<img src="${user.avatar_url}" alt="${user.username}" 
             onerror="this.onerror=null; this.parentElement.innerHTML='<span style=\'width:32px;height:32px;border-radius:50%;background:var(--primary);color:white;display:flex;align-items:center;justify-content:center;\'>${avatarInitial}</span>';">`
        : `<span style="width:32px;height:32px;border-radius:50%;background:var(--primary);color:white;display:flex;align-items:center;justify-content:center;">${avatarInitial}</span>`
      }
      <div class="online-status"></div>
    </div>
    <div>${truncateText(user.username, 12)}</div>
  `;
  
  return div;
}

function createContactElement(user) {
  const div = document.createElement('div');
  div.className = 'contact-item';
  
  const avatarInitial = (user.username || 'U').charAt(0).toUpperCase();
  
  div.innerHTML = `
    <div class="contact-avatar">
      ${user.avatar_url 
        ? `<img src="${user.avatar_url}" alt="${user.username}" 
             onerror="this.onerror=null; this.parentElement.innerHTML='<span style=\'width:36px;height:36px;border-radius:50%;background:var(--primary);color:white;display:flex;align-items:center;justify-content:center;font-size:16px;\'>${avatarInitial}</span>';">`
        : `<span style="width:36px;height:36px;border-radius:50%;background:var(--primary);color:white;display:flex;align-items:center;justify-content:center;font-size:16px;">${avatarInitial}</span>`
      }
    </div>
    <div class="contact-info">
      <div class="contact-name">${truncateText(user.username, 15)}</div>
    </div>
  `;
  
  return div;
}

/* ===========================================================
   STORIES (DISABLED UNTIL TABLE EXISTS)
=========================================================== */
function loadStories() {
  const storiesContainer = el('storiesContainer');
  if (storiesContainer) {
    storiesContainer.style.display = 'none';
  }
}

/* ===========================================================
   NOTIFICATIONS (DISABLED UNTIL TABLE EXISTS)
=========================================================== */
async function loadNotifications() {
  try {
    const { data: notifications, error } = await sb
      .from('notifications')
      .select('*, profiles!notifications_sender_id_fkey(username, avatar_url)')
      .eq('receiver_id', currentUser.id)
      .order('created_at', { ascending: false })
      .limit(10);
      
    if (error) {
      // Table doesn't exist yet
      const notificationBadge = qs('.notification-badge');
      if (notificationBadge) notificationBadge.style.display = 'none';
      return;
    }
    
    // If we get here, table exists
    const notificationList = el('notificationList');
    if (notificationList) {
      notificationList.innerHTML = '';
      
      if (!notifications || notifications.length === 0) {
        notificationList.innerHTML = '<p class="text-center">No notifications yet</p>';
        return;
      }
      
      for (const notification of notifications) {
        const notificationElement = createNotificationElement(notification);
        notificationList.appendChild(notificationElement);
      }
    }
    
  } catch (error) {
    console.error('Error loading notifications:', error);
    const notificationBadge = qs('.notification-badge');
    if (notificationBadge) notificationBadge.style.display = 'none';
  }
}

function createNotificationElement(notification) {
  const div = document.createElement('div');
  div.className = `notification-item ${notification.read ? '' : 'unread'}`;
  
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
  const senderName = notification.profiles?.username || 'Someone';
  
  let message = '';
  switch (notification.type) {
    case 'like':
      message = `<strong>${senderName}</strong> liked your post`;
      break;
    case 'comment':
      message = `<strong>${senderName}</strong> commented on your post`;
      break;
    case 'follow':
      message = `<strong>${senderName}</strong> started following you`;
      break;
    case 'message':
      message = `<strong>${senderName}</strong> sent you a message`;
      break;
    case 'share':
      message = `<strong>${senderName}</strong> shared your post`;
      break;
    default:
      message = 'You have a new notification';
  }
  
  div.innerHTML = `
    <div class="notification-icon ${notification.type}" style="background: var(--${colors[notification.type] || 'primary'});">
      <i class="${icons[notification.type] || 'fas fa-bell'}"></i>
    </div>
    <div class="notification-content">
      <div>${message}</div>
      <div class="notification-time">${notificationTime}</div>
    </div>
  `;
  
  return div;
}

async function sendNotification(receiverId, type, referenceId) {
  try {
    await sb.from('notifications').insert({
      sender_id: currentUser.id,
      receiver_id: receiverId,
      type: type,
      reference_id: referenceId,
      read: false,
      created_at: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error sending notification:', error);
    // Silently fail - notifications table might not exist
  }
}

/* ===========================================================
   EVENTS (HARDCODED FOR NOW)
=========================================================== */
function loadEvents() {
  const eventsList = el('eventsList');
  if (!eventsList) return;
  
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
   MESSENGER (DISABLED UNTIL TABLE EXISTS)
=========================================================== */
function openMessengerModal() {
  showToast('Messenger feature coming soon!', 'info');
}

function closeMessengerModal() {
  // Nothing to close yet
}

function loadChats() {
  // Disabled for now
}

/* ===========================================================
   INITIALIZATION
=========================================================== */
function initDashboard() {
  // Load essential features
  loadPosts();
  loadOnlineContacts();
  loadEvents();
  
  // Try to load optional features
  setTimeout(() => {
    try {
      loadNotifications();
    } catch (error) {
      console.log('Notifications disabled');
    }
    
    try {
      loadStories();
    } catch (error) {
      console.log('Stories disabled');
    }
    
    try {
      loadChats();
    } catch (error) {
      console.log('Chats disabled');
    }
  }, 1000);
  
  // Update user status
  updateUserStatus();
  // Update every 5 minutes
  setInterval(updateUserStatus, 5 * 60 * 1000);
}

function updateUserStatus() {
  if (!currentUser) return;
  
  try {
    sb.from('profiles')
      .update({ 
        last_seen: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .eq('id', currentUser.id)
      .then(() => {
        // Status updated
      });
  } catch (error) {
    console.error('Error updating user status:', error);
  }
}

function setupEventListeners() {
  // Theme toggle
  const themeToggle = el('themeToggle');
  if (themeToggle) {
    themeToggle.addEventListener('click', toggleTheme);
  }
  
  // Notification dropdown
  const notificationBtn = el('notificationBtn');
  if (notificationBtn) {
    notificationBtn.addEventListener('click', function(e) {
      e.stopPropagation();
      const dropdown = el('notificationDropdown');
      if (dropdown) dropdown.classList.toggle('active');
    });
  }
  
  // User menu dropdown
  const userMenuBtn = el('userMenuBtn');
  if (userMenuBtn) {
    userMenuBtn.addEventListener('click', function(e) {
      e.stopPropagation();
      const dropdown = el('userMenuDropdown');
      if (dropdown) dropdown.classList.toggle('active');
    });
  }
  
  // Messenger button
  const messengerBtn = el('messengerBtn');
  if (messengerBtn) {
    messengerBtn.addEventListener('click', openMessengerModal);
  }
  
  // Logout
  const logoutBtn = el('logoutBtn');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', async () => {
      try {
        await sb.auth.signOut();
        window.location.href = 'login.html';
      } catch (error) {
        console.error('Error logging out:', error);
      }
    });
  }
  
  // Close dropdowns when clicking outside
  document.addEventListener('click', function(e) {
    const notificationDropdown = el('notificationDropdown');
    const userMenuDropdown = el('userMenuDropdown');
    
    if (notificationDropdown && !e.target.closest('.notification-wrapper')) {
      notificationDropdown.classList.remove('active');
    }
    if (userMenuDropdown && !e.target.closest('.user-menu-wrapper')) {
      userMenuDropdown.classList.remove('active');
    }
  });
  
  // Search functionality
  const searchInput = qs('.search-input');
  if (searchInput) {
    searchInput.addEventListener('input', debounce(function(e) {
      const query = e.target.value.trim();
      if (query.length > 2) {
        performSearch(query);
      }
    }, 300));
  }
  
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
    });
  });
  
  // Character counters for edit profile
  const editUsername = el('editUsername');
  const editBio = el('editBio');
  
  if (editUsername) {
    editUsername.addEventListener('input', () => updateCharCount('editUsername', 'usernameCharCount', 30));
  }
  
  if (editBio) {
    editBio.addEventListener('input', () => updateCharCount('editBio', 'bioCharCount', 150));
  }
  
  // Auto-resize textareas
  const textareas = qsa('textarea');
  textareas.forEach(textarea => {
    textarea.addEventListener('input', function() {
      this.style.height = 'auto';
      this.style.height = (this.scrollHeight) + 'px';
    });
  });
}

function setupSubscriptions() {
  // Subscribe to new posts if table exists
  try {
    postsSubscription = sb
      .channel('posts')
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'posts'
      }, (payload) => {
        const newPost = payload.new;
        if (newPost.user_id !== currentUser.id) {
          showToast('New post from someone you follow!', 'info');
          // Refresh posts to show new one
          setTimeout(loadPosts, 1000);
        }
      })
      .subscribe();
  } catch (error) {
    console.log('Post subscriptions not available');
  }
}

async function performSearch(query) {
  try {
    const { data: results, error } = await sb
      .from('posts')
      .select('*, profiles(username, avatar_url)')
      .or(`caption.ilike.%${query}%`)
      .order('created_at', { ascending: false })
      .limit(10);
      
    if (error) throw error;
    
    // Display search results in a modal or replace feed
    console.log('Search results:', results);
    showToast(`Found ${results.length} results for "${query}"`, 'info');
  } catch (error) {
    console.error('Search error:', error);
  }
}

async function loadFeed(feedType) {
  let query = sb
    .from('posts')
    .select('*, profiles(username, avatar_url)')
    .order('created_at', { ascending: false });
    
  switch (feedType) {
    case 'following':
      // For now, just show all posts since follows table might not exist
      showToast('Following feed coming soon!', 'info');
      break;
      
    case 'popular':
      query = query.order('likes', { ascending: false });
      break;
  }
  
  try {
    const { data: posts } = await query.limit(20);
    
    // Update posts container
    const postsContainer = el('postsContainer');
    postsContainer.innerHTML = '';
    
    if (!posts || posts.length === 0) {
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
  } catch (error) {
    console.error('Error loading feed:', error);
    showToast('Failed to load feed', 'error');
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
  
  // Add CSS for animations
  const style = document.createElement('style');
  style.textContent = `
    @keyframes floatUp {
      0% {
        opacity: 1;
        transform: translateY(0) scale(1);
      }
      100% {
        opacity: 0;
        transform: translateY(-50px) scale(1.5);
      }
    }
    
    .avatar-initial {
      width: 100%;
      height: 100%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-weight: 700;
      background: var(--primary);
      color: white;
      border-radius: 50%;
    }
  `;
  document.head.appendChild(style);
});
