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
let posts = [];
let notifications = [];
let onlineUsers = [];
let contacts = [];

/* ===========================================================
   HELPERS
=========================================================== */
const el = id => document.getElementById(id);
const qs = s => document.querySelector(s);
const qsa = s => document.querySelectorAll(s);

function showToast(msg, type = 'info') {
  const container = el('toastContainer');
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerHTML = `
    <i class="fas fa-${type === 'success' ? 'check-circle' : 
                     type === 'error' ? 'exclamation-circle' : 
                     type === 'warning' ? 'exclamation-triangle' : 
                     'info-circle'}"></i>
    <span>${msg}</span>
  `;
  
  container.appendChild(toast);
  
  setTimeout(() => {
    toast.style.animation = 'slideIn 0.3s ease reverse';
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

/* ===========================================================
   INSTAGRAM-LEVEL TIMESTAMPS
=========================================================== */
function timeAgo(date) {
  const seconds = Math.floor((Date.now() - new Date(date)) / 1000);
  if (seconds < 60) return 'Just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  if (days < 30) return `${Math.floor(days / 7)}w ago`;
  if (days < 365) return `${Math.floor(days / 30)}mo ago`;
  return `${Math.floor(days / 365)}y ago`;
}

/* ===========================================================
   AUTH + PROFILE
=========================================================== */
async function loadUser() {
  const { data, error } = await sb.auth.getUser();
  if (error || !data?.user) {
    location.href = 'login.html';
    return;
  }

  currentUser = data.user;
  await ensureProfile();
  await loadProfile();
  await initDashboard();
}

async function ensureProfile() {
  const { data, error } = await sb
    .from('profiles')
    .select('id')
    .eq('id', currentUser.id)
    .maybeSingle();

  if (error) {
    console.error('Error checking profile:', error);
    return;
  }

  if (!data) {
    const username = currentUser.email?.split('@')[0] || 'user' + Math.random().toString(36).substr(2, 5);
    const { error: insertError } = await sb.from('profiles').insert({
      id: currentUser.id,
      username: username,
      avatar_url: null,
      bio: 'Welcome to My-Day!',
      location: '',
      posts_count: 0,
      following_count: 0,
      followers_count: 0
    });
    
    if (insertError) {
      console.error('Error creating profile:', insertError);
    }
  }
}

async function loadProfile() {
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
  // Update avatar initials
  const initial = currentProfile?.username?.[0]?.toUpperCase() || 'U';
  qsa('.avatar-initial').forEach(el => {
    el.textContent = initial;
  });
  
  // Update avatar images if available
  if (currentProfile?.avatar_url) {
    qsa('.avatar').forEach(avatar => {
      const img = avatar.querySelector('img');
      if (img) {
        img.src = currentProfile.avatar_url;
        img.style.display = 'block';
      } else {
        const img = document.createElement('img');
        img.src = currentProfile.avatar_url;
        img.alt = currentProfile.username;
        avatar.appendChild(img);
        avatar.querySelector('.avatar-initial').style.display = 'none';
      }
    });
  }
  
  // Update profile info
  el('profileUsername').textContent = currentProfile?.username || 'User';
  el('profileBio').textContent = currentProfile?.bio || 'Welcome to My-Day!';
  el('postCount').textContent = currentProfile?.posts_count || 0;
  el('followingCount').textContent = currentProfile?.following_count || 0;
  el('followerCount').textContent = currentProfile?.followers_count || 0;
  
  // Update edit profile modal
  if (el('editUsername')) {
    el('editUsername').value = currentProfile?.username || '';
    el('editBio').value = currentProfile?.bio || '';
    el('editLocation').value = currentProfile?.location || '';
    el('editAvatarInitial').textContent = initial;
    updateCharCounts();
  }
}

/* ===========================================================
   DASHBOARD INIT
=========================================================== */
async function initDashboard() {
  // Load initial data
  await loadFeed();
  await loadContacts();
  await loadNotifications();
  await loadOnlineUsers();
  
  // Setup real-time subscriptions
  setupRealtimeSubscriptions();
  
  // Setup event listeners
  setupEventListeners();
  
  // Initialize UI
  updateNotificationBadges();
}

/* ===========================================================
   REAL-TIME SUBSCRIPTIONS
=========================================================== */
function setupRealtimeSubscriptions() {
  // Subscribe to posts
  sb.channel('posts-channel')
    .on('postgres_changes', 
      { event: 'INSERT', schema: 'public', table: 'posts' }, 
      async (payload) => {
        // If it's not our own post, add to feed
        if (payload.new.user_id !== currentUser.id) {
          await loadFeed();
        }
    })
    .subscribe();

  // Subscribe to notifications
  sb.channel('notifications-channel')
    .on('postgres_changes', 
      { event: 'INSERT', schema: 'public', table: 'notifications' }, 
      (payload) => {
        if (payload.new.user_id === currentUser.id) {
          loadNotifications();
        }
    })
    .subscribe();

  // Subscribe to messages
  sb.channel('messages-channel')
    .on('postgres_changes', 
      { event: 'INSERT', schema: 'public', table: 'messages' }, 
      (payload) => {
        if (activeConversationId === payload.new.conversation_id) {
          loadMessages();
        } else {
          updateMessageBadges();
        }
    })
    .subscribe();
}

/* ===========================================================
   EVENT LISTENERS
=========================================================== */
function setupEventListeners() {
  // Theme toggle
  el('themeToggle').addEventListener('click', toggleTheme);
  
  // Mobile menu
  el('mobileMenuBtn').addEventListener('click', openMobileMenu);
  el('closeMobileMenu').addEventListener('click', closeMobileMenu);
  el('mobileSidebarOverlay').addEventListener('click', closeMobileMenu);
  
  // Dropdowns
  el('notificationBtn').addEventListener('click', toggleNotificationDropdown);
  el('userMenuBtn').addEventListener('click', toggleUserMenuDropdown);
  
  // Close dropdowns when clicking outside
  document.addEventListener('click', (e) => {
    if (!e.target.closest('.notification-wrapper')) {
      el('notificationDropdown').classList.remove('active');
    }
    if (!e.target.closest('.user-menu-wrapper')) {
      el('userMenuDropdown').classList.remove('active');
    }
  });
  
  // Create post input auto-resize
  const createPostInput = el('createPostInput');
  if (createPostInput) {
    createPostInput.addEventListener('input', autoResizeTextarea);
    createPostInput.addEventListener('focus', () => openCreatePostModal());
  }
  
  // Edit profile character counters
  if (el('editUsername')) {
    el('editUsername').addEventListener('input', updateCharCounts);
    el('editBio').addEventListener('input', updateCharCounts);
  }
  
  // Avatar upload
  if (el('avatarUpload')) {
    el('avatarUpload').addEventListener('change', handleAvatarUpload);
  }
  
  // Chat input
  const chatInput = el('chatInput');
  if (chatInput) {
    chatInput.addEventListener('input', autoResizeTextarea);
    chatInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendChatMessage();
      }
    });
  }
  
  // Post caption
  if (el('postCaption')) {
    el('postCaption').addEventListener('input', autoResizeTextarea);
  }
  
  // Media input
  if (el('mediaInput')) {
    el('mediaInput').addEventListener('change', handleMediaUpload);
  }
  
  // Search
  if (el('globalSearch')) {
    el('globalSearch').addEventListener('input', debounce(searchContent, 300));
  }
  
  // Feed tabs
  qsa('.feed-tab').forEach(tab => {
    tab.addEventListener('click', function() {
      qsa('.feed-tab').forEach(t => t.classList.remove('active'));
      this.classList.add('active');
    });
  });
  
  // Logout
  if (el('logoutBtn')) {
    el('logoutBtn').addEventListener('click', handleLogout);
  }
  
  // Close modals with ESC
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      closeAllModals();
    }
  });
}

