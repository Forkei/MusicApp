// server.js (Modified for system yt-dlp)
const express = require('express');
const http = require('http');
const path = require('path');
const fs = require('fs');
const { Server } = require('socket.io');
const ffmpeg = require('fluent-ffmpeg');
const { spawn } = require('child_process'); // Use child_process.spawn
const sanitize = require('sanitize-filename');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const AUDIO_DIR = path.join(__dirname, 'audio');
const ALBUMART_DIR = path.join(AUDIO_DIR, 'albumart');

// Ensure directories exist
if (!fs.existsSync(AUDIO_DIR)) {
  fs.mkdirSync(AUDIO_DIR);
}
if (!fs.existsSync(ALBUMART_DIR)) {
  fs.mkdirSync(ALBUMART_DIR);
}

// Utility function to get all songs
function getSongs() {
  try {
    const files = fs.readdirSync(AUDIO_DIR);
    const songs = files
      .filter(file => file.endsWith('.mp3'))
      .map(filename => ({
        filename: filename,
        filePath: path.join(AUDIO_DIR, filename),
        title: path.basename(filename, '.mp3'),
      }));
    return songs;
  } catch (error) {
    console.error("Error reading audio directory:", error);
    return [];
  }
}

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));

app.get('/stream/:filename', (req, res) => {
  const filename = sanitize(req.params.filename);
  const filePath = path.join(AUDIO_DIR, filename);

  if (!filename || !fs.existsSync(filePath)) {
    return res.status(404).send('File not found');
  }

  const stat = fs.statSync(filePath);
  const range = req.headers.range;

  if (range) {
    const parts = range.replace(/bytes=/, "").split("-");
    const start = parseInt(parts[0], 10);
    const end = parts[1] ? parseInt(parts[1], 10) : stat.size - 1;
    const chunksize = (end - start) + 1;
    const file = fs.createReadStream(filePath, { start, end });
    const head = {
      'Content-Range': `bytes ${start}-${end}/${stat.size}`,
      'Accept-Ranges': 'bytes',
      'Content-Length': chunksize,
      'Content-Type': 'audio/mpeg',
    };
    res.writeHead(206, head);
    file.pipe(res);
  } else {
    const head = {
      'Content-Length': stat.size,
      'Content-Type': 'audio/mpeg',
    };
    res.writeHead(200, head);
    fs.createReadStream(filePath).pipe(res);
  }
});

app.get('/albumart/:filename', (req, res) => {
  const filename = sanitize(req.params.filename.replace('.mp3', '.jpg'));  // Sanitize and adjust extension
  const filePath = path.join(ALBUMART_DIR, filename);

  if (!filename || !fs.existsSync(filePath)) {
    return res.status(404).send('File not found');
  }

  res.sendFile(filePath);
});



let queue = [];
let currentSongIndex = 0;
let isPlaying = false;
let isLooping = false;
let currentTime = 0;

