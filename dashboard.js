// --------------------------------------
// 🔵 SUPABASE CONFIG
// --------------------------------------
const SUPABASE_URL = "https://eqkwtqutcazxvdllorzl.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVxa3d0cXV0Y2F6eHZkbGxvcnpsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQ3MzM0MTUsImV4cCI6MjA4MDMwOTQxNX0.al0gxBTCjQVBC-12Xv_4kFhstdPYFZWJBnpViy0WMR4";

const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// --------------------------------------
// 🔹 LOAD USER SESSION
// --------------------------------------
let currentUser = null;

async function loadUser() {
    const { data } = await supabaseClient.auth.getUser();
    if (data?.user) {
        currentUser = data.user;
    } else {
        alert("You must be logged in!");
        window.location.href = "login.html";
    }
}

loadUser();

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

    loadPosts();
}

// --------------------------------------
// 🔵 LOAD POSTS
// --------------------------------------
async function loadPosts() {
    const postsDiv = document.getElementById("posts");
    postsDiv.innerHTML = "<p>Loading...</p>";

    const { data: posts, error } = await supabaseClient
        .from("posts")
        .select("*")
        .order("id", { ascending: false });

    if (error) {
        postsDiv.innerHTML = "Failed to load posts";
        return;
    }

    postsDiv.innerHTML = "";

    posts.forEach(post => {
        let mediaHTML = "";
        if (post.media_type === "image") {
            mediaHTML = `<img src="${post.media_url}">`;
        } else if (post.media_type === "video") {
            mediaHTML = `<video src="${post.media_url}" controls></video>`;
        }

        postsDiv.innerHTML += `
            <div class="post" id="post-${post.id}">
                <p><strong>${post.caption || ""}</strong></p>
                ${mediaHTML}

                <div class="actions">
                    <button onclick="likePost(${post.id}, ${post.likes})">👍 Like (${post.likes})</button>
                    <button onclick="toggleComments(${post.id})">💬 Comments</button>
                </div>

                <div class="comments-section" id="comments-${post.id}" style="display:none;">
                    <div id="comments-list-${post.id}"></div>

                    <div class="comment-box">
                        <input type="text" id="comment-input-${post.id}" placeholder="Write a comment...">
                        <button onclick="addComment(${post.id})">Send</button>
                    </div>
                </div>
            </div>
        `;

        loadComments(post.id);
    });
}

loadPosts();

// --------------------------------------
// 🔵 LIKE A POST
// --------------------------------------
async function likePost(postId, currentLikes) {

    const { error } = await supabaseClient
        .from("posts")
        .update({ likes: currentLikes + 1 })
        .eq("id", postId);

    if (!error) {
        loadPosts();
    }
}

// --------------------------------------
// 🔵 ADD COMMENT
// --------------------------------------
async function addComment(postId) {
    const commentText = document.getElementById(`comment-input-${postId}`).value;

    if (!commentText) return;

    await supabaseClient
        .from("comments")
        .insert([
            {
                post_id: postId,
                user_id: currentUser.id,
                comment: commentText
            }
        ]);

    document.getElementById(`comment-input-${postId}`).value = "";
    loadComments(postId);
}

// --------------------------------------
// 🔵 LOAD COMMENTS + REPLIES
// --------------------------------------
async function loadComments(postId) {
    const commentList = document.getElementById(`comments-list-${postId}`);

    const { data: comments } = await supabaseClient
        .from("comments")
        .select("*")
        .eq("post_id", postId);

    commentList.innerHTML = "";

    comments.forEach(c => {
        commentList.innerHTML += `
            <div class="comment">
                ${c.comment}
                <div class="reply" onclick="showReplyBox(${c.id}, ${postId})">Reply</div>

                <div id="reply-box-${c.id}" style="display:none; margin-left:20px;">
                    <input type="text" id="reply-input-${c.id}" placeholder="Write a reply...">
                    <button onclick="addReply(${c.id}, ${postId})">Send</button>
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

    await supabaseClient
        .from("replies")
        .insert([
            {
                comment_id: commentId,
                user_id: currentUser.id,
                reply: replyText
            }
        ]);

    loadReplies(commentId);
    loadComments(postId);
}

// --------------------------------------
// 🔵 LOAD REPLIES
// --------------------------------------
async function loadReplies(commentId) {
    const replyList = document.getElementById(`replies-${commentId}`);

    const { data: replies } = await supabaseClient
        .from("replies")
        .select("*")
        .eq("comment_id", commentId);

    replyList.innerHTML = "";

    replies.forEach(r => {
        replyList.innerHTML += `
            <div class="comment" style="background:#e8e8e8; margin-left:20px;">
                ${r.reply}
            </div>
        `;
    });
}

// --------------------------------------
// Toggle comment visibility
// --------------------------------------
function toggleComments(postId) {
    const section = document.getElementById(`comments-${postId}`);
    section.style.display = section.style.display === "none" ? "block" : "none";
}

// Show reply box
function showReplyBox(commentId) {
    const replyBox = document.getElementById(`reply-box-${commentId}`);
    replyBox.style.display =
        replyBox.style.display === "none" ? "block" : "none";
}
