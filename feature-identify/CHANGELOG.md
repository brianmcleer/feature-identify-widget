# Changelog

## 1.0.3 (2026-09-02)

### Fixed

- Intermittent missing configured results on the first app load, recoverable only by reloading the app. A runtime data source left half-built or destroyed by a startup race or page navigation was reused unvalidated under its fixed id, poisoning every later click in the session. The widget now health-checks a reused data source with a bounded wait and rebuilds it when it is destroyed, unready, or carries a destroyed layer.
- A failed configured-layer query now evicts its cached layer entry, so the next click rebuilds it fresh instead of failing for the rest of the session.
- Identify queries fall back to the map bridge layer if the dedicated query layer has been destroyed.

### Changed

- Visual Studio type errors resolved (1.0.2): id declared on WidgetProps, and Object.values results typed at all three call sites. No runtime behavior change.
- Manifest and package version updated to 1.0.3.

## 1.0.0 (2026-08-26)

First public release on GitHub.

### Features

- One coordinated native popup per map click, combining web map popup layers and one or more configured REST identify layers.
- Popup source modes: map layers only, configured REST layers only, or both combined.
- Native map popup results always appear first; configured REST endpoint results are appended last.
- Duplicate removal by layer URL and ObjectID, REST service path and ObjectID, or GlobalID. The web map's graphic is preferred only when it can actually render a popup, so a map layer with a broken or missing popup configuration cannot swallow the configured result.
- Configured endpoint results are registered as runtime Experience Builder data sources and hidden JimuLayerView instances, so the native popup data-action menu (Add marker, View in table, Export, and other app actions) works on them.
- The hidden runtime bridge layer is starved of drawing (definitionExpression 1=0), so it never re-downloads the configured service. Identify queries run against a separate query layer that is never added to the map.
- Automatic popup suppression uses the supported JimuMapView.disableClickOpenPopup() and enableClickOpenPopup() API, the same pattern Esri's built-in map tools use, with view.popupEnabled retained as a fallback.
- Every popup open and close call is time-bounded; a stalled strategy falls through to the next one, and map popup sources are bounded to 6 seconds per click so a slow layer cannot block the popup.
- If no popup path succeeds, the first identify result is rendered in the widget body with a notice, so a map tap never ends in silence.
- Selected-feature highlighting that follows popup selection without panning, recentering, or rescaling the map. The native Zoom To action remains the only navigation path.
- Field aliases, coded-value descriptions, date formatting, hyperlinks, title fields, and hidden fields for configured REST results.
- Custom Arcade title expressions, scalar row expressions, and full Popup Element expressions for configured REST results.
- Configurable click tolerance, per-layer and total result limits, no-result popup, and highlight outline style.
- XML configuration export and import.
- Legacy panel display mode for configured-layer-only workflows.
- Controller-state awareness: a closed or hidden widget releases popup ownership and stops handling map clicks.
- Troubleshooting tools: a diagnostic overlay switch in the settings panel, or add fi_debug=1 to the app URL, to see a live on-screen event log of what each map tap did on any device, including phones.
