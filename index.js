"use strict";

const express = require("express");
const http = require("http");
const socketIo = require("socket.io");
const path = require("path");
const fs = require("fs");
const fsp = require("fs").promises;
const bodyParser = require("body-parser");
const session = require("express-session");
const { exec } = require("child_process");
const util = require("util");
const execProm = util.promisify(exec);
const ffmpeg = require("fluent-ffmpeg");

const { PERMISSIONS, DEFAULT_ROLES } = require("./permissions");
const {
  loadRoles,
  saveRoles,
  loadUserPermissions,
  saveUserPermissions,
} = require("./roles");

// ---------- Persistent User Storage ------------
const USERS_FILE = path.join(__dirname, "users.json");

async function loadUsers() {
  try {
    const data = await fsp.readFile(USERS_FILE, "utf8");
    return JSON.parse(data);
  } catch (err) {
    if (err.code === "ENOENT") {
      await fsp.writeFile(USERS_FILE, JSON.stringify([], null, 2));
      return [];
    } else throw err;
  }
}

async function saveUsers(users) {
  await fsp.writeFile(USERS_FILE, JSON.stringify(users, null, 2), "utf8");
}

// ---------- Express App and Middleware Setup ------------
const app = express();
const server = http.createServer(app);
const io = socketIo(server);

// Setup session and body parsing
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(
  session({
    secret: "some-very-secret-key",
    resave: false,
    saveUninitialized: false,
  })
);
app.use(express.static(path.join(__dirname, "public")));

// ---------- Public Endpoint: Streaming Audio ------------
app.get("/api/stream/:encodedPath", (req, res) => {
  const filePath = decodeURIComponent(req.params.encodedPath);
  const absolutePath = path.resolve(filePath);
  const audioDir = path.resolve(path.join(__dirname, "Audio"));

  if (!absolutePath.startsWith(audioDir)) {
    return res.status(403).send("Access denied");
  }

  res.sendFile(absolutePath, (err) => {
    if (err) {
      if (err.code === 'ECONNABORTED') {
        console.log("Stream aborted by the client.");
      } else {
        console.error("Stream error:", err);
      }
    }
  });
});

// ---------- Public API: /api/songs ------------
app.get("/api/songs", (req, res) => res.json(songs));

// ---------- Authentication Routes ------------
app.get("/login", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "login.html"));
});

app.post("/login", async (req, res) => {
  const { username, password, mode } = req.body;
  if (mode === "guest") {
    req.session.user = { username: "guest", role: "guest", permissions: {} };
    console.log("Guest login");
    return res.redirect("/");
  }
  let users = await loadUsers();
  const user = users.find(u => u.username === username && u.password === password);
  if (user) {
    const userOverrides = (await loadUserPermissions()).permissions[user.username] || {};
    user.permissions = userOverrides;
    req.session.user = user;
    console.log(`User ${username} logged in as ${user.role}`);
    return res.redirect("/");
  }
  console.log("Invalid credentials for", username);
  res.redirect("/login?error=Invalid credentials");
});

app.get("/register", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "register.html"));
});

app.post("/register", async (req, res) => {
  const { username, password } = req.body;
  let users = await loadUsers();
  if (users.find(u => u.username === username)) {
    return res.redirect("/register?error=User already exists");
  }
  const newUser = { username, password, role: "user", permissions: {} };
  users.push(newUser);
  await saveUsers(users);
  req.session.user = newUser;
  console.log(`New user created: ${username}`);
  res.redirect("/");
});

app.get("/logout", (req, res) => {
  req.session.destroy(() => res.redirect("/login"));
});

// ---------- Admin Routes ------------
function requireAuth(req, res, next) {
  if (req.session.user) return next();
  res.redirect("/login");
}

function requireAdmin(req, res, next) {
  if (req.session.user && req.session.user.role === "admin") return next();
  res.status(403).send("Access denied");
}

app.get("/admin", requireAdmin, (req, res) => {
  res.sendFile(path.join(__dirname, "public", "admin.html"));
});

app.get("/api/admin/users", requireAdmin, async (req, res) => {
  let users = await loadUsers();
  users = users.map(u => ({
    ...u,
    createdAt: new Date().toISOString(),
    lastAccess: new Date().toISOString()
  }));
  res.json({ users, sessionCount: Object.keys(io.sockets.sockets).length });
});

