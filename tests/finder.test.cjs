const { test } = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const path = require("node:path");
const { JSDOM } = require("jsdom");
const dir = path.join(__dirname, "..", "src");
const core = readFileSync(path.join(dir, "core.js"), "utf8");
const filters = readFileSync(path.join(dir, "filters.js"), "utf8");
const search = readFileSync(path.join(dir, "search.js"), "utf8");
const ui = readFileSync(path.join(dir, "ui.js"), "utf8");
const content = readFileSync(path.join(dir, "content.js"), "utf8");
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function until(predicate, timeout = 5000) {
  const start = Date.now();
  while (!predicate()) {
    if (Date.now() - start > timeout) throw new Error("Timed out waiting for the finder.");
    await delay(10);
  }
}
const roomXML = (id, capacity = 90, equipment = "PC, Projector, White board", from = "08:00", to = "23:59") =>
  '<config generated="1" warning=""><item><id>' + id + '</id><name>notall</name><capacity>' +
  capacity + '</capacity><specification>Lecture</specification><equipment>' + equipment +
  '</equipment><allowedFrom>' + from + '</allowedFrom><allowedTo>' + to + '</allowedTo></item></config>';
const availableXML = (available) => '<config><item><id>' + available + '</id></item></config>';
function setup(options = {}) {
  const html = '<!doctype html><html><body><main><form name="roomOneForm">' +
    '<input type="hidden" id="idUPost" value="example-role"><input type="hidden" id="idUser" value="example-user">' +
    '<select id="roomDetails" name="selRoomDetails"><option value="28">2.105</option>' +
    '<option value="243">2.137</option><option value="922" selected>7E.429</option></select>' +
    '<input id="datepicker"><input id="timeFrom" type="time" value="18:15">' +
    '<input id="timeTo" type="time" value="21:00"><select id="idClubs"><option selected>My club</option></select>' +
    '<textarea id="idPurpose">Keep this draft</textarea><span id="capacity">90</span>' +
    '<span id="specification">Lecture</span><span id="equipment">PC</span><span id="lbNotice">Not available</span>' +
    '<a id="submit" href="#">SEND REQUEST</a></form></main></body></html>';
  const dom = new JSDOM(html, { url: "https://my.nu.edu.kz/wps/myportal/student/", runScripts: "outside-only" });
  const w = dom.window;
  w.eval(core);
  w.eval(filters);
  w.eval(search);
  w.eval(ui);
  const C = w.NURoomFinderCore;
  const F = w.NURoomFinderFilters;
  w.document.getElementById("datepicker").value = C.portalDate(C.today());
  const calls = [];
  const saves = [];
  w.chrome = { storage: { local: {
    get: async () => options.stored ? { "nuRoomFinder.preferences.v1": options.stored } : {},
    set: async (value) => { saves.push(value); },
  } } };
  let inFlight = 0;
  let maxInFlight = 0;
  w.fetch = async (url, init) => {
    const params = Object.fromEntries(init.body);
    calls.push({ url, params, init });
    inFlight++;
    maxInFlight = Math.max(maxInFlight, inFlight);
    try {
      if (options.fetch) return await options.fetch(params, init, calls);
      return { ok: true, status: 200, text: async () => params.method === "getRoom"
        ? roomXML(params.id) : availableXML(params.id !== "243") };
    } finally { inFlight--; }
  };
  if (options.mount !== false) w.eval(content);
  const root = w.document.getElementById("nu-room-finder")?.shadowRoot;
  const $ = (selector) => root.querySelector(selector);
  const input = (id, value) => {
    $("#" + id).value = value;
    $("#" + id).dispatchEvent(new w.Event(id === "building" ? "change" : "input", { bubbles: true }));
  };
  const start = () => $("#search").dispatchEvent(new w.Event("submit", { bubbles: true, cancelable: true }));
  return { dom, w, C, F, root, $, input, start, calls, saves, maxInFlight: () => maxInFlight };
}

test("date, quarter-hour, range, and capacity validation", () => {
  const t = setup({ mount: false });
  const base = { date: "2026-10-25", from: "18:15", to: "21:00", capacity: "0" };
  assert.equal(t.C.validate(base, base.date), "");
  for (const [field, value] of [
    ["date", "2026-02-30"], ["date", "2026-10-24"], ["date", "2026-11-23"],
    ["from", "18:16"], ["to", "18:15"], ["to", "00:00"],
  ]) assert.notEqual(t.C.validate({ ...base, [field]: value }, base.date), "");
  for (const capacity of ["-1", "1.5", "10001"]) assert.notEqual(t.F.validate({ capacity }), "");
  assert.equal(t.F.validate({ capacity: "0" }), "");
  assert.equal(t.C.validate({ ...base, date: "2026-11-22" }, base.date), "");
  assert.equal(t.C.minutes("25:00"), NaN);
  assert.equal(t.C.isoDate("28.10.2026"), "2026-10-28");
  t.dom.window.close();
});

test("XML parsing fails closed for login, expired sessions, malformed and unexpected replies", () => {
  const t = setup({ mount: false });
  assert.equal(t.C.parseAvailability(availableXML("true")), true);
  assert.equal(t.C.parseAvailability(availableXML("false")), false);
  for (const xml of [
    "<html><form>Sign in</form></html>", availableXML("sessionEmpty"), "<config>",
    availableXML("maybe"), '<config><item><id>true</id><submit>1</submit></item></config>',
    "<config><item><id>true</id></item><item><id>false</id></item></config>",
  ]) assert.throws(() => t.C.parseAvailability(xml));
  assert.throws(() => t.C.parseRoom(roomXML("28"), { id: "922" }));
  t.dom.window.close();
});

