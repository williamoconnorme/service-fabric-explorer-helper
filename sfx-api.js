(() => {
  const helper = (window.SfxHelper = window.SfxHelper || {});
  if (helper.apiLoaded) return;
  helper.apiLoaded = true;

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
    const bearer = helper.findBearerToken();
    helper.setStatus(`Deleting replica ${replicaId} on ${nodeName}...`);
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
    helper.setStatus(`Replica ${replicaId} delete requested.`, "success");
  }

  async function rollbackApplication(appId, options) {
    const { apiVersion, timeout } = options;
    const normalizedAppId = helper.normalizeApplicationId(appId);
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
    const bearer = helper.findBearerToken();
    helper.setStatus(`Rolling back application ${normalizedAppId}...`);
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
    helper.setStatus(`Rollback requested for ${appId}.`, "success");
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

    const bearer = helper.findBearerToken();
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

    const bearer = helper.findBearerToken();
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

  async function getServiceDescription(serviceId, options = {}) {
    const normalizedServiceId = helper.normalizeServiceId(serviceId);
    if (!normalizedServiceId) {
      throw new Error("Missing service id.");
    }
    return getSfJson(`/Services/${encodeURIComponent(normalizedServiceId)}/$/GetDescription`, {
      apiVersion: options.apiVersion || "6.0",
      query: { timeout: options.timeout }
    });
  }

  async function updateServiceScale(serviceId, update, options = {}) {
    const normalizedServiceId = helper.normalizeServiceId(serviceId);
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

    helper.setStatus(`Scaling service ${normalizedServiceId}...`);
    await postSfAction(`/Services/${encodeURIComponent(normalizedServiceId)}/$/Update`, {
      apiVersion: options.apiVersion || "6.0",
      query: { timeout: options.timeout },
      body
    });
    helper.setStatus(`Scale requested for service ${normalizedServiceId}.`, "success");
  }

  const STATELESS_UPDATE_FLAGS = {
    InstanceCount: 0x0001,
    PlacementConstraints: 0x0002,
    ServicePlacementPolicies: 0x0004,
    CorrelationScheme: 0x0008,
    LoadMetrics: 0x0010,
    DefaultMoveCost: 0x0020,
    ScalingPolicies: 0x0040,
    MinInstanceCount: 0x0080,
    MinInstancePercentage: 0x0100,
    InstanceCloseDelayDurationSeconds: 0x0200,
    InstanceRestartWaitDurationSeconds: 0x0400,
    ServiceDnsName: 0x0800,
    TagsForPlacement: 0x2000,
    TagsForRunning: 0x4000
  };

  const STATEFUL_UPDATE_FLAGS = {
    TargetReplicaSetSize: 0x0001,
    ReplicaRestartWaitDurationSeconds: 0x0002,
    QuorumLossWaitDurationSeconds: 0x0004,
    StandByReplicaKeepDurationSeconds: 0x0008,
    MinReplicaSetSize: 0x0010,
    PlacementConstraints: 0x0020,
    ServicePlacementPolicies: 0x0040,
    CorrelationScheme: 0x0080,
    LoadMetrics: 0x0100,
    DefaultMoveCost: 0x0200,
    ScalingPolicies: 0x0400,
    ServicePlacementTimeLimitSeconds: 0x0800,
    DropSourceReplicaOnMove: 0x1000,
    ServiceDnsName: 0x2000,
    TagsForPlacement: 0x10000,
    TagsForRunning: 0x20000,
    AuxiliaryReplicaCount: 0x40000
  };

  const DEFAULT_MOVE_COST_OPTIONS = ["Zero", "Low", "Medium", "High", "VeryHigh"];

  function getServiceUpdateFieldDefinitions(serviceKind) {
    const common = [
      {
        name: "PlacementConstraints",
        label: "Placement Constraints",
        type: "text",
        placeholder: "(NodeType==backend)"
      },
      {
        name: "ServicePlacementPolicies",
        label: "Service Placement Policies",
        type: "textarea",
        parseType: "json",
        rows: 4,
        placeholder: '[{"Type":"InvalidDomain","DomainName":"fd:/dc1"}]'
      },
      {
        name: "CorrelationScheme",
        label: "Correlation Scheme",
        type: "textarea",
        parseType: "json",
        rows: 4,
        placeholder: '[{"ServiceName":"fabric:/App/OtherService","Scheme":"AlignedAffinity"}]'
      },
      {
        name: "LoadMetrics",
        label: "Load Metrics",
        type: "textarea",
        parseType: "json",
        rows: 4,
        placeholder: '[{"Name":"MetricA","Weight":"High","PrimaryDefaultLoad":5,"SecondaryDefaultLoad":1}]'
      },
      {
        name: "DefaultMoveCost",
        label: "Default Move Cost",
        type: "select",
        parseType: "enum",
        options: [{ value: "", label: "(leave unset)" }, ...DEFAULT_MOVE_COST_OPTIONS.map((value) => ({ value, label: value }))]
      },
      {
        name: "ScalingPolicies",
        label: "Scaling Policies",
        type: "textarea",
        parseType: "json",
        rows: 4,
        placeholder: '[{"ScalingTrigger":{...},"ScalingMechanism":{...}}]'
      },
      {
        name: "ServiceDnsName",
        label: "Service DNS Name",
        type: "text"
      },
      {
        name: "TagsForPlacement",
        label: "Tags For Placement",
        type: "text"
      },
      {
        name: "TagsForRunning",
        label: "Tags For Running",
        type: "text"
      }
    ];

    if (serviceKind === "Stateful") {
      return [
        { name: "TargetReplicaSetSize", label: "Target Replica Set Size", type: "number", parseType: "integer" },
        { name: "MinReplicaSetSize", label: "Min Replica Set Size", type: "number", parseType: "integer" },
        {
          name: "ReplicaRestartWaitDurationSeconds",
          label: "Replica Restart Wait Duration Seconds",
          type: "number",
          parseType: "integer"
        },
        {
          name: "QuorumLossWaitDurationSeconds",
          label: "Quorum Loss Wait Duration Seconds",
          type: "number",
          parseType: "integer"
        },
        {
          name: "StandByReplicaKeepDurationSeconds",
          label: "StandBy Replica Keep Duration Seconds",
          type: "number",
          parseType: "integer"
        },
        {
          name: "ServicePlacementTimeLimitSeconds",
          label: "Service Placement Time Limit Seconds",
          type: "number",
          parseType: "integer"
        },
        {
          name: "DropSourceReplicaOnMove",
          label: "Drop Source Replica On Move",
          type: "select",
          parseType: "boolean",
          options: [
            { value: "", label: "(leave unset)" },
            { value: "true", label: "true" },
            { value: "false", label: "false" }
          ]
        },
        { name: "AuxiliaryReplicaCount", label: "Auxiliary Replica Count", type: "number", parseType: "integer" },
        ...common
      ];
    }

    return [
      { name: "InstanceCount", label: "Instance Count", type: "number", parseType: "integer" },
      { name: "MinInstanceCount", label: "Min Instance Count", type: "number", parseType: "integer" },
      { name: "MinInstancePercentage", label: "Min Instance Percentage", type: "number", parseType: "integer" },
      {
        name: "InstanceCloseDelayDurationSeconds",
        label: "Instance Close Delay Duration Seconds",
        type: "number",
        parseType: "integer"
      },
      {
        name: "InstanceRestartWaitDurationSeconds",
        label: "Instance Restart Wait Duration Seconds",
        type: "number",
        parseType: "integer"
      },
      ...common
    ];
  }

  function getServiceUpdateFieldOrder(serviceKind) {
    return getServiceUpdateFieldDefinitions(serviceKind).map((field) => field.name);
  }

  function toServiceUpdateFieldValue(value, parseType) {
    if (value === undefined || value === null) return "";
    if (parseType === "boolean") return value ? "true" : "false";
    if (parseType === "json") return JSON.stringify(value, null, 2);
    return String(value);
  }

  function buildServiceUpdateModel(serviceDescription) {
    const serviceKind = String(
      serviceDescription.ServiceKind || serviceDescription.serviceKind || serviceDescription.Kind || ""
    ).trim();
    if (serviceKind !== "Stateful" && serviceKind !== "Stateless") {
      throw new Error(`Unsupported service kind for update: ${serviceKind || "unknown"}`);
    }

    const model = { ServiceKind: serviceKind };
    getServiceUpdateFieldOrder(serviceKind).forEach((key) => {
      if (serviceDescription[key] !== undefined) {
        model[key] = serviceDescription[key];
      }
    });
    return model;
  }

  function computeServiceUpdateFlags(serviceKind, updateBody) {
    const map = serviceKind === "Stateful" ? STATEFUL_UPDATE_FLAGS : STATELESS_UPDATE_FLAGS;
    let flags = 0;
    Object.entries(map).forEach(([key, flag]) => {
      if (Object.prototype.hasOwnProperty.call(updateBody, key)) {
        flags |= flag;
      }
    });
    return flags;
  }

  function parseServiceUpdateInteger(rawValue, label) {
    const trimmed = String(rawValue || "").trim();
    if (!trimmed) return undefined;
    const parsed = Number(trimmed);
    if (!Number.isFinite(parsed) || !Number.isInteger(parsed)) {
      throw new Error(`${label} must be an integer.`);
    }
    return trimmed;
  }

  function parseServiceUpdateJson(rawValue, label) {
    const trimmed = String(rawValue || "").trim();
    if (!trimmed) return undefined;
    try {
      return JSON.parse(trimmed);
    } catch (err) {
      throw new Error(`${label} must be valid JSON: ${err.message}`);
    }
  }

  function parseServiceUpdateField(field, rawValue) {
    const trimmed = typeof rawValue === "string" ? rawValue.trim() : rawValue;
    if (field.parseType === "integer") {
      return parseServiceUpdateInteger(rawValue, field.label || field.name);
    }
    if (field.parseType === "json") {
      return parseServiceUpdateJson(rawValue, field.label || field.name);
    }
    if (field.parseType === "boolean") {
      if (!trimmed) return undefined;
      const parsed = helper.parseOptionalBool(trimmed);
      if (parsed === null) {
        throw new Error(`${field.label || field.name} must be true or false.`);
      }
      return parsed;
    }
    if (field.parseType === "enum") {
      if (!trimmed) return undefined;
      if (!DEFAULT_MOVE_COST_OPTIONS.includes(trimmed)) {
        throw new Error(`${field.label || field.name} has an unsupported value.`);
      }
      return trimmed;
    }
    if (trimmed === undefined || trimmed === null || trimmed === "") {
      return undefined;
    }
    return trimmed;
  }

  async function promptUpdateServiceInput(serviceId, serviceDescription) {
    const serviceKind = String(
      serviceDescription.ServiceKind || serviceDescription.serviceKind || serviceDescription.Kind || ""
    ).trim();
    if (serviceKind !== "Stateful" && serviceKind !== "Stateless") {
      throw new Error(`Unsupported service kind for update: ${serviceKind || "unknown"}`);
    }

    const fieldDefinitions = getServiceUpdateFieldDefinitions(serviceKind);
    const values = await helper.openActionModal({
      title: `Update ${serviceKind} Service`,
      submitLabel: "Update Service",
      cancelLabel: "Cancel",
      message: `ServiceId: ${serviceId}\nLeave a field blank to omit it from the update payload.`,
      fields: [
        ...fieldDefinitions.map((field) => ({
          ...field,
          value: toServiceUpdateFieldValue(serviceDescription[field.name], field.parseType)
        })),
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

    const body = { ServiceKind: serviceKind };
    fieldDefinitions.forEach((field) => {
      const parsedValue = parseServiceUpdateField(field, values[field.name]);
      if (parsedValue !== undefined) {
        body[field.name] = parsedValue;
      }
    });

    const flags = computeServiceUpdateFlags(serviceKind, body);
    if (!flags) {
      throw new Error("Set at least one update field before submitting Update Service.");
    }
    body.Flags = String(flags);

    return {
      serviceKind,
      timeout: helper.parseOptionalInt(values.timeout),
      body
    };
  }

  async function updateService(serviceId, update, options = {}) {
    const normalizedServiceId = helper.normalizeServiceId(serviceId);
    if (!normalizedServiceId) {
      throw new Error("Missing service id for update.");
    }
    helper.setStatus(`Updating service ${normalizedServiceId}...`);
    await postSfAction(`/Services/${encodeURIComponent(normalizedServiceId)}/$/Update`, {
      apiVersion: options.apiVersion || "6.0",
      query: { timeout: options.timeout },
      body: update.body
    });
    helper.setStatus(`UpdateService requested for ${normalizedServiceId}.`, "success");
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

    const values = await helper.openActionModal({
      title: `Scale ${serviceKind} Service`,
      submitLabel: "Scale Service",
      cancelLabel: "Cancel",
      message: `ServiceId: ${serviceId}`,
      fields
    });
    if (!values) return null;

    const timeout = helper.parseOptionalInt(values.timeout);
    if (serviceKind === "Stateful") {
      const targetReplicaSetSize = helper.parseOptionalInt(values.targetReplicaSetSize);
      const minReplicaSetSize = helper.parseOptionalInt(values.minReplicaSetSize);
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

    const instanceCount = helper.parseOptionalInt(values.instanceCount);
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
    const values = await helper.openActionModal({
      title: "Move Primary Replica",
      submitLabel: "Move Primary Replica",
      cancelLabel: "Cancel",
      message: `PartitionId: ${partitionId}`,
      fields: [
        { name: "nodeName", label: "Target Node Name (optional)", value: "", required: false },
        { name: "ignoreConstraints", label: "Ignore Constraints", type: "checkbox", value: false, required: false },
        { name: "timeout", label: "timeout (seconds, optional)", type: "number", value: "", required: false }
      ]
    });
    if (!values) return null;
    return {
      action: "MovePrimaryReplica",
      partitionId,
      nodeName: String(values.nodeName || "").trim(),
      force: !!values.ignoreConstraints,
      timeout: helper.parseOptionalInt(values.timeout)
    };
  }

  async function promptMoveSecondaryReplicaInput(partitionId) {
    const values = await helper.openActionModal({
      title: "Move Secondary Replica",
      submitLabel: "Move Secondary Replica",
      cancelLabel: "Cancel",
      message: `PartitionId: ${partitionId}`,
      fields: [
        { name: "currentNodeName", label: "Current Node Name", value: "", required: true },
        { name: "newNodeName", label: "New Node Name (optional)", value: "", required: false },
        { name: "ignoreConstraints", label: "Ignore Constraints", type: "checkbox", value: false, required: false },
        { name: "timeout", label: "timeout (seconds, optional)", type: "number", value: "", required: false }
      ]
    });
    if (!values) return null;
    return {
      action: "MoveSecondaryReplica",
      partitionId,
      currentNodeName: String(values.currentNodeName || "").trim(),
      newNodeName: String(values.newNodeName || "").trim(),
      force: !!values.ignoreConstraints,
      timeout: helper.parseOptionalInt(values.timeout)
    };
  }

  async function runPartitionAction(input) {
    const action = String(input.action || "").trim();
    const partitionId = String(input.partitionId || "").trim();
    const serviceId = helper.normalizeServiceId(input.serviceId || "");
    const timeout = helper.parseOptionalInt(input.timeout);
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
      helper.setStatus(`Recovering partition ${partitionId}...`);
      await postSfAction(`/Partitions/${encodeURIComponent(partitionId)}/$/Recover`, {
        apiVersion: "6.0",
        query: { timeout }
      });
      helper.setStatus(`Recover requested for partition ${partitionId}.`, "success");
      return;
    }
    if (action === "ResetPartitionLoad") {
      helper.setStatus(`Resetting load for partition ${partitionId}...`);
      await postSfAction(`/Partitions/${encodeURIComponent(partitionId)}/$/ResetLoad`, {
        apiVersion: "6.0",
        query: { timeout }
      });
      helper.setStatus(`Reset load requested for partition ${partitionId}.`, "success");
      return;
    }
    if (action === "StartDataLoss") {
      const operationId = String(input.operationId || "").trim() || helper.generateOperationId();
      helper.setStatus(`Starting data loss for service ${serviceId}, partition ${partitionId}...`);
      await postSfAction(
        `/Faults/Services/${encodeURIComponent(serviceId)}/$/GetPartitions/${encodeURIComponent(partitionId)}/$/StartDataLoss`,
        {
          apiVersion: "6.0",
          query: {
            OperationId: operationId,
            DataLossMode: "FullDataLoss",
            timeout
          }
        }
      );
      helper.setStatus(`StartDataLoss accepted for partition ${partitionId}. OperationId: ${operationId}`, "success");
      return;
    }
    if (action === "RecoverServicePartitions") {
      if (!serviceId) throw new Error("ServiceId is required for RecoverServicePartitions.");
      helper.setStatus(`Recovering all partitions for service ${serviceId}...`);
      await postSfAction(`/Services/${encodeURIComponent(serviceId)}/$/GetPartitions/$/Recover`, {
        apiVersion: "6.0",
        query: { timeout }
      });
      helper.setStatus(`Recover requested for all partitions of ${serviceId}.`, "success");
      return;
    }
    if (action === "RecoverSystemPartitions") {
      helper.setStatus("Recovering all system service partitions...");
      await postSfAction("/$/RecoverSystemPartitions", { apiVersion: "6.0", query: { timeout } });
      helper.setStatus("Recover requested for system service partitions.", "success");
      return;
    }
    if (action === "RecoverAllPartitions") {
      helper.setStatus("Recovering all service partitions...");
      await postSfAction("/$/RecoverAllPartitions", { apiVersion: "6.0", query: { timeout } });
      helper.setStatus("Recover requested for all service partitions.", "success");
      return;
    }
    if (action === "MovePrimaryReplica") {
      const nodeName = String(input.nodeName || "").trim();
      helper.setStatus(
        nodeName
          ? `Moving primary replica for ${partitionId} to ${nodeName}...`
          : `Moving primary replica for ${partitionId} to a random eligible node...`
      );
      await postSfAction(`/Partitions/${encodeURIComponent(partitionId)}/$/MovePrimaryReplica`, {
        apiVersion: "6.5",
        query: { NodeName: nodeName, IgnoreConstraints: force, timeout }
      });
      helper.setStatus(`MovePrimaryReplica requested for partition ${partitionId}.`, "success");
      return;
    }
    if (action === "MoveSecondaryReplica") {
      const currentNodeName = String(input.currentNodeName || "").trim();
      const newNodeName = String(input.newNodeName || "").trim();
      if (!currentNodeName) {
        throw new Error("CurrentNodeName is required for MoveSecondaryReplica.");
      }
      helper.setStatus(
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
      helper.setStatus(`MoveSecondaryReplica requested for partition ${partitionId}.`, "success");
      return;
    }
    if (action === "MoveInstance") {
      const currentNodeName = String(input.currentNodeName || "").trim();
      const newNodeName = String(input.newNodeName || "").trim();
      if (!currentNodeName || !newNodeName) {
        throw new Error("CurrentNodeName and NewNodeName are required for MoveInstance.");
      }
      helper.setStatus(`Moving instance for ${serviceId}/${partitionId} from ${currentNodeName} to ${newNodeName}...`);
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
      helper.setStatus(`MoveInstance requested for partition ${partitionId}.`, "success");
      return;
    }
    if (action === "MoveAuxiliaryReplica") {
      const currentNodeName = String(input.currentNodeName || "").trim();
      const newNodeName = String(input.newNodeName || "").trim();
      if (!currentNodeName || !newNodeName) {
        throw new Error("CurrentNodeName and NewNodeName are required for MoveAuxiliaryReplica.");
      }
      helper.setStatus(
        `Moving auxiliary replica for ${serviceId}/${partitionId} from ${currentNodeName} to ${newNodeName}...`
      );
      await postSfAction(
        `/Services/${encodeURIComponent(serviceId)}/$/GetPartitions/${encodeURIComponent(partitionId)}/$/MoveAuxiliaryReplica`,
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
      helper.setStatus(`MoveAuxiliaryReplica requested for partition ${partitionId}.`, "success");
      return;
    }
    if (action === "UpdatePartitionLoad") {
      const metricName = String(input.metricName || "").trim();
      const metricCurrentLoad = helper.parseOptionalInt(input.metricCurrentLoad);
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
      helper.setStatus(`Updating partition load for ${partitionId}...`);
      await postSfAction("/$/UpdatePartitionLoad", {
        apiVersion: "7.2",
        body,
        query: {
          ContinuationToken: String(input.continuationToken || "").trim(),
          MaxResults: helper.parseOptionalInt(input.maxResults),
          timeout
        }
      });
      helper.setStatus(`UpdatePartitionLoad requested for partition ${partitionId}.`, "success");
      return;
    }
    if (action === "ReportPartitionHealth") {
      const sourceId = String(input.sourceId || "").trim();
      const property = String(input.property || "").trim();
      const healthState = helper.parseOptionalInt(input.healthState);
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
      const immediate = helper.parseOptionalBool(input.immediate);
      helper.setStatus(`Reporting health for partition ${partitionId}...`);
      await postSfAction(`/Partitions/${encodeURIComponent(partitionId)}/$/ReportHealth`, {
        apiVersion: "6.0",
        body,
        query: { Immediate: immediate, timeout }
      });
      helper.setStatus(`ReportPartitionHealth submitted for partition ${partitionId}.`, "success");
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
    const values = await helper.openActionModal({
      title: "Create Repair Task",
      submitLabel: "Create Repair Task",
      cancelLabel: "Cancel",
      fields: [
        { name: "taskId", label: "Repair Task ID", value: buildDefaultRepairTaskId(), required: true },
        { name: "action", label: "Repair Action", value: "System.Reboot", required: true },
        { name: "nodeNames", label: "Target Node Name(s), comma-separated", value: defaultNodeName || "", required: true },
        { name: "description", label: "Description (optional)", value: "", required: false }
      ]
    });
    if (!values) return null;

    const taskId = String(values.taskId || "").trim();
    if (!taskId) {
      helper.setStatus("Repair task creation canceled: Task ID is required.", "warning");
      return null;
    }
    const action = String(values.action || "").trim();
    if (!action) {
      helper.setStatus("Repair task creation canceled: Action is required.", "warning");
      return null;
    }
    const nodeNames = normalizeNodeList(values.nodeNames || "");
    if (!nodeNames.length) {
      helper.setStatus("Repair task creation canceled: at least one node is required.", "warning");
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
    return helper.confirmWithActionModal(
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

    const bearer = helper.findBearerToken();
    helper.setStatus(`Creating repair task ${repairTask.TaskId}...`);
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
    helper.setStatus(`Repair task ${repairTask.TaskId} created.`, "success");
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

    const bearer = helper.findBearerToken();
    helper.setStatus(`Requesting cancel for repair task ${taskId}...`);
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
    helper.setStatus(`Cancel requested for repair task ${taskId}.`, "success");
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

    const bearer = helper.findBearerToken();
    helper.setStatus(`Requesting delete for repair task ${taskId}...`);
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
    helper.setStatus(`Delete requested for repair task ${taskId}.`, "success");
  }

  Object.assign(helper, {
    deleteReplica,
    rollbackApplication,
    postSfAction,
    getSfJson,
    getServiceDescription,
    buildServiceUpdateModel,
    promptUpdateServiceInput,
    updateService,
    updateServiceScale,
    promptScaleServiceInput,
    promptMovePrimaryReplicaInput,
    promptMoveSecondaryReplicaInput,
    runPartitionAction,
    buildDefaultRepairTaskId,
    normalizeNodeList,
    promptRepairTaskInput,
    confirmStartDataLoss,
    createRepairTask,
    isRepairTasksView,
    extractRepairTaskIdFromRow,
    extractRepairTaskStateFromRow,
    parseRawRepairJobFromExpandedRow,
    cancelRepairTask,
    deleteRepairTask
  });
})();
