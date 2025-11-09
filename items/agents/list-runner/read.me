## 🐎 List-Runner

**List-Runner** is a self-contained JSON-based packing manager for equestrian shows.  
It tracks weekly tack, equipment, and feed lists, records packing progress, and archives shows automatically.  
No database, no login — everything runs from local JSON files.

---

### 📁 Folder Structure

items/agents/list-runner/
├─ expeditor.js # Main coordinator script
├─ state.json # Current week and mode
│
├─ lists/ # Active data and registries
│ ├─ list_registry.json
│ ├─ item_registry.json
│ ├─ default_list.json
│ ├─ started_lists.json
│ ├─ archived_lists.json
│ └─ index.json
│
├─ logs/ # System activity and backups
│ ├─ updates.json
│ └─ backups/
│ └─ .keep
│
├─ shows/ # Show calendar
│ └─ show_schedule.json
│
└─ users/ # Device registry
└─ user_registry.json
---

### ⚙️ Commands

| Command | Description |
|----------|-------------|
| `node expeditor.js update` | Rebuilds the index and performs a daily backup |
| `node expeditor.js serve`  | Starts a small web server with health endpoints |

---

### 🌐 Endpoints

| Endpoint | Returns |
|-----------|----------|
| `/items/agents/health` | Full system status (last update, active week, pending packs, etc.) |
| `/items/agents/health/compact` | Minimal heartbeat for mobile clients |

Default port: **8080**

---

### 🗂️ How It Works

1. **Lists & Items** — All data lives in `lists/` as JSON files.  
2. **Packing Flow** — Mobile voice UI updates `started_lists.json` as items are packed.  
3. **Index Rebuild** — `expeditor.js` computes totals in `index.json`.  
4. **Backups** — One index snapshot per day stored in `logs/backups/`.  
5. **Auto-Archive** — When every item is packed `to_bring_home`, the week moves to `archived_lists.json`.

---

### 📡 Device Identification

- Each mobile device has a generated `device_id` stored in `state.json` and logged in every update.
- No login or authentication required.

---

### 🔒 Git Notes

To preserve directory structure in Git:
- Include a `.keep` file in empty `backups/`.
- Commit all JSON starter files; `expeditor.js` manages changes automatically.

---

### 🧩 Requirements

- Node.js ≥ 18
- No npm dependencies
- Local filesystem read/write access

---

### ✅ Typical Setup

```bash
cd items/agents/list-runner
node expeditor.js update   # Build index + backup
node expeditor.js serve    # Start health endpoints
