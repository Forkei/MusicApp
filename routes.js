const express = require('express');
const router = express.Router();
const { Song, Queue } = require('./models');  // Import the Song and Queue models
const { exec } = require('child_process');
const fs = require('fs').promises;
const fssync = require('fs');
const path = require('path');
const ffmpeg = require('fluent-ffmpeg');
const sanitize = require('sanitize-filename');
const util = require('util');
const execAsync = util.promisify(exec);

// Helper function to sanitize filenames
function sanitizeFilename(filename) {
    return sanitize(filename);
}

// Rate limiting (you can keep this here or move it to a separate middleware file)
let lastDownloadTime = 0;
const DOWNLOAD_DELAY = 2000; // 2 seconds

// --- API Routes ---

// Search for songs (both database and YouTube)
router.get('/api/searchall', async (req, res) => {
    const query = req.query.q;
    console.log('Search request received. Query:', query);

    if (!query) {
        return res.status(400).json({ error: 'Missing search query' });
    }

    try {
        // 1. Search the database (remains the same)
        const dbResults = await Song.find({
            $or: [
                { title: { $regex: query, $options: 'i' } }, // Case-insensitive regex search
                { artist: { $regex: query, $options: 'i' } },
                { album: { $regex: query, $options: 'i' } }
            ]
        });

        // 2. Search YouTube using yt-dlp (modified for pre-download check)
        exec(`yt-dlp -j --flat-playlist "ytsearch:${query}"`, async (error, stdout, stderr) => {
            console.log('yt-dlp command executed.');
            if (error) {
                console.error('Error executing yt-dlp:', error);
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
                return res.json({ db: dbResults, yt: [] });
            }

            // 3. Check if YouTube results are already in the database *BEFORE* downloading.
            const ytResultsWithStatus = await Promise.all(ytResults.map(async (result) => {
                const fullUrl = `https://www.youtube.com/watch?v=${result.id}`;
                const existingSong = await Song.findOne({ youtubeUrl: fullUrl });  // Check by full URL
                return {
                    ...result,
                    isDownloaded: !!existingSong,
                    _id: existingSong ? existingSong._id : null,
                    url: fullUrl // Include the full URL
                };
            }));

            // 4. Combine results and send the response
            res.json({ db: dbResults, yt: ytResultsWithStatus }); // Send the modified results
        });
    } catch (err) {
        console.error('Error searching:', err);
        res.status(500).json({ error: 'Error searching' });
    }
});

// Download a song
router.post('/api/download', async (req, res) => {
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

     // Check for duplicates *before* downloading
    try {
      const existingSong = await Song.findOne({ youtubeUrl: url });
        if (existingSong) {
          console.log('Song already exists in database:', existingSong.title);
          return res.status(409).json({ error: 'Song already exists', song: existingSong });
        }
    } catch (findErr) {
        console.error("Error checking for existing song:", findErr);
        return res.status(500).json({ error: 'Error checking for existing song' });
    }

    try {
        // Extract video ID from the URL
        if (url.includes("youtube.com") || url.includes("youtu.be")) {
            const urlObj = new URL(url);
            videoId = url.includes("youtu.be")
                ? urlObj.pathname.split('/')[1]
                : urlObj.searchParams.get('v');
        }

        // Ensure the output directory exists
        if (!fssync.existsSync(process.env.AUDIO_DIR)) {
            fssync.mkdirSync(process.env.AUDIO_DIR, { recursive: true });
            console.log("Created audio directory:", process.env.AUDIO_DIR);
        }

        const albumArtDir = path.join(process.env.AUDIO_DIR, 'albumart');
        if (!fssync.existsSync(albumArtDir)) {
            fssync.mkdirSync(albumArtDir, { recursive: true });
            console.log("Created album art directory:", albumArtDir);
        }

        const downloadOptions = [
            '--extract-audio',
            '--audio-format', 'mp3',
            '--output', `${process.env.AUDIO_DIR}/%(title)s.%(ext)s`,
            '--no-playlist',
            '-f', 'bestaudio/best', // Add this line to specify the format
            '--write-thumbnail',
            '--convert-thumbnails', 'jpg',
            //'-v' // Remove verbose output
        ];

        if (fssync.existsSync('cookies.txt')) {
            downloadOptions.push('--cookies', 'cookies.txt');
        }

        const command = `yt-dlp ${downloadOptions.join(' ')} "${url}"`;

        exec(command, async (error, stdout, stderr) => {
            lastDownloadTime = Date.now();

            // Sanitize the title for filename
            const sanitizedTitle = sanitize(requestedTitle);

            // Construct the expected file path based on the output template
            const expectedFileName = `${sanitizedTitle}.mp3`;
            const expectedFilePath = path.join(process.env.AUDIO_DIR, expectedFileName);
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
                //Don't return on warning
                if (stderr.includes('WARNING')) {
                   console.warn('yt-dlp warning:', stderr)
                } else {
                    return res.status(400).json({ error: 'yt-dlp produced an error' });
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

                const newSong = new Song({
                    title: tags.title || requestedTitle,
                    artist: tags.artist,
                    album: tags.album,
                    filePath: expectedFilePath,
                    youtubeId: videoId,
                    youtubeUrl: url, // Store the YouTube URL
                    duration: duration,
                    uploader: uploader,
                    albumArtPath: expectedAlbumArtFilePath
                });


                newSong.save()
                    .then(savedSong => {
                        console.log("Song saved to database:", savedSong.title);
                        // Respond with the saved song, including the album art path
                        res.json({ ...savedSong.toObject(), albumArtPath: expectedAlbumArtFilePath });
                    })
                    .catch(dbErr => {
                        console.error('Error saving song to database:', dbErr);
                        //Handle unique constraint violation
                        if (dbErr.code === 11000) { // Duplicate key error code
                            return res.status(409).json({ error: 'Song already exists' });
                        }
                        res.status(500).json({ error: 'Error saving song to database' });
                    });

            });
        });
    } catch (err) {
        console.error('Error downloading or processing song:', err);
        res.status(500).json({ error: 'Failed to download song' });
    }
});

