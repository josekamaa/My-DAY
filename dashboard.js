// --------------------------------------
// 🔵 SUPABASE CONFIG
// --------------------------------------
const SUPABASE_URL = "https://ojjvkhafgurgondsopeh.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9qanZraGFmZ3VyZ29uZHNvcGVoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQ5MDkzODYsImV4cCI6MjA4MDQ4NTM4Nn0.hOLxBVqnFhJ2S1jjR0mkKUJ_bWDjZbHJD3wV0Rbbf7A";

const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// --------------------------------------
// 🔹 GLOBAL VARIABLES
// --------------------------------------
let currentUser = null;
let userLikes = new Set();
let currentFilter = 'all';
let currentView = 'list';
let userData = {};

// --------------------------------------
// 🔹 LOAD USER SESSION
// --------------------------------------
async function loadUser() {
    const { data } = await supabaseClient.auth.getUser();
    if (data?.user) {
        currentUser = data.user;
        updateUserProfile();
        loadUserLikes();
        loadUserData();
        loadStories();
        loadOnlineUsers();
        loadNotifications();
        startCountdown();
    } else {
        alert("You must be logged in!");
        window.location.href = "login.html";
    }
}

async function loadUserData() {
    if (!currentUser) return;
    
    // Get user profile data
    const { data: profile } = await supabaseClient
        .from("profiles")
        .select("*")
        .eq("id", currentUser.id)
        .single();
    
    userData = profile || {};
    updateUserProfile();
}

function updateUserProfile() {
    const miniProfile = document.getElementById('miniProfile');
    if (miniProfile && currentUser) {
        const userName = userData?.username || currentUser.email?.split('@')[0] || 'User';
        miniProfile.querySelector('.mini-avatar').textContent = userName.charAt(0).toUpperCase();
        miniProfile.querySelector('.mini-name').textContent = userName;
    }
}

// Load user's liked posts
async function loadUserLikes() {
    if (!currentUser) return;
    
    const { data: likes } = await supabaseClient
        .from("post_likes")
        .select("post_id")
        .eq("user_id", currentUser.id);
    
    if (likes) {
        likes.forEach(like => {
            userLikes.add(like.post_id);
        });
    }
}

loadUser();

// --------------------------------------
// 🔹 NAVIGATION FUNCTIONS
// --------------------------------------
function toggleNav() {
    const navPanel = document.getElementById("navPanel");
    navPanel.classList.toggle("open");
    closeSidebar(); // Close sidebar if open
}

function toggleCreatePost() {
    const postBox = document.getElementById("createPostBox");
    postBox.classList.toggle("hidden");
    
    if (!postBox.classList.contains("hidden")) {
        postBox.scrollIntoView({ behavior: 'smooth' });
        postBox.querySelector('textarea').focus();
    }
    
    closeNav();
}

function viewProfile() {
    alert("Profile page would open here!");
    // window.location.href = "profile.html";
}

function showMemories() {
    alert("Memories page would open here!");
    filterPosts('mine');
}

function logout() {
    if (confirm("Are you sure you want to logout?")) {
        supabaseClient.auth.signOut();
        window.location.href = "login.html";
    }
}

// --------------------------------------
// 🔹 SIDEBAR FUNCTIONS
// --------------------------------------
function toggleSidebar() {
    const sidebar = document.getElementById("sidebar");
    sidebar.classList.toggle("open");
    const toggleBtn = document.querySelector('.sidebar-toggle');
    toggleBtn.textContent = sidebar.classList.contains("open") ? "◀" : "▶";
    closeNav(); // Close nav if open
}

function closeSidebar() {
    document.getElementById("sidebar").classList.remove("open");
    document.querySelector('.sidebar-toggle').textContent = "▶";
}

function closeNav() {
    document.getElementById("navPanel").classList.remove("open");
}