/* ===========================================================
   THEME TOGGLE
=========================================================== */
function toggleTheme() {
  const currentTheme = document.body.getAttribute('data-theme');
  const newTheme = currentTheme === 'light' ? 'dark' : 'light';
  document.body.setAttribute('data-theme', newTheme);
  
  // Update icon
  const icon = el('themeToggle').querySelector('i');
  if (icon) {
    icon.className = newTheme === 'light' ? 'fas fa-moon' : 'fas fa-sun';
  }
  
  // Save preference
  localStorage.setItem('theme', newTheme);
}

// Load saved theme
const savedTheme = localStorage.getItem('theme') || 'light';
document.body.setAttribute('data-theme', savedTheme);
const themeIcon = el('themeToggle')?.querySelector('i');
if (themeIcon) {
  themeIcon.className = savedTheme === 'light' ? 'fas fa-moon' : 'fas fa-sun';
}

/* ===========================================================
   MOBILE MENU
=========================================================== */
function openMobileMenu() {
  el('mobileSidebar').classList.add('active');
  el('mobileSidebarOverlay').classList.add('active');
  document.body.style.overflow = 'hidden';
}

function closeMobileMenu() {
  el('mobileSidebar').classList.remove('active');
  el('mobileSidebarOverlay').classList.remove('active');
  document.body.style.overflow = '';
}

/* ===========================================================
   DROPDOWNS
=========================================================== */
function toggleNotificationDropdown() {
  el('notificationDropdown').classList.toggle('active');
  el('userMenuDropdown').classList.remove('active');
}

function toggleUserMenuDropdown() {
  el('userMenuDropdown').classList.toggle('active');
  el('notificationDropdown').classList.remove('active');
}

/* ===========================================================
   POSTS / FEED
=========================================================== */
async function loadFeed() {
  const container = el('postsContainer');
  if (!container) return;
  
  container.innerHTML = `
    <div class="skeleton skeleton-post"></div>
    <div class="skeleton skeleton-post"></div>
  `;

  try {
    const { data, error } = await sb
      .from('posts')
      .select(`
        *,
        profiles:user_id (username, avatar_url),
        post_likes!left (id),
        comments!left (id)
      `)
      .order('created_at', { ascending: false })
      .limit(20);

    if (error) throw error;

    posts = data || [];
    
    // Check which posts user has liked
    const { data: userLikes } = await sb
      .from('post_likes')
      .select('post_id')
      .eq('user_id', currentUser.id);

    const likedPostIds = userLikes?.map(like => like.post_id) || [];

    container.innerHTML = '';
    posts.forEach(post => {
      container.appendChild(renderPost(post, likedPostIds.includes(post.id)));
    });
  } catch (error) {
    console.error('Error loading feed:', error);
    container.innerHTML = '<p class="text-center p-5">Error loading posts</p>';
    showToast('Error loading feed', 'error');
  }
}

