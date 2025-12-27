/* ================= CORE ================= */

const SUPABASE_URL = "https://ojjvkhafgurgondsopeh.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9qanZraGFmZ3VyZ29uZHNvcGVoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQ5MDkzODYsImV4cCI6MjA4MDQ4NTM4Nn0.hOLxBVqnFhJ2S1jjR0mkKUJ_bWDjZbHJD3wV0Rbbf7A";
const sb = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

const State = {
  user: null,
  likes: new Set(),
  postCache: new Map(),
  activeChatUser: null,
  msgSub: null
};

const el = id => document.getElementById(id);

function timeAgo(ts) {
  const s = Math.floor((Date.now() - new Date(ts)) / 1000);
  if (s < 60) return "Just now";
  if (s < 3600) return `${Math.floor(s/60)}m`;
  if (s < 86400) return `${Math.floor(s/3600)}h`;
  if (s < 172800) return "Yesterday";
  return new Date(ts).toLocaleDateString();
}

/* ================= INIT ================= */

(async function init(){
  const { data } = await sb.auth.getUser();
  if (!data?.user) return location.href="login.html";
  State.user = data.user;

  await ensureProfile();
  await Profile.load();
  await Feed.loadLikes();
  await Feed.load();
})();

async function ensureProfile() {
  const { data } = await sb.from("profiles")
    .select("id")
    .eq("id", State.user.id)
    .maybeSingle();

  if (!data) {
    const username = State.user.email.split("@")[0];
    await sb.from("profiles").insert({ id: State.user.id, username });
  }
}

/* ================= PROFILE ================= */

const Profile = {
  async load(){
    const { data } = await sb.from("profiles")
      .select("*")
      .eq("id",State.user.id)
      .single();

    el("profileUsername").textContent = data.username;
    el("avatarInitial").textContent = data.username[0].toUpperCase();

    if (data.avatar_url) {
      el("profileAvatar").innerHTML = `<img src="${data.avatar_url}">`;
    }
  },

  openUsernameEditor(){
    el("usernameModal").classList.add("active");
  },

  closeUsernameEditor(){
    el("usernameModal").classList.remove("active");
  },

  async updateUsername(){
    const username = el("newUsername").value.trim().toLowerCase();
    if (!/^[a-z0-9_]{3,15}$/.test(username)) {
      return alert("Invalid username");
    }

    const { data } = await sb
      .from("profiles")
      .select("id")
      .eq("username", username)
      .maybeSingle();

    if (data) return alert("Username already taken");

    await sb.from("profiles")
      .update({ username })
      .eq("id", State.user.id);

    this.closeUsernameEditor();
    await this.load();
    await Feed.load();
  }
};

/* ================= FEED ================= */

