import { useMemo, useState } from 'react';
import { Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import './App.css';
import { ToolClient } from './protocol/client';
import type { ToolState } from './protocol/client';
import { MockTransport } from './ble/mock';
import { WebBluetoothTransport, isWebBluetoothAvailable } from './ble/webBluetooth';
import { useToolClient } from './hooks/useToolClient';
import { useTheme } from './theme';
import { Icon, IconSprite } from './Icons';
import { NOMINAL_TABLE } from './guide';
import Dashboard from './Dashboard';
import { AccessoryPage, GuideAccessoryGrid, GuideMaterialGrid, MaterialPage } from './Guide';
import type { GuideProps } from './Guide';
import Diagnostics from './Diagnostics';
import AppFooter from './AppFooter';

type TransportKind = 'ble' | 'mock';

export default function App() {
  const [transport, setTransport] = useState<TransportKind>('ble');
  const [theme, toggleTheme] = useTheme();
  const navigate = useNavigate();
  const location = useLocation();

  const client = useToolClient(
    useMemo(
      () => new ToolClient(transport === 'ble' ? new WebBluetoothTransport() : new MockTransport()),
      [transport],
    ),
  );
  const s = client.state;
  const connected = s.connection === 'connected';
  const connecting = s.connection === 'connecting';
  const dark = theme === 'dark';
  const bleUnavailable = transport === 'ble' && !isWebBluetoothAvailable();
  // Tool reports the RPM table ÷10; fall back to the nominal dial until it arrives.
  const table = s.rpmTable.length ? s.rpmTable.map((v) => v * 10) : NOMINAL_TABLE;
  const pairing = s.needsPairing && (connected || connecting);

  const onDash = location.pathname.startsWith('/dashboard');
  const onGuide = !onDash;

  const guideProps: GuideProps = {
    dark,
    connected,
    table,
    onSend: (level) => {
      void client.setSpeedLevel(level);
      navigate('/dashboard');
    },
  };

  return (
    <div className="app">
      <IconSprite />

      <header className="topbar">
        <div className="brand">
          <div className="brand-mark">
            <Icon name="i-spin" />
          </div>
          <div>
            <div className="brand-name">COLLET</div>
            <div className="brand-sub">Dremel 8260 companion · unofficial</div>
          </div>
        </div>

        <div className="seg" role="tablist" aria-label="Views">
          <button role="tab" aria-selected={onDash} onClick={() => navigate('/dashboard')}>
            <Icon name="i-gauge" />
            Dashboard
          </button>
          <button role="tab" aria-selected={onGuide} onClick={() => navigate('/guide')}>
            <Icon name="i-book" />
            Guide
          </button>
        </div>

        <div className="spacer" />

        <div className="seg" aria-label="Transport">
          <button
            aria-selected={transport === 'ble'}
            onClick={() => setTransport('ble')}
            disabled={connecting}
          >
            BLE
          </button>
          <button
            aria-selected={transport === 'mock'}
            onClick={() => setTransport('mock')}
            disabled={connecting}
          >
            Demo
          </button>
        </div>

        <ConnChip state={s} connected={connected} />

        {connected || connecting ? (
          <button className="btn btn-ghost" onClick={() => void client.disconnect()}>
            <Icon name="i-plug" />
            Disconnect
          </button>
        ) : (
          <button
            className="btn btn-primary"
            onClick={() => void client.connect()}
            disabled={bleUnavailable}
          >
            <Icon name="i-plug" />
            {connecting ? 'Connecting…' : 'Connect'}
          </button>
        )}

        <button
          className="icon-btn"
          onClick={toggleTheme}
          aria-label="Toggle theme"
          title="Toggle light / dark"
        >
          <Icon name={dark ? 'i-sun' : 'i-moon'} />
        </button>
      </header>

      {bleUnavailable && (
        <div className="banner">
          Web Bluetooth isn’t available in this browser (Safari &amp; Firefox don’t support it). Use
          Chrome or Edge, or switch to <b>Demo</b>.
        </div>
      )}
      {s.error && <div className="banner error">{s.error}</div>}

      {pairing && (
        <div className="act-prompt show" style={{ marginBottom: 20 }}>
          <div className="act-icon">
            <Icon name="i-power" />
          </div>
          <div className="act-txt">
            <div className="lead-line">Your turn — roll the speed wheel</div>
            <span>
              The 8260 is waiting to pair. <b>Spin the dial back and forth</b> within ~10s so it
              knows you're really there — keep rolling until it connects.
            </span>
          </div>
        </div>
      )}

      <Routes>
        <Route
          path="/dashboard"
          element={
            <section className="view active">
              <Dashboard
                state={s}
                connected={connected}
                connecting={connecting}
                onConnect={() => void client.connect()}
                onSetSpeed={(n) => void client.setSpeedLevel(n)}
              />
              {connected && (
                <div style={{ marginTop: 16 }}>
                  <Diagnostics client={client} />
                </div>
              )}
            </section>
          }
        />
        <Route path="/guide" element={<GuideMaterialGrid {...guideProps} />} />
        <Route path="/guide/by-accessory" element={<GuideAccessoryGrid {...guideProps} />} />
        <Route path="/guide/m/:slug" element={<MaterialPage {...guideProps} />} />
        <Route path="/guide/a/:slug" element={<AccessoryPage {...guideProps} />} />
        <Route path="/" element={<Navigate to="/guide" replace />} />
        <Route path="*" element={<Navigate to="/guide" replace />} />
      </Routes>

      <AppFooter />
    </div>
  );
}

function ConnChip({ state, connected }: { state: ToolState; connected: boolean }) {
  return (
    <div className={`conn-chip ${connected ? 'on' : ''}`}>
      <span className="dot" />
      <span>
        {connected
          ? `8260${state.batteryPercent != null ? ` · ${state.batteryPercent}%` : ''}`
          : 'No tool'}
      </span>
    </div>
  );
}
