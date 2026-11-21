/* calendariohabil.com — herramientas interactivas. Sin dependencias ni cookies. */
(function () {
  "use strict";
  var body = document.body;
  var ROOT = body.getAttribute("data-root") || "./";
  var PREVIEW = body.hasAttribute("data-preview");
  var DATA = null;
  var API = body.getAttribute("data-api") || "";  // buzón y avisos (Cloudflare Pages Functions)

  /* ---------- utilidades de fecha (siempre en UTC para evitar desfases) ---------- */
  function parse(s) { var p = s.split("-"); return new Date(Date.UTC(+p[0], +p[1] - 1, +p[2])); }
  function iso(d) { return d.toISOString().slice(0, 10); }
  function add(d, n) { var x = new Date(d.getTime()); x.setUTCDate(x.getUTCDate() + n); return x; }
  function dow(d) { return d.getUTCDay(); } // 0 domingo
  function todayIso() { var n = new Date(); return iso(new Date(Date.UTC(n.getFullYear(), n.getMonth(), n.getDate()))); }
  var FMT_LONG = new Intl.DateTimeFormat("es-ES", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
  var FMT_MONTH = new Intl.DateTimeFormat("es-ES", { month: "long", year: "numeric", timeZone: "UTC" });
  var FMT_WD = new Intl.DateTimeFormat("es-ES", { weekday: "long", timeZone: "UTC" });
  function long(d) { return FMT_LONG.format(d); }
  function daysBetween(a, b) { return Math.round((b - a) / 864e5); }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function link(path) { return ROOT + path + (PREVIEW ? "index.html" : ""); }

  function store(k, v) { try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v); } catch (e) { return null; } }

  /* ---------- festivos ---------- */
  function findCcaa(slug) { for (var i = 0; i < DATA.es.ccaa.length; i++) if (DATA.es.ccaa[i].slug === slug) return DATA.es.ccaa[i]; return null; }

  // place: "" | "zone:<slug>" | "local:<key>"
  function esHolidays(ccaaSlug, place) {
    var m = {}, c = findCcaa(ccaaSlug);
    if (!c) return m;
    (c.early2026 || []).forEach(function (h) { m[h[0]] = { name: h[1], kind: h[2] || "nac" }; });
    DATA.es.common.forEach(function (h) { m[h[0]] = { name: h[1], kind: "nac" }; });
    DATA.es.rest2026Common.forEach(function (h) { m[h[0]] = { name: h[1], kind: "nac" }; });
    c.own.forEach(function (h) { m[h[0]] = { name: h[1], kind: "aut" }; });
    c.rest2026.forEach(function (h) { m[h[0]] = { name: h[1], kind: "aut" }; });
    if (place && place.indexOf("zone:") === 0 && c.zones) {
      var z = c.zones.filter(function (z) { return "zone:" + z.slug === place; })[0];
      if (z) {
        (z.remove || []).forEach(function (d) { delete m[d]; });
        z.add.forEach(function (h) { m[h[0]] = { name: h[1], kind: "loc" }; });
      }
    }
    if (place && place.indexOf("local:") === 0 && c.locals) {
      var l = c.locals.filter(function (l) { return "local:" + l.key === place; })[0];
      if (l && l.zone && c.zones) {
        var zl = c.zones.filter(function (z) { return z.slug === l.zone; })[0];
        if (zl) { (zl.remove || []).forEach(function (d) { delete m[d]; }); zl.add.forEach(function (h) { m[h[0]] = { name: h[1], kind: "loc" }; }); }
      }
      if (l) l.days.forEach(function (h) { m[h[0]] = { name: h[1], kind: "loc" }; });
    }
    return m;
  }
  function mxHolidays() {
    var m = {};
    DATA.mx.days.forEach(function (h) { m[h[0]] = { name: h[1], kind: "nac" }; });
    return m;
  }
  function coHolidays() {
    var m = {};
    DATA.co.days.forEach(function (h) { m[h[0]] = { name: h[1], kind: "nac" }; });
    return m;
  }
  function holFor(country, ccaa, place) { return country === "mx" ? mxHolidays() : country === "co" ? coHolidays() : country === "pe" ? peHolidays() : esHolidays(ccaa, place); }

  /* ---------- calendarios escolares (SEP México y comunidades de España) ---------- */
  // S = { start, end, vac: [[desde, hasta, nombre]], off: [[fecha, nombre, tipo]] }
  // Devuelve { classes, kind: "we"|"vac"|"cte"|"fes"|"nl"|"out", name, until }
  function schoolStatus(S, s) {
    var d = parse(s), w = dow(d);
    if (s < S.start || s > S.end) return { classes: false, kind: "out", name: s < S.start ? "El curso " + (S.label || "escolar") + " aún no ha empezado" : "El curso " + (S.label || "escolar") + " ya terminó" };
    for (var i = 0; i < S.vac.length; i++) if (s >= S.vac[i][0] && s <= S.vac[i][1]) return { classes: false, kind: "vac", name: S.vac[i][2], until: S.vac[i][1] };
    if (w === 0 || w === 6) return { classes: false, kind: "we", name: w === 6 ? "Sábado" : "Domingo" };
    for (var j = 0; j < S.off.length; j++) if (S.off[j][0] === s) return { classes: false, kind: S.off[j][2] || "nl", name: S.off[j][1] };
    return { classes: true, kind: "", name: "Día de clases" };
  }
  function schoolNextOff(S, from, n) {
    var out = [], d = parse(from);
    while (out.length < n && iso(d) <= S.end) {
      var st = schoolStatus(S, iso(d));
      if (st.kind === "vac") { out.push([iso(d), st]); d = parse(st.until); }
      else if (!st.classes && st.kind !== "we" && st.kind !== "out") out.push([iso(d), st]);
      d = add(d, 1);
    }
    return out;
  }
  function sepCfg() { var S = DATA.sep; return { start: S.start, end: S.end, vac: S.vac, off: S.off, label: "2026-2027" }; }
  function sepStatus(s) { return schoolStatus(sepCfg(), s); }
  function sepNextOff(from, n) { return schoolNextOff(sepCfg(), from, n); }

  /* ---------- puentes (misma lógica que build.py) ---------- */
  function bridges(hol, year) {
    var blocks = [], d = new Date(Date.UTC(year, 0, 1)), end = new Date(Date.UTC(year, 11, 31));
    function free(x) { var w = dow(x); return w === 0 || w === 6 || !!hol[iso(x)]; }
    while (d <= end) {
      if (free(d)) { var b = d; while (add(d, 1) <= end && free(add(d, 1))) d = add(d, 1); blocks.push([b, d]); }
      d = add(d, 1);
    }
    var out = {};
    for (var i = 0; i < blocks.length - 1; i++) {
      var a1 = blocks[i][0], b1 = blocks[i][1], a2 = blocks[i + 1][0], b2 = blocks[i + 1][1];
      if (daysBetween(b1, a2) !== 2) continue;
      var total = daysBetween(a1, b2) + 1, any = false;
      for (var x = a1; x <= b2; x = add(x, 1)) if (hol[iso(x)]) { any = true; break; }
      if (total >= 4 && any) out[iso(add(b1, 1))] = total;
    }
    return out;
  }

  /* ---------- calendario visual en vivo ---------- */
  var MONTHS = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
  var WD = ["lunes", "martes", "miércoles", "jueves", "viernes", "sábado", "domingo"];
  // Número de semana ISO 8601 (la semana 1 es la que contiene el primer jueves del año)
  function isoWeek(d) {
    var x = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
    x.setUTCDate(x.getUTCDate() + 4 - (x.getUTCDay() || 7));
    var y0 = new Date(Date.UTC(x.getUTCFullYear(), 0, 1));
    return Math.ceil(((x - y0) / 864e5 + 1) / 7);
  }
  function monthsFor(mode) {
    var out = [], y, m;
    if (mode === "next") { var t = parse(todayIso()); y = t.getUTCFullYear(); m = t.getUTCMonth(); }
    else { y = +mode; m = 0; }
    for (var i = 0; i < 12; i++) { out.push([y, m]); m++; if (m === 12) { m = 0; y++; } }
    return out;
  }
  function renderCal(el, hol, mode) {
    var months = monthsFor(mode), br = {}, anyLoc = false, t = todayIso(), html = "", seen = {};
    months.forEach(function (ym) { if (!seen[ym[0]]) { seen[ym[0]] = 1; var b = bridges(hol, ym[0]); for (var k in b) br[k] = b[k]; } });
    var first = iso(new Date(Date.UTC(months[0][0], months[0][1], 1))), last = iso(new Date(Date.UTC(months[11][0], months[11][1] + 1, 0)));
    Object.keys(hol).forEach(function (k) { if (k >= first && k <= last && hol[k].kind === "loc") anyLoc = true; });
    var hasToday = t >= first && t <= last;
    var leg = [["h", "Festivo"]].concat(anyLoc ? [["hl", "Festivo local o insular"]] : [], el._vac ? [["vac", "Día de vacaciones que pides"], ["we", "Fin de semana"]] : [["pt", "Puente si pides ese día"], ["we", "Fin de semana"]], hasToday ? [["today", "Hoy"]] : []);
    var Y = parse(t).getUTCFullYear(), opts = [[String(Y), String(Y)], ["next", "Próximos 12 meses"], [String(Y + 1), String(Y + 1)]];
    var tabs = '<div class="country caltabs" role="group" aria-label="Periodo">' + opts.map(function (o) { return '<button type="button" data-mode="' + o[0] + '" aria-pressed="' + (String(mode) === o[0]) + '">' + o[1] + "</button>"; }).join("") + "</div>";
    var note = el._note && el._note(mode, first, last) ? '<p class="hint calnote">' + el._note(mode, first, last) + "</p>" : "";
    html += tabs + note + '<div class="cal"><div class="cal-head"><div class="legend">' + leg.map(function (l) { return '<span class="lg ' + l[0] + '">' + l[1] + "</span>"; }).join("") + '</div><span class="calbtns"><button class="btn alt small-btn" type="button" data-print>Descargar PDF</button><button class="btn alt small-btn" type="button" data-share>Compartir</button></span></div><div class="year">';
    var head = '<tr><th scope="col" class="wk"><abbr title="Número de semana (ISO 8601)">Sem</abbr></th>' + WD.map(function (w) { return '<th scope="col"><abbr title="' + w + '">' + (w === "miércoles" ? "X" : w.charAt(0).toUpperCase()) + "</abbr></th>"; }).join("") + "</tr>";
    months.forEach(function (ym) {
      var year = ym[0], m = ym[1];
      var firstD = new Date(Date.UTC(year, m, 1)), lastD = new Date(Date.UTC(year, m + 1, 0)).getUTCDate();
      var cells = [], marks = [], lead = (dow(firstD) + 6) % 7;
      for (var i = 0; i < lead; i++) cells.push("<td></td>");
      for (var dd = 1; dd <= lastD; dd++) {
        var x = new Date(Date.UTC(year, m, dd)), k = iso(x), cls = [], title = "";
        if (dow(x) === 0 || dow(x) === 6) cls.push("we");
        if (hol[k]) { var c = hol[k].kind === "loc" ? "hl" : "h"; cls.push(c); title = hol[k].name; marks.push('<li><b class="dot ' + c + '">' + dd + "</b>" + esc(hol[k].name) + "</li>"); }
        else if (el._vac && el._vac[k]) { cls.push("vac"); title = "Pide vacaciones"; }
        else if (br[k] && !el._vac) { cls.push("pt"); title = "Día puente: " + br[k] + " días seguidos"; }
        if (k === t) cls.push("today");
        if (k < t) cls.push("past");
        cells.push('<td data-d="' + k + '" class="' + cls.join(" ") + '"' + (title ? ' title="' + esc(title) + '"' : "") + ">" + dd + "</td>");
      }
      while (cells.length % 7) cells.push("<td></td>");
      var rows = "";
      for (var r = 0; r < cells.length; r += 7) {
        var wd = new Date(Date.UTC(year, m, Math.max(1, r - lead + 1))), wkn = isoWeek(wd);
        rows += '<tr><td class="wk" title="Semana ' + wkn + '">' + wkn + "</td>" + cells.slice(r, r + 7).join("") + "</tr>";
      }
      var none = "Sin festivos";
      html += '<section class="month"><h3>' + MONTHS[m] + " <span>" + year + "</span></h3><table><thead>" + head + "</thead><tbody>" + rows + '</tbody></table><ul class="mlist">' + (marks.join("") || '<li class="none">' + none + "</li>") + "</ul></section>";
    });
    var body = el.querySelector(".calbody") || el;
    body.innerHTML = html + "</div></div>";
  }
  var CAL_TITLE = { next: "Próximos 12 meses" };
  function paintLive(el) {
    var mode = el.getAttribute("data-mode") || el.getAttribute("data-default") || el.getAttribute("data-year") || "2027";
    if (mode !== "next" && !/^\d{4}$/.test(mode)) mode = "next";
    renderCal(el, el._hol, mode);
    var cap = document.querySelector("[data-livecal-title]");
    if (cap && el._label) cap.textContent = (CAL_TITLE[mode] || "Calendario " + mode) + ": " + el._label;
  }
  // Barra de controles del calendario: espejo de los selectores de la herramienta principal
  function calControls(el, src, country) {
    var bar = el.querySelector(".calctl");
    if (!bar) {
      bar = document.createElement("div"); bar.className = "calctl row";
      var bodyEl = document.createElement("div"); bodyEl.className = "calbody";
      el.innerHTML = ""; el.appendChild(bar); el.appendChild(bodyEl);
      bar.addEventListener("change", function (e) {
        var name = e.target.getAttribute("name");
        if (name === "country") { var btn = src.querySelector('.country button[data-c="' + e.target.value + '"]'); if (btn) btn.click(); return; }
        var target = src.querySelector('[name="' + name + '"]');
        if (target) { target.value = e.target.value; target.dispatchEvent(new Event("change")); }
      });
    }
    var html = "";
    if (src.querySelector(".country")) {
      html += '<div class="field"><label>País</label><select name="country">' + ["es", "mx", "co", "pe"].map(function (k) { return '<option value="' + k + '"' + (k === country ? " selected" : "") + ">" + COUNTRY_NAME[k] + "</option>"; }).join("") + "</select></div>";
    }
    if (country === "es") {
      ["ccaa", "place"].forEach(function (n) {
        var s = src.querySelector('select[name="' + n + '"]');
        if (!s) return;
        html += '<div class="field"><label>' + (n === "ccaa" ? "Comunidad autónoma" : "Municipio, isla o territorio") + '</label><select name="' + n + '">' + s.innerHTML + "</select></div>";
      });
    }
    bar.innerHTML = html;
    ["ccaa", "place"].forEach(function (n) { var a = bar.querySelector('[name="' + n + '"]'), b = src.querySelector('select[name="' + n + '"]'); if (a && b) a.value = b.value; });
    bar.hidden = !html;
  }
  function updateLiveCals(hol, label, src, country, isLocal) {
    document.querySelectorAll("[data-livecal]").forEach(function (el) {
      el._hol = hol; el._label = label;
      el._note = function (mode, first) { return isLocal && first < "2026-10-01" ? "Las fiestas locales de 2026 solo están incluidas de mediados de octubre a diciembre." : ""; };
      if (src) calControls(el, src, country);
      if (!el._bound) {
        el._bound = true;
        el.addEventListener("click", function (e) { var b = e.target.closest && e.target.closest("button[data-mode]"); if (!b) return; el.setAttribute("data-mode", b.getAttribute("data-mode")); paintLive(el); });
      }
      paintLive(el);
    });
  }


  /* ---------- devolución de la renta (LIRPF art. 103, LGT arts. 26 y 31) ---------- */
  // finCampana: último día de la campaña; presentada: fecha de presentación; cobro: fecha en que llega la devolución (o hoy)
  function calcDevolRenta(finCampana, presentada, importe, cobro, tipo) {
    // 6 meses siguientes al término del plazo (hasta el 31 de diciembre) o, fuera de plazo, desde la presentación
    var limite = presentada <= finCampana ? iso(add(plusMonths(add(parse(finCampana), 1), 6), -1)) : iso(plusMonths(parse(presentada), 6));
    var dias = Math.max(0, daysBetween(parse(limite), parse(cobro)));
    return { limite: limite, dias: dias, intereses: importe * (tipo / 100) * dias / 365, fuera: presentada > finCampana };
  }
  function toolRenta(root) {
    var form = root.querySelector("form"), res = root.querySelector(".result"), fin = root.getAttribute("data-fin"), tipo = parseFloat(root.getAttribute("data-interes"));
    var pres = root.querySelector('[name="presentada"]'), cob = root.querySelector('[name="cobro"]');
    if (!pres.value) pres.value = root.getAttribute("data-inicio"); if (!cob.value) cob.value = todayIso();
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var imp = parseFloat(String(root.querySelector('[name="importe"]').value).replace(",", ".")) || 0;
      res.hidden = false; res.classList.remove("warn");
      if (!pres.value || !cob.value || cob.value < pres.value) { res.classList.add("warn"); res.innerHTML = "Indica cuándo presentaste la declaración y una fecha de cobro posterior."; return; }
      var r = calcDevolRenta(fin, pres.value, imp, cob.value, tipo);
      var h = '<div class="hint">Hacienda tiene hasta el</div><div class="big">' + long(parse(r.limite)) + "</div><p>" + (r.fuera ? "Como la presentaste fuera de plazo, son 6 meses desde la presentación." : "Son 6 meses desde el final de la campaña, aunque la mayoría de las devoluciones llegan en pocas semanas.") + "</p>";
      if (r.dias > 0) h += "<p>Si te devuelve el dinero el " + long(parse(cob.value)) + ", lleva <strong>" + r.dias + " días de retraso</strong> y te debe intereses de demora sin que tengas que pedirlos" + (imp ? ": unos <strong>" + EUR(r.intereses) + "</strong> al " + String(tipo).replace(".", ",") + " % anual." : ".") + "</p>";
      else h += "<p>Hasta esa fecha Hacienda no paga intereses aunque tarde.</p>";
      res.innerHTML = h; res.focus();
    });
  }


  /* ---------- baja médica: incapacidad temporal (LGSS arts. 169-176) ---------- */
  // tipo: comun | profesional. Devuelve los tramos con fechas, porcentaje y quién paga, y el importe de «dias» días
  function calcBaja(inicio, tipo, baseDiaria, dias) {
    var T = tipo === "profesional" ? [[1, 1, 100, "La empresa (salario íntegro del día de la baja)"], [2, 545, 75, "La mutua o el INSS (lo adelanta la empresa en la nómina)"]]
      : [[1, 3, 0, "Nadie, salvo que tu convenio lo mejore"], [4, 15, 60, "La empresa"], [16, 20, 60, "La mutua o el INSS (lo adelanta la empresa en la nómina)"], [21, 545, 75, "La mutua o el INSS (lo adelanta la empresa en la nómina)"]];
    var b = parse(inicio), total = 0;
    var tramos = T.map(function (t) {
      var n = Math.max(0, Math.min(dias, t[1]) - t[0] + 1), imp = n * baseDiaria * t[2] / 100; total += imp;
      return { desde: iso(add(b, t[0] - 1)), hasta: t[1] >= 545 ? null : iso(add(b, t[1] - 1)), dia1: t[0], dia2: t[1], pct: t[2], paga: t[3], dias: n, importe: imp };
    });
    return { tramos: tramos, total: total, d365: iso(add(b, 364)), d545: iso(add(b, 544)) };
  }
  function toolBaja(root) {
    var form = root.querySelector("form"), res = root.querySelector(".result"), ini = root.querySelector('[name="inicio"]');
    if (!ini.value) ini.value = todayIso();
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var tipo = root.querySelector('[name="tipo"]:checked').value, sal = parseFloat(String(root.querySelector('[name="base"]').value).replace(",", ".")) || 0;
      var dias = parseInt(root.querySelector('[name="dias"]').value, 10) || 30;
      res.hidden = false; res.classList.remove("warn");
      if (!ini.value || dias < 1 || dias > 545) { res.classList.add("warn"); res.innerHTML = "Indica la fecha de la baja y una duración entre 1 y 545 días."; return; }
      var r = calcBaja(ini.value, tipo, sal / 30, dias);
      var h = sal ? '<div class="hint">Con ' + dias + " días de baja cobrarías de prestación unos</div><div class=\"big\">" + EUR(r.total) + "</div><p>Calculado con una base reguladora de " + EUR(sal / 30) + " al día (tu base de cotización del mes anterior ÷ 30). Importe bruto, sin complementos del convenio.</p>" : '<div class="hint">Qué cobras en cada tramo de la baja</div>';
      h += '<div class="table-wrap"><table><thead><tr><th scope="col">Días</th><th scope="col">Fechas</th><th scope="col">Cobras</th><th scope="col">Paga</th>' + (sal ? '<th scope="col">Importe</th>' : "") + "</tr></thead><tbody>" +
        r.tramos.map(function (t) {
          var dd = t.dia1 === t.dia2 ? "Día " + t.dia1 : t.dia2 >= 545 ? "Desde el día " + t.dia1 : "Del " + t.dia1 + " al " + t.dia2;
          var ff = t.hasta ? (t.desde === t.hasta ? FSH.format(parse(t.desde)) : FSH.format(parse(t.desde)) + " – " + FSH.format(parse(t.hasta))) : "Desde el " + FSH.format(parse(t.desde));
          return "<tr><td>" + dd + "</td><td>" + ff + "</td><td>" + (t.pct ? t.pct + " %" : "Nada") + "</td><td>" + t.paga + "</td>" + (sal ? "<td>" + EUR(t.importe) + "</td>" : "") + "</tr>";
        }).join("") + "</tbody></table></div>";
      h += "<ul><li>Si la baja dura más de un año, el <strong>" + long(parse(r.d365)) + "</strong> el INSS pasa a controlarla y decide si te da el alta, la prorroga o inicia una incapacidad permanente.</li>";
      h += "<li>La duración máxima, con la prórroga de 180 días, termina el <strong>" + long(parse(r.d545)) + "</strong>.</li></ul>";
      h += '<p class="hint">' + (tipo === "comun" ? "Para cobrar la baja por enfermedad común necesitas 180 días cotizados en los últimos 5 años. " : "Por accidente de trabajo o enfermedad profesional no se exige un mínimo de cotización. ") + "Muchos convenios completan hasta el 100 % del salario: revisa el tuyo. Cálculo orientativo.</p>";
      res.innerHTML = h; res.focus();
    });
  }

  function isWorking(d, hol, satWorking) {
    var w = dow(d);
    if (w === 0) return false;
    if (w === 6 && !satWorking) return false;
    return !hol[iso(d)];
  }
  function rangeText() { var f = new Intl.DateTimeFormat("es-ES", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }); return f.format(parse(DATA.range[0])) + " al " + f.format(parse(DATA.range[1])); }
  function inRange(s) { return s >= DATA.range[0] && s <= DATA.range[1]; }

  /* ---------- cálculos puros (probados en tests/test_app.js) ---------- */
  // Plazo administrativo (Ley 39/2015, art. 30). unit: habiles | naturales | meses
  function calcPlazo(hol, s, n, unit) {
    var d = parse(s), skipped = [], end;
    if (unit === "habiles") {
      var count = 0;
      while (count < n) {
        d = add(d, 1);
        if (isWorking(d, hol, false)) count++;
        else if (hol[iso(d)] && dow(d) !== 0) skipped.push(iso(d));
      }
      end = d;
    } else {
      if (unit === "naturales") end = add(d, n);
      else {
        var y = d.getUTCFullYear(), mo = d.getUTCMonth() + n, day = d.getUTCDate();
        var last = new Date(Date.UTC(y, mo + 1, 0)).getUTCDate();
        end = new Date(Date.UTC(y, mo, Math.min(day, last)));
      }
      while (!isWorking(end, hol, false)) { if (hol[iso(end)]) skipped.push(iso(end)); end = add(end, 1); }
    }
    return { end: iso(end), skipped: skipped };
  }
  function countHabiles(hol, a, b, sat) {
    var da = parse(a), db = parse(b);
    if (db < da) { var t = da; da = db; db = t; }
    var work = 0, total = 0, skipped = [];
    for (var d = da; d <= db; d = add(d, 1)) {
      total++;
      if (isWorking(d, hol, sat)) work++;
      else if (hol[iso(d)] && dow(d) !== 0) skipped.push(iso(d));
    }
    return { from: iso(da), to: iso(db), work: work, total: total, skipped: skipped };
  }
  function shiftHabiles(hol, a, n, step, sat) {
    var d = parse(a), c = 0, skipped = [];
    while (c < n) { d = add(d, step); if (isWorking(d, hol, sat)) c++; else if (hol[iso(d)] && dow(d) !== 0) skipped.push(iso(d)); }
    return { end: iso(d), skipped: skipped };
  }
  // Permisos retribuidos (art. 37.3 ET). type: matrimonio | familiar | fallecimiento | mudanza
  // Devuelve { start, end, days: [fechas de ausencia], skipped: [festivos saltados] }
  function calcPermiso(hol, type, s, opt) {
    opt = opt || {};
    var sat = !!opt.sat, d = parse(s), skipped = [];
    // Empieza el primer día laborable desde el hecho causante (STS 13/02/2018 y 17/03/2020);
    // en el permiso por hospitalización la persona trabajadora puede elegir otro día (STS 126/2026).
    while (!isWorking(d, hol, sat)) { if (hol[iso(d)] && dow(d) !== 0) skipped.push(iso(d)); d = add(d, 1); }
    var start = iso(d), days = [];
    if (type === "matrimonio") {
      for (var i = 0; i < 15; i++) days.push(iso(add(d, i)));
    } else {
      var n = type === "familiar" ? 5 : type === "fallecimiento" ? (opt.travel ? 4 : 2) : 1;
      while (days.length < n) {
        if (isWorking(d, hol, sat)) days.push(iso(d)); else if (hol[iso(d)] && dow(d) !== 0) skipped.push(iso(d));
        d = add(d, 1);
      }
    }
    return { start: start, end: days[days.length - 1], days: days, skipped: skipped };
  }
  // Horas extra México. j = [año, jornada máxima, horas al doble]
  function calcHoras(j, sal, per, pact, days, worked) {
    var daily = per === "mes" ? sal / 30 : per === "quincena" ? sal / 15 : per === "semana" ? sal / 7 : sal;
    var hourly = daily / (pact / days);
    var extra = Math.max(0, worked - pact), dbl = Math.min(extra, j[2]), tpl = Math.max(0, extra - j[2]);
    return { daily: daily, hourly: hourly, extra: extra, dbl: dbl, tpl: tpl, payDbl: dbl * hourly * 2, payTpl: tpl * hourly * 3, pay: dbl * hourly * 2 + tpl * hourly * 3 };
  }

  /* ---------- selectores comunidad / lugar ---------- */
  function fillPlaces(ccaaSel, placeSel) {
    var c = findCcaa(ccaaSel.value), keep = placeSel.getAttribute("data-keep") || "";
    placeSel.innerHTML = "";
    var o = document.createElement("option");
    o.value = ""; o.textContent = c && c.zones ? "Elige " + c.zonesLabel.toLowerCase() : "Sin festivos locales (solo nacionales y autonómicos)";
    placeSel.appendChild(o);
    if (!c) return;
    if (c.zones) c.zones.forEach(function (z) { var o = document.createElement("option"); o.value = "zone:" + z.slug; o.textContent = z.name; placeSel.appendChild(o); });
    if (c.locals && c.locals.length) {
      var g = document.createElement("optgroup"); g.label = c.localsLabel || "Municipios con fiestas locales publicadas";
      c.locals.forEach(function (l) { var o = document.createElement("option"); o.value = "local:" + l.key; o.textContent = l.label; g.appendChild(o); });
      placeSel.appendChild(g);
    }
    if (c.pending) {
      var p = document.createElement("option"); p.disabled = true;
      p.textContent = c.localsLabel ? "Resto de municipios: sin fiestas locales hasta fin de año (las de 2027, pendientes)" : c.locals && c.locals.length ? "Resto de municipios: pendientes de publicación" : "Fiestas locales 2027: pendientes de publicación en el " + c.boletin;
      placeSel.appendChild(p);
    }
    if (keep && placeSel.querySelector('option[value="' + keep + '"]')) placeSel.value = keep;
    placeSel.removeAttribute("data-keep");
  }
  function bindPlace(root, onChange) {
    var ccaa = root.querySelector('[name="ccaa"]'), place = root.querySelector('[name="place"]');
    if (!ccaa) return;
    if (ccaa.tagName === "SELECT" && !ccaa.options.length) {
      DATA.es.ccaa.forEach(function (c) { var o = document.createElement("option"); o.value = c.slug; o.textContent = c.name; ccaa.appendChild(o); });
    }
    var fixed = root.getAttribute("data-ccaa"), fixedPlace = root.getAttribute("data-place");
    var saved = store("ch_ccaa"), savedPlace = store("ch_place"), qp = new URLSearchParams(location.search);
    if (qp.get("lugar") && qp.get("ccaa") && !root.hasAttribute("data-embed")) { saved = qp.get("ccaa"); savedPlace = qp.get("lugar"); }
    if (fixed) ccaa.value = fixed; else if (saved && findCcaa(saved)) ccaa.value = saved;
    if (place) {
      place.setAttribute("data-keep", fixedPlace || (ccaa.value === saved ? savedPlace || "" : ""));
      fillPlaces(ccaa, place);
    }
    ccaa.addEventListener("change", function () { if (place) fillPlaces(ccaa, place); store("ch_ccaa", ccaa.value); store("ch_place", ""); onChange(); });
    if (place) place.addEventListener("change", function () { store("ch_place", place.value); onChange(); });
  }

  /* ---------- herramienta: próximo festivo ---------- */
  function guessCountry() {
    var saved = store("ch_country");
    if (saved === "es" || saved === "mx" || saved === "co" || saved === "pe") return saved;
    var l = (navigator.language || "").toLowerCase();
    return l === "es-mx" ? "mx" : l === "es-co" ? "co" : l === "es-pe" ? "pe" : "es";
  }
  var COUNTRY_NAME = { es: "España", mx: "México", co: "Colombia", pe: "Perú" };
  var COUNTRY_PAGE = { mx: "mx/dias-de-descanso-obligatorio-2027/", co: "co/festivos-2027/", pe: "pe/feriados-2027/" };
  function toolNext(root) {
    var sheet = root.querySelector(".sheet"), out = root.querySelector("[data-out]");
    var switcher = root.querySelector(".country"), places = root.querySelector("[data-places]");
    var country = root.getAttribute("data-country") || (switcher ? guessCountry() : "es");
    function render() {
      var cs = root.querySelector('[name="ccaa"]'), pl = root.querySelector('[name="place"]');
      var c = cs ? cs.value : "", place = pl ? pl.value : "", hol = holFor(country, c, place), t = todayIso();
      if (switcher) switcher.querySelectorAll("button").forEach(function (b) { b.setAttribute("aria-pressed", b.getAttribute("data-c") === country ? "true" : "false"); });
      if (places) places.hidden = country !== "es";
      var dates = Object.keys(hol).sort().filter(function (d) { return d >= t && dow(parse(d)) !== 0; });
      var head = sheet.querySelector(".sheet-head"), day = sheet.querySelector(".sheet-day"), wk = sheet.querySelector(".sheet-week"),
          nm = sheet.querySelector(".sheet-name"), cnt = sheet.querySelector(".sheet-count");
      var tomorrow = iso(add(parse(t), 1));
      var lines = [];
      if (hol[t]) lines.push("<strong>Hoy es festivo:</strong> " + esc(hol[t].name) + ".");
      else if (hol[tomorrow]) lines.push("<strong>Mañana es festivo:</strong> " + esc(hol[tomorrow].name) + ".");
      else lines.push("Ni hoy ni mañana son festivo.");
      sheet.hidden = false;
      if (!dates.length) {
        sheet.classList.add("is-work"); head.textContent = "Sin datos"; day.textContent = "—"; wk.textContent = ""; nm.textContent = "Aún no hay festivos publicados para estas fechas."; cnt.innerHTML = "";
      } else {
        var d = parse(dates[0]), n = daysBetween(parse(t), d);
        sheet.classList.remove("is-work");
        var mt = FMT_MONTH.format(d); head.textContent = mt.charAt(0).toUpperCase() + mt.slice(1);
        day.textContent = d.getUTCDate();
        wk.textContent = FMT_WD.format(d) + (dow(d) === 6 ? " (cae en sábado)" : "");
        nm.textContent = hol[dates[0]].name;
        cnt.innerHTML = n === 0 ? "<strong>Es hoy</strong>" : n === 1 ? "Falta <strong>1 día</strong>" : "Faltan <strong>" + n + " días</strong>";
        sheet.classList.remove("flip"); void sheet.offsetWidth; sheet.classList.add("flip");
      }
      var label = COUNTRY_NAME[country];
      if (out) {
        var href = link(COUNTRY_PAGE[country] || "es/festivos-2027/" + c + "/");
        if (country === "es") {
          var cc = findCcaa(c); label = cc ? cc.name : label;
          if (place.indexOf("local:") === 0) { var l = cc.locals.filter(function (x) { return "local:" + x.key === place; })[0]; if (l) { href = link(l.path); label = l.label; } }
          if (place.indexOf("zone:") === 0) { href = link("es/festivos-2027/" + c + "/" + place.slice(5) + "/"); label = pl.options[pl.selectedIndex].textContent; }
        }
        var extra = country === "mx" ? ' · <a href="' + link("mx/hay-clases-manana/") + '">¿Hay clases mañana?</a>' : "";
        out.innerHTML = lines.join(" ") + ' <a href="' + href + '"' + (root.hasAttribute("data-embed") ? ' target="_blank" rel="noopener"' : "") + ">Ver todos los " + (country === "pe" ? "feriados" : "festivos") + " de 2027</a>" + extra;
      }
      if (!root.hasAttribute("data-embed")) updateLiveCals(hol, label, root, country, place.indexOf("local:") === 0);
    }
    if (switcher) switcher.addEventListener("click", function (e) {
      var b = e.target.closest("button[data-c]"); if (!b) return;
      country = b.getAttribute("data-c"); store("ch_country", country); render();
    });
    bindPlace(root, render);
    render();
  }

  /* ---------- herramienta: ¿hay clases mañana? (SEP) ---------- */
  function cap(x) { return x.charAt(0).toUpperCase() + x.slice(1); }
  function toolSep(root, S) {
    S = S || sepCfg();
    var pl = root.querySelector('select[name="place"]');
    if (!pl || !root.getAttribute("data-ccaa")) return renderSchool(root, S);
    var base = S, grid = document.querySelector("[data-escgrid]"), note = root.querySelector("[data-escnote]");
    function inVac(d) { return base.vac.some(function (v) { return d >= v[0] && d <= v[1]; }); }
    function apply() {
      var hol = esHolidays(root.getAttribute("data-ccaa"), pl.value), have = {}, locs = [];
      base.off.forEach(function (o) { have[o[0]] = 1; });
      Object.keys(hol).sort().forEach(function (d) {
        if (hol[d].kind === "loc" && d >= base.start && d <= base.end && !have[d]) locs.push([d, /local/i.test(hol[d].name) ? hol[d].name : hol[d].name + " (fiesta local)", "fes"]);
      });
      var S2 = { start: base.start, end: base.end, label: base.label, vac: base.vac, off: base.off.concat(locs).sort(function (x, y) { return x[0] < y[0] ? -1 : 1; }) };
      renderSchool(root, S2);
      if (grid) {
        grid.querySelectorAll("[data-locmark]").forEach(function (el) { if (el.tagName === "LI") el.remove(); else { el.classList.remove("fes"); el.removeAttribute("data-locmark"); el.removeAttribute("title"); } });
        locs.forEach(function (o) {
          var td = grid.querySelector('td[data-d="' + o[0] + '"]'); if (!td) return;
          var vac = inVac(o[0]);
          if (!vac) { td.classList.add("fes"); td.setAttribute("data-locmark", ""); td.title = o[1]; }
          var ul = td.closest(".month") && td.closest(".month").querySelector(".mlist");
          if (ul && !vac) {
            var none = ul.querySelector(".none"); if (none) none.hidden = true;
            var li = document.createElement("li"); li.setAttribute("data-locmark", "");
            li.innerHTML = '<b class="dot fes">' + parse(o[0]).getUTCDate() + "</b>" + esc(o[1]); ul.appendChild(li);
          }
        });
        grid.querySelectorAll(".mlist").forEach(function (ul) { var none = ul.querySelector(".none"); if (none && !ul.querySelector("li[data-locmark]")) none.hidden = false; });
      }
      if (note) {
        var c = findCcaa(root.getAttribute("data-ccaa")), only26 = pl.value.indexOf("local:r26-") === 0;
        note.hidden = !pl.value;
        note.textContent = !pl.value ? "" : locs.length ? (locs.length === 1 ? "Añadida 1 fiesta local" : "Añadidas " + locs.length + " fiestas locales") + " de " + pl.options[pl.selectedIndex].textContent + (only26 ? ". Las de 2027 aún no están publicadas en " + (c ? c.boletin : "el boletín") + ": las añadiremos en cuanto salgan." : ".") : "Este municipio no tiene fiestas locales en días de clase de este curso, o aún no se han publicado.";
      }
    }
    bindPlace(root, apply);
    apply();
  }
  function renderSchool(root, S) {
    var es = !!root.getAttribute("data-cfg");
    var t = todayIso(), tm = iso(add(parse(t), 1)), FD = new Intl.DateTimeFormat(es ? "es-ES" : "es-MX", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });
    function card(label, s) {
      var st = schoolStatus(S, s), yes = st.classes;
      var why = yes ? "Día normal de clases" : st.kind === "vac" ? esc(st.name) + " (hasta el " + FD.format(parse(st.until)) + ")" : esc(st.name);
      return '<div class="sheet' + (yes ? " is-work" : "") + '"><div class="sheet-head">' + label + '</div><div class="sheet-body"><div class="sheet-day" >' + (yes ? "Sí" : "No") +
        '</div><div class="sheet-week" style="text-transform:none">' + cap(FD.format(parse(s))) + '</div><div class="sheet-name">' + (yes ? "Hay clases" : "No hay clases") + '</div><div class="sheet-count">' + why + "</div></div></div>";
    }
    var big = root.querySelector("[data-days]");
    if (big) big.innerHTML = card("Hoy", t) + card("Mañana", tm);
    var list = root.querySelector("[data-next]");
    if (list) {
      var nx = schoolNextOff(S, tm, +(list.getAttribute("data-next") || 6));
      list.innerHTML = nx.map(function (x) {
        var st = x[1], tag = st.kind === "vac" ? '<span class="tag" style="background:var(--green-soft);color:var(--green)">Vacaciones</span>' : st.kind === "cte" ? '<span class="tag" style="background:var(--blue-soft);color:var(--blue)">' + (es ? "No lectivo" : "Consejo Técnico") + "</span>" : st.kind === "nl" ? '<span class="tag" style="background:var(--blue-soft);color:var(--blue)">No lectivo</span>' : '<span class="tag nac">' + (es ? "Festivo" : "Suspensión oficial") + "</span>";
        var n = daysBetween(parse(t), parse(x[0]));
        return "<li><strong>" + FD.format(parse(x[0])) + (st.kind === "vac" ? " al " + FD.format(parse(st.until)) : "") + "</strong>: " + esc(st.name) + " " + tag + ' <span class="muted small">(en ' + n + (n === 1 ? " día" : " días") + ")</span></li>";
      }).join("") || "<li>No quedan días sin clases en este ciclo.</li>";
    }
    var cd = root.querySelector("[data-countdown]");
    if (cd) {
      var nextVac = S.vac.filter(function (v) { return v[0] > t; })[0], parts = [];
      if (t < S.start) parts.push("Faltan <strong>" + daysBetween(parse(t), parse(S.start)) + " días</strong> para el inicio de clases.");
      if (nextVac) parts.push("Faltan <strong>" + daysBetween(parse(t), parse(nextVac[0])) + " días</strong> para las " + esc(nextVac[2].charAt(0).toLowerCase() + nextVac[2].slice(1)) + ".");
      if (t <= S.end) parts.push("Faltan <strong>" + daysBetween(parse(t), parse(S.end)) + " días</strong> para el último día de clases (" + FD.format(parse(S.end)) + ").");
      if (t > S.end) parts.push("El curso ha terminado.");
      cd.innerHTML = parts.join(" ");
    }
  }


  /* ---------- plazos: trámites frecuentes, sede del organismo, cómputo día a día y calendario ---------- */
  var FSH = new Intl.DateTimeFormat("es-ES", { weekday: "short", day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
  // Une los festivos de dos lugares (art. 30.6 Ley 39/2015: inhábil en uno u otro = inhábil)
  function mergeHol(a, b, note) {
    var o = {}, k, j;
    for (k in a) o[k] = a[k];
    for (k in b) if (!o[k]) { var x = {}; for (j in b[k]) x[j] = b[k][j]; x.name = b[k].name + (note || ""); o[k] = x; }
    return o;
  }
  // Días desde el siguiente a «from» hasta «end»: [fecha, nº de día hábil o 0, motivo si no cuenta]
  function computoDays(from, end, reason) {
    var out = [], c = 0;
    for (var d = add(parse(from), 1); iso(d) <= end; d = add(d, 1)) { var r = reason(d); out.push(r ? [iso(d), 0, r] : [iso(d), ++c, ""]); }
    return out;
  }
  function adminReason(hol) {
    return function (d) { var w = dow(d); return w === 0 ? "Domingo" : w === 6 ? "Sábado" : hol[iso(d)] ? hol[iso(d)].name : ""; };
  }
  function judReason(hol, o) {
    return function (d) {
      var r = judInhabil(hol, d, o), w = dow(d);
      if (!r) return "";
      if (w === 0) return "Domingo";
      if (w === 6) return "Sábado";
      if (r === "agosto") return "Agosto (inhábil)";
      if (r === "navidad") return "Del 24 de diciembre al 6 de enero (inhábil)";
      return hol[iso(d)] ? hol[iso(d)].name : "Inhábil";
    };
  }
  function computoHtml(rows) {
    if (!rows.length) return "";
    var max = 200, h = '<details class="computo"><summary>Ver el cómputo día a día</summary><div class="table-wrap"><table><thead><tr><th scope="col">Fecha</th><th scope="col">Cuenta</th></tr></thead><tbody>';
    rows.slice(0, max).forEach(function (r) {
      h += "<tr" + (r[1] ? "" : ' class="muted"') + "><td>" + FSH.format(parse(r[0])) + "</td><td>" + (r[1] ? "Día " + r[1] : "No cuenta: " + esc(r[2])) + "</td></tr>";
    });
    if (rows.length > max) h += '<tr><td colspan="2">… y ' + (rows.length - max) + " días más</td></tr>";
    return h + "</tbody></table></div></details>";
  }
  // Evento de día completo con avisos dos días antes y la víspera
  function icsPlazo(date, title, desc, stamp) {
    var d1 = date.replace(/-/g, ""), d2 = iso(add(parse(date), 1)).replace(/-/g, "");
    var e = function (x) { return String(x).replace(/\\/g, "\\\\").replace(/\r?\n/g, "\\n").replace(/([,;])/g, "\\$1"); };
    var fold = function (l) { var out = []; while (l.length > 60) { out.push(l.slice(0, 60)); l = " " + l.slice(60); } out.push(l); return out.join("\r\n"); };
    var uid = 0; for (var i = 0; i < title.length; i++) uid = (uid * 31 + title.charCodeAt(i)) >>> 0;
    var alarm = function (t) { return ["BEGIN:VALARM", "ACTION:DISPLAY", "DESCRIPTION:" + e(title), "TRIGGER:" + t, "END:VALARM"]; };
    return ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Calendario Habil//Plazos//ES", "CALSCALE:GREGORIAN", "METHOD:PUBLISH", "BEGIN:VEVENT",
      "UID:plazo-" + d1 + "-" + uid.toString(36) + "@calendariohabil.com", "DTSTAMP:" + stamp, "DTSTART;VALUE=DATE:" + d1, "DTEND;VALUE=DATE:" + d2,
      "SUMMARY:" + e(title), "DESCRIPTION:" + e(desc), "TRANSP:TRANSPARENT"].concat(alarm("-P2D"), alarm("-PT15H"), ["END:VEVENT", "END:VCALENDAR"]).map(fold).join("\r\n") + "\r\n";
  }
  function calBar(date, title, desc) {
    var stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d+/, "");
    var ics = icsPlazo(date, title, desc, stamp), d1 = date.replace(/-/g, ""), d2 = iso(add(parse(date), 1)).replace(/-/g, "");
    var g = "https://calendar.google.com/calendar/render?action=TEMPLATE&text=" + encodeURIComponent(title) + "&dates=" + d1 + "/" + d2 + "&details=" + encodeURIComponent(desc);
    return '<div class="subscribe"><a class="btn alt" href="data:text/calendar;charset=utf-8,' + encodeURIComponent(ics) + '" download="plazo-' + date + '.ics">Añadir a mi calendario (.ics)</a><a class="btn alt" href="' + g + '" target="_blank" rel="noopener">Google Calendar</a></div>' +
      '<p class="hint">Se guarda como evento de ese día, con aviso dos días antes y la víspera.</p>';
  }
  function tramiteLabel(root) {
    var sel = root.querySelector('[name="tramite"]'), o = sel && sel.options[sel.selectedIndex];
    return o && o.value ? o.textContent.replace(/\s*\(.*\)\s*$/, "") : "";
  }
  function bindTramite(root) {
    var sel = root.querySelector('[name="tramite"]'); if (!sel) return;
    var n = root.querySelector('[name="n"]');
    function opt() { return sel.options[sel.selectedIndex]; }
    sel.addEventListener("change", function () {
      var o = opt(); if (!o || !o.value) return;
      n.value = o.getAttribute("data-n");
      var u = root.querySelector('[name="unit"][value="' + o.getAttribute("data-unit") + '"]');
      if (u) { u.disabled = false; u.checked = true; }
      var j = o.getAttribute("data-jur"), js = root.querySelector('[name="jur"]');
      if (j && js) { js.value = j; js.dispatchEvent(new Event("change")); }
    });
    // si se cambia a mano la duración, la unidad o la jurisdicción, deja de ser el trámite elegido
    function check() {
      var o = opt(); if (!o || !o.value) return;
      var u = root.querySelector('[name="unit"]:checked'), js = root.querySelector('[name="jur"]');
      if (n.value !== o.getAttribute("data-n") || (u && u.value !== o.getAttribute("data-unit")) || (js && o.getAttribute("data-jur") && js.value !== o.getAttribute("data-jur"))) sel.value = "";
    }
    n.addEventListener("input", check);
    root.querySelectorAll('[name="unit"], [name="jur"]').forEach(function (x) { x.addEventListener("change", check); });
  }
  // Segundo lugar: sede del organismo (selects ccaa2/place2, sin guardar preferencia)
  function bindSede(root) {
    var box = root.querySelector("[data-sede]"), chk = root.querySelector('[name="otro"]');
    if (!box || !chk) return;
    var c = box.querySelector('[name="ccaa2"]'), p = box.querySelector('[name="place2"]');
    DATA.es.ccaa.forEach(function (x) { var o = document.createElement("option"); o.value = x.slug; o.textContent = x.name; c.appendChild(o); });
    c.addEventListener("change", function () { fillPlaces(c, p); });
    fillPlaces(c, p);
    function sync() { box.hidden = !chk.checked; }
    chk.addEventListener("change", sync); sync();
  }


  /* ---------- permiso por nacimiento (art. 48.4 ET, RDL 9/2025) y lactancia acumulada (art. 37.4 ET) ---------- */
  function plusMonths(d, k) { var y = d.getUTCFullYear(), mo = d.getUTCMonth() + k, dd = d.getUTCDate(), last = new Date(Date.UTC(y, mo + 1, 0)).getUTCDate(); return new Date(Date.UTC(y, mo, Math.min(dd, last))); }
  function easter(y) { var a = y % 19, b = Math.floor(y / 100), c = y % 100, d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451), mo = Math.floor((h + l - 7 * m + 114) / 31), da = ((h + l - 7 * m + 114) % 31) + 1; return new Date(Date.UTC(y, mo - 1, da)); }
  // Fuera de los años con datos, solo los festivos nacionales de fecha fija y Viernes Santo
  function withNational(hol, a, b) {
    var o = {}, k, approx = []; for (k in hol) o[k] = hol[k];
    for (var y = +a.slice(0, 4); y <= +b.slice(0, 4); y++) {
      if (y === 2026 || y === 2027) continue;
      approx.push(y);
      ["01-01", "01-06", "05-01", "08-15", "10-12", "11-01", "12-06", "12-08", "12-25"].forEach(function (md) { if (!o[y + "-" + md]) o[y + "-" + md] = { name: "Festivo nacional" }; });
      o[iso(add(easter(y), -2))] = { name: "Viernes Santo" };
    }
    return { hol: o, approx: approx };
  }
  // o: { mono, hijos, disc }
  function calcNacimiento(birth, o) {
    o = o || {};
    var b = parse(birth), oblig = 6, flex = o.mono ? 22 : 11, hasta8 = o.mono ? 4 : 2;
    var extra = (Math.max(0, (o.hijos || 1) - 1) + (o.disc ? 1 : 0)) * (o.mono ? 2 : 1);
    return { oblig: oblig, flex: flex + extra, extra: extra, hasta8: hasta8, total: oblig + flex + extra + hasta8,
      finOblig: iso(add(b, oblig * 7 - 1)), finSeguido: iso(add(b, (oblig + flex + extra) * 7 - 1)), vuelta: iso(add(b, (oblig + flex + extra) * 7)),
      limite12: iso(add(plusMonths(b, 12), -1)), limite8: iso(add(plusMonths(b, 96), -1)) };
  }
  // Una hora por cada día laborable desde la vuelta hasta el día antes de cumplir 9 meses, convertida en jornadas
  // o: { horas (jornada diaria), sat (trabaja sábados), vac (días de vacaciones en ese periodo), hijos }
  function calcLactancia(hol, desde, birth, o) {
    var fin = iso(add(plusMonths(parse(birth), 9), -1)), dias = 0;
    for (var d = parse(desde); iso(d) <= fin; d = add(d, 1)) if (isWorking(d, hol, o.sat)) dias++;
    dias = Math.max(0, dias - (o.vac || 0));
    var horas = dias * Math.max(1, o.hijos || 1), jornadas = o.horas > 0 ? horas / o.horas : 0;
    // si se encadena: primer día de trabajo tras disfrutar las jornadas completas
    var n = Math.floor(jornadas + 1e-9), x = parse(desde), c = 0, ultimo = null;
    while (c < n) { if (isWorking(x, hol, o.sat)) { c++; ultimo = iso(x); } x = add(x, 1); }
    while (!isWorking(x, hol, o.sat)) x = add(x, 1);
    return { fin: fin, dias: dias, horas: horas, jornadas: jornadas, completas: n, ultimo: ultimo, vuelta: n ? iso(x) : desde };
  }
  function toolNacimiento(root) {
    var form = root.querySelector("form"), res = root.querySelector(".result");
    var birth = root.querySelector('[name="nac"]'), vuelta = root.querySelector('[name="vuelta"]'), otra = root.querySelector("[data-otra]");
    if (!birth.value) birth.value = todayIso();
    bindPlace(root, function () {});
    function sync() { var m = form.querySelector('[name="modo"]:checked'); otra.hidden = !m || m.value !== "otra"; }
    form.querySelectorAll('[name="modo"]').forEach(function (r) { r.addEventListener("change", sync); }); sync();
    var NF = function (x) { return x.toLocaleString("es-ES", { maximumFractionDigits: 1 }); };
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var b = birth.value, hijos = parseInt(root.querySelector('[name="hijos"]').value, 10) || 1;
      var o = { mono: root.querySelector('[name="familia"]:checked').value === "mono", hijos: hijos, disc: root.querySelector('[name="disc"]').checked };
      var horas = parseFloat(String(root.querySelector('[name="horas"]').value).replace(",", "."));
      var lo = { horas: horas, sat: root.querySelector('[name="sat"]').checked, vac: parseInt(root.querySelector('[name="vac"]').value, 10) || 0, hijos: hijos };
      res.hidden = false; res.classList.remove("warn");
      if (!b || b < "2025-07-31" || b > "2027-12-31") { res.classList.add("warn"); res.innerHTML = "Indica una fecha de nacimiento entre el 31 de julio de 2025 (entrada en vigor de las 19 semanas) y el 31 de diciembre de 2027."; return; }
      if (!(horas > 0 && horas <= 12)) { res.classList.add("warn"); res.innerHTML = "Indica tu jornada diaria en horas (por ejemplo, 8 o 7,5)."; return; }
      var r = calcNacimiento(b, o), modo = form.querySelector('[name="modo"]:checked').value;
      var desde = modo === "otra" && vuelta.value ? vuelta.value : r.vuelta;
      var fin9 = iso(add(plusMonths(parse(b), 9), -1));
      var h = '<div class="hint">Permiso por nacimiento y cuidado</div><div class="big">' + r.total + " semanas</div><ul>";
      h += "<li><strong>" + r.oblig + " semanas obligatorias</strong> justo después del parto, a jornada completa: hasta el " + long(parse(r.finOblig)) + ".</li>";
      h += "<li><strong>" + r.flex + " semanas</strong>" + (r.extra ? " (incluidas " + r.extra + " por parto múltiple o discapacidad)" : "") + " seguidas o por semanas, a jornada completa o parcial, antes de que cumpla 12 meses (" + long(parse(r.limite12)) + "). Si las encadenas, el permiso acaba el " + long(parse(r.finSeguido)) + " y <strong>vuelves el " + long(parse(r.vuelta)) + "</strong>.</li>";
      h += "<li><strong>" + r.hasta8 + " semanas más</strong> que puedes guardar hasta que cumpla 8 años (" + long(parse(r.limite8)) + ").</li></ul>";
      if (desde > fin9) { h += "<p>Vuelves después de que cumpla 9 meses, así que no queda permiso de lactancia que acumular.</p>"; }
      else {
        var w = withNational(esHolidays(root.querySelector('[name="ccaa"]').value, root.querySelector('[name="place"]').value), desde, fin9);
        var L = calcLactancia(w.hol, desde, b, lo);
        h += '<div class="hint" style="margin-top:18px">Lactancia acumulada en jornadas completas</div><div class="big">' + NF(L.jornadas) + " días</div>";
        h += "<p>Del " + long(parse(desde)) + " al " + long(parse(L.fin)) + " (el día antes de que cumpla 9 meses) trabajarías " + L.dias + " días" + (lo.vac ? " (ya descontados " + lo.vac + " de vacaciones)" : "") + ". Son " + NF(L.horas) + " horas de lactancia" + (hijos > 1 ? " (una hora por día y por cada hijo)" : " (una hora por día)") + " ÷ " + NF(horas) + " horas de jornada = <strong>" + NF(L.jornadas) + " jornadas</strong>.</p>";
        if (L.completas) h += "<p>Si las encadenas al permiso, disfrutas " + L.completas + " días completos hasta el " + long(parse(L.ultimo)) + " y <strong>vuelves al trabajo el " + long(parse(L.vuelta)) + "</strong>.</p>";
        h += '<p class="hint">La ley no dice cómo redondear la fracción: lo fija tu convenio o el acuerdo con la empresa. Si los dos progenitores la disfrutan con la misma duración y régimen, se puede ampliar hasta los 12 meses, con reducción proporcional del salario desde los 9.</p>';
        if (w.approx.length) h += '<p class="hint">Los festivos autonómicos y locales de ' + w.approx.join(" y ") + " aún no están en la web: para esos meses solo hemos descontado los fines de semana y los festivos nacionales.</p>";
        h += calBar(L.completas ? L.vuelta : desde, "Vuelta al trabajo", "Fin del permiso por nacimiento" + (L.completas ? " y de la lactancia acumulada" : "") + ". Calculado en calendariohabil.com (orientativo).");
      }
      if (!root.querySelector('[name="place"]').value) h += '<p class="hint">Elige tu municipio para descontar también las fiestas locales.</p>';
      h += '<p class="hint">Cálculo orientativo según el Estatuto de los Trabajadores. Tu convenio puede mejorarlo; confirma las fechas con tu empresa y la Seguridad Social.</p>';
      res.innerHTML = h; res.focus();
    });
  }


  /* ---------- indemnización por despido (ET arts. 49, 53, 56 y DT 11.ª), finiquito y duración del paro (LGSS art. 269) ---------- */
  // Meses entre a y b (ambos incluidos); la fracción de mes cuenta como mes completo
  function mesesTrabajo(a, b) {
    var A = parse(a), E = add(parse(b), 1);
    var m = (E.getUTCFullYear() - A.getUTCFullYear()) * 12 + E.getUTCMonth() - A.getUTCMonth();
    if (plusMonths(A, m) > E) m--;
    if (plusMonths(A, m) < E) m++;
    return Math.max(0, m);
  }
  var REFORMA_2012 = "2012-02-12";
  // tipo: improcedente | objetivo | temporal
  function calcIndemnizacion(inicio, fin, anual, tipo) {
    var diario = anual / 365, r = { diario: diario, meses: mesesTrabajo(inicio, fin), tramos: [], tope: "" }, dias;
    if (tipo === "improcedente") {
      if (inicio < REFORMA_2012) {
        var m1 = mesesTrabajo(inicio, iso(add(parse(REFORMA_2012), -1))), m2 = fin >= REFORMA_2012 ? mesesTrabajo(REFORMA_2012, fin) : 0;
        var d1 = 45 * m1 / 12, d2 = 33 * m2 / 12;
        r.tramos = [["Hasta el 11 de febrero de 2012 (45 días por año)", m1, d1], ["Desde el 12 de febrero de 2012 (33 días por año)", m2, d2]];
        if (d1 > 720) { dias = Math.min(d1, 1260); r.tope = d1 > 1260 ? "Tope de 42 mensualidades" : "Se mantiene lo generado antes de 2012 (más de 720 días)"; }
        else { dias = Math.min(d1 + d2, 720); if (d1 + d2 > 720) r.tope = "Tope de 720 días (24 mensualidades)"; }
      } else {
        dias = 33 * r.meses / 12; r.tramos = [["33 días por año", r.meses, dias]];
        if (dias > 720) { dias = 720; r.tope = "Tope de 24 mensualidades"; }
      }
    } else if (tipo === "objetivo") {
      dias = 20 * r.meses / 12; r.tramos = [["20 días por año", r.meses, dias]];
      if (dias > 360) { dias = 360; r.tope = "Tope de 12 mensualidades"; }
    } else {
      dias = 12 * r.meses / 12; r.tramos = [["12 días por año", r.meses, dias]];
    }
    r.dias = dias; r.importe = dias * diario;
    return r;
  }
  // o: { anual, pagas: "14"|"12"|"prorr", devengo: "semestral"|"anual", inicio, fin, vac (días pendientes), vacUnidad, tipo }
  function calcFiniquito(o) {
    var f = parse(o.fin), y = f.getUTCFullYear(), mensual = o.pagas === "14" ? o.anual / 14 : o.anual / 12, diario = o.anual / 365, it = [];
    var dm = Math.min(f.getUTCDate(), 30);
    it.push(["Salario de " + (dm === 1 ? "1 día" : dm + " días") + " del último mes", mensual * dm / 30]);
    var vd = o.vac || 0;
    if (vd > 0) it.push(["Vacaciones no disfrutadas (" + String(Math.round(vd * 100) / 100).replace(".", ",") + " días " + (o.vacUnidad === "laborables" ? "laborables" : "naturales") + ")", vd * diario * (o.vacUnidad === "laborables" ? 30 / 22 : 1)]);
    if (o.pagas === "14") {
      var since = function (start) { var s0 = o.inicio && o.inicio > start ? o.inicio : start; return Math.max(0, daysBetween(parse(s0), f) + 1); };
      if (o.devengo === "anual") {
        var jul = f.getUTCMonth() >= 6 ? y + "-07-01" : (y - 1) + "-07-01";
        it.push(["Parte proporcional de la paga de verano", mensual * since(jul) / 365]);
        it.push(["Parte proporcional de la paga de Navidad", mensual * since(y + "-01-01") / 365]);
      } else {
        var h1 = f.getUTCMonth() < 6, st = h1 ? y + "-01-01" : y + "-07-01", len = h1 ? daysBetween(parse(y + "-01-01"), parse(y + "-06-30")) + 1 : 184;
        it.push([h1 ? "Parte proporcional de la paga de verano" : "Parte proporcional de la paga de Navidad", mensual * Math.min(since(st), len) / len]);
      }
    }
    var ind = null;
    if (o.tipo && o.tipo !== "ninguna" && o.inicio) { ind = calcIndemnizacion(o.inicio, o.fin, o.anual, o.tipo); it.push(["Indemnización (" + String(Math.round(ind.dias * 100) / 100).replace(".", ",") + " días de salario)", ind.importe]); }
    var total = 0; it.forEach(function (x) { total += x[1]; });
    return { items: it, total: total, mensual: mensual, diario: diario, ind: ind };
  }
  // Prestación contributiva: días cotizados en los últimos 6 años -> días de paro (LGSS art. 269)
  var PARO_TABLA = [[360, 120], [540, 180], [720, 240], [900, 300], [1080, 360], [1260, 420], [1440, 480], [1620, 540], [1800, 600], [1980, 660], [2160, 720]];
  function duracionParo(cotizados) {
    var d = 0; PARO_TABLA.forEach(function (t) { if (cotizados >= t[0]) d = t[1]; });
    return d;
  }
  var EUR = function (x) { return x.toLocaleString("es-ES", { style: "currency", currency: "EUR", maximumFractionDigits: 2 }); };
  var N2 = function (x) { return (Math.round(x * 100) / 100).toLocaleString("es-ES"); };
  function toolDespido(root) {
    var form = root.querySelector("form"), res = root.querySelector(".result");
    var fin = root.querySelector('[name="fin"]'); if (!fin.value) fin.value = todayIso();
    var finq = root.getAttribute("data-mode") === "finiquito";
    function sync() { var p = root.querySelector('[name="pagas"]'), d = root.querySelector("[data-devengo]"); if (p && d) d.hidden = p.value !== "14"; }
    var ps = root.querySelector('[name="pagas"]'); if (ps) ps.addEventListener("change", sync); sync();
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var inicio = root.querySelector('[name="inicio"]').value, f = fin.value, anual = parseFloat(root.querySelector('[name="anual"]').value);
      var tipo = root.querySelector('[name="tipo"]').value;
      res.hidden = false; res.classList.remove("warn");
      if (!f || !(anual > 0) || (!finq && !inicio) || (inicio && inicio > f)) { res.classList.add("warn"); res.innerHTML = "Indica el salario bruto anual y las fechas de inicio y fin (la de fin no puede ser anterior)."; return; }
      var h = "";
      if (!finq) {
        var r = calcIndemnizacion(inicio, f, anual, tipo);
        h += '<div class="hint">Indemnización bruta</div><div class="big">' + EUR(r.importe) + "</div>";
        h += "<p>" + N2(r.dias) + " días de salario × " + EUR(r.diario) + " al día (salario anual ÷ 365). Antigüedad: " + r.meses + " meses (las fracciones de mes cuentan como mes completo).</p>";
        if (r.tramos.length > 1) h += "<ul>" + r.tramos.map(function (t) { return "<li>" + t[0] + ": " + t[1] + " meses → " + N2(t[2]) + " días</li>"; }).join("") + "</ul>";
        if (r.tope) h += "<p><strong>" + r.tope + ".</strong></p>";
        h += '<p class="hint">' + (tipo === "improcedente" ? "Si el despido es improcedente, la empresa puede elegir entre readmitirte o pagar esta indemnización." : tipo === "objetivo" ? "En el despido objetivo la empresa debe poner la indemnización a tu disposición al entregarte la carta." : "Al terminar un contrato temporal te corresponden 12 días por año trabajado (no se aplica a los de interinidad ni formativos).") + " La indemnización por despido está exenta de IRPF hasta el importe obligatorio.</p>";
      } else {
        var o = { anual: anual, pagas: root.querySelector('[name="pagas"]').value, devengo: root.querySelector('[name="devengo"]').value, inicio: inicio, fin: f,
          vac: parseFloat(String(root.querySelector('[name="vac"]').value).replace(",", ".")) || 0, vacUnidad: root.querySelector('[name="vacu"]').value, tipo: tipo };
        if (tipo !== "ninguna" && !inicio) { res.classList.add("warn"); res.innerHTML = "Para calcular la indemnización necesitamos la fecha de inicio del contrato."; return; }
        var q = calcFiniquito(o);
        h += '<div class="hint">Finiquito bruto aproximado</div><div class="big">' + EUR(q.total) + '</div><div class="table-wrap"><table><tbody>' +
          q.items.map(function (x) { return "<tr><td>" + x[0] + "</td><td>" + EUR(x[1]) + "</td></tr>"; }).join("") + "<tr><td><strong>Total bruto</strong></td><td><strong>" + EUR(q.total) + "</strong></td></tr></tbody></table></div>";
        h += '<p class="hint">Importes brutos: del salario, las vacaciones y las pagas se descuentan IRPF y cotizaciones. Salario mensual usado: ' + EUR(q.mensual) + ". Tu convenio puede fijar otras fechas de devengo de las pagas.</p>";
      }
      h += '<p class="hint">Cálculo orientativo según el Estatuto de los Trabajadores. Para un caso concreto, consulta con un graduado social, un abogado o tu sindicato.</p>';
      res.innerHTML = h; res.focus();
    });
  }
  function toolParo(root) {
    var form = root.querySelector("form"), res = root.querySelector(".result"), ini = root.querySelector('[name="desde"]');
    if (!ini.value) ini.value = todayIso();
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var modo = root.querySelector('[name="unidad"]').value, v = parseFloat(String(root.querySelector('[name="cot"]').value).replace(",", "."));
      res.hidden = false; res.classList.remove("warn");
      if (!(v >= 0)) { res.classList.add("warn"); res.innerHTML = "Indica cuánto has cotizado en los últimos 6 años."; return; }
      var dias = Math.round(modo === "anos" ? v * 365 : modo === "meses" ? v * 30 : v), d = duracionParo(dias), h;
      if (!d) h = '<div class="big">Sin prestación contributiva</div><p>Con ' + dias + " días cotizados no llegas al mínimo de 360 días en los últimos 6 años. Puede que tengas derecho a un subsidio por desempleo: consúltalo en el SEPE.</p>";
      else {
        var desde = ini.value, hasta = iso(add(parse(desde), d - 1));
        h = '<div class="hint">Te corresponden</div><div class="big">' + d + " días de paro</div><p>Son " + (d / 30) + " meses. Si empiezas a cobrarlo el " + long(parse(desde)) + ", la prestación termina el <strong>" + long(parse(hasta)) + "</strong>.</p>";
        var next = PARO_TABLA.filter(function (t) { return t[0] > dias; })[0];
        if (next) h += '<p class="hint">Con ' + (next[0] - dias) + " días más cotizados pasarías a " + next[1] + " días de paro.</p>";
        h += calBar(hasta, "Fin de la prestación por desempleo", "Último día de paro (" + d + " días). Calculado en calendariohabil.com (orientativo).");
      }
      h += '<p class="hint">Cuentan los días cotizados en los últimos 6 años que no se usaron para un paro anterior. Cálculo orientativo: el SEPE te dirá la duración exacta al reconocer la prestación.</p>';
      res.innerHTML = h; res.focus();
    });
  }


  /* ---------- edad de jubilación (LGSS art. 205.1.a y DT 7.ª; anticipada: arts. 207 y 208) ---------- */
  // [año, meses cotizados para jubilarse a los 65, edad en meses si no se llega]
  var JUB = [[2013, 423, 781], [2014, 426, 782], [2015, 429, 783], [2016, 432, 784], [2017, 435, 785], [2018, 438, 786], [2019, 441, 788], [2020, 444, 790],
    [2021, 447, 792], [2022, 450, 794], [2023, 453, 796], [2024, 456, 798], [2025, 459, 800], [2026, 459, 802], [2027, 462, 804]];
  function jubRow(y) { return JUB[Math.min(Math.max(y, 2013), 2027) - 2013]; }
  function edadTxt(m) { var a = Math.floor(m / 12), r = m % 12; return a + " años" + (r ? " y " + r + (r === 1 ? " mes" : " meses") : ""); }
  // cot: meses cotizados hasta «hoy»; sigue: si seguirá cotizando hasta jubilarse
  function calcJubilacion(birth, cot, hoy, sigue) {
    var B = parse(birth), H = parse(hoy);
    // meses completos cotizados desde hoy hasta t (sin redondear hacia arriba)
    var full = function (t) { var m = (t.getUTCFullYear() - H.getUTCFullYear()) * 12 + t.getUTCMonth() - H.getUTCMonth(); if (plusMonths(H, m) > t) m--; return Math.max(0, m); };
    var cotAt = function (t) { return cot + (sigue && t > H ? full(t) : 0); };
    var ord = null, ordM = 0, por65 = false;
    for (var m = 780; m <= 804; m++) {
      var t = plusMonths(B, m), row = jubRow(t.getUTCFullYear());
      if (cotAt(t) >= row[1]) { ord = t; ordM = m; por65 = true; break; }
      if (m >= row[2]) { ord = t; ordM = m; break; }
    }
    var antic = function (meses, minCot) {
      for (var k = ordM - meses; k < ordM; k++) { var t2 = plusMonths(B, k); if (cotAt(t2) >= minCot) return { fecha: iso(t2), edad: k }; }
      return null;
    };
    return { fecha: iso(ord), edad: ordM, por65: por65, cotJub: cotAt(ord), req: jubRow(ord.getUTCFullYear())[1],
      voluntaria: antic(24, 420), involuntaria: antic(48, 396) };
  }
  function toolJubilacion(root) {
    var form = root.querySelector("form"), res = root.querySelector(".result");
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var b = root.querySelector('[name="nac"]').value, a = parseInt(root.querySelector('[name="anos"]').value, 10) || 0, me = parseInt(root.querySelector('[name="meses"]').value, 10) || 0;
      var sigue = root.querySelector('[name="sigue"]').checked, hoy = todayIso();
      res.hidden = false; res.classList.remove("warn");
      if (!b || b < "1958-01-01" || b > "1995-12-31") { res.classList.add("warn"); res.innerHTML = "Indica una fecha de nacimiento entre 1958 y 1995."; return; }
      if (a < 0 || a > 55 || me < 0 || me > 11) { res.classList.add("warn"); res.innerHTML = "Revisa los años y meses cotizados."; return; }
      var r = calcJubilacion(b, a * 12 + me, hoy, sigue);
      var h = '<div class="hint">Llegas a tu edad ordinaria de jubilación el</div><div class="big">' + long(parse(r.fecha)) + "</div>";
      h += "<p>A los <strong>" + edadTxt(r.edad) + "</strong>" + (r.por65 ? ", porque llegarás con " + edadTxt(r.cotJub) + " cotizados y en " + r.fecha.slice(0, 4) + " bastan " + edadTxt(r.req) + "." : ": en " + r.fecha.slice(0, 4) + " hacen falta " + edadTxt(r.req) + " cotizados para jubilarse a los 65 y tendrás " + edadTxt(r.cotJub) + ".") + "</p>";
      if (r.fecha <= hoy) h += "<p><strong>Ya has alcanzado tu edad ordinaria de jubilación.</strong></p>";
      h += "<ul>";
      h += "<li><strong>Anticipada voluntaria</strong> (hasta 2 años antes, con 35 años cotizados y una pensión de al menos la mínima): " + (r.voluntaria ? "desde el " + long(parse(r.voluntaria.fecha)) + ", a los " + edadTxt(r.voluntaria.edad) + (r.voluntaria.fecha <= hoy ? " (ya cumples la edad)" : "") + "." : "no llegarías a los 35 años cotizados antes de tu edad ordinaria.") + "</li>";
      h += "<li><strong>Anticipada involuntaria</strong> (por despido u otra causa ajena, hasta 4 años antes, con 33 años cotizados): " + (r.involuntaria ? "desde el " + long(parse(r.involuntaria.fecha)) + ", a los " + edadTxt(r.involuntaria.edad) + (r.involuntaria.fecha <= hoy ? " (ya cumples la edad)" : "") + "." : "no llegarías a los 33 años cotizados antes de tu edad ordinaria.") + "</li>";
      h += "</ul>";
      h += '<p class="hint">La jubilación anticipada reduce la pensión según los meses de adelanto. ' + (sigue ? "Suponemos que sigues cotizando sin interrupciones hasta la jubilación." : "Suponemos que no vas a cotizar más.") + " Para tu caso exacto, pide un informe de vida laboral y una simulación en la sede de la Seguridad Social.</p>";
      h += calBar(r.fecha, "Edad ordinaria de jubilación", "Fecha a partir de la cual puedes jubilarte con la edad ordinaria (" + edadTxt(r.edad) + "). Calculado en calendariohabil.com (orientativo).");
      res.innerHTML = h; res.focus();
    });
  }


  /* ---------- devoluciones: desistimiento en compras a distancia (TRLGDCU arts. 71, 102-108) y garantía (art. 120) ---------- */
  function calcDevolucion(entrega) {
    var e = parse(entrega);
    return { desistir: iso(add(e, 14)), sinInfo: iso(add(plusMonths(e, 12), 14)), garantia: iso(add(plusMonths(e, 36), -1)), presuncion: iso(add(plusMonths(e, 24), -1)) };
  }
  function toolDevolucion(root) {
    var form = root.querySelector("form"), res = root.querySelector(".result"), ent = root.querySelector('[name="entrega"]');
    if (!ent.value) ent.value = todayIso();
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var en = ent.value, online = root.querySelector('[name="canal"]:checked').value === "online";
      res.hidden = false; res.classList.remove("warn");
      if (!en) { res.classList.add("warn"); res.innerHTML = "Indica la fecha en que recibiste el producto."; return; }
      var r = calcDevolucion(en), h = "";
      if (online) {
        h += '<div class="hint">Puedes devolverlo sin dar explicaciones hasta el</div><div class="big">' + long(parse(r.desistir)) + "</div>";
        h += "<p>Son 14 días naturales desde que lo recibiste (" + long(parse(en)) + "). Basta con comunicar a la tienda que desistes dentro del plazo; luego tienes otros 14 días para enviar el producto. La tienda debe devolverte el dinero en 14 días desde que se lo comunicas, aunque puede esperar a recibir el producto.</p>";
        h += '<p class="hint">Si la tienda no te informó del derecho de desistimiento, el plazo se amplía 12 meses (hasta el ' + long(parse(r.sinInfo)) + "). Si el último día es festivo o fin de semana, no apures: comunícalo antes.</p>";
      } else {
        h += '<div class="big">En tienda física no hay derecho legal a devolver</div><p>Solo puedes devolver algo que funciona bien si la tienda lo ofrece: mira su política (suele estar en el ticket o en un cartel). Muchas amplían el plazo para las compras de Navidad.</p>';
      }
      h += "<p><strong>Garantía:</strong> si el producto falla o no es como se anunciaba, tienes 3 años de garantía desde la entrega (hasta el " + long(parse(r.garantia)) + "; 2 años en contenidos y servicios digitales). Si el fallo aparece antes del " + long(parse(r.presuncion)) + ", se presume que ya venía de fábrica.</p>";
      if (online) h += calBar(r.desistir, "Último día para devolver la compra", "Último día del plazo de desistimiento (14 días naturales desde la entrega). Calculado en calendariohabil.com (orientativo).");
      res.innerHTML = h; res.focus();
    });
  }


  /* ---------- días laborables y jornada anual ---------- */
  // o: { sat (se trabaja el sábado), horas (por día), vac (días laborables de vacaciones), anual (jornada anual del convenio, opcional) }
  function calcLaborables(hol, year, o) {
    var meses = [], tot = 0, fest = 0;
    for (var m = 0; m < 12; m++) {
      var lab = 0, f = 0, d = new Date(Date.UTC(year, m, 1));
      while (d.getUTCMonth() === m) {
        var w = dow(d), habil = w !== 0 && (w !== 6 || o.sat);
        if (habil) { if (hol[iso(d)]) f++; else lab++; }
        d = add(d, 1);
      }
      meses.push([lab, f]); tot += lab; fest += f;
    }
    var efectivos = Math.max(0, tot - (o.vac || 0)), horas = efectivos * (o.horas || 0), r = { meses: meses, laborables: tot, festivos: fest, efectivos: efectivos, horas: horas };
    // exceso de jornada: horas de calendario por encima de la jornada anual del convenio (negativo si faltan)
    if (o.anual > 0) { r.excesoHoras = horas - o.anual; r.excesoDias = o.horas > 0 ? r.excesoHoras / o.horas : 0; }
    return r;
  }
  function toolLaborables(root) {
    var form = root.querySelector("form"), res = root.querySelector(".result"), year = +(root.getAttribute("data-year") || 2027);
    var MES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
    bindPlace(root, function () {});
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var hol = esHolidays(root.querySelector('[name="ccaa"]').value, root.querySelector('[name="place"]').value);
      var sem = parseFloat(String(root.querySelector('[name="semana"]').value).replace(",", ".")), sat = root.querySelector('[name="sat"]').checked;
      var vac = parseInt(root.querySelector('[name="vac"]').value, 10) || 0, dpw = sat ? 6 : 5;
      var anual = parseFloat(String(root.querySelector('[name="anual"]').value).replace(",", ".")) || 0;
      res.hidden = false; res.classList.remove("warn");
      if (!(sem > 0 && sem <= 60)) { res.classList.add("warn"); res.innerHTML = "Indica tus horas semanales (por ejemplo, 40)."; return; }
      if (anual && !(anual >= 500 && anual <= 3000)) { res.classList.add("warn"); res.innerHTML = "Indica la jornada anual de tu convenio en horas (por ejemplo, 1752) o déjala en blanco."; return; }
      var r = calcLaborables(hol, year, { sat: sat, horas: sem / dpw, vac: vac, anual: anual }), N1 = function (x) { return x.toLocaleString("es-ES", { maximumFractionDigits: 1 }); };
      var h = '<div class="hint">En ' + year + " tienes</div><div class=\"big\">" + r.laborables + " días laborables</div>";
      h += "<p>De " + (sat ? "lunes a sábado" : "lunes a viernes") + ", sin contar los " + r.festivos + " festivos que caen en día de trabajo. Restando " + vac + " días de vacaciones, trabajas <strong>" + r.efectivos + " días</strong>: unas <strong>" + N1(r.horas) + " horas al año</strong> con " + N1(sem) + " horas semanales (" + N1(sem / dpw) + " al día).</p>";
      if (anual) {
        var xd = Math.abs(r.excesoDias), xh = Math.abs(r.excesoHoras);
        if (Math.abs(r.excesoHoras) < 0.05) h += "<p>Con una jornada anual de " + N1(anual) + " horas, tu calendario cuadra justo: no te sobran ni te faltan días.</p>";
        else if (r.excesoHoras > 0) h += "<p>Tu convenio fija " + N1(anual) + " horas al año: te sobran <strong>" + N1(xh) + " horas</strong>, unos <strong>" + N1(xd) + " días de exceso de jornada</strong> de " + N1(sem / dpw) + " horas. Son días que la empresa debe compensar (libranzas, días de ajuste o de libre disposición, según el convenio) o reducir del horario.</p>";
        else h += "<p>Tu convenio fija " + N1(anual) + " horas al año: con este calendario te faltan <strong>" + N1(xh) + " horas</strong>, unos <strong>" + N1(xd) + " días</strong> de " + N1(sem / dpw) + " horas. Revisa tus vacaciones y si tu convenio cuenta otros días como no laborables.</p>";
      }
      h += '<div class="table-wrap"><table><thead><tr><th scope="col">Mes</th><th scope="col">Días laborables</th><th scope="col">Festivos en día laborable</th></tr></thead><tbody>' +
        r.meses.map(function (x, i) { return "<tr><td>" + MES[i] + "</td><td>" + x[0] + "</td><td>" + x[1] + "</td></tr>"; }).join("") + "</tbody></table></div>";
      if (!root.querySelector('[name="place"]').value) h += '<p class="hint">Sin municipio no se cuentan las 2 fiestas locales: elige el tuyo para afinar.</p>';
      h += '<p class="hint">La jornada máxima legal es de 40 horas semanales de promedio en cómputo anual (art. 34 del Estatuto de los Trabajadores); tu convenio puede fijar una jornada anual menor.' + (anual ? '' : ' Escríbela arriba para saber cuántos días de exceso de jornada te sobran o te faltan.') + '</p>';
      res.innerHTML = h; res.focus();
    });
  }

  /* ---------- herramienta: plazos administrativos (Ley 39/2015, art. 30) ---------- */
  function toolPlazos(root) {
    var form = root.querySelector("form"), res = root.querySelector(".result");
    var start = root.querySelector('[name="start"]');
    if (!start.value) start.value = todayIso();
    bindPlace(root, function () {});
    bindTramite(root); bindSede(root);
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var c = root.querySelector('[name="ccaa"]').value, place = root.querySelector('[name="place"]').value;
      var n = parseInt(root.querySelector('[name="n"]').value, 10), unit = form.querySelector('[name="unit"]:checked').value;
      var s = start.value, hol = esHolidays(c, place), skipped = [], end, html = "";
      var otro = root.querySelector('[name="otro"]'), sede = otro && otro.checked;
      if (sede) hol = mergeHol(hol, esHolidays(root.querySelector('[name="ccaa2"]').value, root.querySelector('[name="place2"]').value), " (en la sede del organismo)");
      res.hidden = false; res.classList.remove("warn");
      if (!s || !n || n < 1 || n > 400) { res.classList.add("warn"); res.innerHTML = "Indica una fecha y un número de días entre 1 y 400."; return; }
      if (!inRange(s)) { res.classList.add("warn"); res.innerHTML = "Por ahora la calculadora cubre del " + rangeText() + "."; return; }
      var r = calcPlazo(hol, s, n, unit); end = parse(r.end); skipped = r.skipped;
      if (!inRange(iso(end))) { res.classList.add("warn"); res.innerHTML = "El vencimiento cae fuera del periodo con datos (hasta el 31 de diciembre de 2027)."; return; }
      html += '<div class="hint">El plazo vence el</div><div class="big">' + long(end) + "</div>";
      html += "<p>Cuenta desde el día siguiente a la notificación o publicación (" + long(add(parse(s), 1)) + "). ";
      html += unit === "habiles" ? "Se excluyen sábados, domingos y festivos." : unit === "naturales" ? "Se cuentan todos los días; si el último es inhábil, pasa al siguiente hábil." : "Se computa de fecha a fecha; si el último día es inhábil, pasa al siguiente hábil.";
      html += "</p>";
      if (skipped.length) {
        html += "<p><strong>Festivos que han alargado el plazo:</strong></p><ul>";
        skipped.forEach(function (x) { html += "<li>" + long(parse(x)) + ": " + esc(hol[x].name) + "</li>"; });
        html += "</ul>";
      }
      if (sede) html += "<p>Se han contado como inhábiles los festivos de tu municipio y los de la sede del organismo (art. 30.6).</p>";
      if (unit === "habiles") html += computoHtml(computoDays(s, iso(end), adminReason(hol)));
      var lab = tramiteLabel(root) || "Plazo administrativo";
      html += calBar(iso(end), "Vence: " + lab, lab + ". Notificación: " + long(parse(s)) + ". Vence el " + long(end) + ". Calculado en calendariohabil.com (orientativo: compruébalo en la notificación).");
      if (!place) html += '<p class="hint">No has elegido municipio: no se han tenido en cuenta las fiestas locales.</p>';
      res.innerHTML = html;
      res.focus();
    });
  }

  /* ---------- herramienta: días hábiles (universal) ---------- */
  function toolDias(root) {
    var form = root.querySelector("form"), res = root.querySelector(".result");
    var country = root.querySelector('[name="country"]'), esBox = root.querySelector("[data-es]");
    ["a", "b"].forEach(function (k) { var el = root.querySelector('[name="' + k + '"]'); if (el && !el.value) el.value = k === "a" ? todayIso() : iso(add(parse(todayIso()), 30)); });
    bindPlace(root, function () {});
    var pre = root.getAttribute("data-pais") || new URLSearchParams(location.search).get("pais");
    if (pre && country.querySelector('option[value="' + pre + '"]')) country.value = pre;
    function sync() {
      esBox.hidden = country.value !== "es";
      var mode = form.querySelector('[name="mode"]:checked').value;
      root.querySelector("[data-b]").hidden = mode !== "count";
      root.querySelector("[data-n]").hidden = mode === "count";
    }
    country.addEventListener("change", sync);
    form.querySelectorAll('[name="mode"]').forEach(function (r) { r.addEventListener("change", sync); });
    sync();
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var mode = form.querySelector('[name="mode"]:checked').value, sat = root.querySelector('[name="sat"]').checked;
      var hol = country.value === "none" ? {} : holFor(country.value, root.querySelector('[name="ccaa"]').value, root.querySelector('[name="place"]').value);
      var a = root.querySelector('[name="a"]').value, html = "", skipped = [];
      res.hidden = false; res.classList.remove("warn");
      if (!a) return;
      if (country.value !== "none" && !inRange(a)) { res.classList.add("warn"); res.innerHTML = "Con festivos, la calculadora cubre del " + rangeText() + ". Elige «Solo fines de semana» para otras fechas."; return; }
      if (mode === "count") {
        var b = root.querySelector('[name="b"]').value;
        if (!b) return;
        var r = countHabiles(hol, a, b, sat), da = parse(r.from), db = parse(r.to);
        if (country.value !== "none" && !inRange(r.to)) { res.classList.add("warn"); res.innerHTML = "La fecha final está fuera del periodo con datos."; return; }
        var work = r.work, total = r.total, hc = r.skipped.length; skipped = r.skipped;
        html = '<div class="big">' + work + " días hábiles</div><p>Entre el " + long(da) + " y el " + long(db) + ", ambos incluidos: " + total + " días naturales, " + hc + " festivos en día laborable" + (sat ? "" : " y los fines de semana") + " fuera.</p>";
      } else {
        var n = parseInt(root.querySelector('[name="n"]').value, 10), step = mode === "sub" ? -1 : 1, d2 = parse(a), c2 = 0;
        if (!n || n < 1 || n > 500) { res.classList.add("warn"); res.innerHTML = "Indica un número de días entre 1 y 500."; return; }
        var r2 = shiftHabiles(hol, a, n, step, sat); d2 = parse(r2.end); skipped = r2.skipped;
        if (country.value !== "none" && !inRange(iso(d2))) { res.classList.add("warn"); res.innerHTML = "El resultado cae fuera del periodo con datos."; return; }
        html = '<div class="hint">' + n + " días hábiles " + (step > 0 ? "después" : "antes") + " del " + long(parse(a)) + '</div><div class="big">' + long(d2) + "</div>";
      }
      if (skipped.length) {
        html += "<p><strong>Festivos descontados:</strong></p><ul>";
        skipped.slice(0, 30).forEach(function (x) { html += "<li>" + long(parse(x)) + ": " + esc(hol[x].name) + "</li>"; });
        html += "</ul>";
      }
      res.innerHTML = html;
      res.focus();
    });
  }

  /* ---------- herramienta: permisos retribuidos ---------- */
  var PERMISO_TXT = {
    matrimonio: "15 días naturales (incluyen fines de semana y festivos).",
    familiar: "5 días laborables. Según el Tribunal Supremo (STS 126/2026) puedes empezarlo cualquier día mientras dure la necesidad de cuidado, no necesariamente el día del ingreso.",
    fallecimiento: "2 días, o 4 si necesitas desplazarte. Se cuentan desde el primer día laborable.",
    mudanza: "1 día laborable."
  };
  function toolPermisos(root) {
    var form = root.querySelector("form"), res = root.querySelector(".result"), type = root.querySelector('[name="tipo"]');
    var travel = root.querySelector("[data-travel]"), start = root.querySelector('[name="start"]');
    if (!start.value) start.value = todayIso();
    bindPlace(root, function () {});
    function sync() { travel.hidden = type.value !== "fallecimiento"; root.querySelector("[data-start-label]").textContent = type.value === "familiar" ? "Primer día que quieres coger" : type.value === "matrimonio" ? "Fecha de la boda o del registro" : type.value === "mudanza" ? "Día de la mudanza" : "Fecha del fallecimiento"; }
    type.addEventListener("change", sync); sync();
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var hol = esHolidays(root.querySelector('[name="ccaa"]').value, root.querySelector('[name="place"]').value), s = start.value;
      res.hidden = false; res.classList.remove("warn");
      if (!s) return;
      if (!inRange(s)) { res.classList.add("warn"); res.innerHTML = "Por ahora la calculadora cubre del " + rangeText() + "."; return; }
      var r = calcPermiso(hol, type.value, s, { sat: root.querySelector('[name="sat"]').checked, travel: root.querySelector('[name="travel"]').checked });
      if (!inRange(r.end)) { res.classList.add("warn"); res.innerHTML = "El permiso termina fuera del periodo con datos (hasta el 31 de diciembre de 2027)."; return; }
      var html = '<div class="hint">Tu permiso va del</div><div class="big">' + long(parse(r.start)) + "</div><div class=\"hint\">al</div><div class=\"big\">" + long(parse(r.end)) + "</div>";
      html += "<p>" + PERMISO_TXT[type.value] + (r.start !== s ? " Como el " + long(parse(s)) + " no es laborable para ti, el permiso empieza el siguiente día laborable." : "") + "</p>";
      if (type.value !== "matrimonio") html += "<p><strong>Días de ausencia:</strong> " + r.days.map(function (x) { return long(parse(x)); }).join("; ") + ".</p>";
      if (r.skipped.length) { html += "<p><strong>Festivos que no cuentan:</strong></p><ul>"; r.skipped.forEach(function (x) { html += "<li>" + long(parse(x)) + ": " + esc(hol[x].name) + "</li>"; }); html += "</ul>"; }
      html += '<p class="hint">Es el mínimo del Estatuto de los Trabajadores. Tu convenio colectivo puede darte más días o contarlos de otra forma: revísalo.</p>';
      res.innerHTML = html; res.focus();
    });
  }

  /* ---------- herramienta: horas extra México ---------- */
  function money(x) { return x.toLocaleString("es-MX", { style: "currency", currency: "MXN" }); }
  function toolHoras(root) {
    var form = root.querySelector("form"), res = root.querySelector(".result"), year = root.querySelector('[name="year"]'), pact = root.querySelector('[name="pact"]');
    function legal() { var y = +year.value; return DATA.mx.jornada.filter(function (j) { return j[0] === y; })[0]; }
    function syncPact() { var j = legal(); pact.max = j[1]; if (!pact.value || +pact.value > j[1] || pact.getAttribute("data-auto") === "1") { pact.value = j[1]; pact.setAttribute("data-auto", "1"); } root.querySelector("[data-legal]").textContent = j[1] + " horas"; }
    pact.addEventListener("input", function () { pact.setAttribute("data-auto", "0"); });
    year.addEventListener("change", syncPact);
    syncPact();
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var j = legal(), sal = parseFloat(root.querySelector('[name="sal"]').value), per = root.querySelector('[name="per"]').value;
      var days = parseFloat(root.querySelector('[name="days"]').value), worked = parseFloat(root.querySelector('[name="worked"]').value), p = parseFloat(pact.value);
      res.hidden = false; res.classList.remove("warn");
      if (!(sal > 0) || !(days > 0) || !(worked >= 0) || !(p > 0)) { res.classList.add("warn"); res.innerHTML = "Revisa los datos: salario, días y horas deben ser números positivos."; return; }
      var r = calcHoras(j, sal, per, p, days, worked), daily = r.daily, hourly = r.hourly, extra = r.extra, dbl = r.dbl, tpl = r.tpl, pay = r.pay;
      var html = '<div class="hint">Pago por horas extra esta semana</div><div class="big">' + money(pay) + "</div>";
      html += "<ul><li>Valor de tu hora ordinaria: <strong>" + money(hourly) + "</strong> (salario diario " + money(daily) + " ÷ " + (p / days).toFixed(2) + " h por día)</li>";
      html += "<li>Horas extra: <strong>" + extra.toFixed(1) + "</strong> (trabajaste " + worked + " h; tu jornada es de " + p + " h)</li>";
      html += "<li>" + dbl.toFixed(1) + " h al doble: " + money(dbl * hourly * 2) + "</li>";
      if (tpl > 0) html += "<li>" + tpl.toFixed(1) + " h al triple: " + money(tpl * hourly * 3) + "</li>";
      html += "</ul>";
      if (tpl > 0) html += "<p><strong>Atención:</strong> en " + j[0] + " el máximo de horas extra semanales es de " + j[2] + ". Las que lo superan se pagan al triple y el patrón puede ser sancionado.</p>";
      if (p < j[1]) html += '<p class="hint">Tu jornada pactada es menor que la máxima legal; cuentan como extra las horas que pasan de la pactada.</p>';
      res.innerHTML = html;
      res.focus();
    });
  }

  /* ---------- copiar al portapapeles (widget) ---------- */
  function toolCopy(btn) {
    btn.addEventListener("click", function () {
      var t = document.getElementById(btn.getAttribute("data-copy"));
      try { navigator.clipboard.writeText(t.value || t.textContent); btn.textContent = "Código copiado"; } catch (e) { t.select(); }
    });
  }
  function toolEmbedCode(root) {
    var ccaa = root.querySelector('[name="ccaa"]'), out = root.querySelector("textarea");
    if (!ccaa.options.length) DATA.es.ccaa.forEach(function (c) { var o = document.createElement("option"); o.value = c.slug; o.textContent = c.name; ccaa.appendChild(o); });
    // El enlace va fuera del iframe: el que hay dentro cuenta como de nuestra propia página, no de la web que lo inserta
    function upd() {
      var name = ccaa.options[ccaa.selectedIndex].textContent;
      out.value = '<iframe src="' + DATA.site + '/embed/proximo-festivo/?ccaa=' + ccaa.value + '" title="Próximo festivo" width="320" height="380" style="border:0;max-width:100%" loading="lazy"></iframe>\n' +
        '<p style="font-size:13px;margin:4px 0 0"><a href="' + DATA.site + '/es/festivos-2027/' + ccaa.value + '/">Festivos 2027 en ' + name + '</a> · Calendario Hábil</p>';
    }
    ccaa.addEventListener("change", upd); upd();
  }

  /* ---------- planificador de vacaciones ---------- */
  // Elige qué días laborables pedir para encadenar el máximo de días libres.
  // Ventanas candidatas: de un bloque libre (fin de semana o festivo) a otro, pidiendo los laborables de en medio.
  // Selección: programación dinámica sin solapes con presupuesto de días y, opcionalmente, número máximo de periodos.
  function planVacaciones(hol, from, to, budget, opt) {
    opt = opt || {};
    var sat = !!opt.sat, maxP = opt.periods || 0, B = Math.max(0, Math.min(budget, 60));
    // días del periodo con su condición (true = laborable)
    var days = [], d = parse(from), end = parse(to);
    for (; d <= end; d = add(d, 1)) days.push([iso(d), isWorking(d, hol, sat)]);
    var N = days.length, wins = [];
    // Ventanas [x, y] que merecen la pena: no se pueden alargar gratis, es decir, el día anterior a x
    // y el posterior a y son laborables (o están fuera del periodo), y contienen al menos un día libre.
    // Con opt.bridges solo valen tramos con algún festivo entre semana y al menos 2,5 días libres por día pedido.
    for (var x = 0; x < N; x++) {
      if (x > 0 && !days[x - 1][1]) continue;
      var cost = 0, free = 0, fest = 0;
      for (var y = x; y < N; y++) {
        if (days[y][1]) cost++; else { free++; if (hol[days[y][0]] && dow(parse(days[y][0])) % 6 !== 0) fest++; }
        if (cost > B) break;
        if (!cost || !free || (y < N - 1 && !days[y + 1][1])) continue;
        if (opt.bridges && (!fest || 2 * (y - x + 1) < 5 * cost)) continue;
        wins.push({ a: days[x][0], b: days[y][0], cost: cost, len: y - x + 1 });
      }
    }
    wins.sort(function (p, q) { return p.b < q.b ? -1 : p.b > q.b ? 1 : 0; });
    var n = wins.length, K = maxP, W = B + 1;
    var prev = wins.map(function (w) { var lo = 0, hi = n; while (lo < hi) { var m = (lo + hi) >> 1; if (wins[m].b < w.a) lo = m + 1; else hi = m; } return lo; });
    // f[k][c*W + b]: más días libres con las k primeras ventanas, c periodos (si hay límite) y b días pedidos
    var NEG = -1e9, size = (K + 1) * W, f = new Array(n + 1);
    f[0] = new Array(size).fill(NEG); f[0][0] = 0;
    for (var k = 1; k <= n; k++) {
      var w = wins[k - 1], row = f[k - 1].slice(), pr = f[prev[k - 1]];
      for (var c = K ? 1 : 0; c <= K; c++) {
        var pc = K ? c - 1 : 0;
        for (var bb = w.cost; bb <= B; bb++) {
          var v = pr[pc * W + bb - w.cost];
          if (v > NEG && v + w.len > row[c * W + bb]) row[c * W + bb] = v + w.len;
        }
      }
      f[k] = row;
    }
    // mejor: más días libres; a igualdad, menos días pedidos y menos periodos
    var best = NEG, bc = 0, bu = 0;
    for (c = 0; c <= K; c++) for (bb = 0; bb <= B; bb++) {
      var tot = f[n][c * W + bb];
      if (tot <= NEG) continue;
      var score = tot * 1000 - bb * 10 - c;
      if (score > best) { best = score; bc = c; bu = bb; }
    }
    var chosen = [], kk = n, cc = bc;
    while (kk > 0 && bu > 0) {
      if (f[kk][cc * W + bu] === f[kk - 1][cc * W + bu]) { kk--; continue; }
      var wk = wins[kk - 1]; chosen.unshift(wk); bu -= wk.cost; if (K) cc--; kk = prev[kk - 1];
    }
    var asked = [];
    chosen.forEach(function (w) { for (var z = parse(w.a); z <= parse(w.b); z = add(z, 1)) if (isWorking(z, hol, sat)) asked.push(iso(z)); });
    var total = chosen.reduce(function (sum, w) { return sum + w.len; }, 0);
    return { periods: chosen, days: asked, used: asked.length, total: total, left: budget - asked.length };
  }
  function toolVacaciones(root) {
    var form = root.querySelector("form"), res = root.querySelector(".result"), per = root.querySelector('[name="periodo"]');
    var Y = parse(todayIso()).getUTCFullYear(), opts = [["resto", "Lo que queda de " + Y], [String(Y + 1), String(Y + 1)], ["next", "Próximos 12 meses"]];
    if (per && !per.options.length) opts.forEach(function (o) { var e = document.createElement("option"); e.value = o[0]; e.textContent = o[1]; per.appendChild(e); });
    if (per) per.value = String(Y + 1);
    bindPlace(root, function () {});
    var cal = root.querySelector("[data-vaccal]");
    if (cal) cal.addEventListener("click", function (e) { var bt = e.target.closest && e.target.closest("button[data-mode]"); if (bt && cal._hol) renderCal(cal, cal._hol, bt.getAttribute("data-mode")); });
    var FS = new Intl.DateTimeFormat("es-ES", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var hol = esHolidays(root.querySelector('[name="ccaa"]').value, root.querySelector('[name="place"]').value);
      var n = parseInt(root.querySelector('[name="dias"]').value, 10), sat = root.querySelector('[name="sat"]').checked;
      var estilo = (form.querySelector('[name="estilo"]:checked') || {}).value || "max";
      var t = todayIso(), pv = per.value, from, to;
      if (pv === "resto") { from = t; to = Y + "-12-31"; }
      else if (pv === "next") { from = t; to = iso(add(new Date(Date.UTC(Y + 1, parse(t).getUTCMonth(), parse(t).getUTCDate())), -1)); }
      else { from = pv + "-01-01"; to = pv + "-12-31"; }
      if (from < t) from = t;
      if (from < DATA.range[0]) from = DATA.range[0];
      if (to > DATA.range[1]) to = DATA.range[1];
      res.hidden = false; res.classList.remove("warn");
      if (!n || n < 1 || n > 40) { res.classList.add("warn"); res.innerHTML = "Indica entre 1 y 40 días de vacaciones."; return; }
      var r = planVacaciones(hol, from, to, n, { sat: sat, periods: estilo === "largo" ? 3 : 0, bridges: estilo !== "largo" });
      if (!r.periods.length) { res.classList.add("warn"); res.innerHTML = "No hemos encontrado combinaciones en ese periodo."; return; }
      var html = '<div class="hint">' + (estilo !== "largo" ? "Aprovechando los puentes, pidiendo " : "Pidiendo ") + r.used + (r.used === 1 ? " día" : " días") + ' de vacaciones descansas</div><div class="big">' + r.total + " días</div>";
      html += "<p>Eso son " + (r.total / r.used).toFixed(1).replace(".", ",") + " días libres por cada día de vacaciones" + (r.left > 0 ? ". Te " + (r.left === 1 ? "queda 1 día" : "quedan " + r.left + " días") + " para un periodo largo, por ejemplo en verano" : "") + ".</p>";
      html += '<div class="table-wrap"><table><thead><tr><th scope="col">Descansas</th><th scope="col">Pide estos días</th><th scope="col">Días seguidos</th></tr></thead><tbody>';
      r.periods.forEach(function (w) {
        var asked = r.days.filter(function (d) { return d >= w.a && d <= w.b; });
        var hs = [];
        for (var x = parse(w.a); x <= parse(w.b); x = add(x, 1)) if (hol[iso(x)]) hs.push(esc(hol[iso(x)].name));
        html += "<tr><td><strong>" + FS.format(parse(w.a)) + " – " + FS.format(parse(w.b)) + "</strong>" + (hs.length ? '<br><span class="small muted">' + hs.join(", ") + "</span>" : "") + "</td><td>" + (asked.length > 3 ? FS.format(parse(asked[0])) + " a " + FS.format(parse(asked[asked.length - 1])) + " (" + asked.length + " días)" : asked.map(function (d) { return FS.format(parse(d)); }).join(", ")) + "</td><td>" + w.len + "</td></tr>";
      });
      html += "</tbody></table></div>";
      if (!root.querySelector('[name="place"]').value) html += '<p class="hint">Sin municipio no se cuentan las fiestas locales: elige el tuyo para afinar.</p>';
      html += '<p class="hint">Es una propuesta: las vacaciones se fijan de común acuerdo con la empresa (art. 38 del Estatuto de los Trabajadores) y tu convenio puede marcar periodos o turnos.</p>';
      res.innerHTML = html; res.focus();
      if (cal) {
        var vac = {}; r.days.forEach(function (d) { vac[d] = 1; });
        cal.hidden = false; cal._vac = vac; cal._hol = hol;
        var mode = pv === "resto" ? String(Y) : pv;
        renderCal(cal, hol, mode);
      }
    });
  }

  /* ---------- plazos judiciales (LOPJ 182-185, LEC 130-135, LJCA 128, LRJS 43) ---------- */
  // jur: civil | contencioso | social | penal; urg: la modalidad corre en agosto y del 24 dic al 6 ene
  // instr: instrucción penal (todos los días son hábiles, LOPJ 184)
  function judInhabil(hol, d, o) {
    if (o.instr) return false;
    var w = dow(d), k = iso(d), m = d.getUTCMonth(), day = d.getUTCDate();
    if (w === 0 || w === 6) return true;
    if (!o.urg && m === 7) return "agosto";
    if (!o.urg && ((m === 11 && day >= 24) || (m === 0 && day <= 6))) return "navidad";
    return !!hol[k];
  }
  function calcJudicial(hol, s, n, unit, o) {
    o = o || {};
    var d = parse(s), skipped = [], aug = 0, xmas = 0, end;
    if (o.lexnet) { d = add(d, 1); while (judInhabil(hol, d, o)) d = add(d, 1); }
    var notif = iso(d);
    if (unit === "dias") {
      var c = 0;
      while (c < n) {
        d = add(d, 1);
        var r = judInhabil(hol, d, o);
        if (!r) c++;
        else if (r === "agosto") aug++;
        else if (r === "navidad") xmas++;
        else if (hol[iso(d)] && dow(d) !== 0) skipped.push(iso(d));
      }
      end = d;
    } else {
      // meses de fecha a fecha (LEC 133.3); en lo contencioso agosto no corre (LJCA 128.2)
      var base = d;
      if (o.jur === "contencioso" && !o.urg && base.getUTCMonth() === 7) base = new Date(Date.UTC(base.getUTCFullYear(), 7, 31));
      function plusM(x, k) { var y = x.getUTCFullYear(), mo = x.getUTCMonth() + k, dd = x.getUTCDate(), last = new Date(Date.UTC(y, mo + 1, 0)).getUTCDate(); return new Date(Date.UTC(y, mo, Math.min(dd, last))); }
      end = plusM(base, n);
      if (o.jur === "contencioso" && !o.urg) {
        var ext = 0;
        for (var y = base.getUTCFullYear(); y <= end.getUTCFullYear() + 1; y++) {
          var a1 = new Date(Date.UTC(y, 7, 1));
          if (a1 > base && a1 <= plusM(base, n + ext)) ext++;
        }
        if (ext) { end = plusM(base, n + ext); aug = ext; }
      }
      while (judInhabil(hol, end, o)) { if (hol[iso(end)] && dow(end) !== 0) skipped.push(iso(end)); end = add(end, 1); }
    }
    var grace = add(end, 1);
    while (judInhabil(hol, grace, o)) grace = add(grace, 1);
    return { notif: notif, end: iso(end), grace: iso(grace), skipped: skipped, august: aug, xmas: xmas };
  }
  var JUR = {
    civil: { jur: "civil" }, "civil-urg": { jur: "civil", urg: true },
    contencioso: { jur: "contencioso" }, "contencioso-df": { jur: "contencioso", urg: true },
    social: { jur: "social" }, "social-urg": { jur: "social", urg: true },
    penal: { jur: "penal" }, "penal-instr": { jur: "penal", instr: true }
  };
  function toolJudiciales(root) {
    var form = root.querySelector("form"), res = root.querySelector(".result"), start = root.querySelector('[name="start"]');
    var jurSel = root.querySelector('[name="jur"]'), monthsOpt = root.querySelector('[name="unit"][value="meses"]');
    if (!start.value) start.value = todayIso();
    bindPlace(root, function () {});
    function sync() { var ok = jurSel.value.indexOf("contencioso") === 0; monthsOpt.disabled = !ok; if (!ok && monthsOpt.checked) form.querySelector('[name="unit"][value="dias"]').checked = true; }
    jurSel.addEventListener("change", sync); sync();
    bindTramite(root);
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var hol = esHolidays(root.querySelector('[name="ccaa"]').value, root.querySelector('[name="place"]').value);
      var n = parseInt(root.querySelector('[name="n"]').value, 10), unit = form.querySelector('[name="unit"]:checked').value, s = start.value;
      var o = {}, base = JUR[jurSel.value] || JUR.civil; for (var k in base) o[k] = base[k];
      o.lexnet = root.querySelector('[name="lexnet"]').checked;
      res.hidden = false; res.classList.remove("warn");
      if (!s || !n || n < 1 || n > (unit === "meses" ? 24 : 200)) { res.classList.add("warn"); res.innerHTML = "Indica una fecha y un plazo válido."; return; }
      if (!inRange(s)) { res.classList.add("warn"); res.innerHTML = "Por ahora la calculadora cubre del " + rangeText() + "."; return; }
      var r = calcJudicial(hol, s, n, unit, o);
      if (!inRange(r.grace)) { res.classList.add("warn"); res.innerHTML = "El vencimiento cae fuera del periodo con datos (hasta el 31 de diciembre de 2027)."; return; }
      var html = '<div class="hint">El plazo vence el</div><div class="big">' + long(parse(r.end)) + "</div>";
      if (!o.instr) html += '<p><strong>Puedes presentar el escrito hasta las 15:00 del ' + long(parse(r.grace)) + "</strong> (art. 135.5 LEC, día hábil siguiente al vencimiento).</p>";
      var notes = [];
      if (o.lexnet) notes.push("Notificación por LexNET o por el Colegio de Procuradores: se tiene por hecha el día hábil siguiente a la recepción, el " + long(parse(r.notif)) + " (art. 151.2 LEC), y el plazo empieza a contar al día siguiente.");
      else notes.push("El plazo empieza a contar el día siguiente a la notificación (" + long(add(parse(r.notif), 1)) + ").");
      if (o.instr) notes.push("En la instrucción de causas criminales todos los días y horas son hábiles (art. 184 LOPJ).");
      else if (unit === "dias") notes.push("Se excluyen sábados, domingos, festivos" + (o.urg ? "" : ", agosto y del 24 de diciembre al 6 de enero") + ".");
      if (r.august && unit === "dias") notes.push("Agosto no ha contado (" + r.august + " días entre semana fuera del cómputo).");
      if (r.august && unit === "meses") notes.push("Agosto no corre en lo contencioso (art. 128.2 LJCA): el plazo se alarga " + (r.august === 1 ? "un mes" : r.august + " meses") + ".");
      if (r.xmas) notes.push("Del 24 de diciembre al 6 de enero no ha contado (" + r.xmas + " días entre semana fuera del cómputo).");
      if (o.urg) notes.push(o.jur === "social" ? "En despidos, modificaciones sustanciales, vacaciones, conciliación, conflictos colectivos, derechos fundamentales y demás modalidades del art. 43.4 LRJS, agosto y Navidad son hábiles." : o.jur === "contencioso" ? "En el procedimiento de protección de derechos fundamentales agosto es hábil (art. 128.2 LJCA)." : "En las actuaciones urgentes (art. 131.2 LEC) solo se excluyen sábados, domingos y festivos (art. 133.2 LEC).");
      html += "<ul>" + notes.map(function (x) { return "<li>" + x + "</li>"; }).join("") + "</ul>";
      if (r.skipped.length) { html += "<p><strong>Festivos que han alargado el plazo:</strong></p><ul>"; r.skipped.forEach(function (x) { html += "<li>" + long(parse(x)) + ": " + esc(hol[x].name) + "</li>"; }); html += "</ul>"; }
      if (unit === "dias") html += computoHtml(computoDays(r.notif, r.end, judReason(hol, o)));
      var lab = tramiteLabel(root) || "Plazo judicial";
      html += calBar(r.end, "Vence: " + lab, lab + ". Notificación: " + long(parse(s)) + ". Vence el " + long(parse(r.end)) + (o.instr ? "" : "; se puede presentar hasta las 15:00 del " + long(parse(r.grace)) + " (art. 135.5 LEC)") + ". Calculado en calendariohabil.com (orientativo: compruébalo con la resolución).");
      if (!root.querySelector('[name="place"]').value) html += '<p class="hint">Elige el municipio del juzgado: sus fiestas locales también son inhábiles (art. 182 LOPJ).</p>';
      html += '<p class="hint">Cálculo orientativo. Comprueba siempre el plazo con la resolución y la ley aplicable.</p>';
      res.innerHTML = html; res.focus();
    });
  }

  /* ---------- buscador de municipios ---------- */
  function norm(s) { return String(s).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9ñ ]/g, " ").replace(/\s+/g, " ").trim(); }
  function searchIndex() {
    var out = [];
    DATA.es.ccaa.forEach(function (c) {
      out.push({ label: c.name, sub: "Comunidad autónoma", path: "es/festivos-2027/" + c.slug + "/", n: norm(c.name) });
      (c.zones || []).forEach(function (z) { out.push({ label: z.name, sub: c.name, path: "es/festivos-2027/" + c.slug + "/" + z.slug + "/", n: norm(z.name) }); });
      (c.locals || []).forEach(function (l) {
        var only26 = l.key.indexOf("r26-") === 0;
        out.push({ label: l.label, sub: c.name + (only26 ? " · fiestas locales de 2026" : ""), path: l.path, q: only26 ? "?ccaa=" + c.slug + "&lugar=local:" + l.key : "", ccaa: c.slug, place: "local:" + l.key, n: norm(l.label) });
      });
    });
    return out;
  }
  function toolBuscar(root) {
    var input = root.querySelector("input"), list = root.querySelector("[role=listbox]"), idx = searchIndex(), cur = -1, hits = [];
    function go(h) { store("ch_ccaa", h.ccaa || ""); if (h.place) store("ch_place", h.place); location.href = link(h.path) + (h.q || ""); }
    function show() {
      var q = norm(input.value); cur = -1;
      if (q.length < 2) { list.hidden = true; list.innerHTML = ""; return; }
      hits = idx.filter(function (h) { return h.n.indexOf(q) >= 0; }).sort(function (a, b) { var A = a.n.indexOf(q) === 0 ? 0 : 1, B2 = b.n.indexOf(q) === 0 ? 0 : 1; return A - B2 || a.n.length - b.n.length; }).slice(0, 8);
      list.innerHTML = hits.length ? hits.map(function (h, i) { return '<li role="option" id="bq' + i + '" data-i="' + i + '"><strong>' + esc(h.label) + '</strong> <span class="muted small">' + esc(h.sub) + "</span></li>"; }).join("") : '<li class="muted small">Sin resultados. Si tu municipio no aparece, sus fiestas locales aún no se han publicado: usa la página de tu comunidad.</li>';
      list.hidden = false;
    }
    function mark() { list.querySelectorAll("li[role=option]").forEach(function (li, i) { li.classList.toggle("on", i === cur); }); input.setAttribute("aria-activedescendant", cur >= 0 ? "bq" + cur : ""); }
    input.addEventListener("input", show);
    input.addEventListener("keydown", function (e) {
      if (e.key === "ArrowDown") { cur = Math.min(cur + 1, hits.length - 1); mark(); e.preventDefault(); }
      else if (e.key === "ArrowUp") { cur = Math.max(cur - 1, 0); mark(); e.preventDefault(); }
      else if (e.key === "Enter") { e.preventDefault(); if (hits.length) go(hits[Math.max(cur, 0)]); }
      else if (e.key === "Escape") { list.hidden = true; }
    });
    list.addEventListener("mousedown", function (e) { var li = e.target.closest("li[data-i]"); if (li) { e.preventDefault(); go(hits[+li.getAttribute("data-i")]); } });
    root.addEventListener("submit", function (e) { e.preventDefault(); if (hits.length) go(hits[0]); });
  }

  /* ---------- aguinaldo (México, LFT art. 87) ---------- */
  // sd: salario diario; dias: días de aguinaldo (mínimo 15); ingreso: fecha de ingreso (si fue este año); faltas: días no computables
  var MX_UMA_2026 = 117.31, MX_SM_2026 = { general: 315.04, frontera: 440.87 };
  function calcAguinaldo(sd, dias, year, ingreso, faltas) {
    var a = parse(year + "-01-01"), b = parse(year + "-12-31");
    var desde = ingreso && ingreso > iso(a) ? parse(ingreso) : a;
    var total = daysBetween(a, b) + 1;
    var trab = Math.max(0, daysBetween(desde, b) + 1 - (faltas || 0));
    var monto = sd * dias * trab / total;
    var exento = 30 * MX_UMA_2026;
    return { trabajados: trab, total: total, monto: monto, exento: Math.min(monto, exento), gravado: Math.max(0, monto - exento), topeExento: exento };
  }
  /* ---------- México: vacaciones (LFT arts. 76, 79 y 80) ---------- */
  // días de vacaciones por el año de servicio n (1 = primer año cumplido); art. 76 reformado DOF 27-12-2022
  function mxVacDias(n) { return n < 1 ? 0 : n <= 5 ? 10 + 2 * n : 20 + 2 * Math.ceil((n - 5) / 5); }
  function aniversario(ing, n) { var d = parse(ing); d.setUTCFullYear(d.getUTCFullYear() + n); return d; }
  // ingreso y fecha en ISO; sd = salario diario; usados = días ya disfrutados del último periodo; pct = prima vacacional (%)
  function calcMxVacaciones(ingreso, fecha, sd, usados, pct) {
    var f = parse(fecha), n = 0;
    while (aniversario(ingreso, n + 1) <= f) n++;
    var a0 = aniversario(ingreso, n), a1 = aniversario(ingreso, n + 1);
    var trans = daysBetween(a0, f), largo = daysBetween(a0, a1);
    var derecho = mxVacDias(n), pend = Math.max(0, derecho - (usados || 0));
    var prop = mxVacDias(n + 1) * trans / largo, p = (pct == null ? 25 : pct) / 100;
    return { anios: n, ultimoAniv: iso(a0), proximoAniv: iso(a1), derecho: derecho, pendientes: pend,
             siguiente: mxVacDias(n + 1), proporcional: prop, diasTotal: pend + prop,
             primaPendientes: pend * sd * p,
             // si la relación de trabajo terminara en esa fecha (finiquito): pendientes + proporcionales y su prima
             importe: (pend + prop) * sd, prima: (pend + prop) * sd * p, totalFiniquito: (pend + prop) * sd * (1 + p) };
  }
  function toolMxVac(root) {
    var form = root.querySelector("form"), res = root.querySelector(".result"), f = root.querySelector('[name="fecha"]');
    if (!f.value) f.value = todayIso();
    var N = function (x) { return x.toLocaleString("es-MX", { maximumFractionDigits: 2 }); };
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var ing = root.querySelector('[name="ingreso"]').value, fecha = f.value;
      var sal = parseFloat(root.querySelector('[name="sal"]').value), per = root.querySelector('[name="per"]').value;
      var usados = parseFloat(root.querySelector('[name="usados"]').value) || 0, pct = parseFloat(root.querySelector('[name="prima"]').value);
      res.hidden = false; res.classList.remove("warn");
      if (!ing || !fecha || ing >= fecha) { res.classList.add("warn"); res.innerHTML = "Indica tu fecha de ingreso y una fecha de cálculo posterior."; return; }
      if (!(sal > 0)) { res.classList.add("warn"); res.innerHTML = "Indica tu salario."; return; }
      if (!(pct >= 25)) pct = 25;
      var sd = per === "mes" ? sal / 30 : per === "quincena" ? sal / 15 : per === "semana" ? sal / 7 : sal;
      var r = calcMxVacaciones(ing, fecha, sd, usados, pct);
      var h = '<div class="hint">Al ' + long(parse(fecha)) + " llevas " + r.anios + (r.anios === 1 ? " año" : " años") + " de servicio</div>";
      if (r.anios >= 1) {
        h += '<div class="big">' + r.derecho + " días de vacaciones</div><p>Es lo que te corresponde por tu " + r.anios + ".º año cumplido (el " + long(parse(r.ultimoAniv)) + "). " +
          (usados ? "Ya has disfrutado " + N(usados) + ": te quedan <strong>" + N(r.pendientes) + " días</strong>. " : "") +
          "Debes disfrutarlos dentro de los 6 meses siguientes al aniversario (art. 81 LFT).</p>";
      } else {
        h += '<div class="big">' + N(r.proporcional) + " días generados</div><p>Aún no cumples el primer año: tendrás <strong>" + r.siguiente + " días</strong> el " + long(parse(r.proximoAniv)) + ". Si la relación de trabajo terminara hoy, te pagarían la parte proporcional (art. 79 LFT).</p>";
      }
      if (r.anios >= 1) h += "<p>Además, en el año de servicio en curso llevas generados <strong>" + N(r.proporcional) + " días</strong> de los " + r.siguiente + " que tendrás el " + long(parse(r.proximoAniv)) + ".</p>";
      if (r.pendientes > 0) h += "<p>Prima vacacional de esos " + N(r.pendientes) + " días: " + N(r.pendientes) + " × " + money(sd) + " × " + N(pct) + " % = <strong>" + money(r.primaPendientes) + "</strong>.</p>";
      h += '<p><strong>Si dejaras el trabajo en esa fecha</strong>, en el finiquito te corresponderían:</p><div class="table-wrap"><table><tbody>' +
        "<tr><td>Salario diario</td><td>" + money(sd) + "</td></tr>" +
        "<tr><td>Días de vacaciones (pendientes + proporcionales)</td><td>" + N(r.diasTotal) + "</td></tr>" +
        "<tr><td>Pago de esos días</td><td>" + money(r.importe) + "</td></tr>" +
        "<tr><td>Prima vacacional (" + N(pct) + " %)</td><td>" + money(r.prima) + "</td></tr>" +
        "<tr><td><strong>Total por vacaciones</strong></td><td><strong>" + money(r.totalFiniquito) + "</strong></td></tr>" +
        "</tbody></table></div>";
      h += '<p class="hint">Mientras sigues trabajando, las vacaciones se disfrutan con su salario normal y no se pueden cambiar por dinero (art. 79 LFT); la prima vacacional se cobra al disfrutarlas. El pago de los días solo procede si termina la relación de trabajo.</p>';
      res.innerHTML = h; res.focus();
    });
  }

  /* ---------- México: finiquito y liquidación (LFT arts. 48, 50, 79, 80, 87, 89, 162, 485, 486; LISR art. 93) ---------- */
  // o: { causa: "renuncia" | "justificado" | "injustificado", ingreso, baja (ISO), sd (salario diario), sdi (integrado, opcional),
  //      sm (salario mínimo diario de la zona), uma (UMA diaria), pend (días de salario sin cobrar), agui (días de aguinaldo),
  //      usados (días de vacaciones ya disfrutados del último periodo), pct (prima vacacional %), veinte (20 días por año) }
  function calcMxFiniquito(o) {
    var ing = parse(o.ingreso), baja = parse(o.baja), p = (o.pct || 25) / 100, agui = o.agui || 15;
    var diasServ = daysBetween(ing, baja) + 1, anios = diasServ / 365;
    var vac = calcMxVacaciones(o.ingreso, iso(add(baja, 1)), o.sd, o.usados || 0, o.pct || 25);
    // salario diario integrado (art. 84 y 89): cuota diaria + parte proporcional de aguinaldo y prima vacacional
    var sdi = o.sdi > 0 ? o.sdi : o.sd * (1 + agui / 365 + mxVacDias(vac.anios + 1) * p / 365);
    var ini = parse(baja.getUTCFullYear() + "-01-01"); if (ing > ini) ini = ing;
    var diasAnio = daysBetween(ini, baja) + 1;
    var c = [];
    c.push({ k: "salario", n: "Salario pendiente", v: (o.pend || 0) * o.sd, ex: 0 });
    var ag = o.sd * agui * diasAnio / 365;
    c.push({ k: "aguinaldo", n: "Aguinaldo proporcional", v: ag, ex: Math.min(ag, 30 * o.uma) });
    var dv = vac.pendientes + vac.proporcional;
    c.push({ k: "vacaciones", n: "Vacaciones", v: dv * o.sd, ex: 0, dias: dv });
    var pv = dv * o.sd * p;
    c.push({ k: "prima", n: "Prima vacacional", v: pv, ex: Math.min(pv, 15 * o.uma) });
    var separacion = 0;
    var tienePA = o.causa !== "renuncia" || anios >= 15;
    if (tienePA) {
      var base = Math.min(Math.max(sdi, o.sm), 2 * o.sm);
      var pa = 12 * anios * base; separacion += pa;
      c.push({ k: "antiguedad", n: "Prima de antigüedad", v: pa, ex: 0, base: base });
    }
    if (o.causa === "injustificado") {
      var tres = 90 * sdi; separacion += tres;
      c.push({ k: "tresmeses", n: "Indemnización de 3 meses", v: tres, ex: 0 });
      if (o.veinte) { var vd = 20 * anios * sdi; separacion += vd; c.push({ k: "veinte", n: "20 días por año", v: vd, ex: 0 }); }
    }
    // exención por separación: 90 UMA por año de servicio; la fracción de más de seis meses cuenta como año (LISR art. 93, XIII)
    var seis = parse(vac.ultimoAniv); seis.setUTCMonth(seis.getUTCMonth() + 6);
    var aniosEx = vac.anios + (add(baja, 1) > seis ? 1 : 0), exSep = Math.min(separacion, 90 * o.uma * aniosEx), rest = exSep;
    c.forEach(function (x) { if (x.k === "antiguedad" || x.k === "tresmeses" || x.k === "veinte") { x.ex = Math.min(x.v, rest); rest -= x.ex; } });
    var total = 0, exento = 0; c.forEach(function (x) { total += x.v; exento += x.ex; });
    return { conceptos: c, total: total, exento: exento, gravado: total - exento, anios: anios, diasServicio: diasServ, sdi: sdi,
             primaAntiguedad: tienePA, vac: vac, diasAnio: diasAnio, aniosExencion: aniosEx };
  }
  function toolMxFiniquito(root) {
    var form = root.querySelector("form"), res = root.querySelector(".result"), f = root.querySelector('[name="baja"]');
    var causa = root.querySelector('[name="causa"]'), vBox = root.querySelector("[data-veinte]");
    if (!f.value) f.value = todayIso();
    function sync() { vBox.hidden = causa.value !== "injustificado"; }
    causa.addEventListener("change", sync); sync();
    var N = function (x) { return x.toLocaleString("es-MX", { maximumFractionDigits: 2 }); };
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var ing = root.querySelector('[name="ingreso"]').value, baja = f.value;
      var sal = parseFloat(root.querySelector('[name="sal"]').value), per = root.querySelector('[name="per"]').value;
      var sdi = parseFloat(root.querySelector('[name="sdi"]').value) || 0, zona = root.querySelector('[name="zona"]').value;
      var agui = parseFloat(root.querySelector('[name="agui"]').value) || 15, pct = parseFloat(root.querySelector('[name="prima"]').value) || 25;
      res.hidden = false; res.classList.remove("warn");
      if (!ing || !baja || ing > baja) { res.classList.add("warn"); res.innerHTML = "Indica tu fecha de ingreso y tu último día de trabajo."; return; }
      if (!(sal > 0)) { res.classList.add("warn"); res.innerHTML = "Indica tu salario."; return; }
      var sd = per === "mes" ? sal / 30 : per === "quincena" ? sal / 15 : per === "semana" ? sal / 7 : sal;
      var r = calcMxFiniquito({ causa: causa.value, ingreso: ing, baja: baja, sd: sd, sdi: sdi, sm: DATA.mx.sm[zona], uma: DATA.mx.uma.diaria,
        pend: parseFloat(root.querySelector('[name="pend"]').value) || 0, agui: Math.max(15, agui), usados: parseFloat(root.querySelector('[name="usados"]').value) || 0,
        pct: Math.max(25, pct), veinte: root.querySelector('[name="veinte"]').checked });
      var tit = causa.value === "injustificado" ? "Tu liquidación" : "Tu finiquito";
      var h = '<div class="hint">' + tit + " (antes de impuestos)</div><div class=\"big\">" + money(r.total) + "</div>";
      h += "<p>" + N(r.anios) + " años de servicio (" + r.diasServicio + " días). Salario diario: " + money(sd) + (r.conceptos.some(function (x) { return x.k === "antiguedad" || x.k === "tresmeses"; }) ? "; salario diario integrado: " + money(r.sdi) + (sdi ? "" : " (estimado con las prestaciones mínimas de ley)") : "") + ".</p>";
      h += '<div class="table-wrap"><table><thead><tr><th scope="col">Concepto</th><th scope="col">Cálculo</th><th scope="col">Importe</th><th scope="col">Exento de ISR</th></tr></thead><tbody>' +
        r.conceptos.filter(function (x) { return x.k !== "salario" || x.v > 0; }).map(function (x) {
          var how = x.k === "salario" ? N(x.v / sd) + " días × " + money(sd)
            : x.k === "aguinaldo" ? Math.max(15, agui) + " días × " + r.diasAnio + " ÷ 365"
            : x.k === "vacaciones" ? N(x.dias) + " días × " + money(sd)
            : x.k === "prima" ? N(Math.max(25, pct)) + " % de las vacaciones"
            : x.k === "antiguedad" ? "12 días × " + N(r.anios) + " años × " + money(x.base)
            : x.k === "tresmeses" ? "90 días × " + money(r.sdi)
            : "20 días × " + N(r.anios) + " años × " + money(r.sdi);
          return "<tr><td>" + x.n + "</td><td class=\"small\">" + how + "</td><td>" + money(x.v) + "</td><td>" + money(x.ex) + "</td></tr>";
        }).join("") +
        "<tr><td><strong>Total</strong></td><td></td><td><strong>" + money(r.total) + "</strong></td><td><strong>" + money(r.exento) + "</strong></td></tr></tbody></table></div>";
      h += "<p>Parte exenta de ISR: <strong>" + money(r.exento) + "</strong>. Sobre los <strong>" + money(r.gravado) + "</strong> restantes se retiene ISR según tu sueldo; la cifra exacta la verás en tu recibo.</p>";
      if (causa.value === "renuncia" && !r.primaAntiguedad) h += '<p class="hint">Al renunciar con menos de 15 años de servicio no hay prima de antigüedad (art. 162 LFT).</p>';
      if (causa.value === "injustificado") h += '<p class="hint">Si el despido se discute ante el Tribunal y el patrón no prueba la causa, se suman los salarios vencidos (hasta 12 meses, art. 48 LFT). Antes de firmar un convenio, acude gratis a la Procuraduría Federal de la Defensa del Trabajo (Profedet).</p>';
      res.innerHTML = h; res.focus();
    });
  }

  function toolAguinaldo(root) {
    var form = root.querySelector("form"), res = root.querySelector(".result");
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var sal = parseFloat(root.querySelector('[name="sal"]').value), per = root.querySelector('[name="per"]').value;
      var dias = parseFloat(root.querySelector('[name="dias"]').value) || 15, ing = root.querySelector('[name="ingreso"]').value;
      var faltas = parseInt(root.querySelector('[name="faltas"]').value, 10) || 0, year = 2026;
      res.hidden = false; res.classList.remove("warn");
      if (!(sal > 0)) { res.classList.add("warn"); res.innerHTML = "Escribe tu salario."; return; }
      if (dias < 15) { res.classList.add("warn"); res.innerHTML = "La ley garantiza al menos 15 días de aguinaldo (art. 87 LFT)."; return; }
      if (ing && ing > year + "-12-31") { res.classList.add("warn"); res.innerHTML = "La fecha de ingreso es posterior a 2026."; return; }
      var sd = per === "mes" ? sal / 30 : per === "quincena" ? sal / 15 : per === "semana" ? sal / 7 : sal;
      var r = calcAguinaldo(sd, dias, year, ing, faltas);
      var html = '<div class="hint">Tu aguinaldo de 2026</div><div class="big">' + money(r.monto) + "</div>";
      html += "<ul><li>Salario diario: <strong>" + money(sd) + "</strong></li>";
      html += "<li>Días que cuentan: <strong>" + r.trabajados + " de " + r.total + "</strong>" + (r.trabajados < r.total ? " (aguinaldo proporcional)" : " (año completo)") + "</li>";
      html += "<li>Exento de ISR: " + money(r.exento) + " (hasta 30 UMA, " + money(r.topeExento) + ")" + (r.gravado > 0 ? "; gravado: <strong>" + money(r.gravado) + "</strong>" : "; no paga ISR") + "</li></ul>";
      if (sd < MX_SM_2026.general) html += '<p class="hint">Ojo: tu salario diario es menor que el salario mínimo general de 2026 (' + money(MX_SM_2026.general) + ").</p>";
      html += '<p class="hint">Se debe pagar antes del 20 de diciembre. Cálculo orientativo: la retención de ISR sobre la parte gravada depende del resto de tus ingresos.</p>';
      res.innerHTML = html; res.focus();
    });
  }

  /* ---------- prima de servicios (Colombia, CST art. 306) ---------- */
  var CO_2026 = { smmlv: 1750905, auxilio: 249095 };
  function days360(a, b) { // días comerciales (meses de 30 días), ambos incluidos
    var A = parse(a), B = parse(b);
    var d1 = Math.min(A.getUTCDate(), 30), d2 = B.getUTCDate();
    var lastFeb = B.getUTCMonth() === 1 && add(B, 1).getUTCMonth() === 2;
    d2 = lastFeb ? 30 : Math.min(d2, 30);
    return (B.getUTCFullYear() - A.getUTCFullYear()) * 360 + (B.getUTCMonth() - A.getUTCMonth()) * 30 + (d2 - d1) + 1;
  }
  function calcPrima(salario, sem, year, ingreso, noLab, auxilioSi) {
    var ini = year + (sem === 1 ? "-01-01" : "-07-01"), fin = year + (sem === 1 ? "-06-30" : "-12-31");
    var desde = ingreso && ingreso > ini ? ingreso : ini;
    var dias = desde > fin ? 0 : Math.max(0, Math.min(180, days360(desde, fin)) - (noLab || 0));
    var aux = auxilioSi === undefined ? (salario <= 2 * CO_2026.smmlv ? CO_2026.auxilio : 0) : (auxilioSi ? CO_2026.auxilio : 0);
    var base = salario + aux;
    return { dias: dias, base: base, auxilio: aux, prima: Math.round(base * dias / 360), pago: sem === 1 ? year + "-06-30" : year + "-12-20" };
  }
  /* ---------- Colombia: cesantías, vacaciones y liquidación (CST arts. 64, 186, 189, 249; Ley 50 de 1990; Ley 52 de 1975; Ley 995 de 2005) ---------- */
  function coAuxilio(salario, integral) { return !integral && salario <= 2 * CO_2026.smmlv ? CO_2026.auxilio : 0; }
  // cesantías e intereses del periodo desde-hasta (días comerciales de 360); base = salario + auxilio de transporte
  function calcCoCesantias(salario, desde, hasta, noLab, aux) {
    var dias = Math.max(0, days360(desde, hasta) - (noLab || 0));
    var a = aux === undefined ? coAuxilio(salario) : aux, base = salario + a;
    var ces = base * dias / 360, inte = ces * dias * 0.12 / 360;
    return { dias: dias, base: base, auxilio: a, cesantias: Math.round(ces), intereses: Math.round(inte) };
  }
  // vacaciones: 15 días hábiles por año de servicio, proporcionales; valor = salario ÷ 30 por día (sin auxilio de transporte)
  function calcCoVacaciones(salario, desde, hasta, disfrutados) {
    var dias = days360(desde, hasta), gen = 15 * dias / 360, pend = Math.max(0, gen - (disfrutados || 0));
    return { dias: dias, generados: gen, pendientes: pend, valor: Math.round(salario / 30 * pend) };
  }
  // fecha de regreso: n días hábiles de vacaciones desde la fecha de salida (incluida)
  function coRegreso(hol, salida, n, sat) {
    var d = parse(salida), c = 0, ult = null, skipped = [];
    var habil = function (x) { var w = dow(x); return w !== 0 && (w !== 6 || sat) && !hol[iso(x)]; };
    while (c < n) { if (habil(d)) { c++; ult = d; } else if (hol[iso(d)] && dow(d) !== 0 && (dow(d) !== 6 || sat)) skipped.push(iso(d)); d = add(d, 1); }
    while (!habil(d)) { if (hol[iso(d)] && dow(d) !== 0 && (dow(d) !== 6 || sat)) skipped.push(iso(d)); d = add(d, 1); }
    return { ultimo: iso(ult), regreso: iso(d), festivos: skipped, naturales: daysBetween(parse(salida), d) };
  }
  // indemnización por despido sin justa causa (art. 64 CST)
  function calcCoIndemnizacion(tipo, salario, ingreso, fin, finPactado) {
    var diario = salario / 30, dias;
    if (tipo === "indefinido") {
      var anios = days360(ingreso, fin) / 360, alto = salario >= 10 * CO_2026.smmlv;
      dias = (alto ? 20 : 30) + (anios > 1 ? (alto ? 15 : 20) * (anios - 1) : 0);
    } else {
      dias = finPactado && finPactado > fin ? days360(iso(add(parse(fin), 1)), finPactado) : 0;
      if (tipo === "obra") dias = Math.max(15, dias);
    }
    return { dias: dias, valor: Math.round(diario * dias) };
  }
  // o: { tipo: indefinido|fijo|obra, motivo: renuncia|justa|sinjusta|plazo, ingreso, fin, salario, integral, pend (días sin cobrar),
  //      disfrutados (días de vacaciones disfrutados en todo el contrato), noLab, finPactado }
  function calcCoLiquidacion(o) {
    var y = o.fin.slice(0, 4), c = [], aux = coAuxilio(o.salario, o.integral);
    var desdeAnio = o.ingreso > y + "-01-01" ? o.ingreso : y + "-01-01";
    var semIni = o.fin.slice(5) >= "07-01" ? y + "-07-01" : y + "-01-01", desdeSem = o.ingreso > semIni ? o.ingreso : semIni;
    if (o.pend) c.push({ k: "salario", n: "Salario pendiente", v: Math.round(o.salario / 30 * o.pend), how: o.pend + " días × salario ÷ 30" });
    if (!o.integral) {
      var ce = calcCoCesantias(o.salario, desdeAnio, o.fin, o.noLab, aux);
      c.push({ k: "cesantias", n: "Cesantías", v: ce.cesantias, how: ce.dias + " días × base ÷ 360" });
      c.push({ k: "intereses", n: "Intereses sobre cesantías", v: ce.intereses, how: "cesantías × " + ce.dias + " días × 12 % ÷ 360" });
      var dp = Math.max(0, Math.min(180, days360(desdeSem, o.fin)) - (o.noLab || 0));
      c.push({ k: "prima", n: "Prima de servicios", v: Math.round((o.salario + aux) * dp / 360), how: dp + " días × base ÷ 360" });
    }
    var va = calcCoVacaciones(o.salario, o.ingreso, o.fin, o.disfrutados);
    c.push({ k: "vacaciones", n: "Vacaciones", v: va.valor, how: (Math.round(va.pendientes * 100) / 100).toLocaleString("es-CO") + " días × salario ÷ 30" });
    var ind = null;
    if (o.motivo === "sinjusta") {
      ind = calcCoIndemnizacion(o.tipo, o.salario, o.ingreso, o.fin, o.finPactado);
      c.push({ k: "indemnizacion", n: "Indemnización por despido sin justa causa", v: ind.valor, how: (Math.round(ind.dias * 100) / 100).toLocaleString("es-CO") + " días × salario ÷ 30" });
    }
    var total = 0; c.forEach(function (x) { total += x.v; });
    return { conceptos: c, total: total, auxilio: aux, vac: va, indemnizacion: ind, diasServicio: days360(o.ingreso, o.fin) };
  }
  function coRead(root, name) { var el = root.querySelector('[name="' + name + '"]'); return el ? el.value : ""; }
  function toolCoCes(root) {
    var form = root.querySelector("form"), res = root.querySelector(".result"), Y = parse(todayIso()).getUTCFullYear();
    var d = root.querySelector('[name="desde"]'), h = root.querySelector('[name="hasta"]');
    if (!d.value) d.value = Y + "-01-01"; if (!h.value) h.value = Y + "-12-31";
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var sal = parseFloat(coRead(root, "sal")), desde = d.value, hasta = h.value, noLab = parseInt(coRead(root, "nolab"), 10) || 0;
      res.hidden = false; res.classList.remove("warn");
      if (!(sal > 0)) { res.classList.add("warn"); res.innerHTML = "Indica tu salario mensual."; return; }
      if (!desde || !hasta || desde > hasta || desde.slice(0, 4) !== hasta.slice(0, 4)) { res.classList.add("warn"); res.innerHTML = "Indica un periodo dentro del mismo año: las cesantías se liquidan cada 31 de diciembre o al terminar el contrato."; return; }
      var r = calcCoCesantias(sal, desde, hasta, noLab), yy = +hasta.slice(0, 4);
      var hh = '<div class="hint">Cesantías del ' + long(parse(desde)) + " al " + long(parse(hasta)) + '</div><div class="big">' + cop(r.cesantias) + "</div>";
      hh += "<p>" + cop(r.base) + " de base (" + cop(sal) + " de salario" + (r.auxilio ? " + " + cop(r.auxilio) + " de auxilio de transporte" : "") + ") × " + r.dias + " días ÷ 360.</p>";
      hh += "<p>Intereses sobre cesantías (12 % anual): " + cop(r.cesantias) + " × " + r.dias + " × 12 % ÷ 360 = <strong>" + cop(r.intereses) + "</strong>.</p>";
      if (hasta.slice(5) === "12-31") hh += "<p>Tu empleador debe <strong>pagarte los intereses antes del 31 de enero de " + (yy + 1) + "</strong> y <strong>consignar las cesantías en tu fondo antes del 14 de febrero de " + (yy + 1) + "</strong>.</p>";
      else hh += "<p>Si el contrato termina el " + long(parse(hasta)) + ", las cesantías y los intereses se te pagan directamente con la liquidación.</p>";
      res.innerHTML = hh; res.focus();
    });
  }
  function toolCoVac(root) {
    var form = root.querySelector("form"), res = root.querySelector(".result"), f = root.querySelector('[name="fecha"]'), s = root.querySelector('[name="salida"]');
    if (!f.value) f.value = todayIso();
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var sal = parseFloat(coRead(root, "sal")), ing = coRead(root, "ingreso"), disf = parseFloat(coRead(root, "disfrutados")) || 0;
      var n = parseInt(coRead(root, "ndias"), 10) || 0, sat = root.querySelector('[name="sat"]').checked;
      res.hidden = false; res.classList.remove("warn");
      if (!ing || !f.value || ing > f.value) { res.classList.add("warn"); res.innerHTML = "Indica tu fecha de ingreso y una fecha de cálculo posterior."; return; }
      if (!(sal > 0)) { res.classList.add("warn"); res.innerHTML = "Indica tu salario mensual."; return; }
      var r = calcCoVacaciones(sal, ing, f.value, disf), N = function (x) { return x.toLocaleString("es-CO", { maximumFractionDigits: 2 }); };
      var hh = '<div class="hint">Al ' + long(parse(f.value)) + ' tienes</div><div class="big">' + N(r.pendientes) + " días hábiles de vacaciones</div>";
      hh += "<p>" + r.dias + " días trabajados × 15 ÷ 360 = " + N(r.generados) + " días generados" + (disf ? ", menos " + N(disf) + " ya disfrutados" : "") + ". Si se pagaran en dinero (al terminar el contrato), serían <strong>" + cop(r.valor) + "</strong>.</p>";
      if (s.value && n > 0) {
        if (!inRange(s.value)) { hh += '<p class="hint">Para calcular la fecha de regreso con festivos, la salida debe estar entre el ' + rangeText() + ".</p>"; }
        else {
          var g = coRegreso(coHolidays(), s.value, n, sat);
          if (!inRange(g.regreso)) hh += '<p class="hint">La fecha de regreso cae fuera del periodo con festivos.</p>';
          else {
            hh += "<p>Si sales el " + long(parse(s.value)) + " con " + n + " días hábiles, tu último día de vacaciones es el " + long(parse(g.ultimo)) + " y <strong>vuelves al trabajo el " + long(parse(g.regreso)) + "</strong> (" + g.naturales + " días naturales de descanso).</p>";
            if (g.festivos.length) hh += "<p>Festivos que no cuentan como vacaciones: " + g.festivos.map(function (x) { return long(parse(x)); }).join("; ") + ".</p>";
          }
        }
      }
      res.innerHTML = hh; res.focus();
    });
  }
  function toolCoLiq(root) {
    var form = root.querySelector("form"), res = root.querySelector(".result"), f = root.querySelector('[name="fin"]');
    var tipo = root.querySelector('[name="tipo"]'), motivo = root.querySelector('[name="motivo"]'), pBox = root.querySelector("[data-pactado]");
    if (!f.value) f.value = todayIso();
    function sync() {
      pBox.hidden = tipo.value === "indefinido";
      var o = motivo.querySelector('option[value="plazo"]'); o.disabled = tipo.value === "indefinido"; if (o.disabled && motivo.value === "plazo") motivo.value = "renuncia";
    }
    tipo.addEventListener("change", sync); sync();
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var sal = parseFloat(coRead(root, "sal")), ing = coRead(root, "ingreso"), fin = f.value;
      res.hidden = false; res.classList.remove("warn");
      if (!ing || !fin || ing > fin) { res.classList.add("warn"); res.innerHTML = "Indica tu fecha de ingreso y tu último día de trabajo."; return; }
      if (!(sal > 0)) { res.classList.add("warn"); res.innerHTML = "Indica tu salario mensual."; return; }
      var fp = coRead(root, "pactado");
      if (tipo.value !== "indefinido" && motivo.value === "sinjusta" && !fp) { res.classList.add("warn"); res.innerHTML = "Indica la fecha en que debía terminar el contrato (o la obra) para calcular la indemnización."; return; }
      var r = calcCoLiquidacion({ tipo: tipo.value, motivo: motivo.value, ingreso: ing, fin: fin, salario: sal, integral: root.querySelector('[name="integral"]').checked,
        pend: parseInt(coRead(root, "pend"), 10) || 0, disfrutados: parseFloat(coRead(root, "disfrutados")) || 0, noLab: parseInt(coRead(root, "nolab"), 10) || 0, finPactado: fp });
      var hh = '<div class="hint">Tu liquidación (antes de deducciones)</div><div class="big">' + cop(r.total) + "</div>";
      hh += "<p>" + r.diasServicio + " días de servicio. Base de cesantías y prima: " + cop(sal + r.auxilio) + (r.auxilio ? " (salario + auxilio de transporte)" : "") + ".</p>";
      hh += '<div class="table-wrap"><table><thead><tr><th scope="col">Concepto</th><th scope="col">Cálculo</th><th scope="col">Valor</th></tr></thead><tbody>' +
        r.conceptos.map(function (x) { return "<tr><td>" + x.n + "</td><td class=\"small\">" + x.how + "</td><td>" + cop(x.v) + "</td></tr>"; }).join("") +
        "<tr><td><strong>Total</strong></td><td></td><td><strong>" + cop(r.total) + "</strong></td></tr></tbody></table></div>";
      hh += '<p class="hint">Las cesantías y la prima se calculan desde el 1 de enero y desde el inicio del semestre, suponiendo que las de periodos anteriores ya se consignaron y pagaron. Si el empleador no paga la liquidación al terminar el contrato, debe una indemnización por cada día de retraso (art. 65 CST).</p>';
      res.innerHTML = hh; res.focus();
    });
  }
  /* ---------- Perú: CTS, gratificaciones y vacaciones (TUO del D. Leg. 650; Ley 27735; Ley 30334; D. Leg. 713; Ley MYPE) ---------- */
  function peHolidays() {
    var m = {};
    DATA.pe.days.forEach(function (h) { m[h[0]] = { name: h[1], kind: "nac" }; });
    return m;
  }
  function peRmv(fecha) { var v = DATA.pe.rmv[0][1]; DATA.pe.rmv.forEach(function (r) { if (fecha >= r[0]) v = r[1]; }); return v; }
  function peAf(fecha, si) { return si ? Math.round(peRmv(fecha) * 10) / 100 : 0; } // asignación familiar: 10 % de la RMV
  function r2(x) { return Math.round(x * 100) / 100; }
  var PE_REG = { general: 1, pequena: 0.5, micro: 0 };
  function lastDay(y, m) { return iso(new Date(Date.UTC(y, m + 1, 0))); }
  // meses calendario completos entre desde y hasta, ambos incluidos
  function peMeses(desde, hasta) {
    var A = parse(desde), y = A.getUTCFullYear(), m = A.getUTCMonth() + (A.getUTCDate() === 1 ? 0 : 1), n = 0;
    while (true) {
      var y2 = y + Math.floor(m / 12), m2 = m % 12;
      if (lastDay(y2, m2) > hasta) break;
      n++; m++;
    }
    return n;
  }
  // gratificación de julio (enero-junio) o diciembre (julio-diciembre): una remuneración por semestre completo,
  // un sexto por cada mes calendario completo; más la bonificación extraordinaria del 9 % (6,75 % con EPS)
  // o: { sueldo, af (bool), sem: "jul"|"dic", year, ingreso, cese, regimen, eps }
  function calcPeGrat(o) {
    var ini = o.year + (o.sem === "jul" ? "-01-01" : "-07-01"), fin = o.year + (o.sem === "jul" ? "-06-30" : "-12-31");
    var pago = o.year + (o.sem === "jul" ? "-07-15" : "-12-15");
    var desde = o.ingreso && o.ingreso > ini ? o.ingreso : ini, hasta = o.cese && o.cese < fin ? o.cese : fin;
    var meses = desde > hasta ? 0 : peMeses(desde, hasta), f = PE_REG[o.regimen || "general"];
    var af = peAf(o.cese && o.cese < pago ? o.cese : pago, o.af), rc = o.sueldo + af;
    var grat = r2(rc * meses / 6 * f), bono = r2(grat * (o.eps ? 0.0675 : 0.09));
    return { meses: meses, af: af, rc: rc, factor: f, grat: grat, bono: bono, total: r2(grat + bono), pago: pago, trunca: !!(o.cese && o.cese < fin), desde: desde, hasta: hasta };
  }
  // CTS del semestre: (sueldo + asignación familiar + 1/6 de la gratificación del semestre) ÷ 12 por mes y ÷ 360 por día
  // o: { sueldo, af, deposito: "AAAA-05"|"AAAA-11", ingreso, cese, faltas, regimen, grat (opcional: gratificación recibida) }
  function calcPeCts(o) {
    var y = +o.deposito.slice(0, 4), nov = o.deposito.slice(5) === "11";
    var ini = nov ? y + "-05-01" : (y - 1) + "-11-01", fin = nov ? y + "-10-31" : y + "-04-30";
    var desde = o.ingreso && o.ingreso > ini ? o.ingreso : ini, hasta = o.cese && o.cese < fin ? o.cese : fin;
    var f = PE_REG[o.regimen || "general"];
    var dias = desde > hasta ? 0 : Math.max(0, days360(desde, hasta) - (o.faltas || 0));
    if (o.ingreso && dias && days360(o.ingreso, hasta) < 30) dias = 0; // se devenga desde el primer mes de servicio
    var gs = nov ? { sem: "jul", year: y } : { sem: "dic", year: y - 1 }, grat;
    if (o.grat !== undefined && o.grat !== null && o.grat !== "") grat = +o.grat;
    else {
      var pagoG = gs.year + (gs.sem === "jul" ? "-07-15" : "-12-15");
      grat = o.cese && o.cese < pagoG ? 0 : calcPeGrat({ sueldo: o.sueldo, af: o.af, sem: gs.sem, year: gs.year, ingreso: o.ingreso, regimen: o.regimen }).grat;
    }
    var af = peAf(hasta, o.af), sexto = r2(grat / 6), rc = r2(o.sueldo + af + sexto);
    var meses = Math.floor(dias / 30), d = dias % 30;
    var cts = r2((rc / 12 * meses + rc / 360 * d) * f);
    return { desde: desde, hasta: hasta, dias: dias, meses: meses, d: d, af: af, grat: grat, sexto: sexto, rc: rc, factor: f, cts: cts,
      deposito: peHabil(nov ? y + "-11-15" : y + "-05-15"), cese: !!(o.cese && o.cese < fin), gratSem: gs };
  }
  // vacaciones: 30 días calendario por año completo (15 en la micro y pequeña empresa); truncas proporcionales al cese;
  // las no gozadas en el año siguiente dan derecho a una indemnización de una remuneración más (art. 23 D. Leg. 713)
  // o: { sueldo, af, ingreso, fecha, gozados, regimen }
  function calcPeVac(o) {
    var base = (o.regimen || "general") === "general" ? 30 : 15;
    var dias = days360(o.ingreso, o.fecha), anios = Math.floor(dias / 360), resto = dias - anios * 360;
    var left = o.gozados || 0, pend = 0, vencidos = 0;
    for (var k = 1; k <= anios; k++) {
      var p = Math.max(0, base - left); left = Math.max(0, left - base);
      pend += p; if (k < anios) vencidos += p;
    }
    var truncas = dias >= 30 ? base * resto / 360 : 0;
    var af = peAf(o.fecha, o.af), rc = o.sueldo + af, diario = rc / 30;
    return { base: base, dias: dias, anios: anios, resto: resto, ganados: anios * base, pendientes: pend, vencidos: vencidos, truncas: truncas, af: af, rc: rc,
      valorPend: r2(diario * pend), indemnizacion: r2(diario * vencidos), valorTruncas: r2(diario * truncas) };
  }
  // fecha de regreso: n días calendario desde la salida (incluida); se vuelve el siguiente día laborable
  function peRegreso(hol, salida, n, sat) {
    var ult = add(parse(salida), n - 1), d = add(ult, 1), fest = [];
    for (var x = parse(salida); x <= ult; x = add(x, 1)) if (hol[iso(x)]) fest.push(iso(x));
    while (dow(d) === 0 || (dow(d) === 6 && !sat) || hol[iso(d)]) d = add(d, 1);
    return { ultimo: iso(ult), regreso: iso(d), festivos: fest };
  }
  // si el plazo vence en sábado, domingo o feriado, se pasa al siguiente día hábil
  function peHabil(s) { var d = parse(s), h = DATA.pe ? peHolidays() : {}; while (dow(d) === 0 || dow(d) === 6 || h[iso(d)]) d = add(d, 1); return iso(d); }
  function pen(x) { return "S/ " + x.toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
  function peMicroWarn(res, que) { res.classList.add("warn"); res.innerHTML = "En la microempresa (REMYPE) no hay " + que + ". Si tu empresa no está inscrita en el REMYPE, elige «Régimen general»."; }
  function toolPeCts(root) {
    var form = root.querySelector("form"), res = root.querySelector(".result"), dep = root.querySelector('[name="deposito"]');
    var t = todayIso(), Y = +t.slice(0, 4), def = t < Y + "-05-16" ? Y + "-05" : t < Y + "-11-16" ? Y + "-11" : (Y + 1) + "-05";
    if (!dep.getAttribute("data-set") && dep.querySelector('option[value="' + def + '"]')) dep.value = def;
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var sal = parseFloat(coRead(root, "sal")), reg = coRead(root, "regimen"), g = coRead(root, "grat");
      res.hidden = false; res.classList.remove("warn");
      if (!(sal > 0)) { res.classList.add("warn"); res.innerHTML = "Indica tu sueldo mensual."; return; }
      if (reg === "micro") { peMicroWarn(res, "CTS"); return; }
      var r = calcPeCts({ sueldo: sal, af: root.querySelector('[name="af"]').checked, deposito: dep.value, ingreso: coRead(root, "ingreso"), cese: coRead(root, "cese"),
        faltas: parseInt(coRead(root, "faltas"), 10) || 0, regimen: reg, grat: g === "" ? undefined : parseFloat(g) });
      if (r.desde > r.hasta) { res.classList.add("warn"); res.innerHTML = "Con esas fechas no trabajaste en este periodo."; return; }
      var hh = '<div class="hint">CTS del ' + long(parse(r.desde)) + " al " + long(parse(r.hasta)) + '</div><div class="big">' + pen(r.cts) + "</div>";
      hh += "<p>Remuneración computable: " + pen(sal) + " de sueldo" + (r.af ? " + " + pen(r.af) + " de asignación familiar" : "") + " + " + pen(r.sexto) + " (un sexto de la gratificación de " + (r.gratSem.sem === "jul" ? "julio" : "diciembre") + " de " + r.gratSem.year + ", " + pen(r.grat) + ") = <strong>" + pen(r.rc) + "</strong>.</p>";
      hh += "<p>Tiempo computable: " + r.meses + " meses y " + r.d + " días. " + pen(r.rc) + " ÷ 12 × " + r.meses + " + " + pen(r.rc) + " ÷ 360 × " + r.d + (r.factor < 1 ? ", por la mitad en la pequeña empresa" : "") + ".</p>";
      if (r.cese) hh += "<p>Como el vínculo termina el " + long(parse(r.hasta)) + ", la CTS se deposita en tu cuenta dentro de las 48 horas siguientes al cese.</p>";
      else hh += "<p>Tu empleador debe depositarla en tu cuenta CTS <strong>a más tardar el " + long(parse(r.deposito)) + "</strong>.</p>";
      if (r.deposito > "2027-01-01") hh += '<p class="hint">Para el depósito de mayo de 2027 se usa la remuneración mínima vigente hoy (S/ ' + peRmv(t) + "). Si en 2027 se aprueba el segundo tramo, la asignación familiar subirá.</p>";
      hh += '<p class="hint">Si cobras horas extra, comisiones u otros conceptos regulares, súmalos al sueldo como promedio del semestre. Cálculo orientativo.</p>';
      res.innerHTML = hh; res.focus();
    });
  }
  function toolPeGrat(root) {
    var form = root.querySelector("form"), res = root.querySelector(".result"), sem = root.querySelector('[name="sem"]');
    var t = todayIso(), Y = +t.slice(0, 4), def = (t.slice(5) < "07-16" ? "jul-" : t.slice(5) <= "12-15" ? "dic-" : "jul-") + (t.slice(5) > "12-15" ? Y + 1 : Y);
    if (!sem.getAttribute("data-set") && sem.querySelector('option[value="' + def + '"]')) sem.value = def;
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var sal = parseFloat(coRead(root, "sal")), reg = coRead(root, "regimen"), sv = sem.value.split("-");
      res.hidden = false; res.classList.remove("warn");
      if (!(sal > 0)) { res.classList.add("warn"); res.innerHTML = "Indica tu sueldo mensual."; return; }
      if (reg === "micro") { peMicroWarn(res, "gratificaciones"); return; }
      var r = calcPeGrat({ sueldo: sal, af: root.querySelector('[name="af"]').checked, sem: sv[0], year: +sv[1], ingreso: coRead(root, "ingreso"), cese: coRead(root, "cese"), regimen: reg, eps: coRead(root, "seguro") === "eps" });
      var nombre = (sv[0] === "jul" ? "julio" : "diciembre") + " de " + sv[1];
      if (!r.meses) { res.classList.add("warn"); res.innerHTML = "Para la gratificación de " + nombre + " hace falta al menos un mes calendario completo trabajado en el semestre."; return; }
      var hh = '<div class="hint">' + (r.trunca ? "Gratificación trunca" : "Gratificación de " + nombre) + ' con bonificación</div><div class="big">' + pen(r.total) + "</div>";
      hh += "<ul><li>Gratificación: " + pen(r.rc) + (r.af ? " (sueldo + " + pen(r.af) + " de asignación familiar)" : "") + " × " + r.meses + " de 6 meses" + (r.factor < 1 ? " × 1/2 (pequeña empresa)" : "") + " = <strong>" + pen(r.grat) + "</strong></li>";
      hh += "<li>Bonificación extraordinaria (" + (coRead(root, "seguro") === "eps" ? "6,75 %, con EPS" : "9 %, lo que tu empleador pagaría a EsSalud") + "): <strong>" + pen(r.bono) + "</strong></li></ul>";
      hh += r.trunca ? "<p>Al terminar el vínculo, la gratificación trunca se paga con la liquidación de beneficios sociales, dentro de las 48 horas siguientes al cese.</p>"
        : "<p>Se paga en la primera quincena de " + (sv[0] === "jul" ? "julio" : "diciembre") + ": <strong>a más tardar el " + long(parse(r.pago)) + "</strong>.</p>";
      hh += '<p class="hint">La gratificación y la bonificación no tienen descuentos de AFP, ONP ni EsSalud, pero sí cuentan para el impuesto a la renta de quinta categoría. Cálculo orientativo.</p>';
      res.innerHTML = hh; res.focus();
    });
  }
  function toolPeVac(root) {
    var form = root.querySelector("form"), res = root.querySelector(".result"), f = root.querySelector('[name="fecha"]'), s = root.querySelector('[name="salida"]');
    if (!f.value) f.value = todayIso();
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var sal = parseFloat(coRead(root, "sal")), ing = coRead(root, "ingreso"), reg = coRead(root, "regimen");
      var n = parseInt(coRead(root, "ndias"), 10) || 0, sat = root.querySelector('[name="sat"]').checked;
      res.hidden = false; res.classList.remove("warn");
      if (!ing || !f.value || ing > f.value) { res.classList.add("warn"); res.innerHTML = "Indica tu fecha de ingreso y una fecha de cálculo posterior."; return; }
      if (!(sal > 0)) { res.classList.add("warn"); res.innerHTML = "Indica tu sueldo mensual."; return; }
      var r = calcPeVac({ sueldo: sal, af: root.querySelector('[name="af"]').checked, ingreso: ing, fecha: f.value, gozados: parseFloat(coRead(root, "gozados")) || 0, regimen: reg });
      var N = function (x) { return x.toLocaleString("es-PE", { maximumFractionDigits: 2 }); };
      var hh = '<div class="hint">Al ' + long(parse(f.value)) + ' tienes pendientes</div><div class="big">' + N(r.pendientes) + " días de vacaciones</div>";
      hh += "<p>" + r.anios + (r.anios === 1 ? " año completo" : " años completos") + " de servicio × " + r.base + " días = " + r.ganados + " días ganados, menos los ya gozados. Remuneración vacacional: " + pen(r.rc) + " al mes" + (r.af ? " (con asignación familiar)" : "") + ".</p>";
      if (r.vencidos) hh += "<p><strong>Ojo:</strong> " + N(r.vencidos) + " de esos días se ganaron hace más de un año y no los gozaste a tiempo: además de la remuneración vacacional, te corresponde una <strong>indemnización de " + pen(r.indemnizacion) + "</strong> (artículo 23 del Decreto Legislativo 713).</p>";
      hh += "<p>Del año en curso llevas " + r.resto + " días: " + N(r.truncas) + " días de vacaciones truncas. Si tu contrato terminara hoy, te pagarían <strong>" + pen(r2(r.valorPend + r.indemnizacion + r.valorTruncas)) + "</strong> por vacaciones (" + pen(r.valorPend) + " de las pendientes" + (r.vencidos ? ", " + pen(r.indemnizacion) + " de indemnización" : "") + " y " + pen(r.valorTruncas) + " de las truncas).</p>";
      if (s.value && n > 0) {
        if (!inRange(s.value)) hh += '<p class="hint">Para calcular la fecha de regreso con feriados, la salida debe estar entre el ' + rangeText() + ".</p>";
        else {
          var g = peRegreso(peHolidays(), s.value, n, sat);
          if (!inRange(g.regreso)) hh += '<p class="hint">La fecha de regreso cae fuera del periodo con feriados.</p>';
          else {
            hh += "<p>Si sales el " + long(parse(s.value)) + " con " + n + " días calendario, tu último día de vacaciones es el " + long(parse(g.ultimo)) + " y <strong>vuelves al trabajo el " + long(parse(g.regreso)) + "</strong>.</p>";
            if (g.festivos.length) hh += '<p class="hint">Los feriados que caen dentro de tus vacaciones cuentan como días de vacaciones: ' + g.festivos.map(function (x) { return long(parse(x)); }).join("; ") + ".</p>";
          }
        }
      }
      hh += '<p class="hint">Para ganar las vacaciones hace falta el récord vacacional: al menos 260 días de trabajo efectivo en el año si trabajas 6 días a la semana, o 210 si trabajas 5. Cálculo orientativo.</p>';
      res.innerHTML = hh; res.focus();
    });
  }
  function cop(x) { return x.toLocaleString("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 }); }
  function toolPrima(root) {
    var form = root.querySelector("form"), res = root.querySelector(".result");
    var semSel = root.querySelector('[name="sem"]'), now = parse(todayIso());
    if (!semSel.getAttribute("data-set")) semSel.value = now.getUTCMonth() < 6 ? "1" : "2";
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var sal = parseFloat(root.querySelector('[name="sal"]').value), sem = +semSel.value, ing = root.querySelector('[name="ingreso"]').value;
      var noLab = parseInt(root.querySelector('[name="nolab"]').value, 10) || 0;
      res.hidden = false; res.classList.remove("warn");
      if (!(sal > 0)) { res.classList.add("warn"); res.innerHTML = "Escribe tu salario mensual."; return; }
      var r = calcPrima(sal, sem, 2026, ing, noLab);
      var html = '<div class="hint">Prima del ' + (sem === 1 ? "primer" : "segundo") + ' semestre de 2026</div><div class="big">' + cop(r.prima) + "</div>";
      html += "<ul><li>Base: <strong>" + cop(r.base) + "</strong>" + (r.auxilio ? " (salario + auxilio de transporte de " + cop(r.auxilio) + ")" : " (sin auxilio de transporte: ganas más de 2 salarios mínimos)") + "</li>";
      html += "<li>Días trabajados en el semestre: <strong>" + r.dias + " de 180</strong></li>";
      html += "<li>Fórmula: base × días ÷ 360</li></ul>";
      html += '<p>Se paga ' + (sem === 1 ? "a más tardar el <strong>30 de junio</strong>" : "a más tardar el <strong>20 de diciembre</strong>") + ".</p>";
      if (sal < CO_2026.smmlv) html += '<p class="hint">Ojo: el salario es menor que el mínimo de 2026 (' + cop(CO_2026.smmlv) + "). Si trabajas medio tiempo, la prima es proporcional.</p>";
      html += '<p class="hint">Si tu salario es variable, usa el promedio del semestre. Cálculo orientativo.</p>';
      res.innerHTML = html; res.focus();
    });
  }

  /* ---------- vacaciones pendientes (España, art. 38 ET) ---------- */
  // anual: días al año según convenio; unidad: naturales | laborables
  function calcVacaciones(year, desde, hasta, anual, usados) {
    var a = parse(year + "-01-01"), b = parse(year + "-12-31");
    var d1 = desde && desde > iso(a) ? parse(desde) : a, d2 = hasta && hasta < iso(b) ? parse(hasta) : b;
    var total = daysBetween(a, b) + 1, per = Math.max(0, daysBetween(d1, d2) + 1);
    var gen = anual * per / total;
    return { periodo: per, total: total, generados: gen, redondeados: Math.ceil(gen - 1e-9), pendientes: gen - (usados || 0) };
  }
  function toolVacCalc(root) {
    var form = root.querySelector("form"), res = root.querySelector(".result");
    var Y = parse(todayIso()).getUTCFullYear(), ys = root.querySelector('[name="year"]');
    if (ys && !ys.options.length) [Y, Y + 1].forEach(function (y) { var o = document.createElement("option"); o.value = y; o.textContent = y; ys.appendChild(o); });
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var year = +ys.value, anual = parseFloat(root.querySelector('[name="anual"]').value), unidad = root.querySelector('[name="unidad"]').value;
      var desde = root.querySelector('[name="desde"]').value, hasta = root.querySelector('[name="hasta"]').value;
      var usados = parseFloat(root.querySelector('[name="usados"]').value) || 0, salario = parseFloat(root.querySelector('[name="salario"]').value);
      res.hidden = false; res.classList.remove("warn");
      if (!(anual > 0)) { res.classList.add("warn"); res.innerHTML = "Indica cuántos días de vacaciones tienes al año."; return; }
      if (unidad === "naturales" && anual < 30) { res.classList.add("warn"); res.innerHTML = "El mínimo legal son 30 días naturales al año (art. 38 del Estatuto de los Trabajadores)."; return; }
      if (desde && hasta && hasta < desde) { res.classList.add("warn"); res.innerHTML = "La fecha de fin es anterior a la de inicio."; return; }
      var r = calcVacaciones(year, desde, hasta, anual, usados), u = unidad === "naturales" ? "días naturales" : "días laborables";
      var f = function (x) { return (Math.round(x * 100) / 100).toLocaleString("es-ES"); };
      var html = '<div class="hint">Te ' + (r.pendientes >= 0 ? "quedan" : "has pasado en") + '</div><div class="big">' + f(Math.abs(r.pendientes)) + " " + u + "</div>";
      html += "<ul><li>Generados en " + year + ": <strong>" + f(r.generados) + " " + u + "</strong> (" + r.periodo + " de " + r.total + " días del año" + (r.periodo < r.total ? ", proporcional" : "") + "). Redondeando a favor: " + r.redondeados + ".</li>";
      html += "<li>Ya disfrutados: " + f(usados) + "</li></ul>";
      if (salario > 0 && r.pendientes > 0) {
        var nat = unidad === "naturales" ? r.pendientes : r.pendientes * 30 / 22;
        html += "<p>Si terminas el contrato sin disfrutarlos, te los deben pagar en el finiquito: unos <strong>" + (salario / 365 * nat).toLocaleString("es-ES", { style: "currency", currency: "EUR" }) + "</strong> brutos" + (unidad === "laborables" ? " (convertidos a días naturales)" : "") + ".</p>";
      }
      html += '<p class="hint">Mientras sigues en la empresa las vacaciones no se pueden cambiar por dinero: solo se pagan al terminar el contrato. Tu convenio puede darte más días o fijar otro redondeo.</p>';
      res.innerHTML = html; res.focus();
    });
  }

  /* ---------- días de libre disposición del profesorado ---------- */
  // S: calendario escolar {start, end, vac:[[a,b,n]], off:[[d,n,k]]}; R: reglas de la comunidad (data/docentes.py)
  function docInfo(S) {
    var off = {}, lect = [], pos = {};
    S.off.forEach(function (o) { off[o[0]] = o[1]; });
    for (var d = parse(S.start); iso(d) <= S.end; d = add(d, 1)) {
      var k = iso(d), w = dow(d);
      var inVac = S.vac.some(function (v) { return k >= v[0] && k <= v[1]; });
      if (w !== 0 && w !== 6 && !off[k] && !inVac) { pos[k] = lect.length; lect.push(k); }
    }
    return { off: off, lect: lect, pos: pos };
  }
  function docExcluded(S, R, I, k) {
    var why = [], i = I.pos[k];
    if (i === undefined) return why;
    if (R.excl_inicio && i < R.excl_inicio) why.push("Es uno de los " + R.excl_inicio + " primeros días lectivos del curso.");
    if (R.excl_fin && i >= I.lect.length - R.excl_fin) why.push("Es uno de los " + R.excl_fin + " últimos días lectivos del curso.");
    if (R.excl_vac !== null && R.excl_vac !== undefined) {
      var n = R.excl_vac || 1;
      S.vac.forEach(function (v) {
        if (!/Navidad|Santa|Pascua/i.test(v[2])) return;
        var before = I.lect.filter(function (x) { return x < v[0]; }).slice(-n), after = I.lect.filter(function (x) { return x > v[1]; }).slice(0, n);
        var vn = v[2].charAt(0).toLowerCase() + v[2].slice(1);
        if (before.indexOf(k) >= 0) why.push(n === 1 ? "Es el día lectivo anterior a las " + vn + "." : "Está entre los " + n + " días lectivos anteriores a las " + vn + ".");
        if (after.indexOf(k) >= 0) why.push(n === 1 ? "Es el día lectivo posterior a las " + vn + "." : "Está entre los " + n + " días lectivos posteriores a las " + vn + ".");
      });
    }
    return why;
  }
  // Último día para pedirlo (antelación en días naturales o hábiles, sin fines de semana ni festivos)
  function docDeadline(R, k, hol) {
    if (!R.antelacion) return null;
    var n = R.antelacion[0], d = parse(k);
    if (R.antelacion[1] === "naturales") return iso(add(d, -n));
    var c = 0;
    while (c < n) { d = add(d, -1); if (dow(d) !== 0 && dow(d) !== 6 && !hol[iso(d)]) c++; }
    return iso(d);
  }
  function docEarliest(R, k) {
    if (!R.max_meses) return null;
    var d = parse(k), y = d.getUTCFullYear(), m = d.getUTCMonth() - R.max_meses, dd = d.getUTCDate(), last = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
    return iso(new Date(Date.UTC(y, m, Math.min(dd, last))));
  }
  function docCheck(S, R, k, hol) {
    var I = docInfo(S), w = dow(parse(k)), year = +S.start.slice(0, 4);
    var r = { fecha: k, tipo: "", motivo: "", excl: [], limite: null, desde: null };
    if (k < year + "-09-01" || k > (year + 1) + "-06-30") { r.tipo = "fuera"; return r; }
    if (w === 0 || w === 6) { r.tipo = "libre"; r.motivo = "Es fin de semana."; return r; }
    if (hol[k]) { r.tipo = "libre"; r.motivo = "Es festivo: " + hol[k].name + "."; return r; }
    if (k < S.start || k > S.end) { r.tipo = "nolectivo"; r.motivo = k < S.start ? "Aún no han empezado las clases: es periodo no lectivo." : "Ya han terminado las clases: es periodo no lectivo."; }
    else if (I.off[k]) { r.tipo = "libre"; r.motivo = "No hay clase: " + I.off[k] + "."; return r; }
    else if (S.vac.some(function (v) { return k >= v[0] && k <= v[1]; })) { r.tipo = "libre"; r.motivo = "Es periodo de vacaciones escolares."; return r; }
    else { r.tipo = "lectivo"; r.excl = docExcluded(S, R, I, k); }
    r.limite = docDeadline(R, k, hol); r.desde = docEarliest(R, k);
    return r;
  }
  // Días lectivos que más descanso dan: el día pedido + los días sin clase pegados a él
  function docRecommend(S, R, hol, desde, n) {
    var I = docInfo(S), free = function (k) { return k >= S.start && k <= S.end && I.pos[k] === undefined; };
    var out = [];
    I.lect.forEach(function (k) {
      if (k < desde || hol[k]) return;
      if (docExcluded(S, R, I, k).length) return;
      var lim = docDeadline(R, k, hol);
      if (lim && lim < desde) return; // ya no da tiempo a pedirlo
      var a = parse(k), b = parse(k);
      while (free(iso(add(a, -1)))) a = add(a, -1);
      while (free(iso(add(b, 1)))) b = add(b, 1);
      var len = daysBetween(a, b) + 1;
      if (len >= 4) out.push({ fecha: k, desde: iso(a), hasta: iso(b), dias: len, limite: lim });
    });
    out.sort(function (x, y) { return y.dias - x.dias || (x.fecha < y.fecha ? -1 : 1); });
    var picked = [], tri = function (k) { var v = S.vac.filter(function (v) { return /Navidad|Santa|Pascua/i.test(v[2]); }).map(function (v) { return v[0]; }).sort(); var t = 0; v.forEach(function (x) { if (k > x) t++; }); return t; }, usedTri = {};
    out.forEach(function (o) {
      if (picked.length >= n) return;
      if (picked.some(function (p) { return !(o.hasta < p.desde || o.desde > p.hasta); })) return; // mismo puente o vacaciones
      if (R.trimestres && usedTri[tri(o.fecha)]) return;
      picked.push(o); usedTri[tri(o.fecha)] = 1;
    });
    return picked.sort(function (x, y) { return x.fecha < y.fecha ? -1 : 1; });
  }
  function toolDocentes(root) {
    var D = JSON.parse(document.getElementById("doc-data").textContent);
    var reg = root.querySelector('[name="region"]'), ccaa = root.querySelector('[name="ccaa"]'), place = root.querySelector('[name="place"]');
    var fecha = root.querySelector('[name="fecha"]'), res = root.querySelector(".result"), info = root.querySelector("[data-rules]");
    var FL = new Intl.DateTimeFormat("es-ES", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });
    var f = function (k) { return FL.format(parse(k)); };
    Object.keys(D).forEach(function (key) { var o = document.createElement("option"); o.value = key; o.textContent = D[key].name; reg.appendChild(o); });
    var saved = store("ch_ccaa"); if (saved) { var m = Object.keys(D).filter(function (k) { return D[k].ccaa === saved; })[0]; if (m) reg.value = m; }
    function cur() { return D[reg.value]; }
    function syncPlaces() { ccaa.value = cur().ccaa; place.setAttribute("data-keep", ccaa.value === store("ch_ccaa") ? store("ch_place") || "" : ""); fillPlaces(ccaa, place); }
    function calendar() {
      var c = cur(), hol = esHolidays(c.ccaa, place.value), S = JSON.parse(JSON.stringify(c.cfg)), have = {};
      S.off.forEach(function (o) { have[o[0]] = 1; });
      Object.keys(hol).forEach(function (d) { if (hol[d].kind === "loc" && d >= S.start && d <= S.end && !have[d]) S.off.push([d, hol[d].name, "fes"]); });
      return { S: S, hol: hol };
    }
    function rules() {
      var R = cur().reglas, L = [];
      L.push("<strong>" + R.dias + " días por curso</strong>" + (R.lectivos ? ", hasta " + R.lectivos + " en días de clase" : "") + ".");
      if (R.extra) L.push(esc(R.extra));
      if (R.antelacion) L.push("Antelación: al menos " + R.antelacion[0] + " días " + (R.antelacion[1] === "habiles" ? "hábiles" : "naturales") + (R.max_meses ? " y como máximo " + R.max_meses + " meses" : "") + ".");
      if (R.limite) L.push(esc(R.limite));
      info.innerHTML = '<p class="small">' + (R.estado === "borrador" ? '<span class="tag aut">Pendiente de confirmar</span> ' : "") + L.join(" ") + ' <a href="#r-' + cur().ccaa + '">Ver todas las condiciones</a>.</p>';
    }
    function run() {
      var c = cur(), R = c.reglas, X = calendar(), t = todayIso(), html = "";
      res.hidden = false; res.classList.remove("warn");
      if (fecha.value) {
        var r = docCheck(X.S, R, fecha.value, X.hol);
        html += '<div class="hint">' + cap(f(fecha.value)) + "</div>";
        if (r.tipo === "fuera") html += "<p>Esa fecha está fuera del curso 2026-2027 (del 1 de septiembre al 30 de junio).</p>";
        else if (r.tipo === "libre") html += '<div class="big">No hace falta pedirlo</div><p>' + esc(r.motivo) + "</p>";
        else {
          html += r.excl.length ? '<div class="big">Probablemente no te lo concedan</div><ul>' + r.excl.map(function (x) { return "<li>" + esc(x) + "</li>"; }).join("") + "</ul>"
                               : '<div class="big">' + (r.tipo === "lectivo" ? "Día lectivo: se puede pedir" : "Día no lectivo: se puede pedir") + "</div>";
          if (r.tipo === "nolectivo") html += "<p>" + esc(r.motivo) + "</p>";
          if (r.limite) html += "<p><strong>Pídelo como tarde el " + f(r.limite) + "</strong>" + (r.desde ? " y no antes del " + f(r.desde) : "") + "." + (r.limite < t ? ' <span class="tag">Ya ha pasado el plazo</span>' : "") + "</p>";
        }
      }
      var desde = t > X.S.start ? t : X.S.start;
      var N = R.lectivos || 2, rec = docRecommend(X.S, R, X.hol, desde, Math.max(N, 4));
      html += "<h3>Los días de clase que más descanso te dan</h3>";
      if (!rec.length) html += "<p>No quedan días lectivos que permitan encadenar descanso en lo que queda de curso.</p>";
      else html += "<ul>" + rec.map(function (o) { return "<li><strong>" + cap(f(o.fecha)) + "</strong>: descansas " + o.dias + " días seguidos (del " + f(o.desde) + " al " + f(o.hasta) + ")" + (o.limite ? '. <span class="small">Pídelo antes del ' + f(o.limite) + (o.limite < t ? " (plazo pasado)" : "") + "</span>" : "") + "</li>"; }).join("") + "</ul>";
      html += '<p class="hint">' + (R.lectivos ? "Tienes " + R.lectivos + " días lectivos: elige entre estos. " : "") + "No conocemos las fechas de evaluación de tu centro ni cuántos compañeros lo han pedido ya: la concesión depende siempre de la dirección.</p>";
      res.innerHTML = html;
    }
    reg.addEventListener("change", function () { store("ch_ccaa", cur().ccaa); syncPlaces(); rules(); res.hidden = true; });
    place.addEventListener("change", function () { store("ch_place", place.value); });
    root.querySelector("form").addEventListener("submit", function (e) { e.preventDefault(); run(); });
    syncPlaces(); rules();
  }

  /* ---------- compartir ---------- */
  function shareUrl(extra) { return location.origin + location.pathname + (extra || ""); }
  function doShare(text, url) {
    if (navigator.share) { navigator.share({ title: document.title, text: text, url: url }).catch(function () {}); return; }
    window.open("https://wa.me/?text=" + encodeURIComponent(text + " " + url), "_blank", "noopener");
  }
  function shareBar(text, url) {
    return '<div class="sharebar"><a class="btn alt small-btn" href="https://wa.me/?text=' + encodeURIComponent(text + " " + url) + '" target="_blank" rel="noopener">Enviar por WhatsApp</a>' +
      '<button class="btn alt small-btn" type="button" data-copylink="' + esc(url) + '">Copiar enlace</button></div>';
  }
  // Resultados con enlace: los campos del formulario viajan en la URL y se recalculan al abrirla
  var FORM_TOOLS = { renta: 1, baja: 1, laborables: 1, devolucion: 1, jubilacion: 1, despido: 1, paro: 1, nacimiento: 1, plazos: 1, dias: 1, horas: 1, permisos: 1, vacaciones: 1, judiciales: 1, aguinaldo: 1, prima: 1, vaccalc: 1, mxvac: 1, mxfin: 1, coces: 1, covac: 1, coliq: 1, pects: 1, pegrat: 1, pevac: 1 };
  function formQuery(form) {
    var q = new URLSearchParams();
    form.querySelectorAll("input[name], select[name]").forEach(function (f) {
      if (f.type === "radio") { if (f.checked) q.set(f.name, f.value); }
      else if (f.type === "checkbox") { if (f.checked) q.set(f.name, "1"); }
      else if (f.type !== "hidden" && f.value !== "") q.set(f.name, f.value);
    });
    return "?" + q.toString();
  }
  function prefill(root, p) {
    var form = root.querySelector("form"); if (!form) return false;
    var any = false, order = ["country", "ccaa", "place"];
    order.concat(Array.from(p.keys()).filter(function (k) { return order.indexOf(k) < 0; })).forEach(function (k) {
      if (!p.has(k)) return;
      var v = p.get(k), fs = form.querySelectorAll('[name="' + k + '"]');
      fs.forEach(function (f) {
        if (f.type === "radio") { f.checked = f.value === v; if (f.checked) { any = true; f.dispatchEvent(new Event("change")); } }
        else if (f.type === "checkbox") { f.checked = v === "1"; any = true; }
        else if (f.type !== "hidden") { f.value = v; any = true; f.dispatchEvent(new Event("change")); }
      });
    });
    return any;
  }
  function wireShare(root) {
    var form = root.querySelector("form"), res = root.querySelector(".result");
    if (!form || !res) return;
    form.addEventListener("submit", function () {
      setTimeout(function () {
        if (res.hidden || res.classList.contains("warn")) return;
        var q = formQuery(form), url = shareUrl(q);
        try { history.replaceState(null, "", q); } catch (e) {}
        var big = res.querySelector(".big"), txt = (document.querySelector("h1") || {}).textContent || document.title;
        res.insertAdjacentHTML("beforeend", shareBar(txt + (big ? ": " + big.textContent : ""), url));
      }, 0);
    });
  }

  function init() {
    var p = new URLSearchParams(location.search);
    document.querySelectorAll("[data-tool]").forEach(function (el) {
      var t = el.getAttribute("data-tool");
      if (t === "next" && p.get("ccaa") && el.hasAttribute("data-embed")) el.setAttribute("data-ccaa", p.get("ccaa"));
      try {
        if (t === "next") toolNext(el);
        else if (t === "plazos") toolPlazos(el);
        else if (t === "dias") toolDias(el);
        else if (t === "horas") toolHoras(el);
        else if (t === "permisos") toolPermisos(el);
        else if (t === "embedcode") toolEmbedCode(el);
        else if (t === "sep") toolSep(el);
        else if (t === "escolar") toolSep(el, JSON.parse(el.getAttribute("data-cfg")));
        else if (t === "vacaciones") toolVacaciones(el);
        else if (t === "judiciales") toolJudiciales(el);
        else if (t === "buscar") toolBuscar(el);
        else if (t === "aguinaldo") toolAguinaldo(el);
        else if (t === "mxvac") toolMxVac(el);
        else if (t === "mxfin") toolMxFiniquito(el);
        else if (t === "coces") toolCoCes(el);
        else if (t === "covac") toolCoVac(el);
        else if (t === "coliq") toolCoLiq(el);
        else if (t === "pects") toolPeCts(el);
        else if (t === "pegrat") toolPeGrat(el);
        else if (t === "pevac") toolPeVac(el);
        else if (t === "prima") toolPrima(el);
        else if (t === "vaccalc") toolVacCalc(el);
        else if (t === "docentes") toolDocentes(el);
        else if (t === "nacimiento") toolNacimiento(el);
        else if (t === "despido") toolDespido(el);
        else if (t === "paro") toolParo(el);
        else if (t === "jubilacion") toolJubilacion(el);
        else if (t === "devolucion") toolDevolucion(el);
        else if (t === "renta") toolRenta(el);
        else if (t === "baja") toolBaja(el);
        else if (t === "laborables") toolLaborables(el);
        if (FORM_TOOLS[t]) { wireShare(el); if (prefill(el, p)) { var fm = el.querySelector("form"); if (fm) fm.requestSubmit ? fm.requestSubmit() : fm.dispatchEvent(new Event("submit")); } }
      } catch (err) { if (window.console) console.error(err); }
    });
    document.querySelectorAll("[data-copy]").forEach(toolCopy);
  }

  window.CalendarioHabil = { setData: function (d) { DATA = d; }, mxVacDias: mxVacDias, calcMxVacaciones: calcMxVacaciones, calcMxFiniquito: calcMxFiniquito, calcCoCesantias: calcCoCesantias, calcCoVacaciones: calcCoVacaciones, coRegreso: coRegreso, calcCoIndemnizacion: calcCoIndemnizacion, calcCoLiquidacion: calcCoLiquidacion, calcPeGrat: calcPeGrat, calcPeCts: calcPeCts, calcPeVac: calcPeVac, peRegreso: peRegreso, peHolidays: peHolidays, peMeses: peMeses, esHolidays: esHolidays, mxHolidays: mxHolidays, coHolidays: coHolidays,
    calcDevolRenta: calcDevolRenta, calcBaja: calcBaja, calcPlazo: calcPlazo, countHabiles: countHabiles, shiftHabiles: shiftHabiles, calcHoras: calcHoras, calcPermiso: calcPermiso, planVacaciones: planVacaciones, docCheck: docCheck, docRecommend: docRecommend, docDeadline: docDeadline, calcAguinaldo: calcAguinaldo, calcPrima: calcPrima, calcVacaciones: calcVacaciones, days360: days360, calcJudicial: calcJudicial, mergeHol: mergeHol, computoDays: computoDays, adminReason: adminReason, judReason: judReason, icsPlazo: icsPlazo, calcNacimiento: calcNacimiento, mesesTrabajo: mesesTrabajo, calcIndemnizacion: calcIndemnizacion, calcFiniquito: calcFiniquito, duracionParo: duracionParo, calcJubilacion: calcJubilacion, calcDevolucion: calcDevolucion, calcLaborables: calcLaborables, calcLactancia: calcLactancia, withNational: withNational, easter: easter, norm: norm, sepStatus: sepStatus, sepNextOff: sepNextOff, schoolStatus: schoolStatus, schoolNextOff: schoolNextOff, bridges: bridges, isoWeek: isoWeek };

  /* Calendarios estáticos: marcar hoy e imprimir (funciona sin cargar datos) */
  if (document.querySelectorAll) {
    document.querySelectorAll('td[data-d="' + todayIso() + '"]').forEach(function (c) { c.classList.add("today"); });
    document.querySelectorAll(".cal").forEach(function (cal) { if (!cal.querySelector("td.today")) cal.querySelectorAll(".lg.today").forEach(function (l) { l.hidden = true; }); });
    document.addEventListener("click", function (e) {
      if (!e.target.closest) return;
      document.querySelectorAll("details.more[open]").forEach(function (d) { if (!d.contains(e.target)) d.removeAttribute("open"); });
      if (e.target.closest("[data-print]")) window.print();
      var sh = e.target.closest("[data-share]");
      if (sh) { var h = document.querySelector("[data-livecal-title]") || document.querySelector("h1"); doShare((h ? h.textContent : document.title) + " · Calendario Hábil", location.href); }
      var cl = e.target.closest("[data-copylink]");
      if (cl) { try { navigator.clipboard.writeText(cl.getAttribute("data-copylink")); cl.textContent = "Enlace copiado"; } catch (err) {} }
    });
  }
  /* ¿Te ha sido útil? y formulario de dudas: envía a /api/pregunta y, si no está disponible, abre el correo */
  function sendMsg(payload, box, mail, pl) {
    var done = function (ok) {
      if (ok) {
        var t = /^empresas/.test(payload.tipo || "") ? "Gracias, lo hemos recibido. Te escribiremos pronto a tu correo." : "Gracias, lo hemos recibido. Lo revisamos y, si es un error, lo corregimos en la web.";
        if (pl && !payload.email) t += ' Como no has dejado correo, no podremos contestarte: si tu duda puede servir a más gente, la responderemos en <a href="' + pl + '">Preguntas de los lectores</a>.';
        else if (payload.email && !/^empresas/.test(payload.tipo || "")) t += " Te contestaremos a tu correo.";
        box.innerHTML = '<p class="fbok">' + t + "</p>"; return;
      }
      var body = "Página: " + location.href + "\n\n" + (payload.msg || "");
      box.insertAdjacentHTML("beforeend", '<p class="hint">No se ha podido enviar desde aquí. <a href="mailto:' + mail + "?subject=" + encodeURIComponent("Calendario Hábil: " + (payload.tipo || "comentario")) + "&body=" + encodeURIComponent(body) + '">Envíalo por correo</a>.</p>');
    };
    postForm("pregunta", payload, done);
  }
  /* Envío de formularios: primero a Google Apps Script (no le afectan los bloqueos de LaLiga)
     y, si falla o no está configurado, a la función de Cloudflare. */
  function postForm(accion, payload, done) {
    var forms = body.getAttribute("data-forms") || "";
    var viaCf = function () {
      try {
        fetch(API + "/api/" + accion, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) })
          .then(function (r) { done(r.ok); }).catch(function () { done(false); });
      } catch (e) { done(false); }
    };
    if (!forms) { viaCf(); return; }
    var p = {}; for (var k in payload) p[k] = payload[k]; p.accion = accion;
    try {
      // text/plain: petición simple, sin preflight (Apps Script no responde a OPTIONS)
      fetch(forms, { method: "POST", body: JSON.stringify(p) })
        .then(function (r) { return r.json(); })
        .then(function (j) { if (j && j.ok) done(true); else viaCf(); })
        .catch(viaCf);
    } catch (e) { viaCf(); }
  }
  document.querySelectorAll("[data-feedback]").forEach(function (fb) {
    var mail = fb.getAttribute("data-mail");
    fb.addEventListener("click", function (e) {
      var b = e.target.closest("button[data-util]"); if (!b) return;
      var v = b.getAttribute("data-util");
      if (v === "si") { fb.innerHTML = '<p class="fbok">¡Gracias! Si te ha servido, compártela con quien la necesite.</p>'; store("ch_fb_" + location.pathname, "si"); return; }
      fb.innerHTML = '<form class="fbform"><label for="fbmsg">¿Qué faltaba o qué está mal?</label><textarea id="fbmsg" name="msg" rows="3" maxlength="2000" required></textarea>' +
        '<input type="text" name="web" tabindex="-1" autocomplete="off" class="hp" aria-hidden="true"><p class="hint">No incluyas datos personales. Desde aquí no podemos contestarte: si quieres respuesta, usa el <a href="' + link("dudas-y-sugerencias/") + '">formulario de dudas</a> y deja tu correo.</p><button class="btn small-btn" type="submit">Enviar</button></form>';
      fb.querySelector("form").addEventListener("submit", function (ev) {
        ev.preventDefault(); var f = ev.target;
        sendMsg({ tipo: "mejora", page: location.pathname, msg: f.msg.value, web: f.web.value }, fb, mail);
      });
      fb.querySelector("textarea").focus();
    });
  });
  document.querySelectorAll("form[data-ask]").forEach(function (f) {
    var box = f.parentNode, mail = f.getAttribute("data-mail");
    f.addEventListener("submit", function (ev) {
      ev.preventDefault();
      if (!f.msg.value.trim()) return;
      if (f.email.required && !f.email.value.trim()) { f.email.focus(); return; }
      var btn = f.querySelector("button[type=submit]");
      // sin correo: avisar una vez de que no podremos contestar, antes de enviar
      if (!f.email.required && !f.email.value.trim() && !f._sinCorreo) {
        f._sinCorreo = true;
        var w = document.createElement("p"); w.className = "note"; w.setAttribute("role", "alert");
        w.innerHTML = "<strong>No has dejado tu correo:</strong> así no podremos contestarte. Escríbelo arriba o, si no quieres respuesta, pulsa «Enviar sin correo».";
        btn.parentNode.insertBefore(w, btn); btn.textContent = "Enviar sin correo";
        f.email.addEventListener("input", function () { btn.textContent = f.email.value.trim() ? "Enviar" : "Enviar sin correo"; });
        f.email.focus(); return;
      }
      btn.disabled = true;
      // campos adicionales (p. ej. empresa, uso previsto) se añaden al mensaje
      var extra = Array.prototype.map.call(f.querySelectorAll("[data-extra]"), function (x) { return x.value.trim() ? x.getAttribute("data-extra") + ": " + x.value.trim() : ""; }).filter(Boolean).join("\n");
      sendMsg({ tipo: f.tipo.value, page: f.page.value || location.pathname, msg: (extra ? extra + "\n\n" : "") + f.msg.value, email: f.email.value, web: f.web.value }, box, mail, f.getAttribute("data-pl"));
      f.hidden = true;
    });
  });

  /* Suscripción al calendario en ordenadores Windows o Linux: los enlaces webcal:// no tienen
     aplicación asociada si no hay Outlook instalado y el navegador muestra «Elegir una aplicación».
     Ahí, en lugar de abrir el enlace, se ofrece un menú con Outlook.com, Google Calendar, el
     archivo .ics y la aplicación del equipo. En móviles y Mac el enlace se abre como siempre. */
  var UA = typeof navigator !== "undefined" ? navigator.userAgent || "" : "";
  var SUB_MENU = /Windows|Linux|CrOS/.test(UA) && !/Android/.test(UA);
  function closeSubMenu() { var m = document.querySelector(".submenu"); if (m) m.parentNode.removeChild(m); }
  if (SUB_MENU) document.addEventListener("click", function (ev) {
    var a = ev.target.closest ? ev.target.closest('a[href^="webcal:"]') : null;
    if (!a) { if (!ev.target.closest || !ev.target.closest(".submenu")) closeSubMenu(); return; }
    ev.preventDefault();
    var cur = document.querySelector(".submenu"), open = cur && cur._from === a;
    closeSubMenu();
    if (open) return;
    var webcal = a.getAttribute("href"), https = webcal.replace(/^webcal:/, "https:");
    var h1 = document.querySelector("h1"), name = ((h1 && h1.textContent) || "Calendario Hábil").trim().slice(0, 80);
    var m = document.createElement("div");
    m.className = "submenu"; m.setAttribute("role", "menu");
    m.innerHTML = '<p class="small">Elige dónde añadirlo (se actualiza solo):</p>' +
      '<a role="menuitem" rel="noopener" target="_blank" href="https://outlook.live.com/calendar/0/addfromweb?url=' + encodeURIComponent(https) + "&name=" + encodeURIComponent(name) + '">Outlook.com / Hotmail</a>' +
      '<a role="menuitem" rel="noopener" target="_blank" href="https://calendar.google.com/calendar/r?cid=' + encodeURIComponent(webcal) + '">Google Calendar</a>' +
      '<a role="menuitem" data-webcal href="' + esc(webcal) + '">Outlook de escritorio u otra aplicación del equipo</a>' +
      '<a role="menuitem" download href="' + esc(https) + '">Descargar el archivo .ics (no se actualiza solo)</a>';
    m._from = a;
    var r = a.getBoundingClientRect(), sx = window.pageXOffset || 0, sy = window.pageYOffset || 0;
    m.style.top = (r.bottom + sy + 6) + "px";
    m.style.left = Math.max(8, Math.min(r.left + sx, sx + document.documentElement.clientWidth - 340)) + "px";
    document.body.appendChild(m);
    m.querySelector("[data-webcal]").addEventListener("click", function (e) { e.stopPropagation(); closeSubMenu(); });
    m.querySelector("a").focus();
  });
  if (SUB_MENU) document.addEventListener("keydown", function (e) { if (e.key === "Escape") closeSubMenu(); });

  /* Aviso por correo de los festivos del año siguiente */
  document.querySelectorAll("form[data-aviso]").forEach(function (f) {
    f.addEventListener("submit", function (ev) {
      ev.preventDefault();
      var email = f.email.value.trim(), msg = f.querySelector(".qs-msg");
      if (!msg) { msg = document.createElement("p"); msg.className = "small qs-msg"; f.appendChild(msg); }
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { msg.textContent = "Escribe un correo válido."; f.email.focus(); return; }
      if (!f.ok.checked) { msg.textContent = "Marca la casilla para que podamos guardar tu correo."; return; }
      var btn = f.querySelector("button"); btn.disabled = true;
      var done = function (ok) {
        if (ok) { f.innerHTML = '<p class="fbok">Hecho. Te escribiremos cuando se publiquen los festivos de 2028.</p>'; return; }
        btn.disabled = false;
        msg.innerHTML = 'No se ha podido guardar. <a href="mailto:' + f.getAttribute("data-mail") + "?subject=" + encodeURIComponent("Avisadme de los festivos de 2028") + "&body=" + encodeURIComponent("Lugar: " + f.lugar.value) + '">Pídelo por correo</a>.';
      };
      postForm("aviso", { email: email, lugar: f.lugar.value, ok: true, web: f.web.value }, done);
    });
  });

  if (!document.querySelector("[data-tool]") && !document.querySelector("[data-copy]")) return;
  var inline = document.getElementById("ch-data");
  if (inline) { DATA = JSON.parse(inline.textContent); init(); return; }
  fetch(ROOT + "assets/data.json" + (body.getAttribute("data-dv") ? "?v=" + body.getAttribute("data-dv") : "")).then(function (r) { return r.json(); }).then(function (j) { DATA = j; init(); })
    .catch(function () { document.querySelectorAll(".result").forEach(function (r) { r.hidden = false; r.textContent = "No se han podido cargar los datos. Recarga la página."; }); });
})();
