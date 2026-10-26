(function () {
  "use strict";
  const C = window.NURoomFinderCore;
  const F = window.NURoomFinderFilters;
  const UI = window.NURoomFinderUI;
  const STORAGE_KEY = "nuRoomFinder.preferences.v1";
  const collator = new Intl.Collator("en", {
    numeric: true,
    sensitivity: "base",
  });
  const ICONS = {
    search:
      '<path d="M17 17L21 21M19 11C19 6.58172 15.4183 3 11 3S3 6.58172 3 11 6.58172 19 11 19 19 15.4183 19 11Z"/>',
    spinner:
      '<path d="M12 3V6M12 18V21M21 12H18M6 12H3M18.3635 5.63672L16.2422 7.75804M7.75804 16.2422L5.63672 18.3635M18.3635 18.3635L16.2422 16.2422M7.75804 7.75804L5.63672 5.63672"/>',
    stop: '<path d="M4 12C4 8.72077 4 7.08116 4.81382 5.91891C5.1149 5.48891 5.48891 5.1149 5.91891 4.81382C7.08116 4 8.72077 4 12 4S16.9188 4 18.0811 4.81382C18.5111 5.1149 18.8851 5.48891 19.1862 5.91891C20 7.08116 20 8.72077 20 12S20 16.9188 19.1862 18.0811C18.8851 18.5111 18.5111 18.8851 18.0811 19.1862C16.9188 20 15.2792 20 12 20S7.08116 20 5.91891 19.1862C5.48891 18.8851 5.1149 18.5111 4.81382 18.0811C4 16.9188 4 15.2792 4 12Z"/>',
    warning:
      '<circle cx="12" cy="12" r="10"/><path d="M12 8V12M12.125 15.75H12M12.25 15.75a.25.25 0 1 1-.5 0 .25.25 0 0 1 .5 0Z"/>',
    info:
      '<circle cx="12" cy="12" r="10"/><path d="M12 16V12M12.125 8.25H12M12.25 8.25C12.25 8.11193 12.1381 8 12 8C11.8619 8 11.75 8.11193 11.75 8.25C11.75 8.38807 11.8619 8.5 12 8.5C12.1381 8.5 12.25 8.38807 12.25 8.25Z"/>',
  };
  const icon = (name, className = "") =>
    '<svg data-slot="' + (name === "spinner" ? "spinner" : "icon") + '" class="icon ' +
    className +
    '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"' +
    ' stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">' +
    ICONS[name] +
    "</svg>";
  let mounted = false;

  function studentDetailsBox(select) {
    const allLabels = [...document.querySelectorAll("label,th,td,strong,b,span,p")];
    const labels = ["First name", "Last name", "Phone", "School", "Major"]
      .map((name) => allLabels.find((element) => C.clean(element.textContent).replace(/:$/, "") === name));
    if (labels.some((label) => !label)) return null;
    let common = labels[0].parentElement;
    while (common && !labels.every((label) => common.contains(label))) common = common.parentElement;
    if (!common) return null;
    for (let element = common; element && element !== document.body && !element.contains(select); element = element.parentElement) {
      const style = window.getComputedStyle(element);
      const hasBorder = ["Top", "Right", "Bottom", "Left"].some((side) =>
        style["border" + side + "Style"] !== "none" && parseFloat(style["border" + side + "Width"]) > 0,
      );
      if (hasBorder) return element;
    }
    return common.contains(select) ? null : common;
  }

  function mount() {
    const select = document.getElementById("roomDetails");
    if (
      mounted ||
      !select ||
      !select.options.length ||
      !document.getElementById("datepicker") ||
      !document.getElementById("timeFrom") ||
      !document.getElementById("timeTo")
    )
      return false;
    const rooms = [...select.options]
      .filter((o) => /^\d+$/.test(o.value))
      .map((o) => ({
        id: o.value,
        name: C.clean(o.text),
        building: C.clean(o.text).split(".")[0],
      }))
      .sort((a, b) => collator.compare(a.name, b.name));
    if (!rooms.length) return false;
    mounted = true;
    const host = document.createElement("div");
    host.id = "nu-room-finder";
    host.style.cssText =
      "display:block!important;position:relative!important;margin:12px 0!important;z-index:1!important";
    const root = host.attachShadow({ mode: "open" });
    root.innerHTML = TEMPLATE;
    const form = select.closest("form");
    const detailsBox = studentDetailsBox(select);
    if (detailsBox?.parentElement) detailsBox.after(host);
    else (form || select.parentElement).before(host);
    const $ = (selector) => root.querySelector(selector);
    const tooltip = UI.createTooltip(root);
    const timeFields = ["date", "from", "to"].map((id) => $("#" + id));
    const buildings = [...new Set(rooms.map((room) => room.building))].sort(collator.compare);
    for (const building of buildings) {
      const option = document.createElement("option");
      option.value = building;
      option.textContent = "Block " + building;
      $("#building").append(option);
    }
    let selectedEquipment = new Map();
    let selection = null;
    let selectingId = null;
    let selectedId = null;
    let capacitySort = null;
    let edited = false;
    let saveTimer;
    let notice = null;
    const finder = new window.NURoomFinderSearch(rooms, { onChange: render });
    const readTime = () => ({
      date: $("#date").value, from: $("#from").value, to: $("#to").value,
    });
    const readFilters = () => ({
      building: $("#building").value,
      capacity: $("#capacity").validity.badInput ? "" : $("#capacity").value || "0",
      equipment: [...selectedEquipment.values()],
    });
    const filterError = () => F.validate(readFilters());
    const equipmentPicker = UI.createMultiSelect($("#equipment-picker"), {
      onChange(key, name, checked) {
        if (checked) selectedEquipment.set(key, name);
        else selectedEquipment.delete(key);
        filtersChanged();
      },
    });
    function setDateBounds() {
      const today = C.today();
      $("#date").min = today;
      $("#date").max = new Date((C.dayNumber(today) + 28) * 86400000).toISOString().slice(0, 10);
    }
    function setStatus(text, error = false) {
      $("#status").setAttribute("role", error ? "alert" : "status");
      $("#status").setAttribute("aria-live", error ? "assertive" : "polite");
      $("#status-text").textContent = text;
      $("#status-icon").hidden = !error;
      $("#status").hidden = !text;
      $("#status").dataset.variant = error ? "destructive" : "default";
    }
    function save() {
      clearTimeout(saveTimer);
      saveTimer = setTimeout(async () => {
        try {
          await chrome.storage.local.set({ [STORAGE_KEY]: {
            ...readTime(), ...readFilters(), sortCapacity: capacitySort,
          } });
        } catch {
          $("#storage-note").hidden = false;
        }
      }, 250);
    }
    function renderEquipment() {
      const options = new Map(selectedEquipment);
      for (const room of finder.catalog.values()) {
        for (const name of F.equipmentItems(room.equipment)) {
          options.set(F.equipmentKey(name), name);
        }
      }
      const sorted = [...options].sort((a, b) => collator.compare(a[1], b[1]));
      equipmentPicker.update(sorted, selectedEquipment, !!selection);
    }
    function render() {
      renderEquipment();
      const invalidFilters = filterError();
      $("#filter-error").textContent = invalidFilters;
      $("#filter-error").hidden = !invalidFilters;
      $("#capacity").setAttribute("aria-invalid", String(!!invalidFilters));
      const filters = readFilters();
      const matching = invalidFilters ? [] : [...finder.results.values()].filter((room) =>
        F.matchesBuilding(room, filters) &&
        // A failed metadata request cannot tell us whether seats/equipment match.
        (!finder.catalog.has(room.id) || F.matchesDetails(room, filters))
      );
      const count = (status) => matching.filter((room) => room.status === status).length;
      const pieces = [count("available") + " available", count("unavailable") + count("hours") + " unavailable"];
      if (count("error")) pieces.push(count("error") + (count("error") === 1 ? " failed check" : " failed checks"));
      $("#summary").textContent = pieces.join(" / ");
      $("#summary").hidden = !finder.query;
      const busy = finder.running || !!selection;
      $("#find").disabled = busy;
      $("#find-icon").hidden = busy;
      $("#find-spinner").hidden = !busy;
      $("#stop").hidden = !busy;
      $("#results").setAttribute("aria-busy", String(busy));
      timeFields.forEach((field) => { field.disabled = !!selection; });
      $("#room-filters").disabled = !!selection;
      $("#clear-filters").disabled = !!selection || (!filters.building && !Number(filters.capacity) && !filters.equipment.length && !invalidFilters);
      const status = notice || (finder.error ? { text: finder.error.message, error: true } : null);
      setStatus(status?.text || "", !!status?.error);
      const shown = matching.filter((room) => room.status === "available" || $("#show-other").checked);
      shown.sort((a, b) => {
        // Available rooms stay first even when sorting by seats.
        const group = Number(a.status !== "available") - Number(b.status !== "available");
        if (group) return group;
        if (capacitySort) {
          const aKnown = Number.isFinite(a.capacity);
          const bKnown = Number.isFinite(b.capacity);
          if (aKnown !== bKnown) return aKnown ? -1 : 1;
          if (aKnown && a.capacity !== b.capacity) return capacitySort === "asc" ? a.capacity - b.capacity : b.capacity - a.capacity;
        }
        return collator.compare(a.name, b.name);
      });
      $("#capacity-column").setAttribute("aria-sort", capacitySort === "asc" ? "ascending" : capacitySort === "desc" ? "descending" : "none");
      $("#sort-direction").textContent = capacitySort === "asc" ? "↑" : capacitySort === "desc" ? "↓" : "↕";
      const list = $("#results");
      const scrollTop = $("#table-wrap").scrollTop;
      const focusedRoom = root.activeElement?.dataset.roomId;
      const focusedInfo = root.activeElement?.dataset.tooltipKey;
      tooltip.beforeUpdate();
      list.replaceChildren();
      for (const room of shown) {
        const row = document.createElement("tr");
        row.dataset.slot = "table-row";
        if (room.id === selectedId) row.dataset.state = "selected";
        row.classList.toggle("selected", room.id === selectedId);
        row.classList.toggle("unavailable", room.status !== "available");
        const cell = (text, className = "") => {
          const td = document.createElement("td");
          td.textContent = text ?? "";
          td.className = className;
          td.dataset.slot = "table-cell";
          row.append(td);
          return td;
        };
        cell(room.name, "room-name");
        cell(room.capacity, "seats");
        cell(room.specification);
        cell(F.equipmentItems(room.equipment).join(", ") || (finder.catalog.has(room.id) ? "None" : ""));
        const action = cell("", "action");
        if (room.status === "available") {
          const query = finder.query;
          const button = document.createElement("button");
          button.type = "button";
          button.className = "use";
          button.dataset.slot = "button";
          button.dataset.variant = "outline";
          button.dataset.size = "xs";
          button.dataset.roomId = room.id;
          if (selection && selectingId === room.id) button.insertAdjacentHTML("beforeend", icon("spinner", "spinner"));
          button.append(document.createTextNode(room.id === selectedId ? "Selected" : "Select"));
          button.setAttribute("aria-label", "Use room " + room.name);
          button.disabled = !!selection || room.id === selectedId;
          button.addEventListener("click", () => choose(room, query));
          action.append(button);
        } else {
          const info = document.createElement("button");
          info.type = "button";
          info.dataset.slot = "tooltip-trigger";
          info.dataset.tooltipKey = room.id;
          const range = finder.query.from + " to " + finder.query.to;
          info.dataset.tooltip = room.status === "unavailable" ? "Booked for " + range + "."
            : room.status === "hours" ? "Outside booking hours. Bookable " + room.allowedFrom + " to " + room.allowedTo + "."
            : "Availability could not be checked. " + (room.message || "Try again.");
          info.setAttribute("aria-label", "Room " + room.name + " availability details");
          info.insertAdjacentHTML("beforeend", icon("info"));
          action.append(info);
        }
        list.append(row);
      }
      if (focusedRoom) [...list.querySelectorAll(".use")].find((button) => button.dataset.roomId === focusedRoom)?.focus({ preventScroll: true });
      if (focusedInfo) [...list.querySelectorAll("[data-slot=tooltip-trigger]")]
        .find((button) => button.dataset.tooltipKey === focusedInfo)?.focus({ preventScroll: true });
      $("#table-wrap").scrollTop = scrollTop;
      $("#table-wrap").hidden = !shown.length;
      $("#empty").hidden = !!shown.length || busy || !finder.query || !!invalidFilters;
      $("#empty").textContent = count("error") ? "No availability confirmed for matching rooms."
        : finder.stopped ? "No completed checks match these filters."
        : $("#show-other").checked ? "No rooms match these filters." : "No available rooms match these filters.";
      tooltip.afterUpdate();
    }
    function timeChanged() {
      edited = true;
      notice = null;
      selectedId = null;
      finder.reset();
      save();
    }
    function filtersChanged() {
      edited = true;
      if (notice?.kind === "validation") notice = null;
      render();
      save();
    }
    function search(event) {
      event.preventDefault();
      if (finder.running || selection) return;
      edited = true;
      setDateBounds();
      const query = readTime();
      const error = C.validate(query);
      if (error) {
        notice = { text: error, error: true, kind: "validation" };
        render();
        return;
      }
      notice = null;
      selectedId = null;
      finder.start(query);
      save();
    }
    async function choose(room, query) {
      if (selection || !query || query !== finder.query) return;
      const validation = C.validate(query) || filterError();
      if (validation) {
        notice = { text: validation, error: true, kind: "validation" };
        render();
        return;
      }
      const controller = new AbortController();
      selection = controller;
      selectingId = room.id;
      notice = null;
      finder.stop();
      render();
      let recordFailure = true;
      try {
        await finder.task;
        if (controller.signal.aborted) return;
        const fresh = await C.roomDetails(room, controller.signal);
        if (controller.signal.aborted) return;
        finder.catalog.set(room.id, fresh);
        if (!F.matches(fresh, readFilters()) || !C.withinHours(fresh, query)) {
          // Discard the old availability when the portal changes room details.
          finder.results.delete(room.id);
          if (!C.withinHours(fresh, query)) finder.results.set(room.id, { ...fresh, status: "hours" });
          recordFailure = false;
          throw new C.FinderError("This room no longer matches your filters or booking hours. Find rooms again.");
        }
        const available = await C.availability(fresh, query, controller.signal);
        if (controller.signal.aborted) return;
        finder.results.set(room.id, { ...fresh, status: available ? "available" : "unavailable" });
        recordFailure = false;
        if (!available) throw new C.FinderError("Room " + room.name + " is no longer available for these times.");
        C.fillForm(fresh, query);
        selectedId = room.id;
      } catch (error) {
        if (!controller.signal.aborted) {
          if (error.fatal) finder.error = error;
          if (recordFailure) finder.results.set(room.id, { ...(finder.catalog.get(room.id) || room), status: "error", message: error.message });
          notice = { text: error.message, error: true };
        }
      } finally {
        if (controller.signal.aborted) notice = { text: "Selection stopped." };
        selection = null;
        selectingId = null;
        render();
      }
    }
    setDateBounds();
    const nativeDate = C.isoDate(document.getElementById("datepicker").value);
    $("#date").value = Number.isFinite(C.dayNumber(nativeDate)) &&
      C.dayNumber(nativeDate) >= C.dayNumber(C.today()) && C.dayNumber(nativeDate) <= C.dayNumber(C.today()) + 28
      ? nativeDate : C.today();
    $("#from").value = document.getElementById("timeFrom").value || "09:00";
    const nativeEnd = document.getElementById("timeTo").value;
    $("#to").value = C.minutes(nativeEnd) % 15 === 0 ? nativeEnd : "22:00";
    $("#search").addEventListener("submit", search);
    timeFields.forEach((field) => field.addEventListener("input", timeChanged));
    $("#building").addEventListener("change", filtersChanged);
    $("#capacity").addEventListener("input", filtersChanged);
    $("#clear-filters").addEventListener("click", () => {
      $("#building").value = "";
      $("#capacity").value = "";
      selectedEquipment.clear();
      filtersChanged();
    });
    $("#stop").addEventListener("click", () => {
      if (selection) selection.abort();
      else finder.stop();
    });
    $("#show-other").addEventListener("change", render);
    $("#sort-capacity").addEventListener("click", () => {
      edited = true;
      capacitySort = capacitySort === "desc" ? "asc" : "desc";
      render();
      save();
    });
    document.addEventListener("visibilitychange", () => {
      if (!document.hidden) setDateBounds();
    });
    window.addEventListener("pagehide", () => {
      finder.stop();
      selection?.abort();
    }, { once: true });
    render();
    (async () => {
      try {
        const stored = (await chrome.storage.local.get(STORAGE_KEY))[STORAGE_KEY];
        if (!stored || edited || finder.query) return;
        $("#date").value = Number.isFinite(C.dayNumber(stored.date)) &&
          C.dayNumber(stored.date) >= C.dayNumber(C.today()) && C.dayNumber(stored.date) <= C.dayNumber(C.today()) + 28
          ? stored.date : C.today();
        for (const id of ["from", "to"]) {
          if (Number.isFinite(C.minutes(stored[id])) && C.minutes(stored[id]) % 15 === 0) $("#" + id).value = stored[id];
        }
        $("#building").value = buildings.includes(stored.building) ? stored.building : "";
        if (!F.validate({ capacity: stored.capacity })) $("#capacity").value = Number(stored.capacity) ? stored.capacity : "";
        selectedEquipment = new Map((Array.isArray(stored.equipment) ? stored.equipment : [])
          .filter((name) => typeof name === "string")
          .flatMap(F.equipmentItems).map((name) => [F.equipmentKey(name), name]));
        capacitySort = ["asc", "desc"].includes(stored.sortCapacity) ? stored.sortCapacity : null;
        render();
      } catch {
        $("#storage-note").hidden = false;
      }
    })();
    return true;
  }

  const TEMPLATE = String.raw`
    <style>
      ${UI.styles}
      section { background:var(--background); border:1px solid #ccc; border-radius:0; padding:12px; }
      form { margin:0; }
      fieldset { min-width:0; padding:0; margin:0; border:0; }
      .search-separator { margin:16px 0 12px; }
      .results-separator { margin:12px 0; }
      .equipment { width:220px; max-width:100%; margin:0; }
      #filter-error { margin-top:8px; }
      .filters { display:flex; flex-wrap:wrap; align-items:flex-end; gap:8px; }
      input[type=date] { width:149px; }
      input[type=time] { width:110px; }
      input[type=number] { width:112px; }
      .select-control { display:block; position:relative; }
      .select-control select { width:150px; }
      .select-control svg { position:absolute; right:12px; top:8px; width:16px; height:16px; color:var(--muted-foreground); pointer-events:none; }
      .options { display:flex; flex-wrap:wrap; align-items:center; gap:8px 16px; margin:12px 0; }
      .options label { gap:6px; font-weight:400; cursor:pointer; }
      .results-toolbar { margin:0 0 12px; }
      #summary { margin:0 0 0 auto; font-size:12px; color:var(--muted-foreground); }
      #status,#storage-note { margin:12px 0; }
      #empty { margin:8px 0; font-size:12px; color:var(--muted-foreground); }
      #table-wrap { max-height:480px; overflow:auto; }
      th { position:sticky; top:0; z-index:1; border-bottom:1px solid var(--border); background:var(--background); }
      tr.unavailable { color:var(--muted-foreground); }
      .room-name { font-weight:500; white-space:nowrap; }
      .seats { font-variant-numeric:tabular-nums; }
      .action { position:sticky; right:0; background:var(--background); text-align:right; white-space:nowrap; }
      th:last-child { right:0; z-index:2; text-align:right; }
      tr:hover .action { background:color-mix(in oklch,var(--muted) 50%,var(--background)); }
      tr.selected .action { background:var(--muted); }
      .use:disabled { opacity:1; color:var(--muted-foreground); }
      #sort-capacity { margin:-3px -6px; padding:2px 6px; }
      #sort-direction { font-size:14px; }
      @media(max-width:600px) { table { min-width:680px; } #summary { margin-left:0; } }
    </style>
    <section aria-label="Room finder">
      <form id="search" aria-label="Find rooms" novalidate>
        <div class="filters">
          <div data-slot="field"><label data-slot="field-label" for="date">Date</label><input data-slot="input" id="date" type="date" required></div>
          <div data-slot="field"><label data-slot="field-label" for="from">From</label><input data-slot="input" id="from" type="time" step="900" required></div>
          <div data-slot="field"><label data-slot="field-label" for="to">Until</label><input data-slot="input" id="to" type="time" step="900" required></div>
          <button data-slot="button" type="submit" id="find"><span id="find-icon">${icon("search")}</span><span id="find-spinner" hidden>${icon("spinner", "spinner")}</span>Find rooms</button>
          <button data-slot="button" data-variant="outline" type="button" id="stop" hidden>${icon("stop")}Stop</button>
        </div>
      </form>
      <div data-slot="separator" data-orientation="horizontal" class="search-separator" role="separator" aria-orientation="horizontal"></div>
      <fieldset id="room-filters">
        <div class="filters">
          <div data-slot="field"><label data-slot="field-label" for="building">Building</label><span class="select-control"><select data-slot="select-trigger" id="building"><option value="">All buildings</option></select><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M18 14S13.5811 19 12 19 6 14 6 14M18 10S13.5811 5 12 5 6 10 6 10"/></svg></span></div>
          <div data-slot="field"><label data-slot="field-label" for="capacity">Minimum seats</label><input data-slot="input" id="capacity" type="number" min="0" max="10000" step="1" placeholder="Any size" inputmode="numeric" aria-describedby="filter-error"></div>
          <div class="equipment" data-slot="field">
            <label id="equipment-label" data-slot="field-label" for="equipment-trigger">Required equipment</label>
            <div id="equipment-picker" data-slot="multi-select">
              <div data-slot="multi-select-controls">
                <button id="equipment-trigger" data-slot="multi-select-trigger" type="button" aria-haspopup="dialog" aria-expanded="false" aria-controls="equipment-popup" aria-labelledby="equipment-label equipment-trigger-text">
                  <span id="equipment-trigger-text">Any equipment</span><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M18 9.00005C18 9.00005 13.5811 15 12 15C10.4188 15 6 9 6 9"/></svg>
                </button>
              </div>
              <div id="equipment-popup" data-slot="multi-select-content" role="dialog" aria-labelledby="equipment-label" popover="manual" hidden>
                <input id="equipment-search" data-slot="input" type="search" placeholder="Search equipment" aria-label="Search equipment" aria-controls="equipment-options" autocomplete="off">
                <div id="equipment-options" data-slot="multi-select-options"></div>
                <p data-slot="multi-select-empty" role="status" hidden>No equipment found.</p>
              </div>
            </div>
          </div>
          <button data-slot="button" data-variant="ghost" type="button" id="clear-filters">Clear filters</button>
        </div>
        <p id="filter-error" data-slot="field-error" role="alert" hidden></p>
      </fieldset>
      <div data-slot="separator" data-orientation="horizontal" class="results-separator" role="separator" aria-orientation="horizontal"></div>
      <div class="options results-toolbar">
        <label data-slot="field-label"><input data-slot="checkbox" id="show-other" type="checkbox">Include unavailable rooms</label>
        <p id="summary" role="status" aria-live="polite" hidden></p>
      </div>
      <div id="status" data-slot="alert" role="status" aria-live="polite" aria-atomic="true" hidden><span id="status-icon" data-slot="alert-icon" hidden>${icon("warning")}</span><span id="status-text" data-slot="alert-description"></span></div>
      <div id="storage-note" data-slot="alert" data-variant="destructive" role="alert" hidden><span data-slot="alert-icon">${icon("warning")}</span><span data-slot="alert-description">Settings not saved.</span></div>
      <div id="table-wrap" data-slot="table-container" hidden>
        <table data-slot="table" aria-label="Room availability">
          <thead data-slot="table-header"><tr data-slot="table-row"><th data-slot="table-head" scope="col">Room</th><th data-slot="table-head" scope="col" id="capacity-column" aria-sort="none"><button data-slot="button" data-variant="ghost" data-size="xs" id="sort-capacity" type="button" aria-label="Sort by capacity">Seats<span id="sort-direction" aria-hidden="true">↕</span></button></th><th data-slot="table-head" scope="col">Type</th><th data-slot="table-head" scope="col">Equipment</th><th data-slot="table-head" scope="col" aria-label="Room actions"></th></tr></thead>
          <tbody id="results" data-slot="table-body" aria-busy="false"></tbody>
        </table>
      </div>
      <p id="empty" hidden></p>
    </section>`;

  if (!mount()) {
    const observer = new MutationObserver(() => {
      if (mount()) observer.disconnect();
    });
    observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
    });
    setTimeout(() => observer.disconnect(), 30000);
  }
})();
