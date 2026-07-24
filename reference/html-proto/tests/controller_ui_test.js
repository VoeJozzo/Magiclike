// Controller/browser wiring regressions. The modal and cancellation checks use
// browser-shaped DOM nodes because the bugs depend on class/overlay removal,
// while the timer-generation checks lock the callback guards at source level.

const setup = require('./_setup');
setup.loadEngine();

let pass = 0, fail = 0;
function check(label, ok, info) {
  console.log('  ' + (ok ? 'PASS' : 'FAIL') + ': ' + label + (info ? ' -- ' + info : ''));
  if (ok) pass++; else fail++;
}

const source = setup.getSource();
console.log('=== AI scheduling invalidates across game generations ===');
check('controller has a scheduling generation', /let schedulingGeneration = 0/.test(source));
check('clearTransientGameUi invalidates scheduled work',
  /function clearTransientGameUi\(\) \{\s*invalidateScheduledUi\(\);/.test(source));
check('new-game wrapper invalidates scheduled work',
  /function startNextGameWithBossBanner\(\) \{\s*invalidateScheduledUi\(\);/.test(source));
check('AI callback captures and checks its generation',
  /const generation = schedulingGeneration;\s*setTimeout\(async \(\) => \{\s*if \(generation !== schedulingGeneration\) return;/.test(source));
check('AI callback rechecks after async decision',
  /action = await AI\.decide\(stateAtFire, 'opp'\);[\s\S]{0,180}if \(generation !== schedulingGeneration\) return;/.test(source));
check('AI callback rechecks after resolution delay',
  /await new Promise\(r => setTimeout\(r, 500\)\);\s*if \(generation !== schedulingGeneration\) return;/.test(source));
check('popup opener enters the modal stack',
  /function openCardPopup\(card\) \{[\s\S]*?Modal\.show\('cardPopup'\);/.test(source));
check('popup closer leaves the modal stack',
  /function closeCardPopup\(e\) \{[\s\S]*?Modal\.hide\('cardPopup'\);/.test(source));
check('both player auto-pass timers capture generations',
  (source.match(/const generation = schedulingGeneration;/g) || []).length >= 3);

function makeEl(id) {
  const classes = new Set();
  const attrs = {};
  const el = {
    id,
    classList: {
      add: (...names) => names.forEach(n => classes.add(n)),
      remove: (...names) => names.forEach(n => classes.delete(n)),
      contains: name => classes.has(name),
    },
    setAttribute: (name, value) => { attrs[name] = value; },
    removeAttribute: name => { delete attrs[name]; },
    getAttribute: name => attrs[name] || null,
    remove: () => { el.removed = true; },
    focus: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    removed: false,
  };
  return el;
}

const elements = {};
for (const id of ['cardPopup', 'cardPopupCard', 'zoneModal', 'tgtbar', 'statusCancelBtn', 'stackBannerCancelBtn']) {
  elements[id] = makeEl(id);
}
const body = makeEl('body');
const previousDocument = global.document;
global.document = {
  getElementById: id => elements[id] || (id === 'graveTargetPicker' ? elements.graveTargetPicker : null),
  addEventListener: () => {},
  removeEventListener: () => {},
  body,
  activeElement: null,
};

function resetModalState() {
  Modal._stack.length = 0;
  for (const el of Object.values(elements)) {
    el.classList.remove('vis');
    el.removed = false;
  }
  delete elements.graveTargetPicker;
}

console.log('\n=== Card popup participates in modal input gate ===');
resetModalState();
Modal.show('zoneModal');
Modal.show('cardPopup');
check('popup is visible through Modal.show', elements.cardPopup.classList.contains('vis'));
check('popup is on top of the modal stack',
  Modal._stack.length === 2 && Modal._stack[1].id === 'cardPopup');
CONTROLLER.closeCardPopup({target: elements.cardPopup});
check('dimmer close removes popup from the stack',
  Modal._stack.length === 1 && Modal._stack[0].id === 'zoneModal');
check('dimmer close preserves existing visual close behavior',
  !elements.cardPopup.classList.contains('vis'));
Modal._onEscape({key: 'Escape'});
check('Escape then closes the underlying zone modal', Modal._stack.length === 0);

console.log('\n=== Target cancellation closes both graveyard overlays ===');
resetModalState();
elements.graveTargetPicker = makeEl('graveTargetPicker');
Modal.show('zoneModal');
CONTROLLER.cancelTarget();
check('cancelTarget hides static zone modal', !elements.zoneModal.classList.contains('vis'));
check('cancelTarget removes dynamic graveyard picker', elements.graveTargetPicker.removed);
check('cancelTarget leaves no modal-stack entry', Modal._stack.length === 0);

global.document = previousDocument;
console.log('\n=== TOTAL: ' + pass + ' passed, ' + fail + ' failed ===');
process.exit(fail > 0 ? 1 : 0);
