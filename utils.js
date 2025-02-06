const util = require('util');
const exec = util.promisify(require('child_process').exec);
const fs = require('fs').promises;
const fssync = require('fs');
const path = require('path');
const { Song } = require('./models');

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

async function syncDatabaseWithAudioDirectory(AUDIO_DIR, serverState) {
    try {
        console.log('Syncing database with audio directory...');

        // Get all songs from the database
        const dbSongs = await Song.find();

        // Get all MP3 files from the audio directory
        const audioDirFiles = await fs.readdir(AUDIO_DIR);
        const mp3Files = audioDirFiles.filter(file => path.extname(file).toLowerCase() === '.mp3');

        // 1. Check for songs in the database that are not in the audio directory
        for (const dbSong of dbSongs) {
            if (!mp3Files.includes(path.basename(dbSong.filePath))) {
                console.log(`File for ${dbSong.title} not found. Removing from database.`);
                await Song.findByIdAndDelete(dbSong._id);

                // Remove the song from the queue if it's there (and from the currently playing song if it's the one)
                if (serverState.serverPlaybackState.currentSong && serverState.serverPlaybackState.currentSong._id.toString() === dbSong._id.toString()) {
                    serverState.serverPlaybackState.currentSong = null;
                    serverState.serverPlaybackState.isPlaying = false;
                    // No socket events here
                }

                const songIndexInQueue = serverState.queue.findIndex(s => s._id.toString() === dbSong._id.toString());
                if (songIndexInQueue > -1) {
                    serverState.queue.splice(songIndexInQueue, 1);
                    // No socket events here
                    await serverState.saveQueueToDatabase();
                }
            }
        }

        // 2. Check for MP3 files that are not in the database.  Do NOT add them here.
        for (const file of mp3Files) {
            const filePath = path.join(AUDIO_DIR, file);
            const songExists = dbSongs.some(dbSong => dbSong.filePath === filePath);

            if (!songExists) {
                console.log(`Song ${file} not found in database.`);  // Keep the log, but don't add
                // DO NOT ADD NEW SONGS HERE.  This is handled in /api/download.
            }  else { // Corrected: Added else
                // 3. Update album art path if it doesn't exist or is incorrect
                const dbSong = dbSongs.find(dbSong => dbSong.filePath === filePath);
                if (dbSong) { //Removed the condition for missing albumArtPath, it will update to the correct path anyway
                    console.log(`Checking album art for: ${dbSong.title}`);
                    try {
                        // Find the corresponding album art file (case-insensitive)
                        const baseName = path.basename(file, '.mp3');
                        const albumArtDir = path.join(AUDIO_DIR, 'albumart');
                        let albumArtPath = null; // Initialize to null
                        try{
                          const albumArtFiles = await fs.readdir(albumArtDir);
                          const albumArtFile = albumArtFiles.find(artFile => {
                            const artBaseName = path.basename(artFile, path.extname(artFile)).toLowerCase();
                            return artBaseName === baseName.toLowerCase();
                        });
                        albumArtPath = albumArtFile ? path.join(albumArtDir, albumArtFile) : null; // Could still be null
                      } catch(error) {
                        console.log("Album art not found for ", baseName);
                      }


                        if (dbSong.albumArtPath !== albumArtPath) { // Check if update is needed
                            dbSong.albumArtPath = albumArtPath; // Set to null if not found
                            await dbSong.save();
                            console.log(`Updated album art for: ${dbSong.title}`);
                        }
                    } catch (err) {
                        console.error(`Error updating album art for ${dbSong.title}:`, err);
                    }
                }
            } // Corrected

        }

        console.log('Database synchronization complete.');
    } catch (err) {
        console.error('Error synchronizing database:', err);
    }
}
module.exports = { checkYtDlpInstallation, syncDatabaseWithAudioDirectory };