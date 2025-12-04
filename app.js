// Initialize Supabase Client
const SUPABASE_URL = "https://eqkwtqutcazxvdllorzl.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVxa3d0cXV0Y2F6eHZkbGxvcnpsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQ3MzM0MTUsImV4cCI6MjA4MDMwOTQxNX0.al0gxBTCjQVBC0Xv_4kFhstdPYFZWJBnpViy0WMR4";

// Create Supabase client
const client = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// REGISTER FUNCTION - FIXED
async function registerUser(event) {
    event.preventDefault();
    
    // Get form values
    const email = document.getElementById("email").value.trim();
    const password = document.getElementById("password").value;
    const name = document.getElementById("name").value.trim();
    
    // Validation
    if (!email || !password || !name) {
        alert("❌ Please fill in all fields");
        return;
    }
    
    if (password.length < 6) {
        alert("❌ Password must be at least 6 characters");
        return;
    }
    
    // Show loading
    const submitBtn = event.target.querySelector('button[type="submit"]');
    const originalBtnText = submitBtn.textContent;
    submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Creating...';
    submitBtn.disabled = true;
    
    try {
        console.log("Attempting to register:", email);
        
        // Sign up with Supabase
        const { data, error } = await client.auth.signUp({
            email: email,
            password: password,
            options: {
                data: {
                    full_name: name,
                    avatar_url: `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=667eea&color=fff`
                }
            }
        });
        
        if (error) {
            console.error("Registration error:", error);
            
            // Specific error handling
            if (error.message.includes("already registered")) {
                alert("📧 This email is already registered. Please login instead.");
                setTimeout(() => window.location.href = "login.html", 1500);
            } else {
                alert(`❌ Registration failed: ${error.message}`);
            }
            
            // Reset button
            submitBtn.textContent = originalBtnText;
            submitBtn.disabled = false;
            return;
        }
        
        console.log("Registration success:", data);
        
        // Success message
        if (data.user) {
            // Check if email confirmation is required
            if (data.user.email_confirmed_at) {
                alert("✅ Account created successfully! You're now logged in.");
                window.location.href = "dashboard.html";
            } else {
                alert("✅ Account created! Please check your email to verify your account.");
                window.location.href = "login.html";
            }
        }
        
    } catch (error) {
        console.error("Unexpected error:", error);
        alert("❌ An unexpected error occurred. Please try again.");
        
        // Reset button
        submitBtn.textContent = originalBtnText;
        submitBtn.disabled = false;
    }
}

// LOGIN FUNCTION - FIXED
async function loginUser(event) {
    event.preventDefault();
    
    const email = document.getElementById("email").value.trim();
    const password = document.getElementById("password").value;
    
    // Validation
    if (!email || !password) {
        alert("❌ Please fill in all fields");
        return;
    }
    
    // Show loading
    const submitBtn = event.target.querySelector('button[type="submit"]');
    const originalBtnText = submitBtn.textContent;
    submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Logging in...';
    submitBtn.disabled = true;
    
    try {
        const { data, error } = await client.auth.signInWithPassword({
            email: email,
            password: password
        });
        
        if (error) {
            console.error("Login error:", error);
            
            if (error.message.includes("Invalid login credentials")) {
                alert("❌ Invalid email or password");
            } else if (error.message.includes("Email not confirmed")) {
                alert("📧 Please verify your email first. Check your inbox.");
            } else {
                alert(`❌ Login failed: ${error.message}`);
            }
            
            // Reset button
            submitBtn.textContent = originalBtnText;
            submitBtn.disabled = false;
            return;
        }
        
        if (data.session) {
            alert("✅ Login successful!");
            window.location.href = "dashboard.html";
        }
        
    } catch (error) {
        console.error("Unexpected error:", error);
        alert("❌ An unexpected error occurred");
        
        // Reset button
        submitBtn.textContent = originalBtnText;
        submitBtn.disabled = false;
    }
}

// CHECK USER STATUS (for dashboard)
async function checkUser() {
    try {
        const { data, error } = await client.auth.getUser();
        
        if (error || !data.user) {
            console.log("No user found, redirecting to login");
            window.location.href = "login.html";
            return null;
        }
        
        console.log("User found:", data.user.email);
        
        // Display username if element exists
        if (document.getElementById("username")) {
            const displayName = data.user.user_metadata?.full_name || 
                              data.user.email?.split('@')[0] || 
                              'User';
            document.getElementById("username").innerText = displayName;
        }
        
        return data.user;
        
    } catch (error) {
        console.error("Auth check error:", error);
        window.location.href = "login.html";
        return null;
    }
}

// LOGOUT FUNCTION
async function logout() {
    try {
        await client.auth.signOut();
        alert("👋 Logged out successfully!");
        window.location.href = "login.html";
    } catch (error) {
        console.error("Logout error:", error);
        window.location.href = "login.html";
    }
}
