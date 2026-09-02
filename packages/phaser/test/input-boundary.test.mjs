import assert from "node:assert/strict";
import test from "node:test";

import { bindDesignerInputBoundary } from "../dist/designer-support.js";

const blockedEventTypes = [
  "mousedown",
  "mouseup",
  "touchstart",
  "touchend",
  "touchcancel",
  "click"
];

test("designer input boundaries stop game-facing events without preventing UI behavior", () => {
  const root = new EventTarget();
  const toggle = new EventTarget();
  const unbind = bindDesignerInputBoundary(root, toggle);

  for (const target of [root, toggle]) {
    for (const eventType of blockedEventTypes) {
      let uiHandlerCalls = 0;
      target.addEventListener(eventType, () => {
        uiHandlerCalls += 1;
      }, { once: true });

      const event = new Event(eventType, { bubbles: true, cancelable: true });
      assert.equal(target.dispatchEvent(event), true);
      assert.equal(event.cancelBubble, true, `${eventType} should not escape the boundary`);
      assert.equal(event.defaultPrevented, false, `${eventType} should retain its default behavior`);
      assert.equal(uiHandlerCalls, 1, `${eventType} should still reach designer handlers`);
    }
  }

  unbind();
  unbind();

  for (const target of [root, toggle]) {
    for (const eventType of blockedEventTypes) {
      const event = new Event(eventType, { bubbles: true, cancelable: true });
      assert.equal(target.dispatchEvent(event), true);
      assert.equal(event.cancelBubble, false, `${eventType} should be restored after unbinding`);
      assert.equal(event.defaultPrevented, false);
    }
  }
});

test("designer input boundaries leave unrelated events alone", () => {
  const root = new EventTarget();
  const unbind = bindDesignerInputBoundary(root);
  const event = new Event("input", { bubbles: true, cancelable: true });

  assert.equal(root.dispatchEvent(event), true);
  assert.equal(event.cancelBubble, false);
  assert.equal(event.defaultPrevented, false);

  unbind();
});