test("request builder permits only read-only operations and strips submission fields", () => {
  const t = setup({ mount: false });
  const body = t.C.requestBody("checkRoom", { id: "922", idSubmit: "yes", purpose: "secret" });
  assert.equal(body.has("idSubmit"), false);
  assert.equal(body.has("purpose"), false);
  assert.throws(() => t.C.requestBody("insertRoomReservation", {}));
  t.dom.window.close();
});

test("finds rooms for fixed times, shows failures separately, preserves native form during scan", async () => {
  const t = setup();
  await delay(0);
  t.start();
  await until(() => !t.$("#find").disabled);
  assert.equal(t.$("#results").querySelectorAll("tr").length, 2);
  assert.equal(t.$("#results").rows[0].cells.length, 5);
  assert.equal(t.$("#results [data-slot=tooltip-trigger]"), null);
  assert.ok([...t.$("#results").rows].every((row) => row.cells[0].querySelector("button") === null));
  assert.ok(![...t.root.querySelectorAll("th")].some((head) => head.textContent === "Status"));
  assert.match(t.$("#summary").textContent, /2 available.*1 unavailable/);
  const checks = t.calls.filter((c) => c.params.method === "checkRoom");
  assert.equal(checks.length, 3);
  assert.ok(checks.every((c) => c.params.timeFrom === "18:15" && c.params.timeTo === "21:00"));
  assert.equal(t.w.document.getElementById("roomDetails").value, "922");
  assert.equal(t.w.document.getElementById("timeFrom").value, "18:15");
  assert.ok(t.maxInFlight() <= 2);
  assert.ok(t.calls.every((c) => c.url === "/.OfficeBooking/DataServlet" && c.init.credentials === "same-origin"));
  t.dom.window.close();
});

test("selection rechecks availability and fills form without resets, draft edits, or submission", async () => {
  const t = setup();
  let changes = 0;
  let submits = 0;
  t.w.document.getElementById("roomDetails").addEventListener("change", () => { changes++; });
  t.w.document.forms.roomOneForm.addEventListener("submit", () => { submits++; });
  await delay(0);
  t.start();
  await until(() => !t.$("#find").disabled);
  const before = t.calls.length;
  t.$(".use").click();
  assert.equal(t.$("#results").getAttribute("aria-busy"), "true");
  assert.ok(t.$(".use svg.spinner"));
  assert.equal(t.$(".use").textContent, "Select");
  await until(() => !t.$("#find").disabled);
  assert.equal(t.$("#results").getAttribute("aria-busy"), "false");
  assert.equal(t.calls.length, before + 2);
  assert.equal(t.w.document.getElementById("roomDetails").value, "28");
  assert.equal(t.w.document.getElementById("timeFrom").value, "18:15");
  assert.equal(t.w.document.getElementById("timeTo").value, "21:00");
  assert.equal(t.w.document.getElementById("idPurpose").value, "Keep this draft");
  assert.equal(t.w.document.getElementById("idClubs").value, "My club");
  assert.equal(t.w.document.getElementById("lbNotice").textContent, "Available");
  assert.equal(changes, 0);
  assert.equal(submits, 0);
  assert.ok(t.calls.every((c) => ["getRoom", "checkRoom"].includes(c.params.method) && !("idSubmit" in c.params)));
  t.dom.window.close();
});

test("a room that becomes unavailable cannot be copied into the form", async () => {
  let checks = 0;
  const t = setup({ fetch: async (p) => ({ ok: true, status: 200,
    text: async () => p.method === "getRoom" ? roomXML(p.id) : availableXML(++checks <= 3),
  }) });
  await delay(0);
  t.start();
  await until(() => !t.$("#find").disabled);
  t.$(".use").click();
  await until(() => !t.$("#find").disabled);
  assert.equal(t.w.document.getElementById("roomDetails").value, "922");
  assert.match(t.$("#status").textContent, /no longer available/);
  assert.equal(t.$(".selected"), null);
  t.$("#show-other").click();
  const room = [...t.$("#results").rows].find((row) => row.cells[0].textContent === "2.105");
  assert.ok(room.classList.contains("unavailable"));
  assert.equal(room.querySelector(".use"), null);
  t.dom.window.close();
});

test("changing a search cancels stale replies and removes old selection buttons", async () => {
  let release;
  const pending = new Promise((resolve) => { release = resolve; });
  const t = setup({ fetch: async (p) => {
    if (p.method === "checkRoom") await pending;
    return { ok: true, status: 200, text: async () => p.method === "getRoom" ? roomXML(p.id) : availableXML(true) };
  } });
  await delay(0);
  t.start();
  await until(() => t.calls.some((c) => c.params.method === "checkRoom"));
  t.input("from", "19:00");
  release();
  await delay(100);
  assert.equal(t.$("#results").children.length, 0);
  assert.equal(t.$("#find").disabled, false);
  assert.equal(t.$("#status").hidden, true);
  assert.equal(t.$("#from").value, "19:00");
  t.dom.window.close();
});

