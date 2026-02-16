# Tap‑Active ShellBoard UI Kit (FeedBoard‑first)

This canvas contains **three deliverables** in one place:

1) **Locked spec** (everything we agreed today)
2) **Kitchen‑sink HTML + CSS** (single file, mobile‑first)
3) **Codex instruction set** to build/update the shell using the kitchen‑sink as the canonical UI contract

---

## 1) Locked spec (what is now canonical)

### A. Cadence + routes (locked)
- Bottom nav routes: **Start | Horses | Plan | Share**
- Detail route: **Horse Detail**
- Cadence: Start → Active (horse/profile) → Plan → Share (+ Detail)

### B. Non‑negotiable interaction contract (tap‑active)
- `.row--tap` = **the tappable control surface**
  - **One row only** (no multi‑row tap regions)
  - Must show press feedback animation
- `.row--active` = **real state only** (never decorative)
- Tap primitives (must share the same press feedback curve/duration):
  - **tap‑row** (`.row--tap`)
  - **tap‑pill** (`.pill--tap`)
  - **tap‑tag** (`.tag--tap`)

### C. Universal row primitive (locked)
- Universal row is **4‑column** and used everywhere.
- Component name: **`card-line4`**
- DOM contract:
  - `.card-line4` (optionally also `.row--tap`)
  - `.c4-a` | `.c4-b` | `.c4-c` | `.c4-d` always present (can be empty)
- Meaning (stable):
  - `c4-a` = left key (time / horse / label)
  - `c4-b` = short code / short meta
  - `c4-c` = main body (can become nested grid)
  - `c4-d` = right cluster (dot / badges / chevron / value)

#### Column widths (your density tokens)
- Baseline fixed tokens you supplied:
  - `c4-a = 44px`
  - `c4-b = 30px`
  - `c4-d = 24px`
- Viewport “buy” rule:
  - `c4-c` becomes elastic: **`minmax(0, 1fr)`**
  - So row is full width on mobile while keeping your identity tokens.

### D. Depth behavior (locked)
- Depth changes **typography only**, never structure.
- Drill‑down cards (schedule/rings) can shrink typography as depth increases.
- At deeper depths, `c4-c` may become an internal grid:
  - `.c4-grid--entry` / `.c4-grid--trip` etc.
- Flat cards (feed/extras/hay/info) **do not shrink** for “drill‑down”.

### E. Cards and wrappers (locked)
- A **Card is not a new visual system**.
- Card is structural only:
  - `head (header region)`
  - stacked `.card-line4` rows
  - `cap` (bottom terminator row)
- Optional group wrapper exists for ring/schedule:
  - `.group-wrap` + tint modifier (`.tint-C`, `.tint-L`, …)

### F. Detail page: Hero + tabs (locked)
- Detail page hero is **not a graph**.
- Hero content (bottom-left aligned):
  - `profile_icon` if present
  - `horseName` (H2)
  - `showName` (H3)
- Tabs under hero:
  - **Feed | Extras | Hay | Info**
  - Tabs are pill style; horizontal scroll allowed if overflow.

### G. Feed tab (UPDATED + locked)
**Change:** Feed is now **item‑first**.

- Nested tabs = **actual food names** (from dataset)
- Each food tab shows a **feed-card** with **two lines**:
  - **AM line**: `c4-a=Morning`, `c4-b=empty`, `c4-c=UOM`, `c4-d=Ration`
  - **PM line**: `c4-a=Evening`, `c4-b=empty`, `c4-c=UOM`, `c4-d=Ration`

#### UOM toggle (locked)
- Tap target: **`c4-c` only**
- Cycles: **Scoop ↔ Cup** (global for now)

#### Ration cycle (locked)
- Tap target: **`c4-d` only**
- Global cycle: **0 → ½ → 1 → 1½ → 2 → 0**
- Store as numeric values: `0, 0.5, 1, 1.5, 2` and render with `½` glyph.

### H. Extras tab (locked)
- Nested tabs = **supplement names**
- Each supplement tab shows a **supplement-card** with a **Mode** line:
  - `c4-a=Mode`, `c4-b=empty`, `c4-c=empty`, `c4-d=Mode`
- Tap target: **`c4-d` only**
- Cycle: **NONE → AM → PM → AM|PM → NONE**
- Default: **NONE**

