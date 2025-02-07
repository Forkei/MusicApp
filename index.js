// --- START OF FILE index.js ---

const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const util = require('util');
const exec = util.promisify(require('child_process').exec);
const fs = require('fs'); // Import the original fs module
const fsp = require('fs').promises; // Use fsp for fs.promises for easier async/await
const ffmpeg = require('fluent-ffmpeg');
const path = require('path');
const os = require('os');
const sanitize = require('sanitize-filename');


const app = express();
const server = http.createServer(app);
const io = socketIo(server);

const PORT = process.env.PORT || 3000;
const AUDIO_DIR = path.join(__dirname, 'Audio');

// Function to check for yt-dlp installation
async function checkYtDlpInstallation() {
    try {
        await exec('yt-dlp --version');
        console.log('yt-dlp installation found.');
        return true;
    } catch (error) {
        console.error('yt-dlp installation not found or error checking version:', error);
        return false;
    }
}

// In-memory song storage
let songs = [];

// In-memory queue
let queue = [];

// Playback State (for clients)
let playbackState = {
    isPlaying: false,
    currentSong: null,
    currentTime: 0,
    volume: 1.0, // Default volume
    clientsPlayingAudio: [] // Keep track of clients with audio enabled
};

// Server-Side Playback State (for tracking time even when no audio is playing)
let serverPlaybackState = {
    currentSong: null,
    isPlaying: false,
    startTime: null, // Timestamp when the song started playing
    pausedTime: null, // Timestamp when the song was paused
    seekTime: null // Timestamp representing the last seek position
};

// Connected Clients
const clients = {};

// Global variable for loop state
let isLoopEnabled = false;

// Middleware to parse JSON request bodies
app.use(express.json());

// Serve static files from the 'public' directory
app.use(express.static(path.join(__dirname, 'public')));

async function loadQueueFromFile() {
    try {
        const data = await fsp.readFile('queue.json', 'utf8');
        let loadedQueue = JSON.parse(data);
        queue = loadedQueue.filter(filePath => filePath.startsWith(AUDIO_DIR));
        console.log('Queue loaded from file:', queue.length, 'songs');
    } catch (err) {
        if (err.code === 'ENOENT') {
            console.log('queue.json not found, starting with an empty queue.');
            queue = [];
        } else {
            console.error('Error loading queue from file:', err);
        }
    }
}

async function saveQueueToFile() {
    try {
        const data = JSON.stringify(queue.filter(filePath => filePath.startsWith(AUDIO_DIR)));
        await fsp.writeFile('queue.json', data, 'utf8');
        console.log('Queue saved to file');
    } catch (err) {
        console.error('Error saving queue to file:', err);
    }
}

// Start playing a song (server-side)
function startPlaying(song) {
    serverPlaybackState.currentSong = song;
    serverPlaybackState.isPlaying = true;
    serverPlaybackState.startTime = Date.now();
    serverPlaybackState.pausedTime = null;
    serverPlaybackState.seekTime = null;
    io.emit('currentlyPlaying', song); // Inform all clients
    console.log('Server starts playing:', song.title);
}

// Pause playing (server-side)
function pausePlaying() {
    serverPlaybackState.isPlaying = false;
    serverPlaybackState.pausedTime = Date.now();
    io.emit('playbackStateUpdate', playbackState); // Inform all clients about the pause
    console.log('Server paused playback');
}

// Resume playing (server-side)
function resumePlaying() {
    if (serverPlaybackState.currentSong) {
        serverPlaybackState.isPlaying = true;
        // Adjust start time based on paused time
        serverPlaybackState.startTime += (Date.now() - serverPlaybackState.pausedTime);
        serverPlaybackState.pausedTime = null;
        io.emit('playbackStateUpdate', playbackState); // Inform all clients about the resume
        console.log('Server resumed playback');
    }
}

