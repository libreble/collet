// A simulated Dremel 8260 for hardware-free development. It speaks the real STP
// wire format (framed protobuf) so the app's codec/client are exercised end to end.
import { encodeVarintFields } from '../protocol/protobuf';
import { AccessMethod, decodeFrame, encodeFrame, MessageType } from '../protocol/stp';
import {
  AccessTokenCommand,
  ConnectedDeviceType,
  MessageId,
  RestrictionLevel,
} from '../protocol/messages';
import type { DeviceInfo, Transport } from './transport';

// tool reports rpm/10 (see PROTOCOL.md); UI multiplies by 10 for display
const RPM_TABLE = [500, 800, 1100, 1400, 1700, 2000, 2300, 2600, 3000, 3500];

export class MockTransport implements Transport {
  readonly kind = 'mock' as const;
  private notifyCb?: (data: Uint8Array) => void;
  private timers: ReturnType<typeof setInterval>[] = [];
  private txQueue: Uint8Array[] = [];
  private pumping = false;

  // simulated tool state
  private battery = 87;
  private temperatureC = 32;
  private speedLevel = 3;
  private trigger = false;

  async connect(): Promise<DeviceInfo> {
    // The real tool greets the app with a Servus (REQUEST/READ); the app replies
    // and then sends its token. Kick that off shortly after connect.
    setTimeout(
      () =>
        this.respond(
          MessageId.SERVUS,
          encodeVarintFields([[6, ConnectedDeviceType.COMO]]),
          MessageType.REQUEST,
          AccessMethod.READ,
        ),
      40,
    );
    // Emit telemetry once connected. Like the real tool, only ToolInfo and
    // NodeMcuStatus are *pushed*; McuInfo/temperature are answered on read.
    this.timers.push(setInterval(() => this.emitToolInfo(), 1000));
    this.timers.push(setInterval(() => this.tickPhysics(), 1000));
    this.timers.push(setInterval(() => this.emitStatus(), 1000));
    setTimeout(() => this.emitStatus(), 250);
    return { id: 'mock-8260', name: 'Dremel 8260 (mock)' };
  }

  async disconnect(): Promise<void> {
    this.timers.forEach(clearInterval);
    this.timers = [];
    this.txQueue = [];
  }

  async send(frame: Uint8Array): Promise<void> {
    const f = decodeFrame(frame);
    if (!f) return;
    switch (f.messageId) {
      case MessageId.SERVUS:
        // app's Servus RESPONSE — acknowledged, no reply needed
        break;
      case MessageId.TOOL_ACCESS_TOKEN:
        // ADD or VALIDATE → grant a session (LOW restriction = full control).
        this.respond(
          MessageId.TOOL_ACCESS_TOKEN,
          encodeVarintFields([
            [1, AccessTokenCommand.VALIDATE],
            [2, 1 /* VALIDATION_STATUS_VALID */],
            [7, RestrictionLevel.LOW],
          ]),
        );
        this.respond(
          MessageId.TOOL_SESSION_PERMISSION,
          encodeVarintFields([[6, RestrictionLevel.LOW]]),
        );
        break;
      case MessageId.POWERTRAIN_MODE_OF_OPERATION: {
        const m = decodeVarintMap(f.payload);
        if (m.has(7)) this.speedLevel = clamp(m.get(7)!, 1, RPM_TABLE.length);
        this.respond(
          MessageId.POWERTRAIN_MODE_OF_OPERATION,
          encodeVarintFields([[7, this.speedLevel]]),
          MessageType.RESPONSE,
        );
        this.emitToolInfo();
        break;
      }
      case MessageId.WORKLIGHT_BRIGHTNESS:
        // acknowledged; the tool has no worklight-status message to report back
        break;
      case MessageId.POWERTRAIN_COUNT_OF_SPEED_LEVELS:
        this.respond(
          MessageId.POWERTRAIN_COUNT_OF_SPEED_LEVELS,
          encodeVarintFields([[6, RPM_TABLE.length]]),
        );
        break;
      case MessageId.POWERTRAIN_RPM_PER_SPEED_LEVEL:
        this.respond(MessageId.POWERTRAIN_RPM_PER_SPEED_LEVEL, encodePackedUints(6, RPM_TABLE));
        break;
      case MessageId.COMO_TEMPERATURE:
        this.respond(
          MessageId.COMO_TEMPERATURE,
          encodeVarintFields([[6, Math.round(this.temperatureC)]]),
          MessageType.RESPONSE,
          AccessMethod.READ,
        );
        break;
      case MessageId.MCU_INFO:
        this.respond(
          MessageId.MCU_INFO,
          encodeVarintFields([[7, this.trigger]]),
          MessageType.RESPONSE,
          AccessMethod.READ,
        );
        break;
    }
  }

