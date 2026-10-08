/* Icon paths copied from the IC map in source/01-tokens-icons-primitives.js. */
export const IC: Record<string, string> = {
  tick: '<path d="M5 12.5l4.5 4.5L19 7.5"/>', cross: '<path d="M6 6l12 12M18 6L6 18"/>', alert: '<path d="M12 3l10 18H2z"/><path d="M12 10v5M12 18v.5"/>',
  stop: '<path d="M8 3h8l5 5v8l-5 5H8l-5-5V8z"/><path d="M12 8v5M12 16v.5"/>', info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5v.5"/>',
  cam: '<path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/>', clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  cloud: '<path d="M7 18h10a4 4 0 0 0 .5-8A6 6 0 0 0 6 9a4.5 4.5 0 0 0 1 9z"/>', off: '<path d="M7 18h10a4 4 0 0 0 .5-8A6 6 0 0 0 6 9a4.5 4.5 0 0 0 1 9z"/><path d="M3 3l18 18"/>',
  chev: '<path d="M9 5l7 7-7 7"/>', back: '<path d="M15 5l-7 7 7 7"/>', down: '<path d="M5 9l7 7 7-7"/>', plus: '<path d="M12 5v14M5 12h14"/>',
  trash: '<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/>', pen: '<path d="M4 20l1-5L16 4l4 4L9 19z"/>', search: '<circle cx="11" cy="11" r="7"/><path d="M16 16l5 5"/>',
  home: '<path d="M3 11l9-7 9 7v9h-6v-6H9v6H3z"/>', list: '<path d="M8 6h13M8 12h13M8 18h13M3 6h1M3 12h1M3 18h1"/>', user: '<circle cx="12" cy="8" r="4"/><path d="M4 21c1-4 4-6 8-6s7 2 8 6"/>',
  lock: '<rect x="5" y="11" width="14" height="10" rx="1"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>', retake: '<path d="M4 12a8 8 0 1 0 2.5-5.8"/><path d="M4 4v5h5"/>',
  sync: '<path d="M4 12a8 8 0 0 1 14-5l2 2M20 12a8 8 0 0 1-14 5l-2-2"/><path d="M20 4v5h-5M4 20v-5h5"/>', draft: '<path d="M6 3h9l4 4v14H6z"/><path d="M14 3v5h5"/>',
  send: '<path d="M3 11l18-8-8 18-2-8z"/>', sign: '<path d="M3 17c3-6 5-6 6-3s3 3 5-1 4-3 7 1"/><path d="M3 21h18"/>', gear: '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M5 19l2-2M17 7l2-2"/>',
  image: '<rect x="3" y="5" width="18" height="14" rx="1"/><path d="M3 16l5-5 4 4 3-3 6 6"/>', flash: '<path d="M13 2L4 14h7l-1 8 9-12h-7z"/>', more: '<circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/>',
  truck: '<path d="M2 6h12v10H2zM14 9h4l3 3v4h-7"/><circle cx="6" cy="17.5" r="1.8"/><circle cx="17" cy="17.5" r="1.8"/>', filter: '<path d="M3 5h18l-7 8v6l-4 2v-8z"/>',
  undo: '<path d="M9 14L4 9l5-5"/><path d="M4 9h10a6 6 0 0 1 0 12h-3"/>', eye: '<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
  edit: '<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M13.5 6.5l4 4"/>',
};

export function ic(n: string, s?: number, c?: string, w?: number) {
  const size = s || 24;
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={c || 'currentColor'} strokeWidth={w || 2.2}
      strokeLinecap="round" strokeLinejoin="round" style={{ flex: 'none', display: 'block' }} aria-hidden="true"
      dangerouslySetInnerHTML={{ __html: IC[n] }} />
  );
}
