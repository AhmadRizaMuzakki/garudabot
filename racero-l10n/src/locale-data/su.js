/*! React Intl locale data — Sundanese (su), based on Indonesian */
!(function (e, a) {
  "object" == typeof exports && "undefined" != typeof module
    ? (module.exports = a())
    : "function" == typeof define && define.amd
      ? define(a)
      : ((e.ReactIntlLocaleData = e.ReactIntlLocaleData || {}),
        (e.ReactIntlLocaleData.su = a()));
})(this, function () {
  "use strict";
  return [
    {
      locale: "su",
      pluralRuleFunction: function () {
        return "other";
      },
      fields: {
        year: {
          displayName: "taun",
          relative: { 0: "taun ieu", 1: "taun hareup", "-1": "taun kamari" },
          relativeTime: {
            future: { other: "dina {0} taun" },
            past: { other: "{0} taun ka tukang" }
          }
        },
        month: {
          displayName: "bulan",
          relative: { 0: "bulan ieu", 1: "bulan hareup", "-1": "bulan kamari" },
          relativeTime: {
            future: { other: "dina {0} bulan" },
            past: { other: "{0} bulan ka tukang" }
          }
        },
        day: {
          displayName: "poe",
          relative: { 0: "poe ieu", 1: "isukan", "-1": "kamari" },
          relativeTime: {
            future: { other: "dina {0} poe" },
            past: { other: "{0} poe ka tukang" }
          }
        },
        hour: {
          displayName: "jam",
          relative: { 0: "jam ieu" },
          relativeTime: {
            future: { other: "dina {0} jam" },
            past: { other: "{0} jam ka tukang" }
          }
        },
        minute: {
          displayName: "menit",
          relative: { 0: "menit ieu" },
          relativeTime: {
            future: { other: "dina {0} menit" },
            past: { other: "{0} menit ka tukang" }
          }
        },
        second: {
          displayName: "detik",
          relative: { 0: "ayeuna" },
          relativeTime: {
            future: { other: "dina {0} detik" },
            past: { other: "{0} detik ka tukang" }
          }
        }
      }
    }
  ];
});
