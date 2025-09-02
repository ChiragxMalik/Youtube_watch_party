const express = require('express');
const http = require('http');
const socketIO = require('socket.io');
const path = require('path');
const crypto = require('crypto');

const app = express();
const server = http.createServer(app);
const io = socketIO(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

const PORT = process.env.PORT || 3000;

// Serve static files
app.use(express.static(__dirname));

// Store room data temporarily
const rooms = new Map();

// Generate unique room ID
function generateRoomId() {
  return crypto.randomBytes(3).toString('hex');
}

// Socket.IO connection
io.on('connection', (socket) => {
  console.log('User connected:', socket.id);
  
  // Create new room
  socket.on('create-room', (callback) => {
    const roomId = generateRoomId();
    const room = {
      id: roomId,
      host: socket.id,
      users: new Set([socket.id]),
      videoId: '',
      videoState: {
        playing: false,
        currentTime: 0
      },
      messages: []
    };
    rooms.set(roomId, room);
    socket.join(roomId);
    socket.roomId = roomId;
    console.log('Room created:', roomId);
    callback({ roomId, isHost: true });
  });
  
  // Join existing room
  socket.on('join-room', (roomId, callback) => {
    const room = rooms.get(roomId);
    if (room) {
      room.users.add(socket.id);
      socket.join(roomId);
      socket.roomId = roomId;
      console.log('User joined room:', roomId);
      
      // Send current state to new user
      callback({
        success: true,
        isHost: room.host === socket.id,
        videoId: room.videoId,
        videoState: room.videoState,
        messages: room.messages
      });
      
      // Notify others
      socket.to(roomId).emit('user-joined', socket.id);
    } else {
      callback({ success: false, error: 'Room not found' });
    }
  });
  
  // Handle video URL change
  socket.on('video-change', (data) => {
    const room = rooms.get(socket.roomId);
    if (room) {
      room.videoId = data.videoId;
      socket.to(socket.roomId).emit('video-change', data);
      console.log('Video changed in room:', socket.roomId);
    }
  });
  
  // Handle play event
  socket.on('play', (data) => {
    const room = rooms.get(socket.roomId);
    if (room) {
      room.videoState.playing = true;
      room.videoState.currentTime = data.currentTime;
      socket.to(socket.roomId).emit('play', data);
      console.log('Play in room:', socket.roomId);
    }
  });
  
  // Handle pause event
  socket.on('pause', (data) => {
    const room = rooms.get(socket.roomId);
    if (room) {
      room.videoState.playing = false;
      room.videoState.currentTime = data.currentTime;
      socket.to(socket.roomId).emit('pause', data);
      console.log('Pause in room:', socket.roomId);
    }
  });
  
  // Handle seek event
  socket.on('seek', (data) => {
    const room = rooms.get(socket.roomId);
    if (room) {
      room.videoState.currentTime = data.currentTime;
      socket.to(socket.roomId).emit('seek', data);
      console.log('Seek in room:', socket.roomId);
    }
  });
  
  // Handle chat messages
  socket.on('chat-message', (message) => {
    const room = rooms.get(socket.roomId);
    if (room) {
      const msgData = {
        id: Date.now(),
        text: message,
        userId: socket.id,
        timestamp: new Date().toISOString()
      };
      room.messages.push(msgData);
      io.to(socket.roomId).emit('chat-message', msgData);
      console.log('Message in room:', socket.roomId);
    }
  });
  
  // Handle disconnect
  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
    if (socket.roomId) {
      const room = rooms.get(socket.roomId);
      if (room) {
        room.users.delete(socket.id);
        socket.to(socket.roomId).emit('user-left', socket.id);
        
        // Clean up empty rooms
        if (room.users.size === 0) {
          rooms.delete(socket.roomId);
          console.log('Room deleted:', socket.roomId);
        }
      }
    }
  });
});

server.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});