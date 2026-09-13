import { useEffect, useState } from 'react';
import type { ToolState } from './protocol/client';
import { NOMINAL_TABLE } from './guide';
import { Icon } from './Icons';

// Tachometer geometry — 270° open-bottom dial.
const A0 = 135;
const SWEEP = 270;
const CX = 100;
const CY = 104;
const R = 82;
const RPM_MAX = 35000;

function polar(r: number, deg: number): [number, number] {
  const a = (deg * Math.PI) / 180;
  return [CX + r * Math.cos(a), CY + r * Math.sin(a)];
}
function arcPath(r: number, d0: number, d1: number): string {
  const [x0, y0] = polar(r, d0);
  const [x1, y1] = polar(r, d1);
  const large = d1 - d0 > 180 ? 1 : 0;
  return `M ${x0.toFixed(2)} ${y0.toFixed(2)} A ${r} ${r} 0 ${large} 1 ${x1.toFixed(2)} ${y1.toFixed(2)}`;
}

interface DashboardProps {
  state: ToolState;
  connected: boolean;
  connecting: boolean;
  onConnect: () => void;
  onSetSpeed: (level: number) => void;
}

export default function Dashboard({
  state,
  connected,
  connecting,
  onConnect,
  onSetSpeed,
}: DashboardProps) {
  // Real per-level RPM (tool reports ÷10), else the nominal dial.
  const table = state.rpmTable.length ? state.rpmTable.map((v) => v * 10) : NOMINAL_TABLE;
  const levels = state.countOfSpeedLevels || table.length;
  const level = state.speedLevel;
  const running = state.paramChangeState === 1;
  const pending = state.lastSpeedSet === 'pending';
  const setRpm = level ? table[level - 1] : undefined;
  const gaugeRpm = running && setRpm ? setRpm : 0;

  const status = pending ? 'Confirm on tool' : running ? 'Running' : connected ? 'Ready' : 'Idle';

  if (!connected) {
    return (
      <div className="card empty">
        <div className="brand-mark" style={{ width: 52, height: 52, borderRadius: 14 }}>
          <Icon name="i-plug" />
        </div>
        <h2>Connect your 8260</h2>
        <p>
          Live speed, battery, health and temperature stream straight from the tool over Bluetooth.
          Your pairing is remembered on this device.
        </p>
        <div className="steps">
          <div className="step">
            <div className="num">01</div>
            <h4>Wake the tool</h4>
            <p>Give the dial a nudge so the 8260 wakes up and starts broadcasting.</p>
          </div>
          <div className="step">
            <div className="num">02</div>
            <h4>Roll the dial to say hi</h4>
            <p>The tool asks you to spin the speed wheel so it knows a real person is there.</p>
          </div>
          <div className="step">
            <div className="num">03</div>
            <h4>You're paired</h4>
            <p>It's remembered on this device — next time you just reconnect.</p>
          </div>
        </div>
        <button
          className="btn btn-primary"
          style={{ marginTop: 14 }}
          onClick={onConnect}
          disabled={connecting}
        >
          <Icon name="i-plug" />
          {connecting ? 'Connecting…' : 'Connect over Bluetooth'}
        </button>
      </div>
    );
  }

  return (
    <>
      <div className="dash-hero">
        <div className="card tach-card">
          <div className="tach-wrap">
            <svg viewBox="0 0 200 200" aria-hidden="true">
              <path
                d={arcPath(R, A0, A0 + SWEEP)}
                fill="none"
                stroke="var(--track)"
                strokeWidth={12}
                strokeLinecap="round"
              />
              {gaugeRpm > 0 && (
                <path
                  d={arcPath(R, A0, A0 + SWEEP * Math.min(gaugeRpm / RPM_MAX, 1))}
                  fill="none"
                  stroke="var(--accent)"
                  strokeWidth={12}
                  strokeLinecap="round"
                  style={{ filter: 'drop-shadow(0 0 6px var(--accent))' }}
                />
              )}
              {table.slice(0, levels).map((rpm, i) => {
                const d = A0 + SWEEP * (rpm / RPM_MAX);
                const [x1, y1] = polar(R - 13, d);
                const [x2, y2] = polar(R - 5, d);
                const on = i + 1 === level;
                return (
                  <line
                    key={i}
                    x1={x1}
                    y1={y1}
                    x2={x2}
                    y2={y2}
                    stroke={on ? 'var(--accent)' : 'var(--ink-3)'}
                    strokeWidth={on ? 3 : 2}
                    strokeLinecap="round"
                    opacity={on ? 1 : 0.55}
                  />
                );
              })}
            </svg>
            <div className="tach-center">
              <div className="tach-rpm mono">
                {gaugeRpm.toLocaleString()}
                <small> rpm</small>
              </div>
              <div className="tach-lvl">
                LEVEL {level ?? '—'} / {levels}
              </div>
              <div className={`run-chip ${running ? 'run' : ''}`}>
                <span className="dot" />
                <span>{status}</span>
              </div>
            </div>
          </div>
        </div>

        <div className="tiles hero-tiles">
          <div className="card tile">
            <div className="eyebrow">
              <Icon name="i-batt" />
              Battery
            </div>
            <div className="tile-val mono">
              {state.batteryPercent ?? '—'}
              <small>%</small>
            </div>
            <div className="batt-track">
              <div
                className="batt-fill"
                style={{
                  width: `${state.batteryPercent ?? 0}%`,
                  background: batteryColor(state.batteryPercent),
                }}
              />
            </div>
          </div>

          <div className="card tile">
            <div className="eyebrow">
              <Icon name="i-gauge" />
              Speed level
            </div>
            <div className="tile-val mono">
              {level ?? '—'}
              <small>/ {levels}</small>
            </div>
            <div className="tile-sub mono">
              {setRpm ? `${setRpm.toLocaleString()} rpm` : 'set speed'}
            </div>
          </div>

          <HealthTile health={state.health} />

          <div className="card tile">
            <div className="eyebrow">
              <Icon name="i-temp" />
              Temperature
            </div>
            <div className="tile-val mono">
              {state.temperatureC ?? '—'}
              <small>°C</small>
            </div>
            <div className="tile-sub">module · ambient</div>
            <div className="temp-status">
              <TempDot label="Tool" health={state.toolTemp} />
              <TempDot label="Batt" health={state.batteryTemp} />
            </div>
          </div>
        </div>
      </div>

      <SpeedControl
        levels={levels}
        level={level}
        table={table}
        pending={pending}
        pendingSpeed={state.pendingSpeed}
        lastSet={state.lastSpeedSet}
        onSetSpeed={onSetSpeed}
      />
    </>
  );
}