### I. Hay tab (locked)
- Hay is **slot‑first**.
- Render 4 stacked **hay-cards** labeled:
  - **AM / MD / PM / NC**
- Each hay-card contains line rows to set flakes/amounts.
- Supports halves (same 0/½/1/1½/2 pattern unless later overridden).

### J. Info tab (locked)
- Color pill set (values in-app):
  - Grey, Chestnut, Bay, Palomino, Liverchestnut, Black, Paint
- Gender toggle: Mare | Gelding (tap)
- Barn Name (prepopulated, read-only for now)
- Show Name (prepopulated, read-only)
- Emergency (prepopulated, read-only)

### K. Share page (locked; Codex failed here)
Share is **not** one output.

1) **Share Options list** (traditional `row--tap` rows)
2) **Output preview region** (renders based on selected option)

#### Share modes (v1 intent)
- Phone preview
- Print (Landscape)
- Wall (grid)
- Copy text
- Print action (calls `window.print()`)

### L. Share wall grid (mobile-first + print target)
- Grid is Horses (Y) × AM/MD/PM/NC (X)
- **Sticky left horse column** (smaller width)
- Horizontal scroll for slots; rows slide through.
- Each slot cell contains a **slot-card**.

#### Print target
- Must render to a **landscape printed page**.
- In print media:
  - hide app chrome
  - fit grid to page width

#### Wall cast intent
- Prefer a **single high-contrast wall view** (HTML full screen first; image export later).

### M. Data + caching (locked decisions)
- Shared datasets across apps: **horses + profiles** (5‑day sliding TTL in IndexedDB)
- All other datasets are per‑app.
- Shell data paths (repo):
  - `docs/schedule/data/latest/shell_horses.json`
  - `docs/schedule/data/latest/shell_profiles.json`
  - `docs/tapactive/shell/data/shell_feed_items.json`
  - `docs/tapactive/shell/data/shell_values.json`

### N. Shell file layout (locked)
- Shell app files:
  - `docs/tapactive/shell/docs/index.html`
  - `docs/tapactive/shell/docs/app.js`
  - `docs/tapactive/shell/docs/README.md`

---

## 2) Kitchen‑sink (single file) — HTML + CSS

Purpose:
- One page that demonstrates **every primitive**:
  - Top bar
  - Search
  - Tabs
  - Nested tabs
  - `card-line4` rows
  - tap pills/tags
  - dot/count
  - badges
  - Share options list
  - Share wall grid with sticky horses column
  - Print CSS (landscape)

> This is a **mock page**; it does not need app.js.

