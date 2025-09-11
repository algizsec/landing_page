
export default class GUIView {
  constructor(app) {
    this.app = app;        // keep reference if anything checks it
    // no ControlKit, no Stats, no writes to uniforms
  }
  initControlKit() {}
  initStats() {}
  update() {}              // called from App.js — now harmless
  enable() {}
  disable() {}
  toggle() {}
  onTouchChange() {}
  onParticlesChange() {}
  onPostProcessingChange() {}
}