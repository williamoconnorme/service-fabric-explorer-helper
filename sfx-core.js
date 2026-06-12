(() => {
  const helper = (window.SfxHelper = window.SfxHelper || {});
  if (helper.coreLoaded) return;
  helper.coreLoaded = true;

  helper.state = helper.state || { apiVersion: "6.5", forceRemove: true };

  let cachedBearerToken = null;

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
      const candidates =
        parsed && typeof parsed === "object"
          ? [parsed.access_token, parsed.accessToken, parsed.id_token, parsed.idToken, parsed.token]
          : [];
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
    const nodeMatch = href.match(/\/node\/(?<nodeName>[^/?#]+)/i);
    const serviceMatch = href.match(/\/service\/(?<serviceId>[^/?#]+)/i);
    return {
      partitionId: partitionMatch && partitionMatch.groups ? partitionMatch.groups.pid : null,
      replicaId: replicaMatch && replicaMatch.groups ? replicaMatch.groups.rid : null,
      nodeName: nodeMatch && nodeMatch.groups ? nodeMatch.groups.nodeName : null,
      serviceId: serviceMatch && serviceMatch.groups ? serviceMatch.groups.serviceId : null
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
    const nodeMatch = decoded.match(/\/node\/(?<nodeName>[^/?#]+)/i);
    const serviceMatch = decoded.match(/\/service\/(?<serviceId>[^/?#]+)/i);
    return {
      partitionId: pidMatch && pidMatch.groups ? pidMatch.groups.pid : null,
      replicaId: ridMatch && ridMatch.groups ? ridMatch.groups.rid : null,
      applicationId: appMatch && appMatch.groups ? appMatch.groups.appId : null,
      nodeName: nodeMatch && nodeMatch.groups ? nodeMatch.groups.nodeName : null,
      serviceId: serviceMatch && serviceMatch.groups ? serviceMatch.groups.serviceId : null
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

  function normalizeServiceId(raw) {
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

  function parseOptionalInt(value) {
    if (value === undefined || value === null || value === "") return null;
    const n = Number(value);
    if (!Number.isFinite(n)) return null;
    return Math.trunc(n);
  }

  function parseOptionalBool(value) {
    if (typeof value === "boolean") return value;
    if (value === undefined || value === null || value === "") return null;
    const raw = String(value).trim().toLowerCase();
    if (["true", "1", "yes", "y"].includes(raw)) return true;
    if (["false", "0", "no", "n"].includes(raw)) return false;
    return null;
  }

  function generateOperationId() {
    if (window.crypto && typeof window.crypto.randomUUID === "function") {
      return window.crypto.randomUUID();
    }
    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (ch) => {
      const rand = Math.floor(Math.random() * 16);
      const val = ch === "x" ? rand : (rand & 0x3) | 0x8;
      return val.toString(16);
    });
  }

  function collectRouteServiceContext(menu) {
    const route = getCurrentRouteIds();
    const fromWindow = parseIdsFromHref(window.location.href);
    let serviceId = route.serviceId || fromWindow.serviceId || "";

    if (!serviceId) {
      const treeNode = menu && menu.closest("a[appselectednode], a.node");
      if (treeNode) {
        const linkHref = treeNode.getAttribute("href");
        if (linkHref) {
          const ids = parseIdsFromHref(linkHref);
          serviceId = serviceId || ids.serviceId || "";
        }
      }
    }

    if (!serviceId) {
      const row = menu && menu.closest(".self.hover-row");
      if (row) {
        const titledEls = Array.from(row.querySelectorAll("[title]"));
        const serviceTitleEl = titledEls.find((el) => {
          const title = (el.getAttribute("title") || "").trim();
          return /^fabric:\//i.test(title);
        });
        if (serviceTitleEl) {
          serviceId = serviceTitleEl.getAttribute("title") || "";
        }
      }
    }

    return {
      serviceId: normalizeServiceId(serviceId || "")
    };
  }

  function collectRoutePartitionContext(menu) {
    const serviceContext = collectRouteServiceContext(menu);
    let serviceId = serviceContext.serviceId || "";
    const route = getCurrentRouteIds();
    const fromWindow = parseIdsFromHref(window.location.href);
    let partitionId = route.partitionId || fromWindow.partitionId || "";

    if (!serviceId || !partitionId) {
      const treeNode = menu && menu.closest("a[appselectednode], a.node");
      if (treeNode) {
        const linkHref = treeNode.getAttribute("href");
        if (linkHref) {
          const ids = parseIdsFromHref(linkHref);
          serviceId = serviceId || ids.serviceId || "";
          partitionId = partitionId || ids.partitionId || "";
        }
        if (!partitionId) {
          const titleEls = Array.from(treeNode.querySelectorAll("[title]"));
          const guidEl = titleEls.find((el) =>
            /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i.test(el.getAttribute("title") || "")
          );
          if (guidEl) {
            const m = (guidEl.getAttribute("title") || "").match(
              /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i
            );
            partitionId = m ? m[0] : partitionId;
          }
        }
      }
    }

    return {
      partitionId: partitionId || "",
      serviceId
    };
  }

  Object.assign(helper, {
    showToast,
    setStatus,
    findBearerToken,
    parseIdsFromUrl,
    getCurrentRouteIds,
    guessNodeNameFromPage,
    attemptSelectReplica,
    parseIdsFromHref,
    extractIdsFromElement,
    normalizeApplicationId,
    normalizeServiceId,
    isAppUpgradeContext,
    parseOptionalInt,
    parseOptionalBool,
    generateOperationId,
    collectRouteServiceContext,
    collectRoutePartitionContext
  });
})();
