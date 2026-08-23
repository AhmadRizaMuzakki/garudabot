/*! React Intl locale data — Medan (mdn), based on Indonesian */
!(function (e, a) {
  "object" == typeof exports && "undefined" != typeof module
    ? (module.exports = a())
    : "function" == typeof define && define.amd
      ? define(a)
      : ((e.ReactIntlLocaleData = e.ReactIntlLocaleData || {}),
        (e.ReactIntlLocaleData.mdn = a()));
})(this, function () {
  "use strict";
  return [
    {
      locale: "mdn",
      pluralRuleFunction: function () {
        return "other";
      },
      fields: {
        year: {
          displayName: "tahun",
          relative: { 0: "tahun ni", 1: "tahun depan", "-1": "tahun lalu" },
          relativeTime: {
            future: { other: "dalam {0} tahun" },
            past: { other: "{0} tahun yang lalu" }
          }
        },
        month: {
          displayName: "bulan",
          relative: { 0: "bulan ni", 1: "bulan depan", "-1": "bulan lalu" },
          relativeTime: {
            future: { other: "dalam {0} bulan" },
            past: { other: "{0} bulan yang lalu" }
          }
        },
        day: {
          displayName: "hari",
          relative: { 0: "hari ni", 1: "besok", "-1": "kemarin" },
          relativeTime: {
            future: { other: "dalam {0} hari" },
            past: { other: "{0} hari yang lalu" }
          }
        },
        hour: {
          displayName: "jam",
          relative: { 0: "jam ni" },
          relativeTime: {
            future: { other: "dalam {0} jam" },
            past: { other: "{0} jam yang lalu" }
          }
        },
        minute: {
          displayName: "menit",
          relative: { 0: "menit ni" },
          relativeTime: {
            future: { other: "dalam {0} menit" },
            past: { other: "{0} menit yang lalu" }
          }
        },
        second: {
          displayName: "detik",
          relative: { 0: "sekarang" },
          relativeTime: {
            future: { other: "dalam {0} detik" },
            past: { other: "{0} detik yang lalu" }
          }
        }
      }
    }
  ];
});
