/// <reference types="web-bluetooth" />
import { CHARACTERISTIC_UUID, SERVICE_UUID, type DeviceInfo, type Transport } from './transport';

/** Whether this browser exposes the Web Bluetooth API at all (not Safari/Firefox). */
export function isWebBluetoothAvailable(): boolean {
  return typeof navigator !== 'undefined' && 'bluetooth' in navigator;
}

export class WebBluetoothTransport implements Transport {
  readonly kind = 'ble' as const;
  private device?: BluetoothDevice;
  private characteristic?: BluetoothRemoteGATTCharacteristic;
  private notifyCb?: (data: Uint8Array) => void;
  private disconnectCb?: () => void;

  async connect(): Promise<DeviceInfo> {
    if (!isWebBluetoothAvailable()) {
      throw new Error('Web Bluetooth is not available in this browser.');
    }
    const device = await navigator.bluetooth.requestDevice({
      filters: [{ services: [SERVICE_UUID] }],
      optionalServices: [SERVICE_UUID],
    });
    this.device = device;
    device.addEventListener('gattserverdisconnected', () => this.disconnectCb?.());

    const server = await device.gatt!.connect();
    const service = await server.getPrimaryService(SERVICE_UUID);
    const characteristic = await service.getCharacteristic(CHARACTERISTIC_UUID);
    this.characteristic = characteristic;

    characteristic.addEventListener('characteristicvaluechanged', () => {
      const dv = characteristic.value;
      if (dv && this.notifyCb) this.notifyCb(new Uint8Array(dv.buffer));
    });
    await characteristic.startNotifications();

    return { id: device.id, name: device.name ?? 'Dremel 8260' };
  }

  async disconnect(): Promise<void> {
    try {
      await this.characteristic?.stopNotifications();
    } catch {
      /* ignore */
    }
    this.device?.gatt?.disconnect();
  }

  // Web Bluetooth allows only one GATT operation at a time ("GATT operation
  // already in progress"), so every write is chained after the previous one.
  private writeChain: Promise<void> = Promise.resolve();

  async send(frame: Uint8Array): Promise<void> {
    const run = this.writeChain.then(() => this.doWrite(frame));
    this.writeChain = run.catch(() => {}); // keep the chain alive after a failure
    return run;
  }

  private async doWrite(frame: Uint8Array): Promise<void> {
    if (!this.characteristic) throw new Error('Not connected');
    // Copy into a fresh ArrayBuffer-backed view for the BLE stack.
    const buf = new Uint8Array(frame);
    if (this.characteristic.writeValueWithResponse) {
      await this.characteristic.writeValueWithResponse(buf);
    } else {
      await this.characteristic.writeValue(buf);
    }
  }

  onNotify(cb: (data: Uint8Array) => void): void {
    this.notifyCb = cb;
  }

  onDisconnect(cb: () => void): void {
    this.disconnectCb = cb;
  }
}
