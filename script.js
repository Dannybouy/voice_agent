import Vapi from 'https://esm.sh/@vapi-ai/web';

const VAPI_PUBLIC_KEY = '79e9dadd-f9c3-4597-bc29-23dd2d2ca5fa';
const ASSISTANT_ID = 'ac184162-e1c4-4c77-8e05-35457e18eaee';

const vapi = new Vapi(VAPI_PUBLIC_KEY);
let callActive = false;
let isConnecting = false;

const supportCard = document.getElementById('supportCard');
const callBtn = document.getElementById('callBtn');
const micIcon = document.getElementById('micIcon');
const endIcon = document.getElementById('endIcon');
const statusLabel = document.getElementById('statusLabel');
const transcriptArea = document.getElementById('transcriptArea');
const volumeBars = document.getElementById('volumeBars');
const volBarEls = volumeBars.querySelectorAll('.vol-bar');

// =============================================
// EVENT HANDLERS
// =============================================
vapi.on('call-start', () => {
  callActive = true;
  isConnecting = false;
  supportCard.classList.add('call-active');
  callBtn.classList.remove('connecting');
  callBtn.classList.add('active');
  micIcon.style.display = 'none';
  endIcon.style.display = 'block';
  statusLabel.textContent = 'Connected — speak now';
  statusLabel.className = 'status-label connected';
  transcriptArea.classList.add('visible');
  volumeBars.classList.add('visible');
  transcriptArea.innerHTML = '<div class="placeholder-text">Listening...</div>';
});

vapi.on('call-end', () => {
  callActive = false;
  isConnecting = false;
  supportCard.classList.remove('call-active');
  callBtn.classList.remove('active', 'connecting');
  micIcon.style.display = 'block';
  endIcon.style.display = 'none';
  statusLabel.textContent = 'Call ended — tap to start again';
  statusLabel.className = 'status-label';
  volumeBars.classList.remove('visible');
  resetVolumeBars();
});

vapi.on('volume-level', (volume) => {
  updateVolumeBars(volume);
});

vapi.on('message', (msg) => {
  if (msg.type === 'transcript' && msg.transcriptType === 'final') {
    addTranscriptMessage(msg.role, msg.transcript);
  }
});

vapi.on('speech-start', () => {
  statusLabel.textContent = 'Agent is speaking...';
  statusLabel.className = 'status-label connected';
});

vapi.on('speech-end', () => {
  if (callActive) {
    statusLabel.textContent = 'Listening...';
    statusLabel.className = 'status-label connected';
  }
});

vapi.on('error', (err) => {
  console.error('VAPI Error:', err);
  callActive = false;
  isConnecting = false;
  supportCard.classList.remove('call-active');
  callBtn.classList.remove('active', 'connecting');
  micIcon.style.display = 'block';
  endIcon.style.display = 'none';
  statusLabel.textContent = 'Connection error — please try again';
  statusLabel.className = 'status-label active';
  volumeBars.classList.remove('visible');
  resetVolumeBars();
});

// =============================================
// UI HELPERS
// =============================================
function addTranscriptMessage(role, text) {
  const placeholder = transcriptArea.querySelector('.placeholder-text');
  if (placeholder) placeholder.remove();

  const msgDiv = document.createElement('div');
  msgDiv.className = 'msg';

  const roleLabel = role === 'assistant' ? 'Agent' : 'You';
  const roleClass = role === 'assistant' ? 'agent' : 'user';

  msgDiv.innerHTML = `
    <div class="msg-role ${roleClass}">${roleLabel}</div>
    <div class="msg-text">${escapeHtml(text)}</div>
  `;

  transcriptArea.appendChild(msgDiv);
  transcriptArea.scrollTop = transcriptArea.scrollHeight;
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function updateVolumeBars(volume) {
  const normalized = Math.min(volume, 1);
  volBarEls.forEach((bar, i) => {
    const center = Math.abs(i - 4) / 4;
    const h = Math.max(4, normalized * (1 - center * 0.6) * 32);
    bar.style.height = h + 'px';
  });
}

function resetVolumeBars() {
  volBarEls.forEach(bar => { bar.style.height = '4px'; });
}

// =============================================
// CALL BUTTON HANDLER
// =============================================
callBtn.addEventListener('click', async () => {
  if (isConnecting) return;

  if (callActive) {
    vapi.stop();
    statusLabel.textContent = 'Ending call...';
  } else {
    isConnecting = true;
    callBtn.classList.add('connecting');
    statusLabel.textContent = 'Connecting...';
    statusLabel.className = 'status-label';

    try {
      await vapi.start(ASSISTANT_ID);
    } catch (err) {
      console.error('Failed to start call:', err);
      isConnecting = false;
      callBtn.classList.remove('connecting');
      statusLabel.textContent = 'Could not connect — please try again';
      statusLabel.className = 'status-label active';
    }
  }
});
