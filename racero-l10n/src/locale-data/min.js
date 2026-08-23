/*! React Intl locale data — Minangkabau / Padang (min), based on Indonesian */
!(function (e, a) {
  "object" == typeof exports && "undefined" != typeof module
    ? (module.exports = a())
    : "function" == typeof define && define.amd
      ? define(a)
      : ((e.ReactIntlLocaleData = e.ReactIntlLocaleData || {}),
        (e.ReactIntlLocaleData.min = a()));
})(this, function () {
  "use strict";
  return [
    {
      locale: "min",
      pluralRuleFunction: function () {
        return "other";
      },
      fields: {
        year: {
          displayName: "tahun",
          relative: { 0: "tahun ko", 1: "tahun muka", "-1": "tahun lalu" },
          relativeTime: {
            future: { other: "dalam {0} tahun" },
            past: { other: "{0} tahun nan lalu" }
          }
        },
        month: {
          displayName: "bulan",
          relative: { 0: "bulan ko", 1: "bulan muka", "-1": "bulan lalu" },
          relativeTime: {
            future: { other: "dalam {0} bulan" },
            past: { other: "{0} bulan nan lalu" }
          }
        },
        day: {
          displayName: "hari",
          relative: { 0: "hari ko", 1: "besok", "-1": "kamiari" },
          relativeTime: {
            future: { other: "dalam {0} hari" },
            past: { other: "{0} hari nan lalu" }
          }
        },
        hour: {
          displayName: "jam",
          relative: { 0: "jam ko" },
          relativeTime: {
            future: { other: "dalam {0} jam" },
            past: { other: "{0} jam nan lalu" }
          }
        },
        minute: {
          displayName: "minik",
          relative: { 0: "minik ko" },
          relativeTime: {
            future: { other: "dalam {0} minik" },
            past: { other: "{0} minik nan lalu" }
          }
        },
        second: {
          displayName: "detik",
          relative: { 0: "kini" },
          relativeTime: {
            future: { other: "dalam {0} detik" },
            past: { other: "{0} detik nan lalu" }
          }
        }
      }
    }
  ];
});
