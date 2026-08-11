/* ============================================================
   inventario.js - productos multi-marca con variantes, fotos,
   costos China→Vzla (solo súper) y plantilla WhatsApp
   ============================================================ */
window.App = window.App || {};

(function () {
  "use strict";
  var filtro = { tienda: null, categoria: null, stockBajo: false, texto: "" };
  var vistaInv = "lista";  // lista | analisis | kardex
  var ordenInv = "usd";    // orden de la vista análisis
  var kardexMotivo = null; // filtro de motivo en el kardex

  function productosFiltrados() {
    var C = App.calc;
    return App.db.productos.filter(function (p) {
      if (filtro.tienda && p.tienda !== filtro.tienda) return false;
      if (filtro.categoria && p.categoria !== filtro.categoria) return false;
      if (filtro.stockBajo && C.prodStock(p) > (p.stockMin || 0)) return false;
      if (filtro.texto) {
        var t = filtro.texto.toLowerCase();
        if (p.nombre.toLowerCase().indexOf(t) < 0 && (p.sku || "").toLowerCase().indexOf(t) < 0 &&
          String(p.codigoBarras || "").indexOf(t) < 0) return false;
      }
      return true;
    });
  }

  App.modInventario = {
    id: "inventario", titulo: "Inventario", icono: "inventario",
    render: function (el) {
      var C = App.calc;
      var lista = productosFiltrados();
      var esSuper = App.auth.esSuper();
      var valorInv = App.db.productos.reduce(function (s, p) { return s + C.prodStock(p) * C.prodCosto(p); }, 0);

      var html = '<div class="view"><div class="spread" style="margin-bottom:12px"><div><h1>📦 Inventario</h1>' +
        '<div class="small muted">' + App.db.productos.length + " productos" +
        (esSuper ? " · valor en costo " + App.fmt.usd(valorInv) : "") + "</div></div>" +
        (esSuper ? '<button class="btn primary" id="btn-prod-nuevo">' + App.icon("plus") + " Producto</button>" : "") + "</div>";

      html += '<div class="seg" style="margin-bottom:10px">' +
        '<button class="seg-btn' + (vistaInv === "lista" ? " active" : "") + '" data-vinv="lista">📋 Lista</button>' +
        '<button class="seg-btn' + (vistaInv === "analisis" ? " active" : "") + '" data-vinv="analisis">📊 Análisis</button>' +
        (esSuper ? '<button class="seg-btn' + (vistaInv === "kardex" ? " active" : "") + '" data-vinv="kardex">📜 Movimientos</button>' : "") +
        "</div>";

      html += '<div class="search-bar" style="margin-bottom:10px">' + App.icon("buscar") +
        '<input class="input" id="bus-prod" placeholder="Buscar por nombre o SKU…" value="' + App.esc(filtro.texto) + '"></div>';

      html += '<div class="chips scroll-x" style="margin-bottom:10px">' +
        '<button class="chip' + (!filtro.tienda ? " active" : "") + '" data-ft="">Ambas tiendas</button>' +
        App.db.settings.tiendas.map(function (t) {
          return '<button class="chip' + (filtro.tienda === t.id ? " active" : "") + '" data-ft="' + t.id + '">' + t.emoji + " " + App.esc(t.corto) + "</button>";
        }).join("") +
        '<button class="chip' + (filtro.stockBajo ? " active" : "") + '" data-fsb>⚠️ Stock bajo</button>' +
        "</div>";

      html += '<div class="chips scroll-x" style="margin-bottom:14px">' +
        '<button class="chip' + (!filtro.categoria ? " active" : "") + '" data-fc="">Todas</button>' +
        App.db.settings.categorias.map(function (c) {
          return '<button class="chip' + (filtro.categoria === c ? " active" : "") + '" data-fc="' + App.esc(c) + '">' + App.esc(c) + "</button>";
        }).join("") + "</div>";

      html += '<div id="prod-grid-wrap"></div></div>';
      el.innerHTML = html;

      function pintarGridProds() {
        var lista2 = productosFiltrados();
        var wrap = App.$("#prod-grid-wrap", el);
        if (!lista2.length) {
          wrap.innerHTML = '<div class="empty"><div class="big">📦</div><p>No hay productos con esos filtros.</p></div>';
          return;
        }
        var h2 = '<div class="prod-grid">';
        lista2.forEach(function (p) {
          var stock = C.prodStock(p);
          var stockCls = stock <= 0 ? "danger" : (stock <= (p.stockMin || 0) ? "warn" : "ok");
          var margen = C.prodMargen(p);
          h2 += '<div class="prod-card" data-prod="' + p.id + '">' +
            '<div class="prod-img ' + (p.fotos && p.fotos[0] ? "" : "thumb-" + p.tienda) + '"' +
            (p.fotos && p.fotos[0] ? "" : ' style="background:' + (p.tienda === "evz" ? "linear-gradient(135deg,rgba(10,132,255,.14),rgba(0,184,169,.12))" : "linear-gradient(135deg,rgba(232,67,143,.14),rgba(108,92,231,.12))") + '"') + ">" +
            (p.fotos && p.fotos[0] ? '<img src="' + App.esc(p.fotos[0]) + '" alt="">' : p.emoji) +
            App.pillTienda(p.tienda) +
            '<span class="pill stock-pill ' + stockCls + '">' + stock + " uds</span>" +
            "</div>" +
            '<div class="prod-body"><div class="prod-name">' + App.esc(p.nombre) + "</div>" +
            (C.precioVenta(p) < +p.precio
              ? '<div class="prod-price num">🔻 ' + App.fmt.usd(C.precioVenta(p)) + ' <span class="small muted" style="text-decoration:line-through;font-weight:400">' + App.fmt.usd(p.precio) + "</span></div>"
              : '<div class="prod-price num">' + App.fmt.usd(p.precio) + "</div>") +
            '<div class="prod-meta"><span>' + App.esc(p.categoria) + "</span>" +
            (esSuper ? '<span class="num">' + Math.round(margen * 100) + "% mg</span>" : "") + "</div></div></div>";
        });
        wrap.innerHTML = h2 + "</div>";
      }
      /* ---- vista análisis: histórico y capas de decisión por producto ---- */
      function pintarAnalisis() {
        var wrap = App.$("#prod-grid-wrap", el);
        var arr = C.productosAnalisis().filter(function (st) {
          var p = st.producto;
          if (filtro.tienda && p.tienda !== filtro.tienda) return false;
          if (filtro.categoria && p.categoria !== filtro.categoria) return false;
          if (filtro.stockBajo && st.stock > (p.stockMin || 0)) return false;
          if (filtro.texto) {
            var t = filtro.texto.toLowerCase();
            if (p.nombre.toLowerCase().indexOf(t) < 0 && (p.sku || "").toLowerCase().indexOf(t) < 0) return false;
          }
          return true;
        });
        arr.sort(function (a, b) {
          if (ordenInv === "unidades") return b.unidades - a.unidades;
          if (ordenInv === "ganancia") return b.ganancia - a.ganancia;
          if (ordenInv === "ultima") return (b.ultima || "") < (a.ultima || "") ? -1 : 1;
          if (ordenInv === "sinventa") return (b.diasSinVenta == null ? 9999 : b.diasSinVenta) - (a.diasSinVenta == null ? 9999 : a.diasSinVenta);
          if (ordenInv === "cobertura") return (a.coberturaDias == null ? 9e9 : a.coberturaDias) - (b.coberturaDias == null ? 9e9 : b.coberturaDias);
          return b.usd - a.usd;
        });
        var top = arr.slice().sort(function (a, b) { return b.usd - a.usd; })[0];
        var sin30 = arr.filter(function (s) { return s.diasSinVenta == null || s.diasSinVenta > 30; }).length;
        var criticos = arr.filter(function (s) { return s.coberturaDias != null && s.coberturaDias <= 7; }).length;
        var topTxt = top && top.usd > 0 ? App.esc(top.producto.emoji + " " + top.producto.nombre) : "-";
        var topSub = top && top.usd > 0 ? App.fmt.usd0(top.usd) + " históricos" : "sin ventas aún";

        var h = '<div class="grid-kpi" style="grid-template-columns:repeat(3,minmax(0,1fr))">' +
          '<div class="kpi" style="padding:12px 14px 8px"><div class="kpi-label">Top histórico</div><div class="kpi-value" style="font-size:14px;line-height:1.3">' + topTxt + '</div><div class="kpi-foot num">' + topSub + "</div></div>" +
          '<div class="kpi" style="padding:12px 14px 8px"><div class="kpi-label">Sin ventas 30d</div><div class="kpi-value" style="font-size:22px">' + sin30 + '</div><div class="kpi-foot">productos fríos</div></div>' +
          '<div class="kpi" style="padding:12px 14px 8px"><div class="kpi-label">Stock crítico</div><div class="kpi-value" style="font-size:22px">' + criticos + '</div><div class="kpi-foot">se agotan en ≤7 días</div></div></div>';

        h += '<div class="chips scroll-x" style="margin-bottom:10px">' +
          [["usd", "💵 $ vendido"], ["unidades", "📦 Unidades"], ["ganancia", "📈 Ganancia"], ["ultima", "🕐 Última venta"], ["sinventa", "🐌 Sin vender"], ["cobertura", "🔄 Por agotarse"]].map(function (o) {
            return '<button class="chip' + (ordenInv === o[0] ? " active" : "") + '" data-oinv="' + o[0] + '">' + o[1] + "</button>";
          }).join("") + "</div>";

        h += '<div class="card"><div class="list">';
        if (!arr.length) h += '<div class="empty"><p>Sin productos con esos filtros.</p></div>';
        arr.forEach(function (st) {
          var p = st.producto;
          h += '<div class="row-item" data-prod="' + p.id + '">' +
            '<div class="thumb ' + App.esc(p.tienda) + '">' + (p.fotos && p.fotos[0] ? '<img src="' + App.esc(p.fotos[0]) + '">' : p.emoji) + "</div>" +
            '<div class="row-main"><div class="row-title wrap" style="font-size:13px">' + App.esc(p.nombre) + " " + App.pillTienda(p.tienda) +
            ' <span class="pill ' + App.etiquetaProd.pill[st.etiqueta] + '">' + App.etiquetaProd.label[st.etiqueta] + "</span></div>" +
            '<div class="row-sub">' + st.unidades + " uds en " + st.ordenes + " órdenes · 1ª: " + (st.primera ? App.fmt.fecha(st.primera) : "-") +
            " · últ.: " + (st.ultima ? App.fmt.fechaRel(st.ultima) : "nunca") + "</div>" +
            '<div class="row-sub">stock ' + st.stock + (st.coberturaDias != null ? " · dura ≈" + st.coberturaDias + " días" : "") +
            (function () { var ec = C.enCaminoDeProducto(p.id); return ec ? " · 🚢 +" + ec.cant + (ec.llegadaEst ? " ~" + App.fmt.fecha(ec.llegadaEst) : "") : ""; })() +
            (esSuper && st.ads > 0 ? " · ads " + App.fmt.usd0(st.ads) : "") + "</div></div>" +
            '<div class="row-end"><span class="row-amount num">' + App.fmt.usd0(st.usd) + "</span>" +
            (esSuper ? '<div class="small muted num">gan. ' + App.fmt.usd0(st.ganancia) + "</div>" : "") + "</div></div>";
        });
        h += '</div><div class="chart-note">Toca un producto para ver su ficha con la sugerencia de decisión. "Dura ≈X días" = cuánto aguanta el stock al ritmo de venta de los últimos 30 días.</div></div>';
        wrap.innerHTML = h;
        App.$$("[data-oinv]", wrap).forEach(function (b) {
          b.addEventListener("click", function () { ordenInv = b.dataset.oinv; pintarAnalisis(); });
        });
      }

      /* ---- kardex global: todos los movimientos de stock con filtros ---- */
      function pintarKardex() {
        var wrap = App.$("#prod-grid-wrap", el);
        var MOT = { venta: "🛒 venta", "venta revertida": "↩️ venta revertida", compra: "📦 compra recibida", ajuste: "✏️ ajuste manual", devolucion: "↩️ devolución" };
        var movs = (App.db.movimientos || []).slice().reverse();
        if (kardexMotivo) {
          movs = movs.filter(function (m) {
            if (kardexMotivo === "devolucion") return m.motivo === "devolucion" || m.motivo === "venta revertida";
            return m.motivo === kardexMotivo;
          });
        }
        if (filtro.texto) {
          var t = filtro.texto.toLowerCase();
          movs = movs.filter(function (m) {
            var p = App.prod(m.productoId);
            return p && (p.nombre.toLowerCase().indexOf(t) >= 0 || (p.sku || "").toLowerCase().indexOf(t) >= 0);
          });
        }
        var h = '<div class="chips scroll-x" style="margin-bottom:10px">' +
          [["", "Todos"], ["venta", "🛒 Ventas"], ["compra", "📦 Compras"], ["ajuste", "✏️ Ajustes"], ["devolucion", "↩️ Devoluciones"]].map(function (m) {
            return '<button class="chip' + ((kardexMotivo || "") === m[0] ? " active" : "") + '" data-kmot="' + m[0] + '">' + m[1] + "</button>";
          }).join("") + "</div>";
        h += '<div class="card"><div class="card-head"><h2>📜 Kardex - Movimientos de stock</h2><span class="pill">' + movs.length + "</span></div>";
        if (!movs.length) {
          h += '<div class="empty" style="padding:16px"><p>Aún no hay movimientos' + (kardexMotivo || filtro.texto ? " con esos filtros" : "") +
            ". Se registran solos desde ahora: cada venta, ajuste de stock, pedido recibido o devolución deja su huella aquí.</p></div>";
        } else {
          h += '<div class="list">' + movs.slice(0, 120).map(function (m) {
            var p = App.prod(m.productoId);
            var u = App.usuario(m.usuarioId);
            return '<div class="row-item" data-prod="' + m.productoId + '">' +
              '<div class="thumb ' + (p ? p.tienda : "") + '">' + (p ? p.emoji : "❓") + "</div>" +
              '<div class="row-main"><div class="row-title" style="font-size:13px">' + App.esc(p ? p.nombre : "Producto eliminado") +
              (m.talla ? ' <span class="pill">' + App.esc(m.talla) + "</span>" : "") + "</div>" +
              '<div class="row-sub">' + App.esc(m.fecha) + " · " + (MOT[m.motivo] || App.esc(m.motivo)) +
              (u ? " · " + App.esc(u.nombre) : "") + (m.nota ? " · " + App.esc(m.nota) : "") + "</div></div>" +
              '<span class="num" style="font-weight:800;color:' + (m.delta > 0 ? "var(--ok)" : "var(--danger)") + '">' + (m.delta > 0 ? "+" : "") + m.delta + "</span></div>";
          }).join("") + "</div>" +
            (movs.length > 120 ? '<div class="chart-note">Mostrando los 120 más recientes de ' + movs.length + ".</div>" : "") +
            '<div class="chart-note">Toca un movimiento para abrir la ficha del producto. Si el conteo físico no cuadra, aquí encuentras cuándo y por qué se movió cada unidad.</div>';
        }
        h += "</div>";
        wrap.innerHTML = h;
        App.$$("[data-kmot]", wrap).forEach(function (b) {
          b.addEventListener("click", function () { kardexMotivo = b.dataset.kmot || null; pintarKardex(); });
        });
      }

      function pintar() {
        if (vistaInv === "kardex" && esSuper) pintarKardex();
        else if (vistaInv === "analisis") pintarAnalisis();
        else pintarGridProds();
      }
      pintar();

      /* búsqueda fluida: solo repinta la vista activa, el input no pierde el foco */
      App.$("#bus-prod").addEventListener("input", function (e) {
        filtro.texto = e.target.value;
        pintar();
      });
      App.$$("[data-vinv]", el).forEach(function (b) {
        b.addEventListener("click", function () { vistaInv = b.dataset.vinv; App.render(); });
      });
      App.$$("[data-ft]", el).forEach(function (b) { b.addEventListener("click", function () { filtro.tienda = b.dataset.ft || null; App.render(); }); });
      App.$$("[data-fc]", el).forEach(function (b) { b.addEventListener("click", function () { filtro.categoria = b.dataset.fc || null; App.render(); }); });
      var sb = App.$("[data-fsb]", el);
      if (sb) sb.addEventListener("click", function () { filtro.stockBajo = !filtro.stockBajo; App.render(); });
      var bn = App.$("#btn-prod-nuevo", el);
      if (bn) bn.addEventListener("click", function () { formProducto(null); });
      App.delegar(el, "click", "[data-prod]", function (e, t) {
        var p = App.prod(t.dataset.prod);
        if (p) detalleProducto(p);
      });
    }
  };

  /* abrir la ficha de un producto desde otros módulos (ventas) */
  App.abrirProducto = function (p) { detalleProducto(p); };

  /* ---------- detalle ---------- */
  function detalleProducto(p) {
    var C = App.calc;
    var esSuper = App.auth.esSuper();
    var stock = C.prodStock(p);
    var costo = C.prodCosto(p);
    var anal = C.productosAnalisis().filter(function (x) { return x.producto.id === p.id; })[0];

    /* navegación entre productos sin volver a la lista: respeta los filtros activos */
    var vecinos = productosFiltrados();
    var pos = vecinos.map(function (x) { return x.id; }).indexOf(p.id);
    if (pos < 0) { vecinos = App.db.productos; pos = vecinos.map(function (x) { return x.id; }).indexOf(p.id); }

    var cuerpo = "";
    if (vecinos.length > 1 && pos >= 0) {
      cuerpo += '<div class="nav-prod">' +
        '<button class="btn sm ghost" data-nav="-1"' + (pos === 0 ? " disabled" : "") + ">" + App.icon("chevL") + " Anterior</button>" +
        '<span class="small muted num">' + (pos + 1) + " de " + vecinos.length + "</span>" +
        '<button class="btn sm ghost" data-nav="1"' + (pos === vecinos.length - 1 ? " disabled" : "") + ">Siguiente " + App.icon("chevR") + "</button></div>";
    }
    if (p.fotos && p.fotos.length) {
      cuerpo += App.carruselFotos(p.fotos, 260);
    } else {
      cuerpo += '<div class="prod-img" style="border-radius:16px;aspect-ratio:auto;height:150px;background:' +
        (p.tienda === "evz" ? "linear-gradient(135deg,rgba(10,132,255,.14),rgba(0,184,169,.12))" : "linear-gradient(135deg,rgba(232,67,143,.14),rgba(108,92,231,.12))") +
        ';font-size:52px">' + p.emoji + "</div>";
    }

    cuerpo += '<div class="flex wrap" style="gap:6px;margin-top:4px">' + App.pillTienda(p.tienda) +
      '<span class="pill">' + App.esc(p.categoria) + "</span>" +
      (p.genero && p.genero !== "unisex" ? '<span class="pill">' + App.esc(p.genero) + "</span>" : "") +
      (p.sku ? '<span class="pill num">' + App.esc(p.sku) + "</span>" : "") + "</div>";

    var precioV = C.precioVenta(p);
    cuerpo += '<div class="spread"><div class="prod-price num" style="font-size:22px">' +
      (precioV < +p.precio ? "🔻 " + App.fmt.usd(precioV) + ' <span class="small muted" style="text-decoration:line-through;font-weight:400">' + App.fmt.usd(p.precio) + "</span>" : App.fmt.usd(p.precio)) +
      '</div><div class="small muted num">' + App.fmt.bs(C.bsDe(precioV)) + " (tasa € hoy)</div></div>";
    if (precioV < +p.precio) {
      cuerpo += '<div class="alert-item"><span>🔻 <b>En remate</b>' + (p.remate && p.remate.motivo ? ": " + App.esc(p.remate.motivo) : "") + " · se vende y se publica al precio rebajado</span></div>";
    }
    if (p.descripcion) cuerpo += '<p class="small muted texto-largo">' + App.esc(p.descripcion) + "</p>";

    /* stock: solo lectura (se ajusta desde el lápiz ✏️ para evitar toques accidentales) */
    cuerpo += '<hr class="divider"><div class="spread"><h3>🧮 Stock</h3><span class="pill ' +
      (stock <= 0 ? "danger" : stock <= (p.stockMin || 0) ? "warn" : "ok") + '">' + stock + " unidades</span></div>";
    if (p.tallas && p.tallas.length) {
      cuerpo += '<div class="list">' + p.tallas.map(function (t) {
        return '<div class="row-item static"><div class="row-main"><div class="row-title">' + App.varInfo(p).s + " " + App.esc(t.talla) + "</div></div>" +
          '<span class="pill num ' + (+t.stock <= 0 ? "danger" : "") + '">' + t.stock + "</span></div>";
      }).join("") + "</div>";
    }
    cuerpo += '<div class="small muted">Se ajusta desde ✏️ Editar · alerta cuando quede ≤ ' + (p.stockMin || 0) + "</div>";

    /* costos (súper) */
    if (esSuper) {
      var costoAds = +p.costoAds || 0;
      var conAds = costo + costoAds;
      var invertidoAds = C.adsDeProducto(p.id);
      cuerpo += '<hr class="divider"><h3>💰 Costos y margen</h3><div class="table-wrap"><table class="mini">' +
        '<tr><td>Costo en China (unidad)</td><td class="num">' + App.fmt.usd(p.costoChina) + "</td></tr>" +
        '<tr><td>Flete China → Vzla (unidad)</td><td class="num">' + App.fmt.usd(p.flete) + "</td></tr>" +
        '<tr><td><b>Costo puesto en Vzla</b></td><td class="num"><b>' + App.fmt.usd(costo) + "</b></td></tr>" +
        '<tr><td>Ads estimado por unidad</td><td class="num">' + App.fmt.usd(costoAds) + "</td></tr>" +
        '<tr><td><b>Costo total con ads</b></td><td class="num"><b>' + App.fmt.usd(conAds) + "</b></td></tr>" +
        '<tr><td>Ganancia neta por unidad</td><td class="num"><b>' + App.fmt.usd(p.precio - conAds) + "</b> · " + Math.round(p.precio ? (p.precio - conAds) / p.precio * 100 : 0) + "%</td></tr>" +
        "</table></div>" +
        '<div class="spread small" style="margin-top:8px"><span class="muted">Invertido en ads (real)</span><b class="num">' + App.fmt.usd(invertidoAds) +
        (p.presupuestoAds > 0 ? " de " + App.fmt.usd(p.presupuestoAds) : "") + "</b></div>" +
        (p.presupuestoAds > 0
          ? '<span class="hbar-track" style="margin-top:4px"><span class="hbar-fill" style="width:' + Math.min(100, invertidoAds / p.presupuestoAds * 100).toFixed(0) + "%;background:" + (invertidoAds > p.presupuestoAds ? "var(--danger)" : "var(--c5)") + '"></span></span>' +
          (invertidoAds > p.presupuestoAds ? '<div class="small" style="color:var(--danger);margin-top:4px">⚠️ Te pasaste del presupuesto por ' + App.fmt.usd(invertidoAds - p.presupuestoAds) + "</div>" : "")
          : "") +
        '<div class="small muted" style="margin-top:6px">Reponer este producto cuesta hoy ~' + App.fmt.usd(costo * Math.max(1, stock)) + " (" + Math.max(1, stock) + " uds).</div>";
    }

    /* histórico completo del producto */
    cuerpo += '<hr class="divider"><div class="spread"><h3>📈 Histórico del producto</h3>' +
      '<span class="pill ' + App.etiquetaProd.pill[anal.etiqueta] + '">' + App.etiquetaProd.label[anal.etiqueta] + "</span></div>" +
      '<div class="table-wrap"><table class="mini">' +
      '<tr><td>Unidades vendidas</td><td class="num"><b>' + anal.unidades + "</b> en " + anal.ordenes + " órdenes</td></tr>" +
      '<tr><td>Ingresos históricos</td><td class="num"><b>' + App.fmt.usd(anal.usd) + "</b></td></tr>" +
      (esSuper ? '<tr><td>Ganancia histórica</td><td class="num"><b>' + App.fmt.usd(anal.ganancia) + "</b></td></tr>" : "") +
      '<tr><td>Primera venta</td><td class="num">' + (anal.primera ? App.fmt.fecha(anal.primera) : "todavía ninguna") + "</td></tr>" +
      '<tr><td>Última venta</td><td class="num">' + (anal.ultima ? App.fmt.fechaRel(anal.ultima) + (anal.diasSinVenta > 1 ? " · hace " + anal.diasSinVenta + " días" : "") : "todavía ninguna") + "</td></tr>" +
      '<tr><td>Ritmo del último mes</td><td class="num">' + anal.u30 + " uds / 30 días</td></tr>" +
      (anal.coberturaDias != null ? '<tr><td>El stock actual dura</td><td class="num">≈ ' + anal.coberturaDias + " días</td></tr>" : "") +
      (function () {
        var ec = C.enCaminoDeProducto(p.id);
        return ec ? '<tr><td>🚢 En camino (pedido)</td><td class="num"><b>+' + ec.cant + " uds</b>" + (ec.llegadaEst ? " · llega ~" + App.fmt.fecha(ec.llegadaEst) : "") + "</td></tr>" : "";
      })() +
      "</table></div>" +
      '<div class="card" style="margin-top:8px;padding:10px 12px;box-shadow:none;background:var(--tint-soft)"><span class="small">' + anal.sugerencia + "</span></div>";

    /* kardex: últimos movimientos de stock (solo súper) */
    if (esSuper) {
      var movs = (App.db.movimientos || []).filter(function (m) { return m.productoId === p.id; }).slice(-8).reverse();
      if (movs.length) {
        var MOT = { venta: "🛒 venta", "venta revertida": "↩️ venta revertida", compra: "📦 compra recibida", ajuste: "✏️ ajuste manual", devolucion: "↩️ devolución" };
        cuerpo += '<hr class="divider"><h3>📜 Últimos movimientos</h3><div class="list">' + movs.map(function (m) {
          return '<div class="row-item static"><div class="row-main"><div class="row-sub">' + App.esc(m.fecha) + " · " +
            (MOT[m.motivo] || App.esc(m.motivo)) + (m.talla ? " · talla " + App.esc(m.talla) : "") + "</div></div>" +
            '<span class="num small" style="font-weight:700;color:' + (m.delta > 0 ? "var(--ok)" : "var(--danger)") + '">' +
            (m.delta > 0 ? "+" : "") + m.delta + "</span></div>";
        }).join("") + "</div>";
      }
    }

    var s = App.sheet({
      titulo: "📦 Producto",
      cuerpo: cuerpo,
      pie: '<button class="btn wa" data-wa>' + App.icon("wa") + " Copiar para WhatsApp</button>" +
        (esSuper ? '<button class="btn" data-editar>' + App.icon("editar") + "</button>" +
          '<button class="btn danger" data-borrar style="flex:0 0 auto">' + App.icon("basura") + "</button>" : "")
    });
    App.carruselInit(s.el);

    /* saltar al producto anterior/siguiente (botones, y flechas del teclado en escritorio) */
    function irA(delta) {
      var otro = vecinos[pos + delta];
      if (!otro) return;
      document.removeEventListener("keydown", onFlechas);
      s.cerrar();
      detalleProducto(otro);
    }
    App.$$("[data-nav]", s.el).forEach(function (b) {
      b.addEventListener("click", function () { irA(+b.dataset.nav); });
    });
    function onFlechas(e) {
      if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
      var abiertos = App.$$(".sheet-backdrop");
      if (abiertos[abiertos.length - 1] !== s.el) return; /* solo la ficha de arriba */
      var t = e.target;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT")) return;
      irA(e.key === "ArrowRight" ? 1 : -1);
    }
    document.addEventListener("keydown", onFlechas);
    var cerrarOrig = s.cerrar;
    s.cerrar = function () { document.removeEventListener("keydown", onFlechas); return cerrarOrig.apply(null, arguments); };

    /* (el ajuste de stock vive solo en ✏️ Editar: un toque accidental aquí descontaba unidades) */

    App.$("[data-wa]", s.el).addEventListener("click", function () {
      App.copiar(App.textoProducto(p), "Ficha copiada - pégala en WhatsApp o Instagram");
    });
    var be = App.$("[data-editar]", s.el);
    if (be) be.addEventListener("click", function () { s.cerrar(); formProducto(p); });
    var bb = App.$("[data-borrar]", s.el);
    if (bb) bb.addEventListener("click", function () {
      App.confirmar("¿Eliminar “" + p.nombre + "”? Las ventas pasadas lo mantendrán en su historial.", { peligro: true, accion: "Eliminar" }).then(function (si) {
        if (!si) return;
        App.db.productos = App.db.productos.filter(function (x) { return x.id !== p.id; });
        App.save(); App.toast("Producto eliminado");
        s.cerrar(); App.render();
      });
    });
  }

  /* ---------- formulario nuevo / editar ---------- */
  function formProducto(orig) {
    var FP = orig ? JSON.parse(JSON.stringify(orig)) : {
      id: null, sku: "", codigoBarras: "", nombre: "", emoji: "🧸", tienda: "ljt", categoria: App.db.settings.categorias[0],
      genero: "unisex", descripcion: "", tallas: null, tipoVariante: "talla", stock: 0, stockMin: 2,
      costoChina: 0, flete: 0, costoAds: 0, presupuestoAds: 0, precio: 0, fotos: []
    };
    var conTallas = !!(FP.tallas && FP.tallas.length);
    if (!conTallas) FP.tallas = null;

    var s = App.sheet({
      titulo: orig ? "✏️ Editar producto" : "✨ Nuevo producto",
      cuerpo:
        '<div class="field"><label>Fotos</label><div class="flex wrap" id="fp-fotos" style="gap:8px"></div>' +
        '<input type="file" id="fp-file" accept="image/*" multiple class="hidden"></div>' +
        '<div class="form-grid">' +
        '<div class="field full"><label>Nombre</label><input class="input" id="fp-nombre" value="' + App.esc(FP.nombre) + '"></div>' +
        '<div class="field"><label>Emoji (portada)</label><input class="input" id="fp-emoji" value="' + App.esc(FP.emoji) + '" maxlength="4"></div>' +
        '<div class="field"><label>SKU</label><input class="input" id="fp-sku" value="' + App.esc(FP.sku) + '" placeholder="LJT-010"></div>' +
        '<div class="field full"><label>Código de barras (escanéalo o escríbelo)</label><div class="flex" style="gap:8px">' +
        '<input class="input num" id="fp-codigo" value="' + App.esc(FP.codigoBarras || "") + '" placeholder="7591234567890" inputmode="numeric" style="flex:1">' +
        '<button type="button" class="btn icon" id="fp-scan" title="Escanear con cámara" style="width:42px;height:42px;flex:none">' + App.icon("camara") + "</button></div></div>" +
        '<div class="field full"><label>Tienda</label><div class="seg" id="fp-tienda">' +
        App.db.settings.tiendas.map(function (t) {
          return '<button type="button" class="seg-btn' + (FP.tienda === t.id ? " active" : "") + '" data-v="' + t.id + '">' + t.emoji + " " + App.esc(t.corto) + "</button>";
        }).join("") + "</div></div>" +
        '<div class="field"><label>Categoría</label><select class="select" id="fp-cat">' +
        App.db.settings.categorias.map(function (c) { return "<option" + (FP.categoria === c ? " selected" : "") + ">" + App.esc(c) + "</option>"; }).join("") +
        "</select></div>" +
        '<div class="field full"><label>Género / público</label><div class="seg" id="fp-genero">' +
        ["niña", "niño", "unisex"].map(function (g) {
          return '<button type="button" class="seg-btn' + (FP.genero === g ? " active" : "") + '" data-v="' + g + '">' + g + "</button>";
        }).join("") + "</div></div>" +
        '<div class="field"><label>Precio de venta (USD)</label><input class="input num" id="fp-precio" type="number" step="0.01" min="0" value="' + FP.precio + '"></div>' +
        '<div class="field full"><label>Descripción (se usa en la plantilla de WhatsApp)</label><textarea class="textarea" id="fp-desc">' + App.esc(FP.descripcion) + "</textarea></div>" +
        "</div>" +
        '<hr class="divider"><div class="spread"><h3 id="fp-var-titulo">📏 Variantes</h3><label class="flex small muted">Maneja variantes <span class="switch"><input type="checkbox" id="fp-con-tallas"' + (conTallas ? " checked" : "") + "><i></i></span></label></div>" +
        '<div id="fp-tallas"></div>' +
        '<div class="form-grid" style="margin-top:8px">' +
        '<div class="field" id="fp-stock-wrap"><label>Stock</label><input class="input num" id="fp-stock" type="number" min="0" value="' + (FP.stock || 0) + '"></div>' +
        '<div class="field"><label>Alerta de stock (mínimo)</label><input class="input num" id="fp-stockmin" type="number" min="0" value="' + (FP.stockMin || 0) + '"></div></div>' +
        (App.auth.esSuper()
          ? '<hr class="divider"><div class="spread"><h3>🔻 Remate</h3><label class="flex small muted">En remate <span class="switch"><input type="checkbox" id="fp-remate-on"' + (FP.remate && FP.remate.activo ? " checked" : "") + "><i></i></span></label></div>" +
          '<div id="fp-remate-box" class="' + (FP.remate && FP.remate.activo ? "" : "hidden") + '"><div class="form-grid">' +
          '<div class="field"><label>Precio de remate (USD)</label><input class="input num" id="fp-remate-precio" type="number" step="0.01" min="0" value="' + ((FP.remate && FP.remate.precioUsd) || "") + '"></div>' +
          '<div class="field"><label>Motivo (opcional)</label><input class="input" id="fp-remate-motivo" placeholder="Caja dañada, último disponible…" value="' + App.esc((FP.remate && FP.remate.motivo) || "") + '"></div></div>' +
          '<div class="small muted">Mientras esté activo, el producto se vende y se publica a este precio (el normal sale tachado). Al venderse, apágalo aquí mismo.</div></div>'
          : "") +
        (App.auth.esSuper()
          ? '<hr class="divider"><h3>💰 Costos (solo tú los ves)</h3>' +
          '<p class="small muted">Los tres primeros son <b>por cada unidad</b>: lo que te cuesta UNA pieza puesta en Venezuela.</p>' +
          '<div class="form-grid" style="margin-top:8px">' +
          '<div class="field"><label>Costo por unidad en China (USD)</label><input class="input num" id="fp-china" type="number" step="0.01" min="0" value="' + FP.costoChina + '"></div>' +
          '<div class="field"><label>Flete por unidad (USD)</label><input class="input num" id="fp-flete" type="number" step="0.01" min="0" value="' + FP.flete + '"></div>' +
          '<div class="field full"><div class="small muted">💡 Si pagaste el flete por el lote completo, divídelo: $50 de flete por 20 piezas = <b>2,50</b> por unidad.</div></div>' +
          '<div class="field"><label>Ads estimado por unidad (USD)</label><input class="input num" id="fp-ads" type="number" step="0.01" min="0" value="' + (FP.costoAds || 0) + '"></div>' +
          '<div class="field"><label>Presupuesto total de ads (USD, opcional)</label><input class="input num" id="fp-presu" type="number" step="1" min="0" value="' + (FP.presupuestoAds || 0) + '"></div>' +
          '<div class="field full"><div class="small muted">El presupuesto de ads NO es por unidad: es el total que piensas invertir en publicidad de este producto.</div></div></div>' +
          '<div class="small muted" id="fp-margen" style="margin-top:6px"></div>'
          : ""),
      pie: '<button class="btn primary" data-ok>' + (orig ? "Guardar cambios" : "Crear producto") + "</button>"
    });

    function pintarFotos() {
      var box = App.$("#fp-fotos", s.el);
      box.innerHTML = (FP.fotos || []).map(function (f, i) {
        return '<div style="position:relative"><img src="' + App.esc(f) + '" class="thumb" style="width:64px;height:64px">' +
          '<button class="btn icon" data-qf="' + i + '" style="position:absolute;top:-10px;right:-10px;width:40px;height:40px;border-radius:99px">' + App.icon("x") + "</button></div>";
      }).join("") +
        '<button class="btn icon" id="fp-add-foto" style="width:64px;height:64px;border-radius:12px">' + App.icon("camara") + "</button>";
      App.$("#fp-add-foto", box).addEventListener("click", function () { App.$("#fp-file", s.el).click(); });
      App.$$("[data-qf]", box).forEach(function (b) {
        b.addEventListener("click", function () { FP.fotos.splice(+b.dataset.qf, 1); pintarFotos(); });
      });
    }
    App.$("#fp-scan", s.el).addEventListener("click", function () {
      App.escanear(function (codigo) {
        App.$("#fp-codigo", s.el).value = codigo;
        App.toast("Código capturado: " + codigo);
      });
    });
    App.$("#fp-file", s.el).addEventListener("change", function (e) {
      var files = Array.prototype.slice.call(e.target.files);
      Promise.all(files.map(function (f) {
        return App.comprimirImagen(f, 900).then(function (d) { return App.subirFoto(d, "productos"); });
      })).then(function (datas) {
        FP.fotos = (FP.fotos || []).concat(datas).slice(0, 5);
        pintarFotos();
      }, function () { App.toast("No se pudo procesar alguna imagen", "err"); });
    });

    function pintarTallas() {
      var box = App.$("#fp-tallas", s.el);
      var wrap = App.$("#fp-stock-wrap", s.el);
      var titulo = App.$("#fp-var-titulo", s.el);
      var vInfo = App.TIPOS_VARIANTE[FP.tipoVariante || "talla"] || App.TIPOS_VARIANTE.talla;
      if (titulo) titulo.textContent = vInfo.emoji + " " + (conTallas ? vInfo.p : "Variantes");
      if (!conTallas) { box.innerHTML = ""; wrap.classList.remove("hidden"); return; }
      wrap.classList.add("hidden");
      FP.tallas = FP.tallas || [];
      /* tipo de variante: define la etiqueta en TODO el sistema (ficha, venta, WhatsApp) */
      box.innerHTML = '<div class="field" style="margin-bottom:8px"><label>¿Qué distingue cada variante?</label><div class="seg">' +
        ["talla", "color", "modelo"].map(function (tp) {
          return '<button type="button" class="seg-btn' + ((FP.tipoVariante || "talla") === tp ? " active" : "") + '" data-vtipo="' + tp + '">' +
            App.TIPOS_VARIANTE[tp].emoji + " " + App.TIPOS_VARIANTE[tp].p + "</button>";
        }).join("") + "</div></div>" +
        FP.tallas.map(function (t, i) {
          return '<div class="flex" style="gap:8px;margin-bottom:6px">' +
            '<input class="input" data-tn="' + i + '" value="' + App.esc(t.talla) + '" placeholder="' + vInfo.s + ' (ej: ' + vInfo.ej + ')" style="flex:2">' +
            '<input class="input num" data-ts="' + i + '" type="number" min="0" value="' + t.stock + '" placeholder="Stock" style="flex:1">' +
            '<button class="btn icon" data-tq="' + i + '">' + App.icon("x") + "</button></div>";
        }).join("") + '<button class="btn sm ghost" id="fp-add-talla">+ Agregar ' + vInfo.s.toLowerCase() + "</button>";
      App.$$("[data-vtipo]", box).forEach(function (b) {
        b.addEventListener("click", function () { FP.tipoVariante = b.dataset.vtipo; pintarTallas(); });
      });
      App.$("#fp-add-talla", box).addEventListener("click", function () {
        FP.tallas.push({ talla: "", stock: 0 }); pintarTallas();
      });
      App.$$("[data-tn]", box).forEach(function (inp) { inp.addEventListener("input", function () { FP.tallas[+inp.dataset.tn].talla = inp.value; }); });
      App.$$("[data-ts]", box).forEach(function (inp) { inp.addEventListener("input", function () { FP.tallas[+inp.dataset.ts].stock = Math.max(0, parseInt(inp.value, 10) || 0); }); });
      App.$$("[data-tq]", box).forEach(function (b) { b.addEventListener("click", function () { FP.tallas.splice(+b.dataset.tq, 1); pintarTallas(); }); });
    }
    App.$("#fp-con-tallas", s.el).addEventListener("change", function (e) {
      conTallas = e.target.checked;
      if (conTallas && (!FP.tallas || !FP.tallas.length)) FP.tallas = [{ talla: "", stock: 0 }];
      pintarTallas();
    });
    var swRemate = App.$("#fp-remate-on", s.el);
    if (swRemate) swRemate.addEventListener("change", function (e) {
      App.$("#fp-remate-box", s.el).classList.toggle("hidden", !e.target.checked);
    });

    function pintarMargen() {
      var box = App.$("#fp-margen", s.el);
      if (!box) return;
      var china = parseFloat(App.$("#fp-china", s.el).value) || 0;
      var flete = parseFloat(App.$("#fp-flete", s.el).value) || 0;
      var ads = parseFloat((App.$("#fp-ads", s.el) || {}).value) || 0;
      var precio = parseFloat(App.$("#fp-precio", s.el).value) || 0;
      var costo = china + flete;
      var conAds = costo + ads;
      box.innerHTML = "Costo puesto en Vzla: <b>" + App.fmt.usd(costo) + "</b> · Con ads: <b>" + App.fmt.usd(conAds) + "</b> · Ganancia neta: <b>" +
        App.fmt.usd(precio - conAds) + "</b> (" + Math.round(precio > 0 ? (precio - conAds) / precio * 100 : 0) + "%)" +
        (precio > 0 && precio < conAds ? ' <span class="pill danger">¡pierdes con los ads incluidos!</span>' : "");
    }
    ["fp-china", "fp-flete", "fp-precio", "fp-ads"].forEach(function (id) {
      var inp = App.$("#" + id, s.el);
      if (inp) inp.addEventListener("input", pintarMargen);
    });

    App.$$("#fp-tienda .seg-btn", s.el).forEach(function (b) {
      b.addEventListener("click", function () {
        FP.tienda = b.dataset.v;
        App.$$("#fp-tienda .seg-btn", s.el).forEach(function (x) { x.classList.toggle("active", x === b); });
      });
    });
    App.$$("#fp-genero .seg-btn", s.el).forEach(function (b) {
      b.addEventListener("click", function () {
        FP.genero = b.dataset.v;
        App.$$("#fp-genero .seg-btn", s.el).forEach(function (x) { x.classList.toggle("active", x === b); });
      });
    });

    pintarFotos(); pintarTallas(); pintarMargen();

    App.$("[data-ok]", s.foot).addEventListener("click", function () {
      var nombre = App.$("#fp-nombre", s.el).value.trim();
      var precio = parseFloat(App.$("#fp-precio", s.el).value) || 0;
      if (!nombre) { App.toast("El producto necesita nombre", "err"); return; }
      if (precio <= 0) { App.toast("Indica el precio de venta", "err"); return; }
      FP.nombre = nombre;
      FP.emoji = App.$("#fp-emoji", s.el).value.trim() || "📦";
      FP.sku = App.$("#fp-sku", s.el).value.trim();
      FP.codigoBarras = App.$("#fp-codigo", s.el).value.trim();
      FP.categoria = App.$("#fp-cat", s.el).value;
      FP.descripcion = App.$("#fp-desc", s.el).value.trim();
      if (orig && +orig.precio !== precio) {
        App.audit("precio_producto", FP.nombre + ": " + App.fmt.usd(orig.precio) + " → " + App.fmt.usd(precio));
      }
      FP.precio = precio;
      FP.stockMin = parseInt(App.$("#fp-stockmin", s.el).value, 10) || 0;
      FP.tipoVariante = FP.tipoVariante || "talla";
      if (conTallas) {
        var vNombre = (App.TIPOS_VARIANTE[FP.tipoVariante] || App.TIPOS_VARIANTE.talla).s.toLowerCase();
        FP.tallas = (FP.tallas || []).filter(function (t) { return t.talla.trim(); });
        if (!FP.tallas.length) { App.toast("Agrega al menos un(a) " + vNombre + " o desactiva las variantes", "err"); return; }
        FP.stock = null;
      } else {
        FP.tallas = null;
        FP.stock = parseInt(App.$("#fp-stock", s.el).value, 10) || 0;
      }
      if (App.auth.esSuper()) {
        var remOn = App.$("#fp-remate-on", s.el).checked;
        if (remOn) {
          var remPrecio = parseFloat(App.$("#fp-remate-precio", s.el).value) || 0;
          if (remPrecio <= 0) { App.toast("Indica el precio de remate (o apaga el remate)", "err"); return; }
          if (remPrecio >= precio) { App.toast("El remate debe ser MENOR que el precio normal (" + App.fmt.usd(precio) + ")", "err"); return; }
          FP.remate = { activo: true, precioUsd: remPrecio, motivo: App.$("#fp-remate-motivo", s.el).value.trim(), desde: App.hoyISO() };
        } else {
          FP.remate = null;
        }
        FP.costoChina = parseFloat(App.$("#fp-china", s.el).value) || 0;
        FP.flete = parseFloat(App.$("#fp-flete", s.el).value) || 0;
        FP.costoAds = parseFloat((App.$("#fp-ads", s.el) || {}).value) || 0;
        FP.presupuestoAds = parseFloat((App.$("#fp-presu", s.el) || {}).value) || 0;
      }
      if (orig) {
        var idx = App.db.productos.findIndex(function (x) { return x.id === orig.id; });
        App.db.productos[idx] = FP;
      } else {
        FP.id = App.uid("p");
        FP.creadoEl = App.hoyISO();
        App.db.productos.push(FP);
      }
      registrarAjustesStock(orig, FP);
      App.save();
      App.toast(orig ? "Producto actualizado" : "Producto creado 🎉");
      s.cerrar(); App.render();
    });
  }

  /* los cambios de stock hechos en el formulario quedan en el kardex como ajuste
     (antes solo los registraban los botones +/− de la ficha, ya retirados) */
  function registrarAjustesStock(orig, FP) {
    var viejo = {};
    if (orig) {
      if (orig.tallas && orig.tallas.length) orig.tallas.forEach(function (t) { viejo[t.talla] = +t.stock || 0; });
      else viejo[""] = +orig.stock || 0;
    }
    var nuevo = {};
    if (FP.tallas && FP.tallas.length) FP.tallas.forEach(function (t) { nuevo[t.talla] = +t.stock || 0; });
    else nuevo[""] = +FP.stock || 0;
    var claves = {};
    Object.keys(viejo).forEach(function (k) { claves[k] = 1; });
    Object.keys(nuevo).forEach(function (k) { claves[k] = 1; });
    Object.keys(claves).forEach(function (k) {
      var delta = (nuevo[k] || 0) - (viejo[k] || 0);
      if (delta) App.calc.registrarMov(FP.id, k || null, delta, "ajuste", null, orig ? "ajuste en edición" : "stock inicial");
    });
  }
})();
