# Dremel 8260 — BLE Protocol Notes

Documented from traffic observed between the vendor app and a Dremel 8260, then
confirmed by driving the tool directly from a browser. Items not yet checked
against real hardware are called out under
[Open items](#open-items-confirm-on-hardware).

The tool speaks Bosch **"Smart Tool Services" (STS)** — a protobuf payload wrapped
in a small bit-packed framing layer Bosch calls **STP (Smart Tool Protocol)**,
carried over BLE GATT. **There is no encryption and no cryptographic
challenge-response.** The whole thing is reproducible from a browser via Web
Bluetooth.

---

## 1. BLE layer

### Advertisement / scanning
The vendor app scans with this filter:

| Field | Value |
|---|---|
| Service UUID | `0000fde8-0000-1000-8000-00805f9b34fb` (16-bit `0xFDE8`, Bosch) |
| Manufacturer ID | **678** (`0x02A6`) |

The **advertisement itself carries live state** — readable passively via a BLE
scan without connecting:

| Field | Meaning |
|---|---|
| `advertisingMode` | `6` = default discoverable mode; anything else = unknown |
| `batteryPercent` | battery % |
| `eloAwakeStatusOn` | tool is **awake** (electronics on) |
| `eloWakeUpAllowed` | remote wake-up permitted |
| `appConnected` | an app is already connected |
| `toolLocked` | tool is locked (claimed/paired) |
| `powerSourceType`, `moduleVariant`, `ptid` | identity |

The tool **sleeps to save power and drops the BLE link when not awake**. The
vendor app re-scans for an *awake* advertisement before reconnecting. A custom
client must
expect the tool to disconnect when idle, and (ideally) watch advertisements to
know when it's awake. Web Bluetooth exposes this via `watchAdvertisements()` +
`manufacturerData` (experimental).

### GATT — one service, one characteristic
All traffic (commands out, telemetry in) goes through a **single** characteristic.

| Role | UUID | Notes |
|---|---|---|
| Service | *(contains the characteristic below)* | discovered after connect |
| Data characteristic | `02a6c0a1-0451-4000-b000-fb3210111989` | **write** commands here, **notify** for responses/telemetry |
| CCCD | `00002902-0000-1000-8000-00805f9b34fb` | write `01 00` to enable notifications |

Note the characteristic UUID begins `02a6` = `0x02A6` = 678, matching the
manufacturer ID.

### Connection / handshake sequence
**The handshake is tool-driven — the client waits, it does not speak first:**

1. Scan for service `0xFDE8` + manufacturer `678`, connect GATT.
2. Discover the service, find characteristic `02a6c0a1…`, **enable notifications** (CCCD).
3. **Wait for the tool's `Servus`** (msg `107`, arrives as `REQUEST`/`READ`).
4. **Reply** with `Servus{ connectedDeviceType = APP(2) }` as **`RESPONSE`/`READ`**.
5. **Auth** — send `ToolAccessToken` as **`REQUEST`/`EXECUTE`** (see §5):
   - Reconnecting a known tool → `{ VALIDATE, token }`.
   - First-time pairing → `{ ADD, token }`, then **roll the speed wheel within
     ~10 s** to confirm.
   - Tool replies `ToolAccessToken` (+ `ToolSessionPermission` msg `120`) with a
     restriction level. The vendor app waits up to **11 s** for this.
6. Once granted, the tool **pushes** `ToolInfo` (`84`), `McuInfo` (`85`),
   `NodeMcuStatus` (`82`), etc. as notifications — no explicit reads.
7. Change speed by sending `PowertrainModeOfOperation{ activeModeOfOperation =
   SPEED_SELECTION_MODE(1), activeSpeedLevel = N }` as **`REQUEST`/`WRITE`**.
   **Both fields are required** — sending only `activeSpeedLevel` is silently
   ignored by the tool (confirmed on hardware).

**Access methods matter** (the tool ignores a token sent with the wrong one):

| Message | messageType | accessMethod |
|---|---|---|
| `Servus` reply | `RESPONSE` (2) | `READ` (0) |
| `ToolAccessToken` (ADD/VALIDATE) | `REQUEST` (1) | **`EXECUTE` (2)** |
| `PowertrainModeOfOperation` (set speed) | `REQUEST` (1) | `WRITE` (1) |

---

## 2. STP frame format

Bit layout. Masks: payload-size class `0x60`, message type `0x18`, message id
`0x1FC`.

```
byte 0  : transport control   b7 b6 b5 b4 b3 b2 b1 b0
            bits 6..5 = sizeClass  (0 = no payload, 1 = 1-byte len, 2 = 2-byte LE len)
            bit  2    = 1          (constant framing marker; always set)
byte 1  : message control
            bits 4..3 = messageType  (EVENT 0, REQUEST 1, RESPONSE 2, ERR_MSG_ENABLE 3)
            bit  2    = statusPresent (tool→app responses only)
            bit  0    = message-id high bit (bit 6 of the 7-bit id)
[len]   : payload length   (present iff sizeClass>0; 1 byte, or 2 bytes little-endian if sizeClass==2)
[stat]  : status byte      (present iff statusPresent; low nibble = status)
byteN   : access control   (index N = sizeClass + 2 + statusPresent)
            bits 7..2 = message-id low 6 bits
            bits 1..0 = accessMethod (READ 0, WRITE 1, EXECUTE 2, NOTIFY 3)
byteN+1.. : protobuf payload  (length must equal [len])
```

`messageId = ((byte1 << 8 | byteN) & 0x1FC) >> 2`  — 7 bits split across `byte1`
(1 high bit) and `byteN` (6 low bits).

### Receive (parse a notification)
```
if (len < 3) -> NoMessage
sizeClass     = (b[0] & 0x60) >> 5
payloadLen    = sizeClass==1 ? (b[2] & 0xFF)
              : sizeClass==2 ? (b[2] | b[3]<<8)      // little-endian
              : 0
statusPresent = (b[1] & 0x04) != 0
i2            = sizeClass + 2 + (statusPresent ? 1 : 0)
accessMethod  = b[i2] & 0x03
messageType   = (b[1] & 0x18) >> 3
messageId     = ((b[1]<<8 | b[i2]) & 0x1FC) >> 2
payload       = b[i2+1 ..]                            // len(payload) must == payloadLen
status        = statusPresent ? (b[i2-1] & 0x0F) : NONE
// dispatch on messageId -> protobuf decode(payload)
```

### Send (build a command)
```
payload   = protobufEncode(message)
len       = payload.length
sizeClass = len==0 ? 0 : (len < 256 ? 1 : 2)
b0        = (sizeClass << 5) | 0x04
b1        = ((msgId >>> 6) & 1) | (messageType << 3)
bN        = accessMethod | ((msgId << 2) & 0xFF)
frame     = [b0, b1] ++ (len>0 ? [len] : []) ++ [bN] ++ payload
```
*(Observed app→tool frames always carry a single length byte — real payloads are
all < 256 bytes — and never set the status flag.)*

### Framing enums
| messageType | | accessMethod | | status | |
|---|---|---|---|---|---|
| EVENT | 0 | READ | 0 | NONE | 0 |
| REQUEST | 1 | WRITE | 1 | CMD_UNKNOWN | 1 |
| RESPONSE | 2 | EXECUTE | 2 | ACCESS_DENIED | 2 |
| ERROR_MESSAGE_ENABLE | 3 | NOTIFY | 3 | PARAM_ERROR | 3 |
| | | | | REQUEST_FAILED | 15 |

`ACCESS_DENIED (2)` is what you get for a command sent without a valid session token.

---

## 3. Message ID catalog

The tool defines **60+** message IDs. The vendor app only uses 12 of them (★);
the rest are addressable by a custom client via STP `REQUEST`/`READ`.

| ID | Name | | ID | Name |
|---|---|---|---|---|
| 64 | COMPATIBILITY | | 98 | COMO_TEMPERATURE |
| 76 | POWERTRAIN_TARGET_SPEED_PROFILE_SETTINGS | | 99 | COMO_REAL_TIME_CLOCK |
| 77 | ABR_CONTROL_SETTINGS | | 100 | COMO_CONNECTION_SESSION_TABLE |
| 78 | SCU_VERSION | | 101 | COMO_PAIRING_INFO |
| 79 ★ | HCU_EOL | | 102 | COMO_BLE_ADVERTISEMENT_STATE |
| 80 ★ | NODE_MCU_CONFIRMATION | | 103 | COMO_POWER_MODE |
| 81 ★ | NODE_COMO_CONFIRMATION | | 104 | HCU_VERSION |
| 82 ★ | NODE_MCU_STATUS | | 105 | HCU_BRIGHTNESS |
| 83 ★ | NODE_COMO_STATUS | | 106 | HCU_AFTERGLOW_DURATION |
| 84 ★ | TOOL_INFO | | 107 ★ | SERVUS |
| 85 ★ | MCU_INFO | | 108 | NODE_MCU_DATALOG |
| 86 ★ | TOOL_CONNECTIVITY | | 109 | MCU_PERMISSION |
| 87 | TOOL_POWER_SOURCE | | 110 | TOOL_COMMAND |
| 88 | TOOL_IDENTITY_UUID | | 111 | MCU_VERSION |
| 89 | TOOL_IDENTITY_PTID | | 112 | HCU_INFO |
| 90 | TOOL_WAKEUP | | 113 ★ | TOOL_ACCESS_TOKEN |
| 91 | POWERTRAIN_INFO | | 114 | TOOL_PERMISSION |
| 92 ★ | POWERTRAIN_MODE_OF_OPERATION | | 115 | CONNECTION_MANAGER_CONFIRMATION |
| 93 | POWERTRAIN_RPM_PER_SPEED_LEVEL | | 116 | SERVICE_COMMAND |
| 94 | POWERTRAIN_COUNT_OF_SPEED_LEVELS | | 117 | TOOL_TO_TOOL |
| 95 | COMO_COMMAND | | 118 | POWERTRAIN_ADAPTIVE_SPEED_CONTROL_SETTINGS |
| 96 | COMO_IDENTITY_MAC_ADDRESS | | 119 | POWERTRAIN_ELECTRONIC_PRECISION_CONTROL_SETTINGS |
| 97 | COMO_VERSION | | 120 ★ | TOOL_SESSION_PERMISSION |
| | | | 121 | WORKLIGHT_BRIGHTNESS |
| | | | 122 | WORKLIGHT_AFTERGLOW_DURATION |
| | | | 123 | KICKBACK_CONTROL_SETTINGS |
| | | | 124 | TOOL_ORIENTATION *(IMU!)* |
| | | | 125 | TOOL_ORIENTATION_SETTINGS |
| | | | 126 | IMPACT_CONTROL_SETTINGS |
| | | | 127 | DEBUG |

Subsystem prefixes: **MCU** = motor control unit, **COMO** = communication module
(the BLE radio + coin cell), **HCU** = handle/HMI unit (worklight), **PT/Powertrain**
= motor speed, **SCU** = supply/charging.

---

## 4. Key message schemas (`.proto`)

Field numbers and wire types as observed on the wire.
`proto3`; scalar ints are `int32`/`uint32` (all small non-negative values). This is
a partial `.proto` covering what a monitoring/control app needs.

```proto
syntax = "proto3";
package sts;

enum RestrictionLevel { RESTRICTION_LEVEL_MEDIUM = 0; RESTRICTION_LEVEL_LOW = 1; RESTRICTION_LEVEL_HIGH = 2; }
enum AccessTokenCommand { ACCESS_TOKEN_COMMAND_UNDEFINED = 0; ACCESS_TOKEN_COMMAND_VALIDATE = 1; ACCESS_TOKEN_COMMAND_ADD = 2; }
enum ValidationStatus { VALIDATION_STATUS_UNDEFINED = 0; VALIDATION_STATUS_VALID = 1; VALIDATION_STATUS_INVALID = 2; }
enum ConnectedDeviceType { CONNECTED_DEVICE_TYPE_UNDEFINED = 0; CONNECTED_DEVICE_TYPE_FREE = 1; CONNECTED_DEVICE_TYPE_APP = 2; CONNECTED_DEVICE_TYPE_COMO = 3; }
enum ModeOfOperation {
  MODE_OF_OPERATION_DEFAULT = 0; SPEED_SELECTION_MODE = 1; ECO_MODE = 2; AUTO_MODE = 3;
  FAVORITE_MODE = 4; SOFT_MODE = 5; CUSTOM_A_MODE = 6; CUSTOM_B_MODE = 7;
}

// --- Auth (msg 113) ---
message ToolAccessToken {
  AccessTokenCommand accessTokenCommand    = 1;
  ValidationStatus   validationStatus      = 2;
  uint32             accessToken           = 6;  // client-chosen 32-bit id
  RestrictionLevel   sessionRestrictionLevel = 7; // returned by tool
}
message ToolSessionPermission { RestrictionLevel sessionRestrictionLevel = 6; } // msg 120

// --- Hello (msg 107) ---
message Servus { ConnectedDeviceType connectedDeviceType = 6; }

// --- Telemetry (subscribe / notify) ---
message ToolInfo {                       // msg 84  — MAIN status
  uint32 powerSourceSoc               = 6;   // battery %  (state of charge)
  // 7 activeApplicationSelectSetting, 8 activeSpindleMotionSetting
  ModeOfOperation activeModeOfOperation = 9;
  uint32 activeSpeedLevel             = 10;
  uint32 activeAbrControlLevel        = 11;
  bool   isAbrControlEnabled          = 12;
  // 13 parameterChangeAllowanceState
}
message McuInfo {                        // msg 85
  // 6 parameterChangeAllowanceState
  bool isSignalSwitchPressed          = 7;   // trigger pulled
  bool isKickbackControlEnabled       = 8;
  // 9 activeKickbackControlSensitivity
}
message ComoTemperature { int32 onBoardTemperature = 6; }        // msg 98
message ToolPowerSource { /*6 powerSourceType*/ uint32 powerSourceSoc = 7; } // msg 87

// --- Speed control ---
message PowertrainModeOfOperation {      // msg 92  — WRITE this to set speed
  ModeOfOperation activeModeOfOperation = 6;
  uint32          activeSpeedLevel      = 7;   // 1..countOfSpeedLevels
}
message PowertrainInfo {                 // msg 91
  ModeOfOperation activeModeOfOperation = 6;
  uint32 activeSpeedLevel     = 7;
  uint32 isSpeedLevelCustomized = 8;
  uint32 countOfSpeedLevels   = 9;
}
message PowertrainRpmPerSpeedLevel { repeated uint32 rpmPerSpeedLevel = 6; } // msg 93 — level→RPM table
message PowertrainCountOfSpeedLevels { uint32 countOfSpeedLevels = 6; }      // msg 94

// --- Worklight ---
message WorklightBrightness {            // msg 121
  bool   isWorklightEnabled   = 6;
  uint32 brightnessPercentage = 7;
}
message HcuAfterglowDuration { uint32 afterglowDuration = 6; }  // msg 106 / 122

// --- Status / alert lists (msg 82 / 83), repeated event enums (see §6) ---
message NodeMcuStatus {
  repeated PowertrainEvent powertrainEvent = 6;
  repeated BatteryEvent    batteryEvent    = 7;
  repeated McuEvent        mcuEvent        = 8;
}
message NodeComoStatus { repeated ComoEvent comoEvent = 6; }
```

---

## 5. Authentication / session model

`ToolAccessToken`'s `accessToken` is a plain **`uint32` chosen by the client** —
not a signed/derived secret. The vendor app stores one integer token per tool and
reuses it.

- **Pair (claim the tool):** send `ToolAccessToken{ accessTokenCommand = ADD,
  accessToken = <your uint32> }`. Tool stores it, replies with a
  `sessionRestrictionLevel`.
- **Reconnect:** send `ToolAccessToken{ accessTokenCommand = VALIDATE,
  accessToken = <same uint32> }`. Tool replies with the granted
  `sessionRestrictionLevel` (and `ToolSessionPermission`, msg 120).
- **Restriction levels:** `LOW(1)`, `MEDIUM(0)`, `HIGH(2)`. A successful pairing
  grants `RESTRICTION_LEVEL_LOW` (LOW restriction = full control). The level gates which parameters `PARAMETER_CHANGE_ALLOWANCE_STATE`
  will let you change.

The token is a random 32-bit integer, stored per tool. When pairing, the vendor
app **disconnects first, then reconnects and sends `ADD`**.

**Implication for a custom app:** fully reproducible — pick a token, `ADD` once,
`VALIDATE` thereafter.

**Confirmed on real hardware (2026-07-04):** connecting an unpaired client that
sends `VALIDATE` with an unknown token → the tool answers reads with
`ACCESS_DENIED` (status 2) and **drops the link after ~3 s**. So a valid session
via `ADD` is mandatory before any read/command, and the tool must stay awake. If
the tool is already paired to the vendor app (`toolLocked` / `appConnected`
true in the advertisement), close/unpair it first.

### Pairing gesture — the speed wheel (confirmed)

`ADD` puts the tool into a **confirm-pairing** state; the user must **turn the
speed wheel within ~10 s** to prove physical presence (the vendor app's pairing
screen asks for exactly this gesture).

Mechanics observed: after `SERVUS` + `ADD`, the tool sends **no** explicit
"confirm now" frame — it silently waits. Rolling the wheel keeps the tool awake
(input resets its ~3 s idle-sleep timer) **and** confirms the claim; the tool
then sends `TOOL_ACCESS_TOKEN` with a granted `sessionRestrictionLevel`. If the
wheel isn't rolled, the tool sleeps and drops the link (the ~3 s disconnect seen
in testing). **Practical sequence for a custom client:** start rolling the wheel,
connect, send `ADD`, keep rolling until the grant arrives.

