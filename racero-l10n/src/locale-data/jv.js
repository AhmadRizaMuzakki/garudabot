!(function (e, a) {
  "object" == typeof exports && "undefined" != typeof module
    ? (module.exports = a())
    : "function" == typeof define && define.amd
      ? define(a)
      : ((e.ReactIntlLocaleData = e.ReactIntlLocaleData || {}),
        (e.ReactIntlLocaleData.jv = a()));
})(this, function () {
  "use strict";
  return [
    {
      locale: "jv",
      pluralRuleFunction: function (e, a) {
        return "other";
      },
      fields: {
        year: {
          displayName: "taun",
          relative: { 0: "taun iki", 1: "taun ngarep", "-1": "taun kepungkur" },
          relativeTime: {
            future: { other: "ing {0} taun" },
            past: { other: "{0} taun kepungkur" },
          },
        },
        "year-short": {
          displayName: "tn.",
          relative: { 0: "taun iki", 1: "taun ngarep", "-1": "taun kepungkur" },
          relativeTime: {
            future: { other: "ing {0} tn" },
            past: { other: "{0} tn kepungkur" },
          },
        },
        month: {
          displayName: "wulan",
          relative: {
            0: "wulan iki",
            1: "wulan ngarep",
            "-1": "wulan kepungkur",
          },
          relativeTime: {
            future: { other: "ing {0} wulan" },
            past: { other: "{0} wulan kepungkur" },
          },
        },
        "month-short": {
          displayName: "wln.",
          relative: {
            0: "wulan iki",
            1: "wulan ngarep",
            "-1": "wulan kepungkur",
          },
          relativeTime: {
            future: { other: "ing {0} wln" },
            past: { other: "{0} wln kepungkur" },
          },
        },
        day: {
          displayName: "dina",
          relative: {
            0: "dina iki",
            1: "sesuk",
            2: "suk mben",
            "-2": "winginane",
            "-1": "wingi",
          },
          relativeTime: {
            future: { other: "ing {0} dina" },
            past: { other: "{0} dina kepungkur" },
          },
        },
        "day-short": {
          displayName: "d",
          relative: {
            0: "dina iki",
            1: "sesuk",
            2: "suk mben",
            "-2": "winginane",
            "-1": "wingi",
          },
          relativeTime: {
            future: { other: "ing {0} d" },
            past: { other: "{0} d kepungkur" },
          },
        },
        hour: {
          displayName: "jam",
          relative: { 0: "jam iki" },
          relativeTime: {
            future: { other: "ing {0} jam" },
            past: { other: "{0} jam kepungkur" },
          },
        },
        "hour-short": {
          displayName: "jam",
          relative: { 0: "jam iki" },
          relativeTime: {
            future: { other: "ing {0} jam" },
            past: { other: "{0} jam kepungkur" },
          },
        },
        minute: {
          displayName: "menit",
          relative: { 0: "menit iki" },
          relativeTime: {
            future: { other: "ing {0} menit" },
            past: { other: "{0} menit kepungkur" },
          },
        },
        "minute-short": {
          displayName: "mnt.",
          relative: { 0: "menit iki" },
          relativeTime: {
            future: { other: "ing {0} mnt" },
            past: { other: "{0} mnt kepungkur" },
          },
        },
        second: {
          displayName: "detik",
          relative: { 0: "saiki" },
          relativeTime: {
            future: { other: "ing {0} detik" },
            past: { other: "{0} detik kepungkur" },
          },
        },
        "second-short": {
          displayName: "dtk.",
          relative: { 0: "saiki" },
          relativeTime: {
            future: { other: "ing {0} dtk" },
            past: { other: "{0} dtk kepungkur" },
          },
        },
      },
    },
  ];
});
