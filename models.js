const mongoose = require('mongoose');

// Song Schema
const songSchema = new mongoose.Schema({
    title: {
        type: String,
        required: true, // Title is required
        trim: true // Remove leading/trailing whitespace
    },
    artist: {
        type: String,
        default: '', // Default to empty string if not provided
        trim: true
    },
    album: {
        type: String,
        default: '',
        trim: true
    },
    filePath: {
        type: String,
        required: true,
        unique: true, // Ensure file paths are unique
        trim: true
    },
    youtubeId: {
        type: String,
        trim: true,
        // Add validation for YouTube ID format if needed
        // match: /^[-_a-zA-Z0-9]{11}$/  // Example: Basic YouTube ID validation
    },
    youtubeUrl: { // Add this field
        type: String,
        required: true, // The URL is required
        unique: true,    // and MUST be unique
        trim: true
    },
    duration: {
        type: Number,
        required: false, // Duration might not always be available immediately
        min: 0 // Duration should be non-negative
    },
    uploader: {
        type: String,
        trim: true
    },
    albumArtPath: {
        type: String,
        trim: true
    }
}, { timestamps: true }); // Add createdAt and updatedAt timestamps

// Add indexes for faster searching
songSchema.index({ title: 'text', artist: 'text', album: 'text' });

const Song = mongoose.model('Song', songSchema);

// Queue Schema (remains unchanged)
const queueSchema = new mongoose.Schema({
    songs: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Song' // Reference the Song model
    }]
}, { timestamps: true });

const Queue = mongoose.model('Queue', queueSchema);

module.exports = { Song, Queue };