// Load online users
async function loadOnlineUsers() {
    const onlineUsersDiv = document.getElementById("onlineUsers");
    if (!onlineUsersDiv) return;
    
    // In a real app, you'd use presence system. This is mock data.
    const mockUsers = [
        { id: 1, name: "Alex Chen", online: true },
        { id: 2, name: "Maria Garcia", online: true },
        { id: 3, name: "James Wilson", online: false },
        { id: 4, name: "Sarah Johnson", online: true },
        { id: 5, name: "David Lee", online: true }
    ];
    
    onlineUsersDiv.innerHTML = mockUsers.map(user => `
        <div class="online-user" onclick="startChat(${user.id})">
            <div style="width: 35px; height: 35px; border-radius: 50%; background: #667eea; color: white; display: flex; align-items: center; justify-content: center; font-weight: bold;">
                ${user.name.charAt(0)}
            </div>
            <span>${user.name}</span>
            ${user.online ? '<div class="online-dot"></div>' : ''}
        </div>
    `).join('');
}

// Load notifications
async function loadNotifications() {
    const notificationsDiv = document.getElementById("notifications");
    if (!notificationsDiv) return;
    
    // Mock notifications
    const notifications = [
        "🎉 John liked your graduation post",
        "💬 Sarah commented on your photo",
        "👥 5 new friends joined the platform",
        "📅 Graduation ceremony reminder: June 10",
        "🏆 You earned the 'Early Bird' badge"
    ];
    
    notificationsDiv.innerHTML = notifications.map(notif => `
        <div class="notification">${notif}</div>
    `).join('');
}

