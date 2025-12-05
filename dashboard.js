// ----------------------------
// dashboard.js
// ----------------------------
// Replace SUPABASE_URL and SUPABASE_KEY with your project's values (these were in your previous file).
const SUPABASE_URL = "https://ojjvkhafgurgondsopeh.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9qanZraGFmZ3VyZ29uZHNvcGVoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQ5MDkzODYsImV4cCI6MjA4MDQ4NTM4Nn0.hOLxBVqnFhJ2S1jjR0mkKUJ_bWDjZbHJD3wV0Rbbf7A";

const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// ----------------------------
// State
// ----------------------------
let currentUser = null;
let capturedBlob = null;
let currentCall = null;
let callType = null; // 'voice' or 'video'
let pc = null; // RTCPeerConnection
let callChannel = null; // supabase realtime channel
const POSTS_BUCKET = "posts"; // storage bucket

// ----------------------------
// UTILITY / UI
// ----------------------------
function toggleNav() {
  const nav = document.getElementById("navPanel");
  nav.style.left = nav.style.left === "0px" ? "-260px" : "0px";
}

function toggleCreatePost() {
  const box = document.getElementById("createPostBox");
  box.style.display = box.style.display === "none" ? "block" : "none";
}

function clearCreateForm() {
  document.getElementById("caption").value = "";
  document.getElementById("mediaFile").value = "";
  capturedBlob = null;
  document.getElementById("capturePreview").style.display = "none";
}

// ----------------------------
// LOAD USER SESSION
// ----------------------------
async function loadUser() {
  const { data } = await supabaseClient.auth.getUser();
  if (data?.user) {
    currentUser = data.user;
    // Optional: load profile to show username/avatar
    loadNavUsers();
    loadPosts();
    setupSignalingChannel();
  } else {
    alert("You must be logged in to use this page.");
    window.location.href = "login.html";
  }
}

loadUser();

// ----------------------------
// CREATE POST (with upload support)
// ----------------------------
async function createPost() {
  const caption = document.getElementById("caption").value.trim();
  const fileInput = document.getElementById("mediaFile");
  const file = fileInput.files && fileInput.files[0];

  if (!caption && !file && !capturedBlob) {
    alert("Write something or attach media.");
    return;
  }

  let mediaUrl = null;
  let mediaType = null;

  if (capturedBlob && !file) {
    // upload capturedBlob
    const fileName = `${Date.now()}_capture.jpg`;
    const { error: upErr } = await supabaseClient.storage
      .from(POSTS_BUCKET)
      .upload(fileName, capturedBlob, { contentType: "image/jpeg" });
    if (upErr) {
      console.error(upErr);
      alert("Failed to upload captured image.");
      return;
    }
    mediaUrl = `${SUPABASE_URL}/storage/v1/object/public/${POSTS_BUCKET}/${fileName}`;
    mediaType = "image";
  } else if (file) {
    const fileName = `${Date.now()}_${file.name}`;
    const { error: upErr } = await supabaseClient.storage
      .from(POSTS_BUCKET)
      .upload(fileName, file);
    if (upErr) {
      console.error(upErr);
      alert("Upload failed.");
      return;
    }
    mediaUrl = `${SUPABASE_URL}/storage/v1/object/public/${POSTS_BUCKET}/${fileName}`;
    mediaType = file.type.startsWith("video") ? "video" : "image";
  }

  const { error } = await supabaseClient
    .from("posts")
    .insert([{
      user_id: currentUser.id,
      caption,
      media_url: mediaUrl,
      media_type: mediaType,
      created_at: new Date().toISOString()
    }]);

  if (error) {
    console.error(error);
    alert("Failed to create post.");
    return;
  }

  clearCreateForm();
  loadPosts();
}

