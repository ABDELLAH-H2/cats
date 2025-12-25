// API Base URL
const API_URL = "";

// DOM Elements
const loginForm = document.getElementById("login-form");
const registerForm = document.getElementById("register-form");
const authTabs = document.querySelectorAll(".auth-tab");
const errorMessage = document.getElementById("error-message");
const successMessage = document.getElementById("success-message");

// Check if already logged in
document.addEventListener("DOMContentLoaded", () => {
    const token = localStorage.getItem('token');
    if (token) {
        // Verify token is still valid
        fetch(`${API_URL}/auth/me`, {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        })
            .then((res) => {
                if (res.ok) {
                    window.location.href = "index.html";
                } else {
                    // Token invalid, remove it
                    localStorage.removeItem('token');
                }
            })
            .catch(() => {
                // Not logged in, stay on login page
                localStorage.removeItem('token');
            });
    }
});

// Tab switching
authTabs.forEach((tab) => {
    tab.addEventListener("click", () => {
        const tabName = tab.dataset.tab;

        // Update active tab
        authTabs.forEach((t) => t.classList.remove("active"));
        tab.classList.add("active");

        // Show corresponding form
        document.querySelectorAll(".auth-form").forEach((form) => {
            form.classList.remove("active");
        });
        document.getElementById(`${tabName}-form`).classList.add("active");

        // Clear messages
        hideMessages();
    });
});

// Login form submission
loginForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    hideMessages();

    const email = document.getElementById("login-email").value.trim();
    const password = document.getElementById("login-password").value;
    const loginBtn = document.getElementById("login-btn");

    loginBtn.disabled = true;
    loginBtn.textContent = "Signing in...";

    try {
        const response = await fetch(`${API_URL}/auth/login`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email, password }),
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || "Login failed");
        }

        // Store JWT token in localStorage
        localStorage.setItem('token', data.token);

        showSuccess("Login successful! Redirecting...");

        setTimeout(() => {
            window.location.href = "index.html";
        }, 1000);
    } catch (error) {
        showError(error.message);
        loginBtn.disabled = false;
        loginBtn.textContent = "Sign In";
    }
});

// Register form submission
registerForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    hideMessages();

    const username = document.getElementById("register-username").value.trim();
    const email = document.getElementById("register-email").value.trim();
    const password = document.getElementById("register-password").value;
    const registerBtn = document.getElementById("register-btn");

    registerBtn.disabled = true;
    registerBtn.textContent = "Creating account...";

    try {
        const response = await fetch(`${API_URL}/auth/register`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ username, email, password }),
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || "Registration failed");
        }

        // Store JWT token in localStorage
        localStorage.setItem('token', data.token);

        showSuccess("Account created! Redirecting...");

        setTimeout(() => {
            window.location.href = "index.html";
        }, 1000);
    } catch (error) {
        showError(error.message);
        registerBtn.disabled = false;
        registerBtn.textContent = "Create Account";
    }
});

// Helper functions
function showError(message) {
    errorMessage.textContent = message;
    errorMessage.classList.add("show");
}

function showSuccess(message) {
    successMessage.textContent = message;
    successMessage.classList.add("show");
}

function hideMessages() {
    errorMessage.classList.remove("show");
    successMessage.classList.remove("show");
}
