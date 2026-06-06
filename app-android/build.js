// Construye la carpeta www: copia paix-web, empaqueta native-ble.js e inyecta su <script>.
const fs = require('fs');
const path = require('path');
const esbuild = require('esbuild');

const ROOT = __dirname;
const SRC = path.resolve(ROOT, '..', 'paix-web');
const WWW = path.resolve(ROOT, 'www');

fs.rmSync(WWW, { recursive: true, force: true });
fs.mkdirSync(WWW, { recursive: true });

// Copiar la web (excluyendo utilidades que no van en la app)
fs.cpSync(SRC, WWW, {
  recursive: true,
  filter: (s) => !s.endsWith('.py'),
});

// Empaquetar el cliente BLE nativo
esbuild.buildSync({
  entryPoints: [path.join(ROOT, 'src', 'native-ble-entry.js')],
  bundle: true,
  format: 'iife',
  outfile: path.join(WWW, 'native-ble.js'),
  minify: true,
});

// Inyectar el <script> de native-ble.js justo antes de ble.js
const indexPath = path.join(WWW, 'index.html');
let html = fs.readFileSync(indexPath, 'utf8');
if (!html.includes('native-ble.js')) {
  html = html.replace('<script src="ble.js"></script>',
    '<script src="native-ble.js"></script>\n<script src="ble.js"></script>');
  fs.writeFileSync(indexPath, html);
}
console.log('www construido en', WWW);
