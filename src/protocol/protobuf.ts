// Minimal protobuf codec — only what the Dremel STS messages need.
// Fields are all non-negative varints (int32/uint32/enum/bool) plus one
// packed repeated uint32 (PowertrainRpmPerSpeedLevel). Wire types handled:
//   0 = varint, 2 = length-delimited, 1 = 64-bit, 5 = 32-bit (skipped/kept raw).
// See PROTOCOL.md §4.

export const WIRE_VARINT = 0;
export const WIRE_LEN = 2;
export const WIRE_I64 = 1;
export const WIRE_I32 = 5;

export interface DecodedField {
  wire: number;
  value: number; // for varint fields
  bytes: Uint8Array; // for length-delimited fields
}

export type DecodedMessage = Map<number, DecodedField[]>;

function readVarint(buf: Uint8Array, pos: number): [bigint, number] {
  let shift = 0n;
  let result = 0n;
  let i = pos;
  // guard against runaway on truncated input
  for (let n = 0; n < 10; n++) {
    const b = buf[i++];
    result |= BigInt(b & 0x7f) << shift;
    if ((b & 0x80) === 0) return [result, i];
    shift += 7n;
  }
  throw new Error('protobuf: varint too long');
}

export function decodeMessage(buf: Uint8Array): DecodedMessage {
  const map: DecodedMessage = new Map();
  let i = 0;
  while (i < buf.length) {
    const [tag, next] = readVarint(buf, i);
    i = next;
    const field = Number(tag >> 3n);
    const wire = Number(tag & 0x7n);
    let df: DecodedField;
    if (wire === WIRE_VARINT) {
      const [v, n2] = readVarint(buf, i);
      i = n2;
      df = { wire, value: Number(v), bytes: new Uint8Array() };
    } else if (wire === WIRE_LEN) {
      const [len, n2] = readVarint(buf, i);
      i = n2;
      const l = Number(len);
      df = { wire, value: 0, bytes: buf.slice(i, i + l) };
      i += l;
    } else if (wire === WIRE_I64) {
      df = { wire, value: 0, bytes: buf.slice(i, i + 8) };
      i += 8;
    } else if (wire === WIRE_I32) {
      df = { wire, value: 0, bytes: buf.slice(i, i + 4) };
      i += 4;
    } else {
      throw new Error(`protobuf: unsupported wire type ${wire}`);
    }
    const arr = map.get(field);
    if (arr) arr.push(df);
    else map.set(field, [df]);
  }
  return map;
}

// --- accessors ---

export function getUint(m: DecodedMessage, field: number, dflt = 0): number {
  const f = m.get(field);
  return f && f[0].wire === WIRE_VARINT ? f[0].value : dflt;
}

export function getBool(m: DecodedMessage, field: number): boolean {
  return getUint(m, field) !== 0;
}

export function getRepeatedUint(m: DecodedMessage, field: number): number[] {
  const fs = m.get(field);
  if (!fs) return [];
  const out: number[] = [];
  for (const f of fs) {
    if (f.wire === WIRE_VARINT) {
      out.push(f.value);
    } else if (f.wire === WIRE_LEN) {
      // packed varints
      let i = 0;
      while (i < f.bytes.length) {
        const [v, n] = readVarint(f.bytes, i);
        i = n;
        out.push(Number(v));
      }
    }
  }
  return out;
}

// --- encoding ---

export function writeVarint(value: number, out: number[]): void {
  let v = value >>> 0; // treat as unsigned 32-bit; our values are small & non-negative
  if (value > 0xffffffff) {
    // rare wide value — fall back to bigint path
    let bv = BigInt(value);
    do {
      let b = Number(bv & 0x7fn);
      bv >>= 7n;
      if (bv > 0n) b |= 0x80;
      out.push(b);
    } while (bv > 0n);
    return;
  }
  do {
    let b = v & 0x7f;
    v >>>= 7;
    if (v > 0) b |= 0x80;
    out.push(b);
  } while (v > 0);
}

/** Encode a message of varint (int/enum/bool) fields. `undefined` fields are skipped. */
export function encodeVarintFields(
  fields: Array<[field: number, value: number | boolean | undefined]>,
): Uint8Array {
  const out: number[] = [];
  for (const [field, value] of fields) {
    if (value === undefined) continue;
    const n = typeof value === 'boolean' ? (value ? 1 : 0) : value;
    writeVarint((field << 3) | WIRE_VARINT, out);
    writeVarint(n, out);
  }
  return new Uint8Array(out);
}
