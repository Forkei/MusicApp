// public/js/player.js

export function playSong(song, audioPlayer, playbackState, updatePlaybackControls) {
    if (!song) {
        console.error("No song provided to playSong function");
        return;
    }

    const songUrl = `/api/stream/${song._id}`;
    console.log("Attempting to play song from URL:", songUrl);

    // Update the audio player's source only if it's a new song or if it was previously stopped/paused
    if (audioPlayer.src !== songUrl || audioPlayer.ended || audioPlayer.paused) {
        audioPlayer.src = songUrl;
        audioPlayer.load(); // Load the new song.  Important for seeking to work correctly.
        audioPlayer.currentTime = playbackState.currentTime;
    }

    // Update album art
    const albumArt = document.getElementById('album-art');
    if (albumArt) {
        albumArt.src = song.albumArtPath || 'placeholder.jpg';
    }

    // Play the audio when it's ready
    audioPlayer.onloadeddata = () => {
        // If isPlaying is false, pause immediately after loading
        if (!playbackState.isPlaying) {
            audioPlayer.pause();
            return;  // Important to return, to avoid starting playback
        }

        // Play the song if isPlaying is true
        audioPlayer.play()
            .then(() => {
                console.log("Audio playback started");
                updatePlaybackControls(); // Update UI (play/pause button)

                // Update Media Session API metadata
                if ('mediaSession' in navigator) {
                    navigator.mediaSession.metadata = new MediaMetadata({
                        title: DOMPurify.sanitize(song.title),  // Sanitize!
                        artist: DOMPurify.sanitize(song.artist || 'Unknown Artist'),
                        album: DOMPurify.sanitize(song.album || 'Unknown Album'),
                        artwork: [{ src: song.albumArtPath || 'placeholder.jpg' }]
                    });
                }
            })
            .catch(error => {
                console.error("Error playing audio:", error);
                updatePlaybackControls(); // Update UI even on error
            });
    };

    audioPlayer.onerror = (error) => {
        console.error("Audio player error:", error);
        updatePlaybackControls(); // Update UI on error
    };
}