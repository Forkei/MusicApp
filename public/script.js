// public/script.js
const socket = io();

// DOM Elements
const searchInput = document.getElementById('search-input');
const searchButton = document.getElementById('search-button');
const searchResultsDiv = document.getElementById('search-results');
const queueList = document.getElementById('queue-list');
const libraryList = document.getElementById('library-list');
const playPauseButton = document.getElementById('play-pause-button');
const nextButton = document.getElementById('next-button');
const previousButton = document.getElementById('previous-button');
const loopButton = document.getElementById('loop-button'); // Loop button
const seekBar = document.getElementById('seek-bar');
const volumeBar = document.getElementById('volume-bar');
const audioPlayer = document.getElementById('audio-player');
const errorMessageDiv = document.getElementById('error-message');
const clearQueueButton = document.getElementById('clear-queue-button');
const currentSongTitle = document.getElementById('current-song-title');
const playingSongTitle = document.getElementById('playing-song-title');
const albumArt = document.getElementById('album-art');
const currentTimeSpan = document.getElementById('current-time');
const durationSpan = document.getElementById('duration');
const fullscreenButton = document.getElementById('fullscreen-button');
const hamburgerMenu = document.querySelector('.hamburger-menu');
const sidebar = document.querySelector('.sidebar');
const closeSidebarButton = document.querySelector('.close-sidebar');
const navSearch = document.getElementById('nav-search');
const navQueue = document.getElementById('nav-queue');
const navLibrary = document.getElementById('nav-library');
const searchPage = document.getElementById('search-page');
const queuePage = document.getElementById('queue-page');
const libraryPage = document.getElementById('library-page');
const playPage = document.getElementById('play-page');
const audioEnabledCheckbox = document.getElementById('audio-enabled');

let songs = [];
let queue = [];
let currentSongIndex = 0;
let isPlaying = false;
let isLooping = false;
let isSeeking = false;
let sortableQueue;  //For drag and drop
let audioEnabled = true;

function showError(message) {
    errorMessageDiv.textContent = message;
    errorMessageDiv.classList.remove('hidden');
    setTimeout(() => {
        errorMessageDiv.classList.add('hidden');
    }, 5000); // Hide after 5 seconds
}

function clearSearchResults() {
    searchResultsDiv.innerHTML = '';
}

function renderSearchResults(results) {
    clearSearchResults();
    const ul = document.createElement('ul');
    results.forEach(result => {
        const li = document.createElement('li');
        li.textContent = result.title;
        li.addEventListener('click', () => {
            socket.emit('download', result.url);
            clearSearchResults();
        });
        ul.appendChild(li);
    });
    searchResultsDiv.appendChild(ul);
}
function createQueueItem(song, index){
    const li = document.createElement('li');
    li.textContent = song.title;
    li.dataset.filename = song.filename;
    const removeButton = document.createElement('button');
    removeButton.innerHTML = '<i class="fas fa-trash"></i>';
    removeButton.addEventListener('click', (event) => {
        event.stopPropagation(); // Prevent triggering li click
        socket.emit('removeFromQueue', index);
    });
    li.appendChild(removeButton);
    return li;
}

function renderQueue() {
    queueList.innerHTML = '';
    queue.forEach((song, index) => {
        const li = createQueueItem(song, index)
        queueList.appendChild(li);
    });
    //Make the queue sortable
    if (sortableQueue){
        sortableQueue.destroy()
    }
      sortableQueue = new Sortable(queueList, {
        animation: 150,
        onEnd: () => {
          const newQueue = Array.from(queueList.children).map(li => ({
            filename: li.dataset.filename,
            filePath: songs.find(song => song.filename === li.dataset.filename).filePath, // Find full song data
            title: songs.find(song => song.filename === li.dataset.filename).title,
          }));
          socket.emit('reorderQueue', newQueue);
        }
      });
}