Correct frame exchange (tool-driven):
```
RX SERVUS            REQUEST/READ   (empty)                  // tool greets first
TX SERVUS            RESPONSE/READ  30 02                    // reply: connectedDeviceType = APP(2)
TX TOOL_ACCESS_TOKEN REQUEST/EXECUTE 08 02 30 <token varint> // {cmd=ADD(2), accessToken}
   → roll the speed wheel within ~10 s → RX TOOL_ACCESS_TOKEN grant (+ ToolSessionPermission)
```
An earlier test sent Servus proactively as `REQUEST/WRITE` and the token as
`REQUEST/WRITE`; the tool ignored the token (wrong access method) and dropped the
link. Fixed: wait for Servus, reply `RESPONSE/READ`, send token as `REQUEST/EXECUTE`.

---

## 6. Events / alerts (`NodeMcuStatus` / `NodeComoStatus`)

The status messages carry **repeated event enums** — discrete alert/state codes,
not continuous telemetry. All four share a severity ladder:
`OVERALL_OK(4)`, `OVERALL_WARNING(5)`, `OVERALL_ERROR(6)`, `OVERALL_FATAL(7)`.

| Enum | Notable codes |
|---|---|
| `PowertrainEvent` | POWER_PCBA_TEMP_{WARNING 9/ERROR 10/FATAL 11}, MOTOR_TEMP_{WARNING 13/ERROR 14/FATAL 15}, ECO_MODE_{WARNING 17/ERROR 18} |
| `BatteryEvent` | TEMP_{WARNING 9/ERROR 10/FATAL 11}, SOC_{WARNING 13/ERROR 14} (low battery) |
| `McuEvent` | KICKBACK_ERROR 10, RESTART_PROTECTION_ERROR 14, DROP_DETECTION_ERROR 18, FREE_FALL_DETECTION_ERROR 22, ACCELERATION_SENSOR_FATAL 27 |
| `ComoEvent` | COINCELL_SOC_{WARNING 9/ERROR 10} (radio coin cell) |

