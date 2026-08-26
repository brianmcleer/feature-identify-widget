/** @jsx jsx */
import { React, ReactDOM, jsx, css, DataSourceManager, dataSourceUtils, type AllWidgetProps } from 'jimu-core'
import { JimuMapViewComponent, type JimuMapView, loadArcGISJSAPIModules } from 'jimu-arcgis'
import { Loading, LoadingType } from 'jimu-ui'
import type { Config, IMConfig } from '../config'
import { defaultConfig } from '../config'
import defaultMessages from './translations/default'

type WidgetProps = AllWidgetProps<IMConfig> & { useMapWidgetIds: string[] }

interface ResultRow {
  label: string
  value: string
  url?: string
}

interface FieldInfo {
  name: string
  alias: string
  type: string
  codedValues?: Record<string, string>
}

interface RuntimeDataSourceEntry {
  id: string
  dataSource: any
  sourceLayer: any
}

interface LayerEntry {
  url: string
  layer: any
  /** Layer used for identify queries. In popup mode this is the runtime data
   * source's own layer (never added to the map), so the map bridge layer can
   * be starved of drawing without affecting query results. */
  queryLayer?: any
  displayField: string
  fields: FieldInfo[]
  dataSourceId?: string
  dataSource?: any
  jimuLayerView?: any
  ownerJimuMapView?: any
  runtimeRegistered: boolean
}

interface ArcadeEvaluation {
  ok: boolean
  value: any
}

interface BuiltResult {
  title: string
  rows: ResultRow[]
  popupContent: any[]
}

interface ConfiguredResult {
  graphic: any
  built: BuiltResult
  url: string
}

interface NormalizedClick {
  mapPoint: any
  screenPoint: any
  pointerType?: string
  originalEvent: any
}

type SettledResult<T> =
  | { status: 'fulfilled', value: T }
  | { status: 'rejected', reason: any }

