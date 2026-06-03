/* ============================================================
   Radiata — Icon set (neon stroke, ex-design data.jsx)
   ============================================================ */
import type { SVGProps } from "react";

type P = SVGProps<SVGSVGElement>;

function S({ children, className, ...p }: P & { children: React.ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.9}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={"ico " + (className ?? "")}
      {...p}
    >
      {children}
    </svg>
  );
}

export const Icon = {
  zap: (p: P) => <S {...p}><path d="M13 2 4 14h7l-1 8 9-12h-7l1-8Z" /></S>,
  file: (p: P) => <S {...p}><path d="M14 3v4a1 1 0 0 0 1 1h4" /><path d="M17 21H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h7l5 5v11a2 2 0 0 1-2 2Z" /><path d="M9 13h6M9 17h4" /></S>,
  activity: (p: P) => <S {...p}><path d="M22 12h-4l-3 9L9 3l-3 9H2" /></S>,
  terminal: (p: P) => <S {...p}><path d="m7 9 3 3-3 3M13 15h4" /><rect x="2.5" y="4" width="19" height="16" rx="2.5" /></S>,
  edit: (p: P) => <S {...p}><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5Z" /></S>,
  play: (p: P) => <S {...p}><path d="m6 4 13 8-13 8V4Z" fill="currentColor" stroke="none" /></S>,
  pause: (p: P) => <S {...p}><rect x="6" y="5" width="4" height="14" rx="1" fill="currentColor" stroke="none" /><rect x="14" y="5" width="4" height="14" rx="1" fill="currentColor" stroke="none" /></S>,
  plus: (p: P) => <S {...p}><path d="M12 5v14M5 12h14" /></S>,
  cal: (p: P) => <S {...p}><rect x="3" y="4.5" width="18" height="16" rx="2.5" /><path d="M3 9h18M8 2.5v4M16 2.5v4" /></S>,
  check: (p: P) => <S {...p}><path d="m20 6-11 11-5-5" /></S>,
  x: (p: P) => <S {...p}><path d="M18 6 6 18M6 6l12 12" /></S>,
  cleft: (p: P) => <S {...p}><path d="m15 18-6-6 6-6" /></S>,
  cright: (p: P) => <S {...p}><path d="m9 18 6-6-6-6" /></S>,
  search: (p: P) => <S {...p}><circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" /></S>,
  clock: (p: P) => <S {...p}><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></S>,
  spark: (p: P) => <S {...p}><path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M18 6l-2.5 2.5M8.5 15.5 6 18" /></S>,
  rss: (p: P) => <S {...p}><path d="M4 11a9 9 0 0 1 9 9M4 4a16 16 0 0 1 16 16" /><circle cx="5" cy="19" r="1.5" fill="currentColor" /></S>,
  shield: (p: P) => <S {...p}><path d="M12 3 5 6v5c0 4.5 3 7.5 7 9 4-1.5 7-4.5 7-9V6l-7-3Z" /><path d="m9 12 2 2 4-4" /></S>,
  doc: (p: P) => <S {...p}><path d="M9 3h7l4 4v14H4V5a2 2 0 0 1 2-2Z" /><path d="M9 12h7M9 16h7M9 8h3" /></S>,
  rocket: (p: P) => <S {...p}><path d="M5 15c-1.5 1.5-2 5-2 5s3.5-.5 5-2" /><path d="M9 13c2-6 6-9 11-9 0 5-3 9-9 11l-2-2Z" /><circle cx="14.5" cy="8.5" r="1.4" /></S>,
  scan: (p: P) => <S {...p}><path d="M4 8V6a2 2 0 0 1 2-2h2M20 8V6a2 2 0 0 0-2-2h-2M4 16v2a2 2 0 0 0 2 2h2M20 16v2a2 2 0 0 1-2 2h-2" /><path d="M4 12h16" /></S>,
  flask: (p: P) => <S {...p}><path d="M9 3h6M10 3v6l-5 9a1.5 1.5 0 0 0 1.3 2.5h11.4A1.5 1.5 0 0 0 19 18l-5-9V3" /><path d="M7.5 14h9" /></S>,
  flame: (p: P) => <S {...p}><path d="M12 2c2 4 5 5.5 5 9a5 5 0 0 1-10 0c0-1.5.5-2.5 1-3 .5 1 1.5 1.5 2 1.5C9 7 11 4 12 2Z" /></S>,
  link: (p: P) => <S {...p}><path d="M10 13a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1.5 1.5" /><path d="M14 11a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1.5-1.5" /></S>,
  trash: (p: P) => <S {...p}><path d="M4 7h16M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2M6 7l1 13a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-13" /></S>,
  tag: (p: P) => <S {...p}><path d="M3 7.5V12l8.5 8.5a2 2 0 0 0 3 0l5-5a2 2 0 0 0 0-3L11 4H6.5A3.5 3.5 0 0 0 3 7.5Z" /><circle cx="7.5" cy="8" r="1.2" /></S>,
  ext: (p: P) => <S {...p}><path d="M14 4h6v6M20 4l-9 9M19 13v6a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h6" /></S>,
} as const;

export type IconName = keyof typeof Icon;