So "overheat / overload / low-battery" notifications = watch these event lists.
Numeric battery % and temperature come from `ToolInfo.powerSourceSoc` and
`ComoTemperature.onBoardTemperature`.

---

## 7. Reading telemetry vs. sending commands — quick map

| Want | Message | ID | Direction |
|---|---|---|---|
| Battery % | `ToolInfo.powerSourceSoc` (or `ToolPowerSource`) | 84 / 87 | notify |
| Current speed level + mode | `ToolInfo` / `PowertrainInfo` | 84 / 91 | notify |
| Trigger pressed | `McuInfo.isSignalSwitchPressed` | 85 | notify |
| Temperature | `ComoTemperature.onBoardTemperature` | 98 | request/read |
| Speed-level → RPM table | `PowertrainRpmPerSpeedLevel` | 93 | request/read |
| Number of speed levels | `PowertrainCountOfSpeedLevels` | 94 | request/read |
| Overheat/overload/low-batt alerts | `NodeMcuStatus` / `NodeComoStatus` | 82 / 83 | notify |
| **Set speed** | `PowertrainModeOfOperation{ activeSpeedLevel }` | 92 | **write (REQUEST)** |
| Worklight on/off + brightness | `WorklightBrightness` | 121 | write |

---

## 8. Web Bluetooth implementation notes