// List all songs
router.get('/api/songs', async (req, res) => {
    try {
        const query = req.query.q;
        let songs;

        if (query) {
            // If there's a query parameter, search for songs that match
            songs = await Song.find({
                $or: [
                    { title: { $regex: query, $options: 'i' } }, // Case-insensitive regex search
                    { artist: { $regex: query, $options: 'i' } },
                    { album: { $regex: query, $options: 'i' } }
                ]
            });
        } else {
            // If there's no query parameter, return all songs
            songs = await Song.find();
        }

        res.json(songs);
    } catch (err) {
        console.error('Error fetching songs:', err);
        res.status(500).json({ error: 'Error fetching songs' });
    }
});

// Get currently playing song
router.get('/api/player/current', (req, res) => {
     res.json(serverState.currentSong); // Use serverState
});

// Get the current queue
router.get('/api/queue', (req, res) => {
    res.json(serverState.queue.filter(song => song._id !== serverState.serverPlaybackState.currentSong?._id)); // Use serverState
});

// Delete a song
router.delete('/api/delete/:songId', async (req, res) => {
    const songId = req.params.songId;

    if (!mongoose.Types.ObjectId.isValid(songId)) {
        return res.status(400).json({ error: 'Invalid song ID' });
    }

    try {
        const song = await Song.findByIdAndDelete(songId);

        if (!song) {
            return res.status(404).json({ error: 'Song not found' });
        }

        // Delete the associated audio file using await and fs.promises.unlink
        try {
            await fs.unlink(song.filePath);
            console.log('Audio file deleted:', song.filePath);
        } catch (err) {
            console.error('Error deleting audio file:', err);
            // Even if file deletion fails, still return success for database deletion
            return res.status(200).json({ message: 'Song deleted from database, but failed to delete audio file' });
        }

        // Delete the associated album art file using await
        if (song.albumArtPath) {
            try {
                await fs.unlink(song.albumArtPath);
                console.log('Album art file deleted:', song.albumArtPath);
            } catch (err) {
                console.error('Error deleting album art file:', err);
                return res.status(200).json({ message: 'Song and audio file deleted from database, but failed to delete album art file' });
            }
        }

        res.status(200).json({ message: 'Song deleted successfully' });

    } catch (err) {
        console.error('Error deleting song:', err);
        res.status(500).json({ error: 'Error deleting song' });
    }
});

// Stream a song
router.get('/api/stream/:songId', async (req, res) => {
  const songId = req.params.songId;
    try {
        const song = await Song.findById(songId);
        if (!song) {
            return res.status(404).send('Song not found');
        }

        const filePath = song.filePath;
        const stat = await fs.stat(filePath);
        const fileSize = stat.size;
        const range = req.headers.range;

        if (range) {
            const parts = range.replace(/bytes=/, "").split("-");
            const start = parseInt(parts[0], 10);
            const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
            const chunksize = (end - start) + 1;
            const file = fssync.createReadStream(filePath, { start, end }); // Use original fs module
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
            fssync.createReadStream(filePath).pipe(res); // Use original fs module
        }
    } catch (err) {
        console.error('Error streaming audio:', err);
        res.status(500).send('Error streaming audio');
    }
});

module.exports = router;