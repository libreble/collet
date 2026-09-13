// STP (Bosch "Smart Tool Protocol") framing — encoder, decoder and reassembler.
// See PROTOCOL.md §2 for the exact bit layout.

export const MessageType = {
  EVENT: 0,
  REQUEST: 1,
  RESPONSE: 2,
  ERROR_MESSAGE_ENABLE: 3,
} as const;

export const AccessMethod = {
  READ: 0,
  WRITE: 1,
  EXECUTE: 2,
  NOTIFY: 3,
} as const;

export const Status = {
  NONE: 0,
  CMD_UNKNOWN: 1,
  ACCESS_DENIED: 2,
  PARAM_ERROR: 3,
  REQUEST_FAILED: 15,
} as const;

export interface StpFrame {
  messageId: number;
  messageType: number;
  accessMethod: number;
  status: number;
  payload: Uint8Array;
}

const MASK_SIZE = 0x60;
const MASK_MSG_TYPE = 0x18;
const MASK_MSG_ID = 0x1fc;

/** Build a wire frame from a message + protobuf payload. */
export function encodeFrame(f: {
  messageId: number;
  messageType: number;
  accessMethod: number;
  payload: Uint8Array;
}): Uint8Array {
  const len = f.payload.length;
  const sizeClass = len === 0 ? 0 : len < 256 ? 1 : 2;
  const b0 = (sizeClass << 5) | 0x04;
  const b1 = ((f.messageId >>> 6) & 1) | (f.messageType << 3);
  const bN = f.accessMethod | ((f.messageId << 2) & 0xff);

  const out: number[] = [b0, b1];
  if (sizeClass === 1) out.push(len & 0xff);
  else if (sizeClass === 2) out.push(len & 0xff, (len >> 8) & 0xff); // little-endian
  out.push(bN);
  const frame = new Uint8Array(out.length + len);
  frame.set(out, 0);
  frame.set(f.payload, out.length);
  return frame;
}

/**
 * Parse a single, complete frame. Returns null if `buf` is too short to be a
 * frame. Throws only on structurally invalid (but complete) data.
 */
export function decodeFrame(buf: Uint8Array): StpFrame | null {
  if (buf.length < 3) return null;
  const sizeClass = (buf[0] & MASK_SIZE) >> 5;
  let payloadLen: number;
  if (sizeClass === 1) payloadLen = buf[2];
  else if (sizeClass === 2) payloadLen = buf[2] | (buf[3] << 8);
  else payloadLen = 0;

  const statusPresent = (buf[1] & 0x04) !== 0;
  const i2 = sizeClass + 2 + (statusPresent ? 1 : 0);
  if (i2 + 1 + payloadLen > buf.length) return null; // incomplete

  const accessMethod = buf[i2] & 0x03;
  const messageType = (buf[1] & MASK_MSG_TYPE) >> 3;
  const messageId = (((buf[1] << 8) | buf[i2]) & MASK_MSG_ID) >> 2;
  const status = statusPresent ? buf[i2 - 1] & 0x0f : Status.NONE;
  const payload = buf.slice(i2 + 1, i2 + 1 + payloadLen);
  return { messageId, messageType, accessMethod, status, payload };
}

/**
 * Reassembles a byte stream (BLE notifications may fragment a frame across
 * several packets, or deliver several frames back-to-back) into whole frames.
 */
export class FrameReassembler {
  private buf = new Uint8Array(0);

  push(chunk: Uint8Array): StpFrame[] {
    const merged = new Uint8Array(this.buf.length + chunk.length);
    merged.set(this.buf, 0);
    merged.set(chunk, this.buf.length);
    this.buf = merged;

    const frames: StpFrame[] = [];
    for (;;) {
      const total = this.frameLength(this.buf);
      if (total === null || this.buf.length < total) break;
      const frame = decodeFrame(this.buf.slice(0, total));
      this.buf = this.buf.slice(total);
      if (frame) frames.push(frame);
    }
    return frames;
  }

  reset(): void {
    this.buf = new Uint8Array(0);
  }

  /** Total byte length of the frame at the head of `b`, or null if unknown yet. */
  private frameLength(b: Uint8Array): number | null {
    if (b.length < 2) return null;
    const sizeClass = (b[0] & MASK_SIZE) >> 5;
    const statusPresent = (b[1] & 0x04) !== 0;
    if (b.length < 2 + sizeClass) return null;
    let payloadLen: number;
    if (sizeClass === 1) payloadLen = b[2];
    else if (sizeClass === 2) payloadLen = b[2] | (b[3] << 8);
    else payloadLen = 0;
    const headerLen = sizeClass + 2 + (statusPresent ? 1 : 0) + 1;
    return headerLen + payloadLen;
  }
}
