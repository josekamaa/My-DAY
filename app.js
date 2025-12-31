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
        console.log("Starting registration for:", email);
        
        // 1️⃣ First, check if user already exists
        const { data: existingAuthUser, error: checkError } = await client.auth.signInWithPassword({
            email: email,
            password: password,
        }).catch(() => ({ data: null, error: { message: "User not found" } }));

        if (existingAuthUser?.user) {
            alert("This email is already registered. Please login instead.");
            window.location.href = "login.html";
            return;
        }

        // 2️⃣ Create auth account
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

        console.log("Auth user created:", signUpData.user?.id);

        // 3️⃣ Sign out immediately after registration to prevent auto-login
        await client.auth.signOut();
        
        // Clear any existing session
        localStorage.removeItem("supabaseSession");
        localStorage.removeItem("userEmail");

        // 4️⃣ Insert into users table - only if we have a user ID
        if (signUpData.user?.id) {
            try {
                const { error: insertError } = await client
                    .from("users")
                    .upsert({
                        id: signUpData.user.id,
                        full_name: name,
                        email: email,
                        created_at: new Date().toISOString()
                    }, {
                        onConflict: 'id',
                        ignoreDuplicates: false
                    });

                if (insertError) {
                    console.log("User profile insert error (non-critical):", insertError.message);
                    // Continue anyway - the user can sync profile on first login
                } else {
                    console.log("User profile created successfully");
                }
            } catch (profileError) {
                console.error("Profile creation error:", profileError);
                // Non-critical - continue
            }
        }

        alert("Registration successful! Please login with your new account.");
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

    try {
        const { data, error } = await client.auth.signInWithPassword({
            email: email,
            password: password,
        });

        if (error) {
            throw new Error(error.message);
        }

        // Store session
        localStorage.setItem("supabaseSession", JSON.stringify(data.session));
        localStorage.setItem("userEmail", email);
        localStorage.setItem("userName", data.user.user_metadata?.full_name || "");
        
        // Ensure user exists in public.users table
        await syncUserProfile(data.user);
        
        window.location.href = "dashboard.html";
        
    } catch (error) {
        alert(error.message);
        submitBtn.textContent = originalText;
        submitBtn.disabled = false;
    }
}

// Sync user profile to public.users table if missing
async function syncUserProfile(user) {
    try {
        console.log("Syncing profile for user:", user.id);
        
        // Check if user exists in public.users
        const { data: existingUser, error: checkError } = await client
            .from("users")
            .select("id")
            .eq("id", user.id)
            .single();

        // If user doesn't exist in public.users, create it
        if (checkError || !existingUser) {
            console.log("Creating missing profile for user:", user.id);
            
            const { error: insertError } = await client
                .from("users")
                .upsert({
                    id: user.id,
                    full_name: user.user_metadata?.full_name || user.email?.split('@')[0],
                    email: user.email,
                    created_at: new Date().toISOString()
                }, {
                    onConflict: 'id'
                });

            if (insertError) {
                console.error("Failed to sync user profile:", insertError);
            } else {
                console.log("Profile created successfully");
            }
        } else {
            console.log("Profile already exists");
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

    try {
        // Verify session with Supabase
        const { data, error } = await client.auth.getUser();
        
        if (error || !data.user) {
            // Clear invalid session
            localStorage.removeItem("supabaseSession");
            localStorage.removeItem("userEmail");
            localStorage.removeItem("userName");
            window.location.href = "login.html";
            return;
        }

        // Update UI with user info
        if (data.user) {
            const displayName = data.user.user_metadata?.full_name || 
                               localStorage.getItem("userName") ||
                               localStorage.getItem("userEmail") || 
                               "User";
            document.getElementById("username").innerText = displayName;
        }
    } catch (error) {
        console.error("Error checking user:", error);
        window.location.href = "login.html";
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
    
    try {
        await client.auth.signOut();
    } catch (error) {
        console.error("Logout error:", error);
    }
    
    // Clear all localStorage
    localStorage.removeItem("supabaseSession");
    localStorage.removeItem("userEmail");
    localStorage.removeItem("userName");
    
    // Redirect to login
    window.location.href = "login.html";
}

// Helper function to check if user is logged in
function isLoggedIn() {
    return !!localStorage.getItem("supabaseSession");
}

// Initialize auth state on page load
async function initAuth() {
    try {
        const { data } = await client.auth.getSession();
        if (data.session) {
            // Update localStorage if needed
            localStorage.setItem("supabaseSession", JSON.stringify(data.session));
        } else {
            // Clear if no valid session
            localStorage.removeItem("supabaseSession");
        }
    } catch (error) {
        console.error("Error initializing auth:", error);
    }
}

// Call init on load if not in register page
if (!window.location.pathname.includes('register.html')) {
    document.addEventListener('DOMContentLoaded', initAuth);
}