// Seek to a specific time (server-side)
function seekTo(time) {
    if (serverPlaybackState.currentSong) {
        serverPlaybackState.seekTime = time; // time expected in milliseconds
        // Adjust start time based on seek
        serverPlaybackState.startTime = Date.now() - time;
        // If the server was paused, and we seek, we should probably remain paused
        if (!serverPlaybackState.isPlaying) {
            serverPlaybackState.pausedTime = Date.now();
        }

        // Immediately seek for clients with audio enabled
        for (const clientId in clients) {
            if (playbackState.clientsPlayingAudio.includes(clientId)) {
                clients[clientId].socket.emit('seek', time / 1000); // Convert milliseconds to seconds
            }
        }

        // Update the server's currentTime
        playbackState.currentTime = time / 1000;

        io.emit('playbackStateUpdate', playbackState); // Inform all clients about the seek
        console.log('Server seeking to:', time);
    }
}

// Get current playback position (server-side)
function getCurrentPlaybackPosition() {
    if (serverPlaybackState.currentSong) {
        if (serverPlaybackState.isPlaying) {
            return (Date.now() - serverPlaybackState.startTime);
        } else {
            return (serverPlaybackState.seekTime !== null) ? serverPlaybackState.seekTime : 0;
        }
    }
    return 0; // No song playing
}

// Periodically emit playback state updates (e.g., every second)
setInterval(() => {
    if (serverPlaybackState.isPlaying) {
        const serverTime = getCurrentPlaybackPosition();
        io.emit('playbackStateUpdate', {
            ...playbackState,
            currentTime: serverTime / 1000, // Send time in seconds
            currentSong: serverPlaybackState.currentSong,
            isPlaying: serverPlaybackState.isPlaying
        });
    } else if (serverPlaybackState.currentSong == null) {
        io.emit('playbackStateUpdate', {
            ...playbackState,
            currentTime: 0,
            currentSong: null,
            isPlaying: false
        });
    }
}, 1000);

