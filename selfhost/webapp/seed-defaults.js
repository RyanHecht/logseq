/*
 * Seeds localStorage defaults on first load.
 *
 * Logseq stores per-browser settings in localStorage, so every new browser or
 * device starts unconfigured — most importantly without a sync server URL,
 * which is what points the app at a self-hosted server.
 *
 * This runs before the app boots and fills in defaults from two files:
 *
 *   /web-defaults.json  non-secret settings (sync URL, theme). Safe to commit.
 *   /web-secrets.json   OPTIONAL. Credentials, e.g. an auth refresh token.
 *                       Absent by default; a 404 is treated as "nothing to do".
 *
 * SECURITY: anything in web-secrets.json is served to every browser that can
 * load this page. A Logseq refresh token is a long-lived credential for the
 * whole account. Only deploy that file behind an authenticating proxy, and
 * never commit it.
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

  var DEFAULTS_URL = "/web-defaults.json";
  var SECRETS_URL = "/web-secrets.json";

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

  function load(url) {
    // Synchronous on purpose: these values must be present before the app
    // reads them at boot. The files are tiny and same-origin.
    var req = new XMLHttpRequest();
    req.open("GET", url, false);
    req.send(null);
    if (req.status < 200 || req.status >= 300) return null;
    return JSON.parse(req.responseText);
  }

  var n = 0;

  try {
    var defaults = load(DEFAULTS_URL);
    if (defaults) n += seed(defaults.raw) + seed(defaults.edn);
  } catch (e) {
    console.warn("[logseq-selfhost] could not seed defaults:", e && e.message);
  }

  try {
    // Optional. Missing or unreadable is the normal, expected case.
    var secrets = load(SECRETS_URL);
    if (secrets) n += seed(secrets.raw) + seed(secrets.edn);
  } catch (e) {
    /* no secrets file deployed */
  }

  if (n > 0) console.info("[logseq-selfhost] seeded " + n + " setting(s)");
})();