function createLibraryItem(song) {
    const li = document.createElement('li');
    li.textContent = song.title;
    const addButton = document.createElement('button');
    addButton.innerHTML = '<i class="fas fa-plus"></i>'; // Add a plus icon
    addButton.addEventListener('click', (event) => {
        event.stopPropagation();
        socket.emit('addToQueue', song.filename);
    });

    const deleteButton = document.createElement('button');
    deleteButton.innerHTML = '<i class="fas fa-trash"></i>';
    deleteButton.addEventListener('click', (event) => {
        event.stopPropagation();
        socket.emit('deleteSong', song.filename);
    });
    li.appendChild(addButton);
    li.appendChild(deleteButton);
    return li;
}

function renderLibrary() {
    libraryList.innerHTML = '';
    songs.forEach(song => {
        const li = createLibraryItem(song);
        libraryList.appendChild(li);
    });
}

function updatePlaybackControls() {
    if (isPlaying) {
        playPauseButton.innerHTML = '<i class="fas fa-pause"></i>';
        if(audioEnabled) audioPlayer.play();
    } else {
        playPauseButton.innerHTML = '<i class="fas fa-play"></i>';
        audioPlayer.pause();
    }

    if (isLooping) {
        loopButton.classList.add('active'); // Highlight when active
    } else {
        loopButton.classList.remove('active');
    }
}


function updateCurrentSongDisplay() {
    if (queue.length > 0) {
      const songData = queue[currentSongIndex];
      const albumArtFilename = songData.filename.replace('.mp3', '.jpg');
        currentSongTitle.textContent = songData.title;
        playingSongTitle.textContent = songData.title;
        albumArt.src = `/albumart/${albumArtFilename}`;
    } else {
        currentSongTitle.textContent = "No song playing";
        playingSongTitle.textContent = "No song playing";
        albumArt.src = ''; // Clear the image
    }
    updateDuration()
}

function updateSeekTime(){
     if (!isSeeking) {
            seekBar.value = audioPlayer.currentTime;
            currentTimeSpan.textContent = formatTime(audioPlayer.currentTime);
        }
}
function updateDuration(){
    if (!isNaN(audioPlayer.duration)) {
            seekBar.max = audioPlayer.duration;
            durationSpan.textContent = formatTime(audioPlayer.duration);
        }
}

function formatTime(seconds) {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = Math.floor(seconds % 60);
    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
}

// Event Listeners
if (searchButton) {
  searchButton.addEventListener('click', () => {
    const query = searchInput.value.trim();
    if (query) {
      socket.emit('search', query);
    }
  });
}

if (playPauseButton){
  playPauseButton.addEventListener('click', () => {
      if (isPlaying) {
          socket.emit('pause');
      } else {
          socket.emit('play');
      }
  });
}

if (nextButton) {
  nextButton.addEventListener('click', () => {
    socket.emit('next');
  });
}

if (previousButton) {
    previousButton.addEventListener('click', () => {
        socket.emit('previous');
    });
}

if (loopButton) {
    loopButton.addEventListener('click', () => {
        socket.emit('toggleLoop');
    });
}

if(clearQueueButton){
  clearQueueButton.addEventListener('click', () => {
    socket.emit('clearQueue');
  });
}


if(seekBar) {
    seekBar.addEventListener('input', () => {
      isSeeking = true;
      currentTimeSpan.textContent = formatTime(seekBar.value);
    });

    seekBar.addEventListener('change', () => {
        socket.emit('seek', parseFloat(seekBar.value));
        isSeeking = false;
        //Move audio player time, too, for immediate effect
        audioPlayer.currentTime = parseFloat(seekBar.value);
    });
}
if (volumeBar) {
    volumeBar.addEventListener('input', () => {
        audioPlayer.volume = volumeBar.value;
    });
}

if (audioPlayer) {
    audioPlayer.addEventListener('ended', () => {
        if (isLooping) {
            socket.emit('seek', 0); // Reset to beginning for looping
            socket.emit('play'); // Re-play for looping
        } else {
            socket.emit('next'); // Go to the next song
        }
    });
    audioPlayer.addEventListener('timeupdate', () => {
        updateSeekTime()
    });
    audioPlayer.addEventListener('durationchange', () => {
        updateDuration();
    })
}

