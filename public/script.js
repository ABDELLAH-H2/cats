// API Base URL
const API_URL = "";

// DOM Elements
const catForm = document.getElementById("cat-form");
const modalOverlay = document.getElementById("modal-overlay");
const modalTitle = document.getElementById("modal-title");
const catIdInput = document.getElementById("cat-id");
const catNameInput = document.getElementById("cat-name");
const catPfpInput = document.getElementById("cat-pfp");
const catTagsInput = document.getElementById("cat-tags");
const tagSearchInput = document.getElementById("tag-search-input");
const tagSearchBtn = document.getElementById("tag-search-btn");
const clearTagBtn = document.getElementById("clear-tag-btn");
const submitBtn = document.getElementById("submit-btn");
const cancelBtn = document.getElementById("cancel-btn");
const addCatBtn = document.getElementById("add-cat-btn");
const catsContainer = document.getElementById("cats-container");
const searchInput = document.getElementById("search-input");
const prevBtn = document.getElementById("prev-btn");
const nextBtn = document.getElementById("next-btn");
const paginationInfo = document.getElementById("pagination-info");
const loginLink = document.getElementById("login-link");
const logoutBtn = document.getElementById("logout-btn");
const userInfo = document.getElementById("user-info");
const usernameDisplay = document.getElementById("username-display");

// State
let isEditing = false;
let allCats = []; // Store all cats for filtering
let currentPage = 1;
let totalPages = 1;
let limit = 10;
let isSearching = false;
let currentTagFilter = null;

// Initialize
document.addEventListener("DOMContentLoaded", () => {
  checkAuthState();
  loadCats();
});

// Auth state management
function checkAuthState() {
  const token = getAuthToken();
  const user = getUser();

  if (token && user) {
    // Show logged-in state
    addCatBtn.style.display = "inline-block";
    logoutBtn.style.display = "inline-block";
    userInfo.style.display = "inline-block";
    usernameDisplay.textContent = user.username;
    loginLink.style.display = "none";
  } else {
    // Show logged-out state
    addCatBtn.style.display = "none";
    logoutBtn.style.display = "none";
    userInfo.style.display = "none";
    loginLink.style.display = "inline-block";
  }
}

function getAuthToken() {
  return localStorage.getItem("authToken");
}

function getUser() {
  const user = localStorage.getItem("user");
  return user ? JSON.parse(user) : null;
}

function isLoggedIn() {
  return !!getAuthToken();
}

function logout() {
  localStorage.removeItem("authToken");
  localStorage.removeItem("user");
  checkAuthState();
  loadCats();
  showToast("Logged out successfully", "success");
}

// Event Listeners
catForm.addEventListener("submit", handleFormSubmit);
cancelBtn.addEventListener("click", closeModal);
addCatBtn.addEventListener("click", openAddModal);
modalOverlay.addEventListener("click", (e) => {
  if (e.target === modalOverlay) closeModal();
});
searchInput.addEventListener("input", handleSearch);
prevBtn.addEventListener("click", () => changePage(-1));
nextBtn.addEventListener("click", () => changePage(1));
logoutBtn.addEventListener("click", logout);
tagSearchBtn.addEventListener("click", handleTagSearch);
clearTagBtn.addEventListener("click", clearTagSearch);
tagSearchInput.addEventListener("keypress", (e) => {
  if (e.key === "Enter") handleTagSearch();
});

// Open modal for adding
function openAddModal() {
  if (!isLoggedIn()) {
    showToast("Please sign in to add cats", "error");
    return;
  }
  isEditing = false;
  modalTitle.textContent = "Add Cat";
  submitBtn.textContent = "Add Cat";
  catForm.reset();
  catIdInput.value = "";
  modalOverlay.classList.add("active");
}

// Open modal for editing
function openEditModal(cat) {
  if (!isLoggedIn()) {
    showToast("Please sign in to edit cats", "error");
    return;
  }
  isEditing = true;
  modalTitle.textContent = "Edit Cat";
  submitBtn.textContent = "Save Changes";
  catIdInput.value = cat.id;
  catNameInput.value = cat.name || "";
  catPfpInput.value = cat.pfp || "";
  catTagsInput.value = cat.tags || "";
  modalOverlay.classList.add("active");
}

