# Feature Identify

A custom widget for ArcGIS Experience Builder that coordinates native web map popups and one or more REST-only identify layers so a single map click produces one predictable popup.

- GitHub: https://github.com/brianmcleer/feature-identify-widget
- Releases: https://github.com/brianmcleer/feature-identify-widget/releases

## Overview

Web maps often draw a layer (such as parcels) from one service while the authoritative attributes live on another REST endpoint that is not in the map at all. Feature Identify queries both on the same click, merges the results, removes duplicates, and opens one native Experience Builder popup. Configured REST results are registered as runtime data sources, so the app's native popup data actions (Add marker, View in table, Export, and others) work on them just like map layers.

For each click the widget:

1. Collects popup-ready features from the active map when that source is enabled.
2. Queries every configured REST layer when that source is enabled.
3. Keeps native map popup results first and appends configured REST endpoint results last.
4. Removes duplicate records when the same layer is represented in both sources.
5. Opens one native Experience Builder popup.
6. Tracks and highlights the selected popup feature without moving or rescaling the map.
7. Leaves navigation entirely to the popup's explicit Zoom To action.

## Popup source modes

| Mode | Behavior |
| --- | --- |
| Map popup layers only | Uses the active map's visible, popup-capable layers and their existing popup templates. No configured REST URL is required. |
| Configured REST layers only | Queries only the layer URLs entered in the widget settings. Map popup layers are excluded. |
| Map layers and configured REST layers | Queries both sources on the same click, merges the results, removes duplicates, and opens one popup. Default for new instances. |

## Key features

- One coordinated popup pipeline per click, with request cancellation and stale-click protection.
- Native web map popup templates, field formatting, Arcade content, media, and popup actions are preserved for map results.
- Per-layer configuration: each configured REST layer has its own name, title field or title expression, hidden fields, format rules, and Arcade expressions. Layers can be enabled, disabled, and reordered. Older single-URL configurations are converted automatically.
- A Test button next to each layer URL that queries the service from the browser and reports the layer name, geometry type, record count, and response time, plus inline warnings for the most common deployment mistakes (direct ArcGIS Server ports such as :6443, http URLs, missing layer numbers).
- Field format rules: number, integer, currency, percent, date, and date-time formatting with decimals, prefix, and suffix, or link rules that build a URL from a template with {FIELD_NAME} tokens.
- Selection messaging: the selected result is published as a records-selection-changed message so Table, Property Report, and other widgets can respond to the identify click.
- Speed: Arcade expressions are compiled once at startup and evaluated in parallel for every feature, all configured layers and map sources are queried concurrently, a slow configured layer is bounded to 8 seconds, and a repeat click at the same place is answered from a short-lived cache.
- Point, line, and polygon identify support with configurable screen-pixel click tolerance.
- Duplicate removal by layer URL and ObjectID, REST service path and ObjectID, or GlobalID. The map's graphic is preferred only when it can actually render a popup.
- Time-bounded popup opening and time-bounded map sources, so one slow layer cannot block the popup. If no popup path succeeds, the first result is shown in the widget body with a notice.
- The hidden runtime bridge layer never re-downloads the configured service; identify queries run against a separate query layer that is never added to the map.
- Selected-feature highlighting with a configurable transparent-fill outline.
- Field aliases, coded-value descriptions, date formatting, hyperlinks, title fields, and hidden fields for configured REST results.
- Custom Arcade title expressions, scalar row expressions, and full Popup Element expressions.
- XML configuration export and import (version 3 format; version 1 and 2 files still import and are converted to per-layer settings).
- English and Spanish user interface strings.
- Legacy panel display mode for configured-layer-only workflows.
- A diagnostic overlay (settings switch, or fi_debug=1 in the app URL) that shows a live on-screen event log on any device, including phones, with a Copy button for sharing the log.

## Requirements

- ArcGIS Experience Builder Developer Edition 1.21.
- Node.js 22 or newer for Experience Builder 1.21. Esri recommends Node.js 24.
- A 2D or 3D Map widget selected in Feature Identify settings.
- Configured REST endpoints must end in a numeric layer ID, such as `/MapServer/0` or `/FeatureServer/2`.
- Configured layers must allow the Query operation.
- The end user's browser must be able to reach and authenticate to each configured service. Use the public URL that goes through your Web Adaptor on standard ports (443), not a direct ArcGIS Server port such as `:6443`, or the widget will work inside your network and silently fail for phones and outside users.
- Cross-origin services must allow the Experience Builder application origin or be available through the application's ArcGIS proxy configuration.

## Install

1. Stop the Experience Builder client if it is running.
2. Download and extract the release zip.
3. Copy the `feature-identify` folder into:

   `client\your-extensions\widgets\feature-identify`

4. Confirm this path exists directly, with the manifest one level down and never nested a second level deep:

   `client\your-extensions\widgets\feature-identify\manifest.json`

5. From the Experience Builder `client` folder, install dependencies (pnpm on 1.21 and later) and start the client.
6. Add Feature Identify to a page that contains a Map widget and select that map in the widget settings.

## Recommended configuration

- Show results: In the map popup.
- Popup sources: Map layers and configured REST layers.
- Remove duplicate records: enabled.
- Highlight selected popup feature: enabled.
- Notify other widgets of the selected result: enabled when a Table, Property Report, or similar widget should react to identify clicks.
- Include layers without configured popups: disabled unless those layers should participate.
- Press Test next to each layer URL after entering it, and fix any warning it shows before publishing.

If the app has separate desktop, tablet, and phone layouts, remember that each layout can hold its own Feature Identify instance. Configure the layer URL in every instance, and place the widget directly in the phone layout (it can be small) rather than inside a closed widget controller if identify should always work on phones.

## Troubleshooting

**`feature-identify is duplicated` on client start.** Experience Builder registers each widget by the `name` in its `manifest.json` and throws this error when the same name is found twice. A second copy is hiding somewhere: a nested `widgets\feature-identify\feature-identify` folder from extracting a zip into a folder that already had the widget's name, a leftover or renamed copy of the folder, or a stale compiled build under `client\dist\widgets`. Remove the extra copy (or delete the matching `dist\widgets` folder and rebuild) and start again.

**Popups work on desktop but not on phones.** Check the configured layer URL first. A URL with a direct ArcGIS Server port (for example `:6443`) is usually reachable only inside your network. Then turn on the diagnostic overlay in the widget settings (Troubleshooting section), republish, and read the on-screen event log on the phone.

**No response to map clicks at all.** Confirm the widget instance for the active layout is present and not sitting closed inside a widget controller, and that the app was republished after changes.

## Feedback

Questions and feedback are welcome on the Esri Community post for this widget, or open an issue on GitHub.

## License

Apache-2.0. Copyright 2026 City of Grand Junction, CO.
