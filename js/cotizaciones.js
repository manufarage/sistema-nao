/* ============================================================
   cotizaciones.js - EL COMPARADOR
   El mismo producto cotizado por 2 a 5 fábricas. El sistema
   suma el flete y dice cuál conviene DE VERDAD puesta en
   destino, no cuál tiene el precio de vitrina más bonito.
   ============================================================ */
window.App = window.App || {};

(function () {
  "use strict";

  /* El proceso natural de una búsqueda, como lo trabaja Manuel:
     buscar 2-5 fábricas → elegir el producto → muestras (con su costo y su
     envío) → decidir la fábrica → primera compra. "abierta" es el nombre
     viejo de la primera fase y se sigue aceptando. */
  var ESTADOS = {
    busqueda: { label: "Buscando fábricas", pill: "warn", emoji: "🔍" },
    seleccion: { label: "Producto elegido", pill: "warn", emoji: "🧲" },
    muestras: { label: "Con muestras", pill: "info", emoji: "🧪" },
    decidida: { label: "Fábrica elegida", pill: "ok", emoji: "✅" },
    comprada: { label: "Comprada", pill: "tint", emoji: "🛒" },
    descartada: { label: "Descartada", pill: "info", emoji: "🗄️" },
    abierta: { label: "Buscando fábricas", pill: "warn", emoji: "🔍" }
  };
  var FASES = [
    { id: "busqueda", corto: "Búsqueda", emoji: "🔍" },
    { id: "seleccion", corto: "Producto", emoji: "🧲" },
    { id: "muestras", corto: "Muestras", emoji: "🧪" },
    { id: "decidida", corto: "Elegida", emoji: "✅" },
    { id: "comprada", corto: "Comprada", emoji: "🛒" }
  ];
  function faseDe(cot) {
    var e = cot.estado === "abierta" ? "busqueda" : cot.estado;
    return ESTADOS[e] ? e : "busqueda";
  }
  function faseIx(cot) {
    var f = faseDe(cot);
    for (var i = 0; i < FASES.length; i++) if (FASES[i].id === f) return i;
    return -1; /* descartada */
  }
  function enProceso(cot) {
    return ["busqueda", "seleccion", "muestras"].indexOf(faseDe(cot)) >= 0;
  }
  /* lo invertido en muestras: el costo de la muestra + su envío, de las pedidas */
  function gastoMuestras(cot) {
    return (cot.ofertas || []).reduce(function (t, o) {
      return t + (o.muestraPedida ? n(o.precioMuestra) + n(o.muestraEnvio) : 0);
    }, 0);
  }

  /* a qué fase se vuelve cuando se deshace una elección */
  function faseRetro(cot) {
    var conMuestra = (cot.ofertas || []).some(function (o) { return o.muestraPedida; });
    return conMuestra ? "muestras" : ((cot.ofertas || []).length ? "seleccion" : "busqueda");
  }

  /* el filtro vive fuera del render para que no se pierda al repintar */
  var filtro = { estado: "proceso", texto: "" };

  /* ---------- utilidades ---------- */
  function n(v) { return +v || 0; }
  function cots() { return App.db && App.db.cotizaciones ? App.db.cotizaciones : []; }
  function provs() { return App.db && App.db.proveedores ? App.db.proveedores : []; }
  function forwarders() { return App.db && App.db.forwarders ? App.db.forwarders : []; }
  function tarifas() { return App.db && App.db.tarifas ? App.db.tarifas : []; }

  function provDe(id) { return provs().filter(function (p) { return p.id === id; })[0] || null; }
  function fwDe(id) { return forwarders().filter(function (f) { return f.id === id; })[0] || null; }
  function tarifaDe(id) { return tarifas().filter(function (t) { return t.id === id; })[0] || null; }
  function cotDe(id) { return cots().filter(function (c) { return c.id === id; })[0] || null; }
  function cliDe(id) { return App.cliente ? App.cliente(id) : null; }

  function nomProv(of) {
    var p = provDe(of ? of.proveedorId : null);
    return p ? p.nombre : "Fábrica sin registrar";
  }
  /* decimales con coma, para volúmenes chicos que App.fmt.num redondearía a cero */
  function numDec(v, d) { return (+v || 0).toFixed(d).replace(".", ","); }
  /* nombres como "Yiwu Happy Toys Co." dejan doble punto al cerrar la frase */
  function sinPunto(s) {
    var t = String(s == null ? "" : s);
    return t.charAt(t.length - 1) === "." ? t.slice(0, -1) : t;
  }

  function unidadTarifa(u) {
    return u === "cbm" ? "por m³" : u === "contenedor" ? "por contenedor" : "por kg";
  }
  function tarifaTexto(t) {
    if (!t) return "";
    var fw = fwDe(t.forwarderId);
    return (fw ? fw.nombre + " · " : "") + (t.ruta || "Ruta sin nombre") +
      (t.via ? " (" + t.via + ")" : "") + " · " + App.fmt.usd(t.precio) + " " + unidadTarifa(t.unidad) +
      (n(t.minimo) > 0 ? " · mín. " + App.fmt.usd(t.minimo) : "") +
      (n(t.diasTransito) > 0 ? " · " + n(t.diasTransito) + " días" : "");
  }

  /* días que lleva abierta una cotización */
  function diasAbierta(cot) {
    if (!cot.fecha || !App.calc || !App.calc.diasHasta) return 0;
    return -App.calc.diasHasta(cot.fecha.slice(0, 10));
  }

  /* ============================================================
     EL CÁLCULO: qué cuesta cada fábrica puesta en destino
     ============================================================ */

  /* El flete lo manda el módulo de Carga si ya existe (una sola verdad);
     si todavía no está cargado, aplicamos aquí la misma regla. */
  function costoFlete(tarifa, pesoTotal, cbmTotal) {
    if (!tarifa) return 0;
    if (App.modCarga && App.modCarga.costoFlete) {
      return n(App.modCarga.costoFlete(tarifa, pesoTotal, cbmTotal));
    }
    var precio = n(tarifa.precio);
    var u = tarifa.unidad || "kg";
    var bruto = u === "cbm" ? precio * n(cbmTotal)
      : u === "contenedor" ? precio
        : precio * n(pesoTotal);
    var minimo = n(tarifa.minimo);
    return minimo > 0 && bruto < minimo ? minimo : bruto;
  }

  /* Devuelve una fila por oferta, ordenada de la más barata puesta en
     destino a la más cara. Marca quién gana en cada dimensión. */
  function comparar(cot) {
    if (!cot) return [];
    var cant = Math.max(0, n(cot.cantidad));
    var tarifa = tarifaDe(cot.tarifaId);
    var diasTransito = tarifa ? n(tarifa.diasTransito) : 0;
    var hoy = App.hoyISO();

    var filas = (cot.ofertas || []).map(function (of) {
      var precioUnit = n(of.precioUnit);
      var subtotal = precioUnit * cant;
      var pesoTotal = n(of.pesoKgUnit) * cant;
      var cbmTotal = n(of.cbmUnit) * cant;
      var flete = tarifa ? costoFlete(tarifa, pesoTotal, cbmTotal) : 0;
      var puestoTotal = subtotal + flete;
      var moq = n(of.moq);
      return {
        oferta: of,
        proveedor: provDe(of.proveedorId),
        nombre: nomProv(of),
        precioUnit: precioUnit,
        subtotal: subtotal,
        pesoTotal: pesoTotal,
        cbmTotal: cbmTotal,
        flete: flete,
        fleteUnit: cant > 0 ? flete / cant : 0,
        muestra: n(of.precioMuestra),
        puestoTotal: puestoTotal,
        puestoUnit: cant > 0 ? puestoTotal / cant : 0,
        diasProduccion: n(of.diasProduccion),
        diasTransito: diasTransito,
        diasTotal: n(of.diasProduccion) + diasTransito,
        moq: moq,
        cumpleMoq: cant >= moq,
        faltanMoq: Math.max(0, moq - cant),
        vencida: of.validez ? of.validez < hoy : false,
        esGanadora: cot.ganadora === of.id,
        esMasBarata: false, esMasRapida: false, esMejorPrecioFabrica: false
      };
    });

    if (!filas.length) return filas;

    filas.sort(function (a, b) {
      if (Math.abs(a.puestoUnit - b.puestoUnit) > 0.0001) return a.puestoUnit - b.puestoUnit;
      return a.diasTotal - b.diasTotal;
    });

    var minPuesto = filas[0].puestoUnit;
    var minDias = filas[0].diasTotal;
    var minFabrica = filas[0].precioUnit;
    filas.forEach(function (f) {
      if (f.diasTotal < minDias) minDias = f.diasTotal;
      if (f.precioUnit < minFabrica) minFabrica = f.precioUnit;
    });
    filas.forEach(function (f) {
      f.esMasBarata = Math.abs(f.puestoUnit - minPuesto) < 0.0001;
      f.esMasRapida = f.diasTotal === minDias;
      f.esMejorPrecioFabrica = Math.abs(f.precioUnit - minFabrica) < 0.0001;
    });
    return filas;
  }

  /* ============================================================
     LA RECOMENDACIÓN EN CRIOLLO
     Lógica real sobre los números, no plantillas huecas.
     ============================================================ */
  function recomendacion(cot, filas, tarifa) {
    var cant = Math.max(0, n(cot.cantidad));
    var uni = cot.unidad || "unidades";
    if (!filas.length) return "";
    var E = App.esc, F = App.fmt;
    var p = [];

    var barata = filas[0];
    var rapida = filas[0];
    var fabrica = filas[0];
    filas.forEach(function (f) {
      if (f.diasTotal < rapida.diasTotal) rapida = f;
      if (f.precioUnit < fabrica.precioUnit) fabrica = f;
    });

    if (!cant) {
      p.push("Falta poner <b>cuántas unidades</b> quieres. Sin cantidad no hay nada que comparar: el flete y el pedido mínimo dependen de ella.");
      return envolver(p);
    }

    var cantTxt = F.num(cant) + " " + uni;

    if (filas.length === 1) {
      p.push("Por ahora solo tienes cargada a <b>" + E(barata.nombre) + "</b>" +
        (tarifa
          ? ": puesta en destino te sale a <b>" + F.usd(barata.puestoUnit) + " por unidad</b> (" + F.usd(barata.puestoTotal) + " por las " + E(cantTxt) + ")."
          : " a <b>" + F.usd(barata.precioUnit) + " por unidad</b> de precio de fábrica (" + F.usd(barata.subtotal) + " en total). Todavía sin flete.") +
        " Con una sola fábrica no hay comparación: carga al menos otra y esta pantalla empieza a servir.");
    } else {
      p.push((tarifa ? "La más barata puesta en destino es " : "La más barata de fábrica es ") +
        "<b>" + E(barata.nombre) + "</b> a <b>" + F.usd(tarifa ? barata.puestoUnit : barata.precioUnit) + " por unidad</b>, " +
        F.usd(tarifa ? barata.puestoTotal : barata.subtotal) + " por las " + E(cantTxt) + "." +
        (tarifa ? "" : " Ojo: eso todavía <b>no incluye el flete</b>, que es justo lo que suele voltear la decisión."));

      /* precio vs tiempo */
      if (rapida.oferta.id === barata.oferta.id) {
        p.push("Y encima es la más rápida: <b>" + rapida.diasTotal + " días</b> entre producción" +
          (tarifa ? " y tránsito" : "") + ". Aquí no hay que elegir entre precio y tiempo, gana por los dos lados.");
      } else {
        var difDias = barata.diasTotal - rapida.diasTotal;
        var difTotal = rapida.puestoTotal - barata.puestoTotal;
        var difUnit = rapida.puestoUnit - barata.puestoUnit;
        if (difDias > 0 && difTotal > 0.009) {
          var pctCaro = barata.puestoTotal > 0 ? difTotal / barata.puestoTotal * 100 : 0;
          p.push("<b>" + E(rapida.nombre) + "</b> llega <b>" + difDias + " días antes</b> (" + rapida.diasTotal +
            " contra " + barata.diasTotal + "), pero cuesta <b>" + F.usd(difTotal) + " más</b> en total, " +
            F.usd(difUnit) + " más por unidad. " +
            (pctCaro <= 5
              ? "La diferencia es chica (" + F.num(pctCaro) + "% más): si el cliente tiene apuro, vale la pena pagarla."
              : pctCaro >= 15
                ? "Es un " + F.num(pctCaro) + "% más caro por ganar " + difDias + " días: solo conviene si hay urgencia real."
                : "Es un " + F.num(pctCaro) + "% más caro por ganar " + difDias + " días: decisión de cuánto vale ese tiempo para el cliente."));
        } else if (difDias > 0) {
          p.push("<b>" + E(rapida.nombre) + "</b> llega <b>" + difDias + " días antes</b> y cuesta prácticamente lo mismo. Con esos números es la que conviene.");
        }
      }

      /* la trampa clásica: barata en vitrina, cara puesta en destino */
      if (tarifa && fabrica.oferta.id !== barata.oferta.id) {
        p.push("Cuidado con el precio de vitrina: <b>" + E(fabrica.nombre) + "</b> es la más barata de fábrica (" +
          F.usd(fabrica.precioUnit) + " por unidad, " + F.usd(barata.precioUnit - fabrica.precioUnit) +
          " menos que " + E(barata.nombre) + "), pero su carga " +
          (fabrica.pesoTotal > barata.pesoTotal && fabrica.cbmTotal > barata.cbmTotal ? "pesa y abulta más"
            : fabrica.pesoTotal > barata.pesoTotal ? "pesa más"
              : fabrica.cbmTotal > barata.cbmTotal ? "abulta más"
                : "paga más flete") +
          " y al sumar el envío termina <b>" + F.usd(fabrica.puestoUnit - barata.puestoUnit) + " más cara por unidad</b> (" +
          F.usd(fabrica.puestoTotal - barata.puestoTotal) + " en el pedido completo).");
      }
    }

    /* pedidos mínimos que no se cumplen */
    var incumplen = filas.filter(function (f) { return !f.cumpleMoq; });
    if (incumplen.length) {
      p.push("⛔ <b>No llegas al pedido mínimo</b> de " +
        incumplen.map(function (f) {
          return E(f.nombre) + " (pide " + F.num(f.moq) + ", te faltan " + F.num(f.faltanMoq) + ")";
        }).join(", ") + ". O subes la cantidad, o " +
        (incumplen.length === 1 ? "esa fábrica no es opción" : "esas fábricas no son opción") +
        " por más barato que salga el número.");
    }

    /* cotizaciones vencidas: comparar contra precios viejos es engañarse */
    var vencidas = filas.filter(function (f) { return f.vencida; });
    if (vencidas.length) {
      p.push("⏳ La cotización de " + vencidas.map(function (f) {
        return "<b>" + E(f.nombre) + "</b> venció el " + F.fecha(f.oferta.validez);
      }).join(" y la de ") + ". Pide el precio otra vez antes de decidir.");
    }

    /* si ya eligió y no fue la más barata, que quede claro por qué */
    var elegida = filas.filter(function (f) { return f.esGanadora; })[0];
    if (elegida && !elegida.esMasBarata) {
      p.push("Elegiste <b>" + E(elegida.nombre) + "</b>, que no es la más barata: sale " +
        F.usd(elegida.puestoTotal - barata.puestoTotal) + " más que " + E(sinPunto(barata.nombre)) +
        ". Si fue por confianza, calidad o muestra ya vista, déjalo escrito en las notas para acordarte dentro de seis meses.");
    }

    if (!tarifa && filas.length > 1) {
      p.push("Falta elegir la tarifa de flete. Hasta que la pongas esto compara solo el precio de fábrica, que es la mitad de la historia.");
    }

    return envolver(p);
  }
  function envolver(p) {
    if (!p.length) return "";
    return '<div class="card" style="padding:13px 15px;box-shadow:none;border:1px solid var(--tint-soft);background:var(--tint-soft);margin-bottom:12px">' +
      '<div class="eyebrow" style="margin-bottom:6px">Qué dicen los números</div>' +
      p.map(function (t) {
        return '<p class="small" style="margin:0 0 7px;line-height:1.55">' + t + "</p>";
      }).join("") + "</div>";
  }

  /* ============================================================
     VISTA PRINCIPAL
     ============================================================ */
  App.modCotizaciones = {
    id: "cotizaciones", titulo: "Cotizaciones", icono: "comparar",
    /* la usa el boton + del movil */
    nueva: function () { formCotizacion(null); },
    render: function (el) {
      var lista = cots().slice().sort(function (a, b) {
        return (a.fecha || "") < (b.fecha || "") ? 1 : -1;
      });

      var cuenta = { proceso: 0, decidida: 0, comprada: 0, descartada: 0 };
      lista.forEach(function (c) {
        var f = faseDe(c);
        if (enProceso(c)) cuenta.proceso++;
        else if (cuenta[f] !== undefined) cuenta[f]++;
      });

      var html = '<div class="view">' +
        '<div class="spread" style="margin-bottom:12px"><div><h1>⚖️ Cotizaciones</h1>' +
        '<div class="small muted">De buscar fábricas a la primera compra: compara con el flete sumado</div></div>' +
        '<button class="btn primary" id="btn-cz-nueva">' + App.icon("plus") + " Cotización</button></div>";

      html += '<div class="search-bar" style="margin-bottom:10px">' + App.icon("buscar") +
        '<input class="input" id="bus-cz" placeholder="Buscar por título o cliente…" value="' + App.esc(filtro.texto) + '"></div>';

      html += '<div class="chips scroll-x" style="margin-bottom:12px">' +
        [["proceso", "En proceso", cuenta.proceso], ["decidida", "Elegidas", cuenta.decidida],
        ["comprada", "Compradas", cuenta.comprada], ["descartada", "Descartadas", cuenta.descartada],
        ["todas", "Todas", lista.length]]
          .map(function (x) {
            return '<button class="chip' + (filtro.estado === x[0] ? " active" : "") + '" data-cz-filtro="' +
              App.esc(x[0]) + '">' + x[1] + " (" + x[2] + ")</button>";
          }).join("") + "</div>";

      html += '<div id="cz-lista"></div></div>';
      el.innerHTML = html;

      function pintarLista() {
        var vis = lista.filter(function (c) {
          if (filtro.estado !== "todas") {
            if (filtro.estado === "proceso") { if (!enProceso(c)) return false; }
            else if (faseDe(c) !== filtro.estado) return false;
          }
          if (!filtro.texto) return true;
          var t = filtro.texto.toLowerCase();
          var cli = cliDe(c.clienteId);
          return (c.titulo || "").toLowerCase().indexOf(t) >= 0 ||
            (c.descripcion || "").toLowerCase().indexOf(t) >= 0 ||
            (cli ? cli.nombre.toLowerCase().indexOf(t) >= 0 : false);
        });

        var h = "";
        if (!vis.length) {
          h += '<div class="empty"><div class="big">⚖️</div><p>' +
            (cots().length
              ? "Sin cotizaciones en este filtro."
              : "Aquí cargas el mismo producto cotizado por varias fábricas y el sistema te dice cuál conviene de verdad una vez sumado el flete.") +
            "</p></div>";
        }

        vis.forEach(function (cot) {
          var est = ESTADOS[faseDe(cot)];
          var cli = cliDe(cot.clienteId);
          var nOf = (cot.ofertas || []).length;
          var dias = diasAbierta(cot);
          var filas = comparar(cot);
          var gan = filas.filter(function (f) { return f.esGanadora; })[0];
          var tarifa = tarifaDe(cot.tarifaId);

          h += '<div class="card lift" data-cz-ir="' + App.esc(cot.id) + '" style="cursor:pointer;margin-bottom:10px">' +
            '<div class="spread" style="align-items:flex-start"><div style="min-width:0;flex:1">' +
            '<div class="row-title wrap" style="font-size:15px">' + App.esc(cot.titulo || "Sin título") + "</div>" +
            '<div class="row-sub">' + (function () {
              var tc = (App.db.settings.tiendas || []).filter(function (t) { return t.id === cot.tienda; })[0];
              if (tc) return App.esc((tc.emoji ? tc.emoji + " " : "") + (tc.corto || tc.nombre)) + " · ";
              return cli ? App.esc(cli.nombre) + " · " : "";
            })() +
            App.fmt.num(n(cot.cantidad)) + " " + App.esc(cot.unidad || "unidades") +
            " · " + App.fmt.fecha(cot.fecha) + "</div></div>" +
            '<span class="pill ' + est.pill + '">' + est.emoji + " " + est.label + "</span></div>";

          if (cot.descripcion) {
            h += '<div class="small muted" style="margin-top:5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' +
              App.esc(cot.descripcion) + "</div>";
          }

          h += '<div class="flex wrap" style="gap:6px;margin-top:9px">' +
            '<span class="pill ' + (nOf >= 2 ? "info" : "warn") + '">🏭 ' + nOf + " fábrica" + (nOf === 1 ? "" : "s") + "</span>" +
            (nOf === 1 ? '<span class="pill warn">carga otra para comparar</span>' : "") +
            (nOf && !tarifa ? '<span class="pill warn">sin tarifa de flete</span>' : "") +
            (enProceso(cot) && dias > 7 ? '<span class="pill warn">⏰ ' + dias + " días en proceso</span>" : "") +
            (gastoMuestras(cot) > 0 ? '<span class="pill tint">🧪 muestras ' + App.fmt.usd(gastoMuestras(cot)) + "</span>" : "") +
            "</div>";

          /* dónde va el proceso: pasitos con la fase alcanzada */
          if (faseIx(cot) >= 0) {
            h += '<div class="small muted" style="margin-top:7px">Paso ' + (faseIx(cot) + 1) + " de " + FASES.length + " · " +
              FASES.map(function (fs, fi) { return fi <= faseIx(cot) ? fs.emoji : "○"; }).join(" ") + "</div>";
          }

          if (gan) {
            h += '<div class="spread" style="margin-top:9px;padding-top:9px;border-top:1px solid var(--hairline)">' +
              '<div class="small"><b>Ganó ' + App.esc(gan.nombre) + "</b>" +
              (tarifa ? "" : " <span class=\"muted\">(sin flete calculado)</span>") + "</div>" +
              '<div class="row-end"><span class="row-amount num">' + App.fmt.usd(tarifa ? gan.puestoUnit : gan.precioUnit) + "</span>" +
              '<div class="small muted">' + (tarifa ? "puesto por unidad" : "por unidad de fábrica") + "</div></div></div>";
          }
          h += "</div>";
        });
        App.$("#cz-lista", el).innerHTML = h;
      }
      pintarLista();

      /* la búsqueda solo repinta la lista: el input no pierde el foco */
      App.$("#bus-cz", el).addEventListener("input", function (e) {
        filtro.texto = e.target.value;
        pintarLista();
      });
      App.delegar(el, "click", "[data-cz-filtro]", function (e, t) {
        filtro.estado = t.dataset.czFiltro;
        App.$$("[data-cz-filtro]", el).forEach(function (b) {
          b.classList.toggle("active", b.dataset.czFiltro === filtro.estado);
        });
        pintarLista();
      });
      App.delegar(el, "click", "[data-cz-ir]", function (e, t) {
        var cot = cotDe(t.dataset.czIr);
        if (cot) ficha(cot);
      });
      App.$("#btn-cz-nueva", el).addEventListener("click", function () { formCotizacion(null); });
    },
    comparar: comparar
  };

  /* ============================================================
     FICHA DE LA COTIZACIÓN: aquí vive el comparador
     ============================================================ */
  function ficha(cot) {
    var sucio = false; /* si algo cambió, al cerrar refrescamos la lista de atrás */

    var s = App.sheet({
      titulo: "⚖️ " + (cot.titulo || "Cotización"),
      cuerpo: '<div id="cz-ficha"></div>',
      pie: '<button class="btn ghost" data-cz-editar>' + App.icon("editar") + " Datos</button>" +
        '<button class="btn ghost" data-cz-csv>' + App.icon("descargar") + " CSV</button>" +
        '<button class="btn primary" data-cz-oferta>' + App.icon("plus") + " Fábrica</button>",
      alCerrar: function () { if (sucio) App.render(); }
    });

    function guardar() { sucio = true; App.save(); pintar(); }

    function pintar() {
      var cant = Math.max(0, n(cot.cantidad));
      var tarifa = tarifaDe(cot.tarifaId);
      var filas = comparar(cot);
      var cli = cliDe(cot.clienteId);
      var est = ESTADOS[faseDe(cot)];
      var h = "";

      /* ---- cabecera ---- */
      var tiendaCot = (App.db.settings.tiendas || []).filter(function (t) { return t.id === cot.tienda; })[0];
      h += '<div class="spread wrap" style="gap:8px;margin-bottom:8px">' +
        '<span class="pill ' + est.pill + '">' + est.emoji + " " + est.label + "</span>" +
        '<span class="small muted">' + App.fmt.fecha(cot.fecha) +
        (tiendaCot ? " · para " + App.esc((tiendaCot.emoji ? tiendaCot.emoji + " " : "") + (tiendaCot.corto || tiendaCot.nombre))
          : cli ? " · " + App.esc(cli.nombre) : " · sin destino asignado") + "</span></div>";

      /* ---- el proceso: toca la fase en la que vas ---- */
      if (cot.estado !== "descartada") {
        var fx = faseIx(cot);
        h += '<div class="pipe" style="margin-bottom:10px">' + FASES.map(function (fs, fi) {
          return (fi ? '<div class="pipe-flecha">' + App.icon("chevR") + "</div>" : "") +
            '<div class="pipe-step' + (fi <= fx ? " on" : "") + '" data-cz-fase="' + fs.id + '" title="' + App.esc(ESTADOS[fs.id].label) + '">' +
            '<div class="pipe-n">' + fs.emoji + '</div><div class="pipe-l">' + fs.corto + "</div></div>";
        }).join("") + "</div>";
        var gm = gastoMuestras(cot);
        if (gm > 0) h += '<div class="small muted" style="margin-bottom:10px">🧪 Invertido en muestras: <b class="num">' +
          App.fmt.usd(gm) + "</b> (muestra + envío; es gasto de la búsqueda, no entra en el costo puesto)</div>";
      }

      if (cot.descripcion) {
        h += '<div class="small texto-largo" style="margin-bottom:10px">' + App.esc(cot.descripcion) + "</div>";
      }

      h += '<div class="field" style="max-width:260px;margin-bottom:12px"><label>Cuántas ' +
        App.esc(cot.unidad || "unidades") + " quieres</label>" +
        '<input class="input num" id="cz-cant" type="number" min="0" step="1" value="' + cant + '"></div>';

      if (!cant) {
        h += aviso("danger", "Pon la cantidad que quieres pedir. De ella dependen el flete, el pedido mínimo y todo el resto del cálculo.");
      }

      /* ---- flete: agente de carga y tarifa ---- */
      h += '<div class="card" style="padding:13px 15px;box-shadow:none;border:1px solid var(--card-border);margin-bottom:12px">' +
        '<div class="eyebrow" style="margin-bottom:8px">🚢 Flete para el cálculo</div>';

      var listaT = tarifas();
      if (!listaT.length) {
        h += '<div class="small muted">Todavía no hay tarifas de flete cargadas. Regístralas con tu agente de carga y vuelve: sin flete solo se puede comparar el precio de fábrica, que engaña.</div>';
      } else {
        var tDisp = cot.forwarderId
          ? listaT.filter(function (t) { return t.forwarderId === cot.forwarderId; })
          : listaT;
        h += '<div class="form-grid">' +
          '<div class="field"><label>Agente de carga</label><select class="select" id="cz-fw">' +
          '<option value="">Todos</option>' +
          forwarders().map(function (f) {
            return '<option value="' + App.esc(f.id) + '"' + (cot.forwarderId === f.id ? " selected" : "") +
              ">" + App.esc(f.nombre) + "</option>";
          }).join("") + "</select></div>" +
          '<div class="field"><label>Tarifa</label><select class="select" id="cz-tarifa">' +
          '<option value="">Sin tarifa (solo precio de fábrica)</option>' +
          tDisp.map(function (t) {
            return '<option value="' + App.esc(t.id) + '"' + (cot.tarifaId === t.id ? " selected" : "") +
              ">" + App.esc(tarifaTexto(t)) + "</option>";
          }).join("") + "</select></div></div>";
        if (tarifa) {
          h += '<div class="small muted" style="margin-top:8px">Cobra ' + App.esc(App.fmt.usd(tarifa.precio) + " " + unidadTarifa(tarifa.unidad)) +
            (n(tarifa.minimo) > 0 ? ", con mínimo de " + App.fmt.usd(tarifa.minimo) : "") +
            (n(tarifa.diasTransito) > 0 ? ", " + n(tarifa.diasTransito) + " días de tránsito" : "") + ".</div>";
        }
      }
      h += "</div>";

      if (!tarifa && (cot.ofertas || []).length) {
        h += aviso("warn", "<b>Elige una tarifa de flete para ver el costo puesto real.</b> Mientras tanto estás comparando solo el precio de fábrica, y la fábrica más barata puede salir la más cara si su carga pesa o abulta más.");
      }

      /* ---- recomendación ---- */
      h += recomendacion(cot, filas, tarifa);

      /* ---- la comparativa ---- */
      if (!filas.length) {
        h += '<div class="empty" style="padding:24px 14px"><div class="big">🏭</div><p>Todavía no has cargado ninguna fábrica. Agrega dos a cinco cotizaciones del mismo producto y aquí abajo aparece la comparación.</p></div>';
      } else {
        h += '<div class="eyebrow" style="margin:14px 0 8px">La comparación · ' + filas.length +
          " fábrica" + (filas.length === 1 ? "" : "s") + "</div>";
        filas.forEach(function (f) { h += tarjetaOferta(f, cot, tarifa, cant); });
      }

      /* ---- notas y acciones de la cotización ---- */
      h += '<hr class="divider">';
      if (cot.notas) {
        h += '<div class="small texto-largo muted" style="margin-bottom:10px">📝 ' + App.esc(cot.notas) + "</div>";
      }
      h += '<div class="flex wrap" style="gap:8px">' +
        (cot.estado === "descartada"
          ? '<button class="btn sm" data-cz-reabrir>↩️ Reabrir</button>'
          : '<button class="btn sm ghost" data-cz-descartar>🗄️ Descartar</button>') +
        (cot.ganadora ? '<button class="btn sm ghost" data-cz-desganar>Quitar la elección</button>' : "") +
        '<button class="btn sm ghost" data-cz-borrar style="color:var(--danger)">' + App.icon("basura") + " Eliminar</button>" +
        "</div>";

      App.$("#cz-ficha", s.el).innerHTML = h;
    }

    function aviso(tipo, texto) {
      var color = tipo === "danger" ? "danger" : tipo === "warn" ? "warn" : "info";
      return '<div class="card" style="padding:11px 13px;box-shadow:none;border:1px solid var(--' + color +
        '-soft);background:var(--' + color + '-soft);margin-bottom:12px"><div class="small" style="line-height:1.5">' +
        texto + "</div></div>";
    }

    /* --- una fábrica de la comparativa --- */
    function tarjetaOferta(f, cot, tarifa, cant) {
      var pr = f.proveedor;
      var borde = f.esGanadora ? "var(--tint)" : f.esMasBarata ? "var(--ok)" : f.esMasRapida ? "var(--acero)" : "var(--card-border)";
      var grosor = (f.esGanadora || f.esMasBarata || f.esMasRapida) ? "1.5px" : "1px";

      var h = '<div class="card" style="padding:13px 14px;box-shadow:none;border:' + grosor + " solid " + borde +
        ';margin-bottom:10px' + (f.esGanadora ? ";background:var(--tint-soft)" : "") + '">';

      /* cabecera: fábrica + el número que importa */
      h += '<div class="spread" style="align-items:flex-start;gap:10px"><div style="min-width:0;flex:1">' +
        '<div class="row-title wrap" style="font-size:14.5px">🏭 ' + App.esc(f.nombre) + "</div>";
      if (pr && (pr.ciudad || pr.plataforma)) {
        h += '<div class="row-sub">' + App.esc([pr.ciudad, pr.plataforma].filter(function (x) { return x; }).join(" · ")) + "</div>";
      }
      h += "</div>" +
        '<div class="row-end"><span class="row-amount num" style="font-size:16px">' +
        App.fmt.usd(tarifa ? f.puestoUnit : f.precioUnit) + "</span>" +
        '<div class="small muted">' + (tarifa ? "puesto por unidad" : "de fábrica, sin flete") + "</div></div></div>";

      /* distintivos y quién gana en qué */
      var pills = [];
      if (f.esGanadora) pills.push('<span class="pill tint">✅ Elegida</span>');
      if (f.esMasBarata) pills.push('<span class="pill ok">🥇 La más barata' + (tarifa ? " puesta" : " de fábrica") + "</span>");
      if (f.esMasRapida) pills.push('<span class="pill info">⚡ La más rápida</span>');
      if (tarifa && f.esMejorPrecioFabrica && !f.esMasBarata) pills.push('<span class="pill warn">🏷️ Mejor precio de fábrica, pero no puesta</span>');
      if (!f.cumpleMoq) pills.push('<span class="pill danger">⛔ No llegas a su mínimo</span>');
      if (f.vencida) pills.push('<span class="pill danger">⏳ Cotización vencida</span>');
      if (pr && pr.verificado) pills.push('<span class="pill ok">✓ Verificada</span>');
      if (pr && pr.tradeAssurance) pills.push('<span class="pill info">🛡️ Trade Assurance</span>');
      if (pr && n(pr.calificacion) > 0) pills.push('<span class="pill tint">⭐ ' + App.fmt.num(pr.calificacion) + "</span>");
      if (pills.length) h += '<div class="flex wrap" style="gap:6px;margin-top:9px">' + pills.join("") + "</div>";

      /* los datos: rejilla que se abre en escritorio y se apila en el teléfono */
      var d = [];
      d.push(dato("Precio fábrica", App.fmt.usd(f.precioUnit) + " /u"));
      d.push(dato("Subtotal", App.fmt.usd(f.subtotal)));
      d.push(dato("Pedido mínimo", f.moq ? App.fmt.num(f.moq) : "sin mínimo",
        f.cumpleMoq ? "" : "color:var(--danger)"));
      d.push(dato("Producción", f.diasProduccion ? f.diasProduccion + " días" : "-"));
      d.push(dato("Peso total", f.pesoTotal ? App.fmt.num(f.pesoTotal) + " kg" : "-"));
      d.push(dato("Volumen total", f.cbmTotal ? numDec(f.cbmTotal, 3) + " m³" : "-"));
      if (tarifa) {
        d.push(dato("Flete", App.fmt.usd(f.flete)));
        d.push(dato("Puesto por unidad", App.fmt.usd(f.puestoUnit), "color:var(--tint)"));
        d.push(dato("Puesto total", App.fmt.usd(f.puestoTotal), "color:var(--tint)"));
        d.push(dato("Días totales", f.diasTotal + " días"));
      }
      h += '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(98px,1fr));gap:10px 12px;margin-top:11px">' +
        d.join("") + "</div>";

      var extras = [];
      if (f.oferta.validez) extras.push("Precio válido hasta el " + App.fmt.fecha(f.oferta.validez));
      if (!f.cumpleMoq) extras.push("Su mínimo son " + App.fmt.num(f.moq) + " y pides " + App.fmt.num(cant) + ": faltan " + App.fmt.num(f.faltanMoq));
      if (extras.length) {
        h += '<div class="small muted" style="margin-top:9px;line-height:1.5">' +
          extras.map(function (x) { return App.esc(x); }).join("<br>") + "</div>";
      }

      /* ---- la muestra de ESTA fábrica: su costo, su envío y en qué va ---- */
      var o = f.oferta;
      var mTiene = f.muestra > 0 || o.muestraPedida || o.muestraEnvio;
      var mLin = '<div style="margin-top:10px;padding:9px 11px;border-radius:11px;background:var(--field-bg)">' +
        '<div class="spread wrap" style="gap:6px"><span class="small" style="font-weight:650">🧪 Muestra</span>' +
        '<span class="flex wrap" style="gap:5px">' +
        (o.muestraPedida ? '<span class="pill info">pedida ' + App.fmt.fecha(o.muestraPedida) + "</span>" : '<span class="pill">sin pedir</span>') +
        (o.muestraRecibida ? '<span class="pill ok">llegó ' + App.fmt.fecha(o.muestraRecibida) + "</span>" : "") +
        (o.muestraVeredicto === "ok" ? '<span class="pill ok">👍 aprobada</span>' : "") +
        (o.muestraVeredicto === "no" ? '<span class="pill danger">👎 no sirvió</span>' : "") +
        "</span></div>" +
        (mTiene ? '<div class="small muted" style="margin-top:4px">Cuesta ' + App.fmt.usd(f.muestra) +
          (n(o.muestraEnvio) > 0 ? " + " + App.fmt.usd(o.muestraEnvio) + " del envío" : "") +
          " · gasto aparte, no entra en el costo puesto</div>" : "") +
        '<div class="flex wrap" style="gap:6px;margin-top:7px">' +
        (!o.muestraPedida ? '<button class="btn sm" data-cz-mu-pedir="' + App.esc(o.id) + '">🧪 Pedí la muestra</button>' : "") +
        (o.muestraPedida && !o.muestraRecibida ? '<button class="btn sm" data-cz-mu-llego="' + App.esc(o.id) + '">📬 Ya llegó</button>' : "") +
        (o.muestraRecibida && !o.muestraVeredicto ? '<button class="btn sm" data-cz-mu-ok="' + App.esc(o.id) + '">👍 Sirve</button>' +
          '<button class="btn sm ghost" data-cz-mu-no="' + App.esc(o.id) + '">👎 No sirve</button>' : "") +
        "</div></div>";
      h += mLin;

      if (f.oferta.notas) {
        h += '<div class="small texto-largo" style="margin-top:7px">💬 ' + App.esc(f.oferta.notas) + "</div>";
      }

      /* acciones */
      h += '<div class="flex wrap" style="gap:8px;margin-top:11px">' +
        (f.esGanadora
          ? '<button class="btn sm primary" data-cz-importar="' + App.esc(f.oferta.id) + '">' + App.icon("orden") + " Primera compra</button>"
          : '<button class="btn sm primary" data-cz-elegir="' + App.esc(f.oferta.id) + '">✓ Elegir esta</button>') +
        '<button class="btn sm ghost" data-cz-of-editar="' + App.esc(f.oferta.id) + '">' + App.icon("editar") + "</button>" +
        '<button class="btn sm ghost" data-cz-of-borrar="' + App.esc(f.oferta.id) + '" style="color:var(--danger)">' + App.icon("basura") + "</button>" +
        "</div></div>";
      return h;
    }

    function dato(label, valor, estilo) {
      return '<div><div class="eyebrow" style="font-size:10px;letter-spacing:0.05em">' + App.esc(label) + "</div>" +
        '<div class="num" style="font-weight:650;font-size:13.5px;margin-top:2px' + (estilo ? ";" + estilo : "") + '">' +
        App.esc(valor) + "</div></div>";
    }

    function ofertaDe(id) {
      return (cot.ofertas || []).filter(function (o) { return o.id === id; })[0] || null;
    }

    /* ---------- listeners (delegados: sobreviven a cada repintado) ---------- */
    App.delegar(s.el, "change", "#cz-cant", function (e, t) {
      cot.cantidad = Math.max(0, parseInt(t.value, 10) || 0);
      guardar();
    });
    App.delegar(s.el, "change", "#cz-fw", function (e, t) {
      cot.forwarderId = t.value || null;
      var ta = tarifaDe(cot.tarifaId);
      /* si la tarifa elegida no es de ese agente, se suelta para no mentir en el cálculo */
      if (ta && cot.forwarderId && ta.forwarderId !== cot.forwarderId) cot.tarifaId = null;
      guardar();
    });
    App.delegar(s.el, "change", "#cz-tarifa", function (e, t) {
      cot.tarifaId = t.value || null;
      var ta = tarifaDe(cot.tarifaId);
      if (ta && ta.forwarderId) cot.forwarderId = ta.forwarderId;
      guardar();
    });
    /* la fase se puede tocar directo (con sus reglas de sentido común) */
    App.delegar(s.el, "click", "[data-cz-fase]", function (e, t) {
      var f = t.dataset.czFase;
      if ((f === "decidida" || f === "comprada") && !cot.ganadora) {
        App.toast("Primero elige la fábrica ganadora con el botón \"Elegir esta\"", "err");
        return;
      }
      if (f === faseDe(cot)) return;
      cot.estado = f;
      guardar();
      App.toast(ESTADOS[f].emoji + " " + ESTADOS[f].label);
    });

    /* la muestra: pedirla, recibirla y el veredicto */
    App.delegar(s.el, "click", "[data-cz-mu-pedir]", function (e, t) {
      var of = ofertaDe(t.dataset.czMuPedir);
      if (!of) return;
      of.muestraPedida = App.hoyISO();
      if (["busqueda", "seleccion", "abierta"].indexOf(cot.estado) >= 0 || !ESTADOS[cot.estado]) cot.estado = "muestras";
      guardar();
      App.toast("🧪 Muestra pedida a " + sinPunto(nomProv(of)) + ". Ponle su costo y su envío con ✏️");
    });
    App.delegar(s.el, "click", "[data-cz-mu-llego]", function (e, t) {
      var of = ofertaDe(t.dataset.czMuLlego);
      if (!of) return;
      of.muestraRecibida = App.hoyISO();
      guardar();
      App.toast("📬 Muestra recibida - pruébala y dale el veredicto");
    });
    App.delegar(s.el, "click", "[data-cz-mu-ok]", function (e, t) {
      var of = ofertaDe(t.dataset.czMuOk);
      if (!of) return;
      of.muestraVeredicto = "ok";
      guardar();
      App.toast("👍 Aprobada. Si es la elegida, dale a \"Elegir esta\"");
    });
    App.delegar(s.el, "click", "[data-cz-mu-no]", function (e, t) {
      var of = ofertaDe(t.dataset.czMuNo);
      if (!of) return;
      of.muestraVeredicto = "no";
      guardar();
    });

    App.delegar(s.el, "click", "[data-cz-elegir]", function (e, t) {
      var of = ofertaDe(t.dataset.czElegir);
      if (!of) return;
      cot.ganadora = of.id;
      cot.estado = "decidida";
      guardar();
      App.toast("Elegida: " + sinPunto(nomProv(of)));
    });
    App.delegar(s.el, "click", "[data-cz-importar]", function (e, t) {
      var of = ofertaDe(t.dataset.czImportar);
      if (!of) return;
      if (!(App.modImportaciones && App.modImportaciones.nuevaDesdeCotizacion)) {
        App.toast("Todavía no está el módulo de importaciones para recibir esta cotización", "err");
        return;
      }
      s.cerrar();
      App.modImportaciones.nuevaDesdeCotizacion(cot, of);
    });
    App.delegar(s.el, "click", "[data-cz-of-editar]", function (e, t) {
      var of = ofertaDe(t.dataset.czOfEditar);
      if (of) formOferta(cot, of, guardar);
    });
    App.delegar(s.el, "click", "[data-cz-of-borrar]", function (e, t) {
      var of = ofertaDe(t.dataset.czOfBorrar);
      if (!of) return;
      App.confirmar("¿Quitar la cotización de " + nomProv(of) + " de esta comparación?", { peligro: true, accion: "Quitar" })
        .then(function (si) {
          if (!si) return;
          cot.ofertas = (cot.ofertas || []).filter(function (o) { return o.id !== of.id; });
          if (cot.ganadora === of.id) {
            cot.ganadora = null;
            if (cot.estado === "decidida") cot.estado = faseRetro(cot);
          }
          guardar();
          App.toast("Fábrica quitada de la comparación");
        });
    });
    App.delegar(s.el, "click", "[data-cz-descartar]", function () {
      cot.estado = "descartada";
      guardar();
      App.toast("Cotización descartada");
    });
    App.delegar(s.el, "click", "[data-cz-reabrir]", function () {
      cot.estado = cot.ganadora ? "decidida" : faseRetro(cot);
      guardar();
      App.toast("Búsqueda reabierta");
    });
    App.delegar(s.el, "click", "[data-cz-desganar]", function () {
      cot.ganadora = null;
      if (cot.estado === "decidida" || cot.estado === "comprada") cot.estado = faseRetro(cot);
      guardar();
    });
    App.delegar(s.el, "click", "[data-cz-borrar]", function () {
      App.confirmar("¿Eliminar esta cotización con todas sus fábricas comparadas?", { peligro: true, accion: "Eliminar" })
        .then(function (si) {
          if (!si) return;
          App.db.cotizaciones = cots().filter(function (c) { return c.id !== cot.id; });
          App.save();
          App.toast("Cotización eliminada");
          sucio = false;
          s.cerrar();
          App.render();
        });
    });

    App.$("[data-cz-editar]", s.foot).addEventListener("click", function () {
      formCotizacion(cot, function () {
        sucio = true;
        /* si le cambió el nombre, el encabezado del sheet lo sigue */
        var tit = App.$(".sheet-head h2", s.el);
        if (tit) tit.textContent = "⚖️ " + (cot.titulo || "Cotización");
        pintar();
      });
    });
    App.$("[data-cz-oferta]", s.foot).addEventListener("click", function () {
      formOferta(cot, null, guardar);
    });
    App.$("[data-cz-csv]", s.foot).addEventListener("click", function () { exportarCSV(cot); });

    pintar();
  }

  /* ============================================================
     EXPORTAR LA COMPARATIVA
     ============================================================ */
  function exportarCSV(cot) {
    var filas = comparar(cot);
    if (!filas.length) { App.toast("No hay fábricas que exportar todavía", "err"); return; }
    var tarifa = tarifaDe(cot.tarifaId);
    var cli = cliDe(cot.clienteId);
    var cant = Math.max(0, n(cot.cantidad));

    var out = [];
    out.push(["Cotización", cot.titulo || ""]);
    out.push(["Descripción", cot.descripcion || ""]);
    out.push(["Cliente", cli ? cli.nombre : ""]);
    out.push(["Cantidad", cant, cot.unidad || "unidades"]);
    out.push(["Fecha", cot.fecha || ""]);
    out.push(["Tarifa de flete", tarifa ? tarifaTexto(tarifa) : "SIN TARIFA - solo precio de fábrica"]);
    out.push([]);
    out.push(["fabrica", "ciudad", "plataforma", "precioUnitUsd", "subtotalUsd", "moq", "cumpleMoq",
      "diasProduccion", "pesoTotalKg", "volumenTotalCbm", "fleteUsd", "puestoUnitUsd", "puestoTotalUsd",
      "diasTotales", "muestraUsd", "validez", "elegida", "notas"]);
    filas.forEach(function (f) {
      var pr = f.proveedor;
      out.push([
        f.nombre, pr ? pr.ciudad || "" : "", pr ? pr.plataforma || "" : "",
        f.precioUnit.toFixed(2), f.subtotal.toFixed(2), f.moq, f.cumpleMoq ? "sí" : "NO",
        f.diasProduccion, f.pesoTotal.toFixed(2), f.cbmTotal.toFixed(3),
        f.flete.toFixed(2), f.puestoUnit.toFixed(2), f.puestoTotal.toFixed(2),
        f.diasTotal, f.muestra.toFixed(2), f.oferta.validez || "",
        f.esGanadora ? "sí" : "", f.oferta.notas || ""
      ]);
    });
    App.descargarCSV("comparativa-" + (cot.titulo || "cotizacion").toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 30), out);
    App.toast("Comparativa descargada 📊");
  }

  /* ============================================================
     NUEVA / EDITAR COTIZACIÓN
     ============================================================ */
  function formCotizacion(orig, alGuardar) {
    var clis = (App.db && App.db.clientes) ? App.db.clientes : [];
    var s = App.sheet({
      titulo: orig ? "✏️ Datos de la cotización" : "⚖️ Nueva cotización",
      cuerpo: '<div class="form-grid">' +
        '<div class="field full"><label>Qué se está cotizando</label><input class="input" id="cz-titulo" value="' +
        App.esc(orig ? orig.titulo : "") + '" placeholder="Bicicletas plegables rodado 20"></div>' +
        '<div class="field full"><label>Descripción y especificaciones</label><textarea class="textarea" id="cz-desc" placeholder="Material, medidas, color, empaque, lo que le pediste a las fábricas…">' +
        App.esc(orig ? orig.descripcion : "") + "</textarea></div>" +
        '<div class="field"><label>Cliente (opcional)</label><select class="select" id="cz-cli">' +
        '<option value="">Sin cliente</option>' +
        clis.map(function (c) {
          return '<option value="' + App.esc(c.id) + '"' + (orig && orig.clienteId === c.id ? " selected" : "") +
            ">" + App.esc(c.nombre) + "</option>";
        }).join("") + "</select></div>" +
        '<div class="field"><label>O para una tienda tuya</label><select class="select" id="cz-tienda">' +
        '<option value="">No es para una tienda</option>' +
        (App.db.settings.tiendas || []).map(function (t) {
          return '<option value="' + App.esc(t.id) + '"' + (orig && orig.tienda === t.id ? " selected" : "") +
            ">" + App.esc((t.emoji ? t.emoji + " " : "") + t.nombre) + "</option>";
        }).join("") + "</select></div>" +
        '<div class="field"><label>Fecha</label><input class="input" id="cz-fecha" type="date" value="' +
        App.esc(orig ? orig.fecha : App.hoyISO()) + '"></div>' +
        '<div class="field"><label>Cantidad</label><input class="input num" id="cz-f-cant" type="number" min="0" step="1" value="' +
        (orig ? n(orig.cantidad) : "") + '" placeholder="200"></div>' +
        '<div class="field"><label>Unidad</label><input class="input" id="cz-uni" value="' +
        App.esc(orig ? orig.unidad || "unidades" : "unidades") + '" placeholder="unidades, pares, cajas…"></div>' +
        '<div class="field full"><label>Notas</label><textarea class="textarea" id="cz-notas">' +
        App.esc(orig ? orig.notas : "") + "</textarea></div>" +
        "</div>",
      pie: '<button class="btn primary" data-ok>' + (orig ? "Guardar" : "Crear cotización") + "</button>"
    });

    App.$("[data-ok]", s.foot).addEventListener("click", function () {
      var titulo = App.$("#cz-titulo", s.el).value.trim();
      if (!titulo) { App.toast("Ponle un título: qué producto estás cotizando", "err"); return; }
      var cant = Math.max(0, parseInt(App.$("#cz-f-cant", s.el).value, 10) || 0);

      var destino = orig || {
        id: App.uid("cz"), estado: "busqueda", ofertas: [], ganadora: null,
        forwarderId: null, tarifaId: null, creadoEl: App.hoyISO()
      };
      destino.titulo = titulo;
      destino.descripcion = App.$("#cz-desc", s.el).value.trim();
      destino.clienteId = App.$("#cz-cli", s.el).value || null;
      destino.tienda = App.$("#cz-tienda", s.el).value || "";
      destino.fecha = App.$("#cz-fecha", s.el).value || App.hoyISO();
      destino.cantidad = cant;
      destino.unidad = App.$("#cz-uni", s.el).value.trim() || "unidades";
      destino.notas = App.$("#cz-notas", s.el).value.trim();

      if (!orig) {
        App.db.cotizaciones = cots();
        App.db.cotizaciones.push(destino);
      }
      App.save();
      App.toast(orig ? "Cotización actualizada" : "Cotización creada: ahora carga las fábricas");
      s.cerrar();
      if (alGuardar) alGuardar(destino);
      else { App.render(); ficha(destino); }
    });
  }

  /* ============================================================
     AÑADIR / EDITAR LA COTIZACIÓN DE UNA FÁBRICA
     ============================================================ */
  function formOferta(cot, orig, alGuardar) {
    var lista = provs();
    if (!lista.length) {
      App.toast("Primero registra las fábricas en la sección Fábricas y vuelve aquí", "err");
      return;
    }
    var o = orig || {};
    var s = App.sheet({
      titulo: orig ? "✏️ Cotización de la fábrica" : "🏭 Agregar fábrica a la comparación",
      cuerpo: '<div class="form-grid">' +
        '<div class="field full"><label>Fábrica</label><select class="select" id="of-prov">' +
        lista.map(function (p) {
          return '<option value="' + App.esc(p.id) + '"' + (o.proveedorId === p.id ? " selected" : "") +
            ">" + App.esc(p.nombre) + (p.ciudad ? " · " + App.esc(p.ciudad) : "") + "</option>";
        }).join("") + "</select></div>" +
        '<div class="field"><label>Precio por unidad (USD)</label><input class="input num" id="of-precio" type="number" step="0.01" min="0" value="' +
        (orig ? n(o.precioUnit) : "") + '" placeholder="12.50"></div>' +
        '<div class="field"><label>Pedido mínimo (MOQ)</label><input class="input num" id="of-moq" type="number" step="1" min="0" value="' +
        (orig ? n(o.moq) : "") + '" placeholder="100"></div>' +
        '<div class="field"><label>Días de producción</label><input class="input num" id="of-dias" type="number" step="1" min="0" value="' +
        (orig ? n(o.diasProduccion) : "") + '" placeholder="25"></div>' +
        '<div class="field"><label>Costo de la muestra (USD)</label><input class="input num" id="of-muestra" type="number" step="0.01" min="0" value="' +
        (orig ? n(o.precioMuestra) : "") + '" placeholder="0"></div>' +
        '<div class="field"><label>Envío de la muestra (USD)</label><input class="input num" id="of-mu-envio" type="number" step="0.01" min="0" value="' +
        (orig ? n(o.muestraEnvio) : "") + '" placeholder="0"></div>' +
        '<div class="field"><label>Peso por unidad (kg)</label><input class="input num" id="of-peso" type="number" step="0.001" min="0" value="' +
        (orig ? n(o.pesoKgUnit) : "") + '" placeholder="1.8"></div>' +
        '<div class="field"><label>Volumen por unidad (m³)</label><input class="input num" id="of-cbm" type="number" step="0.0001" min="0" value="' +
        (orig ? n(o.cbmUnit) : "") + '" placeholder="0.012"></div>' +
        '<div class="field full"><label>La cotización vale hasta</label><input class="input" id="of-validez" type="date" value="' +
        App.esc(o.validez || "") + '"></div>' +
        '<div class="field full"><label>Notas (qué incluye, condiciones de pago, lo que te dijeron)</label><textarea class="textarea" id="of-notas">' +
        App.esc(o.notas || "") + "</textarea></div>" +
        "</div>" +
        '<div class="small muted" style="margin-top:8px;line-height:1.5">El peso y el volumen son <b>por unidad</b>: con ellos y la tarifa del agente de carga se calcula el flete de todo el pedido. Si no los pones, el flete de esa fábrica sale en cero y la comparación miente.</div>',
      pie: (orig ? '<button class="btn danger" data-borrar style="flex:0 0 auto">' + App.icon("basura") + "</button>" : "") +
        '<button class="btn primary" data-ok>' + (orig ? "Guardar" : "Agregar a la comparación") + "</button>"
    });

    App.$("[data-ok]", s.foot).addEventListener("click", function () {
      var precio = Math.max(0, parseFloat(App.$("#of-precio", s.el).value) || 0);
      if (!precio) { App.toast("Falta el precio por unidad que te dio esa fábrica", "err"); return; }

      var destino = orig || { id: App.uid("of") };
      destino.proveedorId = App.$("#of-prov", s.el).value;
      destino.precioUnit = precio;
      destino.moq = Math.max(0, parseInt(App.$("#of-moq", s.el).value, 10) || 0);
      destino.diasProduccion = Math.max(0, parseInt(App.$("#of-dias", s.el).value, 10) || 0);
      destino.pesoKgUnit = Math.max(0, parseFloat(App.$("#of-peso", s.el).value) || 0);
      destino.cbmUnit = Math.max(0, parseFloat(App.$("#of-cbm", s.el).value) || 0);
      destino.precioMuestra = Math.max(0, parseFloat(App.$("#of-muestra", s.el).value) || 0);
      destino.muestraEnvio = Math.max(0, parseFloat(App.$("#of-mu-envio", s.el).value) || 0);
      destino.validez = App.$("#of-validez", s.el).value || null;
      destino.notas = App.$("#of-notas", s.el).value.trim();

      if (!orig) {
        cot.ofertas = cot.ofertas || [];
        cot.ofertas.push(destino);
      }
      App.toast(orig ? "Cotización actualizada" : "Fábrica agregada a la comparación");
      s.cerrar();
      if (alGuardar) alGuardar();
    });

    var bb = App.$("[data-borrar]", s.foot);
    if (bb) bb.addEventListener("click", function () {
      App.confirmar("¿Quitar esta fábrica de la comparación?", { peligro: true, accion: "Quitar" }).then(function (si) {
        if (!si) return;
        cot.ofertas = (cot.ofertas || []).filter(function (x) { return x.id !== orig.id; });
        if (cot.ganadora === orig.id) {
          cot.ganadora = null;
          if (cot.estado === "decidida") cot.estado = "abierta";
        }
        App.toast("Fábrica quitada");
        s.cerrar();
        if (alGuardar) alGuardar();
      });
    });
  }
})();
