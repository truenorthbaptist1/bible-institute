
(function () {
  window.__yt = { players: [] };
  function Player(id, opts) {
    var el = document.getElementById(id), self = this, state = 5, t = 0, last = null, timer = null;
    var dur = (window.__ytDur && window.__ytDur[opts.videoId]) || 20;
    if (el) { el.className = 'fake-yt'; el.textContent = 'YouTube ' + opts.videoId; el.setAttribute('data-video', opts.videoId); }
    function fire(s) { state = s; if (opts.events && opts.events.onStateChange) opts.events.onStateChange({ data: s }); }
    this.videoId = opts.videoId;
    this.playVideo = function () { if (timer) return; fire(1); last = Date.now(); timer = setInterval(function () {
      var now = Date.now(); t = Math.min(dur, t + (now - last) / 1000); last = now;
      if (t >= dur) { clearInterval(timer); timer = null; fire(0); } }, 200); };
    this.pauseVideo = function () { if (timer) { clearInterval(timer); timer = null; } fire(2); };
    this.getPlayerState = function () { return state; };
    this.getCurrentTime = function () { return t; };
    this.getDuration = function () { return dur; };
    this.destroy = function () { if (timer) clearInterval(timer); };
    window.__yt.players.push(this); window.__yt.last = this;
    setTimeout(function () { if (opts.events && opts.events.onReady) opts.events.onReady({ target: self }); }, 50);
  }
  window.YT = { Player: Player, PlayerState: { PLAYING: 1 } };
  setTimeout(function () { if (window.onYouTubeIframeAPIReady) window.onYouTubeIframeAPIReady(); }, 0);
})();
