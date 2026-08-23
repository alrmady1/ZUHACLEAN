// A short synthesized "bell click" using the Web Audio API — no audio file
// asset needed. Used to alert everyone on the dashboard when a new
// appointment is booked (see Dashboard.tsx's polling in refreshAppointments).
export function playBellSound(): void {
  try {
    const AudioCtx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const now = ctx.currentTime;

    // Two overlapping high tones with a quick decay read as a small "ding"
    // rather than a flat beep.
    [1500, 2200].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0, now);
      gain.gain.linearRampToValueAtTime(0.15 - i * 0.05, now + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.35);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.4);
    });

    setTimeout(() => ctx.close().catch(() => {}), 500);
  } catch {
    // Audio unavailable (autoplay policy, unsupported browser, etc.) —
    // the visual toast alone is enough, so fail silently here.
  }
}
