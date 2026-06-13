(() => {
  const helper = (window.SfxHelper = window.SfxHelper || {});
  if (helper.modalLoaded) return;
  helper.modalLoaded = true;

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
      .sfx-helper-modal-host .modal-body .field-wrap select,
      .sfx-helper-modal-host .modal-body .field-wrap textarea {
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
      .sfx-tree-action-host {
        display: none;
        align-items: center;
        margin-left: auto;
        line-height: 1;
      }
      .sfx-tree-action-host app-action-collection-drop-down {
        display: flex;
        align-items: center;
        line-height: 1;
      }
      .self.hover-row:hover .sfx-tree-action-host,
      .self.hover-row .sfx-tree-action-host:focus-within,
      .self.hover-row .sfx-tree-action-host.sfx-open {
        display: flex;
      }
      .sfx-tree-action-host .dropdown-toggle.simple-button.tree-view {
        display: inline-block;
        padding: 0;
        transform: none !important;
        vertical-align: middle;
        position: relative !important;
        top: 0 !important;
        bottom: auto !important;
        left: auto !important;
        right: auto !important;
        margin: 0 !important;
        translate: none !important;
        line-height: 1 !important;
        background-position: center center !important;
      }
      .sfx-tree-action-host .dropdown-toggle.simple-button.tree-view:focus,
      .sfx-tree-action-host .dropdown-toggle.simple-button.tree-view[aria-expanded="true"],
      .sfx-tree-action-host .dropdown.show .dropdown-toggle.simple-button.tree-view {
        transform: none !important;
        position: relative !important;
        top: 0 !important;
        bottom: auto !important;
        left: auto !important;
        right: auto !important;
        margin: 0 !important;
        translate: none !important;
        background-position: center center !important;
      }
      .sfx-tree-action-host .dropdown-menu {
        position: fixed;
        top: 0;
        left: 0;
        display: none;
        z-index: 1000000;
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
      container.className =
        "mat-mdc-dialog-container mdc-dialog cdk-dialog-container mdc-dialog--open _mat-animation-noopable";
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
            if (String(field.value ?? "") === option.value) {
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
          input.value = field.value ?? "";
          input.placeholder = field.placeholder || "";
          input.rows = field.rows || 5;
          input.style.width = "100%";
        } else {
          input = document.createElement("input");
          input.type = fieldType;
          input.className = "input-flat ng-untouched ng-pristine ng-valid";
          input.name = field.name;
          input.value = field.value ?? "";
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

  Object.assign(helper, {
    ensureActionModalStyles,
    openActionModal,
    confirmWithActionModal
  });
})();
