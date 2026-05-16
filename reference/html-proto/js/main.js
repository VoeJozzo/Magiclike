// Bootstrap + shared module-level helpers. Loaded last so all IIFEs
// (ENGINE, AI, DRAFT, RUN, CONTROLLER, PICKLOG) are defined first.

const VERSION = 'v1.0.135';

function opp(who) { return who === 'you' ? 'opp' : 'you'; }

window.PICKLOG = PICKLOG;
CONTROLLER.init();
