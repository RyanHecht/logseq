/*
 * Seeds localStorage defaults on first load.
 *
 * Logseq stores per-browser settings in localStorage, so every new browser or
 * device starts unconfigured — most importantly without a sync server URL,
 * which is what points the app at a self-hosted server.
 *
 * This runs before the app boots and fills in defaults from
 * /web-defaults.json.
 *
 * Rules:
 *  - Only ever writes a key that is currently absent. Anything the user has
 *    changed in the UI is left alone, so this is not a settings enforcer.
 *  - Never throws. A malformed or missing defaults file must not prevent the
 *    app from loading.
 *
 * Two value formats exist and are NOT interchangeable:
 *  - raw: written by config.cljs via .setItem, stored as a plain string
 *  - edn: written by frontend.storage/set via pr-str, so values must already
 *         be EDN-encoded (a string is "\"dark\"", not dark)
 * Writing the wrong format makes Logseq fail to read the value.
 */
(function () {
  "use strict";

  var URL = "/web-defaults.json";

  function seed(group) {
    if (!group || typeof group !== "object") return 0;
    var n = 0;
    Object.keys(group).forEach(function (key) {
      try {
        // getItem returns null only when the key is absent; "" is a real value
        // a user may have set deliberately, so treat it as present.
        if (window.localStorage.getItem(key) === null) {
          window.localStorage.setItem(key, String(group[key]));
          n++;
        }
      } catch (e) {
        /* private mode, quota, disabled storage - skip this key */
      }
    });
    return n;
  }

  try {
    var req = new XMLHttpRequest();
    // Synchronous on purpose: these values must be present before the app
    // reads them at boot. The file is tiny and same-origin.
    req.open("GET", URL, false);
    req.send(null);

    if (req.status < 200 || req.status >= 300) return;

    var defaults = JSON.parse(req.responseText);
    var n = seed(defaults.raw) + seed(defaults.edn);
    if (n > 0) console.info("[ryanOS] seeded " + n + " default setting(s)");
  } catch (e) {
    console.warn("[ryanOS] could not seed defaults:", e && e.message);
  }
})();
