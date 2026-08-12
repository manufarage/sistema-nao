/* ============================================================
   dashboard.js - Inicio: qué hay que hacer hoy + cómo va el mes
   ============================================================ */
window.App = window.App || {};

(function () {
  "use strict";
  var C = null;
  var filtroDesp = null; // filtro por agencia del bloque "Para despachar"

  /* Los 11 estados de una importación, resumidos en las 7 etapas que se
     entienden de un vistazo (el detalle fino vive en Importaciones) */
  var ETAPAS = [
    { l: "Cotización", emoji: "📝", ids: ["cotizada", "proforma"] },
    { l: "Anticipo", emoji: "💵", ids: ["anticipo"] },
    { l: "Producción", emoji: "🏭", ids: ["produccion", "lista"] },
    { l: "En almacén", emoji: "📦", ids: ["almacen"] },
    { l: "Navegando", emoji: "🚢", ids: ["embarcada", "transito"] },
    { l: "Llegó", emoji: "🛬", ids: ["llegada"] },
    { l: "Entregada", emoji: "🤝", ids: ["entregada"] }
  ];

  App.modDashboard = {
    id: "dashboard",
    titulo: "Inicio",
    icono: "inicio",
    render: function (el) {
      C = App.calc;
      /* dos inicios: el del agente de compras (Manuel) y el clásico de
         tienda (socio / vendedor, que no ve importaciones) */
      if (App.modImportaciones && App.auth.puede("importaciones")) { renderAgente(el); return; }
      renderTienda(el);
    }
  };

  /* ============================================================
     INICIO DEL AGENTE: el negocio de importar, de un vistazo
     ============================================================ */
  function renderAgente(el) {
    var hoy = App.hoyISO();
    var u = App.auth.user;
    var imps = App.db.importaciones || [];
    var activas = imps.filter(function (i) { return i.estado !== "cerrada"; });

    var porCobrar = 0, porPagar = 0, ganancia = 0, atrasadas = 0;
    activas.forEach(function (i) {
      var sa = App.modImportaciones.saldos(i);
      if (!sa) return;
      porCobrar += Math.max(0, +sa.saldoCliente || 0);
      porPagar += Math.max(0, +sa.saldoFabrica || 0);
      ganancia += +sa.miComision || 0;
    });

    /* llegadas: lo que está en camino, ordenado por fecha estimada */
    var llegadas = activas.filter(function (i) {
      return i.fechas && i.fechas.eta && ["almacen", "embarcada", "transito", "llegada"].indexOf(i.estado) >= 0;
    }).sort(function (a, b) { return a.fechas.eta < b.fechas.eta ? -1 : 1; });
    llegadas.forEach(function (i) { if (C.diasHasta(i.fechas.eta) < 0 && i.estado !== "llegada") atrasadas++; });

    var avisos = [];
    var pendientes = 0;
    if (App.modTareas) {
      try {
        avisos = App.modTareas.avisos() || [];
        pendientes = App.modTareas.pendientes() || 0;
      } catch (e) { avisos = []; }
    }

    var html = '<div class="view">';

    /* saludo + acciones rápidas */
    html += '<div class="spread" style="margin-bottom:14px;flex-wrap:wrap;gap:10px"><div>' +
      '<div class="eyebrow">' + App.esc(App.fmt.fechaLarga(hoy)) + "</div>" +
      '<h1 style="margin-top:2px">Hola, ' + App.esc(u.nombre.split(" ")[0]) + " ⚓</h1></div>" +
      '<div class="flex" style="gap:8px">' +
      '<button class="btn primary sm" data-nueva-imp>' + App.icon("plus") + " Importación</button>" +
      '<button class="btn sm" data-nueva-cot>' + App.icon("comparar") + " Cotización</button></div></div>";

    /* avisos transversales (festividades / respaldo) */
    var alertas = "";
    C.festEnAviso().slice(0, 2).forEach(function (f) {
      var dias = C.diasHasta(f.fecha);
      var cuando = dias === 0 ? "¡es hoy!" : (dias === 1 ? "¡es mañana!" : "en " + dias + " días");
      alertas += '<div class="alert-item fest" data-ir="calendario"><span class="em">' + f.emoji + "</span><span><b>" +
        App.esc(f.nombre) + "</b> " + cuando + "</span></div>";
    });
    if (App.auth.esSuper()) {
      var dsr = C.diasSinRespaldo();
      if (dsr === null || dsr > 7) {
        alertas += '<div class="alert-item warn" data-respaldo><span class="em">💾</span><span><b>' +
          (dsr === null ? "Nunca has descargado un respaldo" : "Llevas " + dsr + " días sin respaldar") +
          "</b> - toca aquí y se descarga solo</span></div>";
      }
    }
    if (alertas) html += '<div class="alert-strip">' + alertas + "</div>";

    /* el dinero del negocio */
    html += '<div class="grid-kpi">' +
      '<div class="kpi" data-ir="importaciones" style="cursor:pointer"><div class="kpi-label">Importaciones en curso</div>' +
      '<div class="kpi-value grad">' + activas.length + "</div>" +
      '<div class="kpi-foot">' + (atrasadas ? '<span class="stat-delta down">▲ ' + atrasadas + " con retraso</span>" : "<span>todo en tiempo</span>") + "</div></div>" +
      '<div class="kpi" data-ir="importaciones" style="cursor:pointer"><div class="kpi-label">Te falta cobrar</div>' +
      '<div class="kpi-value num" style="color:var(--warn)">' + App.fmt.usd0(porCobrar) + "</div>" +
      '<div class="kpi-foot">de tus clientes</div></div>' +
      '<div class="kpi" data-ir="importaciones" style="cursor:pointer"><div class="kpi-label">Falta pagar</div>' +
      '<div class="kpi-value num" style="color:var(--danger)">' + App.fmt.usd0(porPagar) + "</div>" +
      '<div class="kpi-foot">a las fábricas</div></div>' +
      '<div class="kpi" data-ir="importaciones" style="cursor:pointer"><div class="kpi-label">Tu ganancia</div>' +
      '<div class="kpi-value num" style="color:var(--ok)">' + App.fmt.usd0(ganancia) + "</div>" +
      '<div class="kpi-foot">comprometida en lo activo</div></div>' +
      "</div>";

    /* pipeline: dónde está parada cada importación */
    html += '<div class="card" style="margin-bottom:14px"><div class="card-head"><h2>🧭 El camino de tus importaciones</h2>' +
      '<a class="small" href="#/importaciones">Ver todas</a></div>';
    if (!activas.length) {
      html += '<div class="empty" style="padding:16px"><p>Todavía no hay importaciones en curso.</p>' +
        '<button class="btn primary" data-nueva-imp style="margin-top:8px">' + App.icon("plus") + " Registrar la primera</button></div>";
    } else {
      html += '<div class="pipe">' + ETAPAS.map(function (et, ix) {
        var n = activas.filter(function (i) { return et.ids.indexOf(i.estado) >= 0; }).length;
        return (ix ? '<div class="pipe-flecha">' + App.icon("chevR") + "</div>" : "") +
          '<div class="pipe-step' + (n ? " on" : "") + '" data-ir="importaciones" title="' + App.esc(et.l) + '">' +
          '<div class="pipe-n">' + (n || "·") + '</div><div class="pipe-l">' + et.emoji + " " + et.l + "</div></div>";
      }).join("") + "</div>";
    }
    html += "</div>";

    /* dos columnas: qué atender + qué está llegando */
    var cAtender = '<div class="card"><div class="card-head"><h2>📥 Por atender</h2>' +
      (pendientes ? '<span class="pill tint">' + pendientes + "</span>" : "") + "</div>";
    if (!avisos.length) {
      cAtender += '<div class="empty" style="padding:14px"><p>✅ Todo al día. Los avisos de pagos, producción y llegadas aparecen aquí solos.</p></div>';
    } else {
      cAtender += avisos.slice(0, 4).map(function (a, i) {
        var color = a.nivel === "alto" ? "danger" : a.nivel === "medio" ? "warn" : "info";
        return '<div class="mini-row" data-aviso="' + i + '"><span class="pill ' + color + '" style="flex:none">●</span>' +
          '<div class="mini-main"><div class="mini-title">' + App.esc(a.titulo) + '</div>' +
          '<div class="mini-sub">' + App.esc(a.detalle || "") + "</div></div>" + App.icon("chevR") + "</div>";
      }).join("");
    }
    cAtender += '<button class="btn ghost block" data-ir="tareas" style="margin-top:8px">' + App.icon("inbox") + " Abrir el inbox</button></div>";

    var cLlegadas = '<div class="card"><div class="card-head"><h2>🚢 En camino</h2><span class="pill">' + llegadas.length + "</span></div>";
    if (!llegadas.length) {
      cLlegadas += '<div class="empty" style="padding:14px"><p>Nada navegando ahora mismo. Cuando una importación tenga fecha estimada de llegada, aquí verás la cuenta atrás.</p></div>';
    } else {
      cLlegadas += llegadas.slice(0, 5).map(function (i) {
        var dl = C.diasHasta(i.fechas.eta);
        var pill = i.estado === "llegada" ? '<span class="pill ok">ya llegó</span>'
          : dl < 0 ? '<span class="pill danger">hace ' + (-dl) + " días</span>"
            : dl === 0 ? '<span class="pill warn">llega HOY</span>'
              : '<span class="pill info">' + dl + " día" + (dl === 1 ? "" : "s") + "</span>";
        var fw = (App.db.forwarders || []).filter(function (f) { return f.id === i.forwarderId; })[0];
        return '<div class="mini-row" data-imp="' + App.esc(i.id) + '">' +
          '<div class="mini-main"><div class="mini-title">' + App.esc((i.codigo ? i.codigo + " · " : "") + i.titulo) + "</div>" +
          '<div class="mini-sub">' + App.esc(fw ? fw.nombre : "") + (i.buque ? " · 🛳 " + App.esc(i.buque) : "") +
          (i.bl ? " · BL " + App.esc(i.bl) : "") + "</div></div>" + pill + "</div>";
      }).join("");
    }
    cLlegadas += "</div>";
    html += '<div class="dash-cols"><div class="dash-col">' + cAtender + '</div><div class="dash-col">' + cLlegadas + "</div></div>";

    /* la tienda, en resumen (si vende) */
    if (App.auth.puede("ventas")) {
      var mesAct = App.mesRango(0), mesAnt = App.mesRango(-1);
      var vHoy = C.ventasEntre(hoy, hoy), vMes = C.ventasEntre(mesAct[0], mesAct[1]);
      var totalHoy = C.sum(vHoy), totalMes = C.sum(vMes), totalMesAnt = C.sum(C.ventasEntre(mesAnt[0], mesAnt[1]));
      var pendEnvio = C.pendientesEnvio();
      var stockBajo = C.stockBajo();
      var spark7 = C.serieDiaria(7).map(function (d) { return d.total; });
      var delta = C.deltaPct(totalMes, totalMesAnt);
      html += '<div class="card section-gap"><div class="card-head"><h2>🛍️ Tus tiendas</h2>' +
        '<a class="small" href="#/ventas">Ir a ventas</a></div>' +
        '<div class="grid-kpi" style="margin-bottom:0">' +
        '<div class="kpi"><div class="kpi-label">Hoy</div><div class="kpi-value">' + App.fmt.usd0(totalHoy) + "</div>" +
        '<div class="kpi-foot">' + vHoy.length + " venta" + (vHoy.length === 1 ? "" : "s") + '</div><div class="kpi-spark">' + App.chart.spark(spark7, "var(--c3)") + "</div></div>" +
        '<div class="kpi"><div class="kpi-label">Este mes</div><div class="kpi-value">' + App.fmt.usd0(totalMes) + "</div>" +
        '<div class="kpi-foot">' + App.deltaPill(delta) + "<span>vs mes pasado</span></div></div>" +
        '<div class="kpi" data-ir="envios" style="cursor:pointer"><div class="kpi-label">Por enviar</div><div class="kpi-value">' + pendEnvio.length + "</div>" +
        '<div class="kpi-foot">pedidos pendientes</div></div>' +
        '<div class="kpi" data-ir="inventario" style="cursor:pointer"><div class="kpi-label">Stock bajo</div><div class="kpi-value"' + (stockBajo.length ? ' style="color:var(--warn)"' : "") + ">" + stockBajo.length + "</div>" +
        '<div class="kpi-foot">producto' + (stockBajo.length === 1 ? "" : "s") + " por reponer</div></div>" +
        "</div></div>";
    }

    html += "</div>";
    el.innerHTML = html;

    /* navegación */
    App.$$("[data-ir]", el).forEach(function (x) {
      x.addEventListener("click", function () { location.hash = "#/" + x.dataset.ir; });
    });
    App.$$("[data-nueva-imp]", el).forEach(function (b) {
      b.addEventListener("click", function () {
        if (App.modImportaciones.nueva) { location.hash = "#/importaciones"; App.modImportaciones.nueva(); }
      });
    });
    App.$$("[data-nueva-cot]", el).forEach(function (b) {
      b.addEventListener("click", function () {
        if (App.modCotizaciones && App.modCotizaciones.nueva) { location.hash = "#/cotizaciones"; App.modCotizaciones.nueva(); }
      });
    });
    App.$$("[data-aviso]", el).forEach(function (x) {
      x.addEventListener("click", function () {
        var a = avisos[+x.dataset.aviso];
        if (a && a.ir) location.hash = a.ir;
      });
    });
    App.$$("[data-imp]", el).forEach(function (x) {
      x.addEventListener("click", function () {
        var i = imps.filter(function (q) { return q.id === x.dataset.imp; })[0];
        if (i && App.modImportaciones.ficha) App.modImportaciones.ficha(i);
      });
    });
    var bResp = App.$("[data-respaldo]", el);
    if (bResp) bResp.addEventListener("click", function () {
      App.descargarRespaldo();
      App.toast("Respaldo descargado 💾 - guárdalo en un lugar seguro");
      App.render();
    });
  }

  /* ============================================================
     INICIO CLÁSICO DE TIENDA (vendedor / socio)
     ============================================================ */
  function renderTienda(el) {
      var hoy = App.hoyISO();
      var mesAct = App.mesRango(0), mesAnt = App.mesRango(-1);
      var vHoy = C.ventasEntre(hoy, hoy);
      var vMes = C.ventasEntre(mesAct[0], mesAct[1]);
      var vMesAnt = C.ventasEntre(mesAnt[0], mesAnt[1]);
      var totalHoy = C.sum(vHoy), totalMes = C.sum(vMes), totalMesAnt = C.sum(vMesAnt);
      var pendEnvio = C.pendientesEnvio();
      var pagosPend = C.pagosPendientes();
      var stockBajo = C.stockBajo();
      var fest = C.festEnAviso().slice(0, 2);
      var serie30 = C.serieDiaria(30);
      var spark7 = C.serieDiaria(7).map(function (d) { return d.total; });
      var ticket = vMes.length ? totalMes / vMes.length : 0;
      var u = App.auth.user;

      var html = '<div class="view">';

      /* saludo */
      html += '<div class="spread" style="margin-bottom:12px"><div>' +
        '<div class="eyebrow">' + App.esc(App.fmt.fechaLarga(hoy)) + "</div>" +
        '<h1 style="margin-top:2px">Hola, ' + App.esc(u.nombre.split(" ")[0]) + " 👋</h1></div></div>";

      /* alertas (avisos): festividades + stock bajo */
      var alertas = "";
      fest.forEach(function (f) {
        var dias = C.diasHasta(f.fecha);
        var cuando = dias === 0 ? "¡es hoy!" : (dias === 1 ? "¡es mañana!" : "en " + dias + " días");
        alertas += '<div class="alert-item fest" data-ir="calendario"><span class="em">' + f.emoji + "</span><span><b>" +
          App.esc(f.nombre) + "</b> " + cuando + " - prepara contenido y stock</span></div>";
      });
      if (stockBajo.length) {
        alertas += '<div class="alert-item warn" data-ir="inventario"><span class="em">⚠️</span><span><b>' +
          stockBajo.length + " producto" + (stockBajo.length > 1 ? "s" : "") + "</b> con stock bajo: " +
          App.esc(stockBajo.slice(0, 2).map(function (p) { return p.nombre; }).join(", ")) + (stockBajo.length > 2 ? "…" : "") + "</span></div>";
      }
      if (App.auth.esSuper()) {
        var dsr = C.diasSinRespaldo();
        if (dsr === null || dsr > 7) {
          alertas += '<div class="alert-item warn" data-respaldo><span class="em">💾</span><span><b>' +
            (dsr === null ? "Nunca has descargado un respaldo" : "Llevas " + dsr + " días sin respaldar") +
            "</b> - toca aquí y se descarga solo</span></div>";
        }
      }
      if (alertas) html += '<div class="alert-strip">' + alertas + "</div>";

      /* inbox: qué hay que hacer hoy */
      var tareas = [];
      var maniana = App.toISO(App.addDays(new Date(), 1));
      C.retirosPendientes().forEach(function (v) {
        var cli = App.cliente(v.clienteId);
        var f = v.entrega.fechaRetiro || hoy;
        if (f > maniana) return;
        var cuando = (f < hoy ? "quedó en retirar el " + App.fmt.fecha(f) : (f === hoy ? "pasa a retirar <b>HOY</b>" : "retira mañana")) +
          (v.entrega.horaRetiro ? " a las <b>" + v.entrega.horaRetiro + "</b>" : "");
        tareas.push({ emoji: "🏪", html: "<b>" + App.esc(cli ? cli.nombre : "Cliente casual") + "</b> " + cuando, ventaId: v.id, urgente: f <= hoy });
      });
      var porAgencia = {};
      C.porLlevar().forEach(function (v) {
        if (v.entrega.tipo === "agencia") {
          var ag = (App.agencia(v.entrega.agenciaId) || {}).nombre || "la agencia";
          porAgencia[ag] = (porAgencia[ag] || 0) + 1;
        } else {
          var cliM = App.cliente(v.clienteId);
          tareas.push({ emoji: "🏍️", html: "Coordinar moto para <b>" + App.esc(cliM ? cliM.nombre : "cliente") + "</b>", ventaId: v.id, urgente: true });
        }
      });
      Object.keys(porAgencia).forEach(function (ag) {
        tareas.push({ emoji: "🚚", html: "Llevar <b>" + porAgencia[ag] + " pedido" + (porAgencia[ag] > 1 ? "s" : "") + "</b> a " + App.esc(ag), ir: "envios", urgente: true });
      });
      pendEnvio.filter(function (v) { return v.entrega.estado === "preparando"; }).forEach(function (v) {
        var cli = App.cliente(v.clienteId);
        tareas.push({ emoji: "📦", html: "Armar el pedido de <b>" + App.esc(cli ? cli.nombre : "cliente casual") + "</b>", ventaId: v.id });
      });
      (App.db.compras || []).forEach(function (co) {
        if (co.estado === "recibida" || !co.llegadaEst) return;
        var dl = C.diasHasta(co.llegadaEst);
        if (dl > 2) return;
        var prov = (App.db.proveedores || []).filter(function (x) { return x.id === co.proveedorId; })[0];
        tareas.push({
          emoji: "🚢",
          html: "Pedido a <b>" + App.esc(prov ? prov.nombre : "proveedor") + "</b> " +
            (dl < 0 ? "debió llegar hace " + (-dl) + " días" : dl === 0 ? "llega HOY" : "llega en " + dl + " días") +
            " - al recibirlo márcalo para sumar el stock",
          ir: "fabricas", urgente: dl <= 0
        });
      });
      C.transitoLargo(3).forEach(function (v) {
        var ag = (App.agencia(v.entrega.agenciaId) || {}).nombre || "la agencia";
        var cli = App.cliente(v.clienteId);
        tareas.push({ emoji: "❓", html: "Pregunta a " + App.esc(ag) + " por la guía <b>" + App.esc((v.entrega.guia || {}).numero || "s/n") + "</b> (" + App.esc(cli ? cli.nombre : "cliente") + ")", ventaId: v.id });
      });
      App.db.ventas.filter(function (v) {
        return v.entrega && v.entrega.tipo === "motorizado" && v.entrega.estado !== "entregado" &&
          v.entrega.deliveryPagado === false && (v.entrega.cobroEnvio || 0) > 0;
      }).forEach(function (v) {
        var cli = App.cliente(v.clienteId);
        tareas.push({
          emoji: "💸",
          html: "Cobrar el delivery por adelantado (" + App.fmt.usd(v.entrega.cobroEnvio) + " ≈ " + App.fmt.bs(C.bsDe(v.entrega.cobroEnvio)) + ") a <b>" + App.esc(cli ? cli.nombre : "cliente") + "</b>",
          ventaId: v.id, urgente: true
        });
      });
      pagosPend.slice(0, 3).forEach(function (v) {
        var cli = App.cliente(v.clienteId);
        tareas.push({ emoji: "💵", html: "Cobrar <b>" + App.fmt.usd(C.ventaSaldo(v)) + "</b> a " + App.esc(cli ? cli.nombre : "cliente casual"), ventaId: v.id });
      });
      if (pagosPend.length > 3) {
        tareas.push({ emoji: "💵", html: "…y " + (pagosPend.length - 3) + " cobros pendientes más", ir: "ventas" });
      }

      html += '<div class="card" style="margin-bottom:14px"><div class="card-head"><h2>📋 Para hoy</h2>' +
        (tareas.length ? '<span class="pill tint">' + tareas.length + "</span>" : "") + "</div>";
      if (!tareas.length) {
        html += '<div class="empty" style="padding:14px"><p>🎉 Nada urgente. ¡Al día!</p></div>';
      } else {
        html += '<div class="list">' + tareas.map(function (t, i) {
          return '<div class="row-item" data-tarea="' + i + '"><div class="thumb" style="font-size:18px">' + t.emoji + "</div>" +
            '<div class="row-main"><div class="row-sub" style="color:var(--ink-1)">' + t.html + "</div></div>" +
            (t.urgente ? '<span class="pill danger" style="margin-right:4px">hoy</span>' : "") + App.icon("chevR") + "</div>";
        }).join("") + "</div>";
      }
      if (App.auth.esSuper()) html += '<button class="btn ghost block" data-cierre style="margin-top:10px">🧾 Cierre de caja del día</button>';
      html += "</div>";

      /* para despachar - arriba, con fecha objetivo y filtro por agencia */
      var agsPend = {};
      pendEnvio.forEach(function (v) {
        var k = v.entrega.tipo === "motorizado" ? "moto" : (v.entrega.agenciaId || "otra");
        agsPend[k] = (agsPend[k] || 0) + 1;
      });
      var pendFiltrado = pendEnvio.filter(function (v) {
        if (!filtroDesp) return true;
        if (filtroDesp === "moto") return v.entrega.tipo === "motorizado";
        return v.entrega.agenciaId === filtroDesp;
      });
      html += '<div class="card" style="margin-bottom:14px"><div class="card-head"><h2>📦 Para despachar</h2><a class="small" href="#/envios">Ver todo</a></div>';
      if (pendEnvio.length && Object.keys(agsPend).length > 1) {
        html += '<div class="chips scroll-x" style="margin-bottom:8px">' +
          '<button class="chip' + (!filtroDesp ? " active" : "") + '" data-fd="">Todas · ' + pendEnvio.length + "</button>" +
          Object.keys(agsPend).filter(function (k) { return k !== "moto" && k !== "otra"; }).map(function (k) {
            var ag = App.agencia(k);
            return '<button class="chip' + (filtroDesp === k ? " active" : "") + '" data-fd="' + k + '">📦 ' + App.esc(ag ? ag.nombre : "Agencia") + " · " + agsPend[k] + "</button>";
          }).join("") +
          (agsPend.moto ? '<button class="chip' + (filtroDesp === "moto" ? " active" : "") + '" data-fd="moto">🏍️ Motos · ' + agsPend.moto + "</button>" : "") +
          "</div>";
      }
      if (!pendFiltrado.length) {
        html += '<div class="empty" style="padding:14px"><p>🎉 Nada pendiente por despachar.</p></div>';
      } else {
        html += '<div class="list">';
        pendFiltrado.slice(0, 8).forEach(function (v) {
          var cli = App.cliente(v.clienteId);
          var e = v.entrega;
          var destino = e.tipo === "motorizado"
            ? "🏍️ " + ((App.motorizado(e.motorizadoId) || {}).nombre || "Moto")
            : "📦 " + ((App.agencia(e.agenciaId) || {}).nombre || "Agencia") +
            ((e.destinoCiudad || (cli && cli.ciudad)) ? " → " + App.esc(e.destinoCiudad || cli.ciudad) : "");
          var fv = v.fecha.slice(0, 10);
          var diasV = C.diasHasta(fv);
          var cuandoPill = fv === hoy
            ? '<span class="pill info">despachar mañana</span>'
            : (diasV <= -2 ? '<span class="pill danger">¡despachar YA · ' + (-diasV) + " días!</span>" : '<span class="pill warn">despachar HOY</span>');
          html += '<div class="row-item" data-desp="' + v.id + '">' +
            '<div class="row-main"><div class="row-title wrap">' + App.esc(cli ? cli.nombre : "Cliente casual") + " " + cuandoPill + "</div>" +
            '<div class="row-sub">' + destino + " · compró " + App.fmt.fechaRel(fv) + " · " + App.esc(v.items.map(function (i) { return i.cant + "× " + i.nombre; }).join(", ")) + "</div></div>" +
            '<div class="row-end"><span class="row-amount num">' + App.fmt.usd0(C.ventaTotal(v)) + "</span>" +
            '<span class="pill ' + (App.envioEstado.pill[e.estado] || "") + '">' + (App.envioEstado.label[e.estado] || "") + "</span></div></div>";
        });
        html += "</div>";
      }
      html += "</div>";

      /* KPIs */
      var delta = C.deltaPct(totalMes, totalMesAnt);
      html += '<div class="grid-kpi">' +
        '<div class="kpi"><div class="kpi-label">Hoy</div><div class="kpi-value grad">' + App.fmt.usd0(totalHoy) + "</div>" +
        '<div class="kpi-foot">' + vHoy.length + " venta" + (vHoy.length === 1 ? "" : "s") + '</div><div class="kpi-spark">' + App.chart.spark(spark7, "var(--c1)") + "</div></div>" +
        '<div class="kpi"><div class="kpi-label">Este mes</div><div class="kpi-value">' + App.fmt.usd0(totalMes) + "</div>" +
        '<div class="kpi-foot">' + App.deltaPill(delta) + '<span>vs mes pasado</span></div></div>' +
        '<div class="kpi"><div class="kpi-label">Ticket promedio</div><div class="kpi-value">' + App.fmt.usd(ticket) + "</div>" +
        '<div class="kpi-foot">' + vMes.length + " ventas en el mes</div></div>" +
        '<div class="kpi" data-ir="envios" style="cursor:pointer"><div class="kpi-label">Por enviar</div><div class="kpi-value">' + pendEnvio.length + "</div>" +
        '<div class="kpi-foot">pedidos pendientes</div></div>' +
        "</div>";

      /* gráfica 30 días */
      html += '<div class="card"><div class="card-head"><h2>📈 Ventas - Últimos 30 días</h2></div><div class="chart-box" id="ch-30d"></div></div>';

      /* mosaico en dos columnas: cada tarjeta mide su contenido (sin huecos) */
      var colIzq = "", colDer = "";
      colIzq += '<div class="card"><div class="card-head"><h2>💳 Cómo te pagan</h2><span class="pill">este mes</span></div><div class="chart-box" id="ch-metodo"></div></div>';
      colDer += '<div class="card"><div class="card-head"><h2>🏬 Por tienda</h2><span class="pill">este mes</span></div><div class="chart-box" id="ch-tienda"></div><div class="legend" id="lg-tienda"></div></div>';

      var top = C.topProductos(vMes, 5);
      var cardTop = '<div class="card"><div class="card-head"><h2>🏆 Top productos</h2><span class="pill">este mes</span></div>';
      if (!top.length) cardTop += '<div class="empty"><p>Aún no hay ventas este mes</p></div>';
      else {
        cardTop += App.hbars(top.map(function (t) {
          var p = App.prod(t.productoId);
          var ixT = (App.db.settings.tiendas || []).map(function (x) { return x.id; }).indexOf(p ? p.tienda : "");
          return { label: (p ? p.emoji + " " : "") + t.nombre, valor: t.usd, color: "var(--c" + ((Math.max(ixT, 0) % 5) + 1) + ")" };
        }));
        cardTop += '<div class="chart-note">Barra = ingresos del mes, con el color de su tienda.</div>';
      }
      cardTop += "</div>";
      colDer += cardTop;

      /* tasa + caja Bs (solo súper) - SIEMPRE arriba de las columnas: es lo primero del día */
      if (App.auth.esSuper()) {
        var caja = C.cajaBs();
        var tasas = C.tasaHoy();
        var cardTasa = '<div class="card lift" data-ir="finanzas" style="cursor:pointer"><div class="card-head"><h2>💱 Tasa del día</h2><span class="pill tint">BCV</span></div>' +
          '<div class="flex wrap" style="gap:18px">' +
          '<div><div class="eyebrow">Euro (cobras con esta)</div><div class="kpi-value num" style="font-size:clamp(18px,6vw,24px)">' + App.fmt.num(tasas.eur) + " Bs</div></div>" +
          '<div><div class="eyebrow">Dólar</div><div class="kpi-value num" style="font-size:clamp(18px,6vw,24px)">' + App.fmt.num(tasas.usd) + " Bs</div></div></div>" +
          '<div class="chart-note">Actualizada: ' + App.fmt.fechaRel(tasas.fecha) + " · toca para gestionar</div></div>";
        var cardCaja = '<div class="card lift" data-ir="finanzas" style="cursor:pointer"><div class="card-head"><h2>💵 Caja en bolívares</h2></div>' +
          '<div class="kpi-value num" style="font-size:clamp(18px,6vw,24px)">' + App.fmt.bs(caja.saldoBs) + "</div>" +
          '<div class="kpi-foot"><span>≈ ' + App.fmt.usd(caja.valorHoyUsd) + " hoy</span>" +
          (caja.perdidaUsd > 0.5 ? '<span class="stat-delta down">▼ ' + App.fmt.usd(caja.perdidaUsd) + " por devaluación</span>" : "") +
          "</div></div>";
        colIzq = cardTasa + colIzq;
        colDer = cardCaja + colDer;
      }

      html += '<div class="dash-cols section-gap"><div class="dash-col">' + colIzq + '</div><div class="dash-col">' + colDer + "</div></div>";

      html += "</div>";
      el.innerHTML = html;

      /* gráficas */
      App.chart.linea(App.$("#ch-30d"), {
        alto: 200,
        series: [{
          nombre: "Ventas", color: "var(--c1)",
          puntos: serie30.map(function (d) {
            return { label: App.fromISO(d.fecha).getDate() + "", labelLargo: App.fmt.fecha(d.fecha), y: d.total };
          })
        }]
      });

      var porMetodo = C.porMetodo(vMes);
      var METODOS = [["Zelle", "var(--c2)"], ["Bolívares", "var(--c4)"], ["Efectivo", "var(--c3)"], ["Cripto (USDT)", "var(--c5)"], ["Otros", "var(--ink-3)"]];
      App.chart.dona(App.$("#ch-metodo"), {
        centro: "este mes",
        data: METODOS.map(function (m) {
          return { label: m[0], valor: Math.round(porMetodo[m[0]] || 0), color: m[1] };
        }),
        alClick: function (d) {
          var lista = vMes.filter(function (v) {
            if (v.pagos && v.pagos.length) return v.pagos.some(function (p) { return C.metodoGrupo(p.metodo) === d.label; });
            return C.metodoGrupo(v.metodoPago) === d.label;
          });
          sheetVentasLista("💳 " + d.label + " - este mes", lista);
        }
      });

      var porTienda = C.porTienda(vMes);
      App.chart.barras(App.$("#ch-tienda"), {
        alto: 190,
        data: (App.db.settings.tiendas || []).map(function (t, i) {
          return { label: t.corto || t.nombre, tid: t.id, valor: Math.round(porTienda[t.id] || 0), color: "var(--c" + ((i % 5) + 1) + ")" };
        }),
        alClick: function (d) {
          var lista = vMes.filter(function (v) {
            return v.items.some(function (it) {
              var p = App.prod(it.productoId);
              return p && p.tienda === d.tid;
            });
          });
          sheetVentasLista("🏬 " + d.label + " - este mes", lista);
        }
      });
      App.$("#lg-tienda").innerHTML = (App.db.settings.tiendas || []).map(function (t, i) {
        return '<span class="legend-item"><span class="legend-dot" style="background:var(--c' + ((i % 5) + 1) + ')"></span>' + App.esc(t.nombre) + "</span>";
      }).join("");

      /* navegación de tarjetas */
      App.$$("[data-ir]", el).forEach(function (x) {
        x.addEventListener("click", function () { location.hash = "#/" + x.dataset.ir; });
      });
      App.$$("[data-tarea]", el).forEach(function (x) {
        x.addEventListener("click", function () {
          var t = tareas[+x.dataset.tarea];
          if (t.ventaId) {
            var v = App.db.ventas.filter(function (q) { return q.id === t.ventaId; })[0];
            if (v) App.abrirVenta(v);
          } else if (t.ir) location.hash = "#/" + t.ir;
        });
      });
      App.$$("[data-fd]", el).forEach(function (b) {
        b.addEventListener("click", function () { filtroDesp = b.dataset.fd || null; App.render(); });
      });
      var bResp = App.$("[data-respaldo]", el);
      if (bResp) bResp.addEventListener("click", function () {
        App.descargarRespaldo();
        App.toast("Respaldo descargado 💾 - guárdalo en un lugar seguro");
        App.render();
      });
      var bCierre = App.$("[data-cierre]", el);
      if (bCierre) bCierre.addEventListener("click", function () { App.abrirCierre(); });
      App.$$("[data-desp]", el).forEach(function (r) {
        r.addEventListener("click", function () {
          var v = App.db.ventas.filter(function (q) { return q.id === r.dataset.desp; })[0];
          if (v) App.abrirVenta(v);
        });
      });
  }

  /* lista de ventas en sheet (drill-down de las gráficas) */
  function sheetVentasLista(titulo, lista) {
    lista = lista.slice().sort(function (a, b) { return a.fecha > b.fecha ? -1 : 1; });
    var total = App.calc.sum(lista);
    var cuerpo = !lista.length ? '<div class="empty"><p>Sin ventas en este grupo.</p></div>' :
      '<div class="spread"><span class="muted small">' + lista.length + ' venta' + (lista.length === 1 ? "" : "s") + '</span><b class="num">' + App.fmt.usd(total) + "</b></div>" +
      '<div class="list">' + lista.map(function (v) {
        var cli = App.cliente(v.clienteId);
        return '<div class="row-item" data-dv="' + v.id + '"><div class="row-main">' +
          '<div class="row-title" style="font-size:13px">' + App.esc(cli ? cli.nombre : "Cliente casual") + "</div>" +
          '<div class="row-sub">' + App.fmt.fechaRel(v.fecha.slice(0, 10)) + " · " + App.esc(v.metodoPago) + " · " +
          App.esc(v.items.map(function (i) { return i.cant + "× " + i.nombre; }).join(", ")) + "</div></div>" +
          '<span class="row-amount num">' + App.fmt.usd(App.calc.ventaTotal(v)) + "</span>" + App.icon("chevR") + "</div>";
      }).join("") + "</div>" +
      '<div class="chart-note">Toca una venta para ver su detalle.</div>';
    var s = App.sheet({ titulo: titulo, cuerpo: cuerpo });
    App.delegar(s.el, "click", "[data-dv]", function (e, t) {
      var v = App.db.ventas.filter(function (x) { return x.id === t.dataset.dv; })[0];
      if (v) App.abrirVenta(v);
    });
  }
})();
