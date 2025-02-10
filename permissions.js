// permissions.js
// This file defines the permission labels as well as the default roles.

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

const DEFAULT_ROLES = {
  admin: {
    name: 'admin',
    permissions: {
      AUDIO_TOGGLE: true,
      PLAYBACK_CONTROL: true,
      SKIP_CONTROL: true,
      REPEAT_CONTROL: true,
      QUEUE_MANAGEMENT: true,
      SEARCH_DOWNLOAD: true,
      DELETE_SONGS: true,
      ADMIN_ACCESS: true
    }
  },
  user: {
    name: 'user',
    permissions: {
      AUDIO_TOGGLE: true,
      PLAYBACK_CONTROL: true,
      SKIP_CONTROL: true,
      REPEAT_CONTROL: true,
      QUEUE_MANAGEMENT: true,
      SEARCH_DOWNLOAD: true,
      DELETE_SONGS: false,
      ADMIN_ACCESS: false
    }
  },
  guest: {
    name: 'guest',
    permissions: {
      AUDIO_TOGGLE: true,
      PLAYBACK_CONTROL: false,
      SKIP_CONTROL: false,
      REPEAT_CONTROL: false,
      QUEUE_MANAGEMENT: false,
      SEARCH_DOWNLOAD: false,
      DELETE_SONGS: false,
      ADMIN_ACCESS: false
    }
  }
};

module.exports = {
  PERMISSIONS,
  DEFAULT_ROLES
};