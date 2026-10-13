# 06 desktop interaction prototypes

Three layouts share one local scene and state, selected in the top bar. The second
design pass uses a full scene with edge-aligned controls instead of a card grid:

- 全景 · 车辆: wide vehicle scene, corner fuel instruments and edge controls.
- 漫游 · 地图: full-canvas map, floating vehicle and compact trip information.
- 精密 · 座舱: warm light instrument layout, fine dividers and fixed control area.

All three support light/dark UI, orbit/zoom, four vehicle control hotspots,
synthetic rain intensity, fuel detail, an optional online OSM basemap, and rotary
focus navigation. This is a browser design demo; no vehicle writes occur.

## Run

From this directory, run `python serve.py`, then open
http://127.0.0.1:8768/cockpit.html . You can pass `--port 8767` or `--assets PATH`.
The default assets path points to the existing local `outputs/lynk06_car_demo`
cache in this workspace. The original showroom assets and engine are not copied
into this repository. An independent checkout needs that local asset directory.

## Hardware and integration boundary

`window.CockpitInput.rotate(delta)`, `.press()`, and `.back()` are the proposed
input adapter boundary. Arrow keys, Enter, Esc and the demo knob controls exercise
it. No Bluetooth/USB HID device has been paired or tested. A real host must map
device events, debounce them and derive the focus order from the active screen.

Rain intensity currently has four synthetic levels, not millimetres per hour.
Actual CarAPI availability, sensor calibration, stale-data timeout, hysteresis
and animation quality tiers remain vehicle integration work. Rain does not
automatically close windows or trigger other vehicle actions in this prototype.

Control state is simulated. Lamps change material emission, door glass visibility
changes, and roof/tailgate transforms show approximate open/close feedback.
Production needs calibrated part pivots and confirmed vehicle state, pending/
failure feedback and speed/gear interlocks. Hotspots currently lack occlusion
filtering and can remain visible from the opposite side of the vehicle.

The map route and fuel figures are illustrative. The route is a layout overlay,
not a recorded GPS route or turn-by-turn route. OSM tiles are requested only after
consent, with browser caching and attribution; original raster styling stays
light even when the surrounding UI is dark. No tile prefetch or offline download.
Fuel history and live CarAPI values have not yet been bridged into this demo.

Vehicle rendering is requested when changing view/material/parts; idle continuous
draws are disabled. The rain layer is bounded to 75 strokes at about 30fps and
pauses when hidden. This does not establish performance on DHU615G; the official
model still needs geometry/material optimisation and real hardware measurement.

## Validation

Checked all three layouts at a 1920x1080 browser viewport, plus the default narrow
desktop viewport. Checked theme switching, four control actions, roof/tailgate
feedback, rain, rotary focus, fuel dialog, and real OSM tile loading. No browser
console errors during those checks. JavaScript syntax checks passed.

This work does not change the Android APK. Existing range-data and Android theme
integration tasks remain separate from choosing the desktop design direction.
