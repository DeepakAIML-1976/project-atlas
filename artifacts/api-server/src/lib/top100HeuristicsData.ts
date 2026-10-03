export interface PipingHeuristic {
  ruleNumber: number;
  title: string;
  section: string;
  domain: string;
  goldenRule: string;
  heuristic: string;
  aiCheck?: string;
  failureAvoided: string;
}

export const TOP_100_HEURISTICS: PipingHeuristic[] = [
  // SECTION 1 - BROWNFIELD, FIELD VERIFICATION & ENGINEERING BASIS
  {
    ruleNumber: 1,
    title: "THE DRAWING IS NOT THE PLANT",
    section: "BROWNFIELD, FIELD VERIFICATION & ENGINEERING BASIS",
    domain: "Brownfield & Field Verification",
    goldenRule: "Never assume that the latest drawing represents the actual field condition in a brownfield facility.",
    heuristic: "Distinguish between as-designed, as-built, as-modified, as-operated and as-found conditions.",
    aiCheck: "For brownfield work, request field verification, dimensions, photographs, survey information and UT data where relevant.",
    failureAvoided: "Tie-in mismatch, wrong dimensions, inadequate wall thickness, support conflicts and construction rework."
  },
  {
    ruleNumber: 2,
    title: "VERIFY EXISTING WALL THICKNESS",
    section: "BROWNFIELD, FIELD VERIFICATION & ENGINEERING BASIS",
    domain: "Brownfield & Field Verification",
    goldenRule: "Nominal original pipe thickness is not the same as current remaining wall thickness.",
    heuristic: "For existing piping modifications, hot taps, welded attachments and integrity assessments, use current thickness information where relevant.",
    aiCheck: "Ask for UT thickness and corrosion history when existing wall condition affects the decision.",
    failureAvoided: "Designing a modification onto a deteriorated pressure boundary."
  },
  {
    ruleNumber: 3,
    title: "FIELD VERIFY CRITICAL DIMENSIONS",
    section: "BROWNFIELD, FIELD VERIFICATION & ENGINEERING BASIS",
    domain: "Brownfield & Field Verification",
    goldenRule: "Never rely solely on old drawings for critical brownfield dimensions.",
    heuristic: "Verify pipe OD, centerlines, elevations, flange orientation, equipment nozzle location, support locations and structural clearances.",
    failureAvoided: "Spool fabrication and erection mismatch."
  },
  {
    ruleNumber: 4,
    title: "TREAT BROWNFIELD MODIFICATION AS A NEW ENGINEERING PROBLEM",
    section: "BROWNFIELD, FIELD VERIFICATION & ENGINEERING BASIS",
    domain: "Brownfield & Field Verification",
    goldenRule: "Do not assume that because the original system was acceptable, the modified system will remain acceptable.",
    heuristic: "Reassess loads, flexibility, supports, hydraulics, isolation, operating conditions and integrity after modification.",
    failureAvoided: "New loads or operating modes introduced by a seemingly small modification."
  },
  {
    ruleNumber: 5,
    title: "ASK 'WHAT CHANGED?'",
    section: "BROWNFIELD, FIELD VERIFICATION & ENGINEERING BASIS",
    domain: "Brownfield & Field Verification",
    goldenRule: "When investigating a failure, first identify what changed from the previously successful condition.",
    heuristic: "Check process pressure, temperature, flow, support, valve position, operating procedure, equipment, modification, material, corrosion condition and maintenance.",
    failureAvoided: "Treating symptoms while missing the initiating change."
  },

  // SECTION 2 - ENGINEERING JUDGEMENT & PROBLEM SOLVING
  {
    ruleNumber: 6,
    title: "NEVER SOLVE A PIPING PROBLEM BY LOOKING AT THE PIPE ALONE",
    section: "ENGINEERING JUDGEMENT & PROBLEM SOLVING",
    domain: "Engineering Judgement",
    goldenRule: "A piping problem may actually be a process, equipment, stress, structural, instrumentation, maintenance or construction problem.",
    heuristic: "Consider all interfaces before selecting a solution.",
    failureAvoided: "Solving one problem while creating another."
  },
  {
    ruleNumber: 7,
    title: "CHECK THE ENGINEERING BASIS BEFORE CHECKING THE CALCULATION",
    section: "ENGINEERING JUDGEMENT & PROBLEM SOLVING",
    domain: "Engineering Judgement",
    goldenRule: "A mathematically correct calculation based on incorrect inputs is still an incorrect engineering result.",
    heuristic: "Check design pressure, design temperature, material, wall thickness, corrosion allowance, geometry, loads, boundary conditions and operating cases.",
    failureAvoided: "False confidence in software output."
  },
  {
    ruleNumber: 8,
    title: "IF THE RESULT LOOKS SURPRISINGLY GOOD, INVESTIGATE IT",
    section: "ENGINEERING JUDGEMENT & PROBLEM SOLVING",
    domain: "Engineering Judgement",
    goldenRule: "Extremely low stress, zero movement, negligible support load or unusually large margin may indicate an incorrect model.",
    heuristic: "Check units, restraints, anchors, connectivity, material, temperature, load cases and pipe properties.",
    failureAvoided: "Model errors being mistaken for good design."
  },
  {
    ruleNumber: 9,
    title: "ALWAYS LOOK FOR THE SECOND-ORDER PROBLEM",
    section: "ENGINEERING JUDGEMENT & PROBLEM SOLVING",
    domain: "Engineering Judgement",
    goldenRule: "Every engineering solution should be examined for the problem it may create elsewhere.",
    heuristic: "Evaluate second-order effects: More supports can increase thermal loads; thicker pipe increases weight; a larger loop consumes space; moving a valve can affect stress and drainage.",
    failureAvoided: "Local optimization causing system-level problems."
  },
  {
    ruleNumber: 10,
    title: "DO NOT LET SOFTWARE REPLACE ENGINEERING JUDGEMENT",
    section: "ENGINEERING JUDGEMENT & PROBLEM SOLVING",
    domain: "Engineering Judgement",
    goldenRule: "Software calculates the model supplied to it, not the plant that the engineer intended.",
    heuristic: "Validate the model, assumptions, boundary conditions and physical behavior before accepting results.",
    failureAvoided: "Technically correct software output applied to an incorrect physical model."
  },
  {
    ruleNumber: 11,
    title: "ASK WHAT HAPPENS WHEN SOMETHING GOES WRONG",
    section: "ENGINEERING JUDGEMENT & PROBLEM SOLVING",
    domain: "Engineering Judgement",
    goldenRule: "Evaluate credible abnormal conditions, not just normal operation.",
    heuristic: "Consider pump trip, valve failure, blocked-in liquid, PSV lift, utility failure, thermal expansion, water hammer, slugging, vibration and loss of support.",
    failureAvoided: "Designs that work only under normal conditions."
  },
  {
    ruleNumber: 12,
    title: "DISTINGUISH CODE, SPECIFICATION, GOOD PRACTICE AND JUDGEMENT",
    section: "ENGINEERING JUDGEMENT & PROBLEM SOLVING",
    domain: "Engineering Judgement",
    goldenRule: "Never present a company practice or thumb rule as a mandatory code requirement.",
    heuristic: "Identify whether each conclusion comes from code, project specification, vendor requirement, industry practice or engineering judgement.",
    failureAvoided: "Misapplication of rules."
  },

  // SECTION 3 - PRESSURE, TEMPERATURE & MATERIALS
  {
    ruleNumber: 13,
    title: "NEVER DESIGN FROM OPERATING CONDITIONS ALONE",
    section: "PRESSURE, TEMPERATURE & MATERIALS",
    domain: "Pressure, Temperature & Materials",
    goldenRule: "Operating pressure and temperature describe normal service; design conditions establish the required design envelope.",
    heuristic: "Check maximum pressure, shutoff pressure, blocked-in pressure, upset pressure, relief conditions, maximum/minimum temperature and startup/shutdown.",
    failureAvoided: "Under-design for credible extremes."
  },
  {
    ruleNumber: 14,
    title: "CLASS NUMBER IS NOT DIRECT PRESSURE",
    section: "PRESSURE, TEMPERATURE & MATERIALS",
    domain: "Pressure, Temperature & Materials",
    goldenRule: "Never interpret ASME flange Class as a direct psi rating.",
    heuristic: "Check the applicable pressure-temperature rating for the actual material group and temperature.",
    failureAvoided: "Incorrect flange selection."
  },
  {
    ruleNumber: 15,
    title: "NEVER SELECT FLANGE CLASS FROM PRESSURE ALONE",
    section: "PRESSURE, TEMPERATURE & MATERIALS",
    domain: "Pressure, Temperature & Materials",
    goldenRule: "Pressure-temperature rating depends on the applicable standard and material group.",
    heuristic: "Check standard, class, material group, temperature, facing and project requirements.",
    failureAvoided: "Rating mismatch."
  },
  {
    ruleNumber: 16,
    title: "MATERIAL SELECTION MUST FOLLOW THE DAMAGE MECHANISM",
    section: "PRESSURE, TEMPERATURE & MATERIALS",
    domain: "Pressure, Temperature & Materials",
    goldenRule: "Do not select material solely from pressure-temperature suitability.",
    heuristic: "Consider corrosion, erosion, sour service, chloride SCC, hydrogen effects, cryogenic service, fatigue, MIC and process contaminants.",
    failureAvoided: "Material that is mechanically adequate but environmentally unsuitable."
  },
  {
    ruleNumber: 17,
    title: "'STAINLESS STEEL' IS NOT A CORROSION DESIGN BASIS",
    section: "PRESSURE, TEMPERATURE & MATERIALS",
    domain: "Pressure, Temperature & Materials",
    goldenRule: "Never assume stainless steel is immune to corrosion.",
    heuristic: "Check grade, chloride, temperature, pH, oxygen, crevices, stress, contamination and weld condition.",
    failureAvoided: "Pitting, SCC and localized corrosion."
  },
  {
    ruleNumber: 18,
    title: "CORROSION ALLOWANCE IS NOT A UNIVERSAL SOLUTION",
    section: "PRESSURE, TEMPERATURE & MATERIALS",
    domain: "Pressure, Temperature & Materials",
    goldenRule: "Additional thickness addresses appropriate wall-loss mechanisms; it does not eliminate every degradation mechanism.",
    heuristic: "Check SCC, HIC, hydrogen embrittlement, MIC, galvanic corrosion, erosion and localized pitting.",
    failureAvoided: "Using thickness to solve the wrong corrosion mechanism."
  },
  {
    ruleNumber: 19,
    title: "MATERIAL COMPATIBILITY INCLUDES THE WHOLE PRESSURE BOUNDARY",
    section: "PRESSURE, TEMPERATURE & MATERIALS",
    domain: "Pressure, Temperature & Materials",
    goldenRule: "Check pipe, fittings, flanges, valves, branches, bolting, gaskets, weld consumables and attachments.",
    heuristic: "Ensure material compatibility across the complete pressure boundary.",
    failureAvoided: "A weak or incompatible component inside an otherwise suitable material system."
  },
  {
    ruleNumber: 20,
    title: "HIGHER MATERIAL GRADE IS NOT AUTOMATICALLY BETTER",
    section: "PRESSURE, TEMPERATURE & MATERIALS",
    domain: "Pressure, Temperature & Materials",
    goldenRule: "More expensive or higher-alloy material should be justified by service requirements.",
    heuristic: "Consider corrosion performance, fabrication, welding, availability, inspection, lifecycle cost and failure mechanism.",
    failureAvoided: "Unnecessary cost and fabrication complications."
  },

  // SECTION 4 - WALL THICKNESS, CORROSION & EROSION
  {
    ruleNumber: 21,
    title: "PIPE SCHEDULE IS A RESULT, NOT THE STARTING POINT",
    section: "WALL THICKNESS, CORROSION & EROSION",
    domain: "Wall Thickness, Corrosion & Erosion",
    goldenRule: "Determine required pressure thickness and applicable allowances before selecting a commercial pipe thickness.",
    heuristic: "Calculate minimum pressure thickness, add corrosion and mill tolerances before choosing standard commercial schedule.",
    failureAvoided: "Habit-based schedule selection."
  },
  {
    ruleNumber: 22,
    title: "DESIGN PRESSURE MUST REPRESENT THE GOVERNING CREDIBLE PRESSURE",
    section: "WALL THICKNESS, CORROSION & EROSION",
    domain: "Wall Thickness, Corrosion & Erosion",
    goldenRule: "Do not substitute normal operating pressure for the actual design basis.",
    heuristic: "Check pump shutoff, blocked outlet, upstream pressure sources and relief scenarios.",
    failureAvoided: "Under-designed pressure boundary."
  },
  {
    ruleNumber: 23,
    title: "DESIGN TEMPERATURE MUST REPRESENT THE GOVERNING CONDITION",
    section: "WALL THICKNESS, CORROSION & EROSION",
    domain: "Wall Thickness, Corrosion & Erosion",
    goldenRule: "Check both maximum and minimum design temperatures where material, toughness or rating can be affected.",
    heuristic: "Verify impact test requirements at minimum design metal temperature (MDMT) and rating limits at maximum temperature.",
    failureAvoided: "Rating or material limitations being overlooked."
  },
  {
    ruleNumber: 24,
    title: "MINIMUM WALL THICKNESS IS NOT ONLY A PRESSURE-DESIGN ISSUE",
    section: "WALL THICKNESS, CORROSION & EROSION",
    domain: "Wall Thickness, Corrosion & Erosion",
    goldenRule: "A pipe can pass internal-pressure thickness calculation and still fail under vacuum, bending, vibration, support loads, handling or external pressure.",
    heuristic: "Perform structural and buckling checks for thin-wall, large-diameter or vacuum piping.",
    failureAvoided: "Non-pressure failure of thin-wall piping."
  },
  {
    ruleNumber: 25,
    title: "IDENTIFY THE CORROSION MECHANISM BEFORE ASSIGNING CA",
    section: "WALL THICKNESS, CORROSION & EROSION",
    domain: "Wall Thickness, Corrosion & Erosion",
    goldenRule: "Corrosion allowance must have a technical basis.",
    heuristic: "Consider corrosion rate, design life, inspection philosophy, uncertainty, environment and material.",
    failureAvoided: "Arbitrary or ineffective CA selection."
  },
  {
    ruleNumber: 26,
    title: "DEAD LEGS DESERVE SPECIAL ATTENTION",
    section: "WALL THICKNESS, CORROSION & EROSION",
    domain: "Wall Thickness, Corrosion & Erosion",
    goldenRule: "Low-flow branches, drains, vents and unused bypasses can have different degradation mechanisms from the main line.",
    heuristic: "Inspect dead legs for water accumulation, stagnant microbial corrosion (MIC), and solids settling.",
    failureAvoided: "Localized corrosion hidden in stagnant sections."
  },
  {
    ruleNumber: 27,
    title: "WATER LOCATION CAN MATTER MORE THAN WATER CONTENT",
    section: "WALL THICKNESS, CORROSION & EROSION",
    domain: "Wall Thickness, Corrosion & Erosion",
    goldenRule: "A small water phase can create severe localized corrosion where it settles.",
    heuristic: "Check low points, dead legs, temperature transitions and condensation zones.",
    failureAvoided: "Bottom-of-line and localized corrosion."
  },
  {
    ruleNumber: 28,
    title: "EROSION FOLLOWS FLOW DISTURBANCE",
    section: "WALL THICKNESS, CORROSION & EROSION",
    domain: "Wall Thickness, Corrosion & Erosion",
    goldenRule: "Inspect and evaluate elbows, reducers, tees, control-valve downstream sections and other turbulence-producing locations in erosive service.",
    heuristic: "Check fluid velocity limits, impingement zones and downstream turbulence length (minimum 5D-10D).",
    failureAvoided: "Local wall thinning despite acceptable average corrosion rate."
  },
  {
    ruleNumber: 29,
    title: "VELOCITY LIMITS ARE SERVICE-SPECIFIC",
    section: "WALL THICKNESS, CORROSION & EROSION",
    domain: "Wall Thickness, Corrosion & Erosion",
    goldenRule: "Do not apply one universal velocity rule to every service.",
    heuristic: "Consider fluid phase, solids, corrosivity, erosion, noise, vibration, pressure drop and equipment requirements.",
    failureAvoided: "Overly simplistic hydraulic design."
  },
  {
    ruleNumber: 30,
    title: "INSPECTION SHOULD FOLLOW DAMAGE MECHANISM",
    section: "WALL THICKNESS, CORROSION & EROSION",
    domain: "Wall Thickness, Corrosion & Erosion",
    goldenRule: "Inspection locations should be selected based on where degradation is expected, not merely by geometric convenience.",
    heuristic: "Map CMLs (Condition Monitoring Locations) to specific expected damage mechanisms.",
    failureAvoided: "Missing the actual damage locations."
  },

  // SECTION 5 - FLANGES, GASKETS & BOLTING
  {
    ruleNumber: 31,
    title: "SAME NPS DOES NOT MEAN SAME INTERFACE",
    section: "FLANGES, GASKETS & BOLTING",
    domain: "Flanges, Gaskets & Bolting",
    goldenRule: "Verify flange standard, dimensions, rating, facing, bolt circle, bore and gasket arrangement.",
    heuristic: "Never mix ASME B16.5, ASME B16.47 Series A/B, or EN 1092-1 flanges without verifying bolt circle and face dimensions.",
    failureAvoided: "Dimensional mismatch."
  },
  {
    ruleNumber: 32,
    title: "SAME CLASS DOES NOT MEAN SAME RATING AT ALL TEMPERATURES",
    section: "FLANGES, GASKETS & BOLTING",
    domain: "Flanges, Gaskets & Bolting",
    goldenRule: "Pressure-temperature rating must be checked for the actual material group and design temperature.",
    heuristic: "Derate flange allowable pressure as operating temperature increases per ASME B16.5 tables.",
    failureAvoided: "High-temperature rating exceedance."
  },
  {
    ruleNumber: 33,
    title: "GASKET SELECTION IS PART OF PRESSURE-BOUNDARY DESIGN",
    section: "FLANGES, GASKETS & BOLTING",
    domain: "Flanges, Gaskets & Bolting",
    goldenRule: "Select gasket based on service, pressure, temperature, flange facing, chemical compatibility and leakage requirements.",
    heuristic: "Use spiral wound gaskets with inner rings for Class 300 and higher or vacuum service.",
    failureAvoided: "Leakage or gasket failure."
  },
  {
    ruleNumber: 34,
    title: "FLANGE LEAKAGE IS NOT ALWAYS A GASKET PROBLEM",
    section: "FLANGES, GASKETS & BOLTING",
    domain: "Flanges, Gaskets & Bolting",
    goldenRule: "Investigate alignment, flange rotation, piping loads, bolt condition, gasket installation, surface condition and thermal effects.",
    heuristic: "Check external piping bending moments and thermal expansion forces acting on flange joints.",
    failureAvoided: "Repeated gasket replacement without correcting the root cause."
  },
  {
    ruleNumber: 35,
    title: "BOLTING IS A DESIGNED COMPONENT",
    section: "FLANGES, GASKETS & BOLTING",
    domain: "Flanges, Gaskets & Bolting",
    goldenRule: "Verify material, strength, temperature capability, corrosion environment, tightening method and compatibility with the flange/gasket system.",
    heuristic: "Use ASME B18.31.2 / ASTM A193 B7 stud bolts for high temp/pressure, A193 L7 for low temp (-50°F), and A193 B8M for sour/corrosive service.",
    failureAvoided: "Bolt failure, relaxation and leakage."
  },

  // SECTION 6 - VALVES & SPECIAL COMPONENTS
  {
    ruleNumber: 36,
    title: "VALVE TYPE MUST FOLLOW FUNCTION",
    section: "VALVES & SPECIAL COMPONENTS",
    domain: "Valves & Special Components",
    goldenRule: "Select valves according to isolation, throttling, control, check, emergency shutdown or relief function.",
    heuristic: "Do not use gate or ball valves for continuous throttling; use globe or dedicated control valves.",
    failureAvoided: "Using a valve outside its intended duty."
  },
  {
    ruleNumber: 37,
    title: "VALVE RATING MUST COVER THE SYSTEM ENVELOPE",
    section: "VALVES & SPECIAL COMPONENTS",
    domain: "Valves & Special Components",
    goldenRule: "Verify valve pressure-temperature capability independently from the pipe.",
    heuristic: "Ensure valve trim, packing, seat seals, and body rating match or exceed maximum design envelope.",
    failureAvoided: "Valve becoming the weak pressure-boundary component."
  },
  {
    ruleNumber: 38,
    title: "VALVE OPERABILITY IS PART OF DESIGN",
    section: "VALVES & SPECIAL COMPONENTS",
    domain: "Valves & Special Components",
    goldenRule: "A valve is not properly installed unless it can be safely operated and maintained.",
    heuristic: "Check handwheel, gearbox, stem, access, platform, clearance and removal envelope.",
    failureAvoided: "Inaccessible or unsafe valves."
  },
  {
    ruleNumber: 39,
    title: "DO NOT USE A VALVE AS A SUBSTITUTE FOR PROCESS DESIGN",
    section: "VALVES & SPECIAL COMPONENTS",
    domain: "Valves & Special Components",
    goldenRule: "A valve cannot compensate indefinitely for poor line sizing, excessive pressure drop or incorrect hydraulic design.",
    heuristic: "Optimize pipe sizing and hydraulic profile before relying on valve throttling.",
    failureAvoided: "Cavitation, erosion, noise and unstable operation."
  },
  {
    ruleNumber: 40,
    title: "SEVERE DELTA-P REQUIRES SPECIAL REVIEW",
    section: "VALVES & SPECIAL COMPONENTS",
    domain: "Valves & Special Components",
    goldenRule: "Large pressure drop can create cavitation, flashing, erosion, noise and vibration.",
    heuristic: "Evaluate control valve cavitation index (Sigma) and acoustic power level (dB) when Delta-P exceeds 50% of inlet pressure.",
    failureAvoided: "Premature valve and downstream piping damage."
  },
  {
    ruleNumber: 41,
    title: "DBB MEANS FUNCTIONAL ISOLATION, NOT SIMPLY TWO VALVES",
    section: "VALVES & SPECIAL COMPONENTS",
    domain: "Valves & Special Components",
    goldenRule: "Verify block, bleed, trapped-pressure verification, drain/vent arrangement, access and operating philosophy.",
    heuristic: "Provide a dedicated bleed valve between twin block valves with positive isolation indicators.",
    failureAvoided: "False isolation confidence."
  },
  {
    ruleNumber: 42,
    title: "CHECK VALVE SELECTION MUST CONSIDER DYNAMIC BEHAVIOR",
    section: "VALVES & SPECIAL COMPONENTS",
    domain: "Valves & Special Components",
    goldenRule: "Check valve type must account for flow direction, velocity, transients, slam potential and installation orientation.",
    heuristic: "Use non-slam nozzle check valves on compressor discharges and high-head pump discharges.",
    failureAvoided: "Water hammer and valve damage."
  },

  // SECTION 7 - BRANCHES, REINFORCEMENT & HOT TAPS
  {
    ruleNumber: 43,
    title: "LARGE BRANCHES ARE STRUCTURAL MODIFICATIONS TO THE HEADER",
    section: "BRANCHES, REINFORCEMENT & HOT TAPS",
    domain: "Branches & Hot Taps",
    goldenRule: "A large branch changes local stress distribution and may require formal reinforcement assessment.",
    heuristic: "Evaluate branch-to-header diameter ratio (d/D); when d/D > 0.5, perform explicit ASME B31.3 Para 304.3 branch reinforcement calculations.",
    failureAvoided: "Treating a major branch as a simple connection."
  },
  {
    ruleNumber: 44,
    title: "REINFORCEMENT PAD DIMENSIONS ARE ENGINEERING VARIABLES",
    section: "BRANCHES, REINFORCEMENT & HOT TAPS",
    domain: "Branches & Hot Taps",
    goldenRule: "Pad width, diameter, thickness, opening and weld geometry affect credited reinforcement.",
    heuristic: "Specify repad outer diameter, thickness, material grade, and 1/4\" NPT telltale vent hole.",
    failureAvoided: "Field trimming invalidating the original calculation."
  },
  {
    ruleNumber: 45,
    title: "ANY REPAD MODIFICATION REQUIRES REASSESSMENT",
    section: "BRANCHES, REINFORCEMENT & HOT TAPS",
    domain: "Branches & Hot Taps",
    goldenRule: "Do not reduce, relocate or reshape a reinforcement pad based solely on visual judgement.",
    heuristic: "Re-calculate effective reinforcement area (A1+A2+A3+A4) per ASME B31.3 whenever repad dimensions are modified.",
    failureAvoided: "Loss of pressure-boundary reinforcement."
  },
  {
    ruleNumber: 46,
    title: "WELD AREA IS NOT AUTOMATICALLY CREDITABLE AREA",
    section: "BRANCHES, REINFORCEMENT & HOT TAPS",
    domain: "Branches & Hot Taps",
    goldenRule: "Only credit weld reinforcement according to the applicable calculation methodology and effective reinforcement zone.",
    heuristic: "Credit weld area only within the d2 zone defined by code limits.",
    failureAvoided: "Overestimating reinforcement."
  },
  {
    ruleNumber: 47,
    title: "HOT TAP IS BOTH A PRESSURE-BOUNDARY AND WELDING PROBLEM",
    section: "BRANCHES, REINFORCEMENT & HOT TAPS",
    domain: "Branches & Hot Taps",
    goldenRule: "Hot-tap suitability depends on remaining wall, flow, heat transfer, welding procedure, burn-through risk and service.",
    heuristic: "Verify minimum remaining wall thickness (minimum 4.8mm / 0.188\"), process flow rate for heat dissipation, and low-hydrogen electrodes (H4).",
    failureAvoided: "Unsafe hot-tap execution."
  },
  {
    ruleNumber: 48,
    title: "HOT-TAP DATA MUST BE CURRENT",
    section: "BRANCHES, REINFORCEMENT & HOT TAPS",
    domain: "Branches & Hot Taps",
    goldenRule: "Existing wall thickness and condition near the proposed hot tap must be verified.",
    heuristic: "Obtain 100% UT thickness mapping and shear-wave examination around 360 degrees of the hot-tap welding zone.",
    failureAvoided: "Designing on nominal or outdated wall data."
  },
  {
    ruleNumber: 49,
    title: "HOT-TAP VALVE BORE AND MACHINE ENVELOPE MATTER",
    section: "BRANCHES, REINFORCEMENT & HOT TAPS",
    domain: "Branches & Hot Taps",
    goldenRule: "Branch design must accommodate the actual hot-tap machine, cutter, valve bore and required access.",
    heuristic: "Verify full-port ball or gate valve internal diameter exceeds hot-tap cutter OD with minimum clearance.",
    failureAvoided: "A technically valid branch that cannot be executed."
  },
  {
    ruleNumber: 50,
    title: "FIELD CLEARANCE DOES NOT OVERRIDE CODE REQUIREMENTS",
    section: "BRANCHES, REINFORCEMENT & HOT TAPS",
    domain: "Branches & Hot Taps",
    goldenRule: "Physical constraints can trigger a design change, but they do not justify unverified reduction of pressure-boundary capacity.",
    heuristic: "Re-analyze any field-altered branch connection before pressure testing.",
    failureAvoided: "Unsafe field modifications."
  },

  // SECTION 8 - SMALL-BORE, VIBRATION & FATIGUE
  {
    ruleNumber: 51,
    title: "SMALL-BORE IS NOT SMALL RISK",
    section: "SMALL-BORE, VIBRATION & FATIGUE",
    domain: "Small-Bore & Vibration",
    goldenRule: "Small-bore connections can be fatigue-critical even when the main pipe has large structural capacity.",
    heuristic: "Treat all 2\" and smaller branch connections on vibrating, high-velocity, or cyclic headers as fatigue-critical.",
    failureAvoided: "Repeated branch cracking."
  },
  {
    ruleNumber: 52,
    title: "MINIMIZE SMALL-BORE CANTILEVER LENGTH",
    section: "SMALL-BORE, VIBRATION & FATIGUE",
    domain: "Small-Bore & Vibration",
    goldenRule: "Long unsupported projections amplify vibration stresses.",
    heuristic: "Keep unsupported small-bore valve assemblies and vents/drains as short as physically possible (maximum 150mm - 200mm standoff).",
    failureAvoided: "Fatigue failure."
  },
  {
    ruleNumber: 53,
    title: "RECIPROCATING MACHINERY REQUIRES DYNAMIC THINKING",
    section: "SMALL-BORE, VIBRATION & FATIGUE",
    domain: "Small-Bore & Vibration",
    goldenRule: "Static stress acceptance does not prove vibration integrity near reciprocating machinery.",
    heuristic: "Perform dynamic acoustic pulsation and structural natural frequency analysis per API 618 / API 688.",
    failureAvoided: "High-cycle fatigue cracking."
  },
  {
    ruleNumber: 54,
    title: "DO NOT ADD GUSSETS BLINDLY",
    section: "SMALL-BORE, VIBRATION & FATIGUE",
    domain: "Small-Bore & Vibration",
    goldenRule: "A gusset changes local stiffness and may shift vibration or stress to another location.",
    heuristic: "Design gusset plates in two orthogonal planes attached to header pads rather than directly to thin pipe wall.",
    failureAvoided: "Moving the failure rather than solving the cause."
  },
  {
    ruleNumber: 55,
    title: "VIBRATION PROBLEMS REQUIRE ROOT-CAUSE ANALYSIS",
    section: "SMALL-BORE, VIBRATION & FATIGUE",
    domain: "Small-Bore & Vibration",
    goldenRule: "Determine whether the source is pulsation, resonance, turbulence, mechanical vibration, poor support or acoustic excitation.",
    heuristic: "Measure vibration velocity (mm/s RMS) and peak frequencies before specifying structural or hydraulic remedies.",
    failureAvoided: "Treating vibration symptoms only."
  },
  {
    ruleNumber: 56,
    title: "FATIGUE IS A DIFFERENT FAILURE MODE FROM STATIC OVERSTRESS",
    section: "SMALL-BORE, VIBRATION & FATIGUE",
    domain: "Small-Bore & Vibration",
    goldenRule: "Repeated small stresses can cause failure even when static stresses are below allowable limits.",
    heuristic: "Evaluate S-N fatigue curves and stress concentration factors (SCF) at all welded attachments subject to > 10^5 cycles.",
    failureAvoided: "Misinterpreting fatigue-critical piping as safe because static stress is acceptable."
  },

  // SECTION 9 - PIPING LAYOUT & OPERABILITY
  {
    ruleNumber: 57,
    title: "THE SHORTEST ROUTE IS NOT NECESSARILY THE BEST ROUTE",
    section: "PIPING LAYOUT & OPERABILITY",
    domain: "Piping Layout & Operability",
    goldenRule: "Optimize hydraulics, flexibility, support, equipment loads, access, maintenance, construction and safety.",
    heuristic: "Balance thermal expansion flexibility loops against pressure drop and structural support costs.",
    failureAvoided: "Locally efficient but globally poor routing."
  },
  {
    ruleNumber: 58,
    title: "ROUTE PIPING WITH FUTURE MAINTENANCE IN MIND",
    section: "PIPING LAYOUT & OPERABILITY",
    domain: "Piping Layout & Operability",
    goldenRule: "Ask how valves, strainers, pumps, instruments and spools will actually be removed.",
    heuristic: "Provide break-away flange spools and overhead monorail/crane clearance above heavy inline equipment (>25 kg).",
    failureAvoided: "Maintenance shutdown difficulties."
  },
  {
    ruleNumber: 59,
    title: "DRAINABILITY MUST BE VERIFIED IN 3D",
    section: "PIPING LAYOUT & OPERABILITY",
    domain: "Piping Layout & Operability",
    goldenRule: "A drain shown on the P&ID is useful only if the physical geometry allows the system to drain.",
    heuristic: "Slope gas lines toward knockout drums (1:500 minimum) and ensure process liquid lines slope to low-point drains.",
    failureAvoided: "Trapped liquid."
  },
  {
    ruleNumber: 60,
    title: "VENT LOCATION MUST FOLLOW THE ACTUAL HIGH POINT",
    section: "PIPING LAYOUT & OPERABILITY",
    domain: "Piping Layout & Operability",
    goldenRule: "A nearby vent is not necessarily an effective high-point vent.",
    heuristic: "Locate high-point vents at the absolute top elevation of piping loops for hydrotest gas removal.",
    failureAvoided: "Trapped gas and incomplete venting."
  },
  {
    ruleNumber: 61,
    title: "LOW POINTS NEED FUNCTIONAL REVIEW",
    section: "PIPING LAYOUT & OPERABILITY",
    domain: "Piping Layout & Operability",
    goldenRule: "Every significant low point should be evaluated for liquid accumulation, corrosion, freezing, drainage and operational consequences.",
    heuristic: "Provide valved drains at all low points in gas lines subject to condensation or hydrotesting.",
    failureAvoided: "Hidden liquid pockets."
  },
  {
    ruleNumber: 62,
    title: "MAINTENANCE ENVELOPES ARE DESIGN SPACE",
    section: "PIPING LAYOUT & OPERABILITY",
    domain: "Piping Layout & Operability",
    goldenRule: "Reserve space for removal, lifting, bolt access, actuator removal, bonnet removal and spool extraction.",
    heuristic: "Maintain minimum 500mm clear access zone around control valve actuators and manual handwheels.",
    failureAvoided: "Equipment that can operate but cannot be maintained."
  },
  {
    ruleNumber: 63,
    title: "OPERATOR ACCESS IS A FUNCTIONAL REQUIREMENT",
    section: "PIPING LAYOUT & OPERABILITY",
    domain: "Piping Layout & Operability",
    goldenRule: "Routine operating valves and instruments should be safely accessible.",
    heuristic: "Locate handwheels for operating valves between 0.8m and 1.5m above grade or permanent platform.",
    failureAvoided: "Unsafe ladders, temporary access and operational workarounds."
  },
  {
    ruleNumber: 64,
    title: "PLATFORM AND STRUCTURAL CLEARANCE MUST BE CHECKED WITH VALVE MOVEMENT",
    section: "PIPING LAYOUT & OPERABILITY",
    domain: "Piping Layout & Operability",
    goldenRule: "Static clearance around a valve is not enough; include handwheel/gearbox movement and maintenance removal.",
    heuristic: "Verify full open/closed stem travel and gear operator envelope against structural members.",
    failureAvoided: "Valve obstruction."
  },

  // SECTION 10 - EQUIPMENT NOZZLES & ROTATING EQUIPMENT
  {
    ruleNumber: 65,
    title: "PASSING PIPE STRESS DOES NOT PROVE NOZZLE ACCEPTABILITY",
    section: "EQUIPMENT NOZZLES & ROTATING EQUIPMENT",
    domain: "Equipment Nozzles & Rotating Equipment",
    goldenRule: "Piping code compliance and equipment nozzle load acceptance are separate checks.",
    heuristic: "Compare piping reaction forces and moments against API 610 (pumps), API 617/618 (compressors), or NEMA SM23 (turbines) allowable nozzle limits.",
    failureAvoided: "Equipment nozzle overload."
  },
  {
    ruleNumber: 66,
    title: "NEVER FORCE PIPING INTO EQUIPMENT",
    section: "EQUIPMENT NOZZLES & ROTATING EQUIPMENT",
    domain: "Equipment Nozzles & Rotating Equipment",
    goldenRule: "Difficult flange alignment is a warning sign.",
    heuristic: "Verify final cold alignment of piping flanges to equipment nozzles within 0.15mm (0.006\") without using chain falls or jacks.",
    failureAvoided: "Hidden sustained loads and excessive nozzle loads."
  },
  {
    ruleNumber: 67,
    title: "PUMP SUCTION PIPING DESERVE SPECIAL ATTENTION",
    section: "EQUIPMENT NOZZLES & ROTATING EQUIPMENT",
    domain: "Equipment Nozzles & Rotating Equipment",
    goldenRule: "Suction piping must satisfy hydraulic, NPSH, flow distribution, flexibility and nozzle-load requirements.",
    heuristic: "Maintain minimum 5D straight pipe length upstream of pump suction nozzle; use eccentric reducers flat-side-up to prevent air pockets.",
    failureAvoided: "Cavitation, vibration and pump performance problems."
  },
  {
    ruleNumber: 68,
    title: "PUMP DISCHARGE PIPING MUST ACCOUNT FOR TRANSIENTS",
    section: "EQUIPMENT NOZZLES & ROTATING EQUIPMENT",
    domain: "Equipment Nozzles & Rotating Equipment",
    goldenRule: "Consider check-valve behavior, pump trip, water hammer and pressure surge where relevant.",
    heuristic: "Locate discharge check valve immediately downstream of pump prior to isolation block valve.",
    failureAvoided: "Dynamic overpressure and support failures."
  },
  {
    ruleNumber: 69,
    title: "COMPRESSOR PIPING IS A DYNAMIC SYSTEM",
    section: "EQUIPMENT NOZZLES & ROTATING EQUIPMENT",
    domain: "Equipment Nozzles & Rotating Equipment",
    goldenRule: "Reciprocating and other dynamic machinery may require pulsation, vibration and fatigue assessment.",
    heuristic: "Perform acoustic pulsation analysis (API 618) and anchor compressor piping on heavy reinforced concrete foundations.",
    failureAvoided: "Repeated piping failures despite acceptable static stress."
  },
  {
    ruleNumber: 70,
    title: "PROVIDE REALISTIC EQUIPMENT MAINTENANCE PATHS",
    section: "EQUIPMENT NOZZLES & ROTATING EQUIPMENT",
    domain: "Equipment Nozzles & Rotating Equipment",
    goldenRule: "A pump, valve or compressor component must have a practical removal route.",
    heuristic: "Design removable piping spools at pump suction/discharge to allow casing and impeller removal without cutting pipe.",
    failureAvoided: "Maintenance requiring major dismantling."
  },

  // SECTION 11 - SUPPORTS & STRESS
  {
    ruleNumber: 71,
    title: "EVERY PIPE NEEDS A CREDIBLE LOAD PATH",
    section: "SUPPORTS & STRESS",
    domain: "Supports & Stress",
    goldenRule: "Every significant load must eventually transfer to a capable support structure, foundation or equipment.",
    heuristic: "Verify vertical weight, horizontal thermal, and dynamic loads transfer cleanly through steel structures down to foundations.",
    failureAvoided: "Unsupported or unrealistic load assumptions."
  },
  {
    ruleNumber: 72,
    title: "MORE SUPPORTS DO NOT ALWAYS MEAN BETTER PIPING",
    section: "SUPPORTS & STRESS",
    domain: "Supports & Stress",
    goldenRule: "Additional restraints can increase thermal stress and equipment loads.",
    heuristic: "Use flexible expansion loops or directional guides rather than rigid anchors on high-temperature piping lines.",
    failureAvoided: "Over-restrained piping."
  },
  {
    ruleNumber: 73,
    title: "EVERY ANCHOR CREATES A CONSEQUENCE",
    section: "SUPPORTS & STRESS",
    domain: "Supports & Stress",
    goldenRule: "An anchor redirects thermal expansion rather than eliminating it.",
    heuristic: "Calculate axial anchor forces and verify structural steel capacity to withstand full thermal thrust.",
    failureAvoided: "Unexpected thermal forces."
  },
  {
    ruleNumber: 74,
    title: "SUPPORTS MUST BE REVIEWED UNDER ALL RELEVANT CONDITIONS",
    section: "SUPPORTS & STRESS",
    domain: "Supports & Stress",
    goldenRule: "Check weight, thermal movement, pressure, wind, seismic, vibration and occasional loads as applicable.",
    heuristic: "Evaluate hydrotest weight case (water-filled) for gas lines to prevent beam deflections and support failure.",
    failureAvoided: "Support failure in operating or upset conditions."
  },
  {
    ruleNumber: 75,
    title: "FRICTION ASSUMPTIONS MUST MATCH REALITY",
    section: "SUPPORTS & STRESS",
    domain: "Supports & Stress",
    goldenRule: "Stress analysis friction coefficients should reflect the actual support interface as far as practicable.",
    heuristic: "Use mu = 0.3 for steel-on-steel, mu = 0.1 for PTFE/Teflon slide plates in Caesar II models.",
    failureAvoided: "Incorrect thermal-load prediction."
  },
  {
    ruleNumber: 76,
    title: "SPRING SUPPORTS REQUIRE HOT/COLD REVIEW",
    section: "SUPPORTS & STRESS",
    domain: "Supports & Stress",
    goldenRule: "Check load variation, travel, cold setting, hot position and physical accessibility.",
    heuristic: "Limit spring load variation between hot and cold conditions to maximum 25% [(Hot Load - Cold Load)/Hot Load].",
    failureAvoided: "Spring bottoming, excessive load variation and support malfunction."
  },
  {
    ruleNumber: 77,
    title: "SUPPORT ATTACHMENTS CAN CREATE LOCAL STRESS",
    section: "SUPPORTS & STRESS",
    domain: "Supports & Stress",
    goldenRule: "Do not treat support clips and attachments as harmless additions to thin-wall or highly stressed piping.",
    heuristic: "Perform WRC 107/297 or FEA stress calculations for welded trunnions and lug attachments on thin-wall pipe.",
    failureAvoided: "Local overstress and fatigue cracking."
  },
  {
    ruleNumber: 78,
    title: "STRESS RESULTS MUST BE REVIEWED IN THE 3D MODEL",
    section: "SUPPORTS & STRESS",
    domain: "Supports & Stress",
    goldenRule: "Check displacement envelopes, support movements, clashes, access and structural interaction.",
    heuristic: "Overlay Caesar II thermal displacement vectors onto 3D CAD model to confirm zero clashes in hot condition.",
    failureAvoided: "Mathematically acceptable but physically unworkable design."
  },

  // SECTION 12 - PSV, RELIEF, VENTS, DRAINS & PRESSURE TESTING
  {
    ruleNumber: 79,
    title: "START RELIEF DESIGN WITH THE OVERPRESSURE SCENARIO",
    section: "PSV, RELIEF, VENTS, DRAINS & PRESSURE TESTING",
    domain: "PSV & Pressure Testing",
    goldenRule: "First identify why overpressure can occur; then size/select the relief device and piping.",
    heuristic: "Evaluate governing relief scenario per API 521 (fire, blocked outlet, tube rupture, thermal expansion) before sizing PSV orifice.",
    failureAvoided: "Incorrect relief basis."
  },
  {
    ruleNumber: 80,
    title: "PSV INLET PIPING IS PART OF PSV PERFORMANCE",
    section: "PSV, RELIEF, VENTS, DRAINS & PRESSURE TESTING",
    domain: "PSV & Pressure Testing",
    goldenRule: "Evaluate inlet pressure loss and stability considerations using the applicable relief-system requirements.",
    heuristic: "Keep total non-recoverable pressure drop in PSV inlet piping below 3% of set pressure per API 520 Part II.",
    failureAvoided: "PSV instability or chatter."
  },
  {
    ruleNumber: 81,
    title: "PSV OUTLET PIPING MUST BE DESIGNED AS A SYSTEM",
    section: "PSV, RELIEF, VENTS, DRAINS & PRESSURE TESTING",
    domain: "PSV & Pressure Testing",
    goldenRule: "Consider backpressure, reaction forces, thermal effects, drainage and structural loads.",
    heuristic: "Calculate built-up backpressure and mechanical reaction forces (F = qm * V + (P - Pa)*A) at PSV discharge elbows.",
    failureAvoided: "Relief-system malfunction or piping damage."
  },
  {
    ruleNumber: 82,
    title: "TRAPPED LIQUID CAN CREATE A PRESSURE HAZARD",
    section: "PSV, RELIEF, VENTS, DRAINS & PRESSURE TESTING",
    domain: "PSV & Pressure Testing",
    goldenRule: "Identify liquid-filled sections that can become blocked and thermally expand.",
    heuristic: "Install 3/4\" thermal relief valves (TSVs) on all liquid-full piping segments that can be isolated between block valves and exposed to solar heating.",
    failureAvoided: "Thermal overpressure rupture."
  },
  {
    ruleNumber: 83,
    title: "HYDROTEST BOUNDARIES MUST BE ENGINEERED",
    section: "PSV, RELIEF, VENTS, DRAINS & PRESSURE TESTING",
    domain: "PSV & Pressure Testing",
    goldenRule: "Identify components that cannot withstand test pressure and establish controlled test limits.",
    heuristic: "Isolate control valves, expansion joints, orifice plates, and instruments using spades or blinds before hydrotesting.",
    failureAvoided: "Damage to valves, instruments, PSVs or equipment."
  },
  {
    ruleNumber: 84,
    title: "PNEUMATIC TESTING IS NOT A FASTER HYDROTEST",
    section: "PSV, RELIEF, VENTS, DRAINS & PRESSURE TESTING",
    domain: "PSV & Pressure Testing",
    goldenRule: "Pneumatic testing involves substantially higher stored energy and requires specific engineering justification and controls.",
    heuristic: "Calculate total stored energy (E = 2.5 * P1 * V1 * [1 - (P2/P1)^0.286]) and establish safety exclusion zones before pneumatic testing.",
    failureAvoided: "Catastrophic test failure."
  },
  {
    ruleNumber: 85,
    title: "TEST PRESSURE MUST COME FROM THE GOVERNING BASIS",
    section: "PSV, RELIEF, VENTS, DRAINS & PRESSURE TESTING",
    domain: "PSV & Pressure Testing",
    goldenRule: "Do not apply a universal pressure multiplier without checking the applicable code and project requirements.",
    heuristic: "Hydrotest ASME B31.3 piping at minimum 1.5x design pressure multiplied by stress ratio [St/S].",
    failureAvoided: "Incorrect test pressure."
  },

  // SECTION 13 - INSULATION, LOW TEMPERATURE & HEAT TRACING
  {
    ruleNumber: 86,
    title: "COLD INSULATION IS ALSO A VAPOR-BARRIER SYSTEM",
    section: "INSULATION, LOW TEMPERATURE & HEAT TRACING",
    domain: "Insulation & Heat Tracing",
    goldenRule: "Insulation thickness alone does not ensure cold-service performance.",
    heuristic: "Apply continuous elastomeric/aluminum vapor barrier jacket sealed at all joints for cryogenic and cold piping (-50°C to 10°C).",
    failureAvoided: "Moisture ingress and insulation degradation."
  },
  {
    ruleNumber: 87,
    title: "INSULATION SUPPORT DETAILS MATTER",
    section: "INSULATION, LOW TEMPERATURE & HEAT TRACING",
    domain: "Insulation & Heat Tracing",
    goldenRule: "Supports can create thermal bridges and condensation points.",
    heuristic: "Use high-density polyurethane (HDPU) or cellular glass cold support blocks to prevent thermal bridging.",
    failureAvoided: "Local condensation and CUI."
  },
  {
    ruleNumber: 88,
    title: "HEAT TRACING AND INSULATION MUST BE DESIGNED TOGETHER",
    section: "INSULATION, LOW TEMPERATURE & HEAT TRACING",
    domain: "Insulation & Heat Tracing",
    goldenRule: "Cable capacity alone does not guarantee freeze protection or temperature maintenance.",
    heuristic: "Perform heat loss calculations matching tracer watt-density against insulation thermal conductivity (k-value).",
    failureAvoided: "Freezing and loss of process temperature."
  },
  {
    ruleNumber: 89,
    title: "INSULATION CAN HIDE CORROSION",
    section: "INSULATION, LOW TEMPERATURE & HEAT TRACING",
    domain: "Insulation & Heat Tracing",
    goldenRule: "Provide inspection/removal strategy at corrosion-sensitive locations.",
    heuristic: "Specify CUI-resistant thermal spray aluminum (TSA) or epoxy coating for carbon steel operating between -4°C and 175°C.",
    failureAvoided: "Undetected corrosion under insulation (CUI)."
  },
  {
    ruleNumber: 90,
    title: "PERSONNEL PROTECTION IS A FUNCTIONAL REQUIREMENT",
    section: "INSULATION, LOW TEMPERATURE & HEAT TRACING",
    domain: "Insulation & Heat Tracing",
    goldenRule: "Hot surfaces and accessible cold surfaces require consideration independent of process heat-loss requirements.",
    heuristic: "Install personnel protection wire mesh guards or insulation on all uninsulated lines operating above 60°C or below -10°C accessible to operators.",
    failureAvoided: "Personnel burn injury."
  },

  // SECTION 14 - FABRICATION, ERECTION & CONSTRUCTABILITY
  {
    ruleNumber: 91,
    title: "DESIGN FOR WELD ACCESS",
    section: "FABRICATION, ERECTION & CONSTRUCTABILITY",
    domain: "Fabrication & Constructability",
    goldenRule: "A theoretically weldable joint is not necessarily practically weldable.",
    heuristic: "Maintain minimum 100mm clearance between parallel pipe welds and structural steel members for torch and NDE access.",
    failureAvoided: "Poor weld quality and construction rework."
  },
  {
    ruleNumber: 92,
    title: "MINIMIZE UNNECESSARY FIELD WELDS",
    section: "FABRICATION, ERECTION & CONSTRUCTABILITY",
    domain: "Fabrication & Constructability",
    goldenRule: "Fabricate complex assemblies in controlled shop conditions where practical.",
    heuristic: "Limit field welds to final tie-in locations (pup pieces) and max spool transport dimensions (12m x 2.5m x 2.5m).",
    failureAvoided: "Increased field welding variability and elevated-work exposure."
  },
  {
    ruleNumber: 93,
    title: "FIELD WELD LOCATIONS MUST BE DELIBERATE",
    section: "FABRICATION, ERECTION & CONSTRUCTABILITY",
    domain: "Fabrication & Constructability",
    goldenRule: "Field welds should be selected for access, alignment, NDE and erection—not simply because a spool ends there.",
    heuristic: "Locate field fit-up welds at accessible grade/platform elevations rather than mid-air overhead spans.",
    failureAvoided: "Inaccessible or poor-quality field welds."
  },
  {
    ruleNumber: 94,
    title: "ERECTION CONDITIONS ARE ALSO LOAD CASES",
    section: "FABRICATION, ERECTION & CONSTRUCTABILITY",
    domain: "Fabrication & Constructability",
    goldenRule: "Large spool lifting, temporary supports and erection configurations may impose loads not present in final operation.",
    heuristic: "Verify lifting lug stress and spool bending deflections during crane rigging and erection.",
    failureAvoided: "Spool deformation and lifting damage."
  },
  {
    ruleNumber: 95,
    title: "DESIGN FOR CONSTRUCTION TOLERANCES",
    section: "FABRICATION, ERECTION & CONSTRUCTABILITY",
    domain: "Fabrication & Constructability",
    goldenRule: "Do not assume perfect field dimensions and zero construction tolerance.",
    heuristic: "Provide minimum 100mm field fit-up allowance on final closure spools for brownfield tie-ins.",
    failureAvoided: "Fit-up problems and forced alignment."
  },

  // SECTION 15 - LIFECYCLE, INSPECTION & SENIOR ENGINEER MINDSET
  {
    ruleNumber: 96,
    title: "DESIGN FOR INSPECTION",
    section: "LIFECYCLE, INSPECTION & SENIOR ENGINEER MINDSET",
    domain: "Lifecycle & Senior Engineer Mindset",
    goldenRule: "Corrosion-sensitive and integrity-critical components need realistic inspection access.",
    heuristic: "Provide permanent NDT inspection ports and ladder access at all high-consequence thickness monitoring locations.",
    failureAvoided: "Inability to inspect the pressure boundary."
  },
  {
    ruleNumber: 97,
    title: "DESIGN FOR THE FIRST MAJOR MAINTENANCE",
    section: "LIFECYCLE, INSPECTION & SENIOR ENGINEER MINDSET",
    domain: "Lifecycle & Senior Engineer Mindset",
    goldenRule: "Ask how the plant will be opened, isolated, drained, blinded, dismantled and restored.",
    heuristic: "Provide flange isolation spectacle blinds/spacers and crane lifting lugs for all major inline equipment.",
    failureAvoided: "Excessive future shutdown duration and unsafe maintenance."
  },
  {
    ruleNumber: 98,
    title: "EVERY FAILURE SHOULD BECOME A NEW KNOWLEDGE RECORD",
    section: "LIFECYCLE, INSPECTION & SENIOR ENGINEER MINDSET",
    domain: "Lifecycle & Senior Engineer Mindset",
    goldenRule: "Do not close an RCA with only a corrective action; capture the transferable engineering lesson.",
    heuristic: "Distill root-cause investigation findings into permanent project design heuristics and knowledge units.",
    failureAvoided: "Repeating the same failure on another project."
  },
  {
    ruleNumber: 99,
    title: "CHALLENGE EVERY UNUSUAL ASSUMPTION",
    section: "LIFECYCLE, INSPECTION & SENIOR ENGINEER MINDSET",
    domain: "Lifecycle & Senior Engineer Mindset",
    goldenRule: "When a design depends on an unusual assumption, explicitly identify it and obtain verification.",
    heuristic: "Document and obtain written SME sign-off for any non-standard material, boundary condition, or design pressure assumption.",
    failureAvoided: "Hidden assumptions becoming design failures."
  },
  {
    ruleNumber: 100,
    title: "ALWAYS LOOK FOR THE SECOND-ORDER PROBLEM",
    section: "LIFECYCLE, INSPECTION & SENIOR ENGINEER MINDSET",
    domain: "Lifecycle & Senior Engineer Mindset",
    goldenRule: "Before finalizing any engineering solution, ask: 'What new problem could this solution create elsewhere?'",
    heuristic: "Check system-level second-order effects: Added support -> thermal load? Thicker pipe -> weight? Larger loop -> space? Changed material -> welding? Changed operating condition -> relief?",
    failureAvoided: "Local solution creating system-level failure."
  }
];
