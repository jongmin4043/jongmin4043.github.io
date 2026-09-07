(function applyStoredSiteTheme() {
  "use strict";

  let theme = "dark";
  try {
    if (window.localStorage.getItem("jm-site-theme") === "light") theme = "light";
  } catch (_error) {
    theme = "dark";
  }

  document.documentElement.dataset.theme = theme;
  const themeColor = document.querySelector('meta[name="theme-color"]');
  if (themeColor) themeColor.content = theme === "light" ? "#f5f7fb" : "#080a0f";
})();
