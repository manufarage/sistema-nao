/* ============================================================
   carga.js - agentes de carga China → Venezuela: contactos,
   shipping mark, almacenes, tarifario y simulador de flete
   ============================================================ */
window.App = window.App || {};

(function () {
  "use strict";

  App.modCarga = {
    id: "carga", titulo: "Agentes de carga", icono: "barco",
    /* la usa el boton + del movil */
    nueva: function () { formForwarder(null); },
    render: function (el) {
      var fws = (App.db.forwarders || []).slice().sort(function (a, b) {
        var ea = a.estado === "activo" ? 0 : 1, eb = b.estado === "activo" ? 0 : 1;
        if (ea !== eb) return ea - eb;
        return a.nombre < b.nombre ? -1 : a.nombre > b.nombre ? 1 : 0;
      });

      var html = '<div class="view"><div class="spread" style="margin-bottom:12px"><div><h1>🚢 Agentes de carga</h1>' +
        '<div class="small muted">Quién consolida y trae la mercancía desde China</div></div>' +
        '<button class="btn primary" id="btn-fw-nuevo">' + App.icon("plus") + " Agente</button></div>";

      html += simuladorHtml();

      if (!fws.length) {
        html += '<div class="empty"><div class="big">🚢</div><p>Aquí van los agentes de carga que consolidan y traen la mercancía desde China, con su shipping mark, la dirección de su almacén y lo que cobran.</p></div>';
      }
      fws.forEach(function (f) { html += tarjetaForwarder(f); });

      html += "</div>";
      el.innerHTML = html;

      wireSimulador(el);

      App.$("#btn-fw-nuevo").addEventListener("click", function () { formForwarder(null); });

      App.delegar(el, "click", "[data-fw-editar]", function (e, t) {
        var f = fwd(t.dataset.fwEditar);
        if (f) formForwarder(f);
      });
      App.delegar(el, "click", "[data-fw-borrar]", function (e, t) {
        var f = fwd(t.dataset.fwBorrar);
        if (!f) return;
        App.confirmar('¿Eliminar "' + f.nombre + '"? También se borran las tarifas guardadas de este agente.', { peligro: true, accion: "Eliminar" }).then(function (si) {
          if (!si) return;
          App.db.forwarders = App.db.forwarders.filter(function (x) { return x.id !== f.id; });
          App.db.tarifas = (App.db.tarifas || []).filter(function (t2) { return t2.forwarderId !== f.id; });
          App.save(); App.toast("Agente eliminado"); App.render();
        });
      });
      App.delegar(el, "click", "[data-copiar-mark]", function (e, t) {
        App.copiar(t.dataset.copiarMark, "Shipping mark copiado 📋");
      });
      App.delegar(el, "click", "[data-copiar-wc]", function (e, t) {
        App.copiar(t.dataset.copiarWc, "ID de WeChat copiado");
      });
      App.delegar(el, "click", "[data-copiar-dir]", function (e, t) {
        var p = t.dataset.copiarDir.split(":");
        var f = fwd(p[0]);
        var a = f && f.almacenes ? f.almacenes[+p[1]] : null;
        if (a && a.direccion) App.copiar(a.direccion, "Dirección copiada 📋");
      });
      App.delegar(el, "click", "[data-tar-nuevo]", function (e, t) {
        formTarifa(t.dataset.tarNuevo, null);
      });
      App.delegar(el, "click", "[data-tar-editar]", function (e, t) {
        var tar = tarifaDe(t.dataset.tarEditar);
        if (tar) formTarifa(tar.forwarderId, tar);
      });
      App.delegar(el, "click", "[data-tar-borrar]", function (e, t) {
        App.confirmar("¿Eliminar esta tarifa?", { peligro: true, accion: "Eliminar" }).then(function (si) {
          if (!si) return;
          App.db.tarifas = (App.db.tarifas || []).filter(function (x) { return x.id !== t.dataset.tarBorrar; });
          App.save(); App.toast("Tarifa eliminada"); App.render();
        });
      });
      App.delegar(el, "click", "[data-tar-vigente]", function (e, t) {
        var tar = tarifaDe(t.dataset.tarVigente);
        if (!tar) return;
        tar.revisadaEl = App.hoyISO();
        App.save(); App.toast("Tarifa confirmada como vigente ✓");
        App.render();
      });
    },
    costoFlete: costoFlete
  };

  /* ---------- lecturas locales ---------- */
  function fwd(id) { return (App.db.forwarders || []).filter(function (f) { return f.id === id; })[0] || null; }
  function tarifaDe(id) { return (App.db.tarifas || []).filter(function (t) { return t.id === id; })[0] || null; }

  /* ---------- costo del flete puesto: lo usan otros módulos ---------- */
  function costoFlete(tarifa, pesoKg, cbm) {
    if (!tarifa || !tarifa.unidad) return 0;
    var precio = Math.max(0, +tarifa.precio || 0);
    var costo;
    if (tarifa.unidad === "kg") {
      var kg = +pesoKg || 0;
      if (kg <= 0) return 0;
      costo = precio * kg;
    } else if (tarifa.unidad === "cbm") {
      var m3 = +cbm || 0;
      if (m3 <= 0) return 0;
      costo = precio * m3;
    } else if (tarifa.unidad === "contenedor") {
      costo = precio;
    } else {
      return 0;
    }
    var minimo = Math.max(0, +tarifa.minimo || 0);
    if (minimo > costo) costo = minimo;
    return costo;
  }

  /* ---------- antigüedad de una tarifa: estos agentes no avisan solos
     cuando suben precio, así que Manuel confirma a mano y el sistema
     avisa cuando la confirmación envejece ---------- */
  function antiguedadTarifa(t) {
    var limite = +App.db.settings.avisoTarifaDias || 30;
    var mitad = limite / 2;
    if (!t.revisadaEl) {
      return { dias: null, nivel: "danger", corto: "sin revisar", texto: "sin revisar todavía, confírmala" };
    }
    var dias = Math.max(0, -App.calc.diasHasta(t.revisadaEl));
    var nivel = dias > limite ? "danger" : dias > mitad ? "warn" : "ok";
    var base = dias === 0 ? "revisada hoy" : "revisada hace " + dias + (dias === 1 ? " día" : " días");
    return {
      dias: dias, nivel: nivel,
      corto: dias === 0 ? "hoy" : dias + "d",
      texto: nivel === "ok" ? base : base + ", confírmala"
    };
  }

  function incluyeTxt(inc) {
    inc = inc || {};
    var out = "";
    if (inc.aduana) out += '<span class="pill ok">Aduana</span>';
    if (inc.entrega) out += '<span class="pill ok">Entrega</span>';
    if (inc.seguro) out += '<span class="pill ok">Seguro</span>';
    return out ? '<div class="flex wrap" style="gap:4px">' + out + "</div>" : '<span class="small muted">-</span>';
  }

  /* ---------- simulador de flete ---------- */
  function simuladorHtml() {
    var rutas = App.db.settings.rutas || [];
    return '<div class="card" style="margin-bottom:12px"><div class="card-head"><h2>🧮 Simulador de flete</h2></div>' +
      '<div class="small muted" style="margin-bottom:10px">Escribe el peso o el volumen del embarque y compara cuánto cobraría cada agente.</div>' +
      '<div class="form-grid">' +
      '<div class="field"><label>Peso (kg)</label><input class="input num" id="sim-peso" type="number" min="0" step="0.1" placeholder="0"></div>' +
      '<div class="field"><label>Volumen (cbm)</label><input class="input num" id="sim-cbm" type="number" min="0" step="0.01" placeholder="0"></div>' +
      '<div class="field full"><label>Ruta</label><select class="select" id="sim-ruta">' +
      (rutas.length ? rutas.map(function (r) { return "<option>" + App.esc(r) + "</option>"; }).join("") : '<option value="">Sin rutas configuradas</option>') +
      "</select></div></div>" +
      '<button class="btn primary block" id="sim-calcular" style="margin-top:10px">' + App.icon("comparar") + " Calcular y comparar</button>" +
      '<div id="sim-resultado" style="margin-top:12px"></div></div>';
  }
  function wireSimulador(el) {
    var btn = App.$("#sim-calcular", el);
    if (!btn) return;
    btn.addEventListener("click", function () {
      var pesoKg = Math.max(0, parseFloat(App.$("#sim-peso", el).value) || 0);
      var cbm = Math.max(0, parseFloat(App.$("#sim-cbm", el).value) || 0);
      var ruta = App.$("#sim-ruta", el).value;
      var out = App.$("#sim-resultado", el);
      if (!ruta) { out.innerHTML = '<div class="small muted">Configura al menos una ruta en Ajustes antes de simular.</div>'; return; }
      if (!pesoKg && !cbm) { out.innerHTML = '<div class="small muted">Escribe el peso o el volumen del embarque.</div>'; return; }

      var resultados = [];
      (App.db.tarifas || []).forEach(function (t) {
        if (t.ruta !== ruta) return;
        var costo = costoFlete(t, pesoKg, cbm);
        if (!costo) return;
        resultados.push({ tarifa: t, forwarder: fwd(t.forwarderId), costo: costo });
      });
      resultados.sort(function (a, b) { return a.costo - b.costo; });

      if (!resultados.length) {
        out.innerHTML = '<div class="empty" style="padding:14px"><p>Ningún agente tiene tarifa registrada para esa ruta con esos datos. Prueba completar peso y volumen, o revisa el tarifario de cada agente.</p></div>';
        return;
      }
      out.innerHTML = '<div class="table-wrap"><table class="mini"><tr><th></th><th>Agente</th><th>Vía</th><th>Costo</th><th>Tránsito</th><th>Confirmación</th></tr>' +
        resultados.map(function (r, i) {
          var ant = antiguedadTarifa(r.tarifa);
          return "<tr" + (i === 0 ? ' style="background:var(--ok-soft)"' : "") + ">" +
            "<td>" + (i === 0 ? "🏆" : "") + "</td>" +
            "<td>" + App.esc(r.forwarder ? r.forwarder.nombre : "?") + "</td>" +
            "<td>" + App.esc(r.tarifa.via) + "</td>" +
            '<td class="num"><b>' + App.fmt.usd(r.costo) + "</b></td>" +
            '<td class="num">' + (r.tarifa.diasTransito ? r.tarifa.diasTransito + " d" : "-") + "</td>" +
            '<td><span class="pill ' + ant.nivel + '">' + ant.corto + "</span></td>" +
            "</tr>";
        }).join("") + "</table></div>";
    });
  }

  /* ---------- tarjeta de un agente ---------- */
  function tarjetaForwarder(f) {
    var tarifasF = (App.db.tarifas || []).filter(function (t) { return t.forwarderId === f.id; })
      .sort(function (a, b) {
        if (a.ruta !== b.ruta) return a.ruta < b.ruta ? -1 : 1;
        return a.via < b.via ? -1 : a.via > b.via ? 1 : 0;
      });

    var html = '<div class="card" style="margin-bottom:12px">' +
      '<div class="card-head"><h2>🚢 ' + App.esc(f.nombre) + "</h2>" +
      '<span class="pill ' + (f.estado === "activo" ? "ok" : "danger") + '">' + (f.estado === "activo" ? "Activo" : "Inactivo") + "</span></div>";

    if (f.rutas && f.rutas.length) {
      html += '<div class="chips" style="margin-bottom:10px">' + f.rutas.map(function (r) {
        return '<span class="chip" style="cursor:default">' + App.esc(r) + "</span>";
      }).join("") + "</div>";
    }

    if (f.contacto) html += '<div class="small muted" style="margin-bottom:6px">' + App.esc(f.contacto) + "</div>";

    html += '<div class="flex wrap" style="gap:8px;margin-bottom:10px">' +
      (f.telefono ? '<a class="btn sm wa" target="_blank" rel="noopener" href="' + App.waLink(f.telefono) + '">' + App.icon("wa") + " WhatsApp</a>" : "") +
      (f.wechat ? '<button class="btn sm ghost" data-copiar-wc="' + App.esc(f.wechat) + '">' + App.icon("copiar") + " WeChat</button>" : "") +
      (f.email ? '<a class="btn sm ghost" href="mailto:' + App.esc(f.email) + '">' + App.icon("mail") + " Email</a>" : "") +
      (f.web ? '<a class="btn sm ghost" target="_blank" rel="noopener" href="' + App.esc(f.web) + '">🔗 Web</a>' : "") +
      "</div>";

    /* shipping mark: lo que Manuel más usa a diario, destacado y copiable de un toque */
    html += f.shippingMark
      ? '<div class="spread wrap" style="padding:12px 14px;border-radius:14px;background:var(--tint-soft);margin-bottom:10px;gap:10px">' +
        '<div style="min-width:0"><div class="small" style="font-weight:700;text-transform:uppercase;letter-spacing:.04em;color:var(--tint)">Shipping mark</div>' +
        '<div class="num" style="font-size:18px;font-weight:800;color:var(--tint);word-break:break-word">' + App.esc(f.shippingMark) + "</div></div>" +
        '<button class="btn primary" data-copiar-mark="' + App.esc(f.shippingMark) + '" style="flex:none">' + App.icon("copiar") + " Copiar</button></div>"
      : '<div class="small muted" style="margin-bottom:10px">⚠️ Sin shipping mark asignado todavía</div>';

    /* almacenes en China */
    if (f.almacenes && f.almacenes.length) {
      html += '<div class="small muted" style="font-weight:650;margin-bottom:6px">🏢 Almacenes en China</div>';
      f.almacenes.forEach(function (a, i) {
        html += '<div class="flex wrap" style="justify-content:space-between;gap:10px;padding:10px 12px;border-radius:12px;background:var(--field-bg);margin-bottom:6px">' +
          '<div style="flex:1;min-width:180px">' +
          '<div class="row-title" style="font-size:13px">📍 ' + App.esc(a.ciudad || "Almacén") + "</div>" +
          (a.direccion ? '<div class="small muted" style="margin-top:2px">' + App.esc(a.direccion) + "</div>" : "") +
          (a.telefono ? '<div class="small muted">☎ ' + App.esc(a.telefono) + "</div>" : "") +
          (a.horario ? '<div class="small muted">🕒 ' + App.esc(a.horario) + "</div>" : "") +
          (a.notas ? '<div class="small muted">💡 ' + App.esc(a.notas) + "</div>" : "") +
          "</div>" +
          (a.direccion ? '<button class="btn sm ghost" data-copiar-dir="' + f.id + ":" + i + '" style="flex:none">' + App.icon("copiar") + " Copiar dirección</button>" : "") +
          "</div>";
      });
    } else {
      html += '<div class="small muted" style="margin-bottom:10px">Sin almacenes registrados todavía.</div>';
    }

    /* tarifario */
    html += '<div class="spread" style="margin-top:12px"><h3>💲 Tarifario</h3>' +
      '<button class="btn sm" data-tar-nuevo="' + f.id + '">' + App.icon("plus") + " Tarifa</button></div>";
    if (!tarifasF.length) {
      html += '<div class="small muted" style="margin-top:6px">Sin tarifas registradas todavía.</div>';
    } else {
      html += '<div class="table-wrap" style="margin-top:8px"><table class="mini"><tr>' +
        "<th>Ruta</th><th>Vía</th><th>Unidad</th><th>Precio</th><th>Mínimo</th><th>Tránsito</th><th>Incluye</th><th>Confirmación</th><th></th></tr>" +
        tarifasF.map(function (t) {
          var ant = antiguedadTarifa(t);
          var unidadLbl = t.unidad === "kg" ? "Por kg" : t.unidad === "cbm" ? "Por cbm" : "Por contenedor";
          return "<tr>" +
            "<td>" + App.esc(t.ruta) + "</td>" +
            "<td>" + App.esc(t.via) + "</td>" +
            "<td>" + unidadLbl + "</td>" +
            '<td class="num">' + App.fmt.usd(t.precio) + "</td>" +
            '<td class="num">' + (t.minimo > 0 ? App.fmt.usd(t.minimo) : '<span class="muted">-</span>') + "</td>" +
            '<td class="num">' + (t.diasTransito ? t.diasTransito + " d" : "-") + "</td>" +
            "<td>" + incluyeTxt(t.incluye) + "</td>" +
            '<td style="max-width:150px"><span class="pill ' + ant.nivel + '" style="white-space:normal;display:inline-block;line-height:1.3">' + ant.texto + "</span></td>" +
            '<td><div class="flex wrap" style="gap:5px">' +
            '<button class="btn sm ghost" data-tar-vigente="' + t.id + '" title="Confirma que este precio sigue igual hoy">' + App.icon("check") + " Sigue vigente</button>" +
            '<button class="btn icon" data-tar-editar="' + t.id + '">' + App.icon("editar") + "</button>" +
            '<button class="btn icon" data-tar-borrar="' + t.id + '" style="color:var(--danger)">' + App.icon("basura") + "</button>" +
            "</div></td></tr>";
        }).join("") + "</table></div>" +
        '<div class="small muted" style="margin-top:6px">Estos agentes no avisan solos cuando suben sus precios: confirma la tarifa a mano de vez en cuando y el sistema te avisa cuando lleva mucho tiempo sin revisar.</div>';
    }

    if (f.notas) html += '<div class="small muted texto-largo" style="margin-top:10px">💡 ' + App.esc(f.notas) + "</div>";

    html += '<div class="flex wrap" style="gap:8px;margin-top:12px">' +
      '<button class="btn sm ghost" data-fw-editar="' + f.id + '">' + App.icon("editar") + " Editar</button>" +
      '<button class="btn sm ghost" data-fw-borrar="' + f.id + '" style="color:var(--danger)">' + App.icon("basura") + " Eliminar</button>" +
      "</div>";

    html += "</div>";
    return html;
  }

  /* ---------- alta / edición de agente ---------- */
  function formForwarder(orig) {
    var FA = orig ? JSON.parse(JSON.stringify(orig)) : {
      id: null, nombre: "", contacto: "", telefono: "", wechat: "", email: "", web: "",
      shippingMark: "", rutas: [], almacenes: [], estado: "activo", notas: "", creadoEl: App.hoyISO()
    };
    FA.rutas = FA.rutas || [];
    FA.almacenes = FA.almacenes || [];

    var s = App.sheet({
      titulo: orig ? "✏️ Editar agente de carga" : "🚢 Nuevo agente de carga",
      cuerpo: '<div class="form-grid">' +
        '<div class="field full"><label>Nombre</label><input class="input" id="fa-nombre" value="' + App.esc(FA.nombre) + '" placeholder="Ej: Huada Cargo"></div>' +
        '<div class="field"><label>Estado</label><select class="select" id="fa-estado">' +
        '<option value="activo"' + (FA.estado === "activo" ? " selected" : "") + ">Activo</option>" +
        '<option value="inactivo"' + (FA.estado === "inactivo" ? " selected" : "") + ">Inactivo</option>" +
        "</select></div>" +
        '<div class="field"><label>Persona de contacto</label><input class="input" id="fa-contacto" value="' + App.esc(FA.contacto) + '"></div>' +
        '<div class="field"><label>Teléfono / WhatsApp</label><input class="input" id="fa-tel" value="' + App.esc(FA.telefono) + '"></div>' +
        '<div class="field"><label>WeChat</label><input class="input" id="fa-wechat" value="' + App.esc(FA.wechat) + '"></div>' +
        '<div class="field"><label>Email</label><input class="input" id="fa-email" type="email" value="' + App.esc(FA.email) + '"></div>' +
        '<div class="field full"><label>Web</label><input class="input" id="fa-web" value="' + App.esc(FA.web) + '" placeholder="https://…"></div>' +
        '<div class="field full"><label>Shipping mark</label><input class="input" id="fa-mark" value="' + App.esc(FA.shippingMark) + '" placeholder="La marca que le mandas a cada fábrica"></div>' +
        "</div>" +
        '<h3 style="margin-top:12px">🗺️ Rutas que cubre</h3>' +
        '<div id="fa-rutas" class="chips" style="margin-top:6px"></div>' +
        '<h3 style="margin-top:14px">🏢 Almacenes en China</h3>' +
        '<div id="fa-almacenes"></div>' +
        '<button type="button" class="btn sm ghost" id="fa-add-alm" style="margin-top:8px">' + App.icon("plus") + " Agregar almacén</button>" +
        '<div class="field full" style="margin-top:14px"><label>Notas</label><textarea class="textarea" id="fa-notas">' + App.esc(FA.notas) + "</textarea></div>",
      pie: (orig ? '<button class="btn danger" data-borrar style="flex:0 0 auto">' + App.icon("basura") + "</button>" : "") +
        '<button class="btn primary" data-ok>' + (orig ? "Guardar" : "Agregar") + "</button>"
    });

    function pintarRutas() {
      var box = App.$("#fa-rutas", s.el);
      var todas = App.db.settings.rutas || [];
      if (!todas.length) { box.innerHTML = '<span class="small muted">No hay rutas configuradas todavía.</span>'; return; }
      box.innerHTML = todas.map(function (r) {
        var on = FA.rutas.indexOf(r) >= 0;
        return '<button type="button" class="chip' + (on ? " active" : "") + '" data-ruta-toggle="' + App.esc(r) + '">' + App.esc(r) + "</button>";
      }).join("");
      App.$$("[data-ruta-toggle]", box).forEach(function (b) {
        b.addEventListener("click", function () {
          var r = b.dataset.rutaToggle;
          var i = FA.rutas.indexOf(r);
          if (i >= 0) FA.rutas.splice(i, 1); else FA.rutas.push(r);
          pintarRutas();
        });
      });
    }

    function pintarAlmacenes() {
      var box = App.$("#fa-almacenes", s.el);
      if (!FA.almacenes.length) {
        box.innerHTML = '<div class="empty" style="padding:14px"><p>Agrega la dirección de cada almacén donde este agente recibe la mercancía en China.</p></div>';
      } else {
        box.innerHTML = FA.almacenes.map(function (a, i) {
          return '<div class="card" style="box-shadow:none;border:1px solid var(--card-border);padding:12px 13px;margin-top:8px">' +
            '<div class="form-grid">' +
            '<div class="field"><label>Ciudad</label><input class="input" data-alm-ciudad="' + i + '" value="' + App.esc(a.ciudad) + '"></div>' +
            '<div class="field"><label>Teléfono</label><input class="input" data-alm-tel="' + i + '" value="' + App.esc(a.telefono) + '"></div>' +
            '<div class="field full"><label>Dirección completa</label><input class="input" data-alm-dir="' + i + '" value="' + App.esc(a.direccion) + '"></div>' +
            '<div class="field"><label>Horario</label><input class="input" data-alm-horario="' + i + '" value="' + App.esc(a.horario) + '" placeholder="Ej: L-V 9am-6pm"></div>' +
            '<div class="field"><label>Notas</label><input class="input" data-alm-notas="' + i + '" value="' + App.esc(a.notas) + '"></div>' +
            "</div>" +
            '<button type="button" class="btn sm ghost" data-alm-quitar="' + i + '" style="margin-top:8px;color:var(--danger)">' + App.icon("x") + " Quitar almacén</button>" +
            "</div>";
        }).join("");
      }
      App.$$("[data-alm-ciudad]", box).forEach(function (inp) { inp.addEventListener("input", function () { FA.almacenes[+inp.dataset.almCiudad].ciudad = inp.value; }); });
      App.$$("[data-alm-dir]", box).forEach(function (inp) { inp.addEventListener("input", function () { FA.almacenes[+inp.dataset.almDir].direccion = inp.value; }); });
      App.$$("[data-alm-tel]", box).forEach(function (inp) { inp.addEventListener("input", function () { FA.almacenes[+inp.dataset.almTel].telefono = inp.value; }); });
      App.$$("[data-alm-horario]", box).forEach(function (inp) { inp.addEventListener("input", function () { FA.almacenes[+inp.dataset.almHorario].horario = inp.value; }); });
      App.$$("[data-alm-notas]", box).forEach(function (inp) { inp.addEventListener("input", function () { FA.almacenes[+inp.dataset.almNotas].notas = inp.value; }); });
      App.$$("[data-alm-quitar]", box).forEach(function (b) {
        b.addEventListener("click", function () { FA.almacenes.splice(+b.dataset.almQuitar, 1); pintarAlmacenes(); });
      });
    }

    App.$("#fa-add-alm", s.el).addEventListener("click", function () {
      FA.almacenes.push({ ciudad: "", direccion: "", telefono: "", horario: "", notas: "" });
      pintarAlmacenes();
    });

    pintarRutas(); pintarAlmacenes();

    App.$("[data-ok]", s.foot).addEventListener("click", function () {
      var nombre = App.$("#fa-nombre", s.el).value.trim();
      if (!nombre) { App.toast("El agente necesita nombre", "err"); return; }
      var almacenes = FA.almacenes.filter(function (a) { return (a.ciudad || "").trim() || (a.direccion || "").trim(); });
      var data = {
        id: orig ? orig.id : App.uid("fw"),
        nombre: nombre,
        contacto: App.$("#fa-contacto", s.el).value.trim(),
        telefono: App.$("#fa-tel", s.el).value.trim(),
        wechat: App.$("#fa-wechat", s.el).value.trim(),
        email: App.$("#fa-email", s.el).value.trim(),
        web: App.$("#fa-web", s.el).value.trim(),
        shippingMark: App.$("#fa-mark", s.el).value.trim(),
        rutas: FA.rutas.slice(),
        almacenes: almacenes,
        estado: App.$("#fa-estado", s.el).value,
        notas: App.$("#fa-notas", s.el).value.trim(),
        creadoEl: orig ? orig.creadoEl : App.hoyISO()
      };
      App.db.forwarders = App.db.forwarders || [];
      if (orig) {
        var ix = App.db.forwarders.findIndex(function (x) { return x.id === orig.id; });
        App.db.forwarders[ix] = data;
      } else App.db.forwarders.push(data);
      App.save(); App.toast(orig ? "Agente actualizado" : "Agente agregado");
      s.cerrar(); App.render();
    });

    var bb = App.$("[data-borrar]", s.foot);
    if (bb) bb.addEventListener("click", function () {
      App.confirmar("¿Eliminar este agente de carga? También se borran las tarifas guardadas.", { peligro: true, accion: "Eliminar" }).then(function (si) {
        if (!si) return;
        App.db.forwarders = App.db.forwarders.filter(function (x) { return x.id !== orig.id; });
        App.db.tarifas = (App.db.tarifas || []).filter(function (t) { return t.forwarderId !== orig.id; });
        App.save(); App.toast("Agente eliminado"); s.cerrar(); App.render();
      });
    });
  }

  /* ---------- alta / edición de tarifa ---------- */
  function formTarifa(forwarderId, orig) {
    var rutas = App.db.settings.rutas || [];
    var VIAS = ["Aéreo", "Marítimo LCL", "Marítimo FCL", "Courier"];
    var FT = orig ? JSON.parse(JSON.stringify(orig)) : {
      id: null, forwarderId: forwarderId, ruta: rutas[0] || "", via: VIAS[1], unidad: "cbm",
      precio: 0, minimo: 0, diasTransito: 25, incluye: { aduana: false, entrega: false, seguro: false },
      vigenteDesde: App.hoyISO(), revisadaEl: App.hoyISO(), notas: ""
    };
    FT.incluye = FT.incluye || { aduana: false, entrega: false, seguro: false };

    var s = App.sheet({
      titulo: orig ? "✏️ Editar tarifa" : "💲 Nueva tarifa",
      cuerpo: '<div class="form-grid">' +
        '<div class="field full"><label>Ruta</label><select class="select" id="ft-ruta">' +
        (rutas.length ? rutas.map(function (r) { return "<option" + (FT.ruta === r ? " selected" : "") + ">" + App.esc(r) + "</option>"; }).join("")
          : "<option>" + App.esc(FT.ruta || "") + "</option>") +
        "</select></div>" +
        '<div class="field"><label>Vía</label><select class="select" id="ft-via">' +
        VIAS.map(function (v) { return "<option" + (FT.via === v ? " selected" : "") + ">" + v + "</option>"; }).join("") +
        "</select></div>" +
        '<div class="field"><label>Se cobra…</label><select class="select" id="ft-unidad">' +
        '<option value="kg"' + (FT.unidad === "kg" ? " selected" : "") + ">Por kg</option>" +
        '<option value="cbm"' + (FT.unidad === "cbm" ? " selected" : "") + ">Por cbm</option>" +
        '<option value="contenedor"' + (FT.unidad === "contenedor" ? " selected" : "") + ">Por contenedor</option>" +
        "</select></div>" +
        '<div class="field"><label>Precio (USD)</label><input class="input num" id="ft-precio" type="number" step="0.01" min="0" value="' + (+FT.precio || 0) + '"></div>' +
        '<div class="field"><label>Mínimo del embarque (USD)</label><input class="input num" id="ft-minimo" type="number" step="0.01" min="0" value="' + (+FT.minimo || 0) + '"></div>' +
        '<div class="field"><label>Días de tránsito</label><input class="input num" id="ft-dias" type="number" min="0" step="1" value="' + (+FT.diasTransito || 0) + '"></div>' +
        '<div class="field"><label>Vigente desde</label><input class="input" id="ft-vigente" type="date" value="' + (FT.vigenteDesde || App.hoyISO()) + '"></div>' +
        "</div>" +
        '<div class="field" style="margin-top:12px"><label>Incluye</label><div class="flex wrap" style="gap:18px;margin-top:6px">' +
        '<label class="flex small" style="gap:8px">Aduana <span class="switch"><input type="checkbox" id="ft-inc-aduana"' + (FT.incluye.aduana ? " checked" : "") + "><i></i></span></label>" +
        '<label class="flex small" style="gap:8px">Entrega <span class="switch"><input type="checkbox" id="ft-inc-entrega"' + (FT.incluye.entrega ? " checked" : "") + "><i></i></span></label>" +
        '<label class="flex small" style="gap:8px">Seguro <span class="switch"><input type="checkbox" id="ft-inc-seguro"' + (FT.incluye.seguro ? " checked" : "") + "><i></i></span></label>" +
        "</div></div>" +
        '<div class="field full" style="margin-top:12px"><label>Notas</label><textarea class="textarea" id="ft-notas">' + App.esc(FT.notas || "") + "</textarea></div>",
      pie: (orig ? '<button class="btn danger" data-borrar style="flex:0 0 auto">' + App.icon("basura") + "</button>" : "") +
        '<button class="btn primary" data-ok>' + (orig ? "Guardar" : "Agregar") + "</button>"
    });

    App.$("[data-ok]", s.foot).addEventListener("click", function () {
      var data = {
        id: orig ? orig.id : App.uid("tf"),
        forwarderId: forwarderId,
        ruta: App.$("#ft-ruta", s.el).value,
        via: App.$("#ft-via", s.el).value,
        unidad: App.$("#ft-unidad", s.el).value,
        precio: Math.max(0, parseFloat(App.$("#ft-precio", s.el).value) || 0),
        minimo: Math.max(0, parseFloat(App.$("#ft-minimo", s.el).value) || 0),
        diasTransito: Math.max(0, parseInt(App.$("#ft-dias", s.el).value, 10) || 0),
        incluye: {
          aduana: App.$("#ft-inc-aduana", s.el).checked,
          entrega: App.$("#ft-inc-entrega", s.el).checked,
          seguro: App.$("#ft-inc-seguro", s.el).checked
        },
        vigenteDesde: App.$("#ft-vigente", s.el).value || App.hoyISO(),
        revisadaEl: orig ? orig.revisadaEl : App.hoyISO(),
        notas: App.$("#ft-notas", s.el).value.trim()
      };
      App.db.tarifas = App.db.tarifas || [];
      if (orig) {
        var ix = App.db.tarifas.findIndex(function (x) { return x.id === orig.id; });
        App.db.tarifas[ix] = data;
      } else App.db.tarifas.push(data);
      App.save(); App.toast(orig ? "Tarifa actualizada" : "Tarifa agregada");
      s.cerrar(); App.render();
    });

    var bb = App.$("[data-borrar]", s.foot);
    if (bb) bb.addEventListener("click", function () {
      App.confirmar("¿Eliminar esta tarifa?", { peligro: true, accion: "Eliminar" }).then(function (si) {
        if (!si) return;
        App.db.tarifas = App.db.tarifas.filter(function (x) { return x.id !== orig.id; });
        App.save(); App.toast("Tarifa eliminada"); s.cerrar(); App.render();
      });
    });
  }
})();
