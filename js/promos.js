/* ============================================================
   promos.js - bundles/promociones con análisis de rentabilidad
   ============================================================ */
window.App = window.App || {};

(function () {
  "use strict";

  App.modPromos = {
    id: "promos", titulo: "Promos", icono: "promos",
    render: function (el) {
      var C = App.calc;
      var esSuper = App.auth.esSuper();
      var promos = App.db.promos.slice().sort(function (a, b) { return a.desde < b.desde ? 1 : -1; });

      var html = '<div class="view"><div class="spread" style="margin-bottom:12px"><div><h1>🏷️ Promociones</h1>' +
        '<div class="small muted">Combos y ofertas por temporada</div></div>' +
        (esSuper ? '<button class="btn primary" id="btn-promo-nueva">' + App.icon("plus") + " Promo</button>" : "") + "</div>";

      if (!promos.length) {
        html += '<div class="empty"><div class="big">🏷️</div><p>Crea tu primera promo: elige productos, ponle precio de combo y el sistema te dice si ganas o pierdes.</p></div>';
      }
      promos.forEach(function (pm) {
        var st = C.promoStats(pm);
        var estado = C.promoEstado(pm);
        var estadoPill = estado === "activa" ? '<span class="pill ok">● Activa</span>' :
          estado === "programada" ? '<span class="pill info">Programada</span>' : '<span class="pill">Finalizada</span>';
        var margenPill = st.margenUnit < 0
          ? '<span class="pill danger">⚠️ pierdes ' + App.fmt.usd(-st.margenUnit) + " por combo</span>"
          : '<span class="pill ok">ganas ' + App.fmt.usd(st.margenUnit) + " por combo (" + Math.round(st.margenPct * 100) + "%)</span>";

        html += '<div class="card lift" data-promo="' + pm.id + '" style="cursor:pointer">' +
          '<div class="spread"><div class="row-title" style="font-size:15px">🏷️ ' + App.esc(pm.nombre) + "</div>" + estadoPill + "</div>" +
          '<div class="row-sub">' + App.esc(pm.ocasion || "") + " · " + App.fmt.fecha(pm.desde) + " → " + App.fmt.fecha(pm.hasta) + "</div>" +
          '<div class="small" style="margin:8px 0 4px">' +
          pm.items.map(function (it) {
            var p = App.prod(it.productoId);
            return "• " + it.cant + "× " + App.esc(p ? p.nombre : "¿producto eliminado?");
          }).join("<br>") + "</div>" +
          '<div class="spread" style="margin-top:8px"><div>' +
          '<span class="muted small">Regular <s class="num">' + App.fmt.usd(st.precioRegular) + "</s></span> " +
          '<b class="num" style="font-size:17px">' + App.fmt.usd(pm.precioPromo) + "</b></div>" +
          (esSuper ? margenPill : "") + "</div>" +
          '<div class="spread small muted" style="margin-top:6px"><span>' + st.ventas + " venta" + (st.ventas === 1 ? "" : "s") + " · " + App.fmt.usd(st.ingreso) + " generados</span>" +
          (esSuper && st.ventas ? '<span class="num">Ganancia total: <b>' + App.fmt.usd(st.ganancia) + "</b></span>" : "") + "</div></div>";
      });
      html += "</div>";
      el.innerHTML = html;

      var bn = App.$("#btn-promo-nueva", el);
      if (bn) bn.addEventListener("click", function () { formPromo(null); });
      App.delegar(el, "click", "[data-promo]", function (e, t) {
        if (!App.auth.esSuper()) return;
        var pm = App.promo(t.dataset.promo);
        if (pm) formPromo(pm);
      });
    }
  };

  /* ocasión: festividades del calendario + opción libre */
  function ocasionHtml(actual) {
    var opciones = (App.db.festividades || []).slice()
      .sort(function (a, b) { return a.fecha < b.fecha ? -1 : 1; })
      .map(function (f) { return { v: f.nombre + " " + f.fecha.slice(0, 4), lbl: f.emoji + " " + f.nombre + " " + f.fecha.slice(0, 4) }; });
    var enLista = opciones.some(function (o) { return o.v === actual; });
    var esOtra = actual && !enLista;
    return '<select class="select" id="pm-ocasion-sel">' +
      '<option value="">Sin ocasión específica</option>' +
      opciones.map(function (o) { return '<option value="' + App.esc(o.v) + '"' + (actual === o.v ? " selected" : "") + ">" + App.esc(o.lbl) + "</option>"; }).join("") +
      '<option value="__otra"' + (esOtra ? " selected" : "") + '>✏️ Otra (escríbela)…</option></select>' +
      '<input class="input" id="pm-ocasion-txt" value="' + (esOtra ? App.esc(actual) : "") + '" placeholder="Escribe la ocasión" style="margin-top:6px' + (esOtra ? "" : ";display:none") + '">';
  }

  function formPromo(orig) {
    var FP = orig ? JSON.parse(JSON.stringify(orig)) : {
      id: null, nombre: "", ocasion: "", desde: App.hoyISO(),
      hasta: App.toISO(App.addDays(new Date(), 14)), items: [], precioPromo: 0
    };

    var s = App.sheet({
      titulo: orig ? "✏️ Editar promo" : "🏷️ Nueva promo",
      cuerpo:
        '<div class="form-grid">' +
        '<div class="field full"><label>Nombre</label><input class="input" id="pm-nombre" value="' + App.esc(FP.nombre) + '" placeholder="Combo Día del Niño"></div>' +
        '<div class="field full"><label>Ocasión</label>' + ocasionHtml(FP.ocasion) + "</div>" +
        '<div class="field"><label>Desde</label><input class="input" id="pm-desde" type="date" value="' + FP.desde + '"></div>' +
        '<div class="field"><label>Hasta</label><input class="input" id="pm-hasta" type="date" value="' + FP.hasta + '"></div>' +
        "</div>" +
        '<h3 style="margin-top:6px">🧸 Productos del combo</h3>' +
        '<div class="search-bar" style="margin-top:6px">' + App.icon("buscar") + '<input class="input" id="pm-bus" placeholder="Buscar producto…"></div>' +
        '<div class="list" id="pm-res"></div><div id="pm-items"></div>' +
        '<div class="field" style="margin-top:10px"><label>Precio del combo (USD)</label>' +
        '<input class="input num" id="pm-precio" type="number" step="0.01" min="0" value="' + (FP.precioPromo || "") + '"></div>' +
        '<div class="card" id="pm-analisis" style="padding:12px 14px;box-shadow:none"></div>',
      pie: (orig ? '<button class="btn danger" data-borrar style="flex:0 0 auto">' + App.icon("basura") + "</button>" : "") +
        '<button class="btn primary" data-ok>' + (orig ? "Guardar" : "Crear promo") + "</button>"
    });

    function analizar() {
      var precio = parseFloat(App.$("#pm-precio", s.el).value) || 0;
      var regular = 0, costo = 0;
      FP.items.forEach(function (it) {
        var p = App.prod(it.productoId);
        if (!p) return;
        regular += p.precio * it.cant;
        costo += App.calc.prodCosto(p) * it.cant;
      });
      var box = App.$("#pm-analisis", s.el);
      if (!FP.items.length) { box.innerHTML = '<span class="small muted">Agrega productos para ver el análisis.</span>'; return; }
      var margen = precio - costo;
      var desc = regular ? (1 - precio / regular) * 100 : 0;
      box.innerHTML =
        '<div class="spread small"><span class="muted">Precio regular sumado</span><b class="num">' + App.fmt.usd(regular) + "</b></div>" +
        '<div class="spread small"><span class="muted">Costo de la mercancía</span><b class="num">' + App.fmt.usd(costo) + "</b></div>" +
        '<div class="spread small"><span class="muted">Descuento que percibe el cliente</span><b class="num">' + Math.round(desc) + "%</b></div>" +
        '<hr class="divider" style="margin:8px 0">' +
        '<div class="spread"><span>Resultado por combo</span>' +
        (precio <= 0 ? '<span class="pill">pon el precio</span>' :
          margen < 0 ? '<span class="pill danger">⚠️ PIERDES ' + App.fmt.usd(-margen) + "</span>" :
            '<span class="pill ok">ganas ' + App.fmt.usd(margen) + " (" + Math.round(precio ? margen / precio * 100 : 0) + "%)</span>") + "</div>";
    }

    function pintarItems() {
      var box = App.$("#pm-items", s.el);
      box.innerHTML = FP.items.length ? '<div class="list" style="margin-top:6px">' + FP.items.map(function (it, ix) {
        var p = App.prod(it.productoId);
        return '<div class="row-item static"><div class="thumb ' + (p ? p.tienda : "") + '">' + (p ? p.emoji : "❓") + "</div>" +
          '<div class="row-main"><div class="row-title">' + App.esc(p ? p.nombre : "Eliminado") + '</div><div class="row-sub num">' + (p ? App.fmt.usd(p.precio) + " c/u" : "") + "</div></div>" +
          '<span class="stepper"><button data-pm-menos="' + ix + '">−</button><span>' + it.cant + '</span><button data-pm-mas="' + ix + '">+</button></span>' +
          '<button class="btn icon" data-pm-quitar="' + ix + '" style="width:36px;height:36px">' + App.icon("x") + "</button></div>";
      }).join("") + "</div>" : "";
      App.$$("[data-pm-mas]", box).forEach(function (b) { b.addEventListener("click", function () { FP.items[+b.dataset.pmMas].cant++; pintarItems(); analizar(); }); });
      App.$$("[data-pm-menos]", box).forEach(function (b) {
        b.addEventListener("click", function () {
          var it = FP.items[+b.dataset.pmMenos];
          if (it.cant > 1) it.cant--; else FP.items.splice(+b.dataset.pmMenos, 1);
          pintarItems(); analizar();
        });
      });
      App.$$("[data-pm-quitar]", box).forEach(function (b) { b.addEventListener("click", function () { FP.items.splice(+b.dataset.pmQuitar, 1); pintarItems(); analizar(); }); });
    }

    App.$("#pm-bus", s.el).addEventListener("input", function (e) {
      var t = e.target.value.toLowerCase().trim();
      var res = App.$("#pm-res", s.el);
      if (!t) { res.innerHTML = ""; return; }
      var hits = App.db.productos.filter(function (p) { return p.nombre.toLowerCase().indexOf(t) >= 0; }).slice(0, 5);
      res.innerHTML = hits.map(function (p) {
        return '<div class="row-item" data-pm-add="' + p.id + '"><div class="thumb ' + p.tienda + '">' + p.emoji + "</div>" +
          '<div class="row-main"><div class="row-title">' + App.esc(p.nombre) + '</div><div class="row-sub num">' + App.fmt.usd(p.precio) + "</div></div>" + App.pillTienda(p.tienda) + "</div>";
      }).join("");
      App.$$("[data-pm-add]", res).forEach(function (r) {
        r.addEventListener("click", function () {
          var ya = FP.items.filter(function (i) { return i.productoId === r.dataset.pmAdd; })[0];
          if (ya) ya.cant++;
          else FP.items.push({ productoId: r.dataset.pmAdd, cant: 1 });
          e.target.value = ""; res.innerHTML = "";
          pintarItems(); analizar();
        });
      });
    });
    App.$("#pm-precio", s.el).addEventListener("input", analizar);
    App.$("#pm-ocasion-sel", s.el).addEventListener("change", function () {
      App.$("#pm-ocasion-txt", s.el).style.display = this.value === "__otra" ? "" : "none";
      if (this.value === "__otra") App.$("#pm-ocasion-txt", s.el).focus();
    });
    pintarItems(); analizar();

    App.$("[data-ok]", s.foot).addEventListener("click", function () {
      var nombre = App.$("#pm-nombre", s.el).value.trim();
      var precio = parseFloat(App.$("#pm-precio", s.el).value) || 0;
      if (!nombre) { App.toast("Ponle nombre a la promo", "err"); return; }
      if (!FP.items.length) { App.toast("Agrega al menos un producto", "err"); return; }
      if (precio <= 0) { App.toast("Indica el precio del combo", "err"); return; }
      FP.nombre = nombre;
      var ocSel = App.$("#pm-ocasion-sel", s.el).value;
      FP.ocasion = ocSel === "__otra" ? App.$("#pm-ocasion-txt", s.el).value.trim() : ocSel;
      FP.desde = App.$("#pm-desde", s.el).value;
      FP.hasta = App.$("#pm-hasta", s.el).value;
      FP.precioPromo = precio;
      if (orig) {
        var ix = App.db.promos.findIndex(function (x) { return x.id === orig.id; });
        App.db.promos[ix] = FP;
      } else {
        FP.id = App.uid("pm");
        App.db.promos.push(FP);
      }
      App.save(); App.toast(orig ? "Promo actualizada" : "Promo creada 🏷️");
      s.cerrar(); App.render();
    });
    var bb = App.$("[data-borrar]", s.foot);
    if (bb) bb.addEventListener("click", function () {
      App.confirmar("¿Eliminar esta promo? Las ventas hechas con ella se conservan.", { peligro: true, accion: "Eliminar" }).then(function (si) {
        if (!si) return;
        App.db.promos = App.db.promos.filter(function (x) { return x.id !== orig.id; });
        App.save(); App.toast("Promo eliminada"); s.cerrar(); App.render();
      });
    });
  }
})();
