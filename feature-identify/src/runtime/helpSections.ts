import type { HelpSection } from './components/HelpPopup'

/**
 * Flags the widget computes from config and live status. One per feature that has help text.
 * widget.tsx computes these with the same checks the render and click code use (for example
 * `popupMode && sourceMode !== 'configured'` for the map source), so the guide never
 * describes something the widget is not currently doing.
 */
export interface HelpFeatures {
  /** A map widget is selected in the settings. */
  mapConnected: boolean
  /** Results open in the map popup. When false they are listed in the widget body. */
  popupMode: boolean
  /** The layers drawn in the map take part in a click. */
  mapLayerSource: boolean
  /** Extra REST layers set up by the app author take part in a click. */
  configuredLayerSource: boolean
  /** A record found twice is shown once. */
  deduplicate: boolean
  /** The popup opens its own list when a click finds more than one feature. */
  featureMenu: boolean
  /** The feature being read is outlined on the map. */
  highlight: boolean
  /** The selected result is announced to the rest of the app. */
  publishSelection: boolean
  /** An empty click opens a short popup instead of a note in the widget. */
  noResultPopup: boolean
  /** The on-screen diagnostic view is showing. */
  diagnosticOverlay: boolean
}

type T = (id: string, values?: Record<string, string>) => string

export function buildHelpSections (t: T, f: HelpFeatures): HelpSection[] {
  const when = (on: boolean, ...ids: string[]): string[] => (on ? ids.map((id: string) => t(id)) : [])
  const listOf = (parts: string[]): string =>
    parts.length <= 1 ? (parts[0] ?? '') : `${parts.slice(0, -1).join(', ')} ${t('helpAnd')} ${parts[parts.length - 1]}`

  /* The sources that answer a click, in the order their results appear. */
  const sourceNames: string[] = [
    ...(f.mapLayerSource ? [t('helpSourceMapName')] : []),
    ...(f.configuredLayerSource ? [t('helpSourceExtraName')] : [])
  ]
  const anySource = sourceNames.length > 0
  const bothSources = f.mapLayerSource && f.configuredLayerSource

  const sections: HelpSection[] = [
    {
      key: 'start',
      icon: 'play',
      title: t('helpStartTitle'),
      ordered: true,
      body: [
        t('helpStart1'),
        t('helpStart2'),
        f.popupMode ? t('helpStart3Popup') : t('helpStart3Panel')
      ]
    }
  ]

  sections.push({
    key: 'results',
    icon: 'information',
    title: t('helpResultsTitle'),
    intro: f.popupMode ? t('helpResultsIntroPopup') : t('helpResultsIntroPanel'),
    body: [
      f.popupMode ? t('helpResultsTitleLinePopup') : t('helpResultsTitleLinePanel'),
      t('helpResultsRows'),
      t('helpResultsLinks'),
      ...when(f.popupMode, 'helpResultsMany'),
      ...when(f.popupMode && f.featureMenu, 'helpResultsList'),
      f.noResultPopup ? t('helpResultsEmptyPopup') : t('helpResultsEmptyPanel'),
      ...when(f.popupMode, 'helpResultsClose')
    ]
  })

  if (anySource) {
    sections.push({
      key: 'sources',
      icon: 'layers',
      title: t('helpSourcesTitle'),
      intro: t('helpSourcesIntro', { sources: listOf(sourceNames) }),
      body: [
        ...when(f.mapLayerSource, 'helpSourcesMap'),
        ...when(f.configuredLayerSource, 'helpSourcesExtra'),
        ...when(bothSources, 'helpSourcesOrder'),
        ...when(bothSources && f.deduplicate, 'helpSourcesDuplicates')
      ]
    })
  }

  if (f.highlight || f.publishSelection) {
    sections.push({
      key: 'selection',
      icon: 'table',
      title: t('helpSelectionTitle'),
      body: [
        ...when(f.highlight, 'helpSelectionHighlight'),
        ...when(f.publishSelection, 'helpSelectionOther'),
        t('helpSelectionNoMove')
      ]
    })
  }

  sections.push({
    key: 'trouble',
    icon: 'exclamation-mark-triangle',
    title: t('helpTroubleTitle'),
    body: [
      ...when(!f.mapConnected, 'helpTroubleNoMap'),
      t('helpTroubleNothing'),
      t('helpTroubleMissed'),
      ...when(f.mapLayerSource, 'helpTroubleLayerOff'),
      t('helpTroubleSlow'),
      t('helpTroublePartial'),
      ...when(f.popupMode, 'helpTroubleNoPopup'),
      ...when(f.diagnosticOverlay, 'helpTroubleDiagnostic'),
      t('helpTroubleContact')
    ]
  })

  sections.push({
    key: 'tips',
    icon: 'lightbulb',
    title: t('helpTipsTitle'),
    body: [
      t('helpTips1'),
      t('helpTips2'),
      t('helpTips3')
    ]
  })

  return sections
}
