/* ============================================================
   app.js - router hash, shell (sidebar/dock/FAB), tema e inicio
   ============================================================ */
window.App = window.App || {};

(function () {
  "use strict";

  var MODS = [];
  var rutaActual = null; /* null = aún no se pintó nada: el primer render va sin transición */

  /* Roles: super = Manuel (lo ve todo) · socio = comparte una tienda · vendedor */
  App.etiquetaRol = function (rol) {
    return rol === "super" ? "Súper usuario" : rol === "socio" ? "Socio" : "Vendedor";
  };

  /* Orden del menú: primero el trabajo de agente de compras (el negocio
     principal), después la tienda propia, y al final lo transversal.
     Un módulo que no esté cargado simplemente no aparece. */
  function modulos() {
    if (!MODS.length) {
      MODS = [App.modDashboard, App.modTareas, App.modFabricas, App.modCotizaciones,
        App.modImportaciones, App.modCarga, App.modVentas, App.modEnvios, App.modInventario,
        App.modClientes, App.modPromos, App.modFinanzas, App.modCalendario, App.modAjustes]
        .filter(function (m) { return !!m; });
    }
    return MODS;
  }
  function modulo(id) {
    return modulos().filter(function (m) { return m.id === id; })[0] || null;
  }
  function visibles() {
    return modulos().filter(function (m) { return App.auth.puede(m.id); });
  }

  /* ---------- tema ---------- */
  var mediaOscuro = window.matchMedia ? window.matchMedia("(prefers-color-scheme: dark)") : null;
  function aplicarTema() {
    var pref = localStorage.getItem("nao_tema") || "sistema";
    var oscuro = pref === "oscuro" || (pref === "sistema" && mediaOscuro && mediaOscuro.matches);
    document.documentElement.setAttribute("data-theme", oscuro ? "dark" : "light");
    var meta = App.$("meta[name=theme-color]");
    if (meta) meta.setAttribute("content", oscuro ? "#0d0e12" : "#eff2f7");
  }
  App.setTema = function (pref) {
    localStorage.setItem("nao_tema", pref);
    aplicarTema();
    App.toast("Tema: " + (pref === "sistema" ? "según el sistema" : pref));
  };
  if (mediaOscuro && mediaOscuro.addEventListener) mediaOscuro.addEventListener("change", aplicarTema);

  /* ---------- shell ---------- */
  App.montarShell = function () {
    var u = App.auth.user;
    var vis = visibles();

    /* sidebar */
    var side = App.$("#sidebar");
    side.innerHTML =
      '<div class="logo-row"><div class="logo-mark">⚓</div><div><div class="logo-name">NAO</div>' +
      '<div class="logo-sub">Importaciones</div></div></div>' +
      '<button class="rate-pill" id="side-tasa" title="Tasa de cobro del día"><span class="flag">💱</span> €1 = <b>' +
      App.fmt.num(App.db.settings.tasas.eur) + " Bs</b></button>" +
      (App.MODO_NUBE ? '<div class="small muted" data-sync-estado style="padding:0 8px">' + etiquetaSync() + "</div>" : "") +
      '<nav class="side-nav">' + vis.map(function (m) {
        return '<a class="side-item" data-nav="' + m.id + '" href="#/' + m.id + '">' + App.icon(m.icono) + "<span>" + m.titulo + "</span></a>";
      }).join("") + "</nav>" +
      '<div class="side-user"><div class="avatar">' + (u.emoji || App.iniciales(u.nombre)) + "</div>" +
      '<div style="flex:1;min-width:0"><div class="side-user-name">' + App.esc(u.nombre) + "</div>" +
      '<div class="side-user-rol">' + App.etiquetaRol(u.rol) + "</div></div>" +
      '<button class="btn icon" id="side-tema" title="Tema">' + App.icon(document.documentElement.getAttribute("data-theme") === "dark" ? "sol" : "luna") + "</button>" +
      '<button class="btn icon" id="side-salir" title="Cerrar sesión">' + App.icon("salir") + "</button></div>";

    App.$("#side-tasa").addEventListener("click", function () { location.hash = "#/finanzas"; });
    App.$("#side-salir").addEventListener("click", App.auth.logout);
    App.$("#side-tema").addEventListener("click", function () {
      var esOscuro = document.documentElement.getAttribute("data-theme") === "dark";
      App.setTema(esOscuro ? "claro" : "oscuro");
      App.montarShell();
    });

    /* dock móvil */
    /* dock móvil: lo que más se toca. Manuel vive en importaciones e inbox;
       un socio que solo tiene tienda cae en ventas y envíos. */
    var dockIds = ["dashboard", "importaciones", "tareas", "ventas", "envios", "inventario"]
      .filter(function (id) { return modulo(id) && App.auth.puede(id); }).slice(0, 3);
    while (dockIds.length < 3) dockIds.push(vis[dockIds.length] ? vis[dockIds.length].id : "dashboard");
    var dock = App.$("#dock");
    dock.innerHTML =
      dockItem(modulo(dockIds[0])) +
      dockItem(modulo(dockIds[1])) +
      '<button class="fab" id="fab" aria-label="Registrar algo nuevo">' + App.icon("plus") + "</button>" +
      dockItem(modulo(dockIds[2])) +
      '<button class="dock-item" id="dock-mas">' + App.icon("mas") + "<span>Más</span></button>";

    App.$("#fab").addEventListener("click", abrirCrear);
    App.$("#dock-mas").addEventListener("click", abrirMas);
    App.$$("[data-nav]", dock).forEach(function (a) {
      a.addEventListener("click", function () { });
    });
    marcarActivos();
  };

  function dockItem(m) {
    if (!m) return "<span></span>";
    return '<a class="dock-item" data-nav="' + m.id + '" href="#/' + m.id + '">' + App.icon(m.icono) + "<span>" + m.titulo + "</span></a>";
  }

  /* etiqueta del indicador ☁️ según el estado real (no siempre "Sincronizado") */
  function etiquetaSync() {
    var e = App.estadoSyncActual ? App.estadoSyncActual() : "ok";
    return e === "offline" ? "⚠️ Sin conexión - cambios en cola"
      : e === "sync" ? "☁️ Sincronizando…"
        : "☁️ Sincronizado";
  }

  /* botón + del dock: atajo a lo que se registra a diario, según los permisos.
     Si un módulo expone una función para crear, se llama directo; si no, se
     navega a su sección, donde está su propio botón. */
  function abrirCrear() {
    var acciones = [
      { id: "importaciones", label: "Nueva importación", sub: "Una compra que le gestionas a un cliente", icono: "orden", mod: App.modImportaciones, fn: "nueva" },
      { id: "cotizaciones", label: "Nueva cotización", sub: "Comparar la misma pieza en varias fábricas", icono: "comparar", mod: App.modCotizaciones, fn: "nueva" },
      { id: "fabricas", label: "Nueva fábrica", sub: "Guardar un proveedor de China", icono: "fabrica", mod: App.modFabricas, fn: "nueva" },
      { id: "tareas", label: "Nueva tarea", sub: "Un recordatorio para ti", icono: "inbox", mod: App.modTareas, fn: "nueva" },
      { id: "ventas", label: "Nueva venta", sub: "Una venta de tu tienda", icono: "ventas", mod: App.modVentas, fn: "nueva" }
    ].filter(function (a) { return modulo(a.id) && App.auth.puede(a.id); });

    if (!acciones.length) { App.toast("No tienes permiso para registrar nada todavía", "err"); return; }

    var s = App.sheet({
      titulo: "Registrar",
      cuerpo: '<div class="list">' + acciones.map(function (a) {
        return '<button class="row-item" data-crear="' + App.esc(a.id) + '" style="width:100%;text-align:left">' +
          '<div class="thumb">' + App.icon(a.icono) + "</div>" +
          '<div class="row-main"><div class="row-title">' + App.esc(a.label) + "</div>" +
          '<div class="row-sub">' + App.esc(a.sub) + "</div></div>" + App.icon("chevR") + "</button>";
      }).join("") + "</div>"
    });

    App.$$("[data-crear]", s.el).forEach(function (b) {
      b.addEventListener("click", function () {
        var a = acciones.filter(function (x) { return x.id === b.dataset.crear; })[0];
        s.cerrar();
        if (a.mod && typeof a.mod[a.fn] === "function") {
          if (rutaActual !== a.id) location.hash = "#/" + a.id;
          a.mod[a.fn]();
        } else {
          location.hash = "#/" + a.id;
        }
      });
    });
  }

  function abrirMas() {
    var u = App.auth.user;
    var enDock = ["dashboard", "ventas", "envios"];
    var resto = visibles().filter(function (m) { return enDock.indexOf(m.id) < 0; });
    var esOscuro = document.documentElement.getAttribute("data-theme") === "dark";

    var cuerpo = '<div class="row-item static"><div class="avatar">' + (u.emoji || App.iniciales(u.nombre)) + "</div>" +
      '<div class="row-main"><div class="row-title">' + App.esc(u.nombre) + '</div><div class="row-sub">' +
      App.etiquetaRol(u.rol) + "</div></div>" +
      '<button class="rate-pill" data-mas-tasa>💱 €1 = <b>' + App.fmt.num(App.db.settings.tasas.eur) + " Bs</b></button></div>" +
      (App.MODO_NUBE ? '<div class="small muted" data-sync-estado style="padding:2px 4px 6px">' + etiquetaSync() + "</div>" : "") +
      '<div class="list">' + resto.map(function (m) {
        return '<a class="row-item" data-mas-ir="' + m.id + '" href="#/' + m.id + '"><div class="thumb">' + App.icon(m.icono) + "</div>" +
          '<div class="row-main"><div class="row-title">' + m.titulo + "</div></div>" + App.icon("chevR") + "</a>";
      }).join("") + "</div>" +
      (App.MODO_NUBE ? '<button class="btn block" data-mas-escaner style="margin-top:6px">📷 Escáner remoto - usar este celular como pistola de la compu</button>' : "") +
      '<div class="flex" style="gap:8px;margin-top:6px">' +
      '<button class="btn" data-mas-tema style="flex:1">' + App.icon(esOscuro ? "sol" : "luna") + " Tema " + (esOscuro ? "claro" : "oscuro") + "</button>" +
      '<button class="btn danger" data-mas-salir style="flex:1">' + App.icon("salir") + " Salir</button></div>";

    var s = App.sheet({ titulo: "Más", cuerpo: cuerpo });
    /* los enlaces navegan y rutear() cierra el sheet - cerrarlo aquí haría history.back()
       en plena navegación y podría comerse el destino */
    var bt = App.$("[data-mas-tasa]", s.el);
    if (bt) bt.addEventListener("click", function () {
      if (App.auth.puede("finanzas")) location.hash = "#/finanzas";
      else s.cerrar();
    });
    App.$("[data-mas-tema]", s.el).addEventListener("click", function () {
      App.setTema(esOscuro ? "claro" : "oscuro");
      App.montarShell(); s.cerrar();
    });
    var be = App.$("[data-mas-escaner]", s.el);
    if (be) be.addEventListener("click", function () { s.cerrar(); App.escanearRemoto(); });
    App.$("[data-mas-salir]", s.el).addEventListener("click", App.auth.logout);
  }

  function marcarActivos() {
    App.$$("[data-nav]").forEach(function (a) {
      a.classList.toggle("active", a.dataset.nav === rutaActual);
    });
  }

  /* ---------- router ---------- */
  function montarVista(m, sinAnim, conservarScroll) {
    App.chart.limpiar();
    // reemplazar el nodo de la vista mata los listeners delegados del módulo
    // anterior; si no, se acumulan y un click abre N sheets apilados
    var viejo = App.$("#view");
    var view = document.createElement("div");
    view.id = "view";
    var scrollY = conservarScroll ? (window.scrollY || window.pageYOffset || 0) : 0;
    if (sinAnim) view.className = "sin-anim";
    viejo.replaceWith(view);
    m.render(view);
    marcarActivos();
    window.scrollTo(0, scrollY);
  }
  function rutear() {
    if (App.cerrarSheets) App.cerrarSheets(); // navegar cierra cualquier sheet abierto
    var id = (location.hash || "#/dashboard").replace(/^#\//, "") || "dashboard";
    var m = modulo(id);
    if (!m || !App.auth.puede(id)) {
      if (id !== "dashboard") { location.hash = "#/dashboard"; return; }
      m = App.modDashboard;
    }
    var mismaVista = rutaActual === m.id;
    var esPrimera = rutaActual === null;
    rutaActual = m.id;
    /* repintado de la misma vista (filtros, guardados, ecos): sin animación ni salto de scroll */
    if (mismaVista) { montarVista(m, true, true); return; }
    /* cambio de sección: transición nativa tipo app (crossfade); fallback = animación CSS.
       El PRIMER pintado va directo (sin crossfade de página completa al abrir). */
    if (!esPrimera && document.startViewTransition) {
      document.startViewTransition(function () { montarVista(m, true, false); });
    } else {
      montarVista(m, false, false);
    }
  }
  App.render = function () { rutear(); };

  /* ---------- recordatorios (retiros con hora, pedidos varados) ---------- */
  function notificar(titulo, cuerpo, key) {
    var hoy = App.hoyISO();
    var avisos = {};
    try { avisos = JSON.parse(localStorage.getItem("nao_avisos") || "{}"); } catch (e) { }
    if (avisos.dia !== hoy) avisos = { dia: hoy }; // se limpian cada día
    if (avisos[key]) return;
    avisos[key] = 1;
    localStorage.setItem("nao_avisos", JSON.stringify(avisos));
    App.notificarSistema(titulo, cuerpo);
    App.toast(titulo + " - " + cuerpo);
  }
  function chequearRecordatorios() {
    if (!App.auth.user) return;
    var hoy = App.hoyISO();
    App.calc.retirosPendientes().forEach(function (v) {
      var e = v.entrega;
      if (e.fechaRetiro !== hoy || !e.horaRetiro) return;
      var hm = e.horaRetiro.split(":");
      var ahora = new Date();
      var mins = (+hm[0] * 60 + (+hm[1] || 0)) - (ahora.getHours() * 60 + ahora.getMinutes());
      if (mins > 0 && mins <= 60) {
        var cli = App.cliente(v.clienteId);
        notificar("🏪 Retiro a las " + e.horaRetiro,
          (cli ? cli.nombre : "Un cliente") + " pasa en " + mins + " min - ten listo el pedido", "ret-" + v.id);
      }
    });
    App.calc.porLlevar().forEach(function (v) {
      if (v.fecha.slice(0, 10) < hoy) {
        var cli2 = App.cliente(v.clienteId);
        notificar("🚚 Pedido por llevar",
          "El de " + (cli2 ? cli2.nombre : "un cliente") + " sigue sin salir - llévalo a la agencia", "llevar-" + v.id);
      }
    });
  }
  App.pedirPermisoNotif = function () {
    /* iPhone: el permiso solo existe dentro de la app instalada en la pantalla de inicio */
    var esiOS = /iPhone|iPad|iPod/.test(navigator.userAgent);
    if (esiOS && !navigator.standalone) {
      App.toast("En iPhone: instala primero la app (Compartir → Añadir a pantalla de inicio) y activa las notificaciones desde adentro", "err");
      return;
    }
    if (!window.Notification) { App.toast("Este navegador no soporta notificaciones", "err"); return; }
    Notification.requestPermission().then(function (p) {
      if (p === "granted") {
        App.toast("Notificaciones activadas 🔔");
        App.notificarSistema("🔔 Notificaciones activas", "Así se verán los avisos de retiros y pedidos.");
      } else App.toast("Permiso no concedido - seguirás viendo avisos dentro de la app", "err");
    });
  };

  /* notificación del sistema: en la PWA (iPhone/Android) va por el service worker;
     en navegador de escritorio, por la API clásica */
  App.notificarSistema = function (titulo, cuerpo) {
    if (!window.Notification || Notification.permission !== "granted") return;
    var opciones = { body: cuerpo, icon: "icon-192.png", badge: "icon-192.png" };
    if (navigator.serviceWorker && navigator.serviceWorker.ready) {
      navigator.serviceWorker.ready.then(function (reg) {
        if (reg && reg.showNotification) reg.showNotification(titulo, opciones);
        else { try { new Notification(titulo, opciones); } catch (e) { } }
      }).catch(function () { try { new Notification(titulo, opciones); } catch (e) { } });
    } else {
      try { new Notification(titulo, opciones); } catch (e) { }
    }
  };

  App.iniciarApp = function () {
    App.$("#login-root").classList.add("hidden");
    App.$("#app").classList.remove("hidden");
    App.$("#dock").classList.remove("hidden");
    App.montarShell();
    if (!location.hash) location.hash = "#/dashboard";
    rutear();

    /* tasa BCV: si la de hoy no está, intenta buscarla sola (best effort) */
    if (App.db.settings.tasas.fecha < App.hoyISO()) {
      App.actualizarTasas().then(function (r) {
        if (r.usd || r.eur) {
          App.toast("Tasa BCV actualizada: € " + App.fmt.num(App.db.settings.tasas.eur) + " Bs");
          App.montarShell();
          App.render();
        }
      });
    }
    chequearRecordatorios();
    setInterval(chequearRecordatorios, 60000);
  };

  /* ---------- arranque ---------- */
  document.addEventListener("DOMContentLoaded", function () {
    App.load();
    aplicarTema();
    /* PWA: solo con HTTPS (versión online) - permite instalarla como app */
    if ("serviceWorker" in navigator && (location.protocol === "https:" || location.hostname === "localhost")) {
      navigator.serviceWorker.register("sw.js").catch(function () { });
    }
    window.addEventListener("hashchange", rutear);

    /* la app instalada avisa cuando hay versión nueva publicada (revisa al volver
       al frente y cada 15 min; el botón recarga y trae todo fresco) */
    (function vigilarVersion() {
      var sc = document.querySelector('script[src*="?v="]');
      var miV = sc ? (sc.src.match(/\?v=(\d{8,})/) || [])[1] : null;
      if (!miV || location.protocol.indexOf("http") !== 0) return;
      function avisar() {
        if (document.getElementById("banner-act")) return;
        var b = document.createElement("button");
        b.id = "banner-act";
        b.className = "btn primary";
        b.style.cssText = "position:fixed;top:calc(10px + env(safe-area-inset-top,0px));left:50%;transform:translateX(-50%);z-index:400;box-shadow:var(--shadow-2)";
        b.textContent = "⬆️ Versión nueva - toca para actualizar";
        b.addEventListener("click", function () { location.reload(); });
        document.body.appendChild(b);
      }
      function chequear() {
        fetch("index.html", { cache: "no-store" }).then(function (r) { return r.text(); }).then(function (html) {
          var v = (html.match(/\?v=(\d{8,})/) || [])[1];
          if (v && v !== miV) avisar();
        }).catch(function () { });
      }
      setInterval(chequear, 15 * 60000);
      document.addEventListener("visibilitychange", function () { if (!document.hidden) chequear(); });
    })();

    /* iOS: con el teclado abierto los elementos fijos quedan "guindando" a media
       pantalla. Mientras se escribe se esconde el dock; al cerrar el teclado, un
       scroll nulo obliga al navegador a re-anclar todo al fondo real. */
    if (window.visualViewport) {
      var vvT = null;
      var ajustarPorTeclado = function () {
        clearTimeout(vvT);
        vvT = setTimeout(function () {
          var vv = window.visualViewport;
          var tecladoAbierto = vv.height < window.innerHeight - 120;
          var dock = App.$("#dock");
          if (dock) dock.style.visibility = tecladoAbierto ? "hidden" : "";
          /* --kb = alto del teclado: los avisos suben por encima de él */
          document.documentElement.style.setProperty("--kb",
            (tecladoAbierto ? Math.round(window.innerHeight - vv.height - vv.offsetTop) : 0) + "px");
          if (!tecladoAbierto) window.scrollTo(window.scrollX, window.scrollY);
        }, 80);
      };
      window.visualViewport.addEventListener("resize", ajustarPorTeclado);
      window.visualViewport.addEventListener("scroll", ajustarPorTeclado);
    }

    /* modo nube: la sesión vive en Supabase Auth (asíncrono) */
    if (App.MODO_NUBE) {
      App.sb.auth.onAuthStateChange(function (evento) {
        if (evento === "PASSWORD_RECOVERY" && App.mostrarNuevaClave) App.mostrarNuevaClave();
      });
      App.sb.auth.getSession().then(function (r) {
        var ses = r.data ? r.data.session : null;
        if (!ses) { App.renderLogin(); return; }
        function splash() {
          var root = App.$("#login-root");
          root.className = "login-screen";
          root.classList.remove("hidden");
          root.innerHTML = '<div class="login-card view"><div class="logo-mark">☁️</div>' +
            '<div class="login-title">Cargando tus datos…</div>' +
            '<div class="login-sub">Un momento</div></div>';
        }
        function arrancar() {
          splash();
          App.iniciarNube(ses).then(function () { App.iniciarApp(); }, function (e2) {
            /* sin conexión pero con caché local: se puede trabajar igual (los cambios quedan en cola) */
            var uid = ses.user.id;
            var perfil = (App.db.usuarios || []).filter(function (u) { return u.id === uid; })[0];
            if (!(e2 && e2.sinPerfil) && perfil) {
              App.auth.user = perfil;
              App.auth.user.email = ses.user.email || "";
              App.iniciarApp();
              App.toast("Sin conexión - estás viendo la última copia guardada en este equipo");
              return;
            }
            App.toast(e2 && e2.sinPerfil ? e2.message : "No se pudo conectar con el servidor - revisa tu internet y recarga", "err");
            App.renderLogin();
          });
        }
        function conBio() {
          if (App.bioActivo && App.bioActivo()) App.renderBloqueo(arrancar);
          else arrancar();
        }
        /* si el 2FA está activado, también protege el arranque con sesión guardada */
        splash();
        App.verificar2FASiHaceFalta(conBio, function () {
          App.sb.auth.signOut().then(function () { App.renderLogin(); });
        });
      });
      return;
    }

    if (App.auth.sesionActiva()) App.iniciarApp();
    else App.renderLogin();
  });
})();
