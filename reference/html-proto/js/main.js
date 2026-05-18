// Bootstrap + shared module-level helpers. Loaded last so all IIFEs
// (ENGINE, AI, DRAFT, RUN, CONTROLLER, PICKLOG) are defined first.

const VERSION = 'v1.0.156';

function opp(who) { return who === 'you' ? 'opp' : 'you'; }

window.PICKLOG = PICKLOG;

// Card templates are fetched async from cards/<tplId>/card.json before
// the controller wires up. Without the await, every CARDS[tplId] lookup
// during init would hit an empty object and the start screen would render
// no cards.
// Push saved font choices into the :root CSS custom properties before the
// first paint — otherwise the v2 cards flash with default fonts for a frame
// before the saved override applies.
SETTINGS.applyFontsToRoot();

loadCards().then(() => {
  CONTROLLER.init();
}).catch(e => {
  console.error('Failed to load card data:', e);
  const root = document.getElementById('root') || document.body;
  root.innerHTML = '<pre style="color:#c44;padding:20px;font-family:monospace">'
    + 'Failed to load card data. Check the browser console.\n\n'
    + String(e && e.message ? e.message : e)
    + '</pre>';
});
