// dashboard.js
// --------------------------------------
// 🔵 SUPABASE CONFIG
// --------------------------------------
const SUPABASE_URL = "https://ojjvkhafgurgondsopeh.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9qanZraGFmZ3VyZ29uZHNvcGVoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQ5MDkzODYsImV4cCI6MjA4MDQ4NTM4Nn0.hOLxBVqnFhJ2S1jjR0mkKUJ_bWDjZbHJD3wV0Rbbf7A";

const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// --------------------------------------
// 🔹 LOAD USER SESSION
// --------------------------------------
let currentUser = null;
let userLikes = new Set(); // Track which posts user has liked

async function loadUser() {
    const { data } = await supabaseClient.auth.getUser();
    if (data?.user) {
        currentUser = data.user;
        loadUserLikes();
    } else {
        alert("You must be logged in!");
        window.location.href = "login.html";
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
    navPanel.style.display = navPanel.style.display === "none" ? "flex" : "none";
}

function toggleCreatePost() {
    const postBox = document.getElementById("createPostBox");
    postBox.classList.toggle("hidden");
    
    // Scroll to post box if showing
    if (!postBox.classList.contains("hidden")) {
        postBox.scrollIntoView({ behavior: 'smooth' });
    }
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
            video: { facingMode: 'user' },
            audio: false 
        });
        
        video.srcObject = cameraStream;
        preview.style.display = 'block';
        toggleNav(); // Close nav panel
    } catch (error) {
        alert("Could not access camera: " + error.message);
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
        
        closeCamera();
    }, 'image/png');
}

// --------------------------------------
// 🔹 CALL FUNCTIONALITY (Placeholder)
// --------------------------------------
function startVoiceCall() {
    showCallModal("Voice Call", "Select a user from contacts");
}

function startVideoCall() {
    showCallModal("Video Call", "Select a user from contacts");
}

function showCallModal(type, caller) {
    document.getElementById("callType").textContent = type;
    document.getElementById("callerName").textContent = caller;
    document.getElementById("callModal").style.display = 'flex';
    toggleNav(); // Close nav panel
}

function acceptCall() {
    alert(`${document.getElementById("callType").textContent} accepted!`);
    document.getElementById("callModal").style.display = 'none';
}

function rejectCall() {
    document.getElementById("callModal").style.display = 'none';
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

    // Save post to database
    const { error } = await supabaseClient
        .from("posts")
        .insert([
            {
                user_id: currentUser.id,
                user_name: currentUser.email.split('@')[0], // Use email username
                caption,
                media_url: mediaUrl,
                media_type: mediaType,
                likes: 0
            }
        ]);

    if (error) {
        alert("Failed to create post!");
        return;
    }

    document.getElementById("caption").value = "";
    document.getElementById("mediaFile").value = "";
    
    // Hide post creation box
    document.getElementById("createPostBox").classList.add("hidden");

    loadPosts();
}

// --------------------------------------
// 🔵 LOAD POSTS WITH USER INFO
// --------------------------------------
async function loadPosts() {
    const postsDiv = document.getElementById("posts");
    postsDiv.innerHTML = "<p>Loading posts...</p>";

    const { data: posts, error } = await supabaseClient
        .from("posts")
        .select("*")
        .order("created_at", { ascending: false });

    if (error) {
        postsDiv.innerHTML = "Failed to load posts";
        return;
    }

    postsDiv.innerHTML = "";

    for (const post of posts) {
        // Get user info if not already in post
        let userName = post.user_name || "User";
        if (!post.user_name && post.user_id) {
            const { data: userData } = await supabaseClient
                .from("profiles")
                .select("username")
                .eq("id", post.user_id)
                .single();
            
            userName = userData?.username || post.user_id.slice(0, 8);
        }

        let mediaHTML = "";
        if (post.media_type === "image") {
            mediaHTML = `<img src="${post.media_url}" alt="Post image">`;
        } else if (post.media_type === "video") {
            mediaHTML = `<video src="${post.media_url}" controls></video>`;
        }

        const hasLiked = userLikes.has(post.id);
        const likeButtonClass = hasLiked ? "liked" : "";

        postsDiv.innerHTML += `
            <div class="post" id="post-${post.id}">
                <div class="post-header">
                    <div class="user-avatar">${userName.charAt(0).toUpperCase()}</div>
                    <div class="user-name">${userName}</div>
                </div>
                
                <p>${post.caption || ""}</p>
                ${mediaHTML}

                <div class="actions">
                    <button class="${likeButtonClass}" onclick="likePost(${post.id}, ${post.likes})">
                        ${hasLiked ? '❤️' : '🤍'} Like (${post.likes})
                    </button>
                    <button onclick="toggleComments(${post.id})">💬 Comments</button>
                </div>

                <div class="comments-section" id="comments-${post.id}" style="display:none;">
                    <h4>Comments</h4>
                    <div id="comments-list-${post.id}"></div>

                    <div class="comment-box">
                        <input type="text" id="comment-input-${post.id}" placeholder="Write a comment...">
                        <button onclick="addComment(${post.id})">Send</button>
                    </div>
                </div>
            </div>
        `;

        loadComments(post.id);
    }
}

loadPosts();

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
        loadPosts();
    }
}

// --------------------------------------
// 🔵 ADD COMMENT
// --------------------------------------
async function addComment(postId) {
    const commentText = document.getElementById(`comment-input-${postId}`).value;

    if (!commentText) return;

    const { error } = await supabaseClient
        .from("comments")
        .insert([
            {
                post_id: postId,
                user_id: currentUser.id,
                user_name: currentUser.email.split('@')[0],
                comment: commentText
            }
        ]);

    if (error) {
        alert("Failed to add comment");
        return;
    }

    document.getElementById(`comment-input-${postId}`).value = "";
    loadComments(postId);
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
        commentList.innerHTML += `
            <div class="comment" id="comment-${c.id}">
                <div class="comment-author">${userName}</div>
                <div>${c.comment}</div>
                <div class="reply-link" onclick="showReplyBox(${c.id})">Reply</div>

                <div id="reply-box-${c.id}" style="display:none; margin-top:10px;">
                    <div class="comment-box">
                        <input type="text" id="reply-input-${c.id}" placeholder="Write a reply...">
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
    const replyText = document.getElementById(`reply-input-${commentId}`).value;

    if (!replyText) return;

    const { error } = await supabaseClient
        .from("replies")
        .insert([
            {
                comment_id: commentId,
                user_id: currentUser.id,
                user_name: currentUser.email.split('@')[0],
                reply: replyText
            }
        ]);

    if (error) {
        alert("Failed to add reply");
        return;
    }

    document.getElementById(`reply-input-${commentId}`).value = "";
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
        replyList.innerHTML += `
            <div class="comment" style="background:#f0f0f0; margin-left:20px; margin-top:5px;">
                <div class="comment-author">${userName}</div>
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
    section.style.display = section.style.display === "none" ? "block" : "none";
}

function showReplyBox(commentId) {
    const replyBox = document.getElementById(`reply-box-${commentId}`);
    replyBox.style.display = replyBox.style.display === "none" ? "block" : "none";
}
