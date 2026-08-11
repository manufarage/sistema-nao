/* ============================================================
   dashboard.js - Inicio: qué hay que hacer hoy + cómo va el mes
   ============================================================ */
window.App = window.App || {};

(function () {
  "use strict";
  var C = null;
  var filtroDesp = null; // filtro por agencia del bloque "Para despachar"

  /* Resumen del lado agente de compras. Se pinta solo si el módulo está
     cargado y el usuario tiene permiso; un socio de tienda no lo ve. */
  function tarjetaImportaciones() {
    if (!App.modImportaciones || !App.auth.puede("importaciones")) return "";
    var imps = (App.db.importaciones || []).filter(function (i) { return i.estado !== "cerrada"; });
    var avisos = 0;
    if (App.modTareas && typeof App.modTareas.pendientes === "function") {
      try { avisos = App.modTareas.pendientes() || 0; } catch (e) { avisos = 0; }
    }
    if (!imps.length && !avisos) return "";

    var porCobrar = 0, porPagar = 0, ganancia = 0;
    if (typeof App.modImportaciones.saldos === "function") {
      imps.forEach(function (i) {
        var sa = App.modImportaciones.saldos(i);
        if (!sa) return;
        porCobrar += Math.max(0, +sa.saldoCliente || 0);
        porPagar += Math.max(0, +sa.saldoFabrica || 0);
        ganancia += +sa.miComision || 0;
      });
    }

    return '<div class="card section-gap"><div class="card-head"><h2>' + App.icon("orden") +
      " Importaciones</h2>" +
      (avisos ? '<button class="btn sm ghost" data-ir="tareas">' + avisos + " por atender</button>" : "") +
      "</div>" +
      '<div class="grid-kpi" style="margin-bottom:0">' +
      '<div class="kpi" data-ir="importaciones" style="cursor:pointer"><div class="kpi-label">En curso</div>' +
      '<div class="kpi-value">' + imps.length + "</div></div>" +
      '<div class="kpi" data-ir="importaciones" style="cursor:pointer"><div class="kpi-label">Falta cobrar</div>' +
      '<div class="kpi-value num" style="color:var(--warn)">' + App.fmt.usd(porCobrar) + "</div></div>" +
      '<div class="kpi" data-ir="importaciones" style="cursor:pointer"><div class="kpi-label">Falta pagar a fábricas</div>' +
      '<div class="kpi-value num" style="color:var(--danger)">' + App.fmt.usd(porPagar) + "</div></div>" +
      '<div class="kpi" data-ir="importaciones" style="cursor:pointer"><div class="kpi-label">Ganancia comprometida</div>' +
      '<div class="kpi-value num" style="color:var(--ok)">' + App.fmt.usd(ganancia) + "</div></div>" +
      "</div></div>";
  }

  App.modDashboard = {
    id: "dashboard",
    titulo: "Inicio",
    icono: "inicio",
    render: function (el) {
      C = App.calc;
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

      /* resumen del negocio de agente de compras (solo quien tiene acceso) */
      html += tarjetaImportaciones();

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
        cardTop += App.hbars(top.map(function (t, i) {
          var p = App.prod(t.productoId);
          return { label: (p ? p.emoji + " " : "") + t.nombre, valor: t.usd, color: p && p.tienda === "evz" ? "var(--c2)" : "var(--c1)" };
        }));
        cardTop += '<div class="chart-note">Barra = ingresos del mes. Rosa = La Teacher, azul = En Vzla.</div>';
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
      App.$("#lg-tienda").innerHTML =
        '<span class="legend-item"><span class="legend-dot" style="background:var(--c1)"></span>Los Juguetes de la Teacher</span>' +
        '<span class="legend-item"><span class="legend-dot" style="background:var(--c2)"></span>En Vzla Te Lo Consigo</span>';

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
  };

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
