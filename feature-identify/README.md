# Feature Identify 2.0.10

Feature Identify coordinates native web map popups and one or more REST-only identify layers so a single map click produces one predictable popup.

The widget is built for ArcGIS Experience Builder Developer Edition 1.21. It uses the Experience Builder map component as the primary integration path and retains a legacy map view fallback.

## What 2.0.7 changes

- Popup suppression now goes through the supported `JimuMapView.disableClickOpenPopup()` / `enableClickOpenPopup()` API instead of setting `view.popupEnabled` directly, matching how Esri's own map tools temporarily own the click.
- `JimuMapView.openPopup()` is tried as an additional programmatic open strategy.
- The widget verifies the popup is actually open 800 ms after a reported success and falls back to showing the result in the widget body if it is not.
- Diagnostics: open the app with `fi_debug=1` appended to the URL (for example `...?fi_debug=1` or `&fi_debug=1`) and the widget body shows a live event log of exactly what each map tap did — useful on iOS where the developer console is unavailable.

## What 2.0.6 fixes

- Popups are no longer suppressed on mobile iOS when the popup component initializes lazily: every popup open/close call is now time-bounded, and a stalled strategy falls through to the next one instead of hanging the identify workflow forever.
- The popup element is given a short bounded wait at open time, so the reliable direct-element path is used on devices that create the popup component late.
- If no popup path succeeds at all, the first identify result is shown in the widget body with a notice — a map tap can never again end in silence.

## What 2.0.5 fixes

- Restores popup taps on iPhone and iPad by using the underlying MapView click event as the primary input path.
- Installs the touch-capable click listener before suppressing the map's automatic popup workflow.
- Prevents lazy popup-component initialization from blocking every map tap.
- Uses `view.popupEnabled` as the single automatic-popup switch instead of globally setting `mapComponent.popupDisabled`.
- Declares `needHiddenState` so a widget hidden by a mobile layout releases popup ownership.
- Derives a map point from touch screen coordinates when a mobile event does not provide one directly.


Earlier versions coordinated the map popup and configured REST queries, but configured endpoint graphics still existed only as raw ArcGIS Maps SDK graphics. Experience Builder could display those graphics, but it could not reliably resolve them to an Experience Builder data source. As a result, the native popup data-action menu could be missing for configured endpoint results.

Version 2.0.4 creates a runtime data source and hidden runtime `JimuLayerView` for each configured endpoint in popup mode. The endpoint graphic remains attached to that registered layer, allowing the Map widget to resolve the selected feature as a data record and evaluate the app's native data actions.

For each click the widget:

1. Collects popup-ready features from the active map when that source is enabled.
2. Queries every configured REST layer when that source is enabled.
3. Keeps native map popup results first and appends configured REST endpoint results last.
4. Removes duplicate records when the same layer is represented in both sources.
5. Opens one native Experience Builder popup.
6. Tracks and highlights the selected popup feature without moving or rescaling the map.
7. Leaves navigation entirely to the popup's explicit `Zoom To` action.
8. Keeps configured endpoint graphics linked to runtime data sources so the native popup data-action menu can evaluate them.
9. Restores the map's original popup settings and removes runtime layer views when the widget closes, changes maps, or is removed.

This removes the race between popup sources and restores the data-source context needed by native popup actions.

## Popup source modes

| Mode | Behavior |
| --- | --- |
| Map popup layers only | Uses the active map's visible, popup-capable layers and their existing popup templates. No configured REST URL is required. |
| Configured REST layers only | Queries only the layer URLs entered in the widget settings. Map popup layers are excluded. |
| Map layers and configured REST layers | Queries both sources on the same click, merges the results, removes duplicates, and opens one popup. |

Combined mode is the default for new widget instances.

## Key features

- One coordinated popup pipeline per click.
- Native web map popup templates, field formatting, Arcade content, media, and popup actions are preserved for map results.
- Configured endpoint results are registered as runtime Experience Builder data sources and hidden `JimuLayerView` instances so the native popup data-action menu can operate on them.
- Multiple configured REST layer URLs, separated by new lines or semicolons.
- Point, line, and polygon identify support.
- Configurable screen-pixel click tolerance for REST queries.
- Multiple overlapping results from each configured layer.
- Fixed result order with native map popup features first and configured REST endpoint features last.
- Configurable total result limits.
- Duplicate removal by layer URL and ObjectID, REST service path and ObjectID, or GlobalID.
- When a configured result duplicates a map result, the map graphic is retained so the web map's popup template and actions win.
- Optional automatically generated popups for map layers that do not have a configured popup template.
- Optional native popup result list when several features are returned.
- Selected-feature highlighting that follows popup selection.
- Popup cycling that keeps the popup anchored to the identify click without changing the current map extent or scale.
- Configurable transparent-fill outline style.
- Field aliases, coded-value descriptions, date formatting, hyperlinks, title fields, and hidden fields for configured REST results.
- Custom Arcade title expressions, scalar row expressions, and full Popup Element expressions for configured REST results.
- XML configuration export and import.
- Legacy panel mode for configured REST identify results.
- Awareness of Experience Builder controller state. The widget stops handling clicks while closed or hidden.
- Request cancellation and stale-click protection when a user clicks again before a previous query finishes.
- Partial failure handling. Results from successful sources still open even when another configured source fails.

