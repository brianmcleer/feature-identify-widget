import type { ImmutableObject } from 'jimu-core'

export interface ArcadeExpression {
  /** Row label. Leave blank when the expression returns a full Popup Element dictionary. */
  label: string
  /** Arcade expression evaluated against the identified feature as $feature. */
  expression: string
}

export type DisplayMode = 'panel' | 'popup'
export type PopupSourceMode = 'map' | 'configured' | 'combined'
export type ResultOrder = 'configured-first' | 'map-first'

export interface Config {
  /** Popup is the primary mode. Panel is retained for legacy configured-layer use. */
  displayMode: DisplayMode

  /** Which sources participate in a popup click. */
  sourceMode: PopupSourceMode

  /** One or more full REST layer URLs. Separate multiple URLs with a new line. */
  layerUrl: string

  /** Field whose value is used as the configured-layer popup title. */
  titleField: string

  /** Optional Arcade title expression for configured REST results. */
  titleExpression: string

  /** Comma-separated fields hidden from configured REST result content. */
  excludedFields: string

  /** Scalar row expressions or full Popup Element expressions for configured results. */
  expressions: ArcadeExpression[]

  /** Display text for configured-layer values that are HTTP or HTTPS links. */
  linkText: string

  /** Highlight outline color. */
  outlineColor: string

  /** Highlight outline width in pixels. */
  outlineWidth: number

  /** Message used for an empty result. */
  noResultMessage: string

  /** Use service field aliases for configured REST results. */
  useFieldAliases: boolean

  /** Generate default popups for visible map layers without a configured template. */
  useDefaultPopupTemplates: boolean

  /** Screen tolerance used by configured REST layer queries. */
  clickTolerance: number

  /** Maximum results returned from each configured REST layer. */
  maxConfiguredResults: number

  /** Maximum features passed to one popup after merging and deduplication. */
  maxTotalResults: number

  /** Legacy XML/app property. Runtime ordering is always map-first. */
  resultOrder: ResultOrder

  /** Open the native popup feature list when more than one result is returned. */
  openFeatureMenu: boolean

  /** Remove duplicate records when a configured URL is also present in the map. */
  deduplicateResults: boolean

  /** Highlight whichever popup feature is currently selected. */
  highlightSelectedFeature: boolean

  /** Open a native popup containing noResultMessage when nothing is found. */
  showNoResultPopup: boolean

  /** Show the on-screen diagnostic overlay on every device (also enabled by
   * adding fi_debug=1 to the app URL). For troubleshooting only. */
  debugOverlay: boolean
}

export type IMConfig = ImmutableObject<Config>

export const defaultConfig: Config = {
  displayMode: 'popup',
  sourceMode: 'combined',
  layerUrl: '',
  titleField: '',
  titleExpression: '',
  excludedFields: 'OBJECTID,GLOBALID,Shape,SHAPE,SHAPE.STAREA(),SHAPE.STLENGTH()',
  expressions: [],
  linkText: 'Click here for more info.',
  outlineColor: '#00ffff',
  outlineWidth: 2,
  noResultMessage: 'No feature found at that location.',
  useFieldAliases: true,
  useDefaultPopupTemplates: false,
  clickTolerance: 8,
  maxConfiguredResults: 5,
  maxTotalResults: 25,
  resultOrder: 'map-first',
  openFeatureMenu: false,
  deduplicateResults: true,
  highlightSelectedFeature: true,
  showNoResultPopup: false,
  debugOverlay: false
}
