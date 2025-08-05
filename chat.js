// chat.js
//
// This simple script demonstrates how to access the user's webcam and
// microphone using the WebRTC `getUserMedia` API. It is not a full
// implementation of random video chat — to match users and facilitate
// peer-to-peer connections you'll need a signalling server. See the
// README in the project for recommendations.

const localVideo = document.getElementById('localVideo');
const remoteVideo = document.getElementById('remoteVideo');
const startBtn = document.getElementById('startBtn');
const stopBtn = document.getElementById('stopBtn');
const statusEl = document.getElementById('status');

let localStream;

// When the user clicks “Start Chat”, request access to camera and microphone
startBtn.addEventListener('click', async () => {
  startBtn.disabled = true;
  statusEl.textContent = 'Connecting…';
  try {
    localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
    localVideo.srcObject = localStream;
    statusEl.textContent =
      'You are live! To connect with someone random, integrate a WebRTC signalling server and matching logic.';
  } catch (err) {
    console.error('Error accessing media devices', err);
    statusEl.textContent = 'Unable to access camera/microphone. Please allow permissions.';
    startBtn.disabled = false;
  }
});

// Stop the stream when the user clicks “Stop Chat”
stopBtn.addEventListener('click', () => {
  if (localStream) {
    localStream.getTracks().forEach((track) => track.stop());
    localVideo.srcObject = null;
    statusEl.textContent = '';
  }
  startBtn.disabled = false;
});