# Changelog

## 2.0.10

### Added

- A "Show diagnostic overlay" switch in the widget settings (Troubleshooting section). Turning it on shows the live event log at the bottom of the screen on every device with no URL editing, which makes gathering diagnostics from phones trivial. The `fi_debug=1` URL switch still works as a per-session alternative.

### Changed

- Manifest and package version updated to 2.0.10.

## 2.0.9

### Changed

- Duplicate removal now prefers the web map's graphic only when that graphic can actually render a popup (it or its layer has a usable popup template). A map layer whose data source failed to initialize no longer silently swallows the configured REST result's content.
- Map popup sources are now bounded to 6 seconds per click; a slow or failing map layer no longer delays or blocks the popup, and the configured REST results are shown without it.
- The hidden runtime bridge layer is starved of drawing (`definitionExpression = '1=0'`) so it no longer re-downloads the entire configured service invisibly (doubling server load and producing tile errors on strained services). Identify queries now run against the runtime data source's own layer, which is never added to the map.
- Manifest and package version updated to 2.0.9.

### Fixed

- Parcel (configured REST) content no longer disappears from the popup when the same feature also exists in the web map on a layer with a broken or missing popup configuration.
- Popup lag caused by slow map layers or by the invisible bridge layer's duplicate feature downloads.

## 2.0.8

### Changed

- The `fi_debug=1` diagnostic log now renders as a full-width floating overlay at the bottom of the screen (newest entries first) instead of inside the widget body, so it is visible on phones even when the widget panel is closed, minimized, or tiny. The overlay ignores touches and cannot block map taps.
- Manifest and package version updated to 2.0.8.

## 2.0.7

### Changed

