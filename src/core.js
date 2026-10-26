(function (scope) {
  "use strict";

  class FinderError extends Error {
    constructor(message, fatal = false) {
      super(message);
      this.name = "FinderError";
      this.fatal = fatal;
    }
  }
  const clean = (value) => String(value ?? "").replace(/\s+/g, " ").trim();
  const minutes = (time) => {
    if (!/^\d{2}:\d{2}$/.test(time || "")) return NaN;
    const [h, m] = time.split(":").map(Number);
    return h < 24 && m < 60 ? h * 60 + m : NaN;
  };
  function today() {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Almaty", year: "numeric", month: "2-digit", day: "2-digit",
    }).format(new Date());
  }
  function dayNumber(value) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value || "")) return NaN;
    const date = new Date(value + "T00:00:00Z");
    return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value
      ? date.getTime() / 86400000 : NaN;
  }
  function portalDate(iso) {
    return iso.split("-").reverse().join(".");
  }
  function isoDate(value) {
    const parts = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(value || "");
    return parts ? parts[3] + "-" + parts[2] + "-" + parts[1] : "";
  }
  function validate(query, currentDate = today()) {
    const difference = dayNumber(query.date) - dayNumber(currentDate);
    if (!Number.isFinite(difference)) return "Choose a valid date.";
    if (difference < 0 || difference > 28) return "Choose a date from today through 28 days ahead.";
    const from = minutes(query.from);
    const to = minutes(query.to);
    if (!Number.isFinite(from) || !Number.isFinite(to)) return "Enter a start and end time.";
    if (from % 15 || to % 15) return "Use 15-minute increments, such as 18:00 or 18:15.";
    if (to <= from) return "The end time must be later than the start time on the same day.";
    return "";
  }
  function xmlDocument(text) {
    const xml = new scope.DOMParser().parseFromString(text, "application/xml");
    if (xml.querySelector("parsererror") || xml.documentElement?.tagName !== "config") {
      if (/<(?:html|form)|login|sign.?in/i.test(text)) {
        throw new FinderError("Your session may have expired. Sign in to the NU portal, then refresh this page.", true);
      }
      throw new FinderError("The portal returned an unexpected response. Try again.");
    }
    const ids = [...xml.querySelectorAll("item > id")].map((el) => clean(el.textContent));
    if (ids.some((id) => /^sessionEmpty/i.test(id))) {
      throw new FinderError("Your NU session has expired. Sign in and refresh this page.", true);
    }
    if (xml.documentElement.getAttribute("warning")) {
      throw new FinderError("The portal returned a warning. Check the original booking form.");
    }
    return xml;
  }
  function parseAvailability(text) {
    const xml = xmlDocument(text);
    const items = [...xml.querySelectorAll("config > item")];
    if (items.length !== 1 || xml.querySelector("submit")) {
      throw new FinderError("The portal returned an unexpected availability response.");
    }
    const id = clean(items[0].querySelector("id")?.textContent);
    if (id === "true") return true;
    if (id === "false") return false;
    throw new FinderError("Availability could not be confirmed.");
  }
  function parseRoom(text, room) {
    const xml = xmlDocument(text);
    const item = [...xml.querySelectorAll("config > item")].find(
      (el) => clean(el.querySelector("id")?.textContent) === String(room.id),
    );
    if (!item) throw new FinderError("The portal did not return this room's details.");
    const read = (tag) => clean(item.querySelector(tag)?.textContent);
    const capacity = /^\d+$/.test(read("capacity")) ? Number(read("capacity")) : null;
    const allowedFrom = read("allowedFrom") || "08:00";
    const allowedTo = read("allowedTo") || "22:00";
    if (!Number.isFinite(minutes(allowedFrom)) || !Number.isFinite(minutes(allowedTo))) {
      throw new FinderError("This room's booking hours could not be read.");
    }
    return {
      ...room, capacity, specification: read("specification"),
      equipment: clean(item.querySelector("equipment")?.textContent.replace(/[\r\n]+/g, ", ")),
      allowedFrom, allowedTo,
    };
  }
  function withinHours(room, query) {
    return minutes(query.from) >= minutes(room.allowedFrom) &&
      minutes(query.to) <= minutes(room.allowedTo);
  }
  function requestBody(method, params) {
    const allowed = {
      getRoom: ["id", "upost", "idUser"],
      checkRoom: ["id", "dater", "timeFrom", "timeTo"],
    };
    if (!allowed[method]) throw new FinderError("Unsupported request.", true);
    const body = new URLSearchParams({ method });
    for (const name of allowed[method]) {
      if (params[name] !== undefined) body.set(name, String(params[name]));
    }
    return body;
  }
  async function request(method, params, signal, timeoutMs = 12000) {
    const controller = new AbortController();
    const cancel = () => controller.abort();
    signal?.addEventListener("abort", cancel, { once: true });
    if (signal?.aborted) controller.abort();
    const timeout = setTimeout(cancel, timeoutMs);
    try {
      const response = await scope.fetch("/.OfficeBooking/DataServlet", {
        method: "POST", credentials: "same-origin", cache: "no-store",
        headers: { "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8" },
        body: requestBody(method, params), signal: controller.signal,
      });
      if ([401, 403].includes(response.status)) {
        throw new FinderError("The portal requires you to sign in again. Refresh after signing in.", true);
      }
      if (response.status === 429) {
        throw new FinderError("The portal is limiting requests. Wait a minute before searching again.", true);
      }
      if (!response.ok) throw new FinderError("The portal returned HTTP " + response.status + ". Try again.");
      return await response.text();
    } catch (error) {
      if (signal?.aborted) throw error;
      if (error.name === "AbortError") throw new FinderError("This check timed out. Try again.");
      if (error instanceof FinderError) throw error;
      throw new FinderError("Could not reach the NU portal. Check your connection and try again.");
    } finally {
      clearTimeout(timeout);
      signal?.removeEventListener("abort", cancel);
    }
  }
  async function roomDetails(room, signal) {
    const doc = scope.document;
    const text = await request("getRoom", {
      id: room.id,
      upost: doc.getElementById("idUPost")?.value ?? "null",
      idUser: doc.getElementById("idUser")?.value ?? "null",
    }, signal);
    return parseRoom(text, room);
  }
  async function availability(room, query, signal) {
    return parseAvailability(await request("checkRoom", {
      id: room.id, dater: portalDate(query.date), timeFrom: query.from, timeTo: query.to,
    }, signal));
  }
  function nativeValue(element, value) {
    const proto = element.tagName === "SELECT" ? scope.HTMLSelectElement.prototype : scope.HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, "value").set.call(element, value);
  }
  function fillForm(room, query) {
    const doc = scope.document;
    const fields = {
      room: doc.getElementById("roomDetails"), date: doc.getElementById("datepicker"),
      from: doc.getElementById("timeFrom"), to: doc.getElementById("timeTo"),
    };
    if (Object.values(fields).some((field) => !field) ||
      ![...fields.room.options].some((option) => option.value === room.id)) {
      throw new FinderError("The booking form changed. Refresh the page and try again.");
    }
    if (!withinHours(room, query)) throw new FinderError("Your times fall outside this room's booking hours.");
    nativeValue(fields.room, room.id);
    nativeValue(fields.date, portalDate(query.date));
    for (const [name, value] of [["from", query.from], ["to", query.to]]) {
      fields[name].min = room.allowedFrom;
      fields[name].max = room.allowedTo;
      nativeValue(fields[name], value);
      fields[name].className = "time required";
      fields[name].setCustomValidity("");
    }
    for (const id of ["capacity", "specification", "equipment"]) {
      const element = doc.getElementById(id);
      if (element) element.textContent = room[id] === null ? "" : String(room[id]);
    }
    const notice = doc.getElementById("lbNotice");
    if (notice) {
      notice.textContent = "Available";
      notice.className = "rbooking__available";
    }
  }
  scope.NURoomFinderCore = {
    FinderError, clean, minutes, today, dayNumber, portalDate, isoDate, validate,
    parseAvailability, parseRoom, withinHours,
    requestBody, roomDetails, availability, fillForm,
  };
})(window);
