/* ============================================================
   finanzas.js - resumen del mes, caja Bs + devaluación,
   tasas BCV, gastos/ads con ROAS y cuentas por pagar
   (módulo solo para el súper usuario)
   ============================================================ */
window.App = window.App || {};

(function () {
  "use strict";
  var tab = "resumen";
  var mesOffset = 0;

  App.modFinanzas = {
    id: "finanzas", titulo: "Finanzas", icono: "finanzas",
    render: function (el) {
      var html = '<div class="view"><div class="spread" style="margin-bottom:12px"><div><h1>📊 Finanzas</h1>' +
        '<div class="small muted">Contabilidad de las dos tiendas, en USD y Bs</div></div></div>';

      html += '<div class="tabs">' +
        [["resumen", "Resumen"], ["caja", "Caja Bs"], ["tasas", "Tasas"], ["gastos", "Gastos & Ads"], ["creativos", "Creativos"], ["cierres", "Cierres 🛡️"], ["pagar", "Por pagar"]].map(function (t) {
          return '<button class="tab' + (tab === t[0] ? " active" : "") + '" data-tab="' + t[0] + '">' + t[1] + "</button>";
        }).join("") + "</div><div id='fin-cont'></div></div>";
      el.innerHTML = html;

      App.$$("[data-tab]", el).forEach(function (b) {
        b.addEventListener("click", function () { tab = b.dataset.tab; App.render(); });
      });

      var cont = App.$("#fin-cont", el);
      if (tab === "resumen") tabResumen(cont);
      else if (tab === "caja") tabCaja(cont);
      else if (tab === "tasas") tabTasas(cont);
      else if (tab === "gastos") tabGastos(cont);
      else if (tab === "creativos") tabCreativos(cont);
      else if (tab === "cierres") tabCierres(cont);
      else tabPagar(cont);
    }
  };

  /* ---------- RESUMEN ---------- */
  function tabResumen(el) {
    var C = App.calc;
    var u = C.utilidadMes(mesOffset);
    var uPrev = C.utilidadMes(mesOffset - 1);
    var tasa = C.tasaCobro();
    var lista = C.ventasEntre(u.rango[0], u.rango[1]);
    var porTienda = C.porTienda(lista);
    var serie6 = C.serieMensual(6);
    var MESES = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];

    var html = '<div class="seg" style="margin-bottom:12px">' +
      '<button class="seg-btn' + (mesOffset === 0 ? " active" : "") + '" data-mes="0">Este mes</button>' +
      '<button class="seg-btn' + (mesOffset === -1 ? " active" : "") + '" data-mes="-1">Mes pasado</button></div>';

    html += '<div class="grid-kpi" style="grid-template-columns:1fr 1fr">' +
      '<div class="kpi"><div class="kpi-label">Utilidad neta</div><div class="kpi-value grad">' + App.fmt.usd(u.utilidadNeta) + "</div>" +
      '<div class="kpi-foot">' + App.deltaPill(C.deltaPct(u.utilidadNeta, uPrev.utilidadNeta)) + "<span>vs mes anterior</span></div></div>" +
      '<div class="kpi"><div class="kpi-label">Ingresos</div><div class="kpi-value">' + App.fmt.usd0(u.ingresos) + "</div>" +
      '<div class="kpi-foot">' + u.ventas + " ventas · ≈ " + App.fmt.bs(u.ingresos * tasa) + "</div></div></div>";

    html += '<div class="card"><div class="card-head"><h2>🧾 Desglose del mes</h2></div><div class="table-wrap"><table class="mini">' +
      fila("Ingresos por ventas", u.ingresos, false) +
      fila("− Costo de mercancía", -u.costoMerc, false) +
      fila("= Utilidad bruta", u.utilidadBruta, true) +
      fila("− Publicidad (ads IG)", -u.ads, false) +
      fila("− Otros gastos", -(u.gastos - u.ads), false) +
      fila("− Comisiones vendedores", -u.comisiones, false) +
      fila("− Envíos (costo − cobrado)", -(u.envios.costo - u.envios.cobro), false) +
      fila("= UTILIDAD NETA", u.utilidadNeta, true) +
      "</table></div>" +
      '<div class="chart-note">Equivalente en Bs a tasa de cobro (€): ' + App.fmt.bs(u.utilidadNeta * tasa) + "</div></div>";

    html += '<div class="grid-2 section-gap">' +
      '<div class="card"><div class="card-head"><h2>📈 Ingresos - Últimos 6 meses</h2></div><div class="chart-box" id="fin-ch-meses"></div></div>' +
      '<div class="card"><div class="card-head"><h2>🏬 Por tienda</h2><span class="pill">' + (mesOffset === 0 ? "este mes" : "mes pasado") + "</span></div>" +
      App.hbars([
        { label: "🧸 La Teacher", valor: Math.round(porTienda.ljt || 0), color: "var(--c1)" },
        { label: "🛍️ En Vzla", valor: Math.round(porTienda.evz || 0), color: "var(--c2)" }
      ]) + "</div></div>";

    var porCanal = C.porCanal(lista);
    var CANALES = [["Instagram", "var(--c1)"], ["Tienda física", "var(--c2)"], ["WhatsApp", "var(--c3)"], ["Referido", "var(--c4)"]];
    html += '<div class="card section-gap"><div class="card-head"><h2>📣 Por canal de venta</h2><span class="pill">' + (mesOffset === 0 ? "este mes" : "mes pasado") + "</span></div>" +
      App.hbars(CANALES.map(function (c) { return { label: c[0], valor: Math.round(porCanal[c[0]] || 0), color: c[1] }; })) +
      '<div class="chart-note">De dónde vienen las ventas. (La dona de Inicio muestra cómo te pagan.)</div></div>';

    el.innerHTML = html;
    App.$$("[data-mes]", el).forEach(function (b) {
      b.addEventListener("click", function () { mesOffset = +b.dataset.mes; App.render(); });
    });
    App.chart.barras(App.$("#fin-ch-meses", el), {
      alto: 190,
      data: serie6.map(function (m) {
        var mi = +m.mes.slice(5, 7) - 1;
        return { label: MESES[mi], valor: m.total, color: "var(--c5)" };
      })
    });

    function fila(label, valor, bold) {
      var v = App.fmt.usd(Math.abs(valor)) ;
      var signo = valor < 0 ? "−" + v : v;
      return "<tr><td" + (bold ? ' style="font-weight:700"' : "") + ">" + label + '</td><td class="num"' +
        (bold ? ' style="font-weight:800"' : "") + ">" + signo + "</td></tr>";
    }
  }

  /* ---------- CAJA BS ---------- */
  function tabCaja(el) {
    var C = App.calc;
    var caja = C.cajaBs();
    var cambios = (App.db.cambiosDivisa || []).slice().sort(function (a, b) { return a.fecha < b.fecha ? 1 : -1; });

    var html = '<div class="grid-kpi" style="grid-template-columns:1fr 1fr">' +
      '<div class="kpi"><div class="kpi-label">Bs sin cambiar</div><div class="kpi-value num" style="font-size:clamp(16px,5.5vw,22px)">' + App.fmt.bs(caja.saldoBs) + "</div>" +
      '<div class="kpi-foot">≈ ' + App.fmt.usd(caja.valorHoyUsd) + " a tasa $ de hoy</div></div>" +
      '<div class="kpi"><div class="kpi-label">Perdido por devaluación</div><div class="kpi-value" style="font-size:clamp(16px,5.5vw,22px);color:var(--danger)">' + App.fmt.usd(caja.perdidaUsd) + "</div>" +
      '<div class="kpi-foot">de los Bs que aún no cambias</div></div></div>';

    html += '<div class="card"><p class="small muted">Cada venta en Bs guarda la tasa del día en que cobraste. ' +
      "Mientras no cambies esos Bs a divisas, la tasa sube y pierden valor. Aquí ves cuánto llevas perdido y registras cada cambio que hagas.</p>" +
      '<button class="btn primary block" id="btn-cambio" style="margin-top:10px">💱 Registrar cambio a divisas</button></div>';

    html += '<div class="card section-gap"><div class="card-head"><h2>💱 Historial de cambios</h2>' +
      '<span class="pill ok">' + App.fmt.usd(caja.cambiadoUsd) + " cambiados</span></div>";
    if (!cambios.length) html += '<div class="empty"><p>Aún no registras cambios de Bs a divisas.</p></div>';
    else {
      html += '<div class="list">' + cambios.map(function (c) {
        return '<div class="row-item static"><div class="thumb">💱</div>' +
          '<div class="row-main"><div class="row-title num">' + App.fmt.bs(c.montoBs) + " → " + App.fmt.usd(c.montoUsd) + "</div>" +
          '<div class="row-sub">' + App.fmt.fecha(c.fecha) + " · tasa " + App.fmt.num(c.tasa) + " · " + App.esc(c.destino) + "</div></div></div>";
      }).join("") + "</div>";
    }
    html += "</div>";
    el.innerHTML = html;

    App.$("#btn-cambio", el).addEventListener("click", function () {
      var s = App.sheet({
        titulo: "💱 Registrar cambio a divisas",
        cuerpo: '<div class="form-grid">' +
          '<div class="field full"><label>Monto en Bs (tienes ' + App.fmt.bs(caja.saldoBs) + ')</label>' +
          '<input class="input num" id="cb-monto" type="number" min="1" step="1" value="' + Math.round(caja.saldoBs) + '"></div>' +
          '<div class="field"><label>Tasa a la que cambiaste</label><input class="input num" id="cb-tasa" type="number" step="0.01" value="' + caja.tasaUsd + '"></div>' +
          '<div class="field"><label>Destino</label><select class="select" id="cb-destino"><option>Zelle</option><option>Efectivo USD</option><option>Binance USDT</option><option>Zinli</option><option>Euro efectivo</option></select></div>' +
          "</div><div class='small muted' id='cb-preview' style='margin-top:8px'></div>",
        pie: '<button class="btn primary" data-ok>Guardar cambio</button>'
      });
      function prev() {
        var m = parseFloat(App.$("#cb-monto", s.el).value) || 0;
        var t = parseFloat(App.$("#cb-tasa", s.el).value) || 1;
        App.$("#cb-preview", s.el).innerHTML = "Recibes ≈ <b class='num'>" + App.fmt.usd(m / t) + "</b>";
      }
      App.$("#cb-monto", s.el).addEventListener("input", prev);
      App.$("#cb-tasa", s.el).addEventListener("input", prev);
      prev();
      App.$("[data-ok]", s.foot).addEventListener("click", function () {
        var m = parseFloat(App.$("#cb-monto", s.el).value) || 0;
        var t = parseFloat(App.$("#cb-tasa", s.el).value) || 0;
        if (m <= 0 || t <= 0) { App.toast("Monto y tasa deben ser mayores a 0", "err"); return; }
        App.db.cambiosDivisa = App.db.cambiosDivisa || [];
        App.db.cambiosDivisa.push({
          id: App.uid("cd"), fecha: App.hoyISO(), montoBs: m, tasa: t,
          montoUsd: Math.round(m / t * 100) / 100,
          destino: App.$("#cb-destino", s.el).value, notas: ""
        });
        App.save(); App.toast("Cambio registrado 💱");
        s.cerrar(); App.render();
      });
    });
  }

  /* ---------- TASAS ---------- */
  function tabTasas(el) {
    var t = App.db.settings.tasas;
    var hist = (t.historial || []).slice(-14);

    var html = '<div class="card"><div class="card-head"><h2>💱 Tasa BCV de hoy</h2>' +
      '<span class="pill">' + App.fmt.fechaRel(t.fecha) + "</span></div>" +
      '<div class="form-grid">' +
      '<div class="field"><label>Euro (Bs/€) - con esta cobras</label><input class="input num" id="ts-eur" type="number" step="0.01" value="' + t.eur + '"></div>' +
      '<div class="field"><label>Dólar (Bs/$)</label><input class="input num" id="ts-usd" type="number" step="0.01" value="' + t.usd + '"></div>' +
      "</div>" +
      '<div class="flex" style="margin-top:10px;gap:8px">' +
      '<button class="btn primary" id="ts-guardar" style="flex:1">Guardar tasa de hoy</button>' +
      '<button class="btn ghost" id="ts-auto" style="flex:1">🌐 Buscar automático</button></div>' +
      '<div class="chart-note">Fuente oficial: bcv.org.ve. El botón automático usa una API pública (necesita internet); si falla, escríbela manual. Al abrir la app cada día se intenta actualizar sola.</div></div>';

    html += '<div class="card section-gap"><div class="card-head"><h2>⚖️ ¿Con qué tasa cobras en Bs?</h2></div>' +
      '<div class="seg">' +
      '<button class="seg-btn' + (App.db.settings.tasaCobro === "eur" ? " active" : "") + '" data-tc="eur">Euro BCV (recomendada)</button>' +
      '<button class="seg-btn' + (App.db.settings.tasaCobro === "usd" ? " active" : "") + '" data-tc="usd">Dólar BCV</button></div>' +
      '<div class="chart-note">Precio en $ × tasa elegida = monto a cobrar en Bs. Hoy $10 = ' + App.fmt.bs(App.calc.bsDe(10)) + "</div></div>";

    html += '<div class="card section-gap"><div class="card-head"><h2>📈 Evolución - Últimos 14 días</h2></div>' +
      '<div class="chart-box" id="ts-chart"></div>' +
      '<div class="legend"><span class="legend-item"><span class="legend-dot" style="background:var(--c5)"></span>Euro</span>' +
      '<span class="legend-item"><span class="legend-dot" style="background:var(--c2)"></span>Dólar</span></div></div>';

    el.innerHTML = html;

    App.chart.linea(App.$("#ts-chart", el), {
      alto: 190,
      fmtV: function (v) { return App.fmt.num(v); },
      series: [
        { nombre: "Euro", color: "var(--c5)", puntos: hist.map(function (h) { return { label: h.fecha.slice(8) + "/" + h.fecha.slice(5, 7), labelLargo: App.fmt.fecha(h.fecha), y: h.eur }; }) },
        { nombre: "Dólar", color: "var(--c2)", puntos: hist.map(function (h) { return { label: h.fecha.slice(8) + "/" + h.fecha.slice(5, 7), labelLargo: App.fmt.fecha(h.fecha), y: h.usd }; }) }
      ]
    });

    App.$("#ts-guardar", el).addEventListener("click", function () {
      var eur = parseFloat(App.$("#ts-eur", el).value) || 0;
      var usd = parseFloat(App.$("#ts-usd", el).value) || 0;
      if (eur <= 0 || usd <= 0) { App.toast("Las tasas deben ser mayores a 0", "err"); return; }
      guardarTasa(usd, eur);
    });
    App.$$("[data-tc]", el).forEach(function (b) {
      b.addEventListener("click", function () {
        App.db.settings.tasaCobro = b.dataset.tc;
        App.save(); App.toast("Tasa de cobro: " + (b.dataset.tc === "eur" ? "Euro" : "Dólar") + " BCV");
        App.render();
      });
    });
    App.$("#ts-auto", el).addEventListener("click", function () {
      var btn = this;
      btn.disabled = true; btn.textContent = "Buscando…";
      App.actualizarTasas().then(function (r) {
        btn.disabled = false; btn.textContent = "🌐 Buscar automático";
        if (!r.usd && !r.eur) { App.toast("No se pudo consultar. Escríbela manual.", "err"); return; }
        App.toast("Tasa BCV actualizada y guardada ✓");
        App.render();
      });
    });
  }

  function guardarTasa(usd, eur) {
    var t = App.db.settings.tasas;
    t.usd = usd; t.eur = eur; t.fecha = App.hoyISO();
    t.historial = (t.historial || []).filter(function (h) { return h.fecha !== t.fecha; });
    t.historial.push({ fecha: t.fecha, usd: usd, eur: eur });
    if (t.historial.length > 120) t.historial = t.historial.slice(-120);
    App.save(); App.toast("Tasa del día guardada ✓");
    App.render();
  }

  /* la búsqueda automática de tasas vive en App.actualizarTasas (data.js) */

  /* ---------- GASTOS & ADS ---------- */
  var gastosCatF = null; // filtro por categoría
  function tabGastos(el) {
    var C = App.calc;
    var roas = C.roasMes(0);
    var cats = App.db.settings.categoriasGasto || [];
    var gastos = (App.db.gastos || []).slice().sort(function (a, b) { return a.fecha < b.fecha ? 1 : -1; });
    if (gastosCatF) gastos = gastos.filter(function (g) { return (g.categoria || "Otros") === gastosCatF; });

    var html = '<div class="grid-kpi" style="grid-template-columns:1fr 1fr">' +
      '<div class="kpi"><div class="kpi-label">Ads IG este mes</div><div class="kpi-value" style="font-size:22px">' + App.fmt.usd0(roas.ads) + "</div>" +
      '<div class="kpi-foot">generaron ' + App.fmt.usd0(roas.ventasIg) + " por Instagram</div></div>" +
      '<div class="kpi"><div class="kpi-label">Retorno (ROAS)</div><div class="kpi-value' + (roas.roas != null && roas.roas < 1 ? "" : " grad") + '" style="font-size:22px">' +
      (roas.roas == null ? "-" : App.fmt.num(roas.roas) + "×") + "</div>" +
      '<div class="kpi-foot">' + (roas.roas == null ? "sin inversión este mes" : (roas.roas >= 1 ? "cada $1 en ads produce $" + App.fmt.num(roas.roas) : "⚠️ los ads no se están pagando")) + "</div></div></div>";

    html += '<button class="btn primary block" id="btn-gasto" style="margin-bottom:12px">' + App.icon("plus") + " Registrar gasto / inversión en ads</button>";

    html += '<div class="chips scroll-x" style="margin-bottom:10px">' +
      '<button class="chip' + (!gastosCatF ? " active" : "") + '" data-gcat="">Todas</button>' +
      cats.map(function (c) {
        return '<button class="chip' + (gastosCatF === c ? " active" : "") + '" data-gcat="' + App.esc(c) + '">' + App.esc(c) + "</button>";
      }).join("") + "</div>";

    html += '<div class="card"><div class="card-head"><h2>🧾 Gastos registrados</h2></div><div class="list">';
    if (!gastos.length) html += '<div class="empty"><p>Sin gastos en esta categoría.</p></div>';
    gastos.slice(0, 40).forEach(function (g) {
      var emoji = g.tipo === "ads" ? "📣" : (g.tipo === "operativo" ? "📦" : "🧾");
      var pAd = g.productoId ? App.prod(g.productoId) : null;
      html += '<div class="row-item static"><div class="thumb">' + emoji + "</div>" +
        '<div class="row-main"><div class="row-title">' + App.esc(g.descripcion) + "</div>" +
        '<div class="row-sub">' + App.fmt.fecha(g.fecha) + (g.tienda ? " · " + ((App.tienda(g.tienda) || {}).corto || "") : "") +
        " · " + App.esc(g.categoria || g.tipo) +
        (pAd ? " · " + App.esc(pAd.emoji + " " + pAd.nombre) : "") +
        (g.desde && g.hasta ? " · campaña " + App.fmt.fecha(g.desde) + " → " + App.fmt.fecha(g.hasta) : "") + "</div></div>" +
        '<span class="row-amount num" style="margin-right:6px">' + App.fmt.usd(g.montoUsd) + "</span>" +
        '<button class="btn icon" data-del-gasto="' + g.id + '" style="width:36px;height:36px">' + App.icon("x") + "</button></div>";
    });
    html += "</div></div>";
    el.innerHTML = html;

    App.$$("[data-gcat]", el).forEach(function (b) {
      b.addEventListener("click", function () { gastosCatF = b.dataset.gcat || null; App.render(); });
    });
    App.$("#btn-gasto", el).addEventListener("click", formGasto);
    App.delegar(el, "click", "[data-del-gasto]", function (e, t) {
      App.confirmar("¿Eliminar este gasto?", { peligro: true, accion: "Eliminar" }).then(function (si) {
        if (!si) return;
        App.db.gastos = App.db.gastos.filter(function (g) { return g.id !== t.dataset.delGasto; });
        App.save(); App.toast("Gasto eliminado"); App.render();
      });
    });
  }

  function formGasto() {
    var cats = App.db.settings.categoriasGasto || [];
    var catManual = false; // si la eligió a mano, la heurística no la pisa
    var s = App.sheet({
      titulo: "🧾 Nuevo gasto",
      cuerpo: '<div class="form-grid">' +
        '<div class="field"><label>Tipo</label><select class="select" id="gs-tipo"><option value="ads">📣 Ads Instagram</option><option value="operativo">📦 Operativo</option><option value="otro">🧾 Otro</option></select></div>' +
        '<div class="field"><label>Categoría</label><select class="select" id="gs-cat">' +
        cats.map(function (c) { return "<option" + (c === "Ads Instagram" ? " selected" : "") + ">" + App.esc(c) + "</option>"; }).join("") +
        "</select></div>" +
        '<div class="field"><label>Fecha</label><input class="input" id="gs-fecha" type="date" value="' + App.hoyISO() + '"></div>' +
        '<div class="field"><label>Monto (USD)</label><input class="input num" id="gs-monto" type="number" step="0.01" min="0"></div>' +
        '<div class="field"><label>Tienda</label><select class="select" id="gs-tienda"><option value="">Ambas / general</option>' +
        App.db.settings.tiendas.map(function (t) { return '<option value="' + t.id + '">' + App.esc(t.corto) + "</option>"; }).join("") + "</select></div>" +
        '<div class="field full"><label>Descripción</label><input class="input" id="gs-desc" placeholder="Ej: papelería y etiquetas / ads pistola de agua"></div>' +
        "</div><div id='gs-ads-extra'></div><div id='gs-aviso'></div>",
      pie: '<button class="btn primary" data-ok>Guardar gasto</button>'
    });

    function pintarAdsExtra() {
      var box = App.$("#gs-ads-extra", s.el);
      if (App.$("#gs-tipo", s.el).value !== "ads") { box.innerHTML = ""; pintarAviso(); return; }
      box.innerHTML = '<div class="form-grid" style="margin-top:10px">' +
        '<div class="field full"><label>Producto que estás promocionando</label><select class="select" id="gs-prod"><option value="">General (sin producto)</option>' +
        App.db.productos.map(function (p) { return '<option value="' + p.id + '">' + App.esc(p.emoji + " " + p.nombre) + "</option>"; }).join("") +
        "</select></div>" +
        '<div class="field"><label>Campaña desde</label><input class="input" id="gs-desde" type="date" value="' + App.hoyISO() + '"></div>' +
        '<div class="field"><label>Hasta</label><input class="input" id="gs-hasta" type="date" value="' + App.toISO(App.addDays(new Date(), 2)) + '"></div>' +
        "</div>";
      App.$("#gs-prod", s.el).addEventListener("change", pintarAviso);
      pintarAviso();
    }
    function pintarAviso() {
      var box = App.$("#gs-aviso", s.el);
      var sel = App.$("#gs-prod", s.el);
      if (!sel || !sel.value) { box.innerHTML = ""; return; }
      var p = App.prod(sel.value);
      var invertido = App.calc.adsDeProducto(sel.value);
      var monto = parseFloat(App.$("#gs-monto", s.el).value) || 0;
      var msg;
      if (p.presupuestoAds > 0) {
        var quedan = p.presupuestoAds - invertido - monto;
        msg = "De <b>" + App.fmt.usd(p.presupuestoAds) + "</b> presupuestados para este producto llevas <b>" + App.fmt.usd(invertido) + "</b>." +
          (monto > 0
            ? (quedan >= 0 ? " Con este gasto te quedarán <b>" + App.fmt.usd(quedan) + "</b>." : " ⚠️ <b style='color:var(--danger)'>Con este gasto te pasas por " + App.fmt.usd(-quedan) + "</b>.")
            : "");
      } else {
        msg = "Este producto no tiene presupuesto definido. Ya llevas <b>" + App.fmt.usd(invertido) + "</b> invertidos en sus ads. (El presupuesto se define en la ficha del producto.)";
      }
      box.innerHTML = '<div class="card" style="padding:10px 12px;box-shadow:none;background:var(--warn-soft);margin-top:8px" class="small">📣 ' + msg + "</div>";
    }
    App.$("#gs-tipo", s.el).addEventListener("change", function () {
      if (this.value === "ads" && !catManual) App.$("#gs-cat", s.el).value = "Ads Instagram";
      pintarAdsExtra();
    });
    App.$("#gs-cat", s.el).addEventListener("change", function () { catManual = true; });
    App.$("#gs-monto", s.el).addEventListener("input", pintarAviso);
    App.$("#gs-desc", s.el).addEventListener("blur", function () {
      if (catManual) return;
      var sug = App.calc.sugerirCategoriaGasto(this.value);
      if (sug) App.$("#gs-cat", s.el).value = sug;
    });
    pintarAdsExtra();

    App.$("[data-ok]", s.foot).addEventListener("click", function () {
      var monto = parseFloat(App.$("#gs-monto", s.el).value) || 0;
      var desc = App.$("#gs-desc", s.el).value.trim();
      if (monto <= 0 || !desc) { App.toast("Monto y descripción son obligatorios", "err"); return; }
      var esAds = App.$("#gs-tipo", s.el).value === "ads";
      App.db.gastos = App.db.gastos || [];
      App.db.gastos.push({
        id: App.uid("g"), fecha: App.$("#gs-fecha", s.el).value || App.hoyISO(),
        tipo: App.$("#gs-tipo", s.el).value,
        categoria: App.$("#gs-cat", s.el).value,
        descripcion: desc,
        tienda: App.$("#gs-tienda", s.el).value || null,
        montoUsd: monto,
        productoId: esAds ? (App.$("#gs-prod", s.el) || {}).value || null : null,
        desde: esAds ? (App.$("#gs-desde", s.el) || {}).value || null : null,
        hasta: esAds ? (App.$("#gs-hasta", s.el) || {}).value || null : null
      });
      App.save(); App.toast("Gasto registrado ✓");
      s.cerrar(); App.render();
    });
  }

  /* ---------- CREATIVOS: registro y análisis de contenidos/ads ---------- */
  function tipoEmoji(t) {
    return { "Reel": "🎬", "Historia": "📖", "Carrusel": "🖼️", "Post": "📌", "Ad pagado": "📣" }[t] || "🎬";
  }
  function tabCreativos(el) {
    var C = App.calc;
    var creativos = (App.db.creativos || []).slice().sort(function (a, b) { return a.fecha < b.fecha ? 1 : -1; });
    var sinContenido = C.productosSinContenido(30);

    var html = '<p class="small muted" style="margin-bottom:10px">Registra cada reel, historia o ad con sus resultados y tu análisis. Así sabrás qué contenido vende y a qué producto le falta promoción.</p>' +
      '<button class="btn primary block" id="btn-creativo" style="margin-bottom:12px">' + App.icon("plus") + " Registrar contenido / ad</button>";

    if (sinContenido.length) {
      html += '<div class="card" style="margin-bottom:12px"><div class="card-head"><h2>😴 Sin contenido en 30 días</h2><span class="pill warn">' + sinContenido.length + "</span></div>" +
        '<div class="chips">' + sinContenido.slice(0, 8).map(function (p) {
          return '<span class="chip" style="cursor:default">' + p.emoji + " " + App.esc(p.nombre) + "</span>";
        }).join("") + (sinContenido.length > 8 ? '<span class="chip" style="cursor:default">+' + (sinContenido.length - 8) + " más</span>" : "") + "</div>" +
        '<div class="chart-note">Productos con stock a los que no les has hecho reel, historia ni post últimamente.</div></div>';
    }

    html += '<div class="card"><div class="card-head"><h2>🎬 Historial de contenidos</h2></div>';
    if (!creativos.length) html += '<div class="empty"><p>Aún no registras contenidos.</p></div>';
    else {
      html += '<div class="list">' + creativos.map(function (c) {
        var p = c.productoId ? App.prod(c.productoId) : null;
        return '<div class="row-item" data-cr="' + c.id + '">' +
          '<div class="thumb">' + tipoEmoji(c.tipo) + "</div>" +
          '<div class="row-main"><div class="row-title" style="font-size:13px">' + App.esc(c.tipo) + (p ? " · " + App.esc(p.emoji + " " + p.nombre) : "") + "</div>" +
          '<div class="row-sub">' + App.fmt.fecha(c.fecha) + " · " + ((App.tienda(c.tienda) || {}).corto || "") +
          (c.inversion ? " · 📣 " + App.fmt.usd(c.inversion) : " · orgánico") +
          " · 💬 " + (c.mensajes || 0) + " · 🛒 " + (c.ventas || 0) + "</div>" +
          (c.comentario ? '<div class="row-sub">💡 ' + App.esc(c.comentario) + "</div>" : "") + "</div>" +
          App.icon("chevR") + "</div>";
      }).join("") + "</div>" +
        '<div class="chart-note">Toca un contenido para editarlo o ver su análisis.</div>';
    }
    html += "</div>";
    el.innerHTML = html;

    App.$("#btn-creativo", el).addEventListener("click", function () { formCreativo(null); });
    App.delegar(el, "click", "[data-cr]", function (e, t) {
      var c = (App.db.creativos || []).filter(function (x) { return x.id === t.dataset.cr; })[0];
      if (c) formCreativo(c);
    });
  }

  function formCreativo(orig) {
    var FC = orig ? JSON.parse(JSON.stringify(orig)) : { tipo: "Reel", tienda: "ljt", productoId: "", inversion: 0, mensajes: 0, ventas: 0, comentario: "" };
    var s = App.sheet({
      titulo: orig ? "✏️ Editar contenido" : "🎬 Nuevo contenido / ad",
      cuerpo: '<div class="field"><label>Tipo de contenido</label><div class="seg" id="fc-tipo" style="flex-wrap:wrap">' +
        ["Reel", "Historia", "Carrusel", "Post", "Ad pagado"].map(function (t) {
          return '<button type="button" class="seg-btn' + (FC.tipo === t ? " active" : "") + '" data-v="' + t + '">' + tipoEmoji(t) + " " + t + "</button>";
        }).join("") + "</div></div>" +
        '<div class="form-grid" style="margin-top:8px">' +
        '<div class="field"><label>Fecha</label><input class="input" id="fc-fecha" type="date" value="' + (FC.fecha || App.hoyISO()) + '"></div>' +
        '<div class="field"><label>Tienda</label><select class="select" id="fc-tienda">' +
        App.db.settings.tiendas.map(function (t) { return '<option value="' + t.id + '"' + (FC.tienda === t.id ? " selected" : "") + ">" + App.esc(t.corto) + "</option>"; }).join("") +
        "</select></div>" +
        '<div class="field full"><label>Producto promocionado</label><select class="select" id="fc-prod"><option value="">Ninguno / general</option>' +
        App.db.productos.map(function (p) { return '<option value="' + p.id + '"' + (FC.productoId === p.id ? " selected" : "") + ">" + App.esc(p.emoji + " " + p.nombre) + "</option>"; }).join("") +
        "</select></div>" +
        '<div class="field"><label>Inversión en ads (0 = orgánico)</label><input class="input num" id="fc-inv" type="number" step="0.01" min="0" value="' + (FC.inversion || 0) + '"></div>' +
        '<div class="field"><label>💬 Mensajes recibidos</label><input class="input num" id="fc-msj" type="number" min="0" value="' + (FC.mensajes || 0) + '"></div>' +
        '<div class="field"><label>🛒 Ventas generadas</label><input class="input num" id="fc-vtas" type="number" min="0" value="' + (FC.ventas || 0) + '"></div>' +
        '<div class="field full"><label>Tu análisis: qué dijiste, en qué orden, por qué funcionó (o no)</label><textarea class="textarea" id="fc-coment">' + App.esc(FC.comentario || "") + "</textarea></div>" +
        "</div>",
      pie: (orig ? '<button class="btn danger" data-borrar style="flex:0 0 auto">' + App.icon("basura") + "</button>" : "") +
        '<button class="btn primary" data-ok>' + (orig ? "Guardar" : "Registrar") + "</button>"
    });
    App.$$("#fc-tipo .seg-btn", s.el).forEach(function (b) {
      b.addEventListener("click", function () {
        FC.tipo = b.dataset.v;
        App.$$("#fc-tipo .seg-btn", s.el).forEach(function (x) { x.classList.toggle("active", x === b); });
      });
    });
    App.$("[data-ok]", s.foot).addEventListener("click", function () {
      FC.fecha = App.$("#fc-fecha", s.el).value || App.hoyISO();
      FC.tienda = App.$("#fc-tienda", s.el).value;
      FC.productoId = App.$("#fc-prod", s.el).value || null;
      FC.inversion = parseFloat(App.$("#fc-inv", s.el).value) || 0;
      FC.mensajes = parseInt(App.$("#fc-msj", s.el).value, 10) || 0;
      FC.ventas = parseInt(App.$("#fc-vtas", s.el).value, 10) || 0;
      FC.comentario = App.$("#fc-coment", s.el).value.trim();
      App.db.creativos = App.db.creativos || [];
      if (orig) {
        var ix = App.db.creativos.findIndex(function (x) { return x.id === orig.id; });
        App.db.creativos[ix] = FC;
      } else {
        FC.id = App.uid("cr");
        App.db.creativos.push(FC);
      }
      App.save(); App.toast(orig ? "Contenido actualizado" : "Contenido registrado 🎬");
      s.cerrar(); App.render();
    });
    var bb = App.$("[data-borrar]", s.foot);
    if (bb) bb.addEventListener("click", function () {
      App.confirmar("¿Eliminar este registro de contenido?", { peligro: true, accion: "Eliminar" }).then(function (si) {
        if (!si) return;
        App.db.creativos = App.db.creativos.filter(function (x) { return x.id !== orig.id; });
        App.save(); App.toast("Eliminado"); s.cerrar(); App.render();
      });
    });
  }

  /* ---------- POR PAGAR ---------- */
  function tabPagar(el) {
    var C = App.calc;
    var r = App.mesRango(0);
    var coms = C.comisiones(r[0], r[1]);
    var motos = C.motorizadosResumen().filter(function (m) { return m.deuda > 0; });
    var totalMotos = motos.reduce(function (s, m) { return s + m.deuda; }, 0);
    var totalComs = coms.reduce(function (s, c) { return s + c.comision; }, 0);

    var html = '<div class="grid-kpi" style="grid-template-columns:1fr 1fr">' +
      '<div class="kpi"><div class="kpi-label">Comisiones del mes</div><div class="kpi-value" style="font-size:22px">' + App.fmt.usd(totalComs) + "</div>" +
      '<div class="kpi-foot">a vendedores</div></div>' +
      '<div class="kpi"><div class="kpi-label">Motorizados</div><div class="kpi-value" style="font-size:22px">' + App.fmt.usd(totalMotos) + "</div>" +
      '<div class="kpi-foot">carreras sin pagar</div></div></div>';

    html += '<div class="card"><div class="card-head"><h2>🧑‍💼 Comisiones por vendedor</h2><span class="pill">este mes</span></div>';
    if (!coms.length) html += '<div class="empty"><p>Ningún vendedor con comisión generó ventas este mes.</p></div>';
    else {
      html += '<div class="table-wrap"><table class="mini"><thead><tr><th>Vendedor</th><th class="num">Ventas</th><th class="num">Vendió</th><th class="num">%</th><th class="num">Comisión</th></tr></thead><tbody>';
      coms.forEach(function (c) {
        html += '<tr data-vend="' + c.usuario.id + '" style="cursor:pointer"><td>' + App.esc(c.usuario.nombre) + '</td><td class="num">' + c.ventas + '</td><td class="num">' + App.fmt.usd0(c.usd) +
          '</td><td class="num">' + c.usuario.comision + '%</td><td class="num"><b>' + App.fmt.usd(c.comision) + "</b></td></tr>";
      });
      html += "</tbody></table></div>";
    }
    html += '<div class="chart-note">Toca un vendedor para ver todas sus órdenes. El % se configura en Ajustes → Usuarios.</div></div>';

    html += '<div class="card section-gap"><div class="card-head"><h2>🏍️ Motorizados</h2></div>';
    if (!motos.length) html += '<div class="pill ok">Al día con todos ✓</div>';
    else {
      motos.forEach(function (m) {
        html += '<div class="spread" style="padding:6px 0"><span>' + App.esc(m.motorizado.nombre) + " · " + m.pendListado.length + " carreras</span><b class='num'>" + App.fmt.usd(m.deuda) + "</b></div>";
      });
      html += '<button class="btn block" data-ir-motos style="margin-top:8px">Gestionar en Envíos → Motorizados</button>';
    }
    html += "</div>";
    el.innerHTML = html;

    var bm = App.$("[data-ir-motos]", el);
    if (bm) bm.addEventListener("click", function () { location.hash = "#/envios"; });
    App.$$("[data-vend]", el).forEach(function (tr) {
      tr.addEventListener("click", function () { sheetVentasVendedor(tr.dataset.vend); });
    });
  }

  /* ---------- órdenes de un vendedor (mes actual) ---------- */
  function sheetVentasVendedor(uid) {
    var C = App.calc;
    var r = App.mesRango(0);
    var u = App.usuario(uid);
    if (!u) return;
    var lista = C.ventasEntre(r[0], r[1]).filter(function (v) { return v.vendedorId === uid; })
      .sort(function (a, b) { return a.fecha > b.fecha ? -1 : 1; });
    var total = C.sum(lista);
    var cuerpo;
    if (!lista.length) {
      cuerpo = '<div class="empty"><p>Sin ventas este mes.</p></div>';
    } else {
      cuerpo = '<div class="spread"><span class="muted small">' + lista.length + " órdenes este mes · comisión " + (u.comision || 0) + "%</span>" +
        '<b class="num">' + App.fmt.usd(total * (u.comision || 0) / 100) + "</b></div>" +
        '<div class="list">' + lista.map(function (v) {
          var cli = App.cliente(v.clienteId);
          return '<div class="row-item" data-fv="' + v.id + '">' +
            '<div class="row-main"><div class="row-title" style="font-size:13px">' + App.esc(cli ? cli.nombre : "Cliente casual") + "</div>" +
            '<div class="row-sub">' + App.fmt.fechaRel(v.fecha.slice(0, 10)) + " · " +
            App.esc(v.items.map(function (i) { return i.cant + "× " + i.nombre; }).join(", ")) + "</div></div>" +
            '<div class="row-end"><span class="row-amount num">' + App.fmt.usd(C.ventaTotal(v)) + "</span>" +
            '<div class="small muted num">comisión ' + App.fmt.usd(C.ventaTotal(v) * (u.comision || 0) / 100) + "</div></div></div>";
        }).join("") + "</div>" +
        '<div class="chart-note">Toca una orden para ver su detalle.</div>';
    }
    var s = App.sheet({ titulo: "🧾 Órdenes de " + u.nombre, cuerpo: cuerpo });
    App.delegar(s.el, "click", "[data-fv]", function (e2, t2) {
      var v = App.db.ventas.filter(function (x) { return x.id === t2.dataset.fv; })[0];
      if (v) App.abrirVenta(v);
    });
  }

  /* ---------- pestaña Cierres & Control ---------- */
  function tabCierres(el) {
    var C = App.calc;
    var cierres = (App.db.cierres || []).slice().sort(function (a, b) { return a.fecha < b.fecha ? 1 : -1; });

    var html = '<div class="card"><div class="card-head"><h2>🧾 Revisar o hacer un cierre</h2></div>' +
      '<div class="flex" style="gap:8px;align-items:flex-end"><div class="field" style="flex:1"><label>Fecha</label>' +
      '<input class="input" id="cz-fecha" type="date" value="' + App.hoyISO() + '" max="' + App.hoyISO() + '"></div>' +
      '<button class="btn primary" id="cz-abrir">Abrir cierre</button></div>' +
      '<div class="chart-note">Elige cualquier día: el sistema recalcula lo cobrado de esa fecha y te muestra (o deja corregir) su cierre.</div></div>';

    html += '<div class="card section-gap"><div class="card-head"><h2>🗂️ Histórico de cierres</h2><span class="pill">' + cierres.length + "</span></div>";
    if (!cierres.length) html += '<div class="empty" style="padding:12px"><p>Todavía no hay cierres guardados. Haz el primero hoy al final del día.</p></div>';
    else {
      html += '<div class="list">' + cierres.slice(0, 30).map(function (c2) {
        var ok2 = Math.abs(c2.difEfectivo || 0) < 0.5 && Math.abs(c2.difBs || 0) < 1000;
        return '<div class="row-item" data-cz="' + c2.fecha + '"><div class="thumb">🧾</div><div class="row-main"><div class="row-sub">' +
          App.fmt.fechaRel(c2.fecha) + " · cobrado " + App.fmt.usd(c2.totalEsperado || 0) +
          (c2.notas ? " · " + App.esc(c2.notas) : "") + "</div></div>" +
          (ok2 ? '<span class="pill ok">cuadró ✓</span>'
            : '<span class="pill warn">dif ' + App.fmt.usd(c2.difEfectivo || 0) + " / " + App.fmt.bs(c2.difBs || 0) + "</span>") + "</div>";
      }).join("") + "</div>" +
        '<div class="chart-note">Toca un cierre para revisarlo o corregirlo.</div>';
    }
    html += "</div>";

    /* control: ventas por debajo del precio de lista */
    var alteradas = C.ventasPrecioAlterado(30);
    html += '<div class="card section-gap"><div class="card-head"><h2>🛡️ Precios por debajo de lista</h2><span class="pill">30 días</span></div>';
    if (!alteradas.length) {
      html += '<div class="pill ok" style="margin-bottom:4px">Sin ventas con precio alterado ✓</div>';
    } else {
      html += '<div class="list">' + alteradas.slice(0, 15).map(function (a) {
        var u = App.usuario(a.venta.vendedorId);
        return '<div class="row-item" data-cz-v="' + a.venta.id + '"><div class="thumb">⚠️</div>' +
          '<div class="row-main"><div class="row-sub" style="color:var(--ink-1)">' + App.fmt.fecha(a.venta.fecha.slice(0, 10)) +
          " · <b>" + App.esc(u ? u.nombre : "?") + "</b> vendió " +
          App.esc(a.items.map(function (i) { return i.nombre + " a " + App.fmt.usd(i.precioUnit) + " (lista " + App.fmt.usd(i.lista) + ")"; }).join(", ")) +
          (a.aprox ? " (comparado con el precio actual)" : "") + "</div></div>" +
          '<span class="pill warn">−' + App.fmt.usd(a.dif) + "</span></div>";
      }).join("") + "</div>";
    }
    html += '<div class="chart-note">Ventas sin promo cobradas por debajo del precio de lista. Con el candado activo (Ajustes → Seguridad) los vendedores no pueden tocar precios: solo tú.</div></div>';

    /* registro de auditoría */
    var TIPOS = {
      venta_creada: "🛒 Venta creada", venta_editada: "✏️ Venta EDITADA", venta_eliminada: "🗑️ Venta ELIMINADA",
      devolucion: "↩️ Devolución", abono_editado: "✏️ Abono editado", abono_eliminado: "🗑️ Abono eliminado",
      precio_producto: "🏷️ Precio de producto cambiado", cierre: "🧾 Cierre guardado"
    };
    var eventos = (App.db.auditoria || []).slice().reverse().slice(0, 30);
    html += '<div class="card section-gap"><div class="card-head"><h2>🛡️ Registro de control</h2><span class="pill">últimos 30</span></div>';
    if (!eventos.length) {
      html += '<div class="empty" style="padding:12px"><p>Aquí queda registrado quién hizo qué: ediciones y eliminaciones de ventas y abonos, devoluciones, cambios de precio y cierres.</p></div>';
    } else {
      html += '<div class="list">' + eventos.map(function (ev) {
        var u = App.usuario(ev.usuarioId);
        return '<div class="row-item static"><div class="row-main"><div class="row-sub">' + App.esc(ev.fecha) +
          " · <b>" + App.esc(u ? u.nombre : "?") + "</b> · " + (TIPOS[ev.tipo] || App.esc(ev.tipo)) +
          (ev.detalle ? " · " + App.esc(ev.detalle) : "") + "</div></div></div>";
      }).join("") + "</div>";
    }
    html += "</div>";
    el.innerHTML = html;

    App.$("#cz-abrir", el).addEventListener("click", function () {
      App.abrirCierre(App.$("#cz-fecha", el).value || App.hoyISO());
    });
    App.delegar(el, "click", "[data-cz]", function (e, t) { App.abrirCierre(t.dataset.cz); });
    App.delegar(el, "click", "[data-cz-v]", function (e, t) {
      var v = App.db.ventas.filter(function (x) { return x.id === t.dataset.czV; })[0];
      if (v) App.abrirVenta(v);
    });
  }

  /* ---------- cierre de caja (de hoy o de una fecha concreta) ---------- */
  App.abrirCierre = function (fechaSel) {
    var C = App.calc;
    var hoy = fechaSel && fechaSel <= App.hoyISO() ? fechaSel : App.hoyISO();
    var datos = C.cobradoDelDia(hoy);
    var previo = (App.db.cierres || []).filter(function (c) { return c.fecha === hoy; })[0];
    var tasa = C.tasaCobro();
    var espEf = datos.porGrupo["Efectivo"] || 0;
    var espBs = Math.round((datos.porGrupo["Bolívares"] || 0) * tasa);
    var grupos = Object.keys(datos.porGrupo);

    var s = App.sheet({
      titulo: "🧾 Cierre de caja - " + App.fmt.fechaRel(hoy),
      cuerpo: '<div class="table-wrap"><table class="mini">' +
        (grupos.length ? grupos.map(function (g) {
          return "<tr><td>" + App.esc(g) + (g === "Bolívares" ? " (≈ " + App.fmt.bs(Math.round(datos.porGrupo[g] * tasa)) + ")" : "") +
            '</td><td class="num"><b>' + App.fmt.usd(datos.porGrupo[g]) + "</b></td></tr>";
        }).join("") : '<tr><td colspan="2">Hoy no se registraron cobros.</td></tr>') +
        '<tr><td><b>Total cobrado hoy</b></td><td class="num"><b>' + App.fmt.usd(datos.total) + "</b></td></tr>" +
        "</table></div>" +
        '<div class="chart-note">Incluye ventas pagadas hoy, abonos de hoy y deliveries cobrados por adelantado. Las devoluciones restan.</div>' +
        '<hr class="divider"><h3>¿Cuadra lo físico?</h3>' +
        '<div class="form-grid" style="margin-top:8px">' +
        '<div class="field"><label>Efectivo contado (USD) - esperado ' + App.fmt.usd(espEf) + '</label>' +
        '<input class="input num" id="ci-ef" type="number" step="0.01" value="' + (previo ? previo.contadoEfectivo : espEf.toFixed(2)) + '"></div>' +
        '<div class="field"><label>Bs contados - esperado ' + App.fmt.bs(espBs) + '</label>' +
        '<input class="input num" id="ci-bs" type="number" step="1" value="' + (previo ? previo.contadoBs : espBs) + '"></div>' +
        '<div class="field full"><label>Notas</label><input class="input" id="ci-notas" value="' + App.esc(previo ? previo.notas || "" : "") + '" placeholder="Ej: faltan $2, se usaron para el taxi"></div></div>' +
        '<div id="ci-dif" style="margin-top:8px"></div>',
      pie: '<button class="btn primary" data-ok>Guardar cierre</button>'
    });

    function pintarDif() {
      var dEf = (parseFloat(App.$("#ci-ef", s.el).value) || 0) - espEf;
      var dBs = (parseFloat(App.$("#ci-bs", s.el).value) || 0) - espBs;
      App.$("#ci-dif", s.el).innerHTML =
        Math.abs(dEf) < 0.5 && Math.abs(dBs) < 1000
          ? '<span class="pill ok">✓ Todo cuadra</span>'
          : '<span class="pill warn">Diferencia: ' + (dEf >= 0 ? "+" : "−") + App.fmt.usd(Math.abs(dEf)) + " efectivo · " + (dBs >= 0 ? "+" : "−") + App.fmt.bs(Math.abs(dBs)) + "</span>";
    }
    App.$("#ci-ef", s.el).addEventListener("input", pintarDif);
    App.$("#ci-bs", s.el).addEventListener("input", pintarDif);
    pintarDif();

    App.$("[data-ok]", s.foot).addEventListener("click", function () {
      var contEf = parseFloat(App.$("#ci-ef", s.el).value) || 0;
      var contBs = parseFloat(App.$("#ci-bs", s.el).value) || 0;
      var cierre = {
        id: previo ? previo.id : App.uid("ci"),
        fecha: hoy, porGrupo: datos.porGrupo, totalEsperado: datos.total,
        contadoEfectivo: contEf, contadoBs: contBs,
        difEfectivo: Math.round((contEf - espEf) * 100) / 100,
        difBs: Math.round(contBs - espBs),
        notas: App.$("#ci-notas", s.el).value.trim(),
        usuarioId: App.auth.user ? App.auth.user.id : null
      };
      App.db.cierres = App.db.cierres || [];
      if (previo) {
        var ix = App.db.cierres.findIndex(function (c) { return c.id === previo.id; });
        App.db.cierres[ix] = cierre;
      } else App.db.cierres.push(cierre);
      App.audit("cierre", App.fmt.fecha(hoy) + " · dif " + App.fmt.usd(cierre.difEfectivo) + " / " + App.fmt.bs(cierre.difBs));
      App.save(); App.toast("Cierre guardado 🧾");
      s.cerrar(); App.render();
    });
  };
})();
