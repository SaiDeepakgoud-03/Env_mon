let audioContext;
let alarmTimer;

function beep() {
  const AudioContextCtor = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextCtor) return;

  audioContext ||= new AudioContextCtor();
  if (audioContext.state === "suspended") {
    audioContext.resume().catch(() => {});
  }

  const oscillator = audioContext.createOscillator();
  const gain = audioContext.createGain();
  oscillator.type = "square";
  oscillator.frequency.value = 880;
  gain.gain.setValueAtTime(0.0001, audioContext.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.18, audioContext.currentTime + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, audioContext.currentTime + 0.22);
  oscillator.connect(gain);
  gain.connect(audioContext.destination);
  oscillator.start();
  oscillator.stop(audioContext.currentTime + 0.24);
}

export function setFireAlarmActive(active) {
  if (!active) {
    document.body.classList.remove("fire-alarm-active");
    if (alarmTimer) {
      window.clearInterval(alarmTimer);
      alarmTimer = undefined;
    }
    return;
  }

  document.body.classList.add("fire-alarm-active");
  beep();

  if (alarmTimer) return;
  alarmTimer = window.setInterval(() => {
    beep();
  }, 650);
}

export function triggerFireAlarm() {
  setFireAlarmActive(true);
}
