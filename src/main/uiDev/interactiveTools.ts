/** UI-drive tool short names that mutate UI state (approval-required in approve mode). */
export const INTERACTIVE_DRIVE_TOOLS = new Set([
  'click',
  'dblclick',
  'hover',
  'fill',
  'clear',
  'type',
  'press_key',
  'select_option',
  'check',
  'uncheck',
  'scroll_into_view',
  'scroll',
  'drag'
])