async function loadFollowingPosts() {
  // In a real app, you'd get posts from followed users
  showToast('Loading posts from people you follow...', 'info');
  await loadFeed(); // For now, just show all posts
}

async function loadPopularPosts() {
  showToast('Loading popular posts...', 'info');
  // In a real app, you'd sort by likes/comments
  await loadFeed(); // For now, just show all posts
}

function renderPost(post, isLiked = false) {
  const div = document.createElement('div');
  div.className = 'post-card';
  div.id = `post-${post.id}`;
  
  const profile = post.profiles;
  const avatarHtml = profile?.avatar_url 
    ? `<img src="${profile.avatar_url}" alt="${profile?.username || 'User'}">`
    : `<span class="avatar-initial">${profile?.username?.[0] || 'U'}</span>`;
  
  const mediaHtml = post.image_url 
    ? `<div class="post-media">
        <img src="${post.image_url}" alt="Post image" loading="lazy">
      </div>`
    : '';
    
  const likesCount = post.post_likes?.length || 0;
  const commentsCount = post.comments?.length || 0;
  
  div.innerHTML = `
    <div class="post-header">
      <div class="post-user-info">
        <div class="post-avatar">
          ${avatarHtml}
        </div>
        <div class="post-user-details">
          <div class="post-username">${profile?.username || 'User'}</div>
          <div class="post-time">${timeAgo(post.created_at)}</div>
        </div>
      </div>
      <button class="post-menu-btn" onclick="togglePostMenu('${post.id}')">
        <i class="fas fa-ellipsis-h"></i>
      </button>
    </div>
    
    <div class="post-content">
      <div class="post-text">${post.caption || ''}</div>
      ${mediaHtml}
    </div>
    
    <div class="post-stats">
      <span class="post-likes-count">${likesCount} like${likesCount !== 1 ? 's' : ''}</span>
      <span class="post-comments-count">${commentsCount} comment${commentsCount !== 1 ? 's' : ''}</span>
    </div>
    
    <div class="post-actions-container">
      <button class="post-action ${isLiked ? 'active' : ''}" onclick="likePost('${post.id}')">
        <i class="fas fa-heart"></i>
        <span>Like</span>
      </button>
      <button class="post-action" onclick="toggleComments('${post.id}')">
        <i class="fas fa-comment"></i>
        <span>Comment</span>
      </button>
      <button class="post-action" onclick="sharePost('${post.id}')">
        <i class="fas fa-share"></i>
        <span>Share</span>
      </button>
      <button class="post-action" onclick="savePost('${post.id}')">
        <i class="fas fa-bookmark"></i>
        <span>Save</span>
      </button>
    </div>
    
    <div class="comments-section" id="comments-${post.id}">
      <div class="comments-list" id="comments-list-${post.id}">
        <!-- Comments will be loaded here -->
      </div>
      <form class="comment-form" onsubmit="addComment('${post.id}'); return false;">
        <input type="text" class="comment-input" placeholder="Write a comment..." id="comment-input-${post.id}">
        <button type="submit" class="btn btn-primary btn-sm">Post</button>
      </form>
    </div>
  `;
  
  return div;
}

async function likePost(postId) {
  try {
    const { data: existingLike } = await sb
      .from('post_likes')
      .select('id')
      .eq('post_id', postId)
      .eq('user_id', currentUser.id)
      .maybeSingle();

    if (existingLike) {
      // Unlike
      await sb.from('post_likes').delete().eq('id', existingLike.id);
      showToast('Post unliked', 'info');
    } else {
      // Like
      await sb.from('post_likes').insert({
        post_id: postId,
        user_id: currentUser.id
      });
      showToast('Post liked', 'success');
      
      // Create notification for post owner if not self
      const post = posts.find(p => p.id === postId);
      if (post && post.user_id !== currentUser.id) {
        await sb.from('notifications').insert({
          user_id: post.user_id,
          type: 'like',
          content: `${currentProfile?.username || 'Someone'} liked your post`,
          link: `/post/${postId}`
        });
      }
    }
    
    // Update UI
    await loadFeed();
  } catch (error) {
    console.error('Error liking post:', error);
    showToast('Error liking post', 'error');
  }
}

function togglePostMenu(postId) {
  // TODO: Implement post menu (edit, delete, report)
  showToast('Post menu coming soon', 'info');
}

function toggleComments(postId) {
  const commentsSection = el(`comments-${postId}`);
  if (commentsSection) {
    commentsSection.classList.toggle('active');
    
    if (commentsSection.classList.contains('active')) {
      loadComments(postId);
    }
  }
}

