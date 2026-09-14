import { describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { verifyMinisign } from '../../../scripts/release/verify-minisign.mjs';

const ROOT = resolve(__dirname, '../../..');
const CLI = join(ROOT, 'scripts/release/verify-minisign.mjs');
const FIXTURES = join(__dirname, 'fixtures/minisign');

// The fixture is the literal output of `npx tauri signer sign` (tauri-cli 2.11.4):
// `sample.zip.sig` and `probe.key.pub` are base64 of the WHOLE minisign file, which
// is the same shape tauri.conf.json stores in plugins.updater.pubkey. The matching
// secret key is deliberately not committed.
const wrappedPubkey = readFileSync(join(FIXTURES, 'probe.key.pub'), 'utf8').trim();
const wrappedSig = readFileSync(join(FIXTURES, 'sample.zip.sig'), 'utf8');
const data = readFileSync(join(FIXTURES, 'sample.zip'));

/** The bare `.pub` file contents (comment line + key line) behind the Tauri wrapper. */
const barePubkeyFile = Buffer.from(wrappedPubkey, 'base64').toString('utf8');
/** Just the key line: base64 of `Ed` + 8-byte key id + 32-byte Ed25519 key. */
const bareKeyLine = barePubkeyFile
  .split(/\r?\n/)
  .map((line) => line.trim())
  .filter((line) => line && !line.startsWith('untrusted comment:'))[0];

/** Re-encode a raw minisign line back into a `.pub`/`.sig` file body. */
function keyLineWithId(keyLine: string, keyId: Buffer) {
  const raw = Buffer.from(keyLine, 'base64');
  keyId.copy(raw, 2);
  return raw.toString('base64');
}

describe('verifyMinisign', () => {
  it('verifies the fixture with a bare public key line', () => {
    expect(verifyMinisign({ pubkey: bareKeyLine, sig: wrappedSig, data })).toEqual({ ok: true });
  });

  it('verifies the fixture with a bare public key file', () => {
    expect(verifyMinisign({ pubkey: barePubkeyFile, sig: wrappedSig, data })).toEqual({ ok: true });
  });

  it('verifies the fixture with the Tauri-wrapped public key from tauri.conf.json', () => {
    expect(verifyMinisign({ pubkey: wrappedPubkey, sig: wrappedSig, data })).toEqual({ ok: true });
  });

  it('verifies the fixture with a bare (unwrapped) signature file', () => {
    const bareSig = Buffer.from(wrappedSig.trim(), 'base64').toString('utf8');
    expect(verifyMinisign({ pubkey: wrappedPubkey, sig: bareSig, data })).toEqual({ ok: true });
  });

  it('rejects a single flipped byte in the signed data', () => {
    const tampered = Buffer.from(data);
    tampered[0] ^= 0xff;
    const result = verifyMinisign({ pubkey: wrappedPubkey, sig: wrappedSig, data: tampered });
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/signature does not match/i);
  });

  it('rejects a public key whose key id does not match the signature', () => {
    const otherId = Buffer.from('0123456789abcdef', 'hex');
    const result = verifyMinisign({ pubkey: keyLineWithId(bareKeyLine, otherId), sig: wrappedSig, data });
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/key id mismatch/i);
  });

  it('rejects a non-prehashed (Ed) signature algorithm', () => {
    const bare = Buffer.from(wrappedSig.trim(), 'base64').toString('utf8');
    const lines = bare.split('\n');
    const index = lines.findIndex((line) => line.trim() && !line.startsWith('untrusted comment:'));
    const raw = Buffer.from(lines[index].trim(), 'base64');
    raw.write('Ed', 0, 'latin1');
    lines[index] = raw.toString('base64');
    const result = verifyMinisign({ pubkey: wrappedPubkey, sig: lines.join('\n'), data });
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/unsupported non-prehashed signature/i);
  });

  it('rejects input that is not a minisign key at all', () => {
    expect(verifyMinisign({ pubkey: 'not-a-key', sig: wrappedSig, data }).ok).toBe(false);
  });
});

describe('verify-minisign CLI', () => {
  function run(args: string[]) {
    return spawnSync(process.execPath, [CLI, ...args], { encoding: 'utf8' });
  }

  it('exits 0 for a valid archive/signature pair', () => {
    const result = run([
      '--pubkey', wrappedPubkey,
      '--file', join(FIXTURES, 'sample.zip'),
      '--sig', join(FIXTURES, 'sample.zip.sig'),
    ]);
    expect(result.status).toBe(0);
  });

  it('accepts --pubkey-file as an alternative to --pubkey', () => {
    const result = run([
      '--pubkey-file', join(FIXTURES, 'probe.key.pub'),
      '--file', join(FIXTURES, 'sample.zip'),
      '--sig', join(FIXTURES, 'sample.zip.sig'),
    ]);
    expect(result.status).toBe(0);
  });

  it('exits 1 and explains itself when the signature does not match the file', () => {
    const result = run([
      '--pubkey', wrappedPubkey,
      '--file', join(FIXTURES, 'probe.key.pub'),
      '--sig', join(FIXTURES, 'sample.zip.sig'),
    ]);
    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/signature does not match/i);
  });

  it('exits 1 when a required argument is missing', () => {
    expect(run(['--file', join(FIXTURES, 'sample.zip')]).status).toBe(1);
  });
});