const Feed = {
  async loadLikes(){
    const { data } = await sb
      .from("post_likes")
      .select("post_id")
      .eq("user_id", State.user.id);

    State.likes = new Set(data?.map(x => x.post_id) || []);
  },

  async load(){
    const { data } = await sb
      .from("posts")
      .select(`*, profiles(username, avatar_url)`)
      .order("created_at", { ascending:false });

    el("posts").innerHTML = "";
    State.postCache.clear();

    data.forEach(post => {
      State.postCache.set(post.id, post);
      this.render(post);
    });
  },

  render(post){
    const div = document.createElement("div");
    div.className = "post";

    const avatar = post.profiles?.avatar_url
      ? `<img src="${post.profiles.avatar_url}">`
      : `<span>${post.profiles.username[0]}</span>`;

    const liked = State.likes.has(post.id);

    div.innerHTML = `
      <div class="post-header">
        <div class="avatar">${avatar}</div>
        <div>
          <strong>${post.profiles.username}</strong>
          <div class="muted">${timeAgo(post.created_at)}</div>
        </div>
      </div>

      <div class="post-content">
        <p>${post.caption || ""}</p>
        ${post.media_url ? (
          post.media_type === "video"
            ? `<video src="${post.media_url}" controls></video>`
            : `<img src="${post.media_url}">`
        ) : ""}
      </div>

      <div class="actions">
        <button onclick="Feed.like(${post.id})">
          ${liked ? "❤️" : "🤍"} ${post.likes}
        </button>
      </div>
    `;

    el("posts").appendChild(div);
  },

  async like(id){
    if (State.likes.has(id)) return;

    State.likes.add(id);
    const post = State.postCache.get(id);
    post.likes++;

    await sb.from("post_likes").insert({
      post_id: id,
      user_id: State.user.id
    });

    await sb.from("posts")
      .update({ likes: post.likes })
      .eq("id", id);

    this.load();
  },

  async createPost(){
    const caption = el("caption").value.trim();
    const file = el("mediaFile").files[0];

    if (!caption && !file) return alert("Post is empty");

    let media_url = null;
    let media_type = null;

    if (file) {
      const path = `${Date.now()}_${file.name}`;
      const { data } = await sb.storage
        .from("posts")
        .upload(path, file);

      media_url = `${SUPABASE_URL}/storage/v1/object/public/posts/${data.path}`;
      media_type = file.type.startsWith("video") ? "video" : "image";
    }

    await sb.from("posts").insert({
      user_id: State.user.id,
      user_name: State.user.email.split("@")[0],
      caption,
      media_url,
      media_type,
      likes: 0
    });

    el("caption").value = "";
    el("mediaFile").value = "";
    UI.togglePostModal();
    this.load();
  }
};

/* ================= MESSENGER ================= */

const Messenger = {
  open(){
    el("messenger").style.display = "flex";
    this.loadUsers();
    this.subscribe();
  },

  close(){
    el("messenger").style.display = "none";
    State.activeChatUser = null;
    if (State.msgSub) {
      State.msgSub.unsubscribe();
      State.msgSub = null;
    }
  },

  async loadUsers(){
    const { data } = await sb
      .from("profiles")
      .select("*")
      .neq("id", State.user.id);

    const list = el("userList");
    list.innerHTML = "";

    data.forEach(u => {
      const div = document.createElement("div");
      div.textContent = u.username;
      div.onclick = () => this.openChat(u);
      list.appendChild(div);
    });
  },

  async openChat(user){
    State.activeChatUser = user;
    el("messagesList").innerHTML = "";

    const { data } = await sb
      .from("messages")
      .select("*")
      .or(
        `and(sender_id.eq.${State.user.id},receiver_id.eq.${user.id}),
         and(sender_id.eq.${user.id},receiver_id.eq.${State.user.id})`
      )
      .order("created_at");

    data.forEach(this.renderMessage);
  },

  renderMessage(msg){
    const div = document.createElement("div");
    div.className = "msg" + (msg.sender_id === State.user.id ? " me" : "");
    div.innerHTML = `
      <div>${msg.message}</div>
      <div class="muted">${timeAgo(msg.created_at)}</div>
    `;
    el("messagesList").appendChild(div);
  },

  async send(){
    const input = el("messageInput");
    if (!input.value || !State.activeChatUser) return;

    await sb.from("messages").insert({
      sender_id: State.user.id,
      receiver_id: State.activeChatUser.id,
      message: input.value
    });

    input.value = "";
  },

  subscribe(){
    if (State.msgSub) return;

    State.msgSub = sb.channel("messages")
      .on("postgres_changes",
        { event:"INSERT", schema:"public", table:"messages" },
        payload => {
          const msg = payload.new;
          if (
            State.activeChatUser &&
            ((msg.sender_id === State.user.id &&
              msg.receiver_id === State.activeChatUser.id) ||
             (msg.sender_id === State.activeChatUser.id &&
              msg.receiver_id === State.user.id))
          ) {
            this.renderMessage(msg);
          }
        })
      .subscribe();
  }
};

/* ================= UI ================= */

const UI = {
  togglePostModal(){
    el("postModal").classList.toggle("active");
  },
  openMessenger(){
    Messenger.open();
  }
};