async function loadComments(postId) {
  const commentsList = el(`comments-list-${postId}`);
  if (!commentsList) return;
  
  commentsList.innerHTML = '<p class="text-center p-3">Loading comments...</p>';
  
  try {
    const { data, error } = await sb
      .from('comments')
      .select(`
        *,
        profiles:user_id (username, avatar_url)
      `)
      .eq('post_id', postId)
      .order('created_at', { ascending: true });

    if (error) throw error;

    commentsList.innerHTML = '';
    
    if (!data || data.length === 0) {
      commentsList.innerHTML = '<p class="text-center p-3">No comments yet. Be the first!</p>';
      return;
    }
    
    data.forEach(comment => {
      const commentEl = document.createElement('div');
      commentEl.className = 'comment-item';
      
      const profile = comment.profiles;
      const avatarHtml = profile?.avatar_url 
        ? `<img src="${profile.avatar_url}" alt="${profile.username}">`
        : `<span class="avatar-initial">${profile?.username?.[0] || 'U'}</span>`;
      
      commentEl.innerHTML = `
        <div class="comment-avatar">
          ${avatarHtml}
        </div>
        <div class="comment-content">
          <div class="comment-header">
            <span class="comment-username">${profile?.username || 'User'}</span>
            <span class="comment-time">${timeAgo(comment.created_at)}</span>
          </div>
          <div class="comment-text">${comment.content}</div>
        </div>
      `;
      
      commentsList.appendChild(commentEl);
    });
  } catch (error) {
    console.error('Error loading comments:', error);
    commentsList.innerHTML = '<p class="text-center p-3">Error loading comments</p>';
  }
}

async function addComment(postId) {
  const input = el(`comment-input-${postId}`);
  if (!input) return;
  
  const content = input.value.trim();
  
  if (!content) return;
  
  try {
    await sb.from('comments').insert({
      post_id: postId,
      user_id: currentUser.id,
      content: content
    });
    
    input.value = '';
    showToast('Comment added', 'success');
    
    // Create notification for post owner if not self
    const post = posts.find(p => p.id === postId);
    if (post && post.user_id !== currentUser.id) {
      await sb.from('notifications').insert({
        user_id: post.user_id,
        type: 'comment',
        content: `${currentProfile?.username || 'Someone'} commented on your post`,
        link: `/post/${postId}`
      });
    }
    
    // Reload comments
    await loadComments(postId);
    await loadFeed(); // Update comment count
  } catch (error) {
    console.error('Error adding comment:', error);
    showToast('Error adding comment', 'error');
  }
}

function sharePost(postId) {
  // TODO: Implement share functionality
  showToast('Share feature coming soon', 'info');
}

function savePost(postId) {
  // TODO: Implement save functionality
  showToast('Save feature coming soon', 'info');
}

/* ===========================================================
   CREATE POST
=========================================================== */
function openCreatePostModal() {
  el('createPostModal').classList.add('active');
  document.body.style.overflow = 'hidden';
  
  // Reset form
  if (el('postCaption')) el('postCaption').value = '';
  if (el('postMediaPreview')) el('postMediaPreview').style.display = 'none';
  if (el('postFeeling')) el('postFeeling').style.display = 'none';
  if (el('mediaInput')) el('mediaInput').value = '';
}

function closeCreatePostModal() {
  el('createPostModal').classList.remove('active');
  document.body.style.overflow = '';
}

function openPhotoPickerModal() {
  if (el('mediaInput')) el('mediaInput').click();
}

async function handleMediaUpload(event) {
  const file = event.target.files[0];
  if (!file) return;
  
  // Validate file type
  const validTypes = ['image/jpeg', 'image/png', 'image/gif', 'video/mp4', 'video/quicktime'];
  if (!validTypes.includes(file.type)) {
    showToast('Please select an image (JPEG, PNG, GIF) or video (MP4, MOV)', 'error');
    return;
  }
  
  // Validate file size (10MB max)
  if (file.size > 10 * 1024 * 1024) {
    showToast('File size must be less than 10MB', 'error');
    return;
  }
  
  // Show preview
  const reader = new FileReader();
  reader.onload = function(e) {
    const preview = el('mediaPreview');
    if (preview) {
      preview.src = e.target.result;
      
      if (file.type.startsWith('video/')) {
        preview.alt = 'Video preview';
      }
      
      el('postMediaPreview').style.display = 'block';
    }
  };
  reader.readAsDataURL(file);
}

function removeMedia() {
  if (el('postMediaPreview')) el('postMediaPreview').style.display = 'none';
  if (el('mediaInput')) el('mediaInput').value = '';
}

function openFeelingPickerModal() {
  // TODO: Implement feeling picker
  showToast('Feeling picker coming soon', 'info');
}

function removeFeeling() {
  if (el('postFeeling')) el('postFeeling').style.display = 'none';
}

