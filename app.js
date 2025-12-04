// Initialize Supabase Client
const SUPABASE_URL = "https://eqkwtqutcazxvdllorzl.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVxa3d0cXV0Y2F6eHZkbGxvcnpsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQ3MzM0MTUsImV4cCI6MjA4MDMwOTQxNX0.al0gxBTCjQVBC0Xv_4kFhstdPYFZWJBnpViy0WMR4";

// Create Supabase client
const client = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Check for existing session on page load
(async function init() {
    const { data } = await client.auth.getSession();
    // If user is already logged in and on login/register page, redirect to dashboard
    if (data.session && (window.location.pathname.includes('login.html') || window.location.pathname.includes('register.html'))) {
        window.location.href = "dashboard.html";
    }
})();


// REGISTER FUNCTION
async function registerUser(event) {
    event.preventDefault();

    let email = document.getElementById("email").value;
    let password = document.getElementById("password").value;
    let name = document.getElementById("name").value;

    try {
        // Disable email confirmation in Supabase Dashboard first:
        // Go to Authentication → Settings → Disable "Enable email confirmations"
        
        const { data, error } = await client.auth.signUp({
            email: email,
            password: password,
            options: {
                data: {
                    full_name: name,
                    // Add profile picture placeholder
                    avatar_url: `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=667eea&color=fff`
                },
                // If you want to auto-confirm without email verification
                emailRedirectTo: window.location.origin
            }
        });

        if (error) {
            throw error;
        }

        if (data.user) {
            // Create a user profile in the public.users table (if it exists)
            try {
                const { error: profileError } = await client
                    .from('users') // Make sure this table exists in your Supabase
                    .insert({
                        id: data.user.id,
                        email: data.user.email,
                        full_name: name,
                        created_at: new Date().toISOString()
                    });

                if (profileError && !profileError.message.includes('duplicate key')) {
                    console.warn('Could not create user profile:', profileError);
                }
            } catch (profileErr) {
                console.warn('Profile creation failed:', profileErr);
            }

            // Auto login after registration (if email confirmation is disabled)
            const { data: loginData, error: loginError } = await client.auth.signInWithPassword({
                email: email,
                password: password
            });

            if (loginError) {
                throw loginError;
            }

            alert("Account created successfully! 🎉");
            window.location.href = "dashboard.html";
        }
    } catch (error) {
        console.error('Registration error:', error);
        alert(`Registration failed: ${error.message}`);
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
            throw error;
        }

        if (data.session) {
            // Update user profile last login time (if users table exists)
            try {
                await client
                    .from('users')
                    .update({ last_login: new Date().toISOString() })
                    .eq('id', data.user.id);
            } catch (profileErr) {
                console.warn('Could not update last login:', profileErr);
            }

            // Redirect to dashboard
            window.location.href = "dashboard.html";
        }
    } catch (error) {
        console.error('Login error:', error);
        alert(`Login failed: ${error.message}`);
    }
}


// CHECK LOGIN STATUS ON DASHBOARD
async function checkUser() {
    try {
        // First check current session
        const { data, error } = await client.auth.getUser();
        
        if (error || !data.user) {
            // Try to restore session from storage
            const { data: sessionData } = await client.auth.getSession();
            
            if (!sessionData.session) {
                window.location.href = "login.html";
                return null;
            }
        }

        // Display user info
        if (data.user) {
            const displayName = data.user.user_metadata?.full_name || 
                              data.user.email?.split('@')[0] || 
                              'User';
            
            if (document.getElementById("username")) {
                document.getElementById("username").innerText = displayName;
            }
            
            return data.user;
        }
    } catch (error) {
        console.error('Auth check error:', error);
        window.location.href = "login.html";
    }
    
    return null;
}


// LOGOUT
async function logout() {
    try {
        await client.auth.signOut();
        window.location.href = "login.html";
    } catch (error) {
        console.error('Logout error:', error);
        window.location.href = "login.html";
    }
}


// Get current user session
async function getCurrentUser() {
    const { data } = await client.auth.getUser();
    return data.user;
}
