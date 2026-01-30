# Handaxe — Transmission Line Speaker Generator

A web-based tool to generate quarter-wavelength transmission-line speaker enclosures. Built to render and export 3D printable halves and end caps as STL files.

## About HTL02

HTL02 is the second iteration of the Acheulean Lab (Handaxe) Transmission Line enclosure design. A slightly refined "jack-of-all-trades" bookshelf speaker derived from the earlier Transmission Tube design, this playground allows users to generate an optimized quarter-wavelength enclosure for any speaker by inputting a tuning frequency and speaker dimensions. The playground outputs four STL files (left and right clamshells plus top and bottom end caps). After 3D printing, assemble the speaker with hot glue and stuff the enclosure with acoustic damping material such as long-fibre wool to reduce treble gain. Drill a small hole in the enclosure to pass speaker wire through.

**Live demo:**

- Demo: https://www.acheuleanlab.com/HTL_zone/WiggleCode

**How it works:**
- UI controls on the left set tuning frequency and speaker diameter.
- The 3D view renders a serpentine transmission line in Three.js.
- Click `Export STL` to download STL files for left/right halves and the two end caps.

**Structure:**
- index.html — Front page
- main.js — main application logic (Three.js scene, geometry generation, export)
- OBJLoader.js, STLExporter.js — local loader/exporter modules
- TL_Cap.obj — end cap OBJ used as a template

