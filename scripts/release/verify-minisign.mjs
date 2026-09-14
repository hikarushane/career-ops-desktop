#!/usr/bin/env node
// Verify a minisign signature produced by `tauri signer sign` against an updater
// archive, using only node:crypto.
//
// Why this exists: the Windows release Authenticode-signs the NSIS installer and
// then re-signs that installer with the updater key (Tauri 2 reuses the installer
// itself as the updater artifact, so its `.exe.sig` must cover the signed bytes).
// Nothing else in the toolchain proves the resulting `.sig` actually matches the
// file we are about to publish -- `tauri signer` has no `verify` subcommand --
// so a broken re-sign would only surface as an update failure on user machines.
//
// Formats accepted for both --pubkey and --sig:
//   * a bare minisign file (starts with `untrusted comment:`), and
//   * the Tauri form: base64 of that whole file. tauri.conf.json stores
//     `plugins.updater.pubkey` that way, and `tauri signer sign` writes the `.sig`
//     that way too (verified with tauri-cli 2.11.4).
//   * --pubkey additionally accepts a bare key line on its own.
//
// Wire format (minisign):
//   public key line = base64( "Ed" | 8-byte key id | 32-byte Ed25519 public key )
//   signature line  = base64( "ED" | 8-byte key id | 64-byte Ed25519 signature )
// "ED" is the prehashed variant: the signed message is BLAKE2b-512 of the file, not
// the file itself. Tauri always writes prehashed signatures; a legacy "Ed" signature
// is rejected rather than silently verified against the wrong message.

import { createHash, createPublicKey, verify as cryptoVerify } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { isMainModule } from '../../lib/is-main-module.mjs';

const SIGNATURE_ALGORITHM_PREHASHED = 'ED';
const SIGNATURE_ALGORITHM_LEGACY = 'Ed';
const PUBLIC_KEY_ALGORITHM = 'Ed';
const KEY_ID_BYTES = 8;
const PUBLIC_KEY_BYTES = 32;
const SIGNATURE_BYTES = 64;
// SPKI DER prefix for an Ed25519 public key; the raw 32 bytes follow it.
const ED25519_SPKI_PREFIX = Buffer.from('302a300506032b6570032100', 'hex');

/** Decode the Tauri wrapper (one layer of base64) when the text is not already a minisign file. */
function unwrapMinisignFile(text) {
  const trimmed = String(text ?? '').trim();
  if (!trimmed) throw new Error('empty input');
  if (trimmed.startsWith('untrusted comment:')) return trimmed;
  const decoded = Buffer.from(trimmed, 'base64').toString('utf8');
  return decoded.startsWith('untrusted comment:') ? decoded.trim() : trimmed;
}

/**
 * The payload line of a minisign file: the first non-empty line that is not a
 * comment. For a `.pub` that is the key line; for a `.sig` the signature line
 * (the trusted comment and the global signature that follow it are not part of
 * the file signature and are ignored, exactly as minisign -Q does).
 */
function payloadLine(text) {
  const lines = unwrapMinisignFile(text)
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('untrusted comment:') && !line.startsWith('trusted comment:'));
  if (lines.length === 0) throw new Error('no payload line found');
  return lines[0];
}

function decodeBase64Strict(line, what) {
  const decoded = Buffer.from(line, 'base64');
  // Buffer.from silently ignores junk, so re-encode and compare to catch garbage.
  if (decoded.length === 0 || decoded.toString('base64').replace(/=+$/, '') !== line.replace(/=+$/, '')) {
    throw new Error(`${what} is not valid base64`);
  }
  return decoded;
}

function parsePublicKey(pubkey) {
  const raw = decodeBase64Strict(payloadLine(pubkey), 'public key');
  if (raw.length !== 2 + KEY_ID_BYTES + PUBLIC_KEY_BYTES) {
    throw new Error(`public key has unexpected length ${raw.length}`);
  }
  const algorithm = raw.subarray(0, 2).toString('latin1');
  if (algorithm !== PUBLIC_KEY_ALGORITHM) {
    throw new Error(`unsupported public key algorithm '${algorithm}'`);
  }
  return {
    keyId: raw.subarray(2, 2 + KEY_ID_BYTES),
    key: raw.subarray(2 + KEY_ID_BYTES),
  };
}

