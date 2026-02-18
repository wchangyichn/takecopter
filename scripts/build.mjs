#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const rootDir = process.cwd();
const desktopDir = path.join(rootDir, 'apps', 'desktop');

if (!existsSync(desktopDir)) {
  console.error('Desktop project not found: apps/desktop');
  process.exit(1);
}

const args = process.argv.slice(2);

function getArgValue(name, fallback) {
  const index = args.indexOf(name);
  if (index >= 0 && args[index + 1]) {
    return args[index + 1];
  }
  return fallback;
}

function hasArg(name) {
  return args.includes(name);
}

const platformArg = getArgValue('--platform', 'web');
const platforms = platformArg
  .split(',')
  .map((item) => item.trim().toLowerCase())
  .filter(Boolean);

const effectivePlatforms = platforms.includes('all')
  ? ['web', 'macos', 'windows', 'android', 'ios']
  : platforms;

const validPlatforms = new Set(['web', 'macos', 'windows', 'android', 'ios']);
const invalid = effectivePlatforms.filter((item) => !validPlatforms.has(item));

if (invalid.length > 0) {
  console.error(`Unsupported platform: ${invalid.join(', ')}`);
  console.error('Supported values: web, macos, windows, android, ios, all');
  process.exit(1);
}

if (effectivePlatforms.length === 0) {
  console.error('No platform specified. Use --platform web|macos|windows|android|ios|all');
  process.exit(1);
}

const allowMissingMobile = hasArg('--allow-missing-mobile');

function run(command, commandArgs, cwd) {
  const result = spawnSync(command, commandArgs, {
    cwd,
    stdio: 'inherit',
    env: process.env,
    shell: process.platform === 'win32',
  });

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

function buildWeb() {
  console.log('\n[build] platform=web');
  run('npm', ['run', 'build'], desktopDir);
}

function buildMacos() {
  console.log('\n[build] platform=macos');
  run('npm', ['run', 'tauri:build'], desktopDir);
}

function buildWindows() {
  console.log('\n[build] platform=windows');
  run('npm', ['run', 'tauri:build', '--', '--target', 'x86_64-pc-windows-msvc'], desktopDir);
}

function buildMobile(platform) {
  const message = `[build] platform=${platform} is not implemented in this repository yet.`;
  if (allowMissingMobile) {
    console.warn(`${message} Skipped.`);
    return;
  }

  console.error(message);
  console.error('Use --allow-missing-mobile to skip mobile targets for now.');
  process.exit(1);
}

for (const platformName of effectivePlatforms) {
  if (platformName === 'web') {
    buildWeb();
  } else if (platformName === 'macos') {
    buildMacos();
  } else if (platformName === 'windows') {
    buildWindows();
  } else if (platformName === 'android' || platformName === 'ios') {
    buildMobile(platformName);
  }
}

console.log('\nBuild finished.');
