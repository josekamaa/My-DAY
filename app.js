// ------------------------
// SUPABASE CONFIG
// ------------------------
const SUPABASE_URL = "https://eqkwtqutcazxvdllorzl.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVxa3d0cXV0Y2F6eHZkbGxvcnpsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQ3MzM0MTUsImV4cCI6MjA4MDMwOTQxNX0.al0gxBTCjQVBC-12Xv_4kFhstdPYFZWJBnpViy0WMR4";

const client = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);


// ------------------------
// REGISTER USER
// ------------------------
async function registerUser(event) {
    event.preventDefault();

    let name = document.getElementById("name").value;
    let email = document.getElementById("email").value;
    let password = document.getElementById("password").value;

    // 1️⃣ Create Auth User
    const { data: authData, error: authError } = await client.auth.signUp({
        email,
        password,
        options: {
            data: { full_name: name }
        }
    });

    if (authError) {
        alert(authError.message);
        return;
    }

    let userId = authData.user.id;

    // 2️⃣ Insert into "users" table
    const { error: insertError } = await client
        .from("users")
        .insert({
            id: userId,
            full_name: name,
            email: email
        });

    if (insertError) {
        alert("User created but failed to save to database.");
        console.log(insertError);
        return;
    }

    alert("Registration successful! Check your email to verify.");
    window.location.href = "login.html";
}
