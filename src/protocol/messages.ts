// Typed Dremel STS messages. Field numbers/enums from PROTOCOL.md §3–§4.
import { decodeMessage, encodeVarintFields, getBool, getRepeatedUint, getUint } from './protobuf';

export const MessageId = {
  TOOL_POWER_SOURCE: 87,
  POWERTRAIN_INFO: 91,
  NODE_MCU_STATUS: 82,
  NODE_COMO_STATUS: 83,
  TOOL_INFO: 84,
  MCU_INFO: 85,
  POWERTRAIN_MODE_OF_OPERATION: 92,
  POWERTRAIN_RPM_PER_SPEED_LEVEL: 93,
  POWERTRAIN_COUNT_OF_SPEED_LEVELS: 94,
  COMO_TEMPERATURE: 98,
  SERVUS: 107,
  TOOL_ACCESS_TOKEN: 113,
  TOOL_SESSION_PERMISSION: 120,
  WORKLIGHT_BRIGHTNESS: 121,
} as const;

export const AccessTokenCommand = {
  UNDEFINED: 0,
  VALIDATE: 1,
  ADD: 2,
} as const;

export const ValidationStatus = {
  UNDEFINED: 0,
  VALID: 1,
  INVALID: 2,
} as const;

const MESSAGE_NAMES: Record<number, string> = Object.fromEntries(
  Object.entries(MessageId).map(([k, v]) => [v, k]),
);
export function messageName(id: number): string {
  return MESSAGE_NAMES[id] ?? `MSG_${id}`;
}

export const RestrictionLevel = {
  MEDIUM: 0,
  LOW: 1,
  HIGH: 2,
} as const;

export const ConnectedDeviceType = {
  UNDEFINED: 0,
  FREE: 1,
  APP: 2,
  COMO: 3,
} as const;

export const ModeOfOperation = {
  DEFAULT: 0,
  SPEED_SELECTION: 1,
  ECO: 2,
  AUTO: 3,
  FAVORITE: 4,
  SOFT: 5,
  CUSTOM_A: 6,
  CUSTOM_B: 7,
} as const;

// Event severity by wire code. OVERALL_{OK,WARNING,ERROR,FATAL} = 4/5/6/7 on every
// channel; the specific codes are the tool's event enums (PROTOCOL.md §6).
// Severity-by-code is consistent across channels, so
// one map suffices; unknown codes → 'other'. (Replaces an old code%3 guess that
// mis-ranked several — e.g. POWER_PCBA / BATTERY TEMP 9/10/11 came out as fatal.)
type Severity = 'ok' | 'warning' | 'error' | 'fatal' | 'other';
const EVENT_SEVERITY: Record<number, Severity> = {
  0: 'other',
  4: 'ok',
  5: 'warning',
  6: 'error',
  7: 'fatal',
  9: 'warning', // *_TEMP_WARNING (powertrain PCBA, battery), COMO coincell-SOC
  10: 'error', // *_TEMP_ERROR, MCU kickback
  11: 'fatal', // *_TEMP_FATAL
  13: 'warning', // MOTOR_TEMP_WARNING, battery SOC_WARNING
  14: 'error', // MOTOR_TEMP_ERROR, battery SOC_ERROR, MCU restart-protection
  15: 'fatal', // MOTOR_TEMP_FATAL
  17: 'warning', // ECO_MODE_WARNING
  18: 'error', // ECO_MODE_ERROR, MCU drop-detection
  22: 'error', // MCU free-fall-detection
  27: 'fatal', // MCU acceleration-sensor
};
export function eventSeverity(code: number): Severity {
  return EVENT_SEVERITY[code] ?? 'other';
}

// Temperature-related event codes per channel — for a dedicated temp-status
// readout. The tool exposes NO numeric motor/battery temp; only these severities.
export const PowertrainTempCodes = new Set([9, 10, 11, 13, 14, 15]); // PCBA + motor temp
export const BatteryTempCodes = new Set([9, 10, 11]); // battery temp

// ---------- decoders (tool → app) ----------