/** Motor/PCBA ("Tool") and battery temperature status — event severity, not a number. */
function TempDot({ label, health }: { label: string; health?: string }) {
  const lamp =
    health === 'ok'
      ? 'on-good'
      : health === 'warning'
        ? 'on-warn'
        : health === 'error' || health === 'fatal'
          ? 'on-crit'
          : '';
  const title =
    health === undefined
      ? `${label} temp: no data`
      : `${label} temp: ${health === 'ok' ? 'normal' : health}`;
  return (
    <span className="temp-chip" title={title}>
      <span className={`health-lamp ${lamp}`} />
      {label}
    </span>
  );
}

function HealthTile({ health }: { health?: string }) {
  const map: Record<string, { label: string; lamp: string }> = {
    ok: { label: 'All OK', lamp: 'on-good' },
    warning: { label: 'Warning', lamp: 'on-warn' },
    error: { label: 'Error', lamp: 'on-crit' },
    fatal: { label: 'Critical', lamp: 'on-crit' },
  };
  const h = health ? map[health] : undefined;
  return (
    <div className="card tile">
      <div className="eyebrow">
        <Icon name="i-heart" />
        Health
      </div>
      <div
        className="tile-val"
        style={{ fontSize: 20, fontFamily: 'var(--font-ui)', fontWeight: 650 }}
      >
        {h?.label ?? '—'}
      </div>
      <div className="health-row">
        <span className={`health-lamp ${h?.lamp ?? ''}`} />
        <span className="tile-sub" style={{ marginLeft: 2 }}>
          tool self-report
        </span>
      </div>
    </div>
  );
}

