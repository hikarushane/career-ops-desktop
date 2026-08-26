# Project Dashboard Management — Design System

This document distills the reusable visual and interaction rules from the Figma Community file [Project Dashboard Management](https://www.figma.com/design/nOhOm61BQstKMg3phgJqmR/Project-Dashboard-Management--Community-?node-id=0-1).

It is intended as the implementation contract for coding agents. Reproduce the system and relationships below; do not copy Figma's absolute coordinates literally unless a fixed desktop prototype is required.

## 1. Evidence and confidence

The source file contains the following 1366 × 768 desktop screens:

- Dashboard / project index (`1:13895`)
- Project portal / Kanban overview (`14:3118`)
- Calendar (`1:15663`)
- Clients (`1:16043`)
- Messages empty state (`1:16273`)
- Direct-message chat (`1:16403`)
- Alternate chat screens (`14:2430`, `1:16568`)

It also contains local component sets for project cards, sidebar items, and checkboxes.

The Figma file does **not** provide a complete semantic variable system. Only icon variables (`#222222`, `#33363F`) and image attributions were exposed. Colors, type sizes, dimensions, and effects marked **Observed** below come directly from inspected nodes. Items marked **Normalized** consolidate repeated values into implementation tokens.

The source defines desktop only. It does not specify responsive breakpoints, mobile navigation, dark mode, focus states, loading states, empty states beyond Messages, or error states.

## 2. Visual direction

The product is a clean project-management workspace with high information density and minimal decoration.

- Use a white canvas and large white surfaces.
- Use light gray only to group content, show disabled tracks, or distinguish secondary regions.
- Keep the persistent shell visually quiet. Navigation and content own the hierarchy.
- Use green as the main interactive and selected-state color.
- Use teal, amber, red, and magenta as semantic project/status accents.
- Prefer rounded cards, thin separators, compact labels, and small circular avatars.
- Avoid gradients, glass effects, decorative textures, and heavy borders.

## 3. Foundation tokens

### 3.1 Color

Use semantic names in code. Do not scatter raw hex values through components.

| Token | Value | Source use |
| --- | --- | --- |
| `color.canvas` | `#FFFFFF` | App background, header, sidebar, cards |
| `color.surface.subtle` | `#F5F5F5` | Dashboard summary panel |
| `color.surface.muted` | `#E4E4E4` | Progress tracks and received-message bubbles |
| `color.text.primary` | `#000000` | Headings, labels, body copy |
| `color.icon.default` | `#222222` | Filled icons; exposed Figma variable `fill_icon` |
| `color.line.strong` | `#33363F` | Icon/line color; exposed Figma variable `Line_icon` |
| `color.primary` | `#0AB239` | Active navigation, primary actions, sent messages, success |
| `color.accent.teal` | `#148B84` | Secondary action, medium-term project status |
| `color.accent.amber` | `#D68C1E` | Warning / two-week project status |
| `color.accent.red` | `#B20000` | Urgent / two-day project status |
| `color.accent.magenta` | `#AC2C80` | Upcoming project status |
| `color.text.onAccent` | `#FFFFFF` | Status chips and message text where contrast requires it |
| `color.text.onPrimaryDark` | `#1B3222` | Observed Add Project label; verify contrast before reuse |
| `color.text.onTealDark` | `#0E3230` | Observed Remove Project label; verify contrast before reuse |

Status colors carry meaning. Do not assign them randomly per card.

| Status meaning | Color |
| --- | --- |
| Selected / available / success | `color.primary` |
| Standard ongoing / medium horizon | `color.accent.teal` |
| Caution / approaching deadline | `color.accent.amber` |
| Urgent / shortest deadline | `color.accent.red` |
| Upcoming alternate category | `color.accent.magenta` |
| Offline / unavailable avatar status | Use the same urgent red family |

### 3.2 Typography

The entire interface uses **Poppins**. Load weights 400, 500, 600, and 700. Fall back to `system-ui, sans-serif` only while the font is unavailable.

| Role | Size | Weight | Tracking | Typical use |
| --- | ---: | ---: | ---: | --- |
| `display` | 40 px | 700 | 0 | Page title in the global header |
| `heading-lg` | 30 px | 600 | 0.3 px | Dashboard sections and panel headings |
| `metric-value` | 25 px | 700 | 0 | Summary counts |
| `metric-label` | 20 px | 500 | 0.2 px | Summary labels, right-aligned dates |
| `card-title` | 18 px | 700 | 0.18 px | Project and profile titles |
| `body-lg` | 16 px | 600 | 0 | Message groups and prominent list items |
| `label` | 14 px | 700 | 0.14 px | Navigation and buttons |
| `date` | 14 px | 500 | 0.14 px | Project dates |
| `chip` | 13 px | 600 | 0.13 px | Status pills and compact metadata |
| `body` | 12 px | 400–500 | 0.12 px | Descriptions and secondary metadata |
| `caption` | 10–11 px | 400–600 | 0 | Calendar events, timestamps, tertiary data |

Figma commonly uses `line-height: normal`. For production, normalize to:

- Headings: `1.15–1.25`
- Labels and chips: `1.2`
- Body copy: `1.4–1.5`

Do not synthesize weights with browser faux bolding.

### 3.3 Radius

| Token | Value | Use |
| --- | ---: | --- |
| `radius.card` | 20 px | Project cards, summary panels, client cards |
| `radius.control` | 20 px | Compact buttons and status chips |
| `radius.nav` | 30 px | Active/hover sidebar pill |
| `radius.track` | 10 px | Progress bars |
| `radius.avatar` | 50% | Profile and participant images |

### 3.4 Shadow and borders

| Token | Value | Use |
| --- | --- | --- |
| `shadow.card` | `0 4px 5px rgba(0,0,0,0.30)` | Project cards |
| `shadow.panel` | `0 0 5px 5px rgba(0,0,0,0.10)` | Dashboard summary panel |
| `shadow.action` | `0 4px 10px rgba(0,0,0,0.25)` | Primary compact action |
| `border.divider` | `1px solid rgba(0,0,0,0.20)` | Header/sidebar/content separation |

Use one elevation treatment per surface. Do not combine a dark border and strong shadow on the same card.

### 3.5 Spacing

The source uses many hand-positioned values. Normalize new work to a 4 px base grid:

`4, 8, 12, 16, 20, 24, 32, 40, 48`

Observed recurring relationships:

- Main content inset: 15–35 px from the content boundary.
- Card internal horizontal padding: 18–20 px.
- Compact control padding: 5 px vertical, 10 px horizontal.
- Project-card grid gap: 27 px.
- Project-board column gap: 13 px.
- List separators align edge-to-edge inside their panel.

When source measurements conflict by 1–3 px, choose the nearest 4 px token unless alignment with an adjacent fixed element would break.

## 4. Application shell

### 4.1 Desktop geometry

| Region | Observed size |
| --- | ---: |
| Reference viewport | 1366 × 768 px |
| Global header | 1366 × 82 px |
| Sidebar | 171 × 686 px, beginning below header |
| Main content start | `x = 172 px`, `y = 82 px` |
| Main content width | 1194 px |
| Header profile block | 215 × 56 px |
| Header avatar | 56 × 56 px |

Implementation structure:

```text
AppShell
├── Header (fixed height: 82px)
├── Sidebar (fixed desktop width: 171px)
└── Main (remaining width; independently scrollable where needed)
```

The Header and Sidebar remain consistent across all screens. Only the page title, active navigation item, and main content change.

### 4.2 Header

- Place the page title at `x ≈ 206 px`, aligned to the main content.
- Use `display` typography for the page title.
- Right-align notification, message, sort/filter, divider, avatar, name, and email.
- Use 25–32 px utility icons.
- Show notification counts as small circular badges attached to the icon's upper-right edge.
- Use a 56 px profile avatar, an 18 px bold name, and a 14 px regular email.
- Separate utilities from the profile block with a vertical divider around 64 px high.

### 4.3 Sidebar

- Sidebar width is 171 px on desktop.
- Each navigation row is 50 px high.
- Icon size is 24 px.
- Use a rounded 30 px inner pill for hover/selected treatment.
- Default: white background, black label and icon.
- Selected: `color.primary` background; keep label and icon dark as in the source, but verify contrast.
- Navigation labels use 14 px Poppins Bold with 0.14 px tracking.
- Preserve this order: Dashboard, Clients, Messages, Calendar, Settings.
- The file includes default and alternate variants for every sidebar item. Implement selected, hover, focus-visible, and pressed states from one shared component.

## 5. Component specifications

### 5.1 Dashboard summary panel

Observed geometry:

- Outer content region: 1194 × 208 px.
- Inner panel: 1167 × 167 px.
- Radius: 20 px.
- Surface: `color.surface.subtle`.
- Shadow: `shadow.panel`.
- Heading and date share the top row.
- Four metrics sit in one horizontal row with approximately 51 px vertical dividers.
- Actions stack vertically at the right edge.
- Compact action size: 136 × 31 px.

Rules:

- Keep metric values above their labels.
- Align all metrics to a shared baseline.
- Keep the date right-aligned.
- Treat Add Project as primary green and Remove Project as teal secondary/destructive-adjacent.
- On narrower desktop widths, wrap the metrics before shrinking text.

### 5.2 Project card

Observed base card:

- Size: 263 × 221 px.
- Radius: 20 px.
- Background: white.
- Shadow: `shadow.card`.
- Horizontal content inset: 18–20 px.
- Date: 14 px Medium, centered.
- Title: 18 px Bold, centered.
- Phase/category: 12 px Medium, centered.
- Progress track: 225 × 13 px with 10 px radius.
- Footer divider begins at `y ≈ 173 px`.
- Avatars: 25 × 25 px, overlapping horizontally.
- Status chip: 127 × 25 px, 20 px radius.

Two content modes exist:

1. **In progress** — phase, progress label, percentage, colored progress bar, participants, remaining-time chip.
2. **Upcoming / on hold** — short project definition replaces the progress area; participants and time/status chip remain.

The Figma component sets include Default and Variant2 states. Build one `ProjectCard` API with `status`, `progress`, `deadline`, `members`, and `interactionState`; do not create a separate component for every color.

### 5.3 Client card

The Clients page uses a four-column desktop grid of white profile cards.

- Use the same 20 px card radius and soft elevation language as project cards.
- Place a large circular avatar at the upper left.
- Attach a small green/red availability dot to the avatar's lower-right edge.
- Place name, role, and department to the right of the avatar.
- List phone, email, and location below with dark filled icons.
- Keep secondary metadata smaller and lower contrast than the name.
- Keep each card's internal alignment identical even when text lengths vary.

### 5.4 Project portal columns and task cards

Observed board geometry:

- Four columns at `x = 180, 478, 776, 1074 px`.
- Column width: 285 px.
- Gap: 13 px.
- Column header: 285 × 58 px.
- Inner list width: 270 px.
- Task card: 258 × 116 px.
- Task cards repeat every 126 px, producing a 10 px vertical gap.

Column types include To-Do, In Progress, Activity, and Checklist/Requirements.

Task-card anatomy:

- 12 px category/status dot at the upper left.
- Category label beside the dot.
- Main task text beneath it.
- Due date right-aligned near the lower edge.
- Thin progress/time strip at the bottom where applicable.

Panel titles use the `heading-lg` family but are constrained to the 58 px header. Activity rows use a 25 px avatar, compact description, right-aligned timestamp, and a bottom divider. Checklist rows use a 24 × 21 px checkbox and a 47 px minimum row height.

### 5.5 Calendar

Observed desktop composition:

- Month grid: 948 × 672 px.
- Seven weekday headers: approximately 134–136 × 32 px.
- Day cells: 132 × 124 px.
- Mini calendar: 238 × 209 px.
- Agenda card: 238 × 383 px.

Rules:

- Use thin gray grid lines and white/light-gray alternating surfaces only where needed for legibility.
- Keep day numbers prominent at the upper-left of each cell.
- Render events as compact gray strips containing time and title.
- Use teal circles for marked days in the mini calendar.
- Use primary green for the selected current day.
- The agenda card has a compact date header, centered empty-state message, illustration, and green encouraging caption.
- The reference illustration is an asset, not a shape to recreate manually.

### 5.6 Messages list

Observed desktop composition:

- Search/header strip: 295 × 55 px.
- Contact column: 294 × 615 px.
- Chat/content panel: 849 × 623 px.
- Community rows: about 284 × 48 px.
- Recent-message rows: about 283 × 53–55 px.
- Recent-message avatars: 42 px in chat views; group glyphs use the same circular language.

Rules:

- Divide the contact column into Groups and Recent Messages.
- Use a plus action aligned with the Groups heading.
- Use a thin full-width separator under every contact row.
- Truncate previews to one line with an ellipsis.
- Selected contact rows use a neutral gray rounded background, not green.
- New-message state uses a compact primary-green `New` chip.

### 5.7 Empty chat state

- Center the instruction, envelope illustration, and secondary message in the 849 × 623 px content panel.
- Keep large unused space; do not fill it with additional decoration.
- The envelope is a source asset and should not be redrawn.

### 5.8 Conversation panel

- Use a light-gray chat header with avatar, online dot, name, call action, and overflow menu.
- Center the conversation date below the header.
- Received bubbles align left and use `color.surface.muted`.
- Sent bubbles align right and use `color.primary`.
- Bubble radius is pill-like for short messages and softer rectangular for multiline messages.
- Place timestamps inside or immediately adjacent to the bubble's lower-right corner in `caption` typography.
- Pin the composer to the panel bottom. Include message input, emoji, attachment, and send actions.
- Do not allow long messages to span the entire panel; cap bubble width around 55–65% of the conversation width.

### 5.9 Buttons and chips

- Compact buttons use 14 px Bold labels, 5 px vertical and 10 px horizontal padding, and a 20 px radius.
- Status chips use 13 px SemiBold labels and a 25 px fixed height.
- Preserve consistent widths only when cards need column alignment; otherwise allow content-driven width.
- Never use color alone for destructive actions or project status. Pair color with a label or icon.

### 5.10 Avatars and presence

- Global profile: 56 px.
- Message/contact avatar: 42 px.
- Project-card participant avatar: 25 px.
- Use circular cropping with `object-fit: cover`.
- Overlay presence at the lower-right edge.
- Use an explicit border matching the surface so the dot does not visually merge with the photo.
- Avatar stacks overlap; keep names available to assistive technology through labels or tooltips.

## 6. Asset rules

- Use the exact exported icons and illustrations from Figma or a verified matching icon library.
- Do not redraw vector glyphs from memory.
- Preserve the source's filled-icon style and consistent optical size.
- Store downloaded assets locally; temporary Figma MCP URLs expire.
- Keep the source image attributions when redistributing avatar photography. The file exposes multiple photographer credits as variable metadata.
- Use meaningful `alt` text for content images. Mark decorative icons and illustrations appropriately.

## 7. Interaction states

The file visibly defines or implies these states:

| Component | Required states |
| --- | --- |
| Sidebar item | default, hover, selected, focus-visible, pressed |
| Project card | default, hover/alternate variant, keyboard focus |
| Checkbox | unchecked, checked, focus-visible, disabled |
| Client/contact row | default, hover, selected, unread/new |
| Button | default, hover, pressed, focus-visible, disabled |
| Message composer | empty, focused, populated, send-disabled |

Use a visible 2 px focus ring outside the component boundary. The source does not define a focus color; use a darker teal derived from `color.accent.teal` and verify contrast.

Motion is not specified. If motion is added, keep it functional:

- Hover/press transitions: 120–180 ms.
- Panel or route transitions: 180–240 ms.
- Respect `prefers-reduced-motion`.

## 8. Responsive behavior

These rules are **implementation guidance**, not source-defined breakpoints.

### Desktop: `≥ 1200 px`

- Preserve the 171 px sidebar and 82 px header.
- Use four-column project/client layouts where content fits.
- Keep calendar grid and right rail side by side.

### Tablet: `768–1199 px`

- Collapse the sidebar to an icon rail or off-canvas drawer.
- Use two-column project/client grids.
- Move the calendar mini-calendar and agenda below the month grid.
- Keep the contact column visible beside chat only when at least 900 px is available.

### Mobile: `< 768 px`

- Replace the desktop sidebar with a drawer or bottom navigation.
- Stack summary metrics and board columns vertically or use horizontal board scrolling with clear affordance.
- Show either contact list or conversation, not both.
- Convert the month grid to an agenda-first experience if 7 readable columns cannot fit.
- Maintain at least 44 × 44 px touch targets even where the desktop source uses smaller controls.

## 9. Accessibility guardrails

The source prioritizes visual compactness; production code must strengthen accessibility without changing its character.

- Keep normal text at a minimum 4.5:1 contrast ratio.
- Verify dark text on `#0AB239` and `#148B84`; switch to white or a darker background when needed.
- Do not use 10–12 px text for essential actions on mobile.
- Provide programmatic labels for icon-only actions and notification badges.
- Use semantic buttons, navigation, headings, tables/grids, lists, and form controls.
- Expose selected navigation and contact state with `aria-current` or `aria-selected` as appropriate.
- Add text or icons alongside red/amber/green status colors.
- Keep keyboard order consistent with the visual order.
- Announce incoming messages and form errors without moving focus unexpectedly.

## 10. Implementation guardrails

1. Build the shell first: Header, Sidebar, and scrollable Main.
2. Define the tokens in one theme file before styling components.
3. Build reusable primitives: `Avatar`, `IconButton`, `StatusChip`, `ProgressBar`, `SearchField`, and `SidebarItem`.
4. Build domain components from those primitives: `ProjectCard`, `ClientCard`, `BoardColumn`, `TaskCard`, `ContactRow`, and `MessageBubble`.
5. Use CSS Grid/Flexbox for layout. Avoid copying Figma's absolute positioning except for badge/avatar overlays.
6. Keep data and visual status mapping outside presentational components.
7. Preserve the fixed source dimensions only as visual-reference tests, not as hard-coded viewport assumptions.
8. Validate at 1366 × 768 first, then verify the normalized responsive rules.

## 11. Suggested CSS custom properties

```css
:root {
  --font-sans: "Poppins", system-ui, sans-serif;

  --color-canvas: #ffffff;
  --color-surface-subtle: #f5f5f5;
  --color-surface-muted: #e4e4e4;
  --color-text-primary: #000000;
  --color-icon-default: #222222;
  --color-line-strong: #33363f;
  --color-primary: #0ab239;
  --color-accent-teal: #148b84;
  --color-accent-amber: #d68c1e;
  --color-accent-red: #b20000;
  --color-accent-magenta: #ac2c80;

  --radius-card: 20px;
  --radius-control: 20px;
  --radius-nav: 30px;
  --radius-track: 10px;

  --shadow-card: 0 4px 5px rgb(0 0 0 / 30%);
  --shadow-panel: 0 0 5px 5px rgb(0 0 0 / 10%);
  --shadow-action: 0 4px 10px rgb(0 0 0 / 25%);

  --header-height: 82px;
  --sidebar-width: 171px;
  --content-max-width: 1194px;
}
```

## 12. Definition of done

A screen matches this system when:

- Poppins is used at the defined weights and hierarchy.
- The 82 px header and 171 px desktop sidebar align across routes.
- Primary selection and action states use the green semantic token consistently.
- Cards use the correct 20 px radius, spacing, and restrained elevation.
- Project/status colors communicate stable meanings.
- Repeated content is implemented with shared components rather than duplicated markup.
- Source assets remain faithful and are stored locally.
- The 1366 × 768 reference composition matches visually.
- Responsive behavior does not reduce touch targets or text legibility.
- Keyboard focus, semantic structure, and contrast checks pass.
