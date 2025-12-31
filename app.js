// Initialize Supabase Client
const SUPABASE_URL = "https://iklvlffqzkzpbhjeighn.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_OkvtrXKzaUP8D_zmw3XYNA_jZLP65va";

// Create Supabase client
const client = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// REGISTER FUNCTION - Fixed with proper error handling
async function registerUser(event) {
    event.preventDefault();

    const name = document.getElementById("name").value;
    const email = document.getElementById("email").value;
    const password = document.getElementById("password").value;

    // Show loading state
    const submitBtn = document.querySelector('button[type="submit"]');
    const originalText = submitBtn.textContent;
    submitBtn.textContent = "Creating account...";
    submitBtn.disabled = true;

    try {
        // 1️⃣ Create auth account
        const { data: signUpData, error: signUpError } = await client.auth.signUp({
            email: email,
            password: password,
            options: { 
                data: { full_name: name }
            }
        });

        if (signUpError) {
            throw new Error(signUpError.message);
        }

        const userId = signUpData.user.id;
        console.log("User created in auth with ID:", userId);

        // 2️⃣ Insert into users table - Use upsert to handle duplicates gracefully
        const { error: insertError } = await client
            .from("users")
            .upsert({
                id: userId,
                full_name: name,
                email: email,
                created_at: new Date().toISOString()
            }, {
                onConflict: 'id',
                ignoreDuplicates: false
            });

        if (insertError) {
            console.log("Insert error details:", insertError);
            
            // If it's a duplicate, the user already exists - still success
            if (insertError.code === '23505') {
                console.log("User already exists in public.users table, but auth was created successfully");
                // Continue to success message
            } else {
                throw new Error("Failed to create user profile: " + insertError.message);
            }
        }

        alert("Registration successful! You can now login.");
        window.location.href = "login.html";
        
    } catch (error) {
        console.error("Registration error:", error);
        alert("Registration error: " + error.message);
        
        // Reset button
        submitBtn.textContent = originalText;
        submitBtn.disabled = false;
    }
}

// LOGIN FUNCTION
async function loginUser(event) {
    event.preventDefault();

    let email = document.getElementById("email").value;
    let password = document.getElementById("password").value;

    // Show loading state
    const submitBtn = document.querySelector('button[type="submit"]');
    const originalText = submitBtn.textContent;
    submitBtn.textContent = "Logging in...";
    submitBtn.disabled = true;

    const { data, error } = await client.auth.signInWithPassword({
        email: email,
        password: password,
    });

    if (error) {
        alert(error.message);
        submitBtn.textContent = originalText;
        submitBtn.disabled = false;
    } else {
        // Store session
        localStorage.setItem("supabaseSession", JSON.stringify(data.session));
        localStorage.setItem("userEmail", email);
        
        // Ensure user exists in public.users table
        await syncUserProfile(data.user);
        
        window.location.href = "dashboard.html";
    }
}

// Sync user profile to public.users table if missing
async function syncUserProfile(user) {
    try {
        // Check if user exists in public.users
        const { data: existingUser, error: checkError } = await client
            .from("users")
            .select("id")
            .eq("id", user.id)
            .single();

        // If user doesn't exist in public.users, create it
        if (checkError || !existingUser) {
            const { error: insertError } = await client
                .from("users")
                .upsert({
                    id: user.id,
                    full_name: user.user_metadata?.full_name || user.email?.split('@')[0],
                    email: user.email,
                    updated_at: new Date().toISOString()
                }, {
                    onConflict: 'id'
                });

            if (insertError) {
                console.error("Failed to sync user profile:", insertError);
            }
        }
    } catch (error) {
        console.error("Error syncing user profile:", error);
    }
}

// CHECK LOGIN STATUS ON DASHBOARD
async function checkUser() {
    // Check localStorage first
    let session = localStorage.getItem("supabaseSession");
    
    if (!session) {
        window.location.href = "login.html";
        return;
    }

    // Verify session with Supabase
    const { data, error } = await client.auth.getUser();
    
    if (error || !data.user) {
        // Clear invalid session
        localStorage.removeItem("supabaseSession");
        localStorage.removeItem("userEmail");
        window.location.href = "login.html";
        return;
    }

    // Update UI with user info
    if (data.user) {
        const displayName = data.user.user_metadata?.full_name || 
                           localStorage.getItem("userEmail") || 
                           "User";
        document.getElementById("username").innerText = displayName;
    }
}

// LOGOUT
async function logout() {
    // Show loading
    const logoutBtn = document.querySelector('#logoutBtn') || document.querySelector('button[onclick="logout()"]');
    if (logoutBtn) {
        logoutBtn.textContent = "Logging out...";
        logoutBtn.disabled = true;
    }
    
    await client.auth.signOut();
    
    // Clear all localStorage
    localStorage.removeItem("supabaseSession");
    localStorage.removeItem("userEmail");
    
    // Redirect to login
    window.location.href = "login.html";
}

// Helper function to check if user is logged in
function isLoggedIn() {
    return !!localStorage.getItem("supabaseSession");
}

// Initialize auth state on page load
async function initAuth() {
    const { data } = await client.auth.getSession();
    if (data.session) {
        // Update localStorage if needed
        localStorage.setItem("supabaseSession", JSON.stringify(data.session));
    }
}
