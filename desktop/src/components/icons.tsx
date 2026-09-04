/**
 * Icon set — DESIGN.md §9.3: "Preserve the source's filled-icon style and
 * consistent optical size." All icons share a 24×24 viewBox, use
 * `currentColor` fill, and are `aria-hidden`. Stroke-based icons are
 * replaced with filled equivalents to match the Figma source's filled
 * language. The set is small enough (~15 glyphs) that inline SVGs avoid
 * pulling in a full icon-library dependency.
 *
 * Optical-size note: nav icons default to 24px; header utility icons
 * default to 20px (STITCH-PROMPT §4.1: "25–32px utility icons" refers to
 * the hit-target, not the glyph — the 20px glyph sits inside a larger
 * button). Callers can override via `size`.
 */
type IconProps = { size?: number; className?: string };

export function PipelineIcon({ size = 24, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
      <path d="M3 4a1 1 0 0 1 1-1h16a1 1 0 0 1 .8 1.6l-6.3 8.4V19a1 1 0 0 1-1.45.9l-3-1.5A1 1 0 0 1 9.5 17.5v-4.5L3.2 4.6A1 1 0 0 1 3 4z" />
    </svg>
  );
}

export function ProgressIcon({ size = 24, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
      <rect x="4" y="13" width="4" height="7" rx="1" />
      <rect x="10" y="9" width="4" height="11" rx="1" />
      <rect x="16" y="4" width="4" height="16" rx="1" />
    </svg>
  );
}

export function ReloadIcon({ size = 20, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
      <path d="M12 4a8 8 0 0 1 7.4 5H16a1 1 0 1 0 0 2h5a1 1 0 0 0 1-1V5a1 1 0 1 0-2 0v2.3A10 10 0 0 0 2 12a1 1 0 1 0 2 0 8 8 0 0 1 8-8z" />
      <path d="M12 20a8 8 0 0 1-7.4-5H8a1 1 0 1 0 0-2H3a1 1 0 0 0-1 1v5a1 1 0 1 0 2 0v-2.3A10 10 0 0 0 22 12a1 1 0 1 0-2 0 8 8 0 0 1-8 8z" />
    </svg>
  );
}

export function FolderIcon({ size = 20, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
      <path d="M3 6a1 1 0 0 1 1-1h5.17a1 1 0 0 1 .8.4l1.2 1.6H20a1 1 0 0 1 1 1v11a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V6z" />
    </svg>
  );
}

export function CheckIcon({ size = 16, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
      <path d="M9.55 18a1 1 0 0 1-.7-.3l-4.56-4.56a1 1 0 1 1 1.42-1.42l3.84 3.84 9.28-9.28a1 1 0 1 1 1.42 1.42l-10 10a1 1 0 0 1-.7.3z" />
    </svg>
  );
}

export function HomeIcon({ size = 24, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
      <path d="M3 12.5l9-8 9 8V20a1 1 0 0 1-1 1h-5v-5h-6v5H4a1 1 0 0 1-1-1v-7.5z" />
    </svg>
  );
}

export function SearchIcon({ size = 24, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
      <path d="M10.5 2a8.5 8.5 0 0 1 6.68 13.77l4.27 4.27a1 1 0 0 1-1.42 1.42l-4.27-4.27A8.5 8.5 0 1 1 10.5 2zm0 2a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13z" />
    </svg>
  );
}

export function InterviewIcon({ size = 24, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
      <path d="M4 4a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H8l-4 4V4z" />
    </svg>
  );
}

export function ProfileIcon({ size = 24, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
      <circle cx="12" cy="8" r="4" />
      <path d="M5.5 21a6.5 6.5 0 0 1 13 0H5.5z" />
    </svg>
  );
}

export function SettingsIcon({ size = 24, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
      <path d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9c.2.47.51.86.91 1.13a1.65 1.65 0 0 0 .6.36H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  );
}