async function submitPost() {
  const caption = el('postCaption')?.value.trim() || '';
  const privacy = el('postPrivacy')?.value || 'public';
  const mediaFile = el('mediaInput')?.files?.[0];
  
  if (!caption && !mediaFile) {
    showToast('Please add some text or media to your post', 'warning');
    return;
  }
  
  const submitBtn = el('submitPostBtn');
  if (!submitBtn) return;
  
  submitBtn.disabled = true;
  submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Posting...';
  
  try {
    let mediaUrl = null;
    
    // Upload media if present
    if (mediaFile) {
      const fileExt = mediaFile.name.split('.').pop();
      const fileName = `${Date.now()}-${Math.random().toString(36).substr(2)}.${fileExt}`;
      const filePath = `posts/${currentUser.id}/${fileName}`;
      
      const { error: uploadError } = await sb.storage
        .from('media')
        .upload(filePath, mediaFile);
      
      if (uploadError) throw uploadError;
      
      const { data: { publicUrl } } = sb.storage
        .from('media')
        .getPublicUrl(filePath);
      
      mediaUrl = publicUrl;
    }
    
    // Create post
    const { error } = await sb.from('posts').insert({
      user_id: currentUser.id,
      caption: caption,
      image_url: mediaUrl,
      privacy: privacy
    });
    
    if (error) throw error;
    
    // Update post count
    await sb.from('profiles')
      .update({ posts_count: (currentProfile?.posts_count || 0) + 1 })
      .eq('id', currentUser.id);
    
    showToast('Post created successfully!', 'success');
    closeCreatePostModal();
    
    // Refresh feed
    await loadFeed();
    await loadProfile(); // Update profile stats
  } catch (error) {
    console.error('Error creating post:', error);
    showToast('Error creating post', 'error');
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = 'Post';
  }
}

/* ===========================================================
   EDIT PROFILE
=========================================================== */
function openEditProfile() {
  el('editProfileModal').classList.add('active');
  document.body.style.overflow = 'hidden';
}

function closeEditProfileModal() {
  el('editProfileModal').classList.remove('active');
  document.body.style.overflow = '';
}

function updateCharCounts() {
  const username = el('editUsername')?.value || '';
  const bio = el('editBio')?.value || '';
  
  if (el('usernameCharCount')) {
    el('usernameCharCount').textContent = `${username.length}/30`;
  }
  if (el('bioCharCount')) {
    el('bioCharCount').textContent = `${bio.length}/150`;
  }
}

async function handleAvatarUpload(event) {
  const file = event.target.files[0];
  if (!file) return;
  
  // Validate file
  if (!file.type.startsWith('image/')) {
    showToast('Please select an image file', 'error');
    return;
  }
  
  if (file.size > 5 * 1024 * 1024) {
    showToast('Image must be less than 5MB', 'error');
    return;
  }
  
  const saveBtn = el('saveProfileBtn');
  if (!saveBtn) return;
  
  saveBtn.disabled = true;
  saveBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Uploading...';
  
  try {
    // Upload to Supabase Storage
    const fileExt = file.name.split('.').pop();
    const fileName = `${currentUser.id}-${Date.now()}.${fileExt}`;
    const filePath = `avatars/${fileName}`;
    
    const { error: uploadError } = await sb.storage
      .from('avatars')
      .upload(filePath, file, {
        cacheControl: '3600',
        upsert: true
      });
    
    if (uploadError) throw uploadError;
    
    // Get public URL
    const { data: { publicUrl } } = sb.storage
      .from('avatars')
      .getPublicUrl(filePath);
    
    // Update profile with new avatar URL
    const { error: updateError } = await sb.from('profiles')
      .update({ avatar_url: publicUrl })
      .eq('id', currentUser.id);
    
    if (updateError) throw updateError;
    
    // Update current profile
    if (currentProfile) {
      currentProfile.avatar_url = publicUrl;
    }
    updateProfileUI();
    
    showToast('Avatar updated successfully!', 'success');
  } catch (error) {
    console.error('Error uploading avatar:', error);
    showToast('Error uploading avatar', 'error');
  } finally {
    saveBtn.disabled = false;
    saveBtn.textContent = 'Save Changes';
  }
}

async function saveProfile() {
  const username = el('editUsername')?.value.trim() || '';
  const bio = el('editBio')?.value.trim() || '';
  const location = el('editLocation')?.value.trim() || '';
  
  if (!username) {
    showToast('Username is required', 'error');
    return;
  }
  
  const saveBtn = el('saveProfileBtn');
  if (!saveBtn) return;
  
  saveBtn.disabled = true;
  saveBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Saving...';
  
  try {
    const { error } = await sb.from('profiles')
      .update({
        username: username,
        bio: bio,
        location: location,
        updated_at: new Date().toISOString()
      })
      .eq('id', currentUser.id);
    
    if (error) throw error;
    
    // Update current profile
    if (currentProfile) {
      currentProfile.username = username;
      currentProfile.bio = bio;
      currentProfile.location = location;
    }
    
    updateProfileUI();
    showToast('Profile updated successfully!', 'success');
    closeEditProfileModal();
  } catch (error) {
    console.error('Error updating profile:', error);
    showToast('Error updating profile', 'error');
  } finally {
    saveBtn.disabled = false;
    saveBtn.textContent = 'Save Changes';
  }
}

