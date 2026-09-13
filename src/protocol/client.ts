// ToolClient — drives the STP session over a Transport: handshake, telemetry
// state, and high-level commands. Transport-agnostic (real BLE or mock).
import type { DeviceInfo, Transport } from '../ble/transport';
import {
  AccessMethod,
  encodeFrame,
  FrameReassembler,
  MessageType,
  Status,
  type StpFrame,
} from './stp';
import {
  AccessTokenCommand,
  ConnectedDeviceType,
  decodeAccessToken,
  decodeComoTemperature,
  decodeCountOfSpeedLevels,
  decodeNodeComoStatus,
  decodeNodeMcuStatus,
  decodePowertrainModeOfOperation,
  decodeRpmPerSpeedLevel,
  decodeToolInfo,
  encodeAccessToken,
  encodeServus,
  encodeSetSpeed,
  encodeWorklight,
  eventSeverity,
  PowertrainTempCodes,
  BatteryTempCodes,
  messageName,
  MessageId,
  ModeOfOperation,
  ParameterChangeAllowance,
  ValidationStatus,
} from './messages';

type Health = 'ok' | 'warning' | 'error' | 'fatal';
const SEVERITY_RANK: Record<string, number> = { ok: 0, other: 0, warning: 1, error: 2, fatal: 3 };

export type ConnectionState = 'disconnected' | 'connecting' | 'connected' | 'error';

export interface ToolState {
  connection: ConnectionState;
  device?: DeviceInfo;
  needsPairing: boolean;
  restrictionLevel?: number;
  batteryPercent?: number;
  temperatureC?: number;
  speedLevel?: number;
  countOfSpeedLevels?: number;
  rpmTable: number[];
  health?: Health;
  /** Tool (motor/PCBA) & battery temperature status — from event severity; the
   * tool exposes no numeric motor/battery temp (only ComoTemperature is numeric). */
  toolTemp?: Health;
  batteryTemp?: Health;
  /** Tool currently accepts parameter changes (parameterChangeAllowanceState == ALLOW_ALL). */
  changesAllowed?: boolean;
  paramChangeState?: number;
  lastSpeedSet?: 'ok' | 'failed' | 'pending';
  /** Speed preselected, awaiting confirmation (user turns the tool ON within 10 s). */
  pendingSpeed?: number;
  worklight: boolean;
  error?: string;
}

export interface LogEntry {
  t: number;
  severity: 'ok' | 'warning' | 'error' | 'fatal' | 'other' | 'info';
  text: string;
}

export interface RawFrame {
  t: number;
  dir: 'tx' | 'rx';
  messageId: number;
  name: string;
  type: number;
  access: number;
  status: number;
  hex: string;
}

const TOKEN_STORAGE_PREFIX = 'dremel.token.';
const TYPE_NAMES = ['EVENT', 'REQUEST', 'RESPONSE', 'ERR_ENABLE'];
const ACCESS_NAMES = ['READ', 'WRITE', 'EXECUTE', 'NOTIFY'];

export class ToolClient {
  private transport: Transport;
  private reassembler = new FrameReassembler();
  private listeners = new Set<() => void>();
  private token?: number;
  private handshakeStarted = false;
  private pollTimer?: ReturnType<typeof setInterval>;
  private speedTimer?: ReturnType<typeof setTimeout>;
  private unavailable = new Set<number>(); // messages the tool rejects a read for

  state: ToolState = {
    connection: 'disconnected',
    needsPairing: false,
    rpmTable: [],
    worklight: false,
  };
  log: LogEntry[] = [];
  rawFrames: RawFrame[] = [];

  constructor(transport: Transport) {
    this.transport = transport;
    transport.onNotify((data) => this.onData(data));
    transport.onDisconnect(() => {
      this.stopPolling();
      this.patch({ connection: 'disconnected' });
      this.addLog('info', 'Tool disconnected');
    });
  }

