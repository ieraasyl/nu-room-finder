(function (scope) {
  "use strict";

  // Shared control styles. Portal-specific layout lives in content.js.
  const styles = String.raw`
    :host {
      --background:oklch(1 0 0); --foreground:oklch(.145 0 0);
      --card:oklch(1 0 0); --card-foreground:oklch(.145 0 0);
      --primary:oklch(.205 0 0); --primary-foreground:oklch(.985 0 0);
      --muted:oklch(.97 0 0); --muted-foreground:oklch(.556 0 0);
      --border:oklch(.922 0 0); --input:oklch(.922 0 0); --ring:oklch(.708 0 0);
      --destructive:oklch(.577 .245 27.325);
      color-scheme:light; color:var(--foreground);
      font-family:inherit;
      font-size:14px; line-height:1.5; font-weight:400;
      -webkit-font-smoothing:antialiased;
    }
    *,*::before,*::after { box-sizing:border-box; border-color:var(--border); }
    [hidden] { display:none!important; }
    input,select,button { font:inherit; color:inherit; }

    /* Fields */
    [data-slot=field] { display:flex; min-width:0; flex-direction:column; gap:4px; }
    [data-slot=field-label] { display:flex; width:fit-content; align-items:center; gap:8px; font-size:12px; font-weight:500; }
    [data-slot=field-error] { margin:0; color:var(--destructive); font-size:12px; }
    [data-slot=field]:has(:disabled) [data-slot=field-label] { opacity:.5; }

    /* Buttons: default, outline, ghost, and xs/default sizes */
    [data-slot=button] {
      display:inline-flex; flex-shrink:0; align-items:center; justify-content:center; gap:6px;
      height:32px; padding:4px 12px; border:1px solid transparent; border-radius:16px;
      background:var(--primary); color:var(--primary-foreground); background-clip:padding-box;
      font-size:14px; font-weight:500; white-space:nowrap; user-select:none;
      cursor:pointer; outline:none; transition:background .15s,color .15s,box-shadow .15s,transform .15s;
    }
    [data-slot=button]:hover { background:color-mix(in oklch,var(--primary) 80%,transparent); }
    [data-slot=button][data-variant=outline] { border-color:var(--border); background:var(--background); color:var(--foreground); }
    [data-slot=button][data-variant=ghost] { background:transparent; color:var(--foreground); }
    [data-slot=button][data-variant=outline]:hover,[data-slot=button][data-variant=ghost]:hover { background:var(--muted); }
    [data-slot=button][data-size=xs] { height:24px; gap:4px; padding:2px 10px; font-size:12px; }
    [data-slot=button]:active:not(:disabled) { transform:translateY(1px); }
    [data-slot=button]:disabled { pointer-events:none; opacity:.5; }
    [data-slot=button] svg { width:16px; height:16px; pointer-events:none; flex-shrink:0; }
    [data-slot=button][data-size=xs] svg { width:12px; height:12px; }

    /* Inputs and selects */
    [data-slot=input],[data-slot=select-trigger] {
      display:block; min-width:0; height:32px; padding:4px 10px;
      border:1px solid transparent; border-radius:16px;
      background:color-mix(in oklch,var(--input) 50%,transparent);
      outline:none; font-size:14px; transition:color .2s,box-shadow .2s;
    }
    [data-slot=input]::placeholder { color:var(--muted-foreground); }
    [data-slot=select-trigger] { appearance:none; padding:4px 34px 4px 12px; cursor:pointer; }
    [data-slot=input]:disabled,[data-slot=select-trigger]:disabled { cursor:not-allowed; opacity:.5; }
    [data-slot=button]:focus-visible,[data-slot=input]:focus-visible,
    [data-slot=select-trigger]:focus-visible,[data-slot=checkbox]:focus-visible {
      border-color:var(--ring); box-shadow:0 0 0 3px color-mix(in oklch,var(--ring) 30%,transparent);
    }
    [data-slot=input][aria-invalid=true] {
      border-color:var(--destructive); box-shadow:0 0 0 3px color-mix(in oklch,var(--destructive) 20%,transparent);
    }

    /* Checkboxes */
    [data-slot=checkbox] {
      appearance:none; position:relative; flex-shrink:0; width:16px; height:16px; margin:0;
      border:1px solid transparent; border-radius:5px; cursor:pointer;
      background:color-mix(in oklch,var(--input) 90%,transparent); outline:none; transition:box-shadow .15s;
    }
    [data-slot=checkbox]:checked {
      border-color:var(--primary); background-color:var(--primary);
      background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24' fill='none' stroke='%23fafafa' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M5 14L8.5 17.5L19 6.5'/%3E%3C/svg%3E");
      background-position:center; background-repeat:no-repeat; background-size:14px;
    }
    [data-slot=checkbox]:disabled { cursor:not-allowed; opacity:.5; }

    /* Searchable equipment picker */
    [data-slot=multi-select] { width:min(100%,360px); }
    [data-slot=multi-select-controls] { display:flex; align-items:center; gap:8px; }
    [data-slot=multi-select-trigger] {
      display:flex; align-items:center; justify-content:space-between; gap:12px;
      flex:1; min-width:0; height:32px; padding:4px 12px; border:1px solid transparent;
      border-radius:16px; background:color-mix(in oklch,var(--input) 50%,transparent);
      font-size:14px; text-align:left; outline:none; cursor:pointer;
    }
    [data-slot=multi-select-trigger] svg { width:16px; height:16px; color:var(--muted-foreground); flex-shrink:0; }
    [data-slot=multi-select-trigger]:disabled { opacity:.5; cursor:not-allowed; }
    [data-slot=multi-select-trigger]:focus-visible,
    [data-slot=multi-select-options] input:focus-visible {
      outline:none; box-shadow:0 0 0 3px color-mix(in oklch,var(--ring) 30%,transparent);
    }
    [data-slot=multi-select-content] {
      position:fixed; inset:auto; z-index:50; margin:0; padding:4px; border:0;
      border-radius:16px; background:var(--background); color:var(--foreground);
      box-shadow:0 10px 15px -3px rgb(0 0 0 / .1),0 4px 6px -4px rgb(0 0 0 / .1),0 0 0 1px rgb(0 0 0 / .05);
      font-family:inherit; font-size:14px; overflow:auto;
    }
    [data-slot=multi-select-content] [data-slot=input] { width:100%; margin-bottom:4px; }
    [data-slot=multi-select-options] { max-height:240px; overflow-y:auto; overscroll-behavior:contain; }
    [data-slot=multi-select-options] label {
      display:flex; align-items:center; gap:8px; min-height:32px; padding:6px 8px;
      border-radius:12px; font-size:14px; font-weight:400; cursor:pointer; overflow-wrap:anywhere;
    }
    [data-slot=multi-select-options] label:hover,[data-slot=multi-select-options] label:focus-within { background:var(--muted); }
    [data-slot=multi-select-empty] { margin:0; padding:12px 8px; color:var(--muted-foreground); text-align:center; }

    /* Separators */
    [data-slot=separator] { flex-shrink:0; border:0; background:var(--border); }
    [data-slot=separator][data-orientation=horizontal] { width:100%; height:1px; }

    /* Tooltips */
    [data-slot=tooltip-trigger] {
      display:inline-flex; align-items:center; justify-content:center; width:24px; height:24px;
      padding:0; border:1px solid transparent; border-radius:16px; background:transparent;
      color:var(--muted-foreground); cursor:help; outline:none; vertical-align:middle;
    }
    [data-slot=tooltip-trigger]:hover { background:var(--muted); color:var(--foreground); }
    [data-slot=tooltip-trigger]:focus-visible {
      border-color:var(--ring); box-shadow:0 0 0 3px color-mix(in oklch,var(--ring) 30%,transparent);
    }
    [data-slot=tooltip-content] {
      position:fixed; inset:auto; z-index:50; width:max-content; max-width:min(320px,calc(100vw - 16px));
      margin:0; padding:6px 12px; border:0; border-radius:14px;
      background:var(--foreground); color:var(--background); font-family:inherit;
      font-size:12px; font-weight:400; line-height:1.5; white-space:normal; overflow:visible;
      overflow-wrap:anywhere; transform-origin:var(--arrow-left) bottom;
      animation:tooltip-in .12s ease-out;
    }
    [data-slot=tooltip-content][data-side=bottom] { transform-origin:var(--arrow-left) top; }
    [data-slot=tooltip-arrow] {
      position:absolute; left:var(--arrow-left); bottom:-4px; width:10px; height:10px;
      border-radius:2px; background:inherit; transform:translateX(-50%) rotate(45deg);
    }
    [data-slot=tooltip-content][data-side=bottom] [data-slot=tooltip-arrow] { top:-4px; bottom:auto; }
    @keyframes tooltip-in { from { opacity:0; transform:scale(.95); } to { opacity:1; transform:scale(1); } }
    @media(prefers-reduced-motion:reduce) { [data-slot=tooltip-content] { animation:none; } }

    /* Alerts */
    [data-slot=alert] {
      display:grid; grid-template-columns:16px minmax(0,1fr); align-items:start; gap:2px 10px;
      width:100%; padding:12px 16px; border:1px solid var(--border); border-radius:16px;
      background:var(--card); color:var(--card-foreground); text-align:left; font-size:14px;
    }
    [data-slot=alert][data-variant=destructive] { color:var(--destructive); }
    [data-slot=alert-description] { min-width:0; font-size:14px; }
    [data-slot=alert-icon] { margin-top:2px; }
    [data-slot=alert-icon][hidden]+[data-slot=alert-description] { grid-column:1/-1; }

    /* Tables */
    [data-slot=table] { width:100%; border-collapse:collapse; font-size:14px; text-align:left; caption-side:bottom; }
    [data-slot=table-head] { height:40px; padding:0 8px; color:var(--foreground); font-weight:500; white-space:nowrap; vertical-align:middle; }
    [data-slot=table-cell] { padding:8px; vertical-align:middle; }
    [data-slot=table-row] { border-bottom:1px solid var(--border); transition:background .15s; }
    [data-slot=table-body] [data-slot=table-row]:last-child { border-bottom:0; }
    [data-slot=table-row]:hover { background:color-mix(in oklch,var(--muted) 50%,transparent); }
    [data-slot=table-row][data-state=selected] { background:var(--muted); }

    /* Spinners */
    .icon { display:block; width:16px; height:16px; flex-shrink:0; pointer-events:none; }
    [data-slot=spinner] { animation:spin 1s linear infinite; }
    @keyframes spin { to { transform:rotate(360deg); } }
    @media(prefers-reduced-motion:reduce) { [data-slot=spinner] { animation-duration:2s; } }
    @media(forced-colors:active) {
      [data-slot=checkbox] { appearance:auto; accent-color:auto; }
      [data-slot=select-trigger] { appearance:auto; padding-right:12px; }
      .select-control svg { display:none; }
    }
  `;

  function createTooltip(root) {
    const popup = scope.document.createElement("div");
    popup.id = root.host.id + "-tooltip";
    popup.dataset.slot = "tooltip-content";
    popup.setAttribute("role", "tooltip");
    popup.setAttribute("popover", "manual");
    popup.hidden = true;
    const text = scope.document.createElement("span");
    const arrow = scope.document.createElement("span");
    arrow.dataset.slot = "tooltip-arrow";
    arrow.setAttribute("aria-hidden", "true");
    popup.append(text, arrow);
    root.append(popup);
    let anchor = null;
    let hovered = null;
    let popupHovered = false;
    let hideTimer;
    let updating = false;
    const triggerFor = (target) => target instanceof scope.Element
      ? target.closest("[data-slot=tooltip-trigger]") : null;
    const describe = (element, add) => {
      const ids = (element.getAttribute("aria-describedby") || "").split(/\s+/).filter((id) => id && id !== popup.id);
      if (add) ids.push(popup.id);
      if (ids.length) element.setAttribute("aria-describedby", ids.join(" "));
      else element.removeAttribute("aria-describedby");
    };
    function hide() {
      clearTimeout(hideTimer);
      if (anchor) describe(anchor, false);
      anchor = null;
      hovered = null;
      popupHovered = false;
      popup.hidePopover?.();
      popup.hidden = true;
    }
    function show(trigger) {
      if (!trigger?.isConnected || !trigger.dataset.tooltip) return;
      clearTimeout(hideTimer);
      if (anchor && anchor !== trigger) describe(anchor, false);
      anchor = trigger;
      text.textContent = trigger.dataset.tooltip;
      describe(trigger, true);
      popup.style.visibility = "hidden";
      popup.hidden = false;
      // The top layer keeps the popup outside the scrolling table's clip.
      popup.showPopover?.();
      const rect = trigger.getBoundingClientRect();
      const bounds = { width: popup.offsetWidth, height: popup.offsetHeight };
      const left = Math.max(8, Math.min(rect.left + rect.width / 2 - bounds.width / 2, scope.innerWidth - bounds.width - 8));
      const above = rect.top - bounds.height - 8;
      const side = above >= 8 ? "top" : "bottom";
      const top = side === "top" ? above : rect.bottom + 8;
      popup.dataset.side = side;
      popup.style.left = left + "px";
      popup.style.top = Math.max(8, Math.min(top, scope.innerHeight - bounds.height - 8)) + "px";
      popup.style.setProperty("--arrow-left", Math.max(12, Math.min(rect.left + rect.width / 2 - left, bounds.width - 12)) + "px");
      popup.style.visibility = "";
    }
    function hideSoon() {
      clearTimeout(hideTimer);
      hideTimer = setTimeout(() => {
        if (anchor && root.activeElement !== anchor && hovered !== anchor && !popupHovered) hide();
      }, 100);
    }
    root.addEventListener("pointerover", (event) => {
      if (event.pointerType === "touch") return;
      const trigger = triggerFor(event.target);
      if (trigger) { hovered = trigger; show(trigger); }
      if (popup.contains(event.target)) { popupHovered = true; clearTimeout(hideTimer); }
    });
    root.addEventListener("pointerout", (event) => {
      const trigger = triggerFor(event.target);
      const related = event.relatedTarget instanceof scope.Node ? event.relatedTarget : null;
      if (trigger && !trigger.contains(related)) hovered = null;
      if (popup.contains(event.target) && !popup.contains(related)) popupHovered = false;
      hideSoon();
    });
    root.addEventListener("focusin", (event) => {
      if (!updating) show(triggerFor(event.target));
    });
    root.addEventListener("focusout", () => { if (!updating) hideSoon(); });
    root.addEventListener("click", (event) => {
      const trigger = triggerFor(event.target);
      if (trigger) show(trigger);
    });
    scope.document.addEventListener("pointerdown", (event) => {
      const path = event.composedPath();
      if (anchor && !path.includes(anchor) && !path.includes(popup)) hide();
    }, true);
    scope.document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && anchor) { hide(); event.preventDefault(); event.stopPropagation(); }
    }, true);
    scope.document.addEventListener("scroll", hide, true);
    scope.addEventListener("resize", hide);
    scope.addEventListener("pagehide", hide);
    return {
      beforeUpdate() { updating = true; clearTimeout(hideTimer); },
      afterUpdate() {
        updating = false;
        if (!anchor) return;
        const next = [...root.querySelectorAll("[data-slot=tooltip-trigger]")]
          .find((element) => element.dataset.tooltipKey === anchor.dataset.tooltipKey);
        if (!next) { hide(); return; }
        if (hovered === anchor) hovered = next;
        show(next);
      },
    };
  }

  function createMultiSelect(container, { onChange }) {
    const root = container.getRootNode();
    const $ = (slot) => container.querySelector('[data-slot="' + slot + '"]');
    const trigger = $("multi-select-trigger");
    const triggerText = trigger.querySelector("span");
    const popup = $("multi-select-content");
    if (typeof popup.showPopover !== "function") popup.removeAttribute("popover");
    const search = popup.querySelector("input");
    const list = $("multi-select-options");
    const empty = $("multi-select-empty");
    let open = false;
    const visibleInputs = () => [...list.querySelectorAll("input")].filter((input) => !input.parentElement.hidden);
    function position() {
      if (!open) return;
      const rect = trigger.getBoundingClientRect();
      popup.style.width = Math.max(0, Math.min(Math.max(rect.width, 300), scope.innerWidth - 16)) + "px";
      popup.style.maxHeight = Math.max(0, scope.innerHeight - 16) + "px";
      const height = popup.offsetHeight;
      const below = scope.innerHeight - rect.bottom - 14;
      const above = rect.top - 14;
      const placeBelow = below >= height || below >= above;
      popup.style.maxHeight = Math.max(0, placeBelow ? below : above) + "px";
      popup.style.left = Math.max(8, Math.min(rect.left, scope.innerWidth - popup.offsetWidth - 8)) + "px";
      popup.style.top = Math.max(8, placeBelow ? rect.bottom + 6 : rect.top - popup.offsetHeight - 6) + "px";
    }
    function filter() {
      const query = search.value.trim().toLocaleLowerCase();
      for (const label of list.children) label.hidden = !label.textContent.toLocaleLowerCase().includes(query);
      empty.hidden = !!visibleInputs().length;
      empty.textContent = "No equipment found.";
      position();
    }
    function close(restoreFocus = false) {
      open = false;
      popup.hidePopover?.();
      popup.hidden = true;
      trigger.setAttribute("aria-expanded", "false");
      search.value = "";
      filter();
      if (restoreFocus) trigger.focus({ preventScroll: true });
    }
    function show() {
      if (trigger.disabled) return;
      open = true;
      popup.hidden = false;
      popup.showPopover?.();
      trigger.setAttribute("aria-expanded", "true");
      filter();
      search.focus({ preventScroll: true });
    }
    trigger.addEventListener("click", () => open ? close() : show());
    trigger.addEventListener("keydown", (event) => {
      if (!["ArrowDown", "ArrowUp"].includes(event.key)) return;
      event.preventDefault();
      show();
    });
    search.addEventListener("input", filter);
    // Keep typing focus when selecting with a pointer, including browsers that
    // blur text fields without focusing the clicked checkbox.
    list.addEventListener("mousedown", (event) => {
      if (event.button === 0) event.preventDefault();
    });
    popup.addEventListener("change", (event) => {
      const input = event.target;
      if (!input.matches('input[name="equipment"]')) return;
      onChange(input.value, input.parentElement.textContent, input.checked);
      if (open) search.focus({ preventScroll: true });
    });
    popup.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        close(true);
        return;
      }
      const inputs = visibleInputs();
      const index = inputs.indexOf(root.activeElement);
      if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key) ||
          (event.target === search && !event.key.startsWith("Arrow"))) return;
      event.preventDefault();
      const next = event.key === "Home" ? 0 : event.key === "End" ? inputs.length - 1
        : event.key === "ArrowDown" ? Math.min(index + 1, inputs.length - 1)
        : index < 0 ? inputs.length - 1 : index - 1;
      if (next < 0) search.focus();
      else {
        inputs[next]?.focus({ preventScroll: true });
        inputs[next]?.scrollIntoView?.({ block: "nearest" });
      }
    });
    container.addEventListener("focusout", (event) => {
      const next = event.relatedTarget;
      if (open && next && !container.contains(next)) close();
    });
    scope.document.addEventListener("pointerdown", (event) => {
      if (open && !event.composedPath().includes(container)) close();
    }, true);
    scope.document.addEventListener("scroll", (event) => {
      if (open && !event.composedPath().includes(popup)) close();
    }, true);
    scope.addEventListener("resize", () => close());
    scope.addEventListener("pagehide", () => close());
    return {
      update(options, selected, disabled) {
        trigger.disabled = disabled;
        if (disabled && open) close();
        triggerText.textContent = selected.size ? selected.size + " selected" : "Any equipment";
        const focused = root.activeElement;
        const existing = new Map([...list.querySelectorAll("input")].map((input) => [input.value, input.parentElement]));
        options.forEach(([key, name], index) => {
          let label = existing.get(key);
          if (!label) {
            label = scope.document.createElement("label");
            const input = scope.document.createElement("input");
            input.type = "checkbox";
            input.name = "equipment";
            input.value = key;
            input.dataset.slot = "checkbox";
            label.append(input, scope.document.createTextNode(name));
          }
          label.querySelector("input").checked = selected.has(key);
          if (list.children[index] !== label) list.insertBefore(label, list.children[index] || null);
          existing.delete(key);
        });
        for (const label of existing.values()) label.remove();
        if (focused?.isConnected && root.activeElement !== focused) focused.focus({ preventScroll: true });
        filter();
      },
    };
  }

  scope.NURoomFinderUI = { styles, createTooltip, createMultiSelect };
})(window);
