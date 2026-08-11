/* ============================================================
   clientes.js - CRM: WhatsApp directo, historial, cliente
   estrella y segmentador para campañas (emails/teléfonos)
   ============================================================ */
window.App = window.App || {};

(function () {
  "use strict";
  var filtro = { texto: "" };
  var vista = "lista";   // lista | mapa
  var mapaDias = 9999;   // período del mapa (9999 = histórico)

  /* grupos de ranking con colores distintos: lectura inmediata de quién va ganando */
  function grupoEstado(v, max) {
    if (!v || max <= 0) return { key: "cero", color: "var(--field-bg)", label: "Sin ventas", emoji: "▫️", op: 1 };
    if (v >= max * 0.999) return { key: "lider", color: "var(--ok)", label: "Líder", emoji: "🥇", op: 1 };
    if (v >= max * 0.5) return { key: "fuerte", color: "var(--c2)", label: "Fuerte", emoji: "💪", op: 1 };
    if (v >= max * 0.2) return { key: "medio", color: "var(--c4)", label: "Medio", emoji: "📈", op: 1 };
    return { key: "bajo", color: "var(--c1)", label: "Bajo", emoji: "🌱", op: 0.6 };
  }
  var GRUPOS_MAPA = [
    ["lider", "var(--ok)", "🥇 Líder"], ["fuerte", "var(--c2)", "💪 Fuertes (≥50% del líder)"],
    ["medio", "var(--c4)", "📈 Medios (20–50%)"], ["bajo", "var(--c1)", "🌱 Bajos (<20%)"], ["cero", "var(--field-bg)", "▫️ Sin ventas"]
  ];

  /* mapa real de Venezuela (siluetas de vzla-mapa.js); color = grupo de ranking */
  function mapaSvg(porEstado) {
    if (!App.VZLA_MAPA) return tileMapSvg(porEstado); // fallback si no cargó el archivo
    var M = App.VZLA_MAPA;
    var max = 0;
    Object.keys(porEstado).forEach(function (k) { if (porEstado[k] > max) max = porEstado[k]; });
    var svg = '<svg class="tile-map" viewBox="' + M.viewBox + '">';
    Object.keys(M.estados).forEach(function (est) {
      var v = porEstado[est] || 0;
      var g = grupoEstado(v, max);
      svg += '<path class="tile" data-est="' + App.esc(est) + '" data-v="' + Math.round(v) + '" d="' + M.estados[est] + '"' +
        ' fill="' + g.color + '"' + (g.op < 1 ? ' fill-opacity="' + g.op + '"' : "") +
        ' stroke="var(--card-solid)" stroke-width="1.6" stroke-linejoin="round" style="cursor:pointer"></path>';
    });
    return svg + "</svg>";
  }

  /* mosaico de respaldo (solo si vzla-mapa.js no está disponible) */
  function tileMapSvg(porEstado) {
    var max = 0;
    Object.keys(porEstado).forEach(function (k) { if (porEstado[k] > max) max = porEstado[k]; });
    var cell = 46, pad = 3, cols = 9, rows = 4;
    var svg = '<svg class="tile-map" viewBox="0 0 ' + (cols * cell) + " " + (rows * cell) + '">';
    Object.keys(App.VZLA_TILES).forEach(function (est) {
      var t = App.VZLA_TILES[est];
      var v = porEstado[est] || 0;
      var x = t[0] * cell + pad, y = t[1] * cell + pad, s = cell - pad * 2;
      var op = v > 0 && max > 0 ? 0.15 + 0.75 * (v / max) : 0;
      svg += '<g class="tile" data-est="' + App.esc(est) + '" data-v="' + Math.round(v) + '" style="cursor:pointer">' +
        "<title>" + App.esc(est) + ": $" + Math.round(v) + "</title>" +
        '<rect x="' + x + '" y="' + y + '" width="' + s + '" height="' + s + '" rx="10" fill="' + (v > 0 ? "var(--c1)" : "var(--field-bg)") + '"' +
        (v > 0 ? ' fill-opacity="' + op.toFixed(2) + '"' : "") + "/>" +
        '<text x="' + (x + s / 2) + '" y="' + (y + s / 2 + 4.5) + '" text-anchor="middle" font-size="14" font-weight="700" fill="var(--ink-2)">' + t[2] + "</text></g>";
    });
    return svg + "</svg>";
  }

  App.modClientes = {
    id: "clientes", titulo: "Clientes", icono: "clientes",
    render: function (el) {
      var C = App.calc;
      var stats = C.clientesStats();
      var estrella = C.clienteEstrella();

      var html = '<div class="view"><div class="spread" style="margin-bottom:12px"><div><h1>👥 Clientes</h1>' +
        '<div class="small muted">' + App.db.clientes.length + " registrados</div></div>" +
        '<div class="flex"><button class="btn sm ghost" id="btn-segmento">🎯 Campaña</button>' +
        '<button class="btn primary" id="btn-cli-nuevo">' + App.icon("plus") + "</button></div></div>";

      html += '<div class="seg" style="margin-bottom:12px">' +
        '<button class="seg-btn' + (vista === "lista" ? " active" : "") + '" data-vista="lista">📋 Lista</button>' +
        '<button class="seg-btn' + (vista === "mapa" ? " active" : "") + '" data-vista="mapa">🗺️ Mapa</button></div>';

      /* ===== VISTA MAPA ===== */
      if (vista === "mapa") {
        var perLbl = mapaDias >= 9999 ? "histórico" : (mapaDias === 365 ? "último año" : "últimos " + mapaDias + " días");
        html += '<div class="seg" style="margin-bottom:12px">' +
          [[90, "90 días"], [365, "1 año"], [9999, "Histórico"]].map(function (x) {
            return '<button class="seg-btn' + (mapaDias === x[0] ? " active" : "") + '" data-mdias="' + x[0] + '">' + x[1] + "</button>";
          }).join("") + "</div>";
        html += '<div class="card"><div class="card-head"><h2>🗺️ Dónde te compran</h2><span class="pill">' + perLbl + '</span></div>' +
          '<div id="mapa-vzla"></div><div id="mapa-leyenda"></div><div class="chart-note" id="mapa-nota"></div></div>';
        html += '<div class="card section-gap"><div class="card-head"><h2>🏆 Estados que más te compran</h2></div><div id="mapa-hist"></div></div>';
        html += "</div>";
        el.innerHTML = html;

        var listaV = mapaDias >= 9999 ? App.db.ventas.slice()
          : C.ventasEntre(App.toISO(App.addDays(new Date(), -mapaDias)), App.hoyISO());
        var porEstado = C.porEstado(listaV);
        App.$("#mapa-vzla", el).innerHTML = mapaSvg(porEstado);
        var arr = Object.keys(porEstado).map(function (k) { return { est: k, v: porEstado[k] }; })
          .sort(function (a, b) { return b.v - a.v; });
        var maxV = arr.length ? arr[0].v : 0;

        /* leyenda de grupos con conteo de estados */
        var conteos = {};
        var todosEst = App.VZLA_MAPA ? Object.keys(App.VZLA_MAPA.estados) : Object.keys(App.VZLA_TILES);
        todosEst.forEach(function (est) {
          var g = grupoEstado(porEstado[est] || 0, maxV);
          conteos[g.key] = (conteos[g.key] || 0) + 1;
        });
        App.$("#mapa-leyenda", el).innerHTML = '<div class="legend" style="margin-top:8px">' +
          GRUPOS_MAPA.filter(function (g) { return conteos[g[0]]; }).map(function (g) {
            return '<span class="legend-item"><span class="legend-dot" style="background:' + g[1] + '"></span>' + g[2] + " · " + conteos[g[0]] + "</span>";
          }).join("") + "</div>";

        App.$("#mapa-nota", el).innerHTML = (arr.length
          ? "Cada color es un grupo de ranking. Tu líder: <b>" + App.esc(arr[0].est) + " (" + App.fmt.usd0(arr[0].v) + ")</b>."
          : "Aún no hay ventas con cliente y estado registrados en este período.") +
          ' <span class="muted">Mapa: geoBoundaries.org (CC BY).</span>';
        App.$("#mapa-hist", el).innerHTML = arr.length
          ? App.hbars(arr.slice(0, 8).map(function (x) {
            return { label: x.est, valor: Math.round(x.v), color: grupoEstado(x.v, maxV).color };
          }))
          : '<div class="empty"><p>Sin datos en el período.</p></div>';

        /* etiqueta que sigue al puntero: estado + monto + % del total */
        var totalMapa = arr.reduce(function (s, x) { return s + x.v; }, 0);
        function tipEstado(g, ev) {
          var v = +g.dataset.v || 0;
          var gr = grupoEstado(v, maxV);
          var pct = totalMapa > 0 && v > 0 ? Math.round(v / totalMapa * 100) + "% del total" : "";
          App.tipMostrar('<div class="tip-title">' + gr.emoji + " " + App.esc(g.dataset.est) + '</div>' +
            '<div class="tip-row">Ventas<b>' + App.fmt.usd0(v) + "</b></div>" +
            '<div class="tip-row">Grupo<b>' + gr.label + "</b></div>" +
            (pct ? '<div class="tip-row"><span class="muted">' + pct + "</span></div>" : ""),
            ev.clientX, ev.clientY);
        }
        App.$$(".tile", el).forEach(function (g) {
          g.addEventListener("pointermove", function (ev) { tipEstado(g, ev); });
          g.addEventListener("pointerleave", App.tipOcultar);
          g.addEventListener("click", function () {
            App.tipOcultar();
            sheetClientesEstado(g.dataset.est, mapaDias);
          });
        });
        App.$$("[data-mdias]", el).forEach(function (b) {
          b.addEventListener("click", function () { mapaDias = +b.dataset.mdias; App.render(); });
        });
        App.$$("[data-vista]", el).forEach(function (b) {
          b.addEventListener("click", function () { vista = b.dataset.vista; App.render(); });
        });
        App.$("#btn-cli-nuevo").addEventListener("click", function () { App.clienteRapido(function () { App.render(); }); });
        App.$("#btn-segmento").addEventListener("click", segmentador);
        return;
      }

      /* ===== VISTA LISTA ===== */
      if (estrella) {
        html += '<div class="card lift" data-cli-ir="' + estrella.cliente.id + '" style="cursor:pointer;margin-bottom:12px;background:linear-gradient(135deg,var(--tint-soft),var(--card))">' +
          '<div class="flex"><span style="font-size:26px">⭐</span><div style="flex:1"><div class="eyebrow">Cliente estrella</div>' +
          '<div class="row-title" style="font-size:15px">' + App.esc(estrella.cliente.nombre) + "</div>" +
          '<div class="row-sub">' + estrella.stats.compras + " compras · " + App.fmt.usd(estrella.stats.total) + " históricos</div></div>" +
          App.icon("chevR") + "</div></div>";
      }

      html += '<div class="search-bar" style="margin-bottom:12px">' + App.icon("buscar") +
        '<input class="input" id="bus-cli" placeholder="Buscar por nombre, teléfono, ciudad…" value="' + App.esc(filtro.texto) + '"></div>';
      html += '<div class="card"><div class="list" id="lista-cli"></div></div></div>';
      el.innerHTML = html;

      function pintarListaClis() {
        var lista = App.db.clientes.slice();
        if (filtro.texto) {
          var t = filtro.texto.toLowerCase();
          lista = lista.filter(function (c) {
            return c.nombre.toLowerCase().indexOf(t) >= 0 || (c.telefono || "").indexOf(t) >= 0 ||
              (c.ciudad || "").toLowerCase().indexOf(t) >= 0 || (c.estado || "").toLowerCase().indexOf(t) >= 0;
          });
        }
        lista.sort(function (a, b) {
          var ta = stats[a.id] ? stats[a.id].total : 0, tb = stats[b.id] ? stats[b.id].total : 0;
          return tb - ta;
        });
        var h2 = "";
        if (!lista.length) h2 = '<div class="empty"><div class="big">👥</div><p>Sin resultados.</p></div>';
        lista.forEach(function (c) {
          var st = stats[c.id];
          var niv = st ? App.calc.nivelCliente(c.id, st) : null;
          h2 += '<div class="row-item" data-cli-ir="' + c.id + '">' +
            '<div class="avatar">' + App.iniciales(c.nombre) + "</div>" +
            '<div class="row-main"><div class="row-title">' + App.esc(c.nombre) +
            (niv ? " " + niv.emoji : "") +
            (estrella && estrella.cliente.id === c.id ? ' <span class="star">⭐</span>' : "") + "</div>" +
            '<div class="row-sub">' + App.esc((c.ciudad || "-") + (c.estado ? ", " + c.estado : "")) +
            (st ? " · " + st.compras + " compra" + (st.compras > 1 ? "s" : "") : " · sin compras aún") + "</div></div>" +
            '<div class="row-end">' + (st ? '<span class="row-amount num">' + App.fmt.usd0(st.total) + "</span>" : "") +
            (st && st.ultima ? '<div class="small muted">' + App.fmt.fechaRel(st.ultima) + "</div>" : "") + "</div>" +
            '<a class="btn icon wa" target="_blank" rel="noopener" data-wa-stop href="' + App.waLink(c.telefono) + '">' + App.icon("wa") + "</a></div>";
        });
        App.$("#lista-cli", el).innerHTML = h2;
      }
      pintarListaClis();

      /* búsqueda fluida: solo repinta la lista, el input no pierde el foco */
      App.$("#bus-cli").addEventListener("input", function (e) {
        filtro.texto = e.target.value;
        pintarListaClis();
      });
      App.$$("[data-vista]", el).forEach(function (b) {
        b.addEventListener("click", function () { vista = b.dataset.vista; App.render(); });
      });
      App.$("#btn-cli-nuevo").addEventListener("click", function () {
        App.clienteRapido(function () { App.render(); });
      });
      App.$("#btn-segmento").addEventListener("click", segmentador);
      App.delegar(el, "click", "[data-cli-ir]", function (e, t) {
        if (e.target.closest("[data-wa-stop]")) return;
        var c = App.cliente(t.dataset.cliIr);
        if (c) detalleCliente(c);
      });
    }
  };

  /* clientes de un estado del mapa, con temporalidad cambiable dentro del sheet */
  function sheetClientesEstado(estado, diasIni) {
    var dias = diasIni || 9999;
    var s = App.sheet({ titulo: "🗺️ Clientes de " + estado, cuerpo: '<div id="ce-cont"></div>' });

    function pintar() {
      var desde = dias >= 9999 ? "0000-00-00" : App.toISO(App.addDays(new Date(), -dias));
      var hoy = App.hoyISO();
      var porCliente = {};
      App.db.ventas.forEach(function (v) {
        var f = v.fecha.slice(0, 10);
        if (f < desde || f > hoy) return;
        var cli = App.cliente(v.clienteId);
        if (!cli || !cli.estado) return;
        var key = Object.keys(App.VZLA).filter(function (k) { return k.toLowerCase() === cli.estado.trim().toLowerCase(); })[0] || cli.estado.trim();
        if (key !== estado) return;
        if (!porCliente[cli.id]) porCliente[cli.id] = { cliente: cli, total: 0, compras: 0, ultima: null };
        var r = porCliente[cli.id];
        r.total += App.calc.ventaTotal(v);
        r.compras++;
        if (!r.ultima || f > r.ultima) r.ultima = f;
      });
      var lista = Object.keys(porCliente).map(function (k) { return porCliente[k]; })
        .sort(function (a, b) { return b.total - a.total; });
      var totalEst = lista.reduce(function (t, x) { return t + x.total; }, 0);

      var h = '<div class="seg" style="margin-bottom:10px">' +
        [[90, "90 días"], [365, "1 año"], [9999, "Histórico"]].map(function (x) {
          return '<button class="seg-btn' + (dias === x[0] ? " active" : "") + '" data-ce-dias="' + x[0] + '">' + x[1] + "</button>";
        }).join("") + "</div>";
      h += '<div class="spread" style="margin-bottom:6px"><span class="muted small">' + lista.length + " cliente" + (lista.length === 1 ? "" : "s") +
        ' con compras</span><b class="num">' + App.fmt.usd(totalEst) + "</b></div>";
      if (!lista.length) {
        h += '<div class="empty"><p>Sin compras desde ' + App.esc(estado) + " en este período.</p></div>";
      } else {
        h += '<div class="list">' + lista.map(function (r) {
          return '<div class="row-item" data-ce-cli="' + r.cliente.id + '">' +
            '<div class="avatar">' + App.iniciales(r.cliente.nombre) + "</div>" +
            '<div class="row-main"><div class="row-title" style="font-size:13px">' + App.esc(r.cliente.nombre) + "</div>" +
            '<div class="row-sub">' + App.esc(r.cliente.ciudad || "-") + " · " + r.compras + " compra" + (r.compras > 1 ? "s" : "") +
            " · últ. " + App.fmt.fechaRel(r.ultima) + "</div></div>" +
            '<span class="row-amount num" style="margin-right:4px">' + App.fmt.usd0(r.total) + "</span>" +
            '<a class="btn icon wa" target="_blank" rel="noopener" data-ce-stop href="' + App.waLink(r.cliente.telefono) + '">' + App.icon("wa") + "</a></div>";
        }).join("") + "</div>" +
          '<div class="chart-note">Toca un cliente para abrir su ficha completa.</div>';
      }
      s.body.innerHTML = h;
      App.$$("[data-ce-dias]", s.body).forEach(function (b) {
        b.addEventListener("click", function () { dias = +b.dataset.ceDias; pintar(); });
      });
    }
    pintar();

    App.delegar(s.body, "click", "[data-ce-cli]", function (e2, t2) {
      if (e2.target.closest("[data-ce-stop]")) return;
      var c = App.cliente(t2.dataset.ceCli);
      if (c) detalleCliente(c);
    });
  }

  /* abrir la ficha de un cliente desde otros módulos (ventas, envíos) */
  App.abrirCliente = function (c) { detalleCliente(c); };

  /* ---------- detalle ---------- */
  function detalleCliente(c) {
    var C = App.calc;
    var st = C.clientesStats()[c.id];
    var compras = App.db.ventas.filter(function (v) { return v.clienteId === c.id; })
      .sort(function (a, b) { return a.fecha > b.fecha ? -1 : 1; });

    var nivel = st ? C.nivelCliente(c.id, st) : null;
    var dev = C.devolucionesDe(c.id);

    var cuerpo = '<div class="flex" style="gap:12px"><div class="avatar lg">' + App.iniciales(c.nombre) + "</div>" +
      '<div style="flex:1;min-width:0"><div class="row-title" style="font-size:16px">' + App.esc(c.nombre) +
      (nivel ? ' <span class="pill tint">' + nivel.emoji + " " + App.esc(nivel.nombre) + (+nivel.descuentoPct > 0 ? " · " + nivel.descuentoPct + "%" : "") + "</span>" : "") + "</div>" +
      '<div class="row-sub">' + App.esc((c.ciudad || "") + (c.estado ? ", " + c.estado : "")) + (c.direccion ? " · " + App.esc(c.direccion) : "") + "</div>" +
      '<div class="row-sub">Cliente desde ' + App.fmt.fecha(c.creadoEl) + "</div></div></div>";

    cuerpo += '<div class="flex wrap" style="gap:8px">' +
      '<a class="btn sm wa" target="_blank" rel="noopener" href="' + App.waLink(c.telefono, "Hola " + c.nombre.split(" ")[0] + " 💕 ") + '">' + App.icon("wa") + " WhatsApp</a>" +
      '<a class="btn sm ghost" href="tel:+' + App.telLimpio(c.telefono) + '">' + App.icon("tel") + " Llamar</a>" +
      (c.email ? '<a class="btn sm ghost" href="mailto:' + App.esc(c.email) + '">' + App.icon("mail") + " Email</a>" : "") + "</div>";

    if (st) {
      cuerpo += '<div class="grid-kpi" style="grid-template-columns:repeat(3,minmax(0,1fr));margin:4px 0 0">' +
        '<div class="kpi" data-scroll-hist style="padding:10px 12px 8px;cursor:pointer"><div class="kpi-label">Total</div><div class="kpi-value" style="font-size:clamp(14px,4.5vw,19px)">' + App.fmt.usd0(st.total) + "</div></div>" +
        '<div class="kpi" data-scroll-hist style="padding:10px 12px 8px;cursor:pointer"><div class="kpi-label">Compras</div><div class="kpi-value" style="font-size:clamp(14px,4.5vw,19px)">' + st.compras + "</div></div>" +
        '<div class="kpi" data-scroll-hist style="padding:10px 12px 8px;cursor:pointer"><div class="kpi-label">Última</div><div class="kpi-value" style="font-size:clamp(13px,4vw,15px)">' + App.fmt.fechaRel(st.ultima) + "</div></div></div>";

      if (dev.veces) {
        cuerpo += '<div class="alert-item" style="margin-top:6px"><span>↩️ Ha tenido <b>' + dev.veces + "</b> devolución" + (dev.veces > 1 ? "es" : "") +
          " por <b>" + App.fmt.usd(dev.montoUsd) + "</b> en total. Tenlo presente al venderle.</span></div>";
      }

      var favoritos = Object.keys(st.productos).map(function (pid) {
        var p = App.prod(pid);
        return { label: (p ? p.emoji + " " + p.nombre : "Producto eliminado"), valor: st.productos[pid], color: p && p.tienda === "evz" ? "var(--c2)" : "var(--c1)" };
      }).sort(function (a, b) { return b.valor - a.valor; }).slice(0, 4);
      if (favoritos.length) {
        cuerpo += "<h3 style='margin-top:6px'>❤️ Lo que más compra</h3>" + App.hbars(favoritos, { fmtV: function (v) { return v + " uds"; } });
      }
    } else {
      cuerpo += '<div class="empty" style="padding:16px"><p>Todavía no tiene compras registradas.</p></div>';
    }

    if (compras.length) {
      cuerpo += "<h3 style='margin-top:6px' id='dc-todas'>🧾 Todas sus compras (" + compras.length + ")</h3><div class='list'>" + compras.map(function (v) {
        return '<div class="row-item" data-hv="' + v.id + '"><div class="row-main"><div class="row-title" style="font-size:13px">' +
          App.esc(v.items.map(function (i) { return i.cant + "× " + i.nombre; }).join(", ")) +
          ((v.devoluciones || []).length ? ' <span class="pill warn">↩️ devolución</span>' : "") + "</div>" +
          '<div class="row-sub">' + App.fmt.fecha(v.fecha.slice(0, 10)) + " · " + App.esc(v.canal) + " · " + App.esc(v.metodoPago) + "</div></div>" +
          '<span class="num small" style="font-weight:700">' + App.fmt.usd(App.calc.ventaTotal(v)) + "</span>" + App.icon("chevR") + "</div>";
      }).join("") + "</div>" +
        '<div class="chart-note">Toca una compra para ver su detalle completo.</div>';
    }

    cuerpo += '<div class="field" style="margin-top:8px"><label>Notas</label><textarea class="textarea" id="dc-notas">' + App.esc(c.notas || "") + "</textarea></div>";

    var s = App.sheet({
      titulo: "👤 Cliente",
      cuerpo: cuerpo,
      pie: '<button class="btn" data-editar>' + App.icon("editar") + " Editar</button>" +
        '<button class="btn primary" data-guardar-notas>Guardar notas</button>'
    });
    App.$("[data-guardar-notas]", s.foot).addEventListener("click", function () {
      c.notas = App.$("#dc-notas", s.el).value;
      App.save(); App.toast("Notas guardadas"); s.cerrar();
    });
    App.$("[data-editar]", s.foot).addEventListener("click", function () { s.cerrar(); editarCliente(c); });
    App.delegar(s.el, "click", "[data-hv]", function (e2, t2) {
      var v = App.db.ventas.filter(function (x) { return x.id === t2.dataset.hv; })[0];
      if (v) App.abrirVenta(v);
    });
    App.$$("[data-scroll-hist]", s.el).forEach(function (k) {
      k.addEventListener("click", function () {
        var h = App.$("#dc-todas", s.el);
        if (h) h.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    });
  }

  function editarCliente(c) {
    var s = App.sheet({
      titulo: "Editar cliente",
      cuerpo: '<div class="form-grid">' +
        '<div class="field full"><label>Nombre</label><input class="input" id="ec-nombre" value="' + App.esc(c.nombre) + '"></div>' +
        '<div class="field"><label>Teléfono</label><input class="input" id="ec-tel" value="' + App.esc(c.telefono) + '"></div>' +
        '<div class="field"><label>Email</label><input class="input" id="ec-email" value="' + App.esc(c.email || "") + '"></div>' +
        App.geo.html("ec", c.estado, c.ciudad) +
        '<div class="field full"><label>Dirección / referencia</label><input class="input" id="ec-dir" value="' + App.esc(c.direccion || "") + '"></div>' +
        "</div>",
      pie: '<button class="btn danger" data-borrar style="flex:0 0 auto">' + App.icon("basura") + "</button>" +
        '<button class="btn primary" data-ok>Guardar</button>'
    });
    App.geo.wire("ec", s.el);
    App.$("[data-ok]", s.foot).addEventListener("click", function () {
      var nombre = App.$("#ec-nombre", s.el).value.trim();
      if (!nombre) { App.toast("El nombre es obligatorio", "err"); return; }
      var geo = App.geo.valor("ec", s.el);
      c.nombre = nombre;
      c.telefono = App.$("#ec-tel", s.el).value.trim();
      c.email = App.$("#ec-email", s.el).value.trim();
      c.estado = geo.estado;
      c.ciudad = geo.ciudad;
      c.direccion = App.$("#ec-dir", s.el).value.trim();
      App.save(); App.toast("Cliente actualizado"); s.cerrar(); App.render();
    });
    App.$("[data-borrar]", s.foot).addEventListener("click", function () {
      App.confirmar("¿Eliminar a " + c.nombre + "? Sus ventas quedan como “cliente casual”.", { peligro: true, accion: "Eliminar" }).then(function (si) {
        if (!si) return;
        App.db.ventas.forEach(function (v) { if (v.clienteId === c.id) v.clienteId = null; });
        App.db.clientes = App.db.clientes.filter(function (x) { return x.id !== c.id; });
        App.save(); App.toast("Cliente eliminado"); s.cerrar(); App.render();
      });
    });
  }

  /* ---------- segmentador para campañas ---------- */
  function segmentador() {
    var SG = { dias: 180, tienda: "", categoria: "", productoId: "", minCompras: 1 };

    var s = App.sheet({
      titulo: "🎯 Segmento para campaña",
      cuerpo:
        '<p class="small muted">Filtra quién compró qué y copia sus emails o teléfonos para tu campaña de email o WhatsApp.</p>' +
        '<div class="form-grid">' +
        '<div class="field"><label>Compraron en los últimos</label><select class="select" id="sg-dias">' +
        [[30, "30 días"], [90, "3 meses"], [180, "6 meses"], [365, "1 año"], [9999, "Siempre"]].map(function (x) {
          return '<option value="' + x[0] + '"' + (SG.dias === x[0] ? " selected" : "") + ">" + x[1] + "</option>";
        }).join("") + "</select></div>" +
        '<div class="field"><label>Mínimo de compras</label><input class="input num" id="sg-min" type="number" min="1" value="1"></div>' +
        '<div class="field"><label>Tienda</label><select class="select" id="sg-tienda"><option value="">Cualquiera</option>' +
        App.db.settings.tiendas.map(function (t) { return '<option value="' + t.id + '">' + App.esc(t.nombre) + "</option>"; }).join("") + "</select></div>" +
        '<div class="field"><label>Categoría</label><select class="select" id="sg-cat"><option value="">Cualquiera</option>' +
        App.db.settings.categorias.map(function (c) { return "<option>" + App.esc(c) + "</option>"; }).join("") + "</select></div>" +
        '<div class="field full"><label>Producto específico</label><select class="select" id="sg-prod"><option value="">Cualquiera</option>' +
        App.db.productos.map(function (p) { return '<option value="' + p.id + '">' + App.esc(p.emoji + " " + p.nombre) + "</option>"; }).join("") + "</select></div>" +
        "</div>" +
        '<div id="sg-res" style="margin-top:4px"></div>',
      pie: '<button class="btn" data-cop-tel>📱 Teléfonos</button><button class="btn primary" data-cop-mail>📧 Emails</button>'
    });

    function calcular() {
      var desde = App.toISO(App.addDays(new Date(), -SG.dias));
      var porCliente = {};
      App.db.ventas.forEach(function (v) {
        if (!v.clienteId || v.fecha.slice(0, 10) < desde) return;
        var coincide = v.items.some(function (i) {
          var p = App.prod(i.productoId);
          if (SG.productoId && i.productoId !== SG.productoId) return false;
          if (SG.categoria && (!p || p.categoria !== SG.categoria)) return false;
          if (SG.tienda && (!p || p.tienda !== SG.tienda)) return false;
          return true;
        });
        if (coincide) porCliente[v.clienteId] = (porCliente[v.clienteId] || 0) + 1;
      });
      var ids = Object.keys(porCliente).filter(function (id) { return porCliente[id] >= SG.minCompras; });
      var clientes = ids.map(App.cliente).filter(Boolean);
      var conEmail = clientes.filter(function (c) { return c.email; });

      App.$("#sg-res", s.el).innerHTML =
        '<div class="spread"><h3>' + clientes.length + " cliente" + (clientes.length === 1 ? "" : "s") + " en el segmento</h3>" +
        '<span class="pill info">' + conEmail.length + " con email</span></div>" +
        '<div class="list">' + clientes.slice(0, 30).map(function (c) {
          return '<div class="row-item static"><div class="avatar" style="width:30px;height:30px;font-size:11px">' + App.iniciales(c.nombre) + "</div>" +
            '<div class="row-main"><div class="row-sub">' + App.esc(c.nombre) + " · " + porCliente[c.id] + " compra" + (porCliente[c.id] > 1 ? "s" : "") + "</div></div>" +
            (c.email ? '<span class="pill ok small">✉︎</span>' : "") + "</div>";
        }).join("") + "</div>";
      return clientes;
    }

    ["sg-dias", "sg-min", "sg-tienda", "sg-cat", "sg-prod"].forEach(function (id) {
      App.$("#" + id, s.el).addEventListener("change", function (e) {
        if (id === "sg-dias") SG.dias = +e.target.value;
        if (id === "sg-min") SG.minCompras = Math.max(1, +e.target.value || 1);
        if (id === "sg-tienda") SG.tienda = e.target.value;
        if (id === "sg-cat") SG.categoria = e.target.value;
        if (id === "sg-prod") SG.productoId = e.target.value;
        calcular();
      });
    });
    calcular();

    App.$("[data-cop-mail]", s.foot).addEventListener("click", function () {
      var emails = calcular().map(function (c) { return c.email; }).filter(Boolean);
      if (!emails.length) { App.toast("Ningún cliente del segmento tiene email", "err"); return; }
      App.copiar(emails.join(", "), emails.length + " emails copiados");
    });
    App.$("[data-cop-tel]", s.foot).addEventListener("click", function () {
      var tels = calcular().map(function (c) { return c.telefono; }).filter(Boolean);
      if (!tels.length) { App.toast("Sin teléfonos en el segmento", "err"); return; }
      App.copiar(tels.join("\n"), tels.length + " teléfonos copiados");
    });
  }
})();
