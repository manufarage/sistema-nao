/* ============================================================
   data.js - modelo, localStorage, seed demo y cálculos (App.calc)
   ============================================================ */
window.App = window.App || {};

(function () {
  "use strict";

  var LS_KEY = "nao_sistema_v1";

  /* ---------- utilidades de fecha ---------- */
  function pad(n) { return (n < 10 ? "0" : "") + n; }
  function toISO(d) { return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()); }
  function fromISO(s) { var p = s.slice(0, 10).split("-"); return new Date(+p[0], +p[1] - 1, +p[2]); }
  function addDays(d, n) { var x = new Date(d); x.setDate(x.getDate() + n); return x; }
  function hoyISO() { return toISO(new Date()); }
  function mesRango(offset) {
    var h = new Date(); var d1 = new Date(h.getFullYear(), h.getMonth() + (offset || 0), 1);
    var d2 = new Date(h.getFullYear(), h.getMonth() + (offset || 0) + 1, 0);
    return [toISO(d1), toISO(d2)];
  }

  App.uid = function (pre) { return (pre || "id") + "_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 7); };
  App.toISO = toISO; App.fromISO = fromISO; App.addDays = addDays; App.hoyISO = hoyISO; App.mesRango = mesRango;
  App.esBs = function (metodo) { return /bs|bol[ií]var|pago m[oó]vil/i.test(metodo || ""); };

  /* ---------- geografía de Venezuela (24 entidades + ciudades principales) ---------- */
  App.VZLA = {
    "Amazonas": ["Puerto Ayacucho"],
    "Anzoátegui": ["Barcelona", "Puerto La Cruz", "Lechería", "El Tigre", "Anaco"],
    "Apure": ["San Fernando de Apure", "Guasdualito"],
    "Aragua": ["Maracay", "Turmero", "La Victoria", "Cagua", "El Limón"],
    "Barinas": ["Barinas", "Socopó"],
    "Bolívar": ["Puerto Ordaz", "San Félix", "Ciudad Bolívar", "Upata"],
    "Carabobo": ["Valencia", "Naguanagua", "San Diego", "Guacara", "Puerto Cabello"],
    "Cojedes": ["San Carlos", "Tinaquillo"],
    "Delta Amacuro": ["Tucupita"],
    "Distrito Capital": ["Caracas"],
    "Falcón": ["Punto Fijo", "Coro"],
    "Guárico": ["San Juan de los Morros", "Calabozo", "Valle de la Pascua"],
    "La Guaira": ["La Guaira", "Catia La Mar", "Maiquetía"],
    "Lara": ["Barquisimeto", "Cabudare", "Carora", "El Tocuyo"],
    "Mérida": ["Mérida", "El Vigía", "Ejido"],
    "Miranda": ["Los Teques", "Guarenas", "Guatire", "Charallave", "Ocumare del Tuy", "Santa Teresa del Tuy", "San Antonio de los Altos", "Higuerote"],
    "Monagas": ["Maturín", "Punta de Mata"],
    "Nueva Esparta": ["Porlamar", "Pampatar", "La Asunción", "Juangriego"],
    "Portuguesa": ["Acarigua", "Araure", "Guanare"],
    "Sucre": ["Cumaná", "Carúpano"],
    "Táchira": ["San Cristóbal", "Táriba", "Rubio", "La Fría"],
    "Trujillo": ["Valera", "Trujillo", "Boconó"],
    "Yaracuy": ["San Felipe", "Yaritagua", "Chivacoa"],
    "Zulia": ["Maracaibo", "Cabimas", "Ciudad Ojeda", "San Francisco", "Machiques"]
  };
  /* posiciones aproximadas para el mapa de mosaico (col, fila) y abreviatura */
  App.VZLA_TILES = {
    "Zulia": [0, 0, "ZUL"], "Falcón": [1, 0, "FAL"], "Carabobo": [2, 0, "CBO"], "La Guaira": [3, 0, "LG"],
    "Distrito Capital": [4, 0, "DC"], "Miranda": [5, 0, "MIR"], "Anzoátegui": [6, 0, "ANZ"], "Sucre": [7, 0, "SUC"], "Nueva Esparta": [8, 0, "NE"],
    "Trujillo": [0, 1, "TRU"], "Lara": [1, 1, "LAR"], "Yaracuy": [2, 1, "YAR"], "Aragua": [3, 1, "ARA"],
    "Guárico": [4, 1, "GUÁ"], "Monagas": [6, 1, "MON"], "Delta Amacuro": [7, 1, "DA"],
    "Mérida": [0, 2, "MÉR"], "Barinas": [1, 2, "BAR"], "Portuguesa": [2, 2, "POR"], "Cojedes": [3, 2, "COJ"], "Bolívar": [6, 2, "BOL"],
    "Táchira": [0, 3, "TÁC"], "Apure": [2, 3, "APU"], "Amazonas": [5, 3, "AMA"]
  };

  /* ---------- arranque limpio ----------
     NAO no trae datos de ejemplo: el sistema nace vacío y se llena con
     trabajo real. En modo nube la verdad vive en Supabase; este seed solo
     aplica al modo local (sin conexión configurada). */
  function buildSeed() {
    var db = {
      meta: { version: 5, creadoEl: new Date().toISOString(), actualizadoEl: new Date().toISOString(), esDemo: false, ultimoRespaldo: null },
      settings: JSON.parse(JSON.stringify(DEFAULTS_SETTINGS)),
      usuarios: [
        { id: "u1", nombre: "Manuel", email: "manuel@nao.local", clave: "nao2026", rol: "super", permisos: "*", comision: 0, emoji: "⚓" }
      ]
    };
    Object.keys(NUBE_TABLAS).forEach(function (col) { db[col] = []; });
    return db;
  }

  /* ---------- carga / persistencia ---------- */
  App.load = function () {
    if (App.MODO_NUBE) {
      /* en nube la verdad vive en el servidor; el caché local solo acelera el arranque */
      App.db = dbVacio();
      try {
        var cache = localStorage.getItem(CACHE_NUBE);
        if (cache) App.db = JSON.parse(cache);
      } catch (eN) { }
      return;
    }
    try {
      var raw = localStorage.getItem(LS_KEY);
      if (raw) { App.db = JSON.parse(raw); migrar(); return; }
    } catch (e) { /* seed limpio */ }
    App.db = buildSeed();
    App.save();
  };
  function migrar() {
    var db = App.db;
    if ((db.meta.version || 1) < 2) {
      // v2: estados de envío por pasos - "pendiente" pasa a "preparando"
      (db.ventas || []).forEach(function (v) {
        if (v.entrega && v.entrega.estado === "pendiente") v.entrega.estado = "preparando";
      });
      db.meta.version = 2;
      App.save();
    }
    if (db.meta.version < 3) {
      // v3: solo IG/WhatsApp como canales, sin Pago Móvil (queda Bolívares),
      // Yummy pasa de agencia a motorizado, categorías de gasto, ads por producto
      var s3 = db.settings;
      s3.canales = ["Instagram", "WhatsApp"];
      s3.metodosPago = (s3.metodosPago || []).filter(function (m) { return m !== "Pago Móvil (Bs)"; });
      var yummy = (s3.agencias || []).filter(function (a) { return /yummy/i.test(a.nombre); })[0];
      if (yummy) {
        var usada = (db.ventas || []).some(function (v) { return v.entrega && v.entrega.agenciaId === yummy.id; });
        if (!usada) s3.agencias = s3.agencias.filter(function (a) { return a.id !== yummy.id; });
      }
      if (!(db.motorizados || []).some(function (m) { return /yummy/i.test(m.nombre); })) {
        db.motorizados.push({ id: App.uid("m"), nombre: "Yummy Rides", telefono: "" });
      }
      if (!s3.categoriasGasto) s3.categoriasGasto = ["Ads Instagram", "Papelería y etiquetas", "Empaques", "Transporte y envíos", "Servicios", "Comisiones", "Otros"];
      (db.productos || []).forEach(function (p) {
        if (p.costoAds == null) p.costoAds = 0;
        if (p.presupuestoAds == null) p.presupuestoAds = 0;
      });
      if (!db.creativos) db.creativos = [];
      db.meta.version = 3;
      App.save();
    }
    if (db.meta.version < 4) {
      // v4: compras a proveedores, kardex de movimientos, cierres de caja
      if (!db.compras) db.compras = [];
      if (!db.movimientos) db.movimientos = [];
      if (!db.cierres) db.cierres = [];
      db.meta.version = 4;
      App.save();
    }
    if (db.meta.version < 5) {
      // v5: auditoría de acciones sensibles + candado de precios para vendedores
      if (!db.auditoria) db.auditoria = [];
      if (db.settings.bloquearPrecioVendedor == null) db.settings.bloquearPrecioVendedor = true;
      db.meta.version = 5;
      App.save();
    }
  }

  /* etiquetas y colores de los pasos de envío */
  App.envioEstado = {
    label: { preparando: "Preparando", por_llevar: "Por llevar", enviado: "En camino", entregado: "Entregado", por_retirar: "Por retirar" },
    pill: { preparando: "warn", por_llevar: "info", enviado: "", entregado: "ok", por_retirar: "tint" }
  };
  App.save = function () {
    App.db.meta.actualizadoEl = new Date().toISOString();
    if (App.MODO_NUBE) {
      guardarCache();
      pushNube();
      return;
    }
    try { localStorage.setItem(LS_KEY, JSON.stringify(App.db)); }
    catch (e) { if (App.toast) App.toast("No se pudo guardar (¿almacenamiento lleno?)", "err"); }
  };
  App.resetDemo = function () {
    if (App.MODO_NUBE) { if (App.toast) App.toast("En la versión online no hay demo que restaurar", "err"); return; }
    localStorage.removeItem(LS_KEY);
    location.reload();
  };
  /* estreno: borra TODO lo de ejemplo y deja el sistema listo para datos reales.
     Conserva: usuarios, tiendas, agencias, métodos, categorías, plantilla, festividades y tasas. */
  App.empezarDeCero = function () {
    if (App.MODO_NUBE) {
      if (App.toast) App.toast("En la nube el borrado total se coordina con Manuel (protege la data de todos los dispositivos)", "err");
      return;
    }
    var db = App.db;
    db.productos = [];
    db.clientes = [];
    db.ventas = [];
    db.promos = [];
    db.gastos = [];
    db.creativos = [];
    db.cambiosDivisa = [];
    db.proveedores = [];
    db.compras = [];
    db.movimientos = [];
    db.cierres = [];
    db.auditoria = [];
    db.meta.esDemo = false;
    db.meta.ultimoRespaldo = null;
    var t = db.settings.tasas;
    t.historial = (t.historial || []).slice(-1);
    App.audit("estreno", "Datos de ejemplo eliminados - empieza el registro real");
    App.save();
    location.reload();
  };
  App.exportar = function () { return JSON.stringify(App.db, null, 1); };
  App.importar = function (json) {
    if (App.MODO_NUBE) throw new Error("En la versión online no se importan respaldos locales - los datos viven en el servidor");
    var data = JSON.parse(json);
    if (!data || !data.meta || !data.settings || !data.ventas) throw new Error("Formato inválido");
    App.db = data; App.save();
  };

  /* ---------- tasa BCV: auto-actualización best-effort (requiere internet) ---------- */
  App.actualizarTasas = function () {
    var out = { usd: null, eur: null };
    var p1 = fetch("https://ve.dolarapi.com/v1/dolares/oficial").then(function (r) { return r.json(); })
      .then(function (j) { if (j && j.promedio) out.usd = Math.round(j.promedio * 100) / 100; }).catch(function () { });
    /* misma fuente que el dólar (espejo del BCV oficial, tasa vigente del día) */
    var p2 = fetch("https://ve.dolarapi.com/v1/euros/oficial").then(function (r) { return r.json(); })
      .then(function (j) { if (j && j.promedio) out.eur = Math.round(j.promedio * 100) / 100; }).catch(function () { });
    return Promise.all([p1, p2]).then(function () {
      if (out.usd || out.eur) {
        var t = App.db.settings.tasas;
        if (out.usd) t.usd = out.usd;
        if (out.eur) t.eur = out.eur;
        t.fecha = hoyISO();
        t.historial = (t.historial || []).filter(function (h) { return h.fecha !== t.fecha; });
        t.historial.push({ fecha: t.fecha, usd: t.usd, eur: t.eur });
        if (t.historial.length > 120) t.historial = t.historial.slice(-120);
        App.save();
      }
      return out;
    });
  };

  /* ---------- búsquedas básicas ---------- */
  App.prod = function (id) { return App.db.productos.filter(function (p) { return p.id === id; })[0] || null; };
  App.cliente = function (id) { return App.db.clientes.filter(function (c) { return c.id === id; })[0] || null; };
  App.usuario = function (id) { return App.db.usuarios.filter(function (u) { return u.id === id; })[0] || null; };
  App.agencia = function (id) { return App.db.settings.agencias.filter(function (a) { return a.id === id; })[0] || null; };
  App.motorizado = function (id) { return App.db.motorizados.filter(function (m) { return m.id === id; })[0] || null; };
  App.tienda = function (id) { return App.db.settings.tiendas.filter(function (t) { return t.id === id; })[0] || null; };
  App.promo = function (id) { return App.db.promos.filter(function (p) { return p.id === id; })[0] || null; };

  /* ---------- cálculos de negocio ---------- */
  var C = App.calc = {};

  C.prodCosto = function (p) { return (p.costoChina || 0) + (p.flete || 0); };
  C.prodStock = function (p) {
    if (p.tallas && p.tallas.length) { return p.tallas.reduce(function (s, t) { return s + (+t.stock || 0); }, 0); }
    return +p.stock || 0;
  };
  C.prodMargen = function (p) {
    var c = C.prodCosto(p); if (!p.precio) return 0;
    return (p.precio - c) / p.precio;
  };

  C.tasaHoy = function () { return App.db.settings.tasas; };
  C.tasaCobro = function () {
    var s = App.db.settings;
    return s.tasaCobro === "usd" ? s.tasas.usd : s.tasas.eur;
  };
  C.bsDe = function (usd) { return usd * C.tasaCobro(); };

  C.ventaTotal = function (v) {
    var t = v.totalUsd != null ? v.totalUsd : v.items.reduce(function (s, it) { return s + it.cant * it.precioUnit; }, 0) - (v.descuento || 0);
    // las devoluciones con reintegro restan del total neto de la venta
    (v.devoluciones || []).forEach(function (d) { t -= +d.montoUsd || 0; });
    return Math.round(t * 100) / 100;
  };
  C.ventaCosto = function (v) {
    var c = v.items.reduce(function (s, it) {
      var p = App.prod(it.productoId);
      return s + (p ? C.prodCosto(p) * it.cant : 0);
    }, 0);
    (v.devoluciones || []).forEach(function (d) {
      (d.items || []).forEach(function (it) {
        var p = App.prod(it.productoId);
        if (p) c -= C.prodCosto(p) * it.cant;
      });
    });
    return Math.max(0, c);
  };
  C.ventaSaldo = function (v) {
    if (v.estadoPago === "pagado") return 0;
    var abonado = (v.abonos || []).reduce(function (s, a) { return s + a.montoUsd; }, 0);
    return Math.max(0, C.ventaTotal(v) - abonado);
  };

  C.ventasEntre = function (d1, d2) {
    return App.db.ventas.filter(function (v) { var f = v.fecha.slice(0, 10); return f >= d1 && f <= d2; });
  };
  C.sum = function (lista) { return lista.reduce(function (s, v) { return s + C.ventaTotal(v); }, 0); };

  C.porCanal = function (lista) {
    var m = {};
    lista.forEach(function (v) { m[v.canal] = (m[v.canal] || 0) + C.ventaTotal(v); });
    return m;
  };
  C.metodoGrupo = function (metodo) {
    var m = (metodo || "").toLowerCase();
    if (App.esBs(m)) return "Bolívares";
    if (m.indexOf("zelle") >= 0) return "Zelle";
    if (m.indexOf("usdt") >= 0 || m.indexOf("binance") >= 0 || m.indexOf("cripto") >= 0) return "Cripto (USDT)";
    if (m.indexOf("efectivo") >= 0) return "Efectivo";
    return "Otros";
  };
  C.porMetodo = function (lista) {
    var m = {};
    lista.forEach(function (v) {
      if (v.pagos && v.pagos.length) {
        v.pagos.forEach(function (p) {
          var g = C.metodoGrupo(p.metodo);
          m[g] = (m[g] || 0) + (+p.montoUsd || 0);
        });
      } else {
        var g2 = C.metodoGrupo(v.metodoPago);
        m[g2] = (m[g2] || 0) + C.ventaTotal(v);
      }
    });
    return m;
  };
  C.porTienda = function (lista) {
    var m = { ljt: 0, evz: 0 };
    lista.forEach(function (v) {
      v.items.forEach(function (it) {
        var p = App.prod(it.productoId);
        var tid = p ? p.tienda : "ljt";
        m[tid] = (m[tid] || 0) + it.cant * it.precioUnit;
      });
    });
    return m;
  };
  C.topProductos = function (lista, n) {
    var m = {};
    lista.forEach(function (v) {
      v.items.forEach(function (it) {
        if (!m[it.productoId]) m[it.productoId] = { productoId: it.productoId, nombre: it.nombre, unidades: 0, usd: 0 };
        m[it.productoId].unidades += it.cant;
        m[it.productoId].usd += it.cant * it.precioUnit;
      });
    });
    var arr = Object.keys(m).map(function (k) { return m[k]; });
    arr.sort(function (a, b) { return b.usd - a.usd; });
    return arr.slice(0, n || 5);
  };

  C.serieDiaria = function (nDias) {
    var out = [], m = {};
    App.db.ventas.forEach(function (v) { var f = v.fecha.slice(0, 10); m[f] = (m[f] || 0) + C.ventaTotal(v); });
    for (var i = nDias - 1; i >= 0; i--) {
      var f2 = toISO(addDays(new Date(), -i));
      out.push({ fecha: f2, total: Math.round((m[f2] || 0) * 100) / 100 });
    }
    return out;
  };
  C.serieMensual = function (nMeses) {
    var out = [];
    for (var i = nMeses - 1; i >= 0; i--) {
      var r = mesRango(-i);
      out.push({ mes: r[0].slice(0, 7), total: Math.round(C.sum(C.ventasEntre(r[0], r[1])) * 100) / 100 });
    }
    return out;
  };
  C.deltaPct = function (actual, previo) {
    if (!previo) return null;
    return (actual - previo) / previo * 100;
  };

  C.mejoresDiasSemana = function (lista) {
    var tot = [0, 0, 0, 0, 0, 0, 0], cnt = [0, 0, 0, 0, 0, 0, 0], vistos = {};
    lista.forEach(function (v) {
      var f = v.fecha.slice(0, 10);
      var dw = fromISO(f).getDay();
      tot[dw] += C.ventaTotal(v);
      if (!vistos[f]) { vistos[f] = 1; cnt[dw]++; }
    });
    // lunes primero
    var orden = [1, 2, 3, 4, 5, 6, 0], labels = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];
    return orden.map(function (dw, i) {
      return { dia: labels[i], promedio: cnt[dw] ? Math.round(tot[dw] / cnt[dw] * 100) / 100 : 0, total: Math.round(tot[dw] * 100) / 100 };
    });
  };

  C.pendientesEnvio = function () {
    return App.db.ventas.filter(function (v) {
      return v.entrega && v.entrega.tipo !== "retiro" && (v.entrega.estado === "preparando" || v.entrega.estado === "por_llevar");
    }).sort(function (a, b) { return a.fecha < b.fecha ? -1 : 1; });
  };
  C.porLlevar = function () {
    return C.pendientesEnvio().filter(function (v) { return v.entrega.estado === "por_llevar"; });
  };
  C.retirosPendientes = function () {
    return App.db.ventas.filter(function (v) {
      return v.entrega && v.entrega.tipo === "retiro" && v.entrega.estado === "por_retirar";
    }).sort(function (a, b) { return (a.entrega.fechaRetiro || a.fecha) < (b.entrega.fechaRetiro || b.fecha) ? -1 : 1; });
  };
  C.enTransito = function () {
    return App.db.ventas.filter(function (v) {
      return v.entrega && v.entrega.tipo !== "retiro" && v.entrega.estado === "enviado";
    }).sort(function (a, b) { return a.fecha > b.fecha ? -1 : 1; });
  };
  C.transitoLargo = function (dias) {
    var limite = toISO(addDays(new Date(), -(dias || 3)));
    return C.enTransito().filter(function (v) {
      var desde = (v.entrega.guia && v.entrega.guia.fecha) || v.fecha.slice(0, 10);
      return desde <= limite;
    });
  };
  C.pagosPendientes = function () {
    return App.db.ventas.filter(function (v) { return v.estadoPago !== "pagado"; })
      .sort(function (a, b) { return a.fecha > b.fecha ? -1 : 1; });
  };
  C.stockBajo = function () {
    return App.db.productos.filter(function (p) { return C.prodStock(p) <= (p.stockMin || 0); });
  };

  C.comisiones = function (d1, d2) {
    var lista = C.ventasEntre(d1, d2), m = {};
    lista.forEach(function (v) {
      var u = App.usuario(v.vendedorId);
      if (!u || !u.comision) return;
      if (!m[u.id]) m[u.id] = { usuario: u, ventas: 0, usd: 0, comision: 0 };
      m[u.id].ventas++;
      m[u.id].usd += C.ventaTotal(v);
      m[u.id].comision += C.ventaTotal(v) * u.comision / 100;
    });
    return Object.keys(m).map(function (k) { return m[k]; });
  };

  C.motorizadosResumen = function () {
    var m = {};
    App.db.motorizados.forEach(function (mo) { m[mo.id] = { motorizado: mo, carreras: 0, deuda: 0, pagado: 0, pendListado: [] }; });
    App.db.ventas.forEach(function (v) {
      var e = v.entrega;
      if (!e || e.tipo !== "motorizado" || !e.motorizadoId || !m[e.motorizadoId]) return;
      var r = m[e.motorizadoId];
      r.carreras++;
      if (e.pagadoMotorizado) { r.pagado += e.costoEnvio || 0; }
      else { r.deuda += e.costoEnvio || 0; r.pendListado.push(v); }
    });
    return Object.keys(m).map(function (k) { return m[k]; });
  };

  C.cajaBs = function () {
    var ingresosBs = 0, valorOrigenUsd = 0;
    App.db.ventas.forEach(function (v) {
      if (v.totalBs) { ingresosBs += v.totalBs; valorOrigenUsd += v.totalBs / (v.tasaUsd || C.tasaHoy().usd); }
    });
    var cambiadoBs = 0, cambiadoUsd = 0;
    (App.db.cambiosDivisa || []).forEach(function (c) { cambiadoBs += c.montoBs; cambiadoUsd += c.montoUsd; });
    var saldoBs = Math.max(0, ingresosBs - cambiadoBs);
    var tasaU = C.tasaHoy().usd;
    var valorHoyUsd = saldoBs / tasaU;
    // pérdida por devaluación del saldo actual: valor que tenían esos Bs al cobrarlos (aprox FIFO simple: proporción)
    var propSaldo = ingresosBs ? saldoBs / ingresosBs : 0;
    var perdidaUsd = Math.max(0, valorOrigenUsd * propSaldo - valorHoyUsd);
    return {
      ingresosBs: ingresosBs, cambiadoBs: cambiadoBs, cambiadoUsd: cambiadoUsd,
      saldoBs: saldoBs, valorHoyUsd: valorHoyUsd, perdidaUsd: perdidaUsd, tasaUsd: tasaU
    };
  };

  C.gastosEntre = function (d1, d2, tipo) {
    return (App.db.gastos || []).filter(function (g) {
      return g.fecha >= d1 && g.fecha <= d2 && (!tipo || g.tipo === tipo);
    });
  };
  C.sumGastos = function (lista) { return lista.reduce(function (s, g) { return s + g.montoUsd; }, 0); };

  C.enviosNetos = function (lista) {
    var costo = 0, cobro = 0;
    lista.forEach(function (v) {
      if (v.entrega && v.entrega.tipo !== "retiro") {
        costo += v.entrega.costoEnvio || 0;
        cobro += v.entrega.cobroEnvio || 0;
      }
    });
    return { costo: costo, cobro: cobro, neto: cobro - costo };
  };

  C.utilidadMes = function (offset) {
    var r = mesRango(offset || 0);
    var lista = C.ventasEntre(r[0], r[1]);
    var ingresos = C.sum(lista);
    var costoMerc = lista.reduce(function (s, v) { return s + C.ventaCosto(v); }, 0);
    var gastos = C.sumGastos(C.gastosEntre(r[0], r[1]));
    var ads = C.sumGastos(C.gastosEntre(r[0], r[1], "ads"));
    var com = C.comisiones(r[0], r[1]).reduce(function (s, x) { return s + x.comision; }, 0);
    var env = C.enviosNetos(lista);
    return {
      rango: r, ventas: lista.length, ingresos: ingresos, costoMerc: costoMerc,
      utilidadBruta: ingresos - costoMerc, gastos: gastos, ads: ads, comisiones: com,
      envios: env, utilidadNeta: ingresos - costoMerc - gastos - com - (env.costo - env.cobro)
    };
  };

  C.roasMes = function (offset) {
    var r = mesRango(offset || 0);
    var ig = C.porCanal(C.ventasEntre(r[0], r[1]))["Instagram"] || 0;
    var ads = C.sumGastos(C.gastosEntre(r[0], r[1], "ads"));
    return { ventasIg: ig, ads: ads, roas: ads ? ig / ads : null };
  };

  C.porEstado = function (lista) {
    var m = {};
    lista.forEach(function (v) {
      var cli = App.cliente(v.clienteId);
      var est = cli && cli.estado ? cli.estado.trim() : null;
      if (!est) return;
      var key = Object.keys(App.VZLA).filter(function (k) { return k.toLowerCase() === est.toLowerCase(); })[0] || est;
      m[key] = (m[key] || 0) + C.ventaTotal(v);
    });
    return m;
  };
  C.adsDeProducto = function (productoId) {
    return (App.db.gastos || []).reduce(function (s, g) {
      return s + (g.tipo === "ads" && g.productoId === productoId ? g.montoUsd : 0);
    }, 0);
  };
  C.prodCostoConAds = function (p) { return C.prodCosto(p) + (+p.costoAds || 0); };
  C.sugerirCategoriaGasto = function (desc) {
    var reglas = [
      [/ads|instagram|publicidad|pauta|campañ/i, "Ads Instagram"],
      [/papeler|etiquet|sticker|impres/i, "Papelería y etiquetas"],
      [/bolsa|empaque|caja|envoltor/i, "Empaques"],
      [/env[íi]o|flete|transporte|gasolina|taxi|encomienda/i, "Transporte y envíos"],
      [/luz|internet|tel[ée]fono|servicio|agua|electricidad/i, "Servicios"],
      [/comisi[óo]n/i, "Comisiones"]
    ];
    for (var i = 0; i < reglas.length; i++) { if (reglas[i][0].test(desc || "")) return reglas[i][1]; }
    return null;
  };
  /* histórico de ventas de UN producto (para la ficha y el análisis) */
  C.prodVentasStats = function (productoId) {
    var st = { unidades: 0, usd: 0, ordenes: 0, primera: null, ultima: null, u30: 0, u90: 0 };
    var d30 = toISO(addDays(new Date(), -30)), d90 = toISO(addDays(new Date(), -90));
    App.db.ventas.forEach(function (v) {
      var f = v.fecha.slice(0, 10);
      var enVenta = false;
      v.items.forEach(function (it) {
        if (it.productoId !== productoId) return;
        enVenta = true;
        st.unidades += it.cant;
        st.usd += it.cant * it.precioUnit;
        if (f >= d30) st.u30 += it.cant;
        if (f >= d90) st.u90 += it.cant;
      });
      if (enVenta) {
        st.ordenes++;
        if (!st.primera || f < st.primera) st.primera = f;
        if (!st.ultima || f > st.ultima) st.ultima = f;
      }
    });
    return st;
  };
  /* análisis completo de todos los productos, con etiqueta de decisión */
  C.productosAnalisis = function () {
    return App.db.productos.map(function (p) {
      var st = C.prodVentasStats(p.id);
      st.producto = p;
      st.ganancia = st.usd - C.prodCosto(p) * st.unidades;
      st.stock = C.prodStock(p);
      st.ads = C.adsDeProducto(p.id);
      var ritmo30 = st.u30 / 30; // uds/día del último mes
      st.coberturaDias = ritmo30 > 0 ? Math.round(st.stock / ritmo30) : null;
      st.diasSinVenta = st.ultima ? Math.round((fromISO(hoyISO()) - fromISO(st.ultima)) / 864e5) : null;
      var creadoHace = p.creadoEl ? Math.round((fromISO(hoyISO()) - fromISO(p.creadoEl)) / 864e5) : 999;
      st.etiqueta = !st.unidades
        ? (creadoHace <= 30 ? "nuevo" : "muerto")
        : st.diasSinVenta > 60 ? "muerto"
          : st.diasSinVenta > 30 ? "lento"
            : (st.u30 >= 3 || st.usd >= 100) && st.diasSinVenta <= 14 ? "estrella" : "constante";
      st.sugerencia = st.etiqueta === "estrella"
        ? (st.coberturaDias != null && st.coberturaDias <= 14 ? "🔄 Se vende rápido y el stock se acaba: repón YA" : "⭐ Está funcionando: mantén stock y contenido")
        : st.etiqueta === "lento" ? "🏷️ Lleva más de un mes sin venderse: promo o contenido nuevo"
          : st.etiqueta === "muerto" ? "⚠️ Sin movimiento: evalúa liquidarlo con descuento"
            : st.etiqueta === "nuevo" ? "✨ Recién llegado: dale contenido para arrancar"
              : (st.coberturaDias != null && st.coberturaDias <= 14 ? "🔄 Al ritmo actual el stock dura ≈" + st.coberturaDias + " días: planifica reposición" : "✔️ Ritmo estable");
      return st;
    });
  };
  App.etiquetaProd = {
    label: { estrella: "⭐ estrella", constante: "✔️ constante", lento: "🐌 lento", muerto: "💀 sin movimiento", nuevo: "✨ nuevo" },
    pill: { estrella: "ok", constante: "info", lento: "warn", muerto: "danger", nuevo: "tint" }
  };

  C.productosSinContenido = function (dias) {
    var desde = toISO(addDays(new Date(), -(dias || 30)));
    var con = {};
    (App.db.creativos || []).forEach(function (c) { if (c.fecha >= desde && c.productoId) con[c.productoId] = 1; });
    return App.db.productos.filter(function (p) { return !con[p.id] && C.prodStock(p) > 0; });
  };

  C.clientesStats = function () {
    var m = {};
    App.db.ventas.forEach(function (v) {
      if (!v.clienteId) return;
      if (!m[v.clienteId]) m[v.clienteId] = { total: 0, compras: 0, ultima: null, productos: {} };
      var r = m[v.clienteId];
      r.total += C.ventaTotal(v);
      r.compras++;
      var f = v.fecha.slice(0, 10);
      if (!r.ultima || f > r.ultima) r.ultima = f;
      v.items.forEach(function (it) { r.productos[it.productoId] = (r.productos[it.productoId] || 0) + it.cant; });
    });
    return m;
  };
  /* precio vigente: si el producto está en remate, manda el precio de remate */
  C.precioVenta = function (p) {
    return p && p.remate && p.remate.activo && +p.remate.precioUsd > 0 ? +p.remate.precioUsd : +((p && p.precio) || 0);
  };

  /* nivel de fidelidad: el más alto cuyo mínimo cumpla (por compras O por gasto neto) */
  C.nivelesConf = function () {
    return (App.db.settings && App.db.settings.niveles) || DEFAULTS_SETTINGS.niveles;
  };
  C.nivelCliente = function (clienteId, statsOpc) {
    var st = statsOpc || C.clientesStats()[clienteId];
    if (!st) return null;
    var mejor = null;
    C.nivelesConf().forEach(function (n) {
      var porCompras = (+n.minCompras || 0) > 0 && st.compras >= +n.minCompras;
      var porGasto = (+n.minUsd || 0) > 0 && st.total >= +n.minUsd;
      if (porCompras || porGasto) mejor = n;
    });
    return mejor;
  };

  /* devoluciones acumuladas de un cliente (para verlas en su ficha) */
  C.devolucionesDe = function (clienteId) {
    var r = { veces: 0, montoUsd: 0 };
    App.db.ventas.forEach(function (v) {
      if (v.clienteId !== clienteId) return;
      (v.devoluciones || []).forEach(function (d) {
        r.veces++;
        r.montoUsd += +d.montoUsd || 0;
      });
    });
    return r;
  };

  C.clienteEstrella = function () {
    var stats = C.clientesStats(), best = null, bestId = null;
    Object.keys(stats).forEach(function (id) {
      if (!best || stats[id].total > best.total) { best = stats[id]; bestId = id; }
    });
    return bestId ? { cliente: App.cliente(bestId), stats: best } : null;
  };

  C.promoStats = function (promo) {
    var ventas = App.db.ventas.filter(function (v) { return v.promoId === promo.id; });
    var ingreso = C.sum(ventas);
    var costoU = promo.items.reduce(function (s, it) {
      var p = App.prod(it.productoId);
      return s + (p ? C.prodCosto(p) * it.cant : 0);
    }, 0);
    var regular = promo.items.reduce(function (s, it) {
      var p = App.prod(it.productoId);
      return s + (p ? p.precio * it.cant : 0);
    }, 0);
    return {
      ventas: ventas.length, ingreso: ingreso,
      costoUnit: costoU, precioRegular: regular,
      margenUnit: promo.precioPromo - costoU,
      margenPct: promo.precioPromo ? (promo.precioPromo - costoU) / promo.precioPromo : 0,
      ganancia: ventas.length * (promo.precioPromo - costoU)
    };
  };
  C.promoEstado = function (promo) {
    var h = hoyISO();
    if (h < promo.desde) return "programada";
    if (h > promo.hasta) return "finalizada";
    return "activa";
  };

  C.proxFestividades = function (limite) {
    var h = hoyISO();
    var fest = (App.db.festividades || []).slice().sort(function (a, b) { return a.fecha < b.fecha ? -1 : 1; });
    var prox = fest.filter(function (f) { return f.fecha >= h; });
    return (limite ? prox.slice(0, limite) : prox);
  };
  C.festEnAviso = function () {
    var h = fromISO(hoyISO());
    return C.proxFestividades().filter(function (f) {
      var dias = Math.round((fromISO(f.fecha) - h) / 86400000);
      return dias <= (f.diasAviso || App.db.settings.avisoFestDias || 21);
    });
  };
  C.diasHasta = function (isoF) {
    return Math.round((fromISO(isoF) - fromISO(hoyISO())) / 86400000);
  };

  /* ---------- kardex: todo movimiento de stock queda registrado ---------- */
  C.registrarMov = function (productoId, talla, delta, motivo, refId, nota) {
    if (!delta) return;
    if (!App.db.movimientos) App.db.movimientos = [];
    App.db.movimientos.push({
      id: App.uid("mv"),
      fecha: hoyISO() + " " + new Date().toTimeString().slice(0, 5),
      productoId: productoId, talla: talla || null,
      delta: delta, motivo: motivo || "ajuste", refId: refId || null, nota: nota || "",
      usuarioId: App.auth && App.auth.user ? App.auth.user.id : null
    });
    if (App.db.movimientos.length > 1500) App.db.movimientos = App.db.movimientos.slice(-1200);
  };
  /* reponer unidades específicas (devoluciones) */
  C.reponerItems = function (items, refId, motivo) {
    items.forEach(function (it) {
      var p = App.prod(it.productoId);
      if (!p) return;
      if (p.tallas && p.tallas.length && it.talla) {
        p.tallas.forEach(function (t) { if (t.talla === it.talla) t.stock = (+t.stock || 0) + it.cant; });
      } else if (p.tallas && p.tallas.length) {
        p.tallas[0].stock = (+p.tallas[0].stock || 0) + it.cant;
      } else {
        p.stock = (+p.stock || 0) + it.cant;
      }
      C.registrarMov(it.productoId, it.talla, +it.cant, motivo || "devolucion", refId);
    });
  };

  /* ---------- compras a proveedores ---------- */
  App.compraDe = function (id) { return (App.db.compras || []).filter(function (c) { return c.id === id; })[0] || null; };
  C.compraTotales = function (co) {
    var uds = 0, merc = 0;
    (co.items || []).forEach(function (it) { uds += +it.cant || 0; merc += (+it.cant || 0) * (+it.costoUnit || 0); });
    return { uds: uds, mercancia: merc, total: merc + (+co.fleteTotal || 0), fletePorUd: uds ? (+co.fleteTotal || 0) / uds : 0 };
  };
  C.compraRecibir = function (co) {
    var tot = C.compraTotales(co);
    co.items.forEach(function (it) {
      var p = App.prod(it.productoId);
      if (!p) return;
      if (p.tallas && p.tallas.length) {
        var talla = it.talla || p.tallas[0].talla;
        var enc = p.tallas.filter(function (t) { return t.talla === talla; })[0];
        if (enc) enc.stock = (+enc.stock || 0) + it.cant;
        else p.tallas.push({ talla: talla, stock: it.cant });
      } else {
        p.stock = (+p.stock || 0) + it.cant;
      }
      if (+it.costoUnit > 0) p.costoChina = +it.costoUnit;      // costo de reposición más reciente
      p.flete = Math.round(tot.fletePorUd * 100) / 100;          // flete prorrateado por unidad
      C.registrarMov(it.productoId, it.talla || null, +it.cant, "compra", co.id, "recepción de pedido");
    });
    co.estado = "recibida";
    co.recibidaEl = hoyISO();
  };
  C.enCaminoDeProducto = function (pid) {
    var out = null;
    (App.db.compras || []).forEach(function (co) {
      if (co.estado === "recibida") return;
      (co.items || []).forEach(function (it) {
        if (it.productoId !== pid) return;
        if (!out) out = { cant: 0, llegadaEst: co.llegadaEst || null };
        out.cant += +it.cant || 0;
        if (co.llegadaEst && (!out.llegadaEst || co.llegadaEst < out.llegadaEst)) out.llegadaEst = co.llegadaEst;
      });
    });
    return out;
  };

  /* ---------- cierre de caja: cobrado real del día por método ---------- */
  C.cobradoDelDia = function (fecha) {
    var por = {}, total = 0, ops = 0;
    function add(metodo, monto) {
      if (!monto) return;
      var g = C.metodoGrupo(metodo);
      por[g] = (por[g] || 0) + monto;
      total += monto; ops++;
    }
    App.db.ventas.forEach(function (v) {
      var fv = v.fecha.slice(0, 10);
      var abonos = v.abonos || [];
      if (fv === fecha && v.estadoPago === "pagado" && !abonos.length) {
        if (v.pagos && v.pagos.length) v.pagos.forEach(function (p) { add(p.metodo, +p.montoUsd || 0); });
        else add(v.metodoPago, C.ventaTotal(v));
      }
      abonos.forEach(function (a) { if (a.fecha === fecha) add(a.metodo || v.metodoPago, +a.montoUsd || 0); });
      (v.devoluciones || []).forEach(function (d) { if (d.fecha === fecha) add(d.metodo || v.metodoPago, -(+d.montoUsd || 0)); });
      // delivery cobrado por adelantado (usualmente en Bs, va aparte del total)
      if (fv === fecha && v.entrega && v.entrega.tipo === "motorizado" &&
        v.entrega.deliveryPagado !== false && (v.entrega.cobroEnvio || 0) > 0) {
        add("Bolívares", +v.entrega.cobroEnvio);
      }
    });
    return { porGrupo: por, total: Math.round(total * 100) / 100, operaciones: ops };
  };

  /* ---------- auditoría: quién hizo qué (acciones sensibles) ---------- */
  App.audit = function (tipo, detalle) {
    if (!App.db.auditoria) App.db.auditoria = [];
    App.db.auditoria.push({
      id: App.uid("au"),
      fecha: hoyISO() + " " + new Date().toTimeString().slice(0, 5),
      usuarioId: App.auth && App.auth.user ? App.auth.user.id : null,
      tipo: tipo, detalle: detalle || ""
    });
    if (App.db.auditoria.length > 800) App.db.auditoria = App.db.auditoria.slice(-600);
  };
  /* ventas (sin promo) con algún ítem por debajo del precio de lista */
  C.ventasPrecioAlterado = function (dias) {
    var desde = toISO(addDays(new Date(), -(dias || 30)));
    var out = [];
    App.db.ventas.forEach(function (v) {
      if (v.fecha.slice(0, 10) < desde || v.promoId) return;
      var dif = 0, items = [], aprox = false;
      v.items.forEach(function (it) {
        var lista = it.precioLista;
        if (lista == null) {
          var p = App.prod(it.productoId);
          lista = p ? p.precio : null;
          aprox = true; // venta vieja sin snapshot: se compara contra el precio actual
        }
        if (lista != null && it.precioUnit < lista - 0.009) {
          dif += (lista - it.precioUnit) * it.cant;
          items.push({ nombre: it.nombre, precioUnit: it.precioUnit, lista: lista, cant: it.cant });
        }
      });
      if (items.length) out.push({ venta: v, dif: Math.round(dif * 100) / 100, items: items, aprox: aprox });
    });
    return out.sort(function (a, b) { return b.dif - a.dif; });
  };

  /* ---------- respaldo ---------- */
  C.diasSinRespaldo = function () {
    var u = App.db.settings.ultimoRespaldo || App.db.meta.ultimoRespaldo;
    if (!u) return null;
    return Math.round((fromISO(hoyISO()) - fromISO(u)) / 864e5);
  };
  /* el marcador vive en settings (se sincroniza entre dispositivos); meta queda de respaldo local */
  App.marcarRespaldo = function () {
    App.db.settings.ultimoRespaldo = hoyISO();
    App.db.meta.ultimoRespaldo = hoyISO();
    App.save();
  };

  /* descontar / reponer stock al vender */
  C.descontarStock = function (venta, signo, motivo) {
    var s = signo || 1;
    var mot = motivo || (s > 0 ? "venta" : "venta revertida");
    venta.items.forEach(function (it) {
      C.registrarMov(it.productoId, it.talla || null, -s * it.cant, mot, venta.id);
    });
    venta.items.forEach(function (it) {
      var p = App.prod(it.productoId);
      if (!p) return;
      if (p.tallas && p.tallas.length && it.talla) {
        p.tallas.forEach(function (t) { if (t.talla === it.talla) t.stock = Math.max(0, (+t.stock || 0) - s * it.cant); });
      } else if (p.tallas && p.tallas.length) {
        // sin talla especificada: descuenta de la primera con stock
        var rest = it.cant;
        p.tallas.forEach(function (t) {
          if (s > 0) { var q = Math.min(rest, +t.stock || 0); t.stock -= q; rest -= q; }
        });
        if (s < 0 && p.tallas[0]) p.tallas[0].stock = (+p.tallas[0].stock || 0) + it.cant;
      } else {
        p.stock = Math.max(0, (+p.stock || 0) - s * it.cant);
      }
    });
  };

  /* ============================================================
     MODO NUBE (Supabase) - Fase 2
     La app trabaja igual que siempre sobre App.db en memoria;
     esta capa carga todo del servidor al iniciar, empuja las
     diferencias en cada App.save() (con cola offline) y escucha
     cambios de otros dispositivos en tiempo real.
     ============================================================ */
  var sb = null;
  App.MODO_NUBE = false;
  try {
    if (window.supabase && window.SUPABASE_URL && window.SUPABASE_KEY) {
      sb = window.supabase.createClient(window.SUPABASE_URL, window.SUPABASE_KEY);
      App.sb = sb;
      App.MODO_NUBE = true;
    }
  } catch (eSb) { App.MODO_NUBE = false; }

  var CACHE_NUBE = "nao_cache_nube";

  var DEFAULTS_SETTINGS = {
    nombreNegocio: "NAO",
    /* Tiendas = los negocios de venta propios (cada uno puede tener socio).
       El trabajo de agente de compras NO es una tienda: vive en sus propios
       módulos y solo lo ve quien tenga el permiso. */
    tiendas: [
      { id: "t1", nombre: "Mi tienda", corto: "Mi tienda", emoji: "🛍️", socios: [] }
    ],
    /* Plataformas donde se buscan fábricas: alimenta el filtro del directorio */
    plataformas: ["Alibaba", "1688", "Made-in-China", "Global Sources", "AliExpress", "DHgate", "Contacto directo", "Feria (Cantón)", "Otro"],
    /* Rubros: la segmentación "a qué se dedica la empresa" */
    rubros: ["Bicicletas y movilidad", "Electrónica", "Hogar y cocina", "Textil y confección", "Calzado", "Juguetería", "Herramientas", "Belleza y cuidado personal", "Repuestos", "Empaque", "Deportes", "Papelería", "Otro"],
    /* Rutas de importación que se trabajan */
    rutas: ["China → Venezuela", "China → Estados Unidos", "China → Panamá"],
    /* Conceptos de pago: separan mercancía, flete y comisión en ambos lados */
    conceptosPago: ["Mercancía", "Flete", "Comisión", "Aduana", "Otro"],
    canales: ["Instagram", "WhatsApp", "Referido", "Directo"],
    metodosPago: ["Zelle", "Efectivo USD", "Bolívares", "Zinli", "Binance USDT", "Transferencia internacional", "Wise", "Alipay"],
    categorias: ["Bicicletas", "Electrónica", "Hogar", "Cuidado personal", "Accesorios", "Repuestos", "Otro"],
    categoriasGasto: ["Ads", "Empaques", "Transporte y envíos", "Servicios", "Comisiones bancarias", "Muestras", "Aduana", "Otros"],
    /* niveles de fidelidad: se gana el más alto cuyo mínimo se cumpla (compras O gasto neto) */
    niveles: [
      { id: "frecuente", nombre: "Frecuente", emoji: "💗", minCompras: 3, minUsd: 100, descuentoPct: 0 },
      { id: "vip", nombre: "VIP", emoji: "💎", minCompras: 6, minUsd: 300, descuentoPct: 5 },
      { id: "estrella", nombre: "Estrella", emoji: "👑", minCompras: 10, minUsd: 600, descuentoPct: 10 }
    ],
    agencias: [
      { id: "ag1", nombre: "MRW" }, { id: "ag2", nombre: "Zoom" }, { id: "ag3", nombre: "Tealca" },
      { id: "ag4", nombre: "Domesa" }, { id: "ag5", nombre: "Liberty Express" }
    ],
    tasas: { fecha: "2026-01-01", usd: 0, eur: 0, historial: [] },
    tasaCobro: "eur",
    avisoFestDias: 21,
    bloquearPrecioVendedor: true,
    /* Aviso cuando la tarifa de un agente de carga lleva demasiados días sin revisar */
    avisoTarifaDias: 30,
    plantillaWhatsApp: "*{{producto}}*\n\n{{descripcion}}\n\n💵 Precio: *${{precio_usd}}*\n🇻🇪 En bolívares: *Bs {{precio_bs}}* (tasa del día)\n{{tallas_linea}}🏪 {{tienda}}\n\n📲 Escríbenos para reservar el tuyo."
  };

  /* mapeo colección local ↔ tabla nube (camelCase ↔ snake_case) */
  var NUBE_TABLAS = {
    productos: { tabla: "productos", campos: { sku: "sku", codigoBarras: "codigo_barras", nombre: "nombre", emoji: "emoji", tienda: "tienda", categoria: "categoria", genero: "genero", descripcion: "descripcion", tallas: "tallas", tipoVariante: "tipo_variante", stock: "stock", stockMin: "stock_min", costoChina: "costo_china", flete: "flete", costoAds: "costo_ads", presupuestoAds: "presupuesto_ads", precio: "precio", remate: "remate", fotos: "fotos", creadoEl: "creado_el" } },
    clientes: { tabla: "clientes", campos: { nombre: "nombre", telefono: "telefono", email: "email", estado: "estado", ciudad: "ciudad", direccion: "direccion", notas: "notas", creadoEl: "creado_el" } },
    ventas: { tabla: "ventas", ts: { fecha: "T" }, campos: { fecha: "fecha", canal: "canal", clienteId: "cliente_id", vendedorId: "vendedor_id", items: "items", promoId: "promo_id", descuento: "descuento", metodoPago: "metodo_pago", pagos: "pagos", totalUsd: "total_usd", tasaEur: "tasa_eur", tasaUsd: "tasa_usd", totalBs: "total_bs", estadoPago: "estado_pago", apartado: "apartado", abonos: "abonos", devoluciones: "devoluciones", entrega: "entrega", notas: "notas" } },
    motorizados: { tabla: "motorizados", campos: { nombre: "nombre", telefono: "telefono" } },
    promos: { tabla: "promos", campos: { nombre: "nombre", ocasion: "ocasion", desde: "desde", hasta: "hasta", items: "items", precioPromo: "precio_promo" } },
    gastos: { tabla: "gastos", campos: { fecha: "fecha", tipo: "tipo", categoria: "categoria", descripcion: "descripcion", tienda: "tienda", montoUsd: "monto_usd", productoId: "producto_id", desde: "desde", hasta: "hasta" } },
    creativos: { tabla: "creativos", campos: { fecha: "fecha", tipo: "tipo", tienda: "tienda", productoId: "producto_id", inversion: "inversion", mensajes: "mensajes", ventas: "ventas", comentario: "comentario" } },
    cambiosDivisa: { tabla: "cambios_divisa", campos: { fecha: "fecha", montoBs: "monto_bs", tasa: "tasa", montoUsd: "monto_usd", destino: "destino", notas: "notas" } },
    festividades: { tabla: "festividades", campos: { fecha: "fecha", nombre: "nombre", emoji: "emoji", diasAviso: "dias_aviso", notas: "notas" } },
    proveedores: { tabla: "proveedores", campos: { nombre: "nombre", nombreCn: "nombre_cn", plataforma: "plataforma", rubro: "rubro", etiquetas: "etiquetas", contacto: "contacto", wechat: "wechat", telefono: "telefono", url: "url", ciudad: "ciudad", provincia: "provincia", direccion: "direccion", verificado: "verificado", tradeAssurance: "trade_assurance", anios: "anios", rating: "rating", calificacion: "calificacion", estado: "estado", moqTipico: "moq_tipico", diasProduccion: "dias_produccion", contactos: "contactos", catalogos: "catalogos", productos: "productos", notas: "notas", creadoEl: "creado_el" } },
    compras: { tabla: "compras", campos: { proveedorId: "proveedor_id", fecha: "fecha", estado: "estado", llegadaEst: "llegada_est", recibidaEl: "recibida_el", fleteTotal: "flete_total", notas: "notas", items: "items" } },
    forwarders: { tabla: "forwarders", campos: { nombre: "nombre", contacto: "contacto", telefono: "telefono", wechat: "wechat", email: "email", web: "web", shippingMark: "shipping_mark", rutas: "rutas", almacenes: "almacenes", estado: "estado", notas: "notas", creadoEl: "creado_el" } },
    tarifas: { tabla: "tarifas", campos: { forwarderId: "forwarder_id", ruta: "ruta", via: "via", unidad: "unidad", precio: "precio", minimo: "minimo", diasTransito: "dias_transito", incluye: "incluye", vigenteDesde: "vigente_desde", revisadaEl: "revisada_el", notas: "notas" } },
    cotizaciones: { tabla: "cotizaciones", campos: { titulo: "titulo", descripcion: "descripcion", clienteId: "cliente_id", tienda: "tienda", cantidad: "cantidad", unidad: "unidad", fecha: "fecha", estado: "estado", ofertas: "ofertas", ganadora: "ganadora", forwarderId: "forwarder_id", tarifaId: "tarifa_id", notas: "notas", creadoEl: "creado_el" } },
    importaciones: { tabla: "importaciones", campos: { codigo: "codigo", titulo: "titulo", destino: "destino", tienda: "tienda", clienteId: "cliente_id", proveedorId: "proveedor_id", forwarderId: "forwarder_id", cotizacionId: "cotizacion_id", items: "items", valorFactura: "valor_factura", pagosFabrica: "pagos_fabrica", comisionTipo: "comision_tipo", comisionValor: "comision_valor", fleteEstimado: "flete_estimado", fleteReal: "flete_real", otrosCostos: "otros_costos", pagosCliente: "pagos_cliente", estado: "estado", fechas: "fechas", shippingMark: "shipping_mark", bl: "bl", buque: "buque", trackingAgente: "tracking_agente", guia: "guia", contenedor: "contenedor", pesoKg: "peso_kg", cbm: "cbm", documentos: "documentos", notas: "notas", creadoEl: "creado_el" } },
    tareas: { tabla: "tareas", campos: { titulo: "titulo", detalle: "detalle", fecha: "fecha", hecha: "hecha", hechaEl: "hecha_el", prioridad: "prioridad", origen: "origen", refTipo: "ref_tipo", refId: "ref_id", creadoEl: "creado_el" } },
    movimientos: { tabla: "movimientos", ts: { fecha: " " }, soloInsertar: true, campos: { fecha: "fecha", productoId: "producto_id", talla: "talla", delta: "delta", motivo: "motivo", refId: "ref_id", nota: "nota", usuarioId: "usuario_id" } },
    cierres: { tabla: "cierres", campos: { fecha: "fecha", porGrupo: "por_grupo", totalEsperado: "total_esperado", contadoEfectivo: "contado_efectivo", contadoBs: "contado_bs", difEfectivo: "dif_efectivo", difBs: "dif_bs", notas: "notas", usuarioId: "usuario_id" } },
    auditoria: { tabla: "auditoria", ts: { fecha: " " }, soloInsertar: true, campos: { fecha: "fecha", usuarioId: "usuario_id", tipo: "tipo", detalle: "detalle" } }
  };

  /* fechas: el front usa hora local; el servidor guarda timestamptz (UTC) */
  function tsALocal(ts, sep) {
    if (!ts) return ts;
    var d = new Date(ts);
    if (isNaN(d.getTime())) return ts;
    return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()) + (sep || "T") + pad(d.getHours()) + ":" + pad(d.getMinutes());
  }
  function localATs(s) {
    if (!s) return s;
    var m = String(s).match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})/);
    if (!m) return s;
    return new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]).toISOString();
  }

  function aLocal(col, fila) {
    var cfg = NUBE_TABLAS[col];
    var out = { id: fila.id };
    Object.keys(cfg.campos).forEach(function (k) {
      var v = fila[cfg.campos[k]];
      if (cfg.ts && cfg.ts[k]) v = tsALocal(v, cfg.ts[k]);
      out[k] = v === undefined ? null : v;
    });
    return out;
  }
  function aNube(col, item) {
    var cfg = NUBE_TABLAS[col];
    var out = { id: item.id };
    Object.keys(cfg.campos).forEach(function (k) {
      var v = item[k];
      if (cfg.ts && cfg.ts[k]) v = localATs(v);
      if (v === undefined) v = null;
      if (v === "") { // columnas date no aceptan cadena vacía
        var c = cfg.campos[k];
        if (c === "desde" || c === "hasta" || c === "llegada_est" || c === "recibida_el" ||
          c === "creado_el" || c === "vigente_desde" || c === "revisada_el" || c === "hecha_el" ||
          c === "fecha") v = null;
      }
      out[cfg.campos[k]] = v;
    });
    return out;
  }

  function dbVacio() {
    var db = {
      meta: { version: 5, esDemo: false, nube: true, ultimoRespaldo: null, actualizadoEl: new Date().toISOString() },
      settings: JSON.parse(JSON.stringify(DEFAULTS_SETTINGS)),
      usuarios: []
    };
    Object.keys(NUBE_TABLAS).forEach(function (col) { db[col] = []; });
    return db;
  }

  /* snapshots para detectar diferencias al guardar */
  var snapCols = {}, snapSettings = "", snapPerfiles = {};
  function refrescarSnapshotCol(col) {
    var m = {};
    (App.db[col] || []).forEach(function (it) { m[it.id] = JSON.stringify(it); });
    snapCols[col] = m;
  }
  function snapshotTodo() {
    Object.keys(NUBE_TABLAS).forEach(refrescarSnapshotCol);
    snapSettings = JSON.stringify(App.db.settings);
    snapPerfiles = {};
    (App.db.usuarios || []).forEach(function (u) {
      snapPerfiles[u.id] = JSON.stringify([u.nombre, u.emoji, u.rol, u.permisos, u.comision, u.tiendas, u.verCostos]);
    });
  }
  function guardarCache() {
    try { localStorage.setItem(CACHE_NUBE, JSON.stringify(App.db)); } catch (e) { }
  }

  /* estado visual de la sincronización */
  var estadoSync = "ok";
  function setEstadoSync(e) {
    estadoSync = e;
    var lbl = e === "ok" ? "☁️ Sincronizado" : e === "sync" ? "☁️ Guardando…" : "⚠️ Sin conexión - se guardará al volver";
    if (App.$$) App.$$("[data-sync-estado]").forEach(function (x) {
      x.textContent = lbl;
      x.style.color = e === "offline" ? "var(--danger)" : "";
    });
  }
  App.estadoSyncActual = function () { return estadoSync; };

  /* empuje de diferencias al servidor (con cola y reintento) */
  var sincronizando = false, colaPendiente = false, reintentoT = null, fallosDatos = 0;
  var ecosPendientes = {};
  function procesarEcosPendientes() {
    var tablas = Object.keys(ecosPendientes);
    ecosPendientes = {};
    tablas.forEach(rutaEco);
  }
  function pushNube() {
    if (!App.MODO_NUBE || !App.auth || !App.auth.user) return;
    if (sincronizando) { colaPendiente = true; return; }
    sincronizando = true;
    setEstadoSync("sync");
    var ops = [];
    if (JSON.stringify(App.db.settings) !== snapSettings) {
      ops.push(sb.from("settings").update({ data: App.db.settings }).eq("id", 1));
    }
    Object.keys(NUBE_TABLAS).forEach(function (col) {
      var cfg = NUBE_TABLAS[col];
      var previos = snapCols[col] || {};
      var vistos = {}, cambios = [];
      (App.db[col] || []).forEach(function (it) {
        vistos[it.id] = 1;
        if (previos[it.id] !== JSON.stringify(it)) cambios.push(aNube(col, it));
      });
      if (cambios.length) {
        ops.push(cfg.soloInsertar
          ? sb.from(cfg.tabla).upsert(cambios, { onConflict: "id", ignoreDuplicates: true })
          : sb.from(cfg.tabla).upsert(cambios));
      }
      if (!cfg.soloInsertar) {
        var borrar = [];
        Object.keys(previos).forEach(function (id) { if (!vistos[id]) borrar.push(id); });
        if (borrar.length) ops.push(sb.from(cfg.tabla).delete().in("id", borrar));
      }
    });
    (App.db.usuarios || []).forEach(function (u) {
      var j = JSON.stringify([u.nombre, u.emoji, u.rol, u.permisos, u.comision, u.tiendas, u.verCostos]);
      if (snapPerfiles[u.id] !== j) {
        ops.push(sb.from("perfiles").update({ nombre: u.nombre, emoji: u.emoji, rol: u.rol, permisos: u.permisos, comision: u.comision, tiendas: u.tiendas || [], ver_costos: !!u.verCostos }).eq("id", u.id));
      }
    });
    if (!ops.length) {
      sincronizando = false;
      setEstadoSync("ok");
      if (colaPendiente) { colaPendiente = false; pushNube(); }
      return;
    }
    Promise.all(ops).then(function (resultados) {
      var conError = resultados.filter(function (r) { return r && r.error; })[0];
      if (conError) throw conError.error;
      snapshotTodo();
      try { localStorage.removeItem("nao_sync_pend"); } catch (e) { }
      sincronizando = false;
      fallosDatos = 0;
      setEstadoSync("ok");
      procesarEcosPendientes();
      if (colaPendiente) { colaPendiente = false; pushNube(); }
    }).catch(function (err) {
      sincronizando = false;
      try { localStorage.setItem("nao_sync_pend", "1"); } catch (e) { }
      setEstadoSync("offline");
      procesarEcosPendientes();
      /* error de DATOS (constraint, RLS, sesión vencida…) ≠ sin conexión: tras 3 intentos
         se avisa con el mensaje real y se deja de reintentar en loop (el próximo guardado reintenta) */
      var msg = String((err && err.message) || "");
      var esDatos = !!(err && (err.code || err.status)) && !/fetch|network|load failed/i.test(msg);
      if (esDatos && ++fallosDatos >= 3) {
        fallosDatos = 0;
        if (App.toast) App.toast("⚠️ Un cambio no se pudo guardar en el servidor: " + msg.slice(0, 140), "err");
        return;
      }
      clearTimeout(reintentoT);
      reintentoT = setTimeout(pushNube, 15000);
    });
  }
  App.sincronizarAhora = function () { pushNube(); };
  window.addEventListener("online", function () { if (App.MODO_NUBE) pushNube(); });

  /* carga completa desde el servidor */
  App.cargarNube = function () {
    var db = dbVacio();
    var q = [];
    q.push(sb.from("settings").select("data").eq("id", 1).single().then(function (r) {
      if (r.error) throw r.error;
      if (r.data && r.data.data) db.settings = r.data.data;
    }));
    q.push(sb.from("perfiles").select("*").then(function (r) {
      if (r.error) throw r.error;
      db.usuarios = (r.data || []).map(function (p) {
        return { id: p.id, nombre: p.nombre, emoji: p.emoji, rol: p.rol, permisos: p.permisos, comision: +p.comision || 0, tiendas: p.tiendas || [], verCostos: !!p.ver_costos, email: "", clave: null };
      });
    }));
    Object.keys(NUBE_TABLAS).forEach(function (col) {
      var cfg = NUBE_TABLAS[col];
      q.push(consultaCol(col, cfg).then(function (r) {
        if (r.error) throw r.error;
        db[col] = (r.data || []).map(function (f) { return aLocal(col, f); });
      }));
    });
    return Promise.all(q).then(function () {
      Object.keys(DEFAULTS_SETTINGS).forEach(function (k) {
        if (db.settings[k] == null) db.settings[k] = JSON.parse(JSON.stringify(DEFAULTS_SETTINGS[k]));
      });
      App.db = db;
      snapshotTodo();
      guardarCache();
      relinkAuthUser();
      return db;
    });
  };
  /* kardex y auditoría en orden cronológico garantizado (el heap de Postgres no lo asegura) */
  function consultaCol(col, cfg) {
    var sel = sb.from(cfg.tabla).select("*");
    if (col === "movimientos" || col === "auditoria") sel = sel.order("fecha", { ascending: true }).order("id", { ascending: true });
    return sel.range(0, 9999);
  }
  /* App.auth.user debe apuntar SIEMPRE al objeto vivo de App.db.usuarios (si no, sus ediciones no se suben) */
  function relinkAuthUser() {
    if (!App.auth || !App.auth.user) return;
    var email = App.auth.user.email || "";
    var p = (App.db.usuarios || []).filter(function (u) { return u.id === App.auth.user.id; })[0];
    if (p) { App.auth.user = p; App.auth.user.email = email; }
  }

  /* tiempo real: cambios de otros dispositivos.
     El merge conserva las REFERENCIAS de los objetos existentes: un sheet abierto
     sigue apuntando al objeto vivo y sus ediciones posteriores sí se guardan. */
  function mergeColeccion(col, filas) {
    var porId = {};
    (App.db[col] || []).forEach(function (o) { if (o && o.id != null) porId[o.id] = o; });
    App.db[col] = (filas || []).map(function (f) {
      var n = aLocal(col, f);
      var o = porId[n.id];
      if (!o) return n;
      Object.keys(o).forEach(function (k) { if (!(k in n)) delete o[k]; });
      Object.keys(n).forEach(function (k) { o[k] = n[k]; });
      return o;
    });
  }
  /* no repintar si hay un sheet abierto o un campo con foco (pisaría lo que se está escribiendo) */
  function uiOcupada() {
    if (App.haySheetAbierto && App.haySheetAbierto()) return true;
    var a = document.activeElement;
    return !!(a && (a.tagName === "INPUT" || a.tagName === "TEXTAREA" || a.tagName === "SELECT"));
  }
  function renderTrasEco() {
    if (App.render && !uiOcupada()) App.render();
  }
  var recargasT = {};
  function programarRecarga(col) {
    clearTimeout(recargasT[col]);
    recargasT[col] = setTimeout(function () {
      if (col === "__settings") {
        sb.from("settings").select("data").eq("id", 1).single().then(function (r) {
          if (r.data && r.data.data) {
            App.db.settings = r.data.data;
            snapSettings = JSON.stringify(App.db.settings);
            guardarCache();
            renderTrasEco();
          }
        });
        return;
      }
      if (col === "__perfiles") {
        sb.from("perfiles").select("*").then(function (r) {
          if (r.error || !r.data) return;
          mergeColeccion("usuarios", r.data.map(function (p) {
            return { id: p.id, nombre: p.nombre, emoji: p.emoji, rol: p.rol, permisos: p.permisos, comision: +p.comision || 0, tiendas: p.tiendas || [], verCostos: !!p.ver_costos, email: "", clave: null };
          }));
          relinkAuthUser();
          App.db.usuarios.forEach(function (u) { snapPerfiles[u.id] = JSON.stringify([u.nombre, u.emoji, u.rol, u.permisos, u.comision, u.tiendas, u.verCostos]); });
          guardarCache();
          renderTrasEco();
        });
        return;
      }
      var cfg = NUBE_TABLAS[col];
      consultaCol(col, cfg).then(function (r) {
        if (r.error) return;
        mergeColeccion(col, r.data);
        refrescarSnapshotCol(col);
        guardarCache();
        renderTrasEco();
      });
    }, 500);
  }
  function rutaEco(tabla) {
    if (tabla === "settings") { programarRecarga("__settings"); return; }
    if (tabla === "perfiles") { programarRecarga("__perfiles"); return; }
    var col = null;
    Object.keys(NUBE_TABLAS).forEach(function (k) { if (NUBE_TABLAS[k].tabla === tabla) col = k; });
    if (col) programarRecarga(col);
  }
  App.suscribirNube = function () {
    try {
      sb.channel("cambios-sistema")
        .on("postgres_changes", { event: "*", schema: "public" }, function (payload) {
          if (sincronizando) { ecosPendientes[payload.table] = 1; return; }
          rutaEco(payload.table);
        })
        .subscribe();
    } catch (e) { }
  };

  /* arranque de sesión en nube: perfil (consulta directa, errores visibles) + datos + realtime */
  App.iniciarNube = function (session) {
    var uid = session.user.id;
    var perfilDirecto = null;
    return sb.from("perfiles").select("*").eq("id", uid).maybeSingle().then(function (rp) {
      if (rp.error) throw rp.error;
      perfilDirecto = rp.data;
      return App.cargarNube();
    }).then(function () {
      var perfil = (App.db.usuarios || []).filter(function (u) { return u.id === uid; })[0];
      if (!perfil && perfilDirecto) {
        perfil = { id: perfilDirecto.id, nombre: perfilDirecto.nombre, emoji: perfilDirecto.emoji, rol: perfilDirecto.rol, permisos: perfilDirecto.permisos, comision: +perfilDirecto.comision || 0, tiendas: perfilDirecto.tiendas || [], verCostos: !!perfilDirecto.ver_costos, email: "", clave: null };
        App.db.usuarios.push(perfil);
      }
      if (!perfil) {
        var err = new Error("Tu cuenta no tiene perfil asignado - avísale a Manuel");
        err.sinPerfil = true;
        throw err;
      }
      App.auth.user = perfil;
      App.auth.user.email = session.user.email || "";
      App.suscribirNube();
      var pend = false;
      try { pend = localStorage.getItem("nao_sync_pend") === "1"; } catch (e) { }
      if (pend) pushNube();
      setEstadoSync("ok");
    });
  };

  /* fotos → bucket 'fotos' (con fallback al dataURL si falla) */
  App.subirFoto = function (dataURL, carpeta) {
    if (!App.MODO_NUBE || !dataURL || String(dataURL).indexOf("data:") !== 0) return Promise.resolve(dataURL);
    try {
      var b64 = dataURL.split(",")[1];
      var bin = atob(b64);
      var arr = new Uint8Array(bin.length);
      for (var i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
      var nombre = (carpeta || "otros") + "/" + Date.now().toString(36) + Math.random().toString(36).slice(2, 7) + ".jpg";
      return sb.storage.from("fotos").upload(nombre, arr.buffer, { contentType: "image/jpeg" }).then(function (r) {
        if (r.error) return dataURL;
        return sb.storage.from("fotos").getPublicUrl(nombre).data.publicUrl;
      }).catch(function () { return dataURL; });
    } catch (e) { return Promise.resolve(dataURL); }
  };
})();