// Countdown timer
function startCountdown() {
    const countdownDiv = document.getElementById("countdown");
    if (!countdownDiv) return;
    
    const graduationDate = new Date("June 10, 2024 10:00:00").getTime();
    
    function updateCountdown() {
        const now = new Date().getTime();
        const distance = graduationDate - now;
        
        if (distance < 0) {
            countdownDiv.innerHTML = "🎓 Graduated! 🎉";
            return;
        }
        
        const days = Math.floor(distance / (1000 * 60 * 60 * 24));
        const hours = Math.floor((distance % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
        const minutes = Math.floor((distance % (1000 * 60 * 60)) / (1000 * 60));
        
        countdownDiv.innerHTML = `${days}d ${hours}h ${minutes}m`;
    }
    
    updateCountdown();
    setInterval(updateCountdown, 60000); // Update every minute
}

// --------------------------------------
// 🔹 STORIES FUNCTIONS
// --------------------------------------
async function loadStories() {
    const storiesContainer = document.getElementById("storiesContainer");
    if (!storiesContainer) return;
    
    // Mock stories data
    const stories = [
        { id: 1, name: "You", hasNew: true },
        { id: 2, name: "Alex", hasNew: false },
        { id: 3, name: "Maria", hasNew: true },
        { id: 4, name: "James", hasNew: false },
        { id: 5, name: "Sarah", hasNew: true },
        { id: 6, name: "David", hasNew: false }
    ];
    
    storiesContainer.innerHTML = stories.map(story => `
        <div class="story" onclick="viewStory(${story.id})">
            <div class="story-ring" style="${story.hasNew ? 'background: linear-gradient(45deg, #f09433, #e6683c, #dc2743, #cc2366, #bc1888);' : 'background: #ccc;'}">
                <div style="width: 100%; height: 100%; border-radius: 50%; background: #667eea; color: white; display: flex; align-items: center; justify-content: center; font-weight: bold; font-size: 20px;">
                    ${story.name.charAt(0)}
                </div>
            </div>
            <span>${story.name}</span>
        </div>
    `).join('');
}

function viewStory(storyId) {
    alert(`Viewing story ${storyId}`);
}

function addStory() {
    openCamera();
}

// --------------------------------------
// 🔹 SEARCH FUNCTIONS
// --------------------------------------
async function searchContent(query) {
    if (query.length < 2) return;
    
    // Show loading
    document.getElementById('posts').innerHTML = '<div class="loading-spinner"></div>';
    
    const { data: posts } = await supabaseClient
        .from("posts")
        .select("*")
        .ilike("caption", `%${query}%`)
        .order("created_at", { ascending: false });
    
    displayPosts(posts);
}

function advancedSearch() {
    alert("Advanced search filters would appear here!");
}

// --------------------------------------
// 🔹 FILTER FUNCTIONS
// --------------------------------------
async function filterPosts(type) {
    currentFilter = type;
    
    // Update active tab
    document.querySelectorAll('.filter-tab').forEach(tab => {
        tab.classList.remove('active');
    });
    event.target.classList.add('active');
    
    // Show loading
    document.getElementById('posts').innerHTML = '<div class="loading-spinner"></div>';
    document.getElementById('loadingSpinner').style.display = 'block';
    document.getElementById('emptyState').style.display = 'none';
    
    let query = supabaseClient
        .from("posts")
        .select("*");
    
    switch(type) {
        case 'images':
            query = query.eq("media_type", "image");
            break;
        case 'videos':
            query = query.eq("media_type", "video");
            break;
        case 'liked':
            // Get liked post IDs
            const { data: likes } = await supabaseClient
                .from("post_likes")
                .select("post_id")
                .eq("user_id", currentUser.id);
            
            if (likes && likes.length > 0) {
                const postIds = likes.map(like => like.post_id);
                query = query.in("id", postIds);
            } else {
                query = query.eq("id", 0); // No results
            }
            break;
        case 'mine':
            query = query.eq("user_id", currentUser.id);
            break;
    }
    
    const { data: posts } = await query.order("created_at", { ascending: false });
    
    document.getElementById('loadingSpinner').style.display = 'none';
    displayPosts(posts);
}

// --------------------------------------
// 🔹 VIEW FUNCTIONS
// --------------------------------------
function setView(mode) {
    currentView = mode;
    
    // Update active button
    document.querySelectorAll('.view-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    event.target.classList.add('active');
    
    // Apply view class to posts container
    const postsDiv = document.getElementById('posts');
    postsDiv.className = '';
    if (mode !== 'list') {
        postsDiv.classList.add(`${mode}-view`);
    }
    
    // Re-display posts with new layout
    const posts = Array.from(postsDiv.querySelectorAll('.post'));
    if (posts.length > 0) {
        postsDiv.innerHTML = '';
        posts.forEach(post => postsDiv.appendChild(post));
    }
}

// --------------------------------------
// 🔹 FAB FUNCTIONS
// --------------------------------------
function toggleFAB() {
    const fabActions = document.querySelector('.fab-actions');
    const fabMain = document.querySelector('.fab-main');
    
    if (fabActions.style.display === 'flex') {
        fabActions.style.display = 'none';
        fabMain.textContent = '+';
    } else {
        fabActions.style.display = 'flex';
        fabMain.textContent = '×';
    }
}

function createTextPost() {
    toggleCreatePost();
    toggleFAB();
}

function shareMemory() {
    alert("Share memory feature");
    toggleFAB();
}

// --------------------------------------
// 🔹 CAMERA FUNCTIONALITY
// --------------------------------------
let cameraStream = null;

async function openCamera() {
    try {
        const preview = document.getElementById("cameraPreview");
        const video = document.getElementById("cameraVideo");
        
        cameraStream = await navigator.mediaDevices.getUserMedia({ 
            video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } },
            audio: false 
        });
        
        video.srcObject = cameraStream;
        preview.style.display = 'block';
        closeNav();
        toggleFAB(); // Close FAB if open
    } catch (error) {
        alert("Could not access camera: " + error.message);
        console.error("Camera error:", error);
    }
}

function closeCamera() {
    if (cameraStream) {
        cameraStream.getTracks().forEach(track => track.stop());
        cameraStream = null;
    }
    document.getElementById("cameraPreview").style.display = 'none';
}

function capturePhoto() {
    const video = document.getElementById("cameraVideo");
    const canvas = document.getElementById("photoCanvas");
    const context = canvas.getContext('2d');
    
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    
    // Convert to blob and set as file input
    canvas.toBlob(blob => {
        const file = new File([blob], `photo_${Date.now()}.png`, { type: 'image/png' });
        const dataTransfer = new DataTransfer();
        dataTransfer.items.add(file);
        document.getElementById("mediaFile").files = dataTransfer.files;
        
        // Show post creation box
        const postBox = document.getElementById("createPostBox");
        postBox.classList.remove("hidden");
        postBox.scrollIntoView({ behavior: 'smooth' });
        postBox.querySelector('textarea').focus();
        
        closeCamera();
    }, 'image/png');
}

// --------------------------------------
// 🔹 CALL FUNCTIONALITY
// --------------------------------------
function startVoiceCall() {
    showCallModal("Voice Call", "Select a user from contacts");
    closeNav();
}

function startVideoCall() {
    showCallModal("Video Call", "Select a user from contacts");
    closeNav();
}

function showCallModal(type, caller) {
    document.getElementById("callType").textContent = type;
    document.getElementById("callerName").textContent = caller;
    document.getElementById("callModal").style.display = 'flex';
}

function acceptCall() {
    alert(`${document.getElementById("callType").textContent} accepted! This would start a real call with WebRTC.`);
    document.getElementById("callModal").style.display = 'none';
}

function rejectCall() {
    document.getElementById("callModal").style.display = 'none';
}

function startChat(userId) {
    alert(`Starting chat with user ${userId}`);
}

// --------------------------------------
// 🔵 CREATE A POST
// --------------------------------------
async function createPost() {
    const caption = document.getElementById("caption").value;
    const media = document.getElementById("mediaFile").files[0];

    if (!caption && !media) {
        alert("Write something or upload media");
        return;
    }

    let mediaUrl = null;
    let mediaType = null;

    // If there's a media file, upload to Supabase Storage
    if (media) {
        const fileName = `${Date.now()}_${media.name}`;

        const { data, error } = await supabaseClient
            .storage
            .from("posts")
            .upload(fileName, media);

        if (error) {
            alert("Media upload failed!");
            console.log(error);
            return;
        }

        mediaUrl = `${SUPABASE_URL}/storage/v1/object/public/posts/${fileName}`;
        mediaType = media.type.startsWith("video") ? "video" : "image";
    }

    // Get username for display
    const userName = userData?.username || currentUser.email.split('@')[0];

    // Save post to database
    const { error } = await supabaseClient
        .from("posts")
        .insert([
            {
                user_id: currentUser.id,
                user_name: userName,
                caption,
                media_url: mediaUrl,
                media_type: mediaType,
                likes: 0,
                views: 0,
                shares: 0
            }
        ]);

    if (error) {
        alert("Failed to create post!");
        console.error(error);
        return;
    }

    // Reset form
    document.getElementById("caption").value = "";
    document.getElementById("mediaFile").value = "";
    
    // Hide post creation box
    document.getElementById("createPostBox").classList.add("hidden");

    // Refresh posts
    filterPosts(currentFilter);
    
    // Show success message
    showNotification("Post created successfully!", "success");
}

// --------------------------------------
// 🔵 DISPLAY POSTS
// --------------------------------------
async function displayPosts(posts) {
    const postsDiv = document.getElementById("posts");
    const emptyState = document.getElementById("emptyState");
    
    if (!posts || posts.length === 0) {
        postsDiv.innerHTML = "";
        emptyState.style.display = "block";
        return;
    }
    
    emptyState.style.display = "none";
    postsDiv.innerHTML = "";
    
    for (const post of posts) {
        // Get user info
        let userName = post.user_name || "User";
        if (!post.user_name && post.user_id) {
            const { data: userData } = await supabaseClient
                .from("profiles")
                .select("username")
                .eq("id", post.user_id)
                .single();
            
            userName = userData?.username || post.user_id.slice(0, 8);
        }
        
        // Format time
        const postTime = post.created_at ? 
            new Date(post.created_at).toLocaleDateString('en-US', { 
                month: 'short', 
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
            }) : "Just now";

        let mediaHTML = "";
        if (post.media_type === "image") {
            mediaHTML = `<img src="${post.media_url}" alt="Post image" loading="lazy">`;
        } else if (post.media_type === "video") {
            mediaHTML = `<video src="${post.media_url}" controls></video>`;
        }

        const hasLiked = userLikes.has(post.id);
        const likeButtonClass = hasLiked ? "liked" : "";
        const likeIcon = hasLiked ? '❤️' : '🤍';

        // Get comment count
        const { count: commentCount } = await supabaseClient
            .from("comments")
            .select("*", { count: 'exact', head: true })
            .eq("post_id", post.id);

        const postElement = document.createElement('div');
        postElement.className = 'post';
        postElement.innerHTML = `
            <div class="post-header">
                <div class="user-avatar">${userName.charAt(0).toUpperCase()}</div>
                <div>
                    <div class="user-name">${userName}</div>
                    <div class="post-time">${postTime}</div>
                </div>
            </div>
            
            ${post.caption ? `<p>${post.caption}</p>` : ''}
            ${mediaHTML}

            <div class="actions">
                <button class="${likeButtonClass}" onclick="likePost(${post.id}, ${post.likes})">
                    <span>${likeIcon}</span> Like (${post.likes})
                </button>
                <button onclick="toggleComments(${post.id})">
                    <span>💬</span> Comments (${commentCount || 0})
                </button>
                <button onclick="sharePost(${post.id})">
                    <span>📤</span> Share
                </button>
                
                <div class="post-controls">
                    <button class="control-btn" onclick="savePost(${post.id})" title="Save">
                        <span id="save-icon-${post.id}">💾</span>
                    </button>
                    <div class="post-stats">
                        <span title="Views">👁️ ${post.views || 0}</span>
                        <span title="Shares">🔄 ${post.shares || 0}</span>
                    </div>
                </div>
            </div>

            <div class="comments-section" id="comments-${post.id}" style="display:none;">
                <h4>Comments</h4>
                <div id="comments-list-${post.id}"></div>

                <div class="comment-box">
                    <input type="text" id="comment-input-${post.id}" placeholder="Write a comment..." 
                           onkeypress="if(event.key === 'Enter') addComment(${post.id})">
                    <button onclick="addComment(${post.id})">Send</button>
                </div>
            </div>
        `;
        
        postsDiv.appendChild(postElement);
        
        // Increment view count (in real app, only count unique views)
        if (post.user_id !== currentUser.id) {
            await supabaseClient
                .from("posts")
                .update({ views: (post.views || 0) + 1 })
                .eq("id", post.id);
        }
    }
    
    // Apply current view mode
    if (currentView !== 'list') {
        postsDiv.classList.add(`${currentView}-view`);
    }
}

// Initial load
filterPosts('all');

// --------------------------------------
// 🔵 LIKE A POST (ONE LIKE PER USER)
// --------------------------------------
async function likePost(postId, currentLikes) {
    if (!currentUser) {
        alert("Please login to like posts");
        return;
    }

    // Check if user already liked
    if (userLikes.has(postId)) {
        alert("You already liked this post!");
        return;
    }

    // Add like to database
    const { error: likeError } = await supabaseClient
        .from("post_likes")
        .insert([
            {
                post_id: postId,
                user_id: currentUser.id
            }
        ]);

    if (likeError) {
        console.log("Like error:", likeError);
        return;
    }

    // Update post likes count
    const { error } = await supabaseClient
        .from("posts")
        .update({ likes: currentLikes + 1 })
        .eq("id", postId);

    if (!error) {
        userLikes.add(postId);
        showNotification("Post liked!", "success");
        filterPosts(currentFilter); // Refresh posts
    }
}

// --------------------------------------
// 🔵 SAVE POST
// --------------------------------------
async function savePost(postId) {
    const saveIcon = document.getElementById(`save-icon-${postId}`);
    saveIcon.textContent = saveIcon.textContent === '💾' ? '✓' : '💾';
    
    // In real app, save to user's saved posts
    showNotification("Post saved to favorites!", "success");
}

// --------------------------------------
// 🔵 SHARE POST
// --------------------------------------
async function sharePost(postId) {
    if (navigator.share) {
        try {
            await navigator.share({
                title: 'Check out this graduation post!',
                text: 'Shared from My-Day Graduation App',
                url: window.location.href
            });
            
            // Increment share count
            await supabaseClient
                .from("posts")
                .update({ shares: supabaseClient.raw('shares + 1') })
                .eq("id", postId);
                
        } catch (err) {
            console.log('Share cancelled:', err);
        }
    } else {
        // Fallback for browsers without Web Share API
        prompt("Copy this link to share:", window.location.href);
    }
}

// --------------------------------------
// 🔵 ADD COMMENT
// --------------------------------------
async function addComment(postId) {
    const commentInput = document.getElementById(`comment-input-${postId}`);
    const commentText = commentInput.value.trim();

    if (!commentText) return;

    const userName = userData?.username || currentUser.email.split('@')[0];

    const { error } = await supabaseClient
        .from("comments")
        .insert([
            {
                post_id: postId,
                user_id: currentUser.id,
                user_name: userName,
                comment: commentText
            }
        ]);

    if (error) {
        alert("Failed to add comment");
        console.error(error);
        return;
    }

    commentInput.value = "";
    showNotification("Comment added!", "success");
    loadComments(postId);
    
    // Update comment count in post
    const commentBtn = document.querySelector(`#post-${postId} .actions button:nth-child(2)`);
    if (commentBtn) {
        const currentText = commentBtn.textContent;
        const match = currentText.match(/\((\d+)\)/);
        if (match) {
            const newCount = parseInt(match[1]) + 1;
            commentBtn.innerHTML = `<span>💬</span> Comments (${newCount})`;
        }
    }
}

// --------------------------------------
// 🔵 LOAD COMMENTS WITH USER INFO
// --------------------------------------
async function loadComments(postId) {
    const commentList = document.getElementById(`comments-list-${postId}`);
    if (!commentList) return;

    const { data: comments } = await supabaseClient
        .from("comments")
        .select("*")
        .eq("post_id", postId)
        .order("created_at", { ascending: true });

    if (!comments) return;

    commentList.innerHTML = "";

    comments.forEach(c => {
        const userName = c.user_name || c.user_id.slice(0, 8);
        const commentTime = c.created_at ? 
            new Date(c.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : "";
        
        commentList.innerHTML += `
            <div class="comment" id="comment-${c.id}">
                <div class="comment-author">
                    ${userName}
                    <span class="comment-time">${commentTime}</span>
                </div>
                <div>${c.comment}</div>
                <div class="reply-link" onclick="showReplyBox(${c.id})">Reply</div>

                <div id="reply-box-${c.id}" style="display:none; margin-top:10px;">
                    <div class="comment-box">
                        <input type="text" id="reply-input-${c.id}" placeholder="Write a reply..." 
                               onkeypress="if(event.key === 'Enter') addReply(${c.id}, ${postId})">
                        <button onclick="addReply(${c.id}, ${postId})">Send</button>
                    </div>
                </div>

                <div id="replies-${c.id}" class="reply-list"></div>
            </div>
        `;

        loadReplies(c.id);
    });
}

// --------------------------------------
// 🔵 ADD REPLY
// --------------------------------------
async function addReply(commentId, postId) {
    const replyText = document.getElementById(`reply-input-${commentId}`).value.trim();

    if (!replyText) return;

    const userName = userData?.username || currentUser.email.split('@')[0];

    const { error } = await supabaseClient
        .from("replies")
        .insert([
            {
                comment_id: commentId,
                user_id: currentUser.id,
                user_name: userName,
                reply: replyText
            }
        ]);

    if (error) {
        alert("Failed to add reply");
        console.error(error);
        return;
    }

    document.getElementById(`reply-input-${commentId}`).value = "";
    showNotification("Reply added!", "success");
    loadReplies(commentId);
}

// --------------------------------------
// 🔵 LOAD REPLIES WITH USER INFO
// --------------------------------------
async function loadReplies(commentId) {
    const replyList = document.getElementById(`replies-${commentId}`);
    if (!replyList) return;

    const { data: replies } = await supabaseClient
        .from("replies")
        .select("*")
        .eq("comment_id", commentId)
        .order("created_at", { ascending: true });

    if (!replies) return;

    replyList.innerHTML = "";

    replies.forEach(r => {
        const userName = r.user_name || r.user_id.slice(0, 8);
        const replyTime = r.created_at ? 
            new Date(r.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : "";
        
        replyList.innerHTML += `
            <div class="comment" style="background:#f0f0f0; margin-left:20px; margin-top:5px;">
                <div class="comment-author">
                    ${userName}
                    <span class="comment-time">${replyTime}</span>
                </div>
                <div>${r.reply}</div>
            </div>
        `;
    });
}

// --------------------------------------
// TOGGLE FUNCTIONS
// --------------------------------------
function toggleComments(postId) {
    const section = document.getElementById(`comments-${postId}`);
    const isHidden = section.style.display === "none";
    section.style.display = isHidden ? "block" : "none";
    
    if (isHidden) {
        loadComments(postId);
        section.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
}

function showReplyBox(commentId) {
    const replyBox = document.getElementById(`reply-box-${commentId}`);
    replyBox.style.display = replyBox.style.display === "none" ? "block" : "none";
}

// --------------------------------------
// NOTIFICATION FUNCTION
// --------------------------------------
function showNotification(message, type = "info") {
    // Create notification element
    const notification = document.createElement('div');
    notification.style.cssText = `
        position: fixed;
        top: 100px;
        right: 20px;
        background: ${type === 'success' ? '#4CAF50' : type === 'error' ? '#f44336' : '#2196F3'};
        color: white;
        padding: 15px 25px;
        border-radius: 10px;
        box-shadow: 0 5px 15px rgba(0,0,0,0.2);
        z-index: 3000;
        animation: slideIn 0.3s ease;
    `;
    
    notification.textContent = message;
    document.body.appendChild(notification);
    
    // Remove after 3 seconds
    setTimeout(() => {
        notification.style.animation = 'slideOut 0.3s ease';
        setTimeout(() => notification.remove(), 300);
    }, 3000);
}

// Add CSS for notification animation
const style = document.createElement('style');
style.textContent = `
    @keyframes slideIn {
        from { transform: translateX(100%); opacity: 0; }
        to { transform: translateX(0); opacity: 1; }
    }
    @keyframes slideOut {
        from { transform: translateX(0); opacity: 1; }
        to { transform: translateX(100%); opacity: 0; }
    }
`;
document.head.appendChild(style);

// --------------------------------------
// CLICK OUTSIDE TO CLOSE PANELS
// --------------------------------------
document.addEventListener('click', function(event) {
    const navPanel = document.getElementById('navPanel');
    const sidebar = document.getElementById('sidebar');
    const navToggle = document.querySelector('.nav-toggle');
    const sidebarToggle = document.querySelector('.sidebar-toggle');
    
    // Close nav panel if clicked outside
    if (navPanel.classList.contains('open') && 
        !navPanel.contains(event.target) && 
        !navToggle.contains(event.target)) {
        navPanel.classList.remove('open');
    }
    
    // Close sidebar if clicked outside
    if (sidebar.classList.contains('open') && 
        !sidebar.contains(event.target) && 
        !sidebarToggle.contains(event.target)) {
        sidebar.classList.remove('open');
        sidebarToggle.textContent = '▶';
    }
});