// ----------------------------
// LOAD POSTS (with poster info, likes & comments count)
// ----------------------------
async function loadPosts() {
  const postsDiv = document.getElementById("posts");
  postsDiv.innerHTML = "Loading posts...";

  // select posts with profile info (assumes profile table is 'profiles' with id = auth.uid)
  const { data: posts, error } = await supabaseClient
    .from("posts")
    .select(`id, user_id, caption, media_url, media_type, created_at,
             profiles:profiles(username, avatar_url)`)
    .order("id", { ascending: false });

  if (error) {
    console.error(error);
    postsDiv.innerHTML = "Failed to load posts.";
    return;
  }

  if (!posts || posts.length === 0) {
    postsDiv.innerHTML = "<div class='post'>No posts yet.</div>";
    return;
  }

  postsDiv.innerHTML = "";

  for (const post of posts) {
    // count likes
    const { count: likesCount } = await supabaseClient
      .from("post_likes")
      .select("*", { count: "exact", head: true })
      .eq("post_id", post.id);

    // check if current user liked
    const { data: likedRows } = await supabaseClient
      .from("post_likes")
      .select("*")
      .eq("post_id", post.id)
      .eq("user_id", currentUser.id);

    const liked = (likedRows && likedRows.length > 0);

    const username = (post.profiles && post.profiles.username) || "Unknown";
    const avatar = (post.profiles && post.profiles.avatar_url) || null;
    const createdAt = new Date(post.created_at).toLocaleString();

    let mediaHTML = "";
    if (post.media_type === "image" && post.media_url) {
      mediaHTML = `<img src="${post.media_url}" alt="post image">`;
    } else if (post.media_type === "video" && post.media_url) {
      mediaHTML = `<video src="${post.media_url}" controls></video>`;
    }

    const postHtml = document.createElement("div");
    postHtml.className = "post";
    postHtml.id = `post-${post.id}`;
    postHtml.innerHTML = `
      <div class="meta">
        <img class="avatar" src="${avatar || ''}" onerror="this.style.background='#ddd'; this.src='';"/>
        <div>
          <div class="username">${escapeHtml(username)}</div>
          <div class="small">${escapeHtml(createdAt)}</div>
        </div>
      </div>

      <div style="margin-top:10px;"><strong>${escapeHtml(post.caption || "")}</strong></div>
      <div>${mediaHTML}</div>

      <div class="actions">
        <button id="like-btn-${post.id}" onclick="toggleLike(${post.id})">${liked ? '❤️ Liked' : '👍 Like'} (${likesCount || 0})</button>
        <button onclick="toggleComments(${post.id})">💬 Comments</button>
      </div>

      <div class="comments-section" id="comments-section-${post.id}" style="display:none;">
        <div id="comments-list-${post.id}">Loading comments…</div>
        <div style="display:flex; gap:8px; margin-top:8px;">
          <input id="comment-input-${post.id}" placeholder="Write a comment..." style="flex:1; padding:8px; border-radius:8px; border:1px solid #ddd;">
          <button class="btn" onclick="addComment(${post.id})">Send</button>
        </div>
      </div>
    `;

    postsDiv.appendChild(postHtml);

    // preload comments (but hidden until toggled)
    await loadComments(post.id);
  }
}

