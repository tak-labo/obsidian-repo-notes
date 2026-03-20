// Obsidian runtime mock for unit tests
export class Plugin {}
export class Modal {
  constructor(public app: App) {}
}
export class PluginSettingTab {
  constructor(public app: App, public plugin: Plugin) {}
}
export class Setting {
  constructor(public containerEl: HTMLElement) {}
  setName(_name: string) { return this; }
  setDesc(_desc: string) { return this; }
  addText(_cb: unknown) { return this; }
  addToggle(_cb: unknown) { return this; }
  addButton(_cb: unknown) { return this; }
  addDropdown(_cb: unknown) { return this; }
  addTextArea(_cb: unknown) { return this; }
}
export class TFile {}
export class Notice {
  constructor(_message: string) {}
}
export function requestUrl(_opts: unknown): Promise<unknown> {
  return Promise.resolve({});
}
export class App {}
