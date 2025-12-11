(() => {
  if (window.__sfxReplicaHelperLoaded) return;
  window.__sfxReplicaHelperLoaded = true;

  const state = { apiVersion: "6.5", forceRemove: true };
  let cachedBearerToken = null;

  function setStatus(text, type = "") {
    if (!text) return;
    const prefix = type ? `[SFX:${type}]` : "[SFX]";
    console.log(`${prefix} ${text}`);
    if (type === "error") {
      showToast(text, "error", "Error");
    }
  }

  function tryExtractTokenValue(raw) {
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw);
      const candidates = parsed && typeof parsed === "object" ? [parsed.access_token, parsed.accessToken, parsed.id_token, parsed.idToken, parsed.token] : [];
      const tokenCandidate = candidates.find((t) => typeof t === "string" && t.length > 20);
      if (tokenCandidate) return tokenCandidate;
    } catch (_) {
      /* ignore parse errors */
    }
    if (typeof raw === "string" && /[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+/.test(raw)) {
      return raw;
    }
    return null;
  }

  function findBearerToken() {
    if (cachedBearerToken) return cachedBearerToken;

    try {
      const tokenListRaw = localStorage.getItem("adal.token.keys");
      if (tokenListRaw) {
        const ids = tokenListRaw.split("|").filter(Boolean);
        for (const id of ids) {
          const raw = localStorage.getItem(`adal.access.token.key${id}`);
          const token = tryExtractTokenValue(raw);
          if (token) {
            cachedBearerToken = token;
            return token;
          }
        }
      }
    } catch (_) {
      /* ignore */
    }

    const storages = [localStorage, sessionStorage];
    for (const storage of storages) {
      try {
        for (let i = 0; i < storage.length; i += 1) {
          const key = storage.key(i);
          if (!key || !/token|idtoken|access/i.test(key)) continue;
          const value = storage.getItem(key);
          const token = tryExtractTokenValue(value);
          if (token) {
            cachedBearerToken = token;
            return token;
          }
        }
      } catch (_) {
        /* ignore */
      }
    }
    return null;
  }

  function parseIdsFromUrl() {
    const href = decodeURIComponent(window.location.href || "");
    const partitionMatch = href.match(/partition(?:id)?[=\\/](?<pid>[0-9a-fA-F-]{32,36})/i);
    const replicaMatch = href.match(/replica[=\\/](?<rid>[0-9a-zA-Z-]+)/i);
    return {
      partitionId: partitionMatch && partitionMatch.groups ? partitionMatch.groups.pid : null,
      replicaId: replicaMatch && replicaMatch.groups ? replicaMatch.groups.rid : null
    };
  }

  function getCurrentRouteIds() {
    return parseIdsFromUrl();
  }

  function guessNodeNameFromPage() {
    const link = document.querySelector('a[href*="#/node/"]');
    if (link && link.textContent) return link.textContent.trim();
    const match = (document.body.textContent || "").match(/_vmss-[\w-]+_\d+/);
    return match ? match[0] : "";
  }

  function attemptSelectReplica(replicaId) {
    if (!replicaId) return false;
    const link = document.querySelector(`a[href*="/replica/${replicaId}"]`);
    if (link) {
      link.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
      setStatus(`Navigating to replica ${replicaId} to refresh context.`, "info");
      return true;
    }
    return false;
  }

  function parseIdsFromHref(href) {
    if (!href) return {};
    const decoded = decodeURIComponent(href);
    const pidMatch = decoded.match(/partition(?:id)?[=\\/](?<pid>[0-9a-fA-F-]{32,36})/i);
    const ridMatch = decoded.match(/replica[=\\/](?<rid>[0-9a-zA-Z-]+)/i);
    const appMatch = decoded.match(/\/app\/(?<appId>[^/]+)/i);
    return {
      partitionId: pidMatch && pidMatch.groups ? pidMatch.groups.pid : null,
      replicaId: ridMatch && ridMatch.groups ? ridMatch.groups.rid : null,
      applicationId: appMatch && appMatch.groups ? appMatch.groups.appId : null
    };
  }

  function extractIdsFromElement(el) {
    if (!el) return {};
    let found = {};
    const links = el.querySelectorAll("a[href]");
    links.forEach((a) => {
      if (found.partitionId && found.replicaId) return;
      const ids = parseIdsFromHref(a.getAttribute("href"));
      found = { ...found, ...ids };
    });
    return found;
  }

  function normalizeApplicationId(raw) {
    if (!raw) return "";
    let val = decodeURIComponent(raw.trim());
    if (val.toLowerCase().startsWith("fabric:/")) {
      val = val.slice("fabric:/".length);
    }
    val = val.replace(/^\/+/, "");
    if (val.includes("/")) {
      val = val.replace(/\//g, "~");
    }
    return val;
  }

  function isAppUpgradeContext() {
    const href = window.location.href || "";
    if (/upgrade/i.test(href)) return true;
    const tabLink = Array.from(document.querySelectorAll("a")).some((a) =>
      (a.textContent || "").toLowerCase().includes("upgrade")
    );
    if (tabLink) return true;
    const text = document.body ? document.body.textContent || "" : "";
    return /upgrade state|rollingforward|upgrading|rollback/i.test(text);
  }

  function showToast(message, type = "info", title = "") {
    const container = document.querySelector("app-toast-container") || document.body;
    const toast = document.createElement("div");
    const variant =
      type === "error" ? "bg-danger" : type === "success" ? "bg-success" : type === "warning" ? "bg-warning" : "bg-info";
    toast.className = `toast show ${variant}`;
    toast.setAttribute("role", "alert");
    toast.style.margin = "0.25rem";
    toast.style.minWidth = "260px";

    const header = document.createElement("div");
    header.className = "toast-header";
    const strong = document.createElement("strong");
    strong.className = "me-auto";
    strong.textContent = title || type;
    const closeBtn = document.createElement("button");
    closeBtn.type = "button";
    closeBtn.className = "btn-close";
    closeBtn.setAttribute("aria-label", "Close");
    closeBtn.addEventListener("click", () => toast.remove());
    header.appendChild(strong);
    header.appendChild(closeBtn);

    const body = document.createElement("div");
    body.className = "toast-body";
    body.textContent = message;

    toast.appendChild(header);
    toast.appendChild(body);

    container.appendChild(toast);
    setTimeout(() => toast.remove(), 6000);
  }

  async function deleteReplica(partitionId, replicaId, options) {
    const { nodeName, apiVersion, forceRemove } = options;
    const base = `${window.location.protocol}//${window.location.host}`;
    const path = `/Nodes/${encodeURIComponent(nodeName)}/$/GetPartitions/${encodeURIComponent(
      partitionId
    )}/$/GetReplicas/${encodeURIComponent(replicaId)}/$/Delete`;
    const url = new URL(path, base);
    url.searchParams.set("api-version", apiVersion || "6.5");
    if (forceRemove !== undefined) {
      url.searchParams.set("ForceRemove", String(!!forceRemove));
    }
    const bearer = findBearerToken();
    setStatus(`Deleting replica ${replicaId} on ${nodeName}...`);
    const resp = await fetch(url.toString(), {
      method: "POST",
      credentials: "include",
      headers: {
        Accept: "application/json",
        ...(bearer ? { Authorization: `Bearer ${bearer}` } : {})
      }
    });
    if (!resp.ok) {
      const body = await resp.text().catch(() => "");
      throw new Error(`Request failed (${resp.status}): ${body || resp.statusText}`);
    }
    setStatus(`Replica ${replicaId} delete requested.`, "success");
  }

  async function rollbackApplication(appId, options) {
    const { apiVersion, timeout } = options;
    const normalizedAppId = normalizeApplicationId(appId);
    if (!normalizedAppId) {
      throw new Error("Missing application id for rollback.");
    }
    const base = `${window.location.protocol}//${window.location.host}`;
    const path = `/Applications/${encodeURIComponent(normalizedAppId)}/$/RollbackUpgrade`;
    const url = new URL(path, base);
    url.searchParams.set("api-version", apiVersion || "6.0");
    if (timeout) {
      url.searchParams.set("timeout", String(timeout));
    }
    const bearer = findBearerToken();
    setStatus(`Rolling back application ${normalizedAppId}...`);
    const resp = await fetch(url.toString(), {
      method: "POST",
      credentials: "include",
      headers: {
        Accept: "application/json",
        ...(bearer ? { Authorization: `Bearer ${bearer}` } : {})
      }
    });
    if (!resp.ok) {
      const body = await resp.text().catch(() => "");
      throw new Error(`Rollback failed (${resp.status}): ${body || resp.statusText}`);
    }
    setStatus(`Rollback requested for ${appId}.`, "success");
  }

  function validate(partitionId, replicaId, nodeName) {
    if (!partitionId) {
      setStatus("Partition id is required.", "error");
      return false;
    }
    if (!replicaId) {
      setStatus("Replica id is required.", "error");
      return false;
    }
    if (!nodeName) {
      setStatus("Node name is required.", "error");
      return false;
    }
    return true;
  }

  function confirmDeletion(partitionId, replicaId, nodeName, forceRemove) {
    const apiVersion = state.apiVersion || "6.5";
    const forceFlag = forceRemove ? "Force Delete Replica" : "Delete Replica";
    const msg = `${forceFlag}\nReplica: ${replicaId}\nPartition: ${partitionId}\nNode: ${nodeName}\napi-version: ${apiVersion}`;
    return window.confirm(msg);
  }

  function extractReplicaId(cell) {
    const text = (cell.textContent || "").trim();
    if (!text) return null;
    if (/^[0-9]+$/.test(text)) return text;
    const guid = text.match(/[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/);
    return guid ? guid[0] : null;
  }

  function tryAttachInlineButtons() {
    const { partitionId: routePid } = getCurrentRouteIds();
    if (!routePid) return;
    const tables = Array.from(document.querySelectorAll("table")).filter((t) => !t.dataset.sfxReplicaAugmented);
    tables.forEach((table) => {
      const headers = Array.from(table.querySelectorAll("th")).map((h) => (h.textContent || "").trim().toLowerCase());
      const looksLikeReplicaTable = headers.some((h) => h.includes("replica")) && headers.some((h) => h.includes("id"));
      if (!looksLikeReplicaTable) return;
      const nodeColumnIndex = headers.findIndex((h) => h.includes("node"));
      table.dataset.sfxReplicaAugmented = "1";
      const headerRow = table.querySelector("tr");
      if (headerRow) {
        const th = document.createElement("th");
        th.textContent = "Delete";
        headerRow.appendChild(th);
      }
      const rows = Array.from(table.querySelectorAll("tr")).slice(1);
      rows.forEach((row) => {
        if (row.querySelector(".sfx-replica-delete-btn")) return;
        const cells = row.querySelectorAll("td");
        if (!cells || !cells.length) return;
        const replicaId = extractReplicaId(cells[0]);
        if (!replicaId) return;
        const nodeName = nodeColumnIndex >= 0 && cells[nodeColumnIndex] ? (cells[nodeColumnIndex].textContent || "").trim() : "";
        const btnCell = document.createElement("td");
        const makeBtn = (label, forceRemoveFlag) => {
          const btn = document.createElement("button");
          btn.className = "simple-button";
          btn.textContent = label;
          btn.title = `${label} ${replicaId}`;
          btn.dataset.replicaId = replicaId;
          if (nodeName) btn.dataset.nodeName = nodeName;
          btn.addEventListener("click", (ev) => {
            ev.stopPropagation();
            const { partitionId: routePidClick } = getCurrentRouteIds();
            const rid = btn.dataset.replicaId;
            const rowIds = extractIdsFromElement(row);
            const partitionId = routePidClick || rowIds.partitionId || routePid;
            const currentNode = btn.dataset.nodeName || guessNodeNameFromPage();
            if (!partitionId || !rid) {
              if (attemptSelectReplica(rid)) return;
            }
            if (!validate(partitionId, rid, currentNode)) return;
            const confirmed = confirmDeletion(partitionId, rid, currentNode, forceRemoveFlag);
            if (!confirmed) return;
            deleteReplica(partitionId, rid, { ...state, nodeName: currentNode, forceRemove: forceRemoveFlag }).catch(
              (err) => setStatus(err.message, "error")
            );
          });
          return btn;
        };
        btnCell.appendChild(makeBtn("Delete", false));
        btnCell.appendChild(makeBtn("Force Delete", true));
        row.appendChild(btnCell);
      });
    });
  }

  function attachActionDropdowns() {
    const menus = Array.from(document.querySelectorAll(".dropdown-menu")).filter((m) => !m.dataset.sfxReplicaMenuAugmented);
    menus.forEach((menu) => {
      const restartBtn = Array.from(menu.querySelectorAll("button, a")).find((b) =>
        (b.textContent || "").toLowerCase().includes("restart replica")
      );
      const deleteServiceBtn = Array.from(menu.querySelectorAll("button, a")).find((b) =>
        (b.textContent || "").toLowerCase().includes("delete application")
      );
      if (restartBtn && !menu.dataset.sfxReplicaMenuAugmented) {
        menu.dataset.sfxReplicaMenuAugmented = "1";
        const makeReplicaMenuBtn = (label, forceRemoveFlag) => {
          const btn = document.createElement("button");
          btn.textContent = label;
          btn.className = restartBtn.className || "dropdown-item simple-button";
          btn.addEventListener("click", (ev) => {
            ev.stopPropagation();
            let { partitionId: pid, replicaId: rid } = getCurrentRouteIds();
            if (!pid || !rid) {
              const link = rid ? document.querySelector(`a[href*="/replica/${rid}"]`) : null;
              const derived = link ? parseIdsFromHref(link.getAttribute("href")) : {};
              pid = pid || derived.partitionId;
              rid = rid || derived.replicaId;
            }
            const nodeName = guessNodeNameFromPage();
            if (!pid || !rid) {
              if (attemptSelectReplica(rid)) return;
            }
            if (!validate(pid, rid, nodeName)) return;
            const confirmed = confirmDeletion(pid, rid, nodeName, forceRemoveFlag);
            if (!confirmed) return;
            deleteReplica(pid, rid, { ...state, nodeName, forceRemove: forceRemoveFlag }).catch((err) =>
              setStatus(err.message, "error")
            );
          });
          return btn;
        };
        menu.appendChild(makeReplicaMenuBtn("Delete Replica", false));
        menu.appendChild(makeReplicaMenuBtn("Force Delete Replica", true));
      }

      if (deleteServiceBtn && !menu.dataset.sfxAppMenuAugmented && isAppUpgradeContext()) {
        menu.dataset.sfxAppMenuAugmented = "1";
        const rollbackBtn = document.createElement("button");
        rollbackBtn.textContent = "Rollback Application";
        rollbackBtn.className = deleteServiceBtn.className || "dropdown-item";
        rollbackBtn.addEventListener("click", (ev) => {
          ev.stopPropagation();
          let appId = parseIdsFromHref(window.location.href).applicationId;
          if (!appId) {
            const link = document.querySelector('a[href*="/app/"]');
            const derived = link ? parseIdsFromHref(link.getAttribute("href")) : {};
            appId = derived.applicationId;
          }
          if (!appId && menu.closest("[href]")) {
            const derived = parseIdsFromHref(menu.closest("[href]").getAttribute("href"));
            appId = derived.applicationId || appId;
          }
          if (!appId) {
            setStatus("Could not determine application id for rollback.", "error");
            return;
          }
          const normalized = normalizeApplicationId(appId);
          const confirmed = window.confirm(
            `Rollback application upgrade?\nApplication: ${normalized}\napi-version: ${state.apiVersion}`
          );
          if (!confirmed) return;
          rollbackApplication(normalized, { ...state }).catch((err) => setStatus(err.message, "error"));
        });
        menu.appendChild(rollbackBtn);
      }
    });
  }

  tryAttachInlineButtons();
  attachActionDropdowns();
  const observer = new MutationObserver(() => tryAttachInlineButtons());
  observer.observe(document.body, { childList: true, subtree: true });
  const dropdownObserver = new MutationObserver(() => attachActionDropdowns());
  dropdownObserver.observe(document.body, { childList: true, subtree: true });
})();
