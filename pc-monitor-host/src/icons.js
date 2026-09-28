export const ICONS = {
  cpu: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="6" y="6" width="12" height="12" rx="1.5"/><rect x="9" y="9" width="6" height="6" rx="0.5"/><path d="M9 2v3M12 2v3M15 2v3M9 19v3M12 19v3M15 19v3M2 9h3M2 12h3M2 15h3M19 9h3M19 12h3M19 15h3"/></svg>`,
  gpu: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="2.5" y="6" width="19" height="11" rx="1.5"/><circle cx="8" cy="11.5" r="2.2"/><circle cx="14.5" cy="11.5" r="2.2"/><path d="M2.5 20h19M6 6V3.5M18 6V3.5"/></svg>`,
  ram: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="7" width="18" height="10" rx="1.2"/><path d="M7 7V4M11 7V4M15 7V4M17.5 7V4M7 17v3M11 17v3M15 17v3"/></svg>`,
  network: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M4.5 9.5a11 11 0 0 1 15 0"/><path d="M7.5 12.8a7 7 0 0 1 9 0"/><path d="M10.5 16a3 3 0 0 1 3 0"/><circle cx="12" cy="19.2" r="1.1" fill="currentColor" stroke="none"/></svg>`,
  storage: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="2.5" y="4.5" width="19" height="15" rx="1.5"/><path d="M2.5 14.5h19"/><circle cx="6.5" cy="17" r="0.9" fill="currentColor" stroke="none"/><circle cx="10" cy="17" r="0.9" fill="currentColor" stroke="none"/></svg>`,
};

export function icon(name) {
  return ICONS[name] || "";
}
