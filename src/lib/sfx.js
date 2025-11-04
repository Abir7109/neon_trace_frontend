export class SFX {
  constructor({ enabled = true } = {}) {
    this.enabled = enabled
    this.ctx = null
  }
  _ctx() {
    if (!this.enabled) return null
    if (!this.ctx) this.ctx = new (window.AudioContext || window.webkitAudioContext)()
    return this.ctx
  }
  type() { this._beep(880, 0.03) }
  route() { this._sweep(220, 880, 0.3) }
  hack() { this._sweep(200, 50, 0.5) }
  _beep(freq, dur) {
    const ctx = this._ctx(); if (!ctx) return
    const o = ctx.createOscillator(); const g = ctx.createGain()
    o.type = 'square'; o.frequency.value = freq
    g.gain.setValueAtTime(0.05, ctx.currentTime)
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + dur)
    o.connect(g).connect(ctx.destination); o.start(); o.stop(ctx.currentTime + dur)
  }
  _sweep(a, b, dur) {
    const ctx = this._ctx(); if (!ctx) return
    const o = ctx.createOscillator(); const g = ctx.createGain()
    o.type = 'sawtooth'; o.frequency.setValueAtTime(a, ctx.currentTime)
    o.frequency.exponentialRampToValueAtTime(b, ctx.currentTime + dur)
    g.gain.setValueAtTime(0.04, ctx.currentTime)
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + dur)
    o.connect(g).connect(ctx.destination); o.start(); o.stop(ctx.currentTime + dur)
  }
}
