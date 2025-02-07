// --- START OF FILE app.js ---

const socket = io();

document.addEventListener('DOMContentLoaded', () => {
    let queue = [];
    let playbackState = {
        isPlaying: false,
        currentSong: null,
        currentTime: 0,
        volume: 0.5,
        clientsPlayingAudio: []
    };
    let localVolume = 0.5; // Client-specific volume

    const audioPlayer = document.getElementById('audioPlayer');
    audioPlayer.volume = localVolume;
    let isSeeking = false;

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
    const defaultAlbumArt = 'images/placeholder.jpg';
    const loopButton = document.getElementById('loop-button');
    const fullscreenButton = document.getElementById('fullscreen-button');

    const mobilePlayPauseButton = document.getElementById('mobile-play-pause');
    const mobileNextButton = document.getElementById('mobile-next');
    const mobilePrevButton = document.getElementById('mobile-prev');
    const mobileAudioToggleButton = document.getElementById('mobile-audio-toggle');
    const mobileSongInfo = document.querySelector('.mobile-song-info');
    const hamburgerMenu = document.getElementById('hamburger-menu');
    const sidebar = document.querySelector('.sidebar');

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

        // Update active link
        const navLinks = document.querySelectorAll('.nav a');
        navLinks.forEach(link => {
            if (link.getAttribute('data-page') === pageId) {
                link.classList.add('active');
            } else {
                link.classList.remove('active');
            }
        });

        // Update URL using pushState (if updateUrl is true)
        if (updateUrl) {
            const path = pageId === 'databasePage' ? '/' : `/${pageId.replace('Page', '')}`;
            history.pushState({ pageId }, null, path);
        }
    }

    // Function to update the mini-player
    function updateMiniPlayer(song) {
        if (song) {
            // Sanitize song title and artist before displaying
            const title = DOMPurify.sanitize(song.title);
            const artist = DOMPurify.sanitize(song.artist || 'Unknown Artist');
            miniPlayerSongInfo.innerHTML = `${title} - ${artist}`;
            if (mobileSongInfo) {
                const maxLength = 20;
                mobileSongInfo.innerHTML = `${truncateText(title, maxLength)} - ${truncateText(artist, maxLength)}`;
            }
        } else {
            miniPlayerSongInfo.textContent = "No song playing";
            if (mobileSongInfo) {
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

    // Function to update the queue display on the play page
    function updateQueueDisplay() {
        if (queueList) {
            queueList.innerHTML = ''; // Clear the list
            queue.forEach((songFilePath, index) => {
                const song = songs.find(s => s.filePath === songFilePath); // Find the song by filePath
                if (song) { // Check if the song object was found
                    const listItem = document.createElement('li');
                    listItem.innerHTML = `${index + 1}. ${DOMPurify.sanitize(song.title)} - ${DOMPurify.sanitize(song.artist || 'Unknown Artist')}`;
                    listItem.dataset.songId = song.filePath; // Use filePath as ID

                    const deleteButton = document.createElement('button');
                    deleteButton.innerHTML = '<i class="fas fa-trash"></i>';
                    deleteButton.addEventListener('click', () => {
                        socket.emit('removeFromQueue', index);
                    });

                    listItem.appendChild(deleteButton);
                    queueList.appendChild(listItem);
                }
            });
        }
    }
    // Function to start playing a song
    function playSong(song) {
        if (!song) {
            console.error("No song provided to playSong function");
            return;
        }

        const songUrl = `/api/stream/${encodeURIComponent(song.filePath)}`; // Encode file path
        console.log("Attempting to play song from URL:", songUrl);

        // Update the audio player's source only if it's a new song or if it was previously stopped
        if (audioPlayer.src !== songUrl || audioPlayer.ended) {
            audioPlayer.src = songUrl;
            audioPlayer.load(); // Load the new song
            audioPlayer.currentTime = playbackState.currentTime;
        }

        // Update album art
        const albumArtPath = song.albumArtPath ? 'images/{song.albumArtPath}' : 'images/placeholder.jpg'
        


        if (albumArt) {
            albumArt.src = albumArtPath || defaultAlbumArt;
        }

        console.log(albumArtPath)
        console.log(albumArt)

        // Play the audio when it's ready
        audioPlayer.onloadeddata = () => {
            // If isPlaying is false, pause immediately after loading
            if (!playbackState.isPlaying) {
                audioPlayer.pause();
                return;
            }
            // Play the song if isPlaying is true
            if (playbackState.isPlaying) {
                audioPlayer.play()
                    .then(() => {
                        console.log("Audio playback started");
                        updatePlaybackControls();
                        if ('mediaSession' in navigator) {
                            navigator.mediaSession.metadata = new MediaMetadata({
                                title: DOMPurify.sanitize(song.title),
                                artist: DOMPurify.sanitize(song.artist || 'Unknown Artist'),
                                album: DOMPurify.sanitize(song.album || 'Unknown Album'),
                                artwork: [{ src: albumArtPath || 'placeholder.jpg' }]
                            });
                        }
                    })
                    .catch(error => {
                        console.error("Error playing audio:", error);
                        updatePlaybackControls();
                    });
            }
        };

        audioPlayer.onerror = (error) => {
            console.error("Audio player error:", error);
            updatePlaybackControls();
        };
    }

    // Add the song to the database list
    function addSongToList(song) {
        const existingSongs = songList.querySelectorAll('.song-item .title');
        for (let i = 0; i < existingSongs.length; i++) {
            if (existingSongs[i].textContent === song.title) {
                return;
            }
        }

        const listItem = document.createElement('li');
        listItem.classList.add('song-item');
        // Add file path
        listItem.dataset.songId = song.filePath;

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
            socket.emit('addToQueue', song.filePath);
        });
        listItem.appendChild(queueButton);

        // Add delete button
        const deleteButton = document.createElement('button');
        deleteButton.innerHTML = '<i class="fas fa-trash"></i>'; // Use trash icon
        deleteButton.addEventListener('click', () => {
            if (confirm(`Are you sure you want to delete ${DOMPurify.sanitize(song.title)}?`)) {
                fetch(`/api/delete/${encodeURIComponent(song.filePath)}`, { method: 'DELETE' })
                    .then(res => {
                        if (res.ok) {
                            // Remove the song from the list
                            listItem.remove();
                        } else {
                             return res.json().then(errData => {
                                throw new Error(errData.error || 'Failed to delete song');
                            });
                        }
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
                            socket.emit('addToQueue', result.filePath);
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

    function downloadSong(result) {
        fetch('/api/download', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ url: result.url, title: result.title, id: result.id, uploader: result.uploader })
        })
            .then(res => {
                if (!res.ok) {
                    return res.json().then(errData => {
                        throw new Error(errData.error || 'Network response was not ok');
                    });
                }
                return res.json();
            })
            .then(song => {
                console.log('Song downloaded:', song);
                updateUIAfterDownload(song, true);
                addSongToList(song);
            })
            .catch(err => {
                console.error('Error downloading song:', err);
                displayError('Error downloading song. See console for details.');
                updateUIAfterDownload(result, false);
            });
    }

    // Function to display an error message in the UI
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

    // Fetch and display existing songs on page load
    fetch('/api/songs')
        .then(res => res.json())
        .then(songs => {
            songs.forEach(song => addSongToList(song));
        })
        .catch(err => {
            console.error('Error fetching songs:', err);
            displayError('Error fetching songs.');
        });

    // Event listeners for navigation links
    const navLinks = document.querySelectorAll('.nav a');
    navLinks.forEach(link => {
        link.addEventListener('click', (event) => {
            event.preventDefault();
            const pageId = link.getAttribute('data-page');
            showPage(pageId);
        });
    });

    // Handle popstate event (for back/forward navigation)
    window.addEventListener('popstate', (event) => {
        if (event.state && event.state.pageId) {
            showPage(event.state.pageId, false); // Don't update URL again
        } else {
            // Handle cases where state might be null (e.g., initial load)
            const path = window.location.pathname;
            const pageId = path === '/' ? 'databasePage' : `${path.substring(1)}Page`;
            showPage(pageId, false);
        }
    });

    // Show the default page on load (based on initial URL)
    const initialPath = window.location.pathname;
    const initialPageId = initialPath === '/' ? 'databasePage' : `${initialPath.substring(1)}Page`;
    showPage(initialPageId, false); // Don't update URL on initial load

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

        // If enabling audio and a song is playing, start playing and seek to the server's position
        if (!isAudioEnabled && playbackState.isPlaying) {
            playSong(playbackState.currentSong);
            audioPlayer.currentTime = playbackState.currentTime;
        }
    });

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

    // Event listener for the 'ended' event of the audio player
    audioPlayer.addEventListener('ended', () => {
        console.log("Audio playback ended");
        socket.emit('next');
    });

    // Update the progress bar as the song plays
    audioPlayer.addEventListener('timeupdate', () => {
        if (!isSeeking && playbackState.currentSong && audioPlayer.duration) {
            const progressPercent = (audioPlayer.currentTime / audioPlayer.duration) * 100;
            progressBar.style.width = `${progressPercent}%`;
        }
    });

    // Make the queue list sortable
    let sortableQueue = null;

    if (queueList) {
        sortableQueue = new Sortable(queueList, {
            animation: 150,
            onUpdate: (evt) => {
                const newQueueOrder = sortableQueue.toArray();
                socket.emit('reorderQueue', newQueueOrder);
            }
        });
    }

    // Event listener for search button on the "Add" page
    searchButton.addEventListener('click', () => {
        const query = searchInput.value;
        // Disable input and show loading indicator
        searchInput.disabled = true;
        searchButton.disabled = true;
        searchButton.textContent = "Searching...";
        searchLoadingIndicator.classList.remove("hidden");

        fetch(`/api/searchall?q=${query}`)
            .then(res => {
                if (!res.ok) {
                    throw new Error('Network response was not ok');
                }
                return res.json();
            })
            .then(results => {
                searchResultsList.innerHTML = ''; // Clear previous results

                const dbResults = results.db;
                const ytResults = results.yt;

                // Display local results
                dbResults.forEach((result) => {
                    const listItem = document.createElement('li');
                    listItem.classList.add('song-item');
                    listItem.dataset.songId = result.filePath; // Use filePath as ID

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
                        socket.emit('addToQueue', result.filePath);
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
                            socket.emit('addToQueue', result.filePath); // Use filePath
                        });
                        listItem.appendChild(queueButton);
                    } else {
                        const downloadButton = document.createElement('button');
                        downloadButton.textContent = 'Download';
                        downloadButton.addEventListener('click', () => {
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
        console.log("Searching local files. Query:", query);

        // Disable input and button while searching
        dbSearchInput.disabled = true;
        dbSearchButton.disabled = true;
        dbSearchButton.textContent = 'Searching...'; // Update button text

        fetch(`/api/songs?q=${query}`)
            .then(res => {
                if (!res.ok) {
                    throw new Error('Network response was not ok');
                }
                return res.json();
            })
            .then(songs => {
                console.log("Songs from local files", songs);
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
                console.error('Error searching local files:', err);
                displayError('Error searching local files.');
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
    let isSidebarOpen = false;

    hamburgerMenu.addEventListener('click', () => {
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

            // If enabling audio and a song is playing, start playing and seek to the server's position
            if (!isAudioEnabled && playbackState.isPlaying) {
                playSong(playbackState.currentSong);
                audioPlayer.currentTime = playbackState.currentTime;
            }
        });
    }

    // Socket event listeners
    socket.on('connect', () => {
        console.log('Connected to server');
    });

    socket.on('songAdded', (song) => {
        addSongToList(song);
        songs.push(song);
    });

    socket.on('playbackStateUpdate', (newPlaybackState) => {
        playbackState = newPlaybackState;
        updatePlaybackControls();
        audioPlayer.volume = playbackState.clientsPlayingAudio.includes(socket.id) ? localVolume : 0;

        const shouldPlayAudio = playbackState.clientsPlayingAudio.includes(socket.id);

        if (playbackState.isPlaying && shouldPlayAudio) {
             if (!playbackState.currentSong) {
                console.warn("playbackState.isPlaying is true, but currentSong is null");
                return;
            }
            if (audioPlayer.paused || audioPlayer.ended) {
                console.log('Client: Starting playback');

                playSong(playbackState.currentSong);
            }

            // Perform a seek only if there's a significant time difference
            const timeDiff = Math.abs(audioPlayer.currentTime - playbackState.currentTime);
            if (timeDiff > 0.5) {
                console.log('Client: Seeking to server time:', playbackState.currentTime);
                audioPlayer.currentTime = playbackState.currentTime;
            }
        } else {
            console.log("Client should pause audio");
            audioPlayer.pause(); // Pause if audio shouldn't be playing or the song is not set
        }

        updateAudioToggleButton();
    });

    socket.on('currentlyPlaying', (song) => {
        console.log("currentlyPlaying", song);
        if (song) {
            // Update the play page elements if they exist
            if (currentSongTitle) currentSongTitle.innerHTML = DOMPurify.sanitize(song.title);
            if (currentSongArtist) currentSongArtist.innerHTML = DOMPurify.sanitize(song.artist || 'Unknown Artist');
            // Update the mini-player
            updateMiniPlayer(song);

            // Only play the song if the client has audio enabled
            if (playbackState.clientsPlayingAudio.includes(socket.id)) {
                playSong(song);
            }
        } else {
            // Handle case where no song is playing
            if (currentSongTitle) currentSongTitle.textContent = 'No song playing';
            if (currentSongArtist) currentSongArtist.textContent = '';
            updateMiniPlayer(null); // Clear the mini-player info
            audioPlayer.src = '';
        }
    });

    socket.on('queueUpdate', (updatedQueue) => {
        queue = updatedQueue;
        updateQueueDisplay();
    });

    socket.on('seek', (time) => {
        console.log("Seeking to:", time);
        audioPlayer.currentTime = time;
    });

    socket.on('loopState', (isLoopEnabled) => {
        // Update the loop button appearance based on the loop state
        if (loopButton) {
            loopButton.classList.toggle('active', isLoopEnabled);
        }
    });

    socket.on('error', (errorMessage) => {
        console.error('Server error:', errorMessage);
        displayError('Server error: ' + errorMessage);
    });

    // Function to handle mobile UI
    function handleMobileUI() {
        const isMobile = window.innerWidth <= 768; // Adjust breakpoint as needed

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

    // Function to handle full-screen landscape mode
    function handleFullscreenLandscape() {
        const isFullscreen = document.fullscreenElement !== null;
        const isLandscape = window.innerWidth > window.innerHeight && isFullscreen;

        const playPage = document.getElementById('playPage');
        const queueContainer = document.querySelector('.queue'); // Assuming you have a container for the queue

        if (isLandscape) {
            playPage.classList.add('fullscreen-landscape');
            if (queueContainer) {
                queueContainer.style.display = 'none';
            }
            // Make other layout adjustments as needed
        } else {
            playPage.classList.remove('fullscreen-landscape');
            if (queueContainer) {
                queueContainer.style.display = 'block';
            }
            // Revert layout adjustments
        }
    }

    // Function to truncate text (used for mobile song title)
    function truncateText(text, maxLength) {
        if (text.length > maxLength) {
            return text.substring(0, maxLength - 3) + '...';
        }
        return text;
    }

    // Call handleMobileUI on page load and resize
    handleMobileUI();
    window.addEventListener('resize', handleMobileUI);

    // Call handleFullscreenLandscape when fullscreen changes
    document.addEventListener('fullscreenchange', handleFullscreenLandscape);
    document.addEventListener('webkitfullscreenchange', handleFullscreenLandscape); // For Safari
    document.addEventListener('mozfullscreenchange', handleFullscreenLandscape); // For Firefox
    document.addEventListener('MSFullscreenChange', handleFullscreenLandscape); // For IE/Edge

        // Event listener for clicks outside the sidebar (to close it)
        document.addEventListener('click', (event) => {
    if (isSidebarOpen && !sidebar.contains(event.target) && event.target !== hamburgerMenu) {
        isSidebarOpen = false;
        sidebar.classList.remove('open');
    }
        });

    // Media Session API Implementation (if supported)
    if ('mediaSession' in navigator) {
        navigator.mediaSession.metadata = new MediaMetadata({
            title: '',
            artist: '',
            album: '',
            artwork: []
        });

        navigator.mediaSession.setActionHandler('play', () => {
            if (playbackState.isPlaying) {
                socket.emit('pause');
            } else {
                socket.emit('play');
            }
        });
        navigator.mediaSession.setActionHandler('pause', () => {
            if (playbackState.isPlaying) {
                socket.emit('pause');
            } else {
                socket.emit('play');
            }
        });
        navigator.mediaSession.setActionHandler('previoustrack', () => socket.emit('previous'));
        navigator.mediaSession.setActionHandler('nexttrack', () => socket.emit('next'));
    }
});          