test("search checks every room even when building and seats hide most results", async () => {
  const t = setup({ fetch: async (p) => ({ ok: true, status: 200, text: async () =>
    p.method === "getRoom" ? roomXML(p.id, p.id === "28" ? 20 : 90) : availableXML(true),
  }) });
  await delay(0);
  t.input("building", "2");
  t.input("capacity", "50");
  t.start();
  await until(() => !t.$("#find").disabled);
  assert.equal(t.calls.filter((c) => c.params.method === "getRoom").length, 3);
  assert.equal(t.calls.filter((c) => c.params.method === "checkRoom").length, 3);
  assert.equal(t.$("#summary").textContent, "1 available / 0 unavailable");
  t.dom.window.close();
});

test("capacity sorting switches direction without refetching and keeps unknown capacities last", async () => {
  const t = setup({ fetch: async (p) => ({ ok: true, status: 200, text: async () =>
    p.method === "getRoom" ? roomXML(p.id, p.id === "28" ? 20 : p.id === "243" ? "" : 90) : availableXML(true),
  }) });
  await delay(0);
  t.start();
  await until(() => !t.$("#find").disabled);
  const callsBeforeSort = t.calls.length;
  const order = () => [...t.$("#results").rows].map((row) => row.cells[0].textContent);
  t.$("#sort-capacity").click();
  assert.equal(t.$("#capacity-column").getAttribute("aria-sort"), "descending");
  assert.deepEqual(order(), ["7E.429", "2.105", "2.137"]);
  t.$("#sort-capacity").click();
  assert.equal(t.$("#capacity-column").getAttribute("aria-sort"), "ascending");
  assert.deepEqual(order(), ["2.105", "7E.429", "2.137"]);
  assert.equal(t.calls.length, callsBeforeSort);
  assert.equal(t.w.document.getElementById("roomDetails").value, "922");
  assert.equal(t.$("#from").value, "18:15");
  t.dom.window.close();
});

test("unavailable hours and network failures never appear as available", async () => {
  const t = setup({ fetch: async (p) => {
    if (p.id === "28") throw new TypeError("network down");
    return { ok: true, status: 200, text: async () =>
      p.method === "getRoom" ? roomXML(p.id, 90, "PC", "08:00", p.id === "243" ? "18:00" : "22:00") : availableXML(false) };
  } });
  await delay(0);
  t.start();
  await until(() => !t.$("#find").disabled);
  assert.equal(t.calls.filter((c) => c.params.method === "checkRoom").length, 1);
  assert.match(t.$("#summary").textContent, /0 available.*2 unavailable.*1 failed/);
  assert.equal(t.$("#results").children.length, 0);
  t.$("#show-other").click();
  assert.equal(t.$("#results").children.length, 3);
  assert.equal(t.$(".use"), null);
  for (const row of t.$("#results").rows) {
    assert.ok(row.classList.contains("unavailable"));
    assert.equal(row.cells.length, 5);
    assert.ok(row.querySelector(".action [data-slot=tooltip-trigger]"));
  }
  t.dom.window.close();
});

test("session expiry stops the scan and presents a sign-in message", async () => {
  const t = setup({ fetch: async () => ({ ok: true, status: 200, text: async () => availableXML("sessionEmpty") }) });
  await delay(0);
  t.start();
  await until(() => !t.$("#find").disabled);
  assert.match(t.$("#status").textContent, /session has expired/);
  assert.equal(t.$("#status").getAttribute("role"), "alert");
  assert.equal(t.$("#status-icon").hidden, false);
  assert.equal(t.$(".use"), null);
  assert.ok(t.calls.length <= 2);
  const before = t.calls.length;
  t.input("capacity", "50");
  await delay(50);
  assert.equal(t.calls.length, before);
  t.dom.window.close();
});

test("Stop aborts pending checks and keeps the completed count", async () => {
  const t = setup({ fetch: async (p, init) => {
    await new Promise((resolve, reject) => {
      init.signal.addEventListener("abort", () => reject(new t.w.DOMException("Stopped", "AbortError")), { once: true });
    });
  } });
  await delay(0);
  t.start();
  await until(() => t.calls.length > 0);
  t.$("#stop").click();
  await until(() => !t.$("#find").disabled);
  assert.equal(t.$("#status").hidden, true);
  assert.equal(t.$("#summary").hidden, false);
  assert.equal(t.$("#summary").textContent, "0 available / 0 unavailable");
  assert.ok(t.calls.length <= 2);
  t.dom.window.close();
});

test("stopped searches keep completed results until the time changes or a new search starts", async () => {
  let complete = false;
  const t = setup({ fetch: async (p, init) => {
    if (!complete && p.id !== "28") {
      await new Promise((resolve, reject) => {
        init.signal.addEventListener("abort", () => reject(new t.w.DOMException("Stopped", "AbortError")), { once: true });
      });
    }
    return { ok: true, status: 200, text: async () =>
      p.method === "getRoom" ? roomXML(p.id) : availableXML(true) };
  } });
  await delay(0);
  t.start();
  await until(() => t.$(".use"));
  t.$("#stop").click();
  await until(() => !t.$("#find").disabled);
  assert.equal(t.$("#summary").textContent, "1 available / 0 unavailable");
  assert.equal(t.$("#results").rows.length, 1);
  t.$("#sort-capacity").click();
  t.$("#show-other").click();
  assert.equal(t.$("#summary").textContent, "1 available / 0 unavailable");
  const before = t.calls.length;
  t.input("capacity", "20");
  t.input("building", "2");
  await delay(50);
  assert.equal(t.calls.length, before);
  assert.equal(t.$("#results").rows.length, 1);
  assert.equal(t.$("#summary").textContent, "1 available / 0 unavailable");
  t.$("#clear-filters").click();
  complete = true;
  t.start();
  await until(() => !t.$("#find").disabled);
  assert.equal(t.$("#summary").textContent, "3 available / 0 unavailable");
  t.input("from", "19:00");
  assert.equal(t.$("#summary").hidden, true);
  t.dom.window.close();
});

