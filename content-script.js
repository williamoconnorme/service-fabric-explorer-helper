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

  function ensureActionModalStyles() {
    const styleId = "sfx-helper-action-modal-styles";
    if (document.getElementById(styleId)) return;
    const style = document.createElement("style");
    style.id = styleId;
    style.textContent = `
      .sfx-helper-modal-backdrop {
        position: fixed;
        inset: 0;
        background: rgba(0, 0, 0, 0.35);
        z-index: 999998;
      }
      .sfx-helper-modal-host {
        position: fixed;
        inset: 0;
        z-index: 999999;
        display: flex;
        align-items: center;
        justify-content: center;
        pointer-events: none;
      }
      .sfx-helper-modal-host mat-dialog-container {
        pointer-events: auto;
        max-width: min(680px, 92vw);
        width: 100%;
      }
      .sfx-helper-modal-host .action-modal {
        display: flex;
        flex-direction: column;
        gap: 12px;
      }
      .sfx-helper-modal-host .modal-body .field-wrap {
        display: flex;
        flex-direction: column;
        gap: 6px;
        margin-bottom: 10px;
      }
      .sfx-helper-modal-host .modal-body .field-wrap label {
        font-weight: 600;
      }
      .sfx-helper-modal-host .modal-body .field-wrap input {
        width: 100%;
      }
      .sfx-helper-modal-host .modal-message {
        white-space: pre-wrap;
        line-height: 1.35;
      }
      .sfx-helper-modal-host .modal-footer {
        display: flex;
        gap: 8px;
        justify-content: flex-end;
      }
      .sfx-tree-action-host .dropdown {
        position: relative;
      }
      .sfx-tree-action-host .dropdown-menu.show {
        display: block;
      }
    `;
    document.head.appendChild(style);
  }

  function openActionModal(config) {
    ensureActionModalStyles();
    const {
      title = "Action",
      submitLabel = "Submit",
      cancelLabel = "Cancel",
      fields = [],
      message = ""
    } = config || {};

    return new Promise((resolve) => {
      const backdrop = document.createElement("div");
      backdrop.className = "sfx-helper-modal-backdrop";

      const host = document.createElement("div");
      host.className = "sfx-helper-modal-host";

      const hiddenStart = document.createElement("div");
      hiddenStart.tabIndex = 0;
      hiddenStart.className = "cdk-visually-hidden cdk-focus-trap-anchor";
      hiddenStart.setAttribute("aria-hidden", "true");

      const container = document.createElement("mat-dialog-container");
      container.tabIndex = -1;
      container.className = "mat-mdc-dialog-container mdc-dialog cdk-dialog-container mdc-dialog--open _mat-animation-noopable";
      container.setAttribute("role", "dialog");
      container.setAttribute("aria-modal", "true");

      const frame = document.createElement("div");
      frame.className = "mdc-dialog__container";
      const surface = document.createElement("div");
      surface.className = "mat-mdc-dialog-surface mdc-dialog__surface";

      const actionDialog = document.createElement("app-action-dialog");
      const form = document.createElement("form");
      form.noValidate = true;
      form.className = "action-modal ng-untouched ng-pristine ng-valid";

      const header = document.createElement("div");
      header.className = "modal-header";
      const h1 = document.createElement("h1");
      h1.className = "modal-title";
      h1.textContent = title;
      header.appendChild(h1);

      const body = document.createElement("div");
      body.className = "modal-body";

      if (message) {
        const msg = document.createElement("div");
        msg.className = "modal-message";
        msg.textContent = message;
        body.appendChild(msg);
      }

      const inputRefs = [];
      fields.forEach((field) => {
        const wrap = document.createElement("div");
        wrap.className = "field-wrap";
        const label = document.createElement("label");
        label.textContent = field.label || field.name;
        let input = null;
        const fieldType = field.type || "text";
        if (fieldType === "select") {
          input = document.createElement("select");
          input.className = "input-flat ng-untouched ng-pristine ng-valid";
          input.name = field.name;
          const options = Array.isArray(field.options) ? field.options : [];
          options.forEach((opt) => {
            const option = document.createElement("option");
            option.value = String(opt.value);
            option.textContent = opt.label || String(opt.value);
            if (String(field.value || "") === option.value) {
              option.selected = true;
            }
            input.appendChild(option);
          });
        } else if (fieldType === "checkbox") {
          input = document.createElement("input");
          input.type = "checkbox";
          input.className = "ng-untouched ng-pristine ng-valid";
          input.name = field.name;
          input.checked = !!field.value;
        } else if (fieldType === "textarea") {
          input = document.createElement("textarea");
          input.className = "input-flat ng-untouched ng-pristine ng-valid";
          input.name = field.name;
          input.value = field.value || "";
          input.placeholder = field.placeholder || "";
          input.rows = field.rows || 5;
          input.style.width = "100%";
        } else {
          input = document.createElement("input");
          input.type = fieldType;
          input.className = "input-flat ng-untouched ng-pristine ng-valid";
          input.name = field.name;
          input.value = field.value || "";
          input.placeholder = field.placeholder || "";
        }
        if (field.required) input.setAttribute("required", "required");
        wrap.appendChild(label);
        wrap.appendChild(input);
        body.appendChild(wrap);
        inputRefs.push({ input, required: !!field.required, name: field.name, type: fieldType });
      });

      const footer = document.createElement("div");
      footer.className = "modal-footer";
      const submitBtn = document.createElement("button");
      submitBtn.type = "submit";
      submitBtn.className = "solid-button blue";
      submitBtn.textContent = submitLabel;
      const cancelBtn = document.createElement("button");
      cancelBtn.type = "button";
      cancelBtn.className = "flat-button";
      cancelBtn.textContent = cancelLabel;
      footer.appendChild(submitBtn);
      footer.appendChild(cancelBtn);

      form.appendChild(header);
      form.appendChild(body);
      form.appendChild(footer);
      actionDialog.appendChild(form);
      surface.appendChild(actionDialog);
      frame.appendChild(surface);
      container.appendChild(frame);

      const hiddenEnd = document.createElement("div");
      hiddenEnd.tabIndex = 0;
      hiddenEnd.className = "cdk-visually-hidden cdk-focus-trap-anchor";
      hiddenEnd.setAttribute("aria-hidden", "true");

      host.appendChild(hiddenStart);
      host.appendChild(container);
      host.appendChild(hiddenEnd);

      const remove = () => {
        document.removeEventListener("keydown", onKeyDown, true);
        backdrop.remove();
        host.remove();
      };

      const close = (result) => {
        remove();
        resolve(result);
      };

      const validate = () => {
        const requiredValid = inputRefs.every((item) => {
          if (!item.required) return true;
          if (item.type === "checkbox") return !!item.input.checked;
          return !!String(item.input.value || "").trim();
        });
        submitBtn.disabled = !requiredValid;
      };

      const onKeyDown = (ev) => {
        if (ev.key === "Escape") {
          ev.preventDefault();
          close(null);
        }
      };

      inputRefs.forEach((item) => {
        item.input.addEventListener("input", validate);
        item.input.addEventListener("change", validate);
      });

      form.addEventListener("submit", (ev) => {
        ev.preventDefault();
        validate();
        if (submitBtn.disabled) return;
        const values = {};
        inputRefs.forEach((item) => {
          if (item.type === "checkbox") {
            values[item.name] = !!item.input.checked;
            return;
          }
          values[item.name] = item.input.value;
        });
        close(values);
      });
      cancelBtn.addEventListener("click", () => close(null));
      backdrop.addEventListener("click", () => close(null));
      document.addEventListener("keydown", onKeyDown, true);

      document.body.appendChild(backdrop);
      document.body.appendChild(host);
      validate();
      const first = inputRefs[0] ? inputRefs[0].input : null;
      if (first) {
        first.focus();
        if (typeof first.select === "function") {
          first.select();
        }
      } else {
        container.focus();
      }
    });
  }

  async function confirmWithActionModal(title, message, submitLabel) {
    const result = await openActionModal({
      title,
      submitLabel,
      cancelLabel: "Cancel",
      message
    });
    return !!result;
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

  async function postSfAction(path, options = {}) {
    const base = `${window.location.protocol}//${window.location.host}`;
    const url = new URL(path, base);
    const apiVersion = options.apiVersion || "6.0";
    url.searchParams.set("api-version", apiVersion);
    if (options.query && typeof options.query === "object") {
      Object.entries(options.query).forEach(([k, v]) => {
        if (v === undefined || v === null || v === "") return;
        url.searchParams.set(k, String(v));
      });
    }

    const bearer = findBearerToken();
    const headers = {
      Accept: "application/json",
      ...(bearer ? { Authorization: `Bearer ${bearer}` } : {})
    };
    if (options.body !== undefined) {
      headers["Content-Type"] = "application/json";
    }

    const resp = await fetch(url.toString(), {
      method: "POST",
      credentials: "include",
      headers,
      ...(options.body !== undefined ? { body: JSON.stringify(options.body) } : {})
    });
    if (!resp.ok) {
      const body = await resp.text().catch(() => "");
      throw new Error(`Request failed (${resp.status}): ${body || resp.statusText}`);
    }
  }

  async function getSfJson(path, options = {}) {
    const base = `${window.location.protocol}//${window.location.host}`;
    const url = new URL(path, base);
    const apiVersion = options.apiVersion || "6.0";
    url.searchParams.set("api-version", apiVersion);
    if (options.query && typeof options.query === "object") {
      Object.entries(options.query).forEach(([k, v]) => {
        if (v === undefined || v === null || v === "") return;
        url.searchParams.set(k, String(v));
      });
    }

    const bearer = findBearerToken();
    const resp = await fetch(url.toString(), {
      method: "GET",
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
    return resp.json();
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
          const guidEl = titleEls.find((el) => /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i.test(el.getAttribute("title") || ""));
          if (guidEl) {
            const m = (guidEl.getAttribute("title") || "").match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
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

  async function getServiceDescription(serviceId, options = {}) {
    const normalizedServiceId = normalizeServiceId(serviceId);
    if (!normalizedServiceId) {
      throw new Error("Missing service id.");
    }
    return getSfJson(`/Services/${encodeURIComponent(normalizedServiceId)}/$/GetDescription`, {
      apiVersion: options.apiVersion || "6.0",
      query: { timeout: options.timeout }
    });
  }

  async function updateServiceScale(serviceId, update, options = {}) {
    const normalizedServiceId = normalizeServiceId(serviceId);
    if (!normalizedServiceId) {
      throw new Error("Missing service id for scale operation.");
    }
    const body = {
      ServiceKind: update.serviceKind,
      Flags: String(update.flags)
    };
    if (update.serviceKind === "Stateful") {
      body.TargetReplicaSetSize = update.targetReplicaSetSize;
      if (update.minReplicaSetSize !== null && update.minReplicaSetSize !== undefined) {
        body.MinReplicaSetSize = update.minReplicaSetSize;
      }
    } else {
      body.InstanceCount = update.instanceCount;
    }

    setStatus(`Scaling service ${normalizedServiceId}...`);
    await postSfAction(`/Services/${encodeURIComponent(normalizedServiceId)}/$/Update`, {
      apiVersion: options.apiVersion || "6.0",
      query: { timeout: options.timeout },
      body
    });
    setStatus(`Scale requested for service ${normalizedServiceId}.`, "success");
  }

  async function promptScaleServiceInput(serviceId, serviceDescription) {
    const serviceKind = String(
      serviceDescription.ServiceKind || serviceDescription.serviceKind || serviceDescription.Kind || ""
    ).trim();
    if (serviceKind !== "Stateful" && serviceKind !== "Stateless") {
      throw new Error(`Unsupported service kind for scaling: ${serviceKind || "unknown"}`);
    }

    const fields =
      serviceKind === "Stateful"
        ? [
            {
              name: "targetReplicaSetSize",
              label: "Target Replica Set Size",
              type: "number",
              value: String(serviceDescription.TargetReplicaSetSize ?? ""),
              required: true
            },
            {
              name: "minReplicaSetSize",
              label: "Min Replica Set Size",
              type: "number",
              value: String(serviceDescription.MinReplicaSetSize ?? ""),
              required: true
            },
            { name: "timeout", label: "timeout (seconds, optional)", type: "number", value: "", required: false }
          ]
        : [
            {
              name: "instanceCount",
              label: "Instance Count",
              type: "number",
              value: String(serviceDescription.InstanceCount ?? ""),
              required: true
            },
            { name: "timeout", label: "timeout (seconds, optional)", type: "number", value: "", required: false }
          ];

    const values = await openActionModal({
      title: `Scale ${serviceKind} Service`,
      submitLabel: "Scale Service",
      cancelLabel: "Cancel",
      message: `ServiceId: ${serviceId}`,
      fields
    });
    if (!values) return null;

    const timeout = parseOptionalInt(values.timeout);
    if (serviceKind === "Stateful") {
      const targetReplicaSetSize = parseOptionalInt(values.targetReplicaSetSize);
      const minReplicaSetSize = parseOptionalInt(values.minReplicaSetSize);
      if (targetReplicaSetSize === null || targetReplicaSetSize < 1) {
        throw new Error("TargetReplicaSetSize must be a positive integer.");
      }
      if (minReplicaSetSize === null || minReplicaSetSize < 1) {
        throw new Error("MinReplicaSetSize must be a positive integer.");
      }
      if (minReplicaSetSize > targetReplicaSetSize) {
        throw new Error("MinReplicaSetSize cannot be greater than TargetReplicaSetSize.");
      }
      return {
        serviceKind,
        timeout,
        targetReplicaSetSize,
        minReplicaSetSize,
        flags: 1 | 16
      };
    }

    const instanceCount = parseOptionalInt(values.instanceCount);
    if (instanceCount === null || instanceCount < -1 || instanceCount === 0) {
      throw new Error("InstanceCount must be -1 or a positive integer.");
    }
    return {
      serviceKind,
      timeout,
      instanceCount,
      flags: 1
    };
  }

  async function promptMovePrimaryReplicaInput(partitionId) {
    const values = await openActionModal({
      title: "Move Primary Replica",
      submitLabel: "Move Primary Replica",
      cancelLabel: "Cancel",
      message: `PartitionId: ${partitionId}`,
      fields: [
        {
          name: "nodeName",
          label: "Target Node Name (optional)",
          value: "",
          required: false
        },
        {
          name: "ignoreConstraints",
          label: "Ignore Constraints",
          type: "checkbox",
          value: false,
          required: false
        },
        {
          name: "timeout",
          label: "timeout (seconds, optional)",
          type: "number",
          value: "",
          required: false
        }
      ]
    });
    if (!values) return null;
    return {
      action: "MovePrimaryReplica",
      partitionId,
      nodeName: String(values.nodeName || "").trim(),
      force: !!values.ignoreConstraints,
      timeout: parseOptionalInt(values.timeout)
    };
  }

  async function promptMoveSecondaryReplicaInput(partitionId) {
    const values = await openActionModal({
      title: "Move Secondary Replica",
      submitLabel: "Move Secondary Replica",
      cancelLabel: "Cancel",
      message: `PartitionId: ${partitionId}`,
      fields: [
        {
          name: "currentNodeName",
          label: "Current Node Name",
          value: "",
          required: true
        },
        {
          name: "newNodeName",
          label: "New Node Name (optional)",
          value: "",
          required: false
        },
        {
          name: "ignoreConstraints",
          label: "Ignore Constraints",
          type: "checkbox",
          value: false,
          required: false
        },
        {
          name: "timeout",
          label: "timeout (seconds, optional)",
          type: "number",
          value: "",
          required: false
        }
      ]
    });
    if (!values) return null;
    return {
      action: "MoveSecondaryReplica",
      partitionId,
      currentNodeName: String(values.currentNodeName || "").trim(),
      newNodeName: String(values.newNodeName || "").trim(),
      force: !!values.ignoreConstraints,
      timeout: parseOptionalInt(values.timeout)
    };
  }

  async function runPartitionAction(input) {
    const action = String(input.action || "").trim();
    const partitionId = String(input.partitionId || "").trim();
    const serviceId = normalizeServiceId(input.serviceId || "");
    const timeout = parseOptionalInt(input.timeout);
    const force = !!input.force;

    if (
      [
        "RecoverPartition",
        "ResetPartitionLoad",
        "StartDataLoss",
        "MovePrimaryReplica",
        "MoveSecondaryReplica",
        "ReportPartitionHealth"
      ].includes(action) &&
      !partitionId
    ) {
      throw new Error(`PartitionId is required for ${action}.`);
    }
    if (["MoveInstance", "MoveAuxiliaryReplica"].includes(action) && (!partitionId || !serviceId)) {
      throw new Error(`${action} requires both ServiceId and PartitionId.`);
    }
    if (action === "StartDataLoss" && (!partitionId || !serviceId)) {
      throw new Error("StartDataLoss requires both ServiceId and PartitionId.");
    }

    if (action === "RecoverPartition") {
      setStatus(`Recovering partition ${partitionId}...`);
      await postSfAction(`/Partitions/${encodeURIComponent(partitionId)}/$/Recover`, {
        apiVersion: "6.0",
        query: { timeout }
      });
      setStatus(`Recover requested for partition ${partitionId}.`, "success");
      return;
    }
    if (action === "ResetPartitionLoad") {
      setStatus(`Resetting load for partition ${partitionId}...`);
      await postSfAction(`/Partitions/${encodeURIComponent(partitionId)}/$/ResetLoad`, {
        apiVersion: "6.0",
        query: { timeout }
      });
      setStatus(`Reset load requested for partition ${partitionId}.`, "success");
      return;
    }
    if (action === "StartDataLoss") {
      const operationId = String(input.operationId || "").trim() || generateOperationId();
      setStatus(`Starting data loss for service ${serviceId}, partition ${partitionId}...`);
      await postSfAction(
        `/Faults/Services/${encodeURIComponent(serviceId)}/$/GetPartitions/${encodeURIComponent(
          partitionId
        )}/$/StartDataLoss`,
        {
          apiVersion: "6.0",
          query: {
            OperationId: operationId,
            DataLossMode: "FullDataLoss",
            timeout
          }
        }
      );
      setStatus(`StartDataLoss accepted for partition ${partitionId}. OperationId: ${operationId}`, "success");
      return;
    }
    if (action === "RecoverServicePartitions") {
      if (!serviceId) throw new Error("ServiceId is required for RecoverServicePartitions.");
      setStatus(`Recovering all partitions for service ${serviceId}...`);
      await postSfAction(`/Services/${encodeURIComponent(serviceId)}/$/GetPartitions/$/Recover`, {
        apiVersion: "6.0",
        query: { timeout }
      });
      setStatus(`Recover requested for all partitions of ${serviceId}.`, "success");
      return;
    }
    if (action === "RecoverSystemPartitions") {
      setStatus("Recovering all system service partitions...");
      await postSfAction("/$/RecoverSystemPartitions", { apiVersion: "6.0", query: { timeout } });
      setStatus("Recover requested for system service partitions.", "success");
      return;
    }
    if (action === "RecoverAllPartitions") {
      setStatus("Recovering all service partitions...");
      await postSfAction("/$/RecoverAllPartitions", { apiVersion: "6.0", query: { timeout } });
      setStatus("Recover requested for all service partitions.", "success");
      return;
    }
    if (action === "MovePrimaryReplica") {
      const nodeName = String(input.nodeName || "").trim();
      setStatus(
        nodeName
          ? `Moving primary replica for ${partitionId} to ${nodeName}...`
          : `Moving primary replica for ${partitionId} to a random eligible node...`
      );
      await postSfAction(`/Partitions/${encodeURIComponent(partitionId)}/$/MovePrimaryReplica`, {
        apiVersion: "6.5",
        query: { NodeName: nodeName, IgnoreConstraints: force, timeout }
      });
      setStatus(`MovePrimaryReplica requested for partition ${partitionId}.`, "success");
      return;
    }
    if (action === "MoveSecondaryReplica") {
      const currentNodeName = String(input.currentNodeName || "").trim();
      const newNodeName = String(input.newNodeName || "").trim();
      if (!currentNodeName) {
        throw new Error("CurrentNodeName is required for MoveSecondaryReplica.");
      }
      setStatus(
        newNodeName
          ? `Moving secondary replica for ${partitionId} from ${currentNodeName} to ${newNodeName}...`
          : `Moving secondary replica for ${partitionId} from ${currentNodeName} to a random eligible node...`
      );
      await postSfAction(`/Partitions/${encodeURIComponent(partitionId)}/$/MoveSecondaryReplica`, {
        apiVersion: "6.5",
        query: {
          CurrentNodeName: currentNodeName,
          NewNodeName: newNodeName,
          IgnoreConstraints: force,
          timeout
        }
      });
      setStatus(`MoveSecondaryReplica requested for partition ${partitionId}.`, "success");
      return;
    }
    if (action === "MoveInstance") {
      const currentNodeName = String(input.currentNodeName || "").trim();
      const newNodeName = String(input.newNodeName || "").trim();
      if (!currentNodeName || !newNodeName) {
        throw new Error("CurrentNodeName and NewNodeName are required for MoveInstance.");
      }
      setStatus(`Moving instance for ${serviceId}/${partitionId} from ${currentNodeName} to ${newNodeName}...`);
      await postSfAction(
        `/Services/${encodeURIComponent(serviceId)}/$/GetPartitions/${encodeURIComponent(partitionId)}/$/MoveInstance`,
        {
          apiVersion: "8.0",
          query: {
            CurrentNodeName: currentNodeName,
            NewNodeName: newNodeName,
            IgnoreConstraints: force,
            timeout
          }
        }
      );
      setStatus(`MoveInstance requested for partition ${partitionId}.`, "success");
      return;
    }
    if (action === "MoveAuxiliaryReplica") {
      const currentNodeName = String(input.currentNodeName || "").trim();
      const newNodeName = String(input.newNodeName || "").trim();
      if (!currentNodeName || !newNodeName) {
        throw new Error("CurrentNodeName and NewNodeName are required for MoveAuxiliaryReplica.");
      }
      setStatus(`Moving auxiliary replica for ${serviceId}/${partitionId} from ${currentNodeName} to ${newNodeName}...`);
      await postSfAction(
        `/Services/${encodeURIComponent(serviceId)}/$/GetPartitions/${encodeURIComponent(
          partitionId
        )}/$/MoveAuxiliaryReplica`,
        {
          apiVersion: "8.1",
          query: {
            CurrentNodeName: currentNodeName,
            NewNodeName: newNodeName,
            IgnoreConstraints: force,
            timeout
          }
        }
      );
      setStatus(`MoveAuxiliaryReplica requested for partition ${partitionId}.`, "success");
      return;
    }
    if (action === "UpdatePartitionLoad") {
      const metricName = String(input.metricName || "").trim();
      const metricCurrentLoad = parseOptionalInt(input.metricCurrentLoad);
      if (!metricName || metricCurrentLoad === null) {
        throw new Error("MetricName and MetricCurrentLoad are required for UpdatePartitionLoad.");
      }
      const metricDescription = { Name: metricName, CurrentLoad: metricCurrentLoad };
      const metricNodeName = String(input.metricNodeName || "").trim();
      if (metricNodeName) {
        metricDescription.NodeName = metricNodeName;
      }
      const body = [
        {
          PartitionId: partitionId,
          PrimaryReplicaLoadEntries: [metricDescription]
        }
      ];
      setStatus(`Updating partition load for ${partitionId}...`);
      await postSfAction("/$/UpdatePartitionLoad", {
        apiVersion: "7.2",
        body,
        query: {
          ContinuationToken: String(input.continuationToken || "").trim(),
          MaxResults: parseOptionalInt(input.maxResults),
          timeout
        }
      });
      setStatus(`UpdatePartitionLoad requested for partition ${partitionId}.`, "success");
      return;
    }
    if (action === "ReportPartitionHealth") {
      const sourceId = String(input.sourceId || "").trim();
      const property = String(input.property || "").trim();
      const healthState = parseOptionalInt(input.healthState);
      const description = String(input.description || "").trim();
      if (!sourceId || !property || healthState === null) {
        throw new Error("SourceId, Property, and HealthState are required for ReportPartitionHealth.");
      }
      const body = {
        HealthInformation: {
          SourceId: sourceId,
          Property: property,
          HealthState: healthState,
          Description: description
        }
      };
      const immediate = parseOptionalBool(input.immediate);
      setStatus(`Reporting health for partition ${partitionId}...`);
      await postSfAction(`/Partitions/${encodeURIComponent(partitionId)}/$/ReportHealth`, {
        apiVersion: "6.0",
        body,
        query: { Immediate: immediate, timeout }
      });
      setStatus(`ReportPartitionHealth submitted for partition ${partitionId}.`, "success");
      return;
    }

    throw new Error(`Unsupported partition action: ${action}`);
  }

  function buildDefaultRepairTaskId() {
    const stamp = new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14);
    return `manual-repair-${stamp}`;
  }

  function normalizeNodeList(raw) {
    if (!raw) return [];
    return raw
      .split(",")
      .map((n) => n.trim())
      .filter(Boolean);
  }

  async function promptRepairTaskInput(defaultNodeName) {
    const values = await openActionModal({
      title: "Create Repair Task",
      submitLabel: "Create Repair Task",
      cancelLabel: "Cancel",
      fields: [
        { name: "taskId", label: "Repair Task ID", value: buildDefaultRepairTaskId(), required: true },
        { name: "action", label: "Repair Action", value: "System.Reboot", required: true },
        {
          name: "nodeNames",
          label: "Target Node Name(s), comma-separated",
          value: defaultNodeName || "",
          required: true
        },
        { name: "description", label: "Description (optional)", value: "", required: false }
      ]
    });
    if (!values) return null;

    const taskId = String(values.taskId || "").trim();
    if (!taskId) {
      setStatus("Repair task creation canceled: Task ID is required.", "warning");
      return null;
    }
    const action = String(values.action || "").trim();
    if (!action) {
      setStatus("Repair task creation canceled: Action is required.", "warning");
      return null;
    }
    const nodeNames = normalizeNodeList(values.nodeNames || "");
    if (!nodeNames.length) {
      setStatus("Repair task creation canceled: at least one node is required.", "warning");
      return null;
    }
    const description = String(values.description || "").trim();

    return {
      TaskId: taskId,
      Version: "0",
      Description: description,
      State: "Created",
      Action: action,
      Target: {
        Kind: "Node",
        NodeNames: nodeNames
      }
    };
  }

  async function confirmStartDataLoss(serviceId, partitionId, operationId) {
    return confirmWithActionModal(
      "Confirm Start Data Loss",
      `ServiceId: ${serviceId}\nPartitionId: ${partitionId}\nDataLossMode: FullDataLoss\nOperationId: ${operationId}\napi-version: 6.0`,
      "Start Data Loss"
    );
  }

  async function createRepairTask(repairTask, options = {}) {
    const base = `${window.location.protocol}//${window.location.host}`;
    const path = "/$/CreateRepairTask";
    const url = new URL(path, base);
    const apiVersion = options.apiVersion || "6.0";
    url.searchParams.set("api-version", apiVersion);

    const bearer = findBearerToken();
    setStatus(`Creating repair task ${repairTask.TaskId}...`);
    const resp = await fetch(url.toString(), {
      method: "POST",
      credentials: "include",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        ...(bearer ? { Authorization: `Bearer ${bearer}` } : {})
      },
      body: JSON.stringify(repairTask)
    });

    if (!resp.ok) {
      const body = await resp.text().catch(() => "");
      throw new Error(`CreateRepairTask failed (${resp.status}): ${body || resp.statusText}`);
    }
    setStatus(`Repair task ${repairTask.TaskId} created.`, "success");
  }

  function isRepairTasksView() {
    const href = window.location.href || "";
    return /#\/repairtasks\b/i.test(href);
  }

  function extractRepairTaskIdFromRow(row) {
    if (!row) return "";
    const idCopyBtn = row.querySelector('button[aria-label*="repair job task id"]');
    const aria = idCopyBtn ? idCopyBtn.getAttribute("aria-label") || "" : "";
    const ariaMatch = aria.match(/repair job task id\s*:\s*([^\s]+)/i);
    if (ariaMatch && ariaMatch[1]) return ariaMatch[1].trim();

    const firstCell = row.querySelector("td");
    const text = firstCell ? (firstCell.textContent || "").trim() : "";
    const textMatch = text.match(/[A-Za-z0-9][A-Za-z0-9._-]{5,}/);
    return textMatch ? textMatch[0].trim() : "";
  }

  function extractRepairTaskStateFromRow(row) {
    if (!row) return "";
    const cells = row.querySelectorAll("td");
    if (!cells || cells.length < 5) return "";
    return (cells[4].textContent || "").trim();
  }

  function parseRawRepairJobFromExpandedRow(row) {
    if (!row || !row.nextElementSibling) return null;
    const detailRow = row.nextElementSibling;
    const label = detailRow.querySelector('app-clip-board[name="raw repair job"] label');
    if (!label) return null;
    const text = (label.textContent || "").trim();
    const jsonStart = text.indexOf("{");
    if (jsonStart < 0) return null;
    const jsonText = text.slice(jsonStart);
    try {
      return JSON.parse(jsonText);
    } catch (_) {
      return null;
    }
  }

  async function cancelRepairTask(taskId, options = {}) {
    const base = `${window.location.protocol}//${window.location.host}`;
    const path = "/$/CancelRepairTask";
    const url = new URL(path, base);
    const apiVersion = options.apiVersion || "6.0";
    url.searchParams.set("api-version", apiVersion);

    const payload = {
      TaskId: taskId,
      Version: options.version || "0",
      RequestAbort: !!options.requestAbort
    };

    const bearer = findBearerToken();
    setStatus(`Requesting cancel for repair task ${taskId}...`);
    const resp = await fetch(url.toString(), {
      method: "POST",
      credentials: "include",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        ...(bearer ? { Authorization: `Bearer ${bearer}` } : {})
      },
      body: JSON.stringify(payload)
    });

    if (!resp.ok) {
      const body = await resp.text().catch(() => "");
      throw new Error(`CancelRepairTask failed (${resp.status}): ${body || resp.statusText}`);
    }
    setStatus(`Cancel requested for repair task ${taskId}.`, "success");
  }

  async function deleteRepairTask(taskId, options = {}) {
    const base = `${window.location.protocol}//${window.location.host}`;
    const path = "/$/DeleteRepairTask";
    const url = new URL(path, base);
    const apiVersion = options.apiVersion || "6.0";
    url.searchParams.set("api-version", apiVersion);

    const payload = {
      TaskId: taskId,
      Version: options.version || "0"
    };

    const bearer = findBearerToken();
    setStatus(`Requesting delete for repair task ${taskId}...`);
    const resp = await fetch(url.toString(), {
      method: "POST",
      credentials: "include",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        ...(bearer ? { Authorization: `Bearer ${bearer}` } : {})
      },
      body: JSON.stringify(payload)
    });

    if (!resp.ok) {
      const body = await resp.text().catch(() => "");
      throw new Error(`DeleteRepairTask failed (${resp.status}): ${body || resp.statusText}`);
    }
    setStatus(`Delete requested for repair task ${taskId}.`, "success");
  }

  function tryAttachRepairTaskCancelButtons() {
    if (!isRepairTasksView()) return;
    const tables = Array.from(document.querySelectorAll("table"));
    tables.forEach((table) => {
      const rows = Array.from(table.querySelectorAll("tr.hover-row"));
      if (!rows.length) return;
      const headerRow = table.querySelector("tr");
      if (headerRow && !headerRow.dataset.sfxRepairTaskHeaderAugmented) {
        const th = document.createElement("th");
        th.textContent = "Repair Actions";
        headerRow.appendChild(th);
        headerRow.dataset.sfxRepairTaskHeaderAugmented = "1";
      }

      rows.forEach((row) => {
        if (row.dataset.sfxRepairTaskRowAugmented) return;
        const taskId = extractRepairTaskIdFromRow(row);
        if (!taskId) return;

        const stateText = extractRepairTaskStateFromRow(row);
        const isCompleted = /^completed$/i.test(stateText);
        row.dataset.sfxRepairTaskRowAugmented = "1";

        const btnCell = document.createElement("td");
        const cancelBtn = document.createElement("button");
        cancelBtn.className = "simple-button";
        cancelBtn.textContent = "Cancel Repair";
        cancelBtn.title = `Cancel repair task ${taskId}`;
        if (isCompleted) {
          cancelBtn.disabled = true;
          cancelBtn.title = `Repair task ${taskId} is already completed`;
        }
        cancelBtn.addEventListener("click", async (ev) => {
          ev.stopPropagation();
          const raw = parseRawRepairJobFromExpandedRow(row) || {};
          const currentTaskId = String(raw.TaskId || taskId || "").trim();
          const currentVersion = String(raw.Version || "0").trim() || "0";
          const currentState = String(raw.State || stateText || "").trim();
          const requestAbort = /^(executing|restoring)$/i.test(currentState);
          if (!currentTaskId) {
            setStatus("Could not determine repair task id for cancel.", "error");
            return;
          }
          const confirmed = await confirmWithActionModal(
            "Confirm Cancel Repair Task",
            `TaskId: ${currentTaskId}\nVersion: ${currentVersion}\nState: ${
              currentState || "(unknown)"
            }\nRequestAbort: ${requestAbort}\napi-version: 6.0`,
            "Cancel Repair"
          );
          if (!confirmed) return;
          cancelRepairTask(currentTaskId, { apiVersion: "6.0", version: currentVersion, requestAbort }).catch((err) =>
            setStatus(err.message, "error")
          );
        });
        const deleteBtn = document.createElement("button");
        deleteBtn.className = "simple-button";
        deleteBtn.textContent = "Delete Repair";
        deleteBtn.title = `Delete repair task ${taskId}`;
        if (!isCompleted) {
          deleteBtn.disabled = true;
          deleteBtn.title = `Delete is supported for completed repair tasks only`;
        }
        deleteBtn.addEventListener("click", async (ev) => {
          ev.stopPropagation();
          const raw = parseRawRepairJobFromExpandedRow(row) || {};
          const currentTaskId = String(raw.TaskId || taskId || "").trim();
          const currentVersion = String(raw.Version || "0").trim() || "0";
          const currentState = String(raw.State || stateText || "").trim();
          if (!/^completed$/i.test(currentState)) {
            setStatus(`DeleteRepairTask requires state Completed (current: ${currentState || "unknown"}).`, "warning");
            return;
          }
          if (!currentTaskId) {
            setStatus("Could not determine repair task id for delete.", "error");
            return;
          }
          const confirmed = await confirmWithActionModal(
            "Confirm Delete Repair Task",
            `TaskId: ${currentTaskId}\nVersion: ${currentVersion}\nState: ${currentState}\napi-version: 6.0`,
            "Delete Repair"
          );
          if (!confirmed) return;
          deleteRepairTask(currentTaskId, { apiVersion: "6.0", version: currentVersion }).catch((err) =>
            setStatus(err.message, "error")
          );
        });
        btnCell.appendChild(cancelBtn);
        btnCell.appendChild(deleteBtn);
        row.appendChild(btnCell);
      });
    });
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

  async function confirmPartitionAction(action, details = {}, submitLabel = action) {
    const lines = [`Action: ${action}`];
    if (details.serviceId) lines.push(`ServiceId: ${details.serviceId}`);
    if (details.partitionId) lines.push(`PartitionId: ${details.partitionId}`);
    if (details.operationId) lines.push(`OperationId: ${details.operationId}`);
    if (details.dataLossMode) lines.push(`DataLossMode: ${details.dataLossMode}`);
    if (details.apiVersion) lines.push(`api-version: ${details.apiVersion}`);
    return confirmWithActionModal(`Confirm ${action}`, lines.join("\n"), submitLabel);
  }

  function getReplicaMenuContext(menu) {
    const route = getCurrentRouteIds();
    const hrefIds = parseIdsFromHref(window.location.href);
    const menuIds = extractIdsFromElement(menu);
    return {
      partitionId: route.partitionId || hrefIds.partitionId || menuIds.partitionId || "",
      replicaId: route.replicaId || hrefIds.replicaId || menuIds.replicaId || ""
    };
  }

  async function confirmDeletion(partitionId, replicaId, nodeName, forceRemove) {
    const apiVersion = state.apiVersion || "6.5";
    const forceFlag = forceRemove ? "Force Delete Replica" : "Delete Replica";
    return confirmWithActionModal(
      `Confirm ${forceFlag}`,
      `Replica: ${replicaId}\nPartition: ${partitionId}\nNode: ${nodeName}\napi-version: ${apiVersion}`,
      forceFlag
    );
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
          btn.addEventListener("click", async (ev) => {
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
            const confirmed = await confirmDeletion(partitionId, rid, currentNode, forceRemoveFlag);
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

  function closeInjectedTreeDropdowns(exceptToggle = null) {
    document.querySelectorAll(".sfx-tree-action-host .dropdown-toggle[aria-expanded='true']").forEach((btn) => {
      if (exceptToggle && btn === exceptToggle) return;
      btn.setAttribute("aria-expanded", "false");
      const menu = btn.parentElement ? btn.parentElement.querySelector(".dropdown-menu") : null;
      if (menu) menu.classList.remove("show");
    });
  }

  function createInjectedTreeDropdown() {
    ensureActionModalStyles();

    const host = document.createElement("div");
    host.className = "hidden right-action sfx-tree-action-host";

    const actionCollection = document.createElement("app-action-collection-drop-down");
    actionCollection.tabIndex = -1;

    const dropdown = document.createElement("div");
    dropdown.className = "dropdown";
    dropdown.setAttribute("ngbdropdown", "");

    const toggle = document.createElement("button");
    toggle.setAttribute("ngbdropdowntoggle", "");
    toggle.tabIndex = -1;
    toggle.setAttribute("aria-label", "Actions");
    toggle.setAttribute("placement", "left right");
    toggle.setAttribute("ngbtooltip", "Possible commands to perform");
    toggle.setAttribute("tooltipclass", "styled-tooltip");
    toggle.className = "dropdown-toggle simple-button tree-view";
    toggle.setAttribute("aria-haspopup", "false");
    toggle.setAttribute("aria-expanded", "false");

    const menu = document.createElement("div");
    menu.className = "dropdown-menu";
    menu.setAttribute("ngbdropdownmenu", "");

    toggle.addEventListener("click", (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      const isOpen = toggle.getAttribute("aria-expanded") === "true";
      closeInjectedTreeDropdowns(isOpen ? null : toggle);
      toggle.setAttribute("aria-expanded", isOpen ? "false" : "true");
      menu.classList.toggle("show", !isOpen);
    });

    dropdown.appendChild(toggle);
    dropdown.appendChild(menu);
    actionCollection.appendChild(dropdown);
    host.appendChild(actionCollection);

    return { host, toggle, menu };
  }

  function findPartitionTreeRows() {
    const { partitionId } = getCurrentRouteIds();
    if (!partitionId) return [];
    return Array.from(document.querySelectorAll(`[title="${partitionId}"]`))
      .map((el) => el.closest(".self.hover-row"))
      .filter(Boolean);
  }

  function attachPartitionTreeActionToggles() {
    const rows = findPartitionTreeRows();
    rows.forEach((row) => {
      if (row.querySelector(".sfx-tree-action-host")) return;
      const existingRightAction = row.querySelector(".right-action");
      if (existingRightAction && existingRightAction.querySelector(".dropdown-menu")) return;

      const { host } = createInjectedTreeDropdown();
      if (existingRightAction) {
        host.className = "sfx-tree-action-host";
        while (host.firstChild) {
          existingRightAction.appendChild(host.firstChild);
        }
        existingRightAction.classList.add("sfx-tree-action-host");
        return;
      }
      row.appendChild(host);
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
      const styleSourceBtn = menu.querySelector("button, a");
      const replicaContext = getReplicaMenuContext(menu);
      const hasReplicaContext = !!replicaContext.replicaId;
      if (restartBtn && hasReplicaContext && !menu.dataset.sfxReplicaMenuAugmented) {
        menu.dataset.sfxReplicaMenuAugmented = "1";
        const makeReplicaMenuBtn = (label, forceRemoveFlag) => {
          const btn = document.createElement("button");
          btn.textContent = label;
          btn.className = restartBtn.className || "dropdown-item simple-button";
          btn.addEventListener("click", async (ev) => {
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
            const confirmed = await confirmDeletion(pid, rid, nodeName, forceRemoveFlag);
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
        rollbackBtn.addEventListener("click", async (ev) => {
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
          const confirmed = await confirmWithActionModal(
            "Confirm Rollback Application",
            `Application: ${normalized}\napi-version: ${state.apiVersion}`,
            "Rollback Application"
          );
          if (!confirmed) return;
          rollbackApplication(normalized, { ...state }).catch((err) => setStatus(err.message, "error"));
        });
        menu.appendChild(rollbackBtn);
      }

      const serviceContext = collectRouteServiceContext(menu);
      if (serviceContext.serviceId && !menu.dataset.sfxServiceMenuAugmented) {
        menu.dataset.sfxServiceMenuAugmented = "1";
        const scaleServiceBtn = document.createElement("button");
        scaleServiceBtn.textContent = "Scale Service";
        scaleServiceBtn.className = (styleSourceBtn && styleSourceBtn.className) || "dropdown-item";
        scaleServiceBtn.addEventListener("click", async (ev) => {
          ev.stopPropagation();
          const context = collectRouteServiceContext(menu);
          const serviceId = normalizeServiceId(context.serviceId || "");
          if (!serviceId) {
            setStatus("Could not determine service id for scaling.", "error");
            return;
          }
          try {
            const description = await getServiceDescription(serviceId, { apiVersion: "6.0" });
            const update = await promptScaleServiceInput(serviceId, description);
            if (!update) return;
            await updateServiceScale(serviceId, update, { apiVersion: "6.0", timeout: update.timeout });
          } catch (err) {
            setStatus(err.message, "error");
          }
        });
        menu.appendChild(scaleServiceBtn);
      }

      const partitionContext = collectRoutePartitionContext(menu);
      const hasPartitionContext = !!partitionContext.partitionId || !!partitionContext.serviceId;
      if (hasPartitionContext && !menu.dataset.sfxPartitionMenuAugmented) {
        menu.dataset.sfxPartitionMenuAugmented = "1";
        const menuClassName = (styleSourceBtn && styleSourceBtn.className) || "dropdown-item";
        const addPartitionActionBtn = (label, buildInput, buildConfirm) => {
          const btn = document.createElement("button");
          btn.textContent = label;
          btn.className = menuClassName;
          btn.addEventListener("click", async (ev) => {
            ev.stopPropagation();
            const context = collectRoutePartitionContext(menu);
            const input = await buildInput(context);
            if (!input) return;
            const confirmed = await buildConfirm(input);
            if (!confirmed) return;
            runPartitionAction(input).catch((err) => setStatus(err.message, "error"));
          });
          menu.appendChild(btn);
        };

        if (partitionContext.partitionId) {
          addPartitionActionBtn(
            "Recover Partition",
            (context) => ({
              action: "RecoverPartition",
              partitionId: String(context.partitionId || "").trim()
            }),
            (input) =>
              confirmPartitionAction(
                "RecoverPartition",
                { partitionId: input.partitionId, apiVersion: "6.0" },
                "Recover Partition"
              )
          );

          addPartitionActionBtn(
            "Reset Partition Load",
            (context) => ({
              action: "ResetPartitionLoad",
              partitionId: String(context.partitionId || "").trim()
            }),
            (input) =>
              confirmPartitionAction(
                "ResetPartitionLoad",
                { partitionId: input.partitionId, apiVersion: "6.0" },
                "Reset Partition Load"
              )
          );

          addPartitionActionBtn(
            "Move Primary Replica",
            async (context) => promptMovePrimaryReplicaInput(String(context.partitionId || "").trim()),
            async (input) => !!input
          );

          addPartitionActionBtn(
            "Move Secondary Replica",
            async (context) => promptMoveSecondaryReplicaInput(String(context.partitionId || "").trim()),
            async (input) => !!input
          );
        }

        if (partitionContext.serviceId) {
          addPartitionActionBtn(
            "Recover Service Partitions",
            (context) => ({
              action: "RecoverServicePartitions",
              serviceId: normalizeServiceId(context.serviceId || "")
            }),
            (input) =>
              confirmPartitionAction(
                "RecoverServicePartitions",
                { serviceId: input.serviceId, apiVersion: "6.0" },
                "Recover Service Partitions"
              )
          );
        }

        if (partitionContext.partitionId && partitionContext.serviceId) {
          addPartitionActionBtn(
            "Start Data Loss",
            (context) => ({
              action: "StartDataLoss",
              partitionId: String(context.partitionId || "").trim(),
              serviceId: normalizeServiceId(context.serviceId || ""),
              operationId: generateOperationId()
            }),
            (input) =>
              confirmStartDataLoss(input.serviceId, input.partitionId, input.operationId)
          );
        }

        addPartitionActionBtn(
          "Recover System Partitions",
          () => ({ action: "RecoverSystemPartitions" }),
          () =>
            confirmPartitionAction(
              "RecoverSystemPartitions",
              { apiVersion: "6.0" },
              "Recover System Partitions"
            )
        );

        addPartitionActionBtn(
          "Recover All Partitions",
          () => ({ action: "RecoverAllPartitions" }),
          () =>
            confirmPartitionAction(
              "RecoverAllPartitions",
              { apiVersion: "6.0" },
              "Recover All Partitions"
            )
        );
      }

      const menuActions = Array.from(menu.querySelectorAll("button, a")).map((b) => (b.textContent || "").trim().toLowerCase());
      const isNodeRoute = !!parseIdsFromHref(window.location.href).nodeName || /\/node\//i.test(window.location.href || "");
      const hasNodeActions = menuActions.some((text) => {
        return (
          text === "restart" ||
          text.includes("restart node") ||
          text === "activate" ||
          text.includes("deactivate") ||
          text.includes("remove node state") ||
          text.includes("disable node") ||
          text.includes("enable node")
        );
      });
      if ((isNodeRoute || hasNodeActions) && !menu.dataset.sfxNodeMenuAugmented) {
        menu.dataset.sfxNodeMenuAugmented = "1";
        const styleSourceBtn = menu.querySelector("button, a");
        const createRepairTaskBtn = document.createElement("button");
        createRepairTaskBtn.textContent = "Create Repair Task";
        createRepairTaskBtn.className = (styleSourceBtn && styleSourceBtn.className) || "dropdown-item";
        createRepairTaskBtn.addEventListener("click", async (ev) => {
          ev.stopPropagation();
          const routeIds = getCurrentRouteIds();
          let nodeName = routeIds.nodeName || guessNodeNameFromPage();
          if (!nodeName) {
            const link = document.querySelector('a[href*="#/node/"], a[href*="/node/"]');
            const derived = link ? parseIdsFromHref(link.getAttribute("href")) : {};
            nodeName = derived.nodeName || "";
          }
          const repairTask = await promptRepairTaskInput(nodeName);
          if (!repairTask) return;

          const confirmed = await confirmWithActionModal(
            "Confirm Create Repair Task",
            `TaskId: ${repairTask.TaskId}\nAction: ${repairTask.Action}\nState: ${repairTask.State}\nNodes: ${
              repairTask.Target.NodeNames.join(", ")
            }\napi-version: 6.0`,
            "Create Repair Task"
          );
          if (!confirmed) return;
          createRepairTask(repairTask, { apiVersion: "6.0" }).catch((err) => setStatus(err.message, "error"));
        });
        menu.appendChild(createRepairTaskBtn);
      }
    });
  }

  tryAttachInlineButtons();
  attachPartitionTreeActionToggles();
  attachActionDropdowns();
  tryAttachRepairTaskCancelButtons();
  const observer = new MutationObserver(() => {
    tryAttachInlineButtons();
    attachPartitionTreeActionToggles();
    tryAttachRepairTaskCancelButtons();
  });
  observer.observe(document.body, { childList: true, subtree: true });
  const dropdownObserver = new MutationObserver(() => attachActionDropdowns());
  dropdownObserver.observe(document.body, { childList: true, subtree: true });
  document.addEventListener("click", () => closeInjectedTreeDropdowns(), true);
})();