if(fullscreenButton) {
    fullscreenButton.addEventListener('click', () => {
        if (document.fullscreenElement) {
            document.exitFullscreen();
        } else {
            playPage.requestFullscreen();
        }
    });
}

if (hamburgerMenu) {
    hamburgerMenu.addEventListener('click', () => {
        sidebar.classList.add('open');
    });
}

if (closeSidebarButton){
  closeSidebarButton.addEventListener('click', () => {
      sidebar.classList.remove('open');
  });
}

function showPage(pageId) {
    // Hide all pages
    document.querySelectorAll('.page').forEach(page => {
        page.classList.remove('active');
        page.classList.add('hidden');
    });

    // Show the selected page
    const page = document.getElementById(pageId);
    if (page) {
        page.classList.remove('hidden');
        page.classList.add('active');
    }

    // Close sidebar after navigation (for mobile)
    sidebar.classList.remove('open');
}

if (navSearch) {
    navSearch.addEventListener('click', (event) => {
      event.preventDefault(); // Prevent default anchor behavior
        showPage('search-page');
    });
}

if (navQueue) {
    navQueue.addEventListener('click', (event) => {
      event.preventDefault();
        showPage('queue-page');
    });
}
if(navLibrary){
    navLibrary.addEventListener('click', (event) => {
      event.preventDefault();
      showPage('library-page');
    });
}

//Initial state
showPage('search-page');


audioEnabledCheckbox.addEventListener('change', () => {
  audioEnabled = audioEnabledCheckbox.checked;
  if (audioEnabled && isPlaying){
    audioPlayer.play()
  }
  else audioPlayer.pause()

})

// Socket event handlers
socket.on('initialState', (data) => {
    songs = data.songs;
    queue = data.queue;
    currentSongIndex = data.currentSongIndex;
    isPlaying = data.isPlaying;
    isLooping = data.isLooping;
    currentTime = data.currentTime;
    renderLibrary();
    renderQueue();
    updatePlaybackControls();
    updateCurrentSongDisplay();
    if (queue.length > 0) {
        audioPlayer.src = `/stream/${queue[currentSongIndex].filename}`;
        audioPlayer.currentTime = currentTime;
        updateDuration()
        updateSeekTime()

    }

});

socket.on('searchResults', (results) => {
    renderSearchResults(results);
});

socket.on('downloadComplete', (data) => {
    showPage("library-page")
});

socket.on('songsUpdated', (updatedSongs) => {
    songs = updatedSongs;
    renderLibrary();
});

socket.on('queueUpdated', (updatedQueue) => {
    queue = updatedQueue;
    renderQueue();
    //If the queue was empty and now is not, update the player and display
    if(queue.length > 0 && audioPlayer.src === ""){
        currentSongIndex = 0;
        audioPlayer.src = `/stream/${queue[currentSongIndex].filename}`;
        updateCurrentSongDisplay();
    }
});

socket.on('playbackState', (data) => {
    isPlaying = data.isPlaying;
    currentSongIndex = data.currentSongIndex;
    isLooping = data.isLooping;
    currentTime = data.currentTime;

    if (queue.length > 0 && queue[currentSongIndex]) {
        //Only change src if different
        if(audioPlayer.src !==  window.location.origin + `/stream/${queue[currentSongIndex].filename}`){
          audioPlayer.src = `/stream/${queue[currentSongIndex].filename}`;
        }
        audioPlayer.currentTime = currentTime;
        updateSeekTime()
        updateDuration()
    } else {
      //No song, ensure player is stopped and visuals are reset
        audioPlayer.src = ''
        audioPlayer.currentTime = 0
        currentTime = 0
        isPlaying = false
    }
    updatePlaybackControls();
    updateCurrentSongDisplay();
});

socket.on('error', (message) => {
    showError(message);
});

// Initial render and event listeners setup
document.addEventListener('DOMContentLoaded', () => {

  if (audioPlayer.readyState >= 2){
    updateDuration()
  }
  showPage('search-page'); // Default page

});