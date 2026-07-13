// turndown-plugin-gfm ships no types. We only use the `gfm` plugin, which is a
// Turndown plugin function (adds tables, strikethrough, etc.).
declare module 'turndown-plugin-gfm' {
  import type TurndownService from 'turndown';
  export const gfm: TurndownService.Plugin;
  export const tables: TurndownService.Plugin;
  export const strikethrough: TurndownService.Plugin;
  export const taskListItems: TurndownService.Plugin;
}