- Automatic popup suppression now uses the supported `JimuMapView.disableClickOpenPopup()` / `enableClickOpenPopup()` API (the same pattern as Esri's built-in Measure tool), keeping the Map widget's own popup bookkeeping consistent; raw `view.popupEnabled` is retained only as a fallback.
- `JimuMapView.openPopup()` is now tried as a programmatic popup-open strategy before the raw component and view methods.
- After a reported successful open, the widget verifies 800 ms later that the popup is actually open and falls back to rendering the first result in the widget body if it is not.
- Manifest and package version updated to 2.0.7.

### Added

- On-screen diagnostics: append `fi_debug=1` to the app URL to see a live event log (click received, widget state, popup element availability, which open strategy ran, post-open verification) inside the widget body on any device, including iOS where the console is inaccessible. All entries are also written to the browser console with a `[FeatureIdentify]` prefix.

### Fixed

- A popup that the host application closes immediately after the widget opens it no longer results in a silent tap; the result is shown in the widget body with a notice.

## 2.0.6

### Changed

- Every popup open and close strategy (`component.openPopup`, `view.openPopup`, `component.closePopup`) now runs under a bounded wait so a lazily initialized popup component can never hang the identify workflow.
- `openNativePopup` and `openNoResultPopup` now wait briefly (bounded) for the popup element before opening, giving the direct element path a chance on devices that create the popup component late.
- Popup element discovery allows up to 2.5 seconds for lazy creation instead of 1.2 seconds; it still never blocks click-listener registration.
- Manifest and package version updated to 2.0.6.

### Fixed

- Map taps no longer produce no response at all on iOS when the popup component initializes lazily and a popup open call stalls; a timed-out strategy now falls through to the next one.
- When no popup path is available at all, the first identify result is rendered in the widget body with a notice instead of being silently discarded, so popup suppression can no longer swallow results.
- A stalled `closePopup` call can no longer wedge the no-result workflow.

## 2.0.5

### Changed

- Map taps now use the underlying `MapView` click event as the primary cross-device input path, with the map-component event retained as a fallback.
- The click listener is registered before automatic popup behavior is suppressed.
- Automatic popup suppression now uses `view.popupEnabled` without globally setting `mapComponent.popupDisabled`.
- Popup element discovery has a bounded wait and runs independently from click listener registration.
- Touch events can derive their map point from screen coordinates when needed.
- The manifest now requests hidden-state updates from Experience Builder for mobile and alternate layouts.
- Manifest and package version updated to 2.0.5.

### Fixed

- All map popups are no longer suppressed on iPhone or iPad when the popup component is created lazily.
- A missing or delayed popup component can no longer prevent the identify queries from starting.
- A hidden mobile-layout instance no longer retains popup ownership.
- Failure to register a custom click listener leaves the map's native popup behavior enabled.

## 2.0.4

### Added

- A runtime Experience Builder data source for each configured REST endpoint used in popup mode.
- A hidden runtime `JimuLayerView` that links each configured endpoint graphic to its data source in the active Map widget.
- Native popup data-action support for configured endpoint results, including actions supported by the current app such as Add marker, View in table, and Export.

### Changed

- Popup mode now creates configured endpoint layers through `DataSource.createJSAPILayerByDataSource()` and registers them with `JimuMapView.addLayerAndCreateJimuLayerView()`.
- Runtime endpoint layers remain invisible, hidden from the layer list, and excluded from normal map popup discovery, so they do not draw a second parcel layer or create duplicate popup hits.
- Popup Element dictionaries are detected regardless of whether an older XML configuration supplied an expression label.
- Configured result titles are also used as runtime data-source labels.
- Manifest and package version updated to 2.0.4.

### Fixed

- The native popup actions menu is no longer omitted solely because a configured endpoint result came from a hardcoded REST query rather than an Experience Builder data source.
- Arcade dictionaries such as `{ type: 'text', text: content }` no longer render as `Expression: [object Object]`, including with older labeled expressions.
- Runtime data sources and hidden layer views are removed when the endpoint changes, the active map changes, or the widget is removed.

## 2.0.3

### Added

- Full Popup Element Arcade expressions for configured REST results.
- Blank expression labels now identify expressions that return native popup content dictionaries such as `{ type: 'text', text: content }`.

### Changed

- Full popup expressions are passed directly to the configured graphic's `PopupTemplate` so rich HTML, links, and popup formatting render natively.
- Automatically generated field rows are suppressed when a full popup expression owns the popup body, preventing duplicate attributes.
- Labeled expressions retain their existing scalar row behavior.
- Manifest and package version updated to 2.0.3.

### Fixed

- Popup Element dictionaries are no longer converted to `[object Object]`.
- HTML returned by a full popup expression is no longer escaped as plain text.

## 2.0.2

### Changed

- Popup result changes now update only the selected feature and highlight.
- The map extent, center, and scale remain unchanged when the user cycles through popup results.
- The native popup `Zoom To` action is now the only popup workflow that changes the map view.
- Automatic initial-result and cycle-navigation settings were removed from the widget settings and configuration defaults.
- Legacy saved values for `zoomToFeature` and `navigateOnCycle` are ignored.
- Manifest and package version updated to 2.0.2.

### Fixed

- Cycling to City Limits or another large feature no longer pans, recenters, zooms, or changes scale.
- Older app configurations cannot restore the automatic `goTo` behavior introduced in version 2.0.1.

## 2.0.1

### Added

- A `Fit selected feature when cycling` setting, enabled by default.
- Extent-aware popup navigation for polygons, polylines, multipoints, and extent geometries.

### Changed

- Native map popup features are always listed before configured REST endpoint features.
- The obsolete configured-first versus map-first setting has been replaced by a fixed-order notice.
- Popup cycling goes directly to the selected feature extent without an animated intermediate pan.
- Manifest and package version updated to 2.0.1.

### Fixed

- Configured endpoint results no longer appear before native map popup results, including when an older saved configuration says `configured-first`.
- Cycling to a large polygon no longer pans toward an internal popup anchor before showing the feature.
- The popup remains anchored to the original identify click while the selected feature changes.
- Citywide features navigate to their complete extent instead of an unrelated-looking intermediate area.
- Repeated selection changes supersede older widget navigation requests.

## 2.0.0

### Added

- Popup source modes for map layers, configured REST layers, or both.
- One coordinated native popup containing results from every enabled source.
- Multiple configured REST layer URLs.
- Configurable click tolerance in screen pixels.
- Multiple configured results per layer and a final popup result limit.
- Configurable map-first or configured-first navigation order.
- Duplicate removal using URL and ObjectID, REST path and ObjectID, or GlobalID.
- Preservation of native web map popup templates and actions when duplicate records are merged.
- Optional default popup templates for visible map layers without configured popups.
- Optional automatic opening of the native popup result list.
- Selected-feature highlighting that follows native popup navigation.
- Optional no-result native popup.
- Controller-state awareness so closed or hidden widgets do not continue handling map clicks.
- Request cancellation, stale-click guards, and partial source failure handling.
- Version 2 XML configuration export with version 1 import compatibility.

### Changed

- Popup mode is now the default for new widget instances.
- Combined map and configured REST results are the default popup source mode.
- Popup mode temporarily owns automatic popup behavior instead of racing the map's default click handler.
- Configured REST layers are cached independently and queried in parallel.
- Existing panel mode is retained as a configured-layer-only legacy workflow.
- Manifest and package version updated to 2.0.0 for Experience Builder 1.21.

### Fixed

- Map popup results no longer overwrite configured REST results.
- Configured REST results no longer replace native map popup results based on query timing.
- Popup state, presentation options, and native highlight settings are restored when the widget deactivates.
- Legacy map-view clicks retain screen coordinates for point and line click tolerance.
- Repeated clicks abort previous requests and cannot reopen stale results.
- Configured layers that are also present in the map no longer produce duplicate popup entries when stable identifiers are available.