test("equipment uses complete normalized entries, preserves unfamiliar labels, and excludes negative entries", () => {
  const t = setup({ mount: false });
  const items = (text) => Array.from(t.F.equipmentItems(text));
  assert.deepEqual(items("PC + Projector; White board / interactive-board, Document camera"),
    ["PC", "Projector", "Whiteboard", "Interactive board", "Document camera"]);
  assert.deepEqual(items("PC. Projector\nWHITE_BOARD; pc"), ["PC", "Projector", "Whiteboard"]);
  assert.deepEqual(items("No projector; None, N/A, without PC"), []);
  assert.deepEqual(items("PC and no Projector"), ["PC"]);
  const matches = (equipment, wanted) => t.F.matchesDetails({ capacity: 30, equipment }, { capacity: "0", equipment: wanted });
  assert.equal(matches("No projector", ["Projector"]), false);
  assert.equal(matches("Projector screen", ["Projector"]), false);
  assert.equal(matches("PC + Projector", ["PC", "Projector"]), true);
  assert.equal(matches("PC. Projector", ["PC"]), true);
  assert.equal(matches("White_board", ["White board"]), true);
  assert.equal(matches("PC", ["PC", "Projector"]), false);
  const room = t.C.parseRoom(roomXML("28", 20, "PC\nProjector"), { id: "28" });
  assert.deepEqual(items(room.equipment), ["PC", "Projector"]);
  t.dom.window.close();
});

test("equipment picker searches locally, shows the selection count, and clears equipment", async () => {
  const t = setup();
  await delay(0);
  assert.equal(t.$("#equipment-popup").hidden, true);
  assert.equal(t.$("#equipment-trigger-text").textContent, "Any equipment");
  t.start();
  await until(() => !t.$("#find").disabled);
  const before = t.calls.length;
  t.$("#equipment-trigger").click();
  assert.equal(t.$("#equipment-trigger").getAttribute("aria-expanded"), "true");
  assert.equal(t.root.activeElement, t.$("#equipment-search"));
  t.input("equipment-search", "  PROJ  ");
  const visible = () => [...t.$("#equipment-options").children].filter((label) => !label.hidden).map((label) => label.textContent);
  assert.deepEqual(visible(), ["Projector"]);
  const pointerDown = new t.w.MouseEvent("mousedown", { bubbles: true, cancelable: true, button: 0 });
  t.$('[name=equipment][value="projector"]').dispatchEvent(pointerDown);
  assert.equal(pointerDown.defaultPrevented, true);
  t.$('[name=equipment][value="projector"]').click();
  assert.equal(t.$("#equipment-popup").hidden, false);
  assert.equal(t.$("#equipment-trigger-text").textContent, "1 selected");
  assert.equal(t.$('[data-slot="multi-select-chips"]'), null);
  t.input("equipment-search", "pc");
  t.$('[name=equipment][value="pc"]').click();
  assert.equal(t.$("#equipment-trigger-text").textContent, "2 selected");
  assert.equal(t.$("#results").rows.length, 2);
  await delay(280);
  assert.deepEqual(Array.from(t.saves.at(-1)["nuRoomFinder.preferences.v1"].equipment), ["Projector", "PC"]);
  t.input("equipment-search", "nonexistent");
  assert.deepEqual(visible(), []);
  assert.equal(t.$('[data-slot="multi-select-empty"]').hidden, false);
  t.input("equipment-search", "projector");
  t.$('[name=equipment][value="projector"]').click();
  assert.equal(t.$('[name=equipment][value="projector"]').checked, false);
  assert.equal(t.$("#equipment-trigger-text").textContent, "1 selected");
  t.$("#clear-filters").click();
  assert.equal(t.$("#equipment-trigger-text").textContent, "Any equipment");
  assert.equal(t.calls.length, before);
  assert.equal(t.w.document.getElementById("roomDetails").value, "922");
  t.dom.window.close();
});

