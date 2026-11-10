(function (root) {
  "use strict";

  function text(value) { return String(value == null ? "" : value).trim(); }
  function array(value) { return Array.isArray(value) ? value : []; }
  function esc(value) { return text(value).replace(/[&<>"']/g, function (character) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[character]; }); }
  function identity(data, user) {
    return text(root.UARLResultDrivers ? root.UARLResultDrivers.canonicalUser(data, user) : user).replace(/^@/, "").toLowerCase();
  }
  function image(value) { return typeof value === "string" ? text(value) : ""; }
  function entries(data, division) {
    var drivers = data.drivers || {}, rows = [];
    if (division === "d1") array(drivers.teams).forEach(function (team, index) {
      ["entries", "pendingDrivers"].forEach(function (field) {
        array(team[field]).forEach(function (entry, row) {
          rows.push({ entry: entry, target: { section: "teams", index: index, step: field === "entries" ? 2 : 3, field: field, row: row } });
        });
      });
    });
    if (division === "open") array(drivers.openEntries).forEach(function (entry, index) {
      rows.push({ entry: entry, target: { section: "open", index: index, step: 1 } });
    });
    return rows;
  }
  function resolve(data, division, row) {
    data = data || {}; row = row || {};
    var empty = { src: "", target: null };
    var user = identity(data, row.username || row.user || row.driverId || row.id), number = text(row.number);
    if (!user || !number) return empty;
    // A number or display name alone must never select another driver's artwork.
    if (division === "d2") {
      var archived = array(data.race && data.race.drivers).filter(function (entry) {
        return entry.division === "d2" && identity(data, entry.id) === user && text(entry.number) === number;
      });
      return { src: archived.length === 1 ? image(archived[0].numberImage) : "", target: null };
    }
    var matches = entries(data, division).filter(function (record) {
      return identity(data, record.entry.user) === user && text(record.entry.number) === number;
    });
    var entry = matches.length === 1 ? matches[0] : null;
    var profiles = data.drivers && data.drivers.profiles || {}, keys = Object.keys(profiles);
    var key = keys.find(function (key) { return identity(data, key) === user; });
    var profile = key && profiles[key], profileMatches = profile && text(profile.number) === number;
    var profileTarget = profileMatches ? { section: "profiles", index: keys.indexOf(key), step: 2 } : null;
    if (entry && image(entry.entry.numberImage)) return { src: image(entry.entry.numberImage), target: entry.target };
    if (profileMatches && image(profile.numberImage)) return { src: image(profile.numberImage), target: profileTarget };
    return { src: "", target: entry ? entry.target : profileTarget };
  }
  function html(data, division, row) {
    var artwork = resolve(data, division, row), number = text(row && row.number);
    return '<span class="standings-number" role="img" aria-label="' + esc(number ? 'Car number ' + number : 'Car number pending') + '">' +
      '<span class="standings-number-text">' + esc(number || "—") + '</span>' +
      (artwork.src ? '<img class="standings-number-image" src="' + esc(artwork.src) + '" alt="" aria-hidden="true" decoding="async" loading="lazy">' : '') + '</span>';
  }

  var fitted = new Map(), installed = new WeakSet();
  function install(node) {
    if (!node || installed.has(node)) return;
    installed.add(node);
    node.addEventListener("load", function (event) {
      var image = event.target;
      if (!image.matches || !image.matches(".standings-number-image")) return;
      var slot = image.closest(".standings-number");
      if (!image.dataset.standingsFitted) {
        image.dataset.standingsFitted = "true";
        try {
          var url = image.currentSrc || image.src;
          if (root.UARLData && (url.startsWith("data:") || new URL(url, root.location.href).origin === root.location.origin)) {
            if (!fitted.has(url)) fitted.set(url, root.UARLData.trimArtwork(image).toDataURL("image/webp", 0.95));
            if (fitted.get(url) !== image.src) { image.src = fitted.get(url); return; }
          }
        } catch (error) { /* Unreadable canvas artwork keeps its original proportions. */ }
      }
      slot.classList.add("is-ready");
    }, true);
    node.addEventListener("error", function (event) {
      var image = event.target;
      if (!image.matches || !image.matches(".standings-number-image")) return;
      image.closest(".standings-number").classList.remove("is-ready");
      image.remove();
    }, true);
  }
  root.UARLStandingsArtwork = { resolve: resolve, html: html, install: install };
  if (typeof document !== "undefined") install(document);
})(typeof window !== "undefined" ? window : globalThis);
