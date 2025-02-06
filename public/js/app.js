import { initializeUI, updateMiniPlayer, updateAudioToggleButton, updatePlaybackControls, showPage } from './ui.js';
import { playSong } from './player.js';
import { fetchSongs } from './api.js';

const socket = io(); // Create the Socket.IO client instance *correctly*
console.log("socket object in app.js:", socket); // ADD THIS

document.addEventListener('DOMContentLoaded', () => {
    // Initial playback state (will be updated by the server)
    let playbackState = {
        isPlaying: false,
        currentSong: null,
        currentTime: 0,
        volume: 0.5, // Default volume
        clientsPlayingAudio: []
    };
    let localVolume = 0.5;
    const audioPlayer = document.getElementById('audioPlayer');
    audioPlayer.volume = localVolume; // Apply initial volume
    let isSeeking = false;


    // --- Wait for Socket.IO Connection Before Doing Anything ---
    socket.on('connect', () => {
        console.log('Connected to server');

        // *Now* it's safe to initialize the UI and fetch data
        // Wrap in try...catch to handle initialization errors
        try {
            const ui = initializeUI(socket, playbackState, audioPlayer); // Pass audioPlayer

            // Fetch initial song list and update UI
            fetchSongs()
                .then(songs => {
                    songs.forEach(song => ui.addSongToList(song));
                })
                .catch(err => {
                    console.error('Error fetching initial songs:', err);
                    ui.displayError('Error fetching initial songs.');
                });

            // Show the default page (databasePage)
            const initialPath = window.location.pathname;
            const initialPageId = initialPath === '/' ? 'databasePage' : `${initialPath.substring(1)}Page`;
            ui.showPage(initialPageId, false);


            // --- Socket.IO Event Handlers (Now within the 'connect' handler) ---
            socket.on('queueUpdate', (updatedQueue) => {
                // Update the queue display
                ui.updateQueueDisplay(updatedQueue);
            });

            socket.on('playbackStateUpdate', (newPlaybackState) => {
                playbackState = newPlaybackState; // Update local playback state
                ui.updatePlaybackControls();
                audioPlayer.volume = playbackState.clientsPlayingAudio.includes(socket.id) ? localVolume : 0;

                const shouldPlayAudio = playbackState.clientsPlayingAudio.includes(socket.id);
                if(playbackState.isPlaying && shouldPlayAudio) {
                    if (audioPlayer.paused || audioPlayer.ended || audioPlayer.currentTime !== playbackState.currentTime ) { // Added condition
                        playSong(playbackState.currentSong, audioPlayer, playbackState, ui.updatePlaybackControls); // Use player.js
                    }
                 }
                else {
                   if (playbackState.currentSong) { // Check for currentSong before pausing
                        audioPlayer.pause();
                   }
                }

                ui.updateAudioToggleButton();
            });

            socket.on('currentlyPlaying', (song) => {

                if (song) {
                    // Update the "Play" page
                    const currentSongTitle = document.getElementById('currentSongTitle');
                    const currentSongArtist = document.getElementById('currentSongArtist');
                    if (currentSongTitle) currentSongTitle.innerHTML = DOMPurify.sanitize(song.title);
                    if (currentSongArtist) currentSongArtist.innerHTML = DOMPurify.sanitize(song.artist || 'Unknown Artist');

                    ui.updateMiniPlayer(song);

                    // Start playing *only* if audio is enabled for this client
                    if (playbackState.clientsPlayingAudio.includes(socket.id)) {
                         playSong(song, audioPlayer, playbackState, ui.updatePlaybackControls);
                    }
                } else {
                    // Handle case where no song is playing
                    const currentSongTitle = document.getElementById('currentSongTitle');
                    const currentSongArtist = document.getElementById('currentSongArtist');
                    if (currentSongTitle) currentSongTitle.textContent = 'No song playing';
                    if (currentSongArtist) currentSongArtist.textContent = '';
                    ui.updateMiniPlayer(null); // Clear the mini-player
                    audioPlayer.src = '';
                }
            });

            socket.on('seek', (time) => {
                console.log("Seeking to:", time);
                  audioPlayer.currentTime = time;

            });

            socket.on('loopState', (isLoopEnabled) => {
                const loopButton = document.getElementById('loop-button');
                if (loopButton) {
                    if (isLoopEnabled) {
                        loopButton.classList.add('active');
                    } else {
                        loopButton.classList.remove('active');
                    }
                }
            });
          socket.on('error', (errorMessage) => {
            console.error('Server error:', errorMessage);
            ui.displayError('Server error: ' + errorMessage); // Use the ui module's function
        });

            // --- Other Event Listeners ---

            // Handle popstate event (for back/forward navigation)
            window.addEventListener('popstate', (event) => {
                if (event.state && event.state.pageId) {
                    ui.showPage(event.state.pageId, false);
                } else {
                    const path = window.location.pathname;
                    const pageId = path === '/' ? 'databasePage' : `${path.substring(1)}Page`;
                    ui.showPage(pageId, false);
                }
            });
            // Update the progress bar as the song plays
            audioPlayer.addEventListener('timeupdate', () => {
                if (!isSeeking && playbackState.currentSong && audioPlayer.duration) {
                    const progressPercent = (audioPlayer.currentTime / audioPlayer.duration) * 100;
                    progressBar.style.width = `${progressPercent}%`;
                }
            });

            audioPlayer.addEventListener('ended', () => {
                console.log("Audio playback ended");
                socket.emit('next');
            });
        } catch (error) {
            console.error("Error within socket.on('connect'):", error);
        }
    }); // End of socket.on('connect')
}); // End of DOMContentLoaded