test("equipment picker supports keyboard navigation, Escape, outside dismissal, and focus leaving", async () => {
  const t = setup({ stored: { equipment: ["PC", "Projector"] } });
  await delay(0);
  const key = (element, value) => element.dispatchEvent(new t.w.KeyboardEvent("keydown", { key: value, bubbles: true, cancelable: true }));
  key(t.$("#equipment-trigger"), "ArrowDown");
  assert.equal(t.root.activeElement, t.$("#equipment-search"));
  key(t.root.activeElement, "ArrowDown");
  assert.equal(t.root.activeElement.value, "pc");
  key(t.root.activeElement, "ArrowDown");
  assert.equal(t.root.activeElement.value, "projector");
  key(t.root.activeElement, "Home");
  assert.equal(t.root.activeElement.value, "pc");
  key(t.root.activeElement, "ArrowUp");
  assert.equal(t.root.activeElement, t.$("#equipment-search"));
  t.input("equipment-search", "projector");
  key(t.$("#equipment-search"), "Escape");
  assert.equal(t.$("#equipment-popup").hidden, true);
  assert.equal(t.$("#equipment-trigger").getAttribute("aria-expanded"), "false");
  assert.equal(t.root.activeElement, t.$("#equipment-trigger"));
  assert.equal(t.$("#equipment-search").value, "");
  assert.equal(t.$('[name=equipment][value="projector"]').checked, true);
  t.$("#equipment-trigger").click();
  t.w.document.body.dispatchEvent(new t.w.MouseEvent("pointerdown", { bubbles: true, composed: true }));
  assert.equal(t.$("#equipment-popup").hidden, true);
  t.$("#equipment-trigger").click();
  t.$("#capacity").focus();
  await delay(0);
  assert.equal(t.$("#equipment-popup").hidden, true);
  assert.equal(t.calls.length, 0);
  t.dom.window.close();
});

test("equipment picker keeps search and focus when options arrive, then closes during room selection", async () => {
  let release;
  const pending = new Promise((resolve) => { release = resolve; });
  const t = setup({ fetch: async (p) => {
    if (p.id === "922") await pending;
    return { ok: true, status: 200, text: async () => p.method === "getRoom"
      ? roomXML(p.id, 90, p.id === "922" ? "Document camera" : "PC; Projector") : availableXML(true) };
  } });
  await delay(0);
  t.start();
  await until(() => t.$(".use"));
  t.$("#equipment-trigger").click();
  t.input("equipment-search", "camera");
  assert.equal(t.$('[data-slot="multi-select-empty"]').hidden, false);
  release();
  await until(() => !t.$("#find").disabled);
  assert.equal(t.$("#equipment-search").value, "camera");
  assert.equal(t.root.activeElement, t.$("#equipment-search"));
  assert.equal(t.$('[name=equipment][value="document camera"]').parentElement.hidden, false);
  assert.equal(t.$('[data-slot="multi-select-empty"]').hidden, true);
  t.$(".use").click();
  assert.equal(t.$("#equipment-popup").hidden, true);
  assert.equal(t.$("#equipment-trigger").disabled, true);
  await until(() => !t.$("#find").disabled);
  assert.equal(t.$("#equipment-trigger").disabled, false);
  t.dom.window.close();
});

test("room filters narrow and restore completed results immediately without requests", async () => {
  const equipment = {
    "28": "PC + Projector", "243": "PC; White board; Document camera", "922": "Interactive board, Projector",
  };
  const t = setup({ fetch: async (p) => ({ ok: true, status: 200, text: async () =>
    p.method === "getRoom" ? roomXML(p.id, p.id === "28" ? 20 : 90, equipment[p.id]) : availableXML(true),
  }) });
  await delay(0);
  assert.equal(t.$("#equipment-options").children.length, 0);
  assert.equal(t.calls.length, 0);
  t.start();
  await until(() => !t.$("#find").disabled);
  const before = t.calls.length;
  const names = () => [...t.$("#results").rows].map((row) => row.cells[0].textContent);
  assert.deepEqual([...t.$("#equipment-options").querySelectorAll("label")].map((label) => label.textContent),
    ["Document camera", "Interactive board", "PC", "Projector", "Whiteboard"]);
  t.input("capacity", "50");
  assert.deepEqual(names(), ["2.137", "7E.429"]);
  t.input("building", "2");
  assert.deepEqual(names(), ["2.137"]);
  t.$('[name=equipment][value="whiteboard"]').click();
  assert.deepEqual(names(), ["2.137"]);
  t.$('[name=equipment][value="projector"]').click();
  assert.deepEqual(names(), []);
  assert.equal(t.$("#empty").hidden, false);
  t.$("#clear-filters").click();
  assert.deepEqual(names(), ["2.105", "2.137", "7E.429"]);
  assert.equal(t.$("#summary").textContent, "3 available / 0 unavailable");
  assert.equal(t.calls.length, before);
  assert.equal(t.w.document.getElementById("roomDetails").value, "922");
  t.dom.window.close();
});

test("broadening filters reveals completed results immediately without requests", async () => {
  const t = setup({ fetch: async (p) => ({ ok: true, status: 200, text: async () =>
    p.method === "getRoom" ? roomXML(p.id, p.id === "28" ? 20 : 90) : availableXML(true),
  }) });
  await delay(0);
  t.input("building", "2");
  t.input("capacity", "50");
  t.start();
  await until(() => !t.$("#find").disabled);
  const ids = () => t.calls.filter((call) => call.params.method === "checkRoom").map((call) => call.params.id);
  assert.deepEqual(ids().sort(), ["243", "28", "922"]);
  const before = t.calls.length;
  t.input("capacity", "0");
  assert.equal(t.$("#results").rows.length, 2);
  assert.equal(t.$("#find").disabled, false);
  t.input("building", "");
  assert.equal(t.$("#results").rows.length, 3);
  assert.equal(t.$("#find").disabled, false);
  assert.equal(t.calls.length, before);
  assert.equal(t.calls.filter((call) => call.params.method === "getRoom").length, 3);
  assert.ok(t.maxInFlight() <= 2);
  t.dom.window.close();
});