io.on('connection', (socket) => {
    console.log('A user connected:', socket.id);

    clients[socket.id] = { socket };

    socket.emit('queueUpdate', queue.filter(filePath => filePath !== serverPlaybackState.currentSong?.filePath));
    socket.emit('playbackStateUpdate', playbackState);
    socket.emit('loopState', isLoopEnabled); // Send initial loop state

    socket.on('disconnect', () => {
        console.log('A user disconnected:', socket.id);
        const index = playbackState.clientsPlayingAudio.indexOf(socket.id);
        if (index > -1) {
            playbackState.clientsPlayingAudio.splice(index, 1);
        }
        delete clients[socket.id];
    });

    // Add a song to the queue
    socket.on('addToQueue', async (songFilePath) => {
        try {
            const song = songs.find(s => s.filePath === songFilePath);
            if (song) {
                queue.push(song.filePath);
                io.emit('queueUpdate', queue.filter(filePath => filePath !== serverPlaybackState.currentSong?.filePath));
                await saveQueueToFile();
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
            if (songIndex >= 0 && songIndex < queue.length) {
                queue.splice(songIndex, 1);
                io.emit('queueUpdate', queue.filter(filePath => filePath !== serverPlaybackState.currentSong?.filePath));
                await saveQueueToFile();
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
            queue = [];
            io.emit('queueUpdate', queue);
            await saveQueueToFile();
        } catch (err) {
            console.error('Error clearing queue:', err);
            socket.emit('error', 'Error clearing queue');
        }
    });

    // Reorder the queue
    socket.on('reorderQueue', async (newQueueOrder) => {
    try {
        if (Array.isArray(newQueueOrder)) {
            const newQueue = [];
            for (const filePath of newQueueOrder) {
                if (songs.some(s => s.filePath === filePath)) {
                    newQueue.push(filePath);
                } else {
                    console.error('Error reordering queue: Song not found:', filePath);
                    socket.emit('error', `Song not found: ${filePath}`);
                    return;
                }
            }
            queue = newQueue;
            io.emit('queueUpdate', queue.filter(filePath => filePath !== serverPlaybackState.currentSong?.filePath)); //
            await saveQueueToFile();
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
            if (!playbackState.clientsPlayingAudio.includes(clientId)) {
                playbackState.clientsPlayingAudio.push(clientId);
            }
            // If the client enables audio and a song is playing, seek to the server's position
            if (serverPlaybackState.isPlaying) {
                const serverTime = getCurrentPlaybackPosition();
                console.log("Client enabled, seeking to:", serverTime);
                socket.emit('seek', serverTime / 1000); // Send seek command in seconds
            }
        } else {
            const index = playbackState.clientsPlayingAudio.indexOf(clientId);
            if (index > -1) {
                playbackState.clientsPlayingAudio.splice(index, 1);
            }
        }
        console.log('Client audio output toggled:', clientId, enable);
        io.emit('playbackStateUpdate', playbackState);
    });

    // Playback control events
    socket.on('play', () => {
    if (queue.length > 0 && !serverPlaybackState.isPlaying) {
        const filePath = queue[0];
        const song = songs.find(s => s.filePath === filePath);
        if (song) {
            if (!serverPlaybackState.currentSong) {
                startPlaying(song);
            } else {
                resumePlaying();
            }
        } else {
            console.error('Song not found for playback:', filePath);
            socket.emit('error', 'Song not found');
        }
    } else if (queue.length === 0) {
        playbackState.isPlaying = false;
        serverPlaybackState.isPlaying = false;
        serverPlaybackState.currentSong = null;
        serverPlaybackState.currentTime = 0;
        io.emit('playbackStateUpdate', playbackState);
        console.log('Queue is empty, playback stopped');
    }
});

    socket.on('pause', () => {
        if (serverPlaybackState.isPlaying) {
            pausePlaying();
        }
    });

    socket.on('next', () => {
    if (queue.length > 0) {
        if (isLoopEnabled && serverPlaybackState.currentSong) {
            queue.push(serverPlaybackState.currentSong.filePath);
        }
        queue.shift();
        seekTo(0);
        if (queue.length > 0) {
            const filePath = queue[0];
            const song = songs.find(s => s.filePath === filePath);
            if (song) {
                startPlaying(song);
            } else {
                console.error('Song not found for next:', filePath);
                socket.emit('error', 'Song not found');
            }
        } else {
            serverPlaybackState.currentSong = null;
            serverPlaybackState.isPlaying = false;
            io.emit('queueUpdate', queue);
            io.emit('currentlyPlaying', null);
        }
    }
});

    socket.on('previous', () => {
        // For simplicity, we'll just restart the current song from the beginning
        if (serverPlaybackState.currentSong) {
            seekTo(0); // Seek to the beginning of the song
        }
    });

    socket.on('seek', (time) => {
        // Basic validation of time
        if (typeof time === 'number' && time >= 0) {
            seekTo(time * 1000); // Convert seconds to milliseconds
        } else {
            console.error('Invalid seek time:', time);
            socket.emit('error', 'Invalid seek time');
        }
    });

    // Toggle loop state
    socket.on('toggleLoop', () => {
        isLoopEnabled = !isLoopEnabled;
        io.emit('loopState', isLoopEnabled); // Emit new loop state to all clients
        console.log('Loop toggled:', isLoopEnabled);
    });
});

// API endpoint to search for songs using yt-dlp and the file system
app.get('/api/searchall', async (req, res) => {
    const query = req.query.q;
    console.log('Search request received. Query:', query);

    if (!query) {
        return res.status(400).json({ error: 'Missing search query' });
    }

    try {
        // 1. Search the local songs
        const dbResults = songs.filter(song =>
            song.title.toLowerCase().includes(query.toLowerCase()) ||
            (song.artist && song.artist.toLowerCase().includes(query.toLowerCase())) ||
            (song.album && song.album.toLowerCase().includes(query.toLowerCase()))
        );

        // 2. Search YouTube using yt-dlp
        exec(`yt-dlp -j --flat-playlist "ytsearch:${query}"`, async (error, stdout, stderr) => {
            console.log('yt-dlp command executed.');
            if (error) {
                console.error('Error executing yt-dlp:', error);
                // Even if yt-dlp fails, return the local results
                return res.json({ db: dbResults, yt: [] });
            }
            if (stderr) {
                console.error('yt-dlp stderr:', stderr);
            }

            let ytResults = [];
            try {
                ytResults = stdout.split('\n').filter(line => line.trim() !== '').map(line => JSON.parse(line));
            } catch (parseErr) {
                console.error('Error parsing yt-dlp output:', parseErr);
                // Even if parsing fails, return the local results
                return res.json({ db: dbResults, yt: [] });
            }

             // 3. Check if YouTube results are already downloaded
            const ytResultsWithDownloadStatus = ytResults.map(result => {
                const isDownloaded = songs.some(song => song.youtubeId === result.id);
                return {
                    ...result,
                    isDownloaded,
                    filePath: isDownloaded ? songs.find(song => song.youtubeId === result.id).filePath : null
                };
            });


            // 4. Combine results and send the response
            res.json({ db: dbResults, yt: ytResultsWithDownloadStatus });
        });
    } catch (err) {
        console.error('Error searching:', err);
        res.status(500).json({ error: 'Error searching' });
    }
});

// Rate limiting
let lastDownloadTime = 0;
const DOWNLOAD_DELAY = 2000; // 2 seconds

// API endpoint to download a song using yt-dlp
app.post('/api/download', async (req, res) => {
    const now = Date.now();
    if (now - lastDownloadTime < DOWNLOAD_DELAY) {
        const timeToWait = DOWNLOAD_DELAY - (now - lastDownloadTime);
        console.log("Applying rate limiting, waiting for", timeToWait, "ms");
        await new Promise(resolve => setTimeout(resolve, timeToWait));
    }

    const url = req.body.url;
    const requestedTitle = req.body.title;
    const uploader = req.body.uploader;
    let videoId = null;

    if (!url) {
        return res.status(400).json({ error: 'Missing URL' });
    }

    console.log("Attempting to download URL:", url);

    try {
        // Extract video ID from the URL
        if (url.includes("youtube.com") || url.includes("youtu.be")) {
            const urlObj = new URL(url);
            videoId = url.includes("youtu.be")
                ? urlObj.pathname.split('/')[1]
                : urlObj.searchParams.get('v');
        }

        // Ensure the output directory exists
        try {
            await fsp.mkdir(AUDIO_DIR, { recursive: true });
            console.log("Created audio directory:", AUDIO_DIR);
        } catch (err) {
            if (err.code !== 'EEXIST') { // Ignore if directory already exists
                console.error('Error creating audio directory:', err);
                throw err; // Re-throw the error if it's not about the directory existing
            }
        }

        const albumArtDir = path.join('public', 'images');
        try {
             await fsp.mkdir(albumArtDir, { recursive: true });
            console.log("Created album art directory:", albumArtDir);
        }  catch (err) {
            if (err.code !== 'EEXIST') {
                console.error('Error creating album art directory:', err);
                throw err;
            }
        }

        const downloadOptions = [
            '--extract-audio',
            '--audio-format', 'mp3',
            '--output', `${AUDIO_DIR}/%(title)s.%(ext)s`,
            '--no-playlist',
            '-f', 'bestaudio/best', // Add this line to specify the format
            '--write-thumbnail',
            '--convert-thumbnails', 'jpg',
            '-v'
        ];

        if (fs.existsSync('cookies.txt')) {
            downloadOptions.push('--cookies', 'cookies.txt');
        }

        const command = `yt-dlp ${downloadOptions.join(' ')} "${url}"`;

        exec(command, async (error, stdout, stderr) => {
            lastDownloadTime = Date.now();

            // Sanitize the title for filename
            const sanitizedTitle = sanitize(requestedTitle);

            // Construct the expected file path based on the output template
            const expectedFileName = `${sanitizedTitle}.mp3`;
            const expectedFilePath = path.join(AUDIO_DIR, expectedFileName);
            console.log("Expected file path:", expectedFilePath);

            // Construct the expected file path for the album art based on the output template
            const expectedAlbumArtFileName = `${sanitizedTitle}.jpg`;
            const expectedAlbumArtFilePath = path.join(albumArtDir, expectedAlbumArtFileName);
            console.log("Expected album art file path:", expectedAlbumArtFilePath);

            if (error) {
                console.error('Error downloading:', error);
                if (error.message.includes('unable to extract uploader id')) {
                    return res.status(400).json({ error: 'Failed to download song. Could not extract uploader ID.' });
                } else {
                    return res.status(500).json({ error: 'Failed to download song' });
                }
            }

            if (stderr) {
                console.error('yt-dlp stderr:', stderr);
                if (stderr.includes('WARNING')) {
                    console.warn('There were some problems with the download. Continuing');
                } else {
                    return res.status(400).json({ error: 'Failed to download song' });
                }
            }

            // Use ffprobe to get metadata
            ffmpeg.ffprobe(expectedFilePath, (err, metadata) => {
                if (err) {
                    console.error('Error getting metadata:', err);
                    return res.status(500).json({ error: 'Error getting metadata' });
                }

                const { format } = metadata;
                const { duration, tags } = format;

                // Check if song already exists
                if (songs.some(song => song.filePath === expectedFilePath))
                {
                    console.log('Song already downloaded:', tags.title || requestedTitle);
                    return res.status(409).json({ error: 'Song already exists' });
                }

                const newSong = {
                    title: tags.title || requestedTitle,
                    artist: tags.artist,
                    album: tags.album,
                    filePath: expectedFilePath,
                    youtubeId: videoId,
                    duration: duration,
                    uploader: uploader,
                    albumArtPath: expectedAlbumArtFilePath
                };
                songs.push(newSong);
                console.log("Song added to in-memory storage:", newSong.title);
                io.emit('songAdded', newSong);
                res.json(newSong);
            });
        });
    } catch (err) {
        console.error('Error downloading or processing song:', err);
        res.status(500).json({ error: 'Failed to download song' });
    }
});

// Sanitize filename function
function sanitizeFilename(filename) {
    return sanitize(filename);
}

// API endpoint to list all songs
app.get('/api/songs', async (req, res) => {
    try {
        const query = req.query.q;
        let filteredSongs = songs;

        if (query) {
            // If there's a query parameter, filter songs
            const lowerCaseQuery = query.toLowerCase();
            filteredSongs = songs.filter(song =>
                song.title.toLowerCase().includes(lowerCaseQuery) ||
                (song.artist && song.artist.toLowerCase().includes(lowerCaseQuery)) ||
                (song.album && song.album.toLowerCase().includes(lowerCaseQuery))
            );
        }

        res.json(filteredSongs);
    } catch (err) {
        console.error('Error fetching songs:', err);
        res.status(500).json({ error: 'Error fetching songs' });
    }
});

// Get currently playing song
app.get('/api/player/current', (req, res) => {
    res.json(serverPlaybackState.currentSong);
});

// API endpoint to get the current queue
app.get('/api/queue', (req, res) => {
    res.json(queue.filter(filePath => filePath.startsWith(AUDIO_DIR)));
});

// API endpoint to delete a song
app.delete('/api/delete/:songFilePath', async (req, res) => {
    const songFilePath = decodeURIComponent(req.params.songFilePath);

    try {
        const songIndex = songs.findIndex(s => s.filePath === songFilePath);

        if (songIndex === -1) {
            return res.status(404).json({ error: 'Song not found' });
        }

        const song = songs[songIndex];

        // Delete the associated audio file
        try {
            await fsp.unlink(song.filePath);
            console.log('Audio file deleted:', song.filePath);
        } catch (err) {
            console.error('Error deleting audio file:', err);
            // Even if file deletion fails, still try to clean up the rest
             return res.status(200).json({ message: 'Song deleted from memory, but failed to delete audio file' });
        }

        // Delete the associated album art file
        if (song.albumArtPath) {
            try {
                await fsp.unlink(song.albumArtPath);
                console.log('Album art file deleted:', song.albumArtPath);
            } catch (err) {
                console.error('Error deleting album art file:', err);
                return res.status(200).json({ message: 'Song and audio file deleted, but failed to delete album art file' });
            }
        }

        // Remove the song from the songs array
        songs.splice(songIndex, 1);

        // Remove the song from the queue if it's there
        const queueIndex = queue.indexOf(song.filePath);
        if(queueIndex > -1) {
            queue.splice(queueIndex, 1);
            io.emit('queueUpdate', queue.filter(filePath => filePath !== serverPlaybackState.currentSong?.filePath));
            await saveQueueToFile();
        }


        res.status(200).json({ message: 'Song deleted successfully' });
    } catch (err) {
        console.error('Error deleting song:', err);
        res.status(500).json({ error: 'Error deleting song' });
    }
});

// Streaming endpoint
app.get('/api/stream/:songFilePath', async (req, res) => {
    const songFilePath = decodeURIComponent(req.params.songFilePath);

    try {
        const song = songs.find(s => s.filePath === songFilePath);

        if (!song) {
            return res.status(404).send('Song not found');
        }

        const filePath = song.filePath;
        const stat = await fsp.stat(filePath);
        const fileSize = stat.size;
        const range = req.headers.range;

        if (range) {
            const parts = range.replace(/bytes=/, "").split("-");
            const start = parseInt(parts[0], 10);
            const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
            const chunksize = (end - start) + 1;
            const file = fs.createReadStream(filePath, { start, end }); // Use fs.createReadStream
            const head = {
                'Content-Range': `bytes ${start}-${end}/${fileSize}`,
                'Accept-Ranges': 'bytes',
                'Content-Length': chunksize,
                'Content-Type': 'audio/mpeg',
            };
            res.writeHead(206, head);
            file.pipe(res);
        } else {
            const head = {
                'Content-Length': fileSize,
                'Content-Type': 'audio/mpeg',
            };
            res.writeHead(200, head);
            fs.createReadStream(filePath).pipe(res); // Use fs.createReadStream
        }
    } catch (err) {
        console.error('Error streaming audio:', err);
        res.status(500).send('Error streaming audio');
    }
});

// Serve static files from the 'public' directory
app.use(express.static(path.join(__dirname, 'public')));

// For all other routes, serve index.html (SPA routing)
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

async function scanAudioDirectory() {
    try {
        const dir = await fsp.opendir(AUDIO_DIR);
        for await (const dirent of dir) {
            if (path.extname(dirent.name) !== '.mp3') continue;

            const filePath = path.join(AUDIO_DIR, dirent.name);

            try {
                // Check if the song already exists
                if (songs.some(song => song.filePath === filePath)) {
                    console.log(`Song already exists: ${dirent.name}`);
                    continue;
                }

                console.log(`Processing: ${dirent.name}`);
                const metadata = await new Promise((resolve, reject) => {
                    ffmpeg.ffprobe(filePath, (err, metadata) => {
                        if (err) reject(err);
                        else resolve(metadata);
                    });
                });

                const { format } = metadata;
                const { duration, tags } = format;

                const baseName = path.basename(dirent.name, '.mp3');
                const albumArtPath = path.join(AUDIO_DIR, 'albumart', `${baseName}.jpg`);
                // Check if the file exists before accessing it
                const albumArtExists = await fsp.access(albumArtPath).then(() => true).catch(() => false);

                const newSong = {
                    title: tags?.title || baseName,
                    artist: tags?.artist,
                    album: tags?.album,
                    filePath: filePath,
                    youtubeId: null, // No longer fetching from DB
                    duration: duration,
                    uploader: null, // No longer fetching from DB
                    albumArtPath: albumArtExists ? albumArtPath : null,
                };

                songs.push(newSong);
                console.log(`Added song: ${newSong.title}`);

            } catch (err) {
                console.error(`Error processing ${dirent.name}:`, err);
            }
        }
        console.log('Audio directory scanned.');
    } catch (err) {
        console.error('Error scanning audio directory:', err);
    }
}

// Initialize: Scan directory and load queue
(async () => {
    const ytDlpInstalled = await checkYtDlpInstallation();
    if (!ytDlpInstalled) {
        console.error('yt-dlp is not installed. Please install it and try again.');
        process.exit(1); // Exit the process with an error code
    }
    await scanAudioDirectory();
    await loadQueueFromFile();
    server.listen(PORT, () => {
        console.log(`Server listening on port ${PORT}`);
    });
})();