```html
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>ShellBoard Kitchen Sink</title>
  <style>
    /* =========================================================
       TOKENS (mobile-first, Google-finance-adjacent readability)
       ========================================================= */
    :root{
      --bg:#0b0d12;
      --surface:#111522;
      --surface2:#0f1320;
      --line:rgba(255,255,255,.08);
      --text:rgba(255,255,255,.92);
      --muted:rgba(255,255,255,.62);
      --muted2:rgba(255,255,255,.42);
      --accent:#2f6cff;
      --good:#30d158;

      --r-lg:18px;
      --r-md:14px;
      --r-sm:12px;

      --pad:12px;
      --gap:10px;

      --fs-title:18px;
      --fs-row:15px;
      --fs-sub:12.5px;
      --fs-micro:11.5px;

      --w-a:44px;
      --w-b:30px;
      --w-d:24px;

      --press-dur:90ms;
      --press-ease:cubic-bezier(.2,.8,.2,1);
    }

    html,body{height:100%;}
    body{
      margin:0;
      background:var(--bg);
      color:var(--text);
      font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial;
      -webkit-font-smoothing:antialiased;
      text-rendering:optimizeLegibility;
    }

    /* =====================================
       PAGE FRAME (header / main / nav)
       ===================================== */
    .app{
      min-height:100vh;
      display:grid;
      grid-template-rows:auto 1fr auto;
    }
    .topbar{
      position:sticky; top:0;
      z-index:10;
      background:linear-gradient(180deg, rgba(15,19,32,.98), rgba(15,19,32,.90));
      border-bottom:1px solid var(--line);
      padding:10px var(--pad);
      display:grid;
      grid-template-columns:auto 1fr auto;
      align-items:center;
      gap:10px;
    }
    .title{
      text-align:center;
      font-size:var(--fs-title);
      font-weight:700;
      letter-spacing:.2px;
    }

    .main{
      padding:12px var(--pad) 80px;
      overflow:auto;
      -webkit-overflow-scrolling:touch;
    }

    .botnav{
      position:sticky; bottom:0;
      z-index:10;
      background:linear-gradient(180deg, rgba(11,13,18,.30), rgba(11,13,18,.96));
      border-top:1px solid var(--line);
      padding:10px var(--pad);
      display:grid;
      grid-auto-flow:column;
      grid-auto-columns:1fr;
      gap:10px;
    }

    /* =====================================
       TAP PRIMITIVES (row/pill/tag)
       ===================================== */
    .row--tap, .pill--tap, .tag--tap{cursor:pointer; user-select:none;}

    .row--tap:active, .pill--tap:active, .tag--tap:active{
      transform:translateY(1px);
      filter:brightness(1.08);
      transition:transform var(--press-dur) var(--press-ease), filter var(--press-dur) var(--press-ease);
    }

    .row--active{outline:1px solid rgba(47,108,255,.85); box-shadow:0 0 0 2px rgba(47,108,255,.12) inset;}

    /* =====================================
       PILLS / TABS
       ===================================== */
    .pill{
      border:1px solid var(--line);
      background:rgba(255,255,255,.04);
      color:var(--text);
      border-radius:999px;
      padding:10px 12px;
      display:grid;
      place-items:center;
      font-weight:650;
      letter-spacing:.2px;
      min-height:38px;
      position:relative;
      white-space:nowrap;
    }
    .pill.is-active{
      background:linear-gradient(180deg, rgba(47,108,255,.28), rgba(47,108,255,.10));
      border-color:rgba(47,108,255,.70);
    }
    .pill .dot{
      position:absolute;
      top:-6px;
      right:-6px;
    }

    .pillbar{
      display:grid;
      grid-auto-flow:column;
      grid-auto-columns:max-content;
      gap:10px;
      overflow:auto;
      padding:6px 2px;
      -webkit-overflow-scrolling:touch;
    }

    /* =====================================
       SEARCH
       ===================================== */
    .search{
      margin:10px 0 14px;
      display:grid;
      grid-template-columns:1fr;
    }
    .search input{
      width:100%;
      border:1px solid var(--line);
      background:rgba(255,255,255,.03);
      color:var(--text);
      border-radius:999px;
      padding:12px 14px;
      font-size:14px;
      outline:none;
    }
    .search input::placeholder{color:var(--muted2);}

    /* =====================================
       SECTION LABELS
       ===================================== */
    .section-label{
      margin:12px 2px 6px;
      color:var(--muted);
      font-size:11px;
      letter-spacing:.16em;
      font-weight:750;
    }

    /* =====================================
       CARD (structural only)
       ===================================== */
    .card{
      display:grid;
      gap:8px;
      margin:10px 0 16px;
    }
    .card-head{
      display:grid;
      grid-template-columns:1fr auto;
      align-items:end;
      gap:10px;
      padding:0 2px;
    }
    .card-head .h{
      font-size:14px;
      font-weight:800;
      letter-spacing:.2px;
    }
    .card-head .meta{color:var(--muted); font-size:12px;}

    /* =====================================
       UNIVERSAL ROW: card-line4
       ===================================== */
    .card-line4{
      width:100%;
      display:grid;
      grid-template-columns: var(--w-a) var(--w-b) minmax(0,1fr) var(--w-d);
      gap:var(--gap);
      align-items:center;
      background:linear-gradient(180deg, rgba(255,255,255,.05), rgba(255,255,255,.02));
      border:1px solid var(--line);
      border-radius:var(--r-lg);
      padding:10px 12px;
      box-sizing:border-box;
    }
    .c4-a,.c4-b,.c4-d{color:var(--muted); font-weight:700; font-size:12px;}
    .c4-c{min-width:0;}
    .c4c-title{font-size:var(--fs-row); font-weight:700; line-height:1.1; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;}
    .c4c-sub{margin-top:2px; font-size:var(--fs-sub); color:var(--muted); white-space:nowrap; overflow:hidden; text-overflow:ellipsis;}

    /* Right cluster primitives */
    .dot{
      width:18px; height:18px;
      border-radius:999px;
      border:1px solid var(--line);
      display:grid; place-items:center;
      background:rgba(255,255,255,.03);
      color:var(--text);
      font-size:11px;
      font-weight:800;
    }
    .dot.is-on{background:rgba(48,209,88,.22); border-color:rgba(48,209,88,.55); color:rgba(255,255,255,.95);}

    .tag{
      display:inline-grid;
      place-items:center;
      padding:6px 10px;
      border-radius:999px;
      border:1px solid var(--line);
      background:rgba(255,255,255,.03);
      color:var(--text);
      font-size:12px;
      font-weight:750;
      white-space:nowrap;
    }

    .badge-wrap{display:flex; gap:6px; justify-content:flex-end;}
    .badge{
      display:inline-grid;
      place-items:center;
      min-width:18px;
      height:18px;
      padding:0 6px;
      border-radius:999px;
      border:1px solid var(--line);
      background:rgba(255,255,255,.03);
      color:var(--muted);
      font-size:11px;
      font-weight:850;
    }

    /* Depth (schedule-like) */
    .depth-1 .c4c-title{font-size:13px; font-weight:650;}
    .depth-2 .c4c-title{font-size:12px; font-weight:650; color:var(--muted);}

    /* Nested grids inside c4-c */
    .c4-grid{display:grid; gap:6px; min-width:0;}
    .c4-grid--entry{grid-template-columns:1fr 1fr auto auto auto auto;}
    .c4-grid--trip{grid-template-columns:1fr auto auto auto auto;}
    .c4-grid > span{min-width:0; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; font-size:var(--fs-micro); color:var(--muted); font-weight:700;}

    /* =====================================
       SHARE OPTIONS LIST
       ===================================== */
    .options{display:grid; gap:10px;}
    .chev{color:var(--muted); font-weight:900; text-align:right;}

    /* =====================================
       SHARE WALL GRID (mobile)
       ===================================== */
    .wall{
      margin-top:14px;
      border:1px solid var(--line);
      border-radius:var(--r-lg);
      overflow:hidden;
      background:rgba(255,255,255,.02);
    }

    .wall-head{
      display:grid;
      grid-template-columns: 72px 1fr;
      border-bottom:1px solid var(--line);
      background:rgba(255,255,255,.03);
    }

    .wall-head .left{
      position:sticky; left:0;
      z-index:2;
      border-right:1px solid var(--line);
      padding:10px 10px;
      font-size:11px;
      color:var(--muted);
      font-weight:850;
      letter-spacing:.12em;
      background:rgba(18,22,34,.96);
    }

    .slot-tabs{
      overflow:auto;
      -webkit-overflow-scrolling:touch;
    }

    .slot-row{
      min-width: 520px; /* 4 slots + gutters; forces horizontal scroll region */
      display:grid;
      grid-template-columns: repeat(4, 1fr);
      gap:10px;
      padding:10px;
    }

    .slot-pill{border:1px solid var(--line); border-radius:999px; padding:8px 10px; font-size:12px; font-weight:850; color:var(--text); text-align:center;}

    .wall-body{
      display:grid;
    }

    .wall-row{
      display:grid;
      grid-template-columns: 72px 1fr;
      border-bottom:1px solid var(--line);
    }

    .horse-sticky{
      position:sticky; left:0;
      z-index:1;
      border-right:1px solid var(--line);
      background:rgba(18,22,34,.96);
      padding:10px 10px;
      font-size:12px;
      font-weight:850;
      white-space:nowrap;
      overflow:hidden;
      text-overflow:ellipsis;
    }

    .slots-scroll{overflow:auto; -webkit-overflow-scrolling:touch;}

    .slot-col{
      display:grid;
      gap:10px;
      min-width: 520px;
      grid-template-columns: repeat(4, 1fr);
      padding:10px;
    }

    .slot-card{
      display:grid;
      gap:8px;
      border:1px solid var(--line);
      border-radius:var(--r-lg);
      padding:8px;
      background:rgba(255,255,255,.02);
    }
    .slot-card .slot-head{font-size:12px; font-weight:900; color:var(--muted); letter-spacing:.08em; padding:0 4px;}

    /* Print */
    @media print{
      body{background:#fff; color:#111;}
      .topbar,.botnav,.search,.section-label,.options{display:none !important;}
      .main{padding:0; overflow:visible;}
      .wall{border:0;}
      .wall-head .left,.horse-sticky{background:#fff; color:#111;}
      .slot-row,.slot-col{min-width:0 !important;}
      .slots-scroll,.slot-tabs{overflow:visible !important;}
      .card-line4,.slot-card{break-inside:avoid;}
      @page{size: landscape; margin: 10mm;}
    }
  </style>
</head>
<body>
  <div class="app">

    <!-- TOP BAR -->
    <div class="topbar">
      <div class="pill pill--tap">Back</div>
      <div class="title">Active Horses</div>
      <div class="pill pill--tap is-active">Next</div>
    </div>

    <main class="main">

      <!-- SEARCH -->
      <div class="search">
        <input placeholder="Search horses…" />
      </div>

      <!-- ACTIVE/INACTIVE LABELS -->
      <div class="section-label">ACTIVE</div>

      <!-- ROWS (universal line4) -->
      <div class="card">
        <div class="card-line4 row--tap row--active">
          <div class="c4-a"></div>
          <div class="c4-b"></div>
          <div class="c4-c">
            <div class="c4c-title">Navy</div>
            <div class="c4c-sub">WEF • Barn A</div>
          </div>
          <div class="c4-d"><div class="dot is-on"></div></div>
        </div>

        <div class="card-line4 row--tap">
          <div class="c4-a"></div>
          <div class="c4-b"></div>
          <div class="c4-c">
            <div class="c4c-title">Rost</div>
            <div class="c4c-sub">WEF • Barn A</div>
          </div>
          <div class="c4-d"><div class="dot">3</div></div>
        </div>
      </div>

      <div class="section-label">INACTIVE</div>
      <div class="card">
        <div class="card-line4 row--tap">
          <div class="c4-a"></div>
          <div class="c4-b"></div>
          <div class="c4-c">
            <div class="c4c-title">Zoey</div>
            <div class="c4c-sub">—</div>
          </div>
          <div class="c4-d"><div class="dot"></div></div>
        </div>
      </div>

      <!-- DETAIL HERO + TABS (visual only) -->
      <div class="card">
        <div class="card-head">
          <div class="h">Horse Detail (Hero + Tabs)</div>
          <div class="meta">mock</div>
        </div>
        <div class="card-line4">
          <div class="c4-a"></div>
          <div class="c4-b"></div>
          <div class="c4-c">
            <div class="c4c-title">Navy</div>
            <div class="c4c-sub">Winter Equestrian Festival</div>
          </div>
          <div class="c4-d"><div class="badge-wrap"><span class="badge">P</span></div></div>
        </div>
        <div class="pillbar" aria-label="tabs">
          <div class="pill pill--tap is-active">Feed</div>
          <div class="pill pill--tap">Extras</div>
          <div class="pill pill--tap">Hay</div>
          <div class="pill pill--tap">Info</div>
        </div>
      </div>

      <!-- FEED TAB: nested tabs = food names; each shows AM/PM lines -->
      <div class="card">
        <div class="card-head">
          <div class="h">Feed (nested tabs = food names)</div>
          <div class="meta">ration cycle: 0 ½ 1 1½ 2</div>
        </div>
        <div class="pillbar">
          <div class="pill pill--tap is-active">Grain</div>
          <div class="pill pill--tap">Supplements</div>
          <div class="pill pill--tap">Hay Cube</div>
        </div>

        <div class="card-line4 row--tap">
          <div class="c4-a">AM</div>
          <div class="c4-b"></div>
          <div class="c4-c"><span class="tag tag--tap">Scoop</span></div>
          <div class="c4-d"><span class="tag tag--tap">1½</span></div>
        </div>
        <div class="card-line4 row--tap">
          <div class="c4-a">PM</div>
          <div class="c4-b"></div>
          <div class="c4-c"><span class="tag tag--tap">Cup</span></div>
          <div class="c4-d"><span class="tag tag--tap">1</span></div>
        </div>
      </div>

      <!-- EXTRAS: nested tabs = supplement names; one mode line -->
      <div class="card">
        <div class="card-head">
          <div class="h">Extras (supplements)</div>
          <div class="meta">cycle: NONE AM PM AM|PM</div>
        </div>
        <div class="pillbar">
          <div class="pill pill--tap is-active">Electrolyte</div>
          <div class="pill pill--tap">Omeprazole</div>
          <div class="pill pill--tap">Magnesium</div>
        </div>
        <div class="card-line4 row--tap">
          <div class="c4-a">Mode</div>
          <div class="c4-b"></div>
          <div class="c4-c"></div>
          <div class="c4-d"><span class="tag tag--tap">AM|PM</span></div>
        </div>
      </div>

      <!-- SHARE OPTIONS + WALL GRID (sticky horses col) -->
      <div class="card">
        <div class="card-head">
          <div class="h">Share (options + preview)</div>
          <div class="meta">mock</div>
        </div>

        <div class="options">
          <div class="card-line4 row--tap row--active">
            <div class="c4-a"></div>
            <div class="c4-b"></div>
            <div class="c4-c"><div class="c4c-title">Preview: Phone</div><div class="c4c-sub">stacked cards</div></div>
            <div class="c4-d"><div class="chev">›</div></div>
          </div>
          <div class="card-line4 row--tap">
            <div class="c4-a"></div>
            <div class="c4-b"></div>
            <div class="c4-c"><div class="c4c-title">Preview: Print (Landscape)</div><div class="c4c-sub">one page</div></div>
            <div class="c4-d"><div class="chev">›</div></div>
          </div>
          <div class="card-line4 row--tap">
            <div class="c4-a"></div>
            <div class="c4-b"></div>
            <div class="c4-c"><div class="c4c-title">Preview: Wall</div><div class="c4c-sub">horses × AM/MD/PM/NC</div></div>
            <div class="c4-d"><div class="chev">›</div></div>
          </div>
        </div>

        <div class="wall" aria-label="wall grid">
          <div class="wall-head">
            <div class="left">HORSES</div>
            <div class="slot-tabs">
              <div class="slot-row">
                <div class="slot-pill">AM</div>
                <div class="slot-pill">MD</div>
                <div class="slot-pill">PM</div>
                <div class="slot-pill">NC</div>
              </div>
            </div>
          </div>

          <div class="wall-body">
            <div class="wall-row">
              <div class="horse-sticky">Navy</div>
              <div class="slots-scroll">
                <div class="slot-col">
                  <div class="slot-card"><div class="slot-head">AM</div><div class="card-line4"><div class="c4-a"></div><div class="c4-b"></div><div class="c4-c"><div class="c4c-title">Feed</div><div class="c4c-sub">1½ Scoop</div></div><div class="c4-d"></div></div></div>
                  <div class="slot-card"><div class="slot-head">MD</div><div class="card-line4"><div class="c4-a"></div><div class="c4-b"></div><div class="c4-c"><div class="c4c-title">Hay</div><div class="c4c-sub">1 Flake</div></div><div class="c4-d"></div></div></div>
                  <div class="slot-card"><div class="slot-head">PM</div><div class="card-line4"><div class="c4-a"></div><div class="c4-b"></div><div class="c4-c"><div class="c4c-title">Extras</div><div class="c4c-sub">AM|PM</div></div><div class="c4-d"></div></div></div>
                  <div class="slot-card"><div class="slot-head">NC</div><div class="card-line4"><div class="c4-a"></div><div class="c4-b"></div><div class="c4-c"><div class="c4c-title">—</div><div class="c4c-sub">None</div></div><div class="c4-d"></div></div></div>
                </div>
              </div>
            </div>

            <div class="wall-row">
              <div class="horse-sticky">Rost</div>
              <div class="slots-scroll">
                <div class="slot-col">
                  <div class="slot-card"><div class="slot-head">AM</div><div class="card-line4"><div class="c4-a"></div><div class="c4-b"></div><div class="c4-c"><div class="c4c-title">Feed</div><div class="c4c-sub">1 Cup</div></div><div class="c4-d"></div></div></div>
                  <div class="slot-card"><div class="slot-head">MD</div><div class="card-line4"><div class="c4-a"></div><div class="c4-b"></div><div class="c4-c"><div class="c4c-title">Hay</div><div class="c4c-sub">½ Flake</div></div><div class="c4-d"></div></div></div>
                  <div class="slot-card"><div class="slot-head">PM</div><div class="card-line4"><div class="c4-a"></div><div class="c4-b"></div><div class="c4-c"><div class="c4c-title">Extras</div><div class="c4c-sub">PM</div></div><div class="c4-d"></div></div></div>
                  <div class="slot-card"><div class="slot-head">NC</div><div class="card-line4"><div class="c4-a"></div><div class="c4-b"></div><div class="c4-c"><div class="c4c-title">—</div><div class="c4c-sub">None</div></div><div class="c4-d"></div></div></div>
                </div>
              </div>
            </div>
          </div>
        </div>

      </div>

    </main>

    <!-- BOTTOM NAV -->
    <div class="botnav">
      <div class="pill pill--tap is-active">Start<div class="dot">1</div></div>
      <div class="pill pill--tap">Horses</div>
      <div class="pill pill--tap">Plan</div>
      <div class="pill pill--tap">Share</div>
    </div>

  </div>
</body>
</html>
```