test("filters change during checks without cancelling replies or checking rooms twice", async () => {
  let release;
  const pending = new Promise((resolve) => { release = resolve; });
  const t = setup({ fetch: async (p) => {
    if (p.method === "checkRoom" && p.id !== "922") await pending;
    return { ok: true, status: 200, text: async () => p.method === "getRoom" ? roomXML(p.id) : availableXML(true) };
  } });
  await delay(0);
  t.start();
  await until(() => t.calls.filter((call) => call.params.method === "checkRoom").length === 2);
  t.input("building", "7E");
  assert.ok(t.calls.every((call) => !call.init.signal.aborted));
  release();
  await until(() => !t.$("#find").disabled);
  assert.equal(t.$("#results").rows.length, 1);
  assert.equal(t.$("#results").rows[0].cells[0].textContent, "7E.429");
  const before = t.calls.length;
  t.$("#clear-filters").click();
  assert.equal(t.$("#results").rows.length, 3);
  assert.equal(t.calls.length, before);
  assert.equal(t.calls.filter((call) => call.params.method === "checkRoom").length, 3);
  assert.ok(t.maxInFlight() <= 2);
  t.dom.window.close();
});

test("equipment filters do not skip checks and reveal completed rooms during a scan", async () => {
  let release;
  const pending = new Promise((resolve) => { release = resolve; });
  const t = setup({ stored: { equipment: ["Projector"] }, fetch: async (p) => {
    if (p.method === "checkRoom" && p.id === "922") await pending;
    return { ok: true, status: 200, text: async () => p.method === "getRoom"
      ? roomXML(p.id, 90, p.id === "28" ? "PC" : "Projector") : availableXML(true) };
  } });
  await delay(0);
  t.start();
  await until(() => t.calls.some((call) => call.params.method === "checkRoom" && call.params.id === "922"));
  assert.ok(t.calls.some((call) => call.params.method === "checkRoom" && call.params.id === "28"));
  assert.equal(t.$("#results").rows.length, 1);
  const before = t.calls.length;
  t.$('[name=equipment][value="projector"]').click();
  assert.equal(t.$("#results").rows.length, 2);
  assert.equal(t.calls.length, before);
  release();
  await until(() => !t.$("#find").disabled);
  assert.equal(t.$("#results").rows.length, 3);
  assert.equal(t.calls.filter((call) => call.params.method === "getRoom").length, 3);
  assert.equal(t.calls.filter((call) => call.params.method === "checkRoom").length, 3);
  t.dom.window.close();
});

test("changing time and restarting waits for cancelled checks and ignores their late replies", async () => {
  let release;
  const pending = new Promise((resolve) => { release = resolve; });
  const t = setup({ fetch: async (p) => {
    if (p.method === "checkRoom" && p.timeFrom === "18:15") await pending;
    return { ok: true, status: 200, text: async () => p.method === "getRoom" ? roomXML(p.id) : availableXML(p.timeFrom === "19:00") };
  } });
  await delay(0);
  t.start();
  await until(() => t.calls.filter((call) => call.params.method === "checkRoom").length === 2);
  t.input("from", "19:00");
  t.start();
  assert.equal(t.$("#results").rows.length, 0);
  await delay(30);
  assert.ok(!t.calls.some((call) => call.params.timeFrom === "19:00"));
  release();
  await until(() => !t.$("#find").disabled);
  assert.equal(t.$("#summary").textContent, "3 available / 0 unavailable");
  assert.equal(t.calls.filter((call) => call.params.timeFrom === "19:00").length, 3);
  assert.ok(t.maxInFlight() <= 2);
  t.dom.window.close();
});

test("invalid filters hide results but do not block a date and time search", async () => {
  const t = setup();
  await delay(0);
  t.input("capacity", "10001");
  t.start();
  await until(() => !t.$("#find").disabled);
  assert.equal(t.calls.length, 6);
  assert.equal(t.$(".use"), null);
  assert.equal(t.$("#filter-error").hidden, false);
  const before = t.calls.length;
  t.$("#clear-filters").click();
  assert.equal(t.$("#status").hidden, true);
  assert.equal(t.$("#results").rows.length, 2);
  assert.equal(t.calls.length, before);
  t.input("capacity", "-1");
  assert.equal(t.$(".use"), null);
  assert.equal(t.$("#capacity").getAttribute("aria-invalid"), "true");
  t.input("capacity", "0");
  assert.equal(t.$("#filter-error").hidden, true);
  assert.equal(t.$("#results").rows.length, 2);
  assert.equal(t.calls.length, before);
  t.dom.window.close();
});

test("a new time range checks availability again while reusing room details", async () => {
  const t = setup();
  await delay(0);
  t.start();
  await until(() => !t.$("#find").disabled);
  t.input("from", "19:00");
  assert.equal(t.$("#results").rows.length, 0);
  t.start();
  await until(() => !t.$("#find").disabled);
  assert.equal(t.calls.filter((call) => call.params.method === "getRoom").length, 3);
  assert.equal(t.calls.filter((call) => call.params.method === "checkRoom").length, 6);
  assert.equal(t.calls.filter((call) => call.params.timeFrom === "19:00").length, 3);
  t.input("capacity", "10000");
  assert.equal(t.$("#empty").hidden, false);
  const before = t.calls.length;
  t.start();
  await until(() => !t.$("#find").disabled);
  assert.equal(t.$("#empty").hidden, false);
  assert.equal(t.$("#summary").textContent, "0 available / 0 unavailable");
  assert.equal(t.calls.length, before + 3);
  t.dom.window.close();
});