- **Reachability:** standard GATT read/write/notify — fully supported by Web
  Bluetooth. `navigator.bluetooth.requestDevice({ filters:[{ services:['0000fde8-…'] }],
  optionalServices:['02a6c0a1-…'] })`.
- **Browser support:** Chrome/Edge/Opera on desktop (Win/Mac/Linux*) + Android.
  **No iOS/Safari, no Firefox.** (*Linux needs `chrome://flags` →
  Experimental Web Platform features.)
- **Fragmentation:** BLE notifications cap at the negotiated MTU (often ~20 bytes
  of payload). Long STP frames arrive in chunks — reassemble by reading the STP
  length field before dispatching. Conversely, keep writes within one MTU or use
  Write Long.
- **No pairing/bonding secret** is needed at the GATT layer; the "auth" is the
  application-level `ToolAccessToken` handshake above.
- Everything is **little-endian**; protobuf handles its own varints.

---

## Confirmed on real hardware (2026-07-04)

- GATT service/characteristic UUIDs are correct; connect + notifications work.
- The STP frame decoder parses real tool frames correctly (`ACCESS_DENIED`
  responses on msg 93/94 decoded with the right IDs and status).
- Unauthenticated clients are denied and dropped after ~3 s (see §5).

## Confirmed live telemetry (2026-07-05, full session)