// Close modal
function closeModal() {
  modalOverlay.classList.remove("active");
  catForm.reset();
}

// Handle name search
function handleSearch() {
  const searchTerm = searchInput.value.toLowerCase().trim();
  if (!searchTerm) {
    isSearching = false;
    loadCats();
    return;
  }
  isSearching = true;
  const filteredCats = allCats.filter((cat) =>
    cat.name.toLowerCase().includes(searchTerm)
  );
  renderCats(filteredCats);
  // Hide pagination during name search
  document.getElementById("pagination").style.display = "none";
}

// Handle tag search
function handleTagSearch() {
  const tag = tagSearchInput.value.trim();
  if (!tag) {
    showToast("Please enter a tag to search", "error");
    return;
  }
  currentTagFilter = tag;
  currentPage = 1;
  searchInput.value = ""; // Clear name search
  isSearching = false;
  clearTagBtn.style.display = "inline-block";
  loadCats();
}

// Clear tag search
function clearTagSearch() {
  currentTagFilter = null;
  tagSearchInput.value = "";
  clearTagBtn.style.display = "none";
  currentPage = 1;
  loadCats();
}

// Change page
function changePage(delta) {
  const newPage = currentPage + delta;
  if (newPage >= 1 && newPage <= totalPages) {
    currentPage = newPage;
    loadCats();
  }
}

// Update pagination UI
function updatePagination(pagination) {
  currentPage = pagination.page;
  totalPages = pagination.totalPages;

  paginationInfo.textContent = `Page ${currentPage} of ${totalPages} (${pagination.total} cats)`;
  prevBtn.disabled = currentPage <= 1;
  nextBtn.disabled = currentPage >= totalPages;

  // Show pagination if not searching
  document.getElementById("pagination").style.display = isSearching
    ? "none"
    : "flex";
}

// Load all cats with pagination and optional tag filter
async function loadCats() {
  catsContainer.innerHTML = '<div class="loading">Loading cats...</div>';

  try {
    let url = `${API_URL}/cats?page=${currentPage}&limit=${limit}`;
    if (currentTagFilter) {
      url += `&tag=${encodeURIComponent(currentTagFilter)}`;
    }

    const response = await fetch(url);
    if (!response.ok) throw new Error("Failed to fetch cats");

    const result = await response.json();
    allCats = result.data; // Store for filtering
    updatePagination(result.pagination);
    renderCats(result.data);
  } catch (error) {
    console.error("Error loading cats:", error);
    catsContainer.innerHTML =
      '<div class="empty-state">Failed to load cats. Please try again.</div>';
    showToast("Failed to load cats", "error");
  }
}

