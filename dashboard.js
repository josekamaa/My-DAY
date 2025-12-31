/* ================= SUPABASE ================= */
const SUPABASE_URL = "https://iklvlffqzkzpbhjeighn.supabase.co";
const SUPABASE_KEY = "sb_publishable_OkvtrXKzaUP8D_zmw3XYNA_jZLP65va";
const sb = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

/* ================= GLOBAL ================= */
let currentUser;
let currentProfile;
let activeConversationId = null;
let activeChatUser = null;
let messageChannel = null;

/* ================= INIT ================= */
document.addEventListener("DOMContentLoaded", async () => {
  await loadUser();
  await loadContacts();
});

/* ================= AUTH ================= */
async function loadUser() {
  const { data } = await sb.auth.getUser();
  if (!data.user) return location.href = "login.html";

  currentUser = data.user;

  const { data: profile } = await sb
    .from("profiles")
    .select("*")
    .eq("id", currentUser.id)
    .single();

  currentProfile = profile;
  updateAvatarEverywhere(profile.avatar_url, profile.username);
}

/* ================= AVATAR ================= */
function updateAvatarEverywhere(url, username) {
  const initial = username.charAt(0).toUpperCase();

  document.querySelectorAll(".avatar, .chat-avatar").forEach(el => {
    el.innerHTML = url
      ? `<img src="${url}">`
      : `<span class="avatar-initial">${initial}</span>`;
  });

  document.getElementById("headerInitial").textContent = initial;
}

/* ================= SIDEBAR ================= */
function toggleMobileSidebar() {
  document.getElementById("mobileSidebar").classList.add("active");
  document.getElementById("mobileOverlay").classList.add("active");
}

function closeMobileSidebar() {
  document.getElementById("mobileSidebar").classList.remove("active");
  document.getElementById("mobileOverlay").classList.remove("active");
}

/* ================= CONTACTS ================= */
async function loadContacts() {
  const { data: users } = await sb
    .from("profiles")
    .select("id, username, avatar_url")
    .neq("id", currentUser.id)
    .order("username");

  const list = document.getElementById("contactsList");
  list.innerHTML = "";

  users.forEach(user => {
    const div = document.createElement("div");
    div.className = "contact-item";
    div.innerHTML = `
      <div class="contact-avatar">
        ${user.avatar_url ? `<img src="${user.avatar_url}">` : `<span>${user.username[0]}</span>`}
      </div>
      <div>${user.username}</div>
    `;
    div.onclick = () => startChat(user);
    list.appendChild(div);
  });
}

/* ================= CHAT ================= */
async function startChat(user) {
  activeChatUser = user;

  document.getElementById("chatUsername").textContent = user.username;
  document.getElementById("chatAvatar").innerHTML =
    user.avatar_url ? `<img src="${user.avatar_url}">` : `<span>${user.username[0]}</span>`;

  openMessenger();

  // find or create conversation
  const { data: convo } = await sb.rpc("get_or_create_conversation", {
    user1: currentUser.id,
    user2: user.id
  });

  activeConversationId = convo;
  loadMessages();
  subscribeToMessages();
}

async function loadMessages() {
  const { data } = await sb
    .from("messages")
    .select("*")
    .eq("conversation_id", activeConversationId)
    .order("created_at");

  const box = document.getElementById("chatMessages");
  box.innerHTML = "";

  data.forEach(msg => {
    const div = document.createElement("div");
    div.className = msg.sender_id === currentUser.id ? "message sent" : "message received";
    div.textContent = msg.content;
    box.appendChild(div);
  });

  box.scrollTop = box.scrollHeight;
}

async function sendMessage() {
  const input = document.getElementById("chatInput");
  const text = input.value.trim();
  if (!text) return;

  await sb.from("messages").insert({
    conversation_id: activeConversationId,
    sender_id: currentUser.id,
    content: text
  });

  input.value = "";
}

/* ================= REALTIME ================= */
function subscribeToMessages() {
  if (messageChannel) sb.removeChannel(messageChannel);

  messageChannel = sb.channel("chat-" + activeConversationId)
    .on("postgres_changes", {
      event: "INSERT",
      schema: "public",
      table: "messages",
      filter: `conversation_id=eq.${activeConversationId}`
    }, loadMessages)
    .subscribe();
}

/* ================= MESSENGER UI ================= */
function openMessenger() {
  document.getElementById("messenger").classList.add("active");
}
function closeMessenger() {
  document.getElementById("messenger").classList.remove("active");
}