With a valid session the tool **pushes only** `TOOL_INFO` (84) and
`NODE_MCU_STATUS` (82), roughly 1×/s each. Everything else must be **read**.

- **`TOOL_INFO`** (verified `30 51 48 01 50 05 68 00`): `powerSourceSoc`(6)=0x51=81 %,
  `activeModeOfOperation`(9)=1, `activeSpeedLevel`(10)=5, `parameterChangeAllowanceState`(13)
  toggles 0/1/127. Battery + current speed level come from here.
- **`NODE_MCU_STATUS`** (`32 01 04 3a 01 04 42 01 04`): `powertrainEvent`(6)=[4],
  `batteryEvent`(7)=[4], `mcuEvent`(8)=[4] — all `OVERALL_OK(4)`. This is the
  health/temperature **traffic-light** (goes WARNING/ERROR/FATAL under load/heat),
  not a number.
- **`MCU_INFO`** (85, `isSignalSwitchPressed`) is **not pushed**, and polling it
  gave a value that **flips at idle** — not a reliable live trigger on the 8260
  (which has a slide switch + speed dial, not a momentary trigger). Running-state
  detection is still open; the health traffic-light below is the reliable signal.
- **Setting speed requires both fields:** `PowertrainModeOfOperation{
  activeModeOfOperation = SPEED_SELECTION_MODE(1), activeSpeedLevel }`. Sending
  only the level is ignored.