const Widget = (props: WidgetProps): React.ReactElement => {
  const { config, useMapWidgetIds, intl, state, id: widgetId } = props

  const [loading, setLoading] = React.useState(false)
  const [popupFallback, setPopupFallback] = React.useState(false)
  const [clickedOnce, setClickedOnce] = React.useState(false)
  const [noResult, setNoResult] = React.useState(false)
  const [error, setError] = React.useState('')
  const [warning, setWarning] = React.useState('')
  const [title, setTitle] = React.useState('')
  const [rows, setRows] = React.useState<ResultRow[]>([])
  const [debugLines, setDebugLines] = React.useState<string[]>([])

  const widgetStateRef = React.useRef<any>(state)
  widgetStateRef.current = state

  const jmvRef = React.useRef<JimuMapView>(null)
  const clickDetachRef = React.useRef<(() => void) | null>(null)
  const popupDetachRef = React.useRef<(() => void) | null>(null)
  const legacyWatchHandlesRef = React.useRef<any[]>([])
  const popupElementRef = React.useRef<any>(null)
  const popupResolvePromiseRef = React.useRef<Promise<any> | null>(null)
  const highlightLayerRef = React.useRef<any>(null)
  const coreRef = React.useRef<any>(null)
  const arcadeRef = React.useRef<any>(null)
  const layerEntriesRef = React.useRef<Record<string, LayerEntry>>({})
  const layerLoadsRef = React.useRef<Record<string, Promise<LayerEntry>>>({})
  const runtimeDataSourcesRef = React.useRef<Record<string, RuntimeDataSourceEntry>>({})
  const runtimeDataSourceLoadsRef = React.useRef<Record<string, Promise<RuntimeDataSourceEntry>>>({})
  const runtimeDataSourceVersionRef = React.useRef(0)
  const configuredUrlByGraphicRef = React.useRef<WeakMap<object, string>>(new WeakMap())
  const executorCacheRef = React.useRef<Record<string, any>>({})
  const clickSeqRef = React.useRef(0)
  const interactionSeqRef = React.useRef(0)
  const layerCacheVersionRef = React.useRef(0)
  const abortRef = React.useRef<AbortController>(null)
  const originalPopupDisabledRef = React.useRef<{ target: any, value: any } | null>(null)
  const originalPopupEnabledRef = React.useRef<{ target: any, value: any } | null>(null)
  const originalPopupHighlightDisabledRef = React.useRef<{ target: any, value: any } | null>(null)
  const originalPopupPresentationRef = React.useRef<{
    target: any
    updateLocationEnabled: any
    initialDisplayMode: any
    featureMenuOpen: any
  } | null>(null)
  const popupOpenedByWidgetRef = React.useRef(false)
  const selectedFeatureRef = React.useRef<any>(null)

  const configRef = React.useRef(config)
  configRef.current = config

  const settle = async <T,>(promise: Promise<T>): Promise<SettledResult<T>> => {
    try {
      return { status: 'fulfilled', value: await promise }
    } catch (reason) {
      return { status: 'rejected', reason }
    }
  }

  const debugEnabledRef = React.useRef<boolean | null>(null)
  const isDebugEnabled = (): boolean => {
    // The settings-panel toggle works on any device with zero URL editing.
    if ((configRef.current as any)?.debugOverlay) return true
    if (debugEnabledRef.current === null) {
      try {
        const probe = `${window.location.search || ''}${window.location.hash || ''}`
        debugEnabledRef.current = /[?&#]fi_debug/i.test(probe)
      } catch (e) {
        debugEnabledRef.current = false
      }
    }
    return debugEnabledRef.current
  }

  const debugLog = (message: string): void => {
    try { console.log(`[FeatureIdentify] ${message}`) } catch (e) {}
    if (!isDebugEnabled()) return
    let stamp = ''
    try { stamp = new Date().toISOString().slice(11, 23) } catch (e) {}
    setDebugLines(previous => [...previous.slice(-39), `${stamp} ${message}`])
  }

  const nls = (msgId: string): string => {
    return intl
      ? intl.formatMessage({ id: msgId, defaultMessage: (defaultMessages as any)[msgId] })
      : (defaultMessages as any)[msgId] || msgId
  }

  const getConfig = (): Config => {
    const raw: any = configRef.current
    const mutable = raw && typeof raw.asMutable === 'function'
      ? raw.asMutable({ deep: true })
      : (raw || {})
    return { ...defaultConfig, ...mutable, resultOrder: 'map-first' }
  }

  const isWidgetActive = (): boolean => {
    const state = String(widgetStateRef.current || '').toUpperCase()
    return state !== 'CLOSED' && state !== 'HIDDEN'
  }

  const getCore = async (): Promise<any> => {
    if (coreRef.current) return coreRef.current
    const [
      FeatureLayer,
      Graphic,
      GraphicsLayer,
      Extent,
      reactiveUtils,
      PopupTemplate,
      ExpressionContent,
      ElementExpressionInfo
    ] = await loadArcGISJSAPIModules([
      'esri/layers/FeatureLayer',
      'esri/Graphic',
      'esri/layers/GraphicsLayer',
      'esri/geometry/Extent',
      'esri/core/reactiveUtils',
      'esri/PopupTemplate',
      'esri/popup/content/ExpressionContent',
      'esri/popup/ElementExpressionInfo'
    ])
    coreRef.current = {
      FeatureLayer,
      Graphic,
      GraphicsLayer,
      Extent,
      reactiveUtils,
      PopupTemplate,
      ExpressionContent,
      ElementExpressionInfo
    }
    return coreRef.current
  }

  const getArcade = async (): Promise<any> => {
    if (arcadeRef.current) return arcadeRef.current
    const [arcade] = await loadArcGISJSAPIModules(['esri/arcade'])
    arcadeRef.current = arcade
    return arcade
  }

  const hasExpressions = (): boolean => {
    const cfg = getConfig()
    if (cfg.titleExpression?.trim()) return true
    return (cfg.expressions || []).some(item => !!item?.expression?.trim())
  }

  const normalizeUrl = (url: string): string => String(url || '').trim().replace(/\/+$/, '')

  const getConfiguredUrls = (): string[] => {
    const cfg = getConfig()
    const seen = new Set<string>()
    return String(cfg.layerUrl || '')
      .split(/[\r\n;]+/)
      .map(normalizeUrl)
      .filter(url => {
        if (!url || seen.has(url.toLowerCase())) return false
        seen.add(url.toLowerCase())
        return true
      })
  }

  const getMapComponent = (): any => (jmvRef.current as any)?.mapComponent || null
  const getView = (): any => (jmvRef.current as any)?.view || getMapComponent()?.view || null

  const createAbortError = (message: string): Error => {
    const error = new Error(message)
    error.name = 'AbortError'
    return error
  }

  const hashString = (value: string): string => {
    let hash = 2166136261
    for (let index = 0; index < value.length; index++) {
      hash ^= value.charCodeAt(index)
      hash = Math.imul(hash, 16777619)
    }
    return (hash >>> 0).toString(36)
  }

  const getConstantArcadeString = (expression: string): string => {
    const match = String(expression || '').match(/^\s*return\s+(["'])([\s\S]*?)\1\s*;?\s*$/i)
    if (!match) return ''
    return match[2]
      .replace(/\\n/g, '\n')
      .replace(/\\r/g, '\r')
      .replace(/\\t/g, '\t')
      .replace(/\\([\\"'])/g, '$1')
  }

  const getRuntimeDataSourceLabel = (): string => {
    const cfg = getConfig()
    return getConstantArcadeString(cfg.titleExpression) ||
      String(cfg.titleField || '').trim() ||
      'Configured identify layer'
  }

  const getRuntimeDataSourceId = (url: string): string => {
    const safeWidgetId = String(widgetId || 'feature-identify')
      .replace(/[^A-Za-z0-9_-]/g, '_')
      .slice(0, 48)
    return `${safeWidgetId}-endpoint-${hashString(url.toLowerCase())}`
  }

  const setDataSourceLabel = (dataSourceJson: any, label: string): any => {
    if (!dataSourceJson) return dataSourceJson
    if (typeof dataSourceJson.set === 'function') {
      return dataSourceJson.set('label', label).set('sourceLabel', label)
    }
    return { ...dataSourceJson, label, sourceLabel: label }
  }

  const ensureRuntimeDataSource = async (url: string): Promise<RuntimeDataSourceEntry> => {
    const normalized = normalizeUrl(url)
    if (runtimeDataSourcesRef.current[normalized]) return runtimeDataSourcesRef.current[normalized]
    if (runtimeDataSourceLoadsRef.current[normalized]) return runtimeDataSourceLoadsRef.current[normalized]
    const version = runtimeDataSourceVersionRef.current

    const loadPromise = (async (): Promise<RuntimeDataSourceEntry> => {
      const manager: any = DataSourceManager.getInstance()
      const dataSourceId = getRuntimeDataSourceId(normalized)
      const existing = manager.getDataSource?.(dataSourceId)
      if (existing) {
        if (typeof existing.ready === 'function') await existing.ready()
        if (version !== runtimeDataSourceVersionRef.current) {
          throw createAbortError('Endpoint configuration changed while reusing its data source.')
        }
        const reused: RuntimeDataSourceEntry = {
          id: dataSourceId,
          dataSource: existing,
          sourceLayer: existing.layer || null
        }
        runtimeDataSourcesRef.current[normalized] = reused
        return reused
      }

      const { FeatureLayer } = await getCore()
      const label = getRuntimeDataSourceLabel()
      const sourceLayer = new FeatureLayer({
        id: `${dataSourceId}-source`,
        url: normalized,
        title: label,
        outFields: ['*'],
        popupEnabled: false,
        visible: false,
        listMode: 'hide'
      })
      let dataSource: any = null

      try {
        await sourceLayer.load()
        if (version !== runtimeDataSourceVersionRef.current) {
          throw createAbortError('Endpoint configuration changed while loading its data source.')
        }
        const dataSourceJsonCreator = (dataSourceUtils as any)?.dataSourceJsonCreator
        if (!dataSourceJsonCreator ||
            typeof dataSourceJsonCreator.createDataSourceJsonByJSAPILayer !== 'function') {
          throw new Error('Experience Builder could not create a runtime data source for the configured endpoint.')
        }

        const rawDataSourceJson = await Promise.resolve(
          dataSourceJsonCreator.createDataSourceJsonByJSAPILayer(dataSourceId, sourceLayer)
        )
        const dataSourceJson = setDataSourceLabel(rawDataSourceJson, label)
        dataSource = await manager.createDataSource({
          id: dataSourceId,
          dataSourceJson,
          layer: sourceLayer
        } as any)
        if (typeof dataSource?.ready === 'function') await dataSource.ready()

        // Runtime data sources created from a URL do not always retain the
        // originating JS API layer. Keep it attached so popup metadata and
        // record creation use the same service schema as the query layer.
        try { dataSource.layer = sourceLayer } catch (e) {}

        if (version !== runtimeDataSourceVersionRef.current) {
          throw createAbortError('Endpoint configuration changed while registering its data source.')
        }

        const created: RuntimeDataSourceEntry = {
          id: dataSourceId,
          dataSource,
          sourceLayer
        }
        runtimeDataSourcesRef.current[normalized] = created
        return created
      } catch (error) {
        let destroyedByManager = false
        try {
          if (dataSource && typeof manager.destroyDataSource === 'function') {
            manager.destroyDataSource(dataSourceId)
            destroyedByManager = true
          }
        } catch (e) {}
        if (!destroyedByManager) {
          try { dataSource?.destroy?.() } catch (e) {}
        }
        try {
          if (!sourceLayer.destroyed) sourceLayer.destroy?.()
        } catch (e) {}
        throw error
      }
    })()

    runtimeDataSourceLoadsRef.current[normalized] = loadPromise
    try {
      return await loadPromise
    } finally {
      if (runtimeDataSourceLoadsRef.current[normalized] === loadPromise) {
        delete runtimeDataSourceLoadsRef.current[normalized]
      }
    }
  }

  const configureEndpointLayer = (layer: any, runtimeRegistered: boolean, starveDrawing = false): void => {
    if (!layer) return
    try { layer.outFields = ['*'] } catch (e) {}
    try { layer.listMode = 'hide' } catch (e) {}
    try { layer.legendEnabled = false } catch (e) {}
    try { layer.title = getRuntimeDataSourceLabel() } catch (e) {}

    if (runtimeRegistered) {
      // The layer must remain active in the JimuMapView so the Map widget can
      // resolve its graphics to DataRecords. Opacity zero prevents a second
      // drawing pass, and popupEnabled=false prevents duplicate native hits.
      try { layer.visible = true } catch (e) {}
      try { layer.opacity = 0 } catch (e) {}
      try { layer.popupEnabled = false } catch (e) {}
      if (starveDrawing) {
        // The bridge layer exists only to link graphics to their runtime data
        // source. Without this, its invisible LayerView re-downloads the whole
        // service (doubling load and producing tile errors on strained
        // servers). Identify queries run against the separate source layer,
        // which is never added to the map, so this cannot affect results.
        try { layer.definitionExpression = '1=0' } catch (e) {}
      }
    } else {
      try { layer.popupEnabled = true } catch (e) {}
    }
  }

  const disposeLayerEntry = (entry: LayerEntry): void => {
    if (!entry) return
    const owner = entry.ownerJimuMapView
    if (entry.jimuLayerView && owner && typeof owner.removeJimuLayerView === 'function') {
      try { owner.removeJimuLayerView(entry.jimuLayerView) } catch (e) {}
    }

    const map = owner?.mapComponent?.map || owner?.view?.map
    if (entry.runtimeRegistered && map && entry.layer) {
      try { map.remove(entry.layer) } catch (e) {}
    }
    try { entry.layer?.destroy?.() } catch (e) {}
  }

  const awaitWithTimeout = async <T,>(value: Promise<T> | T, timeoutMs: number): Promise<T | null> => {
    let timer: ReturnType<typeof setTimeout> | null = null
    try {
      return await Promise.race<T | null>([
        Promise.resolve(value).catch(() => null),
        new Promise<null>(resolve => {
          timer = setTimeout(() => resolve(null), timeoutMs)
        })
      ])
    } finally {
      if (timer) clearTimeout(timer)
    }
  }

  const resolvePopupElement = async (): Promise<any> => {
    if (popupElementRef.current) return popupElementRef.current
    if (popupResolvePromiseRef.current) return popupResolvePromiseRef.current

    const jmv: any = jmvRef.current
    if (!jmv) return null

    const resolvePromise = (async (): Promise<any> => {
      // Mobile layouts can create the popup lazily. Check the map component
      // first and never let popup discovery block the map click listener.
      let popup: any = jmv.mapComponent?.popupElement || null

      if (!popup && typeof jmv.getPopupElement === 'function') {
        // iOS creates the popup component noticeably later than desktop.
        // This wait is bounded so it can never hang, and it is never awaited
        // from the click-listener registration path.
        popup = await awaitWithTimeout(
          Promise.resolve(jmv.getPopupElement()),
          2500
        )
      }

      if (jmvRef.current !== jmv) return null
      popup = popup || jmv.mapComponent?.popupElement || null

      if (popup && typeof popup.componentOnReady === 'function') {
        // The element can already accept properties before componentOnReady
        // resolves. A timeout keeps iOS lazy initialization from deadlocking
        // the identify workflow.
        await awaitWithTimeout(Promise.resolve(popup.componentOnReady()), 1200)
      }

      if (jmvRef.current !== jmv) return null
      if (popup) popupElementRef.current = popup
      return popup
    })()

    popupResolvePromiseRef.current = resolvePromise
    try {
      return await resolvePromise
    } finally {
      if (popupResolvePromiseRef.current === resolvePromise) {
        popupResolvePromiseRef.current = null
      }
    }
  }

  const getLayerEntry = async (url: string): Promise<LayerEntry> => {
    const normalized = normalizeUrl(url)
    if (layerEntriesRef.current[normalized]) return layerEntriesRef.current[normalized]
    if (layerLoadsRef.current[normalized]) return layerLoadsRef.current[normalized]
    const cacheVersion = layerCacheVersionRef.current

    const loadPromise = (async (): Promise<LayerEntry> => {
      const { FeatureLayer } = await getCore()
      const activeJimuMapView: any = jmvRef.current
      const requiresRuntimeBridge = getConfig().displayMode === 'popup'
      let layer: any = null
      let dataSourceId = ''
      let dataSource: any = null
      let jimuLayerView: any = null
      let runtimeRegistered = false

      if (requiresRuntimeBridge) {
        if (!activeJimuMapView || typeof activeJimuMapView.addLayerAndCreateJimuLayerView !== 'function') {
          throw new Error('The active map cannot register the configured endpoint for popup data actions.')
        }

        const runtimeEntry = await ensureRuntimeDataSource(normalized)
        dataSourceId = runtimeEntry.id
        dataSource = runtimeEntry.dataSource
        if (cacheVersion !== layerCacheVersionRef.current || jmvRef.current !== activeJimuMapView) {
          throw createAbortError('Map or endpoint configuration changed while creating the data source.')
        }

        if (typeof dataSource?.createJSAPILayerByDataSource !== 'function') {
          throw new Error('The configured endpoint data source cannot create an ArcGIS layer.')
        }

        try {
          layer = await dataSource.createJSAPILayerByDataSource(undefined, false, true)
          if (!layer) throw new Error('The configured endpoint data source did not return an ArcGIS layer.')
          try {
            layer.id = `${dataSourceId}-map-${hashString(String(activeJimuMapView.id || 'active'))}`
          } catch (e) {}
          const runtimeSourceLayer = runtimeEntry.sourceLayer
          const hasSeparateQueryLayer = !!runtimeSourceLayer && runtimeSourceLayer !== layer
          configureEndpointLayer(layer, true, hasSeparateQueryLayer)
          await layer.load?.()

          if (cacheVersion !== layerCacheVersionRef.current || jmvRef.current !== activeJimuMapView) {
            throw createAbortError('Map or endpoint configuration changed while loading the endpoint layer.')
          }

          jimuLayerView = await activeJimuMapView.addLayerAndCreateJimuLayerView(layer, dataSource)
          runtimeRegistered = true

          // addLayerAndCreateJimuLayerView resolves with the registered wrapper.
          // Do not wait for a second rendered-layer signal here because an
          // opacity-zero bridge can otherwise delay the identify response.

          if (cacheVersion !== layerCacheVersionRef.current || jmvRef.current !== activeJimuMapView) {
            throw createAbortError('Map or endpoint configuration changed while registering the endpoint layer.')
          }

          const mappedJimuLayerView = typeof activeJimuMapView.getJimuLayerViewByAPILayer === 'function'
            ? activeJimuMapView.getJimuLayerViewByAPILayer(layer)
            : null
          if (mappedJimuLayerView) jimuLayerView = mappedJimuLayerView

          const resolvedDataSourceId = typeof activeJimuMapView.getDataSourceIdByAPILayer === 'function'
            ? await Promise.resolve(activeJimuMapView.getDataSourceIdByAPILayer(layer))
            : (jimuLayerView?.layerDataSourceId || jimuLayerView?.dataSourceId || '')
          const linkedDataSourceId = String(
            resolvedDataSourceId || jimuLayerView?.layerDataSourceId || jimuLayerView?.dataSourceId || ''
          )
          if (!jimuLayerView || (linkedDataSourceId && linkedDataSourceId !== dataSourceId)) {
            throw new Error('The configured endpoint layer was not linked to its Experience Builder data source.')
          }
        } catch (error) {
          if (jimuLayerView && typeof activeJimuMapView.removeJimuLayerView === 'function') {
            try { activeJimuMapView.removeJimuLayerView(jimuLayerView) } catch (e) {}
          }
          const map = activeJimuMapView?.mapComponent?.map || activeJimuMapView?.view?.map
          if (layer && map) {
            try { map.remove(layer) } catch (e) {}
          }
          try { layer?.destroy?.() } catch (e) {}
          throw error
        }
      } else {
        // Panel mode has no native map popup or popup data-action menu, so a
        // standalone layer is sufficient and avoids changing the active map.
        layer = new FeatureLayer({
          url: normalized,
          outFields: ['*'],
          popupEnabled: true
        })
        await layer.load()
        configureEndpointLayer(layer, false)
      }

      if (cacheVersion !== layerCacheVersionRef.current ||
          (runtimeRegistered && jmvRef.current !== activeJimuMapView)) {
        const staleEntry: LayerEntry = {
          url: normalized,
          layer,
          displayField: '',
          fields: [],
          dataSourceId,
          dataSource,
          jimuLayerView,
          ownerJimuMapView: activeJimuMapView,
          runtimeRegistered
        }
        disposeLayerEntry(staleEntry)
        throw createAbortError('Layer configuration changed while loading.')
      }

      const fields: FieldInfo[] = (layer.fields || []).map((field: any) => {
        const info: FieldInfo = {
          name: field.name,
          alias: field.alias || field.name,
          type: field.type || ''
        }
        const domain = field.domain
        if (domain && (domain.type === 'coded-value' || domain.type === 'codedValue') && Array.isArray(domain.codedValues)) {
          info.codedValues = {}
          domain.codedValues.forEach((codedValue: any) => {
            info.codedValues[String(codedValue.code)] = codedValue.name
          })
        }
        return info
      })

      const runtimeSource = runtimeRegistered
        ? runtimeDataSourcesRef.current[normalized]?.sourceLayer
        : null
      const entry: LayerEntry = {
        url: normalized,
        layer,
        queryLayer: (runtimeSource && runtimeSource !== layer) ? runtimeSource : layer,
        displayField: layer.displayField || '',
        fields,
        dataSourceId,
        dataSource,
        jimuLayerView,
        ownerJimuMapView: runtimeRegistered ? activeJimuMapView : null,
        runtimeRegistered
      }
      layerEntriesRef.current[normalized] = entry
      return entry
    })()

    layerLoadsRef.current[normalized] = loadPromise
    try {
      return await loadPromise
    } finally {
      if (layerLoadsRef.current[normalized] === loadPromise) {
        delete layerLoadsRef.current[normalized]
      }
    }
  }

  const formatValue = (raw: any, field?: FieldInfo): string => {
    if (raw === null || raw === undefined || raw === '') return ''
    if (field?.codedValues && String(raw) in field.codedValues) {
      return field.codedValues[String(raw)]
    }

    const fieldType = String(field?.type || '').toLowerCase()
    if (fieldType.includes('date') || fieldType.includes('timestamp')) {
      const date = raw instanceof Date ? raw : new Date(raw)
      if (!isNaN(date.getTime())) return date.toLocaleDateString()
    }
    return String(raw)
  }

  const evalArcadeRaw = async (expression: string, feature: any): Promise<ArcadeEvaluation> => {
    if (!expression?.trim()) return { ok: true, value: null }
    try {
      const arcade = await getArcade()
      const cacheKey = `feature:${expression}`
      let executor = executorCacheRef.current[cacheKey]
      if (!executor) {
        executor = await arcade.createArcadeExecutor(expression, {
          variables: [{ name: '$feature', type: 'feature' }]
        })
        executorCacheRef.current[cacheKey] = executor
      }
      const value = await executor.executeAsync({ $feature: feature })
      return { ok: true, value }
    } catch (e) {
      return { ok: false, value: null }
    }
  }

  const normalizeArcadeValue = (value: any, depth = 0): any => {
    if (value === null || value === undefined || depth > 8) return value
    if (value instanceof Date) return value
    if (Array.isArray(value)) {
      return value.map(item => normalizeArcadeValue(item, depth + 1))
    }
    if (value instanceof Map) {
      const result: Record<string, any> = {}
      value.forEach((item, key) => {
        result[String(key)] = normalizeArcadeValue(item, depth + 1)
      })
      return result
    }
    if (typeof value !== 'object') return value

    if (typeof value.toJSON === 'function') {
      try {
        const json = value.toJSON()
        if (json !== value) return normalizeArcadeValue(json, depth + 1)
      } catch (e) {}
    }
    if (typeof value.toObject === 'function') {
      try {
        const objectValue = value.toObject()
        if (objectValue !== value) return normalizeArcadeValue(objectValue, depth + 1)
      } catch (e) {}
    }
    if (typeof value.keys === 'function' && typeof value.get === 'function') {
      try {
        const result: Record<string, any> = {}
        for (const key of Array.from(value.keys())) {
          result[String(key)] = normalizeArcadeValue(value.get(key), depth + 1)
        }
        if (Object.keys(result).length > 0) return result
      } catch (e) {}
    }

    const result: Record<string, any> = {}
    Object.keys(value).forEach(key => {
      result[key] = normalizeArcadeValue(value[key], depth + 1)
    })
    return Object.keys(result).length > 0 ? result : value
  }

  const arcadeScalarText = (value: any): string => {
    if (value === null || value === undefined) return ''
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
      return String(value)
    }
    if (value instanceof Date) return value.toLocaleDateString()
    if (value instanceof String || value instanceof Number || value instanceof Boolean) {
      return String(value.valueOf())
    }

    const normalized = normalizeArcadeValue(value)
    if (normalized !== value) return arcadeScalarText(normalized)
    return ''
  }

  const arcadePopupElements = (value: any): any[] => {
    const normalized = normalizeArcadeValue(value)
    if (Array.isArray(normalized)) {
      const elements: any[] = []
      normalized.forEach(item => elements.push(...arcadePopupElements(item)))
      return elements
    }
    if (!normalized || typeof normalized !== 'object') return []

    const type = String((normalized as any).type || '').toLowerCase()
    if (type === 'text') {
      return [{
        ...normalized,
        type: 'text',
        text: (normalized as any).text === null || (normalized as any).text === undefined
          ? ''
          : String((normalized as any).text)
      }]
    }
    if (type === 'fields' || type === 'media') {
      return [{ ...normalized, type }]
    }
    return []
  }

  const nativePopupExpressionContent = async (expression: string): Promise<any> => {
    const { ExpressionContent, ElementExpressionInfo } = await getCore()
    return new ExpressionContent({
      expressionInfo: new ElementExpressionInfo({
        expression,
        title: null
      })
    })
  }

  const escapeHtml = (value: string): string => {
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;')
  }

  const buildContentHtml = (contentRows: ResultRow[]): string => {
    const lines = contentRows.map(row => {
      const valueHtml = row.url
        ? `<a href="${escapeHtml(row.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(row.value)}</a>`
        : escapeHtml(row.value)
      return `<div style="margin:0 0 6px;word-break:break-word;"><strong>${escapeHtml(row.label)}:</strong> ${valueHtml}</div>`
    }).join('')
    return `<div style="font-size:14px;line-height:1.4;">${lines}</div>`
  }

  const buildRows = async (feature: any, entry: LayerEntry): Promise<BuiltResult> => {
    const cfg = getConfig()
    const excluded = new Set(
      String(cfg.excludedFields || '')
        .split(',')
        .map(value => value.trim().toUpperCase())
        .filter(Boolean)
    )
    const fieldByName: Record<string, FieldInfo> = {}
    entry.fields.forEach(field => { fieldByName[field.name.toUpperCase()] = field })

    const attributes = feature.attributes || {}
    const titleFieldName = String(cfg.titleField || entry.displayField || '').trim()
    const titleKey = Object.keys(attributes).find(key => key.toUpperCase() === titleFieldName.toUpperCase())
    let resultTitle = titleKey
      ? formatValue(attributes[titleKey], fieldByName[titleKey.toUpperCase()])
      : ''

    if (cfg.titleExpression?.trim()) {
      // Constant title expressions are common in imported XML. Resolve them
      // directly so a service title can never replace an intended literal.
      const constantTitle = getConstantArcadeString(cfg.titleExpression)
      if (constantTitle) {
        resultTitle = constantTitle
      } else {
        const titleEvaluation = await evalArcadeRaw(cfg.titleExpression, feature)
        const expressionTitle = titleEvaluation.ok ? arcadeScalarText(titleEvaluation.value) : ''
        if (expressionTitle) resultTitle = expressionTitle
      }
    }

    const resultRows: ResultRow[] = []
    const popupContent: any[] = []
    let usesFullPopupExpression = false

    for (const item of cfg.expressions || []) {
      const expression = item?.expression?.trim()
      if (!expression) continue

      const label = String(item.label || '').trim()
      const evaluation = await evalArcadeRaw(item.expression, feature)
      if (evaluation.ok) {
        const popupElements = arcadePopupElements(evaluation.value)
        if (popupElements.length > 0) {
          // A dictionary return is complete popup content whether or not an
          // older saved configuration accidentally supplied a row label.
          popupContent.push(...popupElements)
          usesFullPopupExpression = true
          continue
        }

        const scalarValue = arcadeScalarText(evaluation.value)
        if (!label) {
          usesFullPopupExpression = true
          if (scalarValue) {
            popupContent.push({ type: 'text', text: scalarValue })
          } else {
            // Let the native Popup Element profile evaluate expressions that
            // depend on $map, $layer, or $datastore and cannot run in the
            // lightweight $feature-only preflight profile.
            popupContent.push(await nativePopupExpressionContent(item.expression))
          }
          continue
        }

        if (scalarValue !== '') {
          resultRows.push({ label, value: scalarValue })
        } else if (evaluation.value && typeof evaluation.value === 'object') {
          // Never coerce an unsupported dictionary to "[object Object]".
          resultRows.push({ label, value: nls('exprError') })
        }
        continue
      }

      if (!label) {
        usesFullPopupExpression = true
        popupContent.push(await nativePopupExpressionContent(item.expression))
      } else {
        resultRows.push({ label, value: nls('exprError') })
      }
    }

    // A full Popup Element expression owns the configured result body. This
    // prevents the same service attributes from being appended a second time.
    if (!usesFullPopupExpression) {
      const orderedNames = entry.fields.map(field => field.name)
      Object.keys(attributes).forEach(name => {
        if (!orderedNames.some(fieldName => fieldName.toUpperCase() === name.toUpperCase())) {
          orderedNames.push(name)
        }
      })

      orderedNames.forEach(name => {
        const attributeKey = Object.keys(attributes).find(key => key.toUpperCase() === name.toUpperCase())
        if (!attributeKey) return
        const upper = attributeKey.toUpperCase()
        if (excluded.has(upper)) return
        const field = fieldByName[upper]
        const value = formatValue(attributes[attributeKey], field)
        if (value === '') return
        const label = cfg.useFieldAliases && field ? field.alias : attributeKey
        if (/^https?:\/\//i.test(value)) {
          resultRows.push({ label, value: cfg.linkText || value, url: value })
        } else {
          resultRows.push({ label, value })
        }
      })
    }

    return { title: resultTitle, rows: resultRows, popupContent }
  }

  const buildFallbackResult = (feature: any): { title: string, rows: ResultRow[] } => {
    // Last-resort presentation used only when no popup path is available,
    // e.g. when iOS never creates the popup component. Built from the raw
    // attributes so a map tap can never end in silence.
    const cfg = getConfig()
    const excluded = new Set(
      String(cfg.excludedFields || '')
        .split(',')
        .map(value => value.trim().toUpperCase())
        .filter(Boolean)
    )
    const attributes = feature?.attributes || {}
    const fallbackRows: ResultRow[] = []
    Object.keys(attributes).forEach(name => {
      if (excluded.has(name.toUpperCase())) return
      const value = formatValue(attributes[name])
      if (value === '') return
      if (/^https?:\/\//i.test(value)) {
        fallbackRows.push({ label: name, value: cfg.linkText || value, url: value })
      } else {
        fallbackRows.push({ label: name, value })
      }
    })
    const templateTitle = feature?.popupTemplate?.title
    const fallbackTitle = typeof templateTitle === 'string' && !/\{[^}]+\}/.test(templateTitle)
      ? templateTitle
      : String(feature?.layer?.title || feature?.sourceLayer?.title || '')
    return { title: fallbackTitle, rows: fallbackRows }
  }

  const clearHighlight = (): void => {
    highlightLayerRef.current?.removeAll?.()
  }

  const highlightFeature = (feature: any): void => {
    clearHighlight()
    const cfg = getConfig()
    const layer = highlightLayerRef.current
    if (!cfg.highlightSelectedFeature || !layer || !feature?.geometry || !coreRef.current) return

    const outline = {
      color: cfg.outlineColor || defaultConfig.outlineColor,
      width: cfg.outlineWidth || defaultConfig.outlineWidth
    }
    let symbol: any
    switch (feature.geometry.type) {
      case 'polygon':
      case 'extent':
        symbol = { type: 'simple-fill', color: [0, 0, 0, 0], outline }
        break
      case 'polyline':
        symbol = { type: 'simple-line', color: outline.color, width: outline.width }
        break
      default:
        symbol = {
          type: 'simple-marker',
          style: 'circle',
          size: 12,
          color: [0, 0, 0, 0],
          outline
        }
    }

    layer.add(new coreRef.current.Graphic({
      geometry: feature.geometry,
      symbol
    }))
  }

  const getQueryGeometry = async (click: NormalizedClick): Promise<any> => {
    const cfg = getConfig()
    const tolerance = Math.max(0, Number(cfg.clickTolerance) || 0)
    if (!click.screenPoint || tolerance <= 0) return click.mapPoint

    const component = getMapComponent()
    const view = getView()
    const toMap = typeof component?.toMap === 'function'
      ? component.toMap.bind(component)
      : (typeof view?.toMap === 'function' ? view.toMap.bind(view) : null)
    if (!toMap) return click.mapPoint

    try {
      const corners = [
        { x: click.screenPoint.x - tolerance, y: click.screenPoint.y - tolerance },
        { x: click.screenPoint.x + tolerance, y: click.screenPoint.y - tolerance },
        { x: click.screenPoint.x + tolerance, y: click.screenPoint.y + tolerance },
        { x: click.screenPoint.x - tolerance, y: click.screenPoint.y + tolerance }
      ]
      const mapped = await Promise.all(corners.map(corner => Promise.resolve(toMap(corner))))
      const points = mapped.filter(point => point && isFinite(point.x) && isFinite(point.y))
      if (points.length < 2) return click.mapPoint

      const { Extent } = await getCore()
      return new Extent({
        xmin: Math.min(...points.map(point => point.x)),
        ymin: Math.min(...points.map(point => point.y)),
        xmax: Math.max(...points.map(point => point.x)),
        ymax: Math.max(...points.map(point => point.y)),
        spatialReference: click.mapPoint?.spatialReference || points[0].spatialReference
      })
    } catch (e) {
      return click.mapPoint
    }
  }

  const queryConfiguredLayer = async (
    url: string,
    click: NormalizedClick,
    signal: AbortSignal
  ): Promise<ConfiguredResult[]> => {
    const cfg = getConfig()
    const entry = await getLayerEntry(url)
    if (signal.aborted) throw new DOMException('Aborted', 'AbortError')

    const component = getMapComponent()
    const view = getView()
    const queryTarget = entry.queryLayer || entry.layer
    const query = queryTarget.createQuery()
    query.geometry = await getQueryGeometry(click)
    query.spatialRelationship = 'intersects'
    query.returnGeometry = true
    query.outFields = ['*']
    query.num = Math.max(1, Number(cfg.maxConfiguredResults) || defaultConfig.maxConfiguredResults)

    const resolution = Number(component?.resolution ?? view?.resolution)
    if (isFinite(resolution) && resolution > 0) query.maxAllowableOffset = resolution
    const spatialReference = component?.spatialReference || view?.spatialReference
    if (spatialReference) query.outSpatialReference = spatialReference

    const featureSet = await queryTarget.queryFeatures(query, { signal })
    if (signal.aborted) throw new DOMException('Aborted', 'AbortError')

    const { PopupTemplate } = await getCore()
    const results: ConfiguredResult[] = []
    for (const graphic of featureSet.features || []) {
      if (signal.aborted) throw new DOMException('Aborted', 'AbortError')
      if (graphic && typeof graphic === 'object') {
        configuredUrlByGraphicRef.current.set(graphic, entry.url)
      }
      const built = await buildRows(graphic, entry)
      if (signal.aborted) throw new DOMException('Aborted', 'AbortError')
      const content: any[] = []
      if (built.rows.length > 0) {
        content.push({ type: 'text', text: buildContentHtml(built.rows) })
      }
      content.push(...built.popupContent)

      const popupTemplate = new PopupTemplate({
        title: built.title || getRuntimeDataSourceLabel() || entry.layer.title || nls('defaultTitle'),
        content,
        outFields: ['*']
      })
      graphic.popupTemplate = popupTemplate

      // The selected graphic uses its own template. Mirroring the template to
      // both layers also gives Experience Builder consistent popup metadata
      // while it resolves the graphic into a DataRecord for native data actions.
      if (entry.runtimeRegistered) {
        try { entry.layer.popupTemplate = popupTemplate } catch (e) {}
        const runtimeEntry = runtimeDataSourcesRef.current[entry.url]
        try { runtimeEntry?.sourceLayer && (runtimeEntry.sourceLayer.popupTemplate = popupTemplate) } catch (e) {}
      }
      results.push({ graphic, built, url: entry.url })
    }

    if (entry.runtimeRegistered && entry.dataSource && results.length > 0 &&
        typeof entry.dataSource.buildRecord === 'function' &&
        typeof entry.dataSource.setRecords === 'function') {
      try {
        const records = results
          .map(result => entry.dataSource.buildRecord(result.graphic))
          .filter(record => !!record)
        entry.dataSource.setRecords(records)
      } catch (e) {
        // Popup display remains available if the data source cannot cache a
        // record. The JimuLayerView link is still retained for data actions.
      }
    }

    return results
  }

  const queryConfiguredLayers = async (
    urls: string[],
    click: NormalizedClick,
    signal: AbortSignal
  ): Promise<{ results: ConfiguredResult[], errors: string[] }> => {
    const settled = await Promise.all(
      urls.map(async url => ({
        url,
        outcome: await settle(queryConfiguredLayer(url, click, signal))
      }))
    )
    const results: ConfiguredResult[] = []
    const errors: string[] = []

    settled.forEach(({ url, outcome }) => {
      if (outcome.status === 'fulfilled') {
        results.push(...outcome.value)
      } else {
        const reason: any = outcome.reason
        if (reason?.name !== 'AbortError' && reason?.name !== 'aborted') {
          const message = reason?.message ? String(reason.message) : nls('queryFailed')
          errors.push(`${url}: ${message}`)
        }
      }
    })
    return { results, errors }
  }

  const isConfiguredEndpointLayer = (layer: any): boolean => {
    if (!layer) return false
    return Object.values(layerEntriesRef.current).some(entry => {
      if (!entry.runtimeRegistered) return false
      return entry.layer === layer ||
        (!!entry.layer?.id && !!layer?.id && entry.layer.id === layer.id)
    })
  }

  const filterConfiguredEndpointFeatures = (features: any[]): any[] => {
    return (features || []).filter(feature => {
      return !isConfiguredEndpointLayer(feature?.layer) &&
        !isConfiguredEndpointLayer(feature?.sourceLayer)
    })
  }

  const collectPopupFeatures = async (source: any, limit: number, signal: AbortSignal): Promise<any[]> => {
    if (!source) return []
    if (Array.isArray(source)) return source.slice(0, limit)

    if (typeof source[Symbol.asyncIterator] === 'function') {
      const features: any[] = []
      for await (const feature of source) {
        if (signal.aborted) break
        features.push(feature)
        if (features.length >= limit) break
      }
      return features
    }

    if (source.allGraphicsPromise) {
      const graphics = await source.allGraphicsPromise
      return Array.isArray(graphics) ? graphics.slice(0, limit) : []
    }

    if (Array.isArray(source.features)) return source.features.slice(0, limit)
    return []
  }

  const fetchMapPopupFeatures = async (
    click: NormalizedClick,
    signal: AbortSignal
  ): Promise<any[]> => {
    const cfg = getConfig()
    const limit = Math.max(1, Number(cfg.maxTotalResults) || defaultConfig.maxTotalResults)
    const component = getMapComponent()
    const view = getView()
    let hitTarget = click.screenPoint
    if (!hitTarget && click.mapPoint) {
      const toScreen = typeof component?.toScreen === 'function'
        ? component.toScreen.bind(component)
        : (typeof view?.toScreen === 'function' ? view.toScreen.bind(view) : null)
      if (toScreen) hitTarget = await Promise.resolve(toScreen(click.mapPoint))
    }
    if (!hitTarget) return []

    let firstError: any = null

    if (component && typeof component.fetchPopupFeatures === 'function') {
      try {
        const generator = await component.fetchPopupFeatures(hitTarget, {
          pointerType: click.pointerType,
          defaultPopupTemplateEnabled: cfg.useDefaultPopupTemplates,
          signal
        })
        return filterConfiguredEndpointFeatures(await collectPopupFeatures(generator, limit, signal))
      } catch (error) {
        if (signal.aborted) throw error
        firstError = error
      }
    }

    if (view && typeof view.fetchPopupFeatures === 'function') {
      try {
        const generator = await view.fetchPopupFeatures(hitTarget, {
          pointerType: click.pointerType,
          defaultPopupTemplateEnabled: cfg.useDefaultPopupTemplates,
          signal
        })
        return filterConfiguredEndpointFeatures(await collectPopupFeatures(generator, limit, signal))
      } catch (error) {
        if (signal.aborted) throw error
        if (!firstError) firstError = error
      }
    }

    const popup = view?.popup
    if (popup && typeof popup.fetchFeatures === 'function') {
      try {
        const response = await popup.fetchFeatures(hitTarget, {
          defaultPopupTemplateEnabled: cfg.useDefaultPopupTemplates,
          signal
        })
        return filterConfiguredEndpointFeatures(await collectPopupFeatures(response, limit, signal))
      } catch (error) {
        if (signal.aborted) throw error
        if (!firstError) firstError = error
      }
    }

    if (firstError) throw firstError
    return []
  }

  const getAttributeCaseInsensitive = (attributes: any, fieldName: string): any => {
    if (!attributes || !fieldName) return undefined
    const key = Object.keys(attributes).find(name => name.toUpperCase() === fieldName.toUpperCase())
    return key ? attributes[key] : undefined
  }

  const getFeatureUrl = (feature: any): string => {
    const configuredUrl = feature && typeof feature === 'object'
      ? configuredUrlByGraphicRef.current.get(feature)
      : ''
    const layer = feature?.layer || null
    const sourceLayer = feature?.sourceLayer || null
    let url = normalizeUrl(configuredUrl || layer?.url || sourceLayer?.url || '')
    const sourceLayerId = sourceLayer?.id ?? layer?.layerId
    if (url && sourceLayerId !== null && sourceLayerId !== undefined && !/\/\d+$/.test(url)) {
      url = `${url}/${sourceLayerId}`
    }
    return url
  }

  const getRestServicePath = (url: string): string => {
    const lower = normalizeUrl(url).toLowerCase()
    const marker = '/rest/services/'
    const index = lower.indexOf(marker)
    return index >= 0 ? lower.slice(index) : ''
  }

  const featureIdentityKeys = (feature: any): string[] => {
    const layer = feature?.layer || null
    const sourceLayer = feature?.sourceLayer || null
    const attributes = feature?.attributes || {}
    const url = getFeatureUrl(feature).toLowerCase()
    const servicePath = getRestServicePath(url)
    const keys: string[] = []

    const objectIdField = sourceLayer?.objectIdField || layer?.objectIdField || ''
    let objectId = getAttributeCaseInsensitive(attributes, objectIdField)
    if (objectId === undefined || objectId === null) {
      for (const fallback of ['OBJECTID', 'FID', 'OID']) {
        objectId = getAttributeCaseInsensitive(attributes, fallback)
        if (objectId !== undefined && objectId !== null) break
      }
    }

    if (objectId !== undefined && objectId !== null) {
      const value = String(objectId)
      if (url) keys.push(`url:${url}|oid:${value}`)
      if (servicePath) keys.push(`rest:${servicePath}|oid:${value}`)
    }

    const globalIdField = sourceLayer?.globalIdField || layer?.globalIdField || 'GLOBALID'
    const globalId = getAttributeCaseInsensitive(attributes, globalIdField) ??
      getAttributeCaseInsensitive(attributes, 'GLOBALID')
    if (globalId !== undefined && globalId !== null && String(globalId).trim()) {
      const value = String(globalId).trim().replace(/[{}]/g, '').toLowerCase()
      keys.push(`gid:${value}`)
      if (url) keys.push(`url:${url}|gid:${value}`)
      if (servicePath) keys.push(`rest:${servicePath}|gid:${value}`)
    }

    return Array.from(new Set(keys))
  }

  const featureCanRenderPopup = (feature: any): boolean => {
    if (!feature) return false
    if (feature.popupTemplate) return true
    const layer = feature.layer || feature.sourceLayer
    return !!(layer && layer.popupEnabled !== false && layer.popupTemplate)
  }

  const mergeFeatures = (mapFeatures: any[], configuredFeatures: any[]): any[] => {
    const cfg = getConfig()
    const mapLookup = new Map<string, any>()
    if (cfg.deduplicateResults) {
      mapFeatures.forEach(feature => {
        featureIdentityKeys(feature).forEach(key => {
          if (!mapLookup.has(key)) mapLookup.set(key, feature)
        })
      })
    }

    const mapFeaturesToDrop = new Set<any>()
    const configuredItems = configuredFeatures.map(feature => {
      let preferredFeature = feature
      if (cfg.deduplicateResults) {
        for (const key of featureIdentityKeys(feature)) {
          const matchingMapFeature = mapLookup.get(key)
          if (matchingMapFeature) {
            // Prefer the web map's graphic only when it can actually render a
            // popup. A map layer whose data source failed to initialize has no
            // usable template, and preferring it would silently discard the
            // configured result's content.
            if (featureCanRenderPopup(matchingMapFeature)) {
              preferredFeature = matchingMapFeature
            } else {
              mapFeaturesToDrop.add(matchingMapFeature)
              debugLog('dedup: map twin has no usable popup template; keeping configured result')
            }
            break
          }
        }
      }
      return { feature: preferredFeature, source: 'configured' as const }
    })
    const mapItems = mapFeatures
      .filter(feature => !mapFeaturesToDrop.has(feature))
      .map(feature => ({ feature, source: 'map' as const }))
    // Native map popup features always lead. Configured REST endpoint features
    // are appended last, even when an older saved configuration says otherwise.
    const ordered = [...mapItems, ...configuredItems]

    const seenFeatures = new Set<any>()
    const seenConfiguredKeys = new Set<string>()
    const merged: any[] = []

    for (const item of ordered) {
      const feature = item.feature
      if (!feature || seenFeatures.has(feature)) continue

      if (cfg.deduplicateResults && item.source === 'configured') {
        const keys = featureIdentityKeys(feature)
        if (keys.some(key => seenConfiguredKeys.has(key))) continue
        keys.forEach(key => seenConfiguredKeys.add(key))
      }

      seenFeatures.add(feature)
      merged.push(feature)
    }

    const max = Math.max(1, Number(cfg.maxTotalResults) || defaultConfig.maxTotalResults)
    return merged.slice(0, max)
  }

  const restorePopupPresentation = (): void => {
    const presentationState = originalPopupPresentationRef.current
    if (!presentationState) return
    try { presentationState.target.updateLocationEnabled = presentationState.updateLocationEnabled } catch (e) {}
    try { presentationState.target.initialDisplayMode = presentationState.initialDisplayMode } catch (e) {}
    try { presentationState.target.featureMenuOpen = presentationState.featureMenuOpen } catch (e) {}
    originalPopupPresentationRef.current = null
  }

  const capturePopupPresentation = (popup: any): void => {
    if (!popup || (originalPopupPresentationRef.current && originalPopupPresentationRef.current.target === popup)) return
    restorePopupPresentation()
    originalPopupPresentationRef.current = {
      target: popup,
      updateLocationEnabled: popup.updateLocationEnabled,
      initialDisplayMode: popup.initialDisplayMode,
      featureMenuOpen: popup.featureMenuOpen
    }
  }

  const closeOwnedPopupSync = (): void => {
    if (!popupOpenedByWidgetRef.current) return
    popupOpenedByWidgetRef.current = false
    selectedFeatureRef.current = null

    const popup = popupElementRef.current
    if (popup) {
      try { popup.open = false } catch (e) {}
      try { popup.features = [] } catch (e) {}
      try { popup.content = null } catch (e) {}
      try { popup.heading = null } catch (e) {}
      try { popup.location = null } catch (e) {}
      restorePopupPresentation()
      return
    }

    const legacyPopup = getView()?.popup
    if (legacyPopup) {
      try { legacyPopup.visible = false } catch (e) {}
      try { legacyPopup.features = [] } catch (e) {}
    }
    restorePopupPresentation()
  }

  const resetPopupContent = (popup: any): void => {
    if (!popup) return
    try { popup.open = false } catch (e) {}
    try { popup.features = [] } catch (e) {}
    try { popup.content = null } catch (e) {}
    try { popup.heading = null } catch (e) {}
    try { popup.location = null } catch (e) {}
  }

  const isCurrentRequest = (sequence?: number, signal?: AbortSignal): boolean => {
    return sequence === undefined || (sequence === clickSeqRef.current && !signal?.aborted)
  }

  const getKnownPopupElement = (): any => {
    return popupElementRef.current || getMapComponent()?.popupElement || null
  }

  const withComponentPopupEnabled = async <T,>(action: () => Promise<T>): Promise<T> => {
    const component = getMapComponent()
    const canToggle = component && 'popupDisabled' in component
    const wasDisabled = canToggle ? component.popupDisabled : undefined
    try {
      if (wasDisabled === true) component.popupDisabled = false
      return await action()
    } finally {
      if (wasDisabled === true && component && isWidgetActive() && getConfig().displayMode === 'popup') {
        component.popupDisabled = true
      }
    }
  }

  const openNativePopup = async (
    features: any[],
    location: any,
    sequence?: number,
    signal?: AbortSignal
  ): Promise<boolean> => {
    const cfg = getConfig()
    const showFeatureMenu = cfg.openFeatureMenu && features.length > 1
    if (!isCurrentRequest(sequence, signal)) return false

    selectedFeatureRef.current = features[0] || null
    let popup = getKnownPopupElement()
    if (!popup) {
      // On iOS the popup component is created lazily and often does not exist
      // yet on the first identify tap. Give the element path one bounded
      // chance here; the queries are already complete, so a short wait cannot
      // suppress the identify workflow the way an unbounded await could.
      popup = await awaitWithTimeout(resolvePopupElement(), 3000)
      if (!isCurrentRequest(sequence, signal)) return false
    }
    debugLog(`openNativePopup: ${features.length} feature(s); popup element ${popup ? 'available' : 'NOT available'}`)
    if (popup) {
      const component = getMapComponent()
      const wasDisabled = component && 'popupDisabled' in component
        ? component.popupDisabled
        : undefined
      try {
        if (wasDisabled === true) component.popupDisabled = false
        capturePopupPresentation(popup)
        resetPopupContent(popup)
        popup.features = features
        popup.location = location
        // Keep the popup anchored to the identify click. Selecting another
        // result must not pan, recenter, or rescale the map. The native Zoom To
        // action remains available when the user explicitly requests navigation.
        popup.updateLocationEnabled = false
        popup.initialDisplayMode = 'feature'
        popup.featureMenuOpen = showFeatureMenu
        popup.selectedFeatureIndex = 0
        popup.open = true
        popupOpenedByWidgetRef.current = true
        highlightFeature(features[0])
        debugLog(`popup opened via element path (readback open=${String(popup.open)} visible=${String(popup.visible)})`)
        return true
      } finally {
        if (wasDisabled === true && component && isWidgetActive() && getConfig().displayMode === 'popup') {
          component.popupDisabled = true
        }
      }
    }

    // JimuMapView.openPopup is the Experience Builder-sanctioned programmatic
    // opener (the Map widget itself uses jimuMapView.closePopup). Try it
    // before the raw component and view methods.
    const jmvForOpen: any = jmvRef.current
    if (jmvForOpen && typeof jmvForOpen.openPopup === 'function') {
      try {
        const openedViaJimu = await withComponentPopupEnabled(async () => {
          const settledOpen = await awaitWithTimeout(
            Promise.resolve(jmvForOpen.openPopup({
              features,
              location,
              updateLocationEnabled: false,
              featureMenuOpen: showFeatureMenu
            })).then(() => true),
            2000
          )
          return settledOpen === true
        })
        if (!isCurrentRequest(sequence, signal)) return false
        if (openedViaJimu) {
          popupOpenedByWidgetRef.current = true
          highlightFeature(features[0])
          debugLog('popup opened via JimuMapView.openPopup')
          return true
        }
        debugLog('JimuMapView.openPopup timed out')
      } catch (e) {
        debugLog(`JimuMapView.openPopup failed: ${String((e as any)?.message || e)}`)
      }
    }

    const component = getMapComponent()
    if (component && typeof component.openPopup === 'function') {
      try {
        // openPopup can stall indefinitely on iOS while the popup component
        // initializes lazily. A bounded wait lets the next strategy run
        // instead of leaving the map with no popup path at all.
        const openedViaComponent = await withComponentPopupEnabled(async () => {
          const settledOpen = await awaitWithTimeout(
            Promise.resolve(component.openPopup({
              features,
              location,
              updateLocationEnabled: false,
              featureMenuOpen: showFeatureMenu
            })).then(() => true),
            2000
          )
          return settledOpen === true
        })
        if (!isCurrentRequest(sequence, signal)) return false
        if (openedViaComponent) {
          popupOpenedByWidgetRef.current = true
          highlightFeature(features[0])
          debugLog('popup opened via component.openPopup')
          resolvePopupElement().then(resolved => {
            if (!resolved || !isCurrentRequest(sequence, signal)) return
            capturePopupPresentation(resolved)
            try { resolved.updateLocationEnabled = false } catch (e) {}
            try { resolved.initialDisplayMode = 'feature' } catch (e) {}
            try { resolved.featureMenuOpen = showFeatureMenu } catch (e) {}
          }).catch(() => {})
          return true
        }
      } catch (e) {}
    }

    const view = getView()
    if (view && typeof view.openPopup === 'function') {
      try {
        const openedViaView = await withComponentPopupEnabled(async () => {
          const settledOpen = await awaitWithTimeout(
            Promise.resolve(view.openPopup({
              features,
              location,
              updateLocationEnabled: false,
              featureMenuOpen: showFeatureMenu
            })).then(() => true),
            2000
          )
          return settledOpen === true
        })
        if (!isCurrentRequest(sequence, signal)) return false
        if (openedViaView) {
          popupOpenedByWidgetRef.current = true
          highlightFeature(features[0])
          debugLog('popup opened via view.openPopup')
          return true
        }
        debugLog('view.openPopup timed out')
      } catch (e) {
        debugLog(`view.openPopup failed: ${String((e as any)?.message || e)}`)
      }
    }

    const legacyPopup = view?.popup
    if (legacyPopup) {
      try {
        capturePopupPresentation(legacyPopup)
        legacyPopup.features = features
        legacyPopup.location = location
        legacyPopup.updateLocationEnabled = false
        legacyPopup.featureMenuOpen = showFeatureMenu
        legacyPopup.selectedFeatureIndex = 0
        legacyPopup.visible = true
        popupOpenedByWidgetRef.current = true
        highlightFeature(features[0])
        debugLog('popup opened via legacy view.popup')
        return true
      } catch (e) {}
    }

    debugLog('every popup strategy failed')
    selectedFeatureRef.current = null
    return false
  }

  const openNoResultPopup = async (
    location: any,
    sequence?: number,
    signal?: AbortSignal
  ): Promise<boolean> => {
    const cfg = getConfig()
    selectedFeatureRef.current = null
    if (!isCurrentRequest(sequence, signal)) return false

    let popup = getKnownPopupElement()
    if (!popup) {
      popup = await awaitWithTimeout(resolvePopupElement(), 3000)
      if (!isCurrentRequest(sequence, signal)) return false
    }
    if (popup) {
      const component = getMapComponent()
      const wasDisabled = component && 'popupDisabled' in component
        ? component.popupDisabled
        : undefined
      try {
        if (wasDisabled === true) component.popupDisabled = false
        capturePopupPresentation(popup)
        resetPopupContent(popup)
        popup.features = []
        popup.heading = nls('noResultTitle')
        popup.content = cfg.noResultMessage || nls('noResult')
        popup.location = location
        popup.updateLocationEnabled = false
        popup.initialDisplayMode = 'feature'
        popup.featureMenuOpen = false
        popup.open = true
        popupOpenedByWidgetRef.current = true
        return true
      } finally {
        if (wasDisabled === true && component && isWidgetActive() && getConfig().displayMode === 'popup') {
          component.popupDisabled = true
        }
      }
    }

    const component = getMapComponent()
    if (component && typeof component.openPopup === 'function') {
      try {
        const openedViaComponent = await withComponentPopupEnabled(async () => {
          const settledOpen = await awaitWithTimeout(
            Promise.resolve(component.openPopup({
              title: nls('noResultTitle'),
              content: cfg.noResultMessage || nls('noResult'),
              location,
              updateLocationEnabled: false
            })).then(() => true),
            2000
          )
          return settledOpen === true
        })
        if (!isCurrentRequest(sequence, signal)) return false
        if (openedViaComponent) {
          popupOpenedByWidgetRef.current = true
          return true
        }
      } catch (e) {}
    }

    const view = getView()
    if (view && typeof view.openPopup === 'function') {
      try {
        const openedViaView = await withComponentPopupEnabled(async () => {
          const settledOpen = await awaitWithTimeout(
            Promise.resolve(view.openPopup({
              title: nls('noResultTitle'),
              content: cfg.noResultMessage || nls('noResult'),
              location,
              updateLocationEnabled: false
            })).then(() => true),
            2000
          )
          return settledOpen === true
        })
        if (!isCurrentRequest(sequence, signal)) return false
        if (openedViaView) {
          popupOpenedByWidgetRef.current = true
          return true
        }
      } catch (e) {}
    }

    const legacyPopup = view?.popup
    if (legacyPopup) {
      try {
        capturePopupPresentation(legacyPopup)
        legacyPopup.features = []
        legacyPopup.title = nls('noResultTitle')
        legacyPopup.content = cfg.noResultMessage || nls('noResult')
        legacyPopup.location = location
        legacyPopup.updateLocationEnabled = false
        legacyPopup.featureMenuOpen = false
        legacyPopup.visible = true
        popupOpenedByWidgetRef.current = true
        return true
      } catch (e) {}
    }

    return false
  }

  const closeNativePopup = async (sequence?: number, signal?: AbortSignal): Promise<boolean> => {
    popupOpenedByWidgetRef.current = false
    selectedFeatureRef.current = null
    if (!isCurrentRequest(sequence, signal)) return false

    const popup = getKnownPopupElement()
    if (popup) {
      resetPopupContent(popup)
      restorePopupPresentation()
      return true
    }

    const component = getMapComponent()
    if (component && typeof component.closePopup === 'function') {
      // Bounded for the same reason as openPopup: a lazily created popup
      // component on iOS must never wedge the identify workflow.
      await awaitWithTimeout(Promise.resolve(component.closePopup()), 1500)
      restorePopupPresentation()
      return true
    }

    const view = getView()
    view?.closePopup?.()
    restorePopupPresentation()
    return true
  }

  const handleSelectedPopupFeature = (feature: any): void => {
    // Popup selection changes are presentation-only. The native Zoom To action
    // remains the sole owner of intentional map navigation.
    if (selectedFeatureRef.current === feature) return
    selectedFeatureRef.current = feature || null
    highlightFeature(feature)
  }

  const normalizeClick = (event: any): NormalizedClick => {
    const detail = event?.detail || event || {}
    const x = detail.screenPoint?.x ?? detail.x
    const y = detail.screenPoint?.y ?? detail.y
    const screenPoint = isFinite(Number(x)) && isFinite(Number(y))
      ? { x: Number(x), y: Number(y) }
      : undefined
    return {
      mapPoint: detail.mapPoint,
      screenPoint,
      pointerType: detail.pointerType || detail.native?.pointerType || detail.originalEvent?.pointerType,
      originalEvent: event
    }
  }

  const resolveClickMapPoint = async (click: NormalizedClick): Promise<NormalizedClick> => {
    if (click.mapPoint || !click.screenPoint) return click

    const component = getMapComponent()
    const view = getView()
    const toMap = typeof component?.toMap === 'function'
      ? component.toMap.bind(component)
      : (typeof view?.toMap === 'function' ? view.toMap.bind(view) : null)
    if (!toMap) return click

    try {
      const mapPoint = await Promise.resolve(toMap(click.screenPoint))
      return mapPoint ? { ...click, mapPoint } : click
    } catch (e) {
      return click
    }
  }

  const identify = async (event: any): Promise<void> => {
    if (!isWidgetActive()) {
      debugLog(`click ignored: widget state is ${String(widgetStateRef.current)}`)
      return
    }
    const cfg = getConfig()
    const popupMode = cfg.displayMode === 'popup'
    const click = await resolveClickMapPoint(normalizeClick(event))
    debugLog(`click received: mapPoint=${click.mapPoint ? 'yes' : 'no'} screenPoint=${click.screenPoint ? 'yes' : 'no'} pointerType=${String(click.pointerType || 'unknown')}`)
    if (!isWidgetActive() || !click.mapPoint) return

    const sourceMode = cfg.sourceMode || defaultConfig.sourceMode
    const includeMap = popupMode && sourceMode !== 'configured'
    const configuredUrls = getConfiguredUrls()
    const includeConfigured = sourceMode !== 'map' && configuredUrls.length > 0

    abortRef.current?.abort()
    abortRef.current = null
    const sequence = ++clickSeqRef.current

    setClickedOnce(true)
    setLoading(true)
    setPopupFallback(false)
    setError('')
    setWarning('')
    setNoResult(false)
    clearHighlight()

    // Do not wait for popup discovery before querying. On iOS the popup
    // element may be created lazily, and awaiting it here can suppress every
    // tap before the identify requests even begin. The existing owned popup
    // is replaced only after the new results are ready.

    if (!popupMode && configuredUrls.length === 0) {
      setLoading(false)
      setRows([])
      setTitle('')
      setError(nls('noUrl'))
      return
    }

    if (popupMode && sourceMode === 'configured' && configuredUrls.length === 0) {
      setLoading(false)
      setRows([])
      setTitle('')
      setError(nls('noUrl'))
      return
    }

    const controller = new AbortController()
    abortRef.current = controller

    try {
      // Slow or failing map layers must not hold the whole popup hostage.
      // After the bound elapses, continue with the configured REST results.
      const mapPromise = includeMap
        ? Promise.race<any[]>([
            fetchMapPopupFeatures(click, controller.signal),
            new Promise<any[]>(resolve => {
              setTimeout(() => {
                debugLog('map popup sources exceeded 6000ms; continuing without them')
                resolve([])
              }, 6000)
            })
          ])
        : Promise.resolve([])
      const configuredPromise = includeConfigured || !popupMode
        ? queryConfiguredLayers(configuredUrls, click, controller.signal)
        : Promise.resolve({ results: [], errors: [] })

      const [mapOutcome, configuredOutcome] = await Promise.all([
        settle(mapPromise),
        settle(configuredPromise)
      ])
      if (sequence !== clickSeqRef.current || controller.signal.aborted) return

      const mapFeatures = mapOutcome.status === 'fulfilled' ? mapOutcome.value : []
      const configuredResult = configuredOutcome.status === 'fulfilled'
        ? configuredOutcome.value
        : { results: [], errors: [String(configuredOutcome.reason?.message || nls('queryFailed'))] }
      const configuredGraphics = configuredResult.results.map(result => result.graphic)
      const errors: string[] = [...configuredResult.errors]
      if (mapOutcome.status === 'rejected') {
        const reason: any = mapOutcome.reason
        if (reason?.name !== 'AbortError' && reason?.name !== 'aborted') {
          errors.push(reason?.message ? String(reason.message) : nls('mapPopupFailed'))
        }
      }

      if (popupMode) {
        const merged = mergeFeatures(mapFeatures, configuredGraphics)
        debugLog(`results: map=${mapFeatures.length} configured=${configuredGraphics.length} merged=${merged.length} errors=${errors.length}`)
        if (merged.length > 0) {
          // Render the first result in the widget body whenever the native
          // popup cannot actually be presented, so a tap never ends in silence.
          const showPanelFallback = (reason: string): void => {
            const firstConfigured = configuredResult.results.find(result => result.graphic === merged[0]) ||
              configuredResult.results[0]
            const fallback = firstConfigured
              ? { title: firstConfigured.built.title, rows: firstConfigured.built.rows }
              : buildFallbackResult(merged[0])
            debugLog(`panel fallback engaged: ${reason}`)
            setPopupFallback(true)
            setRows(fallback.rows)
            setTitle(fallback.title)
            setNoResult(false)
            setError('')
            setWarning(nls('popupUnavailable'))
            highlightFeature(firstConfigured ? firstConfigured.graphic : merged[0])
          }

          const opened = await openNativePopup(merged, click.mapPoint, sequence, controller.signal)
          if (!isCurrentRequest(sequence, controller.signal)) return
          if (opened) {
            setRows([])
            setTitle('')
            setNoResult(false)
            setError('')
            setWarning(errors.length > 0 ? `${nls('partialResults')} ${errors[0]}` : '')

            // A strategy can report success while the popup is closed again
            // (or never actually presented) by the host app. Verify shortly
            // afterward and fall back to the widget body if it is not showing.
            const popupToVerify = getKnownPopupElement()
            if (popupToVerify) {
              setTimeout(() => {
                if (!isCurrentRequest(sequence, controller.signal)) return
                const stillOpen = popupToVerify.open === true || popupToVerify.visible === true
                debugLog(`post-open verification: open=${String(popupToVerify.open)} visible=${String(popupToVerify.visible)}`)
                if (!stillOpen) showPanelFallback('popup not open 800ms after opening')
              }, 800)
            }
          } else {
            showPanelFallback('every popup strategy failed or timed out')
          }
        } else {
          clearHighlight()
          if (errors.length === 0 && cfg.showNoResultPopup) {
            await openNoResultPopup(click.mapPoint, sequence, controller.signal)
          } else {
            await closeNativePopup(sequence, controller.signal)
          }
          if (!isCurrentRequest(sequence, controller.signal)) return
          setNoResult(true)
          setRows([])
          setTitle('')
          setWarning('')
          setError(errors.length > 0 ? errors[0] : '')
        }
      } else {
        const first = configuredResult.results[0]
        if (first) {
          setRows(first.built.rows)
          setTitle(first.built.title)
          setNoResult(false)
          setError('')
          setWarning(errors.length > 0 ? `${nls('partialResults')} ${errors[0]}` : '')
          highlightFeature(first.graphic)
        } else {
          setRows([])
          setTitle('')
          setNoResult(true)
          setWarning('')
          setError(errors.length > 0 ? errors[0] : '')
        }
      }
    } catch (err: any) {
      if (err?.name === 'AbortError' || err?.name === 'aborted') return
      if (sequence !== clickSeqRef.current) return
      setRows([])
      setTitle('')
      setWarning('')
      setError(err?.message ? String(err.message) : nls('queryFailed'))
    } finally {
      if (sequence === clickSeqRef.current) {
        if (abortRef.current === controller) abortRef.current = null
        setLoading(false)
      }
    }
  }

  const restorePopupOwnership = (): void => {
    closeOwnedPopupSync()

    restorePopupPresentation()

    const highlightState = originalPopupHighlightDisabledRef.current
    if (highlightState) {
      try { highlightState.target.highlightDisabled = highlightState.value } catch (e) {}
      originalPopupHighlightDisabledRef.current = null
    }

    const componentState = originalPopupDisabledRef.current
    if (componentState) {
      try { componentState.target.popupDisabled = componentState.value } catch (e) {}
      originalPopupDisabledRef.current = null
    }

    const viewState = originalPopupEnabledRef.current
    if (viewState) {
      try {
        // Prefer the supported JimuMapView toggle so the Map widget's own
        // popup bookkeeping stays consistent (same pattern as the built-in
        // Measure tool). Fall back to the raw MapView property.
        if (typeof viewState.target.enableClickOpenPopup === 'function') {
          if (viewState.value) {
            viewState.target.enableClickOpenPopup()
          } else {
            viewState.target.disableClickOpenPopup?.()
          }
        } else {
          viewState.target.popupEnabled = viewState.value
        }
        debugLog(`popup ownership released (restored to ${String(viewState.value)})`)
      } catch (e) {}
      originalPopupEnabledRef.current = null
    }
  }

  const applyPopupOwnership = (): void => {
    const cfg = getConfig()
    const shouldOwnPopupClick = isWidgetActive() && cfg.displayMode === 'popup'
    const view = getView()

    if (!shouldOwnPopupClick) {
      restorePopupOwnership()
      return
    }

    // Use the MapView switch as the single automatic-popup suppression point.
    // The widget handles the MapView click itself and opens the popup manually.
    // Avoid setting mapComponent.popupDisabled here because that property also
    // blocks programmatic popup opening in current map-component releases.
    const componentState = originalPopupDisabledRef.current
    if (componentState) {
      try { componentState.target.popupDisabled = componentState.value } catch (e) {}
      originalPopupDisabledRef.current = null
    }

    // Prefer the supported JimuMapView API used by Esri's own map tools
    // (e.g. Measure): isClickOpenPopupEnabled / disableClickOpenPopup.
    // Setting view.popupEnabled directly bypasses the Map widget's own popup
    // bookkeeping and is retained only as a fallback.
    const jmv: any = jmvRef.current
    if (jmv && typeof jmv.disableClickOpenPopup === 'function') {
      if (!originalPopupEnabledRef.current || originalPopupEnabledRef.current.target !== jmv) {
        originalPopupEnabledRef.current = {
          target: jmv,
          value: typeof jmv.isClickOpenPopupEnabled === 'function'
            ? jmv.isClickOpenPopupEnabled()
            : view?.popupEnabled !== false
        }
      }
      jmv.disableClickOpenPopup()
      debugLog('popup ownership taken via JimuMapView.disableClickOpenPopup()')
    } else if (view && 'popupEnabled' in view) {
      if (!originalPopupEnabledRef.current || originalPopupEnabledRef.current.target !== view) {
        originalPopupEnabledRef.current = { target: view, value: view.popupEnabled }
      }
      view.popupEnabled = false
      debugLog('popup ownership taken via view.popupEnabled = false')
    }

    if (cfg.highlightSelectedFeature) {
      resolvePopupElement().then(popup => {
        const currentConfig = getConfig()
        if (!popup || !isWidgetActive() || currentConfig.displayMode !== 'popup' || !currentConfig.highlightSelectedFeature) return
        capturePopupPresentation(popup)
        if ('highlightDisabled' in popup) {
          if (!originalPopupHighlightDisabledRef.current || originalPopupHighlightDisabledRef.current.target !== popup) {
            originalPopupHighlightDisabledRef.current = { target: popup, value: popup.highlightDisabled }
          }
          popup.highlightDisabled = true
        }
      }).catch(() => {})
    } else {
      const highlightState = originalPopupHighlightDisabledRef.current
      if (highlightState) {
        try { highlightState.target.highlightDisabled = highlightState.value } catch (e) {}
        originalPopupHighlightDisabledRef.current = null
      }
    }
  }

  const bindPopupState = async (interactionVersion: number): Promise<void> => {
    popupDetachRef.current?.()
    popupDetachRef.current = null
    legacyWatchHandlesRef.current.forEach(handle => handle?.remove?.())
    legacyWatchHandlesRef.current = []

    if (!isWidgetActive() || getConfig().displayMode !== 'popup') return

    const popup = await resolvePopupElement()
    if (interactionVersion !== interactionSeqRef.current || !isWidgetActive()) return
    if (popup && typeof popup.addEventListener === 'function') {
      const propertyHandler = (event: any): void => {
        const propertyName = event?.detail?.name
        if (propertyName === 'selectedFeature' || propertyName === 'selectedFeatureIndex') {
          handleSelectedPopupFeature(popup.selectedFeature)
        } else if (propertyName === 'open' && !popup.open) {
          popupOpenedByWidgetRef.current = false
          selectedFeatureRef.current = null
          restorePopupPresentation()
          clearHighlight()
        }
      }
      const closeHandler = (): void => {
        popupOpenedByWidgetRef.current = false
        selectedFeatureRef.current = null
        restorePopupPresentation()
        clearHighlight()
      }
      popup.addEventListener('arcgisPropertyChange', propertyHandler)
      popup.addEventListener('arcgisClose', closeHandler)
      popupDetachRef.current = () => {
        popup.removeEventListener('arcgisPropertyChange', propertyHandler)
        popup.removeEventListener('arcgisClose', closeHandler)
      }
      return
    }

    const view = getView()
    const reactiveUtils = coreRef.current?.reactiveUtils
    if (view?.popup && reactiveUtils) {
      legacyWatchHandlesRef.current.push(
        reactiveUtils.watch(
          () => view.popup?.selectedFeature,
          (feature: any) => handleSelectedPopupFeature(feature)
        ),
        reactiveUtils.watch(
          () => !!view.popup?.visible,
          (visible: boolean) => {
            if (!visible) {
              popupOpenedByWidgetRef.current = false
              selectedFeatureRef.current = null
              restorePopupPresentation()
              clearHighlight()
            }
          }
        )
      )
    }
  }

  const attachClickListener = (): boolean => {
    clickDetachRef.current?.()
    clickDetachRef.current = null

    if (!isWidgetActive()) return false

    // JimuMapView.view is the stable cross-device event source. MapView click
    // events normalize mouse, pen, and touch taps, including Mobile Safari.
    const view = getView()
    if (view && typeof view.on === 'function') {
      const handle = view.on('click', (event: any) => { identify(event) })
      clickDetachRef.current = () => handle?.remove?.()
      debugLog('click listener attached via view.on(click)')
      return true
    }

    // Retain the map-component event as a fallback for future view types that
    // do not expose the legacy Evented interface.
    const component = getMapComponent()
    if (component && typeof component.addEventListener === 'function') {
      const handler = (event: any): void => { identify(event) }
      component.addEventListener('arcgisViewClick', handler)
      clickDetachRef.current = () => component.removeEventListener('arcgisViewClick', handler)
      debugLog('click listener attached via arcgisViewClick')
      return true
    }

    debugLog('no click listener could be attached')
    return false
  }

  const suspendInteractions = (): void => {
    ++interactionSeqRef.current
    ++clickSeqRef.current
    abortRef.current?.abort()
    abortRef.current = null
    clickDetachRef.current?.()
    clickDetachRef.current = null
    popupDetachRef.current?.()
    popupDetachRef.current = null
    legacyWatchHandlesRef.current.forEach(handle => handle?.remove?.())
    legacyWatchHandlesRef.current = []
    selectedFeatureRef.current = null
    restorePopupOwnership()
    clearHighlight()
  }

  const prewarm = (): void => {
    if (!isWidgetActive()) return
    const cfg = getConfig()
    const configuredEnabled = cfg.displayMode === 'panel' || cfg.sourceMode !== 'map'
    const configuredUrls = configuredEnabled ? getConfiguredUrls() : []

    getCore().catch(() => {})
    configuredUrls.forEach(url => { getLayerEntry(url).catch(() => {}) })
    if (configuredUrls.length > 0 && hasExpressions()) getArcade().catch(() => {})
    if (cfg.displayMode === 'popup') resolvePopupElement().catch(() => {})
  }

  const syncInteractionState = async (): Promise<void> => {
    if (!jmvRef.current) return
    if (!isWidgetActive()) {
      suspendInteractions()
      return
    }

    const interactionVersion = ++interactionSeqRef.current

    // Install the cross-device click listener before disabling the map's
    // automatic popup workflow. If listener registration ever fails, native
    // popups remain untouched instead of leaving the map with no popup path.
    const clickAttached = attachClickListener()
    if (!clickAttached) {
      restorePopupOwnership()
      return
    }

    applyPopupOwnership()
    prewarm()

    // Popup selection watches are optional enhancements. They must never block
    // click handling or popup opening on a device that creates the popup lazily.
    bindPopupState(interactionVersion).catch(() => {})
  }

  const teardownView = (): void => {
    suspendInteractions()
    // Runtime endpoint layers belong to the active JimuMapView. Remove their
    // JimuLayerViews before the map reference changes.
    resetLayerCache()

    const component = getMapComponent()
    const view = getView()
    const map = component?.map || view?.map
    if (highlightLayerRef.current && map) {
      try { map.remove(highlightLayerRef.current) } catch (e) {}
    }
    highlightLayerRef.current = null
    popupElementRef.current = null
    popupResolvePromiseRef.current = null
  }

  const onActiveViewChange = async (jmv: JimuMapView): Promise<void> => {
    teardownView()
    jmvRef.current = jmv
    if (!jmv) return
    const activeJmv = jmv

    try {
      if (typeof (activeJmv as any).whenJimuMapViewLoaded === 'function') {
        await (activeJmv as any).whenJimuMapViewLoaded()
      }
      if (jmvRef.current !== activeJmv) return

      const core = await getCore()
      if (jmvRef.current !== activeJmv) return

      const highlightLayer = new core.GraphicsLayer({
        listMode: 'hide',
        title: 'Feature Identify highlight',
        popupEnabled: false
      })
      const component: any = (activeJmv as any).mapComponent
      const view: any = (activeJmv as any).view
      const map = component?.map || view?.map
      map?.add?.(highlightLayer)
      highlightLayerRef.current = highlightLayer

      debugLog(`map view ready: mapComponent=${component ? 'yes' : 'no'} popupElement=${component?.popupElement ? 'yes' : 'no'} viewType=${String(view?.type || 'unknown')} widthBreakpoint=${String(view?.widthBreakpoint || 'n/a')}`)
      await syncInteractionState()
    } catch (e) {
      if (jmvRef.current === activeJmv) setError(nls('queryFailed'))
    }
  }

  const resetLayerCache = (): void => {
    ++layerCacheVersionRef.current
    Object.values(layerEntriesRef.current).forEach(entry => disposeLayerEntry(entry))
    layerEntriesRef.current = {}
    layerLoadsRef.current = {}
    configuredUrlByGraphicRef.current = new WeakMap()
  }

  const destroyRuntimeDataSources = (): void => {
    ++runtimeDataSourceVersionRef.current
    const manager: any = DataSourceManager.getInstance()
    const entries = Object.values(runtimeDataSourcesRef.current)
    runtimeDataSourcesRef.current = {}
    runtimeDataSourceLoadsRef.current = {}

    entries.forEach(entry => {
      try { entry.dataSource?.clearRecords?.() } catch (e) {}

      let destroyedByManager = false
      try {
        if (typeof manager.destroyDataSource === 'function') {
          manager.destroyDataSource(entry.id)
          destroyedByManager = true
        }
      } catch (e) {}

      if (!destroyedByManager) {
        try { entry.dataSource?.destroy?.() } catch (e) {}
      }

      // The source layer is also passed into the data source constructor.
      // Guard the explicit cleanup because some Experience Builder builds
      // destroy that layer when the data source is destroyed.
      try {
        if (entry.sourceLayer && !entry.sourceLayer.destroyed) {
          entry.sourceLayer.destroy?.()
        }
      } catch (e) {}
    })
  }

  React.useEffect(() => {
    ++clickSeqRef.current
    abortRef.current?.abort()
    abortRef.current = null
    resetLayerCache()
    destroyRuntimeDataSources()
    closeOwnedPopupSync()
    clearHighlight()
    setClickedOnce(false)
    setPopupFallback(false)
    setRows([])
    setTitle('')
    setError('')
    setWarning('')
    setNoResult(false)
    if (jmvRef.current && isWidgetActive()) prewarm()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config.layerUrl, config.titleField, config.titleExpression])

  React.useEffect(() => {
    ++clickSeqRef.current
    abortRef.current?.abort()
    abortRef.current = null
    resetLayerCache()
    destroyRuntimeDataSources()
    closeOwnedPopupSync()
    clearHighlight()
    setLoading(false)
    setPopupFallback(false)
    setWarning('')
    if (jmvRef.current) syncInteractionState().catch(() => setError(nls('queryFailed')))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config.displayMode, config.sourceMode])

  React.useEffect(() => {
    debugLog(`widget state changed: ${String(state)}`)
    if (!jmvRef.current) return
    if (isWidgetActive()) {
      syncInteractionState().catch(() => setError(nls('queryFailed')))
    } else {
      suspendInteractions()
      resetLayerCache()
      destroyRuntimeDataSources()
      setLoading(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state])

  React.useEffect(() => {
    if (jmvRef.current) applyPopupOwnership()
    const popup = popupElementRef.current
    if (popup?.selectedFeature) highlightFeature(popup.selectedFeature)
    else if (!getConfig().highlightSelectedFeature) clearHighlight()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config.highlightSelectedFeature, config.outlineColor, config.outlineWidth])

  React.useEffect(() => {
    return () => {
      teardownView()
      destroyRuntimeDataSources()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const style = css`
    height: 100%;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    font-family: "Avenir Next", "Helvetica Neue", Helvetica, Arial, sans-serif;
    font-size: 14px;
    color: #323232;
    background: #ffffff;
    box-shadow: 0 1px 4px rgba(0, 0, 0, 0.3);

    .fi-header { display: flex; align-items: flex-start; flex-shrink: 0; padding: 12px 7px 8px 15px; }
    .fi-header-title { flex: 1; font-size: 14px; font-weight: 600; line-height: 20px; word-break: break-word; }
    .fi-close { flex-shrink: 0; border: none; background: transparent; color: #6e6e6e; font-size: 16px; line-height: 20px; width: 32px; height: 24px; cursor: pointer; padding: 0; }
    .fi-close:hover { color: #151515; }
    .fi-content { flex: 1; overflow-y: auto; padding: 0 15px 15px; }
    .fi-line { margin: 0 0 6px; font-size: 14px; line-height: 1.4; word-break: break-word; }
    .fi-line strong { font-weight: 600; }
    .fi-line a { color: #0079c1; }
    .fi-msg { padding: 12px 15px; font-size: 13px; }
    .fi-debug { flex-shrink: 0; max-height: 45%; overflow-y: auto; font-family: Menlo, Consolas, monospace; font-size: 10px; line-height: 1.35; background: #111111; color: #7fffd4; padding: 6px 8px; word-break: break-word; }
    .fi-error { color: #8e2600; }
    .fi-warning { color: #6f4e00; background: #fff6d9; }
    .fi-hint { color: #6e6e6e; }
  `

  const mapSelected = useMapWidgetIds && useMapWidgetIds.length > 0
  const cfg = getConfig()
  const popupMode = cfg.displayMode === 'popup'
  const hasResult = rows.length > 0

  return (
    <div css={style} className='jimu-widget'>
      {mapSelected && (
        <JimuMapViewComponent
          useMapWidgetId={useMapWidgetIds[0]}
          onActiveViewChange={onActiveViewChange}
        />
      )}

      {!mapSelected && <div className='fi-msg fi-error'>{nls('noMap')}</div>}

      {mapSelected && popupMode && !popupFallback && !loading && !error && !warning && (
        <div className='fi-msg fi-hint'>{nls('popupModeHint')}</div>
      )}

      {mapSelected && !popupMode && !clickedOnce && !loading && (
        <div className='fi-msg fi-hint'>{nls('clickHint')}</div>
      )}

      {loading && <Loading type={LoadingType.Secondary} />}

      {!loading && error && <div className='fi-msg fi-error'>{error}</div>}

      {!loading && !error && warning && <div className='fi-msg fi-warning'>{warning}</div>}

      {!loading && !error && noResult && !cfg.showNoResultPopup && (
        <div className='fi-msg'>{cfg.noResultMessage || nls('noResult')}</div>
      )}

      {(!popupMode || popupFallback) && !loading && !error && hasResult && (
        <React.Fragment>
          <div className='fi-header'>
            <div className='fi-header-title'>{title || nls('defaultTitle')}</div>
            <button
              className='fi-close'
              onClick={() => {
                clearHighlight()
                setPopupFallback(false)
                setWarning('')
                setRows([])
                setTitle('')
                setClickedOnce(false)
              }}
              aria-label={nls('close')}
              title={nls('close')}
            >
              &#215;
            </button>
          </div>
          <div className='fi-content'>
            {rows.map((row, index) => (
              <div className='fi-line' key={index}>
                <strong>{row.label}:</strong>{' '}
                {row.url
                  ? <a href={row.url} target='_blank' rel='noopener noreferrer'>{row.value}</a>
                  : row.value}
              </div>
            ))}
          </div>
        </React.Fragment>
      )}

      {isDebugEnabled() && debugLines.length > 0 && typeof document !== 'undefined' &&
        ReactDOM.createPortal(
          <div
            style={{
              position: 'fixed',
              left: 0,
              right: 0,
              bottom: 0,
              maxHeight: '45vh',
              overflow: 'hidden',
              zIndex: 2147483647,
              background: 'rgba(0, 0, 0, 0.85)',
              color: '#7fffd4',
              fontFamily: 'Menlo, Consolas, monospace',
              fontSize: '11px',
              lineHeight: 1.4,
              padding: '6px 10px 12px',
              pointerEvents: 'none',
              wordBreak: 'break-word'
            }}
          >
            <div style={{ color: '#ffffff', fontWeight: 600 }}>Feature Identify debug (newest first)</div>
            {[...debugLines].reverse().map((line, index) => (
              <div key={index}>{line}</div>
            ))}
          </div>,
          document.body
        )}
    </div>
  )
}

export default Widget
