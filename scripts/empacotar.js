'use strict';

const { cpSync, mkdirSync, copyFileSync, rmSync } = require('node:fs');

rmSync('pacote', { recursive: true, force: true });
mkdirSync('pacote', { recursive: true });
for (const pasta of ['servidor', 'dist']) cpSync(pasta, `pacote/${pasta}`, { recursive: true });
for (const arquivo of ['package.json', 'package-lock.json', '.env.example', 'README.md', 'compose.yaml']) {
  copyFileSync(arquivo, `pacote/${arquivo}`);
}
mkdirSync('pacote/scripts', { recursive: true });
copyFileSync('scripts/iniciar-postgres.ps1', 'pacote/scripts/iniciar-postgres.ps1');
console.log('Pacote criado em pacote/. Instale com npm ci --omit=dev e execute npm start.');