/* ===========================================================
   NOTIFICATIONS
=========================================================== */
async function loadNotifications() {
  try {
    const { data, error } = await sb
      .from('notifications')
      .select('*')
      .eq('user_id', currentUser.id)
      .order('created_at', { ascending: false })
      .limit(50);
    
    if (error) throw error;
    
    notifications = data || [];
    renderNotifications();
    updateNotificationBadges();
  } catch (error) {
    console.error('Error loading notifications:', error);
  }
}

function renderNotifications() {
  const list = el('notificationList');
  if (!list) return;
  
  list.innerHTML = '';
  
  if (notifications.length === 0) {
    list.innerHTML = `
      <div class="text-center p-5" style="color: var(--muted);">
        <i class="fas fa-bell" style="font-size: 48px; opacity: 0.5; margin-bottom: 16px;"></i>
        <p>No notifications yet</p>
      </div>
    `;
    return;
  }
  
  notifications.forEach(notification => {
    const item = document.createElement('div');
    item.className = `nav-item ${notification.is_read ? '' : 'unread'}`;
    item.onclick = () => handleNotificationClick(notification);
    
    let icon = 'fa-bell';
    let iconClass = 'text-primary';
    
    switch (notification.type) {
      case 'like': icon = 'fa-heart'; iconClass = 'text-danger'; break;
      case 'comment': icon = 'fa-comment'; iconClass = 'text-info'; break;
      case 'follow': icon = 'fa-user-plus'; iconClass = 'text-success'; break;
      case 'message': icon = 'fa-envelope'; iconClass = 'text-warning'; break;
    }
    
    item.innerHTML = `
      <i class="fas ${icon} nav-icon ${iconClass}"></i>
      <div style="flex: 1;">
        <div>${notification.content}</div>
        <div style="font-size: 11px; color: var(--muted);">${timeAgo(notification.created_at)}</div>
      </div>
      ${!notification.is_read ? '<div style="width: 8px; height: 8px; background: var(--primary); border-radius: 50%; flex-shrink: 0;"></div>' : ''}
    `;
    
    list.appendChild(item);
  });
}

async function handleNotificationClick(notification) {
  // Mark as read
  if (!notification.is_read) {
    await sb.from('notifications')
      .update({ is_read: true })
      .eq('id', notification.id);
    
    await loadNotifications();
  }
  
  // Handle notification action
  if (notification.link) {
    // Navigate to link
    if (notification.link.startsWith('/post/')) {
      const postId = notification.link.split('/')[2];
      // Scroll to post
      const postEl = el(`post-${postId}`);
      if (postEl) {
        postEl.scrollIntoView({ behavior: 'smooth' });
        postEl.style.animation = 'fadeIn 0.5s';
        setTimeout(() => postEl.style.animation = '', 500);
      }
    }
  }
  
  // Close dropdown
  el('notificationDropdown').classList.remove('active');
}

async function markAllNotificationsAsRead() {
  try {
    await sb.from('notifications')
      .update({ is_read: true })
      .eq('user_id', currentUser.id)
      .eq('is_read', false);
    
    await loadNotifications();
    showToast('All notifications marked as read', 'success');
  } catch (error) {
    console.error('Error marking notifications as read:', error);
    showToast('Error marking notifications as read', 'error');
  }
}

function showNotifications() {
  el('notificationDropdown').classList.add('active');
}

function updateNotificationBadges() {
  const unreadCount = notifications.filter(n => !n.is_read).length;
  
  // Update all badge elements
  qsa('.notification-badge').forEach(badge => {
    badge.textContent = unreadCount;
    badge.style.display = unreadCount > 0 ? 'flex' : 'none';
  });
  
  // Update sidebar badge
  const sidebarBadge = el('sidebarNotificationBadge');
  if (sidebarBadge) {
    sidebarBadge.textContent = unreadCount;
    sidebarBadge.style.display = unreadCount > 0 ? 'flex' : 'none';
  }
  
  // Update mobile badge
  const mobileBadge = el('mobileNotificationBadge');
  if (mobileBadge) {
    mobileBadge.textContent = unreadCount;
    mobileBadge.style.display = unreadCount > 0 ? 'flex' : 'none';
  }
}

/* ===========================================================
   CONTACTS & ONLINE USERS
=========================================================== */
async function loadContacts() {
  try {
    const { data, error } = await sb
      .from('profiles')
      .select('*')
      .neq('id', currentUser.id)
      .limit(20);
    
    if (error) throw error;
    
    contacts = data || [];
    renderContacts();
  } catch (error) {
    console.error('Error loading contacts:', error);
  }
}

function renderContacts() {
  const list = el('contactsList');
  if (!list) return;
  
  list.innerHTML = '';
  
  contacts.forEach(user => {
    const item = document.createElement('div');
    item.className = 'contact-item';
    item.onclick = () => openConversation(user);
    
    const avatarHtml = user.avatar_url 
      ? `<img src="${user.avatar_url}" alt="${user.username}">`
      : `<span class="avatar-initial">${user.username?.[0] || 'U'}</span>`;
    
    // Random online status for demo
    const isOnline = Math.random() > 0.3;
    
    item.innerHTML = `
      <div class="contact-avatar">
        ${avatarHtml}
        ${isOnline ? '<div class="contact-status"></div>' : ''}
      </div>
      <div class="contact-info">
        <div class="contact-name">${user.username}</div>
        <div class="contact-status-text">${isOnline ? 'Online' : 'Offline'}</div>
      </div>
    `;
    
    list.appendChild(item);
  });
}