## Requirements

- ArcGIS Experience Builder Developer Edition 1.21.
- Node.js 22 or newer for Experience Builder 1.21. Esri recommends Node.js 24.
- A 2D or 3D Map widget selected in Feature Identify settings.
- Configured REST endpoints must end in a numeric layer ID, such as `/MapServer/0` or `/FeatureServer/2`.
- Configured layers must allow the Query operation.
- The user's browser must be able to reach and authenticate to each configured service.
- Cross-origin services must allow the Experience Builder application origin or be available through the application's ArcGIS proxy configuration.

## Install

1. Stop the Experience Builder client if it is running.
2. Extract the package.
3. Copy the `feature-identify` folder into:

   `client\your-extensions\widgets\feature-identify`

4. Confirm that this path exists directly:

   `client\your-extensions\widgets\feature-identify\manifest.json`

5. Do not create a second nested `feature-identify` folder.
6. From the Experience Builder `client` folder, install dependencies if needed and start the client.
7. Add Feature Identify to a page that contains a Map widget.

## Recommended configuration

### Seamless combined popup

Use this when the map already contains useful popup layers and the widget also needs to query one or more REST layers that are not drawn in the map.

- Show results: `In the map popup`
- Popup sources: `Map layers and configured REST layers`
- Native map popup results are always first; configured REST endpoint results are always last
- Map extent and scale remain unchanged while cycling through results
- Remove duplicate records: enabled
- Include layers without configured popups: disabled unless those layers should participate
- Highlight selected popup feature: enabled

### Configured layer only

Use this when no visible map layer should participate in the popup.

- Show results: `In the map popup`
- Popup sources: `Configured REST layers only`
- Enter one or more queryable layer URLs

This directly addresses cases where unrelated map layers were appearing in the popup.

### Web map popup behavior only

Use this when the widget should coordinate and highlight native map popup results but should not query a separate REST endpoint.

- Show results: `In the map popup`
- Popup sources: `Map popup layers only`

### Legacy panel mode

Panel mode queries only configured REST layers and renders the first result inside the widget. It does not take ownership of the map's native popup behavior.

## Configured REST layer URLs

Enter a complete layer URL ending in a numeric layer ID. Put each URL on its own line. Semicolon-separated values are also accepted.

```text
https://server.example.org/arcgis/rest/services/Folder/Parcels/MapServer/0
https://server.example.org/arcgis/rest/services/Folder/Assets/FeatureServer/2
```

In popup mode, each configured endpoint is registered as an Experience Builder runtime data source and is paired with a hidden runtime layer in the active Map widget. The layer is invisible, excluded from the layer list, and disabled for automatic popup discovery. It exists only to preserve the data-source and `JimuLayerView` relationship required by native popup data actions. Panel mode continues to use a standalone query layer without modifying the active map.

## Native popup data actions

The four-dot popup menu shown by the Map widget is a data-action menu. It is different from Experience Builder message actions, which publish and respond to messages between widgets.

For configured REST results, Feature Identify now creates a runtime `DataSource` and registers a hidden layer with the active `JimuMapView`. This lets the Map widget associate the selected graphic with a data record before it evaluates actions. The widget does not create a second imitation action menu.

The menu contents still depend on the current app and selected record. Experience Builder hides actions whose `isSupported` check fails. For example, `View in table` requires an available table workflow, and export actions depend on the data source and app export permissions. The popup's separate `Zoom To` command remains the only operation that changes the map extent or scale.

## Configured popup Arcade content

Configured REST results support two Arcade expression modes:

- Add a label to create a scalar row expression. The returned text or number is shown with that label before the generated attribute rows.
- Return a Popup Element dictionary, such as `{ type: 'text', text: content }`, to provide the complete configured-result body. Version 2.0.4 detects this dictionary return even when an older XML file contains a label such as `Expression`. Leaving the label blank remains the recommended configuration.

When a full Popup Element dictionary is returned, the widget sends it directly to the native popup template and does not append generated attribute rows. This prevents duplicated fields, preserves HTML links and formatting, and avoids displaying `[object Object]`.

A constant configured-result title can be supplied with a title expression such as:

```arcade
return "Parcel";
```

## Result ordering and duplicate removal

In combined mode, native map popup features always appear first. Features queried directly from configured REST endpoints are appended after every native map result. This order is enforced at runtime, including for older app configurations or XML files that saved `configured-first`.

Duplicate removal is designed for a common pattern where a cached, vector tile, map image, or feature representation is already in the map, while the configured REST layer points to the same records for identify access.

