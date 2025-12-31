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

    try {
        // 1️⃣ Create auth account ONLY
        const { data: signUpData, error: signUpError } = await client.auth.signUp({
            email: email,
            password: password,
            options: { 
                data: { full_name: name }
            }
        });

        if (signUpError) {
            // Handle specific error cases
            if (signUpError.message.includes("already registered")) {
                alert("This email is already registered. Please login instead.");
                window.location.href = "login.html";
                return;
            }
            alert("Registration error: " + signUpError.message);
            return;
        }

        if (!signUpData.user) {
            alert("Registration failed. Please try again.");
            return;
        }

        // 2️⃣ DO NOT manually insert into users table
        // The user is either already inserted automatically by Supabase triggers
        // OR will be inserted via database functions
        
        // 3️⃣ Show success message
        alert("Registration successful! You can now login.");
        window.location.href = "login.html";
        
    } catch (error) {
        console.error("Registration error:", error);
        alert("An unexpected error occurred. Please try again.");
    }
}


// LOGIN FUNCTION
async function loginUser(event) {
    event.preventDefault();

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
            // Store session
            localStorage.setItem("supabaseSession", JSON.stringify(data.session));
            
            // Check if user exists in public.users table, create if not
            await ensureUserProfile(data.user);
            
            window.location.href = "dashboard.html";
        }
    } catch (error) {
        console.error("Login error:", error);
        alert("Login failed. Please try again.");
    }
}

// Helper function to ensure user profile exists
async function ensureUserProfile(user) {
    try {
        // Check if user exists in public.users table
        const { data: existingUser, error: checkError } = await client
            .from("users")
            .select("id")
            .eq("id", user.id)
            .maybeSingle();

        if (checkError) {
            console.error("Error checking user profile:", checkError);
            return;
        }

        // If user doesn't exist in public.users table, create it
        if (!existingUser) {
            const { error: insertError } = await client
                .from("users")
                .insert({
                    id: user.id,
                    full_name: user.user_metadata.full_name || user.email.split('@')[0],
                    email: user.email,
                    created_at: new Date().toISOString()
                });

            if (insertError && !insertError.message.includes("duplicate key")) {
                console.error("Error creating user profile:", insertError);
            }
        }
    } catch (error) {
        console.error("Error in ensureUserProfile:", error);
    }
}


// CHECK LOGIN STATUS ON DASHBOARD
async function checkUser() {
    try {
        // First check localStorage
        let session = localStorage.getItem("supabaseSession");
        
        if (!session) {
            window.location.href = "login.html";
            return;
        }

        // Check with Supabase
        const { data, error } = await client.auth.getUser();

        if (error || !data.user) {
            localStorage.removeItem("supabaseSession");
            window.location.href = "login.html";
            return;
        }

        // Update UI with user info
        document.getElementById("username").innerText = 
            data.user.user_metadata.full_name || data.user.email;
            
    } catch (error) {
        console.error("Error checking user:", error);
        window.location.href = "login.html";
    }
}


// LOGOUT
async function logout() {
    try {
        await client.auth.signOut();
        localStorage.removeItem("supabaseSession");
        window.location.href = "login.html";
    } catch (error) {
        console.error("Logout error:", error);
        window.location.href = "login.html";
    }
}
