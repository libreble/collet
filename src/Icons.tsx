// Icon sprite + <Icon> helper — symbols ported from the prototype (raw so kebab-case
// SVG attributes survive; React would otherwise reject stroke-width etc.).
const SPRITE = `<symbol id="i-spin" viewBox="0 0 24 24"><g fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 3a9 9 0 1 1-8.5 6"/><path d="M3 4v4h4"/></g></symbol>
    <symbol id="i-gauge" viewBox="0 0 24 24"><g fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19a8 8 0 1 1 16 0"/><path d="M12 15l4-4"/></g></symbol>
    <symbol id="i-book" viewBox="0 0 24 24"><g fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 4h11a2 2 0 0 1 2 2v13H7a2 2 0 0 0-2 2z"/><path d="M18 19v2"/></g></symbol>
    <symbol id="i-sun" viewBox="0 0 24 24"><g fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></g></symbol>
    <symbol id="i-moon" viewBox="0 0 24 24"><path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" d="M20 14.5A8 8 0 1 1 9.5 4a6.3 6.3 0 0 0 10.5 10.5z"/></symbol>
    <symbol id="i-bolt" viewBox="0 0 24 24"><path fill="currentColor" d="M13 2L4 14h6l-1 8 9-12h-6z"/></symbol>
    <symbol id="i-batt" viewBox="0 0 24 24"><g fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><rect x="2" y="7" width="17" height="10" rx="2"/><path d="M22 10v4" stroke-linecap="round"/></g></symbol>
    <symbol id="i-heart" viewBox="0 0 24 24"><path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" d="M12 20l-1.5-1.3C5.4 14.3 3 11.8 3 8.9 3 6.7 4.7 5 6.9 5c1.3 0 2.5.6 3.1 1.6h.1C10.7 5.6 11.9 5 13.2 5 15.3 5 17 6.7 17 8.9c0 2.9-2.4 5.4-7.5 9.8z"/></symbol>
    <symbol id="i-temp" viewBox="0 0 24 24"><g fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M10 13.5V5a2 2 0 0 1 4 0v8.5a4 4 0 1 1-4 0z"/></g></symbol>
    <symbol id="i-plug" viewBox="0 0 24 24"><g fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 7V3M15 7V3M6 7h12v4a6 6 0 0 1-12 0z"/><path d="M12 17v4"/></g></symbol>
    <symbol id="i-power" viewBox="0 0 24 24"><g fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v8"/><path d="M6.8 7a8 8 0 1 0 10.4 0"/></g></symbol>
    <symbol id="i-search" viewBox="0 0 24 24"><g fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></g></symbol>
    <symbol id="i-back" viewBox="0 0 24 24"><path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" d="M15 5l-7 7 7 7"/></symbol>
    <symbol id="i-chev" viewBox="0 0 24 24"><path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" d="M9 5l7 7-7 7"/></symbol>
    <symbol id="i-check" viewBox="0 0 24 24"><path fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" d="M20 6L9 17l-5-5"/></symbol>
    <symbol id="i-send" viewBox="0 0 24 24"><path fill="currentColor" d="M3 11l18-8-8 18-2-7z"/></symbol>
    <symbol id="i-info" viewBox="0 0 24 24"><g fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h0"/></g></symbol>
    <!-- accessory-category glyphs -->
    <symbol id="c-carving" viewBox="0 0 24 24"><g fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 4l5 5-9 9-5 1 1-5z"/><path d="M13 6l5 5"/></g></symbol>
    <symbol id="c-routing" viewBox="0 0 24 24"><g fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v9"/><path d="M7 12h10l-2 8H9z"/></g></symbol>
    <symbol id="c-grinding" viewBox="0 0 24 24"><g fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="12" r="7"/><circle cx="11" cy="12" r="2.2"/><path d="M19 4l2-2"/></g></symbol>
    <symbol id="c-cutting" viewBox="0 0 24 24"><g fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="8"/><path d="M12 4v5"/></g></symbol>
    <symbol id="c-cleaning" viewBox="0 0 24 24"><g fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v6M12 21v-3M3 12h6M21 12h-6M6 6l3 3M18 6l-3 3"/><circle cx="12" cy="13" r="2"/></g></symbol>
    <symbol id="c-sanding" viewBox="0 0 24 24"><g fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="7" width="16" height="10" rx="3"/><path d="M8 7v10M12 7v10M16 7v10"/></g></symbol>
    <symbol id="c-drilling" viewBox="0 0 24 24"><g fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2v14"/><path d="M9 5l3 2 3-2M9 9l3 2 3-2M9 13l3 2 3-2"/><path d="M10 20h4"/></g></symbol>
    <symbol id="c-grout" viewBox="0 0 24 24"><g fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 3l2 0 0 12-1 3-1-3z"/><path d="M4 20h16"/></g></symbol>`;

export function IconSprite() {
  return (
    <svg
      width={0}
      height={0}
      style={{ position: 'absolute' }}
      aria-hidden="true"
      dangerouslySetInnerHTML={{ __html: SPRITE }}
    />
  );
}

export function Icon({ name, className }: { name: string; className?: string }) {
  return (
    <svg className={className} aria-hidden="true">
      <use href={`#${name}`} />
    </svg>
  );
}
