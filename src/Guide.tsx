import { useState } from 'react';
import { Link, Navigate, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
  ACCESSORIES,
  accessoryBySlug,
  accessoryCount,
  catColor,
  CATS,
  GUIDE,
  levelLabel,
  materialBySlug,
  materialSlug,
  matSwatch,
  rpmText,
  rpmToLevels,
} from './guide';
import type { Accessory, Category, Material, MaterialGroup } from './guide';
import { Icon } from './Icons';
import { useDocumentMeta } from './meta';

type Mode = 'material' | 'accessory';

/** Props threaded from App (tool state + actions). */
export interface GuideProps {
  dark: boolean;
  connected: boolean;
  table: number[];
  onSend: (level: number) => void;
}

/* ============================ route components ============================ */

export function GuideMaterialGrid(props: GuideProps) {
  const [sp, setSp] = useSearchParams();
  const query = sp.get('q') ?? '';
  useDocumentMeta(
    'Accessory & material guide · COLLET',
    'Pick a material to see which Dremel-compatible accessories suit it and the speed to run each one.',
  );
  return (
    <div className="view active">
      <GuideHeader
        mode="material"
        query={query}
        setQuery={(q) => setSp(q ? { q } : {}, { replace: true })}
      />
      {!props.connected && <NoDeviceNote />}
      <MaterialCards dark={props.dark} query={query} />
    </div>
  );
}

export function GuideAccessoryGrid(props: GuideProps) {
  const [sp, setSp] = useSearchParams();
  const query = sp.get('q') ?? '';
  useDocumentMeta(
    'Find an accessory · COLLET',
    'Got a bit in hand? Find every material it is rated for and the right rotary-tool speed for each.',
  );
  return (
    <div className="view active">
      <GuideHeader
        mode="accessory"
        query={query}
        setQuery={(q) => setSp(q ? { q } : {}, { replace: true })}
      />
      {!props.connected && <NoDeviceNote />}
      <AccessoryCards dark={props.dark} query={query} />
    </div>
  );
}

export function MaterialPage(props: GuideProps) {
  const { slug = '' } = useParams();
  const material = materialBySlug(slug);
  useDocumentMeta(
    material ? `${material.name} — accessories & speeds · COLLET` : 'Guide · COLLET',
    material
      ? `Recommended rotary-tool accessories and speeds for ${material.name.toLowerCase()}. ${material.blurb}`
      : 'Accessory & material speed guide for the Dremel 8260.',
  );
  if (!material) return <Navigate to="/guide" replace />;
  return <MaterialDrill material={material} {...props} />;
}

export function AccessoryPage(props: GuideProps) {
  const { slug = '' } = useParams();
  const accessory = accessoryBySlug(slug);
  useDocumentMeta(
    accessory ? `${accessory.name} — materials & speeds · COLLET` : 'Guide · COLLET',
    accessory
      ? `Which materials ${accessory.name.toLowerCase()} is rated for on a rotary tool, and the speed to run it on each.`
      : 'Accessory & material speed guide for the Dremel 8260.',
  );
  if (!accessory) return <Navigate to="/guide/by-accessory" replace />;
  return <AccessoryDrill accessory={accessory} {...props} />;
}

/* ============================ header ============================ */

function GuideHeader({
  mode,
  query,
  setQuery,
}: {
  mode: Mode;
  query: string;
  setQuery: (q: string) => void;
}) {
  const navigate = useNavigate();
  return (
    <div className="guide-head">
      <div>
        <div className="eyebrow" style={{ marginBottom: 8 }}>
          Accessory &amp; material guide
        </div>
        <h1>{mode === 'material' ? 'What are you working on?' : 'Which accessory do you have?'}</h1>
        <p className="lead">
          {mode === 'material' ? (
            <>
              Pick what you're working on to see which accessories suit it and the speed to run each
              one — <b>no tool required.</b> Connect an 8260 and you can send the speed straight to
              the dial.
            </>
          ) : (
            <>
              Got a bit in hand? Find every material it's rated for and the right speed for each —{' '}
              <b>the guide, run backwards.</b>
            </>
          )}
        </p>
      </div>
      <div className="guide-tools">
        <div className="seg mode-seg" role="tablist" aria-label="Guide direction">
          <button role="tab" aria-selected={mode === 'material'} onClick={() => navigate('/guide')}>
            <Icon name="i-book" />
            By material
          </button>
          <button
            role="tab"
            aria-selected={mode === 'accessory'}
            onClick={() => navigate('/guide/by-accessory')}
          >
            <Icon name="c-grinding" />
            By accessory
          </button>
        </div>
        <label className="search">
          <Icon name="i-search" />
          <input
            type="search"
            placeholder={
              mode === 'material'
                ? 'Search material or accessory…'
                : 'Search accessory or material…'
            }
            aria-label="Search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
      </div>
    </div>
  );
}