app.get("/api/admin/user/:username", requireAdmin, async (req, res) => {
  let users = await loadUsers();
  const user = users.find(u => u.username === req.params.username);
  if (!user) return res.status(404).json({ error: "User not found" });
  const userOverrides = (await loadUserPermissions()).permissions[user.username] || {};
  user.permissions = userOverrides;
  user.createdAt = new Date().toISOString();
  user.lastAccess = new Date().toISOString();
  res.json(user);
});

app.post("/api/admin/updatePermission", requireAdmin, async (req, res) => {
  const { username, permission, value } = req.body;
  const userPermissionsData = await loadUserPermissions();
  userPermissionsData.permissions[username] = userPermissionsData.permissions[username] || {};
  userPermissionsData.permissions[username][permission] = value;
  await saveUserPermissions(userPermissionsData.permissions);
  console.log(`Admin updated ${username}'s ${permission} to ${value}`);
  res.json({ message: "Permission updated" });
});

app.get("/api/admin/roles", requireAdmin, async (req, res) => {
  const rolesData = await loadRoles();
  res.json(Object.values(rolesData.roles));
});

app.get("/api/admin/role/:role", requireAdmin, async (req, res) => {
  const rolesData = await loadRoles();
  const role = rolesData.roles[req.params.role];
  if (!role) return res.status(404).json({ error: "Role not found" });
  res.json(role);
});

// Endpoint to fetch cover art for a song
app.post("/api/fetchCoverArt", async (req, res) => {
  const { songTitle, youtubeId } = req.body;
  
  if (!songTitle) {
    return res.status(400).json({ error: "Missing song title" });
  }

  const user = req.session.user;
  if (!user || !hasPermission(user, "SEARCH_DOWNLOAD")) {
    return res.status(403).json({ error: "Insufficient permissions" });
  }

  try {
    const url = youtubeId ? 
      `https://www.youtube.com/watch?v=${youtubeId}` : 
      `ytsearch1:${songTitle}`;

    const command = `yt-dlp --write-thumbnail --convert-thumbnails jpg --skip-download -o "${path.join(IMAGES_DIR, songTitle)}" "${url}"`;
    
    const { stdout, stderr } = await execProm(command);
    if (stderr) console.error("yt-dlp stderr:", stderr);

    const artPath = `/images/${songTitle}.jpg`;
    res.json({ success: true, artPath });
  } catch (err) {
    console.error("Error fetching cover art:", err);
    res.status(500).json({ error: "Failed to fetch cover art" });
  }
});

app.post("/api/admin/refresh", requireAdmin, async (req, res) => {
  songs = [];
  await scanAudioDirectory();
  res.json({ message: "Database refreshed" });
});


app.post("/api/admin/addRole", requireAdmin, async (req, res) => {
  const { name } = req.body;
  const rolesData = await loadRoles();
  if (rolesData.roles[name]) return res.status(409).json({ error: "Role already exists" });
  rolesData.roles[name] = { name, permissions: {} };
  await saveRoles(rolesData.roles);
  console.log(`Admin added new role: ${name}`);
  res.json({ message: "Role added" });
});

// ---------- Protected Routes Middleware ------------
app.use((req, res, next) => {
  if (
    req.path.startsWith("/login") ||
    req.path.startsWith("/register") ||
    req.path.startsWith("/api/admin") ||
    req.path.startsWith("/admin") ||
    req.path.startsWith("/api/searchall") ||
    req.path.startsWith("/api/download") ||
    req.path.startsWith("/api/songs") ||
    req.path.startsWith("/api/stream")
  ) {
    return next();
  }
  if (req.session.user) return next();
  res.redirect("/login");
});

// ---------- Directory Setup ------------
const AUDIO_DIR = path.join(__dirname, "Audio");
const IMAGES_DIR = path.join(__dirname, "public", "images");

fsp.mkdir(AUDIO_DIR, { recursive: true }).catch(console.error);
fsp.mkdir(IMAGES_DIR, { recursive: true }).catch(console.error);

// ---------- In-Memory Storage ------------
let songs = [];
let queue = [];
let playbackState = {
  isPlaying: false,
  currentSong: null,
  currentTime: 0,
  volume: 1.0,
  clientsPlayingAudio: [],
  startTime: null,
};
let isLoopEnabled = false;

// ---------- Playback Timer (Server Source-of-Truth) ------------
let serverPlaybackInterval = null;
const TICK_INTERVAL = 250;

