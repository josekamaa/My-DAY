// Initialize Supabase Client
const SUPABASE_URL = "https://iklvlffqzkzpbhjeighn.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_OkvtrXKzaUP8D_zmw3XYNA_jZLP65va";

// Create Supabase client - FIXED: Added null check and proper initialization
let client;

// Initialize Supabase client once it's loaded
function initializeSupabase() {
    if (typeof supabase !== 'undefined') {
        client = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
        console.log('Supabase client initialized');
        return true;
    }
    return false;
}

// Check if Supabase is loaded and initialize
if (typeof supabase !== 'undefined') {
    client = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
} else {
    // Wait for Supabase to load
    document.addEventListener('DOMContentLoaded', function() {
        if (typeof supabase !== 'undefined') {
            client = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
            console.log('Supabase client initialized on DOMContentLoaded');
        } else {
            console.error('Supabase library not loaded');
        }
    });
}

async function registerUser(event) {
    event.preventDefault();

    // Check if client is initialized
    if (!client) {
        console.error('Supabase client not initialized');
        alert('System error: Please refresh the page');
        return;
    }

    const name = document.getElementById("name").value;
    const email = document.getElementById("email").value;
    const password = document.getElementById("password").value;

    console.log('Attempting to register:', { name, email });

    try {
        // 1️⃣ Create auth account
        const { data: signUpData, error: signUpError } = await client.auth.signUp({
            email: email,
            password: password,
            options: { 
                data: { 
                    full_name: name 
                } 
            }
        });

        if (signUpError) {
            console.error('Signup error:', signUpError);
            alert("Registration error: " + signUpError.message);
            return;
        }

        console.log('Auth created:', signUpData);

        const userId = signUpData.user.id;

        // 2️⃣ Insert into users table (optional - only if you have a separate users table)
        try {
            const { error: insertError } = await client
                .from("users")
                .insert({
                    id: userId,
                    full_name: name,
                    email: email
                });

            if (insertError) {
                console.log('Note: User profile not created:', insertError.message);
                // Don't fail registration if profile creation fails
                // Auth account is already created
            }
        } catch (profileError) {
            console.log('Profile creation skipped:', profileError);
        }

        alert("Registration successful! You can now login.");
        window.location.href = "login.html";

    } catch (error) {
        console.error('Registration failed:', error);
        alert("Registration failed: " + error.message);
    }
}

// LOGIN FUNCTION
async function loginUser(event) {
    event.preventDefault();

    // Check if client is initialized
    if (!client) {
        alert('System error: Please refresh the page');
        return;
    }

    let email = document.getElementById("email").value;
    let password = document.getElementById("password").value;

    try {
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
    } catch (error) {
        console.error('Login error:', error);
        alert("Login failed: " + error.message);
    }
}

// CHECK LOGIN STATUS ON DASHBOARD
async function checkUser() {
    if (!client) {
        window.location.href = "login.html";
        return;
    }

    let session = localStorage.getItem("supabaseSession");

    if (!session) {
        window.location.href = "login.html";
        return;
    }

    try {
        const { data } = await client.auth.getUser();

        if (data.user) {
            document.getElementById("username").innerText =
                data.user.user_metadata.full_name || data.user.email;
        } else {
            window.location.href = "login.html";
        }
    } catch (error) {
        console.error('Check user error:', error);
        window.location.href = "login.html";
    }
}

// LOGOUT
async function logout() {
    if (!client) {
        window.location.href = "login.html";
        return;
    }

    try {
        await client.auth.signOut();
        localStorage.removeItem("supabaseSession");
        window.location.href = "login.html";
    } catch (error) {
        console.error('Logout error:', error);
        window.location.href = "login.html";
    }
}

// Make functions available globally
window.registerUser = registerUser;
window.loginUser = loginUser;
window.checkUser = checkUser;
window.logout = logout;
window.initializeSupabase = initializeSupabase;
