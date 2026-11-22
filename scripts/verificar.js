'use strict';

const { readdirSync } = require('node:fs');
const { join } = require('node:path');
const { spawnSync } = require('node:child_process');

const arquivos = [];
for (const pasta of ['servidor', 'scripts', 'testes', 'dist']) {
  for (const arquivo of readdirSync(pasta)) {
    if (arquivo.endsWith('.js')) arquivos.push(join(pasta, arquivo));
  }
}
for (const arquivo of arquivos) {
  const resultado = spawnSync(process.execPath, ['--check', arquivo], { stdio: 'inherit' });
  if (resultado.status !== 0) process.exit(1);
}
console.log(`${arquivos.length} arquivos JavaScript sem erros de sintaxe.`);