async function loadOnlineUsers() {
  // In a real app, you'd track online users via presence
  // For demo, we'll use a subset of contacts
  const onlineList = el('onlineList');
  if (!onlineList) return;
  
  onlineList.innerHTML = '';
  
  // Take first 5 contacts as "online" for demo
  const onlineContacts = contacts.slice(0, Math.min(5, contacts.length));
  
  onlineContacts.forEach(user => {
    const item = document.createElement('div');
    item.className = 'online-user';
    item.onclick = () => openConversation(user);
    
    const avatarHtml = user.avatar_url 
      ? `<img src="${user.avatar_url}" alt="${user.username}">`
      : `<span class="avatar-initial">${user.username?.[0] || 'U'}</span>`;
    
    item.innerHTML = `
      <div class="online-avatar">
        ${avatarHtml}
        <div class="online-status"></div>
      </div>
      <div>${user.username}</div>
    `;
    
    onlineList.appendChild(item);
  });
}

function refreshContacts() {
  loadContacts();
  loadOnlineUsers();
  showToast('Contacts refreshed', 'success');
}

/* ===========================================================
   MESSENGER / CHAT
=========================================================== */
function openMessenger() {
  el('messengerModal').classList.add('active');
  document.body.style.overflow = 'hidden';
  loadChats();
}

function closeMessenger() {
  el('messengerModal').classList.remove('active');
  document.body.style.overflow = '';
  activeConversationId = null;
  activeChatUser = null;
}

async function loadChats() {
  const chatsContainer = el('messengerChats');
  if (!chatsContainer) return;
  
  chatsContainer.innerHTML = '<p class="text-center p-5">Loading chats...</p>';
  
  try {
    // Get conversations where user is involved
    const { data, error } = await sb
      .from('conversations')
      .select(`
        *,
        user_one:profiles!user_one (*),
        user_two:profiles!user_two (*)
      `)
      .or(`user_one.eq.${currentUser.id},user_two.eq.${currentUser.id}`)
      .order('last_message_at', { ascending: false });
    
    if (error) throw error;
    
    chatsContainer.innerHTML = '';
    
    if (!data || data.length === 0) {
      chatsContainer.innerHTML = `
        <div class="text-center p-5" style="color: var(--muted);">
          <i class="fas fa-comments" style="font-size: 48px; opacity: 0.5; margin-bottom: 16px;"></i>
          <p>No conversations yet</p>
          <button class="btn btn-primary mt-3" onclick="startNewChat()">Start New Chat</button>
        </div>
      `;
      return;
    }
    
    // For each conversation, get the other user and last message
    for (const convo of data) {
      const otherUser = convo.user_one.id === currentUser.id ? convo.user_two : convo.user_one;
      const lastMessage = await getLastMessage(convo.id);
      const unreadCount = await getUnreadCount(convo.id);
      
      const chatItem = document.createElement('div');
      chatItem.className = `chat-item ${convo.id === activeConversationId ? 'active' : ''}`;
      chatItem.onclick = () => selectConversation(convo.id, otherUser);
      
      const avatarHtml = otherUser.avatar_url 
        ? `<img src="${otherUser.avatar_url}" alt="${otherUser.username}">`
        : `<span class="avatar-initial">${otherUser.username?.[0] || 'U'}</span>`;
      
      chatItem.innerHTML = `
        <div class="chat-avatar">
          ${avatarHtml}
        </div>
        <div class="chat-info">
          <div class="chat-name">${otherUser.username}</div>
          <div class="chat-preview">${lastMessage?.content || 'No messages yet'}</div>
        </div>
        <div class="chat-meta">
          <div class="chat-time">${lastMessage ? timeAgo(lastMessage.created_at) : ''}</div>
          ${unreadCount > 0 ? `<div class="chat-unread">${unreadCount}</div>` : ''}
        </div>
      `;
      
      chatsContainer.appendChild(chatItem);
    }
  } catch (error) {
    console.error('Error loading chats:', error);
    chatsContainer.innerHTML = '<p class="text-center p-5">Error loading chats</p>';
  }
}

async function getLastMessage(conversationId) {
  const { data } = await sb
    .from('messages')
    .select('*')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: false })
    .limit(1)
    .single();
  
  return data;
}

async function getUnreadCount(conversationId) {
  const { count } = await sb
    .from('messages')
    .select('*', { count: 'exact', head: true })
    .eq('conversation_id', conversationId)
    .eq('is_read', false)
    .neq('sender_id', currentUser.id);
  
  return count || 0;
}

