const API_BASE = "http://127.0.0.1:5000/api";

// ================= PAGE SWITCH =================
function showPage(pageId) {
    document.querySelectorAll('.form-page').forEach(p => {
        p.classList.remove('active');
    });

    const page = document.getElementById(pageId);
    if (page) page.classList.add('active');
}

// ================= PASSWORD TOGGLE =================
function togglePass(id, btn) {
    const input = document.getElementById(id);
    if (input.type === "password") {
        input.type = "text";
    } else {
        input.type = "password";
    }
}

// ================= CAPTCHA =================
const captchas = {
    login: '',
    signup: '',
    forgot: ''
};

function generateCaptcha(type) {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
    let code = '';

    for (let i = 0; i < 5; i++) {
        code += chars[Math.floor(Math.random() * chars.length)];
    }

    captchas[type] = code;
    document.getElementById(type + "CaptchaText").textContent = code;
}

// Initialize all captchas
generateCaptcha('login');
generateCaptcha('signup');
generateCaptcha('forgot');

// ================= HELPER =================
function showToast(msg) {
    alert(msg);
}

function isValidEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

// ================= LOGIN =================
document.getElementById("loginForm").addEventListener("submit", async (e) => {
    e.preventDefault();

    const email = document.getElementById("loginEmail").value.trim();
    const password = document.getElementById("loginPassword").value.trim();
    const captcha = document.getElementById("loginCaptchaInput").value.trim();

    if (!email || !password || captcha !== captchas.login) {
        showToast("Invalid login or captcha");
        generateCaptcha("login");
        return;
    }

    try {
        const res = await fetch(`${API_BASE}/auth/login`, {
            method: "POST",
            headers: {"Content-Type": "application/json"},
            body: JSON.stringify({ email, password })
        });

        const data = await res.json();

        if (!res.ok) throw new Error(data.message);

        showToast("Login successful");

        // SHOW DASHBOARD
        document.getElementById("authWrapper").style.display = "none";
        document.getElementById("dashboardWrapper").style.display = "block";

    } catch (err) {
        showToast(err.message || "Login failed");
    }

    generateCaptcha("login");
});

// ================= SIGNUP =================
document.getElementById("signupForm").addEventListener("submit", async (e) => {
    e.preventDefault();

    const full_name = document.getElementById("signupName").value.trim();
    const email = document.getElementById("signupEmail").value.trim();
    const password = document.getElementById("signupPassword").value.trim();
    const confirm = document.getElementById("signupConfirmPassword").value.trim();
    const captcha = document.getElementById("signupCaptchaInput").value.trim();

    if (!full_name || !email || password !== confirm || captcha !== captchas.signup) {
        showToast("Invalid signup data");
        generateCaptcha("signup");
        return;
    }

    try {
        const res = await fetch(`${API_BASE}/auth/signup`, {
            method: "POST",
            headers: {"Content-Type": "application/json"},
            body: JSON.stringify({ full_name, email, password })
        });

        const data = await res.json();

        if (!res.ok) throw new Error(data.message);

        showToast("Account created successfully");

        showPage("loginPage");

    } catch (err) {
        showToast(err.message || "Signup failed");
    }

    generateCaptcha("signup");
});

// ================= FORGOT PASSWORD =================
document.getElementById("forgotForm").addEventListener("submit", async (e) => {
    e.preventDefault();

    const email = document.getElementById("forgotEmail").value.trim();
    const captcha = document.getElementById("forgotCaptchaInput").value.trim();

    if (!email || !isValidEmail(email) || captcha !== captchas.forgot) {
        showToast("Invalid email or captcha");
        generateCaptcha("forgot");
        return;
    }

    try {
        const res = await fetch(`${API_BASE}/auth/forgot-password`, {
            method: "POST",
            headers: {"Content-Type": "application/json"},
            body: JSON.stringify({ email })
        });

        const data = await res.json();

        if (!res.ok) throw new Error(data.message);

        showToast("Reset link sent successfully");

    } catch (err) {
        console.error(err);
        showToast("Backend error (check Flask or CORS)");
    }

    generateCaptcha("forgot");
});

// ================= LOGOUT =================
function handleLogout() {
    document.getElementById("dashboardWrapper").style.display = "none";
    document.getElementById("authWrapper").style.display = "block";
    showPage("loginPage");
}