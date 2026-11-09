/* The Brain · tema claro u oscuro. Sin preferencia guardada manda el sistema; el botón guarda la elección. */
(function () {
  var KEY = "tb-theme";
  var root = document.documentElement;
  var media = window.matchMedia ? window.matchMedia("(prefers-color-scheme: dark)") : null;

  function read() {
    try { return window.localStorage.getItem(KEY); } catch (e) { return null; }
  }
  function write(mode) {
    try { window.localStorage.setItem(KEY, mode); } catch (e) { /* sin almacenamiento: la elección dura la visita */ }
  }
  function mode() {
    var forced = root.getAttribute("data-theme");
    if (forced === "dark" || forced === "light") return forced;
    return media && media.matches ? "dark" : "light";
  }
  function sync() {
    var pressed = mode() === "dark" ? "true" : "false";
    var buttons = document.querySelectorAll("[data-theme-toggle]");
    for (var i = 0; i < buttons.length; i++) buttons[i].setAttribute("aria-pressed", pressed);
  }

  // Antes de pintar: aplica la preferencia guardada para evitar el destello del tema equivocado.
  var saved = read();
  if (saved === "dark" || saved === "light") root.setAttribute("data-theme", saved);

  document.addEventListener("DOMContentLoaded", function () {
    sync();
    var buttons = document.querySelectorAll("[data-theme-toggle]");
    for (var i = 0; i < buttons.length; i++) {
      buttons[i].addEventListener("click", function () {
        var next = mode() === "dark" ? "light" : "dark";
        root.setAttribute("data-theme", next);
        write(next);
        sync();
      });
    }
  });
  if (media && media.addEventListener) media.addEventListener("change", sync);
})();
