// Misst PBKDF2-SHA256 lokal (Node). NUR ein Anhaltspunkt: Die echte CPU-Zeit auf Cloudflare muss im Dashboard
// bzw. mit `wrangler tail` geprüft werden. Die Workers-Runtime erlaubt maximal 100000 Iterationen.
import { pbkdf2Sync } from 'node:crypto';
for (const it of [50000, 100000]) {
  const t = performance.now();
  for (let i = 0; i < 5; i++) pbkdf2Sync('passwort', 'salzsalzsalzsalz', it, 32, 'sha256');
  console.log(`${it} Iterationen: ${((performance.now() - t) / 5).toFixed(1)} ms pro Hash`);
}
