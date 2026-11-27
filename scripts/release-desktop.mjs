#!/usr/bin/env node
// Publica una versión nueva de la app de escritorio para que las PCs se actualicen solas.
//
//   node scripts/release-desktop.mjs             arma el instalador firmado y latest.json (no publica)
//   node scripts/release-desktop.mjs --publish   además crea el release en GitHub
//
// Antes: subir "version" en src-tauri/tauri.conf.json (y en src-tauri/Cargo.toml).
// La clave privada vive fuera del proyecto, en %USERPROFILE%\.tauri\ (no se sube a git).
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const REPO = 'LautaroCLM/Stockly';
const root = join(import.meta.dirname, '..');
const keyDir = join(homedir(), '.tauri');
const keyFile = join(keyDir, 'stockly-updater.key');
const passwordFile = join(keyDir, 'stockly-updater.password');

function fail(message) {
  console.error(`\n✖ ${message}`);
  process.exit(1);
}

function run(command, args, env = process.env) {
  const result = spawnSync(command, args, { cwd: root, stdio: 'inherit', env, shell: process.platform === 'win32' });
  if (result.status !== 0) fail(`Falló: ${command} ${args.join(' ')}`);
}

const config = JSON.parse(readFileSync(join(root, 'src-tauri', 'tauri.conf.json'), 'utf8'));
const version = config.version;
const cargoVersion = /^version = "([^"]+)"/m.exec(readFileSync(join(root, 'src-tauri', 'Cargo.toml'), 'utf8'))?.[1];
if (cargoVersion !== version) fail(`La versión de tauri.conf.json (${version}) y la de Cargo.toml (${cargoVersion}) no coinciden.`);
if (!existsSync(keyFile) || !existsSync(passwordFile)) fail(`No encuentro la clave de firma en ${keyDir}.`);

const tag = `desktop-v${version}`;
const publish = process.argv.includes('--publish');
if (publish && spawnSync('gh', ['release', 'view', tag, '--repo', REPO], { shell: true }).status === 0) {
  fail(`El release ${tag} ya existe. Subí la versión antes de publicar.`);
}

console.log(`\n▶ Armando Stockly ${version} firmado...\n`);
run('npx', ['tauri', 'build'], {
  ...process.env,
  TAURI_SIGNING_PRIVATE_KEY: readFileSync(keyFile, 'utf8').trim(),
  TAURI_SIGNING_PRIVATE_KEY_PASSWORD: readFileSync(passwordFile, 'utf8').trim(),
});

const bundleDir = join(root, 'src-tauri', 'target', 'release', 'bundle', 'nsis');
const installer = `${config.productName}_${version}_x64-setup.exe`;
const installerPath = join(bundleDir, installer);
const signaturePath = `${installerPath}.sig`;
if (!existsSync(installerPath) || !existsSync(signaturePath)) fail(`No se generó ${installer} con su firma (.sig).`);

// Lo que consulta cada PC al abrir Stockly
const latest = {
  version,
  notes: `Stockly ${version}`,
  pub_date: new Date().toISOString(),
  platforms: {
    'windows-x86_64': {
      signature: readFileSync(signaturePath, 'utf8').trim(),
      url: `https://github.com/${REPO}/releases/download/${tag}/${installer}`,
    },
  },
};
const latestPath = join(bundleDir, 'latest.json');
writeFileSync(latestPath, `${JSON.stringify(latest, null, 2)}\n`);
console.log(`\n✔ Listo: ${installerPath}\n✔ Listo: ${latestPath}`);

if (!publish) {
  console.log(`\nPara publicarla: node scripts/release-desktop.mjs --publish (o subí los dos archivos al release ${tag}).`);
  process.exit(0);
}

run('gh', ['release', 'create', tag, `"${installerPath}"`, `"${latestPath}"`, '--repo', REPO,
  '--title', `"Stockly escritorio ${version}"`, '--notes', `"Instalador de Windows de Stockly ${version}. Las PCs con Stockly instalado lo ofrecen solas al abrir."`]);
console.log(`\n✔ Publicado: https://github.com/${REPO}/releases/tag/${tag}`);
