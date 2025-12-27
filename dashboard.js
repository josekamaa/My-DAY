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
let userLikes = new Set();
let userBookmarks = new Set();
let activeChatUser = null;
let activeChatId = null;
let msgSubscription = null;
let cameraStream = null;
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

// Check if table exists
async function tableExists(tableName) {
  try {
    const { data, error } = await sb
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
   MOBILE MENU HANDLING
=========================================================== */
function initMobileMenu() {
  const mobileMenuBtn = el('mobileMenuBtn');
  const closeMobileMenu = el('closeMobileMenu');
  const mobileSidebarOverlay = el('mobileSidebarOverlay');
  const mobileSidebar = el('mobileSidebar');
  
  if (mobileMenuBtn) {
    mobileMenuBtn.addEventListener('click', () => {
      mobileSidebarOverlay.classList.add('active');
      mobileSidebar.classList.add('active');
      loadMobileSidebarContent();
    });
  }
  
  if (closeMobileMenu) {
    closeMobileMenu.addEventListener('click', closeMobileMenuFunc);
  }
  
  if (mobileSidebarOverlay) {
    mobileSidebarOverlay.addEventListener('click', closeMobileMenuFunc);
  }
  
  // Close mobile menu when clicking outside
  document.addEventListener('click', (e) => {
    if (mobileSidebar && !mobileSidebar.contains(e.target) && 
        mobileMenuBtn && !mobileMenuBtn.contains(e.target)) {
      closeMobileMenuFunc();
    }
  });
}

function closeMobileMenuFunc() {
  const mobileSidebarOverlay = el('mobileSidebarOverlay');
  const mobileSidebar = el('mobileSidebar');
  
  if (mobileSidebarOverlay) mobileSidebarOverlay.classList.remove('active');
  if (mobileSidebar) mobileSidebar.classList.remove('active');
}

function loadMobileSidebarContent() {
  const mobileSidebar = el('mobileSidebar');
  if (!mobileSidebar) return;
  
  // Clone desktop sidebar content for mobile
  const desktopSidebar = document.querySelector('.sidebar');
  if (!desktopSidebar) return;
  
  const sidebarContent = desktopSidebar.innerHTML;
  mobileSidebar.innerHTML = `
    <div class="mobile-sidebar-header">
      <h3>Menu</h3>
      <button class="btn-icon" id="closeMobileMenu">
        <i class="fas fa-times"></i>
      </button>
    </div>
    ${sidebarContent}
  `;
  
  // Reattach event listeners
  const closeBtn = document.getElementById('closeMobileMenu');
  if (closeBtn) {
    closeBtn.addEventListener('click', closeMobileMenuFunc);
  }
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
    
    initDashboard();
    setupEventListeners();
    initMobileMenu();
    
    // Update mobile badges
    updateMobileBadges();
    
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
  
  // Update profile card
  el('profileUsername').textContent = currentProfile.username || 'User';
  el('profileBio').textContent = currentProfile.bio || 'Welcome to My-Day!';
  const initial = (currentProfile.username || 'U').charAt(0).toUpperCase();
  if (el('avatarInitial')) el('avatarInitial').textContent = initial;
  if (el('editAvatarInitial')) el('editAvatarInitial').textContent = initial;
  
  // Update header avatar
  const headerAvatar = el('headerAvatar');
  if (headerAvatar) {
    headerAvatar.innerHTML = `<span class="avatar-initial">${initial}</span>`;
  }
  
  // Update other avatars
  const createPostAvatar = el('createPostAvatar');
  if (createPostAvatar) createPostAvatar.innerHTML = `<span class="avatar-initial">${initial}</span>`;
  
  const modalPostAvatar = el('modalPostAvatar');
  if (modalPostAvatar) modalPostAvatar.innerHTML = `<span class="avatar-initial">${initial}</span>`;
  
  const modalPostName = el('modalPostName');
  if (modalPostName) modalPostName.textContent = currentProfile.username || 'User';
  
  // Update edit profile form
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

function updateMobileBadges() {
  // Sync badges with mobile navigation
  const messageBadge = el('messageBadge');
  const notificationBadge = el('notificationBadge');
  const mobileMessageBadge = el('mobileMessageBadge');
  const mobileNotificationBadge = el('mobileNotificationBadge');
  
  if (messageBadge && mobileMessageBadge) {
    mobileMessageBadge.textContent = messageBadge.textContent;
    mobileMessageBadge.style.display = messageBadge.textContent === '0' ? 'none' : 'block';
  }
  
  if (notificationBadge && mobileNotificationBadge) {
    mobileNotificationBadge.textContent = notificationBadge.textContent;
    mobileNotificationBadge.style.display = notificationBadge.textContent === '0' ? 'none' : 'block';
  }
}

/* ===========================================================
   PROFILE EDITING
=========================================================== */
function openEditProfile() {
  el('editProfileModal').classList.add('active');
  if (isMobile) closeMobileMenuFunc();
}

function closeEditProfileModal() {
  el('editProfileModal').classList.remove('active');
}

async function saveProfile() {
  const username = el('editUsername').value.trim();
  const bio = el('editBio').value.trim();
  const location = el('editLocation').value.trim();
  
  if (!username) {
    showToast('Username is required', 'error');
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
      
      const btn = el('saveProfileBtn');
      if (!btn) return;
      
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
  }
});

/* ===========================================================
   POST LIKES & BOOKMARKS
=========================================================== */
async function loadUserLikes() {
  try {
    const exists = await tableExists('post_likes');
    if (!exists) {
      userLikes = new Set();
      return;
    }
    
    const { data, error } = await sb
      .from('post_likes')
      .select('post_id')
      .eq('user_id', currentUser.id);
      
    if (error) {
      console.log('Error loading likes:', error);
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
    const exists = await tableExists('post_bookmarks');
    if (!exists) {
      userBookmarks = new Set();
      return;
    }
    
    const { data, error } = await sb
      .from('post_bookmarks')
      .select('post_id')
      .eq('user_id', currentUser.id);
      
    if (error) {
      console.log('Error loading bookmarks:', error);
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
   POSTS MANAGEMENT
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
      .limit(20);
      
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
    
    // Get like counts
    const postIds = posts.map(p => p.id);
    let likeCounts = {};
    
    try {
      const exists = await tableExists('post_likes');
      if (exists) {
        const { data: likes } = await sb
          .from('post_likes')
          .select('post_id')
          .in('post_id', postIds);
        
        likes?.forEach(like => {
          const postId = like.post_id?.toString();
          if (postId) {
            likeCounts[postId] = (likeCounts[postId] || 0) + 1;
          }
        });
      }
    } catch (error) {
      console.log('Could not load like counts');
    }
    
    // Get comment counts
    let commentCounts = {};
    
    try {
      const exists = await tableExists('comments');
      if (exists) {
        const { data: comments } = await sb
          .from('comments')
          .select('post_id')
          .in('post_id', postIds);
        
        comments?.forEach(comment => {
          const postId = comment.post_id?.toString();
          if (postId) {
            commentCounts[postId] = (commentCounts[postId] || 0) + 1;
          }
        });
      }
    } catch (error) {
      console.log('Could not load comment counts');
    }
    
    // Update post count
    const postCountEl = el('postCount');
    if (postCountEl) postCountEl.textContent = posts.length;
    
    // Create post elements
    for (const post of posts) {
      const postIdStr = post.id.toString();
      const profile = profileMap[post.user_id] || { username: 'Unknown User', avatar_url: null };
      
      const postData = {
        ...post,
        profiles: profile,
        likeCount: likeCounts[postIdStr] || 0,
        commentCount: commentCounts[postIdStr] || 0,
        isLiked: userLikes.has(postIdStr),
        isBookmarked: userBookmarks.has(postIdStr)
      };
      
      const postElement = createPostElement(postData);
      postsContainer.appendChild(postElement);
    }
    
  } catch (error) {
    console.error('Error loading posts:', error);
    postsContainer.innerHTML = '<p class="text-center">Failed to load posts</p>';
  }
}

function createPostElement(post) {
  const div = document.createElement('div');
  div.className = 'post-card';
  div.id = `post-${post.id}`;
  
  const postIdStr = post.id.toString();
  const postTime = formatRelativeTime(post.created_at);
  const username = post.profiles?.username || 'Unknown User';
  const avatarUrl = post.profiles?.avatar_url;
  const avatarInitial = username.charAt(0).toUpperCase();
  
  let mediaHTML = '';
  if (post.media_url) {
    if (post.media_type === 'image') {
      mediaHTML = `
        <div class="post-media">
          <img src="${post.media_url}" alt="Post image" loading="lazy" style="cursor: pointer;" onclick="window.open('${post.media_url}', '_blank')">
        </div>
      `;
    } else if (post.media_type === 'video') {
      mediaHTML = `
        <div class="post-media">
          <video src="${post.media_url}" controls style="cursor: pointer;"></video>
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
          <div class="post-time">${postTime}</div>
        </div>
      </div>
      <button class="post-menu-btn" onclick="togglePostMenu('${postIdStr}')">
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
        <span>${post.likeCount} likes</span>
      </div>
      <div class="post-comments">
        <span>${post.commentCount} comments</span>
      </div>
      <div class="post-shares">
        <span>${post.shares || 0} shares</span>
      </div>
    </div>
    
    <div class="post-actions-container">
      <button class="post-action ${post.isLiked ? 'active' : ''}" onclick="likePost('${postIdStr}')" id="like-btn-${postIdStr}">
        <i class="${post.isLiked ? 'fas' : 'far'} fa-heart"></i>
        <span>${post.isLiked ? 'Liked' : 'Like'}</span>
      </button>
      <button class="post-action" onclick="toggleComments('${postIdStr}')">
        <i class="far fa-comment"></i>
        <span>Comment</span>
      </button>
      <button class="post-action" onclick="sharePost('${postIdStr}')">
        <i class="fas fa-share"></i>
        <span>Share</span>
      </button>
      <button class="post-action ${post.isBookmarked ? 'active' : ''}" onclick="bookmarkPost('${postIdStr}')" id="bookmark-btn-${postIdStr}">
        <i class="${post.isBookmarked ? 'fas' : 'far'} fa-bookmark"></i>
        <span>${post.isBookmarked ? 'Saved' : 'Save'}</span>
      </button>
    </div>
    
    <div class="comments-section" id="comments-${postIdStr}" style="display: none;">
      <div class="comments-list" id="comments-list-${postIdStr}">
        <!-- Comments loaded dynamically -->
      </div>
      <div class="comment-form">
        <div class="post-input-avatar" style="width: 32px; height: 32px;">
          ${currentProfile?.avatar_url 
            ? `<img src="${currentProfile.avatar_url}" alt="${currentProfile.username}" onerror="this.onerror=null; this.parentElement.innerHTML='<span class=\'avatar-initial\' style=\'width:32px;height:32px;font-size:14px;display:flex;align-items:center;justify-content:center;\'>${(currentProfile?.username || 'U').charAt(0).toUpperCase()}</span>';">`
            : `<span class="avatar-initial" style="width:32px;height:32px;font-size:14px;display:flex;align-items:center;justify-content:center;">${(currentProfile?.username || 'U').charAt(0).toUpperCase()}</span>`
          }
        </div>
        <input type="text" class="comment-input" id="comment-input-${postIdStr}" placeholder="Write a comment..." 
               onkeypress="if(event.key === 'Enter') addComment('${postIdStr}')">
      </div>
    </div>
  `;
  
  return div;
}

function togglePostMenu(postId) {
  // Simple menu - show options in alert for now
  const options = ['Share Post', 'Save Post', 'Report Post'];
  if (confirm('What would you like to do?')) {
    showToast('Feature coming soon!', 'info');
  }
}

async function likePost(postId) {
  const postIdNum = parseInt(postId);
  if (isNaN(postIdNum)) return;
  
  const likeBtn = el(`like-btn-${postId}`);
  if (!likeBtn) return;
  
  const likeIcon = likeBtn.querySelector('i');
  const likeText = likeBtn.querySelector('span');
  
  try {
    const exists = await tableExists('post_likes');
    if (!exists) {
      showToast('Likes feature not available', 'error');
      return;
    }
    
    if (userLikes.has(postId)) {
      // Unlike
      await sb.from('post_likes').delete()
        .eq('post_id', postIdNum)
        .eq('user_id', currentUser.id);
      
      userLikes.delete(postId);
      likeIcon.className = 'far fa-heart';
      likeText.textContent = 'Like';
      likeBtn.classList.remove('active');
      
      // Update like count display
      const postStats = likeBtn.closest('.post-card')?.querySelector('.post-likes span');
      if (postStats) {
        const currentCount = parseInt(postStats.textContent) || 0;
        postStats.textContent = `${Math.max(0, currentCount - 1)} likes`;
      }
    } else {
      // Like
      await sb.from('post_likes').insert({
        post_id: postIdNum,
        user_id: currentUser.id
      });
      
      userLikes.add(postId);
      likeIcon.className = 'fas fa-heart';
      likeText.textContent = 'Liked';
      likeBtn.classList.add('active');
      
      // Update like count display
      const postStats = likeBtn.closest('.post-card')?.querySelector('.post-likes span');
      if (postStats) {
        const currentCount = parseInt(postStats.textContent) || 0;
        postStats.textContent = `${currentCount + 1} likes`;
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
    const exists = await tableExists('post_bookmarks');
    if (!exists) {
      showToast('Bookmarks feature not available', 'error');
      return;
    }
    
    if (userBookmarks.has(postId)) {
      // Remove bookmark
      await sb.from('post_bookmarks').delete()
        .eq('post_id', postIdNum)
        .eq('user_id', currentUser.id);
      
      userBookmarks.delete(postId);
      bookmarkIcon.className = 'far fa-bookmark';
      bookmarkText.textContent = 'Save';
      bookmarkBtn.classList.remove('active');
    } else {
      // Add bookmark
      await sb.from('post_bookmarks').insert({
        post_id: postIdNum,
        user_id: currentUser.id
      });
      
      userBookmarks.add(postId);
      bookmarkIcon.className = 'fas fa-bookmark';
      bookmarkText.textContent = 'Saved';
      bookmarkBtn.classList.add('active');
    }
  } catch (error) {
    console.error('Error bookmarking post:', error);
    showToast('Failed to bookmark post', 'error');
  }
}

function sharePost(postId) {
  if (navigator.share) {
    navigator.share({
      title: 'Check out this post!',
      text: 'I found this interesting post on My-Day',
      url: window.location.origin + '/post/' + postId
    });
  } else {
    showToast('Share feature not supported on this browser', 'info');
  }
}

/* ===========================================================
   COMMENTS SYSTEM
=========================================================== */
async function toggleComments(postId) {
  const commentsSection = el(`comments-${postId}`);
  if (!commentsSection) return;
  
  const isActive = commentsSection.style.display === 'block';
  commentsSection.style.display = isActive ? 'none' : 'block';
  
  if (!isActive) {
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
    const exists = await tableExists('comments');
    if (!exists) {
      commentsList.innerHTML = '<p class="text-center">No comments yet</p>';
      return;
    }
    
    const { data: comments, error } = await sb
      .from('comments')
      .select('*')
      .eq('post_id', postIdNum)
      .order('created_at', { ascending: true });
      
    if (error) {
      commentsList.innerHTML = '<p class="text-center">No comments yet</p>';
      return;
    }
    
    commentsList.innerHTML = '';
    
    if (!comments || comments.length === 0) {
      commentsList.innerHTML = '<p class="text-center">No comments yet. Be the first to comment!</p>';
      return;
    }
    
    // Get user profiles for comments
    const userIds = [...new Set(comments.map(c => c.user_id))];
    const { data: profiles } = await sb
      .from('profiles')
      .select('id, username, avatar_url')
      .in('id', userIds);
    
    const profileMap = {};
    profiles?.forEach(p => {
      profileMap[p.id] = p;
    });
    
    for (const comment of comments) {
      const profile = profileMap[comment.user_id] || { username: 'Unknown User', avatar_url: null };
      const commentWithProfile = {
        ...comment,
        profiles: profile
      };
      
      const commentElement = createCommentElement(commentWithProfile);
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
        ? `<img src="${comment.profiles.avatar_url}" alt="${username}" onerror="this.onerror=null; this.parentElement.innerHTML='<span style=\'width:32px;height:32px;border-radius:50%;background:var(--primary);color:white;display:flex;align-items:center;justify-content:center;font-size:14px;\'>${avatarInitial}</span>';">`
        : `<span style="width:32px;height:32px;border-radius:50%;background:var(--primary);color:white;display:flex;align-items:center;justify-content:center;font-size:14px;">${avatarInitial}</span>`
      }
    </div>
    <div class="comment-content">
      <div class="comment-header">
        <div class="comment-username">${username}</div>
        <div class="comment-time">${commentTime}</div>
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
    const exists = await tableExists('comments');
    if (!exists) {
      showToast('Comments feature not available', 'error');
      return;
    }
    
    const { error } = await sb.from('comments').insert({
      post_id: postIdNum,
      user_id: currentUser.id,
      comment: comment,
      created_at: new Date().toISOString()
    });
    
    if (error) {
      showToast('Failed to post comment', 'error');
      return;
    }
    
    commentInput.value = '';
    await loadComments(postId);
    showToast('Comment added!', 'success');
    
  } catch (error) {
    console.error('Error adding comment:', error);
    showToast('Failed to add comment', 'error');
  }
}

/* ===========================================================
   POST CREATION
=========================================================== */
function openCreatePostModal() {
  el('createPostModal').classList.add('active');
  if (isMobile) {
    // Hide bottom nav when modal is open
    const bottomNav = document.querySelector('.bottom-nav');
    if (bottomNav) bottomNav.style.display = 'none';
  }
}

function closeCreatePostModal() {
  el('createPostModal').classList.remove('active');
  if (el('postCaption')) el('postCaption').value = '';
  if (el('postMediaPreview')) el('postMediaPreview').style.display = 'none';
  if (el('postFeeling')) el('postFeeling').style.display = 'none';
  if (el('mediaInput')) el('mediaInput').value = '';
  
  if (isMobile) {
    // Show bottom nav when modal is closed
    const bottomNav = document.querySelector('.bottom-nav');
    if (bottomNav) bottomNav.style.display = 'flex';
  }
}

async function submitPost() {
  const caption = el('postCaption') ? el('postCaption').value.trim() : '';
  const privacy = el('postPrivacy') ? el('postPrivacy').value : 'public';
  const mediaFile = el('mediaInput') ? el('mediaInput').files[0] : null;
  
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
  const mediaInput = el('mediaInput');
  if (mediaInput) mediaInput.click();
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
  if (el('mediaInput')) el('mediaInput').value = '';
  if (el('postMediaPreview')) el('postMediaPreview').style.display = 'none';
}

/* ===========================================================
   CONTACTS & ONLINE USERS
=========================================================== */
async function loadContacts() {
  try {
    const { data: users, error } = await sb
      .from('profiles')
      .select('id, username, avatar_url, last_seen')
      .neq('id', currentUser.id)
      .order('username')
      .limit(10);
      
    if (error) throw error;
    
    const onlineList = el('onlineList');
    const contactsList = el('contactsList');
    
    if (onlineList) {
      onlineList.innerHTML = '';
      users.slice(0, 5).forEach(user => {
        const isOnline = user.last_seen && (new Date() - new Date(user.last_seen) < 5 * 60 * 1000);
        if (isOnline) {
          const userElement = createOnlineUserElement(user);
          onlineList.appendChild(userElement);
        }
      });
      
      if (onlineList.children.length === 0) {
        onlineList.innerHTML = '<p style="color: var(--muted); font-size: 14px;">No friends online</p>';
      }
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
        ? `<img src="${user.avatar_url}" alt="${user.username}" onerror="this.onerror=null; this.parentElement.innerHTML='<span style=\'width:32px;height:32px;border-radius:50%;background:var(--primary);color:white;display:flex;align-items:center;justify-content:center;\'>${avatarInitial}</span>';">`
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
  const isOnline = user.last_seen && (new Date() - new Date(user.last_seen) < 5 * 60 * 1000);
  
  div.innerHTML = `
    <div class="contact-avatar">
      ${user.avatar_url 
        ? `<img src="${user.avatar_url}" alt="${user.username}" onerror="this.onerror=null; this.parentElement.innerHTML='<span style=\'width:36px;height:36px;border-radius:50%;background:var(--primary);color:white;display:flex;align-items:center;justify-content:center;font-size:16px;\'>${avatarInitial}</span>';">`
        : `<span style="width:36px;height:36px;border-radius:50%;background:var(--primary);color:white;display:flex;align-items:center;justify-content:center;font-size:16px;">${avatarInitial}</span>`
      }
      ${isOnline ? '<div class="contact-status"></div>' : ''}
    </div>
    <div class="contact-info">
      <div class="contact-name">${user.username}</div>
      <div class="contact-status-text">${isOnline ? 'Online' : 'Offline'}</div>
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
   MESSENGER / INBOX - FIXED VERSION
=========================================================== */
function openMessenger() {
  el('messengerModal').classList.add('active');
  loadChats();
  if (isMobile) {
    // Hide bottom nav when messenger is open
    const bottomNav = document.querySelector('.bottom-nav');
    if (bottomNav) bottomNav.style.display = 'none';
  }
}

function closeMessenger() {
  el('messengerModal').classList.remove('active');
  activeChatUser = null;
  activeChatId = null;
  
  if (msgSubscription) {
    msgSubscription.unsubscribe();
    msgSubscription = null;
  }
  
  if (isMobile) {
    // Show bottom nav when messenger is closed
    const bottomNav = document.querySelector('.bottom-nav');
    if (bottomNav) bottomNav.style.display = 'flex';
  }
}

async function ensureChatsTable() {
  try {
    // Check if chats table exists
    const { data, error } = await sb
      .from('chats')
      .select('id')
      .limit(1);
    
    return !error;
  } catch (error) {
    return false;
  }
}

async function ensureMessagesTable() {
  try {
    // Check if messages table exists
    const { data, error } = await sb
      .from('messages')
      .select('id')
      .limit(1);
    
    return !error;
  } catch (error) {
    return false;
  }
}

async function loadChats() {
  const chatsContainer = el('messengerChats');
  if (!chatsContainer) return;
  
  chatsContainer.innerHTML = '<p class="text-center">Loading chats...</p>';
  
  try {
    const chatsExist = await ensureChatsTable();
    if (!chatsExist) {
      chatsContainer.innerHTML = `
        <div class="text-center" style="padding: 40px 20px; color: var(--muted);">
          <i class="fas fa-comments" style="font-size: 48px; margin-bottom: 16px; opacity: 0.5;"></i>
          <h4>No conversations yet</h4>
          <p>Start a conversation with someone!</p>
        </div>
      `;
      return;
    }
    
    // Get chats where current user is either user1 or user2
    const { data: chats, error } = await sb
      .from('chats')
      .select('*')
      .or(`user1_id.eq.${currentUser.id},user2_id.eq.${currentUser.id}`)
      .order('updated_at', { ascending: false });
      
    if (error) {
      console.error('Error loading chats:', error);
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
    const chatPromises = chats.map(async (chat) => {
      const otherUserId = chat.user1_id === currentUser.id ? chat.user2_id : chat.user1_id;
      
      // Get other user's profile
      const { data: otherUser } = await sb
        .from('profiles')
        .select('username, avatar_url')
        .eq('id', otherUserId)
        .single();
      
      return {
        ...chat,
        otherUser: otherUser || { username: 'Unknown User', avatar_url: null }
      };
    });
    
    const chatsWithUsers = await Promise.all(chatPromises);
    
    // Update message badge count
    const totalUnread = chats.reduce((sum, chat) => sum + (chat.unread_count || 0), 0);
    const messageBadge = el('messageBadge');
    if (messageBadge) messageBadge.textContent = totalUnread > 0 ? totalUnread : '0';
    updateMobileBadges();
    
    for (const chat of chatsWithUsers) {
      const chatElement = createChatElement(chat, chat.otherUser);
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
  if (activeChatId === chat.id) {
    div.classList.add('active');
  }
  
  const lastMessageTime = chat.last_message_at ? formatRelativeTime(chat.last_message_at) : '';
  const username = otherUser?.username || 'Unknown User';
  const avatarInitial = username.charAt(0).toUpperCase();
  
  div.innerHTML = `
    <div class="chat-avatar">
      ${otherUser?.avatar_url 
        ? `<img src="${otherUser.avatar_url}" alt="${username}" onerror="this.onerror=null; this.parentElement.innerHTML='<span style=\'width:48px;height:48px;border-radius:50%;background:var(--primary);color:white;display:flex;align-items:center;justify-content:center;font-size:18px;\'>${avatarInitial}</span>';">`
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
  const chatUserName = el('chatUserName');
  const chatUserStatus = el('chatUserStatus');
  const chatUserAvatar = el('chatUserAvatar');
  
  if (chatUserName) chatUserName.textContent = user.username || 'Unknown User';
  if (chatUserStatus) chatUserStatus.textContent = 'Online';
  
  const avatarInitial = (user.username || 'U').charAt(0).toUpperCase();
  if (chatUserAvatar) {
    chatUserAvatar.innerHTML = user.avatar_url 
      ? `<img src="${user.avatar_url}" alt="${user.username}" onerror="this.onerror=null; this.parentElement.innerHTML='<span style=\'width:48px;height:48px;border-radius:50%;background:var(--primary);color:white;display:flex;align-items:center;justify-content:center;font-size:18px;\'>${avatarInitial}</span>';">`
      : `<span style="width:48px;height:48px;border-radius:50%;background:var(--primary);color:white;display:flex;align-items:center;justify-content:center;font-size:18px;">${avatarInitial}</span>`;
  }
  
  // Load messages
  await loadMessages(chatId);
  
  // Mark as read
  await markChatAsRead(chatId);
  
  // Subscribe to new messages
  subscribeToMessages(chatId);
  
  // Update active state in list
  qsa('.chat-item').forEach(item => item.classList.remove('active'));
  qsa('.chat-item').forEach(item => {
    const chatName = item.querySelector('.chat-name');
    if (chatName && chatName.textContent === user.username) {
      item.classList.add('active');
    }
  });
  
  // On mobile, hide sidebar when chat is open
  if (isMobile && window.innerWidth < 768) {
    const messengerSidebar = document.querySelector('.messenger-sidebar');
    const messengerContent = document.querySelector('.messenger-content');
    if (messengerSidebar) messengerSidebar.style.display = 'none';
    if (messengerContent) messengerContent.style.display = 'flex';
  }
}

async function loadMessages(chatId) {
  const messagesContainer = el('chatMessages');
  if (!messagesContainer) return;
  
  messagesContainer.innerHTML = '<p class="text-center">Loading messages...</p>';
  
  try {
    const messagesExist = await ensureMessagesTable();
    if (!messagesExist) {
      messagesContainer.innerHTML = '<p class="text-center">No messages yet</p>';
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
    
    // Get sender profiles for messages
    const userIds = [...new Set(messages.map(m => m.sender_id))];
    const { data: profiles } = await sb
      .from('profiles')
      .select('id, username, avatar_url')
      .in('id', userIds);
    
    const profileMap = {};
    profiles?.forEach(p => {
      profileMap[p.id] = p;
    });
    
    for (const message of messages) {
      const senderProfile = profileMap[message.sender_id] || { username: 'Unknown User', avatar_url: null };
      const messageWithProfile = {
        ...message,
        sender: senderProfile
      };
      
      const messageElement = createMessageElement(messageWithProfile);
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
    const messagesExist = await ensureMessagesTable();
    if (!messagesExist) {
      showToast('Messaging feature not available', 'error');
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
      
      // If error is about missing column, try to create it
      if (error.message.includes('chat_id')) {
        showToast('Messaging system needs setup', 'error');
        return;
      }
      
      throw error;
    }
    
    // Update chat
    await sb
      .from('chats')
      .update({
        last_message: content.length > 50 ? content.substring(0, 47) + '...' : content,
        last_message_at: new Date().toISOString(),
        unread_count: sb.raw('unread_count + 1')
      })
      .eq('id', activeChatId);
    
    input.value = '';
    
    // Clear and re-focus input
    input.focus();
    
    // Reload messages
    await loadMessages(activeChatId);
    
    // Reload chats list to update preview
    await loadChats();
    
  } catch (error) {
    console.error('Error sending message:', error);
    showToast('Failed to send message', 'error');
  }
}

async function startChatWithUser(user) {
  try {
    const chatsExist = await ensureChatsTable();
    if (!chatsExist) {
      showToast('Messaging feature not available', 'error');
      return;
    }
    
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
      
      if (error) throw error;
      chatId = newChat.id;
    }
    
    // Open messenger and the chat
    if (!el('messengerModal').classList.contains('active')) {
      openMessenger();
      setTimeout(() => {
        openChat(chatId, user);
      }, 100);
    } else {
      openChat(chatId, user);
    }
    
  } catch (error) {
    console.error('Error starting chat:', error);
    showToast('Failed to start conversation', 'error');
  }
}

function startNewChat() {
  showToast('Start new chat feature coming soon!', 'info');
}

async function markChatAsRead(chatId) {
  try {
    await sb
      .from('chats')
      .update({ unread_count: 0 })
      .eq('id', chatId);
    
    // Update badge
    await loadChats();
  } catch (error) {
    console.error('Error marking chat as read:', error);
  }
}

function subscribeToMessages(chatId) {
  if (msgSubscription) {
    msgSubscription.unsubscribe();
  }
  
  // Only subscribe if messages table exists
  ensureMessagesTable().then(exists => {
    if (!exists) return;
    
    msgSubscription = sb
      .channel('messages')
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'messages',
        filter: `chat_id=eq.${chatId}`
      }, async (payload) => {
        const message = payload.new;
        
        // Don't show our own messages twice
        if (message.sender_id !== currentUser.id) {
          // Get sender profile
          const { data: sender } = await sb
            .from('profiles')
            .select('username, avatar_url')
            .eq('id', message.sender_id)
            .single();
          
          const messageWithProfile = {
            ...message,
            sender: sender || { username: 'Unknown User', avatar_url: null }
          };
          
          const messageElement = createMessageElement(messageWithProfile);
          const chatMessages = el('chatMessages');
          if (chatMessages) {
            chatMessages.appendChild(messageElement);
            chatMessages.scrollTop = chatMessages.scrollHeight;
          }
          
          // Update chat list
          await loadChats();
        }
      })
      .subscribe();
  });
}

/* ===========================================================
   NOTIFICATIONS
=========================================================== */
async function loadNotifications() {
  try {
    const exists = await tableExists('notifications');
    if (!exists) {
      const notificationBadge = el('notificationBadge');
      const sidebarNotificationBadge = el('sidebarNotificationBadge');
      if (notificationBadge) notificationBadge.style.display = 'none';
      if (sidebarNotificationBadge) sidebarNotificationBadge.style.display = 'none';
      updateMobileBadges();
      return;
    }
    
    const { data: notifications, error } = await sb
      .from('notifications')
      .select('*')
      .eq('receiver_id', currentUser.id)
      .order('created_at', { ascending: false })
      .limit(10);
      
    if (error) {
      const notificationBadge = el('notificationBadge');
      const sidebarNotificationBadge = el('sidebarNotificationBadge');
      if (notificationBadge) notificationBadge.style.display = 'none';
      if (sidebarNotificationBadge) sidebarNotificationBadge.style.display = 'none';
      updateMobileBadges();
      return;
    }
    
    const notificationList = el('notificationList');
    if (!notificationList) return;
    
    notificationList.innerHTML = '';
    
    if (!notifications || notifications.length === 0) {
      notificationList.innerHTML = '<p class="text-center">No notifications yet</p>';
      const notificationBadge = el('notificationBadge');
      const sidebarNotificationBadge = el('sidebarNotificationBadge');
      if (notificationBadge) notificationBadge.style.display = 'none';
      if (sidebarNotificationBadge) sidebarNotificationBadge.style.display = 'none';
      updateMobileBadges();
      return;
    }
    
    // Get sender profiles
    const senderIds = [...new Set(notifications.map(n => n.sender_id))];
    const { data: profiles } = await sb
      .from('profiles')
      .select('id, username, avatar_url')
      .in('id', senderIds);
    
    const profileMap = {};
    profiles?.forEach(p => {
      profileMap[p.id] = p;
    });
    
    const unreadCount = notifications.filter(n => !n.read).length;
    const notificationBadge = el('notificationBadge');
    const sidebarNotificationBadge = el('sidebarNotificationBadge');
    
    if (notificationBadge) notificationBadge.textContent = unreadCount;
    if (sidebarNotificationBadge) sidebarNotificationBadge.textContent = unreadCount;
    updateMobileBadges();
    
    if (unreadCount === 0) {
      if (notificationBadge) notificationBadge.style.display = 'none';
      if (sidebarNotificationBadge) sidebarNotificationBadge.style.display = 'none';
    } else {
      if (notificationBadge) notificationBadge.style.display = 'flex';
      if (sidebarNotificationBadge) sidebarNotificationBadge.style.display = 'flex';
    }
    
    for (const notification of notifications) {
      const senderProfile = profileMap[notification.sender_id] || { username: 'Someone', avatar_url: null };
      const notificationWithProfile = {
        ...notification,
        sender: senderProfile
      };
      
      const notificationElement = createNotificationElement(notificationWithProfile);
      notificationList.appendChild(notificationElement);
    }
    
  } catch (error) {
    console.error('Error loading notifications:', error);
    const notificationBadge = el('notificationBadge');
    const sidebarNotificationBadge = el('sidebarNotificationBadge');
    if (notificationBadge) notificationBadge.style.display = 'none';
    if (sidebarNotificationBadge) sidebarNotificationBadge.style.display = 'none';
    updateMobileBadges();
  }
}

function createNotificationElement(notification) {
  const div = document.createElement('div');
  div.className = `notification-item ${notification.read ? '' : 'unread'}`;
  div.style.padding = '12px 16px';
  div.style.borderBottom = '1px solid var(--border)';
  div.style.cursor = 'pointer';
  div.style.transition = 'background 0.2s';
  
  div.addEventListener('mouseenter', () => {
    div.style.background = 'var(--hover)';
  });
  
  div.addEventListener('mouseleave', () => {
    div.style.background = 'transparent';
  });
  
  const notificationTime = formatRelativeTime(notification.created_at);
  const senderName = notification.sender?.username || 'Someone';
  
  let message = '';
  switch (notification.type) {
    case 'like':
      message = `${senderName} liked your post`;
      break;
    case 'comment':
      message = `${senderName} commented on your post`;
      break;
    case 'follow':
      message = `${senderName} started following you`;
      break;
    case 'message':
      message = `${senderName} sent you a message`;
      break;
    default:
      message = 'You have a new notification';
  }
  
  div.innerHTML = `
    <div style="display: flex; align-items: center; gap: 12px;">
      <div style="width: 36px; height: 36px; border-radius: 50%; background: var(--primary); color: white; display: flex; align-items: center; justify-content: center; flex-shrink: 0;">
        <i class="fas fa-${notification.type === 'like' ? 'heart' : notification.type === 'comment' ? 'comment' : 'bell'}"></i>
      </div>
      <div style="flex: 1; min-width: 0;">
        <div style="overflow: hidden; text-overflow: ellipsis;">${message}</div>
        <div style="font-size: 11px; color: var(--muted); margin-top: 2px;">${notificationTime}</div>
      </div>
    </div>
  `;
  
  div.onclick = async () => {
    // Mark as read
    try {
      await sb
        .from('notifications')
        .update({ read: true })
        .eq('id', notification.id);
      
      await loadNotifications();
    } catch (error) {
      console.error('Error marking notification as read:', error);
    }
    
    // Handle notification click
    if (notification.type === 'message') {
      openMessenger();
    } else if (notification.post_id) {
      // Scroll to post
      const postElement = el(`post-${notification.post_id}`);
      if (postElement) {
        postElement.scrollIntoView({ behavior: 'smooth' });
        postElement.style.animation = 'pulse 2s';
        setTimeout(() => {
          postElement.style.animation = '';
        }, 2000);
      }
    }
    
    // Close dropdown
    el('notificationDropdown').classList.remove('active');
  };
  
  return div;
}

async function markAllNotificationsAsRead() {
  try {
    const exists = await tableExists('notifications');
    if (!exists) {
      showToast('No notifications to mark as read', 'info');
      return;
    }
    
    await sb
      .from('notifications')
      .update({ read: true })
      .eq('receiver_id', currentUser.id);
    
    await loadNotifications();
    showToast('All notifications marked as read', 'success');
  } catch (error) {
    console.error('Error marking notifications as read:', error);
    showToast('Failed to mark notifications as read', 'error');
  }
}

function showNotifications() {
  el('notificationDropdown').classList.add('active');
  loadNotifications();
}

/* ===========================================================
   INITIALIZATION
=========================================================== */
function initDashboard() {
  // Load essential features
  loadPosts();
  loadContacts();
  loadNotifications();
  loadChats();
  
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
      .eq('id', currentUser.id);
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
    notificationBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const dropdown = el('notificationDropdown');
      if (dropdown) {
        dropdown.classList.toggle('active');
        if (dropdown.classList.contains('active')) {
          loadNotifications();
        }
      }
    });
  }
  
  // User menu dropdown
  const userMenuBtn = el('userMenuBtn');
  if (userMenuBtn) {
    userMenuBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const dropdown = el('userMenuDropdown');
      if (dropdown) dropdown.classList.toggle('active');
    });
  }
  
  // Messenger button
  const messengerBtn = el('messengerBtn');
  if (messengerBtn) {
    messengerBtn.addEventListener('click', openMessenger);
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
  document.addEventListener('click', (e) => {
    const notificationWrapper = e.target.closest('.notification-wrapper');
    const userMenuWrapper = e.target.closest('.user-menu-wrapper');
    
    if (!notificationWrapper) {
      const dropdown = el('notificationDropdown');
      if (dropdown) dropdown.classList.remove('active');
    }
    if (!userMenuWrapper) {
      const dropdown = el('userMenuDropdown');
      if (dropdown) dropdown.classList.remove('active');
    }
  });
  
  // Auto-resize textareas
  qsa('textarea').forEach(textarea => {
    textarea.addEventListener('input', function() {
      this.style.height = 'auto';
      this.style.height = (this.scrollHeight) + 'px';
    });
  });
  
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
  
  // Close mobile menu when clicking on nav items
  qsa('.nav-item').forEach(item => {
    item.addEventListener('click', closeMobileMenuFunc);
  });
  
  // Handle window resize
  window.addEventListener('resize', () => {
    isMobile = window.innerWidth < 768;
  });
  
  // Back button for mobile messenger
  const messengerModal = el('messengerModal');
  if (messengerModal) {
    // Add back button to show sidebar on mobile
    const chatHeader = messengerModal.querySelector('.chat-header');
    if (chatHeader) {
      const backBtn = document.createElement('button');
      backBtn.className = 'btn-icon';
      backBtn.innerHTML = '<i class="fas fa-arrow-left"></i>';
      backBtn.style.display = 'none';
      backBtn.onclick = () => {
        const messengerSidebar = document.querySelector('.messenger-sidebar');
        const messengerContent = document.querySelector('.messenger-content');
        if (messengerSidebar) messengerSidebar.style.display = 'flex';
        if (messengerContent) messengerContent.style.display = 'none';
      };
      chatHeader.insertBefore(backBtn, chatHeader.firstChild);
      
      // Show back button on mobile when in chat
      if (isMobile) {
        backBtn.style.display = 'block';
      }
    }
  }
}

/* ===========================================================
   START APPLICATION
=========================================================== */
// Initialize theme first
initTheme();

// Load user and initialize dashboard
document.addEventListener('DOMContentLoaded', () => {
  loadUser();
  
  // Add CSS for pulse animation
  const style = document.createElement('style');
  style.textContent = `
    @keyframes pulse {
      0% { box-shadow: 0 0 0 0 rgba(74, 144, 226, 0.4); }
      70% { box-shadow: 0 0 0 10px rgba(74, 144, 226, 0); }
      100% { box-shadow: 0 0 0 0 rgba(74, 144, 226, 0); }
    }
  `;
  document.head.appendChild(style);
  
  // Handle back button in messenger on mobile
  window.addEventListener('popstate', () => {
    const messengerModal = el('messengerModal');
    if (messengerModal && messengerModal.classList.contains('active')) {
      closeMessenger();
    }
  });
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
  loadPosts(); // Fallback to all posts for now
}

function loadPopularPosts() {
  showToast('Loading popular posts...', 'info');
  loadPosts(); // Fallback to all posts for now
}
