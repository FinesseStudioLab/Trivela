/**
 * Trivela Partner SDK — embed.js
 *
 * One-line embed snippet for third-party sites and partner apps.
 *
 * Usage:
 *   <script src="https://trivela.app/embed.js"
 *           data-campaign="<campaign-id>"
 *           data-partner="<partner-id>"
 *           data-theme="dark"
 *           data-size="md"
 *           data-org="MyDAO"
 *           data-color="#3b82f6">
 *   </script>
 *
 * Programmatic usage (after the script loads):
 *   const widget = new TrivelaWidget({ campaign: 'id', partner: 'pid' });
 *   widget.on('trivela:ready',          (e) => console.log('loaded', e))
 *         .on('trivela:register_click', (e) => console.log('register clicked', e))
 *         .mount(document.getElementById('my-container'));
 *
 * Security:
 *   - The iframe is sandboxed: allow-scripts allow-same-origin allow-popups allow-forms
 *   - postMessage events are validated: only messages from the Trivela origin are
 *     forwarded to widget listeners.
 *   - Partner IDs are validated (alphanumeric + _-) before being placed in the URL.
 *   - No credentials, API keys, or wallet secrets are ever exposed in the snippet.
 */

(function (global) {
  'use strict';

  // Derive the Trivela origin from where this script was loaded.
  // Falls back to the script src attribute for reliability across CDN setups.
  var scriptEl = (function () {
    if (document.currentScript) return document.currentScript;
    var scripts = document.querySelectorAll('script[src*="embed.js"]');
    return scripts[scripts.length - 1] || null;
  })();

  var TRIVELA_ORIGIN = (function () {
    try {
      if (scriptEl && scriptEl.src) {
        var u = new URL(scriptEl.src);
        return u.origin;
      }
    } catch (_) {
      /* invalid URL — fall through to default */
    }
    return 'https://trivela.app';
  })();

  var PARTNER_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;
  var COLOR_PATTERN = /^#(?:[0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/;

  // Default iframe dimensions per size preset.
  var SIZE_HEIGHTS = { sm: '260px', md: '320px', lg: '380px' };

  /**
   * Validate and sanitise a partner ID.
   * @param {string|null|undefined} raw
   * @returns {string}
   */
  function sanitisePartner(raw) {
    if (!raw) return '';
    var s = String(raw).trim();
    return PARTNER_PATTERN.test(s) ? s : '';
  }

  /**
   * Validate a CSS hex colour.
   * @param {string|null|undefined} raw
   * @returns {string}
   */
  function sanitiseColor(raw) {
    if (!raw) return '';
    var s = String(raw).trim();
    return COLOR_PATTERN.test(s) ? s : '';
  }

  /**
   * TrivelaWidget constructor.
   *
   * @param {Object} config
   * @param {string}  config.campaign     Campaign ID (required)
   * @param {string}  [config.partner]    Partner/referrer ID
   * @param {string}  [config.theme]      'dark' | 'light'
   * @param {string}  [config.size]       'sm' | 'md' | 'lg'
   * @param {string}  [config.org]        Partner org display name
   * @param {string}  [config.color]      Button hex colour override
   * @param {string}  [config.origin]     Override Trivela origin (testing only)
   */
  function TrivelaWidget(config) {
    this._config = config || {};
    this._listeners = Object.create(null);
    this._iframe = null;
    this._mounted = false;
    this._messageHandler = null;
  }

  /**
   * Subscribe to a widget event.
   *
   * Supported events:
   *   'trivela:ready'           — widget iframe has loaded the campaign
   *   'trivela:register_click'  — user clicked "Register on Trivela"
   *
   * @param {string}   event
   * @param {Function} handler
   * @returns {TrivelaWidget} for chaining
   */
  TrivelaWidget.prototype.on = function (event, handler) {
    if (typeof handler !== 'function') return this;
    if (!this._listeners[event]) this._listeners[event] = [];
    this._listeners[event].push(handler);
    return this;
  };

  /**
   * Remove a previously registered handler (or all handlers for the event).
   * @param {string}    event
   * @param {Function}  [handler]  Omit to remove all handlers for this event.
   * @returns {TrivelaWidget}
   */
  TrivelaWidget.prototype.off = function (event, handler) {
    if (!handler) {
      delete this._listeners[event];
      return this;
    }
    var handlers = this._listeners[event];
    if (!handlers) return this;
    this._listeners[event] = handlers.filter(function (h) {
      return h !== handler;
    });
    return this;
  };

  /** @private */
  TrivelaWidget.prototype._emit = function (event, data) {
    var handlers = this._listeners[event] || [];
    for (var i = 0; i < handlers.length; i++) {
      try {
        handlers[i](data);
      } catch (_) {
        /* isolate subscriber errors */
      }
    }
  };

  /**
   * Build the iframe src URL.
   * @private
   * @returns {string}
   */
  TrivelaWidget.prototype._buildSrc = function () {
    var cfg = this._config;
    var origin = cfg.origin || TRIVELA_ORIGIN;
    var params = new URLSearchParams();

    var partner = sanitisePartner(cfg.partner);
    if (partner) params.set('partner', partner);

    var color = sanitiseColor(cfg.color);
    if (color) params.set('color', color);

    if (cfg.theme === 'light') params.set('theme', 'light');
    if (cfg.size && SIZE_HEIGHTS[cfg.size]) params.set('size', cfg.size);
    if (cfg.org) params.set('org', String(cfg.org).slice(0, 48));

    var qs = params.toString();
    return origin + '/embed/campaign/' + encodeURIComponent(cfg.campaign) + (qs ? '?' + qs : '');
  };

  /**
   * Mount the widget into the given DOM element.
   *
   * @param {Element} container  Host element; the iframe is appended to it.
   * @returns {TrivelaWidget}
   */
  TrivelaWidget.prototype.mount = function (container) {
    if (this._mounted || !container) return this;
    this._mounted = true;

    var cfg = this._config;
    var origin = cfg.origin || TRIVELA_ORIGIN;
    var size = cfg.size || 'md';
    var height = SIZE_HEIGHTS[size] || SIZE_HEIGHTS.md;

    var iframe = document.createElement('iframe');
    iframe.src = this._buildSrc();
    iframe.title = 'Trivela Campaign Widget';
    iframe.setAttribute('loading', 'lazy');
    iframe.setAttribute('allow', 'payment');
    // Sandbox: minimal permissions required for the widget to function.
    // allow-same-origin is needed for postMessage to carry the Trivela origin.
    // allow-popups is needed so the "Register" link opens in a new tab.
    iframe.setAttribute('sandbox', 'allow-scripts allow-same-origin allow-popups allow-forms');
    iframe.style.cssText = [
      'display:block',
      'width:100%',
      'height:' + height,
      'border:none',
      'border-radius:12px',
      'overflow:hidden',
    ].join(';');

    container.appendChild(iframe);
    this._iframe = iframe;

    var self = this;

    this._messageHandler = function (evt) {
      // Only accept messages from the Trivela embed origin.
      if (evt.origin !== origin) return;
      var data = evt.data;
      if (!data || typeof data !== 'object') return;
      if (data.source !== 'trivela-widget') return;
      if (typeof data.type !== 'string') return;
      self._emit(data.type, data.payload);
    };

    global.addEventListener('message', this._messageHandler);
    return this;
  };

  /**
   * Unmount and clean up the widget.
   */
  TrivelaWidget.prototype.destroy = function () {
    if (this._messageHandler) {
      global.removeEventListener('message', this._messageHandler);
      this._messageHandler = null;
    }
    if (this._iframe && this._iframe.parentNode) {
      this._iframe.parentNode.removeChild(this._iframe);
      this._iframe = null;
    }
    this._mounted = false;
    this._listeners = Object.create(null);
  };

  // ── Auto-init ───────────────────────────────────────────────────────────────

  /**
   * Scan the page for <script data-campaign="..."> tags and auto-mount widgets.
   * Partners that prefer to control placement can skip this by adding
   * data-trivela-manual on the script tag.
   */
  function autoInit() {
    var scripts = document.querySelectorAll('script[data-campaign]');

    for (var i = 0; i < scripts.length; i++) {
      var script = scripts[i];
      if (script.getAttribute('data-trivela-manual') !== null) continue;

      var campaign = script.getAttribute('data-campaign');
      if (!campaign) continue;

      var widget = new TrivelaWidget({
        campaign: campaign,
        partner: script.getAttribute('data-partner') || '',
        theme: script.getAttribute('data-theme') || '',
        size: script.getAttribute('data-size') || 'md',
        org: script.getAttribute('data-org') || '',
        color: script.getAttribute('data-color') || '',
      });

      // Insert a container div immediately after the script tag.
      var container = document.createElement('div');
      container.setAttribute('data-trivela-widget', campaign);
      if (script.parentNode) {
        script.parentNode.insertBefore(container, script.nextSibling);
      }

      widget.mount(container);

      // Expose for programmatic post-mount access.
      if (!global.TrivelaWidgets) global.TrivelaWidgets = Object.create(null);
      global.TrivelaWidgets[campaign] = widget;
    }
  }

  // ── Public API ──────────────────────────────────────────────────────────────

  /** Expose TrivelaWidget globally for programmatic use. */
  global.TrivelaWidget = TrivelaWidget;

  /** Index of auto-mounted widgets, keyed by campaign ID. */
  if (!global.TrivelaWidgets) global.TrivelaWidgets = Object.create(null);

  // Run auto-init after DOM is ready.
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', autoInit);
  } else {
    autoInit();
  }
})(typeof window !== 'undefined' ? window : this);