function parseSignature(sig) {
  const raw = decodeBase64Strict(payloadLine(sig), 'signature');
  if (raw.length !== 2 + KEY_ID_BYTES + SIGNATURE_BYTES) {
    throw new Error(`signature has unexpected length ${raw.length}`);
  }
  const algorithm = raw.subarray(0, 2).toString('latin1');
  if (algorithm === SIGNATURE_ALGORITHM_LEGACY) {
    throw new Error('unsupported non-prehashed signature (algorithm Ed); expected the prehashed ED form');
  }
  if (algorithm !== SIGNATURE_ALGORITHM_PREHASHED) {
    throw new Error(`unsupported signature algorithm '${algorithm}'`);
  }
  return {
    keyId: raw.subarray(2, 2 + KEY_ID_BYTES),
    signature: raw.subarray(2 + KEY_ID_BYTES),
  };
}

/**
 * Verify `data` against a minisign signature.
 *
 * @param {{ pubkey: string, sig: string, data: Buffer | Uint8Array }} input
 * @returns {{ ok: boolean, reason?: string }} never throws for bad input
 */
export function verifyMinisign({ pubkey, sig, data }) {
  let parsedKey;
  let parsedSig;
  try {
    parsedKey = parsePublicKey(pubkey);
    parsedSig = parseSignature(sig);
  } catch (error) {
    return { ok: false, reason: error.message };
  }

  if (!parsedKey.keyId.equals(parsedSig.keyId)) {
    return {
      ok: false,
      reason: `key id mismatch: signature was made with ${parsedSig.keyId.toString('hex')}, public key is ${parsedKey.keyId.toString('hex')}`,
    };
  }

  try {
    const publicKey = createPublicKey({
      key: Buffer.concat([ED25519_SPKI_PREFIX, parsedKey.key]),
      format: 'der',
      type: 'spki',
    });
    const digest = createHash('blake2b512').update(data).digest();
    if (!cryptoVerify(null, digest, publicKey, parsedSig.signature)) {
      return { ok: false, reason: 'signature does not match the file' };
    }
  } catch (error) {
    return { ok: false, reason: error.message };
  }

  return { ok: true };
}

function parseArgv(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg.startsWith('--')) throw new Error(`unexpected argument '${arg}'`);
    const value = argv[index + 1];
    if (value === undefined || value.startsWith('--')) throw new Error(`missing value for ${arg}`);
    index += 1;
    switch (arg) {
      case '--pubkey': options.pubkey = value; break;
      case '--pubkey-file': options.pubkeyFile = value; break;
      case '--file': options.file = value; break;
      case '--sig': options.sig = value; break;
      default: throw new Error(`unknown option ${arg}`);
    }
  }
  return options;
}

function main(argv) {
  let options;
  try {
    options = parseArgv(argv);
  } catch (error) {
    process.stderr.write(`verify-minisign: ${error.message}\n`);
    return 1;
  }

  const usage = 'usage: verify-minisign.mjs --pubkey <text> | --pubkey-file <path> --file <path> --sig <path>';
  if ((!options.pubkey && !options.pubkeyFile) || !options.file || !options.sig) {
    process.stderr.write(`verify-minisign: missing required argument\n${usage}\n`);
    return 1;
  }

  let pubkey;
  let sig;
  let data;
  try {
    pubkey = options.pubkeyFile ? readFileSync(options.pubkeyFile, 'utf8') : options.pubkey;
    sig = readFileSync(options.sig, 'utf8');
    data = readFileSync(options.file);
  } catch (error) {
    process.stderr.write(`verify-minisign: ${error.message}\n`);
    return 1;
  }

  const result = verifyMinisign({ pubkey, sig, data });
  if (!result.ok) {
    process.stderr.write(`verify-minisign: ${options.file}: ${result.reason}\n`);
    return 1;
  }
  process.stdout.write(`verify-minisign: ${options.file}: signature verified\n`);
  return 0;
}

if (isMainModule(import.meta.url)) {
  process.exitCode = main(process.argv.slice(2));
}