interface SpeedControlProps {
  levels: number;
  level?: number;
  table: number[];
  pending: boolean;
  pendingSpeed?: number;
  lastSet?: 'ok' | 'failed' | 'pending';
  onSetSpeed: (level: number) => void;
}

function SpeedControl({
  levels,
  level,
  table,
  pending,
  pendingSpeed,
  lastSet,
  onSetSpeed,
}: SpeedControlProps) {
  const [count, setCount] = useState(10);

  useEffect(() => {
    if (!pending) return;
    setCount(10);
    const id = setInterval(() => setCount((c) => Math.max(0, c - 1)), 1000);
    return () => clearInterval(id);
  }, [pending, pendingSpeed]);

  const setRpm = level ? table[level - 1] : undefined;
  const frac = count / 10;
  const C = 2 * Math.PI * 15;

  return (
    <div className="card speed-card">
      <div className="speed-head">
        <div>
          <div className="eyebrow">Set speed</div>
          <div className="speed-sub">
            Changes apply only while the tool is off · you can also pick a speed from the Guide
            {lastSet === 'failed' && (
              <span style={{ color: 'var(--crit)', fontWeight: 600 }}>
                {' '}
                · last set didn't confirm
              </span>
            )}
          </div>
        </div>
        <div className="speed-now mono">
          Now <b>{level ?? '—'}</b> <span>{setRpm ? `· ${setRpm.toLocaleString()} rpm` : ''}</span>
        </div>
      </div>

      <div className="ticks">
        {Array.from({ length: levels }, (_, idx) => {
          const n = idx + 1;
          const rpm = table[idx];
          return (
            <button
              key={n}
              className={`tick ${n === level ? 'cur' : ''} ${n === pendingSpeed && pending ? 'tgt' : ''}`}
              onClick={() => onSetSpeed(n)}
            >
              <span className="n">{n}</span>
              <span className="k">{rpm ? `${Math.round(rpm / 1000)}k` : ''}</span>
            </button>
          );
        })}
      </div>

      {pending && (
        <div className="act-prompt show">
          <div className="act-icon">
            <Icon name="i-power" />
          </div>
          <div className="act-txt">
            <div className="lead-line">Your turn — switch the tool on</div>
            <span>
              The 8260 is holding <b>Level {pendingSpeed}</b> and waiting for you to flip it on to
              lock it in.
            </span>
          </div>
          <svg className="count-ring" viewBox="0 0 36 36" aria-hidden="true">
            <circle cx="18" cy="18" r="15" fill="none" stroke="var(--track)" strokeWidth={3} />
            <circle
              cx="18"
              cy="18"
              r="15"
              fill="none"
              stroke="var(--accent)"
              strokeWidth={3}
              strokeLinecap="round"
              strokeDasharray={C}
              strokeDashoffset={C * (1 - frac)}
              transform="rotate(-90 18 18)"
            />
            <text
              x="18"
              y="22"
              textAnchor="middle"
              fontFamily="var(--font-mono)"
              fontSize="12"
              fontWeight="700"
              fill="var(--ink)"
            >
              {count}
            </text>
          </svg>
        </div>
      )}
    </div>
  );
}

function batteryColor(p?: number): string {
  if (p === undefined) return 'var(--track)';
  if (p <= 15) return 'var(--crit)';
  if (p <= 40) return 'var(--warn)';
  return 'var(--good)';
}
