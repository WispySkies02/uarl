(function (root) {
  "use strict";

  function text(value) { return String(value == null ? "" : value).trim(); }
  function identity(value) { return text(value).replace(/^@/, "").toLowerCase(); }
  function array(value) { return Array.isArray(value) ? value : []; }
  function make(value) {
    var key = identity(value);
    return key === "toyota" ? "Toyota" : key === "ford" ? "Ford" : key === "chevrolet" || key === "chevy" ? "Chevrolet" : "";
  }
  function forDriver(data, division, entry, record) {
    data = data || {}; entry = entry || {};
    // A recorded manufacturer belongs to that event, including exhibitions.
    if (text(entry.make)) return make(entry.make);
    var user = entry.username || entry.user || entry.driverId || entry.id;
    if (user && root.UARLResultDrivers) user = root.UARLResultDrivers.canonicalUser(data, user);
    var lookup = Object.assign({}, entry, { username: user });
    var eventEntries = array(record && record.entries).map(function (row) {
      var id = row.user || row.username || row.driverId || row.id;
      if (id && root.UARLResultDrivers) id = root.UARLResultDrivers.canonicalUser(data, id);
      return Object.assign({}, row, { id: id });
    });
    var eventDriver = root.UARLStandings.matchingDriver(eventEntries, lookup);
    if (eventDriver && text(eventDriver.make)) return make(eventDriver.make);
    var drivers = array(data.race && data.race.drivers).filter(function (driver) { return driver.division === division; });
    var found = root.UARLStandings.matchingDriver(drivers, lookup);
    if (!found && root.UARLResultDrivers) {
      var resolved = root.UARLResultDrivers.resolve(root.UARLResultDrivers.pool(data, { division: division }), entry.name, user, entry.number);
      if (resolved && resolved.user) found = drivers.find(function (driver) { return identity(driver.id) === identity(resolved.user); });
    }
    return make(found && found.make);
  }
  function badge(value) {
    var brand = make(value);
    if (!brand) return '<span class="manufacturer-badge manufacturer-badge--pending" role="img" aria-label="Manufacturer not assigned" title="Manufacturer not assigned">—</span>';
    var key = brand.toLowerCase();
    return '<span class="manufacturer-badge manufacturer-badge--' + key + '" role="img" aria-label="' + brand + ' manufacturer" title="' + brand + '"><img src="/assets/manufacturers/' + key + '.png" alt="" aria-hidden="true" decoding="async"></span>';
  }
  root.UARLManufacturerBadges = { make: make, forDriver: forDriver, badge: badge };
})(typeof window !== "undefined" ? window : globalThis);
