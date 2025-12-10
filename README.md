# Service Fabric Explorer Firefox Helper

Firefox extension that injects a small helper into Service Fabric Explorer pages so you can delete replicas directly (with optional inline buttons on replica tables).

## Install (temporary)

### Firefox
1. Open `about:debugging#/runtime/this-firefox`.
2. Click **Load Temporary Add-on** and select `manifest.json` from this folder.

### Chromium/Chrome/Edge
1. Open `chrome://extensions` (or `edge://extensions`), enable **Developer mode**.
2. Click **Load unpacked** and select this folder.

## Use

1. Browse to your Service Fabric Explorer (e.g. `https://localhost:19080/Explorer`).
2. On replica tables, a **Delete / Force Delete** column is added. Buttons use the partition from the current route, the replica id from the row, and the node from the row (or page).
3. On replica details pages, the Actions dropdown gains **Delete Replica** and **Force Delete Replica** entries.
4. On application upgrade contexts, the Actions dropdown gains **Rollback Application** (uses `POST /Applications/{appId}/$/RollbackUpgrade?api-version=6.0`).
5. Confirmation dialogs show replica/partition/node (or application) before executing.

### Inline buttons

When a replica table is detected (headers contain both "Replica" and "Id"), a **Delete**/**Force Delete** column is added. If a "Node" column exists, the node name is auto-filled for that row. Clicking uses the current route’s partition id and row’s replica id.

## Notes

- Works on hosts matching `*://*:19080/*` and `*/Explorer*` URLs. Adjust matches in `manifest.json` if your explorer runs elsewhere.
- The call is sent to the same origin as the page, with `credentials: include`, so it reuses your SFX auth context.
- Keep this as a temporary add-on; remove when not needed.

## Packaging for teammates

- No build step is needed. Zip the files (`manifest.json`, `content-script.js`, optional `README.md`/icons) and share the archive.
- Firefox users can load the unpacked folder via `about:debugging`, Chromium users via `chrome://extensions` → **Load unpacked**.
- If you want a signed/packed extension, follow your org’s signing process or the Chrome Web Store/AMO flow; this repo is already MV3-compatible for Chromium.
