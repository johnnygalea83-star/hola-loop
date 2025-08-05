// chat.js
//
// This script implements a simple random-match WebRTC video chat using
// Scaledrone as the signaling server. When two users open the chat
// page they will be paired together automatically; additional users will
// wait until a peer becomes available. To enable this functionality you
// MUST create a free Scaledrone channel and replace the
// YOUR_CHANNEL_ID constant below with your actual channel ID. You can
// obtain a channel ID by signing up at https://www.scaledrone.com/.

const CHANNEL_ID = 'YOUR_CHANNEL_ID'; // TODO: Replace with your Scaledrone channel ID
const MATCH_ROOM = 'observable-match';

const localVideo = document.getElementById('localVideo');
const remoteVideo = document.getElementById('remoteVideo');
const startBtn = document.getElementById('startBtn');
const stopBtn = document.getElementById('stopBtn');
const statusEl = document.getElementById('status');

let drone = null;
let matchRoom = null;
let pairRoom = null;
let pc = null;
let localStream = null;
let pairId = null;
let isOfferer = false;

// Utility: publish signaling messages to the pair room
function sendSignaling(message) {
  if (pairRoom) {
    pairRoom.publish({ message });
  }
}

// Handle incoming signaling data from the pair room
async function handleSignalingData(data) {
  switch (data.type) {
    case 'offer':
      await pc.setRemoteDescription(new RTCSessionDescription(data.offer));
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      sendSignaling({ type: 'answer', answer: pc.localDescription });
      break;
    case 'answer':
      await pc.setRemoteDescription(new RTCSessionDescription(data.answer));
      break;
    case 'candidate':
      try {
        await pc.addIceCandidate(new RTCIceCandidate(data.candidate));
      } catch (err) {
        console.error('Error adding received ICE candidate', err);
      }
      break;
    default:
      break;
  }
}

// Start a WebRTC peer connection
function startWebRTC() {
  const config = { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] };
  pc = new RTCPeerConnection(config);
  // Send any ICE candidates to our remote peer
  pc.onicecandidate = (event) => {
    if (event.candidate) {
      sendSignaling({ type: 'candidate', candidate: event.candidate });
    }
  };
  // When remote stream arrives, attach it
  pc.ontrack = (event) => {
    remoteVideo.srcObject = event.streams[0];
  };
  // Add local stream tracks
  if (localStream) {
    localStream.getTracks().forEach((track) => pc.addTrack(track, localStream));
  }
  // If we are the offerer, create an offer when negotiation is needed
  if (isOfferer) {
    pc.onnegotiationneeded = async () => {
      try {
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        sendSignaling({ type: 'offer', offer: pc.localDescription });
      } catch (err) {
        console.error('Error creating offer', err);
      }
    };
  }
}

// Join a pair room and set up WebRTC signaling
function joinPairRoom(id) {
  pairRoom = drone.subscribe('observable-' + id);
  pairRoom.on('open', (error) => {
    if (error) {
      console.error('Failed to open pair room', error);
    }
  });
  // Listen for signaling messages from peer
  pairRoom.on('data', (text, member) => {
    // Ignore our own messages
    if (member.id === drone.clientId) return;
    const data = text;
    handleSignalingData(data);
  });
  // When members event triggers, start WebRTC
  pairRoom.on('members', (members) => {
    // Once we join the room, start WebRTC; only called once
    statusEl.textContent = 'Matched! Establishing connection…';
    startWebRTC();
  });
}

// Start the matching and WebRTC process
startBtn.addEventListener('click', async () => {
  startBtn.disabled = true;
  statusEl.textContent = 'Requesting access to camera/microphone…';
  try {
    localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
    localVideo.srcObject = localStream;
    statusEl.textContent = 'Connecting to signaling server…';
    drone = new ScaleDrone(CHANNEL_ID);
    drone.on('open', (error) => {
      if (error) {
        console.error('Error connecting to Scaledrone', error);
        statusEl.textContent = 'Error connecting to signaling server.';
        startBtn.disabled = false;
        return;
      }
      // Subscribe to match room
      matchRoom = drone.subscribe(MATCH_ROOM);
      matchRoom.on('open', (error) => {
        if (error) {
          console.error('Error opening match room', error);
          statusEl.textContent = 'Error connecting to match room.';
        }
      });
      // On members event, decide whether to match or wait
      matchRoom.on('members', (members) => {
        const otherMembers = members.filter((m) => m.id !== drone.clientId);
        if (otherMembers.length > 0) {
          // Pick a random partner from the existing members
          const partner = otherMembers[Math.floor(Math.random() * otherMembers.length)];
          // Generate unique pair ID from client IDs; sort to ensure same ID on both peers
          pairId = [drone.clientId, partner.id].sort().join('-');
          // Notify partner via match room
          matchRoom.publish({ message: { type: 'match', pairId: pairId, target: partner.id } });
          isOfferer = true;
          joinPairRoom(pairId);
        } else {
          // No one else in the room yet; wait for match message
          isOfferer = false;
        }
      });
      // Listen for match messages
      matchRoom.on('data', (text, member) => {
        const data = text;
        // Ignore messages from self
        if (member.id === drone.clientId) return;
        if (data.type === 'match' && data.target === drone.clientId) {
          pairId = data.pairId;
          isOfferer = false;
          joinPairRoom(pairId);
        }
      });
    });
  } catch (err) {
    console.error('Error accessing media devices', err);
    statusEl.textContent = 'Unable to access camera/microphone. Please allow permissions.';
    startBtn.disabled = false;
  }
});

// Stop the chat and clean up resources
stopBtn.addEventListener('click', () => {
  // Close peer connection
  if (pc) {
    pc.close();
    pc = null;
  }
  // Stop local stream
  if (localStream) {
    localStream.getTracks().forEach((track) => track.stop());
    localStream = null;
    localVideo.srcObject = null;
  }
  // Disconnect from Scaledrone
  if (pairRoom) {
    pairRoom.unsubscribe();
    pairRoom = null;
  }
  if (matchRoom) {
    matchRoom.unsubscribe();
    matchRoom = null;
  }
  if (drone) {
    drone.close();
    drone = null;
  }
  statusEl.textContent = 'Chat ended.';
  startBtn.disabled = false;
});