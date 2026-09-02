import type { ImmutableObject } from 'jimu-core'

/** Shown in the settings panel footer. Keep in step with manifest.json. */
export const WIDGET_VERSION = '1.1.2'

export interface ArcadeExpression {
  /** Row label. Leave blank when the expression returns a full Popup Element dictionary. */
  label: string
  /** Arcade expression evaluated against the identified feature as $feature. */
  expression: string
}

export type FieldFormatType = 'number' | 'integer' | 'currency' | 'percent' | 'date' | 'datetime' | 'link'

export interface FieldFormat {
  /** Field name the rule applies to (case-insensitive). */
  field: string
  type: FieldFormatType
  /** Decimal places for number, currency, and percent. */
  decimals?: number
  /** Text placed before the formatted value, for example a unit. */
  prefix?: string
  /** Text placed after the formatted value, for example " acres". */
  suffix?: string
  /** For link rules: URL template. {FIELD_NAME} tokens are replaced with attribute values. */
  linkTemplate?: string
  /** For link rules: display text. Defaults to the widget-wide link text. */
  linkText?: string
}

export interface IdentifyLayerConfig {
  /** Stable id used by the settings UI. */
  id: string
  /** Full REST URL to a queryable layer ending in a layer number. */
  url: string
  /** Friendly name shown as the data source label and default popup title. */
  label: string
  enabled: boolean
  /** Field shown as the popup title when no title expression is set. */
  titleField: string
  /** Optional Arcade title expression for this layer's results. */
  titleExpression: string
  /** Comma-separated fields hidden from this layer's popup content. */
  excludedFields: string
  expressions: ArcadeExpression[]
  formats: FieldFormat[]
}

export type DisplayMode = 'panel' | 'popup'
export type PopupSourceMode = 'map' | 'configured' | 'combined'
export type ResultOrder = 'configured-first' | 'map-first'

export interface Config {
  /** Popup is the primary mode. Panel is retained for legacy configured-layer use. */
  displayMode: DisplayMode

  /** Which sources participate in a popup click. */
  sourceMode: PopupSourceMode

  /** Per-layer configuration. Preferred over the legacy widget-wide fields below. */
  layers: IdentifyLayerConfig[]

  /** Legacy: one or more full REST layer URLs separated by new lines. Migrated into layers. */
  layerUrl: string

  /** Legacy widget-wide title field. Migrated into layers. */
  titleField: string

  /** Legacy widget-wide Arcade title expression. Migrated into layers. */
  titleExpression: string

  /** Legacy widget-wide hidden fields. Migrated into layers. */
  excludedFields: string

  /** Legacy widget-wide expressions. Migrated into layers. */
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

  /** Publish a records-selection-changed message so other widgets react to the selected result. */
  publishSelection: boolean

  /** Seconds to reuse identify results for a repeated click at the same place. 0 disables. */
  resultCacheSeconds: number

  /** Show the on-screen diagnostic overlay on every device (also enabled by
   * adding fi_debug=1 to the app URL). For troubleshooting only. */
  debugOverlay: boolean
}

export type IMConfig = ImmutableObject<Config>

export const DEFAULT_EXCLUDED_FIELDS = 'OBJECTID,GLOBALID,Shape,SHAPE,SHAPE.STAREA(),SHAPE.STLENGTH()'

export const defaultConfig: Config = {
  displayMode: 'popup',
  sourceMode: 'combined',
  layers: [],
  layerUrl: '',
  titleField: '',
  titleExpression: '',
  excludedFields: DEFAULT_EXCLUDED_FIELDS,
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
  publishSelection: true,
  resultCacheSeconds: 60,
  debugOverlay: false
}

export const normalizeUrl = (url: string): string => String(url || '').trim().replace(/\/+$/, '')

let layerIdCounter = 0
export const newLayerId = (): string => {
  layerIdCounter += 1
  return `layer-${Date.now().toString(36)}-${layerIdCounter}`
}

const toPlain = (value: any): any => {
  if (value && typeof value.asMutable === 'function') return value.asMutable({ deep: true })
  return value
}

export const createLayerConfig = (partial: Partial<IdentifyLayerConfig> = {}): IdentifyLayerConfig => ({
  id: partial.id || newLayerId(),
  url: normalizeUrl(partial.url || ''),
  label: partial.label || '',
  enabled: partial.enabled !== false,
  titleField: partial.titleField || '',
  titleExpression: partial.titleExpression || '',
  excludedFields: partial.excludedFields === undefined ? DEFAULT_EXCLUDED_FIELDS : partial.excludedFields,
  expressions: Array.isArray(partial.expressions) ? partial.expressions.map(item => ({
    label: item?.label || '',
    expression: item?.expression || ''
  })) : [],
  formats: Array.isArray(partial.formats) ? partial.formats.map(item => ({
    field: item?.field || '',
    type: item?.type || 'number',
    decimals: item?.decimals,
    prefix: item?.prefix || '',
    suffix: item?.suffix || '',
    linkTemplate: item?.linkTemplate || '',
    linkText: item?.linkText || ''
  })) : []
})

/** Build per-layer configs from the legacy widget-wide fields. */
export const migrateLegacyLayers = (config: Partial<Config>): IdentifyLayerConfig[] => {
  const seen = new Set<string>()
  return String(config.layerUrl || '')
    .split(/[\r\n;]+/)
    .map(normalizeUrl)
    .filter(url => {
      if (!url || seen.has(url.toLowerCase())) return false
      seen.add(url.toLowerCase())
      return true
    })
    .map(url => createLayerConfig({
      url,
      titleField: config.titleField || '',
      titleExpression: config.titleExpression || '',
      excludedFields: config.excludedFields === undefined ? DEFAULT_EXCLUDED_FIELDS : config.excludedFields,
      expressions: toPlain(config.expressions) || []
    }))
}

/** The effective layer list: explicit layers when present, otherwise migrated legacy fields. */
export const resolveLayers = (config: Partial<Config>): IdentifyLayerConfig[] => {
  const explicit = toPlain(config.layers)
  if (Array.isArray(explicit) && explicit.length > 0) {
    return explicit.map(item => createLayerConfig(item))
  }
  return migrateLegacyLayers(config)
}
