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

## Self-host

The hosted app above is the easiest way. If you'd rather run your own copy, it's a static site —
nothing to configure, no backend, no database.

**Docker** — a prebuilt image (linux/amd64 + arm64) is published to the GitHub Container Registry:

```bash
docker run -d --name collet -p 8080:8080 --restart unless-stopped ghcr.io/libreble/collet
# → http://localhost:8080/
```

```yaml
# compose.yaml
services:
  collet:
    image: ghcr.io/libreble/collet:latest
    ports: ['8080:8080']
    restart: unless-stopped
```

The image serves the app at `/`. To serve it under a subpath behind your own proxy, build it
yourself: `docker build --build-arg BASE_PATH=/collet/ -t collet .`

**Build and host it yourself** — any static web server works:

```bash
npm ci
BASE_PATH=/ npm run build      # → dist/
# upload dist/ to nginx, Caddy, Netlify, Cloudflare Pages, a bucket, …
```

Set `BASE_PATH` to the path you serve from (it defaults to `/collet/`, the GitHub Pages path).
Two things your server should do: send unknown paths to `index.html` (client-side routes), and
serve `index.html` and `sw.js` with `Cache-Control: no-cache` so updates reach installed copies.
[`docker/nginx.conf.template`](docker/nginx.conf.template) is a working nginx example.

> **HTTPS is required.** Web Bluetooth only works in a secure context. `http://localhost` counts,
> so the app works on the machine running it — but `http://192.168.x.x:8080` from your phone
> will load and then refuse to connect. For phones, put it behind TLS: a reverse proxy with a
> real certificate (Caddy does this automatically for a domain), or `tailscale serve`.

Self-hosted copies keep their `<link rel="canonical">` pointing at libreble.github.io, so
search engines don't treat them as duplicates.

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
