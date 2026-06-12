(() => {
  if (window.__sfxReplicaHelperLoaded) return;
  window.__sfxReplicaHelperLoaded = true;

  const helper = window.SfxHelper;
  helper.tryAttachInlineButtons();
  helper.attachPartitionTreeActionToggles();
  helper.attachActionDropdowns();
  helper.tryAttachRepairTaskCancelButtons();

  const observer = new MutationObserver(() => {
    helper.tryAttachInlineButtons();
    helper.attachPartitionTreeActionToggles();
    helper.tryAttachRepairTaskCancelButtons();
  });
  observer.observe(document.body, { childList: true, subtree: true });

  const dropdownObserver = new MutationObserver(() => helper.attachActionDropdowns());
  dropdownObserver.observe(document.body, { childList: true, subtree: true });

  document.addEventListener("click", () => helper.closeInjectedTreeDropdowns(), true);
  window.addEventListener("resize", () => helper.repositionOpenInjectedTreeDropdowns(), true);
  window.addEventListener("scroll", () => helper.repositionOpenInjectedTreeDropdowns(), true);
})();