function NoDeviceNote() {
  return (
    <div className="no-device-note">
      <Icon name="i-info" />
      <span>
        The full library works offline and without a tool. <b>Send&nbsp;to&nbsp;tool</b> buttons
        light up once an 8260 is connected.
      </span>
    </div>
  );
}

/* ============================ shared row ============================ */

interface TypeRowProps {
  label: string;
  chipBg?: string;
  low: number;
  high: number;
  table: number[];
  connected: boolean;
  onSend: (level: number) => void;
}

function TypeRow({ label, chipBg, low, high, table, connected, onSend }: TypeRowProps) {
  const ls = rpmToLevels(low, high, table);
  const mid = ls[Math.floor(ls.length / 2)];
  return (
    <div className="type-row">
      <div className="type-name">
        {chipBg && <span className="mat-chip" style={{ background: chipBg }} />}
        {label}
      </div>
      <div className="rpm-cell">
        <div className="rpm-val">{rpmText(low, high)}</div>
        <div className="rpm-lab">rpm · rated</div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, justifyContent: 'flex-end' }}>
        <span className="lvl-pill" title="Nearest speed level on the dial">
          <Icon name="i-gauge" />
          {levelLabel(ls)}
        </span>
        <button
          className={`send-btn ${connected ? 'able' : ''}`}
          disabled={!connected}
          onClick={() => onSend(mid)}
        >
          <Icon name="i-send" />
          <span>{connected ? 'Send to tool' : 'Connect to send'}</span>
        </button>
      </div>
    </div>
  );
}

/* ============================ by material ============================ */

function MaterialCards({ dark, query }: { dark: boolean; query: string }) {
  const q = query.trim().toLowerCase();
  const shown = GUIDE.materials.filter((m) => {
    if (!q) return true;
    const hay = (
      m.name +
      ' ' +
      m.blurb +
      ' ' +
      m.groups.map((g) => CATS[g.cat].label + ' ' + g.types.map((t) => t.name).join(' ')).join(' ')
    ).toLowerCase();
    return hay.includes(q);
  });
  if (!shown.length)
    return (
      <p style={{ color: 'var(--ink-3)', fontSize: 14 }}>
        Nothing matches “{query}”. Try a material (glass) or an accessory (cut-off).
      </p>
    );
  return (
    <div className="mat-grid">
      {shown.map((m) => (
        <Link key={m.id} className="mat-card" to={`/guide/m/${materialSlug(m)}`}>
          <div className="mat-swatch" style={{ background: matSwatch(m.id) }} />
          <div className="mat-body">
            <div className="mat-name">{m.name}</div>
            <div className="mat-meta">
              {m.groups.length} uses · {accessoryCount(m)} accessories
            </div>
            <div className="cat-dots">
              {m.groups.map((g) => (
                <i key={g.cat} style={{ background: catColor(CATS[g.cat], dark) }} />
              ))}
            </div>
          </div>
        </Link>
      ))}
    </div>
  );
}

function MaterialDrill({
  material,
  dark,
  table,
  connected,
  onSend,
}: GuideProps & { material: Material }) {
  return (
    <div className="view active">
      <div className="drill-top">
        <Link className="btn btn-ghost back-btn" to="/guide">
          <Icon name="i-back" />
          All materials
        </Link>
      </div>
      <div className="drill-hero" style={{ marginBottom: 20 }}>
        <div className="drill-swatch" style={{ background: matSwatch(material.id) }} />
        <div>
          <div className="eyebrow" style={{ marginBottom: 5 }}>
            Material
          </div>
          <h1>{material.name}</h1>
          <div className="sub mono">
            {material.groups.length} uses · {accessoryCount(material)} accessories
          </div>
          <div className="drill-blurb">{material.blurb}</div>
        </div>
      </div>
      {material.groups.map((g, i) => (
        <CatBlock
          key={g.cat}
          cat={CATS[g.cat]}
          group={g}
          dark={dark}
          defaultOpen={i === 0}
          table={table}
          connected={connected}
          onSend={onSend}
        />
      ))}
    </div>
  );
}

