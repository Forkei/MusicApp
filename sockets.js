const { Song, Queue } = require('./models'); // Import models
const mongoose = require('mongoose');

function initializeSocketIO(io, serverState) {
    console.log("Inside initializeSocketIO, io:", io); // ADD THIS
    console.log("Inside initializeSocketIO, serverState:", serverState); // ADD THIS
    io.on('connection', (socket) => {
        console.log('A user connected:', socket.id);

        serverState.clients[socket.id] = { socket };

        socket.emit('queueUpdate', serverState.queue.filter(song => song._id !== serverState.serverPlaybackState.currentSong?._id));
        socket.emit('playbackStateUpdate', serverState.playbackState);
        socket.emit('loopState', serverState.isLoopEnabled); // Send initial loop state

        socket.on('disconnect', () => {
            console.log('A user disconnected:', socket.id);
            const index = serverState.playbackState.clientsPlayingAudio.indexOf(socket.id);
            if (index > -1) {
                serverState.playbackState.clientsPlayingAudio.splice(index, 1);
            }
            delete serverState.clients[socket.id];
        });

        // Add a song to the queue
        socket.on('addToQueue', async (songId) => {
            try {
                // Validate songId
                if (!mongoose.Types.ObjectId.isValid(songId)) {
                    socket.emit('error', 'Invalid song ID');
                    return;
                }

                const song = await Song.findById(songId);
                if (song) {
                    // Add to the end of the queue
                    serverState.queue.push(song);
                    io.emit('queueUpdate', serverState.queue.filter(s => s._id !== serverState.serverPlaybackState.currentSong?._id));
                    await serverState.saveQueueToDatabase() // Access saveQueueToDatabase
                        .catch(err => {
                            console.error('Error saving queue to database:', err);
                            socket.emit('error', 'Failed to save queue. Please try again.');
                        });
                } else {
                    socket.emit('error', 'Song not found');
                }
            } catch (err) {
                console.error('Error adding to queue:', err);
                socket.emit('error', 'Error adding to queue');
            }
        });

        // Remove a song from the queue
        socket.on('removeFromQueue', async (songIndex) => {
            try {
                if (songIndex >= 0 && songIndex < serverState.queue.length) {
                    serverState.queue.splice(songIndex, 1);
                    io.emit('queueUpdate', serverState.queue.filter(song => song._id !== serverState.serverPlaybackState.currentSong?._id));
                    await serverState.saveQueueToDatabase();  // Access saveQueueToDatabase
                } else {
                    socket.emit('error', 'Invalid song index');
                }
            } catch (err) {
                console.error('Error removing from queue:', err);
                socket.emit('error', 'Error removing from queue');
            }
        });

        // Clear the queue
        socket.on('clearQueue', async () => {
            try {
                serverState.queue = [];
                io.emit('queueUpdate', serverState.queue);
                await serverState.saveQueueToDatabase(); // Access saveQueueToDatabase
            } catch (err) {
                console.error('Error clearing queue:', err);
                socket.emit('error', 'Error clearing queue');
            }
        });

        // Reorder the queue
        socket.on('reorderQueue', async (newQueueOrder) => {
        try {
            if (Array.isArray(newQueueOrder)) {
                const newQueueSongs = [];
                for (const songId of newQueueOrder) {
                    if (!mongoose.Types.ObjectId.isValid(songId)) {
                        console.error('Error reordering queue: Invalid song ID:', songId);
                        socket.emit('error', `Invalid song ID: ${songId}`);
                        return;
                    }
                    const song = await Song.findById(songId);
                    if (song) {
                        newQueueSongs.push(song);
                    } else {
                        console.error('Error reordering queue: Song not found:', songId);
                        socket.emit('error', `Song not found: ${songId}`);
                        return;
                    }
                }

                serverState.queue = newQueueSongs;
                io.emit('queueUpdate', serverState.queue.filter(song => song._id !== serverState.serverPlaybackState.currentSong?._id));
                await serverState.saveQueueToDatabase() // Access saveQueueToDatabase
                    .catch(err => {
                        console.error('Error saving queue to database:', err);
                        socket.emit('error', 'Failed to save queue. Please try again.');
                    });
                console.log('Queue reordered');
            } else {
                console.error('Error reordering queue: Invalid queue data');
                socket.emit('error', 'Invalid queue data');
            }
        } catch (err) {
            console.error('Error reordering queue:', err);
            socket.emit('error', 'Error reordering queue');
        }
    });

        // Toggle audio output for a client
        socket.on('toggleAudioOutput', (enable) => {
            const clientId = socket.id;
            if (enable) {
                if (!serverState.playbackState.clientsPlayingAudio.includes(clientId)) {
                    serverState.playbackState.clientsPlayingAudio.push(clientId);
                }
                // If the client enables audio and a song is playing, seek to the server's position
                if (serverState.serverPlaybackState.isPlaying) {
                    const serverTime = serverState.getCurrentPlaybackPosition();
                    console.log("Client enabled, seeking to:", serverTime);
                    socket.emit('seek', serverTime / 1000); // Send seek command in seconds
                }
            } else {
                const index = serverState.playbackState.clientsPlayingAudio.indexOf(clientId);
                if (index > -1) {
                    serverState.playbackState.clientsPlayingAudio.splice(index, 1);
                }
            }
            console.log('Client audio output toggled:', clientId, enable);
            io.emit('playbackStateUpdate', serverState.playbackState);
        });

        // Playback control events
        socket.on('play', () => {
            if (serverState.queue.length > 0 && !serverState.serverPlaybackState.isPlaying) {
                // If there's no current song, start playing the first song in the queue
                if (!serverState.serverPlaybackState.currentSong) {
                    serverState.startPlaying(serverState.queue[0]);
                } else {
                    // Otherwise, resume playing
                    serverState.resumePlaying();
                }
             } else if (serverState.queue.length === 0 && !serverState.serverPlaybackState.isPlaying) {
                // Stop playing if the queue is empty
                serverState.playbackState.isPlaying = false;
                serverState.serverPlaybackState.isPlaying = false;
                serverState.serverPlaybackState.currentSong = null;
                serverState.serverPlaybackState.currentTime = 0;
                io.emit('playbackStateUpdate', serverState.playbackState);
                io.emit('currentlyPlaying', null);
                console.log('Queue is empty, playback stopped');
            }
        });

        socket.on('pause', () => {
            if (serverState.serverPlaybackState.isPlaying) {
                serverState.pausePlaying();
            }
        });

        socket.on('next', () => {
            if (serverState.queue.length > 0) {
                // If loop is enabled, move the current song to the end of the queue
                if (serverState.isLoopEnabled && serverState.serverPlaybackState.currentSong) {
                    serverState.queue.push(serverState.serverPlaybackState.currentSong);
                }

                serverState.queue.shift(); // Remove the current song from the queue
                serverState.seekTo(0);
                if (serverState.queue.length > 0) {
                    serverState.startPlaying(serverState.queue[0]); // Start playing the new first song
                } else {
                    // Handle case where queue is now empty
                    serverState.serverPlaybackState.currentSong = null;
                    serverState.serverPlaybackState.isPlaying = false;
                    io.emit('queueUpdate', serverState.queue);
                    io.emit('currentlyPlaying', null); // Indicate nothing is playing
                }
                serverState.saveQueueToDatabase();
            }
        });

        socket.on('previous', () => {
            // For simplicity, we'll just restart the current song from the beginning
            if (serverState.serverPlaybackState.currentSong) {
                serverState.seekTo(0); // Seek to the beginning of the song
            }
        });

        socket.on('seek', (time) => {
            // Basic validation of time
            if (typeof time === 'number' && time >= 0) {
                serverState.seekTo(time * 1000); // Convert seconds to milliseconds
            } else {
                console.error('Invalid seek time:', time);
                socket.emit('error', 'Invalid seek time');
            }
        });

        // Toggle loop state
        socket.on('toggleLoop', () => {
            serverState.isLoopEnabled = !serverState.isLoopEnabled;
            io.emit('loopState', serverState.isLoopEnabled); // Emit new loop state to all clients
            console.log('Loop toggled:', serverState.isLoopEnabled);
        });
    });
}

module.exports = initializeSocketIO;