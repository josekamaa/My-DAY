// --- Supabase Setup (same as app.js) ---
const SUPABASE_URL = "https://eqkwtqutcazxvdllorzl.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVxa3d0cXV0Y2F6eHZkbGxvcnpsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQ3MzM0MTUsImV4cCI6MjA4MDMwOTQxNX0.al0gxBTCjQVBC-12Xv_4kFhstdPYFZWJBnpViy0WMR4";

const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// --- Load users on dashboard ---
async function loadUsers() {
    const usersUl = document.getElementById("usersUl");

    const { data, error } = await supabaseClient
        .from("users")
        .select("*");

    if (error) {
        console.error("Error fetching users:", error);
        usersUl.innerHTML = "<li>Error loading users.</li>";
        return;
    }

    usersUl.innerHTML = ""; // clear previous

    data.forEach(user => {
        const li = document.createElement("li");
        li.textContent = `${user.fullname} — ${user.email}`;
        usersUl.appendChild(li);
    });
}

// --- Logout ---
document.getElementById("logoutBtn").onclick = async () => {
    await supabaseClient.auth.signOut();
    window.location.href = "index.html";
};

// Load users when page starts
loadUsers();