// Render cats grid
function renderCats(cats) {
  if (cats.length === 0) {
    catsContainer.innerHTML =
      '<div class="empty-state">No cats yet. Click "Add Cat" to add your first cat!</div>';
    return;
  }

  const loggedIn = isLoggedIn();

  catsContainer.innerHTML = cats
    .map((cat) => {
      const pfpDisplay = cat.pfp
        ? cat.pfp.substring(0, 40) + (cat.pfp.length > 40 ? "..." : "")
        : "";

      // Parse and display tags
      const tagsHtml = cat.tags
        ? cat.tags.split(',').map(tag =>
          `<span class="cat-tag" onclick="searchByTag('${escapeHtml(tag.trim())}')">` +
          `${escapeHtml(tag.trim())}</span>`
        ).join('')
        : '';

      return `
        <div class="cat-card" data-id="${cat.id}">
            ${cat.pfp
          ? `<img src="${cat.pfp}" alt="${escapeHtml(
            cat.name
          )}" class="cat-image" onerror="this.outerHTML='<div class=\\'cat-image placeholder\\'>🐱</div>'">`
          : '<div class="cat-image placeholder">🐱</div>'
        }
            <div class="cat-info">
                <h3 class="cat-name">${escapeHtml(cat.name)}</h3>
                ${tagsHtml ? `<div class="cat-tags">${tagsHtml}</div>` : ''}
                ${cat.pfp
          ? `<a href="${cat.pfp}" target="_blank" class="cat-link">${escapeHtml(
            cat.name
          )}</a>`
          : ""
        }
                ${loggedIn
          ? `
                <div class="cat-actions">
                    <button class="btn" onclick="editCat(${cat.id})">Edit</button>
                    <button class="btn" onclick="deleteCat(${cat.id})">Delete</button>
                </div>
                `
          : ""
        }
            </div>
        </div>
    `;
    })
    .join("");
}

// Handle form submission
async function handleFormSubmit(e) {
  e.preventDefault();

  if (!isLoggedIn()) {
    showToast("Please sign in to perform this action", "error");
    return;
  }

  const name = catNameInput.value.trim();
  let pfp = catPfpInput.value.trim();
  const tags = catTagsInput.value.trim();

  if (!name) {
    showToast("Please enter a cat name", "error");
    return;
  }

  // If no PFP provided, try to fetch a random one
  if (!pfp) {
    try {
      // Add delay + timestamp + random to avoid getting same image
      await new Promise((resolve) => setTimeout(resolve, 100));
      const timestamp = Date.now();
      const random = Math.random().toString(36).substring(7);
      const catRes = await fetch(
        `https://api.thecatapi.com/v1/images/search?_t=${timestamp}&_r=${random}`
      );
      const catData = await catRes.json();
      if (catData && catData.length > 0) {
        pfp = catData[0].url;
      }
    } catch (error) {
      console.error("Failed to fetch random cat image:", error);
    }
  }

  const token = getAuthToken();
  const headers = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`,
  };

  try {
    if (isEditing) {
      const catId = catIdInput.value;
      const updateData = { name };
      if (pfp) updateData.pfp = pfp;
      updateData.tags = tags;

      const response = await fetch(`${API_URL}/cats/${catId}`, {
        method: "PUT",
        headers,
        body: JSON.stringify(updateData),
      });

      if (response.status === 401 || response.status === 403) {
        showToast("Session expired. Please sign in again.", "error");
        logout();
        return;
      }

      if (!response.ok) throw new Error("Failed to update cat");
      showToast("Cat updated successfully!", "success");
    } else {
      const postData = { name, tags };
      if (pfp) postData.pfp = pfp;

      const response = await fetch(`${API_URL}/cats`, {
        method: "POST",
        headers,
        body: JSON.stringify(postData),
      });

      if (response.status === 401 || response.status === 403) {
        showToast("Session expired. Please sign in again.", "error");
        logout();
        return;
      }

      if (!response.ok) throw new Error("Failed to add cat");
      showToast("Cat added successfully!", "success");
    }

    closeModal();
    loadCats();
  } catch (error) {
    console.error("Error:", error);
    showToast(
      isEditing ? "Failed to update cat" : "Failed to add cat",
      "error"
    );
  }
}

// Edit cat
async function editCat(id) {
  if (!isLoggedIn()) {
    showToast("Please sign in to edit cats", "error");
    return;
  }

  try {
    const response = await fetch(`${API_URL}/cats/${id}`);
    if (!response.ok) throw new Error("Failed to fetch cat");

    const cat = await response.json();
    openEditModal(cat);
  } catch (error) {
    console.error("Error:", error);
    showToast("Failed to load cat details", "error");
  }
}

// Delete cat
async function deleteCat(id) {
  if (!isLoggedIn()) {
    showToast("Please sign in to delete cats", "error");
    return;
  }

  if (!confirm("Are you sure you want to delete this cat?")) return;

  const token = getAuthToken();

  try {
    const response = await fetch(`${API_URL}/cats/${id}`, {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (response.status === 401 || response.status === 403) {
      showToast("Session expired. Please sign in again.", "error");
      logout();
      return;
    }

    if (!response.ok) throw new Error("Failed to delete cat");

    showToast("Cat deleted successfully", "success");
    loadCats();
  } catch (error) {
    console.error("Error:", error);
    showToast("Failed to delete cat", "error");
  }
}

// Show toast notification
function showToast(message, type = "success") {
  let toast = document.querySelector(".toast");
  if (!toast) {
    toast = document.createElement("div");
    toast.className = "toast";
    document.body.appendChild(toast);
  }

  toast.textContent = message;
  toast.className = `toast ${type} show`;

  setTimeout(() => {
    toast.classList.remove("show");
  }, 3000);
}

// Escape HTML to prevent XSS
function escapeHtml(text) {
  if (!text) return "";
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

// Search by clicking a tag
function searchByTag(tag) {
  tagSearchInput.value = tag;
  handleTagSearch();
}