test("seat sorting keeps available rooms before unavailable rooms", async () => {
  const t = setup({ fetch: async (p) => ({ ok: true, status: 200, text: async () =>
    p.method === "getRoom" ? roomXML(p.id, p.id === "243" ? 200 : 20) : availableXML(p.id !== "243"),
  }) });
  await delay(0);
  t.start();
  await until(() => !t.$("#find").disabled);
  t.$("#show-other").click();
  t.$("#sort-capacity").click();
  const rows = [...t.$("#results").rows];
  assert.deepEqual(rows.map((row) => row.cells[0].textContent), ["2.105", "7E.429", "2.137"]);
  assert.deepEqual(rows.map((row) => row.classList.contains("unavailable")), [false, false, true]);
  t.dom.window.close();
});

test("selection rejects changed booking hours and removes stale selection actions", async () => {
  let changed = false;
  const t = setup({ fetch: async (p) => ({ ok: true, status: 200, text: async () =>
    p.method === "getRoom" ? roomXML(p.id, 90, "PC", "08:00", changed ? "18:00" : "22:00") : availableXML(true),
  }) });
  await delay(0);
  t.start();
  await until(() => !t.$("#find").disabled);
  changed = true;
  t.$(".use").click();
  await until(() => !t.$("#find").disabled);
  t.$("#show-other").click();
  const row = [...t.$("#results").rows].find((row) => row.cells[0].textContent === "2.105");
  assert.ok(row.classList.contains("unavailable"));
  assert.match(t.$("#status").textContent, /booking hours/);
  assert.equal(row.querySelector(".use"), null);
  assert.equal(t.w.document.getElementById("roomDetails").value, "922");
  t.dom.window.close();
});

test("selecting during a scan waits for cancelled requests before rechecking", async () => {
  const t = setup({ fetch: async (p, init) => {
    if (p.id === "243") {
      await new Promise((resolve, reject) => init.signal.addEventListener("abort", () =>
        reject(new t.w.DOMException("Stopped", "AbortError")), { once: true }));
    }
    return { ok: true, status: 200, text: async () => p.method === "getRoom" ? roomXML(p.id) : availableXML(true) };
  } });
  await delay(0);
  t.start();
  await until(() => t.$(".use"));
  t.$(".use").click();
  assert.equal(t.$("#room-filters").disabled, true);
  assert.equal(t.$("#from").disabled, true);
  await until(() => !t.$("#find").disabled);
  assert.equal(t.w.document.getElementById("roomDetails").value, "28");
  assert.equal(t.$("#room-filters").disabled, false);
  assert.equal(t.$("#from").disabled, false);
  assert.equal(t.$("#summary").textContent, "1 available / 0 unavailable");
  assert.ok(t.maxInFlight() <= 2);
  t.dom.window.close();
});

test("stopping selection ignores a late availability reply and keeps the native form", async () => {
  let release;
  let hold = false;
  const pending = new Promise((resolve) => { release = resolve; });
  const t = setup({ fetch: async (p) => {
    if (hold && p.method === "checkRoom") await pending;
    return { ok: true, status: 200, text: async () => p.method === "getRoom" ? roomXML(p.id) : availableXML(true) };
  } });
  await delay(0);
  t.start();
  await until(() => !t.$("#find").disabled);
  const before = t.calls.length;
  hold = true;
  t.$(".use").click();
  await until(() => t.calls.length === before + 2);
  t.$("#stop").click();
  release();
  await until(() => !t.$("#find").disabled);
  assert.equal(t.w.document.getElementById("roomDetails").value, "922");
  assert.equal(t.$(".selected"), null);
  assert.equal(t.$("#room-filters").disabled, false);
  assert.match(t.$("#status").textContent, /Selection stopped/);
  t.dom.window.close();
});

test("selection buttons from a previous time range cannot select into a later search", async () => {
  const t = setup();
  await delay(0);
  t.start();
  await until(() => !t.$("#find").disabled);
  const oldButton = t.$(".use");
  t.input("from", "19:00");
  t.start();
  await until(() => !t.$("#find").disabled);
  const before = t.calls.length;
  oldButton.click();
  await delay(30);
  assert.equal(t.calls.length, before);
  assert.equal(t.w.document.getElementById("roomDetails").value, "922");
  t.dom.window.close();
});

test("restores saved preferences without restoring stale availability or touching the native form", async () => {
  const date = setup({ mount: false });
  const today = date.C.today();
  date.dom.window.close();
  const t = setup({ stored: {
    date: today, from: "16:00", to: "17:30", capacity: "40", building: "7E",
    equipment: ["Projector"], sortCapacity: "asc",
  } });
  await delay(0);
  assert.equal(t.$("#from").value, "16:00");
  assert.equal(t.$("#building").value, "7E");
  assert.equal(t.$("#capacity-column").getAttribute("aria-sort"), "ascending");
  assert.equal(t.$("[name=equipment][value=projector]").checked, true);
  assert.equal(t.w.document.getElementById("timeFrom").value, "18:15");
  assert.equal(t.calls.length, 0);
  assert.equal(t.$(".use"), null);
  t.input("capacity", "50");
  await delay(280);
  const saved = JSON.stringify(t.saves);
  assert.ok(!/example-user|example-role|Keep this draft|My club/.test(saved));
  assert.ok(!/checkedAt|available|results/.test(saved));
  t.dom.window.close();
});