// ----------------------------
// ESCAPE HTML utility
// ----------------------------
function escapeHtml(str) {
  if (!str) return "";
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

// ----------------------------
// Likes (one-like-per-user enforcement)
// ----------------------------
async function toggleLike(postId) {
  // Check if user already liked
  const { data: existing } = await supabaseClient
    .from("post_likes")
    .select("*")
    .eq("post_id", postId)
    .eq("user_id", currentUser.id);

  if (existing && existing.length > 0) {
    // unlike (delete)
    const { error } = await supabaseClient
      .from("post_likes")
      .delete()
      .eq("post_id", postId)
      .eq("user_id", currentUser.id);
    if (error) console.error(error);
  } else {
    // insert like (unique constraint on post_id,user_id recommended)
    const { error } = await supabaseClient
      .from("post_likes")
      .insert([{ post_id: postId, user_id: currentUser.id }]);
    if (error) console.error(error);
  }

  // update button text immediately by reloading posts or updating counts
  loadPosts();
}

// ----------------------------
// COMMENTS: add & list
// ----------------------------
async function addComment(postId) {
  const input = document.getElementById(`comment-input-${postId}`);
  if (!input) return;
  const text = input.value.trim();
  if (!text) return;

  const { error } = await supabaseClient
    .from("comments")
    .insert([{ post_id: postId, user_id: currentUser.id, comment: text, created_at: new Date().toISOString() }]);

  if (error) {
    console.error(error);
    return;
  }

  input.value = "";
  loadComments(postId);
}

async function loadComments(postId) {
  const container = document.getElementById(`comments-list-${postId}`);
  if (!container) return;
  const { data: comments, error } = await supabaseClient
    .from("comments")
    .select(`id, user_id, comment, created_at, profiles:profiles(username, avatar_url)`)
    .eq("post_id", postId)
    .order("id", { ascending: true });

  if (error) {
    console.error(error);
    container.innerHTML = "Failed to load comments.";
    return;
  }

  if (!comments || comments.length === 0) {
    container.innerHTML = "<div class='small'>No comments yet</div>";
    return;
  }

  container.innerHTML = "";
  comments.forEach(c => {
    const name = (c.profiles && c.profiles.username) || "Unknown";
    const created = new Date(c.created_at).toLocaleString();
    const item = document.createElement("div");
    item.className = "comment-item";
    item.innerHTML = `<div style="font-weight:700;">${escapeHtml(name)} <span class="small" style="font-weight:400; margin-left:8px;">${escapeHtml(created)}</span></div>
                      <div style="margin-top:6px;">${escapeHtml(c.comment)}</div>`;
    container.appendChild(item);
  });
}

function toggleComments(postId) {
  const section = document.getElementById(`comments-section-${postId}`);
  if (!section) return;
  section.style.display = section.style.display === "none" ? "block" : "none";
  if (section.style.display === "block") {
    loadComments(postId);
  }
}

// ----------------------------
// CAMERA: open modal, take photo, attach to form
// ----------------------------
let cameraStream = null;
async function openCameraModal() {
  document.getElementById("cameraModal").style.display = "flex";
  const v = document.getElementById("cameraPreviewVideo");
  try {
    cameraStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user" }, audio: false });
    v.srcObject = cameraStream;
  } catch (err) {
    console.error(err);
    alert("Failed to access camera.");
    closeCameraModal();
  }
}

function closeCameraModal() {
  document.getElementById("cameraModal").style.display = "none";
  const v = document.getElementById("cameraPreviewVideo");
  v.pause();
  if (cameraStream) {
    cameraStream.getTracks().forEach(t => t.stop());
    cameraStream = null;
  }
}

function takePhoto() {
  if (!cameraStream) return alert("Camera not available.");
  const video = document.getElementById("cameraPreviewVideo");
  const canvas = document.createElement("canvas");
  canvas.width = video.videoWidth || 1280;
  canvas.height = video.videoHeight || 720;
  const ctx = canvas.getContext("2d");
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

  canvas.toBlob(async (blob) => {
    if (!blob) return;
    capturedBlob = blob; // save blob for the post upload
    // show preview and attach to create post form
    const url = URL.createObjectURL(blob);
    document.getElementById("capturedImage").src = url;
    document.getElementById("capturePreview").style.display = "block";
    document.getElementById("createPostBox").style.display = "block";
    closeCameraModal();
  }, "image/jpeg", 0.9);
}

// ----------------------------
// NAV: load user list for calls
// ----------------------------
async function loadNavUsers() {
  const container = document.getElementById("navUsers");
  const select = document.getElementById("callTargetSelect");
  container.innerHTML = "Loading users...";
  if (select) select.innerHTML = "";

  // fetch profiles (exclude current user)
  const { data: users, error } = await supabaseClient
    .from("profiles")
    .select("id, username, avatar_url")
    .neq("id", currentUser.id)
    .order("username", { ascending: true });

  if (error) {
    console.error(error);
    container.innerHTML = "Failed to load users.";
    return;
  }

  container.innerHTML = "";
  if (!users || users.length === 0) {
    container.innerHTML = "<div class='small'>No other registered users found.</div>";
    return;
  }

  users.forEach(u => {
    const btn = document.createElement("div");
    btn.className = "inline";
    btn.style.marginTop = "8px";
    btn.innerHTML = `<img src="${u.avatar_url || ''}" onerror="this.style.background='#ddd'; this.src='';" class="avatar" style="width:36px; height:36px;">
                     <div style="margin-left:8px;">${escapeHtml(u.username)}</div>`;
    btn.style.cursor = "default";
    container.appendChild(btn);

    if (select) {
      const opt = document.createElement("option");
      opt.value = u.id;
      opt.text = u.username;
      select.appendChild(opt);
    }
  });
}

// ----------------------------
// CALL UI (open call modal)
// ----------------------------
function openCallModal(type) {
  callType = type; // 'voice' or 'video'
  document.getElementById("callModalTitle").innerText = (type === "voice" ? "Start Voice Call" : "Start Video Call");
  document.getElementById("callModal").style.display = "flex";
}

function closeCallModal() {
  document.getElementById("callModal").style.display = "none";
  document.getElementById("localCallPreview").innerHTML = "";
}

// ----------------------------
// SIMPLE WEBRTC CALLS (signaling via Supabase Realtime channel)
// ----------------------------
// NOTE: For production you should probably use a dedicated signaling server and a TURN server.
// This is a simple P2P approach that uses Supabase's realtime channel for signaling messages.

function setupSignalingChannel() {
  // Create and subscribe to a shared channel for signaling
  callChannel = supabaseClient.channel('webrtc-signaling');

  callChannel.on('broadcast', { event: 'signal' }, (payload) => {
    const msg = payload.payload;
    // message format: { to, from, type, data, call_type }
    if (!msg || !msg.to) return;
    if (msg.to !== currentUser.id) return; // message not for me

    // handle incoming signal
    handleSignalMessage(msg);
  });

  callChannel.subscribe()
    .then(() => console.log("Signaling channel subscribed"))
    .catch(err => console.error("channel subscribe error", err));
}

async function sendSignal(toUserId, type, data) {
  if (!callChannel) {
    console.warn("Signaling channel not ready.");
    return;
  }
  const payload = {
    to: toUserId,
    from: currentUser.id,
    type,
    data,
    call_type: callType || 'voice'
  };
  // broadcast event 'signal'
  await callChannel.send({
    type: 'broadcast',
    event: 'signal',
    payload
  });
}

// handle incoming signal messages
async function handleSignalMessage(msg) {
  const { from, type, data, call_type } = msg;
  console.log("Received signal", msg);

  // If this is an incoming offer, create RTCPeerConnection and answer
  if (type === 'offer') {
    // prepare incoming call UI
    const accept = confirm(`Incoming ${call_type} call from ${from}. Accept?`);
    if (!accept) {
      // send busy/decline
      await sendSignal(from, 'decline', { reason: 'user declined' });
      return;
    }

    // create peer connection if not existing
    await createPeerConnection(from, call_type, false);

    // set remote description and create answer
    await pc.setRemoteDescription(new RTCSessionDescription(data));
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);

    // send answer back
    await sendSignal(from, 'answer', pc.localDescription);
  }

  if (type === 'answer') {
    if (!pc) {
      console.warn("No peer connection for answer");
      return;
    }
    await pc.setRemoteDescription(new RTCSessionDescription(data));
  }

  if (type === 'ice-candidate') {
    if (!pc) return;
    try {
      await pc.addIceCandidate(data);
    } catch (e) {
      console.error("Failed addIceCandidate", e);
    }
  }

  if (type === 'decline') {
    alert(`User declined the call: ${data.reason || ''}`);
    cleanupCallUI();
  }
}

