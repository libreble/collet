import { useState } from 'react';
import { ACCESS_NAMES, TYPE_NAMES } from './protocol/client';
import type { ToolClient } from './protocol/client';

export default function Diagnostics({ client }: { client: ToolClient }) {
  const [copied, setCopied] = useState(false);

  const copy = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const text = buildReport(client);
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const ta = document.createElement('textarea');
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <details className="card diag">
      <summary>
        <span className="eyebrow">Diagnostics</span>
        <span className="diag-counts mono">
          {client.log.length} events · {client.rawFrames.length} frames
        </span>
        <button className="btn btn-ghost diag-copy" onClick={copy}>
          {copied ? '✓ Copied' : 'Copy diagnostics'}
        </button>
      </summary>

      <div className="diag-body">
        <div className="diag-col">
          <div className="eyebrow">Event log</div>
          {client.log.length === 0 ? (
            <p className="tile-sub">No events yet.</p>
          ) : (
            <ul className="log-list">
              {client.log.map((e, i) => (
                <li key={i} className={`sev-${e.severity}`}>
                  <time className="mono">{new Date(e.t).toLocaleTimeString()}</time>
                  <span>{e.text}</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="diag-col">
          <div className="eyebrow">Raw frames</div>
          {client.rawFrames.length === 0 ? (
            <p className="tile-sub">No frames yet.</p>
          ) : (
            <ul className="raw-list mono">
              {client.rawFrames.map((r, i) => (
                <li key={i} className={`dir-${r.dir}`}>
                  <span className={`tag ${r.dir}`}>{r.dir.toUpperCase()}</span>
                  <span className="rname">{r.name}</span>
                  <span className="rmeta">
                    {TYPE_NAMES[r.type]}/{ACCESS_NAMES[r.access]}
                    {r.status ? ` · ST${r.status}` : ''}
                  </span>
                  <code>{r.hex || '—'}</code>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </details>
  );
}

/** Plain-text diagnostics report for copy/paste. */
function buildReport(client: ToolClient): string {
  const s = client.state;
  const time = (t: number) => new Date(t).toLocaleTimeString('en-GB');
  const L: string[] = [];
  L.push('=== Dremel 8260 webapp diagnostics ===');
  L.push(`device:     ${s.device?.name ?? '-'} (${s.device?.id ?? '-'})`);
  L.push(
    `connection: ${s.connection}   needsPairing: ${s.needsPairing}   restriction: ${s.restrictionLevel ?? '-'}`,
  );
  L.push(
    `state:      battery=${s.batteryPercent ?? '-'}  temp=${s.temperatureC ?? '-'}  ` +
      `speedLevel=${s.speedLevel ?? '-'}  countLevels=${s.countOfSpeedLevels ?? '-'}  ` +
      `health=${s.health ?? '-'}  rpmTable=[${s.rpmTable.join(',')}]`,
  );
  L.push('');
  L.push('--- events (newest first) ---');
  for (const e of client.log)
    L.push(`${time(e.t)}  ${e.severity.toUpperCase().padEnd(7)}  ${e.text}`);
  L.push('');
  L.push('--- raw frames (newest first) ---');
  L.push('time      dir  message                          type/access       st  payload');
  for (const r of client.rawFrames) {
    L.push(
      `${time(r.t)}  ${r.dir.toUpperCase()}  ${r.name.padEnd(31)}  ` +
        `${`${TYPE_NAMES[r.type]}/${ACCESS_NAMES[r.access]}`.padEnd(16)}  ${r.status ? `S${r.status}` : '  '}  ${r.hex || '-'}`,
    );
  }
  return L.join('\n');
}
