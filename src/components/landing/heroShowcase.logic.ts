// Pure logic for HeroShowcase, kept out of the component file so React Fast
// Refresh stays happy (a component file should export only components).

export type ShowcaseMode = 'morph' | 'flow'

export const MODES: ShowcaseMode[] = ['morph', 'flow']

export const MODE_LABELS: Record<ShowcaseMode, string> = {
  morph: 'Превращение',
  flow: 'Поток + Telegram',
}

// Which scene comes next in the auto-rotation.
export function nextMode(mode: ShowcaseMode): ShowcaseMode {
  return mode === 'morph' ? 'flow' : 'morph'
}
