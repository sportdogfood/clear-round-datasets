# ShellBoard

## What ShellBoard is (and what it is not)
ShellBoard is a reusable board shell that demonstrates routing, dense list/card rendering, and tap-active behavior.

This is ShellBoard. It ships with sample feed-like data to prove the shell, but it is not a domain-specific app implementation.

## Canonical cadence references used
The interaction cadence was derived from:
- `docs/schedule/index.html`
- `docs/schedule/app.js`

Reused patterns:
- Top app header + bottom nav shell cadence.
- `.row--tap` as the only tappable row surface.
- `.row--active` reserved for real state only.
- Screen routing cadence (`Start | Horses | Plan | Share` + `Detail`).
- Scroll-direction hide/show behavior for header + nav.

Not reused:
- Any app-specific naming conventions.
- Existing CSS copied as-is.
- Schedule-specific class/rider semantics.
- Any chart/sparkline visuals.
- Non-shell routing branches from schedule workflows.

## Tap-active UI rules
- `.row--tap` is the only row surface that is interactive.
- `.row--active` only appears when state is truly active (e.g., selected/has value), never decorative.

## Screen cadence and routing
Bottom nav routes:
- **Start**: stub + live/cached indicators.
- **Horses**: horse list, row tap opens detail.
- **Plan**: peaks anchors (pills) and stacked horse cards.
- **Share**: mobile preview + wall/print grid.

Secondary route:
- **Detail**: hero and filled-pill tabs (`Feed | Extras | Hay | Info`).

## Datasets used (names + load paths)
In `app.js` these URLs are loaded exactly:
- Horses: `../../../schedule/data/latest/shell_horses.json` (shared cache with 5-day sliding TTL)
- Profiles: `../../../schedule/data/latest/shell_profiles.json` (shared cache with 5-day sliding TTL)
- Items: `../data/shell_feed_items.json` (network only, no shared cache)
- Seed values: `../data/shell_values.json` (network only, no shared cache)

## Data schema contracts used in the sample
Feed-like item contract:
- `ration_options` is an array of numbers (e.g. `[0, 0.5, 1, 1.5, 2]`).
- Stored ration values remain numeric.
- UOM values are enum strings (`scoop | cup`).

Display formatting:
- `0 => —`
- `0.5 => ½`
- `1.5 => 1½`

Detail contract implemented:
- Hero includes optional `profile_icon`, `horseName` (H2), `showName` (H3), bottom-left aligned.
- Tabs: `Feed | Extras | Hay | Info` (single-column content).
- Feed tab supports `AM | PM` toggle and item cards.
- Extras has mode cycle: `None → AM → PM → AM/PM → None`.
- Hay supports `AM | MD | PM | NC` with cycle `0 → ½ → 1 → 2 → 0`.
- Info supports color pills, gender toggle, and read-only emergency block.

## Share wall/print mode
Share route renders a 6-column wall/print grid:
1. Horse name
2. Morning
3. Midday
4. Night
5. Night Check (muted)
6. Spacer/end

Each time cell includes `timecard + feedline + extraline + hayline`.
Print CSS is included so the grid prints without truncation.

## Error handling behavior
If any dataset fetch fails, a visible error row is shown containing:
- dataset name
- URL
- HTTP status or `network error`

No silent failures.

## How to run locally
From repo root:
```bash
python3 -m http.server 8000
```
Then open:
- `http://localhost:8000/docs/tapactive/shell/docs/`

All URLs are relative and GitHub Pages-safe.

## Do not rename classes to app-specific names
Keep generic shell primitives (`row--tap`, `row--active`, `chip`, `card`, etc.).
Do not rename them to app-specific names.

## Known gaps / next tasks
- Expand profile usage beyond identity fields into richer per-horse metadata cards.
- Add persistence of edited values back to storage/API.
- Add keyboard accessibility polish for all chip/toggle interactions.
- Add additional mobile QA snapshots for very long horse lists.
