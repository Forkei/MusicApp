// public/js/app.js
// This file handles the main client-side logic for the music player
// including socket connections, UI updates, and media session handling.

const socket = io({ query: { role: window.userRole || "guest" } });

document.addEventListener("DOMContentLoaded", () => {
  console.log("DOM fully loaded, initializing app...");

  const currentUserRole = window.userRole || "guest";
  console.log("Current user role:", currentUserRole);

  let queue = [];
  let playbackState = {
    isPlaying: false,
    currentSong: null,
    currentTime: 0,
    volume: 0.5,
    clientsPlayingAudio: [],
  };
  let localVolume = 0.5;

  const audioPlayer = document.getElementById("audioPlayer");
  if (audioPlayer) {
    audioPlayer.volume = localVolume;
  } else {
    console.error("Audio element missing!");
  }
  let isSeeking = false;

  const miniPlayerSongInfo = document.querySelector(".mini-player .song-info");
  const playPauseButton = document.getElementById("playPauseButton");
  const nextButton = document.getElementById("nextButton");
  const prevButton = document.getElementById("prevButton");
  const progressBar = document.querySelector(".progress-bar .progress");
  const audioToggleButton = document.getElementById("audioToggleButton");
  const errorMessageBox = document.getElementById("error-message");

  const dbSearchInput = document.getElementById("dbSearchInput");
  const dbSearchButton = document.getElementById("dbSearchButton");
  const songList = document.getElementById("songList");

  const searchInput = document.getElementById("searchInput");
  const searchButton = document.getElementById("searchButton");
  const searchResultsList = document.getElementById("searchResults");
  const searchLoadingIndicator = document.getElementById("search-loading-indicator");

  const playPauseButtonLarge = document.getElementById("playPauseButtonLarge");
  const prevButtonLarge = document.getElementById("prevButtonLarge");
  const nextButtonLarge = document.getElementById("nextButtonLarge");
  const queueList = document.getElementById("queueList");
  const volumeSlider = document.getElementById("volumeSlider");
  const currentSongTitle = document.getElementById("currentSongTitle");
  const currentSongArtist = document.getElementById("currentSongArtist");
  const albumArt = document.getElementById("album-art");
  const loopButton = document.getElementById("loop-button");
  const fullscreenButton = document.getElementById("fullscreen-button");

  // Mobile elements
  const mobilePlayPauseButton = document.getElementById("mobile-play-pause");
  const mobileNextButton = document.getElementById("mobile-next");
  const mobilePrevButton = document.getElementById("mobile-prev");
  const mobileAudioToggleButton = document.getElementById("mobile-audio-toggle");
  const mobileSongInfo = document.querySelector(".mobile-song-info");
  const hamburgerMenu = document.getElementById("hamburger-menu");
  const sidebar = document.querySelector(".sidebar");

  // Show admin button if user is admin
  if (window.userRole === "admin") {
    const adminNav = document.getElementById("adminNav");
    if (adminNav) adminNav.classList.remove("hidden");
  }

  // Logging socket connection status
  socket.on("connect", () => {
    console.log("Socket connected. ID:", socket.id);
  });
  socket.on("disconnect", () => console.log("Socket disconnected"));

  // Media Session API for device controls
  if ("mediaSession" in navigator) {
    navigator.mediaSession.setActionHandler("play", () => {
      if (hasPermission("PLAYBACK_CONTROL")) socket.emit("play");
    });
    navigator.mediaSession.setActionHandler("pause", () => {
      if (hasPermission("PLAYBACK_CONTROL")) socket.emit("pause");
    });
    navigator.mediaSession.setActionHandler("previoustrack", () => {
      if (hasPermission("SKIP_CONTROL")) socket.emit("previous");
    });
    navigator.mediaSession.setActionHandler("nexttrack", () => {
      if (hasPermission("SKIP_CONTROL")) socket.emit("next");
    });
  }

  function hasPermission(permission) {
    // For demonstration, assume role-based permissions stored locally in localStorage.user
    const user = JSON.parse(localStorage.getItem("user") || "{}");
    const userPermissions = user.permissions || {};
    // Fallback: if not explicitly disabled, allow actions (for demo purposes)
    return userPermissions[permission] !== "disabled";
  }
  
 
    // Play/Pause Button Logic
    playPauseButtonLarge.addEventListener("click", () => {
      if (playbackState.isPlaying) {
        socket.emit("pause");
      } else {
        socket.emit("play");
      }
    });
    // Loop Button Logic
    loopButton.addEventListener("click", () => {
      socket.emit("toggleLoop");
    });
    // Update UI based on playback state
    socket.on("playbackStateUpdate", (newState) => {
      playbackState = newState;
      updatePlaybackControls();
      updateLoopState();
    });
    function updateLoopState() {
      if (loopButton) {
        loopButton.classList.toggle("active", playbackState.isLoopEnabled);
      }
    }


    // Play/Pause Button Logic
  playPauseButtonLarge.addEventListener("click", () => {
    if (playbackState.isPlaying) {
      socket.emit("pause");
    } else {
      socket.emit("play");
    }
  });

  // Loop Button Logic
  loopButton.addEventListener("click", () => {
    socket.emit("toggleLoop");
  });

  // Update UI based on playback state
  socket.on("playbackStateUpdate", (newState) => {
    playbackState = newState;
    updatePlaybackControls();
    updateLoopState();
  });

  function updateLoopState() {
    if (loopButton) {
      loopButton.classList.toggle("active", playbackState.isLoopEnabled);
    }
  }

  // UI update functions
  function updateMiniPlayer(song) {
    if (song) {
      const fullText = `${song.title} - ${song.artist || "Unknown Artist"}`;
      miniPlayerSongInfo.textContent = fullText;
      if (mobileSongInfo) {
        const mobileText = fullText.length > 40 ? fullText.substring(0, 37) + "..." : fullText;
        mobileSongInfo.textContent = mobileText;
      }
    } else {
      miniPlayerSongInfo.textContent = "No song playing";
      if (mobileSongInfo) mobileSongInfo.textContent = "No song playing";
    }
  }

  function updateAudioToggleButton() {
    const enabled = playbackState.clientsPlayingAudio.includes(socket.id);
    audioToggleButton.innerHTML = enabled ? '<i class="fas fa-volume-up"></i>' : '<i class="fas fa-volume-mute"></i>';
    audioToggleButton.style.backgroundColor = enabled ? "green" : "red";
    if (mobileAudioToggleButton) {
      mobileAudioToggleButton.innerHTML = enabled ? '<i class="fas fa-volume-up"></i>' : '<i class="fas fa-volume-mute"></i>';
      mobileAudioToggleButton.style.color = enabled ? "#1DB954" : "#ff4444";
    }
  }

  function updatePlaybackControls() {
    playPauseButton.innerHTML = playbackState.isPlaying ? '<i class="fas fa-pause"></i>' : '<i class="fas fa-play"></i>';
    if (playPauseButtonLarge) playPauseButtonLarge.innerHTML = playbackState.isPlaying ? '<i class="fas fa-pause"></i>' : '<i class="fas fa-play"></i>';
    if (mobilePlayPauseButton) mobilePlayPauseButton.innerHTML = playbackState.isPlaying ? '<i class="fas fa-pause"></i>' : '<i class="fas fa-play"></i>';
  }

  function seekToPosition(event) {
    const rect = progressBar.getBoundingClientRect();
    const seekPos = (event.clientX - rect.left) / rect.width;
    const seekTime = seekPos * audioPlayer.duration;
    audioPlayer.currentTime = seekTime;
    progressBar.style.width = `${seekPos * 100}%`;
    socket.emit("seek", seekTime);
  }

  function updateQueueDisplay() {
    if (queueList) {
      queueList.innerHTML = "";
      queue.forEach((songFilePath, index) => {
        const song = window.songs && window.songs.find((s) => s.filePath === songFilePath);
        if (song) {
          const li = document.createElement("li");
          li.innerHTML = `<span class="drag-handle">&#9776;</span> ${index + 1}. ${song.title}`; //- ${song.artist || "Unknown Artist"}`;
          li.dataset.songId = song.filePath;
          const delBtn = document.createElement("button");
          delBtn.innerHTML = '<i class="fas fa-trash"></i>';
          delBtn.addEventListener("click", () => {
            socket.emit("removeFromQueue", index);
          });
          li.appendChild(delBtn);
          queueList.appendChild(li);
        }
      });
    }
  }

  function playSong(song) {
    if (!song) {
      console.error("No song to play");
      return;
    }
    const songUrl = `/api/stream/${encodeURIComponent(song.filePath)}`;
    if (audioPlayer.src !== songUrl || audioPlayer.ended) {
      audioPlayer.src = songUrl;
      audioPlayer.load();
      audioPlayer.currentTime = playbackState.currentTime;
    }
    if (albumArt) {
      albumArt.src = song.albumArtPath || "/images/placeholder.jpg";
      albumArt.onerror = () => (albumArt.src = "/images/placeholder.jpg");
    }
    audioPlayer.onloadeddata = () => {
      if (!playbackState.isPlaying) {
        audioPlayer.pause();
        return;
      }
      audioPlayer.play().then(() => {
        updatePlaybackControls();
        if ("mediaSession" in navigator) {
          navigator.mediaSession.metadata = new MediaMetadata({
            title: song.title,
            artist: song.artist || "Unknown Artist",
            album: song.album || "Unknown Album",
            artwork: [{ src: song.albumArtPath || "/images/placeholder.jpg" }],
          });
        }
      }).catch((error) => console.error("Error playing audio:", error));
    };
    audioPlayer.onerror = (error) => console.error("Audio error:", error);
  }

  function addSongToList(song) {
    const existing = songList.querySelectorAll(".song-item .title");
    for (let el of existing) {
      if (el.textContent === song.title) return;
    }
    const li = document.createElement("li");
    li.className = "song-item";
    li.dataset.songId = song.filePath;
    const titleSpan = document.createElement("span");
    titleSpan.className = "title";
    titleSpan.innerHTML = song.title;
    li.appendChild(titleSpan);
    const artistSpan = document.createElement("span");
    artistSpan.className = "artist";
    artistSpan.innerHTML = song.artist || "Unknown Artist";
    li.appendChild(artistSpan);
    const queueBtn = document.createElement("button");
    queueBtn.textContent = "Queue";
    queueBtn.addEventListener("click", () => {
      if (hasPermission("QUEUE_MANAGEMENT")) {
        socket.emit("addToQueue", song.filePath);
      } else {
        displayError("You don't have permission to queue songs.");
      }
    });
    li.appendChild(queueBtn);
    const deleteBtn = document.createElement("button");
    deleteBtn.innerHTML = '<i class="fas fa-trash"></i>';
    deleteBtn.addEventListener("click", () => {
      if (hasPermission("DELETE_SONGS")) {
        if (confirm(`Delete ${song.title}?`)) {
          fetch(`/api/delete/${encodeURIComponent(song.filePath)}`, { method: "DELETE" })
            .then(res => { if (res.ok) li.remove(); })
            .catch(err => {
              console.error("Delete error:", err);
              displayError("Error deleting song.");
            });
        }
      } else {
        displayError("You don't have permission to delete songs.");
      }
    });
    li.appendChild(deleteBtn);
    songList.appendChild(li);
  }

  function displayError(message) {
    errorMessageBox.textContent = message;
    errorMessageBox.classList.remove("hidden");
    setTimeout(() => {
      errorMessageBox.textContent = "";
      errorMessageBox.classList.add("hidden");
    }, 5000);
  }

  // Fetch songs from server
  fetch("/api/songs")
    .then(res => res.json())
    .then(songsFromServer => {
      window.songs = songsFromServer;
      songsFromServer.forEach(song => addSongToList(song));
    })
    .catch(err => {
      console.error("Error fetching songs:", err);
      displayError("Error fetching songs.");
    });

  // Navigation event handlers
  document.querySelectorAll(".nav a").forEach(link => {
    link.addEventListener("click", (e) => {
      e.preventDefault();
      const page = link.getAttribute("data-page");
      showPage(page);
      document.querySelectorAll('.nav a').forEach(item => item.classList.remove('active'));
      link.classList.add('active');
    });
  });
  window.addEventListener("popstate", (event) => {
    if (event.state && event.state.page) showPage(event.state.page, false);
    else showPage("databasePage", false);
  });
  function showPage(page, updateUrl = true) {
    document.querySelectorAll(".page").forEach(p => {
      p.classList.toggle("hidden", p.id !== page);
    });
    // Hide top bar controls and mobile controls when on Play page
    document.querySelector(".mini-player").classList.toggle("hidden", page === "playPage");
    document.querySelector(".mobile-top-bar").classList.toggle("hidden", page === "playPage");
    if (updateUrl) history.pushState({ page }, "", page === "databasePage" ? "/" : `/${page.replace("Page", "")}`);
  }
  const initialPage = window.location.pathname === "/" ? "databasePage" : `${window.location.pathname.substring(1)}Page`;
  showPage(initialPage, false);
  document.querySelector(`.nav a[data-page="${initialPage}"]`).classList.add('active');

  // Mini-player controls
  playPauseButton.addEventListener("click", () => {
    console.log("Play/Pause clicked, state:", playbackState.isPlaying);
    socket.emit(playbackState.isPlaying ? "pause" : "play");
  });
  nextButton.addEventListener("click", () => socket.emit("next"));
  prevButton.addEventListener("click", () => socket.emit("previous"));
  audioToggleButton.addEventListener("click", () => {
    const enabled = playbackState.clientsPlayingAudio.includes(socket.id);
    console.log("Toggle audio clicked. Current:", enabled);
    socket.emit("toggleAudioOutput", !enabled);
    updateAudioToggleButton();
    if (!enabled && playbackState.isPlaying) {
      playSong(playbackState.currentSong);
      audioPlayer.currentTime = playbackState.currentTime;
    }
  });
  volumeSlider.addEventListener("input", () => {
    localVolume = parseFloat(volumeSlider.value);
    audioPlayer.volume = localVolume;
  });
  progressBar.addEventListener("mousedown", (event) => {
    isSeeking = true;
    seekToPosition(event);
  });
  progressBar.addEventListener("mousemove", (event) => {
    if (isSeeking) seekToPosition(event);
  });
  progressBar.addEventListener("mouseup", () => { isSeeking = false; });
  progressBar.addEventListener("mouseleave", () => { isSeeking = false; });
  audioPlayer.addEventListener("ended", () => socket.emit("next"));
  audioPlayer.addEventListener("timeupdate", () => {
    if (!isSeeking && playbackState.currentSong && audioPlayer.duration) {
      // Update all progress bars
      const progress = (audioPlayer.currentTime / audioPlayer.duration) * 100;
      progressBar.style.width = `${progress}%`;
      // Update mobile progress bar
      const mobileProgressBar = document.querySelector('.mobile-progress .progress');
      if (mobileProgressBar) {
        mobileProgressBar.style.width = `${progress}%`;
      }
      // Update play page progress bar
      const playPageProgress = document.querySelector('.seek-bar .progress');
      if (playPageProgress) {
        playPageProgress.style.width = `${progress}%`;
      }
    }
  });

  // Enable drag-and-drop reordering of the queue
  if (window.Sortable && queueList) {
    new Sortable(queueList, {
      animation: 150,
      handle: '.drag-handle',
      onEnd: (evt) => {
        const newOrder = Array.from(queueList.children).map(item => item.dataset.songId);
        socket.emit("reorderQueue", newOrder);
      },
    });
  }

  // Search functionality
  searchButton.addEventListener("click", performSearch);
  searchInput.addEventListener("keyup", (event) => { if (event.key === "Enter") performSearch(); });

  function performSearch() {
    const query = searchInput.value;
    searchInput.disabled = true;
    searchButton.disabled = true;
    searchButton.textContent = "Searching...";
    searchLoadingIndicator.classList.remove("hidden");
    fetch(`/api/searchall?q=${query}`)
      .then(res => res.json())
      .then(results => {
        searchResultsList.innerHTML = "";
        results.db.forEach(result => {
          const li = document.createElement("li");
          li.className = "song-item";
          li.dataset.songId = result.filePath;
          li.innerHTML = `
            <div class="info">
              <span class="title">${result.title}</span>
              <span class="artist">${result.artist || "Unknown Artist"}</span>
            </div>
            <span class="source-label">DB</span>
            <button>Queue</button>
          `;
          li.querySelector("button").addEventListener("click", () => {
            if (hasPermission("QUEUE_MANAGEMENT")) {
              socket.emit("addToQueue", result.filePath);
            } else {
              displayError("You don't have permission to queue songs.");
            }
          });
          searchResultsList.appendChild(li);
        });
        results.yt.forEach(result => {
          const li = document.createElement("li");
          li.className = "song-item";
          li.dataset.youtubeId = result.id;
          li.innerHTML = `
            <img src="${result.thumbnails?.[0]?.url || '/images/placeholder.jpg'}" alt="Thumbnail" class="thumbnail">
            <div class="info">
              <span class="title">${result.title}</span>
              <span class="uploader">${result.uploader || "Unknown Artist"}</span>
            </div>
            <span class="source-label">YT</span>
            <button>${result.isDownloaded ? "Queue" : "Download"}</button>
          `;
          li.querySelector("button").addEventListener("click", () => {
            if (result.isDownloaded) {
              if (hasPermission("QUEUE_MANAGEMENT")) {
                socket.emit("addToQueue", result.filePath);
              } else {
                displayError("You don't have permission to queue songs.");
              }
            } else if (hasPermission("SEARCH_DOWNLOAD")) {
              downloadSong(result);
            } else {
              displayError("You don't have permission to download songs.");
            }
          });
          searchResultsList.appendChild(li);
        });
      })
      .catch(err => {
        console.error("Search error:", err);
        displayError("Error searching for songs.");
      })
      .finally(() => {
        searchInput.disabled = false;
        searchButton.disabled = false;
        searchButton.textContent = "Search";
        searchLoadingIndicator.classList.add("hidden");
      });
  }

  function downloadSong(result) {
    const url = `https://www.youtube.com/watch?v=${result.id}`;
    const songItem = document.querySelector(`li[data-youtube-id="${result.id}"]`);
    const downloadButton = songItem.querySelector("button");
    const infoDiv = songItem.querySelector(".info");
  
    if (!downloadButton || downloadButton.textContent === "Queue") return;
  
    // Add progress indicator
    const progressSpan = document.createElement("span");
    progressSpan.className = "download-progress";
    progressSpan.textContent = "0%";
    infoDiv.appendChild(progressSpan);
    
    downloadButton.textContent = "Downloading...";
    downloadButton.disabled = true;
  
    fetch("/api/download", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ 
        url, 
        title: result.title, 
        uploader: result.uploader 
      })
    })
      .then(async res => {
        if (!res.ok) {
          const errorText = await res.text();
          throw new Error(errorText || `Server error (${res.status})`);
        }
        return res.json();
      })
      .then(song => {
        if (!song || !song.filePath) {
          throw new Error("Invalid song data received");
        }
        
        addSongToList(song);
        window.songs.push(song);
  
        downloadButton.textContent = "Queue";
        downloadButton.disabled = false;
        downloadButton.onclick = () => {
          if (hasPermission("QUEUE_MANAGEMENT")) {
            socket.emit("addToQueue", song.filePath);
          } else {
            displayError("You don't have permission to queue songs.");
          }
        };
  
        songItem.dataset.downloaded = "true";
        progressSpan.remove();
      })
      .catch(err => {
        console.error("Download error:", err);
        const errorMsg = err.message.includes("Insufficient permissions") 
          ? "You don't have permission to download songs"
          : `Error downloading song: ${err.message}`;
        displayError(errorMsg);

        downloadButton.textContent = err.message.includes("Insufficient permissions") 
          ? "No Permission" 
          : "Retry Download";
        downloadButton.disabled = false;
        if (progressSpan) progressSpan.remove();
      });
  }
  
  

  dbSearchButton.addEventListener("click", performDbSearch);
  dbSearchInput.addEventListener("keyup", (event) => { if (event.key === "Enter") performDbSearch(); });

  function performDbSearch() {
    const query = dbSearchInput.value.toLowerCase();
    const filteredSongs = window.songs.filter(song => 
      song.title.toLowerCase().includes(query) || 
      (song.artist && song.artist.toLowerCase().includes(query))
    );
    
    songList.innerHTML = "";
    if (!filteredSongs.length) {
      const li = document.createElement("li");
      li.textContent = "No results found.";
      songList.appendChild(li);
    } else {
      filteredSongs.forEach(song => addSongToList(song));
    }
  }

  playPauseButtonLarge.addEventListener("click", () => socket.emit("playbackStateUpdate", playbackState.isPlaying ? "pause" : "play"));
  prevButtonLarge.addEventListener("click", () => socket.emit("previous"));
  nextButtonLarge.addEventListener("click", () => socket.emit("next"));
  loopButton.addEventListener("click", () => socket.emit("toggleLoop"));
  fullscreenButton.addEventListener("click", () => {
    if (document.fullscreenElement) document.exitFullscreen();
    else document.getElementById("playPage").requestFullscreen().catch(err => console.error("Fullscreen error:", err));
  });
  hamburgerMenu.addEventListener("click", () => sidebar.classList.toggle("open"));
  document.querySelectorAll(".sidebar-nav a").forEach(link => {
    link.addEventListener("click", (e) => {
      e.preventDefault();
      const page = link.getAttribute("data-page");
      showPage(page);
      sidebar.classList.remove("open");
    });
  });
  if (mobilePlayPauseButton) mobilePlayPauseButton.addEventListener("click", () => {
    if (playbackState.isPlaying) {
      socket.emit("pause");
    } else {
      socket.emit("play");
    }
  });
  if (mobileNextButton) mobileNextButton.addEventListener("click", () => socket.emit("next"));
  if (mobilePrevButton) mobilePrevButton.addEventListener("click", () => socket.emit("previous"));
  if (mobileAudioToggleButton) {
    mobileAudioToggleButton.addEventListener("click", () => {
      const enabled = playbackState.clientsPlayingAudio.includes(socket.id);
      socket.emit("toggleAudioOutput", !enabled);
      updateAudioToggleButton();
    });
  }

  // Socket event handlers and logging
  socket.on("playbackStateUpdate", (newState) => {
    console.log("Received playbackStateUpdate:", newState);
    playbackState = newState;
    updatePlaybackControls();
    audioPlayer.volume = playbackState.clientsPlayingAudio.includes(socket.id) ? localVolume : 0;
    if (playbackState.isPlaying && playbackState.clientsPlayingAudio.includes(socket.id)) {
      if (audioPlayer.paused) playSong(playbackState.currentSong);
      const diff = Math.abs(audioPlayer.currentTime - playbackState.currentTime);
      if (diff > 0.5) audioPlayer.currentTime = playbackState.currentTime;
    } else {
      audioPlayer.pause();
    }
    updateAudioToggleButton();
  });
  socket.on("currentlyPlaying", (song) => {
    console.log("Currently playing:", song);
    if (song) {
      currentSongTitle.textContent = song.title;
      currentSongArtist.textContent = song.artist || "Unknown Artist";
      updateMiniPlayer(song);
      if (mobileSongInfo) mobileSongInfo.textContent = song.title;
      if (playbackState.clientsPlayingAudio.includes(socket.id)) playSong(song);
    } else {
      currentSongTitle.textContent = "No song playing";
      currentSongArtist.textContent = "";
      updateMiniPlayer(null);
      audioPlayer.src = "";
      // Reset mobile progress bar when no song is playing
      const mobileProgressBar = document.querySelector('.mobile-progress .progress');
      if (mobileProgressBar) {
        mobileProgressBar.style.width = '0%';
      }
    }
  });
  socket.on("songAdded", (song) => {
    console.log("New song added:", song);
    addSongToList(song);
    window.songs = window.songs || [];
    window.songs.push(song);
  });
  socket.on("queueUpdate", (newQueue) => {
    console.log("Queue updated:", newQueue);
    queue = newQueue;
    updateQueueDisplay();
  });
  socket.on("loopState", (isLoop) => {
    if (loopButton) loopButton.classList.toggle("active", isLoop);
  });
  socket.on("error", (msg) => { console.error("Server error:", msg); displayError("Server error: " + msg); });

  console.log("App initialization complete.");
});
