(function () {
  const veil = document.getElementById("vwf-veil");
  if (!veil) return;

  const sheet   = document.getElementById("vwf-sheet");
  const closeBtn = document.getElementById("vwf-close");
  const backBtn = document.getElementById("vwf-back");
  const nextBtn = document.getElementById("vwf-next");
  const footnote = document.getElementById("vwf-footnote");
  const panels  = Array.prototype.slice.call(veil.querySelectorAll(".vwf-panel"));
  const dots    = Array.prototype.slice.call(veil.querySelectorAll(".vwf-stepdot"));
  const el = (id) => document.getElementById(id);

  let opener = null;
  const state = {
    step: 1, maxStep: 1, service: null, unit: "in",
    wallW: 144, wallH: 96, env: "indoor", surface: "Painted drywall", obstructions: "",
    printW: 96, printH: 48, position: "centre", vertical: "even", orientation: "auto",
    name: "", email: "", phone: "", address: "", date: "", notes: "",
    photoName: "", artName: "", ack: false, reviewing: false, sent: false, ref: ""
  };

  /* ---------- units and formatting ---------- */
  const toM = (v) => (parseFloat(v) || 0) * VWF_UNITS[state.unit];
  const fromM = (m) => m / VWF_UNITS[state.unit];
  const round = (n, d) => Math.round(n * Math.pow(10, d)) / Math.pow(10, d);

  function fmt(m) {
    if (state.unit === "m")  return round(m, 2).toFixed(2) + " m";
    if (state.unit === "cm") {
      const cm = m * 100;
      return cm >= 100 ? (cm / 100).toFixed(2) + " m" : Math.round(cm) + " cm";
    }
    const totalIn = m / 0.0254, ft = Math.floor(totalIn / 12), inch = Math.round(totalIn - ft * 12);
    if (inch === 12) return (ft + 1) + "\u2032 0\u2033";
    return ft > 0 ? ft + "\u2032 " + inch + "\u2033" : inch + "\u2033";
  }
  const money = (n) => "$" + n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const sqm = (n) => round(n, 2).toFixed(2) + " m\u00b2";

  /* ---------- geometry, all internal maths in metres ---------- */
  function geo() {
    const isWall = state.service !== "panel";
    const wallW = toM(state.wallW), wallH = toM(state.wallH);
    const side = PRINTER_CONFIG.clearanceLeftRight.value;
    const top = PRINTER_CONFIG.clearanceCeiling.value;
    const bottom = state.vertical === "max"
      ? PRINTER_CONFIG.minFloorClearance.value
      : PRINTER_CONFIG.clearanceFloor.value;

    const envW = isWall ? Math.max(0, wallW - side * 2) : wallW;
    const envH = isWall
      ? Math.max(0, Math.min(PRINTER_CONFIG.maxPrintHeight.value, wallH - top - bottom))
      : wallH;

    const wantW = toM(state.printW), wantH = toM(state.printH);
    const printW = isWall ? Math.min(wantW, envW) : wantW;
    const printH = isWall ? Math.min(wantH, envH) : wantH;

    return {
      isWall, wallW, wallH, side, top, bottom, envW, envH, wantW, wantH, printW, printH,
      area: printW * printH,
      ceilingTooLow: isWall && wallH > 0 && wallH < PRINTER_CONFIG.minWallHeight.value,
      ceilingForFullHeight: PRINTER_CONFIG.maxPrintHeight.value + top + bottom
    };
  }

  function orientationOf(g) {
    if (state.orientation !== "auto") return state.orientation;
    if (Math.abs(g.printW - g.printH) < 0.02) return "square";
    return g.printW > g.printH ? "landscape" : "portrait";
  }

  /* ---------- printer capability validation ---------- */
  function capabilities() {
    const g = geo();
    const fails = [], reviews = [], passes = [];

    if (g.isWall) {
      if (g.ceilingTooLow) {
        fails.push({
          limit: "Minimum wall height (" + fmt(PRINTER_CONFIG.minWallHeight.value) + ")",
          detail: "Your wall height of " + fmt(g.wallH) + " is below the minimum. The rail would hit the ceiling, so the machine cannot be set up in this room.",
          suggest: "A room with at least " + fmt(PRINTER_CONFIG.minWallHeight.value) + " of floor-to-ceiling height is required."
        });
      } else {
        passes.push("Wall height clears the " + fmt(PRINTER_CONFIG.minWallHeight.value) + " minimum.");
      }

      if (g.wantH > g.envH + 0.001) {
        fails.push({
          limit: "Maximum print height here (" + fmt(g.envH) + ")",
          detail: "You asked for " + fmt(g.wantH) + ". This wall allows " + fmt(g.envH) +
                  " once " + fmt(g.top) + " of ceiling clearance and " + fmt(g.bottom) + " of floor clearance are removed" +
                  (g.envH >= PRINTER_CONFIG.maxPrintHeight.value - 0.001 ? ", and the machine tops out at " + fmt(PRINTER_CONFIG.maxPrintHeight.value) + "." : "."),
          suggest: "Allowable height: " + fmt(g.envH) + "."
        });
      } else if (g.wantH > 0) {
        passes.push("Print height of " + fmt(g.wantH) + " is within the " + fmt(g.envH) + " available.");
      }

      if (g.wantW > g.envW + 0.001) {
        fails.push({
          limit: "Maximum print width here (" + fmt(g.envW) + ")",
          detail: "The printhead cannot reach within " + fmt(g.side) + " of each side wall, leaving " + fmt(g.envW) + " of printable width on a " + fmt(g.wallW) + " wall.",
          suggest: "Allowable width: " + fmt(g.envW) + "."
        });
      } else if (g.wantW > 0) {
        passes.push("Print width of " + fmt(g.wantW) + " fits inside the reachable area.");
      }

      if (g.wallH >= g.ceilingForFullHeight) {
        passes.push("Ceiling clears the mast, so the full " + fmt(PRINTER_CONFIG.maxPrintHeight.value) + " print height is reachable.");
      } else if (!g.ceilingTooLow) {
        reviews.push("Mast height is not confirmed (assumed " + fmt(PRINTER_CONFIG.mastHeight.value) + "). Reaching the full " + fmt(PRINTER_CONFIG.maxPrintHeight.value) + " print height needs about " + fmt(g.ceilingForFullHeight) + " of wall height.");
      }

      if (!PRINTER_CONFIG.maxWidthPerPass.confirmed) {
        reviews.push("Maximum width per continuous pass is not configured, so wide walls need confirmation on whether the machine repositions to continue.");
      }
      if (!PRINTER_CONFIG.minPrintHeight.confirmed || !PRINTER_CONFIG.minPrintableArea.confirmed) {
        reviews.push("Minimum print height and minimum job area are not configured.");
      }

      const supported = PRINTER_CONFIG.supportedSurfaces.value.indexOf(state.surface) !== -1;
      if (supported) passes.push(state.surface + " is a listed compatible surface.");
      else reviews.push("The surface you selected is not on the listed compatible surfaces, so it needs review.");
      if (VWF_TEXTURED.indexOf(state.surface) !== -1) reviews.push("Textured surfaces affect ink lay-down and are reviewed before quoting.");

      if (state.env === "outdoor") reviews.push("Outdoor restrictions are not configured, so outdoor work needs confirmation.");
      if (state.obstructions.trim()) reviews.push("Obstructions or difficult access were noted, which needs an on-site assessment.");
    } else {
      reviews.push("Maximum and minimum panel dimensions are not configured, so panel size needs confirmation.");
      if (g.printW > 0 && g.printH > 0) passes.push("Panel size recorded as " + fmt(g.printW) + " \u00d7 " + fmt(g.printH) + ".");
    }

    return { g, fails, reviews, passes, blocked: g.ceilingTooLow };
  }

  /* ---------- pricing, deterministic ---------- */
  function estimate() {
    const g = geo();
    const rate = g.isWall ? PRICING_CONFIG.wallRatePerM2 : PRICING_CONFIG.panelRatePerM2;
    const base = g.area * rate;

    const keys = [["minimumJob", "Minimum job charge"], ["designWork", "Design work"]];
    if (g.isWall) {
      keys.push(["wallPreparation", "Wall preparation"], ["travel", "Travel"]);
      if (VWF_TEXTURED.indexOf(state.surface) !== -1) keys.push(["texturedSurface", "Textured surface"]);
      if (state.env === "outdoor") keys.push(["outdoorWork", "Outdoor work"]);
      if (state.obstructions.trim()) keys.push(["difficultAccess", "Difficult access"]);
    } else {
      keys.push(["material", "Material"], ["materialThickness", "Material thickness"],
                ["mountingHardware", "Mounting hardware"], ["installation", "Installation"], ["shipping", "Shipping"]);
    }
    if (state.date) {
      const days = (new Date(state.date) - new Date()) / 86400000;
      if (days >= 0 && days <= 14) keys.push(["rushService", "Rush service"]);
    }

    const known = [], review = [];
    keys.forEach(function (k) {
      const v = PRICING_CONFIG[k[0]];
      if (v === null || v === undefined) review.push(k[1]);
      else known.push({ label: k[1], amount: v });
    });

    const total = known.reduce(function (sum, k) { return sum + k.amount; }, base);
    return { g, rate, base, known, review, total };
  }

  /* ---------- the drawing ---------- */
  function drawStage() {
    const g = geo();
    const stage = el("vwf-stage");
    const w = stage.clientWidth, h = stage.clientHeight;
    if (!w || !h || g.wallW <= 0 || g.wallH <= 0) return;

    const scale = Math.min((w - 96) / g.wallW, (h - 84) / g.wallH);
    const px = (m) => (m * scale) + "px";

    const wall = el("vwf-wall");
    wall.style.width = px(g.wallW);
    wall.style.height = px(g.wallH);
    wall.style.backgroundSize = px(0.5) + " " + px(0.5);

    const floor = el("vwf-floor");
    floor.style.width = px(g.wallW);
    floor.style.height = px(Math.min(g.wallW * 0.4, 2.4));
    floor.style.backgroundImage = "linear-gradient(to right, rgba(0,0,0,.05) 1px, transparent 1px)";
    floor.style.backgroundSize = px(0.5) + " 100%";

    const env = el("vwf-envelope");
    env.hidden = !g.isWall;
    env.style.display = g.isWall ? "block" : "none";
    if (g.isWall) {
      env.style.left = px(g.side);
      env.style.bottom = px(g.bottom);
      env.style.width = px(g.envW);
      env.style.height = px(g.envH);
    }

    let left;
    if (!g.isWall) left = (g.wallW - g.printW) / 2;
    else if (state.position === "left") left = g.side;
    else if (state.position === "right") left = g.wallW - g.side - g.printW;
    else left = g.side + Math.max(0, (g.envW - g.printW) / 2);

    const rect = el("vwf-printrect");
    rect.style.left = px(Math.max(0, left));
    rect.style.bottom = g.isWall ? px(g.bottom) : px(Math.max(0, (g.wallH - g.printH) / 2 + 0.15));
    rect.style.width = px(g.printW);
    rect.style.height = px(g.printH);
    rect.className = "vwf-print" + (g.isWall ? "" : " is-panel");
    el("vwf-printrect-label").textContent = fmt(g.printW) + " \u00d7 " + fmt(g.printH);

    const person = el("vwf-person");
    const personH = 1.75, personW = personH * 0.26;
    person.style.left = px(Math.max(0.05, g.wallW - personW - 0.15));
    person.style.width = px(personW);
    person.style.height = px(personH);
    const head = el("vwf-person-head");
    head.style.width = px(personW * 0.62);
    head.style.height = px(personW * 0.62);
    head.style.borderRadius = "50%";
    const body = el("vwf-person-body");
    body.style.width = "100%";
    body.style.height = px(personH * 0.72);
    body.style.marginTop = "2%";
    body.style.borderRadius = px(personW * 0.45) + " " + px(personW * 0.45) + " 0 0";

    const dimW = el("vwf-dim-w");
    dimW.textContent = "Wall " + fmt(g.wallW);
    dimW.style.left = "50%";
    dimW.style.top = "-26px";
    dimW.style.transform = "translateX(-50%)";

    const dimH = el("vwf-dim-h");
    dimH.textContent = "Wall height " + fmt(g.wallH);
    dimH.style.left = "6px";
    dimH.style.top = "6px";

    const reach = el("vwf-dim-reach");
    if (g.isWall) {
      reach.style.display = "block";
      reach.textContent = "Machine reach " + fmt(g.bottom + g.envH);
      reach.style.left = "6px";
      reach.style.bottom = px(g.bottom + g.envH);
    } else {
      reach.style.display = "none";
    }

    el("vwf-scene").style.opacity = g.ceilingTooLow ? "0.25" : "1";
    el("vwf-stage-block").className = "vwf-block" + (g.ceilingTooLow ? " is-on" : "");
    el("vwf-stage-block-text").textContent = g.ceilingTooLow
      ? "This room measures " + fmt(g.wallH) + " floor to ceiling. The printer needs a minimum of " +
        fmt(PRINTER_CONFIG.minWallHeight.value) + " to be set up at all. You can still send the project for manual review."
      : "";
  }

  /* ---------- rendering ---------- */
  function rows(container, list) {
    container.innerHTML = "";
    list.forEach(function (r) {
      const div = document.createElement("div");
      div.className = "vwf-row" + (r.muted ? " is-muted" : "");
      const left = document.createElement("div");
      left.innerHTML = "<span>" + r.k + "</span>" + (r.note ? "<small>" + r.note + "</small>" : "");
      const right = document.createElement("b");
      right.textContent = r.v;
      div.appendChild(left);
      div.appendChild(right);
      container.appendChild(div);
    });
  }

  function renderCaps() {
    const c = capabilities(), g = c.g, box = el("vwf-caps");
    box.innerHTML = "";

    if (c.blocked || c.fails.length) {
      const n = document.createElement("div");
      n.className = "vwf-note is-warn";
      let html = "<h5>" + (c.blocked ? "Printing cannot be accomplished" : "Manual review required") + "</h5><ul>";
      c.fails.forEach(function (f) {
        html += "<li><strong>" + f.limit + "</strong> &mdash; " + f.detail + (f.suggest ? " <em>" + f.suggest + "</em>" : "") + "</li>";
      });
      html += "</ul>";
      n.innerHTML = html;
      box.appendChild(n);
    } else if (c.passes.length) {
      const n = document.createElement("div");
      n.className = "vwf-note";
      n.innerHTML = "<h5>Within the machine\u2019s capabilities</h5><ul><li>" + c.passes.join("</li><li>") + "</li></ul>";
      box.appendChild(n);
    }

    if (c.reviews.length) {
      const n = document.createElement("div");
      n.className = "vwf-note is-review";
      n.innerHTML = "<h5>Manual review required</h5><p>These are not configured or not confirmed, so they are not assumed either way.</p><ul><li>" + c.reviews.join("</li><li>") + "</li></ul>";
      box.appendChild(n);
    }

    const list = [
      { k: "Wall entered", v: fmt(g.wallW) + " \u00d7 " + fmt(g.wallH) },
      { k: "Desired print", v: fmt(g.wantW) + " \u00d7 " + fmt(g.wantH) }
    ];
    if (g.isWall) {
      list.push(
        { k: "Printable area on this wall", v: fmt(g.envW) + " \u00d7 " + fmt(g.envH) },
        { k: "Side clearance required", v: fmt(g.side) + " each side", note: PRINTER_CONFIG.clearanceLeftRight.note },
        { k: "Floor clearance applied", v: fmt(g.bottom), note: state.vertical === "max" ? "Maximum-height mode \u2014 value needs confirmation" : PRINTER_CONFIG.clearanceFloor.note },
        { k: "Ceiling clearance required", v: fmt(g.top) },
        { k: "Machine maximum print height", v: fmt(PRINTER_CONFIG.maxPrintHeight.value) },
        { k: "Minimum wall height", v: fmt(PRINTER_CONFIG.minWallHeight.value) },
        { k: "Wall height for full print height", v: fmt(g.ceilingForFullHeight) }
      );
    }
    list.push(
      { k: "Print used for pricing", v: fmt(g.printW) + " \u00d7 " + fmt(g.printH) },
      { k: "Print area", v: sqm(g.area) },
      { k: "Orientation", v: orientationOf(g) }
    );
    rows(el("vwf-caps-rows"), list);
  }

  function renderEstimate() {
    const e = estimate(), g = e.g;
    const list = [
      { k: "Selected service", v: g.isWall ? "Direct-to-wall printing" : "Canvas / acrylic / mounted panel" },
      { k: "Wall dimensions", v: fmt(g.wallW) + " \u00d7 " + fmt(g.wallH) },
      { k: "Desired print dimensions", v: fmt(g.printW) + " \u00d7 " + fmt(g.printH) },
      { k: "Printable area", v: sqm(g.area) },
      { k: "Price per square metre", v: money(e.rate), note: g.isWall ? "Confirmed direct-wall rate" : "Confirmed mounted-panel rate" },
      { k: "Base printing price", v: money(e.base), note: sqm(g.area) + " \u00d7 " + money(e.rate) }
    ];
    e.known.forEach(function (k) { list.push({ k: k.label, v: money(k.amount) }); });
    e.review.forEach(function (r) { list.push({ k: r, v: "Requires review", note: "Not configured \u2014 not priced and not free", muted: true }); });
    rows(el("vwf-estimate-rows"), list);

    el("vwf-estimate-total").textContent = money(e.total);
    el("vwf-review-note").hidden = e.review.length === 0;
    const chips = el("vwf-review-chips");
    chips.innerHTML = "";
    e.review.concat(capabilities().reviews.length ? ["Printer capability review"] : []).forEach(function (r) {
      const s = document.createElement("span");
      s.className = "vwf-chip";
      s.textContent = r;
      chips.appendChild(s);
    });
  }

  function setRange(id, value, min, max, disabled) {
    const node = el(id);
    const safeMin = Math.max(0, min);
    const safeMax = Math.max(safeMin, max);
    node.min = round(safeMin, 2);
    node.max = round(safeMax, 2);
    node.step = 1;
    node.value = Math.min(safeMax, Math.max(safeMin, parseFloat(value) || safeMin));
    node.disabled = !!disabled;
  }

  function renderFit() {
    const e = estimate(), g = e.g, c = capabilities();
    const reducedW = g.wantW > g.envW + 0.001;
    const reducedH = g.wantH > g.envH + 0.001;
    const reduced = reducedW || reducedH;
    const printMin = fromM(0.3048); /* 12 inches */
    const wallWMin = fromM(0.6096), wallWMax = fromM(30.48);
    const wallHMin = fromM(1.016), wallHMax = fromM(6.096);
    const maxPrintW = Math.max(printMin, fromM(g.envW));
    const maxPrintH = Math.max(printMin, fromM(g.envH));

    setRange("vwf-wall-w-range", state.wallW, wallWMin, wallWMax, false);
    setRange("vwf-wall-h-range", state.wallH, wallHMin, wallHMax, false);
    setRange("vwf-print-w-range", state.printW, printMin, maxPrintW, c.blocked);
    setRange("vwf-print-h-range", state.printH, printMin, maxPrintH, c.blocked);

    el("vwf-wall-w").min = round(wallWMin, 2);
    el("vwf-wall-w").max = round(wallWMax, 2);
    el("vwf-wall-h").min = round(wallHMin, 2);
    el("vwf-wall-h").max = round(wallHMax, 2);
    el("vwf-print-w").value = state.printW;
    el("vwf-print-hh").value = state.printH;

    Array.prototype.forEach.call(veil.querySelectorAll("[data-vwf-unit]"), function (button) {
      const active = button.getAttribute("data-vwf-unit") === state.unit;
      button.classList.toggle("is-active", active);
      button.setAttribute("aria-pressed", active ? "true" : "false");
    });
    Array.prototype.forEach.call(veil.querySelectorAll(".vwf-unit-lbl"), function (node) {
      node.textContent = state.unit === "cm" ? "cm" : "in";
    });

    el("vwf-room-title").textContent = g.isWall ? "Your room" : "Your panel area";
    el("vwf-print-h").textContent = g.isWall ? "Will it fit on your wall?" : "Will it fit on your panel?";
    el("vwf-print-sub").textContent = g.isWall
      ? "Enter your room, then set the print size. The drawing and the verdict update as you move the sliders."
      : "Enter the available panel area, then set the artwork size. The drawing and estimate update with the sliders.";
    el("vwf-position-wrap").style.display = g.isWall ? "" : "none";
    el("vwf-print-w-hint").textContent = "max " + fmt(g.envW);
    el("vwf-print-h-hint").textContent = "max " + fmt(g.envH);
    el("vwf-print-w-readout").textContent = fmt(g.printW);
    el("vwf-print-h-readout").textContent = fmt(g.printH);
    el("vwf-orientation-hint").textContent = "Currently " + orientationOf(g) + ".";
    el("vwf-toggle-mode").hidden = !g.isWall;
    el("vwf-toggle-mode").textContent = state.vertical === "even" ? "Switch to maximum height" : "Switch to even margins";
    el("vwf-vertical-hint").textContent = !g.isWall
      ? "Panel dimensions determine the available area."
      : (state.vertical === "max"
        ? "Maximum-height mode lowers the floor margin to " + fmt(PRINTER_CONFIG.minFloorClearance.value) + "; top and bottom margins are no longer even."
        : "Even margins keep " + fmt(g.top) + " clear above and below the artwork.");

    const status = el("vwf-fit-status");
    status.className = "vwf-fit-status" + (c.blocked ? " is-blocked" : (reduced ? " is-reduced" : ""));
    if (c.blocked) {
      el("vwf-fit-status-tag").textContent = "Cannot print";
      el("vwf-fit-status-title").textContent = "Ceiling is too low.";
      el("vwf-fit-status-body").textContent = "The printer needs at least " + fmt(PRINTER_CONFIG.minWallHeight.value) + " of ceiling height. Below that, the rail cannot be set up in the room.";
    } else if (reduced) {
      el("vwf-fit-status-tag").textContent = "Reduced to fit";
      el("vwf-fit-status-title").textContent = "Trimmed to the printable area.";
      el("vwf-fit-status-body").textContent = g.isWall
        ? ((reducedH ? "This ceiling allows " + fmt(g.envH) + " of print height. " : "") +
          (reducedW ? "The printhead needs " + fmt(g.side) + " at each side, leaving " + fmt(g.envW) + " of width. " : "") +
          "The size used for the estimate is " + fmt(g.printW) + " x " + fmt(g.printH) + ".")
        : "The requested artwork is larger than the panel area. The size used for the estimate is " + fmt(g.printW) + " x " + fmt(g.printH) + ".";
    } else {
      el("vwf-fit-status-tag").textContent = "Fits";
      el("vwf-fit-status-title").textContent = "This print fits your " + (g.isWall ? "wall" : "panel") + ".";
      el("vwf-fit-status-body").textContent = g.isWall
        ? "It sits inside the machine's reach with " + fmt(g.bottom) + " below the artwork and " + fmt(Math.max(0, g.wallH - g.bottom - g.printH)) + " above it."
        : "The artwork sits within the panel dimensions you entered.";
    }

    const sqft = g.area * 10.7639;
    el("vwf-fit-print-size").textContent = fmt(g.printW) + " x " + fmt(g.printH);
    el("vwf-fit-price").textContent = sqft.toFixed(2) + " sq ft - base printing " + money(e.base);
    rows(el("vwf-fit-facts"), [
      { k: "Printable area", v: fmt(g.envW) + " x " + fmt(g.envH) },
      { k: g.isWall ? "Ceiling entered" : "Area height", v: fmt(g.wallH) },
      { k: g.isWall ? "Side clearance" : "Area width", v: g.isWall ? fmt(g.side) + " each side" : fmt(g.wallW) },
      { k: "Machine max height", v: fmt(PRINTER_CONFIG.maxPrintHeight.value) },
      { k: "Margin below artwork", v: fmt(g.bottom) }
    ]);
  }

  function summaryLines() {
    const e = estimate(), g = e.g, c = capabilities();
    const lines = [
      "VERTIKA WALL PRINTING \u2014 QUOTE REQUEST",
      "Reference: " + state.ref,
      "",
      "CUSTOMER",
      "Name: " + state.name,
      "Email: " + state.email,
      "Phone: " + state.phone,
      "Address / postcode: " + state.address,
      "Desired completion: " + (state.date || "Not specified"),
      "",
      "PROJECT",
      "Service: " + (g.isWall ? "Direct-to-wall printing" : "Canvas / acrylic / mounted panel"),
      "Measurement unit entered: " + state.unit,
      "Wall dimensions: " + fmt(g.wallW) + " \u00d7 " + fmt(g.wallH),
      "Desired print: " + fmt(g.printW) + " \u00d7 " + fmt(g.printH) + " (" + sqm(g.area) + ")",
      "Orientation: " + orientationOf(g),
      "Position on wall: " + state.position + " / " + (state.vertical === "max" ? "maximum height" : "even margins"),
      "Location: " + state.env,
      "Surface: " + state.surface,
      "Obstructions: " + (state.obstructions || "None noted"),
      "",
      "PRINTER CHECKS",
      c.blocked ? "BLOCKED: wall height below the " + fmt(PRINTER_CONFIG.minWallHeight.value) + " minimum" : "Within configured limits for the entered dimensions"
    ];
    c.fails.forEach(function (f) { lines.push("Exceeded: " + f.limit + " \u2014 " + f.suggest); });
    c.reviews.forEach(function (r) { lines.push("Review: " + r); });
    lines.push(
      "",
      "ESTIMATE",
      "Rate: " + money(e.rate) + " per m\u00b2",
      "Base printing: " + sqm(g.area) + " \u00d7 " + money(e.rate) + " = " + money(e.base),
      "Starting estimated total: " + money(e.total),
      "Requires review: " + (e.review.length ? e.review.join(", ") : "None"),
      "",
      "FILES",
      "Wall photo: " + (state.photoName || "not attached"),
      "Artwork: " + (state.artName || "not attached"),
      "",
      "NOTES",
      state.notes || "None",
      "",
      "Measurements are approximate and taken from the online fit check.",
      "Starting estimate only \u2014 not a final guaranteed quote."
    );
    return lines;
  }

  function renderReview() {
    const e = estimate(), g = e.g, c = capabilities();
    rows(el("vwf-review-rows"), [
      { k: "Name", v: state.name || "\u2014" },
      { k: "Email", v: state.email || "\u2014" },
      { k: "Phone", v: state.phone || "\u2014" },
      { k: "Address / postcode", v: state.address || "\u2014" },
      { k: "Desired completion", v: state.date || "Not specified" },
      { k: "Service", v: g.isWall ? "Direct-to-wall printing" : "Canvas / acrylic / panel" },
      { k: "Wall", v: fmt(g.wallW) + " \u00d7 " + fmt(g.wallH) + " \u00b7 " + state.surface + " \u00b7 " + state.env },
      { k: "Print", v: fmt(g.printW) + " \u00d7 " + fmt(g.printH) + " \u00b7 " + sqm(g.area) + " \u00b7 " + orientationOf(g) },
      { k: "Printer checks", v: c.blocked ? "Cannot print \u2014 manual review" : (c.fails.length ? "Exceeds a limit \u2014 manual review" : "Within limits") },
      { k: "Items requiring review", v: String(e.review.length + c.reviews.length) },
      { k: "Starting estimate", v: money(e.total) },
      { k: "Wall photo", v: state.photoName || "Not attached" },
      { k: "Artwork", v: state.artName || "Not attached" },
      { k: "Notes", v: state.notes || "None" }
    ]);
  }

  function contactErrors() {
    return {
      name: state.name.trim() ? "" : "Required",
      email: /.+@.+\..+/.test(state.email) ? "" : "A valid email is required",
      phone: state.phone.trim() ? "" : "Required",
      address: state.address.trim() ? "" : "Required"
    };
  }

  function render() {
    const g = geo(), c = capabilities();

    panels.forEach(function (p) { p.hidden = Number(p.getAttribute("data-panel")) !== state.step; });
    dots.forEach(function (d) {
      const n = Number(d.getAttribute("data-step"));
      const available = n <= state.maxStep;
      d.className = "vwf-stepdot" + (n === state.step ? " is-now" : (n < state.step ? " is-done" : "")) + (available ? " is-available" : "");
      d.disabled = !available;
      if (n === state.step) d.setAttribute("aria-current", "step");
      else d.removeAttribute("aria-current");
    });

    veil.querySelectorAll(".vwf-card").forEach(function (b) {
      b.className = "vwf-card" + (b.getAttribute("data-service") === state.service ? " is-sel" : "");
    });

    /* step 2 */
    const low = g.ceilingTooLow;
    el("vwf-wall-h").className = "vwf-in" + (low ? " is-bad" : "");
    el("vwf-wall-h-hint").className = "vwf-hint" + (low ? " is-bad" : "");
    el("vwf-wall-h-hint").textContent = !g.isWall
      ? "Where the finished piece will hang."
      : (low
        ? "Below the " + fmt(PRINTER_CONFIG.minWallHeight.value) + " minimum \u2014 the rail will not clear the ceiling."
        : "Floor to ceiling. Minimum " + fmt(PRINTER_CONFIG.minWallHeight.value) + ". This wall allows " + fmt(g.envH) + " of print height.");
    el("vwf-ceiling-note").hidden = !low;
    el("vwf-ceiling-note-text").textContent = low
      ? "At " + fmt(g.wallH) + " this room is below the " + fmt(PRINTER_CONFIG.minWallHeight.value) +
        " minimum, so the printer cannot be set up here. You can still continue and send the project for manual review."
      : "";

    el("vwf-stage-hint").textContent = g.isWall
      ? "Dashed outline is what the machine can reach on this wall. Figure shown is 1.75 m for scale."
      : "The panel shown mounted on the wall. Figure shown is 1.75 m for scale.";
    renderFit();
    drawStage();

    /* checks, estimate and quote */
    renderCaps();
    renderEstimate();
    if (state.step === 5) {
      const errs = contactErrors();
      ["name", "email", "phone", "address"].forEach(function (k) { el("vwf-" + k + "-err").textContent = state.showErrors ? errs[k] : ""; });
      el("vwf-quote-form").hidden = state.reviewing || state.sent;
      el("vwf-quote-review").hidden = !state.reviewing || state.sent;
      el("vwf-quote-sent").hidden = !state.sent;
      if (state.reviewing) renderReview();
    }

    /* footer */
    backBtn.disabled = state.step === 1 && !state.reviewing;
    backBtn.hidden = state.sent;
    nextBtn.hidden = state.sent;
    if (state.step === 1) {
      nextBtn.disabled = !state.service;
      nextBtn.innerHTML = "Continue &rarr;";
      footnote.textContent = state.service ? "" : "Choose a service to continue.";
    } else if (state.step === 5 && state.reviewing) {
      nextBtn.disabled = false;
      nextBtn.innerHTML = "Confirm and send";
      footnote.textContent = "Nothing is sent until you press confirm.";
    } else if (state.step === 5) {
      nextBtn.disabled = false;
      nextBtn.innerHTML = "Review my request &rarr;";
      footnote.textContent = state.ack ? "" : "Please confirm the acknowledgement above.";
    } else if (state.step === 4) {
      nextBtn.disabled = false;
      nextBtn.innerHTML = "Continue to quote &rarr;";
      footnote.textContent = "Starting estimate only \u2014 not a final guaranteed quote.";
    } else {
      nextBtn.disabled = false;
      nextBtn.innerHTML = (c.blocked || c.fails.length) ? "Continue for manual review &rarr;" : "Continue &rarr;";
      footnote.textContent = c.blocked
        ? "The machine cannot be set up in this room. You can still send the project for manual review."
        : (c.fails.length ? "Your print exceeds a printer limit \u2014 we will review it manually." : "");
    }
  }

  /* ---------- navigation ---------- */
  function go(step) {
    state.step = Math.min(5, Math.max(1, step));
    state.maxStep = Math.max(state.maxStep, state.step);
    state.reviewing = false;
    render();
    veil.scrollTop = 0;
  }

  dots.forEach(function (button) {
    button.addEventListener("click", function () {
      const target = Number(button.getAttribute("data-step"));
      if (target <= state.maxStep && target !== state.step) go(target);
    });
  });

  nextBtn.addEventListener("click", function () {
    if (state.step === 5 && state.reviewing) { send(); return; }
    if (state.step === 5) {
      state.showErrors = true;
      const errs = contactErrors();
      const bad = Object.keys(errs).some(function (k) { return errs[k]; });
      if (bad || !state.ack) {
        render();
        footnote.textContent = bad ? "Please complete the required fields." : "Please confirm the acknowledgement above.";
        return;
      }
      state.reviewing = true;
      render();
      veil.scrollTop = 0;
      return;
    }
    go(state.step + 1);
  });

  backBtn.addEventListener("click", function () {
    if (state.reviewing) { state.reviewing = false; render(); return; }
    go(state.step - 1);
  });

  function send() {
    const d = new Date();
    state.ref = "VWP-" + d.getFullYear() + String(d.getMonth() + 1).padStart(2, "0") + String(d.getDate()).padStart(2, "0") +
                "-" + String(Math.floor(Math.random() * 9000) + 1000);
    const href = "mailto:" + VWF_EMAIL +
      "?subject=" + encodeURIComponent("Quote request " + state.ref + " \u2014 " + (state.name || "website")) +
      "&body=" + encodeURIComponent(summaryLines().join("\n"));
    el("vwf-mailto-fallback").setAttribute("href", href);
    el("vwf-ref").textContent = state.ref;
    state.sent = true;
    render();
    window.location.href = href;
  }

  /* ---------- inputs ---------- */
  veil.querySelectorAll(".vwf-card").forEach(function (b) {
    b.addEventListener("click", function () {
      state.service = b.getAttribute("data-service");
      render();
    });
  });

  function setUnit(nextUnit) {
    if (nextUnit === state.unit) return;
    const from = VWF_UNITS[state.unit], to = VWF_UNITS[nextUnit];
    ["wallW", "wallH", "printW", "printH"].forEach(function (k) {
      state[k] = round((parseFloat(state[k]) || 0) * from / to, 3);
    });
    state.unit = nextUnit;
    el("vwf-wall-w").value = state.wallW;
    el("vwf-wall-h").value = state.wallH;
    el("vwf-print-w").value = state.printW;
    el("vwf-print-hh").value = state.printH;
    render();
  }

  veil.querySelectorAll("[data-vwf-unit]").forEach(function (button) {
    button.addEventListener("click", function () {
      setUnit(button.getAttribute("data-vwf-unit"));
    });
  });

  const bind = (id, key, cast) => {
    const node = el(id);
    if (!node) return;
    node.addEventListener("input", function () {
      state[key] = cast ? cast(node.value) : node.value;
      render();
    });
    node.addEventListener("change", function () {
      state[key] = cast ? cast(node.value) : node.value;
      render();
    });
  };

  bind("vwf-wall-w", "wallW", parseFloat);
  bind("vwf-wall-h", "wallH", parseFloat);
  bind("vwf-print-w", "printW", parseFloat);
  bind("vwf-print-hh", "printH", parseFloat);
  bind("vwf-env", "env");
  bind("vwf-surface", "surface");
  bind("vwf-obstructions", "obstructions");
  bind("vwf-position", "position");
  bind("vwf-orientation", "orientation");
  bind("vwf-name", "name");
  bind("vwf-email", "email");
  bind("vwf-phone", "phone");
  bind("vwf-address", "address");
  bind("vwf-date", "date");
  bind("vwf-notes", "notes");

  function bindRange(id, key, fieldId) {
    const node = el(id);
    node.addEventListener("input", function () {
      state[key] = parseFloat(node.value) || 0;
      if (fieldId) el(fieldId).value = state[key];
      render();
    });
  }

  bindRange("vwf-wall-w-range", "wallW", "vwf-wall-w");
  bindRange("vwf-wall-h-range", "wallH", "vwf-wall-h");
  bindRange("vwf-print-w-range", "printW", "vwf-print-w");
  bindRange("vwf-print-h-range", "printH", "vwf-print-hh");

  el("vwf-ack").addEventListener("change", function (e) { state.ack = e.target.checked; render(); });
  el("vwf-photo").addEventListener("change", function (e) {
    state.photoName = e.target.files[0] ? e.target.files[0].name : "";
    el("vwf-photo-name").textContent = state.photoName || "No file selected";
  });
  el("vwf-art").addEventListener("change", function (e) {
    state.artName = e.target.files[0] ? e.target.files[0].name : "";
    el("vwf-art-name").textContent = state.artName || "No file selected";
  });

  el("vwf-fill").addEventListener("click", function () {
    const g = geo();
    state.printW = round(fromM(g.envW), 2);
    state.printH = round(fromM(g.envH), 2);
    el("vwf-print-w").value = state.printW;
    el("vwf-print-hh").value = state.printH;
    render();
  });

  el("vwf-toggle-mode").addEventListener("click", function () {
    state.vertical = state.vertical === "even" ? "max" : "even";
    render();
  });

  /* ---------- open / close, focus, keyboard ---------- */
  const FOCUSABLE = 'a[href], button:not([disabled]), input, select, textarea, [tabindex]:not([tabindex="-1"])';

  function open(trigger) {
    opener = trigger || document.activeElement;
    veil.classList.add("is-open");
    document.body.classList.add("vwf-locked");
    render();
    window.setTimeout(function () {
      const first = veil.querySelector(".vwf-card") || closeBtn;
      first.focus();
      drawStage();
    }, 30);
  }

  function close() {
    veil.classList.remove("is-open");
    document.body.classList.remove("vwf-locked");
    if (opener && typeof opener.focus === "function") opener.focus();
  }

  document.querySelectorAll("[data-vwf-open]").forEach(function (node) {
    node.addEventListener("click", function (ev) {
      ev.preventDefault();
      open(node);
    });
  });

  closeBtn.addEventListener("click", close);
  veil.addEventListener("mousedown", function (ev) { if (ev.target === veil) close(); });

  document.addEventListener("keydown", function (ev) {
    if (!veil.classList.contains("is-open")) return;
    if (ev.key === "Escape") { close(); return; }
    if (ev.key !== "Tab") return;
    const nodes = Array.prototype.filter.call(sheet.querySelectorAll(FOCUSABLE), function (n) {
      return n.offsetParent !== null && !n.hidden;
    });
    if (!nodes.length) return;
    const first = nodes[0], last = nodes[nodes.length - 1];
    if (ev.shiftKey && document.activeElement === first) { ev.preventDefault(); last.focus(); }
    else if (!ev.shiftKey && document.activeElement === last) { ev.preventDefault(); first.focus(); }
  });

  window.addEventListener("resize", function () {
    if (veil.classList.contains("is-open")) drawStage();
  });

  if (window.location.hash === "#quote-check") open(null);
  render();
})();
