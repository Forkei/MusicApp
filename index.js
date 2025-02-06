const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config();
const routes = require('./routes');
const { checkYtDlpInstallation, syncDatabaseWithAudioDirectory } = require('./utils');
const initializeSocketIO = require('./sockets');
const { Queue, Song } = require('./models');

const app = express();
const server = http.createServer(app);
const io = socketIo(server); // Create the Socket.IO instance, correctly

const PORT = process.env.PORT || 3000;
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/music-player';
const AUDIO_DIR = process.env.AUDIO_DIR;

if (!AUDIO_DIR) {
    console.error("AUDIO_DIR environment variable not set!");
    process.exit(1);
}

// --- Server-Side Initialization (Encapsulated in a Promise) ---

async function initializeServer() {
    // Check for yt-dlp installation
    const ytDlpInstalled = await checkYtDlpInstallation();
    if (!ytDlpInstalled) {
        console.error('yt-dlp is not installed. Please install it and try again.');
        process.exit(1); // Exit if yt-dlp is not installed
    }

    // Connect to MongoDB
    await mongoose.connect(MONGODB_URI);
    console.log('Connected to MongoDB');

    // Load initial queue from the database
    let queue = [];
    try {
        let queueDoc = await Queue.findOne().populate('songs');
        if (!queueDoc) {
            queueDoc = new Queue({ songs: [] });
            await queueDoc.save();
        } else {
            queue = queueDoc.songs;
        }
        console.log('Queue loaded from database:', queue.length, 'songs');
    } catch (err) {
        console.error('Error loading queue from database:', err);
        // We *don't* exit here, as the server can still function without a queue
    }

    // Initialize server state (fully populated before Socket.IO)
    const serverState = {
        queue,  // Initial queue loaded from DB
        playbackState: {
            isPlaying: false,
            currentSong: null,
            currentTime: 0,
            volume: 1.0,
            clientsPlayingAudio: []
        },
        serverPlaybackState: {
            currentSong: null,
            isPlaying: false,
            startTime: null,
            pausedTime: null,
            seekTime: null
        },
        isLoopEnabled: false,
        clients: {}, // Client connections managed by sockets.js
        io, // The Socket.IO server instance
        saveQueueToDatabase: async () => { // Moved saveQueue inside
            try {
                const queueDoc = await Queue.findOne();
                if (queueDoc) {
                    queueDoc.songs = serverState.queue.filter(song => song && song._id !== serverState.serverPlaybackState.currentSong?._id).map(song => song._id);
                    await queueDoc.save();
                    console.log('Queue saved to database');
                }
            } catch (err) {
                console.error('Error saving queue to database:', err);
            }
        },
        startPlaying, //defined below
        pausePlaying, //defined below
        resumePlaying, //defined below
        seekTo, //defined below
        getCurrentPlaybackPosition //defined below

    };
        console.log("Inside initializeServer, serverState before sync:", serverState); // ADD THIS
        await syncDatabaseWithAudioDirectory(AUDIO_DIR, serverState);
        console.log("Inside initializeServer, serverState after sync:", serverState); // ADD THIS
    return serverState; // Resolve with the fully populated serverState
}

// --- Server-Side Playback Control Functions (Defined *within* the scope where serverState is available) ---

function startPlaying(song) {
    serverState.serverPlaybackState.currentSong = song;
    serverState.serverPlaybackState.isPlaying = true;
    serverState.serverPlaybackState.startTime = Date.now();
    serverState.serverPlaybackState.pausedTime = null;
    serverState.serverPlaybackState.seekTime = null;
    serverState.io.emit('currentlyPlaying', song);
    console.log('Server starts playing:', song.title);
}

function pausePlaying() {
    serverState.serverPlaybackState.isPlaying = false;
    serverState.serverPlaybackState.pausedTime = Date.now();
    serverState.io.emit('playbackStateUpdate', serverState.playbackState);
    console.log('Server paused playback');
}

function resumePlaying() {
    if (serverState.serverPlaybackState.currentSong) {
        serverState.serverPlaybackState.isPlaying = true;
        serverState.serverPlaybackState.startTime += (Date.now() - serverState.serverPlaybackState.pausedTime);
        serverState.serverPlaybackState.pausedTime = null;
        serverState.io.emit('playbackStateUpdate', serverState.playbackState);
        console.log('Server resumed playback');
    }
}

function seekTo(time) {
    if (serverState.serverPlaybackState.currentSong) {
        serverState.serverPlaybackState.seekTime = time;
        serverState.serverPlaybackState.startTime = Date.now() - time;
        if (!serverState.serverPlaybackState.isPlaying) {
            serverState.serverPlaybackState.pausedTime = Date.now();
        }
        for (const clientId in serverState.clients) {
            if (serverState.playbackState.clientsPlayingAudio.includes(clientId)) {
                serverState.clients[clientId].socket.emit('seek', time / 1000);
            }
        }

        serverState.playbackState.currentTime = time / 1000; // Update for the UI
        serverState.io.emit('playbackStateUpdate', serverState.playbackState);
        console.log('Server seeking to:', time);
    }
}

function getCurrentPlaybackPosition() {
     if (serverState.serverPlaybackState.currentSong) {
        return serverState.serverPlaybackState.isPlaying
            ? (Date.now() - serverState.serverPlaybackState.startTime)
            : (serverState.serverPlaybackState.seekTime !== null ? serverState.serverPlaybackState.seekTime : 0);
    }
    return 0;
}

// --- Main Application Entry Point (Async) ---

async function main() {
    try {
        // Initialize the server (wait for it to complete)
        const serverState = await initializeServer();
        console.log("ServerState after initializeServer:", serverState); // ADD THIS

        // Initialize Socket.IO (now with the complete serverState)
        initializeSocketIO(io, serverState); // Pass the io instance *and* serverState

        // Set up Express middleware
        app.use(express.json());
        app.use(express.static(path.join(__dirname, 'public')));

        // Set up Express routes
        app.use('/', routes);
        app.get('*', (req, res) => {
            res.sendFile(path.join(__dirname, 'public', 'index.html'));
        });

        // Global error handler
        app.use((err, req, res, next) => {
            console.error(err.stack);
            res.status(500).send('Something broke!');
        });

        // Start the server
        server.listen(PORT, () => {
            console.log(`Server listening on port ${PORT}`);
        });

        // Periodically emit playback state updates (outside the IIFE)
        setInterval(() => {
            if (serverState.serverPlaybackState.isPlaying) {
                const serverTime = getCurrentPlaybackPosition();
                io.emit('playbackStateUpdate', {
                    ...serverState.playbackState,
                    currentTime: serverTime / 1000, // Send time in seconds
                    currentSong: serverState.serverPlaybackState.currentSong,
                    isPlaying: serverState.serverPlaybackState.isPlaying
                });
            }  else if (serverState.serverPlaybackState.currentSong == null) {
                io.emit('playbackStateUpdate', {
                    ...serverState.playbackState,
                    currentTime: 0,
                    currentSong: null,
                    isPlaying: false
                });
            }
        }, 1000);


    } catch (err) {
        console.error('Error during server initialization:', err);
    }
}

// Start the application
main();