function startPlaybackTimer() {
  if (serverPlaybackInterval) clearInterval(serverPlaybackInterval);
  playbackState.startTime = Date.now() - playbackState.currentTime * 1000;
  serverPlaybackInterval = setInterval(() => {
    if (playbackState.isPlaying && playbackState.currentSong) {
      const now = Date.now();
      playbackState.currentTime = (now - playbackState.startTime) / 1000;
      if (playbackState.currentTime >= playbackState.currentSong.duration) {
        handleSongEnd();
      }
      io.emit("playbackStateUpdate", playbackState);
    }
  }, TICK_INTERVAL);
}

function handleSongEnd() {
  if (queue.length > 0) {
    const nextSongPath = queue.shift();
    const nextSong = songs.find(s => s.filePath === nextSongPath);
    if (nextSong) {
      playbackState.currentSong = nextSong;
      playbackState.currentTime = 0;
      playbackState.startTime = Date.now();
      io.emit("currentlyPlaying", nextSong);
      io.emit("queueUpdate", queue);
    }
  } else if (isLoopEnabled && playbackState.currentSong) {
    playbackState.currentTime = 0;
    playbackState.startTime = Date.now();
  } else {
    playbackState.isPlaying = false;
    playbackState.currentSong = null;
    playbackState.currentTime = 0;
    clearInterval(serverPlaybackInterval);
    serverPlaybackInterval = null;
    io.emit("currentlyPlaying", null);
  }
  io.emit("playbackStateUpdate", playbackState);
}

// ---------- Scan Audio Directory ------------
async function scanAudioDirectory() {
  try {
    const dir = await fsp.opendir(AUDIO_DIR);
    for await (const dirent of dir) {
      if (path.extname(dirent.name).toLowerCase() !== ".mp3") continue;
      const filePath = path.join(AUDIO_DIR, dirent.name);
      if (songs.some(s => s.filePath === filePath)) {
        console.log(`Song already loaded: ${dirent.name}`);
        continue;
      }
      console.log(`Processing file: ${dirent.name}`);
      try {
        const metadata = await new Promise((resolve, reject) => {
          ffmpeg.ffprobe(filePath, (err, metadata) => {
            if (err) reject(err);
            else resolve(metadata);
          });
        });
        const { format } = metadata;
        const duration = format.duration;
        const tags = format.tags || {};
        const baseName = path.basename(dirent.name, ".mp3");
        const albumArtPath = await fsp
          .access(path.join(IMAGES_DIR, `${baseName}.jpg`))
          .then(() => `/images/${baseName}.jpg`)
          .catch(() => "/images/placeholder.jpg");
        const newSong = {
          title: tags.title || baseName,
          artist: tags.artist || "Unknown Artist",
          album: tags.album || "Unknown Album",
          filePath,
          youtubeId: null,
          duration,
          uploader: null,
          albumArtPath,
        };
        songs.push(newSong);
        console.log(`Added song: ${newSong.title}`);
      } catch (fileErr) {
        console.error(`Error processing ${dirent.name}:`, fileErr);
      }
    }
    console.log("Audio directory scan complete.");
  } catch (err) {
    console.error("Error scanning Audio directory:", err);
  }
}
scanAudioDirectory();

// ---------- YouTube Search Endpoint ------------
app.get("/api/searchall", async (req, res) => {
  const query = req.query.q;
  if (!query) return res.status(400).json({ error: "Missing query" });
  try {
    const command = `yt-dlp -j --flat-playlist "ytsearch:${query}"`;
    const { stdout, stderr } = await execProm(command);
    if (stderr) console.error("yt-dlp stderr:", stderr);
    let ytResults = stdout
      .split("\n")
      .filter(line => line.trim() !== "")
      .map(line => JSON.parse(line));
    ytResults = ytResults.map(result => {
      const isDownloaded = songs.some(s => s.youtubeId === result.id);
      const songInfo = songs.find(s => s.youtubeId === result.id);
      return { ...result, isDownloaded, filePath: isDownloaded ? songInfo.filePath : null };
    });
    const dbResults = songs.filter(song => song.title.toLowerCase().includes(query.toLowerCase()));
    res.json({ db: dbResults, yt: ytResults });
  } catch (err) {
    console.error("Error searching YouTube:", err);
    res.status(500).json({ error: "Error searching YouTube" });
  }
});

