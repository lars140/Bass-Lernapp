// Vite-Konfiguration: Output ist ein statischer `dist`-Ordner.
// Ein kleines Plugin erzeugt nach dem Build den Service Worker (sw.js)
// mit der Liste aller Dateien, die offline verfügbar sein sollen.
import { defineConfig } from 'vite';
import { readdirSync, statSync, readFileSync, writeFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { createHash } from 'node:crypto';

function walk(dir) {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}

function serviceWorkerPlugin() {
  let outDir = 'dist';
  return {
    name: 'bass-service-worker',
    apply: 'build',
    configResolved(cfg) { outDir = cfg.build.outDir; },
    closeBundle() {
      const skip = new Set(['sw.js', '_headers', '_routes.json']);
      const files = walk(outDir)
        .map((f) => relative(outDir, f).split(sep).join('/'))
        .filter((f) => !skip.has(f));
      const hash = createHash('sha1');
      for (const f of files.sort()) hash.update(f).update(readFileSync(join(outDir, f)));
      const version = 'bass-' + hash.digest('hex').slice(0, 10);
      const urls = ['/', ...files.map((f) => '/' + f)];
      const tpl = readFileSync('sw-template.js', 'utf8')
        .replace('__VERSION__', version)
        .replace('__PRECACHE__', JSON.stringify(urls));
      writeFileSync(join(outDir, 'sw.js'), tpl);
      console.log(`[sw] ${urls.length} Dateien vorgemerkt, Version ${version}`);
    },
  };
}

export default defineConfig({
  build: { outDir: 'dist', assetsDir: 'assets', target: 'es2020', cssCodeSplit: false },
  plugins: [serviceWorkerPlugin()],
  // Im Dev-Server werden API-Aufrufe an 'wrangler pages dev' weitergeleitet (npm run pages:watch)
  server: { proxy: { '/api': 'http://127.0.0.1:8788' } },
});
