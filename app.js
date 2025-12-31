// Initialize Supabase Client
const SUPABASE_URL = "https://iklvlffqzkzpbhjeighn.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_OkvtrXKzaUP8D_zmw3XYNA_jZLP65va";

// Correct: create 'client' so no conflict
const client = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);


async function registerUser(event) {
    event.preventDefault();

    const name = document.getElementById("name").value;
    const email = document.getElementById("email").value;
    const password = document.getElementById("password").value;

    // 1️⃣ Create auth account
    const { data: signUpData, error: signUpError } = await client.auth.signUp({
        email: email,
        password: password,
        options: { data: { full_name: name } }
    });

    if (signUpError) {
        alert(signUpError.message);
        return;
    }

    const userId = signUpData.user.id;

    // 2️⃣ Ensure session exists
    await client.auth.getSession();

    // 3️⃣ Insert into users table
    const { error: insertError } = await client
        .from("users")
        .insert({
            id: userId,
            full_name: name,
            email: email
        });

    if (insertError) {
        console.log(insertError);
        alert("Insert failed: " + insertError.message);
        return;
    }

    alert("Registration successful!");
    window.location.href = "login.html";
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
