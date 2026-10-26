(function (scope) {
  "use strict";
  const { clean } = scope.NURoomFinderCore;
  const aliases = new Map([
    ["pc", "PC"], ["projector", "Projector"],
    ["whiteboard", "Whiteboard"], ["interactiveboard", "Interactive board"],
  ]);
  function equipmentName(value) {
    const name = clean(value);
    return aliases.get(name.toLowerCase().replace(/[\s_-]+/g, "")) || name;
  }
  const equipmentKey = (value) => equipmentName(value).toLowerCase();
  function equipmentItems(value) {
    const items = new Map();
    // Match complete entries. Unknown equipment keeps the portal's own label.
    for (const entry of String(value ?? "").replace(/\bn\s*\/\s*a\b/gi, "").split(/[,;/+|\r\n]|\.(?=\s)/)) {
      const text = clean(entry);
      if (!text || /^(?:no|none|without|not)(?:\s|$)/i.test(text) ||
          /^(?:n\/?a|nil|нет|-|0)$/i.test(text)) continue;
      for (const part of text.split(/\s+(?:and|&)\s+/i)) {
        const name = equipmentName(part);
        if (name && !/^(?:no|none|without|not)(?:\s|$)/i.test(name)) items.set(equipmentKey(name), name);
      }
    }
    return [...items.values()];
  }
  function validate(filters) {
    if (!/^\d+$/.test(String(filters.capacity)) || Number(filters.capacity) > 10000) {
      return "Enter minimum seats from 0 to 10000.";
    }
    return "";
  }
  const matchesBuilding = (room, filters) => !filters.building || room.building === filters.building;
  function matchesDetails(room, filters) {
    if (validate(filters)) return false;
    if (Number(filters.capacity) > 0 &&
        (!Number.isFinite(room.capacity) || room.capacity < Number(filters.capacity))) return false;
    const equipment = new Set(equipmentItems(room.equipment).map(equipmentKey));
    return filters.equipment.every((name) => equipment.has(equipmentKey(name)));
  }
  const matches = (room, filters) => matchesBuilding(room, filters) && matchesDetails(room, filters);
  scope.NURoomFinderFilters = {
    equipmentKey, equipmentItems, validate, matchesBuilding, matchesDetails, matches,
  };
})(window);