  subscribe(cb: () => void): () => void {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  async connect(): Promise<void> {
    try {
      this.handshakeStarted = false;
      this.stopPolling();
      this.unavailable.clear();
      this.patch({ connection: 'connecting', error: undefined });
      const device = await this.transport.connect();
      this.token = this.loadToken(device.id);
      this.patch({ device });
      this.addLog('info', `Connected to ${device.name}. Waiting for tool hello (Servus)…`);
      // The app's handshake is driven by the tool: it waits for the tool's
      // Servus, replies with a Servus RESPONSE, then sends the token. See
      // onServus() (fired from handleFrame).
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      this.patch({ connection: 'error', error: msg });
      this.addLog('error', `Connect failed: ${msg}`);
    }
  }

  /** Triggered by the tool's Servus: reply, then claim/validate the session. */
  private async onServus() {
    if (this.handshakeStarted) return;
    this.handshakeStarted = true;
    // Reply to the tool's hello with a Servus RESPONSE identifying us as an app
    // (accessMethod READ, messageType RESPONSE — matches the vendor app).
    await this.send(
      MessageId.SERVUS,
      MessageType.RESPONSE,
      AccessMethod.READ,
      encodeServus(ConnectedDeviceType.APP),
    );
    if (this.token !== undefined) {
      this.addLog('info', 'Validating stored session token…');
      await this.sendToken(AccessTokenCommand.VALIDATE, this.token);
    } else {
      await this.pair();
    }
  }

  /** Claim the tool: generate a token and ADD it. Roll the speed wheel to confirm. */
  async pair(): Promise<void> {
    this.token = Math.floor(Math.random() * 0xffffffff) >>> 0;
    this.handshakeStarted = true;
    this.addLog('info', `Pairing (ADD token ${this.token}) — roll the speed wheel to confirm…`);
    await this.sendToken(AccessTokenCommand.ADD, this.token);
  }

  private async sendToken(command: number, token: number) {
    // Token frames are EXECUTE / REQUEST (not WRITE) — matches the vendor app.
    await this.send(
      MessageId.TOOL_ACCESS_TOKEN,
      MessageType.REQUEST,
      AccessMethod.EXECUTE,
      encodeAccessToken(command, token),
    );
  }

  async disconnect(): Promise<void> {
    this.stopPolling();
    await this.transport.disconnect();
    this.reassembler.reset();
    this.patch({ connection: 'disconnected' });
  }

  async setSpeedLevel(level: number): Promise<void> {
    // Speed is a two-step confirm (see PROTOCOL.md): send the preselect, then the
    // user must turn the tool ON within 10 s. Confirmation = ToolInfo reporting
    // the requested level. Must include activeModeOfOperation = SPEED_SELECTION(1).
    clearTimeout(this.speedTimer);
    this.state.pendingSpeed = level;
    this.patch({ pendingSpeed: level, speedLevel: level, lastSpeedSet: 'pending' });
    await this.send(
      MessageId.POWERTRAIN_MODE_OF_OPERATION,
      MessageType.REQUEST,
      AccessMethod.WRITE,
      encodeSetSpeed(level, ModeOfOperation.SPEED_SELECTION),
    );
    this.addLog(
      'info',
      `Speed ${level} preselected — turn the tool ON within 10 s to confirm (it blinks the target speed).`,
    );
    this.speedTimer = setTimeout(() => {
      if (this.state.pendingSpeed !== undefined) {
        this.patch({ pendingSpeed: undefined, lastSpeedSet: 'failed' });
        this.addLog(
          'warning',
          'Speed confirm timed out — set it again and turn the tool ON within 10 s.',
        );
      }
    }, 10_000);
  }

  async setWorklight(on: boolean): Promise<void> {
    await this.send(
      MessageId.WORKLIGHT_BRIGHTNESS,
      MessageType.REQUEST,
      AccessMethod.WRITE,
      encodeWorklight(on, on ? 100 : 0),
    );
    this.patch({ worklight: on });
  }

  // --- internals ---

  private async send(
    messageId: number,
    messageType: number,
    accessMethod: number,
    payload: Uint8Array,
  ) {
    const frame = encodeFrame({ messageId, messageType, accessMethod, payload });
    this.logRaw('tx', { messageId, messageType, accessMethod, status: Status.NONE, payload });
    await this.transport.send(frame);
  }

  private onData(data: Uint8Array) {
    for (const frame of this.reassembler.push(data)) {
      this.logRaw('rx', frame);
      try {
        this.handleFrame(frame);
      } catch (e) {
        this.addLog('error', `Parse error: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
  }

  private handleFrame(f: StpFrame) {
    if (f.status !== Status.NONE) {
      const inSession = this.state.connection === 'connected';
      if (!inSession && f.status === Status.ACCESS_DENIED) this.patch({ needsPairing: true });
      // Speed preselect ack: the tool replies REQUEST_FAILED until the user
      // confirms by turning the tool ON. Keep 'pending'; confirm/timeout decides.
      if (f.messageId === MessageId.POWERTRAIN_MODE_OF_OPERATION) {
        if (this.state.pendingSpeed === undefined)
          this.addLog('warning', `Speed change rejected (${statusName(f.status)})`);
        return;
      }
      // A rejected read: mark unavailable (stop polling) and log once.
      if (!this.unavailable.has(f.messageId)) {
        this.unavailable.add(f.messageId);
        this.addLog(
          'warning',
          `${messageName(f.messageId)}: ${statusName(f.status)}${inSession ? '' : ' — try Pair'}`,
        );
      }
      return;
    }
    switch (f.messageId) {
      case MessageId.TOOL_ACCESS_TOKEN:
        this.onTokenResponse(f);
        break;
      case MessageId.TOOL_SESSION_PERMISSION:
        break; // restriction level; session state handled via TOOL_ACCESS_TOKEN
      case MessageId.SERVUS:
        this.addLog('info', 'Tool said hello (Servus) — responding + sending token');
        this.onServus().catch((e) => this.addLog('error', `Handshake failed: ${errMsg(e)}`));
        break;
      case MessageId.TOOL_INFO: {
        const info = decodeToolInfo(f.payload);
        const p: Partial<ToolState> = {
          batteryPercent: info.batteryPercent,
          paramChangeState: info.parameterChangeAllowanceState,
          changesAllowed: info.parameterChangeAllowanceState === ParameterChangeAllowance.ALLOW_ALL,
        };
        if (
          this.state.pendingSpeed !== undefined &&
          info.activeSpeedLevel === this.state.pendingSpeed
        ) {
          // tool adopted the requested speed → confirmed
          clearTimeout(this.speedTimer);
          p.pendingSpeed = undefined;
          p.lastSpeedSet = 'ok';
          p.speedLevel = info.activeSpeedLevel;
          this.addLog('ok', `Speed ${info.activeSpeedLevel} confirmed`);
        } else if (this.state.pendingSpeed === undefined) {
          // not awaiting a confirm → track the tool's actual level
          p.speedLevel = info.activeSpeedLevel;
        }
        this.patch(p);
        break;
      }
      case MessageId.COMO_TEMPERATURE:
        // onBoardTemperature is reported in °F — convert to °C for display
        this.patch({ temperatureC: fahrenheitToCelsius(decodeComoTemperature(f.payload)) });
        break;
      case MessageId.POWERTRAIN_MODE_OF_OPERATION: {
        // status was NONE (handled above), so this speed change was accepted
        const m = decodePowertrainModeOfOperation(f.payload);
        this.patch({
          lastSpeedSet: 'ok',
          ...(m.activeSpeedLevel ? { speedLevel: m.activeSpeedLevel } : {}),
        });
        break;
      }
      case MessageId.POWERTRAIN_COUNT_OF_SPEED_LEVELS:
        this.patch({ countOfSpeedLevels: decodeCountOfSpeedLevels(f.payload) });
        break;
      case MessageId.POWERTRAIN_RPM_PER_SPEED_LEVEL: {
        const table = decodeRpmPerSpeedLevel(f.payload);
        // COUNT read is rejected by the tool; derive it from the table instead.
        this.patch({
          rpmTable: table,
          countOfSpeedLevels: this.state.countOfSpeedLevels || table.length,
        });
        break;
      }
      case MessageId.NODE_MCU_STATUS: {
        const ev = decodeNodeMcuStatus(f.payload);
        this.patch({
          health: worstSeverity([...ev.powertrain, ...ev.battery, ...ev.mcu]),
          toolTemp: worstSeverity(ev.powertrain, PowertrainTempCodes),
          batteryTemp: worstSeverity(ev.battery, BatteryTempCodes),
        });
        this.logEvents('Motor/PCBA', ev.powertrain);
        this.logEvents('Battery', ev.battery);
        this.logEvents('MCU', ev.mcu);
        break;
      }
      case MessageId.NODE_COMO_STATUS:
        this.logEvents('Radio', decodeNodeComoStatus(f.payload));
        break;
    }
  }

  private onTokenResponse(f: StpFrame) {
    const r = decodeAccessToken(f.payload);
    if (r.validationStatus === ValidationStatus.INVALID) {
      this.patch({ needsPairing: true });
      this.addLog('error', 'Token rejected as INVALID — pair again with the tool in pairing mode.');
      return;
    }
    // granted — the tool now pushes ToolInfo/McuInfo/status notifications
    this.saveToken(this.state.device?.id, this.token);
    this.patch({
      connection: 'connected',
      needsPairing: false,
      restrictionLevel: r.sessionRestrictionLevel,
    });
    this.addLog('ok', `Session granted (restriction level ${r.sessionRestrictionLevel})`);
    this.onSessionOpen().catch((e) =>
      this.addLog('warning', `Post-session reads failed: ${errMsg(e)}`),
    );
  }

  /**
   * Reads the vendor app never does. The tool only *pushes* ToolInfo + status, so
   * temperature, the RPM table, and trigger (McuInfo) must be read explicitly.
   * The RPM table is static (read once); temperature + McuInfo are polled to
   * stay live. Rejected reads are marked unavailable and skipped (see handleFrame).
   */
  private async onSessionOpen() {
    await this.read(MessageId.POWERTRAIN_RPM_PER_SPEED_LEVEL);
    await this.pollOnce();
    this.stopPolling();
    this.pollTimer = setInterval(() => void this.pollOnce(), 1500);
  }

  private async pollOnce() {
    // Only temperature needs polling; ToolInfo + NodeMcuStatus are pushed.
    if (!this.unavailable.has(MessageId.COMO_TEMPERATURE))
      await this.read(MessageId.COMO_TEMPERATURE);
  }

  private read(messageId: number): Promise<void> {
    return this.send(messageId, MessageType.REQUEST, AccessMethod.READ, new Uint8Array());
  }

  private stopPolling() {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = undefined;
    }
    clearTimeout(this.speedTimer);
    this.state.pendingSpeed = undefined;
  }

  private logEvents(source: string, codes: number[]) {
    for (const c of codes) {
      const sev = eventSeverity(c);
      if (sev === 'ok') continue;
      this.addLog(sev, `${source} event ${c} (${sev})`);
    }
  }

  private loadToken(deviceId: string): number | undefined {
    const existing = localStorage.getItem(TOKEN_STORAGE_PREFIX + deviceId);
    return existing === null ? undefined : Number(existing) >>> 0;
  }

  private saveToken(deviceId: string | undefined, token: number | undefined) {
    if (deviceId && token !== undefined)
      localStorage.setItem(TOKEN_STORAGE_PREFIX + deviceId, String(token >>> 0));
  }

  private logRaw(
    dir: 'tx' | 'rx',
    f: {
      messageId: number;
      messageType: number;
      accessMethod: number;
      status: number;
      payload: Uint8Array;
    },
  ) {
    const entry: RawFrame = {
      t: Date.now(),
      dir,
      messageId: f.messageId,
      name: messageName(f.messageId),
      type: f.messageType,
      access: f.accessMethod,
      status: f.status,
      hex: [...f.payload].map((b) => b.toString(16).padStart(2, '0')).join(' '),
    };
    this.rawFrames = [entry, ...this.rawFrames].slice(0, 200);
    this.emit();
  }

  private patch(p: Partial<ToolState>) {
    this.state = { ...this.state, ...p };
    this.emit();
  }

  private addLog(severity: LogEntry['severity'], text: string) {
    this.log = [{ t: Date.now(), severity, text }, ...this.log].slice(0, 100);
    this.emit();
  }

  private emit() {
    this.listeners.forEach((cb) => cb());
  }
}

function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

function fahrenheitToCelsius(f: number): number {
  return Math.round((f - 32) * (5 / 9));
}

function worstSeverity(codes: number[], only?: Set<number>): Health {
  let worst: Health = 'ok';
  for (const c of codes) {
    if (only && !only.has(c)) continue;
    const s = eventSeverity(c);
    if (SEVERITY_RANK[s] > SEVERITY_RANK[worst]) worst = s as Health;
  }
  return worst;
}

function statusName(status: number): string {
  const names: Record<number, string> = {
    [Status.CMD_UNKNOWN]: 'CMD_UNKNOWN',
    [Status.ACCESS_DENIED]: 'ACCESS_DENIED',
    [Status.PARAM_ERROR]: 'PARAM_ERROR',
    [Status.REQUEST_FAILED]: 'REQUEST_FAILED',
  };
  return names[status] ?? `status ${status}`;
}

export { TYPE_NAMES, ACCESS_NAMES };
