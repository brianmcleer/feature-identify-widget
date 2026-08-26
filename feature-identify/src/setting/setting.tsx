/** @jsx jsx */
import { React, jsx, css } from 'jimu-core'
import type { AllWidgetSettingProps } from 'jimu-for-builder'
import { MapWidgetSelector, SettingSection, SettingRow } from 'jimu-ui/advanced/setting-components'
import { TextInput, TextArea, NumericInput, Switch, Label, Button, Select, Option } from 'jimu-ui'
import type { IMConfig, ArcadeExpression } from '../config'
import { defaultConfig } from '../config'
import defaultMessages from './translations/default'

type SettingProps = AllWidgetSettingProps<IMConfig> & { id: string, useMapWidgetIds: string[] }

const CONFIG_KEYS = [
  'displayMode',
  'sourceMode',
  'layerUrl',
  'titleField',
  'titleExpression',
  'excludedFields',
  'linkText',
  'outlineColor',
  'outlineWidth',
  'noResultMessage',
  'useFieldAliases',
  'useDefaultPopupTemplates',
  'clickTolerance',
  'maxConfiguredResults',
  'maxTotalResults',
  'resultOrder',
  'openFeatureMenu',
  'deduplicateResults',
  'highlightSelectedFeature',
  'showNoResultPopup',
  'debugOverlay'
]

const BOOLEAN_KEYS = new Set([
  'useFieldAliases',
  'useDefaultPopupTemplates',
  'openFeatureMenu',
  'deduplicateResults',
  'highlightSelectedFeature',
  'showNoResultPopup',
  'debugOverlay'
])

const NUMBER_KEYS = new Set([
  'outlineWidth',
  'clickTolerance',
  'maxConfiguredResults',
  'maxTotalResults'
])