// ---------- Download Endpoint ------------
app.post("/api/download", async (req, res) => {
  const { url, title, uploader } = req.body;
  if (!url) return res.status(400).json({ error: "Missing URL" });

  const user = req.session.user;
  if (!user || !hasPermission(user, "SEARCH_DOWNLOAD")) {
    return res.status(403).json({ error: "Insufficient permissions" });
  }

  try {
    let videoId = null;
    if (url.includes("youtube.com") || url.includes("youtu.be")) {
      const urlObj = new URL(url);
      videoId = url.includes("youtu.be")
        ? urlObj.pathname.split("/")[1]
        : urlObj.searchParams.get("v");
    }

    await fsp.mkdir(AUDIO_DIR, { recursive: true });
    await fsp.mkdir(IMAGES_DIR, { recursive: true });

    //const sanitizedTitle = title ? title.replace(/[^a-z0-9]/gi, "_") : "unknown";
    const songTitle = title ? title.replace(/[^a-z0-9]/gi, " ") : "unknown";
    const outputPath = path.join(AUDIO_DIR, `${songTitle}.%(ext)s`);
    
    const options = [
      "--extract-audio",
      "--audio-format", "mp3",
      "--output", `"${outputPath}"`,  
      "--no-playlist",
      "-f", "bestaudio/best",
      "--write-thumbnail",
      "--convert-thumbnails", "jpg",
      "-v"
    ];
    const command = `yt-dlp ${options.join(" ")} "${url}"`;

    exec(command, async (error, stdout, stderr) => {
      if (error) {
        console.error("Error downloading:", error);
        return res.status(500).json({ error: "Failed to download song" });
      }

      const expectedFileName = `${songTitle}.mp3`;
      const expectedFilePath = path.join(AUDIO_DIR, expectedFileName);
      const expectedAlbumArtUrl = `public/images/${songTitle}.jpg`;


      const expectedAlbumArtPath = path.join(AUDIO_DIR, `${songTitle}.jpg`);
      const newAlbumArtPath = path.join(IMAGES_DIR, `${songTitle}.jpg`);
      try {
        await fsp.access(expectedAlbumArtPath);
        await fsp.rename(expectedAlbumArtPath, newAlbumArtPath);
      } catch (err) {
        console.error("Failed to move album art:", err);
      }

      ffmpeg.ffprobe(expectedFilePath, (err, metadata) => {
        if (err) {
          console.error("Error getting metadata:", err);
          return res.status(500).json({ error: "Error getting metadata" });
        }

        const { duration, tags } = metadata.format;
        const existingSong = songs.find(s => s.filePath === expectedFilePath);
        if (existingSong) {
          console.log("Song already exists:", tags.title || title);
        
          // Try to fetch cover art for existing song
          try {
            await fsp.access(expectedAlbumArtPath);
            await fsp.rename(expectedAlbumArtPath, newAlbumArtPath);
            existingSong.albumArtPath = expectedAlbumArtUrl;
            return res.json({ 
              exists: true, 
              artUpdated: true,
              song: existingSong
            });
          } catch (err) {
            console.error("Failed to update cover art:", err);
            return res.json({ 
              exists: true, 
              artUpdated: false,
              song: existingSong
            });
          }
        }

        const newSong = {
          title: tags.title || title,
          artist: tags.artist,
          album: tags.album,
          filePath: expectedFilePath,
          youtubeId: videoId,
          duration,
          uploader,
          albumArtPath: expectedAlbumArtUrl
        };
        songs.push(newSong);
        io.emit("songAdded", newSong);
        res.json(newSong);
      });
    });

  } catch (err) {
    console.error("Error in download endpoint:", err);
    res.status(500).json({ error: "Failed to download song" });
  }
});

// Function to check user permissions
function hasPermission(user, permission) {
  const userPermissions = user.permissions || {};
  return userPermissions[permission] === "enabled";
}

