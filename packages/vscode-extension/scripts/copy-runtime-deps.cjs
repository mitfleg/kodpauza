const fs = require('node:fs');
const path = require('node:path');

const acornEntry = require.resolve('acorn');
const acornRoot = path.resolve(path.dirname(acornEntry), '..');
const vendorDirectory = path.resolve(__dirname, '..', 'dist', 'vendor');

fs.mkdirSync(vendorDirectory, { recursive: true });
fs.copyFileSync(acornEntry, path.join(vendorDirectory, 'acorn.js'));
fs.copyFileSync(path.join(acornRoot, 'LICENSE'), path.join(vendorDirectory, 'acorn.LICENSE'));