function CatBlock({
  cat,
  group,
  dark,
  defaultOpen,
  table,
  connected,
  onSend,
}: {
  cat: Category;
  group: MaterialGroup;
  dark: boolean;
  defaultOpen: boolean;
  table: number[];
  connected: boolean;
  onSend: (level: number) => void;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className={`card cat-block ${open ? 'open' : ''}`}>
      <div className="cat-bar" onClick={() => setOpen((o) => !o)}>
        <div className="cat-swatch" style={{ background: catColor(cat, dark) }}>
          <Icon name={cat.icon} />
        </div>
        <div className="cat-name-wrap">
          <div className="cat-name">{cat.label}</div>
          <div className="cat-blurb">{cat.blurb}</div>
        </div>
        <div className="cat-count">{group.types.length}</div>
        <Icon name="i-chev" className="chev" />
      </div>
      <div className="type-list">
        {group.types.map((t, i) => (
          <TypeRow
            key={i}
            label={t.name}
            low={t.rpmLow}
            high={t.rpmHigh}
            table={table}
            connected={connected}
            onSend={onSend}
          />
        ))}
      </div>
    </div>
  );
}

/* ============================ by accessory (reverse index) ============================ */

function AccessoryCards({ dark, query }: { dark: boolean; query: string }) {
  const q = query.trim().toLowerCase();
  const sections = GUIDE.categories
    .map((cat) => ({
      cat,
      accs: ACCESSORIES.filter(
        (a) =>
          a.cat === cat.id &&
          (!q || (a.name + ' ' + a.uses.map((u) => u.matName).join(' ')).toLowerCase().includes(q)),
      ),
    }))
    .filter((s) => s.accs.length);

  if (!sections.length)
    return <p style={{ color: 'var(--ink-3)', fontSize: 14 }}>No accessories match “{query}”.</p>;

  return (
    <>
      {sections.map(({ cat, accs }) => {
        const col = catColor(cat, dark);
        return (
          <div className="acc-section" key={cat.id}>
            <div className="acc-section-head">
              <span className="acc-sec-swatch" style={{ background: col }}>
                <Icon name={cat.icon} />
              </span>
              <span className="acc-sec-name">{cat.label}</span>
              <span className="acc-sec-count">{accs.length}</span>
            </div>
            <div className="acc-cards">
              {accs.map((a) => (
                <Link key={a.slug} className="acc-card" to={`/guide/a/${a.slug}`}>
                  <span className="acc-dot" style={{ background: col }}>
                    <Icon name={cat.icon} />
                  </span>
                  <span className="acc-card-body">
                    <span className="acc-card-name">{a.name}</span>
                    <span className="acc-card-meta">
                      {a.uses.length} material{a.uses.length > 1 ? 's' : ''}
                    </span>
                  </span>
                </Link>
              ))}
            </div>
          </div>
        );
      })}
    </>
  );
}

function AccessoryDrill({
  accessory,
  dark,
  table,
  connected,
  onSend,
}: GuideProps & { accessory: Accessory }) {
  const cat = CATS[accessory.cat];
  return (
    <div className="view active">
      <div className="drill-top">
        <Link className="btn btn-ghost back-btn" to="/guide/by-accessory">
          <Icon name="i-back" />
          All accessories
        </Link>
      </div>
      <div className="drill-hero" style={{ marginBottom: 20 }}>
        <div className="drill-icon" style={{ background: catColor(cat, dark) }}>
          <Icon name={cat.icon} />
        </div>
        <div>
          <div className="eyebrow" style={{ marginBottom: 5 }}>
            {cat.label}
          </div>
          <h1>{accessory.name}</h1>
          <div className="sub mono">
            works on {accessory.uses.length} material{accessory.uses.length > 1 ? 's' : ''}
          </div>
        </div>
      </div>
      <div className="card" style={{ padding: '2px 14px 8px' }}>
        {accessory.uses.map((u) => (
          <TypeRow
            key={u.matId}
            label={u.matName}
            chipBg={matSwatch(u.matId)}
            low={u.rpmLow}
            high={u.rpmHigh}
            table={table}
            connected={connected}
            onSend={onSend}
          />
        ))}
      </div>
    </div>
  );
}
