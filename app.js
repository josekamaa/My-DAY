// Initialize Supabase Client
const SUPABASE_URL = "https://eqkwtqutcazxvdllorzl.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVxa3d0cXV0Y2F6eHZkbGxvcnpsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQ3MzM0MTUsImV4cCI6MjA4MDMwOTQxNX0.al0gxBTCjQVBC-12Xv_4kFhstdPYFZWJBnpViy0WMR4";

// Correct: create 'client' so no conflict
const client = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);


// REGISTER FUNCTION
async function registerUser(event) {
    event.preventDefault();

    let email = document.getElementById("email").value;
    let password = document.getElementById("password").value;
    let name = document.getElementById("name").value;

    const { data, error } = await client.auth.signUp({
        email: email,
        password: password,
        options: {
            data: { full_name: name }
        }
    });

    if (error) {
        alert(error.message);
    } else {
        alert("Account created! Please check your email to verify.");
        window.location.href = "login.html";
    }
}


// LOGIN FUNCTION
async function loginUser(event) {
    event.preventDefault();

    let email = document.getElementById("email").value;
    let password = document.getElementById("password").value;

    const { data, error } = await client.auth.signInWithPassword({
        email: email,
        password: password,
    });

    if (error) {
        alert(error.message);
    } else {
        localStorage.setItem("supabaseSession", JSON.stringify(data.session));
        window.location.href = "dashboard.html";
    }
}


// CHECK LOGIN STATUS ON DASHBOARD
async function checkUser() {
    let session = localStorage.getItem("supabaseSession");

    if (!session) {
        window.location.href = "login.html";
        return;
    }

    const { data } = await client.auth.getUser();

    if (data.user) {
        document.getElementById("username").innerText =
            data.user.user_metadata.full_name;
    } else {
        window.location.href = "login.html";
    }
}


// LOGOUT
async function logout() {
    await client.auth.signOut();
    localStorage.removeItem("supabaseSession");
    window.location.href = "login.html";
}
