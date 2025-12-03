<?php
session_start();
if(!isset($_SESSION['user'])) {
    header("Location: login.html");
    exit;
}
$user = $_SESSION['user'];
?>
<!DOCTYPE html>
<html>
<head>
<title>Dashboard</title>
</head>
<body>
  <h2>Welcome, <?php echo $user['name']; ?> 🎉</h2>
  <p>Thank you for being part of my graduation journey!</p>

  <button onclick="logout()">Logout</button>
</body>

<script>
function logout() {
    window.location.href = "logout.php";
}
</script>
</html>
