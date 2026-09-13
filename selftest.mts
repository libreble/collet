// Runtime self-test for the protocol layer + mock/client handshake.
// Bundled with esbuild and run in Node (see command).
import {
  encodeFrame,
  decodeFrame,
  FrameReassembler,
  MessageType,
  AccessMethod,
} from './src/protocol/stp';
import {
  encodeVarintFields,
  decodeMessage,
  getUint,
  getRepeatedUint,
} from './src/protocol/protobuf';
import { ToolClient } from './src/protocol/client';
import { MockTransport } from './src/ble/mock';

// minimal localStorage shim for Node
const store: Record<string, string> = {};
(globalThis as unknown as { localStorage: Storage }).localStorage = {
  getItem: (k: string) => store[k] ?? null,
  setItem: (k: string, v: string) => void (store[k] = v),
  removeItem: (k: string) => void delete store[k],
  clear: () => {},
  key: () => null,
  length: 0,
} as Storage;

let fails = 0;
const assert = (cond: unknown, msg: string) => {
  if (cond) console.log('  ok  ', msg);
  else {
    console.error('  FAIL', msg);
    fails++;
  }
};
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

console.log('protobuf:');
const pb = encodeVarintFields([
  [7, 5],
  [6, 1],
]);
const pm = decodeMessage(pb);
assert(getUint(pm, 7) === 5 && getUint(pm, 6) === 1, 'varint fields round-trip');

console.log('STP framing:');
const frame = encodeFrame({
  messageId: 92,
  messageType: MessageType.REQUEST,
  accessMethod: AccessMethod.WRITE,
  payload: pb,
});
const d = decodeFrame(frame)!;
assert(d.messageId === 92, `messageId 92 (got ${d.messageId})`);
assert(d.messageType === MessageType.REQUEST, 'messageType REQUEST');
assert(d.accessMethod === AccessMethod.WRITE, 'accessMethod WRITE');
assert(getUint(decodeMessage(d.payload), 7) === 5, 'payload survives framing');

// message id 113 exercises the high bit split across byte1/byteN
const f113 = decodeFrame(
  encodeFrame({
    messageId: 113,
    messageType: MessageType.RESPONSE,
    accessMethod: AccessMethod.NOTIFY,
    payload: new Uint8Array(),
  }),
)!;
assert(f113.messageId === 113, `messageId 113 hi-bit split (got ${f113.messageId})`);

console.log('reassembly:');
const ra = new FrameReassembler();
const half = Math.floor(frame.length / 2);
assert(ra.push(frame.slice(0, half)).length === 0, 'holds partial frame');
const done = ra.push(frame.slice(half));
assert(done.length === 1 && done[0].messageId === 92, 'completes split frame');
const two = new FrameReassembler().push(new Uint8Array([...frame, ...frame]));
assert(two.length === 2, `two back-to-back frames (got ${two.length})`);

console.log('mock <-> client handshake:');
const client = new ToolClient(new MockTransport());
await client.connect(); // fresh device (empty localStorage) → auto-pairs (ADD)
await sleep(300);
assert(
  client.state.connection === 'connected',
  `connected after auto-pair (got ${client.state.connection})`,
);
assert(client.state.restrictionLevel === 1, 'session restriction LOW(1)');
// packed repeated uint32 decode (PowertrainRpmPerSpeedLevel field 6 = [5000, 35000])
const packed = new Uint8Array([0x32, 0x05, 0x88, 0x27, 0xb8, 0x91, 0x02]);
const rpm = getRepeatedUint(decodeMessage(packed), 6);
assert(
  rpm.length === 2 && rpm[0] === 5000 && rpm[1] === 35000,
  `packed repeated uint decode [${rpm}]`,
);
assert(
  getRepeatedUint(decodeMessage(encodeVarintFields([])), 1).length === 0,
  'getRepeatedUint empty ok',
);
await sleep(1200);
assert(typeof client.state.batteryPercent === 'number', 'battery telemetry received');
assert(client.state.health === 'ok', `health telemetry received (got ${client.state.health})`);
await client.setSpeedLevel(7);
await sleep(150);
assert(client.state.speedLevel === 7, `speed change echoed (got ${client.state.speedLevel})`);
await client.disconnect();

console.log(fails ? `\n${fails} CHECK(S) FAILED` : '\nALL CHECKS PASSED');
process.exit(fails ? 1 : 0);
