// Modal helper (controller.js, module scope). Stack-aware show/hide
// with per-modal Escape opt-in. Tests the stack/dismissible logic
// directly — no real DOM needed; the helper's internal _stack and
// dismissible flag are the load-bearing state.
//
// Catches: someone forgetting `dismissible: false` on a new decision
// modal, breaking stack-LIFO ordering, regressions in the Escape
// handler (which exists because the helper was originally inside the
// CONTROLLER IIFE — see v1.0.132 commit message for the bug history).

const setup = require('./_setup');
setup.loadEngine();

let pass = 0, fail = 0;
function check(label, ok, info) {
  console.log('  ' + (ok ? 'PASS' : 'FAIL') + ': ' + label + (info ? ' -- ' + info : ''));
  if (ok) pass++; else fail++;
}

// Reset Modal._stack between tests — earlier tests may have left it
// non-empty if they crashed mid-show.
function resetStack() {
  Modal._stack.length = 0;
}

console.log('=== Modal helper exists at module scope ===');
check('Modal is defined', typeof Modal === 'object' && Modal !== null);
check('Modal.show is a function', typeof Modal.show === 'function');
check('Modal.hide is a function', typeof Modal.hide === 'function');
check('Modal._onEscape is a function', typeof Modal._onEscape === 'function');
check('Modal._stack starts as an array', Array.isArray(Modal._stack));

console.log('\n=== show pushes onto _stack, hide pops ===');
{
  resetStack();
  Modal.show('cardBrowserModal');
  check('show pushes one entry', Modal._stack.length === 1);
  check('entry.id matches', Modal._stack[0].id === 'cardBrowserModal');
  check('default dismissible is true', Modal._stack[0].dismissible === true);

  Modal.hide('cardBrowserModal');
  check('hide pops the entry', Modal._stack.length === 0);
}

console.log('\n=== show is idempotent (render-loop callers safe) ===');
{
  resetStack();
  Modal.show('searchModal');
  Modal.show('searchModal');   // second call from a re-render
  Modal.show('searchModal');   // third
  check('duplicate shows do not stack', Modal._stack.length === 1);
}

console.log('\n=== dismissible flag is preserved ===');
{
  resetStack();
  Modal.show('rewardModal', { dismissible: false });
  check('dismissible:false recorded', Modal._stack[0].dismissible === false);
  Modal.show('cardZoomPopup');
  check('default dismissible:true on the next push', Modal._stack[1].dismissible === true);
}

console.log('\n=== Escape closes the top dismissible modal (LIFO) ===');
{
  resetStack();
  Modal.show('cardBrowserModal');                              // dismissible
  Modal.show('cardZoomPopup');                                 // dismissible (nested)
  check('stack has 2 entries before Escape', Modal._stack.length === 2);

  // Simulate the keydown event the document listener would receive.
  Modal._onEscape({ key: 'Escape' });
  check('top modal closes on Escape', Modal._stack.length === 1);
  check('the popped modal was the top one (LIFO)',
    Modal._stack[0].id === 'cardBrowserModal');

  Modal._onEscape({ key: 'Escape' });
  check('second Escape closes the next one', Modal._stack.length === 0);
}

console.log('\n=== Escape does NOT close non-dismissible modals ===');
{
  resetStack();
  Modal.show('neowModal', { dismissible: false });
  Modal._onEscape({ key: 'Escape' });
  check('sticky modal survives Escape', Modal._stack.length === 1);
  check('sticky modal stays at top', Modal._stack[0].id === 'neowModal');
}

console.log('\n=== Non-Escape keys are ignored ===');
{
  resetStack();
  Modal.show('cardBrowserModal');
  Modal._onEscape({ key: 'Enter' });
  Modal._onEscape({ key: 'a' });
  Modal._onEscape({ key: ' ' });
  check('non-Escape keys do not close the modal', Modal._stack.length === 1);
  Modal.hide('cardBrowserModal');
}

console.log('\n=== Nested: dismissible-on-top of sticky, Escape only pops the top ===');
{
  resetStack();
  Modal.show('rewardModal', { dismissible: false });     // sticky base
  Modal.show('cardZoomPopup');                           // dismissible nested
  Modal._onEscape({ key: 'Escape' });
  check('nested dismissible pops first', Modal._stack.length === 1);
  check('sticky base remains', Modal._stack[0].id === 'rewardModal');
  Modal._onEscape({ key: 'Escape' });
  check("sticky base doesn't pop on subsequent Escape", Modal._stack.length === 1);
  Modal.hide('rewardModal');
}

console.log('\n=== hide() of a non-top modal removes from the middle ===');
{
  resetStack();
  Modal.show('a');
  Modal.show('b');
  Modal.show('c');
  Modal.hide('b');
  check('middle hide removes b', !Modal._stack.some(e => e.id === 'b'));
  check('stack is now 2 entries', Modal._stack.length === 2);
  check('order preserved (a then c)',
    Modal._stack[0].id === 'a' && Modal._stack[1].id === 'c');
  Modal.hide('a'); Modal.hide('c');
}

console.log('\n=== hide() of a modal not on stack is a no-op ===');
{
  resetStack();
  Modal.show('foo');
  Modal.hide('bar');   // not on stack
  check('hiding an absent modal leaves stack intact', Modal._stack.length === 1);
  Modal.hide('foo');
}

console.log('\n=== Hides record exactly the user-initiated flag for onClose ===');
{
  resetStack();
  let closedFlags = [];
  Modal.show('foo', { dismissible: true, onClose: () => closedFlags.push('foo') });

  // Code-driven hide — onClose should NOT fire (per the helper's contract).
  Modal.hide('foo');
  check('code-driven hide does not invoke onClose', closedFlags.length === 0);

  // User-initiated (via Escape simulation) — onClose SHOULD fire.
  resetStack();
  closedFlags = [];
  Modal.show('bar', { dismissible: true, onClose: () => closedFlags.push('bar') });
  Modal._onEscape({ key: 'Escape' });
  check('Escape (user-initiated) invokes onClose', closedFlags.length === 1);
  check('onClose ran for the right modal', closedFlags[0] === 'bar');
}

console.log('\n=== TOTAL: ' + pass + ' passed, ' + fail + ' failed ===');
process.exit(fail > 0 ? 1 : 0);