io.on('connection', (socket) => {
  console.log('a user connected');

  // Send initial state
  socket.emit('initialState', {
    songs: getSongs(),
    queue: queue,
    currentSongIndex: currentSongIndex,
    isPlaying: isPlaying,
    isLooping: isLooping,
    currentTime: currentTime,
  });

  socket.on('search', async (query) => {
    try {
      // Use yt-dlp for searching.  We use --dump-json and parse the output.
      const ytdlpProcess = spawn('yt-dlp', ['--dump-json', 'ytsearch10:' + query]);
      let rawData = '';

      ytdlpProcess.stdout.on('data', (data) => {
        rawData += data.toString();
      });

      ytdlpProcess.stderr.on('data', (data) => {
        console.error(`yt-dlp stderr: ${data}`);
      });

      ytdlpProcess.on('close', (code) => {
        if (code !== 0) {
          console.error(`yt-dlp search exited with code ${code}`);
          socket.emit('error', 'Error during search.');
          return;
        }

        try {
            const searchResults = rawData.trim().split('\n').map(JSON.parse);
             const cleanedResults = searchResults.map(r => ({title: r.title, url: r.url}))
            socket.emit('searchResults', cleanedResults);
        } catch (parseError) {
          console.error('Error parsing yt-dlp search output:', parseError);
          socket.emit('error', 'Error parsing search results.');
        }
      });


    } catch (error) {
      console.error('Search error:', error);
      socket.emit('error', 'Error during search.');
    }
  });


   socket.on('download', async (videoId) => {
    try {
        // First, get video info to extract the title
        const infoProcess = spawn('yt-dlp', ['-j', videoId]);
        let infoData = '';

        infoProcess.stdout.on('data', (data) => {
            infoData += data.toString();
        });

        infoProcess.stderr.on('data', (data) => {
            console.error(`yt-dlp info stderr: ${data}`);
        });

        infoProcess.on('close', async (code) => {
            if (code !== 0) {
                console.error(`yt-dlp info exited with code ${code}`);
                socket.emit('error', 'Error fetching video info.');
                return;
            }

            try {
                const info = JSON.parse(infoData);
                const title = sanitize(info.title);
                const filename = `${title}.mp3`;
                const filePath = path.join(AUDIO_DIR, filename);
                const albumArtPath = path.join(ALBUMART_DIR, `${title}.jpg`);
                const tempFilePath = path.join(AUDIO_DIR, `${title}.temp.mp3`); // Use a temporary file
                const thumbnail = info.thumbnails && info.thumbnails[0] && info.thumbnails[0].url ? info.thumbnails[0].url : null
                // Check if file already exists
                if (fs.existsSync(filePath)) {
                    socket.emit('error', 'File already exists.');
                    return;
                }

               const downloadOptions = ['-x', '--audio-format', 'mp3', '-o', tempFilePath, videoId]; // Download to temp file
                if (thumbnail) {
                    downloadOptions.push('--write-thumbnail', '--convert-thumbnails', 'jpg');
                }

                const downloadProcess = spawn('yt-dlp', downloadOptions);

                downloadProcess.stdout.on('data', (data) => {
                    console.log(`yt-dlp download stdout: ${data}`);
                });

                downloadProcess.stderr.on('data', (data) => {
                    console.error(`yt-dlp download stderr: ${data}`);
                });

                downloadProcess.on('close', async (downloadCode) => {
                    if (downloadCode !== 0) {
                        console.error(`yt-dlp download exited with code ${downloadCode}`);
                        socket.emit('error', 'Error during download.');
                        // Clean up temp file if download failed
                        if (fs.existsSync(tempFilePath)) {
                            fs.unlinkSync(tempFilePath);
                        }
                        return;
                    }
                    if (thumbnail) {
                      try{
                        const res = await fetch(thumbnail)
                        const blob = await res.blob()
                        const arrayBuffer = await blob.arrayBuffer()
                        const buffer = Buffer.from(arrayBuffer)
                        fs.writeFileSync(albumArtPath, buffer)
                      }
                      catch(e){
                        console.error("Failed to download album art", e)
                      }
                    }

                    // Rename the temporary file to the final filename
                    fs.renameSync(tempFilePath, filePath);

                    io.emit('songsUpdated', getSongs()); // Notify all clients
                    socket.emit('downloadComplete', { title });
                });

            } catch (jsonError) {
                console.error('Error parsing video info JSON:', jsonError);
                socket.emit('error', 'Error parsing video info.');
            }
        });

    } catch (error) {
        console.error('Download error:', error);
        socket.emit('error', 'Error during download.');
    }
});



  socket.on('addToQueue', (filename) => {
    const song = getSongs().find(s => s.filename === filename);
    if (song) {
      queue.push(song);
      io.emit('queueUpdated', queue);
    } else {
      socket.emit('error', 'Song not found.');
    }
  });

  socket.on('removeFromQueue', (index) => {
    if (index >= 0 && index < queue.length) {
      queue.splice(index, 1);
      if (currentSongIndex > index) {
        currentSongIndex--;
      } else if (currentSongIndex === index && !isPlaying) {
        // If the removed song was the current song and playback was paused, update currentSongIndex
        if (queue.length > 0) {
          currentSongIndex = Math.min(currentSongIndex, queue.length - 1); //Ensure it is a valid index
        } else
            currentSongIndex = 0;
      }
        else if (currentSongIndex === index) {
            //current song removed, stop playing
            currentSongIndex = 0;
            isPlaying = false;
        }
      io.emit('queueUpdated', queue);
      io.emit('playbackState', { isPlaying, currentSongIndex, isLooping, currentTime: 0 }); // Reset currentTime

    } else {
      socket.emit('error', 'Invalid queue index.');
    }
  });

  socket.on('reorderQueue', (newQueue) => {
    queue = newQueue;
    io.emit('queueUpdated', queue);
      //Find the index of the currently played song
      if (queue.length > 0) {
        currentSongIndex = queue.findIndex(q => q.filename === queue[currentSongIndex].filename)
      }
      io.emit('playbackState', { isPlaying, currentSongIndex, isLooping, currentTime});
  });

  socket.on('clearQueue', () => {
    queue = [];
    currentSongIndex = 0;
    isPlaying = false;
    currentTime = 0;
    io.emit('queueUpdated', queue);
    io.emit('playbackState', { isPlaying, currentSongIndex, isLooping, currentTime });
  });

  socket.on('play', () => {
    if (queue.length > 0) {
      isPlaying = true;
      io.emit('playbackState', { isPlaying, currentSongIndex, isLooping, currentTime });
    }
  });

  socket.on('pause', () => {
    isPlaying = false;
    io.emit('playbackState', { isPlaying, currentSongIndex, isLooping, currentTime });
  });

  socket.on('next', () => {
    if (queue.length > 0) {
      currentSongIndex = (currentSongIndex + 1) % queue.length;
      currentTime = 0;  // Reset time on track change
      io.emit('playbackState', { isPlaying, currentSongIndex, isLooping, currentTime });
    }
  });

  socket.on('previous', () => {
    if (queue.length > 0) {
      currentSongIndex = (currentSongIndex - 1 + queue.length) % queue.length;
      currentTime = 0;  // Reset time on track change
      io.emit('playbackState', { isPlaying, currentSongIndex, isLooping, currentTime });
    }
  });

  socket.on('seek', (time) => {
    currentTime = time;
    io.emit('playbackState', { isPlaying, currentSongIndex, isLooping, currentTime });
  });

  socket.on('toggleLoop', () => {
    isLooping = !isLooping;
    io.emit('playbackState', { isPlaying, currentSongIndex, isLooping, currentTime });
  });

  socket.on('deleteSong', (filename) => {
        const sanitizedFilename = sanitize(filename);
        const filePath = path.join(AUDIO_DIR, sanitizedFilename);
        const albumArtPath = path.join(ALBUMART_DIR, sanitizedFilename.replace('.mp3', '.jpg'));

        if (!sanitizedFilename || !fs.existsSync(filePath)) {
            socket.emit('error', 'File not found or invalid filename.');
            return;
        }

        try {
            // Remove from queue if present
            queue = queue.filter(song => song.filename !== sanitizedFilename);
            if (queue.length > 0 && currentSongIndex >= 0 && sanitizedFilename == queue[currentSongIndex].filename) {
                //current song removed, stop playing
                currentSongIndex = 0;
                isPlaying = false;
                io.emit('playbackState', { isPlaying, currentSongIndex, isLooping, currentTime: 0 });
            }
            io.emit('queueUpdated', queue)
            fs.unlinkSync(filePath);
            if (fs.existsSync(albumArtPath)) {
                fs.unlinkSync(albumArtPath);
            }
            io.emit('songsUpdated', getSongs()); // Notify all
        } catch (error) {
            console.error("Error deleting song:", error);
            socket.emit('error', 'Failed to delete song.');
        }
    });


  socket.on('disconnect', () => {
    console.log('user disconnected');
  });
});


const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});