// create a peer connection and local media
async function createPeerConnection(targetUserId, call_type, isCaller = true) {
  // ICE servers - production should include TURN servers
  const config = {
    iceServers: [
      { urls: "stun:stun.l.google.com:19302" },
      { urls: "stun:stun1.l.google.com:19302" }
    ]
  };

  pc = new RTCPeerConnection(config);
  pc.onicecandidate = async (event) => {
    if (event.candidate) {
      await sendSignal(targetUserId, 'ice-candidate', event.candidate);
    }
  };

  const remoteVideo = document.getElementById("remoteVideo");
  pc.ontrack = (ev) => {
    // attach remote stream
    remoteVideo.srcObject = ev.streams[0];
  };

  // get local media
  try {
    const constraints = (call_type === 'video') ?
      { audio: true, video: { width: 640, height: 480 } } :
      { audio: true, video: false };

    const localStream = await navigator.mediaDevices.getUserMedia(constraints);

    // show local video only for video calls
    const localVideoEl = document.getElementById("localVideo");
    if (call_type === 'video') {
      localVideoEl.style.display = "block";
      localVideoEl.srcObject = localStream;
    } else {
      localVideoEl.style.display = "none";
    }

    // add tracks to connection
    localStream.getTracks().forEach(track => pc.addTrack(track, localStream));
  } catch (err) {
    console.error("getUserMedia error", err);
    alert("Could not access microphone/camera for the call.");
    return;
  }

  // update UI
  currentCall = { target: targetUserId, call_type };
  document.getElementById("callWithLabel").innerText = `In call with ${targetUserId}`;
  document.getElementById("liveCallArea").style.display = "block";

  return pc;
}

// Start call (from modal)
async function startCallFromModal() {
  const target = document.getElementById("callTargetSelect").value;
  if (!target) {
    alert("Select a user to call.");
    return;
  }
  closeCallModal();

  // create pc and local tracks
  await createPeerConnection(target, callType, true);

  // create offer
  const offer = await pc.createOffer();
  await pc.setLocalDescription(offer);

  // send offer via signaling
  await sendSignal(target, 'offer', pc.localDescription);
}

// end call
function endCall() {
  if (pc) {
    pc.getSenders().forEach(s => {
      try { s.track && s.track.stop(); } catch (e) {}
    });
    pc.close();
    pc = null;
  }
  cleanupCallUI();
  currentCall = null;
}

function cleanupCallUI() {
  document.getElementById("liveCallArea").style.display = "none";
  const remote = document.getElementById("remoteVideo"); remote.srcObject = null;
  const local = document.getElementById("localVideo"); local.srcObject = null; local.style.display = "none";
}

// ----------------------------
// Called when page unloads - cleanup
// ----------------------------
window.addEventListener('beforeunload', () => {
  if (pc) try { pc.close(); } catch (e) {}
  if (callChannel) callChannel.unsubscribe();
});

// ----------------------------
// Helper: simple delay
// ----------------------------
function wait(ms) {
  return new Promise(r => setTimeout(r, ms));
}
