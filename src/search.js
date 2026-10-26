(function (scope) {
  "use strict";
  const C = scope.NURoomFinderCore;
  function pause(ms, signal) {
    return new Promise((resolve) => {
      if (signal.aborted) return resolve();
      const finish = () => {
        clearTimeout(timer);
        signal.removeEventListener("abort", finish);
        resolve();
      };
      const timer = setTimeout(finish, ms);
      signal.addEventListener("abort", finish, { once: true });
    });
  }
  class SearchController {
    constructor(rooms, options = {}) {
      this.rooms = rooms;
      this.catalog = new Map();
      this.results = new Map();
      this.query = null;
      this.active = null;
      this.stopped = false;
      this.error = null;
      this.task = Promise.resolve();
      this.onChange = options.onChange || (() => {});
    }
    get running() { return !!this.active; }
    reset() {
      this.active?.abort();
      this.active = null;
      this.query = null;
      this.results = new Map();
      this.stopped = false;
      this.error = null;
      this.onChange();
    }
    start(query) {
      this.reset();
      this.query = Object.freeze({ date: query.date, from: query.from, to: query.to });
      this.schedule();
      this.onChange();
    }
    stop() {
      if (!this.active) return;
      this.stopped = true;
      this.active.abort();
      this.onChange();
    }
    schedule() {
      if (!this.query || this.active || this.stopped || this.error?.fatal || !this.rooms.length) return;
      const previous = this.task;
      const controller = new AbortController();
      this.active = controller;
      const query = this.query;
      this.task = (async () => {
        // Wait for cancelled requests to settle before starting another pair.
        await previous;
        if (!controller.signal.aborted) await this.drain(query, controller);
        if (this.active === controller) {
          this.active = null;
          this.onChange();
        }
      })();
      this.onChange();
    }
    async drain(query, controller) {
      const { signal } = controller;
      let next = 0;
      const worker = async () => {
        while (!signal.aborted && next < this.rooms.length) {
          const room = this.rooms[next++];
          let details = this.catalog.get(room.id);
          try {
            if (!details) {
              details = await C.roomDetails(room, signal);
              if (signal.aborted) return;
              this.catalog.set(room.id, details);
              this.onChange();
              await pause(120, signal);
            }
            if (signal.aborted) return;
            let result;
            if (!C.withinHours(details, query)) {
              result = { ...details, status: "hours" };
            } else {
              const available = await C.availability(details, query, signal);
              if (signal.aborted) return;
              result = { ...details, status: available ? "available" : "unavailable" };
            }
            this.results.set(room.id, result);
            this.onChange();
          } catch (error) {
            if (signal.aborted || error.name === "AbortError") return;
            if (error.fatal) {
              this.error = error;
              controller.abort();
            } else {
              this.results.set(room.id, { ...(details || room), status: "error", message: error.message });
            }
            this.onChange();
          } finally {
            await pause(180, signal);
          }
        }
      };
      await Promise.all([worker(), worker()]);
    }
  }
  scope.NURoomFinderSearch = SearchController;
})(window);
