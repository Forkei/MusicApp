// roles.js
// This file handles loading and saving role definitions and per‑user permission overrides.
// Roles are stored in data/roles.json and user overrides in data/userPermissions.json.

const fs = require('fs').promises;
const path = require('path');
const { DEFAULT_ROLES } = require('./permissions');

const ROLES_FILE = path.join(__dirname, 'data', 'roles.json');
const USER_PERMISSIONS_FILE = path.join(__dirname, 'data', 'userPermissions.json');

// Ensure the data directory exists
fs.mkdir(path.join(__dirname, 'data'), { recursive: true }).catch(console.error);

// Load roles file; if not exists, create one using defaults.
async function loadRoles() {
  try {
    const data = await fs.readFile(ROLES_FILE, 'utf8');
    return JSON.parse(data);
  } catch (err) {
    if (err.code === 'ENOENT') {
      const defaultData = { roles: DEFAULT_ROLES };
      await fs.writeFile(ROLES_FILE, JSON.stringify(defaultData, null, 2));
      return defaultData;
    }
    throw err;
  }
}

// Save the roles data
async function saveRoles(roles) {
  await fs.writeFile(ROLES_FILE, JSON.stringify({ roles }, null, 2));
}

// Load per-user permission overrides; default to empty if file not exists.
async function loadUserPermissions() {
  try {
    const data = await fs.readFile(USER_PERMISSIONS_FILE, 'utf8');
    return JSON.parse(data);
  } catch (err) {
    if (err.code === 'ENOENT') {
      const defaultData = { permissions: {} };
      await fs.writeFile(USER_PERMISSIONS_FILE, JSON.stringify(defaultData, null, 2));
      return defaultData;
    }
    throw err;
  }
}

// Save per-user permission overrides
async function saveUserPermissions(permissions) {
  await fs.writeFile(USER_PERMISSIONS_FILE, JSON.stringify({ permissions }, null, 2));
}

module.exports = {
  loadRoles,
  saveRoles,
  loadUserPermissions,
  saveUserPermissions
};