---

## 3) Codex instruction set (must follow)

### Objective
Create/update the **ShellBoard** app so the runtime UI uses the **Kitchen‑sink primitives** exactly (row/tabs/cards/share options + wall grid), then wire in the real ShellBoard data and input behaviors.

### Canonical references (must read first)
- Existing schedule canonical (behavior patterns only, not styling):
  - `docs/schedule/index.html`
  - `docs/schedule/app.js`
- ShellBoard target paths:
  - `docs/tapactive/shell/docs/index.html`
  - `docs/tapactive/shell/docs/app.js`
  - `docs/tapactive/shell/docs/README.md`
- Kitchen‑sink is the UI truth source (this canvas section).

### Non‑negotiables
- Mobile‑first only. If it does not work on mobile Safari, it does not ship.
- Keep `.row--tap` / `.row--active` semantics.
- Universal row primitive is `card-line4` with `c4-a/b/c/d`.
- No competing button system.
- Share page must be **options list + preview**, not a single render.
- Feed tab is item‑first with nested tabs = food names.

### Data paths (must be exactly these)
- horses: `../../../schedule/data/latest/shell_horses.json`
- profiles: `../../../schedule/data/latest/shell_profiles.json`
- feed items: `../data/shell_feed_items.json`
- values: `../data/shell_values.json`

