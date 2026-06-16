(() => {
  const helper = (window.SfxHelper = window.SfxHelper || {});
  if (helper.uiLoaded) return;
  helper.uiLoaded = true;
  const serviceKindCache = new Map();

  function validate(partitionId, replicaId, nodeName) {
    if (!partitionId) {
      helper.setStatus("Partition id is required.", "error");
      return false;
    }
    if (!replicaId) {
      helper.setStatus("Replica id is required.", "error");
      return false;
    }
    if (!nodeName) {
      helper.setStatus("Node name is required.", "error");
      return false;
    }
    return true;
  }

  async function confirmPartitionAction(action, details = {}, submitLabel = action) {
    const lines = [`Action: ${action}`];
    if (details.serviceId) lines.push(`ServiceId: ${details.serviceId}`);
    if (details.partitionId) lines.push(`PartitionId: ${details.partitionId}`);
    if (details.operationId) lines.push(`OperationId: ${details.operationId}`);
    if (details.restartPartitionMode) lines.push(`RestartPartitionMode: ${details.restartPartitionMode}`);
    if (details.dataLossMode) lines.push(`DataLossMode: ${details.dataLossMode}`);
    if (details.apiVersion) lines.push(`api-version: ${details.apiVersion}`);
    return helper.confirmWithActionModal(`Confirm ${action}`, lines.join("\n"), submitLabel);
  }

  function getReplicaMenuContext(menu) {
    const route = helper.getCurrentRouteIds();
    const hrefIds = helper.parseIdsFromHref(window.location.href);
    const menuIds = helper.extractIdsFromElement(menu);
    return {
      partitionId: route.partitionId || hrefIds.partitionId || menuIds.partitionId || "",
      replicaId: route.replicaId || hrefIds.replicaId || menuIds.replicaId || ""
    };
  }

  async function confirmDeletion(partitionId, replicaId, nodeName, forceRemove) {
    const apiVersion = helper.state.apiVersion || "6.5";
    const forceFlag = forceRemove ? "Force Delete Replica" : "Delete Replica";
    return helper.confirmWithActionModal(
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

  function getMenuEntityType(menu) {
    if (!menu) return "";
    if (menu.dataset.sfxMenuEntity) return menu.dataset.sfxMenuEntity;

    const menuTexts = Array.from(menu.querySelectorAll("button, a"))
      .map((el) => (el.textContent || "").trim().toLowerCase())
      .filter(Boolean);

    if (menuTexts.some((text) => text.includes("restart replica"))) return "replica";
    if (menuTexts.some((text) => text.includes("delete application"))) return "application";
    if (menuTexts.some((text) => text.includes("delete service"))) return "service";
    if (menuTexts.some((text) => text.includes("rollback cluster upgrade"))) return "cluster";

    const row = menu.closest(".self.hover-row");
    if (row) {
      const clusterLink = row.querySelector('a[href*="/cluster"], a[href*="#/cluster"]');
      if (clusterLink) return "cluster";
      const rowText = (row.textContent || "").trim().toLowerCase();
      if (rowText === "cluster" || rowText.startsWith("cluster")) return "cluster";
      const titleEls = Array.from(row.querySelectorAll("[title]"));
      const hasPartitionTitle = titleEls.some((el) =>
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test((el.getAttribute("title") || "").trim())
      );
      if (hasPartitionTitle) return "partition";
      const hasServiceTitle = titleEls.some((el) => /^fabric:\//i.test((el.getAttribute("title") || "").trim()));
      if (hasServiceTitle) return "service";
    }

    return "";
  }

  async function getServiceKind(serviceId) {
    const normalizedServiceId = helper.normalizeServiceId(serviceId || "");
    if (!normalizedServiceId) return "";
    if (serviceKindCache.has(normalizedServiceId)) {
      return serviceKindCache.get(normalizedServiceId);
    }
    const pending = helper
      .getServiceDescription(normalizedServiceId, { apiVersion: "6.0" })
      .then((description) => String(description.ServiceKind || description.Kind || "").trim())
      .catch(() => "");
    serviceKindCache.set(normalizedServiceId, pending);
    const serviceKind = await pending;
    serviceKindCache.set(normalizedServiceId, serviceKind);
    return serviceKind;
  }

  function tryAttachInlineButtons() {
    const { partitionId: routePid } = helper.getCurrentRouteIds();
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
            const { partitionId: routePidClick } = helper.getCurrentRouteIds();
            const rid = btn.dataset.replicaId;
            const rowIds = helper.extractIdsFromElement(row);
            const partitionId = routePidClick || rowIds.partitionId || routePid;
            const currentNode = btn.dataset.nodeName || helper.guessNodeNameFromPage();
            if (!partitionId || !rid) {
              if (helper.attemptSelectReplica(rid)) return;
            }
            if (!validate(partitionId, rid, currentNode)) return;
            const confirmed = await confirmDeletion(partitionId, rid, currentNode, forceRemoveFlag);
            if (!confirmed) return;
            helper.deleteReplica(partitionId, rid, {
              ...helper.state,
              nodeName: currentNode,
              forceRemove: forceRemoveFlag
            }).catch((err) => helper.setStatus(err.message, "error"));
          });
          return btn;
        };
        btnCell.appendChild(makeBtn("Delete", false));
        btnCell.appendChild(makeBtn("Force Delete", true));
        row.appendChild(btnCell);
      });
    });
  }

  function tryAttachRepairTaskCancelButtons() {
    if (!helper.isRepairTasksView()) return;
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
        const taskId = helper.extractRepairTaskIdFromRow(row);
        if (!taskId) return;

        const stateText = helper.extractRepairTaskStateFromRow(row);
        const isCompleted = /\bcompleted\b/i.test(stateText);
        row.dataset.sfxRepairTaskRowAugmented = "1";

        const btnCell = document.createElement("td");
        const forceApproveBtn = document.createElement("button");
        forceApproveBtn.className = "simple-button";
        forceApproveBtn.textContent = "Force Approve";
        forceApproveBtn.title = `Force approve repair task ${taskId}`;
        if (/\b(approved|executing|restoring|completed)\b/i.test(stateText)) {
          forceApproveBtn.disabled = true;
          forceApproveBtn.title = `Force approve is not applicable in state ${stateText || "unknown"}`;
        }
        forceApproveBtn.addEventListener("click", async (ev) => {
          ev.stopPropagation();
          const raw = helper.parseRawRepairJobFromExpandedRow(row) || {};
          const currentTaskId = String(raw.TaskId || taskId || "").trim();
          const currentVersion = String(raw.Version || "0").trim() || "0";
          const currentState = String(raw.State || stateText || "").trim();
          if (!currentTaskId) {
            helper.setStatus("Could not determine repair task id for force approve.", "error");
            return;
          }
          const confirmed = await helper.confirmWithActionModal(
            "Confirm Force Approve Repair Task",
            `TaskId: ${currentTaskId}\nVersion: ${currentVersion}\nState: ${currentState || "(unknown)"}\napi-version: 6.0`,
            "Force Approve"
          );
          if (!confirmed) return;
          helper.forceApproveRepairTask(currentTaskId, { apiVersion: "6.0", version: currentVersion }).catch((err) =>
            helper.setStatus(err.message, "error")
          );
        });
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
          const raw = helper.parseRawRepairJobFromExpandedRow(row) || {};
          const currentTaskId = String(raw.TaskId || taskId || "").trim();
          const currentVersion = String(raw.Version || "0").trim() || "0";
          const currentState = String(raw.State || stateText || "").trim();
          const requestAbort = /\b(executing|restoring)\b/i.test(currentState);
          if (!currentTaskId) {
            helper.setStatus("Could not determine repair task id for cancel.", "error");
            return;
          }
          const confirmed = await helper.confirmWithActionModal(
            "Confirm Cancel Repair Task",
            `TaskId: ${currentTaskId}\nVersion: ${currentVersion}\nState: ${
              currentState || "(unknown)"
            }\nRequestAbort: ${requestAbort}\napi-version: 6.0`,
            "Cancel Repair"
          );
          if (!confirmed) return;
          helper.cancelRepairTask(currentTaskId, { apiVersion: "6.0", version: currentVersion, requestAbort }).catch((err) =>
            helper.setStatus(err.message, "error")
          );
        });
        const deleteBtn = document.createElement("button");
        deleteBtn.className = "simple-button";
        deleteBtn.textContent = "Delete Repair";
        deleteBtn.title = `Delete repair task ${taskId}`;
        if (!isCompleted) {
          deleteBtn.title = "Delete requires state Completed; if this row is completed, click to validate against the latest row data";
        }
        deleteBtn.addEventListener("click", async (ev) => {
          ev.stopPropagation();
          const raw = helper.parseRawRepairJobFromExpandedRow(row) || {};
          const currentTaskId = String(raw.TaskId || taskId || "").trim();
          const currentVersion = String(raw.Version || "0").trim() || "0";
          const currentState = String(raw.State || stateText || "").trim();
          if (currentState && !/\bcompleted\b/i.test(currentState)) {
            helper.setStatus(`DeleteRepairTask requires state Completed (current: ${currentState || "unknown"}).`, "warning");
            return;
          }
          if (!currentTaskId) {
            helper.setStatus("Could not determine repair task id for delete.", "error");
            return;
          }
          const confirmed = await helper.confirmWithActionModal(
            "Confirm Delete Repair Task",
            `TaskId: ${currentTaskId}\nVersion: ${currentVersion}\nState: ${currentState || "(unknown)"}\napi-version: 6.0`,
            "Delete Repair"
          );
          if (!confirmed) return;
          helper.deleteRepairTask(currentTaskId, { apiVersion: "6.0", version: currentVersion }).catch((err) =>
            helper.setStatus(err.message, "error")
          );
        });
        const updateStateBtn = document.createElement("button");
        updateStateBtn.className = "simple-button";
        updateStateBtn.textContent = "Update State";
        updateStateBtn.title = `Update execution state for repair task ${taskId}`;
        updateStateBtn.addEventListener("click", async (ev) => {
          ev.stopPropagation();
          const raw = helper.parseRawRepairJobFromExpandedRow(row);
          if (!raw) {
            helper.setStatus("Expand the repair task row first so the raw repair job payload is available.", "warning");
            return;
          }
          const values = await helper.openActionModal({
            title: "Update Repair Execution State",
            submitLabel: "Update State",
            cancelLabel: "Cancel",
            message: `TaskId: ${raw.TaskId || taskId}\nVersion: ${raw.Version || "0"}`,
            fields: [
              {
                name: "state",
                label: "State",
                type: "select",
                value: String(raw.State || "").trim(),
                required: true,
                options: [
                  "Created",
                  "Claimed",
                  "Preparing",
                  "Approved",
                  "Executing",
                  "Restoring",
                  "Completed"
                ].map((value) => ({ value, label: value }))
              },
              { name: "executor", label: "Executor", value: String(raw.Executor || ""), required: false },
              { name: "executorData", label: "Executor Data", value: String(raw.ExecutorData || ""), required: false },
              {
                name: "resultStatus",
                label: "Result Status",
                type: "select",
                value: String(raw.ResultStatus || "").trim(),
                required: false,
                options: [
                  { value: "", label: "(leave current value)" },
                  ...["Succeeded", "Cancelled", "Interrupted", "Failed", "Pending"].map((value) => ({ value, label: value }))
                ]
              },
              { name: "resultCode", label: "Result Code", type: "number", value: String(raw.ResultCode ?? ""), required: false },
              { name: "resultDetails", label: "Result Details", value: String(raw.ResultDetails || ""), required: false },
              {
                name: "impactJson",
                label: "Impact JSON",
                type: "textarea",
                value: raw.Impact ? JSON.stringify(raw.Impact, null, 2) : "",
                rows: 6,
                required: false
              },
              {
                name: "performPreparingHealthCheck",
                label: "Perform Preparing Health Check",
                type: "select",
                value:
                  raw.PerformPreparingHealthCheck === undefined || raw.PerformPreparingHealthCheck === null
                    ? ""
                    : String(!!raw.PerformPreparingHealthCheck),
                required: false,
                options: [
                  { value: "", label: "(leave current value)" },
                  { value: "true", label: "true" },
                  { value: "false", label: "false" }
                ]
              },
              {
                name: "performRestoringHealthCheck",
                label: "Perform Restoring Health Check",
                type: "select",
                value:
                  raw.PerformRestoringHealthCheck === undefined || raw.PerformRestoringHealthCheck === null
                    ? ""
                    : String(!!raw.PerformRestoringHealthCheck),
                required: false,
                options: [
                  { value: "", label: "(leave current value)" },
                  { value: "true", label: "true" },
                  { value: "false", label: "false" }
                ]
              }
            ]
          });
          if (!values) return;
          const updatedTask = { ...raw };
          updatedTask.State = String(values.state || "").trim();
          updatedTask.Version = String(raw.Version || "0").trim() || "0";
          updatedTask.Executor = String(values.executor || "").trim();
          updatedTask.ExecutorData = String(values.executorData || "").trim();
          const resultStatus = String(values.resultStatus || "").trim();
          if (resultStatus) {
            updatedTask.ResultStatus = resultStatus;
          }
          const resultCode = helper.parseOptionalInt(values.resultCode);
          if (resultCode !== null) {
            updatedTask.ResultCode = resultCode;
          }
          const resultDetails = String(values.resultDetails || "").trim();
          if (resultDetails) {
            updatedTask.ResultDetails = resultDetails;
          }
          const impactJson = String(values.impactJson || "").trim();
          if (impactJson) {
            try {
              updatedTask.Impact = JSON.parse(impactJson);
            } catch (err) {
              helper.setStatus(`Impact JSON is invalid: ${err.message}`, "error");
              return;
            }
          }
          const preparingBool = helper.parseOptionalBool(values.performPreparingHealthCheck);
          if (preparingBool !== null) {
            updatedTask.PerformPreparingHealthCheck = preparingBool;
          }
          const restoringBool = helper.parseOptionalBool(values.performRestoringHealthCheck);
          if (restoringBool !== null) {
            updatedTask.PerformRestoringHealthCheck = restoringBool;
          }
          const confirmed = await helper.confirmWithActionModal(
            "Confirm Update Repair Execution State",
            `TaskId: ${updatedTask.TaskId}\nVersion: ${updatedTask.Version}\nState: ${updatedTask.State}\napi-version: 6.0`,
            "Update State"
          );
          if (!confirmed) return;
          helper.updateRepairExecutionState(updatedTask, { apiVersion: "6.0" }).catch((err) =>
            helper.setStatus(err.message, "error")
          );
        });
        const updateHealthPolicyBtn = document.createElement("button");
        updateHealthPolicyBtn.className = "simple-button";
        updateHealthPolicyBtn.textContent = "Health Policy";
        updateHealthPolicyBtn.title = `Update health policy for repair task ${taskId}`;
        updateHealthPolicyBtn.addEventListener("click", async (ev) => {
          ev.stopPropagation();
          const raw = helper.parseRawRepairJobFromExpandedRow(row) || {};
          const currentTaskId = String(raw.TaskId || taskId || "").trim();
          const currentVersion = String(raw.Version || "0").trim() || "0";
          if (!currentTaskId) {
            helper.setStatus("Could not determine repair task id for health policy update.", "error");
            return;
          }
          const values = await helper.openActionModal({
            title: "Update Repair Task Health Policy",
            submitLabel: "Update Health Policy",
            cancelLabel: "Cancel",
            message: `TaskId: ${currentTaskId}\nVersion: ${currentVersion}`,
            fields: [
              {
                name: "performPreparingHealthCheck",
                label: "Perform Preparing Health Check",
                type: "select",
                value:
                  raw.PerformPreparingHealthCheck === undefined || raw.PerformPreparingHealthCheck === null
                    ? ""
                    : String(!!raw.PerformPreparingHealthCheck),
                required: false,
                options: [
                  { value: "", label: "(leave current value)" },
                  { value: "true", label: "true" },
                  { value: "false", label: "false" }
                ]
              },
              {
                name: "performRestoringHealthCheck",
                label: "Perform Restoring Health Check",
                type: "select",
                value:
                  raw.PerformRestoringHealthCheck === undefined || raw.PerformRestoringHealthCheck === null
                    ? ""
                    : String(!!raw.PerformRestoringHealthCheck),
                required: false,
                options: [
                  { value: "", label: "(leave current value)" },
                  { value: "true", label: "true" },
                  { value: "false", label: "false" }
                ]
              }
            ]
          });
          if (!values) return;
          const performPreparingHealthCheck = helper.parseOptionalBool(values.performPreparingHealthCheck);
          const performRestoringHealthCheck = helper.parseOptionalBool(values.performRestoringHealthCheck);
          if (performPreparingHealthCheck === null && performRestoringHealthCheck === null) {
            helper.setStatus("Select at least one health policy value to update.", "warning");
            return;
          }
          const confirmed = await helper.confirmWithActionModal(
            "Confirm Update Repair Task Health Policy",
            `TaskId: ${currentTaskId}\nVersion: ${currentVersion}\napi-version: 6.0`,
            "Update Health Policy"
          );
          if (!confirmed) return;
          helper
            .updateRepairTaskHealthPolicy(currentTaskId, {
              apiVersion: "6.0",
              version: currentVersion,
              performPreparingHealthCheck,
              performRestoringHealthCheck
            })
            .catch((err) => helper.setStatus(err.message, "error"));
        });
        btnCell.appendChild(forceApproveBtn);
        btnCell.appendChild(cancelBtn);
        btnCell.appendChild(deleteBtn);
        btnCell.appendChild(updateStateBtn);
        btnCell.appendChild(updateHealthPolicyBtn);
        row.appendChild(btnCell);
      });
    });
  }

  function closeInjectedTreeDropdowns(exceptToggle = null) {
    document.querySelectorAll(".sfx-tree-action-host .dropdown-toggle[aria-expanded='true']").forEach((btn) => {
      if (exceptToggle && btn === exceptToggle) return;
      btn.setAttribute("aria-expanded", "false");
      const host = btn.closest(".sfx-tree-action-host");
      if (host) host.classList.remove("sfx-open");
      const menu = btn._sfxMenu || (btn.parentElement ? btn.parentElement.querySelector(".dropdown-menu") : null);
      if (menu) {
        menu.classList.remove("show");
        if (menu.parentElement === document.body) {
          menu.dataset.sfxOverlayDetached = "1";
        }
      }
    });
  }

  function positionInjectedTreeDropdown(toggle, menu) {
    if (!toggle || !menu) return;
    const toggleRect = toggle.getBoundingClientRect();
    const previousVisibility = menu.style.visibility;
    const previousDisplay = menu.style.display;

    menu.style.visibility = "hidden";
    menu.style.display = "block";

    const menuRect = menu.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const gap = 8;

    let left = toggleRect.left - menuRect.width - gap;
    if (left < 8) {
      left = Math.min(toggleRect.right + gap, viewportWidth - menuRect.width - 8);
      menu.setAttribute("data-popper-placement", "right");
    } else {
      menu.setAttribute("data-popper-placement", "left");
    }

    let top = toggleRect.top;
    if (top + menuRect.height > viewportHeight - 8) {
      top = Math.max(8, viewportHeight - menuRect.height - 8);
    }

    menu.style.left = `${Math.round(left)}px`;
    menu.style.top = `${Math.round(top)}px`;
    menu.style.visibility = previousVisibility;
    menu.style.display = previousDisplay;
  }

  function ensureInjectedTreeDropdownOverlay(toggle, menu) {
    if (!menu) return;
    if (menu.parentElement !== document.body) {
      document.body.appendChild(menu);
    }
    menu.dataset.sfxOverlayDetached = "0";
    positionInjectedTreeDropdown(toggle, menu);
  }

  function repositionOpenInjectedTreeDropdowns() {
    document.querySelectorAll(".sfx-tree-action-host .dropdown-toggle[aria-expanded='true']").forEach((toggle) => {
      const menu = toggle._sfxMenu || (toggle.parentElement ? toggle.parentElement.querySelector(".dropdown-menu") : null);
      if (!menu || !menu.classList.contains("show")) return;
      positionInjectedTreeDropdown(toggle, menu);
    });
  }

  function applyNativeTreeToggleSizing(toggle, sourceToggle = null) {
    if (!toggle) return;
    const nativeToggle =
      sourceToggle ||
      Array.from(
        document.querySelectorAll(
          ".right-action .dropdown-toggle, .right-action button, .dropdown-toggle.simple-button.tree-view, button.simple-button.tree-view"
        )
      ).find((el) => !el.closest(".sfx-tree-action-host"));
    if (!nativeToggle) {
      toggle.style.minWidth = "28px";
      toggle.style.minHeight = "28px";
      toggle.style.width = "28px";
      toggle.style.height = "28px";
      toggle.style.padding = "0";
      return;
    }
    const styles = window.getComputedStyle(nativeToggle);
    toggle.style.width = styles.width;
    toggle.style.height = styles.height;
    toggle.style.minWidth = styles.minWidth;
    toggle.style.minHeight = styles.minHeight;
    toggle.style.padding = styles.padding;
    toggle.style.margin = styles.margin;
    toggle.style.fontSize = styles.fontSize;
    toggle.style.lineHeight = styles.lineHeight;
    toggle.style.borderRadius = styles.borderRadius;
    toggle.style.backgroundSize = styles.backgroundSize;
    toggle.style.backgroundPosition = styles.backgroundPosition;
    toggle.style.backgroundRepeat = styles.backgroundRepeat;
  }

  function createInjectedTreeDropdown(entityType = "partition", sourceToggle = null) {
    helper.ensureActionModalStyles();

    const host = document.createElement("div");
    host.className = "right-action sfx-tree-action-host";

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
    applyNativeTreeToggleSizing(toggle, sourceToggle);

    const menu = document.createElement("div");
    menu.className = "dropdown-menu";
    menu.setAttribute("ngbdropdownmenu", "");
    menu.setAttribute("data-popper-placement", "left");
    menu.dataset.sfxMenuEntity = entityType;
    toggle._sfxMenu = menu;
    menu._sfxToggle = toggle;
    menu.addEventListener("click", (ev) => {
      const actionEl = ev.target && typeof ev.target.closest === "function" ? ev.target.closest("button, a") : null;
      if (!actionEl) return;
      closeInjectedTreeDropdowns();
    });

    toggle.addEventListener("click", (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      const isOpen = toggle.getAttribute("aria-expanded") === "true";
      closeInjectedTreeDropdowns(isOpen ? null : toggle);
      ensureInjectedTreeDropdownOverlay(toggle, menu);
      toggle.setAttribute("aria-expanded", isOpen ? "false" : "true");
      const hostEl = toggle.closest(".sfx-tree-action-host");
      if (hostEl) {
        hostEl.classList.toggle("sfx-open", !isOpen);
      }
      menu.classList.toggle("show", !isOpen);
    });

    dropdown.appendChild(toggle);
    dropdown.appendChild(menu);
    actionCollection.appendChild(dropdown);
    host.appendChild(actionCollection);

    return { host, toggle, menu };
  }

  function findPartitionTreeRows() {
    return Array.from(document.querySelectorAll(".self.hover-row")).filter((row) => {
      const titledEls = Array.from(row.querySelectorAll("[title]"));
      return titledEls.some((el) => {
        const title = (el.getAttribute("title") || "").trim();
        return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(title);
      });
    });
  }

  function findClusterTreeRows() {
    return Array.from(document.querySelectorAll(".self.hover-row")).filter((row) => {
      const link = row.querySelector('a[href*="/cluster"], a[href*="#/cluster"]');
      if (link) return true;
      const text = (row.textContent || "").trim().toLowerCase();
      return text === "cluster" || text.startsWith("cluster");
    });
  }

  function attachTreeActionToggles(rows, entityType) {
    rows.forEach((row) => {
      if (row.querySelector(".sfx-tree-action-host")) return;
      const existingRightAction = row.querySelector(".right-action");
      if (existingRightAction && existingRightAction.querySelector(".dropdown-menu")) return;

      const sourceToggle = existingRightAction
        ? existingRightAction.querySelector(".dropdown-toggle, button, a")
        : row.querySelector(".right-action .dropdown-toggle, .right-action button, .right-action a");
      const { host } = createInjectedTreeDropdown(entityType, sourceToggle);
      if (existingRightAction) {
        host.className = "right-action sfx-tree-action-host";
        while (host.firstChild) {
          existingRightAction.appendChild(host.firstChild);
        }
        existingRightAction.classList.add("right-action", "sfx-tree-action-host");
        return;
      }
      row.classList.add("sfx-tree-action-row");
      row.appendChild(host);
    });
  }

  function attachPartitionTreeActionToggles() {
    attachTreeActionToggles(findPartitionTreeRows(), "partition");
    attachTreeActionToggles(findClusterTreeRows(), "cluster");
  }

  function attachActionDropdowns() {
    const menus = Array.from(document.querySelectorAll(".dropdown-menu")).filter((m) => !m.dataset.sfxReplicaMenuAugmented);
    menus.forEach((menu) => {
      const menuEntityType = getMenuEntityType(menu);
      const restartBtn = Array.from(menu.querySelectorAll("button, a")).find((b) =>
        (b.textContent || "").toLowerCase().includes("restart replica")
      );
      const deleteServiceBtn = Array.from(menu.querySelectorAll("button, a")).find((b) =>
        (b.textContent || "").toLowerCase().includes("delete application")
      );
      const styleSourceBtn = menu.querySelector("button, a");

      const replicaContext = getReplicaMenuContext(menu);
      const hasReplicaContext = !!replicaContext.replicaId;
      if (menuEntityType === "replica" && restartBtn && hasReplicaContext && !menu.dataset.sfxReplicaMenuAugmented) {
        menu.dataset.sfxReplicaMenuAugmented = "1";
        const makeReplicaMenuBtn = (label, forceRemoveFlag) => {
          const btn = document.createElement("button");
          btn.textContent = label;
          btn.className = restartBtn.className || "dropdown-item simple-button";
          btn.addEventListener("click", async (ev) => {
            ev.stopPropagation();
            let { partitionId: pid, replicaId: rid } = helper.getCurrentRouteIds();
            if (!pid || !rid) {
              const link = rid ? document.querySelector(`a[href*="/replica/${rid}"]`) : null;
              const derived = link ? helper.parseIdsFromHref(link.getAttribute("href")) : {};
              pid = pid || derived.partitionId;
              rid = rid || derived.replicaId;
            }
            const nodeName = helper.guessNodeNameFromPage();
            if (!pid || !rid) {
              if (helper.attemptSelectReplica(rid)) return;
            }
            if (!validate(pid, rid, nodeName)) return;
            const confirmed = await confirmDeletion(pid, rid, nodeName, forceRemoveFlag);
            if (!confirmed) return;
            helper.deleteReplica(pid, rid, {
              ...helper.state,
              nodeName,
              forceRemove: forceRemoveFlag
            }).catch((err) => helper.setStatus(err.message, "error"));
          });
          return btn;
        };
        menu.appendChild(makeReplicaMenuBtn("Delete Replica", false));
        menu.appendChild(makeReplicaMenuBtn("Force Delete Replica", true));
      }

      if (menuEntityType === "application" && deleteServiceBtn && !menu.dataset.sfxAppMenuAugmented && helper.isAppUpgradeContext()) {
        menu.dataset.sfxAppMenuAugmented = "1";
        const rollbackBtn = document.createElement("button");
        rollbackBtn.textContent = "Rollback Application";
        rollbackBtn.className = deleteServiceBtn.className || "dropdown-item";
        rollbackBtn.addEventListener("click", async (ev) => {
          ev.stopPropagation();
          let appId = helper.parseIdsFromHref(window.location.href).applicationId;
          if (!appId) {
            const link = document.querySelector('a[href*="/app/"]');
            const derived = link ? helper.parseIdsFromHref(link.getAttribute("href")) : {};
            appId = derived.applicationId;
          }
          if (!appId && menu.closest("[href]")) {
            const derived = helper.parseIdsFromHref(menu.closest("[href]").getAttribute("href"));
            appId = derived.applicationId || appId;
          }
          if (!appId) {
            helper.setStatus("Could not determine application id for rollback.", "error");
            return;
          }
          const normalized = helper.normalizeApplicationId(appId);
          const confirmed = await helper.confirmWithActionModal(
            "Confirm Rollback Application",
            `Application: ${normalized}\napi-version: ${helper.state.apiVersion}`,
            "Rollback Application"
          );
          if (!confirmed) return;
          helper.rollbackApplication(normalized, { ...helper.state }).catch((err) => helper.setStatus(err.message, "error"));
        });
        menu.appendChild(rollbackBtn);
      }

      if (menuEntityType === "cluster" && !menu.dataset.sfxClusterMenuAugmented) {
        menu.dataset.sfxClusterMenuAugmented = "1";
        const rollbackClusterBtn = document.createElement("button");
        rollbackClusterBtn.textContent = "Rollback Cluster Upgrade";
        rollbackClusterBtn.className = (styleSourceBtn && styleSourceBtn.className) || "dropdown-item";
        rollbackClusterBtn.addEventListener("click", async (ev) => {
          ev.stopPropagation();
          const confirmed = await helper.confirmWithActionModal(
            "Confirm Rollback Cluster Upgrade",
            "Action: RollbackClusterUpgrade\napi-version: 6.0",
            "Rollback Cluster Upgrade"
          );
          if (!confirmed) return;
          helper.rollbackClusterUpgrade({ apiVersion: "6.0" }).catch((err) => helper.setStatus(err.message, "error"));
        });
        menu.appendChild(rollbackClusterBtn);

        const getChaosBtn = document.createElement("button");
        getChaosBtn.textContent = "Get Chaos";
        getChaosBtn.className = (styleSourceBtn && styleSourceBtn.className) || "dropdown-item";
        getChaosBtn.addEventListener("click", async (ev) => {
          ev.stopPropagation();
          try {
            const chaos = await helper.getChaos({ apiVersion: "6.2" });
            await helper.showMessageModal("Chaos Status", JSON.stringify(chaos, null, 2));
          } catch (err) {
            helper.setStatus(err.message, "error");
          }
        });
        menu.appendChild(getChaosBtn);

        const startChaosBtn = document.createElement("button");
        startChaosBtn.textContent = "Start Chaos";
        startChaosBtn.className = (styleSourceBtn && styleSourceBtn.className) || "dropdown-item";
        startChaosBtn.addEventListener("click", async (ev) => {
          ev.stopPropagation();
          try {
            const input = await helper.promptStartChaosInput();
            if (!input) return;
            const confirmed = await helper.confirmWithActionModal(
              "Confirm Start Chaos",
              `api-version: 6.0\nChaosParameters:\n${JSON.stringify(input.chaosParameters, null, 2)}`,
              "Start Chaos"
            );
            if (!confirmed) return;
            await helper.startChaos(input.chaosParameters, { apiVersion: "6.0", timeout: input.timeout });
          } catch (err) {
            helper.setStatus(err.message, "error");
          }
        });
        menu.appendChild(startChaosBtn);

        const stopChaosBtn = document.createElement("button");
        stopChaosBtn.textContent = "Stop Chaos";
        stopChaosBtn.className = (styleSourceBtn && styleSourceBtn.className) || "dropdown-item";
        stopChaosBtn.addEventListener("click", async (ev) => {
          ev.stopPropagation();
          const confirmed = await helper.confirmWithActionModal(
            "Confirm Stop Chaos",
            "Action: StopChaos\napi-version: 6.0",
            "Stop Chaos"
          );
          if (!confirmed) return;
          helper.stopChaos({ apiVersion: "6.0" }).catch((err) => helper.setStatus(err.message, "error"));
        });
        menu.appendChild(stopChaosBtn);

        const getChaosEventsBtn = document.createElement("button");
        getChaosEventsBtn.textContent = "Get Chaos Events";
        getChaosEventsBtn.className = (styleSourceBtn && styleSourceBtn.className) || "dropdown-item";
        getChaosEventsBtn.addEventListener("click", async (ev) => {
          ev.stopPropagation();
          try {
            const input = await helper.promptChaosEventsInput();
            if (!input) return;
            const result = await helper.getChaosEvents({
              apiVersion: "6.2",
              continuationToken: input.continuationToken,
              startTimeUtc: input.startTimeUtc,
              endTimeUtc: input.endTimeUtc,
              maxResults: input.maxResults,
              timeout: input.timeout
            });
            await helper.showMessageModal("Chaos Events", JSON.stringify(result, null, 2));
          } catch (err) {
            helper.setStatus(err.message, "error");
          }
        });
        menu.appendChild(getChaosEventsBtn);

        const getChaosScheduleBtn = document.createElement("button");
        getChaosScheduleBtn.textContent = "Get Chaos Schedule";
        getChaosScheduleBtn.className = (styleSourceBtn && styleSourceBtn.className) || "dropdown-item";
        getChaosScheduleBtn.addEventListener("click", async (ev) => {
          ev.stopPropagation();
          try {
            const schedule = await helper.getChaosSchedule({ apiVersion: "6.2" });
            await helper.showMessageModal("Chaos Schedule", JSON.stringify(schedule, null, 2));
          } catch (err) {
            helper.setStatus(err.message, "error");
          }
        });
        menu.appendChild(getChaosScheduleBtn);

        const setChaosScheduleBtn = document.createElement("button");
        setChaosScheduleBtn.textContent = "Set Chaos Schedule";
        setChaosScheduleBtn.className = (styleSourceBtn && styleSourceBtn.className) || "dropdown-item";
        setChaosScheduleBtn.addEventListener("click", async (ev) => {
          ev.stopPropagation();
          try {
            const currentSchedule = await helper.getChaosSchedule({ apiVersion: "6.2" });
            const input = await helper.promptChaosScheduleInput(currentSchedule);
            if (!input) return;
            const confirmed = await helper.confirmWithActionModal(
              "Confirm Set Chaos Schedule",
              `api-version: 6.2\nChaosScheduleDescription:\n${JSON.stringify(input.schedule, null, 2)}`,
              "Set Chaos Schedule"
            );
            if (!confirmed) return;
            await helper.postChaosSchedule(input.schedule, { apiVersion: "6.2", timeout: input.timeout });
          } catch (err) {
            helper.setStatus(err.message, "error");
          }
        });
        menu.appendChild(setChaosScheduleBtn);
      }

      const serviceContext = helper.collectRouteServiceContext(menu);
      if (menuEntityType === "service" && serviceContext.serviceId && !menu.dataset.sfxServiceMenuAugmented) {
        menu.dataset.sfxServiceMenuAugmented = "1";
        const hasNativeScaleServiceBtn = Array.from(menu.querySelectorAll("button, a")).some(
          (el) => (el.textContent || "").trim().toLowerCase() === "scale service"
        );
        if (!hasNativeScaleServiceBtn) {
          const scaleServiceBtn = document.createElement("button");
          scaleServiceBtn.textContent = "Scale Service";
          scaleServiceBtn.className = (styleSourceBtn && styleSourceBtn.className) || "dropdown-item";
          scaleServiceBtn.addEventListener("click", async (ev) => {
            ev.stopPropagation();
            const context = helper.collectRouteServiceContext(menu);
            const serviceId = helper.normalizeServiceId(context.serviceId || "");
            if (!serviceId) {
              helper.setStatus("Could not determine service id for scale.", "error");
              return;
            }
            try {
              const description = await helper.getServiceDescription(serviceId, { apiVersion: "6.0" });
              const update = await helper.promptScaleServiceInput(serviceId, description);
              if (!update) return;
              await helper.updateServiceScale(serviceId, update, { apiVersion: "6.0", timeout: update.timeout });
            } catch (err) {
              helper.setStatus(err.message, "error");
            }
          });
          menu.appendChild(scaleServiceBtn);
        }

        const updateServiceBtn = document.createElement("button");
        updateServiceBtn.textContent = "Update Service";
        updateServiceBtn.className = (styleSourceBtn && styleSourceBtn.className) || "dropdown-item";
        updateServiceBtn.addEventListener("click", async (ev) => {
          ev.stopPropagation();
          const context = helper.collectRouteServiceContext(menu);
          const serviceId = helper.normalizeServiceId(context.serviceId || "");
          if (!serviceId) {
            helper.setStatus("Could not determine service id for update.", "error");
            return;
          }
          try {
            const description = await helper.getServiceDescription(serviceId, { apiVersion: "6.0" });
            const update = await helper.promptUpdateServiceInput(serviceId, description);
            if (!update) return;
            await helper.updateService(serviceId, update, { apiVersion: "6.0", timeout: update.timeout });
          } catch (err) {
            helper.setStatus(err.message, "error");
          }
        });
        menu.appendChild(updateServiceBtn);

        const recoverServicePartitionsBtn = document.createElement("button");
        recoverServicePartitionsBtn.textContent = "Recover Service Partitions";
        recoverServicePartitionsBtn.className = (styleSourceBtn && styleSourceBtn.className) || "dropdown-item";
        recoverServicePartitionsBtn.addEventListener("click", async (ev) => {
          ev.stopPropagation();
          const context = helper.collectRouteServiceContext(menu);
          const serviceId = helper.normalizeServiceId(context.serviceId || "");
          if (!serviceId) {
            helper.setStatus("Could not determine service id for recover service partitions.", "error");
            return;
          }
          const input = { action: "RecoverServicePartitions", serviceId };
          const confirmed = await confirmPartitionAction(
            "RecoverServicePartitions",
            { serviceId, apiVersion: "6.0" },
            "Recover Service Partitions"
          );
          if (!confirmed) return;
          helper.runPartitionAction(input).catch((err) => helper.setStatus(err.message, "error"));
        });
        menu.appendChild(recoverServicePartitionsBtn);
      }

      const partitionContext = helper.collectRoutePartitionContext(menu);
      const hasPartitionContext = !!partitionContext.partitionId || !!partitionContext.serviceId;
      if (menuEntityType === "partition" && hasPartitionContext && !menu.dataset.sfxPartitionMenuAugmented && !menu.dataset.sfxPartitionMenuPending) {
        menu.dataset.sfxPartitionMenuPending = "1";
        const menuClassName = (styleSourceBtn && styleSourceBtn.className) || "dropdown-item";
        const addPartitionActionBtn = (label, buildInput, buildConfirm) => {
          const btn = document.createElement("button");
          btn.textContent = label;
          btn.className = menuClassName;
          btn.addEventListener("click", async (ev) => {
            ev.stopPropagation();
            try {
              const context = helper.collectRoutePartitionContext(menu);
              const input = await buildInput(context);
              if (!input) return;
              const confirmed = await buildConfirm(input);
              if (!confirmed) return;
              helper.runPartitionAction(input).catch((err) => helper.setStatus(err.message, "error"));
            } catch (err) {
              helper.setStatus(err.message, "error");
            }
          });
          menu.appendChild(btn);
        };
        (async () => {
          try {
            const currentContext = helper.collectRoutePartitionContext(menu);
            const currentPartitionId = String(currentContext.partitionId || "").trim();
            const currentServiceId = helper.normalizeServiceId(currentContext.serviceId || "");
            const serviceKind = currentServiceId ? await getServiceKind(currentServiceId) : "";
            const isStateful = serviceKind === "Stateful";
            const isStateless = serviceKind === "Stateless";

            if (currentPartitionId) {
              addPartitionActionBtn(
                "Recover Partition",
                (context) => ({
                  action: "RecoverPartition",
                  partitionId: String(context.partitionId || "").trim()
                }),
                (input) =>
                  confirmPartitionAction("RecoverPartition", { partitionId: input.partitionId, apiVersion: "6.0" }, "Recover Partition")
              );

              addPartitionActionBtn(
                "Reset Partition Load",
                (context) => ({
                  action: "ResetPartitionLoad",
                  partitionId: String(context.partitionId || "").trim()
                }),
                (input) =>
                  confirmPartitionAction("ResetPartitionLoad", { partitionId: input.partitionId, apiVersion: "6.0" }, "Reset Partition Load")
              );

              if (isStateful || !currentServiceId) {
                addPartitionActionBtn(
                  "Move Primary Replica",
                  async (context) => helper.promptMovePrimaryReplicaInput(String(context.partitionId || "").trim()),
                  async (input) => !!input
                );

                addPartitionActionBtn(
                  "Move Secondary Replica",
                  async (context) => helper.promptMoveSecondaryReplicaInput(String(context.partitionId || "").trim()),
                  async (input) => !!input
                );
              }

              if (isStateful) {
                addPartitionActionBtn(
                  "Backup Partition",
                  async (context) => helper.promptPartitionBackupInput(String(context.partitionId || "").trim()),
                  async (input) =>
                    !!input &&
                    (await confirmPartitionAction("BackupPartition", { partitionId: input.partitionId, apiVersion: "6.4" }, "Backup Partition"))
                );

                addPartitionActionBtn(
                  "Get Backup Progress",
                  async (context) => {
                    const input = await helper.promptPartitionBackupProgressInput(String(context.partitionId || "").trim());
                    if (!input) return null;
                    try {
                      const progress = await helper.getPartitionBackupProgress(String(context.partitionId || "").trim(), {
                        apiVersion: "6.4",
                        timeout: input.timeout
                      });
                      await helper.showMessageModal("Partition Backup Progress", JSON.stringify(progress, null, 2));
                    } catch (err) {
                      helper.setStatus(err.message, "error");
                    }
                    return null;
                  },
                  async () => false
                );

                addPartitionActionBtn(
                  "Restore Partition",
                  async (context) => helper.promptPartitionRestoreInput(String(context.partitionId || "").trim()),
                  async (input) =>
                    !!input &&
                    (await confirmPartitionAction("RestorePartition", { partitionId: input.partitionId, apiVersion: "6.4" }, "Restore Partition"))
                );

                addPartitionActionBtn(
                  "Get Restore Progress",
                  async (context) => {
                    const input = await helper.promptPartitionRestoreProgressInput(String(context.partitionId || "").trim());
                    if (!input) return null;
                    try {
                      const progress = await helper.getPartitionRestoreProgress(String(context.partitionId || "").trim(), {
                        apiVersion: "6.4",
                        timeout: input.timeout
                      });
                      await helper.showMessageModal("Partition Restore Progress", JSON.stringify(progress, null, 2));
                    } catch (err) {
                      helper.setStatus(err.message, "error");
                    }
                    return null;
                  },
                  async () => false
                );
              }
            }

            if (currentPartitionId && currentServiceId) {
              if (isStateless) {
                addPartitionActionBtn(
                  "Move Instance",
                  async (context) => {
                    const serviceId = helper.normalizeServiceId(context.serviceId || "");
                    const partitionId = String(context.partitionId || "").trim();
                    return helper.promptMoveInstanceInput(serviceId, partitionId);
                  },
                  async (input) =>
                    !!input &&
                    (await confirmPartitionAction(
                      "MoveInstance",
                      { serviceId: input.serviceId, partitionId: input.partitionId, apiVersion: "8.0" },
                      "Move Instance"
                    ))
                );
              }

              if (isStateful) {
                addPartitionActionBtn(
                  "Start Data Loss",
                  (context) => ({
                    action: "StartDataLoss",
                    partitionId: String(context.partitionId || "").trim(),
                    serviceId: helper.normalizeServiceId(context.serviceId || ""),
                    operationId: helper.generateOperationId()
                  }),
                  (input) => helper.confirmStartDataLoss(input.serviceId, input.partitionId, input.operationId)
                );
              }

              if (serviceKind) {
                addPartitionActionBtn(
                  "Start Partition Restart",
                  async (context) => {
                    const serviceId = helper.normalizeServiceId(context.serviceId || "");
                    const partitionId = String(context.partitionId || "").trim();
                    return helper.promptStartPartitionRestartInput(serviceId, partitionId, serviceKind);
                  },
                  (input) =>
                    confirmPartitionAction(
                      "StartPartitionRestart",
                      {
                        serviceId: input.serviceId,
                        partitionId: input.partitionId,
                        operationId: input.operationId,
                        restartPartitionMode: input.restartPartitionMode,
                        apiVersion: "6.0"
                      },
                      "Start Partition Restart"
                    )
                );

                addPartitionActionBtn(
                  "Get Restart Progress",
                  async (context) => {
                    const serviceId = helper.normalizeServiceId(context.serviceId || "");
                    const partitionId = String(context.partitionId || "").trim();
                    const input = await helper.promptPartitionRestartProgressInput(serviceId, partitionId);
                    if (!input) return null;
                    try {
                      const progress = await helper.getPartitionRestartProgress(serviceId, partitionId, input.operationId, {
                        apiVersion: "6.0",
                        timeout: input.timeout
                      });
                      await helper.showMessageModal("Partition Restart Progress", JSON.stringify(progress, null, 2));
                    } catch (err) {
                      helper.setStatus(err.message, "error");
                    }
                    return null;
                  },
                  async () => false
                );
              }
            }
          } finally {
            delete menu.dataset.sfxPartitionMenuPending;
            menu.dataset.sfxPartitionMenuAugmented = "1";
          }
        })();
      }

      const menuActions = Array.from(menu.querySelectorAll("button, a")).map((b) => (b.textContent || "").trim().toLowerCase());
      const isNodeRoute = !!helper.parseIdsFromHref(window.location.href).nodeName || /\/node\//i.test(window.location.href || "");
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
        const nodeStyleSourceBtn = menu.querySelector("button, a");
        const createRepairTaskBtn = document.createElement("button");
        createRepairTaskBtn.textContent = "Create Repair Task";
        createRepairTaskBtn.className = (nodeStyleSourceBtn && nodeStyleSourceBtn.className) || "dropdown-item";
        createRepairTaskBtn.addEventListener("click", async (ev) => {
          ev.stopPropagation();
          const routeIds = helper.getCurrentRouteIds();
          let nodeName = routeIds.nodeName || helper.guessNodeNameFromPage();
          if (!nodeName) {
            const link = document.querySelector('a[href*="#/node/"], a[href*="/node/"]');
            const derived = link ? helper.parseIdsFromHref(link.getAttribute("href")) : {};
            nodeName = derived.nodeName || "";
          }
          const repairTask = await helper.promptRepairTaskInput(nodeName);
          if (!repairTask) return;

          const confirmed = await helper.confirmWithActionModal(
            "Confirm Create Repair Task",
            `TaskId: ${repairTask.TaskId}\nAction: ${repairTask.Action}\nState: ${repairTask.State}\nNodes: ${
              repairTask.Target.NodeNames.join(", ")
            }\napi-version: 6.0`,
            "Create Repair Task"
          );
          if (!confirmed) return;
          helper.createRepairTask(repairTask, { apiVersion: "6.0" }).catch((err) => helper.setStatus(err.message, "error"));
        });
        menu.appendChild(createRepairTaskBtn);
      }
    });
  }

  Object.assign(helper, {
    validate,
    confirmPartitionAction,
    getReplicaMenuContext,
    confirmDeletion,
    extractReplicaId,
    tryAttachInlineButtons,
    tryAttachRepairTaskCancelButtons,
    closeInjectedTreeDropdowns,
    positionInjectedTreeDropdown,
    ensureInjectedTreeDropdownOverlay,
    repositionOpenInjectedTreeDropdowns,
    applyNativeTreeToggleSizing,
    createInjectedTreeDropdown,
    findPartitionTreeRows,
    attachPartitionTreeActionToggles,
    attachActionDropdowns
  });
})();
