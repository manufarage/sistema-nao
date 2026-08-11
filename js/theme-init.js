/* Corre antes del primer pintado (ver index.html). */

/* anti-clickjacking: la app no se deja embeber en iframes de otros sitios */
try {
  if (window.top !== window.self) window.top.location = window.location;
} catch (eF) { }

/* tema oscuro antes del primer pintado: sin fogonazo blanco al abrir */
try {
  var temaPref = localStorage.getItem("nao_tema");
  if (temaPref === "oscuro" || ((!temaPref || temaPref === "sistema") && window.matchMedia && matchMedia("(prefers-color-scheme: dark)").matches)) {
    document.documentElement.setAttribute("data-theme", "dark");
    var mTema = document.querySelector('meta[name="theme-color"]');
    if (mTema) mTema.content = "#0d0e12";
  }
} catch (e) { }