- **Speed change is a two-step *preselect + confirm*** — this is why a plain
  write returns `REQUEST_FAILED(15)`. The vendor app describes it the same way:
  preselect a speed, the target blinks on the tool, and you turn the tool on
  within 10 seconds to confirm (or retry). So:
  1. Send `PowertrainModeOfOperation{ mode=SPEED_SELECTION(1), activeSpeedLevel }`.
  2. Tool blinks the target and enters a pending state — `ToolInfo` field 13
     `parameterChangeAllowanceState` goes `ALLOW_ALL(0) → DENY_ALL(127)`.
  3. **User turns the tool ON within ~10 s** → tool
     adopts the speed; `ToolInfo.activeSpeedLevel` becomes the requested value.
     No turn-on → resets to `ALLOW_ALL(0)`, change discarded.
  Field 13 observed: `0`(ALLOW_ALL, idle/ready) / `1`(running) / `127`(pending
  confirm). Confirm by matching `ToolInfo.activeSpeedLevel` to the request.
  (NB: *pairing* confirm = spin the speed dial; *speed* confirm = turn the tool
  on — two different gestures.)
- **`COMO_TEMPERATURE`** (98) read **works**: `onBoardTemperature` is in **°F**
  (reads 72 at a 22 °C room). Convert `(F−32)×5/9`. Not pushed — poll to keep
  live. **Caveat:** this is the *COMO/radio module* temp (in the handle, ~ambient)
  — **not** the motor/battery temp, which the tool exposes only as event severity
  (`MOTOR_TEMP_*`, `BATTERY_TEMP_*` in `NodeMcuStatus`). There is no numeric
  motor or battery temperature on the wire — `onBoardTemperature` is the only
  temperature value in the protocol.
