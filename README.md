# Music Player Web App

A collaborative web-based music player that allows multiple users to listen to music synchronously. Built with Node.js, Express, and Socket.IO.

## Features

- 🎵 Synchronized music playback across multiple clients
- 🔍 Search and download songs from YouTube
- 📱 Responsive design for desktop and mobile
- 👥 Multi-user support with role-based permissions
- 📋 Queue management with drag-and-drop reordering
- 🔄 Loop functionality
- 🎚️ Individual volume control per client
- 🔊 Mute/unmute toggle per client

## Prerequisites

- Node.js (v14 or higher)
- npm
- ffmpeg (for audio processing)
- yt-dlp (for YouTube downloads)

## Installation

1. Clone the repository:
```bash
git clone https://github.com/Forkei/MusicApp.git
cd MusicApp
```

2. Install dependencies:
```bash
npm install
```

3. Install system dependencies:
- Install ffmpeg: [FFmpeg Download](https://ffmpeg.org/download.html)
- Install yt-dlp: [yt-dlp Installation](https://github.com/yt-dlp/yt-dlp#installation)

4. Create required directories:
```bash
mkdir Audio
mkdir public/images
```

## Configuration

1. Set up user roles and permissions in `permissions.js`
2. Configure port number in `index.js` (default: 3000)

## Usage

1. Start the server:
```bash
node index.js
```

2. Access the application:
- Open `http://localhost:3000` in your web browser
- Login as guest or register a new account

## Features in Detail

### User Roles and Permissions

The application implements a role-based permission system with three default roles:

#### Admin Role
- Full system access
- All permissions enabled:
  - Toggle Audio
  - Play/Pause Control
  - Skip/Previous Control
  - Repeat Control
  - Queue Management
  - Search/Download
  - Delete Songs
  - Admin Access

#### User Role
- Standard user access
- Permissions:
  - Toggle Audio
  - Play/Pause Control
  - Skip/Previous Control
  - Repeat Control
  - Queue Management
  - Search/Download
  - Cannot delete songs
  - No admin access

#### Guest Role
- Limited access
- Permissions:
  - Toggle Audio only
  - Cannot control playback
  - Cannot manage queue
  - Cannot search/download

### Playback Controls
- Play/Pause
- Next/Previous
- Volume control
- Loop toggle
- Progress bar seeking

### Database Management
- Search local database
- Download from YouTube
- Delete songs (admin only)

### Queue Management
- Add songs to queue
- Remove from queue
- Drag and drop reordering

## Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Acknowledgments

- [Socket.IO](https://socket.io/) for real-time communication
- [Express](https://expressjs.com/) for the web server
- [yt-dlp](https://github.com/yt-dlp/yt-dlp) for YouTube integration
- [FFmpeg](https://ffmpeg.org/) for audio processing
