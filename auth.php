<?php
$SUPABASE_URL = "https://eqkwtqutcazxvdllorzl.supabase.co";
$SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJ
zdXBhYmFzZSIsInJlZiI6ImVxa3d0cXV0Y2F6eHZkbGxvcnpsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQ3MzM0MTUsImV4cCI6MjA4MDMwOTQxNX0.al0gxBTCjQVBC-12Xv_4kFhstdPYFZWJBnpViy0WMR4";

$action = $_POST['action'];

if($action == "register") {
    registerUser();
} else if($action == "login") {
    loginUser();
}

function registerUser() {
    global $SUPABASE_URL, $SUPABASE_KEY;

    $data = [
        "name" => $_POST["name"],
        "email" => $_POST["email"],
        "password" => password_hash($_POST["password"], PASSWORD_BCRYPT)
    ];

    $payload = json_encode($data);

    $ch = curl_init("$SUPABASE_URL/rest/v1/users");
    curl_setopt($ch, CURLOPT_POST, true);
    curl_setopt($ch, CURLOPT_POSTFIELDS, $payload);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_HTTPHEADER, [
        "Content-Type: application/json",
        "apikey: $SUPABASE_KEY",
        "Authorization: Bearer $SUPABASE_KEY",
        "Prefer: return=representation"
    ]);

    $response = curl_exec($ch);
    $error = curl_error($ch);
    curl_close($ch);

    header("Location: login.html");
}

function loginUser() {
    global $SUPABASE_URL, $SUPABASE_KEY;

    $email = $_POST["email"];
    $password = $_POST["password"];

    $url = "$SUPABASE_URL/rest/v1/users?email=eq.$email";

    $ch = curl_init($url);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_HTTPHEADER, [
        "apikey: $SUPABASE_KEY",
        "Authorization: Bearer $SUPABASE_KEY"
    ]);

    $response = curl_exec($ch);
    $user = json_decode($response, true)[0] ?? null;

    if($user && password_verify($password, $user['password'])) {
        session_start();
        $_SESSION['user'] = $user;
        header("Location: dashboard.php");
    } else {
        echo "Invalid login";
    }
}
?>
