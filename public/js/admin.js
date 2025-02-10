// admin.js
const socket = io();

const PERMISSIONS = {
  AUDIO_TOGGLE: 'Toggle Audio',
  PLAYBACK_CONTROL: 'Play/Pause',
  SKIP_CONTROL: 'Skip/Previous',
  REPEAT_CONTROL: 'Repeat',
  QUEUE_MANAGEMENT: 'Queue Management',
  SEARCH_DOWNLOAD: 'Search/Download',
  DELETE_SONGS: 'Delete Songs',
  ADMIN_ACCESS: 'Admin Access'
};

// Tab switching
document.querySelectorAll('.tab-button').forEach(button => {
  button.addEventListener('click', () => {
    document.querySelectorAll('.tab-button').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(c => c.classList.add('hidden'));
    button.classList.add('active');
    document.getElementById(`${button.dataset.tab}Tab`).classList.remove('hidden');
  });
});

// Load users list
function loadUsers() {
  fetch("/api/admin/users")
    .then(res => res.json())
    .then(data => {
      const usersList = document.getElementById("usersList");
      usersList.innerHTML = data.users.map(user => `
        <div class="user-item" data-username="${user.username}">
          <span>${user.username}</span>
          <span class="user-role">${user.role}</span>
        </div>
      `).join("");
      Array.from(usersList.getElementsByClassName("user-item")).forEach(item => {
        item.addEventListener("click", () => loadUserDetails(item.dataset.username));
      });
    })
    .catch(err => console.error("Error loading users:", err));
}

// Load user details
function loadUserDetails(username) {
  fetch(`/api/admin/user/${username}`)
    .then(res => res.json())
    .then(user => {
      const details = document.getElementById("userDetails");
      details.innerHTML = `
        <h4>${user.username}</h4>
        <p>Role: ${user.role}</p>
        <p>Created: ${new Date(user.createdAt).toLocaleString()}</p>
        <p>Last Access: ${new Date(user.lastAccess).toLocaleString()}</p>
        <h5>Permissions</h5>
        ${Object.entries(PERMISSIONS).map(([key, label]) => `
          <div class="permission-toggle">
            <span>${label}</span>
            <select data-permission="${key}">
              <option value="default">Default</option>
              <option value="enabled">Enabled</option>
              <option value="disabled">Disabled</option>
            </select>
          </div>
        `).join("")}
      `;
      Object.keys(PERMISSIONS).forEach(key => {
        const select = details.querySelector(`select[data-permission="${key}"]`);
        select.value = user.permissions[key] || "default";
        select.addEventListener("change", () => updateUserPermission(user.username, key, select.value));
      });
    })
    .catch(err => console.error("Error loading user details:", err));
}

function updateUserPermission(username, permission, value) {
  fetch("/api/admin/updatePermission", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, permission, value })
  })
    .then(res => res.json())
    .then(data => console.log(`Updated ${username}'s ${permission} to ${value}`))
    .catch(err => console.error("Error updating permission:", err));
}

// Load roles list
function loadRoles() {
  fetch("/api/admin/roles")
    .then(res => res.json())
    .then(roles => {
      const rolesList = document.getElementById("rolesList");
      rolesList.innerHTML = roles.map(role => `
        <div class="role-item" data-role="${role.name}">
          <span>${role.name}</span>
        </div>
      `).join("");
      Array.from(rolesList.getElementsByClassName("role-item")).forEach(item => {
        item.addEventListener("click", () => loadRoleDetails(item.dataset.role));
      });
    })
    .catch(err => console.error("Error loading roles:", err));
}

// Load role details
function loadRoleDetails(roleName) {
  fetch(`/api/admin/role/${roleName}`)
    .then(res => res.json())
    .then(role => {
      const details = document.getElementById("roleDetails");
      details.innerHTML = `
        <h4>${role.name}</h4>
        ${Object.entries(PERMISSIONS).map(([key, label]) => `
          <div class="permission-toggle">
            <span>${label}</span>
            <input type="checkbox" data-permission="${key}" ${role.permissions[key] ? "checked" : ""}>
          </div>
        `).join("")}
      `;
      Array.from(details.querySelectorAll('input[type="checkbox"]')).forEach(checkbox => {
        checkbox.addEventListener("change", () => updateRolePermission(role.name, checkbox.dataset.permission, checkbox.checked));
      });
    })
    .catch(err => console.error("Error loading role details:", err));
}

function updateRolePermission(roleName, permission, enabled) {
  console.log(`Role ${roleName}: set ${permission} to ${enabled}`);
  // In a production system, you would add an API call here.
}

document.getElementById("addRoleBtn").addEventListener("click", () => {
  const name = prompt("Enter new role name:");
  if (name) {
    fetch("/api/admin/addRole", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name })
    })
      .then(res => res.json())
      .then(() => loadRoles())
      .catch(err => console.error("Error adding new role:", err));
  }
});

loadUsers();
loadRoles();