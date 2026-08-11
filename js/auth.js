/* ============================================================
   auth.js - login demo, 2FA maqueta, sesión y permisos
   (la seguridad REAL llega en Fase 2: bcrypt+TOTP+passkeys)
   ============================================================ */
window.App = window.App || {};

(function () {
  "use strict";

  var SS_KEY = "nao_sesion";
  var CODIGO_DEMO = "246810";
  var pendiente = null; // usuario esperando 2FA

  App.auth = {
    user: null,
    sesionActiva: function () {
      if (App.MODO_NUBE) return false; // en nube la sesión la maneja Supabase (arranque asíncrono en app.js)
      var id = sessionStorage.getItem(SS_KEY);
      if (!id) return false;
      var u = App.usuario(id);
      if (!u) return false;
      App.auth.user = u;
      return true;
    },
    login: function (email, clave) {
      var u = App.db.usuarios.filter(function (x) {
        return x.email.toLowerCase() === String(email).trim().toLowerCase() && x.clave === clave;
      })[0];
      if (!u) return null;
      pendiente = u;
      return u;
    },
    verificar: function (codigo) {
      if (!pendiente || codigo !== CODIGO_DEMO) return false;
      App.auth.user = pendiente;
      sessionStorage.setItem(SS_KEY, pendiente.id);
      pendiente = null;
      return true;
    },
    logout: function () {
      if (App.MODO_NUBE && App.sb) {
        /* con Face ID activo, "salir" ofrece tres niveles (como las apps de banco) */
        if (App.bioActivo && App.bioActivo() && App.auth.user) {
          var s = App.sheet({
            titulo: "¿Cómo quieres salir?",
            cuerpo: '<div class="list">' +
              '<div class="row-item" data-op-bloquear><div class="thumb">🔒</div><div class="row-main">' +
              '<div class="row-title">Bloquear la app</div><div class="row-sub">Para volver: Face ID / huella</div></div></div>' +
              '<div class="row-item" data-op-salir-bio><div class="thumb">🚪</div><div class="row-main">' +
              '<div class="row-title">Salir</div><div class="row-sub">El login tendrá el botón de Face ID (o contraseña)</div></div></div>' +
              '<div class="row-item" data-op-salir-todo><div class="thumb">🧹</div><div class="row-main">' +
              '<div class="row-title">Cerrar sesión del todo</div><div class="row-sub">Borra el acceso rápido; pedirá email y contraseña</div></div></div></div>'
          });
          App.$("[data-op-bloquear]", s.el).addEventListener("click", function () { s.cerrar(); App.bloquearApp(); });
          App.$("[data-op-salir-bio]", s.el).addEventListener("click", function () {
            s.cerrar();
            App.sb.auth.getSession().then(function (r) {
              App.guardarSesionBio(r.data ? r.data.session : null);
              App.sb.auth.signOut({ scope: "local" }).then(function () { location.reload(); }, function () { location.reload(); });
            });
          });
          App.$("[data-op-salir-todo]", s.el).addEventListener("click", function () { s.cerrar(); salirNube(); });
          return;
        }
        salirNube();
        return;
      }
      sessionStorage.removeItem(SS_KEY);
      location.reload();
    },
    esSuper: function () { return App.auth.user && App.auth.user.rol === "super"; },
    puede: function (modId) {
      var u = App.auth.user;
      if (!u) return false;
      if (u.permisos === "*" || u.rol === "super") return true;
      return (u.permisos || []).indexOf(modId) >= 0;
    },
    /* ¿este usuario trabaja esta tienda? El súper las ve todas; un socio solo
       las que Manuel le haya asignado. "*" en la lista = todas. */
    puedeTienda: function (tiendaId) {
      var u = App.auth.user;
      if (!u) return false;
      if (u.rol === "super") return true;
      var t = u.tiendas || [];
      return t.indexOf("*") >= 0 || t.indexOf(tiendaId) >= 0;
    },
    /* ¿ve los costos de China, el margen y lo pagado a la fábrica?
       Depende del trato con cada socio: el que entra desde la importación sí,
       el que solo entra en la mercancía no. */
    veCostos: function () {
      var u = App.auth.user;
      if (!u) return false;
      return u.rol === "super" || !!u.verCostos;
    },
    /* las tiendas que este usuario puede trabajar */
    misTiendas: function () {
      return (App.db.settings.tiendas || []).filter(function (t) { return App.auth.puedeTienda(t.id); });
    }
  };

  /* ---------- pantallas de login ---------- */
  App.renderLogin = function () {
    var root = App.$("#login-root");
    root.className = "login-screen";

    /* ---- login REAL (Supabase Auth) cuando hay conexión configurada ---- */
    if (App.MODO_NUBE) {
      var puedeBio = App.bioActivo && App.bioActivo();
      root.innerHTML =
        '<div class="login-card view">' +
        '<div class="logo-mark">🧸</div>' +
        '<div class="login-title">La Teacher · En Vzla</div>' +
        '<div class="login-sub">Entra con tu cuenta</div>' +
        '<form id="f-login-nube">' +
        '<div class="field"><label>Email</label><input class="input" name="email" type="email" autocomplete="username" required></div>' +
        '<div class="field"><label>Contraseña</label><input class="input" name="clave" type="password" autocomplete="current-password" required></div>' +
        '<button class="btn primary block" type="submit" id="btn-entrar-nube">Entrar</button>' +
        "</form>" +
        (puedeBio ? '<button class="btn block" id="btn-login-bio" style="margin-top:10px">' + App.icon("faceid") + " Entrar con Face ID / huella</button>" : "") +
        '<div class="login-alt"><button class="btn ghost block" id="btn-olvide">¿Olvidaste tu contraseña?</button></div>' +
        "</div>";

      if (puedeBio) App.$("#btn-login-bio").addEventListener("click", function () {
        var b = App.$("#btn-login-bio");
        App.pedirBiometria().then(function () {
          b.disabled = true; b.textContent = "Entrando…";
          App.entrarConSesionBio(function () {
            b.disabled = false; b.textContent = "Entrar con Face ID / huella";
          });
        }, function () { App.toast("No se pudo verificar - intenta de nuevo", "err"); });
      });

      App.$("#f-login-nube").addEventListener("submit", function (e) {
        e.preventDefault();
        var fd = new FormData(e.target);
        var btn = App.$("#btn-entrar-nube");
        btn.disabled = true; btn.textContent = "Entrando…";
        App.sb.auth.signInWithPassword({ email: String(fd.get("email")).trim(), password: String(fd.get("clave")) }).then(function (r) {
          if (r.error) {
            btn.disabled = false; btn.textContent = "Entrar";
            App.toast(/invalid/i.test(r.error.message) ? "Email o contraseña incorrectos" : "No se pudo entrar: " + r.error.message, "err");
            return;
          }
          function continuar() {
            App.guardarSesionBio(r.data.session);
            App.iniciarNube(r.data.session).then(function () { App.iniciarApp(); }, function (e2) {
              btn.disabled = false; btn.textContent = "Entrar";
              App.toast(e2 && e2.sinPerfil ? e2.message : "Entraste, pero no se pudieron cargar los datos. Revisa la conexión y reintenta.", "err");
            });
          }
          function cancelado() {
            btn.disabled = false; btn.textContent = "Entrar";
          }
          /* segundos pasos en cadena: código TOTP (si la cuenta lo activó) y
             Face ID (si este dispositivo lo tiene activo) - uno, el otro o ambos */
          App.verificar2FASiHaceFalta(function () {
            App.exigirBioSiActivo(continuar, function () {
              cancelado();
              App.sb.auth.signOut(); /* sin el segundo paso no queda sesión a medias */
            });
          }, cancelado);
        });
      });
      App.$("#btn-olvide").addEventListener("click", function () {
        var campo = App.$("#f-login-nube input[name=email]");
        var email = campo ? campo.value.trim() : "";
        if (!email) { App.toast("Escribe tu email arriba y vuelve a tocar aquí", "err"); return; }
        App.sb.auth.resetPasswordForEmail(email, { redirectTo: location.origin + location.pathname }).then(function (r) {
          if (r.error) App.toast("No se pudo enviar: " + r.error.message, "err");
          else App.toast("Te enviamos un correo para restablecerla 📧");
        });
      });
      return;
    }

    root.innerHTML =
      '<div class="login-card view">' +
      '<div class="logo-mark">🧸</div>' +
      '<div class="login-title">La Teacher · En Vzla</div>' +
      '<div class="login-sub">Sistema de gestión de tus tiendas</div>' +
      '<form id="f-login">' +
      '<div class="field"><label>Email</label><input class="input" name="email" type="email" autocomplete="username" value="admin@tienda.com" required></div>' +
      '<div class="field"><label>Contraseña</label><input class="input" name="clave" type="password" autocomplete="current-password" placeholder="••••••••" required></div>' +
      '<button class="btn primary block" type="submit">Entrar</button>' +
      "</form>" +
      '<div class="login-alt">' +
      '<button class="btn ghost block" id="btn-faceid">' + App.icon("faceid") + " Entrar con Face ID</button>" +
      "</div>" +
      (App.db.meta.esDemo !== false
        ? '<div class="login-hint"><b>Modo demo:</b> clave <code>demo123</code> · código 2FA <code>246810</code>.<br>Vendedor: vendedor@tienda.com / vende123.</div>'
        : "") +
      "</div>";

    App.$("#f-login").addEventListener("submit", function (e) {
      e.preventDefault();
      var fd = new FormData(e.target);
      var u = App.auth.login(fd.get("email"), fd.get("clave"));
      if (!u) { App.toast("Email o contraseña incorrectos", "err"); return; }
      render2FA(u);
    });
    App.$("#btn-faceid").addEventListener("click", function () {
      App.toast("Face ID estará disponible en la versión online (passkeys)", "err");
    });
  };

  function render2FA(u) {
    var root = App.$("#login-root");
    root.innerHTML =
      '<div class="login-card view">' +
      '<div class="logo-mark">🔐</div>' +
      '<div class="login-title">Verificación en dos pasos</div>' +
      '<div class="login-sub">Hola ' + App.esc(u.nombre) + ". Escribe el código de tu app de autenticación o del email.</div>" +
      '<form id="f-2fa">' +
      '<div class="otp-row"><input class="input" name="codigo" inputmode="numeric" autocomplete="one-time-code" maxlength="6" placeholder="••••••" required></div>' +
      '<button class="btn primary block" type="submit">Verificar</button>' +
      "</form>" +
      '<div class="login-alt">' +
      '<button class="btn ghost block" id="btn-reset2fa">¿Perdiste el acceso? Restablecer 2FA</button>' +
      '<button class="btn block" id="btn-volver">Volver</button>' +
      "</div>" +
      '<div class="login-hint">Código demo: <code>246810</code></div>' +
      "</div>";

    App.$("#f-2fa").addEventListener("submit", function (e) {
      e.preventDefault();
      var codigo = new FormData(e.target).get("codigo");
      if (App.auth.verificar(String(codigo).trim())) {
        App.iniciarApp();
      } else {
        App.toast("Código incorrecto", "err");
      }
    });
    App.$("#btn-volver").addEventListener("click", App.renderLogin);
    App.$("#btn-reset2fa").addEventListener("click", function () {
      App.sheet({
        titulo: "Restablecer 2FA",
        cuerpo: '<p>En la versión online, esto enviará un enlace de restablecimiento al email de la cuenta y desactivará el autenticador anterior tras confirmarlo.</p>' +
          '<p class="muted small" style="margin-top:10px">En este prototipo usa el código demo <b>246810</b>.</p>'
      });
    });
  }

  /* salir de verdad: limpiar el caché del negocio, el acceso rápido y la sesión del servidor */
  function salirNube() {
    try { localStorage.removeItem("nao_cache_nube"); localStorage.removeItem("nao_sync_pend"); } catch (e) { }
    if (App.borrarSesionBio) App.borrarSesionBio();
    App.sb.auth.signOut().then(function () { location.reload(); }, function () { location.reload(); });
  }

  /* "sesión biométrica": copia de la sesión que solo se usa tras pasar el Face ID.
     Es lo que enciende el botón "Entrar con Face ID / huella" del login. */
  App.guardarSesionBio = function (session) {
    if (!App.bioActivo() || !session) return;
    try {
      localStorage.setItem("nao_bio_ses", JSON.stringify({ access_token: session.access_token, refresh_token: session.refresh_token }));
    } catch (e) { }
  };
  App.haySesionBio = function () {
    try { return !!localStorage.getItem("nao_bio_ses"); } catch (e) { return false; }
  };
  App.borrarSesionBio = function () {
    try { localStorage.removeItem("nao_bio_ses"); } catch (e) { }
  };
  App.entrarConSesionBio = function (alFallar) {
    var ses = null;
    try { ses = JSON.parse(localStorage.getItem("nao_bio_ses")); } catch (e) { }
    if (!ses) {
      App.toast("Entra con tu contraseña esta vez - el acceso con Face ID quedará listo para la próxima", "err");
      if (alFallar) alFallar();
      return;
    }
    App.sb.auth.setSession(ses).then(function (r) {
      if (r.error || !r.data || !r.data.session) {
        App.borrarSesionBio();
        App.toast("El acceso guardado venció - entra con tu contraseña", "err");
        if (alFallar) alFallar();
        App.renderLogin();
        return;
      }
      App.guardarSesionBio(r.data.session);
      App.iniciarNube(r.data.session).then(function () { App.iniciarApp(); }, function (e2) {
        App.toast(e2 && e2.sinPerfil ? e2.message : "No se pudieron cargar los datos - revisa tu internet", "err");
        if (alFallar) alFallar();
      });
    });
  };

  /* Face ID como SEGUNDO PASO del login con contraseña (si está activo en este dispositivo) */
  App.exigirBioSiActivo = function (alOk, alFallar) {
    if (!(App.bioActivo && App.bioActivo())) { alOk(); return; }
    var pasado = false;
    var s = App.sheet({
      titulo: "🪪 Segundo paso: Face ID",
      cuerpo: '<p class="small muted">Este dispositivo tiene Face ID / huella como segundo paso de verificación. Confírmalo para entrar.</p>' +
        '<button class="btn primary block" id="bio-2p" style="margin-top:10px">' + App.icon("faceid") + " Confirmar identidad</button>",
      alCerrar: function () { if (!pasado) alFallar(); }
    });
    function intentar(silencioso) {
      App.pedirBiometria().then(function () {
        pasado = true;
        s.cerrar();
        alOk();
      }, function () {
        if (!silencioso) App.toast("No se pudo verificar - intenta de nuevo", "err");
      });
    }
    App.$("#bio-2p", s.el).addEventListener("click", function () { intentar(false); });
    intentar(true);
  };

  /* bloquear la app a mano (la sesión sigue viva; se desbloquea con biometría) */
  App.bloquearApp = function () {
    if (App.sb) App.sb.auth.getSession().then(function (r) {
      if (App.guardarSesionBio) App.guardarSesionBio(r.data ? r.data.session : null);
    });
    App.$("#app").classList.add("hidden");
    App.$("#dock").classList.add("hidden");
    App.renderBloqueo(function () {
      App.$("#login-root").classList.add("hidden");
      App.$("#app").classList.remove("hidden");
      App.$("#dock").classList.remove("hidden");
    });
  };

  /* ---------- 2FA real (TOTP de Supabase): pide el código si está activada ---------- */
  App.verificar2FASiHaceFalta = function (alOk, alCancelar) {
    if (!App.MODO_NUBE) { alOk(); return; }
    App.sb.auth.mfa.getAuthenticatorAssuranceLevel().then(function (r) {
      var d = (r && r.data) || {};
      if (d.nextLevel === "aal2" && d.currentLevel !== "aal2") {
        App.sb.auth.mfa.listFactors().then(function (rf) {
          var tot = ((rf.data && rf.data.totp) || []).filter(function (f) { return f.status === "verified"; })[0];
          if (!tot) { alOk(); return; }
          var pasado = false;
          var s = App.sheet({
            titulo: "🔐 Verificación en dos pasos",
            cuerpo: '<p class="small muted">Escribe el código de 6 dígitos de tu app autenticadora (Google Authenticator, 1Password…).</p>' +
              '<div class="field" style="margin-top:8px"><label>Código</label>' +
              '<input class="input num" id="cod2fa" inputmode="numeric" maxlength="6" autocomplete="one-time-code"></div>',
            pie: '<button class="btn primary" data-ok>Verificar</button>',
            alCerrar: function () { if (!pasado && alCancelar) alCancelar(); }
          });
          function verificar() {
            var code = App.$("#cod2fa", s.el).value.trim();
            if (code.length !== 6) { App.toast("El código tiene 6 dígitos", "err"); return; }
            App.sb.auth.mfa.challenge({ factorId: tot.id }).then(function (rc) {
              if (rc.error) { App.toast(rc.error.message, "err"); return; }
              App.sb.auth.mfa.verify({ factorId: tot.id, challengeId: rc.data.id, code: code }).then(function (rv) {
                if (rv.error) { App.toast("Código incorrecto", "err"); return; }
                pasado = true;
                s.cerrar();
                alOk();
              });
            });
          }
          App.$("[data-ok]", s.foot).addEventListener("click", verificar);
          App.$("#cod2fa", s.el).addEventListener("keydown", function (e) { if (e.key === "Enter") verificar(); });
        });
      } else alOk();
    }, function () { alOk(); });
  };

  /* ---------- Face ID / huella: candado local del dispositivo (WebAuthn) ---------- */
  App.bioActivo = function () {
    try { return !!localStorage.getItem("nao_bio_id"); } catch (e) { return false; }
  };
  App.activarBiometria = function () {
    return new Promise(function (resolve, reject) {
      if (!window.PublicKeyCredential || !navigator.credentials || !window.crypto) { reject(new Error("no soportado")); return; }
      var reto = new Uint8Array(32);
      window.crypto.getRandomValues(reto);
      var uid = new TextEncoder().encode(String(App.auth.user.id).slice(0, 32));
      navigator.credentials.create({
        publicKey: {
          challenge: reto,
          rp: { name: "La Teacher · En Vzla" },
          user: { id: uid, name: App.auth.user.email || App.auth.user.nombre || "usuario", displayName: App.auth.user.nombre || "Usuario" },
          pubKeyCredParams: [{ type: "public-key", alg: -7 }, { type: "public-key", alg: -257 }],
          /* sin authenticatorAttachment: el navegador ofrece TODAS las opciones
             (Face ID/huella/PIN del equipo, o el teléfono escaneando un QR) */
          authenticatorSelection: { userVerification: "required", residentKey: "preferred" },
          timeout: 60000
        }
      }).then(function (cred) {
        var b = new Uint8Array(cred.rawId), str = "";
        for (var i = 0; i < b.length; i++) str += String.fromCharCode(b[i]);
        localStorage.setItem("nao_bio_id", btoa(str));
        /* guarda el acceso rápido de una vez: el botón del login queda disponible */
        if (App.sb) App.sb.auth.getSession().then(function (r) {
          if (App.guardarSesionBio) App.guardarSesionBio(r.data ? r.data.session : null);
        });
        resolve();
      }, reject);
    });
  };
  App.desactivarBiometria = function () {
    try { localStorage.removeItem("nao_bio_id"); } catch (e) { }
    if (App.borrarSesionBio) App.borrarSesionBio();
  };
  App.pedirBiometria = function () {
    return new Promise(function (resolve, reject) {
      try {
        var idB64 = localStorage.getItem("nao_bio_id");
        if (!idB64 || !navigator.credentials || !window.crypto) { reject(new Error("sin credencial")); return; }
        var raw = Uint8Array.from(atob(idB64), function (c) { return c.charCodeAt(0); });
        var reto = new Uint8Array(32);
        window.crypto.getRandomValues(reto);
        navigator.credentials.get({
          publicKey: {
            challenge: reto,
            allowCredentials: [{ type: "public-key", id: raw.buffer }],
            userVerification: "required",
            timeout: 60000
          }
        }).then(function (cred) { if (cred) resolve(); else reject(new Error("cancelado")); }, reject);
      } catch (e) { reject(e); }
    });
  };
  App.renderBloqueo = function (alOk) {
    var root = App.$("#login-root");
    root.className = "login-screen";
    root.classList.remove("hidden");
    root.innerHTML =
      '<div class="login-card view">' +
      '<div class="logo-mark">🔒</div>' +
      '<div class="login-title">Sistema bloqueado</div>' +
      '<div class="login-sub">Desbloquéalo con tu Face ID o huella</div>' +
      '<button class="btn primary block" id="btn-bio">' + App.icon("faceid") + " Desbloquear</button>" +
      '<div class="login-alt"><button class="btn block" id="btn-bio-salir">Cerrar sesión y entrar con contraseña</button></div>' +
      "</div>";
    function intentar(silencioso) {
      App.pedirBiometria().then(function () { alOk(); }, function () {
        /* el intento automático puede fallar sin gesto del usuario (iOS): no asustar con toast */
        if (!silencioso) App.toast("No se pudo verificar - toca Desbloquear para reintentar", "err");
      });
    }
    App.$("#btn-bio").addEventListener("click", function () { intentar(false); });
    App.$("#btn-bio-salir").addEventListener("click", function () {
      App.desactivarBiometria();
      App.auth.logout();
    });
    intentar(true);
  };

  /* llega desde el correo de "olvidé mi contraseña" (evento PASSWORD_RECOVERY) */
  App.mostrarNuevaClave = function () {
    var s = App.sheet({
      titulo: "🔐 Nueva contraseña",
      cuerpo: '<div class="field"><label>Escribe tu nueva contraseña (mínimo 8 caracteres)</label>' +
        '<input class="input" id="nclave" type="password" autocomplete="new-password"></div>',
      pie: '<button class="btn primary" data-ok>Guardar contraseña</button>'
    });
    App.$("[data-ok]", s.foot).addEventListener("click", function () {
      var clave = App.$("#nclave", s.el).value;
      if (clave.length < 8) { App.toast("Mínimo 8 caracteres", "err"); return; }
      App.sb.auth.updateUser({ password: clave }).then(function (r) {
        if (r.error) { App.toast("No se pudo: " + r.error.message, "err"); return; }
        App.toast("Contraseña actualizada ✓ - ya puedes entrar con ella");
        s.cerrar();
      });
    });
  };
})();