async function selectConversation(conversationId, user) {
  activeConversationId = conversationId;
  activeChatUser = user;
  
  // Update UI
  el('chatUserName').textContent = user.username;
  el('chatUserStatus').textContent = 'Online';
  
  const avatarHtml = user.avatar_url 
    ? `<img src="${user.avatar_url}" alt="${user.username}">`
    : `<span class="avatar-initial">${user.username?.[0] || 'U'}</span>`;
  
  el('chatUserAvatar').innerHTML = avatarHtml;
  
  // Mark as read
  await markMessagesAsRead(conversationId);
  
  // Load messages
  await loadMessages();
  
  // Update chat list
  await loadChats();
}

async function markMessagesAsRead(conversationId) {
  await sb.from('messages')
    .update({ is_read: true })
    .eq('conversation_id', conversationId)
    .neq('sender_id', currentUser.id)
    .eq('is_read', false);
}

async function loadMessages() {
  const messagesContainer = el('chatMessages');
  if (!messagesContainer || !activeConversationId) return;
  
  messagesContainer.innerHTML = '<p class="text-center p-5">Loading messages...</p>';
  
  try {
    const { data, error } = await sb
      .from('messages')
      .select('*')
      .eq('conversation_id', activeConversationId)
      .order('created_at', { ascending: true })
      .limit(100);
    
    if (error) throw error;
    
    messagesContainer.innerHTML = '';
    
    if (!data || data.length === 0) {
      messagesContainer.innerHTML = `
        <div class="text-center p-5" style="color: var(--muted);">
          <i class="fas fa-comment" style="font-size: 48px; opacity: 0.5; margin-bottom: 16px;"></i>
          <p>No messages yet</p>
          <p>Send a message to start the conversation!</p>
        </div>
      `;
      return;
    }
    
    data.forEach(message => {
      const messageEl = document.createElement('div');
      messageEl.className = `message ${message.sender_id === currentUser.id ? 'sent' : 'received'}`;
      
      messageEl.innerHTML = `
        <div>${message.content}</div>
        <div class="message-time">${timeAgo(message.created_at)}</div>
      `;
      
      messagesContainer.appendChild(messageEl);
    });
    
    // Scroll to bottom
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
  } catch (error) {
    console.error('Error loading messages:', error);
    messagesContainer.innerHTML = '<p class="text-center p-5">Error loading messages</p>';
  }
}

async function sendChatMessage() {
  const input = el('chatInput');
  const content = input.value.trim();
  
  if (!content || !activeConversationId) {
    showToast('Please select a conversation first', 'warning');
    return;
  }
  
  try {
    await sb.from('messages').insert({
      conversation_id: activeConversationId,
      sender_id: currentUser.id,
      content: content
    });
    
    // Update conversation timestamp
    await sb.from('conversations')
      .update({ last_message_at: new Date().toISOString() })
      .eq('id', activeConversationId);
    
    input.value = '';
    autoResizeTextarea({ target: input });
    
    // Reload messages
    await loadMessages();
    await loadChats();
  } catch (error) {
    console.error('Error sending message:', error);
    showToast('Error sending message', 'error');
  }
}

function startNewChat() {
  // TODO: Implement new chat modal
  showToast('New chat feature coming soon', 'info');
}

function updateMessageBadges() {
  loadChats();
}

/* ===========================================================
   UTILITY FUNCTIONS
=========================================================== */
function autoResizeTextarea(event) {
  const textarea = event.target;
  textarea.style.height = 'auto';
  textarea.style.height = textarea.scrollHeight + 'px';
}

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

function searchContent() {
  const query = el('globalSearch')?.value || '';
  if (query.trim()) {
    showToast(`Searching for "${query}"`, 'info');
    // TODO: Implement actual search
  }
}

function closeAllModals() {
  // Close all modals and dropdowns
  qsa('.modal-overlay.active, .dropdown.active, .messenger-overlay.active').forEach(el => {
    el.classList.remove('active');
  });
  
  // Close mobile menu
  closeMobileMenu();
  
  // Restore body scroll
  document.body.style.overflow = '';
}

async function handleLogout() {
  try {
    await sb.auth.signOut();
    location.href = 'login.html';
  } catch (error) {
    console.error('Error logging out:', error);
    showToast('Error logging out', 'error');
  }
}

/* ===========================================================
   CONVERSATION HELPER
=========================================================== */
async function openConversation(user) {
  // First check if conversation already exists
  try {
    const { data: existingConvo } = await sb
      .from('conversations')
      .select('*')
      .or(`and(user_one.eq.${currentUser.id},user_two.eq.${user.id}),and(user_one.eq.${user.id},user_two.eq.${currentUser.id})`)
      .single();
    
    if (existingConvo) {
      // Open existing conversation
      openMessenger();
      setTimeout(() => selectConversation(existingConvo.id, user), 100);
    } else {
      // Create new conversation
      const { data: newConvo, error } = await sb
        .from('conversations')
        .insert({
          user_one: currentUser.id,
          user_two: user.id
        })
        .select()
        .single();
      
      if (error) throw error;
      
      openMessenger();
      setTimeout(() => selectConversation(newConvo.id, user), 100);
    }
  } catch (error) {
    console.error('Error opening conversation:', error);
    showToast('Error starting conversation', 'error');
  }
}

/* ===========================================================
   INITIALIZATION
=========================================================== */
document.addEventListener('DOMContentLoaded', loadUser);