### Caching requirement
- IndexedDB 5‑day sliding TTL applies only to:
  - horses
  - profiles
- feed items + values are per‑app (do not share‑cache them across apps).

### Input behaviors (must implement)
#### Feed
- Detail tab: Feed
- Nested tabs (pillbar) = feed item names
- Inside item tab: render AM and PM lines as `card-line4 row--tap`.
- Tap targets:
  - tap `c4-c` toggles UOM Scoop↔Cup
  - tap `c4-d` toggles ration 0→½→1→1½→2→0
- Store numeric ration values (0,0.5,1,1.5,2). Render with ½ glyph.

#### Extras
- Nested tabs = supplement names
- One Mode line
- Tap `c4-d` cycles NONE→AM→PM→AM|PM→NONE

#### Hay
- Render four hay-cards: AM/MD/PM/NC
- Each card has lines using the same row primitive.

#### Info
- Implement color pills, gender toggle, and read‑only fields.

### Share behaviors (must implement)
- Share page shows option rows first (row-taps): Phone, Print, Wall, Copy.
- Selecting a row updates preview.
- Wall preview:
  - sticky horses left column
  - horizontal scrolling slot columns
  - slot cells contain slot-card
- Print:
  - use @media print + @page size landscape
  - hide chrome
  - fit grid

