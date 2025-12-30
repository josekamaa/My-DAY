const sb = supabase.createClient(
  "https://ojjvkhafgurgondsopeh.supabase.co",
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9qanZraGFmZ3VyZ29uZHNvcGVoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQ5MDkzODYsImV4cCI6MjA4MDQ4NTM4Nn0.hOLxBVqnFhJ2S1jjR0mkKUJ_bWDjZbHJD3wV0Rbbf7A"
);

let currentUser;
let activeConversation;

/* ================= INIT ================= */
(async function init() {
  const { data } = await sb.auth.getUser();
  if (!data.user) location.href = "login.html";
  currentUser = data.user;

  await loadContacts();
  await loadConversations();
})();

/* ================= CONTACTS ================= */
async function loadContacts() {
  const { data } = await sb
    .from("profiles")
    .select("id, username")
    .neq("id", currentUser.id);

  contacts.innerHTML = "";
  data.forEach(u => {
    contacts.innerHTML += `
      <div class="user" onclick="startConversation('${u.id}', '${u.username}')">
        ${u.username}
      </div>`;
  });
}

/* ================= CONVERSATIONS ================= */
async function loadConversations() {
  const { data } = await sb
    .from("conversations")
    .select("*")
    .or(`user_one.eq.${currentUser.id},user_two.eq.${currentUser.id}`);

  conversations.innerHTML = "";
  data.forEach(c => {
    const other = c.user_one === currentUser.id ? c.user_two : c.user_one;
    conversations.innerHTML += `
      <div class="user" onclick="openConversation(${c.id})">
        Chat ${other.slice(0,8)}
      </div>`;
  });
}

/* ================= START / OPEN ================= */
async function startConversation(userId, username) {
  const u1 = currentUser.id < userId ? currentUser.id : userId;
  const u2 = currentUser.id < userId ? userId : currentUser.id;

  let { data } = await sb
    .from("conversations")
    .select("*")
    .eq("user_one", u1)
    .eq("user_two", u2)
    .maybeSingle();

  if (!data) {
    const res = await sb.from("conversations").insert({
      user_one: u1,
      user_two: u2
    }).select().single();
    data = res.data;
  }

  openConversation(data.id, username);
  loadConversations();
}

async function openConversation(id, title="Chat") {
  activeConversation = id;
  chatBox.style.display = "block";
  chatTitle.textContent = title;

  const { data } = await sb
    .from("messages")
    .select("*")
    .eq("conversation_id", id)
    .order("created_at");

  chatMessages.innerHTML = "";
  data.forEach(m => {
    chatMessages.innerHTML += `
      <div class="msg ${m.sender_id === currentUser.id ? "me" : ""}">
        ${m.content || ""}
        ${m.image_url ? `<br><img src="${m.image_url}">` : ""}
      </div>`;
  });

  chatMessages.scrollTop = chatMessages.scrollHeight;
}

/* ================= SEND MESSAGE ================= */
async function sendMessage() {
  if (!activeConversation) return;

  let imageUrl = null;
  const file = chatImage.files[0];

  if (file) {
    const path = `${currentUser.id}/${Date.now()}_${file.name}`;
    await sb.storage.from("messages").upload(path, file);
    imageUrl = sb.storage.from("messages").getPublicUrl(path).data.publicUrl;
  }

  if (!chatText.value && !imageUrl) return;

  await sb.from("messages").insert({
    conversation_id: activeConversation,
    sender_id: currentUser.id,
    content: chatText.value,
    image_url: imageUrl
  });

  chatText.value = "";
  chatImage.value = "";
  openConversation(activeConversation);
      }
