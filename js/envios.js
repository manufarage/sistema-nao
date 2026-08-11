/* ============================================================
   envios.js - despacho por agencia (guía + foto), motorizados
   Caracas con pago por carrera, y seguimiento de estados
   ============================================================ */
window.App = window.App || {};

(function () {
  "use strict";
  var tab = "pendientes";
  var envFiltroAg = null; // filtro por agencia en la pestaña Pendientes

  /* URL de rastreo: usa la plantilla de la agencia si existe ({{guia}}), si no busca en Google */
  function trackUrl(e) {
    var ag = App.agencia(e.agenciaId);
    var num = e.guia && e.guia.numero ? e.guia.numero : "";
    if (ag && ag.urlTracking) return ag.urlTracking.replace("{{guia}}", encodeURIComponent(num));
    return "https://www.google.com/search?q=" + encodeURIComponent("rastrear guía " + (ag ? ag.nombre + " " : "") + "Venezuela " + num);
  }

  function cuandoRetira(f) {
    if (!f) return "";
    if (f === App.hoyISO()) return "retira HOY";
    if (f === App.toISO(App.addDays(new Date(), 1))) return "retira mañana";
    return (f < App.hoyISO() ? "quedó en retirar el " : "retira el ") + App.fmt.fecha(f);
  }

  function cardEnvio(v, acciones) {
    var C = App.calc;
    var cli = App.cliente(v.clienteId);
    var e = v.entrega;
    var esMoto = e.tipo === "motorizado";
    var quien = esMoto
      ? "🏍️ " + App.esc((App.motorizado(e.motorizadoId) || {}).nombre || "Motorizado")
      : e.tipo === "agencia"
        ? "📦 " + App.esc((App.agencia(e.agenciaId) || {}).nombre || "Agencia")
        : "🏪 Retiro en tienda";
    var destino = e.destinoCiudad
      ? App.esc(e.destinoCiudad + (e.destinoEstado ? ", " + e.destinoEstado : ""))
      : (cli ? App.esc((cli.ciudad || "") + (cli.estado ? ", " + cli.estado : "")) : "-");
    var estadoPill = '<span class="pill ' + (App.envioEstado.pill[e.estado] || "") + '">' + (App.envioEstado.label[e.estado] || e.estado) + "</span>";
    var retrasado = e.tipo !== "retiro" && (e.estado === "preparando" || e.estado === "por_llevar") &&
      v.fecha.slice(0, 10) <= App.toISO(App.addDays(new Date(), -2));

    var html = '<div class="card lift' + (retrasado ? " late" : "") + '" style="padding:14px 15px">' +
      '<div class="spread"><div class="row-title"' + (cli ? ' data-cli="' + cli.id + '" style="cursor:pointer"' : "") + '>' + App.esc(cli ? cli.nombre : "Cliente casual") + "</div>" +
      '<div class="flex" style="gap:6px;flex-wrap:wrap;justify-content:flex-end"><span class="pill ' + (esMoto ? "warn" : "info") + '">' + quien + "</span>" + estadoPill +
      (retrasado ? '<span class="pill danger">⚠️ Retrasado</span>' : "") + "</div></div>" +
      '<div class="row-sub" style="margin-top:2px">' + destino + " · pedido " + App.fmt.fechaRel(v.fecha.slice(0, 10)) +
      (e.tipo === "retiro" && e.fechaRetiro ? " · <b>" + cuandoRetira(e.fechaRetiro) + (e.horaRetiro ? " · " + e.horaRetiro : "") + "</b>" : "") + "</div>" +
      (e.destinoDireccion ? '<div class="row-sub">🏢 ' + App.esc(e.destinoDireccion) + "</div>" : "") +
      '<div class="small" style="margin:8px 0 2px">' +
      v.items.map(function (i) { return "• " + i.cant + "× " + App.esc(i.nombre) + (i.talla ? " (" + App.esc(i.talla) + ")" : ""); }).join("<br>") +
      "</div>";
    if (e.guia && e.guia.numero) {
      html += '<div class="flex" style="margin-top:8px;gap:8px">' +
        (e.guia.foto ? '<img src="' + App.esc(e.guia.foto) + '" class="thumb" data-ver-guia="' + App.esc(v.id) + '" style="cursor:zoom-in">' : '<div class="thumb">🧾</div>') +
        '<div style="flex:1;min-width:0"><div class="row-title num">' + App.esc(e.guia.numero) + '</div><div class="row-sub">despachado ' + App.fmt.fechaRel(e.guia.fecha) + "</div></div>" +
        '<button class="btn icon" data-copiar="' + App.esc(e.guia.numero) + '" title="Copiar guía">' + App.icon("copiar") + "</button>" +
        '<a class="btn icon" target="_blank" rel="noopener" href="' + trackUrl(e) + '" title="Rastrear en la web de la agencia">' + App.icon("buscar") + "</a></div>";
    }
    html += '<div class="flex wrap" style="margin-top:10px;gap:8px">' + acciones +
      (cli ? '<a class="btn sm wa" target="_blank" rel="noopener" href="' + App.waLink(cli.telefono) + '">' + App.icon("wa") + " Avisar</a>" : "") +
      '<button class="btn sm ghost" data-detalle="' + v.id + '">Ver venta</button>' +
      "</div></div>";
    return html;
  }

  App.modEnvios = {
    id: "envios", titulo: "Envíos", icono: "envios",
    render: function (el) {
      var C = App.calc;
      var pend = C.pendientesEnvio();
      var retiros = C.retirosPendientes();
      var transito = C.enTransito();
      var entregados = App.db.ventas.filter(function (v) {
        return v.entrega && v.entrega.tipo !== "retiro" && v.entrega.estado === "entregado";
      }).sort(function (a, b) { return a.fecha > b.fecha ? -1 : 1; }).slice(0, 25);
      var motos = C.motorizadosResumen();
      var deudaTotal = motos.reduce(function (s, m) { return s + m.deuda; }, 0);

      var html = '<div class="view"><div class="spread" style="margin-bottom:12px"><h1>🚚 Envíos</h1>' +
        (App.auth.esSuper() ? '<button class="btn sm ghost" id="btn-agencia">+ Agencia</button>' : "") + "</div>";

      var totalPend = pend.length + retiros.length;
      html += '<div class="tabs">' +
        [["pendientes", "Pendientes" + (totalPend ? " · " + totalPend : "")],
        ["transito", "En camino" + (transito.length ? " · " + transito.length : "")],
        ["entregados", "Entregados"],
        ["motos", "Motorizados" + (deudaTotal > 0 ? " · $" + Math.round(deudaTotal) : "")]].map(function (t) {
          return '<button class="tab' + (tab === t[0] ? " active" : "") + '" data-tab="' + t[0] + '">' + t[1] + "</button>";
        }).join("") + "</div>";

      html += '<div id="tab-cont">';
      if (tab === "pendientes") {
        /* filtro por agencia */
        var agsP = {};
        pend.forEach(function (v) {
          var k = v.entrega.tipo === "motorizado" ? "moto" : (v.entrega.agenciaId || "?");
          agsP[k] = (agsP[k] || 0) + 1;
        });
        if (pend.length && Object.keys(agsP).length > 1) {
          html += '<div class="chips scroll-x" style="margin-bottom:10px">' +
            '<button class="chip' + (!envFiltroAg ? " active" : "") + '" data-fa="">Todas · ' + pend.length + "</button>" +
            Object.keys(agsP).filter(function (k) { return k !== "moto" && k !== "?"; }).map(function (k) {
              var ag = App.agencia(k);
              return '<button class="chip' + (envFiltroAg === k ? " active" : "") + '" data-fa="' + k + '">📦 ' + App.esc(ag ? ag.nombre : "Agencia") + " · " + agsP[k] + "</button>";
            }).join("") +
            (agsP.moto ? '<button class="chip' + (envFiltroAg === "moto" ? " active" : "") + '" data-fa="moto">🏍️ Motos · ' + agsP.moto + "</button>" : "") +
            "</div>";
        }
        var pendF = pend.filter(function (v) {
          if (!envFiltroAg) return true;
          if (envFiltroAg === "moto") return v.entrega.tipo === "motorizado";
          return v.entrega.agenciaId === envFiltroAg;
        });
        var prep = pendF.filter(function (v) { return v.entrega.estado === "preparando"; });
        var llevar = pendF.filter(function (v) { return v.entrega.estado === "por_llevar"; });
        if (!totalPend) html += '<div class="empty"><div class="big">🎉</div><p>Todo despachado. Nada pendiente.</p></div>';
        if (prep.length) {
          html += '<div class="eyebrow" style="margin:4px 2px 8px">🔧 Armando pedido · ' + prep.length + "</div>";
          prep.forEach(function (v) {
            html += cardEnvio(v, '<button class="btn sm primary" data-armado="' + v.id + '">✓ Pedido armado</button>');
          });
        }
        if (llevar.length) {
          html += '<div class="eyebrow" style="margin:10px 2px 8px">🚚 Listos para salir · ' + llevar.length + "</div>";
          llevar.forEach(function (v) {
            html += cardEnvio(v, v.entrega.tipo === "agencia"
              ? '<button class="btn sm primary" data-despachar="' + v.id + '">' + App.icon("guia") + " Despachar con guía</button>"
              : '<button class="btn sm primary" data-entregado="' + v.id + '">✓ Entregado</button>');
          });
        }
        if (retiros.length) {
          html += '<div class="eyebrow" style="margin:10px 2px 8px">🏪 Retiros programados · ' + retiros.length + "</div>";
          retiros.forEach(function (v) {
            html += cardEnvio(v, '<button class="btn sm primary" data-entregado="' + v.id + '">✓ Retirado</button>');
          });
        }
      } else if (tab === "transito") {
        if (!transito.length) html += '<div class="empty"><div class="big">🚚</div><p>No hay paquetes en camino.</p></div>';
        transito.forEach(function (v) {
          var desde = (v.entrega.guia && v.entrega.guia.fecha) || v.fecha.slice(0, 10);
          var diasFuera = Math.round((new Date(App.hoyISO()) - new Date(desde)) / 864e5);
          html += cardEnvio(v,
            (diasFuera >= 3 ? '<span class="pill warn">❓ ' + diasFuera + " días - consulta a la agencia</span>" : "") +
            '<button class="btn sm ok" data-entregado="' + v.id + '">✓ Llegó al cliente</button>');
        });
      } else if (tab === "entregados") {
        if (!entregados.length) html += '<div class="empty"><p>Aún no hay entregas completadas.</p></div>';
        html += '<div class="card"><div class="list">';
        entregados.forEach(function (v) {
          var cli = App.cliente(v.clienteId);
          var e = v.entrega;
          html += '<div class="row-item" data-detalle="' + v.id + '">' +
            '<div class="thumb">' + (e.tipo === "motorizado" ? "🏍️" : "📦") + "</div>" +
            '<div class="row-main"><div class="row-title">' + App.esc(cli ? cli.nombre : "Cliente casual") + "</div>" +
            '<div class="row-sub">' + (e.guia && e.guia.numero ? "Guía " + App.esc(e.guia.numero) + " · " : "") + App.fmt.fechaRel(v.fecha.slice(0, 10)) + "</div></div>" +
            '<span class="pill ok">✓</span></div>';
        });
        html += "</div></div>";
      } else if (tab === "motos") {
        html += '<div class="small muted" style="margin-bottom:10px">Pagas por carrera acordada. Marca las carreras cuando le pagues al motorizado.</div>';
        if (App.auth.esSuper()) html += '<button class="btn sm ghost" id="btn-moto" style="margin-bottom:10px">+ Motorizado</button>';
        motos.forEach(function (m) {
          html += '<div class="card" style="padding:14px 15px">' +
            '<div class="spread"><div><div class="row-title">' + App.esc(m.motorizado.nombre) + "</div>" +
            '<div class="row-sub">' + m.carreras + " carreras · pagado histórico " + App.fmt.usd(m.pagado) + "</div></div>" +
            '<a class="btn icon wa" target="_blank" rel="noopener" href="' + App.waLink(m.motorizado.telefono) + '">' + App.icon("wa") + "</a></div>";
          if (m.deuda > 0) {
            html += '<div class="spread" style="margin-top:8px"><span class="pill danger">Le debes ' + App.fmt.usd(m.deuda) + "</span>" +
              '<button class="btn sm primary" data-pagar-todo="' + m.motorizado.id + '">Pagar todo</button></div><div class="list" style="margin-top:6px">';
            m.pendListado.forEach(function (v) {
              var cli = App.cliente(v.clienteId);
              html += '<div class="row-item" data-carrera="' + v.id + '"><div class="row-main">' +
                '<div class="row-title" style="font-size:13px">' + App.esc(cli ? cli.nombre : "Cliente casual") + "</div>" +
                '<div class="row-sub">' + App.fmt.fechaRel(v.fecha.slice(0, 10)) + " · " +
                App.esc(v.items.map(function (i) { return i.cant + "× " + i.nombre; }).join(", ")) + "</div></div>" +
                '<span class="num small" style="margin-right:8px">' + App.fmt.usd(v.entrega.costoEnvio || 0) + "</span>" +
                '<button class="btn sm" data-pagar-una="' + v.id + '">✓ Pagada</button></div>';
            });
            html += "</div>";
          } else {
            html += '<div class="pill ok" style="margin-top:8px">Al día ✓</div>';
          }
          html += "</div>";
        });
      }
      html += "</div></div>";
      el.innerHTML = html;

      /* eventos */
      App.$$("[data-tab]", el).forEach(function (b) {
        b.addEventListener("click", function () { tab = b.dataset.tab; App.render(); });
      });
      App.$$("[data-fa]", el).forEach(function (b) {
        b.addEventListener("click", function () { envFiltroAg = b.dataset.fa || null; App.render(); });
      });
      App.delegar(el, "click", "[data-despachar]", function (e, t) { despacharSheet(t.dataset.despachar); });
      App.delegar(el, "click", "[data-armado]", function (e, t) {
        var v = buscarVenta(t.dataset.armado);
        if (!v) return;
        v.entrega.estado = "por_llevar";
        App.save(); App.toast("Pedido armado - listo para salir 🚚"); App.render();
      });
      App.delegar(el, "click", "[data-cli]", function (e, t) {
        var c = App.cliente(t.dataset.cli);
        if (c && App.abrirCliente) App.abrirCliente(c);
      });
      App.delegar(el, "click", "[data-entregado]", function (e, t) {
        var v = buscarVenta(t.dataset.entregado);
        if (!v) return;
        v.entrega.estado = "entregado";
        App.save(); App.toast("Entrega completada 🎉"); App.render();
      });
      App.delegar(el, "click", "[data-copiar]", function (e, t) { App.copiar(t.dataset.copiar, "Guía copiada"); });
      App.delegar(el, "click", "[data-ver-guia]", function (e, t) {
        var v = buscarVenta(t.dataset.verGuia);
        if (v && v.entrega.guia && v.entrega.guia.foto) {
          App.sheet({ titulo: "🧾 Guía " + (v.entrega.guia.numero || ""), cuerpo: '<img src="' + App.esc(v.entrega.guia.foto) + '" style="width:100%;border-radius:14px">' });
        }
      });
      App.delegar(el, "click", "[data-detalle]", function (e, t) {
        var v = buscarVenta(t.dataset.detalle);
        if (v) App.abrirVenta(v);
      });
      App.delegar(el, "click", "[data-carrera]", function (e, t) {
        if (e.target.closest("[data-pagar-una]")) return;
        var v = buscarVenta(t.dataset.carrera);
        if (v) App.abrirVenta(v);
      });
      App.delegar(el, "click", "[data-pagar-todo]", function (e, t) {
        App.confirmar("¿Marcar todas las carreras de este motorizado como pagadas?", { accion: "Sí, pagué todo" }).then(function (si) {
          if (!si) return;
          App.db.ventas.forEach(function (v) {
            if (v.entrega && v.entrega.tipo === "motorizado" && v.entrega.motorizadoId === t.dataset.pagarTodo) v.entrega.pagadoMotorizado = true;
          });
          App.save(); App.toast("Carreras pagadas"); App.render();
        });
      });
      App.delegar(el, "click", "[data-pagar-una]", function (e, t) {
        var v = buscarVenta(t.dataset.pagarUna);
        if (!v) return;
        v.entrega.pagadoMotorizado = true;
        App.save(); App.toast("Carrera pagada"); App.render();
      });
      var ba = App.$("#btn-agencia", el);
      if (ba) ba.addEventListener("click", nuevaAgencia);
      var bm = App.$("#btn-moto", el);
      if (bm) bm.addEventListener("click", nuevoMotorizado);
    }
  };

  function buscarVenta(id) {
    return App.db.ventas.filter(function (x) { return x.id === id; })[0] || null;
  }

  /* ---------- despachar con guía ---------- */
  function despacharSheet(ventaId) {
    var v = buscarVenta(ventaId);
    if (!v) return;
    var ag = App.agencia(v.entrega.agenciaId);
    var fotoData = null;

    var s = App.sheet({
      titulo: "📦 Despachar por " + (ag ? ag.nombre : "agencia"),
      cuerpo:
        '<div class="field"><label>Número de guía</label><input class="input num" id="g-num" placeholder="MRW-123456789" autocomplete="off"></div>' +
        '<div class="field"><label>Fecha de despacho</label><input class="input" id="g-fecha" type="date" value="' + App.hoyISO() + '"></div>' +
        '<div class="field"><label>Foto de la guía</label>' +
        '<input type="file" id="g-foto" accept="image/*" capture="environment" class="hidden">' +
        '<button class="btn ghost block" id="g-btn-foto">' + App.icon("camara") + " Tomar / elegir foto</button>" +
        '<div id="g-preview" style="margin-top:8px"></div></div>',
      pie: '<button class="btn primary" data-ok>Marcar como enviado</button>'
    });

    var fotoSubiendo = null; /* promesa del upload en curso: guardar espera a que termine */
    App.$("#g-btn-foto", s.el).addEventListener("click", function () { App.$("#g-foto", s.el).click(); });
    App.$("#g-foto", s.el).addEventListener("change", function (e) {
      var f = e.target.files[0];
      if (!f) return;
      App.comprimirImagen(f, 1000).then(function (data) {
        fotoData = data;
        App.$("#g-preview", s.el).innerHTML = '<img src="' + App.esc(data) + '" style="width:100%;max-height:220px;object-fit:contain;border-radius:14px;background:var(--field-bg)">';
        fotoSubiendo = App.subirFoto(data, "guias").then(function (url) { fotoData = url; }, function () { });
      }, function () { App.toast("No se pudo leer la imagen", "err"); });
    });
    App.$("[data-ok]", s.foot).addEventListener("click", function () {
      var num = App.$("#g-num", s.el).value.trim();
      if (!num && !fotoData) { App.toast("Escribe el número de guía o sube la foto", "err"); return; }
      var btn = App.$("[data-ok]", s.foot);
      btn.disabled = true; btn.textContent = "Guardando…";
      (fotoSubiendo || Promise.resolve()).then(function () {
        v.entrega.guia = { numero: num || "(en foto)", foto: fotoData, fecha: App.$("#g-fecha", s.el).value || App.hoyISO() };
        v.entrega.estado = "enviado";
        App.save(); App.toast("Pedido despachado 📦");
        s.cerrar(); App.render();
      });
    });
  }

  /* ---------- altas rápidas ---------- */
  function nuevaAgencia() {
    var s = App.sheet({
      titulo: "🚛 Nueva agencia de envío",
      cuerpo: '<div class="field"><label>Nombre</label><input class="input" id="a-nombre" placeholder="Ej: Zoom, MRW, Yummy Rides…"></div>',
      pie: '<button class="btn primary" data-ok>Agregar</button>'
    });
    App.$("[data-ok]", s.foot).addEventListener("click", function () {
      var n = App.$("#a-nombre", s.el).value.trim();
      if (!n) { App.toast("Escribe el nombre", "err"); return; }
      App.db.settings.agencias.push({ id: App.uid("ag"), nombre: n });
      App.save(); App.toast("Agencia agregada"); s.cerrar(); App.render();
    });
  }
  function nuevoMotorizado() {
    var s = App.sheet({
      titulo: "🏍️ Nuevo motorizado",
      cuerpo: '<div class="form-grid">' +
        '<div class="field full"><label>Nombre</label><input class="input" id="m-nombre" placeholder="Carlos (moto)"></div>' +
        '<div class="field full"><label>Teléfono</label><input class="input" id="m-tel" inputmode="tel" placeholder="0412-1234567"></div></div>',
      pie: '<button class="btn primary" data-ok>Agregar</button>'
    });
    App.$("[data-ok]", s.foot).addEventListener("click", function () {
      var n = App.$("#m-nombre", s.el).value.trim();
      if (!n) { App.toast("Escribe el nombre", "err"); return; }
      App.db.motorizados.push({ id: App.uid("m"), nombre: n, telefono: App.$("#m-tel", s.el).value.trim() });
      App.save(); App.toast("Motorizado agregado"); s.cerrar(); App.render();
    });
  }
})();
