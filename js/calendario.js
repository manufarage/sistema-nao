/* ============================================================
   calendario.js - festividades comerciales de Venezuela con
   recordatorios + análisis de mejores días para vender
   ============================================================ */
window.App = window.App || {};

(function () {
  "use strict";

  App.modCalendario = {
    id: "calendario", titulo: "Calendario", icono: "calendario",
    render: function (el) {
      var C = App.calc;
      var esSuper = App.auth.esSuper();
      var prox = C.proxFestividades();
      var pasadas = (App.db.festividades || []).filter(function (f) { return f.fecha < App.hoyISO(); })
        .sort(function (a, b) { return a.fecha < b.fecha ? 1 : -1; });

      var html = '<div class="view"><div class="spread" style="margin-bottom:12px"><div><h1>📅 Calendario comercial</h1>' +
        '<div class="small muted">Festividades que mueven ventas en Venezuela</div></div>' +
        (esSuper ? '<button class="btn primary" id="btn-fest">' + App.icon("plus") + " Fecha</button>" : "") + "</div>";

      /* próximas */
      html += '<div class="card"><div class="card-head"><h2>🎉 Próximas</h2></div><div class="list">';
      if (!prox.length) html += '<div class="empty"><p>No quedan festividades este año. Agrega las del próximo.</p></div>';
      prox.forEach(function (f) {
        var dias = C.diasHasta(f.fecha);
        var enAviso = dias <= (f.diasAviso || 21);
        var cuando = dias === 0 ? "¡HOY!" : dias === 1 ? "mañana" : "en " + dias + " días";
        html += '<div class="row-item" data-fest="' + f.id + '">' +
          '<div class="thumb" style="font-size:24px">' + f.emoji + "</div>" +
          '<div class="row-main"><div class="row-title">' + App.esc(f.nombre) + "</div>" +
          '<div class="row-sub">' + App.fmt.fechaLarga(f.fecha) + (f.notas ? " · " + App.esc(f.notas) : "") + "</div></div>" +
          '<span class="pill ' + (dias <= 3 ? "danger" : enAviso ? "warn" : "") + '">' + cuando + "</span></div>";
      });
      html += "</div>" +
        '<div class="chart-note">Las que están dentro de su período de aviso aparecen como recordatorio en Inicio. ' +
        "Ojo: Carnaval, Semana Santa y Día del Niño cambian de fecha cada año - ajústalas en enero.</div></div>";

      /* mejores días */
      var ventanas = C.ventasEntre(App.toISO(App.addDays(new Date(), -90)), App.hoyISO());
      var dias = C.mejoresDiasSemana(ventanas);
      var mejor = dias.slice().sort(function (a, b) { return b.promedio - a.promedio; })[0];
      html += '<div class="card section-gap"><div class="card-head"><h2>🏆 Tus mejores días para vender</h2><span class="pill">últimos 90 días</span></div>' +
        '<div class="chart-box" id="cal-dias"></div>' +
        '<div class="chart-note">Promedio vendido por día de la semana. ' +
        (mejor && mejor.promedio > 0 ? "Tu día fuerte es <b>" + mejor.dia + "</b> - ese día publica y lanza promos." : "Aún hay pocos datos.") + "</div></div>";

      /* día del mes */
      var porDiaMes = {};
      ventanas.forEach(function (v) {
        var d = +v.fecha.slice(8, 10);
        porDiaMes[d] = (porDiaMes[d] || 0) + C.ventaTotal(v);
      });
      var topDias = Object.keys(porDiaMes).map(function (d) { return { dia: +d, total: porDiaMes[d] }; })
        .sort(function (a, b) { return b.total - a.total; }).slice(0, 5);
      if (topDias.length >= 3) {
        html += '<div class="card section-gap"><div class="card-head"><h2>📆 Días del mes con más ventas</h2></div>' +
          App.hbars(topDias.map(function (t, i) {
            return { label: "Día " + t.dia, valor: Math.round(t.total), color: "var(--c" + ((i % 5) + 1) + ")" };
          })) +
          '<div class="chart-note">Útil para saber cuándo cae la quincena de tus clientes 😉</div></div>';
      }

      /* pasadas del año */
      if (pasadas.length) {
        html += '<div class="card section-gap"><div class="card-head"><h2>✅ Ya pasaron este año</h2></div><div class="list">' +
          pasadas.slice(0, 6).map(function (f) {
            return '<div class="row-item' + (esSuper ? "" : " static") + '" data-fest="' + f.id + '"><div class="thumb">' + f.emoji + "</div>" +
              '<div class="row-main"><div class="row-sub">' + App.esc(f.nombre) + " · " + App.fmt.fecha(f.fecha) + "</div></div></div>";
          }).join("") + "</div></div>";
      }

      html += "</div>";
      el.innerHTML = html;

      App.chart.barras(App.$("#cal-dias", el), {
        alto: 180,
        fmtV: App.fmt.usd0,
        data: dias.map(function (d) {
          var esMejor = mejor && d.dia === mejor.dia && d.promedio > 0;
          return { label: d.dia, valor: Math.round(d.promedio * 100) / 100, color: esMejor ? "var(--c1)" : "var(--c5)" };
        })
      });

      var bf = App.$("#btn-fest", el);
      if (bf) bf.addEventListener("click", function () { formFest(null); });
      if (esSuper) {
        App.delegar(el, "click", "[data-fest]", function (e, t) {
          var f = (App.db.festividades || []).filter(function (x) { return x.id === t.dataset.fest; })[0];
          if (f) formFest(f);
        });
      }
    }
  };

  function formFest(orig) {
    var s = App.sheet({
      titulo: orig ? "✏️ Editar festividad" : "🎉 Nueva festividad",
      cuerpo: '<div class="form-grid">' +
        '<div class="field full"><label>Nombre</label><input class="input" id="ft-nombre" value="' + App.esc(orig ? orig.nombre : "") + '" placeholder="Día del Niño"></div>' +
        '<div class="field"><label>Fecha</label><input class="input" id="ft-fecha" type="date" value="' + (orig ? orig.fecha : "") + '"></div>' +
        '<div class="field"><label>Emoji</label><input class="input" id="ft-emoji" value="' + App.esc(orig ? orig.emoji : "🎉") + '" maxlength="4"></div>' +
        '<div class="field full"><label>Avisarme con (días de anticipación)</label><input class="input num" id="ft-aviso" type="number" min="1" max="90" value="' + (orig ? orig.diasAviso || 21 : 21) + '"></div>' +
        '<div class="field full"><label>Notas</label><input class="input" id="ft-notas" value="' + App.esc(orig ? orig.notas || "" : "") + '" placeholder="Preparar stock de disfraces"></div>' +
        "</div>",
      pie: (orig ? '<button class="btn danger" data-borrar style="flex:0 0 auto">' + App.icon("basura") + "</button>" : "") +
        '<button class="btn primary" data-ok>' + (orig ? "Guardar" : "Agregar") + "</button>"
    });
    App.$("[data-ok]", s.foot).addEventListener("click", function () {
      var nombre = App.$("#ft-nombre", s.el).value.trim();
      var fecha = App.$("#ft-fecha", s.el).value;
      if (!nombre || !fecha) { App.toast("Nombre y fecha son obligatorios", "err"); return; }
      var data = {
        id: orig ? orig.id : App.uid("f"),
        nombre: nombre, fecha: fecha,
        emoji: App.$("#ft-emoji", s.el).value.trim() || "🎉",
        diasAviso: parseInt(App.$("#ft-aviso", s.el).value, 10) || 21,
        notas: App.$("#ft-notas", s.el).value.trim()
      };
      App.db.festividades = App.db.festividades || [];
      if (orig) {
        var ix = App.db.festividades.findIndex(function (x) { return x.id === orig.id; });
        App.db.festividades[ix] = data;
      } else App.db.festividades.push(data);
      App.save(); App.toast(orig ? "Festividad actualizada" : "Festividad agregada");
      s.cerrar(); App.render();
    });
    var bb = App.$("[data-borrar]", s.foot);
    if (bb) bb.addEventListener("click", function () {
      App.confirmar("¿Eliminar esta festividad?", { peligro: true, accion: "Eliminar" }).then(function (si) {
        if (!si) return;
        App.db.festividades = App.db.festividades.filter(function (x) { return x.id !== orig.id; });
        App.save(); App.toast("Festividad eliminada"); s.cerrar(); App.render();
      });
    });
  }
})();
