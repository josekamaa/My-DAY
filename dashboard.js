
/* ================= CORE ================= */

const SUPABASE_URL = "https://ojjvkhafgurgondsopeh.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9qanZraGFmZ3VyZ29uZHNvcGVoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQ5MDkzODYsImV4cCI6MjA4MDQ4NTM4Nn0.hOLxBVqnFhJ2S1jjR0mkKUJ_bWDjZbHJD3wV0Rbbf7A";
const sb = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

const State = {
  user: null,
  likes: new Set(),
  postCache: new Map()
};

const el = id => document.getElementById(id);

function timeAgo(ts) {
  const s = Math.floor((Date.now() - new Date(ts)) / 1000);
  if (s < 60) return "Just now";
  if (s < 3600) return `${Math.floor(s/60)}m`;
  if (s < 86400) return `${Math.floor(s/3600)}h`;
  return new Date(ts).toLocaleDateString();
}

/* ================= AUTH ================= */

(async function init(){
  const { data } = await sb.auth.getUser();
  if (!data?.user) return location.href="login.html";
  State.user = data.user;
  Profile.load();
  Feed.load();
})();

/* ================= PROFILE ================= */

const Profile = {
  async load(){
    const { data } = await sb.from("profiles").select("*").eq("id",State.user.id).single();
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
    if (!/^[a-z0-9_]{3,15}$/.test(username)) return alert("Invalid username");

    const { data } = await sb.from("profiles").select("id").eq("username",username).maybeSingle();
    if (data) return alert("Username taken");

    await sb.from("profiles").update({ username }).eq("id",State.user.id);
    this.closeUsernameEditor();
    this.load();
    Feed.load();
  }
};

/* ================= FEED ================= */

const Feed = {
  async load(){
    const { data } = await sb
      .from("posts")
      .select(`*, profiles(username,avatar_url)`)
      .order("created_at",{ascending:false});

    el("posts").innerHTML="";
    data.forEach(p=>{
      State.postCache.set(p.id,p);
      this.render(p);
    });
  },

  render(post){
    const div = document.createElement("div");
    div.className="post";

    const avatar = post.profiles.avatar_url
      ? `<img src="${post.profiles.avatar_url}">`
      : `<span>${post.profiles.username[0]}</span>`;

    div.innerHTML=`
      <div class="post-header">
        <div class="avatar">${avatar}</div>
        <div>
          <strong>${post.profiles.username}</strong>
          <div class="muted">${timeAgo(post.created_at)}</div>
        </div>
      </div>
      <div class="post-content">
        <p>${post.caption||""}</p>
        ${post.media_url ? `<img src="${post.media_url}">`:""}
      </div>
      <div class="actions">
        <button onclick="Feed.like(${post.id})">❤️ ${post.likes}</button>
      </div>
    `;
    el("posts").appendChild(div);
  },

  async like(id){
    if (State.likes.has(id)) return;
    State.likes.add(id);
    const post = State.postCache.get(id);
    post.likes++;
    await sb.from("post_likes").insert({ post_id:id,user_id:State.user.id });
    await sb.from("posts").update({likes:post.likes}).eq("id",id);
    this.load();
  },

  async createPost(){
    const caption = el("caption").value;
    await sb.from("posts").insert({
      user_id:State.user.id,
      user_name:State.user.email.split("@")[0],
      caption,
      likes:0
    });
    UI.togglePostModal();
    this.load();
  }
};

/* ================= UI ================= */

const UI = {
  togglePostModal(){
    el("postModal").classList.toggle("active");
  },
  openMessenger(){
    alert("Messenger next phase");
  }
};
