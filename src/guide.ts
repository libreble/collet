// Accessory & material guide data + the material↔accessory reverse index.
// Data is our own transformed dataset (see data/guide.json meta.attribution).
import rawGuide from './data/guide.json';

export interface AccessoryType {
  name: string;
  rpmLow: number;
  rpmHigh: number;
}
export interface MaterialGroup {
  cat: string;
  types: AccessoryType[];
}
export interface Material {
  id: string;
  name: string;
  blurb: string;
  groups: MaterialGroup[];
}
export interface Category {
  id: string;
  label: string;
  color: string;
  colorDark: string;
  icon: string;
  blurb: string;
}
export interface GuideData {
  meta: { name: string; attribution: string; sourceNote: string; combos: number };
  categories: Category[];
  materials: Material[];
}

export const GUIDE = rawGuide as unknown as GuideData;
export const CATS: Record<string, Category> = Object.fromEntries(
  GUIDE.categories.map((c) => [c.id, c]),
);

export interface AccessoryUse {
  matId: string;
  matName: string;
  rpmLow: number;
  rpmHigh: number;
}
export interface Accessory {
  i: number;
  cat: string;
  name: string;
  slug: string;
  uses: AccessoryUse[];
}

/** Reverse index: every accessory → the materials it's rated for. */
export const ACCESSORIES: Accessory[] = (() => {
  const map = new Map<string, Accessory>();
  GUIDE.materials.forEach((m) =>
    m.groups.forEach((g) =>
      g.types.forEach((t) => {
        const key = g.cat + '|' + t.name;
        let a = map.get(key);
        if (!a) {
          a = { i: 0, cat: g.cat, name: t.name, slug: '', uses: [] };
          map.set(key, a);
        }
        a.uses.push({ matId: m.id, matName: m.name, rpmLow: t.rpmLow, rpmHigh: t.rpmHigh });
      }),
    ),
  );
  const arr = [...map.values()];
  const seen = new Map<string, number>();
  arr.forEach((a, i) => {
    a.i = i;
    const base = slugify(a.name);
    const n = seen.get(base) ?? 0;
    seen.set(base, n + 1);
    a.slug = n === 0 ? base : `${base}-${n + 1}`;
  });
  return arr;
})();

/** Nominal dial used only until the tool reports its real per-level RPM table. */
export const NOMINAL_TABLE = [5000, 8000, 12000, 15000, 18000, 22000, 27000, 31000, 35000];

export function accessoryCount(m: Material): number {
  return m.groups.reduce((s, g) => s + g.types.length, 0);
}

/** The speed level(s) whose RPM falls in the accessory's rated range. */
export function rpmToLevels(low: number, high: number, table: number[]): number[] {
  const t = table.length ? table : NOMINAL_TABLE;
  const inRange: number[] = [];
  t.forEach((rpm, i) => {
    if (rpm >= low - 1500 && rpm <= high + 1500) inRange.push(i + 1);
  });
  if (inRange.length) return inRange;
  const mid = (low + high) / 2;
  let best = 0;
  let bd = Infinity;
  t.forEach((rpm, i) => {
    const d = Math.abs(rpm - mid);
    if (d < bd) {
      bd = d;
      best = i;
    }
  });
  return [best + 1];
}

export function levelLabel(ls: number[]): string {
  return ls.length === 1 ? 'L' + ls[0] : 'L' + ls[0] + '–' + ls[ls.length - 1];
}

export function catColor(cat: Category, dark: boolean): string {
  return dark ? cat.colorDark : cat.color;
}

export function rpmText(low: number, high: number): string {
  return low === high
    ? low.toLocaleString('en-US')
    : `${low.toLocaleString('en-US')}–${high.toLocaleString('en-US')}`;
}

/* ---------- URL slugs ---------- */

export function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function materialSlug(m: Material): string {
  return m.id.replace(/_/g, '-');
}
export function materialBySlug(slug: string): Material | undefined {
  return GUIDE.materials.find((m) => materialSlug(m) === slug);
}
export function accessoryBySlug(slug: string): Accessory | undefined {
  return ACCESSORIES.find((a) => a.slug === slug);
}

/** CSS backgrounds standing in for material photos (authored, not from the app). */
export const MAT_SWATCH: Record<string, string> = {
  soft_wood:
    'repeating-linear-gradient(88deg, rgba(0,0,0,.09) 0 2px, transparent 2px 9px), linear-gradient(135deg,#d3a670,#a9743f)',
  hard_wood:
    'repeating-linear-gradient(90deg, rgba(0,0,0,.12) 0 2px, transparent 2px 7px), linear-gradient(135deg,#9a6534,#6d3f1c)',
  plastics:
    'linear-gradient(135deg,rgba(255,255,255,.4),transparent 45%), linear-gradient(135deg,#3fb0e0,#2170b0)',
  steel: 'linear-gradient(120deg,#cfd6de 8%,#8896a6 46%,#c3ccd6 60%,#7d8b9b)',
  brass:
    'linear-gradient(135deg,rgba(255,255,255,.45),transparent 40%), linear-gradient(135deg,#d8b256,#a97e28)',
  stone:
    'radial-gradient(circle at 30% 25%, rgba(255,255,255,.35), transparent 40%), linear-gradient(135deg,#a29c90,#736d63)',
  ceramic:
    'radial-gradient(circle at 70% 30%, rgba(255,255,255,.5), transparent 45%), linear-gradient(135deg,#ddccb6,#b49f83)',
  glass:
    'linear-gradient(135deg,rgba(255,255,255,.65),transparent 45%), linear-gradient(135deg,#8fd8e6,#3f9dae)',
  drywall: 'linear-gradient(135deg,#e4e0d6,#c3bdad)',
  laminates:
    'repeating-linear-gradient(0deg, rgba(0,0,0,.10) 0 3px, transparent 3px 10px), linear-gradient(135deg,#c39a72,#8a6240)',
  aluminium: 'linear-gradient(120deg,#dfe4e9 10%,#a9b3bd 48%,#e3e7ec 58%,#9aa4af)',
  shell:
    'linear-gradient(135deg,rgba(255,255,255,.6),transparent 40%), linear-gradient(135deg,#e0cdd6,#b79cae 60%,#cdb6c6)',
};

export function matSwatch(id: string): string {
  return MAT_SWATCH[id] ?? 'linear-gradient(135deg,var(--accent),var(--accent-2))';
}