  onNotify(cb: (data: Uint8Array) => void): void {
    this.notifyCb = cb;
  }
  onDisconnect(_cb: () => void): void {
    // mock never drops the link on its own
  }

  // --- helpers ---

  private respond(
    messageId: number,
    payload: Uint8Array,
    messageType: number = MessageType.RESPONSE,
    accessMethod: number = AccessMethod.NOTIFY,
  ) {
    // Enqueue and pump in order. Real BLE preserves notification order per
    // characteristic, so frames must never interleave — only fragment.
    this.txQueue.push(encodeFrame({ messageId, messageType, accessMethod, payload }));
    this.pump();
  }

  private pump() {
    if (this.pumping) return;
    this.pumping = true;
    const step = () => {
      const frame = this.txQueue.shift();
      if (!frame || !this.notifyCb) {
        this.pumping = false;
        return;
      }
      // occasionally split one frame into two BLE packets to exercise reassembly
      if (frame.length > 8 && Math.random() < 0.3) {
        const cut = Math.floor(frame.length / 2);
        this.notifyCb(frame.slice(0, cut));
        setTimeout(() => {
          this.notifyCb?.(frame.slice(cut));
          setTimeout(step, 5);
        }, 8);
      } else {
        this.notifyCb(frame);
        setTimeout(step, 5);
      }
    };
    setTimeout(step, 10);
  }

  private emitToolInfo() {
    this.respond(
      MessageId.TOOL_INFO,
      encodeVarintFields([
        [6, Math.round(this.battery)],
        [9, 1 /* SPEED_SELECTION */],
        [10, this.speedLevel],
        [12, false],
        [13, 0 /* parameterChangeAllowanceState = ALLOW_ALL */],
      ]),
      MessageType.EVENT,
    );
  }

  private emitStatus() {
    // powertrain(6)/battery(7)/mcu(8) event lists — OVERALL_OK(4), or WARNING(5)
    // for the overheating subsystem, matching the tool's health traffic-light.
    const hot = this.temperatureC > 55;
    const payload = new Uint8Array([
      ...encodePackedUints(6, [hot ? 5 : 4]),
      ...encodePackedUints(7, [hot ? 5 : 4]),
      ...encodePackedUints(8, [4]),
    ]);
    this.respond(MessageId.NODE_MCU_STATUS, payload, MessageType.EVENT);
  }

  private tickPhysics() {
    // trigger flickers; running heats up and drains battery.
    this.trigger = Math.random() < 0.25;
    if (this.trigger) {
      this.temperatureC += this.speedLevel * 0.4;
      this.battery = Math.max(0, this.battery - 0.15);
    } else {
      this.temperatureC += (30 - this.temperatureC) * 0.05; // cool toward ambient
    }
  }
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

function decodeVarintMap(buf: Uint8Array): Map<number, number> {
  const out = new Map<number, number>();
  let i = 0;
  const rv = (): number => {
    let shift = 0n;
    let r = 0n;
    for (;;) {
      const b = buf[i++];
      r |= BigInt(b & 0x7f) << shift;
      if ((b & 0x80) === 0) break;
      shift += 7n;
    }
    return Number(r);
  };
  while (i < buf.length) {
    const tag = rv();
    const field = tag >> 3;
    const wire = tag & 0x7;
    if (wire === 0) out.set(field, rv());
    else break;
  }
  return out;
}

function encodePackedUints(field: number, values: number[]): Uint8Array {
  const inner: number[] = [];
  for (const v of values) {
    let x = v >>> 0;
    do {
      let b = x & 0x7f;
      x >>>= 7;
      if (x > 0) b |= 0x80;
      inner.push(b);
    } while (x > 0);
  }
  const out: number[] = [(field << 3) | 2, inner.length, ...inner];
  return new Uint8Array(out);
}