export function HelpIcon({ size = 24, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
      <path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm0 15a1 1 0 1 1 0-2 1 1 0 0 1 0 2zm1.1-4.6c-.6.4-1.1.8-1.1 1.1a.5.5 0 0 1-1 0c0-.9.8-1.5 1.4-1.9.7-.5 1.1-.8 1.1-1.6a1.5 1.5 0 0 0-3 0 .5.5 0 0 1-1 0 2.5 2.5 0 0 1 5 0c0 1.3-.8 1.9-1.4 2.4z" />
    </svg>
  );
}

export function AiIcon({ size = 24, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
      <path d="M12 2L2 7l10 5 10-5-10-5z" />
      <path d="M2 12l10 5 10-5v2l-10 5L2 14v-2z" />
      <path d="M2 17l10 5 10-5v-2l-10 5L2 15v2z" />
    </svg>
  );
}

export function ImportIcon({ size = 24, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
      <path d="M12 2a1 1 0 0 1 1 1v10.59l3.3-3.3a1 1 0 1 1 1.4 1.42l-5 5a1 1 0 0 1-1.4 0l-5-5a1 1 0 0 1 1.4-1.42l3.3 3.3V3a1 1 0 0 1 1-1z" />
      <path d="M4 19a1 1 0 0 1 1-1h14a1 1 0 1 1 0 2H5a1 1 0 0 1-1-1z" />
    </svg>
  );
}

export function PlayIcon({ size = 24, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
      <path d="M6 4l14 8-14 8V4z" />
    </svg>
  );
}

/** Globe with meridians (Material Symbols `language`), the wordless "interface language" tab. */
export function GlobeIcon({ size = 20, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
      <path d="M11.99 2C6.47 2 2 6.48 2 12s4.47 10 9.99 10C17.52 22 22 17.52 22 12S17.52 2 11.99 2zm6.93 6h-2.95c-.32-1.25-.78-2.45-1.38-3.56 1.84.63 3.37 1.91 4.33 3.56zM12 4.04c.83 1.2 1.48 2.53 1.91 3.96h-3.82c.43-1.43 1.08-2.76 1.91-3.96zM4.26 14C4.1 13.36 4 12.69 4 12s.1-1.36.26-2h3.38c-.08.66-.14 1.32-.14 2s.06 1.34.14 2H4.26zm.82 2h2.95c.32 1.25.78 2.45 1.38 3.56-1.84-.63-3.37-1.9-4.33-3.56zm2.95-8H5.08c.96-1.66 2.49-2.93 4.33-3.56C8.81 5.55 8.35 6.75 8.03 8zM12 19.96c-.83-1.2-1.48-2.53-1.91-3.96h3.82c-.43 1.43-1.08 2.76-1.91 3.96zM14.34 14H9.66c-.09-.66-.16-1.32-.16-2s.07-1.35.16-2h4.68c.09.65.16 1.32.16 2s-.07 1.34-.16 2zm.25 5.56c.6-1.11 1.06-2.31 1.38-3.56h2.95c-.96 1.65-2.49 2.93-4.33 3.56zM16.36 14c.08-.66.14-1.32.14-2s-.06-1.34-.14-2h3.38c.16.64.26 1.31.26 2s-.1 1.36-.26 2h-3.38z" />
    </svg>
  );
}

/** GitHub mark (Octicons `mark-github`, 16-unit grid scaled onto the shared 24×24 viewBox). */
export function GitHubIcon({ size = 20, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
      <path transform="scale(1.5)" d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0 0 16 8c0-4.42-3.58-8-8-8z" />
    </svg>
  );
}

export function CloseIcon({ size = 20, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
      <path d="M6.7 5.3a1 1 0 0 0-1.4 1.4L10.6 12l-5.3 5.3a1 1 0 1 0 1.4 1.4L12 13.4l5.3 5.3a1 1 0 0 0 1.4-1.4L13.4 12l5.3-5.3a1 1 0 0 0-1.4-1.4L12 10.6 6.7 5.3z" />
    </svg>
  );
}
