# COLLET

**Open the app: <https://libreble.github.io/collet/>** — installable, works offline. Needs Chrome on
Android or Chrome/Edge on desktop (Web Bluetooth). No account, no cloud.

Part of [libreble](https://libreble.github.io) — your devices, set free.

A browser app to monitor and control a Dremel 8260 smart rotary tool over BLE,
using the STP/protobuf protocol documented in
[`docs/PROTOCOL.md`](./docs/PROTOCOL.md).

Runs against a **built-in mock tool** by default, so the whole UI works with no
hardware. Switch to **Bluetooth** mode to talk to a real tool (Chrome/Edge on
desktop or Android — Safari/Firefox don't support Web Bluetooth).

## Run

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # type-check + production bundle
npm run selftest   # runtime tests: STP framing, reassembly, protobuf, mock handshake
```

Web Bluetooth needs a secure context — `localhost` counts, otherwise serve over HTTPS.

## Layout

```
src/
  protocol/
    protobuf.ts   minimal varint/packed protobuf codec (no deps)
    stp.ts        STP frame encode/decode + fragment reassembler + enums
    messages.ts   message IDs, enums, typed encoders/decoders
    client.ts     ToolClient: handshake, telemetry state, commands
  ble/
    transport.ts     Transport interface + GATT UUIDs
    webBluetooth.ts  real Web Bluetooth transport
    mock.ts          simulated tool (speaks real STP frames)
  hooks/useToolClient.ts   React binding
  App.tsx                  dashboard UI
```

The app is transport-agnostic: `ToolClient` drives the protocol over any
`Transport`, so the mock and real BLE paths share all the same code.

## Status / caveats

Confirmed on a real 8260: pairing (roll the speed wheel to confirm), reconnect
with the stored token, live battery / speed / health telemetry, the RPM table, and
setting speed via the tool's turn-on-to-confirm handshake.

- The session **access token** is a client-chosen `uint32` (see PROTOCOL.md §5),
  stored per device in `localStorage`. Clear site data to force a re-pair.
- **Temperature:** the only numeric temperature on the wire is the radio module's
  (in the handle, roughly ambient). Motor and battery temperature exist only as
  warning / error / fatal status codes — shown as the Tool and Battery status dots.
- Worklight control, passive advertisement telemetry and a few catalog messages
  are implemented from the protocol notes but not yet exercised on hardware
  (PROTOCOL.md "Open items").

## Support

The app is free and stays that way. If you'd like to support the work anyway: a coffee on
[Ko-fi](https://ko-fi.com/mannes), or — honestly more useful — hardware. A device on the desk is
how it gets an app; if you have one you'd like liberated, say so in a
[device request](https://github.com/libreble/libreble.github.io/issues/new?template=device-request.yml).
