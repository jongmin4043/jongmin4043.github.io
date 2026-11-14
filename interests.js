(() => {
  const entries = Array.from(document.querySelectorAll(".interest-disclosure"), (group) => ({
    group,
    trigger: group.querySelector(".interest-trigger"),
    panel: group.querySelector(".interest-popover"),
    closeTimer: null,
  })).filter(({ trigger, panel }) => trigger && panel);

  if (!entries.length) return;

  const nativePopover = typeof HTMLElement.prototype.showPopover === "function";
  const hoverPointer = window.matchMedia("(hover: hover) and (pointer: fine)");
  let activeEntry = null;

  const positionPanel = (entry) => {
    const { trigger, panel } = entry;
    const margin = 16;
    const gap = 8;
    const viewportWidth = document.documentElement.clientWidth;
    const viewportHeight = window.innerHeight;
    const anchor = trigger.getBoundingClientRect();

    panel.style.maxHeight = `${Math.max(1, viewportHeight - margin * 2)}px`;
    const width = panel.getBoundingClientRect().width;
    const desiredHeight = panel.getBoundingClientRect().height;
    const below = Math.max(0, viewportHeight - anchor.bottom - gap - margin);
    const above = Math.max(0, anchor.top - gap - margin);
    const placeAbove = below < Math.min(desiredHeight, 240) && above > below;
    const space = placeAbove ? above : below;
    panel.style.maxHeight = `${Math.max(1, Math.min(space, viewportHeight - margin * 2))}px`;

    const height = panel.getBoundingClientRect().height;
    const left = Math.max(margin, Math.min(anchor.right - width, viewportWidth - width - margin));
    const top = placeAbove ? anchor.top - gap - height : anchor.bottom + gap;
    panel.style.left = `${left}px`;
    panel.style.top = `${Math.max(margin, Math.min(top, viewportHeight - height - margin))}px`;
  };

  const closePanel = (entry) => {
    clearTimeout(entry.closeTimer);
    if (nativePopover) {
      if (entry.panel.matches(":popover-open")) entry.panel.hidePopover();
    } else {
      entry.panel.hidden = true;
    }
    entry.trigger.setAttribute("aria-expanded", "false");
    if (activeEntry === entry) activeEntry = null;
  };

  const openPanel = (entry) => {
    clearTimeout(entry.closeTimer);
    if (activeEntry && activeEntry !== entry) closePanel(activeEntry);
    if (nativePopover) {
      if (!entry.panel.matches(":popover-open")) entry.panel.showPopover();
    } else {
      entry.panel.hidden = false;
    }
    activeEntry = entry;
    entry.trigger.setAttribute("aria-expanded", "true");
    positionPanel(entry);
  };

  const scheduleClose = (entry) => {
    clearTimeout(entry.closeTimer);
    entry.closeTimer = setTimeout(() => {
      const focus = document.activeElement;
      if (!entry.group.contains(focus) && !entry.panel.contains(focus)) closePanel(entry);
    }, 180);
  };

  entries.forEach((entry) => {
    // Keep regions at viewport level, including in browsers without native popovers.
    document.body.append(entry.panel);
    if (!nativePopover) entry.panel.hidden = true;

    entry.trigger.addEventListener("click", (event) => {
      event.preventDefault();
      if (activeEntry === entry) closePanel(entry);
      else openPanel(entry);
    });

    const hoverTarget = entry.trigger.id === "music-trigger"
      ? entry.group.closest(".interest-item")
      : entry.group;
    hoverTarget.addEventListener("pointerenter", (event) => {
      if (hoverPointer.matches && event.pointerType !== "touch") openPanel(entry);
    });
    hoverTarget.addEventListener("pointerleave", () => scheduleClose(entry));
    entry.panel.addEventListener("pointerenter", () => clearTimeout(entry.closeTimer));
    entry.panel.addEventListener("pointerleave", () => scheduleClose(entry));

    // Lists contain text only: Tab enters the scrollable region, then resumes at
    // the next page control rather than jumping to the end of the document.
    const nextControl = () => {
      const controls = Array.from(document.querySelectorAll("a[href], button, input, select, textarea, [tabindex='0']"))
        .filter((element) => !element.closest(".interest-popover"));
      return controls[controls.indexOf(entry.trigger) + 1];
    };
    entry.trigger.addEventListener("keydown", (event) => {
      if (event.key === "Tab" && !event.shiftKey && activeEntry === entry) {
        event.preventDefault();
        entry.panel.focus({ preventScroll: true });
      }
    });
    entry.panel.addEventListener("keydown", (event) => {
      if (event.key === "Tab") {
        const target = event.shiftKey ? entry.trigger : nextControl();
        if (target) {
          event.preventDefault();
          closePanel(entry);
          target.focus({ preventScroll: true });
        }
      }
    });
    [entry.group, entry.panel].forEach((element) => {
      element.addEventListener("focusout", () => {
        queueMicrotask(() => {
          const focus = document.activeElement;
          if (!entry.group.contains(focus) && !entry.panel.contains(focus)) closePanel(entry);
        });
      });
    });

    if (nativePopover) {
      entry.panel.addEventListener("toggle", () => {
        const isOpen = entry.panel.matches(":popover-open");
        entry.trigger.setAttribute("aria-expanded", String(isOpen));
        if (!isOpen && activeEntry === entry) activeEntry = null;
      });
    }
  });

  document.addEventListener("pointerdown", (event) => {
    if (activeEntry && !activeEntry.group.contains(event.target) && !activeEntry.panel.contains(event.target)) {
      closePanel(activeEntry);
    }
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && activeEntry) {
      const entry = activeEntry;
      const restoreFocus = entry.panel.contains(document.activeElement);
      event.preventDefault();
      closePanel(entry);
      if (restoreFocus) entry.trigger.focus({ preventScroll: true });
    }
  });
  document.addEventListener("scroll", (event) => {
    if (activeEntry && event.target !== activeEntry.panel && !activeEntry.panel.contains(event.target)) {
      closePanel(activeEntry);
    }
  }, { capture: true, passive: true });
  window.addEventListener("resize", () => {
    if (activeEntry) positionPanel(activeEntry);
  });
})();