### Styling requirements (must implement)
- Adopt the kitchen-sink tokens and primitives as the shell CSS baseline.
- Do not copy schedule CSS/pills as-is.
- Keep typography readable (Google-finance-adjacent): heavier weights, high contrast, muted still readable.

### Deliverables (exact)
1) Update `docs/tapactive/shell/docs/index.html` to use kitchen-sink primitives and classnames.
2) Update `docs/tapactive/shell/docs/app.js` to:
   - route Start/Horses/Plan/Share/Detail
   - load datasets from the exact URLs
   - implement Feed/Extras/Hay/Info input behaviors
   - implement Share options + wall + print
3) Update `docs/tapactive/shell/docs/README.md` to:
   - state shell scope
   - list dataset URLs
   - list UI primitives (card-line4 etc.)
   - include a regression checklist

### Regression checklist (must pass)
- App loads with no console errors
- Bottom nav renders
- Start → Horses → Plan → Share works
- Horse Detail tabs render
- Feed UOM toggle works (c4-c)
- Feed ration cycle works (c4-d)
- Extras mode cycle works (c4-d)
- Share options switch preview
- Wall grid sticky horses works on mobile
- Print landscape hides chrome

---

## Notes on print + Safari reality
- `@page { size: landscape; }` is supported in many browsers but Safari support can be inconsistent; still include it and keep a “Print Landscape” option that triggers print. (Reference: MDN @page size docs and Safari support discussions.)

