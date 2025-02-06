// public/js/ui.js

import { fetchSongs, downloadSong, deleteSong, searchSongs } from './api.js';
import { playSong } from './player.js';

export function initializeUI(socket, playbackState, audioPlayer) { // Add audioPlayer
  try { // Wrap entire function in try...catch
    // Get references to DOM elements
    const miniPlayerSongInfo = document.querySelector('.mini-player .song-info');
    const playPauseButton = document.getElementById('playPauseButton');
    const nextButton = document.getElementById('nextButton');
    const prevButton = document.getElementById('prevButton');
    const progressBar = document.querySelector('.progress-bar .progress');
    const audioToggleButton = document.getElementById('audioToggleButton');
    const errorMessageBox = document.getElementById('error-message');

    const dbSearchInput = document.getElementById('dbSearchInput');
    const dbSearchButton = document.getElementById('dbSearchButton');
    const songList = document.getElementById('songList');

    const searchInput = document.getElementById('searchInput');
    const searchButton = document.getElementById('searchButton');
    const searchResultsList = document.getElementById('searchResults');
    const searchLoadingIndicator = document.getElementById('search-loading-indicator');

    const playPauseButtonLarge = document.getElementById('playPauseButtonLarge');
    const prevButtonLarge = document.getElementById('prevButtonLarge');
    const nextButtonLarge = document.getElementById('nextButtonLarge');
    const queueList = document.getElementById('queueList');
    const volumeSlider = document.getElementById('volumeSlider');
    const currentSongTitle = document.getElementById('currentSongTitle');
    const currentSongArtist = document.getElementById('currentSongArtist');
    const albumArt = document.getElementById('album-art');
    const loopButton = document.getElementById('loop-button');
    const fullscreenButton = document.getElementById('fullscreen-button');

    const mobilePlayPauseButton = document.getElementById('mobile-play-pause');
    const mobileNextButton = document.getElementById('mobile-next');
    const mobilePrevButton = document.getElementById('mobile-prev');
    const mobileAudioToggleButton = document.getElementById('mobile-audio-toggle');
    const mobileSongInfo = document.querySelector('.mobile-song-info');
    const hamburgerMenu = document.getElementById('hamburger-menu');
    const sidebar = document.querySelector('.sidebar');
    const hamburgerMenuDesktop = document.getElementById('hamburger-menu-desktop');
    let isSidebarOpen = false; // Keep track of sidebar state
    let isSeeking = false;
    let localVolume = 0.5;

    // Function to update the mini-player and mobile top bar
    function updateMiniPlayer(song) {
        if (song) {
            // Sanitize song title and artist before displaying
            const title = DOMPurify.sanitize(song.title);
            const artist = DOMPurify.sanitize(song.artist || 'Unknown Artist');

            if (window.innerWidth <= 768) {
                // Mobile: Use scrolling animation for title
                mobileSongInfo.style.animation = 'none'; // Remove animation
                void mobileSongInfo.offsetWidth; // Trigger reflow to restart animation
                mobileSongInfo.style.animation = null; // Re-apply animation
                mobileSongInfo.textContent = `${title} - ${artist}`;
                mobileSongInfo.style.animation = 'scrollText 10s linear infinite'; // Restart scrolling
            } else {
                // Desktop: Display title and artist normally
                miniPlayerSongInfo.innerHTML = `${title} - ${artist}`;
            }
        } else {
            miniPlayerSongInfo.textContent = "No song playing";
            if (window.innerWidth <= 768) {
                mobileSongInfo.textContent = "No song playing";
            }
        }
    }

        // Function to update the audio toggle button
    function updateAudioToggleButton() {
            const isAudioEnabled = playbackState.clientsPlayingAudio.includes(socket.id);
            audioToggleButton.innerHTML = isAudioEnabled ? '<i class="fas fa-volume-up"></i>' : '<i class="fas fa-volume-mute"></i>';
            audioToggleButton.style.backgroundColor = isAudioEnabled ? 'green' : 'red';
        if (mobileAudioToggleButton) {
                mobileAudioToggleButton.innerHTML = isAudioEnabled ? '<i class="fas fa-volume-up"></i>' : '<i class="fas fa-volume-mute"></i>';
            }
        }

        // Function to update playback controls based on playback state
        function updatePlaybackControls() {
            playPauseButton.innerHTML = playbackState.isPlaying ? '<i class="fas fa-pause"></i>' : '<i class="fas fa-play"></i>';
            if (playPauseButtonLarge) {
                playPauseButtonLarge.innerHTML = playbackState.isPlaying ? '<i class="fas fa-pause"></i>' : '<i class="fas fa-play"></i>';
            }
            if (mobilePlayPauseButton) {
                mobilePlayPauseButton.innerHTML = playbackState.isPlaying ? '<i class="fas fa-pause"></i>' : '<i class="fas fa-play"></i>';
            }
             // Update the progress bar here, based on playbackState
            if (progressBar && playbackState.currentSong && playbackState.currentSong.duration) {
                const progressPercent = (playbackState.currentTime / playbackState.currentSong.duration) * 100;
                progressBar.style.width = `${progressPercent}%`;
            }
        }

    // Function to handle mobile UI
    function handleMobileUI() {
        const isMobile = window.innerWidth <= 768;

        const topBar = document.querySelector('.top-bar');
        const mobileTopBar = document.querySelector('.mobile-top-bar');

        if (isMobile) {
            topBar.classList.add('hidden');
            mobileTopBar.classList.remove('hidden');
        } else {
            topBar.classList.remove('hidden');
            mobileTopBar.classList.add('hidden');
        }
    }

    // Function to switch pages (modified to handle URL and active link)
    function showPage(pageId, updateUrl = true) {
        const pages = document.querySelectorAll('.page');
        let visiblePage = false;

        pages.forEach(page => {
            if (page.id === pageId) {
                page.classList.remove('hidden');
                visiblePage = true;
            } else {
                page.classList.add('hidden');
            }
        });

        // If no page is visible, show the default page
        if (!visiblePage) {
            document.getElementById('databasePage').classList.remove('hidden');
        }

        // Update URL using pushState (if updateUrl is true)
        if (updateUrl) {
            const path = pageId === 'databasePage' ? '/' : `/${pageId.replace('Page', '')}`;
            history.pushState({ pageId }, null, path);
        }
    }
    // Function to update the queue display on the play page
    function updateQueueDisplay(queue) {
        if (queueList) {
            queueList.innerHTML = ''; // Clear the list
            queue.forEach((song, index) => {
                const listItem = document.createElement('li');
                listItem.innerHTML = `${index + 1}. ${DOMPurify.sanitize(song.title)} - ${DOMPurify.sanitize(song.artist || 'Unknown Artist')}`;
                listItem.dataset.id = `song-${song._id}`;

                const deleteButton = document.createElement('button');
                deleteButton.innerHTML = '<i class="fas fa-trash"></i>';
                deleteButton.addEventListener('click', () => {
                    socket.emit('removeFromQueue', index);
                });

                listItem.appendChild(deleteButton);
                queueList.appendChild(listItem);
            });
        }
    }

    // Add the song to the database list
    function addSongToList(song) {
      //Copied and adapted from app.js
        const existingSongs = songList.querySelectorAll('.song-item .title');
        for (let i = 0; i < existingSongs.length; i++) {
            if (existingSongs[i].textContent === song.title) {
                return;
            }
        }

        const listItem = document.createElement('li');
        listItem.classList.add('song-item');
        // Add database song id
        listItem.dataset.songId = song._id;

        const titleSpan = document.createElement('span');
        titleSpan.classList.add('title');
        // Sanitize song title before displaying
        titleSpan.innerHTML = DOMPurify.sanitize(song.title);
        listItem.appendChild(titleSpan);

        const artistSpan = document.createElement('span');
        artistSpan.classList.add('artist');
        // Sanitize song artist before displaying
        artistSpan.innerHTML = DOMPurify.sanitize(song.artist || 'Unknown Artist');
        listItem.appendChild(artistSpan);

        const queueButton = document.createElement('button');
        queueButton.textContent = 'Queue';
        queueButton.addEventListener('click', () => {
            socket.emit('addToQueue', song._id);
        });
        listItem.appendChild(queueButton);

        // Add delete button
        const deleteButton = document.createElement('button');
        deleteButton.innerHTML = '<i class="fas fa-trash"></i>'; // Use trash icon
        deleteButton.addEventListener('click', () => {
            if (confirm(`Are you sure you want to delete ${DOMPurify.sanitize(song.title)}?`)) {
                deleteSong(song._id) // Use the imported function
                .then(() => {
                    // Remove the song from the list
                    listItem.remove();
                })
                .catch(err => {
                    console.error('Error deleting song:', err);
                    displayError('Error deleting song.');
                });
            }
        });
        listItem.appendChild(deleteButton);

        songList.appendChild(listItem);
    }
    // Function to update the UI after a download is complete (or an error occurs)
    function updateUIAfterDownload(result, success) {
        const songListItems = searchResultsList.querySelectorAll('.song-item');

        songListItems.forEach(item => {
            if (item.dataset.youtubeId === result.youtubeId) {
                const progressSpan = item.querySelector('.download-progress');
                if (progressSpan) {
                    progressSpan.remove();
                }

                const downloadButton = item.querySelector('button');
                if (downloadButton) {
                    if (success) {
                        const queueButton = document.createElement('button');
                        queueButton.textContent = 'Queue';
                        queueButton.addEventListener('click', () => {
                            socket.emit('addToQueue', result._id);
                        });
                        item.replaceChild(queueButton, downloadButton);
                    } else {
                        downloadButton.disabled = true;
                        downloadButton.textContent = 'Error';
                    }
                }
            }
        });
    }

    function displayError(message) {
        if (errorMessageBox) {
            errorMessageBox.textContent = message;
            errorMessageBox.classList.remove('hidden');

            setTimeout(() => {
                errorMessageBox.textContent = '';
                errorMessageBox.classList.add('hidden');
            }, 5000);
        }
    }
    function seekToPosition(event) {
        const progressBarRect = progressBar.getBoundingClientRect();
        const seekPosition = (event.clientX - progressBarRect.left) / progressBarRect.width;
        const seekTime = seekPosition * audioPlayer.duration;

        // Update the audio player's current time
        audioPlayer.currentTime = seekTime;

        // Update the progress bar immediately
        progressBar.style.width = `${seekPosition * 100}%`;

        // Send the seek command to the server
        socket.emit('seek', seekTime);
    }

    // Event listeners for mini-player controls
    playPauseButton.addEventListener('click', () => {
        if (playbackState.isPlaying) {
            socket.emit('pause');
        } else {
            socket.emit('play');
        }
    });

    nextButton.addEventListener('click', () => {
        socket.emit('next');
    });

    prevButton.addEventListener('click', () => {
        socket.emit('previous');
    });

    // Event listener for audio toggle button
    audioToggleButton.addEventListener('click', () => {
        const isAudioEnabled = playbackState.clientsPlayingAudio.includes(socket.id);
        socket.emit('toggleAudioOutput', !isAudioEnabled);
        // Update the button immediately after toggling audio
        updateAudioToggleButton();
    });

    // Event listener for the large play/pause button on the "Play" page
    playPauseButtonLarge.addEventListener('click', () => {
        if (playbackState.isPlaying) {
            socket.emit('pause');
        } else {
            socket.emit('play');
        }
    });

    // Event listeners for the large previous and next buttons on the "Play" page
    prevButtonLarge.addEventListener('click', () => {
        socket.emit('previous');
    });

    nextButtonLarge.addEventListener('click', () => {
        socket.emit('next');
    });

    // Event listener for the loop button
    loopButton.addEventListener('click', () => {
        socket.emit('toggleLoop');
    });

    // Event listener for the fullscreen button
    fullscreenButton.addEventListener('click', () => {
        const playPage = document.getElementById('playPage');
        if (document.fullscreenElement) {
            document.exitFullscreen();
        } else {
            playPage.requestFullscreen().catch(err => {
                console.error("Error attempting to enable full-screen mode:", err);
            });
        }
    });

    // Event listener for the hamburger menu (mobile)
    hamburgerMenu.addEventListener('click', () => {
        isSidebarOpen = !isSidebarOpen;
        if (isSidebarOpen) {
            sidebar.classList.add('open');
        } else {
            sidebar.classList.remove('open');
        }
    });

    // Event listener for the hamburger menu (desktop)
    hamburgerMenuDesktop.addEventListener('click', () => {
        isSidebarOpen = !isSidebarOpen;
        if (isSidebarOpen) {
            sidebar.classList.add('open');
        } else {
            sidebar.classList.remove('open');
        }
    });

    // Event listeners for the mobile top bar buttons
    if (mobilePlayPauseButton) {
        mobilePlayPauseButton.addEventListener('click', () => {
            if (playbackState.isPlaying) {
                socket.emit('pause');
            } else {
                socket.emit('play');
            }
        });
    }

    if (mobileNextButton) {
        mobileNextButton.addEventListener('click', () => {
            socket.emit('next');
        });
    }

    if (mobilePrevButton) {
        mobilePrevButton.addEventListener('click', () => {
            socket.emit('previous');
        });
    }

    if (mobileAudioToggleButton) {
        mobileAudioToggleButton.addEventListener('click', () => {
            const isAudioEnabled = playbackState.clientsPlayingAudio.includes(socket.id);
            socket.emit('toggleAudioOutput', !isAudioEnabled);
            // Update the button immediately after toggling audio
            updateAudioToggleButton();
        });
    }
    // Event listener for volume control
    volumeSlider.addEventListener('input', () => {
        localVolume = parseFloat(volumeSlider.value); // Parse as float and store locally
        audioPlayer.volume = localVolume; // Update the audio element's volume
    });

    // Event listeners for seeking
    progressBar.addEventListener('mousedown', (event) => {
        isSeeking = true;
        seekToPosition(event);
    });

    progressBar.addEventListener('mousemove', (event) => {
        if (isSeeking) {
            seekToPosition(event);
        }
    });

    progressBar.addEventListener('mouseup', () => {
        isSeeking = false;
    });

    progressBar.addEventListener('mouseleave', () => {
        isSeeking = false;
    });

    // Event listener for clicks outside the sidebar (to close it)
    document.addEventListener('click', (event) => {
        if (isSidebarOpen && !sidebar.contains(event.target) && event.target !== hamburgerMenu && event.target !== hamburgerMenuDesktop) {
            isSidebarOpen = false;
            sidebar.classList.remove('open');
        }
    });

    // Add event listeners to sidebar links
    const sidebarLinks = document.querySelectorAll('.sidebar a');
    sidebarLinks.forEach(link => {
        link.addEventListener('click', (event) => {
            event.preventDefault();
            const pageId = link.getAttribute('data-page');

            // Close the sidebar on link click
            isSidebarOpen = false;
            sidebar.classList.remove('open');

            // Show the selected page
            showPage(pageId);
        });
    });

        // Event listener for search button on the "Add" page
    searchButton.addEventListener('click', () => {
      const query = searchInput.value;
      // Disable input and show loading indicator
      searchInput.disabled = true;
      searchButton.disabled = true;
      searchButton.textContent = "Searching...";
      searchLoadingIndicator.classList.remove("hidden");

      searchSongs(query)
      .then(results => {
          searchResultsList.innerHTML = ''; // Clear previous results

          const dbResults = results.db;
          const ytResults = results.yt;

          // Display database results
          dbResults.forEach((result) => {
              const listItem = document.createElement('li');
              listItem.classList.add('song-item');
              listItem.dataset.songId = result._id;

              const infoDiv = document.createElement('div');
              infoDiv.classList.add('info');

              const titleSpan = document.createElement('span');
              titleSpan.classList.add('title');
              titleSpan.innerHTML = DOMPurify.sanitize(result.title);
              infoDiv.appendChild(titleSpan);

              const artistSpan = document.createElement('span');
              artistSpan.classList.add('artist');
              artistSpan.innerHTML = DOMPurify.sanitize(result.artist || 'Unknown Artist');
              infoDiv.appendChild(artistSpan);

              listItem.appendChild(infoDiv);

              // Add a "DB" label to indicate the source
              const sourceLabel = document.createElement('span');
              sourceLabel.classList.add('source-label');
              sourceLabel.textContent = 'DB';
              listItem.appendChild(sourceLabel);

              const queueButton = document.createElement('button');
              queueButton.textContent = 'Queue';
              queueButton.addEventListener('click', () => {
                  socket.emit('addToQueue', result._id);
              });
              listItem.appendChild(queueButton);

              searchResultsList.appendChild(listItem);
          });

        // Display YouTube results
        ytResults.forEach((result) => {
            const listItem = document.createElement('li');
            listItem.classList.add('song-item');
            // Add data-youtube-id attribute
            listItem.dataset.youtubeId = result.id;
            // Add data-youtube-url attribute, and data-youtube-url
            listItem.dataset.youtubeUrl = result.url; // Store the full URL

            const img = document.createElement('img');
            img.src = result.thumbnails[0]?.url || 'placeholder.jpg';
            img.alt = 'Thumbnail';
            img.classList.add('thumbnail');
            listItem.appendChild(img);

            const infoDiv = document.createElement('div');
            infoDiv.classList.add('info');

            const titleSpan = document.createElement('span');
            titleSpan.classList.add('title');
            titleSpan.innerHTML = DOMPurify.sanitize(result.title);
            infoDiv.appendChild(titleSpan);

            const uploaderSpan = document.createElement('span');
            uploaderSpan.classList.add('uploader');
            uploaderSpan.innerHTML = DOMPurify.sanitize(result.uploader || 'Unknown Artist');
            infoDiv.appendChild(uploaderSpan);

            listItem.appendChild(infoDiv);

            // Add a "YT" label to indicate the source
            const sourceLabel = document.createElement('span');
            sourceLabel.classList.add('source-label');
            sourceLabel.textContent = 'YT';
            listItem.appendChild(sourceLabel);

            // Use 'isDownloaded' to determine the button type
            if (result.isDownloaded) {
                const queueButton = document.createElement('button');
                queueButton.textContent = 'Queue';
                queueButton.addEventListener('click', () => {
                    socket.emit('addToQueue', result._id);
                });
                listItem.appendChild(queueButton);
            } else {
                const downloadButton = document.createElement('button');
                downloadButton.textContent = 'Download';
                  downloadButton.addEventListener('click', () => {
                  // Pass the full URL to downloadSong
                  downloadSong(result);
                  downloadButton.disabled = true;
                  const progressSpan = document.createElement('span');
                  progressSpan.classList.add('download-progress');
                  progressSpan.textContent = ' (downloading...)';
                  listItem.appendChild(progressSpan);
              });
              listItem.appendChild(downloadButton);
            }
            searchResultsList.appendChild(listItem);
          });
      })
      .catch(err => {
          console.error('Error searching:', err);
          displayError('Error searching for songs.');
      })
      .finally(() => {
          // Re-enable input and reset button text
          searchInput.disabled = false;
          searchButton.disabled = false;
          searchButton.textContent = "Search";
          searchLoadingIndicator.classList.add("hidden");
      });
    });

    // Event listener for Enter key in search input on the "Add" page
    searchInput.addEventListener('keyup', (event) => {
        if (event.key === 'Enter') {
            searchButton.click(); // Trigger the search button's click event
        }
    });

    // Event listener for the database search button (Database page)
    dbSearchButton.addEventListener('click', () => {
        const query = dbSearchInput.value;
        console.log("Searching database. Query:", query);

        // Disable input and button while searching
        dbSearchInput.disabled = true;
        dbSearchButton.disabled = true;
        dbSearchButton.textContent = 'Searching...'; // Update button text

        fetchSongs(query)
            .then(songs => {
                console.log("Songs from db", songs);
                songList.innerHTML = ''; // Clear the current list
                if (songs.length === 0) {
                    // If no results, display a message
                    const noResultsItem = document.createElement('li');
                    noResultsItem.textContent = "No results found.";
                    songList.appendChild(noResultsItem);
                } else {
                    // Display the search results
                    songs.forEach(song => addSongToList(song));
                }
            })
            .catch(err => {
                console.error('Error searching database:', err);
                displayError('Error searching database.');
            })
            .finally(() => {
                // Re-enable input and button
                dbSearchInput.disabled = false;
                dbSearchButton.disabled = false;
                dbSearchButton.textContent = 'Search'; // Reset button text
            });
    });

    // Event listener for Enter key in search input on the "Database" page
    dbSearchInput.addEventListener('keyup', (event) => {
        if (event.key === 'Enter') {
            event.preventDefault();
            dbSearchButton.click(); // Trigger the database search button's click event
        }
    });
    // Call handleMobileUI on page load and resize
    handleMobileUI();
    window.addEventListener('resize', () => {
        handleMobileUI();
        updateMiniPlayer(playbackState.currentSong); // Update the mini-player in case of screen resize.
    });
    //Initializes Sortable
    if (queueList) {
        new Sortable(queueList, {
            animation: 150,
            onUpdate: (evt) => {
                const newQueueOrder = Array.from(queueList.children)
                    .map(item => item.dataset.id.replace('song-', ''));
                socket.emit('reorderQueue', newQueueOrder);
            }
        });
    }

    // Handle popstate event (for back/forward navigation)
    window.addEventListener('popstate', (event) => {
        if (event.state && event.state.pageId) {
            showPage(event.state.pageId, false); // Don't update URL again
        } else {
            // Handle cases where state might be null (e.g., initial load)
            const path = window.location.pathname;
            const pageId = path === '/' ? 'databasePage' : `${path.substring(1)}Page`;
            showPage(pageId, false); // Use the ui module
        }
    });

    // Expose functions for other modules to use (if necessary)
    return {
        updateMiniPlayer,
        updateAudioToggleButton,
        updatePlaybackControls,
        updateQueueDisplay,
        addSongToList,
        handleMobileUI,
        showPage,
        displayError,
        updateUIAfterDownload,
        seekToPosition
    };
} catch (error){
    console.error("Error in initializeUI", error);
  }
}

export { initializeUI };