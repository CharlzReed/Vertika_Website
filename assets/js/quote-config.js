/* =========================================================
   WALL FIT SIMULATOR / QUOTE BUILDER
   ---------------------------------------------------------
   PRINTER_CONFIG and PRICING_CONFIG below are the only two
   places to edit machine limits and rates. Anything marked
   confirmed:false is NOT used to declare a job printable --
   it routes the project to manual review instead.
========================================================= */

const PRINTER_CONFIG = {
  /* --- CONFIRMED by Vertika --- */
  minWallHeight:        { value: 2.3876, confirmed: true,  note: "94 in - below this the rail hits the ceiling and the machine cannot be set up" },
  maxPrintHeight:       { value: 2.20,   confirmed: true,  note: "Maximum vertical print travel" },
  clearanceLeftRight:   { value: 0.4826, confirmed: true,  note: "19 in - wheel-to-printhead offset, each side" },
  clearanceFloor:       { value: 0.4826, confirmed: true,  note: "19 in - wheel-to-printhead offset at the floor" },
  clearanceCeiling:     { value: 0.4826, confirmed: true,  note: "19 in - wheel-to-printhead offset at the ceiling" },

  /* --- NEEDS CONFIRMATION - replace value and set confirmed:true --- */
  minFloorClearance:    { value: 0.4064, confirmed: false, note: "Lowest usable floor margin in maximum-height mode (16 in assumed)" },
  mastHeight:           { value: 3.00,   confirmed: false, note: "Overall mast/rail height when standing" },
  minPrintHeight:       { value: null,   confirmed: false, note: "Smallest print height the machine can produce" },
  maxWidthPerPass:      { value: null,   confirmed: false, note: "Maximum continuous printed width in a single pass" },
  canContinueSideways:  { value: null,   confirmed: false, note: "Whether the machine repositions to continue across a wider wall" },
  minPrintableArea:     { value: null,   confirmed: false, note: "Minimum job area in square metres" },
  supportedSurfaces:    { value: ["Painted drywall", "Concrete", "Brick", "Wood", "Glass", "Metal", "Tile"], confirmed: true, note: "Listed on the website" },
  unsupportedSurfaces:  { value: null,   confirmed: false, note: "Surfaces that are explicitly not printable" },
  outdoorAllowed:       { value: null,   confirmed: false, note: "Whether outdoor work is offered, and under what conditions" },
  panelMaxWidth:        { value: null,   confirmed: false, note: "Largest panel width" },
  panelMaxHeight:       { value: null,   confirmed: false, note: "Largest panel height" },
  panelMinWidth:        { value: null,   confirmed: false, note: "Smallest panel width" },
  panelMinHeight:       { value: null,   confirmed: false, note: "Smallest panel height" }
};

const PRICING_CONFIG = {
  /* --- CONFIRMED rates, per square metre --- */
  wallRatePerM2:  172.22,   /* approx. $12.00 per sq ft */
  panelRatePerM2: 172.22,   /* approx. $16.00 per sq ft */

  /* --- Additions: null means "Requires review", never free --- */
  minimumJob: null, material: null, canvas: null, acrylic: null, materialThickness: null,
  wallPreparation: null, texturedSurface: null, designWork: null, travel: null,
  difficultAccess: null, outdoorWork: null, mountingHardware: null, installation: null,
  shipping: null, rushService: null
};

const VWF_UNITS = { m: 1, cm: 0.01, ft: 0.3048, in: 0.0254 };
const VWF_EMAIL = "vertikawallprinting@gmail.com";
const VWF_TEXTURED = ["Concrete", "Brick", "Tile", "other"];
