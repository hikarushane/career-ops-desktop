export type MinisignResult = { ok: boolean; reason?: string };

export function verifyMinisign(input: {
  pubkey: string;
  sig: string;
  data: Uint8Array;
}): MinisignResult;
