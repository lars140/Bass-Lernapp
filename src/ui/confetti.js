// Dezentes Konfetti auf einem Canvas. Respektiert „Bewegung reduzieren“.
export function confetti(count = 70) {
  if (window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const cv = document.createElement('canvas');
  cv.className = 'confetti';
  cv.setAttribute('aria-hidden', 'true');
  const w = (cv.width = window.innerWidth);
  const hgt = (cv.height = window.innerHeight);
  document.body.append(cv);
  const ctx = cv.getContext('2d');
  const colors = ['#2dd4bf', '#fbbf24', '#60a5fa', '#f472b6', '#a3e635'];
  const parts = Array.from({ length: count }, () => ({
    x: w / 2 + (Math.random() - 0.5) * 120,
    y: hgt * 0.35,
    vx: (Math.random() - 0.5) * 9,
    vy: -Math.random() * 9 - 3,
    r: Math.random() * 5 + 3,
    c: colors[(Math.random() * colors.length) | 0],
    a: Math.random() * 6,
  }));
  const start = performance.now();
  (function frame(now) {
    const t = now - start;
    ctx.clearRect(0, 0, w, hgt);
    for (const p of parts) {
      p.vy += 0.28; p.x += p.vx; p.y += p.vy; p.a += 0.2;
      ctx.globalAlpha = Math.max(0, 1 - t / 1600);
      ctx.fillStyle = p.c;
      ctx.fillRect(p.x, p.y, p.r, p.r * Math.abs(Math.cos(p.a)) + 1);
    }
    if (t < 1600) requestAnimationFrame(frame); else cv.remove();
  })(start);
}
