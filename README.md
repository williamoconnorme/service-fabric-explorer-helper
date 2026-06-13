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
3. On replica details pages, the Replica Actions dropdown gains **Delete Replica** and **Force Delete Replica** entries.
4. On application upgrade contexts, the Actions dropdown gains **Rollback Application** (uses `POST /Applications/{appId}/$/RollbackUpgrade?api-version=6.0`).
5. On service contexts, the Actions dropdown gains **Scale Service** and **Update Service**. Scale opens a stateful/stateless-specific modal and submits to `POST /Services/{serviceId}/$/Update?api-version=6.0`; Update opens a structured stateful/stateless form prepopulated with currently set values, only sends fields that remain set in the form, computes the required `Flags`, and submits to the same endpoint.
6. On node contexts, the Actions dropdown gains **Create Repair Task** (uses `POST /$/CreateRepairTask?api-version=6.0`).
7. Confirmation dialogs show replica/partition/node/service (or application/repair-task details) before executing.
8. Repair task creation opens an SFX-styled modal with input fields for `TaskId`, `Action`, and target nodes, then posts a Node-targeted payload with state `Created`.
9. On `#/repairtasks`, each repair job row gets **Force Approve**, **Cancel Repair**, **Delete Repair**, **Update State**, and **Health Policy** buttons.
10. Cancel sends `TaskId`, `Version` (from expanded raw repair job when available, else `0`), and sets `RequestAbort=true` automatically for `Executing`/`Restoring` tasks.
11. Delete uses `POST /$/DeleteRepairTask?api-version=6.0` with `TaskId` + `Version`, and is enabled only when the repair task state is `Completed`.
12. **Update State** and **Health Policy** use the expanded raw repair job payload when available, so expanding a repair-task row exposes the most complete editing surface.
13. In partition/service contexts, the Actions dropdown gains direct partition recovery actions with no input form.
14. The extension infers ids from the selected UI node and adds **Recover Partition**, **Reset Partition Load**, **Move Primary Replica**, **Move Secondary Replica**, **Move Instance**, **Backup Partition**, **Restore Partition**, **Recover Service Partitions**, **Recover System Partitions**, **Recover All Partitions**, **Start Data Loss**, **Start Partition Restart**, and progress lookups for restart/backup/restore when the required context is available.
15. **Start Data Loss** always uses `DataLossMode=FullDataLoss` and auto-generates an `OperationId`.
16. **Move Primary Replica**, **Move Secondary Replica**, **Move Instance**, **Backup Partition**, **Restore Partition**, and **Start Partition Restart** open input modals and call the corresponding Service Fabric REST APIs.
17. On selected partition rows in the explorer tree, the extension injects a tree-view Actions toggle so those partition commands are available directly from the partition node.

### Inline buttons

When a replica table is detected (headers contain both "Replica" and "Id"), a **Delete**/**Force Delete** column is added. If a "Node" column exists, the node name is auto-filled for that row. Clicking uses the current route’s partition id and row’s replica id.

## Notes

- Works on hosts matching `*://*:19080/*` and `*/Explorer*` URLs. Adjust matches in `manifest.json` if your explorer runs elsewhere.
- The call is sent to the same origin as the page, with `credentials: include`, so it reuses your SFX auth context.
- Keep this as a temporary add-on; remove when not needed.

## Packaging for teammates

- No build step is needed, but your archive must include all files referenced by `manifest.json`.
- Required files: `manifest.json`, `content-script.js`, `sfx-core.js`, `sfx-modal.js`, `sfx-api.js`, `sfx-ui.js`.
- Optional files: `README.md`, `PRIVACY-POLICY.md`, icons.
- Firefox users can load the unpacked folder via `about:debugging`, Chromium users via `chrome://extensions` → **Load unpacked**.
- If you want a signed/packed extension, follow your org’s signing process or the Chrome Web Store/AMO flow; this repo is already MV3-compatible for Chromium.

### Firefox upload package (recommended)

- Use the GitHub Actions build artifacts/releases produced by `.github/workflows/build-and-release.yml`.
- The workflow generates `service-fabric-explorer-helper-v<version>.xpi` with the required root layout and scripts.

## Privacy Policy

See `PRIVACY-POLICY.md`. In short: the extension never collects, stores, or transmits any user data.
