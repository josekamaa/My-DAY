// Initialize Supabase Client
const SUPABASE_URL = "https://eqkwtqutcazxvdllorzl.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVxa3d0cXV0Y2F6eHZkbGxvcnpsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQ3MzM0MTUsImV4cCI6MjA4MDMwOTQxNX0.al0gxBTCjQVBC-12Xv_4kFhstdPYFZWJBnpViy0WMR4";

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


// REGISTER FUNCTION - Just creates account, doesn't auto-login
async function registerUser(event) {
    event.preventDefault();

    let email = document.getElementById("email").value;
    let password = document.getElementById("password").value;
    let name = document.getElementById("name").value;

    try {
        // Show loading state
        const submitBtn = event.target.querySelector('button[type="submit"]');
        const originalText = submitBtn.innerHTML;
        submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Creating Account...';
        submitBtn.disabled = true;

        // 1. Sign up the user
        const { data, error } = await client.auth.signUp({
            email: email,
            password: password,
            options: {
                data: {
                    full_name: name,
                    avatar_url: `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=667eea&color=fff`
                }
                // Note: emailRedirectTo is removed since we're not auto-confirming
            }
        });

        if (error) {
            throw error;
        }

        if (data.user) {
            // Show success message with options
            alert(`✅ Account created successfully!\n\nPlease check your email to verify your account.\n\nOnce verified, you can login with your credentials.`);
            
            // Clear form
            document.getElementById("email").value = '';
            document.getElementById("password").value = '';
            document.getElementById("name").value = '';
            
            // Redirect to login page after a delay
            setTimeout(() => {
                window.location.href = "login.html";
            }, 2000);
        }
    } catch (error) {
        console.error('Registration error:', error);
        
        // Check specific error types
        if (error.message.includes('already registered')) {
            alert('❌ This email is already registered. Please login instead.');
            setTimeout(() => {
                window.location.href = "login.html";
            }, 1500);
        } else {
            alert(`❌ Registration failed: ${error.message}`);
        }
        
        // Reset button
        const submitBtn = event.target.querySelector('button[type="submit"]');
        submitBtn.innerHTML = originalText;
        submitBtn.disabled = false;
    }
}


// LOGIN FUNCTION - Separate login flow
async function loginUser(event) {
    event.preventDefault();

    let email = document.getElementById("email").value;
    let password = document.getElementById("password").value;

    try {
        // Show loading state
        const submitBtn = event.target.querySelector('button[type="submit"]');
        const originalText = submitBtn.innerHTML;
        submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Logging in...';
        submitBtn.disabled = true;

        const { data, error } = await client.auth.signInWithPassword({
            email: email,
            password: password,
        });

        if (error) {
            throw error;
        }

        if (data.session) {
            // Success! Redirect to dashboard
            alert('✅ Login successful!');
            window.location.href = "dashboard.html";
        }
    } catch (error) {
        console.error('Login error:', error);
        
        // Specific error messages
        let errorMessage = error.message;
        if (error.message.includes('Invalid login credentials')) {
            errorMessage = 'Invalid email or password. Please try again.';
        } else if (error.message.includes('Email not confirmed')) {
            errorMessage = 'Please verify your email address before logging in. Check your inbox.';
        }
        
        alert(`❌ Login failed: ${errorMessage}`);
        
        // Reset button
        const submitBtn = event.target.querySelector('button[type="submit"]');
        submitBtn.innerHTML = originalText;
        submitBtn.disabled = false;
    }
}


// CHECK LOGIN STATUS ON DASHBOARD
async function checkUser() {
    try {
        const { data, error } = await client.auth.getUser();
        
        if (error || !data.user) {
            // Check session as fallback
            const { data: sessionData } = await client.auth.getSession();
            
            if (!sessionData.session) {
                // No valid session, redirect to login
                window.location.href = "login.html";
                return null;
            }
        }

        // User is authenticated
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
        alert('👋 Logged out successfully!');
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


// Reset password function (if needed)
async function resetPassword(email) {
    try {
        const { error } = await client.auth.resetPasswordForEmail(email, {
            redirectTo: `${window.location.origin}/reset-password.html`,
        });
        
        if (error) throw error;
        
        alert('📧 Password reset email sent! Check your inbox.');
        return true;
    } catch (error) {
        console.error('Reset password error:', error);
        alert(`❌ Failed to send reset email: ${error.message}`);
        return false;
    }
}
