/* ============================================================
   importaciones.js - el corazón del sistema.
   Cada compra que se le gestiona a un cliente, desde que se
   cotiza hasta que se entrega, con DOS flujos de dinero que
   nunca se mezclan:
     · lo que me paga el cliente = mercancía + mi comisión + flete + otros
     · lo que yo le pago a la fábrica = solo la mercancía
   y un estado de avance claro (11 pasos) para saber de un
   vistazo en qué proceso va cada una.
   ============================================================ */
window.App = window.App || {};

(function () {
  "use strict";

  /* ---------- los 11 pasos, en orden ---------- */
  var ESTADOS = [
    { id: "cotizada", label: "Cotizada", emoji: "📝" },
    { id: "proforma", label: "Proforma recibida", emoji: "📄" },
    { id: "anticipo", label: "Anticipo pagado", emoji: "💵" },
    { id: "produccion", label: "En producción", emoji: "🏭" },
    { id: "lista", label: "Producción lista", emoji: "✅" },
    { id: "almacen", label: "En almacén del agente", emoji: "📦" },
    { id: "embarcada", label: "Embarcada", emoji: "🚢" },
    { id: "transito", label: "En tránsito", emoji: "🌊" },
    { id: "llegada", label: "Llegó a destino", emoji: "🛬" },
    { id: "entregada", label: "Entregada al cliente", emoji: "🤝" },
    { id: "cerrada", label: "Cerrada", emoji: "🔒" }
  ];

  /* qué fecha de imp.fechas guarda cada paso (cotizada y cerrada no llevan) */
  var FECHA_DE = {
    proforma: "proforma", anticipo: "anticipo", produccion: "produccion",
    lista: "lista", almacen: "almacen", embarcada: "embarque",
    transito: "eta", llegada: "llegada", entregada: "entrega"
  };
  /* la del tránsito es una fecha a FUTURO: no se sella con el día de hoy */
  var FECHAS_FUTURAS = { eta: 1 };
  var ETIQUETA_FECHA = {
    proforma: "Día de la proforma", anticipo: "Día del anticipo",
    produccion: "Arranque de producción", lista: "Producción lista",
    almacen: "Entrada al almacén", embarque: "Día del embarque",
    eta: "Llegada estimada (ETA)", llegada: "Llegada real", entrega: "Entrega al cliente"
  };

  var GRUPOS = [
    { id: "curso", label: "En curso" },
    { id: "cobrar", label: "💰 Por cobrar" },
    { id: "pagar", label: "🏭 Por pagar" },
    { id: "cerradas", label: "Cerradas" },
    { id: "todas", label: "Todas" }
  ];

  var filtro = { grupo: "curso", destino: null, texto: "" };

  /* ============================================================
     utilidades
     ============================================================ */
  function n2(x) { return Math.round((+x || 0) * 100) / 100; }
  function num(x) { return +x || 0; }
  function col(nombre) { return App.db && App.db[nombre] ? App.db[nombre] : []; }
  function porId(nombre, id) {
    if (!id) return null;
    return col(nombre).filter(function (x) { return x.id === id; })[0] || null;
  }
  function ajustes() { return (App.db && App.db.settings) || {}; }
  function norm(s) {
    return String(s == null ? "" : s).toLowerCase()
      .replace(/[áàä]/g, "a").replace(/[éèë]/g, "e").replace(/[íìï]/g, "i")
      .replace(/[óòö]/g, "o").replace(/[úùü]/g, "u").replace(/ñ/g, "n").trim();
  }
  function ix(estadoId) {
    for (var i = 0; i < ESTADOS.length; i++) { if (ESTADOS[i].id === estadoId) return i; }
    return 0;
  }
  function estadoInfo(id) { return ESTADOS[ix(id)]; }
  function pillEstado(id) {
    if (id === "cerrada") return "";
    var k = ix(id);
    if (k >= ix("llegada")) return "ok";
    if (k >= ix("embarcada")) return "info";
    if (k >= ix("anticipo")) return "tint";
    return "warn";
  }
  function unir(arr) {
    if (!arr.length) return "";
    if (arr.length === 1) return arr[0];
    return arr.slice(0, arr.length - 1).join(", ") + " y " + arr[arr.length - 1];
  }
  /* nombre llano de cada concepto + su adjetivo, para las frases */
  var LLANO = {
    mercancia: ["la mercancía", "completa"],
    flete: ["el flete", "completo"],
    comision: ["la comisión", "completa"],
    aduana: ["la aduana", "completa"],
    otro: ["lo demás", "completo"],
    otros: ["lo demás", "completo"]
  };
  function llano(concepto) {
    var k = norm(concepto);
    return LLANO[k] ? LLANO[k][0] : String(concepto || "otro").toLowerCase();
  }
  function llanoAdj(concepto) {
    var k = norm(concepto);
    return LLANO[k] ? LLANO[k][1] : "completo";
  }
  /* porcentaje redondo y honesto: no dice 100% si todavía falta algo */
  function pctTexto(p, quedaSaldo) {
    var v = Math.round((+p || 0) * 100);
    if (quedaSaldo && v >= 100) v = 99;
    if (!quedaSaldo && v > 100) v = 100;
    if (v < 0) v = 0;
    return v + "%";
  }
  /* solo enlaces http/https (nada de javascript: en un href) */
  function urlSegura(u) {
    var s = String(u == null ? "" : u).trim();
    return /^https?:\/\//i.test(s) ? s : "";
  }
  function proximoCodigo() {
    var max = 0;
    col("importaciones").forEach(function (x) {
      var m = String(x.codigo || "").match(/(\d+)\s*$/);
      if (m && +m[1] > max) max = +m[1];
    });
    var n = max + 1;
    return "IMP-" + (n < 100 ? ("00" + n).slice(-3) : String(n));
  }
  function tiendaDe(id) {
    if (!id) return null;
    return (ajustes().tiendas || []).filter(function (t) { return t.id === id; })[0] || null;
  }
  function nombreCliente(imp) {
    if ((imp.destino || "cliente") === "tienda") {
      var t = tiendaDe(imp.tienda);
      return t ? (t.emoji ? t.emoji + " " : "") + t.nombre : "Mi tienda";
    }
    var c = porId("clientes", imp.clienteId);
    return c ? c.nombre : "Sin cliente asignado";
  }
  function pillDestino(imp) {
    if ((imp.destino || "cliente") === "tienda") {
      var t = tiendaDe(imp.tienda);
      return '<span class="pill tint">🛍️ ' + App.esc(t ? t.corto || t.nombre : "Mi tienda") + "</span>";
    }
    return '<span class="pill">👤 Para el cliente</span>';
  }
  /* aviso de atraso: fecha prometida que ya pasó y el paso sigue sin llegar */
  function atraso(imp) {
    if (!imp || imp.estado === "cerrada") return null;
    var f = imp.fechas || {};
    var hoy = App.hoyISO();
    var k = ix(imp.estado);
    if (f.lista && f.lista < hoy && k < ix("lista")) {
      return "la producción debió estar lista el " + App.fmt.fecha(f.lista);
    }
    if (f.eta && f.eta < hoy && k < ix("llegada")) {
      return "debió llegar el " + App.fmt.fecha(f.eta);
    }
    if (f.entrega && f.entrega < hoy && k < ix("entregada")) {
      return "la entrega estaba para el " + App.fmt.fecha(f.entrega);
    }
    return null;
  }

  /* ============================================================
     EL CÁLCULO CENTRAL
     Todo lo que hay que saber de una importación, ya masticado.
     ============================================================ */
  function saldos(imp) {
    var i = imp || {};
    var items = i.items || [];
    var pagosCliente = i.pagosCliente || [];
    var pagosFabrica = i.pagosFabrica || [];
    var otrosArr = i.otrosCostos || [];

    var mercancia = num(i.valorFactura);
    if (mercancia <= 0 && items.length) {
      mercancia = items.reduce(function (s, it) { return s + num(it.cant) * num(it.precioUnit); }, 0);
    }
    mercancia = n2(mercancia);

    var miComision = i.comisionTipo === "pct"
      ? n2(mercancia * num(i.comisionValor) / 100)
      : n2(num(i.comisionValor));
    var flete = n2(num(i.fleteReal) > 0 ? num(i.fleteReal) : num(i.fleteEstimado));
    var otros = n2(otrosArr.reduce(function (s, o) { return s + num(o.monto); }, 0));

    var totalCliente = n2(mercancia + miComision + flete + otros);
    var cobrado = n2(pagosCliente.reduce(function (s, p) { return s + num(p.monto); }, 0));
    var saldoCliente = n2(totalCliente - cobrado);
    var pagadoFabrica = n2(pagosFabrica.reduce(function (s, p) { return s + num(p.monto); }, 0));
    var saldoFabrica = n2(mercancia - pagadoFabrica);
    var pctFabrica = mercancia > 0 ? pagadoFabrica / mercancia : 0;
    var pctCliente = totalCliente > 0 ? cobrado / totalCliente : 0;
    var ganancia = miComision;
    var gananciaReal = n2(cobrado - pagadoFabrica - flete - otros);

    /* --- desglose por concepto: cuánto DEBE y cuánto ya PAGÓ de cada cosa --- */
    var filas = [];
    function fila(concepto) {
      var k = norm(concepto);
      var f = filas.filter(function (x) { return norm(x.concepto) === k; })[0];
      if (!f) { f = { concepto: String(concepto || "Otro"), debe: 0, pago: 0, saldo: 0 }; filas.push(f); }
      return f;
    }
    fila("Mercancía").debe += mercancia;
    fila("Flete").debe += flete;
    fila("Comisión").debe += miComision;
    otrosArr.forEach(function (o) { fila(o.concepto || "Otro").debe += num(o.monto); });
    pagosCliente.forEach(function (p) { fila(p.concepto || "Otro").pago += num(p.monto); });
    filas.forEach(function (f) {
      f.debe = n2(f.debe); f.pago = n2(f.pago); f.saldo = n2(f.debe - f.pago);
    });
    var porConcepto = filas.filter(function (f) {
      return Math.abs(f.debe) > 0.004 || Math.abs(f.pago) > 0.004;
    });
    var pagados = porConcepto.filter(function (f) { return f.debe > 0.004 && f.saldo <= 0.004; });
    var faltantes = porConcepto.filter(function (f) { return f.saldo > 0.004; });

    /* --- las frases, en cristiano --- */
    var resumenCliente;
    if (totalCliente <= 0.004) {
      resumenCliente = "Todavía no hay montos cargados: pon el valor de la factura, tu comisión y el flete.";
    } else if (cobrado <= 0.004) {
      resumenCliente = "El cliente no ha pagado nada todavía. Son " + App.fmt.usd(totalCliente) + " en total.";
    } else if (saldoCliente <= 0.004) {
      resumenCliente = saldoCliente < -0.004
        ? "Todo cobrado. Ojo: te pagó " + App.fmt.usd(-saldoCliente) + " de más."
        : "Todo cobrado: " + App.fmt.usd(cobrado) + ".";
    } else {
      var t = "";
      if (pagados.length === 1) {
        t = "El cliente ya pagó " + llano(pagados[0].concepto) + " " + llanoAdj(pagados[0].concepto) + ".";
      } else if (pagados.length > 1) {
        t = "El cliente ya pagó " + unir(pagados.map(function (f) { return llano(f.concepto); })) + ".";
      }
      if (!t) {
        t = "El cliente ha pagado el " + pctTexto(pctCliente, true) + " (" + App.fmt.usd(cobrado) +
          "). Faltan " + App.fmt.usd(saldoCliente) + ".";
      } else if (faltantes.length === 1) {
        t += " Falta " + llano(faltantes[0].concepto) + ": " + App.fmt.usd(faltantes[0].saldo) + ".";
      } else if (faltantes.length > 1) {
        t += " Faltan " + unir(faltantes.map(function (f) {
          return llano(f.concepto) + " (" + App.fmt.usd(f.saldo) + ")";
        })) + ".";
      } else {
        t += " Faltan " + App.fmt.usd(saldoCliente) + ".";
      }
      resumenCliente = t;
    }

    var resumenFabrica;
    if (mercancia <= 0.004) {
      resumenFabrica = "Todavía no has cargado el valor de la factura de la fábrica.";
    } else if (pagadoFabrica <= 0.004) {
      resumenFabrica = "Todavía no le has pagado nada a la fábrica. Son " + App.fmt.usd(mercancia) + ".";
    } else if (saldoFabrica <= 0.004) {
      resumenFabrica = saldoFabrica < -0.004
        ? "Fábrica pagada completa (le pagaste " + App.fmt.usd(-saldoFabrica) + " de más)."
        : "Fábrica pagada completa: " + App.fmt.usd(pagadoFabrica) + ".";
    } else {
      resumenFabrica = "Le pagaste el " + pctTexto(pctFabrica, true) + " (" + App.fmt.usd(pagadoFabrica) +
        "). Faltan " + App.fmt.usd(saldoFabrica) + ".";
    }

    return {
      mercancia: mercancia, miComision: miComision, flete: flete, otros: otros,
      totalCliente: totalCliente, cobrado: cobrado, saldoCliente: saldoCliente,
      pagadoFabrica: pagadoFabrica, saldoFabrica: saldoFabrica,
      pctCliente: pctCliente, pctFabrica: pctFabrica,
      ganancia: ganancia, gananciaReal: gananciaReal,
      porConcepto: porConcepto, faltantes: faltantes, pagados: pagados,
      resumenCliente: resumenCliente, resumenFabrica: resumenFabrica
    };
  }

  /* ============================================================
     piezas visuales reutilizables
     ============================================================ */
  /* tira de 11 segmentos: dónde va, de un vistazo (compacta en móvil) */
  function barraEstados(k) {
    var h = '<div class="flex" style="gap:3px;margin-top:10px">';
    for (var i = 0; i < ESTADOS.length; i++) {
      var st = i <= k ? "background:var(--tint)" : "background:var(--field-bg)";
      if (i < k) st += ";opacity:.42";
      h += '<span title="' + App.esc(ESTADOS[i].label) + '" style="flex:1;height:6px;border-radius:99px;' + st + '"></span>';
    }
    h += "</div>";
    return h;
  }
  /* barra de dinero de un lado: % + cuánto de cuánto + cuánto falta */
  function barraDinero(icono, titulo, pagado, total, pct, saldo) {
    var hayTotal = total > 0.004;
    var quedaSaldo = saldo > 0.004;
    var color = !hayTotal ? "var(--ink-3)" : !quedaSaldo ? "var(--ok)" : pagado > 0.004 ? "var(--warn)" : "var(--danger)";
    var w = pct <= 0 ? 0 : Math.max(4, Math.min(100, pct * 100));
    return '<div style="min-width:0">' +
      '<div class="spread"><span class="small muted">' + icono + " " + App.esc(titulo) + "</span>" +
      '<b class="num small">' + App.fmt.usd(pagado) + " / " + App.fmt.usd(total) + "</b></div>" +
      '<div class="hbar-track" style="margin-top:5px"><span class="hbar-fill" style="width:' + w.toFixed(1) + "%;background:" + color + '"></span></div>' +
      '<div class="spread small" style="margin-top:3px"><span class="muted">' + (hayTotal ? pctTexto(pct, quedaSaldo) : "sin monto") + "</span>" +
      (quedaSaldo
        ? '<span class="num" style="color:var(--danger);font-weight:700">faltan ' + App.fmt.usd(saldo) + "</span>"
        : hayTotal ? '<span class="num" style="color:var(--ok);font-weight:700">✓ completo</span>' : "") +
      "</div></div>";
  }
  /* las dos barras + las dos frases: el bloque que Manuel mira todos los días */
  function bloqueDinero(S) {
    return '<div class="grid-2" style="gap:12px;margin-top:10px">' +
      barraDinero("💰", "Me paga el cliente", S.cobrado, S.totalCliente, S.pctCliente, S.saldoCliente) +
      barraDinero("🏭", "Le pago a la fábrica", S.pagadoFabrica, S.mercancia, S.pctFabrica, S.saldoFabrica) +
      "</div>" +
      '<div class="small texto-largo" style="margin-top:9px">💰 ' + App.esc(S.resumenCliente) + "</div>" +
      '<div class="small texto-largo" style="margin-top:3px">🏭 ' + App.esc(S.resumenFabrica) + "</div>";
  }

  /* ============================================================
     VISTA PRINCIPAL
     ============================================================ */
  App.modImportaciones = {
    id: "importaciones", titulo: "Importaciones", icono: "orden",
    render: function (el) {
      var todas = col("importaciones").slice();
      todas.sort(function (a, b) {
        var ca = a.estado === "cerrada" ? 1 : 0, cb = b.estado === "cerrada" ? 1 : 0;
        if (ca !== cb) return ca - cb;
        return String(a.creadoEl || "") < String(b.creadoEl || "") ? 1 : -1;
      });

      /* --- KPIs: lo que hay que saber sin abrir nada --- */
      var activas = 0, porCobrar = 0, porPagar = 0, comprometida = 0, atrasadas = 0;
      todas.forEach(function (imp) {
        if (imp.estado === "cerrada") return;
        var S = saldos(imp);
        activas++;
        if (S.saldoCliente > 0.004) porCobrar += S.saldoCliente;
        if (S.saldoFabrica > 0.004) porPagar += S.saldoFabrica;
        comprometida += S.miComision;
        if (atraso(imp)) atrasadas++;
      });

      var html = '<div class="view">';
      html += '<div class="spread wrap" style="margin-bottom:12px;gap:10px"><div><h1>🚢 Importaciones</h1>' +
        '<div class="small muted">Cada compra que le gestionas a un cliente, de la cotización a la entrega</div></div>' +
        '<button class="btn primary" id="btn-imp-nueva">' + App.icon("plus") + " Importación</button></div>";

      html += '<div class="grid-kpi" style="margin-bottom:14px">' +
        '<div class="kpi"><div class="kpi-label">Activas</div><div class="kpi-value num">' + activas + "</div>" +
        '<div class="kpi-foot">' + (atrasadas ? '<span class="pill danger">⏰ ' + atrasadas + " con atraso</span>" : (todas.length - activas) + " cerradas") + "</div></div>" +
        '<div class="kpi"><div class="kpi-label">Falta cobrar</div><div class="kpi-value num" style="color:var(--danger)">' + App.fmt.usd0(porCobrar) + "</div>" +
        '<div class="kpi-foot">lo que te deben los clientes</div></div>' +
        '<div class="kpi"><div class="kpi-label">Falta pagar</div><div class="kpi-value num" style="color:var(--warn)">' + App.fmt.usd0(porPagar) + "</div>" +
        '<div class="kpi-foot">lo que le debes a las fábricas</div></div>' +
        '<div class="kpi"><div class="kpi-label">Ganancia comprometida</div><div class="kpi-value num" style="color:var(--ok)">' + App.fmt.usd0(comprometida) + "</div>" +
        '<div class="kpi-foot">tu comisión si todo cierra</div></div>' +
        "</div>";

      html += '<div class="search-bar" style="margin-bottom:10px">' + App.icon("buscar") +
        '<input class="input" id="imp-buscar" placeholder="Buscar por título, código, cliente o fábrica…" value="' + App.esc(filtro.texto) + '"></div>';

      html += '<div class="chips scroll-x" style="margin-bottom:8px">' + GRUPOS.map(function (g) {
        return '<button class="chip' + (filtro.grupo === g.id ? " active" : "") + '" data-grupo="' + g.id + '">' + g.label + "</button>";
      }).join("") + "</div>";

      html += '<div class="chips scroll-x" style="margin-bottom:14px">' +
        '<button class="chip' + (!filtro.destino ? " active" : "") + '" data-destino="">Todo destino</button>' +
        '<button class="chip' + (filtro.destino === "cliente" ? " active" : "") + '" data-destino="cliente">👤 De clientes</button>' +
        '<button class="chip' + (filtro.destino === "tienda" ? " active" : "") + '" data-destino="tienda">🛍️ Para mi tienda</button>' +
        "</div>";

      html += '<div id="imp-lista"></div></div>';
      el.innerHTML = html;

      function pasaFiltro(imp) {
        var S = saldos(imp);
        var cerrada = imp.estado === "cerrada";
        if (filtro.grupo === "curso" && cerrada) return false;
        if (filtro.grupo === "cerradas" && !cerrada) return false;
        if (filtro.grupo === "cobrar" && (cerrada || S.saldoCliente <= 0.004)) return false;
        if (filtro.grupo === "pagar" && (cerrada || S.saldoFabrica <= 0.004)) return false;
        if (filtro.destino && (imp.destino || "cliente") !== filtro.destino) return false;
        if (filtro.texto) {
          var cli = porId("clientes", imp.clienteId);
          var pr = porId("proveedores", imp.proveedorId);
          var blob = norm([imp.titulo, imp.codigo, cli ? cli.nombre : "", pr ? pr.nombre : ""].join(" "));
          if (blob.indexOf(norm(filtro.texto)) < 0) return false;
        }
        return true;
      }

      function pintarLista() {
        var lista = todas.filter(pasaFiltro);
        var cont = App.$("#imp-lista", el);
        if (!todas.length) {
          cont.innerHTML = '<div class="empty"><div class="big">🚢</div>' +
            "<p>Aquí vive cada compra que le gestionas a un cliente: desde que se cotiza hasta que se entrega, " +
            "con lo que el cliente te paga a ti y lo que tú le pagas a la fábrica, siempre por separado.</p>" +
            '<button class="btn primary" id="imp-vacio-nueva" style="margin-top:14px">' + App.icon("plus") + " Crear la primera</button></div>";
          var bv = App.$("#imp-vacio-nueva", cont);
          if (bv) bv.addEventListener("click", function () { formImportacion(null, null); });
          return;
        }
        if (!lista.length) {
          cont.innerHTML = '<div class="empty"><div class="big">🔍</div><p>Ninguna importación con esos filtros. Prueba con “Todas”.</p></div>';
          return;
        }
        cont.innerHTML = lista.map(tarjeta).join("");
      }
      pintarLista();

      App.$("#btn-imp-nueva").addEventListener("click", function () { formImportacion(null, null); });
      /* la búsqueda solo repinta la lista: el cursor no se pierde */
      App.$("#imp-buscar").addEventListener("input", function (e) {
        filtro.texto = e.target.value;
        pintarLista();
      });
      App.$$("[data-grupo]", el).forEach(function (b) {
        b.addEventListener("click", function () { filtro.grupo = b.dataset.grupo; App.render(); });
      });
      App.$$("[data-destino]", el).forEach(function (b) {
        b.addEventListener("click", function () { filtro.destino = b.dataset.destino || null; App.render(); });
      });

      App.delegar(el, "click", "[data-imp-cobro]", function (e, t) {
        e.stopPropagation();
        var imp = porId("importaciones", t.dataset.impCobro);
        if (imp) sheetPago(imp, "cliente", null);
      });
      App.delegar(el, "click", "[data-imp-pago]", function (e, t) {
        e.stopPropagation();
        var imp = porId("importaciones", t.dataset.impPago);
        if (imp) sheetPago(imp, "fabrica", null);
      });
      App.delegar(el, "click", "[data-imp-avanzar]", function (e, t) {
        e.stopPropagation();
        var imp = porId("importaciones", t.dataset.impAvanzar);
        if (imp) avanzar(imp, null);
      });
      App.delegar(el, "click", "[data-imp]", function (e, t) {
        if (e.target.closest("[data-stop]")) return;
        var imp = porId("importaciones", t.dataset.imp);
        if (imp) ficha(imp);
      });
    },
    nueva: function () { formImportacion(null, null); },
    ESTADOS: ESTADOS,
    saldos: saldos,
    nuevaDesdeCotizacion: nuevaDesdeCotizacion,
    ficha: ficha,
    travesia: travesia
  };

  /* ---------- travesía: el barco avanzando hacia el destino ----------
     El avance sale de las fechas reales: zarpe (fechas.embarque) → llegada
     estimada (fechas.eta). Sin fecha de zarpe, el barco se pinta saliendo. */
  function travesia(imp, mini) {
    var f = imp.fechas || {};
    if (!f.eta) return "";
    var llego = ix(imp.estado) >= ix("llegada");
    var pct;
    if (llego) pct = 1;
    else {
      var hoyMs = App.fromISO(App.hoyISO()).getTime();
      var etaMs = App.fromISO(f.eta).getTime();
      var iniMs = f.embarque ? App.fromISO(f.embarque).getTime() : null;
      if (iniMs !== null && etaMs > iniMs) pct = Math.max(0.04, Math.min(0.96, (hoyMs - iniMs) / (etaMs - iniMs)));
      else pct = 0.08;
    }
    /* bandera de destino según la ruta del agente (Venezuela por defecto) */
    var fwd = porId("forwarders", imp.forwarderId);
    var rutaTxt = fwd && fwd.rutas && fwd.rutas.length ? fwd.rutas.join(" ") : "";
    var bandera = /Estados Unidos|USA|EE\.?UU/i.test(rutaTxt) ? "🇺🇸" : /Panam/i.test(rutaTxt) ? "🇵🇦" : "🇻🇪";
    var dl = App.calc.diasHasta(f.eta);
    var pie = llego ? "ya llegó"
      : dl < 0 ? "debió llegar hace " + (-dl) + " día" + (dl === -1 ? "" : "s")
        : dl === 0 ? "llega HOY"
          : "llega en " + dl + " día" + (dl === 1 ? "" : "s");
    var p = pct.toFixed(3);
    return '<div class="travesia' + (mini ? " mini" : "") + '">' +
      '<div class="tv-linea">' +
      '<span class="tv-origen">🇨🇳</span>' +
      '<div class="tv-hecho" style="width:calc((100% - ' + (mini ? 44 : 56) + 'px) * ' + p + ')"></div>' +
      '<span class="tv-barco" style="left:calc(' + (mini ? 22 : 28) + 'px + (100% - ' + (mini ? 44 : 56) + 'px) * ' + p + ')">' + (llego ? "⚓" : "🚢") + "</span>" +
      '<span class="tv-destino">' + bandera + "</span>" +
      "</div>" +
      '<div class="tv-pies"><span>' + (f.embarque ? "zarpó el " + App.fmt.fecha(f.embarque) : "embarcada") + "</span>" +
      "<span>" + App.esc(pie) + " · " + App.fmt.fecha(f.eta) + "</span></div>" +
      "</div>";
  }

  /* ---------- la tarjeta de cada importación ---------- */
  function tarjeta(imp) {
    var S = saldos(imp);
    var E = estadoInfo(imp.estado);
    var k = ix(imp.estado);
    var prov = porId("proveedores", imp.proveedorId);
    var atr = atraso(imp);

    var h = '<div class="card lift' + (atr ? " late" : "") + '" data-imp="' + App.esc(imp.id) + '" style="cursor:pointer;margin-bottom:12px">';
    h += '<div class="spread wrap" style="gap:8px;align-items:flex-start">' +
      '<div style="flex:1;min-width:0">' +
      '<div class="row-title wrap" style="font-size:15px">' +
      (imp.codigo ? '<span class="num muted" style="font-weight:600">' + App.esc(imp.codigo) + "</span> · " : "") +
      App.esc(imp.titulo || "Importación") + "</div>" +
      '<div class="row-sub wrap" style="margin-top:3px">👤 ' + App.esc(nombreCliente(imp)) +
      " · 🏭 " + App.esc(prov ? prov.nombre : "sin fábrica asignada") + "</div></div>" +
      '<div class="flex wrap" style="gap:6px;justify-content:flex-end">' +
      '<span class="pill ' + pillEstado(imp.estado) + '">' + E.emoji + " " + App.esc(E.label) + "</span>" +
      pillDestino(imp) + "</div></div>";

    if (atr) h += '<div class="small" style="margin-top:8px"><span class="pill danger">⏰ ' + App.esc(atr) + "</span></div>";

    /* navegando: se ve el barco avanzar; antes de zarpar, solo la fecha */
    if (k >= ix("embarcada") && k <= ix("llegada")) {
      h += travesia(imp, false);
    } else if (imp.fechas && imp.fechas.eta && k === ix("almacen") && !atr) {
      var dEta = App.calc.diasHasta(imp.fechas.eta);
      if (dEta >= 0) h += '<div class="small" style="margin-top:8px"><span class="pill info">🌊 ' +
        (dEta === 0 ? "llega HOY" : "llegada estimada en " + dEta + " día" + (dEta === 1 ? "" : "s") + " (" + App.fmt.fecha(imp.fechas.eta) + ")") + "</span></div>";
    }

    h += barraEstados(k);
    h += '<div class="small muted" style="margin-top:5px">Paso ' + (k + 1) + " de " + ESTADOS.length + " · " + E.emoji + " " + App.esc(E.label) + "</div>";
    h += bloqueDinero(S);

    h += '<div class="flex wrap" style="gap:8px;margin-top:12px">' +
      '<button class="btn sm primary" data-stop data-imp-cobro="' + App.esc(imp.id) + '">💰 Registrar cobro</button>' +
      '<button class="btn sm" data-stop data-imp-pago="' + App.esc(imp.id) + '">🏭 Pagar a fábrica</button>' +
      (imp.estado !== "cerrada"
        ? '<button class="btn sm ghost" data-stop data-imp-avanzar="' + App.esc(imp.id) + '">⏭️ Avanzar</button>'
        : "") +
      '<button class="btn sm ghost" data-imp-abrir>Ver ficha ' + App.icon("chevR") + "</button>" +
      "</div>";
    h += "</div>";
    return h;
  }

  /* ============================================================
     FICHA COMPLETA
     ============================================================ */
  function ficha(imp) {
    if (!imp) return;

    var s = App.sheet({
      titulo: (imp.codigo ? imp.codigo + " · " : "") + (imp.titulo || "Importación"),
      cuerpo:
        '<div id="fi-cabecera"></div>' +
        '<div id="fi-resumen"></div>' +
        '<hr class="divider"><h3>🧭 Dónde va</h3><div class="small muted">Toca un paso para marcarlo como el estado actual. Las fechas se pueden corregir a mano.</div><div id="fi-linea"></div>' +
        '<hr class="divider"><h3>💵 El dinero, claro</h3><div id="fi-dinero"></div>' +
        '<hr class="divider"><h3>🧾 Historial de pagos</h3><div id="fi-pagos"></div>' +
        '<hr class="divider"><h3>📇 Datos y embarque</h3><div id="fi-datos"></div>' +
        '<hr class="divider"><h3>📋 Renglones de la compra</h3><div id="fi-items"></div>' +
        '<hr class="divider"><h3>📎 Documentos</h3><div id="fi-docs"></div>' +
        '<hr class="divider"><h3>📝 Notas</h3><div id="fi-notas"></div>',
      pie: '<button class="btn primary" data-pie-cobro>💰 Cobro</button>' +
        '<button class="btn" data-pie-pago>🏭 Pago</button>' +
        '<button class="btn" data-pie-avanzar>⏭️</button>' +
        '<button class="btn" data-pie-editar style="flex:0 0 auto">' + App.icon("editar") + "</button>" +
        '<button class="btn danger" data-pie-borrar style="flex:0 0 auto">' + App.icon("basura") + "</button>"
    });
    var q = function (sel) { return App.$(sel, s.el); };

    function guardar() { App.save(); }
    function todo() {
      pintarCabecera(); pintarResumen(); pintarLinea(); pintarDinero();
      pintarPagos(); pintarDatos(); pintarItems(); pintarDocs(); pintarNotas();
    }

    /* ---------- cabecera: estado, destino, código ---------- */
    function pintarCabecera() {
      var E = estadoInfo(imp.estado);
      var atr = atraso(imp);
      var box = q("#fi-cabecera");
      box.innerHTML = '<div class="flex wrap" style="gap:6px">' +
        '<span class="pill ' + pillEstado(imp.estado) + '">' + E.emoji + " " + App.esc(E.label) + "</span>" +
        pillDestino(imp) +
        (imp.codigo ? '<button class="pill" data-copiar-codigo title="Copiar el código">' + App.esc(imp.codigo) + " " + App.icon("copiar") + "</button>" : "") +
        (atr ? '<span class="pill danger">⏰ ' + App.esc(atr) + "</span>" : "") +
        "</div>";
      var bc = App.$("[data-copiar-codigo]", box);
      if (bc) bc.addEventListener("click", function () { App.copiar(imp.codigo, "Código copiado"); });
    }

    /* ---------- resumen: las dos barras y las dos frases ---------- */
    function pintarResumen() {
      var S = saldos(imp);
      var box = q("#fi-resumen");
      var puedeInventario = (imp.destino || "cliente") === "tienda" &&
        (imp.estado === "entregada" || imp.estado === "cerrada");
      box.innerHTML = bloqueDinero(S) +
        (puedeInventario
          ? '<button class="btn block" data-inventario style="margin-top:12px">📥 Cargar al inventario</button>'
          : "");
      var bi = App.$("[data-inventario]", box);
      if (bi) bi.addEventListener("click", function () { cargarAlInventario(imp); });
    }

    /* ---------- línea de tiempo de los 11 pasos ---------- */
    function pintarLinea() {
      var k = ix(imp.estado);
      var f = imp.fechas || {};
      var box = q("#fi-linea");
      box.innerHTML = '<div class="list" style="margin-top:8px">' + ESTADOS.map(function (E, i) {
        var clave = FECHA_DE[E.id];
        var val = clave ? f[clave] || "" : "";
        var marca = i < k ? "✓" : i === k ? E.emoji : "";
        return '<div class="row-item" data-paso="' + E.id + '" style="opacity:' + (i <= k ? "1" : "0.6") + '">' +
          '<div class="thumb">' + (marca || E.emoji) + "</div>" +
          '<div class="row-main"><div class="row-title wrap">' + App.esc(E.label) +
          (i === k ? ' <span class="pill tint">aquí va</span>' : "") + "</div>" +
          (clave
            ? '<div class="flex wrap" style="gap:6px;margin-top:5px">' +
            '<input class="input" type="date" data-fecha="' + clave + '" value="' + App.esc(val) + '" style="width:auto;max-width:160px;padding:6px 9px" aria-label="' + App.esc(ETIQUETA_FECHA[clave] || E.label) + '">' +
            '<span class="small muted">' + App.esc(ETIQUETA_FECHA[clave] || "") + "</span></div>"
            : '<div class="row-sub">' + (i === 0 ? "cuando se creó" : "al cerrar el caso") + "</div>") +
          "</div></div>";
      }).join("") + "</div>";

      App.$$("[data-fecha]", box).forEach(function (inp) {
        inp.addEventListener("change", function () {
          imp.fechas = imp.fechas || {};
          imp.fechas[inp.dataset.fecha] = inp.value || null;
          guardar();
          App.toast("Fecha guardada");
          pintarCabecera(); pintarLinea();
        });
      });
      /* listeners por fila (no delegados): esta sección se repinta y los
         delegados se irían acumulando en el mismo contenedor */
      App.$$("[data-paso]", box).forEach(function (fila) {
        fila.addEventListener("click", function (e) {
          if (e.target.closest("input")) return;
          var id = fila.dataset.paso;
          if (imp.estado === id) return;
          marcarEstado(imp, id);
          guardar();
          App.toast(estadoInfo(id).emoji + " " + estadoInfo(id).label);
          pintarCabecera(); pintarLinea(); pintarResumen();
        });
      });
    }

    /* ---------- el dinero: tabla por concepto + costos editables ---------- */
    function pintarDinero() {
      var S = saldos(imp);
      var box = q("#fi-dinero");
      var h = '<div class="table-wrap" style="margin-top:8px"><table class="mini"><thead><tr>' +
        "<th>Concepto</th><th class=\"num\">Debe</th><th class=\"num\">Pagó</th><th class=\"num\">Falta</th>" +
        "</tr></thead><tbody>";
      if (!S.porConcepto.length) {
        h += '<tr><td colspan="4" class="muted">Sin montos cargados todavía.</td></tr>';
      }
      S.porConcepto.forEach(function (f) {
        var falta = f.saldo > 0.004
          ? '<b style="color:var(--danger)">' + App.fmt.usd(f.saldo) + "</b>"
          : f.saldo < -0.004
            ? '<b style="color:var(--ok)">' + App.fmt.usd(-f.saldo) + " a favor</b>"
            : '<b style="color:var(--ok)">✓</b>';
        h += "<tr><td>" + App.esc(f.concepto) + '</td><td class="num">' + App.fmt.usd(f.debe) +
          '</td><td class="num">' + App.fmt.usd(f.pago) + '</td><td class="num">' + falta + "</td></tr>";
      });
      h += "<tr><td><b>Total del cliente</b></td><td class=\"num\"><b>" + App.fmt.usd(S.totalCliente) +
        '</b></td><td class="num"><b>' + App.fmt.usd(S.cobrado) + '</b></td><td class="num"><b style="color:' +
        (S.saldoCliente > 0.004 ? "var(--danger)" : "var(--ok)") + '">' +
        (S.saldoCliente > 0.004 ? App.fmt.usd(S.saldoCliente) : "✓") + "</b></td></tr>";
      h += "<tr><td>🏭 Fábrica (solo mercancía)</td><td class=\"num\">" + App.fmt.usd(S.mercancia) +
        '</td><td class="num">' + App.fmt.usd(S.pagadoFabrica) + '</td><td class="num"><b style="color:' +
        (S.saldoFabrica > 0.004 ? "var(--warn)" : "var(--ok)") + '">' +
        (S.saldoFabrica > 0.004 ? App.fmt.usd(S.saldoFabrica) : "✓") + "</b></td></tr>";
      h += "</tbody></table></div>";

      h += '<div class="spread" style="margin-top:10px"><span class="muted">Lo que ganas si todo cierra</span>' +
        '<b class="num" style="font-size:17px;color:var(--ok)">' + App.fmt.usd(S.ganancia) + "</b></div>";
      h += '<div class="spread small"><span class="muted">En la mano hoy (cobrado − fábrica − flete − otros)</span>' +
        '<span class="num" style="font-weight:700;color:' + (S.gananciaReal < 0 ? "var(--danger)" : "var(--ink-1)") + '">' +
        App.fmt.usd(S.gananciaReal) + "</span></div>";

      h += '<div class="form-grid" style="margin-top:12px">' +
        '<div class="field"><label>Flete estimado (USD)</label><input class="input num" data-costo="fleteEstimado" type="number" step="0.01" min="0" value="' + num(imp.fleteEstimado) + '"></div>' +
        '<div class="field"><label>Flete real (USD)</label><input class="input num" data-costo="fleteReal" type="number" step="0.01" min="0" value="' + num(imp.fleteReal) + '"></div>' +
        "</div>" +
        '<div class="small muted" style="margin-top:4px">Mientras el flete real esté en 0 se usa el estimado para todos los cálculos.</div>';

      h += '<div class="spread" style="margin-top:12px"><span class="small muted">Otros costos (aduana, inspección, muestras…)</span>' +
        '<button class="btn sm ghost" data-otro-add>+ Costo</button></div>';
      var otros = imp.otrosCostos || [];
      h += otros.length
        ? '<div class="list">' + otros.map(function (o, i) {
          return '<div class="row-item static"><div class="row-main">' +
            '<input class="input" data-otro-concepto="' + i + '" value="' + App.esc(o.concepto || "") + '" placeholder="Concepto" style="padding:7px 10px">' +
            "</div>" +
            '<input class="input num" data-otro-monto="' + i + '" type="number" step="0.01" min="0" value="' + num(o.monto) + '" style="width:110px;padding:7px 9px">' +
            '<button class="btn icon" data-otro-quitar="' + i + '">' + App.icon("x") + "</button></div>";
        }).join("") + "</div>"
        : '<div class="small muted">Sin otros costos cargados.</div>';
      box.innerHTML = h;

      App.$$("[data-costo]", box).forEach(function (inp) {
        inp.addEventListener("change", function () {
          imp[inp.dataset.costo] = Math.max(0, parseFloat(inp.value) || 0);
          guardar(); pintarDinero(); pintarResumen();
        });
      });
      var bOtro = App.$("[data-otro-add]", box);
      if (bOtro) bOtro.addEventListener("click", function () {
        imp.otrosCostos = imp.otrosCostos || [];
        imp.otrosCostos.push({ concepto: "Aduana", monto: 0 });
        guardar(); pintarDinero(); pintarResumen();
      });
      App.$$("[data-otro-concepto]", box).forEach(function (inp) {
        inp.addEventListener("change", function () {
          imp.otrosCostos[+inp.dataset.otroConcepto].concepto = inp.value.trim() || "Otro";
          guardar(); pintarDinero(); pintarResumen();
        });
      });
      App.$$("[data-otro-monto]", box).forEach(function (inp) {
        inp.addEventListener("change", function () {
          imp.otrosCostos[+inp.dataset.otroMonto].monto = Math.max(0, parseFloat(inp.value) || 0);
          guardar(); pintarDinero(); pintarResumen();
        });
      });
      App.$$("[data-otro-quitar]", box).forEach(function (b) {
        b.addEventListener("click", function () {
          imp.otrosCostos.splice(+b.dataset.otroQuitar, 1);
          guardar(); pintarDinero(); pintarResumen();
        });
      });
    }

    /* ---------- los dos historiales de pagos, uno al lado del otro ---------- */
    function pintarPagos() {
      var box = q("#fi-pagos");
      function listaPagos(arr, lado) {
        if (!arr.length) {
          return '<div class="empty" style="padding:14px"><p>' +
            (lado === "cliente" ? "El cliente todavía no ha pagado nada." : "Todavía no le has pagado nada a la fábrica.") +
            "</p></div>";
        }
        return '<div class="list">' + arr.map(function (p, i) {
          return '<div class="row-item static"><div class="row-main">' +
            '<div class="row-title wrap" style="font-size:13.5px">' + App.fmt.usd(num(p.monto)) +
            (p.concepto ? ' <span class="pill">' + App.esc(p.concepto) + "</span>" : "") + "</div>" +
            '<div class="row-sub">' + App.esc(App.fmt.fechaRel(p.fecha)) + (p.metodo ? " · " + App.esc(p.metodo) : "") + "</div>" +
            (p.notas ? '<div class="row-sub">' + App.esc(p.notas) + "</div>" : "") +
            "</div>" +
            '<button class="btn icon" data-del-pago="' + lado + "|" + i + '" title="Eliminar este pago">' + App.icon("x") + "</button></div>";
        }).join("") + "</div>";
      }
      box.innerHTML = '<div class="grid-2" style="margin-top:8px">' +
        '<div><div class="small" style="font-weight:700;margin-bottom:6px">💰 Lo que me pagó el cliente</div>' +
        listaPagos(imp.pagosCliente || [], "cliente") +
        '<button class="btn sm block" data-add-pago="cliente" style="margin-top:8px">+ Registrar cobro</button></div>' +
        '<div><div class="small" style="font-weight:700;margin-bottom:6px">🏭 Lo que le pagué a la fábrica</div>' +
        listaPagos(imp.pagosFabrica || [], "fabrica") +
        '<button class="btn sm block" data-add-pago="fabrica" style="margin-top:8px">+ Registrar pago</button></div>' +
        "</div>";

      App.$$("[data-add-pago]", box).forEach(function (b) {
        b.addEventListener("click", function () { sheetPago(imp, b.dataset.addPago, todo); });
      });
      App.$$("[data-del-pago]", box).forEach(function (b) {
        b.addEventListener("click", function () {
          var partes = b.dataset.delPago.split("|");
          var lado = partes[0], i = +partes[1];
          App.confirmar("¿Eliminar este pago del historial?", { peligro: true, accion: "Eliminar" }).then(function (si) {
            if (!si) return;
            var arr = lado === "cliente" ? imp.pagosCliente : imp.pagosFabrica;
            if (arr) arr.splice(i, 1);
            guardar(); App.toast("Pago eliminado");
            todo();
          });
        });
      });
    }

    /* ---------- datos: quién, con quién y con qué embarque ---------- */
    function pintarDatos() {
      var box = q("#fi-datos");
      var cli = porId("clientes", imp.clienteId);
      var prov = porId("proveedores", imp.proveedorId);
      var fwd = porId("forwarders", imp.forwarderId);
      var cot = porId("cotizaciones", imp.cotizacionId);
      var h = '<div class="list" style="margin-top:8px">';

      h += '<div class="row-item static"><div class="thumb">👤</div><div class="row-main">' +
        '<div class="row-title wrap">' + App.esc(nombreCliente(imp)) + "</div>" +
        '<div class="row-sub">' + ((imp.destino || "cliente") === "tienda" ? "Compra para tu propia tienda" : "Cliente de esta importación") + "</div></div>" +
        (cli && cli.telefono ? '<a class="btn icon wa" target="_blank" rel="noopener" href="' + App.esc(App.waLink(cli.telefono)) + '">' + App.icon("wa") + "</a>" : "") +
        "</div>";

      h += '<div class="row-item static"><div class="thumb">🏭</div><div class="row-main">' +
        '<div class="row-title wrap">' + App.esc(prov ? prov.nombre : "Sin fábrica asignada") + "</div>" +
        '<div class="row-sub">' + App.esc(prov ? (prov.wechat ? "WeChat: " + prov.wechat : (prov.telefono || "sin contacto cargado")) : "asígnala con ✏️ Editar") + "</div></div>" +
        (prov && prov.telefono ? '<a class="btn icon wa" target="_blank" rel="noopener" href="' + App.esc(App.waLink(prov.telefono)) + '">' + App.icon("wa") + "</a>" : "") +
        (prov && prov.wechat ? '<button class="btn icon" data-copiar-wc="' + App.esc(prov.wechat) + '" title="Copiar WeChat">' + App.icon("copiar") + "</button>" : "") +
        "</div>";

      h += '<div class="row-item static"><div class="thumb">🚢</div><div class="row-main">' +
        '<div class="row-title wrap">' + App.esc(fwd ? fwd.nombre : "Sin agente de carga") + "</div>" +
        '<div class="row-sub">' + App.esc(fwd && fwd.shippingMark ? "Marca del agente: " + fwd.shippingMark : "quien trae la mercancía") + "</div></div></div>";

      if (cot) {
        h += '<div class="row-item static"><div class="thumb">🧮</div><div class="row-main">' +
          '<div class="row-title wrap">' + App.esc(cot.titulo || "Cotización") + "</div>" +
          '<div class="row-sub">nació de esta cotización</div></div></div>';
      }
      h += "</div>";

      /* la travesía (o la cuenta atrás, si todavía no zarpó) */
      if (ix(imp.estado) >= ix("embarcada") && ix(imp.estado) <= ix("llegada")) {
        h += travesia(imp, false);
      } else if (imp.fechas && imp.fechas.eta && ["entregada", "cerrada"].indexOf(imp.estado) < 0) {
        var dLleg = App.calc.diasHasta(imp.fechas.eta);
        h += '<div class="small" style="margin-top:10px">🌊 Llegada estimada: <b>' + App.fmt.fecha(imp.fechas.eta) + "</b> " +
          (dLleg < 0 ? '<span class="pill danger">venció hace ' + (-dLleg) + " día" + (dLleg === -1 ? "" : "s") + "</span>"
            : dLleg === 0 ? '<span class="pill warn">llega HOY</span>'
              : '<span class="pill info">faltan ' + dLleg + " día" + (dLleg === 1 ? "" : "s") + "</span>") +
          "</div>";
      }

      h += '<div class="form-grid" style="margin-top:12px">' +
        '<div class="field full"><label>Shipping mark</label><div class="flex" style="gap:8px">' +
        '<input class="input" data-emb="shippingMark" value="' + App.esc(imp.shippingMark || "") + '" placeholder="La marca que va en las cajas" style="flex:1">' +
        '<button class="btn icon" data-copiar-mark title="Copiar">' + App.icon("copiar") + "</button></div></div>" +
        '<div class="field"><label>BL (conocimiento de embarque)</label><div class="flex" style="gap:8px">' +
        '<input class="input" data-emb="bl" value="' + App.esc(imp.bl || "") + '" placeholder="N° del BL" style="flex:1">' +
        '<button class="btn icon" data-copiar-bl title="Copiar BL">' + App.icon("copiar") + "</button></div></div>" +
        '<div class="field"><label>Guía aérea / courier</label><input class="input" data-emb="guia" value="' + App.esc(imp.guia || "") + '"></div>' +
        '<div class="field"><label>Contenedor</label><input class="input" data-emb="contenedor" value="' + App.esc(imp.contenedor || "") + '"></div>' +
        '<div class="field"><label>Buque</label><input class="input" data-emb="buque" value="' + App.esc(imp.buque || "") + '" placeholder="Nombre del barco"></div>' +
        '<div class="field full"><label>Código de rastreo del agente</label><div class="flex" style="gap:8px">' +
        '<input class="input" data-emb="trackingAgente" value="' + App.esc(imp.trackingAgente || "") + '" placeholder="Código o enlace del sistema de tu agente" style="flex:1">' +
        '<button class="btn icon" data-track-agente title="Abrir o copiar">' + App.icon("chevR") + "</button></div></div>" +
        '<div class="field"><label>Peso (kg)</label><input class="input num" data-emb-num="pesoKg" type="number" step="0.01" min="0" value="' + num(imp.pesoKg) + '"></div>' +
        '<div class="field"><label>Volumen (CBM)</label><input class="input num" data-emb-num="cbm" type="number" step="0.001" min="0" value="' + num(imp.cbm) + '"></div>' +
        "</div>" +
        '<button class="btn sm ghost" data-marinetraffic style="margin-top:6px">🛳 Buscar el buque en MarineTraffic</button>' +
        '<div class="small muted" style="margin-top:4px">El rastreo automático del barco no es gratis; por ahora el botón busca el buque en la web de MarineTraffic y la fecha estimada se lleva a mano en la línea de tiempo.</div>';
      box.innerHTML = h;

      App.$$("[data-emb]", box).forEach(function (inp) {
        inp.addEventListener("change", function () {
          imp[inp.dataset.emb] = inp.value.trim();
          guardar(); App.toast("Guardado");
        });
      });
      App.$$("[data-emb-num]", box).forEach(function (inp) {
        inp.addEventListener("change", function () {
          imp[inp.dataset.embNum] = Math.max(0, parseFloat(inp.value) || 0);
          guardar(); App.toast("Guardado");
        });
      });
      var bm = App.$("[data-copiar-mark]", box);
      if (bm) bm.addEventListener("click", function () {
        if (!imp.shippingMark) { App.toast("Todavía no hay shipping mark", "err"); return; }
        App.copiar(imp.shippingMark, "Shipping mark copiado");
      });
      var bbl = App.$("[data-copiar-bl]", box);
      if (bbl) bbl.addEventListener("click", function () {
        if (!imp.bl) { App.toast("Todavía no hay BL cargado", "err"); return; }
        App.copiar(imp.bl, "BL copiado");
      });
      var bmt = App.$("[data-marinetraffic]", box);
      if (bmt) bmt.addEventListener("click", function () {
        if (!imp.buque) { App.toast("Escribe primero el nombre del buque", "err"); return; }
        window.open("https://www.marinetraffic.com/es/ais/index/search/all?keyword=" + encodeURIComponent(imp.buque), "_blank", "noopener");
      });
      var bta = App.$("[data-track-agente]", box);
      if (bta) bta.addEventListener("click", function () {
        var t = (imp.trackingAgente || "").trim();
        if (!t) { App.toast("Todavía no hay código de rastreo", "err"); return; }
        if (/^https?:\/\//i.test(t)) window.open(t, "_blank", "noopener");
        else App.copiar(t, "Código copiado - pégalo en el sistema de tu agente");
      });
      var bw = App.$("[data-copiar-wc]", box);
      if (bw) bw.addEventListener("click", function () { App.copiar(bw.dataset.copiarWc, "WeChat copiado"); });
    }

    /* ---------- renglones de la compra ---------- */
    function pintarItems() {
      var box = q("#fi-items");
      imp.items = imp.items || [];
      var suma = n2(imp.items.reduce(function (t, it) { return t + num(it.cant) * num(it.precioUnit); }, 0));
      box.innerHTML = editorItems(imp.items, suma) +
        '<div class="flex wrap" style="gap:8px;margin-top:8px">' +
        '<button class="btn sm ghost" data-it-add>+ Renglón</button>' +
        (suma > 0.004
          ? '<button class="btn sm" data-it-factura>Usar ' + App.fmt.usd(suma) + " como valor de factura</button>"
          : "") +
        '<span class="small muted" style="align-self:center">Valor de factura actual: <b class="num">' + App.fmt.usd(num(imp.valorFactura)) + "</b></span>" +
        "</div>";

      wireItems(box, imp.items, function () { guardar(); pintarItems(); pintarDinero(); pintarResumen(); });
      var bf = App.$("[data-it-factura]", box);
      if (bf) bf.addEventListener("click", function () {
        imp.valorFactura = suma;
        guardar(); App.toast("Valor de factura actualizado: " + App.fmt.usd(suma));
        pintarItems(); pintarDinero(); pintarResumen();
      });
    }

    /* ---------- documentos (enlaces de Drive) ---------- */
    function pintarDocs() {
      var box = q("#fi-docs");
      var docs = imp.documentos || [];
      var h = '<div class="small muted" style="margin-top:6px">Los archivos (proforma, packing list, BL) se suben a Google Drive y aquí solo se pega el enlace.</div>';
      h += docs.length
        ? '<div class="list" style="margin-top:8px">' + docs.map(function (d, i) {
          var u = urlSegura(d.url);
          return '<div class="row-item static"><div class="thumb">📎</div><div class="row-main">' +
            '<div class="row-title wrap">' + App.esc(d.nombre || d.tipo || "Documento") + "</div>" +
            '<div class="row-sub">' + App.esc(d.tipo || "") + (u ? "" : " · enlace no válido") + "</div></div>" +
            (u ? '<a class="btn sm ghost" target="_blank" rel="noopener" href="' + App.esc(u) + '">Abrir</a>' : "") +
            '<button class="btn icon" data-doc-quitar="' + i + '">' + App.icon("x") + "</button></div>";
        }).join("") + "</div>"
        : '<div class="empty" style="padding:14px"><p>Sin documentos cargados.</p></div>';
      h += '<button class="btn sm ghost" data-doc-add style="margin-top:8px">+ Documento</button>';
      box.innerHTML = h;

      App.$("[data-doc-add]", box).addEventListener("click", function () { sheetDocumento(imp, pintarDocs); });
      App.$$("[data-doc-quitar]", box).forEach(function (b) {
        b.addEventListener("click", function () {
          App.confirmar("¿Quitar este documento de la lista? (El archivo sigue en tu Drive.)", { peligro: true, accion: "Quitar" }).then(function (si) {
            if (!si) return;
            imp.documentos.splice(+b.dataset.docQuitar, 1);
            guardar(); App.toast("Documento quitado"); pintarDocs();
          });
        });
      });
    }

    /* ---------- notas ---------- */
    function pintarNotas() {
      var box = q("#fi-notas");
      box.innerHTML = '<textarea class="textarea" data-notas placeholder="Lo que haya que recordar de esta importación…">' +
        App.esc(imp.notas || "") + "</textarea>";
      App.$("[data-notas]", box).addEventListener("change", function (e) {
        imp.notas = e.target.value.trim();
        guardar(); App.toast("Notas guardadas");
      });
    }

    todo();

    q("[data-pie-cobro]").addEventListener("click", function () { sheetPago(imp, "cliente", todo); });
    q("[data-pie-pago]").addEventListener("click", function () { sheetPago(imp, "fabrica", todo); });
    q("[data-pie-avanzar]").addEventListener("click", function () { avanzar(imp, todo); });
    q("[data-pie-editar]").addEventListener("click", function () { s.cerrar(); formImportacion(imp, null); });
    q("[data-pie-borrar]").addEventListener("click", function () {
      App.confirmar("¿Eliminar esta importación con todo su historial de pagos? Esto no se puede deshacer.",
        { peligro: true, accion: "Eliminar" }).then(function (si) {
          if (!si) return;
          App.db.importaciones = col("importaciones").filter(function (x) { return x.id !== imp.id; });
          App.save(); App.toast("Importación eliminada");
          s.cerrar(); App.render();
        });
    });
  }

  /* editor de renglones compartido por la ficha y el formulario */
  function editorItems(items, suma) {
    if (!items.length) {
      return '<div class="empty" style="padding:14px"><p>Sin renglones. Agrégalos si quieres el detalle de qué se está comprando.</p></div>';
    }
    return '<div class="list" style="margin-top:8px">' + items.map(function (it, i) {
      return '<div class="row-item static"><div class="row-main">' +
        '<input class="input" data-it-desc="' + i + '" value="' + App.esc(it.descripcion || "") + '" placeholder="Qué es" style="padding:7px 10px">' +
        '<div class="flex wrap" style="gap:6px;margin-top:6px">' +
        '<input class="input num" data-it-cant="' + i + '" type="number" min="0" step="1" value="' + num(it.cant) + '" aria-label="Cantidad" style="width:88px;padding:7px 9px">' +
        '<span class="small muted">×</span>' +
        '<input class="input num" data-it-precio="' + i + '" type="number" min="0" step="0.01" value="' + num(it.precioUnit) + '" aria-label="Precio por unidad" style="width:112px;padding:7px 9px">' +
        '<span class="num small" style="font-weight:700">= ' + App.fmt.usd(num(it.cant) * num(it.precioUnit)) + "</span>" +
        "</div></div>" +
        '<button class="btn icon" data-it-quitar="' + i + '">' + App.icon("x") + "</button></div>";
    }).join("") + "</div>" +
      '<div class="spread small" style="margin-top:6px"><span class="muted">Suma de los renglones</span><b class="num">' + App.fmt.usd(suma) + "</b></div>";
  }
  function wireItems(box, items, alCambiar) {
    var badd = App.$("[data-it-add]", box);
    if (badd) badd.addEventListener("click", function () {
      items.push({ descripcion: "", cant: 1, precioUnit: 0 });
      alCambiar();
    });
    App.$$("[data-it-desc]", box).forEach(function (inp) {
      inp.addEventListener("change", function () { items[+inp.dataset.itDesc].descripcion = inp.value.trim(); alCambiar(); });
    });
    App.$$("[data-it-cant]", box).forEach(function (inp) {
      inp.addEventListener("change", function () { items[+inp.dataset.itCant].cant = Math.max(0, parseFloat(inp.value) || 0); alCambiar(); });
    });
    App.$$("[data-it-precio]", box).forEach(function (inp) {
      inp.addEventListener("change", function () { items[+inp.dataset.itPrecio].precioUnit = Math.max(0, parseFloat(inp.value) || 0); alCambiar(); });
    });
    App.$$("[data-it-quitar]", box).forEach(function (b) {
      b.addEventListener("click", function () { items.splice(+b.dataset.itQuitar, 1); alCambiar(); });
    });
  }

  /* ---------- agregar un documento ---------- */
  function sheetDocumento(imp, done) {
    var TIPOS = ["Proforma", "Factura comercial", "Packing list", "BL / Guía aérea", "Certificado", "Foto", "Otro"];
    var s = App.sheet({
      titulo: "📎 Agregar documento",
      cuerpo: '<div class="form-grid">' +
        '<div class="field"><label>Tipo</label><select class="select" id="dc-tipo">' +
        TIPOS.map(function (t) { return "<option>" + App.esc(t) + "</option>"; }).join("") + "</select></div>" +
        '<div class="field"><label>Nombre</label><input class="input" id="dc-nombre" placeholder="Proforma 12-may"></div>' +
        '<div class="field full"><label>Enlace de Google Drive</label><input class="input" id="dc-url" placeholder="https://drive.google.com/…"></div>' +
        "</div>" +
        '<div class="small muted">Sube el archivo a tu Drive, dale “compartir con enlace” y pega aquí ese enlace.</div>',
      pie: '<button class="btn primary" data-ok>Agregar</button>'
    });
    App.$("[data-ok]", s.foot).addEventListener("click", function () {
      var url = urlSegura(App.$("#dc-url", s.el).value);
      if (!url) { App.toast("Pega un enlace que empiece por https://", "err"); return; }
      imp.documentos = imp.documentos || [];
      imp.documentos.push({
        tipo: App.$("#dc-tipo", s.el).value,
        nombre: App.$("#dc-nombre", s.el).value.trim() || App.$("#dc-tipo", s.el).value,
        url: url
      });
      App.save(); App.toast("Documento agregado 📎");
      s.cerrar(); if (done) done();
    });
  }

  /* ============================================================
     REGISTRAR UN PAGO (los dos lados usan el mismo sheet)
     ============================================================ */
  function sheetPago(imp, lado, done) {
    var esCliente = lado === "cliente";
    var S = saldos(imp);
    var base = esCliente ? S.totalCliente : S.mercancia;
    var yaPago = esCliente ? S.cobrado : S.pagadoFabrica;
    var saldo = Math.max(0, esCliente ? S.saldoCliente : S.saldoFabrica);
    var metodos = ajustes().metodosPago || [];
    var conceptos = (ajustes().conceptosPago || ["Mercancía", "Flete", "Comisión", "Aduana", "Otro"]).slice();
    /* si hay costos con nombre propio, también deben poder elegirse */
    S.porConcepto.forEach(function (f) {
      var existe = conceptos.filter(function (c) { return norm(c) === norm(f.concepto); }).length;
      if (!existe) conceptos.push(f.concepto);
    });
    var pendientes = esCliente ? S.faltantes : [];
    var conceptoIni = esCliente
      ? (pendientes.length ? pendientes[0].concepto : "Mercancía")
      : "Mercancía";

    var cuerpo = '<div class="card" style="padding:12px 14px;box-shadow:none;border:1px solid var(--card-border);margin-bottom:12px">' +
      '<div class="small texto-largo">' + App.esc(esCliente ? S.resumenCliente : S.resumenFabrica) + "</div></div>";

    cuerpo += '<div class="form-grid">' +
      '<div class="field"><label>Monto (USD) · falta ' + App.esc(App.fmt.usd(saldo)) + '</label>' +
      '<input class="input num" id="pg-monto" type="number" step="0.01" min="0.01" value="' + (saldo > 0 ? saldo.toFixed(2) : "") + '"></div>' +
      '<div class="field"><label>Fecha</label><input class="input" id="pg-fecha" type="date" value="' + App.hoyISO() + '"></div>' +
      '<div class="field"><label>Concepto</label><select class="select" id="pg-concepto">' +
      conceptos.map(function (c) {
        return "<option" + (norm(c) === norm(conceptoIni) ? " selected" : "") + ">" + App.esc(c) + "</option>";
      }).join("") + "</select></div>" +
      '<div class="field"><label>Método</label><select class="select" id="pg-metodo">' +
      (metodos.length ? metodos.map(function (m) { return "<option>" + App.esc(m) + "</option>"; }).join("") : "<option>Transferencia</option>") +
      "</select></div>" +
      '<div class="field full"><label>Notas</label><input class="input" id="pg-notas" placeholder="Referencia, banco, quién lo hizo…"></div>' +
      "</div>";

    /* atajos de porcentaje: así trabaja Manuel (30%, 50%, 100%) */
    cuerpo += '<div style="margin-top:12px"><div class="small muted">Atajos sobre el total de este lado (' +
      App.esc(App.fmt.usd(base)) + "): rellenan cuánto falta para llegar a ese punto.</div>" +
      '<div class="chips" style="margin-top:6px">' +
      [30, 50, 70, 100].map(function (p) { return '<button class="chip" data-pct="' + p + '">' + p + "%</button>"; }).join("") +
      '<button class="chip" data-resto>Todo lo que falta</button></div></div>';

    if (esCliente && pendientes.length) {
      cuerpo += '<div style="margin-top:10px"><div class="small muted">O cobra un concepto completo:</div>' +
        '<div class="chips" style="margin-top:6px">' + pendientes.map(function (f) {
          return '<button class="chip" data-conc="' + App.esc(f.concepto) + '" data-conc-monto="' + f.saldo + '">' +
            App.esc(f.concepto) + ": " + App.fmt.usd(f.saldo) + "</button>";
        }).join("") + "</div></div>";
    }

    var s = App.sheet({
      titulo: esCliente ? "💰 Cobro del cliente" : "🏭 Pago a la fábrica",
      cuerpo: cuerpo,
      pie: '<button class="btn primary" data-ok>Guardar</button>'
    });

    function setMonto(m) { App.$("#pg-monto", s.el).value = n2(m).toFixed(2); }
    App.$$("[data-pct]", s.el).forEach(function (b) {
      b.addEventListener("click", function () {
        if (base <= 0.004) { App.toast("Primero carga los montos de esta importación", "err"); return; }
        var meta = base * (+b.dataset.pct) / 100;
        var falta = n2(meta - yaPago);
        if (falta <= 0.004) {
          App.toast("Ya va por el " + pctTexto(yaPago / base, saldo > 0.004) + ": ese porcentaje ya está cubierto", "err");
          return;
        }
        setMonto(Math.min(falta, saldo > 0 ? saldo : falta));
      });
    });
    App.$("[data-resto]", s.el).addEventListener("click", function () {
      if (saldo <= 0.004) { App.toast("No queda saldo pendiente de este lado", "err"); return; }
      setMonto(saldo);
    });
    App.$$("[data-conc]", s.el).forEach(function (b) {
      b.addEventListener("click", function () {
        setMonto(+b.dataset.concMonto);
        var sel = App.$("#pg-concepto", s.el);
        var opciones = Array.prototype.slice.call(sel.options);
        for (var i = 0; i < opciones.length; i++) {
          if (norm(opciones[i].textContent) === norm(b.dataset.conc)) { sel.selectedIndex = i; break; }
        }
      });
    });

    App.$("[data-ok]", s.foot).addEventListener("click", function () {
      var m = parseFloat(App.$("#pg-monto", s.el).value);
      if (!m || m <= 0) { App.toast("Escribe cuánto se pagó", "err"); return; }
      var pago = {
        fecha: App.$("#pg-fecha", s.el).value || App.hoyISO(),
        monto: n2(m),
        metodo: App.$("#pg-metodo", s.el).value,
        concepto: App.$("#pg-concepto", s.el).value,
        notas: App.$("#pg-notas", s.el).value.trim()
      };
      var antes = esCliente ? S.cobrado : S.pagadoFabrica;
      if (esCliente) {
        imp.pagosCliente = imp.pagosCliente || [];
        imp.pagosCliente.push(pago);
      } else {
        imp.pagosFabrica = imp.pagosFabrica || [];
        imp.pagosFabrica.push(pago);
      }
      App.save();
      var S2 = saldos(imp);
      App.toast(esCliente
        ? (S2.saldoCliente <= 0.004 ? "¡Cobrado todo! 🎉" : "Cobro registrado · faltan " + App.fmt.usd(S2.saldoCliente))
        : (S2.saldoFabrica <= 0.004 ? "Fábrica pagada completa 🏭" : "Pago registrado · faltan " + App.fmt.usd(S2.saldoFabrica)));
      s.cerrar();
      if (esCliente) { if (done) done(); else App.render(); }
      else sugerirAvance(imp, antes, done);
    });
  }

  /* al pagarle a la fábrica, el estado suele moverse: se PROPONE, nunca se impone */
  function sugerirAvance(imp, antesPagado, done) {
    var S = saldos(imp);
    var k = ix(imp.estado);
    var fin = function () { if (done) done(); else App.render(); };
    var propuesto = null;
    if (S.mercancia > 0.004 && S.saldoFabrica <= 0.004 && k < ix("produccion")) propuesto = "produccion";
    else if (antesPagado <= 0.004 && S.pagadoFabrica > 0.004 && k < ix("anticipo")) propuesto = "anticipo";
    if (!propuesto) { fin(); return; }
    var E = estadoInfo(propuesto);
    var msg = propuesto === "produccion"
      ? "La fábrica ya está pagada completa. ¿Paso esta importación a “En producción”?"
      : "Ese fue el primer pago a la fábrica. ¿La marco como “Anticipo pagado”?";
    App.confirmar(msg, { accion: "Sí, " + E.label.toLowerCase() }).then(function (si) {
      if (si) {
        marcarEstado(imp, propuesto);
        App.save();
        App.toast(E.emoji + " " + E.label);
      }
      fin();
    });
  }

  function marcarEstado(imp, estadoId) {
    imp.estado = estadoId;
    imp.fechas = imp.fechas || {};
    var clave = FECHA_DE[estadoId];
    /* la ETA es una fecha futura: no se sella sola con el día de hoy */
    if (clave && !FECHAS_FUTURAS[clave] && !imp.fechas[clave]) imp.fechas[clave] = App.hoyISO();
  }

  function avanzar(imp, done) {
    var k = ix(imp.estado);
    if (k >= ESTADOS.length - 1) { App.toast("Esta importación ya está cerrada"); return; }
    var sig = ESTADOS[k + 1];
    App.confirmar("¿Pasar a “" + sig.emoji + " " + sig.label + "”?", { accion: "Sí, avanzar" }).then(function (si) {
      if (!si) return;
      marcarEstado(imp, sig.id);
      App.save();
      App.toast(sig.emoji + " " + sig.label);
      if (done) done(); else App.render();
    });
  }

  /* ============================================================
     NUEVA / EDITAR IMPORTACIÓN
     ============================================================ */
  function formImportacion(orig, pre) {
    var clientes = col("clientes");
    var provs = col("proveedores");
    var fwds = col("forwarders");
    var tiendas = ajustes().tiendas || [];

    var F = orig ? JSON.parse(JSON.stringify(orig)) : {
      id: null, codigo: proximoCodigo(), titulo: "", destino: "cliente",
      tienda: tiendas.length ? tiendas[0].id : null,
      clienteId: null, proveedorId: null, forwarderId: null, cotizacionId: null,
      items: [], valorFactura: 0, pagosFabrica: [],
      comisionTipo: "pct", comisionValor: 10,
      fleteEstimado: 0, fleteReal: 0, otrosCostos: [], pagosCliente: [],
      estado: "cotizada", fechas: {}, shippingMark: "", bl: "", buque: "", trackingAgente: "", guia: "", contenedor: "",
      pesoKg: 0, cbm: 0, documentos: [], notas: "", creadoEl: App.hoyISO()
    };
    if (pre) {
      Object.keys(pre).forEach(function (k) { if (pre[k] != null) F[k] = pre[k]; });
    }
    F.items = F.items || [];

    function opciones(arr, sel, vacio) {
      return '<option value="">' + App.esc(vacio) + "</option>" + arr.map(function (x) {
        return '<option value="' + App.esc(x.id) + '"' + (sel === x.id ? " selected" : "") + ">" +
          App.esc((x.emoji ? x.emoji + " " : "") + x.nombre) + "</option>";
      }).join("");
    }

    var s = App.sheet({
      titulo: orig ? "✏️ Editar importación" : "🚢 Nueva importación",
      cuerpo: '<div class="form-grid">' +
        '<div class="field full"><label>Título</label><input class="input" id="ni-titulo" value="' + App.esc(F.titulo || "") + '" placeholder="500 bicicletas rin 20"></div>' +
        '<div class="field"><label>Código</label><input class="input" id="ni-codigo" value="' + App.esc(F.codigo || "") + '" placeholder="IMP-001"></div>' +
        '<div class="field"><label>¿Para quién es?</label><select class="select" id="ni-destino">' +
        '<option value="cliente"' + (F.destino !== "tienda" ? " selected" : "") + ">👤 Para un cliente</option>" +
        '<option value="tienda"' + (F.destino === "tienda" ? " selected" : "") + ">🛍️ Para mi tienda</option>" +
        "</select></div>" +
        '<div class="field" id="ni-wrap-cliente"><label>Cliente</label><select class="select" id="ni-cliente">' +
        opciones(clientes, F.clienteId, "Elegir cliente…") + "</select></div>" +
        '<div class="field" id="ni-wrap-tienda"><label>Tienda</label><select class="select" id="ni-tienda">' +
        opciones(tiendas, F.tienda, "Elegir tienda…") + "</select></div>" +
        '<div class="field"><label>Fábrica</label><select class="select" id="ni-prov">' +
        opciones(provs, F.proveedorId, "Elegir fábrica…") + "</select></div>" +
        '<div class="field"><label>Agente de carga</label><select class="select" id="ni-fwd">' +
        opciones(fwds, F.forwarderId, "Elegir agente…") + "</select></div>" +
        "</div>" +

        '<hr class="divider"><div class="spread"><h3>📋 Qué se compra</h3><button class="btn sm ghost" data-it-add>+ Renglón</button></div>' +
        '<div id="ni-items"></div>' +

        '<hr class="divider"><h3>💵 Los números</h3>' +
        '<div class="form-grid" style="margin-top:8px">' +
        '<div class="field"><label>Valor de la factura (USD)</label><input class="input num" id="ni-factura" type="number" step="0.01" min="0" value="' + num(F.valorFactura) + '"></div>' +
        '<div class="field"><label>Flete estimado (USD)</label><input class="input num" id="ni-flete" type="number" step="0.01" min="0" value="' + num(F.fleteEstimado) + '"></div>' +
        '<div class="field"><label>Mi ganancia</label><select class="select" id="ni-comtipo">' +
        '<option value="pct"' + (F.comisionTipo !== "monto" ? " selected" : "") + ">Porcentaje sobre la factura</option>" +
        '<option value="monto"' + (F.comisionTipo === "monto" ? " selected" : "") + ">Monto fijo</option>" +
        "</select></div>" +
        '<div class="field"><label id="ni-comlabel">Valor</label><input class="input num" id="ni-comvalor" type="number" step="0.01" min="0" value="' + num(F.comisionValor) + '"></div>' +
        "</div>" +
        '<div class="card" id="ni-prev" style="margin-top:10px;padding:12px 14px;box-shadow:none;border:1px solid var(--card-border)"></div>' +

        '<hr class="divider"><div class="field"><label>Notas</label><textarea class="textarea" id="ni-notas">' + App.esc(F.notas || "") + "</textarea></div>",
      pie: '<button class="btn primary" data-ok>' + (orig ? "Guardar cambios" : "Crear importación") + "</button>"
    });

    function pintarItemsForm() {
      var box = App.$("#ni-items", s.el);
      var suma = n2(F.items.reduce(function (t, it) { return t + num(it.cant) * num(it.precioUnit); }, 0));
      box.innerHTML = editorItems(F.items, suma) +
        (suma > 0.004
          ? '<button class="btn sm ghost" data-it-factura style="margin-top:8px">Usar ' + App.fmt.usd(suma) + " como valor de factura</button>"
          : "");
      wireItems(box, F.items, function () { pintarItemsForm(); pintarPrev(); });
      var bf = App.$("[data-it-factura]", box);
      if (bf) bf.addEventListener("click", function () {
        App.$("#ni-factura", s.el).value = suma;
        pintarPrev();
        App.toast("Valor de factura: " + App.fmt.usd(suma));
      });
    }
    /* el botón "+ Renglón" del encabezado vive fuera del contenedor que se repinta */
    App.$("[data-it-add]", s.el).addEventListener("click", function () {
      F.items.push({ descripcion: "", cant: 1, precioUnit: 0 });
      pintarItemsForm(); pintarPrev();
    });

    function leerNumeros() {
      F.valorFactura = Math.max(0, parseFloat(App.$("#ni-factura", s.el).value) || 0);
      F.fleteEstimado = Math.max(0, parseFloat(App.$("#ni-flete", s.el).value) || 0);
      F.comisionTipo = App.$("#ni-comtipo", s.el).value;
      F.comisionValor = Math.max(0, parseFloat(App.$("#ni-comvalor", s.el).value) || 0);
    }
    function pintarPrev() {
      leerNumeros();
      var S = saldos(F);
      App.$("#ni-comlabel", s.el).textContent = F.comisionTipo === "pct" ? "Porcentaje (%)" : "Monto fijo (USD)";
      App.$("#ni-prev", s.el).innerHTML =
        '<div class="spread"><span class="small muted">Tú ganas</span><b class="num" style="color:var(--ok);font-size:16px">' + App.fmt.usd(S.ganancia) + "</b></div>" +
        '<div class="spread" style="margin-top:4px"><span class="small muted">El cliente te paga en total</span><b class="num" style="font-size:16px">' + App.fmt.usd(S.totalCliente) + "</b></div>" +
        '<div class="small muted" style="margin-top:6px">mercancía ' + App.fmt.usd(S.mercancia) +
        " + comisión " + App.fmt.usd(S.miComision) + " + flete " + App.fmt.usd(S.flete) +
        (S.otros > 0.004 ? " + otros " + App.fmt.usd(S.otros) : "") + "</div>" +
        '<div class="small muted" style="margin-top:2px">A la fábrica le pagas ' + App.fmt.usd(S.mercancia) + "</div>";
    }
    function pintarDestino() {
      var esTienda = App.$("#ni-destino", s.el).value === "tienda";
      App.$("#ni-wrap-cliente", s.el).style.display = esTienda ? "none" : "";
      App.$("#ni-wrap-tienda", s.el).style.display = esTienda ? "" : "none";
    }

    ["#ni-factura", "#ni-flete", "#ni-comvalor"].forEach(function (sel) {
      App.$(sel, s.el).addEventListener("input", pintarPrev);
    });
    App.$("#ni-comtipo", s.el).addEventListener("change", pintarPrev);
    App.$("#ni-destino", s.el).addEventListener("change", pintarDestino);
    pintarItemsForm(); pintarPrev(); pintarDestino();

    App.$("[data-ok]", s.foot).addEventListener("click", function () {
      var titulo = App.$("#ni-titulo", s.el).value.trim();
      if (!titulo) { App.toast("Ponle un título para reconocerla", "err"); return; }
      leerNumeros();
      F.titulo = titulo;
      F.codigo = App.$("#ni-codigo", s.el).value.trim();
      F.destino = App.$("#ni-destino", s.el).value === "tienda" ? "tienda" : "cliente";
      F.clienteId = F.destino === "cliente" ? (App.$("#ni-cliente", s.el).value || null) : null;
      F.tienda = F.destino === "tienda" ? (App.$("#ni-tienda", s.el).value || null) : null;
      F.proveedorId = App.$("#ni-prov", s.el).value || null;
      F.forwarderId = App.$("#ni-fwd", s.el).value || null;
      F.notas = App.$("#ni-notas", s.el).value.trim();
      F.estado = F.estado || "cotizada";
      F.fechas = F.fechas || {};

      App.db.importaciones = App.db.importaciones || [];
      if (orig) {
        var i = App.db.importaciones.findIndex(function (x) { return x.id === orig.id; });
        if (i >= 0) App.db.importaciones[i] = F; else App.db.importaciones.push(F);
      } else {
        F.id = App.uid("imp");
        F.creadoEl = F.creadoEl || App.hoyISO();
        App.db.importaciones.push(F);
        /* si nació de una búsqueda, esa búsqueda queda como comprada */
        if (F.cotizacionId) {
          var cotOrigen = (App.db.cotizaciones || []).filter(function (c) { return c.id === F.cotizacionId; })[0];
          if (cotOrigen && cotOrigen.estado !== "comprada") cotOrigen.estado = "comprada";
        }
      }
      App.save();
      App.toast(orig ? "Importación actualizada" : "Importación creada 🚢");
      s.cerrar();
      App.render();
    });
  }

  /* ---------- desde una cotización ganada ---------- */
  function nuevaDesdeCotizacion(cot, oferta) {
    var c = cot || {};
    var o = oferta || {};
    var cant = num(c.cantidad) > 0 ? num(c.cantidad) : 1;
    var precio = num(o.precioUnit);
    var desc = String(c.titulo || c.descripcion || "Producto cotizado");
    formImportacion(null, {
      titulo: c.titulo || desc,
      notas: c.descripcion || "",
      destino: c.tienda ? "tienda" : "cliente",
      tienda: c.tienda || null,
      clienteId: c.clienteId || null,
      proveedorId: o.proveedorId || null,
      forwarderId: c.forwarderId || null,
      cotizacionId: c.id || null,
      valorFactura: n2(cant * precio),
      items: [{ descripcion: desc, cant: cant, precioUnit: precio }]
    });
  }

  /* ---------- destino "mi tienda": pasar la mercancía al inventario ---------- */
  function cargarAlInventario(imp) {
    var S = saldos(imp);
    App.confirmar(
      "Voy a crear un pedido de reposición con el flete de esta importación (" + App.fmt.usd(S.flete) + "). " +
      "Ojo: NO suma stock todavía, porque estos renglones no están amarrados a productos de tu catálogo. " +
      "Tú le asignas los productos en Fábricas → Pedidos de reposición y ahí sí suma.",
      { accion: "Crear el pedido" }
    ).then(function (si) {
      if (!si) return;
      App.db.compras = App.db.compras || [];
      App.db.compras.push({
        id: App.uid("co"),
        proveedorId: imp.proveedorId,
        fecha: App.hoyISO(),
        estado: "recibida",
        recibidaEl: App.hoyISO(),
        fleteTotal: S.flete,
        notas: "Desde importación " + (imp.codigo || imp.titulo || ""),
        items: []
      });
      App.save();
      App.toast("Pedido creado. Ábrelo en Fábricas → Pedidos de reposición y asígnale los productos para que sume stock.");
      App.render();
    });
  }
})();
