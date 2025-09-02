// Initialize Socket.IO connection
const socket = io('http://localhost:3000');

// Global variables
let player;
let currentRoom = null;
let isHost = false;
let isSyncing = false;

// DOM elements
const roomStatus = document.getElementById('roomStatus');
const copyLinkBtn = document.getElementById('copyLinkBtn');
const videoUrl = document.getElementById('videoUrl');
const loadVideoBtn = document.getElementById('loadVideoBtn');
const messages = document.getElementById('messages');
const messageInput = document.getElementById('messageInput');
const sendBtn = document.getElementById('sendBtn');
const createRoomBtn = document.getElementById('createRoomBtn');
const roomIdInput = document.getElementById('roomIdInput');
const joinRoomBtn = document.getElementById('joinRoomBtn');

// YouTube Player API
function onYouTubeIframeAPIReady() {
    player = new YT.Player('player', {
        height: '360',
        width: '640',
        videoId: '',
        playerVars: {
            'autoplay': 0,
            'controls': 1,
            'rel': 0
        },
        events: {
            'onReady': onPlayerReady,
            'onStateChange': onPlayerStateChange
        }
    });
}

function onPlayerReady(event) {
    console.log('YouTube player ready');
}

function onPlayerStateChange(event) {
    if (isSyncing) return;
    
    if (!currentRoom) return;
    
    const currentTime = player.getCurrentTime();
    
    if (event.data === YT.PlayerState.PLAYING) {
        socket.emit('play', { currentTime });
    } else if (event.data === YT.PlayerState.PAUSED) {
        socket.emit('pause', { currentTime });
    }
}

// Extract YouTube video ID from URL
function extractVideoId(url) {
    const regex = /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([^&\n?#]+)/;
    const match = url.match(regex);
    return match ? match[1] : null;
}

// Create room
createRoomBtn.addEventListener('click', () => {
    socket.emit('create-room', (response) => {
        currentRoom = response.roomId;
        isHost = response.isHost;
        updateRoomStatus();
        addSystemMessage('Room created! Share the link with friends.');
    });
});

// Join room
joinRoomBtn.addEventListener('click', () => {
    const roomId = roomIdInput.value.trim();
    if (!roomId) {
        alert('Please enter a room code');
        return;
    }
    joinRoom(roomId);
});

function joinRoom(roomId) {
    socket.emit('join-room', roomId, (response) => {
        if (response.success) {
            currentRoom = roomId;
            isHost = response.isHost;
            updateRoomStatus();
            
            // Load existing video if any
            if (response.videoId) {
                isSyncing = true;
                player.loadVideoById(response.videoId, response.videoState.currentTime);
                if (response.videoState.playing) {
                    player.playVideo();
                } else {
                    player.pauseVideo();
                }
                setTimeout(() => { isSyncing = false; }, 1000);
            }
            
            // Load existing messages
            response.messages.forEach(msg => {
                displayMessage(msg);
            });
            
            addSystemMessage('Joined room successfully!');
        } else {
            alert('Room not found!');
        }
    });
}

// Check URL params for room ID
const urlParams = new URLSearchParams(window.location.search);
const roomFromUrl = urlParams.get('room');
if (roomFromUrl) {
    roomIdInput.value = roomFromUrl;
    setTimeout(() => joinRoom(roomFromUrl), 1000);
}

// Update room status display
function updateRoomStatus() {
    if (currentRoom) {
        roomStatus.textContent = `Room: ${currentRoom} ${isHost ? '(Host)' : ''}`;
        copyLinkBtn.style.display = 'inline-block';
    } else {
        roomStatus.textContent = 'Not in a room';
        copyLinkBtn.style.display = 'none';
    }
}

// Copy room link
copyLinkBtn.addEventListener('click', () => {
    const link = `${window.location.origin}${window.location.pathname}?room=${currentRoom}`;
    navigator.clipboard.writeText(link).then(() => {
        const originalText = copyLinkBtn.textContent;
        copyLinkBtn.textContent = 'Copied!';
        setTimeout(() => {
            copyLinkBtn.textContent = originalText;
        }, 2000);
    });
});

// Load video
loadVideoBtn.addEventListener('click', () => {
    if (!currentRoom) {
        alert('Please create or join a room first!');
        return;
    }
    
    const videoId = extractVideoId(videoUrl.value);
    if (!videoId) {
        alert('Invalid YouTube URL');
        return;
    }
    
    player.loadVideoById(videoId);
    socket.emit('video-change', { videoId });
    videoUrl.value = '';
});

// Send message
sendBtn.addEventListener('click', sendMessage);
messageInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') sendMessage();
});

function sendMessage() {
    const message = messageInput.value.trim();
    if (!message || !currentRoom) return;
    
    socket.emit('chat-message', message);
    messageInput.value = '';
}

// Display message
function displayMessage(data) {
    const messageDiv = document.createElement('div');
    messageDiv.className = 'message';
    
    const userDiv = document.createElement('div');
    userDiv.className = 'message-user';
    userDiv.textContent = data.userId === socket.id ? 'You' : `User ${data.userId.slice(0, 6)}`;
    
    const textDiv = document.createElement('div');
    textDiv.className = 'message-text';
    textDiv.textContent = data.text;
    
    const timeDiv = document.createElement('div');
    timeDiv.className = 'message-time';
    timeDiv.textContent = new Date(data.timestamp).toLocaleTimeString();
    
    messageDiv.appendChild(userDiv);
    messageDiv.appendChild(textDiv);
    messageDiv.appendChild(timeDiv);
    
    messages.appendChild(messageDiv);
    messages.scrollTop = messages.scrollHeight;
}

// Display system message
function addSystemMessage(text) {
    const messageDiv = document.createElement('div');
    messageDiv.className = 'system-message';
    messageDiv.textContent = text;
    messages.appendChild(messageDiv);
    messages.scrollTop = messages.scrollHeight;
}

// Socket event listeners
socket.on('video-change', (data) => {
    isSyncing = true;
    player.loadVideoById(data.videoId);
    setTimeout(() => { isSyncing = false; }, 1000);
    addSystemMessage('Video changed');
});

socket.on('play', (data) => {
    isSyncing = true;
    player.seekTo(data.currentTime, true);
    player.playVideo();
    setTimeout(() => { isSyncing = false; }, 1000);
});

socket.on('pause', (data) => {
    isSyncing = true;
    player.seekTo(data.currentTime, true);
    player.pauseVideo();
    setTimeout(() => { isSyncing = false; }, 1000);
});

socket.on('seek', (data) => {
    isSyncing = true;
    player.seekTo(data.currentTime, true);
    setTimeout(() => { isSyncing = false; }, 1000);
});

socket.on('chat-message', (data) => {
    displayMessage(data);
});

socket.on('user-joined', (userId) => {
    addSystemMessage(`User ${userId.slice(0, 6)} joined`);
});

socket.on('user-left', (userId) => {
    addSystemMessage(`User ${userId.slice(0, 6)} left`);
});

// Handle seeking
let lastSeekTime = 0;
setInterval(() => {
    if (player && player.getCurrentTime && currentRoom && !isSyncing) {
        const currentTime = player.getCurrentTime();
        if (Math.abs(currentTime - lastSeekTime) > 2) {
            socket.emit('seek', { currentTime });
            lastSeekTime = currentTime;
        } else {
            lastSeekTime = currentTime;
        }
    }
}, 1000);