The widget compares available identifiers in this order:

- Normalized layer URL plus ObjectID
- Normalized REST service path plus ObjectID
- GlobalID

When a match is found, the native map feature replaces the configured copy. This keeps the web map popup template, Arcade, media, and actions while avoiding duplicate entries.


## Popup cycling and map navigation

The popup remains anchored to the original identify click while the user moves between results. Selecting the previous result, next result, or an item in the popup feature list does not call `goTo`, recenter the map, change the scale, or alter the current extent.

The map moves only when the user explicitly selects the native popup `Zoom To` action. That action uses the currently selected feature, so a user can review all popup results without losing their working map view and then navigate only when they choose to.

## Popup ownership and restoration

Popup mode temporarily disables the map's automatic popup opening so the map and configured sources cannot race each other. The widget still uses the map component's popup feature discovery API to collect native map results.

The original popup-enabled state, popup presentation settings, and native highlight setting are restored when:

- The widget is closed or hidden by a controller.
- The active map changes.
- Popup mode is changed to panel mode.
- The widget is removed from the page.

A popup opened by Feature Identify is also cleared during those transitions so stale results do not remain attached to the map.

## XML configuration migration

Version 2 exports `<featureIdentify version="2">` XML files containing the new popup workflow settings.

Version 1 XML files remain importable. Missing version 2 properties receive these defaults:

- Popup source mode: combined
- Click tolerance: 8 pixels
- Configured results per layer: 5
- Total popup results: 25
- Result order: native map popup results first
- Map extent and scale remain unchanged while cycling through results
- Duplicate removal: enabled
- Selected-feature highlighting: enabled

Existing Experience Builder app configurations also continue to load. Legacy automatic-navigation properties are ignored so older saved settings cannot re-enable map movement. Existing panel-mode instances remain in panel mode. Existing popup-mode instances use combined mode unless a source mode is explicitly saved.

## Troubleshooting

### Unrelated map layers appear

Set `Popup sources` to `Configured REST layers only`.

In map-only or combined mode, the widget intentionally honors visible popup-capable map layers. Keep `Include layers without configured popups` disabled to honor the web map popup configuration exactly.

### Configured layer does not appear

Check all of the following:

- The URL ends in a numeric layer ID.
- The REST layer supports Query.
- The layer is reachable from the end user's browser.
- Authentication is available to the application user.
- CORS or proxy rules allow the request.
- Click tolerance is large enough for point or line features.
- The configured source is enabled in `Popup sources`.

### Configured result has no four-dot actions menu

Confirm all of the following:

- `Show results` is set to `In the map popup`. Panel mode does not use the Map widget's popup data-action menu.
- A Map widget is selected and its active `JimuMapView` loads successfully.
- The configured endpoint can be loaded as a feature-layer data source and supports Query.
- The desired action is enabled and supported in the app. Experience Builder hides unsupported actions at runtime.
- A compatible Table workflow is available for `View in table`, and export is permitted for the source when `Export` is expected.

If endpoint registration fails, the widget reports a query warning instead of silently opening an endpoint graphic without data-source context.

### Duplicate records still appear

Duplicate removal requires a shared ObjectID with a recognizable matching REST layer path, or a shared GlobalID. Different services that copy the same records but assign different ObjectIDs and omit GlobalIDs cannot be matched reliably.

### A layer without a web map popup is missing

Enable `Include layers without configured popups`. This lets the map component generate a default popup template for visible popup-capable layers.

### Popup opens but the result list is collapsed

Enable `Open result list when multiple`.

### Popup closes when the widget closes

That is intentional for popups opened by Feature Identify. Closing the widget restores normal map popup behavior and removes stale widget-owned results.

### `feature-identify is duplicated`

Experience Builder found more than one widget manifest with the name `feature-identify`.

Check for:

- A nested folder such as `widgets\feature-identify\feature-identify`.
- A copied folder such as `feature-identify-copy` that still contains the same manifest name.
- A stale compiled widget under `client\dist\widgets`.

Stop the client, remove the duplicate or stale compiled copy, and start the client again.

### Popups do not open on iPhone or iPad

Version 2.0.5 uses `JimuMapView.view.on("click")` as the primary event source and no longer waits for the popup component before handling a tap. Replace the complete widget folder rather than copying only `widget.tsx`, then restart the Experience Builder client so the updated manifest property is loaded.

## Main files

- `manifest.json`: Experience Builder registration and version metadata.
- `config.json`: defaults for new widget instances.
- `src/config.ts`: typed configuration contract and migration defaults.
- `src/runtime/widget.tsx`: coordinated click, query, merge, popup, and highlight workflow.
- `src/setting/setting.tsx`: builder settings and XML import or export.
- `src/runtime/translations/default.ts`: runtime messages.
- `src/setting/translations/default.ts`: settings labels and help text.
- `CHANGELOG.md`: release history.