export const ParameterChangeAllowance = {
  ALLOW_ALL: 0,
  DENY_ALL: 127,
} as const;

export interface ToolInfo {
  batteryPercent: number;
  activeModeOfOperation: number;
  activeSpeedLevel: number;
  abrControlEnabled: boolean;
  parameterChangeAllowanceState: number;
}
export function decodeToolInfo(p: Uint8Array): ToolInfo {
  const m = decodeMessage(p);
  return {
    batteryPercent: getUint(m, 6),
    activeModeOfOperation: getUint(m, 9),
    activeSpeedLevel: getUint(m, 10),
    abrControlEnabled: getBool(m, 12),
    parameterChangeAllowanceState: getUint(m, 13),
  };
}

export interface McuInfo {
  triggerPressed: boolean;
  kickbackControlEnabled: boolean;
}
export function decodeMcuInfo(p: Uint8Array): McuInfo {
  const m = decodeMessage(p);
  return {
    triggerPressed: getBool(m, 7),
    kickbackControlEnabled: getBool(m, 8),
  };
}

export function decodeComoTemperature(p: Uint8Array): number {
  return getUint(decodeMessage(p), 6); // onBoardTemperature (units TBD on hardware)
}

export interface PowertrainInfo {
  activeModeOfOperation: number;
  activeSpeedLevel: number;
  countOfSpeedLevels: number;
}
export function decodePowertrainInfo(p: Uint8Array): PowertrainInfo {
  const m = decodeMessage(p);
  return {
    activeModeOfOperation: getUint(m, 6),
    activeSpeedLevel: getUint(m, 7),
    countOfSpeedLevels: getUint(m, 9),
  };
}

export function decodePowertrainModeOfOperation(p: Uint8Array): {
  activeModeOfOperation: number;
  activeSpeedLevel: number;
} {
  const m = decodeMessage(p);
  return { activeModeOfOperation: getUint(m, 6), activeSpeedLevel: getUint(m, 7) };
}

export function decodeRpmPerSpeedLevel(p: Uint8Array): number[] {
  return getRepeatedUint(decodeMessage(p), 6);
}

export function decodeCountOfSpeedLevels(p: Uint8Array): number {
  return getUint(decodeMessage(p), 6);
}

export interface AccessTokenResponse {
  command: number;
  validationStatus: number;
  sessionRestrictionLevel: number;
}
export function decodeAccessToken(p: Uint8Array): AccessTokenResponse {
  const m = decodeMessage(p);
  return {
    command: getUint(m, 1),
    validationStatus: getUint(m, 2),
    sessionRestrictionLevel: getUint(m, 7),
  };
}

export function decodeSessionPermission(p: Uint8Array): number {
  return getUint(decodeMessage(p), 6); // sessionRestrictionLevel
}

export interface NodeStatusEvents {
  powertrain: number[];
  battery: number[];
  mcu: number[];
}
export function decodeNodeMcuStatus(p: Uint8Array): NodeStatusEvents {
  const m = decodeMessage(p);
  return {
    powertrain: getRepeatedUint(m, 6),
    battery: getRepeatedUint(m, 7),
    mcu: getRepeatedUint(m, 8),
  };
}
export function decodeNodeComoStatus(p: Uint8Array): number[] {
  return getRepeatedUint(decodeMessage(p), 6); // comoEvent
}

// ---------- encoders (app → tool) ----------

export function encodeServus(deviceType: number): Uint8Array {
  return encodeVarintFields([[6, deviceType]]);
}

export function encodeAccessToken(command: number, token: number): Uint8Array {
  return encodeVarintFields([
    [1, command],
    [6, token],
  ]);
}

export function encodeSetSpeed(speedLevel: number, mode?: number): Uint8Array {
  return encodeVarintFields([
    [6, mode],
    [7, speedLevel],
  ]);
}

export function encodeWorklight(enabled: boolean, brightnessPercent?: number): Uint8Array {
  return encodeVarintFields([
    [6, enabled],
    [7, brightnessPercent],
  ]);
}
