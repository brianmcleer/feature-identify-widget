# feature-identify-widget

Repository for the Feature Identify custom widget for ArcGIS Experience Builder Developer Edition 1.21.

Feature Identify coordinates native web map popups and one or more REST-only identify layers so a single map click produces one predictable popup, with duplicate removal, native popup data actions on configured REST results, and on-screen diagnostics for troubleshooting on any device. The full feature list, requirements, and install steps are in the widget-level README inside the `feature-identify` folder, which is what ships in each release zip.

- Releases (downloadable zips): https://github.com/brianmcleer/feature-identify-widget/releases
- Esri Community post: (link to be added after the community post is published)

## Repo layout

```
feature-identify-widget/         the repo
├── README.md                    this file, the GitHub landing page
├── LICENSE                      Apache-2.0
├── .gitignore                   ignores node_modules, .vs, etc.
├── publish.ps1                  one-command publish/update automation
└── feature-identify/            the actual widget (drops into your-extensions/widgets)
    ├── manifest.json
    ├── package.json
    ├── config.json
    ├── tsconfig.json
    ├── icon.svg
    ├── README.md                install steps and troubleshooting travel with the widget
    ├── LICENSE
    ├── CHANGELOG.md
    └── src/ ...
```

## Quick install (for widget users)

Download the zip from the latest release, extract it, and drop the `feature-identify` folder into `client\your-extensions\widgets` so that `manifest.json` sits directly inside `your-extensions\widgets\feature-identify`, never nested a second level deep. Then run the standard client install (pnpm on Experience Builder 1.21 and later) and restart the client. Full steps are in the widget-level README.

## Publishing workflow (for the maintainer)

The Experience Builder widget folder is the single source of truth. `publish.ps1` mirrors it into this repo with robocopy /MIR, commits, pushes, and optionally cuts a release. Any change you want to keep, including dependency and security fixes, must be made in the EB widget folder first; a repo-only edit is overwritten on the next publish.

From a terminal opened in this repo folder:

- Normal update: `powershell -ExecutionPolicy Bypass -File .\publish.ps1`
- Update plus release: `powershell -ExecutionPolicy Bypass -File .\publish.ps1 -Release v1.1.0`

Version tags must increase and never repeat: bug fix `v1.0.1`, new feature `v1.1.0`, major change `v2.0.0`.

## License

Apache-2.0. Copyright 2026 City of Grand Junction, CO.
