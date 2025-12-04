// ---------------- CONFIG ------------------
const supabaseClient = supabase.createClient(
    "https://eqkwtqutcazxvdllorzl.supabase.co",
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVxa3d0cXV0Y2F6eHZkbGxvcnpsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQ3MzM0MTUsImV4cCI6MjA4MDMwOTQxNX0.al0gxBTCjQVBC-12Xv_4kFhstdPYFZWJBnpViy0WMR4"
);

// Global
let activePostId = null;
let replyingToCommentId = null;


// ---------------- CREATE POST ---------------------
async function createPost() {
    const caption = document.getElementById("caption").value;
    const file = document.getElementById("mediaFile").files[0];

    if (!file) {
        alert("Please choose an image or video.");
        return;
    }

    const user = (await supabaseClient.auth.getUser()).data.user;
    if (!user) {
        alert("You must be logged in.");
        return;
    }

    // upload file to storage
    const fileName = Date.now() + "_" + file.name;

    const { error: uploadError } = await supabaseClient.storage
        .from("posts")
        .upload(fileName, file);

    if (uploadError) {
        console.log(uploadError);
        alert("Upload error");
        return;
    }

    const fileUrl = supabaseClient.storage
        .from("posts")
        .getPublicUrl(fileName).data.publicUrl;

    // insert post to database
    const { error } = await supabaseClient.from("posts").insert({
        caption,
        media_url: fileUrl,
        user_email: user.email
    });

    if (error) {
        console.log(error);
        alert("Post error");
        return;
    }

    document.getElementById("caption").value = "";
    document.getElementById("mediaFile").value = "";

    loadPosts();
}


// ---------------- LOAD POSTS ---------------------
async function loadPosts() {
    const { data: posts } = await supabaseClient
        .from("posts")
        .select("*")
        .order("created_at", { ascending: false });

    const container = document.getElementById("posts");
    container.innerHTML = "";

    posts.forEach(post => {
        let media = "";
        if (post.media_url.endsWith(".mp4")) {
            media = `<video controls src="${post.media_url}"></video>`;
        } else {
            media = `<img src="${post.media_url}">`;
        }

        container.innerHTML += `
            <div class="post">
                <p><b>${post.user_email}</b></p>
                <p>${post.caption}</p>
                ${media}

                <div class="actions">
                    <button onclick="openComments(${post.id})">💬 Comments</button>
                </div>
            </div>
        `;
    });
}


// ---------------- OPEN COMMENTS MODAL ---------------------
async function openComments(postId) {
    activePostId = postId;
    replyingToCommentId = null;

    document.getElementById("commentsModal").style.display = "flex";

    loadComments();
}


// ---------------- LOAD COMMENTS ------------------------
async function loadComments() {
    const { data: comments } = await supabaseClient
        .from("comments")
        .select("*")
        .eq("post_id", activePostId)
        .order("created_at", { ascending: true });

    const list = document.getElementById("commentsList");
    list.innerHTML = "";

    comments.forEach(c => {
        const isReply = c.parent_id !== null;

        if (!isReply) {
            list.innerHTML += `
            <div class="comment-item">
                <b>${c.user_email}</b><br>
                ${c.text}
                <div class="reply-link" onclick="prepareReply(${c.id})">Reply</div>
                ${renderReplies(comments, c.id)}
            </div>`;
        }
    });
}


// Render replies under each comment
function renderReplies(allComments, parentId) {
    let html = "";

    allComments
        .filter(r => r.parent_id === parentId)
        .forEach(r => {
            html += `
            <div class="reply-item">
                <b>${r.user_email}</b><br>
                ${r.text}
            </div>`;
        });

    return html;
}


// ---------------- PREPARE REPLY -----------------------
function prepareReply(commentId) {
    replyingToCommentId = commentId;
    document.getElementById("newCommentText").placeholder = "Replying...";
}


// ---------------- SUBMIT COMMENT/REPLY ------------------
async function submitComment() {
    const text = document.getElementById("newCommentText").value;

    if (!text.trim()) return;

    const user = (await supabaseClient.auth.getUser()).data.user;

    await supabaseClient.from("comments").insert({
        post_id: activePostId,
        parent_id: replyingToCommentId,
        text,
        user_email: user.email
    });

    // reset
    document.getElementById("newCommentText").value = "";
    document.getElementById("newCommentText").placeholder = "Write a comment...";
    replyingToCommentId = null;

    loadComments();
}


// ---------------- CLOSE MODAL --------------------------
function closeComments() {
    document.getElementById("commentsModal").style.display = "none";
}


// Load posts on page start
loadPosts();
