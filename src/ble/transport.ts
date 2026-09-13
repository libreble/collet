// A Transport carries raw STP frame bytes to/from a tool. Two implementations:
// WebBluetoothTransport (real hardware) and MockTransport (a simulated tool).

export interface Transport {
  readonly kind: 'ble' | 'mock';
  connect(): Promise<DeviceInfo>;
  disconnect(): Promise<void>;
  /** Write one complete STP frame to the tool. */
  send(frame: Uint8Array): Promise<void>;
  /** Raw notification bytes from the tool (may be fragments of a frame). */
  onNotify(cb: (data: Uint8Array) => void): void;
  onDisconnect(cb: () => void): void;
}

export interface DeviceInfo {
  id: string;
  name: string;
}

// GATT identifiers — PROTOCOL.md §1.
export const SERVICE_UUID = '0000fde8-0000-1000-8000-00805f9b34fb';
export const CHARACTERISTIC_UUID = '02a6c0a1-0451-4000-b000-fb3210111989';
