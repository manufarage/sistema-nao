/* ============================================================
   tareas.js - Inbox: avisos automáticos (calculados al vuelo desde
   importaciones/tarifas/cotizaciones) + tareas manuales de Manuel
   ============================================================ */
window.App = window.App || {};

(function () {
  "use strict";

  /* orden lógico del ciclo de una importación (solo para "estado X o posterior") */
  var ORDEN_IMPORT = ["proforma", "anticipo", "produccion", "lista", "almacen", "embarcada", "transito", "llegada", "entregada"];

  var PRIORIDAD = {
    alta: { label: "Alta", pill: "danger" },
    normal: { label: "Normal", pill: "info" },
    baja: { label: "Baja", pill: "" }
  };
  var REF_LABEL = { importacion: "la importación", proveedor: "el proveedor", cotizacion: "la cotización", tarifa: "la tarifa" };
  var REF_HASH = { importacion: "#/importaciones", proveedor: "#/fabricas", cotizacion: "#/cotizaciones", tarifa: "#/carga" };

  App.modTareas = {
    id: "tareas", titulo: "Inbox", icono: "inbox",
    /* la usa el boton + del movil */
    nueva: function () { formTarea(null); },
    render: function (el) {
      var hoy = App.hoyISO();
      var av = avisos();
      var todas = App.db.tareas || [];
      var activas = todas.filter(function (t) { return !t.hecha; });
      var hechas = todas.filter(function (t) { return t.hecha; })
        .sort(function (a, b) { return (a.hechaEl || "") < (b.hechaEl || "") ? 1 : ((a.hechaEl || "") > (b.hechaEl || "") ? -1 : 0); })
        .slice(0, 10);

      var limiteSemana = App.toISO(App.addDays(App.fromISO(hoy), 7));
      function ordenFecha(lista) {
        return lista.slice().sort(function (a, b) { return a.fecha < b.fecha ? -1 : (a.fecha > b.fecha ? 1 : 0); });
      }
      var vencidas = ordenFecha(activas.filter(function (t) { return t.fecha && t.fecha < hoy; }));
      var deHoy = activas.filter(function (t) { return t.fecha === hoy; });
      var estaSemana = ordenFecha(activas.filter(function (t) { return t.fecha && t.fecha > hoy && t.fecha <= limiteSemana; }));
      var masAdelante = ordenFecha(activas.filter(function (t) { return t.fecha && t.fecha > limiteSemana; }));
      var sinFecha = activas.filter(function (t) { return !t.fecha; });

      var html = '<div class="view"><div class="spread" style="margin-bottom:12px"><div><h1>📥 Inbox</h1>' +
        '<div class="small muted">Avisos automáticos y tus tareas, todo en un solo lugar</div></div>' +
        '<button class="btn primary" id="btn-tarea-nueva">' + App.icon("plus") + " Tarea</button></div>";

      html += '<div class="grid-kpi">' +
        '<div class="kpi"><div class="kpi-label">Avisos</div><div class="kpi-value">' + av.length + '</div><div class="kpi-foot">del sistema</div></div>' +
        '<div class="kpi"><div class="kpi-label">Vencidas</div><div class="kpi-value">' + vencidas.length + '</div><div class="kpi-foot">tareas atrasadas</div></div>' +
        '<div class="kpi"><div class="kpi-label">Para hoy</div><div class="kpi-value">' + deHoy.length + '</div><div class="kpi-foot">tareas de hoy</div></div>' +
        "</div>";

      var primero = true;
      if (av.length) { html += seccionAvisos(av, primero); primero = false; }
      if (vencidas.length) { html += seccionTareas("⏰ Vencidas", vencidas, "danger", primero); primero = false; }
      if (deHoy.length) { html += seccionTareas("📅 Hoy", deHoy, "warn", primero); primero = false; }
      if (estaSemana.length) { html += seccionTareas("🗓️ Esta semana", estaSemana, "", primero); primero = false; }
      if (masAdelante.length) { html += seccionTareas("📌 Más adelante", masAdelante, "", primero); primero = false; }
      if (sinFecha.length) { html += seccionTareas("🗂️ Sin fecha", sinFecha, "", primero); primero = false; }
      if (hechas.length) { html += seccionTareas("✅ Hechas · últimas 10", hechas, "ok", primero); primero = false; }

      if (primero) {
        html += '<div class="empty"><div class="big">📥</div><p>Todo al día. Aquí van a aparecer solos los recordatorios de producción, pagos y llegadas de tus importaciones.</p></div>';
      }

      html += "</div>";
      el.innerHTML = html;

      var bNueva = App.$("#btn-tarea-nueva", el);
      if (bNueva) bNueva.addEventListener("click", function () { formTarea(null); });

      App.delegar(el, "click", "[data-aviso-ir]", function (e, t) {
        var a = av[+t.dataset.avisoIr];
        if (a && a.ir) location.hash = a.ir;
      });
      App.delegar(el, "click", "[data-tarea]", function (e, t) {
        if (e.target.closest("[data-stop]")) return;
        var tarea = buscarTarea(t.dataset.tarea);
        if (tarea) formTarea(tarea);
      });
      App.delegar(el, "click", "[data-tarea-toggle]", function (e, t) {
        e.stopPropagation();
        var tarea = buscarTarea(t.dataset.tareaToggle);
        if (!tarea) return;
        tarea.hecha = !tarea.hecha;
        tarea.hechaEl = tarea.hecha ? App.hoyISO() : null;
        App.save();
        App.toast(tarea.hecha ? "Tarea marcada como hecha ✅" : "Tarea desmarcada");
        App.render();
      });
      App.delegar(el, "click", "[data-tarea-borrar]", function (e, t) {
        e.stopPropagation();
        App.confirmar("¿Eliminar esta tarea?", { peligro: true, accion: "Eliminar" }).then(function (si) {
          if (!si) return;
          App.db.tareas = (App.db.tareas || []).filter(function (x) { return x.id !== t.dataset.tareaBorrar; });
          App.save(); App.toast("Tarea eliminada"); App.render();
        });
      });
      App.delegar(el, "click", "[data-tarea-ir]", function (e, t) {
        e.stopPropagation();
        var tarea = buscarTarea(t.dataset.tareaIr);
        if (tarea && tarea.refTipo && REF_HASH[tarea.refTipo]) location.hash = REF_HASH[tarea.refTipo];
      });
    },
    pendientes: pendientes,
    avisos: avisos
  };

  /* ============================================================
     avisos automáticos: se calculan al vuelo, nunca se guardan
     ============================================================ */
  function avisos() {
    try {
      var out = [];
      var hoy = App.hoyISO();
      var avisoTarifaDias = (App.db.settings && App.db.settings.avisoTarifaDias) || 30;

      (App.db.importaciones || []).forEach(function (imp) {
        var fechas = imp.fechas || {};

        /* 1. producción vencida */
        if (imp.estado === "produccion" && fechas.lista && fechas.lista < hoy) {
          out.push({
            nivel: "alto",
            titulo: "Producción vencida",
            detalle: "La producción de " + tituloImp(imp) + " debía estar lista el " + App.fmt.fecha(fechas.lista) +
              ". Escríbele a " + nombreProveedor(imp.proveedorId) + " para ver cómo va.",
            ir: "#/importaciones"
          });
        }
        /* 2. llegada vencida */
        if (imp.estado === "transito" && fechas.eta && fechas.eta < hoy) {
          out.push({
            nivel: "alto",
            titulo: "Llegada vencida",
            detalle: tituloImp(imp) + " debía llegar el " + App.fmt.fecha(fechas.eta) +
              " y todavía sigue sin llegar. Pregúntale a " + nombreForwarder(imp.forwarderId) + " qué pasó.",
            ir: "#/importaciones"
          });
        }
        /* 3. falta pagar a la fábrica */
        if (esOPosterior(imp.estado, "produccion")) {
          var factura = +imp.valorFactura || 0;
          var pagadoFab = sumaMontos(imp.pagosFabrica);
          if (factura > 0 && pagadoFab < factura - 0.009) {
            out.push({
              nivel: "medio",
              titulo: "Falta pagar a la fábrica",
              detalle: "A " + nombreProveedor(imp.proveedorId) + " le falta cobrar " + App.fmt.usd(factura - pagadoFab) + " de " + tituloImp(imp) + ".",
              ir: "#/importaciones"
            });
          }
        }
        /* 4. falta cobrarle al cliente */
        if (esOPosterior(imp.estado, "embarcada")) {
          var totalCli = totalDebeCliente(imp);
          var pagadoCli = sumaMontos(imp.pagosCliente);
          if (totalCli > 0 && pagadoCli < totalCli - 0.009) {
            out.push({
              nivel: "medio",
              titulo: "Falta cobrarle al cliente",
              detalle: nombreCliente(imp.clienteId) + " todavía debe " + App.fmt.usd(totalCli - pagadoCli) + " de " + tituloImp(imp) + ".",
              ir: "#/importaciones"
            });
          }
        }
      });

      /* 5. tarifa envejecida */
      (App.db.tarifas || []).forEach(function (t) {
        if (!t.revisadaEl) return;
        var dias = -App.calc.diasHasta(t.revisadaEl);
        if (dias > avisoTarifaDias) {
          out.push({
            nivel: "bajo",
            titulo: "Tarifa sin confirmar",
            detalle: "La tarifa de " + nombreForwarder(t.forwarderId) + " (" + (t.via || "-") + ", " + (t.ruta || "-") + ") lleva " + dias + " días sin confirmar.",
            ir: "#/carga"
          });
        }
      });

      /* 6. cotización dormida */
      (App.db.cotizaciones || []).forEach(function (c) {
        if (c.estado !== "abierta" || !c.fecha) return;
        var dias2 = -App.calc.diasHasta(c.fecha);
        if (dias2 > 7) {
          out.push({
            nivel: "bajo",
            titulo: "Cotización dormida",
            detalle: "La cotización " + (c.titulo || "sin título") + " lleva " + dias2 + " días abierta sin decidir.",
            ir: "#/cotizaciones"
          });
        }
      });

      var peso = { alto: 0, medio: 1, bajo: 2 };
      out.sort(function (a, b) { return peso[a.nivel] - peso[b.nivel]; });
      return out;
    } catch (e) { return []; }
  }

  /* número para el contador del dashboard: avisos + tareas de hoy o vencidas */
  function pendientes() {
    try {
      var hoy = App.hoyISO();
      var nAvisos = avisos().length;
      var nTareas = (App.db.tareas || []).filter(function (t) { return !t.hecha && t.fecha && t.fecha <= hoy; }).length;
      return nAvisos + nTareas;
    } catch (e) { return 0; }
  }

  /* ---------- helpers de los avisos ---------- */
  function nombreProveedor(id) {
    var p = (App.db.proveedores || []).filter(function (x) { return x.id === id; })[0];
    return p ? p.nombre : "la fábrica";
  }
  function nombreForwarder(id) {
    var f = (App.db.forwarders || []).filter(function (x) { return x.id === id; })[0];
    return f ? f.nombre : "tu agente de carga";
  }
  function nombreCliente(id) {
    var c = App.cliente ? App.cliente(id) : null;
    return c ? c.nombre : "El cliente";
  }
  function tituloImp(imp) { return imp.titulo || imp.codigo || "una importación"; }
  function sumaMontos(arr) {
    return (arr || []).reduce(function (s, p) { return s + (+((p && p.monto)) || 0); }, 0);
  }
  function esOPosterior(estado, desde) {
    var i = ORDEN_IMPORT.indexOf(estado), j = ORDEN_IMPORT.indexOf(desde);
    if (i < 0 || j < 0) return false;
    return i >= j;
  }
  /* total que debe pagar el cliente: usa el módulo de importaciones si ya está cargado y
     sabe calcular saldos (puede diferir del valorFactura, que es el costo de fábrica) */
  function totalDebeCliente(imp) {
    if (App.modImportaciones && typeof App.modImportaciones.saldos === "function") {
      try {
        var s = App.modImportaciones.saldos(imp);
        if (typeof s === "number") return s;
        if (s && typeof s.total === "number") return s.total;
        if (s && typeof s.totalCliente === "number") return s.totalCliente;
        if (s && typeof s.aCobrar === "number") return s.aCobrar;
      } catch (eS) { /* si el módulo falla, cae al valorFactura */ }
    }
    return +imp.valorFactura || 0;
  }

  /* ---------- helpers de render ---------- */
  function seccionAvisos(av, primero) {
    return '<div class="card' + (primero ? "" : " section-gap") + '"><div class="card-head"><h2>🔔 Avisos automáticos</h2>' +
      '<span class="pill tint">' + av.length + "</span></div>" +
      '<div class="alert-strip" style="margin-bottom:0">' + av.map(function (a, i) {
        var cls = a.nivel === "alto" ? "danger" : a.nivel === "medio" ? "warn" : "info";
        var emoji = a.nivel === "alto" ? "🔴" : a.nivel === "medio" ? "🟠" : "🔵";
        return '<div class="alert-item ' + cls + '" data-aviso-ir="' + i + '"><span class="em">' + emoji + "</span>" +
          '<span style="flex:1"><b>' + App.esc(a.titulo) + "</b><br>" + App.esc(a.detalle) + "</span>" +
          '<button class="btn sm" style="flex:none">Ver</button></div>';
      }).join("") + "</div></div>";
  }

  function seccionTareas(titulo, lista, tono, primero) {
    if (!lista.length) return "";
    return '<div class="card' + (primero ? "" : " section-gap") + '"><div class="card-head"><h2>' + titulo + "</h2>" +
      '<span class="pill' + (tono ? " " + tono : "") + '">' + lista.length + "</span></div>" +
      lista.map(filaTarea).join("") + "</div>";
  }

  function filaTarea(t) {
    var hoy = App.hoyISO();
    var venc = !t.hecha && t.fecha && t.fecha < hoy;
    var pr = PRIORIDAD[t.prioridad] || PRIORIDAD.normal;
    var refBtn = (t.refTipo && t.refId && REF_HASH[t.refTipo])
      ? '<button class="btn sm ghost" data-stop data-tarea-ir="' + t.id + '">' + App.icon("chevR") + " Ver " + REF_LABEL[t.refTipo] + "</button>"
      : "";
    return '<div class="card' + (venc ? " late" : "") + '" style="padding:12px 14px;box-shadow:none;border:1px solid var(--card-border);margin:0 0 8px;cursor:pointer" data-tarea="' + t.id + '">' +
      '<div class="flex" style="align-items:flex-start;gap:10px">' +
      '<button class="btn sm' + (t.hecha ? " ok" : " ghost") + '" data-stop data-tarea-toggle="' + t.id + '" title="' + (t.hecha ? "Desmarcar" : "Marcar hecha") + '">' + App.icon("check") + "</button>" +
      '<div style="flex:1;min-width:0">' +
      '<div class="row-title wrap"' + (t.hecha ? ' style="text-decoration:line-through;color:var(--ink-3)"' : "") + ">" + App.esc(t.titulo) + "</div>" +
      (t.detalle ? '<div class="small muted" style="margin-top:2px">' + App.esc(t.detalle) + "</div>" : "") +
      '<div class="flex wrap" style="gap:6px;margin-top:6px">' +
      (t.fecha ? '<span class="pill' + (venc ? " danger" : "") + '">' + App.fmt.fecha(t.fecha) + "</span>" : "") +
      '<span class="pill' + (pr.pill ? " " + pr.pill : "") + '">' + pr.label + "</span>" +
      "</div></div></div>" +
      '<div class="flex wrap" style="gap:8px;margin-top:10px">' +
      refBtn +
      '<button class="btn sm ghost" data-stop data-tarea-borrar="' + t.id + '" style="color:var(--danger);margin-left:auto">' + App.icon("basura") + "</button>" +
      "</div></div>";
  }

  function buscarTarea(id) {
    return (App.db.tareas || []).filter(function (t) { return t.id === id; })[0] || null;
  }

  /* ---------- crear / editar tarea manual ---------- */
  function formTarea(orig) {
    var T = orig ? JSON.parse(JSON.stringify(orig)) : {
      id: null, titulo: "", detalle: "", fecha: App.hoyISO(), hecha: false, hechaEl: null,
      prioridad: "normal", origen: "manual", refTipo: null, refId: null, creadoEl: new Date().toISOString()
    };
    var imports = (App.db.importaciones || []).filter(function (i) { return i.estado !== "entregada"; });
    var vinculada = T.refTipo === "importacion" ? T.refId : "";

    var s = App.sheet({
      titulo: orig ? "✏️ Editar tarea" : "📝 Nueva tarea",
      cuerpo: '<div class="form-grid">' +
        '<div class="field full"><label>Título</label><input class="input" id="tr-titulo" value="' + App.esc(T.titulo) + '" placeholder="Llamar a la fábrica…"></div>' +
        '<div class="field full"><label>Detalle</label><textarea class="textarea" id="tr-detalle" placeholder="Notas opcionales">' + App.esc(T.detalle || "") + "</textarea></div>" +
        '<div class="field"><label>Fecha</label><input class="input" id="tr-fecha" type="date" value="' + (T.fecha || "") + '"></div>' +
        '<div class="field"><label>Prioridad</label><select class="select" id="tr-prioridad">' +
        ["alta", "normal", "baja"].map(function (p) { return '<option value="' + p + '"' + (T.prioridad === p ? " selected" : "") + ">" + PRIORIDAD[p].label + "</option>"; }).join("") +
        "</select></div>" +
        (imports.length
          ? '<div class="field full"><label>Vincular a una importación (opcional)</label><select class="select" id="tr-imp"><option value="">— Ninguna —</option>' +
          imports.map(function (i) { return '<option value="' + i.id + '"' + (vinculada === i.id ? " selected" : "") + ">" + App.esc(i.titulo || i.codigo || i.id) + "</option>"; }).join("") +
          "</select></div>"
          : "") +
        "</div>",
      pie: (orig ? '<button class="btn danger" data-borrar style="flex:0 0 auto">' + App.icon("basura") + "</button>" : "") +
        '<button class="btn primary" data-ok>' + (orig ? "Guardar" : "Agregar") + "</button>"
    });

    App.$("[data-ok]", s.foot).addEventListener("click", function () {
      var titulo = App.$("#tr-titulo", s.el).value.trim();
      if (!titulo) { App.toast("La tarea necesita un título", "err"); return; }
      var selImp = App.$("#tr-imp", s.el);
      var impId = selImp ? selImp.value : "";
      var data = {
        id: orig ? orig.id : App.uid("tr"),
        titulo: titulo,
        detalle: App.$("#tr-detalle", s.el).value.trim(),
        fecha: App.$("#tr-fecha", s.el).value || "",
        hecha: orig ? T.hecha : false,
        hechaEl: orig ? T.hechaEl : null,
        prioridad: App.$("#tr-prioridad", s.el).value,
        origen: orig ? T.origen || "manual" : "manual",
        /* el selector solo maneja vínculos a importación; si la tarea ya venía
           vinculada a otra cosa (proveedor, cotización, tarifa) y no se tocó
           el selector, se conserva ese vínculo en vez de borrarlo */
        refTipo: impId ? "importacion" : (T.refTipo && T.refTipo !== "importacion" ? T.refTipo : null),
        refId: impId ? impId : (T.refTipo && T.refTipo !== "importacion" ? T.refId : null),
        creadoEl: orig ? T.creadoEl : new Date().toISOString()
      };
      App.db.tareas = App.db.tareas || [];
      if (orig) {
        var ix = App.db.tareas.findIndex(function (x) { return x.id === orig.id; });
        App.db.tareas[ix] = data;
      } else App.db.tareas.push(data);
      App.save(); App.toast(orig ? "Tarea actualizada" : "Tarea agregada");
      s.cerrar(); App.render();
    });
    var bb = App.$("[data-borrar]", s.foot);
    if (bb) bb.addEventListener("click", function () {
      App.confirmar("¿Eliminar esta tarea?", { peligro: true, accion: "Eliminar" }).then(function (si) {
        if (!si) return;
        App.db.tareas = (App.db.tareas || []).filter(function (x) { return x.id !== orig.id; });
        App.save(); App.toast("Tarea eliminada"); s.cerrar(); App.render();
      });
    });
  }
})();
