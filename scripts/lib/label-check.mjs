/**
 * The measurement the label check is made of.
 *
 * It is kept here, apart from the script that runs it, so that the
 * measurement can be exercised on its own — a check that has never been
 * shown to catch the thing it is looking for is not a check.
 *
 * The question it answers, for every link and button on the page: does
 * the label fit inside the control it is in?
 */
export const LABEL_CHECK = `(() => {
  const out = [];

  // The width the text would need, measured on the text that is laid out
  // in the flow.
  //
  // Two things are being avoided here. A button with a decoration inside
  // it — a sheen that slides across on hover, say — is not text, and
  // counting the decoration as a label is how a perfectly good button
  // gets reported as overflowing. And a label that wraps onto a second
  // line is not overflowing: it is two lines, each of which fits. So the
  // width taken is the widest single line, not the sum of them all.
  const textWidth = (el) => {
    const range = document.createRange();
    let left = null;
    let right = null;
    const add = (rect) => {
      if (rect.width === 0 && rect.height === 0) return;
      left = left === null ? rect.left : Math.min(left, rect.left);
      right = right === null ? rect.right : Math.max(right, rect.right);
    };
    for (const node of el.childNodes) {
      if (node.nodeType === Node.TEXT_NODE) {
        range.selectNodeContents(node);
        add(range.getBoundingClientRect());
        continue;
      }
      if (node.nodeType !== Node.ELEMENT_NODE) continue;
      const cs = getComputedStyle(node);
      if (cs.position === 'absolute' || cs.position === 'fixed') continue;
      range.selectNodeContents(node);
      add(range.getBoundingClientRect());
    }
    return left === null ? 0 : right - left;
  };

  for (const el of document.querySelectorAll('a, button')) {
    const r = el.getBoundingClientRect();
    if (r.width === 0) continue;
    const textW = textWidth(el);
    if (textW === 0) continue;
    const cs = getComputedStyle(el);
    const padX = parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight);
    const inner = r.width - padX;
    if (textW > inner + 1) {
      out.push({
        text: (el.textContent || '').trim().slice(0, 40),
        textW: Math.round(textW),
        inner: Math.round(inner),
        w: Math.round(r.width),
        // The label is wider than the box it is in. Either the box scrolls
        // — so the label is cut off and has to be scrolled to read — or it
        // does not, so the label spills out over whatever is beside it.
        clipped: el.scrollWidth > el.clientWidth + 1,
        cls: (typeof el.className === 'string' ? el.className : '').trim().split(/\\s+/).slice(0,4).join('.'),
      });
    }
  }
  return out;
})()`;
