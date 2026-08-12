/* ============================================================
   fabricas.js - directorio de fábricas y agentes de carga en
   China (Alibaba/1688 y otras plataformas): contactos múltiples,
   catálogos y calificación propia. Incluye aparte los pedidos
   de reposición del inventario de la propia tienda.
   ============================================================ */
window.App = window.App || {};

(function () {
  "use strict";

  var filtro = {
    texto: "", plataforma: null, rubro: null, verificado: false, tradeAssurance: false,
    estados: { activo: true, probando: true, descartado: false }
  };

  var ESTADO_LABEL = { activo: "🟢 Activa", probando: "🧪 Probando", descartado: "🗑️ Descartada" };
  var ESTADO_PILL = { activo: "ok", probando: "warn", descartado: "danger" };

  /* insensible a mayúsculas y acentos: mapa simple, sin depender de
     normalize()/Unicode para que funcione igual en cualquier navegador */
  var ACENTOS = { "á": "a", "à": "a", "ä": "a", "é": "e", "è": "e", "ë": "e", "í": "i", "ì": "i", "ï": "i", "ó": "o", "ò": "o", "ö": "o", "ú": "u", "ù": "u", "ü": "u", "ñ": "n" };
  function normaliza(s) {
    s = String(s == null ? "" : s).toLowerCase();
    var out = "";
    for (var i = 0; i < s.length; i++) { var c = s.charAt(i); out += ACENTOS[c] || c; }
    return out;
  }

  function fabricasFiltradas() {
    var t = normaliza(filtro.texto);
    return (App.db.proveedores || []).filter(function (f) {
      if (filtro.plataforma && f.plataforma !== filtro.plataforma) return false;
      if (filtro.rubro && f.rubro !== filtro.rubro) return false;
      if (filtro.verificado && !f.verificado) return false;
      if (filtro.tradeAssurance && !f.tradeAssurance) return false;
      if (!filtro.estados[f.estado || "activo"]) return false;
      if (t) {
        var campos = normaliza([
          f.nombre, f.nombreCn, f.rubro, (f.etiquetas || []).join(" "), f.productos, f.ciudad, f.notas
        ].join(" "));
        if (campos.indexOf(t) < 0) return false;
      }
      return true;
    });
  }

  /* estrellas de solo lectura (tarjeta y ficha) */
  function estrellasHTML(n) {
    n = Math.max(0, Math.min(5, Math.round(+n || 0)));
    var out = "";
    for (var i = 1; i <= 5; i++) out += '<span class="' + (i <= n ? "star" : "muted") + '">' + (i <= n ? "★" : "☆") + "</span>";
    return out;
  }

  function kpiBox(label, valor) {
    return '<div class="kpi" style="padding:12px 14px 8px"><div class="kpi-label">' + App.esc(label) + '</div>' +
      '<div class="kpi-value" style="font-size:22px">' + valor + "</div></div>";
  }

  function tarjetaFabrica(f) {
    var pills = "";
    if (f.verificado) pills += '<span class="pill ok">✓ Verificada</span>';
    if (f.tradeAssurance) pills += '<span class="pill info">🛡️ Trade Assurance</span>';
    if ((f.estado || "activo") !== "activo") pills += '<span class="pill ' + ESTADO_PILL[f.estado] + '">' + ESTADO_LABEL[f.estado] + "</span>";

    var meta = [f.plataforma, f.rubro, f.ciudad].filter(function (x) { return x; })
      .map(function (x) { return App.esc(x); }).join(" · ");

    var chipsEtq = (f.etiquetas && f.etiquetas.length)
      ? '<div class="chips" style="margin-top:8px">' + f.etiquetas.map(function (et) {
        return '<span class="chip" style="cursor:default;padding:4px 10px;font-size:11px">' + App.esc(et) + "</span>";
      }).join("") + "</div>"
      : "";

    var moq = [];
    if (f.moqTipico) moq.push("MOQ " + f.moqTipico);
    if (f.diasProduccion) moq.push(f.diasProduccion + " días de producción");
    var moqLinea = moq.length ? '<div class="small muted" style="margin-top:6px">' + App.esc(moq.join(" · ")) + "</div>" : "";

    var catLinea = (f.catalogos && f.catalogos.length)
      ? '<div class="flex wrap" style="gap:6px;margin-top:9px">' + f.catalogos.map(function (c) {
        return '<a class="btn sm ghost" target="_blank" rel="noopener" href="' + App.esc(c.url) + '" data-stop>' + App.icon("guia") + " " + App.esc(c.nombre || "Catálogo") + "</a>";
      }).join("") + "</div>"
      : "";

    return '<div class="card lift" data-fab="' + f.id + '" style="cursor:pointer">' +
      '<div class="spread" style="align-items:flex-start"><div style="min-width:0">' +
      '<div class="row-title" style="font-size:15px">' + App.esc(f.nombre) + "</div>" +
      (f.nombreCn ? '<div class="small muted">' + App.esc(f.nombreCn) + "</div>" : "") +
      "</div>" +
      '<div class="flex wrap" style="gap:6px;justify-content:flex-end;flex:none">' + pills + "</div></div>" +
      (meta ? '<div class="row-sub" style="margin-top:5px">' + meta + "</div>" : "") +
      (f.calificacion ? '<div style="margin-top:7px">' + estrellasHTML(f.calificacion) + "</div>" : "") +
      chipsEtq + moqLinea + catLinea +
      '<div class="flex wrap" style="gap:8px;margin-top:10px">' +
      (f.telefono ? '<a class="btn sm wa" target="_blank" rel="noopener" href="' + App.waLink(f.telefono) + '" data-stop>' + App.icon("wa") + " WhatsApp</a>" : "") +
      (f.wechat ? '<button class="btn sm ghost" data-copiar-wc="' + App.esc(f.wechat) + '" data-stop>' + App.icon("copiar") + " WeChat</button>" : "") +
      (f.url ? '<a class="btn sm ghost" target="_blank" rel="noopener" href="' + App.esc(f.url) + '" data-stop>🔗 Tienda</a>' : "") +
      "</div></div>";
  }

  App.modFabricas = {
    id: "fabricas", titulo: "Fábricas", icono: "fabrica",
    /* la usa el boton + del movil */
    nueva: function () { formFabrica(null); },
    render: function (el) {
      var C = App.calc;
      var todas = App.db.proveedores || [];

      var verificadas = todas.filter(function (f) { return f.verificado; }).length;
      var conTA = todas.filter(function (f) { return f.tradeAssurance; }).length;
      var rubrosSet = {};
      todas.forEach(function (f) { if (f.rubro) rubrosSet[f.rubro] = 1; });

      var html = '<div class="view"><div class="spread" style="margin-bottom:12px;flex-wrap:wrap"><div><h1>🏭 Fábricas</h1>' +
        '<div class="small muted">Tu directorio de fábricas y agentes en China</div></div>' +
        '<div class="flex wrap" style="gap:8px">' +
        '<button class="btn sm ghost" id="btn-fab-csv">' + App.icon("descargar") + " CSV</button>" +
        '<button class="btn primary" id="btn-fab-nuevo">' + App.icon("plus") + " Fábrica</button>" +
        "</div></div>";

      if (!todas.length) {
        html += '<div class="empty"><div class="big">🏭</div><p>Guarda aquí cada fábrica que contactas en Alibaba o 1688, con sus datos, para no perderlas y poder compararlas después.</p></div>';
      } else {
        html += '<div class="grid-kpi">' +
          kpiBox("Fábricas registradas", todas.length) +
          kpiBox("Verificadas", verificadas) +
          kpiBox("Trade Assurance", conTA) +
          kpiBox("Rubros distintos", Object.keys(rubrosSet).length) +
          "</div>";

        html += '<div class="search-bar" style="margin-bottom:10px">' + App.icon("buscar") +
          '<input class="input" id="fab-bus" placeholder="Busca por nombre, producto, ciudad…" value="' + App.esc(filtro.texto) + '"></div>';

        html += '<div class="chips scroll-x" style="margin-bottom:8px">' +
          '<button class="chip' + (!filtro.plataforma ? " active" : "") + '" data-fplat="">Todas las plataformas</button>' +
          (App.db.settings.plataformas || []).map(function (p) {
            return '<button class="chip' + (filtro.plataforma === p ? " active" : "") + '" data-fplat="' + App.esc(p) + '">' + App.esc(p) + "</button>";
          }).join("") + "</div>";

        html += '<div class="chips scroll-x" style="margin-bottom:8px">' +
          '<button class="chip' + (!filtro.rubro ? " active" : "") + '" data-frub="">Todos los rubros</button>' +
          (App.db.settings.rubros || []).map(function (r) {
            return '<button class="chip' + (filtro.rubro === r ? " active" : "") + '" data-frub="' + App.esc(r) + '">' + App.esc(r) + "</button>";
          }).join("") + "</div>";

        html += '<div class="chips" style="margin-bottom:14px">' +
          '<button class="chip' + (filtro.verificado ? " active" : "") + '" data-fver>✅ Solo verificadas</button>' +
          '<button class="chip' + (filtro.tradeAssurance ? " active" : "") + '" data-fta>🛡️ Solo Trade Assurance</button>' +
          '<button class="chip' + (filtro.estados.activo ? " active" : "") + '" data-festado="activo">🟢 Activas</button>' +
          '<button class="chip' + (filtro.estados.probando ? " active" : "") + '" data-festado="probando">🧪 Probando</button>' +
          '<button class="chip' + (filtro.estados.descartado ? " active" : "") + '" data-festado="descartado">🗑️ Descartadas</button>' +
          "</div>";

        html += '<div id="fab-grid-wrap"></div>';
      }

      /* ---- pedidos de reposición: sección aparte. No es el directorio de
         fábricas: son los pedidos que le haces a una fábrica para reponer
         el inventario de tu propia tienda. ---- */
      var compras = (App.db.compras || []).slice().sort(function (a, b) { return a.fecha < b.fecha ? 1 : -1; });
      var pendC = compras.filter(function (c) { return c.estado !== "recibida"; });
      var recibidasC = compras.filter(function (c) { return c.estado === "recibida"; }).slice(0, 3);

      html += '<div class="small muted" style="margin:20px 2px 8px">📦 Distinto al directorio de arriba: aquí registras lo que le pides a una fábrica para reponer el inventario de tu propia tienda.</div>';
      html += '<div class="card" style="margin-bottom:12px"><div class="card-head"><h2>🚚 Pedidos de reposición</h2>' +
        '<button class="btn sm primary" id="btn-compra">+ Pedido</button></div>';
      if (!pendC.length && !recibidasC.length) {
        html += '<div class="empty" style="padding:14px"><p>Registra aquí lo que le pidas a una fábrica: al marcarlo recibido, el stock y los costos de reposición se actualizan solos.</p></div>';
      }
      pendC.forEach(function (co) {
        var prov = todas.filter(function (p) { return p.id === co.proveedorId; })[0];
        var tot = C.compraTotales(co);
        var dl = co.llegadaEst ? C.diasHasta(co.llegadaEst) : null;
        var llegadaPill = co.llegadaEst
          ? (dl < 0 ? '<span class="pill danger">debió llegar hace ' + (-dl) + " días</span>"
            : dl === 0 ? '<span class="pill warn">llega HOY</span>'
              : '<span class="pill info">llega ~' + App.fmt.fecha(co.llegadaEst) + " (en " + dl + " días)</span>")
          : "";
        html += '<div class="card' + (dl != null && dl < 0 ? " late" : "") + '" style="padding:13px 14px;box-shadow:none;border:1px solid var(--card-border);margin-bottom:8px">' +
          '<div class="spread"><div class="row-title" style="font-size:14px">' + App.esc(prov ? prov.nombre : "Fábrica") + "</div>" +
          '<span class="pill ' + (co.estado === "pedida" ? "warn" : "info") + '">' + (co.estado === "pedida" ? "🛒 Pedida" : "🚢 En tránsito") + "</span></div>" +
          '<div class="row-sub">pedido ' + App.fmt.fecha(co.fecha) + " · " + llegadaPill + "</div>" +
          (co.notas ? '<div class="row-sub">' + App.esc(co.notas) + "</div>" : "") +
          '<div class="small" style="margin:6px 0 2px">' + (co.items || []).map(function (it) {
            var p = App.prod(it.productoId);
            return "• " + it.cant + "× " + App.esc(p ? p.nombre : "?") + (it.talla ? " (" + App.esc(it.talla) + ")" : "") + " a " + App.fmt.usd(it.costoUnit);
          }).join("<br>") + "</div>" +
          '<div class="spread small muted"><span>' + tot.uds + " uds · mercancía " + App.fmt.usd(tot.mercancia) + " + flete " + App.fmt.usd(+co.fleteTotal || 0) + '</span><b class="num">' + App.fmt.usd(tot.total) + "</b></div>" +
          '<div class="flex wrap" style="gap:8px;margin-top:9px">' +
          (co.estado === "pedida" ? '<button class="btn sm" data-co-transito="' + co.id + '">🚢 Ya salió</button>' : "") +
          '<button class="btn sm primary" data-co-recibir="' + co.id + '">✓ Recibida - sumar stock</button>' +
          '<button class="btn sm ghost" data-co-editar="' + co.id + '">' + App.icon("editar") + "</button>" +
          '<button class="btn sm ghost" data-co-borrar="' + co.id + '" style="color:var(--danger)">' + App.icon("basura") + "</button>" +
          "</div></div>";
      });
      if (recibidasC.length) {
        html += '<div class="list">' + recibidasC.map(function (co) {
          var prov = todas.filter(function (p) { return p.id === co.proveedorId; })[0];
          var tot = C.compraTotales(co);
          return '<div class="row-item static"><div class="thumb">✅</div><div class="row-main"><div class="row-sub">Recibida ' + App.fmt.fecha(co.recibidaEl || co.fecha) + " · " + App.esc(prov ? prov.nombre : "") + " · " + tot.uds + ' uds</div></div><span class="num small">' + App.fmt.usd(tot.total) + "</span></div>";
        }).join("") + "</div>";
      }
      html += "</div>";

      html += "</div>"; /* cierra .view */

      el.innerHTML = html;

      function pintarGrid() {
        var wrap = App.$("#fab-grid-wrap", el);
        if (!wrap) return;
        var lista2 = fabricasFiltradas();
        wrap.innerHTML = lista2.length
          ? lista2.map(tarjetaFabrica).join("")
          : '<div class="empty"><div class="big">🔍</div><p>No hay fábricas con esos filtros.</p></div>';
      }

      if (todas.length) {
        pintarGrid();
        /* búsqueda fluida: solo repinta la grilla, el input no pierde el foco */
        App.$("#fab-bus", el).addEventListener("input", function (e) { filtro.texto = e.target.value; pintarGrid(); });
        App.$$("[data-fplat]", el).forEach(function (b) { b.addEventListener("click", function () { filtro.plataforma = b.dataset.fplat || null; App.render(); }); });
        App.$$("[data-frub]", el).forEach(function (b) { b.addEventListener("click", function () { filtro.rubro = b.dataset.frub || null; App.render(); }); });
        var chVer = App.$("[data-fver]", el);
        if (chVer) chVer.addEventListener("click", function () { filtro.verificado = !filtro.verificado; App.render(); });
        var chTA = App.$("[data-fta]", el);
        if (chTA) chTA.addEventListener("click", function () { filtro.tradeAssurance = !filtro.tradeAssurance; App.render(); });
        App.$$("[data-festado]", el).forEach(function (b) {
          b.addEventListener("click", function () { filtro.estados[b.dataset.festado] = !filtro.estados[b.dataset.festado]; App.render(); });
        });
      }

      App.$("#btn-fab-nuevo", el).addEventListener("click", function () { formFabrica(null); });
      App.$("#btn-fab-csv", el).addEventListener("click", exportarCSV);
      App.$("#btn-compra", el).addEventListener("click", function () { formCompra(null); });

      App.delegar(el, "click", "[data-fab]", function (e, t) {
        if (e.target.closest("[data-stop]")) return;
        var f = todas.filter(function (x) { return x.id === t.dataset.fab; })[0];
        if (f) detalleFabrica(f);
      });
      App.delegar(el, "click", "[data-copiar-wc]", function (e, t) {
        e.stopPropagation();
        App.copiar(t.dataset.copiarWc, "ID de WeChat copiado");
      });
      App.delegar(el, "click", "[data-co-transito]", function (e, t) {
        e.stopPropagation();
        var co = App.compraDe(t.dataset.coTransito);
        if (co) { co.estado = "transito"; App.save(); App.toast("Pedido en tránsito 🚢"); App.render(); }
      });
      App.delegar(el, "click", "[data-co-recibir]", function (e, t) {
        e.stopPropagation();
        var co = App.compraDe(t.dataset.coRecibir);
        if (!co) return;
        App.confirmar("¿Recibiste este pedido? Se sumará el stock y se actualizarán los costos de reposición de cada producto.", { accion: "Sí, recibido" }).then(function (si) {
          if (!si) return;
          App.calc.compraRecibir(co);
          App.save(); App.toast("Recibido: stock y costos actualizados 📦");
          App.render();
        });
      });
      App.delegar(el, "click", "[data-co-editar]", function (e, t) {
        e.stopPropagation();
        var co = App.compraDe(t.dataset.coEditar);
        if (co) formCompra(co);
      });
      App.delegar(el, "click", "[data-co-borrar]", function (e, t) {
        e.stopPropagation();
        App.confirmar("¿Eliminar este pedido? (No toca el stock.)", { peligro: true, accion: "Eliminar" }).then(function (si) {
          if (!si) return;
          App.db.compras = App.db.compras.filter(function (c) { return c.id !== t.dataset.coBorrar; });
          App.save(); App.toast("Pedido eliminado"); App.render();
        });
      });
    }
  };

  function exportarCSV() {
    var lista = fabricasFiltradas();
    if (!lista.length) { App.toast("No hay fábricas para exportar con estos filtros", "err"); return; }
    var filas = [["nombre", "nombreCn", "plataforma", "rubro", "etiquetas", "contacto", "wechat", "telefono", "url",
      "ciudad", "provincia", "direccion", "verificado", "tradeAssurance", "anios", "rating", "calificacion",
      "estado", "moqTipico", "diasProduccion", "productos", "notas"]];
    lista.forEach(function (f) {
      filas.push([
        f.nombre || "", f.nombreCn || "", f.plataforma || "", f.rubro || "", (f.etiquetas || []).join(", "),
        f.contacto || "", f.wechat || "", f.telefono || "", f.url || "",
        f.ciudad || "", f.provincia || "", f.direccion || "",
        f.verificado ? "Sí" : "No", f.tradeAssurance ? "Sí" : "No",
        f.anios || 0, f.rating || 0, f.calificacion || 0,
        f.estado || "activo", f.moqTipico || "", f.diasProduccion || 0, f.productos || "", f.notas || ""
      ]);
    });
    App.descargarCSV("fabricas", filas);
    App.toast("CSV descargado: " + lista.length + " fábrica" + (lista.length === 1 ? "" : "s") + " 📊");
  }

  /* ---------- ficha completa ---------- */
  function detalleFabrica(f) {
    var cuerpo = '<div><div class="row-title" style="font-size:17px">' + App.esc(f.nombre) + "</div>" +
      (f.nombreCn ? '<div class="small muted">' + App.esc(f.nombreCn) + "</div>" : "") + "</div>";

    var pills = "";
    if (f.verificado) pills += '<span class="pill ok">✓ Verificada</span>';
    if (f.tradeAssurance) pills += '<span class="pill info">🛡️ Trade Assurance</span>';
    pills += '<span class="pill ' + ESTADO_PILL[f.estado || "activo"] + '">' + ESTADO_LABEL[f.estado || "activo"] + "</span>";
    cuerpo += '<div class="flex wrap" style="gap:6px;margin-top:8px">' + pills + "</div>";

    var meta = [f.plataforma, f.rubro].filter(function (x) { return x; }).map(function (x) { return App.esc(x); }).join(" · ");
    if (meta) cuerpo += '<div class="row-sub" style="margin-top:6px">' + meta + "</div>";
    var ubic = [f.ciudad, f.provincia].filter(function (x) { return x; }).map(function (x) { return App.esc(x); }).join(", ");
    if (ubic) cuerpo += '<div class="row-sub">📍 ' + ubic + "</div>";

    if (f.calificacion || f.rating || f.anios) {
      cuerpo += '<hr class="divider"><div class="flex wrap" style="gap:20px">' +
        (f.calificacion ? '<div><div class="small muted">Tu calificación</div>' + estrellasHTML(f.calificacion) + "</div>" : "") +
        (f.rating ? '<div><div class="small muted">Rating en la plataforma</div><b class="num">' + App.fmt.num(f.rating) + " / 5</b></div>" : "") +
        (f.anios ? '<div><div class="small muted">Años en la plataforma</div><b class="num">' + f.anios + "</b></div>" : "") +
        "</div>";
    }

    if (f.moqTipico || f.diasProduccion) {
      cuerpo += '<hr class="divider"><div class="flex wrap" style="gap:20px">' +
        (f.moqTipico ? '<div><div class="small muted">MOQ típico</div><b>' + App.esc(f.moqTipico) + "</b></div>" : "") +
        (f.diasProduccion ? '<div><div class="small muted">Días de producción</div><b class="num">' + f.diasProduccion + "</b></div>" : "") +
        "</div>";
    }

    if (f.etiquetas && f.etiquetas.length) {
      cuerpo += '<hr class="divider"><div class="chips">' + f.etiquetas.map(function (et) {
        return '<span class="chip" style="cursor:default">' + App.esc(et) + "</span>";
      }).join("") + "</div>";
    }

    var hayPpal = f.contacto || f.wechat || f.telefono;
    var hayContactos = f.contactos && f.contactos.length;
    if (hayPpal || hayContactos) {
      cuerpo += '<hr class="divider"><h3>👤 Contactos</h3>';
      if (hayPpal) {
        cuerpo += '<div class="row-item static"><div class="row-main"><div class="row-title" style="font-size:13.5px">' + App.esc(f.contacto || "Contacto principal") + "</div>" +
          (f.wechat ? '<div class="row-sub">WeChat: ' + App.esc(f.wechat) + "</div>" : "") + "</div>" +
          '<div class="flex" style="gap:4px">' +
          (f.telefono ? '<a class="btn icon" target="_blank" rel="noopener" href="' + App.waLink(f.telefono) + '" title="WhatsApp">' + App.icon("wa") + "</a>" : "") +
          (f.wechat ? '<button class="btn icon" data-copiar-wc="' + App.esc(f.wechat) + '" title="Copiar WeChat">' + App.icon("copiar") + "</button>" : "") +
          "</div></div>";
      }
      if (hayContactos) {
        cuerpo += '<div class="list">' + f.contactos.map(function (c) {
          var sub = [c.wechat ? "WeChat " + c.wechat : "", c.email || "", c.telefono || ""]
            .filter(function (x) { return x; }).map(function (x) { return App.esc(x); }).join(" · ");
          return '<div class="row-item static"><div class="row-main"><div class="row-title" style="font-size:13.5px">' + App.esc(c.nombre || "Sin nombre") +
            (c.cargo ? ' <span class="small muted">· ' + App.esc(c.cargo) + "</span>" : "") + "</div>" +
            (sub ? '<div class="row-sub">' + sub + "</div>" : "") + "</div>" +
            '<div class="flex" style="gap:4px">' +
            (c.whatsapp ? '<a class="btn icon" target="_blank" rel="noopener" href="' + App.waLink(c.whatsapp) + '" title="WhatsApp">' + App.icon("wa") + "</a>" : "") +
            (c.wechat ? '<button class="btn icon" data-copiar-wc="' + App.esc(c.wechat) + '" title="Copiar WeChat">' + App.icon("copiar") + "</button>" : "") +
            (c.email ? '<a class="btn icon" href="mailto:' + App.esc(c.email) + '" title="Correo">' + App.icon("mail") + "</a>" : "") +
            (c.telefono ? '<a class="btn icon" href="tel:' + App.esc(c.telefono) + '" title="Teléfono">' + App.icon("tel") + "</a>" : "") +
            "</div></div>";
        }).join("") + "</div>";
      }
    }

    if (f.direccion) {
      cuerpo += '<hr class="divider"><h3>📍 Dirección de fábrica</h3><div class="row-item static"><div class="row-main"><div class="row-sub" style="white-space:normal">' + App.esc(f.direccion) + "</div></div>" +
        '<button class="btn icon" data-copiar-dir title="Copiar dirección">' + App.icon("copiar") + "</button></div>";
    }

    if (f.catalogos && f.catalogos.length) {
      cuerpo += '<hr class="divider"><h3>📄 Catálogos</h3><div class="list">' + f.catalogos.map(function (c) {
        return '<a class="row-item" target="_blank" rel="noopener" href="' + App.esc(c.url) + '"><div class="thumb">' + App.icon("guia") + "</div>" +
          '<div class="row-main"><div class="row-title" style="font-size:13.5px">' + App.esc(c.nombre || "Catálogo") + "</div>" +
          (c.fecha ? '<div class="row-sub">' + App.fmt.fecha(c.fecha) + "</div>" : "") + "</div></a>";
      }).join("") + "</div>";
    }

    if (f.url) cuerpo += '<hr class="divider"><a class="btn block ghost" target="_blank" rel="noopener" href="' + App.esc(f.url) + '">🔗 Abrir tienda</a>';
    if (f.productos) cuerpo += '<hr class="divider"><h3>📦 Qué le compras</h3><p class="small texto-largo">' + App.esc(f.productos) + "</p>";
    if (f.notas) cuerpo += '<hr class="divider"><h3>💡 Notas</h3><p class="small muted texto-largo">' + App.esc(f.notas) + "</p>";

    var s = App.sheet({
      titulo: "🏭 Fábrica",
      cuerpo: cuerpo,
      pie: (f.telefono ? '<a class="btn wa" target="_blank" rel="noopener" href="' + App.waLink(f.telefono) + '">' + App.icon("wa") + " WhatsApp</a>" : "") +
        '<button class="btn" data-editar>' + App.icon("editar") + "</button>" +
        '<button class="btn danger" data-borrar style="flex:0 0 auto">' + App.icon("basura") + "</button>"
    });

    App.$$("[data-copiar-wc]", s.el).forEach(function (b) { b.addEventListener("click", function () { App.copiar(b.dataset.copiarWc, "ID de WeChat copiado"); }); });
    var bd = App.$("[data-copiar-dir]", s.el);
    if (bd) bd.addEventListener("click", function () { App.copiar(f.direccion, "Dirección copiada"); });
    App.$("[data-editar]", s.el).addEventListener("click", function () { s.cerrar(); formFabrica(f); });
    App.$("[data-borrar]", s.el).addEventListener("click", function () {
      App.confirmar("¿Eliminar “" + f.nombre + "”?", { peligro: true, accion: "Eliminar" }).then(function (si) {
        if (!si) return;
        App.db.proveedores = App.db.proveedores.filter(function (x) { return x.id !== f.id; });
        App.save(); App.toast("Fábrica eliminada");
        s.cerrar(); App.render();
      });
    });
  }

  /* ---------- alta / edición ---------- */
  function formFabrica(orig) {
    var FP = orig ? JSON.parse(JSON.stringify(orig)) : {
      id: null, nombre: "", nombreCn: "",
      plataforma: (App.db.settings.plataformas || [])[0] || "",
      rubro: (App.db.settings.rubros || [])[0] || "",
      etiquetas: [], contacto: "", wechat: "", telefono: "", url: "",
      ciudad: "", provincia: "", direccion: "",
      verificado: false, tradeAssurance: false, anios: 0, rating: 0, calificacion: 0, estado: "activo",
      moqTipico: "", diasProduccion: 0, contactos: [], catalogos: [], productos: "", notas: "",
      creadoEl: App.hoyISO()
    };
    FP.etiquetas = FP.etiquetas || [];
    FP.contactos = FP.contactos || [];
    FP.catalogos = FP.catalogos || [];

    var s = App.sheet({
      titulo: orig ? "✏️ Editar fábrica" : "🏭 Nueva fábrica",
      cuerpo: '<div class="form-grid">' +
        '<div class="field full"><label>Nombre</label><input class="input" id="fb-nombre" value="' + App.esc(FP.nombre) + '" placeholder="Yiwu Happy Toys Co."></div>' +
        '<div class="field"><label>Nombre en chino</label><input class="input" id="fb-nombrecn" value="' + App.esc(FP.nombreCn) + '"></div>' +
        '<div class="field"><label>Plataforma</label><select class="select" id="fb-plataforma">' +
        (App.db.settings.plataformas || []).map(function (p) { return "<option" + (FP.plataforma === p ? " selected" : "") + ">" + App.esc(p) + "</option>"; }).join("") +
        "</select></div>" +
        '<div class="field"><label>Rubro</label><select class="select" id="fb-rubro">' +
        (App.db.settings.rubros || []).map(function (r) { return "<option" + (FP.rubro === r ? " selected" : "") + ">" + App.esc(r) + "</option>"; }).join("") +
        "</select></div>" +
        '<div class="field"><label>Ciudad</label><input class="input" id="fb-ciudad" value="' + App.esc(FP.ciudad) + '"></div>' +
        '<div class="field"><label>Provincia</label><input class="input" id="fb-provincia" value="' + App.esc(FP.provincia) + '"></div>' +
        '<div class="field full"><label>Dirección de fábrica</label><input class="input" id="fb-direccion" value="' + App.esc(FP.direccion) + '"></div>' +
        '<div class="field full"><label>Link de la tienda / perfil</label><input class="input" id="fb-url" value="' + App.esc(FP.url) + '" placeholder="https://…"></div>' +
        '<div class="field"><label>Persona de contacto</label><input class="input" id="fb-contacto" value="' + App.esc(FP.contacto) + '"></div>' +
        '<div class="field"><label>WeChat</label><input class="input" id="fb-wechat" value="' + App.esc(FP.wechat) + '"></div>' +
        '<div class="field"><label>Teléfono / WhatsApp</label><input class="input" id="fb-telefono" value="' + App.esc(FP.telefono) + '"></div>' +
        '<div class="field"><label>MOQ típico (mínimo por pedido)</label><input class="input" id="fb-moq" value="' + App.esc(FP.moqTipico) + '" placeholder="Ej: 500 unidades"></div>' +
        '<div class="field"><label>Días de producción</label><input class="input num" id="fb-dias" type="number" min="0" step="1" value="' + (FP.diasProduccion || 0) + '"></div>' +
        '<div class="field"><label>Años en la plataforma</label><input class="input num" id="fb-anios" type="number" min="0" step="1" value="' + (FP.anios || 0) + '"></div>' +
        '<div class="field"><label>Rating en la plataforma (0-5)</label><input class="input num" id="fb-rating" type="number" min="0" max="5" step="0.1" value="' + (FP.rating || 0) + '"></div>' +
        '<div class="field full"><div class="flex wrap" style="gap:22px;margin-top:2px">' +
        '<label class="flex small" style="gap:8px">Verificada <span class="switch"><input type="checkbox" id="fb-verificado"' + (FP.verificado ? " checked" : "") + "><i></i></span></label>" +
        '<label class="flex small" style="gap:8px">Trade Assurance <span class="switch"><input type="checkbox" id="fb-ta"' + (FP.tradeAssurance ? " checked" : "") + "><i></i></span></label>" +
        "</div></div>" +
        '<div class="field full"><label>Estado</label><div class="seg" id="fb-estado">' +
        ["activo", "probando", "descartado"].map(function (k) {
          return '<button type="button" class="seg-btn' + (FP.estado === k ? " active" : "") + '" data-v="' + k + '">' + ESTADO_LABEL[k] + "</button>";
        }).join("") + "</div></div>" +
        '<div class="field full"><label>Tu calificación</label><div class="flex" id="fb-estrellas" style="gap:2px;margin-top:2px"></div></div>' +
        '<div class="field full"><label>Qué le compras</label><input class="input" id="fb-productos" value="' + App.esc(FP.productos) + '" placeholder="Bicicletas, repuestos…"></div>' +
        '<div class="field full"><label>Notas</label><textarea class="textarea" id="fb-notas">' + App.esc(FP.notas) + "</textarea></div>" +
        "</div>" +
        '<hr class="divider"><h3>🏷️ Etiquetas</h3>' +
        '<div class="chips" id="fb-etiquetas" style="margin:6px 0"></div>' +
        '<div class="input-row"><div class="field" style="flex:1"><input class="input" id="fb-etq-input" placeholder="Ej: bicicletas, aluminio… y Enter"></div>' +
        '<button type="button" class="btn sm" id="fb-etq-add">' + App.icon("plus") + " Agregar</button></div>" +
        '<hr class="divider"><h3>👤 Contactos adicionales</h3>' +
        '<div class="small muted" style="margin-bottom:8px">Además del contacto principal de arriba, agrega aquí otras personas de esta fábrica (ventas, calidad, logística…).</div>' +
        '<div id="fb-contactos"></div>' +
        '<hr class="divider"><h3>📄 Catálogos</h3>' +
        '<div id="fb-catalogos"></div>' +
        '<div class="small muted" style="margin-top:6px">💡 El PDF pesado va en Google Drive. Aquí solo pegas el enlace para abrirlo rápido.</div>',
      pie: (orig ? '<button class="btn danger" data-borrar style="flex:0 0 auto">' + App.icon("basura") + "</button>" : "") +
        '<button class="btn primary" data-ok>' + (orig ? "Guardar" : "Agregar") + "</button>"
    });

    App.$$("#fb-estado .seg-btn", s.el).forEach(function (b) {
      b.addEventListener("click", function () {
        FP.estado = b.dataset.v;
        App.$$("#fb-estado .seg-btn", s.el).forEach(function (x) { x.classList.toggle("active", x === b); });
      });
    });

    function pintarEstrellas() {
      var box = App.$("#fb-estrellas", s.el);
      var val = FP.calificacion || 0;
      var html = "";
      for (var i = 1; i <= 5; i++) {
        html += '<button type="button" class="btn icon" data-star="' + i + '" style="width:34px;height:34px;font-size:19px">' +
          (i <= val ? '<span class="star">★</span>' : '<span class="muted">☆</span>') + "</button>";
      }
      box.innerHTML = html;
      App.$$("[data-star]", box).forEach(function (b) {
        b.addEventListener("click", function () {
          var v = +b.dataset.star;
          FP.calificacion = FP.calificacion === v ? 0 : v;
          pintarEstrellas();
        });
      });
    }

    function pintarEtiquetas() {
      var box = App.$("#fb-etiquetas", s.el);
      box.innerHTML = FP.etiquetas.map(function (et, i) {
        return '<span class="chip" style="cursor:default">' + App.esc(et) +
          ' <button type="button" data-etq-del="' + i + '" style="margin-left:2px;padding:8px 10px;margin-top:-8px;margin-bottom:-8px;color:var(--danger);font-weight:800">×</button></span>';
      }).join("");
      App.$$("[data-etq-del]", box).forEach(function (b) {
        b.addEventListener("click", function () { FP.etiquetas.splice(+b.dataset.etqDel, 1); pintarEtiquetas(); });
      });
    }
    function agregarEtiqueta() {
      var inp = App.$("#fb-etq-input", s.el);
      var v = inp.value.trim();
      if (!v) return;
      if (FP.etiquetas.indexOf(v) < 0) FP.etiquetas.push(v);
      inp.value = "";
      pintarEtiquetas();
      inp.focus();
    }
    App.$("#fb-etq-add", s.el).addEventListener("click", agregarEtiqueta);
    App.$("#fb-etq-input", s.el).addEventListener("keydown", function (ev) {
      if (ev.key === "Enter") { ev.preventDefault(); agregarEtiqueta(); }
    });

    function pintarContactos() {
      var box = App.$("#fb-contactos", s.el);
      box.innerHTML = FP.contactos.map(function (c, i) {
        return '<div class="card" style="padding:10px 12px;box-shadow:none;border:1px solid var(--card-border);margin-bottom:8px">' +
          '<div class="spread" style="margin-bottom:6px"><span class="small muted">Contacto ' + (i + 1) + '</span>' +
          '<button type="button" class="btn icon" data-ct-del="' + i + '" style="width:32px;height:32px">' + App.icon("x") + "</button></div>" +
          '<div class="form-grid">' +
          '<div class="field"><label>Nombre</label><input class="input" data-ct-i="' + i + '" data-ct-f="nombre" value="' + App.esc(c.nombre) + '"></div>' +
          '<div class="field"><label>Cargo</label><input class="input" data-ct-i="' + i + '" data-ct-f="cargo" value="' + App.esc(c.cargo) + '"></div>' +
          '<div class="field"><label>WeChat</label><input class="input" data-ct-i="' + i + '" data-ct-f="wechat" value="' + App.esc(c.wechat) + '"></div>' +
          '<div class="field"><label>WhatsApp</label><input class="input" data-ct-i="' + i + '" data-ct-f="whatsapp" value="' + App.esc(c.whatsapp) + '"></div>' +
          '<div class="field"><label>Correo</label><input class="input" data-ct-i="' + i + '" data-ct-f="email" value="' + App.esc(c.email) + '"></div>' +
          '<div class="field"><label>Teléfono</label><input class="input" data-ct-i="' + i + '" data-ct-f="telefono" value="' + App.esc(c.telefono) + '"></div>' +
          "</div></div>";
      }).join("") + '<button type="button" class="btn sm ghost" id="fb-add-contacto">' + App.icon("plus") + " Agregar contacto</button>";
      App.$$("[data-ct-f]", box).forEach(function (inp) {
        inp.addEventListener("input", function () { FP.contactos[+inp.dataset.ctI][inp.dataset.ctF] = inp.value; });
      });
      App.$$("[data-ct-del]", box).forEach(function (b) {
        b.addEventListener("click", function () { FP.contactos.splice(+b.dataset.ctDel, 1); pintarContactos(); });
      });
      App.$("#fb-add-contacto", box).addEventListener("click", function () {
        FP.contactos.push({ nombre: "", cargo: "", wechat: "", whatsapp: "", email: "", telefono: "" });
        pintarContactos();
      });
    }

    function pintarCatalogos() {
      var box = App.$("#fb-catalogos", s.el);
      box.innerHTML = FP.catalogos.map(function (c, i) {
        return '<div class="flex" style="gap:8px;margin-bottom:6px">' +
          '<input class="input" data-cat-i="' + i + '" data-cat-f="nombre" value="' + App.esc(c.nombre) + '" placeholder="Ej: catálogo bicicletas 2026" style="flex:1">' +
          '<input class="input" data-cat-i="' + i + '" data-cat-f="url" value="' + App.esc(c.url) + '" placeholder="Enlace de Drive" style="flex:1">' +
          '<button type="button" class="btn icon" data-cat-del="' + i + '">' + App.icon("x") + "</button></div>";
      }).join("") + '<button type="button" class="btn sm ghost" id="fb-add-catalogo">' + App.icon("plus") + " Agregar catálogo</button>";
      App.$$("[data-cat-f]", box).forEach(function (inp) {
        inp.addEventListener("input", function () { FP.catalogos[+inp.dataset.catI][inp.dataset.catF] = inp.value; });
      });
      App.$$("[data-cat-del]", box).forEach(function (b) {
        b.addEventListener("click", function () { FP.catalogos.splice(+b.dataset.catDel, 1); pintarCatalogos(); });
      });
      App.$("#fb-add-catalogo", box).addEventListener("click", function () {
        FP.catalogos.push({ nombre: "", url: "", fecha: App.hoyISO() });
        pintarCatalogos();
      });
    }

    pintarEstrellas(); pintarEtiquetas(); pintarContactos(); pintarCatalogos();

    App.$("[data-ok]", s.foot).addEventListener("click", function () {
      var nombre = App.$("#fb-nombre", s.el).value.trim();
      if (!nombre) { App.toast("La fábrica necesita nombre", "err"); return; }
      FP.nombre = nombre;
      FP.nombreCn = App.$("#fb-nombrecn", s.el).value.trim();
      FP.plataforma = App.$("#fb-plataforma", s.el).value;
      FP.rubro = App.$("#fb-rubro", s.el).value;
      FP.ciudad = App.$("#fb-ciudad", s.el).value.trim();
      FP.provincia = App.$("#fb-provincia", s.el).value.trim();
      FP.direccion = App.$("#fb-direccion", s.el).value.trim();
      FP.url = App.$("#fb-url", s.el).value.trim();
      FP.contacto = App.$("#fb-contacto", s.el).value.trim();
      FP.wechat = App.$("#fb-wechat", s.el).value.trim();
      FP.telefono = App.$("#fb-telefono", s.el).value.trim();
      FP.moqTipico = App.$("#fb-moq", s.el).value.trim();
      FP.diasProduccion = Math.max(0, parseInt(App.$("#fb-dias", s.el).value, 10) || 0);
      FP.anios = Math.max(0, parseInt(App.$("#fb-anios", s.el).value, 10) || 0);
      FP.rating = Math.max(0, Math.min(5, parseFloat(App.$("#fb-rating", s.el).value) || 0));
      FP.verificado = App.$("#fb-verificado", s.el).checked;
      FP.tradeAssurance = App.$("#fb-ta", s.el).checked;
      FP.productos = App.$("#fb-productos", s.el).value.trim();
      FP.notas = App.$("#fb-notas", s.el).value.trim();
      FP.contactos = FP.contactos.filter(function (c) { return c.nombre || c.cargo || c.wechat || c.whatsapp || c.email || c.telefono; });
      FP.catalogos = FP.catalogos.filter(function (c) { return c.nombre || c.url; });

      App.db.proveedores = App.db.proveedores || [];
      if (orig) {
        var ix = App.db.proveedores.findIndex(function (x) { return x.id === orig.id; });
        App.db.proveedores[ix] = FP;
      } else {
        FP.id = App.uid("pr");
        FP.creadoEl = App.hoyISO();
        App.db.proveedores.push(FP);
      }
      App.save(); App.toast(orig ? "Fábrica actualizada" : "Fábrica agregada");
      s.cerrar(); App.render();
    });
    var bb = App.$("[data-borrar]", s.foot);
    if (bb) bb.addEventListener("click", function () {
      App.confirmar("¿Eliminar esta fábrica?", { peligro: true, accion: "Eliminar" }).then(function (si) {
        if (!si) return;
        App.db.proveedores = App.db.proveedores.filter(function (x) { return x.id !== orig.id; });
        App.save(); App.toast("Fábrica eliminada"); s.cerrar(); App.render();
      });
    });
  }

  /* ---------- pedido a fábrica (con escáner) - reposición del inventario propio ---------- */
  function formCompra(orig) {
    var C = App.calc;
    if (!(App.db.proveedores || []).length) { App.toast("Primero registra una fábrica", "err"); return; }
    var FC = orig ? JSON.parse(JSON.stringify(orig)) : {
      id: null, proveedorId: App.db.proveedores[0].id,
      fecha: App.hoyISO(), llegadaEst: App.toISO(App.addDays(new Date(), 20)),
      estado: "pedida", recibidaEl: null, fleteTotal: 0, notas: "", items: []
    };

    var s = App.sheet({
      titulo: orig ? "✏️ Editar pedido" : "📦 Nuevo pedido a fábrica",
      cuerpo: '<div class="form-grid">' +
        '<div class="field"><label>Fábrica</label><select class="select" id="fc2-prov">' +
        App.db.proveedores.map(function (p) { return '<option value="' + p.id + '"' + (FC.proveedorId === p.id ? " selected" : "") + ">" + App.esc(p.nombre) + "</option>"; }).join("") +
        "</select></div>" +
        '<div class="field"><label>Fecha del pedido</label><input class="input" id="fc2-fecha" type="date" value="' + FC.fecha + '"></div>' +
        '<div class="field"><label>Llegada estimada</label><input class="input" id="fc2-lleg" type="date" value="' + (FC.llegadaEst || "") + '"></div>' +
        '<div class="field"><label>Flete total del embarque (USD)</label><input class="input num" id="fc2-flete" type="number" step="0.01" min="0" value="' + (FC.fleteTotal || 0) + '"></div>' +
        '<div class="field full"><label>Notas</label><input class="input" id="fc2-notas" value="' + App.esc(FC.notas || "") + '"></div>' +
        "</div>" +
        '<h3 style="margin-top:10px">📦 Productos del pedido</h3>' +
        '<div class="flex" style="margin-top:6px;gap:8px"><div class="search-bar" style="flex:1">' + App.icon("buscar") +
        '<input class="input" id="fc2-bus" placeholder="Busca o escanea (pistola + Enter)…"></div>' +
        '<button class="btn icon" id="fc2-scan" title="Escanear con cámara" style="width:42px;height:42px;flex:none">' + App.icon("camara") + "</button></div>" +
        '<div class="list" id="fc2-res"></div><div id="fc2-items"></div>' +
        '<div id="fc2-tot" class="small muted" style="margin-top:8px"></div>',
      pie: '<button class="btn primary" data-ok>' + (orig ? "Guardar cambios" : "Registrar pedido") + "</button>"
    });

    function pintarTot() {
      FC.fleteTotal = parseFloat(App.$("#fc2-flete", s.el).value) || 0;
      var tot = C.compraTotales(FC);
      App.$("#fc2-tot", s.el).innerHTML = tot.uds + " uds · mercancía <b>" + App.fmt.usd(tot.mercancia) +
        "</b> + flete <b>" + App.fmt.usd(FC.fleteTotal) + "</b> = <b>" + App.fmt.usd(tot.total) + "</b>" +
        (tot.uds ? " · flete por unidad ≈ " + App.fmt.usd(tot.fletePorUd) : "");
    }
    function agregarItem(p) {
      var sinTallas = !p.tallas || !p.tallas.length;
      var ya = sinTallas ? FC.items.filter(function (i) { return i.productoId === p.id; })[0] : null;
      if (ya) ya.cant++;
      else FC.items.push({ productoId: p.id, cant: 1, costoUnit: p.costoChina || 0, talla: sinTallas ? null : p.tallas[0].talla });
      pintarItems(); pintarTot();
    }
    function pintarItems() {
      var box = App.$("#fc2-items", s.el);
      box.innerHTML = FC.items.length ? '<div class="list" style="margin-top:8px">' + FC.items.map(function (it, ix) {
        var p = App.prod(it.productoId);
        var tallaSel = "";
        if (p && p.tallas && p.tallas.length) {
          tallaSel = '<select class="select" data-fc2-talla="' + ix + '" style="width:auto;padding:6px 26px 6px 8px">' +
            p.tallas.map(function (t) { return "<option" + (it.talla === t.talla ? " selected" : "") + ">" + App.esc(t.talla) + "</option>"; }).join("") + "</select>";
        }
        return '<div class="row-item static"><div class="thumb ' + (p ? p.tienda : "") + '">' + (p ? p.emoji : "❓") + "</div>" +
          '<div class="row-main"><div class="row-title" style="font-size:13px">' + App.esc(p ? p.nombre : "?") + "</div>" +
          '<div class="flex wrap" style="gap:6px;margin-top:4px">' +
          '<span class="stepper"><button data-fc2-menos="' + ix + '">−</button><span>' + it.cant + '</span><button data-fc2-mas="' + ix + '">+</button></span>' +
          tallaSel +
          '<input class="input num" data-fc2-costo="' + ix + '" type="number" step="0.01" min="0" value="' + it.costoUnit + '" title="Costo unitario en China (USD)" style="width:92px;padding:6px 9px">' +
          "</div></div>" +
          '<div class="row-end"><span class="row-amount num">' + App.fmt.usd(it.cant * it.costoUnit) + "</span>" +
          '<button class="btn icon" data-fc2-quitar="' + ix + '" style="width:36px;height:36px">' + App.icon("x") + "</button></div></div>";
      }).join("") + "</div>" : '<div class="empty" style="padding:14px"><p>Agrega los productos que pediste (el costo China se precarga y lo ajustas).</p></div>';

      App.$$("[data-fc2-mas]", box).forEach(function (b) { b.addEventListener("click", function () { FC.items[+b.dataset.fc2Mas].cant++; pintarItems(); pintarTot(); }); });
      App.$$("[data-fc2-menos]", box).forEach(function (b) {
        b.addEventListener("click", function () {
          var it = FC.items[+b.dataset.fc2Menos];
          if (it.cant > 1) it.cant--; else FC.items.splice(+b.dataset.fc2Menos, 1);
          pintarItems(); pintarTot();
        });
      });
      App.$$("[data-fc2-quitar]", box).forEach(function (b) { b.addEventListener("click", function () { FC.items.splice(+b.dataset.fc2Quitar, 1); pintarItems(); pintarTot(); }); });
      App.$$("[data-fc2-costo]", box).forEach(function (inp) {
        inp.addEventListener("change", function () { FC.items[+inp.dataset.fc2Costo].costoUnit = Math.max(0, parseFloat(inp.value) || 0); pintarItems(); pintarTot(); });
      });
      App.$$("[data-fc2-talla]", box).forEach(function (sel) {
        sel.addEventListener("change", function () { FC.items[+sel.dataset.fc2Talla].talla = sel.value; });
      });
    }

    var bus = App.$("#fc2-bus", s.el);
    bus.addEventListener("input", function () {
      var t = bus.value.toLowerCase().trim();
      var res = App.$("#fc2-res", s.el);
      if (!t) { res.innerHTML = ""; return; }
      var hits = App.db.productos.filter(function (p) {
        return p.nombre.toLowerCase().indexOf(t) >= 0 || (p.sku || "").toLowerCase().indexOf(t) >= 0 ||
          (p.codigoBarras && String(p.codigoBarras).indexOf(t) >= 0);
      }).slice(0, 5);
      res.innerHTML = hits.map(function (p) {
        return '<div class="row-item" data-fc2-add="' + p.id + '"><div class="thumb ' + p.tienda + '">' + p.emoji + "</div>" +
          '<div class="row-main"><div class="row-title">' + App.esc(p.nombre) + '</div><div class="row-sub">stock actual: ' + C.prodStock(p) + " · China " + App.fmt.usd(p.costoChina || 0) + "</div></div>" + App.pillTienda(p.tienda) + "</div>";
      }).join("");
      App.$$("[data-fc2-add]", res).forEach(function (r) {
        r.addEventListener("click", function () {
          agregarItem(App.prod(r.dataset.fc2Add));
          bus.value = ""; res.innerHTML = "";
        });
      });
    });
    bus.addEventListener("keydown", function (ev) {
      if (ev.key !== "Enter") return;
      ev.preventDefault();
      var p = App.buscarPorCodigo(bus.value);
      if (p) { agregarItem(p); App.toast("➕ " + p.nombre); bus.value = ""; App.$("#fc2-res", s.el).innerHTML = ""; }
    });
    App.$("#fc2-scan", s.el).addEventListener("click", function () {
      App.escanear(function (codigo) {
        var p = App.buscarPorCodigo(codigo);
        if (p) { agregarItem(p); App.toast("➕ " + p.nombre); }
        else App.toast("El código " + codigo + " no está asignado a ningún producto", "err");
      });
    });
    App.$("#fc2-flete", s.el).addEventListener("input", pintarTot);
    pintarItems(); pintarTot();

    App.$("[data-ok]", s.foot).addEventListener("click", function () {
      if (!FC.items.length) { App.toast("Agrega al menos un producto al pedido", "err"); return; }
      FC.proveedorId = App.$("#fc2-prov", s.el).value;
      FC.fecha = App.$("#fc2-fecha", s.el).value || App.hoyISO();
      FC.llegadaEst = App.$("#fc2-lleg", s.el).value || null;
      FC.fleteTotal = parseFloat(App.$("#fc2-flete", s.el).value) || 0;
      FC.notas = App.$("#fc2-notas", s.el).value.trim();
      App.db.compras = App.db.compras || [];
      if (orig) {
        var ix = App.db.compras.findIndex(function (c) { return c.id === orig.id; });
        App.db.compras[ix] = FC;
      } else {
        FC.id = App.uid("co");
        App.db.compras.push(FC);
      }
      App.save(); App.toast(orig ? "Pedido actualizado" : "Pedido registrado 📦");
      s.cerrar(); App.render();
    });
  }
})();