// ---------- Socket.IO Real-Time Events ------------
io.on("connection", (socket) => {
  console.log("New client connected:", socket.id);
  socket.emit("playbackStateUpdate", playbackState);
  if (playbackState.currentSong) socket.emit("currentlyPlaying", playbackState.currentSong);
  socket.emit("queueUpdate", queue);
  socket.emit("loopState", isLoopEnabled);

  socket.on("addToQueue", (songFilePath) => {
    console.log("Adding to queue:", songFilePath);
    const song = songs.find(s => s.filePath === songFilePath);
    if (song) {
      if (!playbackState.currentSong) {
        playbackState.currentSong = song;
        playbackState.isPlaying = true;
        playbackState.currentTime = 0;
        if (!playbackState.clientsPlayingAudio.includes(socket.id)) {  // automatically enable music
          playbackState.clientsPlayingAudio.push(socket.id);
        }
        startPlaybackTimer();
        io.emit("playbackStateUpdate", playbackState);
        io.emit("currentlyPlaying", song);
      } else {
        queue.push(songFilePath);
        io.emit("queueUpdate", queue);
      }
    }
  });

  socket.on("removeFromQueue", (index) => {
    if (index >= 0 && index < queue.length) {
      queue.splice(index, 1);
      io.emit("queueUpdate", queue);
    }
  });

  socket.on("reorderQueue", (newOrder) => {
    queue = newOrder;
    io.emit("queueUpdate", queue);
  });

  socket.on("play", () => {
    console.log("Play requested");
    if (playbackState.currentSong || queue.length > 0) {
      if (!playbackState.currentSong && queue.length > 0) {
        const nextSongPath = queue[0];
        const nextSong = songs.find(s => s.filePath === nextSongPath);
        if (nextSong) {
          playbackState.currentSong = nextSong;
          queue.shift();
        }
      }
      playbackState.isPlaying = true;
      startPlaybackTimer();
      io.emit("playbackStateUpdate", playbackState);
      if (playbackState.currentSong) io.emit("currentlyPlaying", playbackState.currentSong);
    }
  });

  socket.on("pause", () => {
    console.log("Pause requested");
    playbackState.isPlaying = false;
    if (serverPlaybackInterval) clearInterval(serverPlaybackInterval);
    io.emit("playbackStateUpdate", playbackState);
  });
  
   socket.on("toggleLoop", () => {
    isLoopEnabled = !isLoopEnabled;
    playbackState.isLoopEnabled = isLoopEnabled;
    io.emit("loopState", isLoopEnabled);
    io.emit("playbackStateUpdate", playbackState);
  });

  socket.on("toggleLoop", () => {
    isLoopEnabled = !isLoopEnabled;
    playbackState.isLoopEnabled = isLoopEnabled;
    io.emit("loopState", isLoopEnabled);
    io.emit("playbackStateUpdate", playbackState);
  });

  socket.on("next", () => {
    console.log("Next requested");
    if (queue.length > 0) {
      const nextSongPath = queue.shift();
      const nextSong = songs.find(s => s.filePath === nextSongPath);
      if (nextSong) {
        playbackState.currentSong = nextSong;
        playbackState.currentTime = 0;
        playbackState.startTime = Date.now();
        playbackState.isPlaying = true;
        io.emit("currentlyPlaying", nextSong);
        io.emit("queueUpdate", queue);
        io.emit("playbackStateUpdate", playbackState);
      }
    } else if (isLoopEnabled && playbackState.currentSong) {
      playbackState.currentTime = 0;
      playbackState.startTime = Date.now();
      io.emit("playbackStateUpdate", playbackState);
    } else {
      playbackState.currentSong = null;
      playbackState.isPlaying = false;
      playbackState.currentTime = 0;
      io.emit("currentlyPlaying", null);
      io.emit("playbackStateUpdate", playbackState);
    }
  });

  socket.on("previous", () => {
    console.log("Previous requested");
    if (playbackState.currentTime > 3) {
      playbackState.currentTime = 0;
      playbackState.startTime = Date.now();
      io.emit("playbackStateUpdate", playbackState);
    }
  });

  socket.on("seek", (time) => {
    playbackState.currentTime = time;
    playbackState.startTime = Date.now() - time * 1000;
    io.emit("playbackStateUpdate", playbackState);
  });

  socket.on("toggleAudioOutput", (enabled) => {
    const idx = playbackState.clientsPlayingAudio.indexOf(socket.id);
    if (enabled && idx === -1) {
      playbackState.clientsPlayingAudio.push(socket.id);
    } else if (!enabled && idx !== -1) {
      playbackState.clientsPlayingAudio.splice(idx, 1);
    }
    io.emit("playbackStateUpdate", playbackState);
  });

  socket.on("toggleLoop", () => {
    isLoopEnabled = !isLoopEnabled;
    io.emit("loopState", isLoopEnabled);
  });

  socket.on("disconnect", () => {
    console.log("Client disconnected:", socket.id);
    const idx = playbackState.clientsPlayingAudio.indexOf(socket.id);
    if (idx !== -1) {
      playbackState.clientsPlayingAudio.splice(idx, 1);
      io.emit("playbackStateUpdate", playbackState);
    }
  });
});

// ---------- SPA Fallback Route ------------
app.get("*", requireAuth, (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// ---------- Start the Server ------------
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