const Setting = (props: SettingProps): React.ReactElement => {
  const { config, id, useMapWidgetIds, onSettingChange, intl } = props
  const fileInputRef = React.useRef<HTMLInputElement>(null)
  const [importStatus, setImportStatus] = React.useState('')

  const set = (key: string, value: any): void => {
    onSettingChange({ id, config: config.set(key, value) })
  }

  const onMapWidgetSelected = (ids: string[]): void => {
    onSettingChange({ id, useMapWidgetIds: ids })
  }

  const nls = (msgId: string): string => {
    return intl
      ? intl.formatMessage({ id: msgId, defaultMessage: (defaultMessages as any)[msgId] })
      : (defaultMessages as any)[msgId] || msgId
  }

  const getExpressions = (): ArcadeExpression[] => {
    const raw: any = config.expressions
    if (!raw) return []
    return typeof raw.asMutable === 'function' ? raw.asMutable({ deep: true }) : [...raw]
  }

  const addExpression = (): void => {
    const list = getExpressions()
    list.push({ label: '', expression: '' })
    set('expressions', list)
  }

  const removeExpression = (index: number): void => {
    const list = getExpressions()
    list.splice(index, 1)
    set('expressions', list)
  }

  const updateExpression = (index: number, key: 'label' | 'expression', value: string): void => {
    const list = getExpressions()
    list[index] = { ...list[index], [key]: value }
    set('expressions', list)
  }

  const xmlEscape = (value: string): string => {
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;')
  }

  const exportXml = (): void => {
    const raw: any = config
    const current = raw && typeof raw.asMutable === 'function'
      ? raw.asMutable({ deep: true })
      : raw
    const values: any = { ...defaultConfig, ...(current || {}), resultOrder: 'map-first' }
    const parts: string[] = ['<?xml version="1.0" encoding="UTF-8"?>', '<featureIdentify version="2">']

    CONFIG_KEYS.forEach(key => {
      const value = values[key]
      parts.push(`  <${key}>${xmlEscape(value === undefined || value === null ? '' : String(value))}</${key}>`)
    })

    parts.push('  <expressions>')
    getExpressions().forEach(expression => {
      parts.push(`    <expression label="${xmlEscape(expression.label || '')}">${xmlEscape(expression.expression || '')}</expression>`)
    })
    parts.push('  </expressions>')
    parts.push('</featureIdentify>')

    const blob = new Blob([parts.join('\n')], { type: 'application/xml' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = 'feature-identify-config.xml'
    document.body.appendChild(anchor)
    anchor.click()
    document.body.removeChild(anchor)
    URL.revokeObjectURL(url)
  }

  const importXml = (file: File): void => {
    const reader = new FileReader()
    reader.onload = () => {
      try {
        const doc = new DOMParser().parseFromString(String(reader.result), 'application/xml')
        if (doc.querySelector('parsererror')) throw new Error('parse')
        const root = doc.querySelector('featureIdentify')
        if (!root) throw new Error('root')

        let next: any = config
        CONFIG_KEYS.forEach(key => {
          const node = root.querySelector(`:scope > ${key}`)
          if (!node) return
          const text = node.textContent ?? ''
          if (NUMBER_KEYS.has(key)) {
            const numberValue = Number(text)
            if (!isNaN(numberValue)) next = next.set(key, numberValue)
          } else if (BOOLEAN_KEYS.has(key)) {
            next = next.set(key, text === 'true')
          } else {
            next = next.set(key, text)
          }
        })

        next = next.set('resultOrder', 'map-first')

        const expressionNodes = root.querySelectorAll('expressions > expression')
        const expressions: ArcadeExpression[] = []
        expressionNodes.forEach(node => {
          expressions.push({
            label: node.getAttribute('label') || '',
            expression: node.textContent || ''
          })
        })
        next = next.set('expressions', expressions)

        onSettingChange({ id, config: next })
        setImportStatus(nls('importOk'))
      } catch (e) {
        setImportStatus(nls('importFailed'))
      }
    }
    reader.readAsText(file)
  }

  const style = css`
    .full { width: 100%; }
    .hint { font-size: 12px; color: var(--dark-400, #808080); margin-top: 4px; }
    .notice {
      width: 100%;
      padding: 8px;
      border-radius: 4px;
      background: var(--light-200, #f3f3f3);
      font-size: 12px;
      line-height: 1.4;
    }
    .color-row { display: flex; align-items: center; gap: 8px; }
    .swatch {
      width: 24px;
      height: 24px;
      border-radius: 4px;
      border: 1px solid var(--light-500, #c5c5c5);
      flex: 0 0 24px;
    }
    .expr-item {
      border: 1px solid var(--light-400, #d5d5d5);
      border-radius: 4px;
      padding: 8px;
      margin-bottom: 8px;
    }
    .expr-head {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 6px;
      gap: 8px;
    }
  `

  const expressions = getExpressions()
  const displayMode = config.displayMode || defaultConfig.displayMode
  const sourceMode = config.sourceMode || defaultConfig.sourceMode
  const popupMode = displayMode === 'popup'
  const usesMapLayers = popupMode && sourceMode !== 'configured'
  const usesConfiguredLayers = !popupMode || sourceMode !== 'map'
  const combinedMode = popupMode && sourceMode === 'combined'

  return (
    <div css={style}>
      <SettingSection title={nls('selectMap')}>
        <SettingRow>
          <MapWidgetSelector
            useMapWidgetIds={useMapWidgetIds}
            onSelect={onMapWidgetSelected}
          />
        </SettingRow>
      </SettingSection>

      <SettingSection title={nls('displaySection')}>
        <SettingRow flow='wrap'>
          <Label className='full'>{nls('displayMode')}</Label>
          <Select
            className='full'
            value={displayMode}
            onChange={(event) => set('displayMode', event.target.value)}
          >
            <Option value='popup'>{nls('displayModePopup')}</Option>
            <Option value='panel'>{nls('displayModePanel')}</Option>
          </Select>
          <div className='hint'>{nls('displayModeHint')}</div>
        </SettingRow>

        {!popupMode && (
          <SettingRow flow='wrap'>
            <div className='notice'>{nls('panelModeNotice')}</div>
          </SettingRow>
        )}

        {popupMode && (
          <React.Fragment>
            <SettingRow flow='wrap'>
              <Label className='full'>{nls('sourceMode')}</Label>
              <Select
                className='full'
                value={sourceMode}
                onChange={(event) => set('sourceMode', event.target.value)}
              >
                <Option value='map'>{nls('sourceModeMap')}</Option>
                <Option value='configured'>{nls('sourceModeConfigured')}</Option>
                <Option value='combined'>{nls('sourceModeCombined')}</Option>
              </Select>
              <div className='hint'>{nls('sourceModeHint')}</div>
            </SettingRow>

            {combinedMode && (
              <SettingRow flow='wrap'>
                <div className='notice'>{nls('resultOrderFixed')}</div>
              </SettingRow>
            )}

            <SettingRow label={nls('openFeatureMenu')}>
              <Switch
                checked={config.openFeatureMenu ?? defaultConfig.openFeatureMenu}
                onChange={(event) => set('openFeatureMenu', event.target.checked)}
              />
            </SettingRow>

            {combinedMode && (
              <SettingRow label={nls('deduplicateResults')}>
                <Switch
                  checked={config.deduplicateResults ?? defaultConfig.deduplicateResults}
                  onChange={(event) => set('deduplicateResults', event.target.checked)}
                />
              </SettingRow>
            )}

            <SettingRow flow='wrap'>
              <Label className='full'>{nls('maxTotalResults')}</Label>
              <NumericInput
                className='full'
                min={1}
                max={100}
                value={config.maxTotalResults ?? defaultConfig.maxTotalResults}
                onChange={(value) => set('maxTotalResults', value ?? defaultConfig.maxTotalResults)}
              />
              <div className='hint'>{nls('maxTotalResultsHint')}</div>
            </SettingRow>

            <SettingRow label={nls('showNoResultPopup')}>
              <Switch
                checked={config.showNoResultPopup ?? defaultConfig.showNoResultPopup}
                onChange={(event) => set('showNoResultPopup', event.target.checked)}
              />
            </SettingRow>
          </React.Fragment>
        )}
      </SettingSection>

      {usesMapLayers && (
        <SettingSection title={nls('mapPopupSection')}>
          <SettingRow label={nls('useDefaultPopupTemplates')}>
            <Switch
              checked={config.useDefaultPopupTemplates ?? defaultConfig.useDefaultPopupTemplates}
              onChange={(event) => set('useDefaultPopupTemplates', event.target.checked)}
            />
          </SettingRow>
          <SettingRow flow='wrap'>
            <div className='hint'>{nls('useDefaultPopupTemplatesHint')}</div>
          </SettingRow>
        </SettingSection>
      )}

      {usesConfiguredLayers && (
        <SettingSection title={nls('layerSection')}>
          <SettingRow flow='wrap'>
            <Label className='full'>{nls('layerUrl')}</Label>
            <TextArea
              className='full'
              height={90}
              value={config.layerUrl || ''}
              placeholder={'https://server/arcgis/rest/services/Folder/Service/MapServer/0\nhttps://server/arcgis/rest/services/Folder/Other/FeatureServer/2'}
              onChange={(event) => set('layerUrl', event.target.value)}
            />
            <div className='hint'>{nls('layerUrlHint')}</div>
          </SettingRow>

          <SettingRow flow='wrap'>
            <Label className='full'>{nls('clickTolerance')}</Label>
            <NumericInput
              className='full'
              min={0}
              max={40}
              value={config.clickTolerance ?? defaultConfig.clickTolerance}
              onChange={(value) => set('clickTolerance', value ?? defaultConfig.clickTolerance)}
            />
            <div className='hint'>{nls('clickToleranceHint')}</div>
          </SettingRow>

          <SettingRow flow='wrap'>
            <Label className='full'>{nls('maxConfiguredResults')}</Label>
            <NumericInput
              className='full'
              min={1}
              max={25}
              value={config.maxConfiguredResults ?? defaultConfig.maxConfiguredResults}
              onChange={(value) => set('maxConfiguredResults', value ?? defaultConfig.maxConfiguredResults)}
            />
            <div className='hint'>{nls('maxConfiguredResultsHint')}</div>
          </SettingRow>

          <SettingRow flow='wrap'>
            <Label className='full'>{nls('titleField')}</Label>
            <TextInput
              className='full'
              value={config.titleField || ''}
              placeholder='PARCEL_NUM'
              onChange={(event) => set('titleField', event.target.value)}
            />
            <div className='hint'>{nls('titleFieldHint')}</div>
          </SettingRow>

          <SettingRow flow='wrap'>
            <Label className='full'>{nls('titleExpression')}</Label>
            <TextArea
              className='full'
              height={60}
              value={config.titleExpression || ''}
              placeholder='"Parcel " + $feature.PARCEL_NUM'
              onChange={(event) => set('titleExpression', event.target.value)}
            />
            <div className='hint'>{nls('titleExpressionHint')}</div>
          </SettingRow>

          <SettingRow flow='wrap'>
            <Label className='full'>{nls('excludedFields')}</Label>
            <TextArea
              className='full'
              height={80}
              value={config.excludedFields || ''}
              onChange={(event) => set('excludedFields', event.target.value)}
            />
            <div className='hint'>{nls('excludedFieldsHint')}</div>
          </SettingRow>

          <SettingRow flow='wrap'>
            <Label className='full'>{nls('linkText')}</Label>
            <TextInput
              className='full'
              value={config.linkText || ''}
              onChange={(event) => set('linkText', event.target.value)}
            />
            <div className='hint'>{nls('linkTextHint')}</div>
          </SettingRow>

          <SettingRow label={nls('useAliases')}>
            <Switch
              checked={config.useFieldAliases ?? defaultConfig.useFieldAliases}
              onChange={(event) => set('useFieldAliases', event.target.checked)}
            />
          </SettingRow>
        </SettingSection>
      )}

      {usesConfiguredLayers && (
        <SettingSection title={nls('arcadeSection')}>
          <SettingRow flow='wrap'>
            <div className='hint'>{nls('arcadeHint')}</div>
          </SettingRow>
          {expressions.map((expression, index) => (
            <SettingRow flow='wrap' key={index}>
              <div className='expr-item full'>
                <div className='expr-head'>
                  <TextInput
                    className='full'
                    value={expression.label}
                    placeholder={nls('exprLabelPlaceholder')}
                    onChange={(event) => updateExpression(index, 'label', event.target.value)}
                  />
                  <Button size='sm' type='tertiary' onClick={() => removeExpression(index)}>
                    {nls('removeExpression')}
                  </Button>
                </div>
                <TextArea
                  className='full'
                  height={80}
                  value={expression.expression}
                  placeholder='Round($feature.Acres, 2) + " acres"'
                  onChange={(event) => updateExpression(index, 'expression', event.target.value)}
                />
              </div>
            </SettingRow>
          ))}
          <SettingRow>
            <Button size='sm' onClick={addExpression}>{nls('addExpression')}</Button>
          </SettingRow>
        </SettingSection>
      )}

      <SettingSection title={nls('highlightSection')}>
        <SettingRow label={nls('highlightSelectedFeature')}>
          <Switch
            checked={config.highlightSelectedFeature ?? defaultConfig.highlightSelectedFeature}
            onChange={(event) => set('highlightSelectedFeature', event.target.checked)}
          />
        </SettingRow>

        <SettingRow flow='wrap'>
          <Label className='full'>{nls('outlineColor')}</Label>
          <div className='color-row full'>
            <div className='swatch' style={{ background: config.outlineColor || defaultConfig.outlineColor }} />
            <TextInput
              className='full'
              value={config.outlineColor || defaultConfig.outlineColor}
              placeholder='#00ffff'
              onChange={(event) => set('outlineColor', event.target.value)}
            />
          </div>
          <div className='hint'>{nls('outlineColorHint')}</div>
        </SettingRow>

        <SettingRow label={nls('outlineWidth')}>
          <NumericInput
            size='sm'
            min={1}
            max={10}
            value={config.outlineWidth ?? defaultConfig.outlineWidth}
            onChange={(value) => set('outlineWidth', value ?? defaultConfig.outlineWidth)}
          />
        </SettingRow>

        {popupMode && (
          <SettingRow flow='wrap'>
            <div className='hint'>{nls('navigationNotice')}</div>
          </SettingRow>
        )}
      </SettingSection>

      <SettingSection title={nls('messagesSection')}>
        <SettingRow flow='wrap'>
          <Label className='full'>{nls('noResultMessage')}</Label>
          <TextInput
            className='full'
            value={config.noResultMessage || defaultConfig.noResultMessage}
            onChange={(event) => set('noResultMessage', event.target.value)}
          />
        </SettingRow>
      </SettingSection>

      <SettingSection title={nls('debugSection')}>
        <SettingRow label={nls('debugOverlay')}>
          <Switch
            checked={config.debugOverlay ?? defaultConfig.debugOverlay}
            onChange={(event) => set('debugOverlay', event.target.checked)}
          />
        </SettingRow>
        <SettingRow flow='wrap'>
          <div className='hint'>{nls('debugOverlayHint')}</div>
        </SettingRow>
      </SettingSection>

      <SettingSection title={nls('configSection')}>
        <SettingRow>
          <Button size='sm' onClick={exportXml}>{nls('exportConfig')}</Button>
        </SettingRow>
        <SettingRow flow='wrap'>
          <Button size='sm' onClick={() => fileInputRef.current?.click()}>{nls('importConfig')}</Button>
          <input
            ref={fileInputRef}
            type='file'
            accept='.xml,application/xml,text/xml'
            style={{ display: 'none' }}
            onChange={(event) => {
              const file = event.target.files?.[0]
              if (file) importXml(file)
              event.target.value = ''
            }}
          />
          {importStatus && <div className='hint'>{importStatus}</div>}
        </SettingRow>
        <SettingRow flow='wrap'>
          <div className='hint'>{nls('configHint')}</div>
        </SettingRow>
      </SettingSection>
    </div>
  )
}

export default Setting