- **`POWERTRAIN_RPM_PER_SPEED_LEVEL`** (93) read **works**: packed
  `[500,760,1000,1260,1420,2000,2300,2500,3000]` — values are **rpm ÷ 10**
  (×10 → 5,000…30,000 rpm, matching the 8260). 9 levels.
- **`POWERTRAIN_COUNT_OF_SPEED_LEVELS`** (94) read **fails** with status
  `REQUEST_FAILED(15)` — derive the count from the RPM table length instead.
- **Token grant** (`RESPONSE`/`EXECUTE` `08 02 10 01 30 <token> 38 01`):
  `accessTokenCommand`(1)=2, `validationStatus`(2)=1 (VALID), `accessToken`(6)=echoed,
  `sessionRestrictionLevel`(7)=1 (LOW). `TOOL_SESSION_PERMISSION` (120) also arrives.
- This session's pairing completed **without** a visible wheel-roll delay — the
  grant returned promptly after `ADD` (the wheel confirm may be lenient or the
  tool was already awake/interacted-with).

## Open items (confirm on hardware)

1. **Servus contents** — the tool's `SERVUS` reply arrives as `REQUEST/READ` with
   an empty payload; confirm whether it expects a `RESPONSE` back (didn't seem to
   block pairing).
2. **`onBoardTemperature` under load** — it is the radio-module temperature
   (~ambient at rest). Does it climb at all when the motor works, and do the
   `MOTOR_TEMP_*` / `BATTERY_TEMP_*` events actually trip under thermal load?
3. **`parameterChangeAllowanceState`** (ToolInfo field 13) — observed `0` idle/ready,
   `1` running, `127` pending speed confirm. Good enough; edge cases unconfirmed.
4. **RPM scale** — ÷10 fits (table top 3000 → 30,000 rpm) but the 8260 is rated to
   ~35,000; sanity-check a level against the tool or its display.
5. **MTU** actually negotiated by the tool, to size reassembly buffers.
6. **Restriction-level semantics** — exactly what `LOW` vs `MEDIUM` vs `HIGH`
   permit changing.

**Resolved:** `ComoTemperature` (98) and `PowertrainRpmPerSpeedLevel` (93) *are*
readable via `REQUEST/READ` once authorized; `PowertrainCountOfSpeedLevels` (94)
is not (`REQUEST_FAILED`).

---

*Documented for interoperability from traffic observed between the vendor app and
the tool, and from driving the tool directly. No vendor code is included; this
describes the on-air protocol only.*
