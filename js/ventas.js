/* ============================================================
   ventas.js - listado, detalle, abonos y registro de venta nueva
   ============================================================ */
window.App = window.App || {};

(function () {
  "use strict";
  var C = function () { return App.calc; };
  var filtro = { periodo: "mes", canal: null, texto: "", apartados: false };
  var verN = 60; // cuántas filas del historial se muestran (botón "mostrar más")

  function ventasFiltradas() {
    var lista = App.db.ventas.slice();
    var hoy = App.hoyISO();
    if (filtro.periodo === "hoy") lista = lista.filter(function (v) { return v.fecha.slice(0, 10) === hoy; });
    else if (filtro.periodo === "7d") {
      var d7 = App.toISO(App.addDays(new Date(), -6));
      lista = lista.filter(function (v) { return v.fecha.slice(0, 10) >= d7; });
    } else if (filtro.periodo === "mes") {
      var r = App.mesRango(0);
      lista = lista.filter(function (v) { var f = v.fecha.slice(0, 10); return f >= r[0] && f <= r[1]; });
    }
    if (filtro.canal) lista = lista.filter(function (v) { return v.canal === filtro.canal; });
    if (filtro.apartados) lista = lista.filter(function (v) { return v.apartado && v.estadoPago !== "pagado"; });
    if (filtro.texto) {
      var t = filtro.texto.toLowerCase();
      lista = lista.filter(function (v) {
        var cli = App.cliente(v.clienteId);
        return (cli && cli.nombre.toLowerCase().indexOf(t) >= 0) ||
          v.items.some(function (i) { return i.nombre.toLowerCase().indexOf(t) >= 0; });
      });
    }
    return lista.sort(function (a, b) { return a.fecha > b.fecha ? -1 : 1; });
  }

  App.modVentas = {
    id: "ventas", titulo: "Ventas", icono: "ventas",
    render: function (el) {
      var html = '<div class="view">';
      html += '<div class="spread" style="margin-bottom:12px"><div><h1>🛒 Ventas</h1>' +
        '<div class="small muted" id="ventas-count"></div></div>' +
        '<button class="btn primary" id="btn-nueva">' + App.icon("plus") + " Nueva</button></div>";

      html += '<div class="search-bar" style="margin-bottom:10px">' + App.icon("buscar") +
        '<input class="input" id="bus-venta" placeholder="Buscar por cliente o producto…" value="' + App.esc(filtro.texto) + '"></div>';

      html += '<div class="seg" style="margin-bottom:10px">' +
        ["hoy", "7d", "mes", "todo"].map(function (p) {
          var lbl = { hoy: "Hoy", "7d": "7 días", mes: "Este mes", todo: "Todo" }[p];
          return '<button class="seg-btn' + (filtro.periodo === p ? " active" : "") + '" data-per="' + p + '">' + lbl + "</button>";
        }).join("") + "</div>";

      html += '<div class="chips scroll-x" style="margin-bottom:14px">' +
        '<button class="chip' + (!filtro.canal ? " active" : "") + '" data-canal="">Todos</button>' +
        App.db.settings.canales.map(function (c) {
          return '<button class="chip' + (filtro.canal === c ? " active" : "") + '" data-canal="' + App.esc(c) + '">' + App.esc(c) + "</button>";
        }).join("") +
        '<button class="chip' + (filtro.apartados ? " active" : "") + '" data-apart>🔖 Apartados</button>' +
        "</div>";

      html += '<div class="card"><div class="list" id="lista-ventas"></div><div id="ventas-mas"></div></div></div>';
      el.innerHTML = html;

      function filaVenta(v) {
        var cli = App.cliente(v.clienteId);
        var pagoPill = "";
        if (v.apartado && v.estadoPago !== "pagado") {
          pagoPill = ' <span class="pill tint">🔖 apartado · falta ' + App.fmt.usd0(C().ventaSaldo(v)) + "</span>";
        } else if (v.estadoPago === "abonado") {
          pagoPill = ' <span class="pill warn">abono · falta ' + App.fmt.usd0(C().ventaSaldo(v)) + "</span>";
        } else if (v.estadoPago !== "pagado") {
          pagoPill = ' <span class="pill danger">por cobrar</span>';
        }
        if ((v.devoluciones || []).length) pagoPill += ' <span class="pill">↩️ devolución</span>';
        var envPill = "";
        if (v.entrega) {
          var ee = v.entrega.estado;
          if (ee === "preparando" || ee === "por_llevar") envPill = ' <span class="pill info">por enviar</span>';
          else if (ee === "enviado") envPill = ' <span class="pill">en camino</span>';
          else if (ee === "por_retirar") envPill = ' <span class="pill tint">por retirar</span>';
        }
        return '<div class="row-item" data-venta="' + v.id + '">' +
          '<div class="avatar">' + App.esc(cli ? App.iniciales(cli.nombre) : "🛒") + "</div>" +
          '<div class="row-main"><div class="row-title wrap">' + App.esc(cli ? cli.nombre : "Cliente casual") + pagoPill + envPill + "</div>" +
          '<div class="row-sub">' + App.esc(v.items.map(function (i) { return i.cant + "× " + i.nombre; }).join(", ")) + "</div>" +
          '<div class="row-sub">' + App.fmt.hora(v.fecha) + " · " + App.esc(v.canal) + " · " + App.esc(v.metodoPago) + "</div></div>" +
          '<div class="row-end"><span class="row-amount num">' + App.fmt.usd(C().ventaTotal(v)) + "</span>" +
          (v.totalBs ? '<div class="small muted num">' + App.fmt.bs(v.totalBs) + "</div>" : "") + "</div></div>";
      }
      function pintarListaVentas() {
        var lista = ventasFiltradas();
        App.$("#ventas-count", el).textContent = lista.length + " venta" + (lista.length === 1 ? "" : "s") + " · " + App.fmt.usd(C().sum(lista));
        var cont = App.$("#lista-ventas", el);
        var masBox = App.$("#ventas-mas", el);
        if (!lista.length) {
          cont.innerHTML = '<div class="empty"><div class="big">🛍️</div><p>No hay ventas con esos filtros. Toca “Nueva” o el botón + para registrar la primera.</p></div>';
          masBox.innerHTML = "";
          return;
        }
        var h2 = "", fPrev = null, hoy = App.hoyISO();
        lista.slice(0, verN).forEach(function (v) {
          var f = v.fecha.slice(0, 10);
          if (f !== fPrev) {
            h2 += '<div class="fecha-sep">' + (f === hoy ? "Hoy" : App.esc(App.fmt.fechaLarga(f))) + "</div>";
            fPrev = f;
          }
          h2 += filaVenta(v);
        });
        cont.innerHTML = h2;
        masBox.innerHTML = lista.length > verN
          ? '<button class="btn ghost block" data-mas style="margin-top:8px">Mostrar más (' + (lista.length - verN) + " restantes)</button>"
          : "";
        var bm = App.$("[data-mas]", masBox);
        if (bm) bm.addEventListener("click", function () { verN += 60; pintarListaVentas(); });
      }
      pintarListaVentas();

      App.$("#btn-nueva").addEventListener("click", function () { App.modVentas.nueva(); });
      /* búsqueda fluida: solo repinta la lista, sin recargar la vista (el input no pierde el foco) */
      App.$("#bus-venta").addEventListener("input", function (e) {
        filtro.texto = e.target.value;
        verN = 60;
        pintarListaVentas();
      });
      App.$$("[data-per]", el).forEach(function (b) {
        b.addEventListener("click", function () { filtro.periodo = b.dataset.per; verN = 60; App.render(); });
      });
      App.$$("[data-canal]", el).forEach(function (b) {
        b.addEventListener("click", function () { filtro.canal = b.dataset.canal || null; verN = 60; App.render(); });
      });
      var bApart = App.$("[data-apart]", el);
      if (bApart) bApart.addEventListener("click", function () { filtro.apartados = !filtro.apartados; verN = 60; App.render(); });
      App.delegar(App.$("#lista-ventas"), "click", "[data-venta]", function (e, t) {
        var v = App.db.ventas.filter(function (x) { return x.id === t.dataset.venta; })[0];
        if (v) detalleVenta(v);
      });
    },
    nueva: function () { nuevaVenta(); }
  };

  /* abrir el detalle de una venta desde otros módulos (clientes, envíos, finanzas) */
  App.abrirVenta = function (v) { detalleVenta(v); };

  /* ---------- resumen WhatsApp de una venta ---------- */
  App.ventaResumenWA = function (v) {
    var cli = App.cliente(v.clienteId);
    var lineas = ["🧾 *Resumen de tu pedido*", ""];
    v.items.forEach(function (i) {
      lineas.push("• " + i.cant + "× " + i.nombre + (i.talla ? " (talla " + i.talla + ")" : "") + " - $" + (i.cant * i.precioUnit).toFixed(2));
    });
    lineas.push("");
    lineas.push("💵 Total: *" + App.fmt.usd(C().ventaTotal(v)) + "*" + (v.totalBs ? " / " + App.fmt.bs(v.totalBs) : ""));
    if (v.entrega && v.entrega.tipo === "agencia") {
      var ag = App.agencia(v.entrega.agenciaId);
      lineas.push("📦 Envío por " + (ag ? ag.nombre : "agencia"));
      if (v.entrega.guia && v.entrega.guia.numero) lineas.push("🔎 Guía: *" + v.entrega.guia.numero + "*");
    }
    if (v.entrega && v.entrega.tipo === "motorizado") {
      lineas.push("🏍️ Entrega con motorizado" +
        ((v.entrega.cobroEnvio || 0) > 0 ? " - delivery: $" + (+v.entrega.cobroEnvio).toFixed(2) + " (se paga por adelantado)" : ""));
    }
    lineas.push("");
    lineas.push("¡Gracias por tu compra" + (cli ? ", " + cli.nombre.split(" ")[0] : "") + "! 💕");
    return lineas.join("\n");
  };

  /* ---------- detalle ---------- */
  function detalleVenta(v) {
    var cli = App.cliente(v.clienteId);
    var e = v.entrega || {};
    var esSuper = App.auth.esSuper();

    var cuerpo = '<div class="flex wrap" style="gap:6px">' +
      '<span class="pill">' + App.fmt.fecha(v.fecha.slice(0, 10)) + " " + App.fmt.hora(v.fecha) + "</span>" +
      '<span class="pill info">' + App.esc(v.canal) + "</span>" +
      '<span class="pill">' + App.esc((App.usuario(v.vendedorId) || {}).nombre || "-") + "</span>" +
      (v.promoId ? '<span class="pill tint">🏷️ ' + App.esc((App.promo(v.promoId) || {}).nombre || "Promo") + "</span>" : "") +
      "</div>";

    if (cli) {
      cuerpo += '<div class="row-item" data-ver-cli><div class="avatar">' + App.iniciales(cli.nombre) + "</div>" +
        '<div class="row-main"><div class="row-title">' + App.esc(cli.nombre) + "</div>" +
        '<div class="row-sub">' + App.esc((cli.ciudad || "") + (cli.estado ? ", " + cli.estado : "")) + " · toca para ver su ficha</div></div>" +
        '<a class="btn icon wa" target="_blank" rel="noopener" href="' + App.waLink(cli.telefono) + '">' + App.icon("wa") + "</a></div>";
    }

    cuerpo += '<div class="table-wrap"><table class="mini"><thead><tr><th>Producto</th><th class="num">Cant</th><th class="num">Precio</th><th class="num">Total</th></tr></thead><tbody>';
    v.items.forEach(function (i) {
      cuerpo += '<tr data-ver-prod="' + App.esc(i.productoId || "") + '" style="cursor:pointer"><td>' + App.esc(i.nombre) + (i.talla ? ' <span class="pill">' + App.esc(i.talla) + "</span>" : "") + "</td>" +
        '<td class="num">' + i.cant + '</td><td class="num">' + App.fmt.usd(i.precioUnit) + '</td><td class="num">' + App.fmt.usd(i.cant * i.precioUnit) + "</td></tr>";
    });
    cuerpo += "</tbody></table></div>";

    cuerpo += '<div class="spread"><span class="muted">Total</span><b class="num" style="font-size:17px">' + App.fmt.usd(C().ventaTotal(v)) + "</b></div>";
    if (v.totalBs) {
      cuerpo += '<div class="spread small muted"><span>Cobrado en Bs (tasa € ' + App.fmt.num(v.tasaEur) + ')</span><span class="num">' + App.fmt.bs(v.totalBs) + "</span></div>";
    }
    cuerpo += '<div class="spread small"><span class="muted">Método</span><span>' + App.esc(v.metodoPago) + "</span></div>";
    if (v.pagos && v.pagos.length > 1) {
      v.pagos.forEach(function (p) {
        cuerpo += '<div class="spread small muted"><span>· ' + App.esc(p.metodo) + '</span><span class="num">' + App.fmt.usd(p.montoUsd) +
          (App.esBs(p.metodo) && v.tasaEur ? " (" + App.fmt.bs(p.montoUsd * v.tasaEur) + ")" : "") + "</span></div>";
      });
    }
    if (esSuper) {
      cuerpo += '<div class="spread small"><span class="muted">Costo mercancía / ganancia</span><span class="num">' +
        App.fmt.usd(C().ventaCosto(v)) + " / <b>" + App.fmt.usd(C().ventaTotal(v) - C().ventaCosto(v)) + "</b></span></div>";
      if (!v.promoId) {
        var difLista = 0;
        v.items.forEach(function (i) {
          var lista = i.precioLista != null ? i.precioLista : (App.prod(i.productoId) || {}).precio;
          if (lista != null && i.precioUnit < lista - 0.009) difLista += (lista - i.precioUnit) * i.cant;
        });
        if (difLista > 0.009) {
          cuerpo += '<div class="spread small"><span class="muted">⚠️ Vendida por debajo del precio de lista</span>' +
            '<span class="num" style="color:var(--warn);font-weight:700">−' + App.fmt.usd(difLista) + "</span></div>";
        }
      }
    }

    /* pago */
    var saldo = C().ventaSaldo(v);
    cuerpo += '<hr class="divider"><div class="spread"><h3>💵 Pago</h3>' +
      (v.apartado && v.estadoPago !== "pagado" ? '<span class="pill tint">🔖 Apartado · falta ' + App.fmt.usd(saldo) + "</span>" :
        v.estadoPago === "pagado" ? '<span class="pill ok">✓ Pagado</span>' :
          v.estadoPago === "abonado" ? '<span class="pill warn">Abonado · falta ' + App.fmt.usd(saldo) + "</span>" :
            '<span class="pill danger">Por cobrar ' + App.fmt.usd(saldo) + "</span>") + "</div>";
    if ((v.abonos || []).length) {
      cuerpo += '<div class="list">' + v.abonos.map(function (a, ai) {
        return '<div class="row-item static"><div class="row-main"><div class="row-sub">Abono · ' + App.fmt.fecha(a.fecha) +
          (a.metodo ? " · " + App.esc(a.metodo) : "") + '</div></div>' +
          '<span class="num small" style="margin-right:4px;font-weight:700">' + App.fmt.usd(a.montoUsd) + "</span>" +
          '<button class="btn icon" data-ed-abono="' + ai + '" style="width:36px;height:36px">' + App.icon("editar") + "</button>" +
          '<button class="btn icon" data-del-abono="' + ai + '" style="width:36px;height:36px">' + App.icon("x") + "</button></div>";
      }).join("") + "</div>";
    }
    if (v.estadoPago !== "pagado") {
      cuerpo += '<div class="flex" style="margin-top:8px"><button class="btn sm" data-abono>+ Registrar abono</button>' +
        '<button class="btn sm ok" data-pagado>Marcar pagado</button></div>';
    }
    if ((v.devoluciones || []).length) {
      cuerpo += '<div class="list" style="margin-top:6px">' + v.devoluciones.map(function (d) {
        return '<div class="row-item static"><div class="thumb">↩️</div><div class="row-main">' +
          '<div class="row-sub">Devolución · ' + App.fmt.fecha(d.fecha) + " · " +
          App.esc((d.items || []).map(function (i) { return i.cant + "× " + i.nombre; }).join(", ")) +
          (d.motivo ? " · " + App.esc(d.motivo) : "") + (d.metodo ? " · reintegro por " + App.esc(d.metodo) : "") + "</div></div>" +
          '<span class="num small" style="font-weight:700;color:var(--danger)">−' + App.fmt.usd(d.montoUsd) + "</span></div>";
      }).join("") + "</div>";
    }

    /* entrega */
    var lblEstado = App.envioEstado.label[e.estado] || e.estado || "";
    var clsEstado = App.envioEstado.pill[e.estado] || "";
    cuerpo += '<hr class="divider"><div class="spread"><h3>🚚 Entrega</h3>';
    if (e.tipo === "retiro") {
      cuerpo += '<span class="pill ' + (e.estado === "por_retirar" ? "tint" : "") + '">🏪 ' +
        (e.estado === "por_retirar"
          ? "Retira " + (e.fechaRetiro ? App.fmt.fechaRel(e.fechaRetiro) : "pronto") + (e.horaRetiro ? " · " + e.horaRetiro : "")
          : "Retiro en tienda") + "</span></div>";
    } else if (e.tipo === "motorizado") {
      cuerpo += '<span class="pill ' + clsEstado + '">🏍️ ' + App.esc((App.motorizado(e.motorizadoId) || {}).nombre || "Motorizado") + " · " + lblEstado + "</span></div>" +
        '<div class="small muted">Carrera: ' + App.fmt.usd(e.costoEnvio || 0) +
        (e.cobroEnvio
          ? " · delivery al cliente: " + App.fmt.usd(e.cobroEnvio) +
          (e.deliveryPagado === false ? ' · <b style="color:var(--danger)">por cobrar</b>' : " · pagado ✓")
          : " · lo asume la tienda") + "</div>";
    } else if (e.tipo === "agencia") {
      var ag = App.agencia(e.agenciaId);
      cuerpo += '<span class="pill ' + clsEstado + '">📦 ' + App.esc(ag ? ag.nombre : "Agencia") + " · " + lblEstado + "</span></div>";
      if (e.guia && e.guia.numero) {
        cuerpo += '<div class="row-item static">' +
          (e.guia.foto ? '<img src="' + App.esc(e.guia.foto) + '" alt="guía" class="thumb" data-foto-guia style="cursor:zoom-in">' : '<div class="thumb">🧾</div>') +
          '<div class="row-main"><div class="row-title num">' + App.esc(e.guia.numero) + '</div><div class="row-sub">Guía · ' + App.fmt.fecha(e.guia.fecha) + "</div></div>" +
          '<button class="btn icon" data-copiar-guia>' + App.icon("copiar") + "</button></div>";
      } else {
        cuerpo += '<div class="small muted">Sin guía todavía - se carga al despachar en Envíos.</div>';
      }
    } else cuerpo += "</div>";

    var lblAvanzar = e.estado === "preparando" ? "✓ Pedido armado"
      : e.estado === "por_llevar" ? (e.tipo === "agencia" ? "Ir a despachar" : "✓ Entregado")
        : e.estado === "por_retirar" ? "✓ Retirado" : "Marcar entregado";
    var s = App.sheet({
      titulo: "🧾 Venta",
      cuerpo: cuerpo,
      pie: '<button class="btn" data-wa-res>' + App.icon("wa") + ' Resumen</button>' +
        (e.estado && e.estado !== "entregado" ? '<button class="btn primary" data-avanzar>' + lblAvanzar + "</button>" : "") +
        '<button class="btn" data-devolver style="flex:0 0 auto" title="Devolución / cambio">↩️</button>' +
        '<button class="btn" data-editar-v style="flex:0 0 auto" title="Editar venta">' + App.icon("editar") + "</button>" +
        '<button class="btn danger" data-borrar style="flex:0 0 auto">' + App.icon("basura") + "</button>"
    });

    var q = function (sel) { return App.$(sel, s.el); };
    if (q("[data-abono]")) q("[data-abono]").addEventListener("click", function () {
      abonoSheet(v, function () { s.cerrar(); detalleVenta(v); });
    });
    q("[data-editar-v]").addEventListener("click", function () { s.cerrar(); nuevaVenta(v); });
    q("[data-devolver]").addEventListener("click", function () {
      devolucionSheet(v, function () { s.cerrar(); App.render(); detalleVenta(v); });
    });
    App.$$("[data-ed-abono]", s.el).forEach(function (b) {
      b.addEventListener("click", function () {
        abonoSheet(v, function () { s.cerrar(); detalleVenta(v); }, v.abonos[+b.dataset.edAbono]);
      });
    });
    App.$$("[data-del-abono]", s.el).forEach(function (b) {
      b.addEventListener("click", function () {
        App.confirmar("¿Eliminar este abono?", { peligro: true, accion: "Eliminar" }).then(function (si) {
          if (!si) return;
          var abDel = v.abonos[+b.dataset.delAbono];
          if (abDel) App.audit("abono_eliminado", App.fmt.usd(abDel.montoUsd) + (abDel.metodo ? " · " + abDel.metodo : ""));
          v.abonos.splice(+b.dataset.delAbono, 1);
          v.estadoPago = v.abonos.length ? "abonado" : "pendiente";
          if (C().ventaSaldo(v) <= 0.01 && v.abonos.length) v.estadoPago = "pagado";
          App.save(); App.toast("Abono eliminado");
          s.cerrar(); detalleVenta(v);
        });
      });
    });
    if (q("[data-pagado]")) q("[data-pagado]").addEventListener("click", function () {
      /* el saldo restante entra como abono de hoy - así el cierre de caja lo capta */
      var saldoM = C().ventaSaldo(v);
      if (saldoM > 0) {
        v.abonos = v.abonos || [];
        v.abonos.push({ fecha: App.hoyISO(), montoUsd: Math.round(saldoM * 100) / 100, metodo: v.metodoPago, auto: true });
      }
      v.estadoPago = "pagado";
      App.save(); App.toast("Venta marcada como pagada");
      s.cerrar(); App.render();
    });
    if (q("[data-copiar-guia]")) q("[data-copiar-guia]").addEventListener("click", function () {
      App.copiar(e.guia.numero, "Número de guía copiado");
    });
    if (q("[data-foto-guia]")) q("[data-foto-guia]").addEventListener("click", function () {
      App.sheet({ titulo: "🧾 Guía", cuerpo: '<img src="' + App.esc(e.guia.foto) + '" style="width:100%;border-radius:14px">' });
    });
    q("[data-wa-res]").addEventListener("click", function () {
      App.copiar(App.ventaResumenWA(v), "Resumen copiado - pégalo en WhatsApp");
    });
    if (q("[data-avanzar]")) q("[data-avanzar]").addEventListener("click", function () {
      if (e.estado === "preparando") { e.estado = "por_llevar"; App.save(); App.toast("Pedido armado - listo para salir 🚚"); s.cerrar(); App.render(); }
      else if (e.estado === "por_llevar" && e.tipo === "agencia") { s.cerrar(); location.hash = "#/envios"; }
      else { e.estado = "entregado"; App.save(); App.toast("Entrega completada 🎉"); s.cerrar(); App.render(); }
    });
    if (q("[data-ver-cli]")) q("[data-ver-cli]").addEventListener("click", function (ev) {
      if (ev.target.closest("a")) return;
      if (App.abrirCliente) App.abrirCliente(cli);
    });
    App.delegar(s.el, "click", "[data-ver-prod]", function (ev, tr) {
      var p = App.prod(tr.dataset.verProd);
      if (p && App.abrirProducto) App.abrirProducto(p);
    });
    q("[data-borrar]").addEventListener("click", function () {
      App.confirmar("¿Eliminar esta venta? El stock de sus productos se repone.", { peligro: true, accion: "Eliminar" }).then(function (si) {
        if (!si) return;
        var cliDel = App.cliente(v.clienteId);
        App.audit("venta_eliminada", App.fmt.usd(C().ventaTotal(v)) + " · " + (cliDel ? cliDel.nombre : "cliente casual") + " · del " + App.fmt.fecha(v.fecha.slice(0, 10)));
        C().descontarStock(v, -1);
        App.db.ventas = App.db.ventas.filter(function (x) { return x.id !== v.id; });
        App.save(); App.toast("Venta eliminada");
        s.cerrar(); App.render();
      });
    });
  }

  /* ---------- devoluciones / cambios ---------- */
  function devueltasPrevias(v, productoId, talla) {
    var n = 0;
    (v.devoluciones || []).forEach(function (d) {
      (d.items || []).forEach(function (i) {
        if (i.productoId === productoId && (i.talla || null) === (talla || null)) n += i.cant;
      });
    });
    return n;
  }
  function devolucionSheet(v, done) {
    var lineas = v.items.map(function (it) {
      return {
        productoId: it.productoId, nombre: it.nombre, talla: it.talla || null,
        precioUnit: it.precioUnit, max: it.cant - devueltasPrevias(v, it.productoId, it.talla), cant: 0
      };
    }).filter(function (l) { return l.max > 0; });
    if (!lineas.length) { App.toast("Ya se devolvió todo lo de esta venta", "err"); return; }

    var s = App.sheet({
      titulo: "↩️ Devolución / cambio",
      cuerpo: '<p class="small muted">Marca qué devuelve el cliente: el stock se repone solo y el reintegro resta en la contabilidad del día. ' +
        "Para un <b>cambio</b>: registra la devolución y luego agrega el producto nuevo con ✏️ Editar venta.</p>" +
        '<div class="list" id="dv-lineas" style="margin-top:8px"></div>' +
        '<div class="form-grid" style="margin-top:10px">' +
        '<div class="field"><label>Reintegro al cliente (USD)</label><input class="input num" id="dv-monto" type="number" step="0.01" min="0" value="0"></div>' +
        '<div class="field"><label>Método del reintegro</label><select class="select" id="dv-metodo">' +
        App.db.settings.metodosPago.map(function (m) { return "<option" + (m === v.metodoPago ? " selected" : "") + ">" + App.esc(m) + "</option>"; }).join("") +
        "</select></div>" +
        '<div class="field full"><label>Motivo</label><input class="input" id="dv-motivo" placeholder="Talla equivocada, defecto de fábrica…"></div></div>',
      pie: '<button class="btn primary" data-ok>Registrar devolución</button>'
    });

    function sugerirMonto() {
      var m = lineas.reduce(function (t, l) { return t + l.cant * l.precioUnit; }, 0);
      App.$("#dv-monto", s.el).value = m.toFixed(2);
    }
    function pintarLineas() {
      App.$("#dv-lineas", s.el).innerHTML = lineas.map(function (l, i) {
        return '<div class="row-item static"><div class="row-main">' +
          '<div class="row-title" style="font-size:13px">' + App.esc(l.nombre) + (l.talla ? ' <span class="pill">' + App.esc(l.talla) + "</span>" : "") + "</div>" +
          '<div class="row-sub">máximo devolvible: ' + l.max + " · " + App.fmt.usd(l.precioUnit) + " c/u</div></div>" +
          '<span class="stepper"><button data-dv-menos="' + i + '">−</button><span>' + l.cant + '</span><button data-dv-mas="' + i + '">+</button></span></div>';
      }).join("");
      App.$$("[data-dv-mas]", s.el).forEach(function (b) {
        b.addEventListener("click", function () {
          var l = lineas[+b.dataset.dvMas];
          if (l.cant < l.max) l.cant++;
          pintarLineas(); sugerirMonto();
        });
      });
      App.$$("[data-dv-menos]", s.el).forEach(function (b) {
        b.addEventListener("click", function () {
          var l = lineas[+b.dataset.dvMenos];
          if (l.cant > 0) l.cant--;
          pintarLineas(); sugerirMonto();
        });
      });
    }
    pintarLineas();

    App.$("[data-ok]", s.foot).addEventListener("click", function () {
      var devItems = lineas.filter(function (l) { return l.cant > 0; })
        .map(function (l) { return { productoId: l.productoId, nombre: l.nombre, talla: l.talla, cant: l.cant }; });
      if (!devItems.length) { App.toast("Marca al menos una unidad a devolver", "err"); return; }
      var monto = parseFloat(App.$("#dv-monto", s.el).value) || 0;
      v.devoluciones = v.devoluciones || [];
      v.devoluciones.push({
        fecha: App.hoyISO(), items: devItems,
        montoUsd: Math.round(monto * 100) / 100,
        metodo: App.$("#dv-metodo", s.el).value,
        motivo: App.$("#dv-motivo", s.el).value.trim()
      });
      App.calc.reponerItems(devItems, v.id, "devolucion");
      App.audit("devolucion", App.fmt.usd(monto) + " · " + devItems.map(function (i) { return i.cant + "× " + i.nombre; }).join(", "));
      App.save(); App.toast("Devolución registrada - stock repuesto ↩️");
      s.cerrar(); if (done) done();
    });
  }

  function abonoSheet(v, done, abonoEx) {
    var saldo = C().ventaSaldo(v) + (abonoEx ? abonoEx.montoUsd : 0);
    var s = App.sheet({
      titulo: abonoEx ? "💵 Editar abono" : "💵 Registrar abono",
      cuerpo: '<div class="form-grid">' +
        '<div class="field"><label>Monto (USD) - saldo: ' + App.fmt.usd(saldo) + '</label>' +
        '<input class="input num" id="in-abono" type="number" min="0.01" step="0.01" value="' + (abonoEx ? abonoEx.montoUsd : Math.max(0.01, saldo).toFixed(2)) + '"></div>' +
        '<div class="field"><label>Fecha</label><input class="input" id="in-abono-fecha" type="date" value="' + (abonoEx ? abonoEx.fecha : App.hoyISO()) + '"></div>' +
        '<div class="field full"><label>Método con el que pagó esta parte</label><select class="select" id="in-abono-metodo">' +
        App.db.settings.metodosPago.map(function (m) {
          var sel = (abonoEx && abonoEx.metodo === m) || (!abonoEx && v.metodoPago === m);
          return "<option" + (sel ? " selected" : "") + ">" + App.esc(m) + "</option>";
        }).join("") +
        "</select></div></div>",
      pie: '<button class="btn primary" data-ok>' + (abonoEx ? "Guardar cambios" : "Guardar abono") + "</button>"
    });
    App.$("[data-ok]", s.foot).addEventListener("click", function () {
      var m = parseFloat(App.$("#in-abono", s.el).value);
      if (!m || m <= 0) { App.toast("Monto inválido", "err"); return; }
      m = Math.round(m * 100) / 100;
      if (abonoEx) {
        App.audit("abono_editado", App.fmt.usd(abonoEx.montoUsd) + " → " + App.fmt.usd(m));
        abonoEx.montoUsd = m;
        abonoEx.fecha = App.$("#in-abono-fecha", s.el).value || App.hoyISO();
        abonoEx.metodo = App.$("#in-abono-metodo", s.el).value;
      } else {
        v.abonos = v.abonos || [];
        v.abonos.push({
          fecha: App.$("#in-abono-fecha", s.el).value || App.hoyISO(),
          montoUsd: m,
          metodo: App.$("#in-abono-metodo", s.el).value
        });
      }
      v.estadoPago = v.abonos.length ? "abonado" : "pendiente";
      if (C().ventaSaldo(v) <= 0.01) v.estadoPago = "pagado";
      App.save(); App.toast(v.estadoPago === "pagado" ? "¡Pago completado!" : "Abono guardado");
      s.cerrar(); if (done) done();
    });
  }

  /* ============================================================
     NUEVA VENTA
     ============================================================ */
  function nuevaVenta(orig) {
    var NV = orig ? {
      clienteId: orig.clienteId, casual: false,
      items: JSON.parse(JSON.stringify(orig.items)),
      descuento: +orig.descuento || 0,
      promoId: orig.promoId,
      canal: orig.canal,
      vendedorId: orig.vendedorId,
      metodoPago: orig.pagos && orig.pagos.length ? orig.pagos[0].metodo : orig.metodoPago,
      pagosExtra: orig.pagos && orig.pagos.length > 1 ? JSON.parse(JSON.stringify(orig.pagos.slice(1))) : [],
      apartado: orig.apartado || false,
      tasaEur: orig.tasaEur || App.db.settings.tasas.eur,
      fecha: orig.fecha.slice(0, 10),
      estadoPago: orig.estadoPago, abonoMonto: 0,
      entrega: JSON.parse(JSON.stringify(orig.entrega || { tipo: "retiro", estado: "entregado" }))
    } : {
      clienteId: null, casual: false,
      items: [], promoId: null,
      canal: "Instagram",
      vendedorId: App.auth.user.id,
      metodoPago: "Zelle", pagosExtra: [], apartado: false,
      tasaEur: App.db.settings.tasas.eur,
      fecha: App.hoyISO(),
      estadoPago: "pagado", abonoMonto: 0,
      entrega: { tipo: "retiro" }
    };
    /* pagos combinados: cuántos métodos quiera; el principal cubre el resto */
    function extrasTotal() {
      return NV.pagosExtra.reduce(function (t, p) { return t + Math.max(0, +p.montoUsd || 0); }, 0);
    }
    /* parte del total que se cobra en Bs (sumando todas las porciones en Bs) */
    function bsUsdNV() {
      var t = totalNV();
      var bs = 0;
      NV.pagosExtra.forEach(function (p) { if (App.esBs(p.metodo)) bs += Math.max(0, +p.montoUsd || 0); });
      if (App.esBs(NV.metodoPago)) bs += Math.max(0, t - extrasTotal());
      return Math.min(bs, t);
    }

    var s = App.sheet({
      titulo: orig ? "✏️ Editar venta" : "🛒 Nueva venta",
      cuerpo: '<div id="nv-cliente"></div><hr class="divider"><div id="nv-items"></div><hr class="divider">' +
        '<div id="nv-pago"></div><hr class="divider"><div id="nv-entrega"></div>',
      pie: '<div style="flex:1;align-self:center" id="nv-total" class="num"></div><button class="btn primary" data-guardar style="flex:2">' + (orig ? "Guardar cambios" : "Guardar venta") + "</button>"
    });

    var totalNV = function () {
      var t = NV.items.reduce(function (s, i) { return s + i.cant * i.precioUnit; }, 0);
      return Math.max(0, t - (+NV.descuento || 0));
    };

    function pintarTotal() {
      var t = totalNV();
      var bsUsd = bsUsdNV();
      var html = "<b style='font-size:16px'>" + App.fmt.usd(t) + "</b>";
      if ((+NV.descuento || 0) > 0) html += '<div class="small muted num">incluye descuento -' + App.fmt.usd(NV.descuento) + "</div>";
      if (bsUsd > 0) html += '<div class="small muted num">' + (bsUsd < t ? "parte en Bs: " : "") + App.fmt.bs(bsUsd * NV.tasaEur) + "</div>";
      if (NV.entrega && NV.entrega.tipo === "motorizado" && (NV.entrega.cobroEnvio || 0) > 0) {
        html += '<div class="small muted num">+ delivery ' + App.fmt.usd(NV.entrega.cobroEnvio) + " (aparte)</div>";
      }
      App.$("#nv-total", s.el).innerHTML = html;
    }

    /* --- cliente --- */
    function pintarCliente() {
      var box = App.$("#nv-cliente", s.el);
      var html = '<div class="spread"><h3>👤 Cliente</h3><button class="btn sm ghost" data-nuevo-cli>+ Nuevo</button></div>';
      if (NV.clienteId) {
        var cli = App.cliente(NV.clienteId);
        html += '<div class="row-item static"><div class="avatar">' + App.iniciales(cli.nombre) + "</div>" +
          '<div class="row-main"><div class="row-title">' + App.esc(cli.nombre) + '</div><div class="row-sub">' + App.esc((cli.ciudad || "") + (cli.estado ? ", " + cli.estado : "")) + "</div></div>" +
          '<button class="btn icon" data-quitar-cli>' + App.icon("x") + "</button></div>";
        /* nivel de fidelidad: se ofrece su descuento con un toque (nunca se aplica solo) */
        var nivCli = App.calc.nivelCliente(cli.id);
        if (nivCli && +nivCli.descuentoPct > 0) {
          html += (+NV.descuento || 0) > 0
            ? '<div class="small muted" style="margin-top:6px">' + nivCli.emoji + " Descuento " + App.esc(nivCli.nombre) + " aplicado: -" + App.fmt.usd(NV.descuento) + ' <button class="btn sm ghost" data-quitar-desc>Quitar</button></div>'
            : '<div class="alert-item" style="margin-top:6px"><span>' + nivCli.emoji + " Cliente <b>" + App.esc(nivCli.nombre) + "</b>: tiene " + nivCli.descuentoPct + "% de descuento</span>" +
            '<button class="btn sm primary" data-desc-nivel="' + nivCli.descuentoPct + '">Aplicar</button></div>';
        }
      } else {
        html += '<div class="search-bar">' + App.icon("buscar") + '<input class="input" id="nv-bus-cli" placeholder="Buscar cliente… (o deja vacío para venta casual)"></div>' +
          '<div class="list" id="nv-res-cli"></div>';
      }
      box.innerHTML = html;

      var busca = App.$("#nv-bus-cli", box);
      if (busca) {
        busca.addEventListener("input", function () {
          var t = busca.value.toLowerCase().trim();
          var res = App.$("#nv-res-cli", box);
          if (!t) { res.innerHTML = ""; return; }
          var hits = App.db.clientes.filter(function (c) {
            return c.nombre.toLowerCase().indexOf(t) >= 0 || (c.telefono || "").indexOf(t) >= 0;
          }).slice(0, 5);
          res.innerHTML = hits.map(function (c) {
            return '<div class="row-item" data-cli="' + c.id + '"><div class="avatar">' + App.iniciales(c.nombre) + "</div>" +
              '<div class="row-main"><div class="row-title">' + App.esc(c.nombre) + '</div><div class="row-sub">' + App.esc(c.ciudad || "") + "</div></div></div>";
          }).join("") || '<div class="empty"><p>Sin resultados - créalo con “+ Nuevo”.</p></div>';
          App.$$("[data-cli]", res).forEach(function (r) {
            r.addEventListener("click", function () { NV.clienteId = r.dataset.cli; pintarCliente(); });
          });
        });
      }
      var quitar = App.$("[data-quitar-cli]", box);
      if (quitar) quitar.addEventListener("click", function () { NV.clienteId = null; NV.descuento = 0; pintarCliente(); pintarTotal(); });
      var bDesc = App.$("[data-desc-nivel]", box);
      if (bDesc) bDesc.addEventListener("click", function () {
        var sub = NV.items.reduce(function (s, i) { return s + i.cant * i.precioUnit; }, 0);
        if (!sub) { App.toast("Agrega primero los productos y después aplica el descuento", "err"); return; }
        NV.descuento = Math.round(sub * (+bDesc.dataset.descNivel / 100) * 100) / 100;
        App.toast("Descuento aplicado: -" + App.fmt.usd(NV.descuento));
        pintarCliente(); pintarTotal();
      });
      var qDesc = App.$("[data-quitar-desc]", box);
      if (qDesc) qDesc.addEventListener("click", function () { NV.descuento = 0; pintarCliente(); pintarTotal(); });
      App.$("[data-nuevo-cli]", box).addEventListener("click", function () {
        App.clienteRapido(function (id) { NV.clienteId = id; pintarCliente(); });
      });
    }

    /* --- items --- */
    function pintarItems() {
      var box = App.$("#nv-items", s.el);
      /* candado de precios: si está activo, solo el súper puede modificar precios al vender */
      var puedeEditarPrecio = App.auth.esSuper() || App.db.settings.bloquearPrecioVendedor === false;
      var html = "<h3>🧸 Productos</h3>";

      var promosActivas = App.db.promos.filter(function (p) { return C().promoEstado(p) === "activa"; });
      if (promosActivas.length) {
        html += '<div class="chips" style="margin:8px 0 4px">' + promosActivas.map(function (p) {
          return '<button class="chip' + (NV.promoId === p.id ? " active" : "") + '" data-promo="' + p.id + '">🏷️ ' + App.esc(p.nombre) + " · " + App.fmt.usd0(p.precioPromo) + "</button>";
        }).join("") + "</div>";
      }

      html += '<div class="flex" style="margin-top:8px;gap:8px"><div class="search-bar" style="flex:1">' + App.icon("buscar") +
        '<input class="input" id="nv-bus-prod" placeholder="Busca, o escanea (pistola + Enter)…"></div>' +
        '<button class="btn icon" data-nv-scan title="Escanear código con la cámara" style="width:42px;height:42px;flex:none">' + App.icon("camara") + "</button></div>" +
        '<div class="list" id="nv-res-prod"></div>';

      if (NV.items.length) {
        html += '<div class="list" style="margin-top:8px">' + NV.items.map(function (i, ix) {
          var p = App.prod(i.productoId);
          var stockDisp = p ? (p.tallas && i.talla ? (p.tallas.filter(function (t) { return t.talla === i.talla; })[0] || {}).stock || 0 : C().prodStock(p)) : 0;
          var alerta = i.cant > stockDisp ? ' <span class="pill warn">stock: ' + stockDisp + "</span>" : "";
          var tallaSel = "";
          if (p && p.tallas && p.tallas.length) {
            tallaSel = '<select class="select" data-talla="' + ix + '" style="width:auto;padding:6px 28px 6px 9px">' +
              p.tallas.map(function (t) {
                return '<option value="' + App.esc(t.talla) + '"' + (i.talla === t.talla ? " selected" : "") + ">" + App.esc(t.talla) + " (" + t.stock + ")</option>";
              }).join("") + "</select>";
          }
          return '<div class="row-item static"><div class="thumb ' + (p ? App.esc(p.tienda) : "") + '">' + (p && p.fotos && p.fotos[0] ? '<img src="' + App.esc(p.fotos[0]) + '">' : (p ? p.emoji : "🛒")) + "</div>" +
            '<div class="row-main"><div class="row-title">' + App.esc(i.nombre) + alerta + "</div>" +
            '<div class="flex wrap" style="margin-top:4px;gap:6px">' +
            '<span class="stepper"><button data-menos="' + ix + '">−</button><span>' + i.cant + '</span><button data-mas="' + ix + '">+</button></span>' +
            tallaSel +
            (puedeEditarPrecio
              ? '<input class="input num" data-precio="' + ix + '" type="number" step="0.01" min="0" value="' + i.precioUnit + '" style="width:96px;padding:6px 9px">'
              : '<span class="pill num" title="Solo el súper usuario puede cambiar precios">🔒 ' + App.fmt.usd(i.precioUnit) + "</span>") +
            "</div></div>" +
            '<div class="row-end"><span class="row-amount num">' + App.fmt.usd(i.cant * i.precioUnit) + "</span>" +
            '<button class="btn icon" data-quitar-item="' + ix + '" style="width:36px;height:36px">' + App.icon("x") + "</button></div></div>";
        }).join("") + "</div>";
      } else {
        html += '<div class="empty" style="padding:18px"><p>Busca y toca un producto para agregarlo.</p></div>';
      }
      box.innerHTML = html;

      function agregarProducto(p) {
        var ya = (!p.tallas || !p.tallas.length)
          ? NV.items.filter(function (i) { return i.productoId === p.id; })[0] : null;
        if (ya) { ya.cant++; }
        else {
          var tallaIni = p.tallas && p.tallas.length ? (p.tallas.filter(function (t) { return +t.stock > 0; })[0] || p.tallas[0]).talla : null;
          NV.items.push({ productoId: p.id, nombre: p.nombre, cant: 1, precioUnit: App.calc.precioVenta(p), precioLista: App.calc.precioVenta(p), talla: tallaIni });
        }
        pintarItems(); pintarTotal();
      }

      var bus = App.$("#nv-bus-prod", box);
      bus.addEventListener("input", function () {
        var t = bus.value.toLowerCase().trim();
        var res = App.$("#nv-res-prod", box);
        if (!t) { res.innerHTML = ""; return; }
        var hits = App.db.productos.filter(function (p) {
          return p.nombre.toLowerCase().indexOf(t) >= 0 || (p.sku || "").toLowerCase().indexOf(t) >= 0 ||
            (p.codigoBarras && String(p.codigoBarras).indexOf(t) >= 0);
        }).slice(0, 6);
        res.innerHTML = hits.map(function (p) {
          return '<div class="row-item" data-add="' + App.esc(p.id) + '"><div class="thumb ' + App.esc(p.tienda) + '">' + (p.fotos && p.fotos[0] ? '<img src="' + App.esc(p.fotos[0]) + '">' : p.emoji) + "</div>" +
            '<div class="row-main"><div class="row-title">' + App.esc(p.nombre) + '</div><div class="row-sub">Stock: ' + C().prodStock(p) + " · " + App.fmt.usd(p.precio) + "</div></div>" +
            App.pillTienda(p.tienda) + "</div>";
        }).join("") || '<div class="empty"><p>Sin resultados</p></div>';
        App.$$("[data-add]", res).forEach(function (r) {
          r.addEventListener("click", function () { agregarProducto(App.prod(r.dataset.add)); });
        });
      });
      /* pistola lectora: escribe el código y manda Enter → se agrega solo */
      bus.addEventListener("keydown", function (ev) {
        if (ev.key !== "Enter") return;
        ev.preventDefault();
        var p = App.buscarPorCodigo(bus.value);
        if (p) {
          agregarProducto(p);
          App.toast("➕ " + p.nombre);
          bus.value = "";
          App.$("#nv-res-prod", box).innerHTML = "";
        }
      });
      var bScan = App.$("[data-nv-scan]", box);
      if (bScan) bScan.addEventListener("click", function () {
        App.escanear(function (codigo) {
          var p = App.buscarPorCodigo(codigo);
          if (p) { agregarProducto(p); App.toast("➕ " + p.nombre); }
          else App.toast("El código " + codigo + " no está asignado a ningún producto", "err");
        });
      });

      App.$$("[data-promo]", box).forEach(function (b) {
        b.addEventListener("click", function () {
          var promo = App.promo(b.dataset.promo);
          if (NV.promoId === promo.id) { NV.promoId = null; NV.items = []; }
          else {
            NV.promoId = promo.id;
            var sumaReg = promo.items.reduce(function (t, it) { var p = App.prod(it.productoId); return t + (p ? p.precio * it.cant : 0); }, 0);
            NV.items = promo.items.map(function (it) {
              var p = App.prod(it.productoId);
              var unit = sumaReg ? Math.round((promo.precioPromo * (p.precio * it.cant / sumaReg) / it.cant) * 100) / 100 : 0;
              var tallaIni = p.tallas && p.tallas.length ? (p.tallas.filter(function (t) { return +t.stock > 0; })[0] || p.tallas[0]).talla : null;
              return { productoId: p.id, nombre: p.nombre, cant: it.cant, precioUnit: unit, precioLista: p.precio, talla: tallaIni };
            });
          }
          pintarItems(); pintarTotal();
        });
      });
      App.$$("[data-mas]", box).forEach(function (b) { b.addEventListener("click", function () { NV.items[+b.dataset.mas].cant++; pintarItems(); pintarTotal(); }); });
      App.$$("[data-menos]", box).forEach(function (b) {
        b.addEventListener("click", function () {
          var i = NV.items[+b.dataset.menos];
          if (i.cant > 1) i.cant--; else NV.items.splice(+b.dataset.menos, 1);
          pintarItems(); pintarTotal();
        });
      });
      App.$$("[data-quitar-item]", box).forEach(function (b) { b.addEventListener("click", function () { NV.items.splice(+b.dataset.quitarItem, 1); pintarItems(); pintarTotal(); }); });
      App.$$("[data-precio]", box).forEach(function (inp) {
        inp.addEventListener("change", function () {
          NV.items[+inp.dataset.precio].precioUnit = Math.max(0, parseFloat(inp.value) || 0);
          pintarItems(); pintarTotal();
        });
      });
      App.$$("[data-talla]", box).forEach(function (sel) {
        sel.addEventListener("change", function () { NV.items[+sel.dataset.talla].talla = sel.value; pintarItems(); });
      });
    }

    /* --- pago --- */
    function pintarPago() {
      var box = App.$("#nv-pago", s.el);
      var html = "<h3>💳 Pago y canal</h3>" +
        '<div class="form-grid" style="margin-top:8px">' +
        '<div class="field"><label>Canal</label><select class="select" data-f="canal">' +
        App.db.settings.canales.map(function (c) { return "<option" + (NV.canal === c ? " selected" : "") + ">" + App.esc(c) + "</option>"; }).join("") + "</select></div>" +
        '<div class="field"><label>Vendedor</label><select class="select" data-f="vendedorId">' +
        App.db.usuarios.map(function (u) { return '<option value="' + u.id + '"' + (NV.vendedorId === u.id ? " selected" : "") + ">" + App.esc(u.nombre) + "</option>"; }).join("") + "</select></div>" +
        '<div class="field"><label>Método de pago</label><select class="select" data-f="metodoPago">' +
        App.db.settings.metodosPago.map(function (m) { return "<option" + (NV.metodoPago === m ? " selected" : "") + ">" + App.esc(m) + "</option>"; }).join("") + "</select></div>" +
        '<div class="field"><label>Fecha</label><input class="input" type="date" data-f="fecha" value="' + NV.fecha + '"></div>' +
        "</div>";

      /* pagos combinados: métodos ilimitados */
      var extSum = extrasTotal();
      html += '<div style="margin-top:10px">';
      NV.pagosExtra.forEach(function (p, i) {
        html += '<div class="flex" style="gap:8px;margin-bottom:6px;align-items:flex-end">' +
          '<div class="field" style="flex:2"><label>Método ' + (i + 2) + '</label><select class="select" data-px-met="' + i + '">' +
          App.db.settings.metodosPago.map(function (m) { return "<option" + (p.metodo === m ? " selected" : "") + ">" + App.esc(m) + "</option>"; }).join("") +
          "</select></div>" +
          '<div class="field" style="flex:1;min-width:96px"><label>Monto USD</label><input class="input num" data-px-monto="' + i + '" type="number" step="0.01" min="0" value="' + (p.montoUsd || "") + '"></div>' +
          '<button class="btn icon" data-px-quitar="' + i + '" style="width:38px;height:38px;flex:none">' + App.icon("x") + "</button></div>";
      });
      if (NV.pagosExtra.length) {
        html += '<div class="small muted" style="margin:2px 0 8px">' + App.esc(NV.metodoPago) + " (método 1) cubre el resto: <b>" +
          App.fmt.usd(Math.max(0, totalNV() - extSum)) + "</b>" +
          (extSum > totalNV() + 0.01 ? ' · <b style="color:var(--danger)">⚠️ los montos superan el total</b>' : "") + "</div>";
      }
      html += '<button class="btn sm ghost" data-px-add>➗ Agregar otro método de pago</button></div>';

      var bsUsd = bsUsdNV();
      if (bsUsd > 0) {
        html += '<div class="card" style="margin-top:10px;padding:12px 14px;background:var(--info-soft);border:none;box-shadow:none">' +
          '<div class="spread"><span class="small"><b>Cobro en bolívares</b> · tasa € del día</span>' +
          '<span class="flex" style="gap:6px"><input class="input num" data-f="tasaEur" type="number" step="0.01" value="' + NV.tasaEur + '" style="width:100px;padding:6px 9px">' +
          '<button class="btn icon" data-refrescar-tasa title="Buscar la tasa BCV de hoy" style="width:34px;height:34px;flex:none">' + App.icon("tasa") + "</button></span></div>" +
          '<div class="spread" style="margin-top:6px"><span class="muted small">' + (bsUsd < totalNV() ? "Parte en Bs (" + App.fmt.usd(bsUsd) + ")" : "Total a cobrar") + '</span><b class="num" style="font-size:17px">' + App.fmt.bs(bsUsd * NV.tasaEur) + "</b></div></div>";
      }

      html += '<div class="field" style="margin-top:10px"><label>Estado del pago</label><div class="seg">' +
        [["pagado", "Pagado"], ["abonado", "Abono"], ["pendiente", "Por cobrar"]].map(function (x) {
          return '<button class="seg-btn' + (NV.estadoPago === x[0] ? " active" : "") + '" data-pago="' + x[0] + '">' + x[1] + "</button>";
        }).join("") + "</div></div>";
      if (NV.estadoPago === "abonado") {
        html += '<div class="field" style="margin-top:8px"><label>Monto del abono (USD)</label>' +
          '<input class="input num" data-f="abonoMonto" type="number" step="0.01" min="0" value="' + (NV.abonoMonto || "") + '" placeholder="0.00"></div>';
      }
      if (NV.estadoPago !== "pagado") {
        html += '<label class="flex small" style="margin-top:10px;gap:9px;align-items:center;cursor:pointer">' +
          '<span class="switch"><input type="checkbox" data-f-apartado' + (NV.apartado ? " checked" : "") + "><i></i></span>" +
          "<span>🔖 <b>Apartado:</b> la mercancía queda reservada hasta completar el pago</span></label>";
      }
      box.innerHTML = html;

      App.$$("[data-f]", box).forEach(function (inp) {
        inp.addEventListener("change", function () {
          var k = inp.dataset.f;
          NV[k] = inp.type === "number" ? parseFloat(inp.value) || 0 : inp.value;
          if (k === "metodoPago" || k === "tasaEur") { pintarPago(); }
          pintarTotal();
        });
      });
      App.$$("[data-pago]", box).forEach(function (b) {
        b.addEventListener("click", function () { NV.estadoPago = b.dataset.pago; pintarPago(); });
      });
      var chApart = App.$("[data-f-apartado]", box);
      if (chApart) chApart.addEventListener("change", function () { NV.apartado = chApart.checked; });
      App.$("[data-px-add]", box).addEventListener("click", function () {
        NV.pagosExtra.push({ metodo: App.esBs(NV.metodoPago) ? "Zelle" : "Bolívares", montoUsd: 0 });
        pintarPago(); pintarTotal();
      });
      App.$$("[data-px-quitar]", box).forEach(function (b) {
        b.addEventListener("click", function () { NV.pagosExtra.splice(+b.dataset.pxQuitar, 1); pintarPago(); pintarTotal(); });
      });
      App.$$("[data-px-met]", box).forEach(function (sel) {
        sel.addEventListener("change", function () { NV.pagosExtra[+sel.dataset.pxMet].metodo = sel.value; pintarPago(); pintarTotal(); });
      });
      App.$$("[data-px-monto]", box).forEach(function (inp) {
        inp.addEventListener("change", function () { NV.pagosExtra[+inp.dataset.pxMonto].montoUsd = parseFloat(inp.value) || 0; pintarPago(); pintarTotal(); });
      });
      var brt = App.$("[data-refrescar-tasa]", box);
      if (brt) brt.addEventListener("click", function () {
        brt.disabled = true;
        App.actualizarTasas().then(function (r) {
          brt.disabled = false;
          if (r.eur || r.usd) {
            if (r.eur) NV.tasaEur = r.eur;
            App.toast("Tasa BCV de hoy cargada ✓");
            pintarPago(); pintarTotal();
          } else {
            App.toast("Sin conexión con la API - edítala manual", "err");
          }
        });
      });
    }

    /* --- entrega --- */
    function pintarEntrega() {
      var box = App.$("#nv-entrega", s.el);
      var e = NV.entrega;
      var html = "<h3>🚚 Entrega</h3>" +
        '<div class="seg" style="margin-top:8px">' +
        [["retiro", "🏪 Retiro"], ["motorizado", "🏍️ Motorizado"], ["agencia", "📦 Agencia"]].map(function (x) {
          return '<button class="seg-btn' + (e.tipo === x[0] ? " active" : "") + '" data-tipo="' + x[0] + '">' + x[1] + "</button>";
        }).join("") + "</div>";

      if (e.tipo === "retiro") {
        html += '<div class="form-grid" style="margin-top:10px">' +
          '<div class="field"><label>¿Qué día pasa a buscarlo? (vacío = ya se lo llevó)</label>' +
          '<input class="input" type="date" data-e="fechaRetiro" value="' + (e.fechaRetiro || "") + '"></div>' +
          '<div class="field"><label>Hora (opcional - te lo recuerda el sistema)</label>' +
          '<input class="input" type="time" data-e="horaRetiro" value="' + (e.horaRetiro || "") + '"></div></div>';
      } else if (e.tipo === "motorizado") {
        html += '<div class="form-grid" style="margin-top:10px">' +
          '<div class="field"><label>Motorizado</label><select class="select" data-e="motorizadoId">' +
          '<option value="">Elegir…</option>' +
          App.db.motorizados.map(function (m) { return '<option value="' + m.id + '"' + (e.motorizadoId === m.id ? " selected" : "") + ">" + App.esc(m.nombre) + "</option>"; }).join("") +
          "</select></div>" +
          '<div class="field"><label>Tarifa acordada (USD)</label><input class="input num" data-e="costoEnvio" type="number" step="0.5" min="0" value="' + (e.costoEnvio || "") + '" placeholder="3.00"></div>' +
          '<div class="field full"><label>¿Cuánto le cobras al cliente por el delivery? (0 = lo asume la tienda)</label>' +
          '<input class="input num" data-e="cobroEnvio" type="number" step="0.5" min="0" value="' + (e.cobroEnvio != null ? e.cobroEnvio : "") + '" placeholder="3.00"></div>' +
          ((e.cobroEnvio || 0) > 0
            ? '<div class="field full"><label>El delivery se paga por adelantado' +
            " (hoy ≈ " + App.fmt.bs(App.calc.bsDe(e.cobroEnvio)) + ' en Bs)</label><div class="seg">' +
            '<button class="seg-btn' + (e.deliveryPagado !== false ? " active" : "") + '" data-dp="1">✓ Ya lo pagó</button>' +
            '<button class="seg-btn' + (e.deliveryPagado === false ? " active" : "") + '" data-dp="0">Aún no</button></div></div>'
            : "") +
          "</div>";
      } else if (e.tipo === "agencia") {
        var cliSel = NV.clienteId ? App.cliente(NV.clienteId) : null;
        if (!e.destinoEstado && cliSel && cliSel.estado) {
          var eKey = Object.keys(App.VZLA).filter(function (k) { return k.toLowerCase() === cliSel.estado.toLowerCase(); })[0];
          if (eKey) { e.destinoEstado = eKey; e.destinoCiudad = cliSel.ciudad || ""; }
        }
        var ciudadesDest = App.VZLA[e.destinoEstado] || [];
        html += '<div class="form-grid" style="margin-top:10px">' +
          '<div class="field"><label>Agencia</label><select class="select" data-e="agenciaId">' +
          '<option value="">Elegir…</option>' +
          App.db.settings.agencias.map(function (a) { return '<option value="' + a.id + '"' + (e.agenciaId === a.id ? " selected" : "") + ">" + App.esc(a.nombre) + "</option>"; }).join("") +
          '<option value="__nueva">➕ Otra agencia…</option>' +
          "</select></div>" +
          '<div class="field full"><label>¿Quién paga el envío?</label><div class="seg">' +
          '<button class="seg-btn' + (e.pagoEnvio !== "tienda" ? " active" : "") + '" data-pe="destino">Cliente en destino</button>' +
          '<button class="seg-btn' + (e.pagoEnvio === "tienda" ? " active" : "") + '" data-pe="tienda">La tienda</button></div></div>' +
          (e.pagoEnvio === "tienda" ? '<div class="field"><label>Costo del envío (USD)</label><input class="input num" data-e="costoEnvio" type="number" step="0.5" min="0" value="' + (e.costoEnvio || "") + '"></div>' : "") +
          '<div class="field"><label>Estado destino</label><select class="select" data-e="destinoEstado"><option value="">Elegir…</option>' +
          Object.keys(App.VZLA).map(function (k) { return "<option" + (e.destinoEstado === k ? " selected" : "") + ">" + k + "</option>"; }).join("") +
          "</select></div>" +
          '<div class="field"><label>Ciudad destino</label>' +
          (e.ciudadLibre
            ? '<input class="input" data-e="destinoCiudad" value="' + App.esc(e.destinoCiudad || "") + '" placeholder="Escribe la ciudad">'
            : '<select class="select" data-e="destinoCiudad"><option value="">Elegir…</option>' +
            ciudadesDest.map(function (c) { return "<option" + (e.destinoCiudad === c ? " selected" : "") + ">" + App.esc(c) + "</option>"; }).join("") +
            (e.destinoCiudad && ciudadesDest.indexOf(e.destinoCiudad) < 0 ? "<option selected>" + App.esc(e.destinoCiudad) + "</option>" : "") +
            '<option value="__otra">✏️ Otra…</option></select>') +
          "</div>" +
          '<div class="field full"><label>Oficina o dirección de la agencia en destino (opcional)</label>' +
          '<input class="input" data-e="destinoDireccion" value="' + App.esc(e.destinoDireccion || "") + '" placeholder="Ej: MRW C.C. Costa Azul, local 12"></div>' +
          "</div>" +
          '<div class="small muted" style="margin-top:6px">La guía se carga en <b>Envíos</b> cuando despaches.</div>';
      }
      box.innerHTML = html;

      App.$$("[data-tipo]", box).forEach(function (b) {
        b.addEventListener("click", function () {
          var t = b.dataset.tipo;
          NV.entrega = t === "retiro" ? { tipo: "retiro", estado: "entregado" } :
            t === "motorizado" ? { tipo: "motorizado", motorizadoId: null, costoEnvio: 0, cobroEnvio: null, deliveryPagado: true, estado: "preparando", pagadoMotorizado: false } :
              { tipo: "agencia", agenciaId: null, pagoEnvio: "destino", costoEnvio: 0, cobroEnvio: 0, estado: "preparando", guia: null, destinoEstado: "", destinoCiudad: "", destinoDireccion: "", ciudadLibre: false };
          pintarEntrega();
        });
      });
      App.$$("[data-e]", box).forEach(function (inp) {
        inp.addEventListener("change", function () {
          var val = inp.type === "number" ? parseFloat(inp.value) || 0 : inp.value;
          if (inp.dataset.e === "agenciaId" && val === "__nueva") {
            agenciaRapida(function (id) { NV.entrega.agenciaId = id; pintarEntrega(); });
            return;
          }
          if (inp.dataset.e === "destinoCiudad" && val === "__otra") {
            NV.entrega.destinoCiudad = "";
            NV.entrega.ciudadLibre = true;
            pintarEntrega();
            return;
          }
          NV.entrega[inp.dataset.e] = val;
          if (inp.dataset.e === "destinoEstado") { NV.entrega.destinoCiudad = ""; NV.entrega.ciudadLibre = false; pintarEntrega(); }
          if (inp.dataset.e === "cobroEnvio") pintarEntrega();
          pintarTotal();
        });
      });
      App.$$("[data-dp]", box).forEach(function (b) {
        b.addEventListener("click", function () { NV.entrega.deliveryPagado = b.dataset.dp === "1"; pintarEntrega(); });
      });
      App.$$("[data-pe]", box).forEach(function (b) {
        b.addEventListener("click", function () { NV.entrega.pagoEnvio = b.dataset.pe; pintarEntrega(); });
      });
    }

    pintarCliente(); pintarItems(); pintarPago(); pintarEntrega(); pintarTotal();

    App.$("[data-guardar]", s.foot).addEventListener("click", function () {
      var totalAntes = orig ? App.calc.ventaTotal(orig) : null;
      if (!NV.items.length) { App.toast("Agrega al menos un producto", "err"); return; }
      if (NV.entrega.tipo === "motorizado" && !NV.entrega.motorizadoId) { App.toast("Elige el motorizado", "err"); return; }
      if (NV.entrega.tipo === "agencia" && !NV.entrega.agenciaId) { App.toast("Elige la agencia", "err"); return; }
      if (NV.estadoPago === "abonado" && (!NV.abonoMonto || NV.abonoMonto <= 0)) { App.toast("Indica el monto del abono", "err"); return; }
      var esApartado = NV.estadoPago !== "pagado" && !!NV.apartado;
      if (NV.entrega.tipo === "retiro") {
        if (NV.entrega.fechaRetiro || esApartado) {
          var yaRetirado = orig && orig.entrega && orig.entrega.tipo === "retiro" && orig.entrega.estado === "entregado";
          NV.entrega.estado = yaRetirado ? "entregado" : "por_retirar";
        } else NV.entrega.estado = "entregado";
      }

      var total = Math.round(totalNV() * 100) / 100;
      var extras = NV.pagosExtra
        .map(function (p) { return { metodo: p.metodo, montoUsd: Math.round((+p.montoUsd || 0) * 100) / 100 }; })
        .filter(function (p) { return p.montoUsd > 0; });
      var extSumV = extras.reduce(function (t, p) { return t + p.montoUsd; }, 0);
      if (extSumV > total + 0.01) { App.toast("Los métodos adicionales suman más que el total de la venta", "err"); return; }
      var pagos = null;
      if (extras.length) {
        pagos = [{ metodo: NV.metodoPago, montoUsd: Math.round((total - extSumV) * 100) / 100 }]
          .concat(extras)
          .filter(function (p) { return p.montoUsd > 0; });
        if (pagos.length < 2) pagos = null;
      }
      var bsUsd = Math.round(bsUsdNV() * 100) / 100;
      var ahora = new Date();
      var horaV = orig ? orig.fecha.slice(11, 16) : ("0" + ahora.getHours()).slice(-2) + ":" + ("0" + ahora.getMinutes()).slice(-2);
      if (!NV.fecha) NV.fecha = App.hoyISO(); /* fecha vacía rompería el guardado en el servidor */
      var venta = {
        id: orig ? orig.id : App.uid("v"),
        fecha: NV.fecha + "T" + horaV,
        canal: NV.canal, clienteId: NV.clienteId, vendedorId: NV.vendedorId,
        items: NV.items, promoId: NV.promoId, descuento: +NV.descuento || 0,
        metodoPago: pagos ? pagos.map(function (p) { return p.metodo; }).join(" + ") : NV.metodoPago,
        pagos: pagos, totalUsd: total,
        tasaEur: bsUsd > 0 ? NV.tasaEur : null,
        tasaUsd: bsUsd > 0 ? App.db.settings.tasas.usd : null,
        totalBs: bsUsd > 0 ? Math.round(bsUsd * NV.tasaEur) : null,
        estadoPago: NV.estadoPago,
        apartado: esApartado,
        abonos: orig ? (orig.abonos || []) : (NV.estadoPago === "abonado" ? [{ fecha: App.hoyISO(), montoUsd: NV.abonoMonto, metodo: NV.metodoPago }] : []),
        devoluciones: orig ? (orig.devoluciones || []) : [],
        entrega: NV.entrega, notas: orig ? orig.notas || "" : ""
      };
      if (orig) App.calc.descontarStock(orig, -1);
      App.calc.descontarStock(venta, 1);
      if (orig) {
        var ixV = App.db.ventas.findIndex(function (x) { return x.id === orig.id; });
        App.db.ventas[ixV] = venta;
      } else {
        App.db.ventas.push(venta);
      }
      App.audit(orig ? "venta_editada" : "venta_creada",
        (orig ? App.fmt.usd(totalAntes) + " → " : "") + App.fmt.usd(App.calc.ventaTotal(venta)) +
        " · " + venta.items.length + " ítem" + (venta.items.length > 1 ? "s" : ""));
      App.save();
      App.toast(orig ? "Venta actualizada ✓" : "Venta registrada 🎉");
      s.cerrar();
      App.render();
    });
  }

  /* alta rápida de agencia desde el formulario de venta */
  function agenciaRapida(alGuardar) {
    var s = App.sheet({
      titulo: "🚛 Nueva agencia",
      cuerpo: '<div class="field"><label>Nombre de la agencia</label><input class="input" id="agr-nombre" placeholder="Ej: Zoom, MRW, otra…"></div>',
      pie: '<button class="btn primary" data-ok>Agregar</button>'
    });
    App.$("[data-ok]", s.foot).addEventListener("click", function () {
      var n = App.$("#agr-nombre", s.el).value.trim();
      if (!n) { App.toast("Escribe el nombre", "err"); return; }
      var ag = { id: App.uid("ag"), nombre: n };
      App.db.settings.agencias.push(ag);
      App.save(); App.toast("Agencia agregada ✓");
      s.cerrar(); if (alGuardar) alGuardar(ag.id);
    });
  }

  /* cliente rápido (compartido con clientes.js) */
  App.clienteRapido = function (alGuardar) {
    var s = App.sheet({
      titulo: "👤 Nuevo cliente",
      cuerpo: '<div class="form-grid">' +
        '<div class="field full"><label>Nombre y apellido</label><input class="input" id="nc-nombre" autocomplete="off"></div>' +
        '<div class="field"><label>Teléfono</label><input class="input" id="nc-tel" inputmode="tel" placeholder="0412-1234567"></div>' +
        '<div class="field"><label>Email (opcional)</label><input class="input" id="nc-email" type="email"></div>' +
        App.geo.html("nc", "", "") +
        "</div>",
      pie: '<button class="btn primary" data-ok>Guardar cliente</button>'
    });
    App.geo.wire("nc", s.el);
    App.$("[data-ok]", s.foot).addEventListener("click", function () {
      var nombre = App.$("#nc-nombre", s.el).value.trim();
      var tel = App.$("#nc-tel", s.el).value.trim();
      if (!nombre || !tel) { App.toast("Nombre y teléfono son obligatorios", "err"); return; }
      var geo = App.geo.valor("nc", s.el);
      var c = {
        id: App.uid("c"), nombre: nombre, telefono: tel,
        email: App.$("#nc-email", s.el).value.trim(),
        estado: geo.estado,
        ciudad: geo.ciudad,
        direccion: "", notas: "", creadoEl: App.hoyISO()
      };
      App.db.clientes.push(c);
      App.save(); App.toast("Cliente guardado");
      s.cerrar();
      if (alGuardar) alGuardar(c.id);
    });
  };
})();