test("unavailable room tooltips sit in the action cells without a Status column", async () => {
  const t = setup({ fetch: async (p) => {
    if (p.method === "getRoom" && p.id === "28") throw new TypeError("Network error");
    return { ok: true, status: 200, text: async () => p.method === "getRoom"
      ? roomXML(p.id, 90, "PC", "08:00", p.id === "243" ? "18:00" : "22:00") : availableXML(false) };
  } });
  await delay(0);
  t.start();
  await until(() => !t.$("#find").disabled);
  t.$("#show-other").click();
  const tip = t.$('[role="tooltip"]');
  const show = (id) => {
    const button = t.$('[data-tooltip-key="' + id + '"]');
    assert.ok(button.closest(".action"));
    button.dispatchEvent(new t.w.MouseEvent("pointerover", { bubbles: true }));
    assert.equal(tip.hidden, false);
    assert.equal(button.getAttribute("aria-describedby"), tip.id);
    return tip.textContent;
  };
  assert.match(show("28"), /could not be checked.*Could not reach/);
  assert.equal(show("243"), "Outside booking hours. Bookable 08:00 to 18:00.");
  assert.equal(show("922"), "Booked for 18:15 to 21:00.");
  assert.ok([...t.$("#results").rows].every((row) => row.cells.length === 5));
  assert.ok([...t.$("#results").rows].every((row) => row.cells[0].querySelector("button") === null));
  assert.ok(![...t.root.querySelectorAll("th")].some((head) => head.textContent === "Status"));
  t.dom.window.close();
});

test("tooltips support focus, Escape, tap, and outside dismissal without selecting a room", async () => {
  const t = setup();
  await delay(0);
  t.start();
  await until(() => !t.$("#find").disabled);
  t.$("#show-other").click();
  const before = t.calls.length;
  const button = () => t.$('[data-tooltip-key="243"]');
  const tip = t.$('[role="tooltip"]');
  button().focus();
  assert.equal(tip.hidden, false);
  assert.equal(tip.textContent, "Booked for 18:15 to 21:00.");
  button().dispatchEvent(new t.w.KeyboardEvent("keydown", { key: "Escape", bubbles: true, composed: true }));
  assert.equal(tip.hidden, true);
  assert.equal(button().hasAttribute("aria-describedby"), false);
  t.$("#sort-capacity").click();
  assert.equal(tip.hidden, true);
  assert.equal(t.root.activeElement.dataset.tooltipKey, "243");
  button().click();
  assert.equal(tip.hidden, false);
  t.w.document.body.dispatchEvent(new t.w.MouseEvent("pointerdown", { bubbles: true, composed: true }));
  assert.equal(tip.hidden, true);
  assert.equal(t.calls.length, before);
  assert.equal(t.w.document.getElementById("roomDetails").value, "922");
  t.dom.window.close();
});

test("a tooltip stays open when the pointer enters it and closes after leaving", async () => {
  const t = setup();
  await delay(0);
  t.start();
  await until(() => !t.$("#find").disabled);
  t.$("#show-other").click();
  const button = t.$('[data-tooltip-key="243"]');
  const tip = t.$('[role="tooltip"]');
  button.dispatchEvent(new t.w.MouseEvent("pointerover", { bubbles: true }));
  button.dispatchEvent(new t.w.MouseEvent("pointerout", { bubbles: true, relatedTarget: tip }));
  tip.dispatchEvent(new t.w.MouseEvent("pointerover", { bubbles: true, relatedTarget: button }));
  await delay(130);
  assert.equal(tip.hidden, false);
  tip.dispatchEvent(new t.w.MouseEvent("pointerout", { bubbles: true, relatedTarget: t.w.document.body }));
  await until(() => tip.hidden);
  assert.equal(button.hasAttribute("aria-describedby"), false);
  t.dom.window.close();
});

test("tooltips and keyboard focus survive incoming results and disappear with filtered rows", async () => {
  let release;
  const pending = new Promise((resolve) => { release = resolve; });
  const t = setup({ fetch: async (p) => {
    if (p.id === "922") await pending;
    return { ok: true, status: 200, text: async () => p.method === "getRoom" ? roomXML(p.id) : availableXML(p.id !== "28") };
  } });
  await delay(0);
  t.$("#show-other").click();
  t.start();
  await until(() => t.$('[data-tooltip-key="28"]'));
  t.$('[data-tooltip-key="28"]').focus();
  const tip = t.$('[role="tooltip"]');
  release();
  await until(() => !t.$("#find").disabled);
  assert.equal(t.root.activeElement.dataset.tooltipKey, "28");
  assert.equal(tip.hidden, false);
  assert.equal(tip.textContent, "Booked for 18:15 to 21:00.");
  t.input("building", "7E");
  assert.equal(tip.hidden, true);
  t.dom.window.close();
});
