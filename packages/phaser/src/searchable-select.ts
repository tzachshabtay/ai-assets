/** Searchable dropdown backed by the existing select and its change event. */
export function searchableSelect(select: HTMLSelectElement, label: string) {
  const doc = select.ownerDocument;
  const root = doc.createElement('div'); root.style.cssText = 'position:relative;min-width:0;width:100%';
  const trigger = doc.createElement('button'); trigger.type = 'button';
  trigger.setAttribute('aria-label', label); trigger.setAttribute('aria-haspopup', 'listbox');
  trigger.style.cssText = 'width:100%;text-align:left;white-space:normal;overflow-wrap:anywhere';
  const panel = doc.createElement('div'); panel.hidden = true;
  panel.style.cssText = 'position:absolute;top:100%;left:0;right:0;z-index:20;background:#20232c;border:1px solid #626978;border-radius:6px;padding:8px;box-shadow:0 8px 24px #0008';
  const search = doc.createElement('input'); search.type = 'search'; search.placeholder = 'Search spoken text…';
  search.setAttribute('aria-label', `Search ${label.toLowerCase()}`);
  search.style.cssText = 'width:100%;box-sizing:border-box;margin-bottom:6px';
  const list = doc.createElement('div'); list.id = `voice-lines-${crypto.randomUUID()}`;
  list.setAttribute('role', 'listbox'); list.setAttribute('aria-label', label);
  list.style.cssText = 'max-height:240px;overflow:auto;display:grid;gap:3px';
  trigger.setAttribute('aria-controls', list.id);
  search.setAttribute('role', 'combobox'); search.setAttribute('aria-controls', list.id); search.setAttribute('aria-autocomplete', 'list');
  const empty = doc.createElement('div'); empty.textContent = 'No matching lines.'; empty.setAttribute('role', 'status');
  panel.append(search, list, empty); root.append(trigger, panel);
  select.after(root);
  let enabled = false, active = -1;
  let matches: HTMLOptionElement[] = [], buttons: HTMLButtonElement[] = [];
  const close = (focus = false) => {
    panel.hidden = true; trigger.setAttribute('aria-expanded', 'false'); search.setAttribute('aria-expanded', 'false');
    if (focus) trigger.focus();
  };
  const highlight = (index: number) => {
    active = index;
    buttons.forEach((button, i) => { button.style.background = i === active ? '#414958' : '#292d37'; });
    const button = buttons[active];
    if (button) { search.setAttribute('aria-activedescendant', button.id); button.scrollIntoView({ block: 'nearest' }); }
    else search.removeAttribute('aria-activedescendant');
  };
  const choose = (option: HTMLOptionElement) => {
    select.value = option.value; close(true); sync();
    select.dispatchEvent(new Event('change', { bubbles: true }));
  };
  const filter = () => {
    const query = search.value.trim().toLocaleLowerCase();
    matches = [...select.options].filter(option => !option.disabled && !option.hidden &&
      `${option.textContent} ${option.dataset.searchText ?? ''}`.toLocaleLowerCase().includes(query));
    list.replaceChildren(); buttons = matches.map((option, index) => {
      const button = doc.createElement('button'); button.type = 'button'; button.tabIndex = -1;
      button.id = `${list.id}-${index}`; button.setAttribute('role', 'option');
      button.setAttribute('aria-selected', String(option.value === select.value));
      button.textContent = option.dataset.searchText || option.textContent;
      button.style.cssText = 'display:block;width:100%;text-align:left;white-space:normal;overflow-wrap:anywhere;padding:8px;color:#f1f3f7;border:0;border-radius:4px';
      button.onpointermove = () => highlight(index);
      button.onclick = event => { event.preventDefault(); event.stopPropagation(); choose(option); };
      list.append(button); return button;
    });
    empty.hidden = matches.length > 0;
    highlight(matches.length ? Math.max(0, matches.findIndex(option => option.value === select.value)) : -1);
  };
  const sync = () => {
    const selected = select.selectedOptions[0]; trigger.textContent = `${selected?.dataset.searchText || selected?.textContent || 'Choose a line'} ▾`;
    trigger.disabled = select.disabled; if (select.disabled) close();
  };
  const open = () => {
    if (!enabled || select.disabled) return;
    search.value = ''; panel.hidden = false;
    trigger.setAttribute('aria-expanded', 'true'); search.setAttribute('aria-expanded', 'true');
    filter(); search.focus();
  };
  trigger.onclick = event => { event.preventDefault(); panel.hidden ? open() : close(); };
  trigger.onkeydown = event => { if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); open(); } };
  search.oninput = filter;
  panel.onkeydown = event => {
    if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(true); }
    else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault(); if (matches.length) highlight((active + (event.key === 'ArrowDown' ? 1 : -1) + matches.length) % matches.length);
    } else if (event.key === 'Enter') { event.preventDefault(); if (matches[active]) choose(matches[active]); }
  };
  const outside = (event: PointerEvent) => { if (!root.contains(event.target as Node)) close(); };
  root.addEventListener('focusout', event => { if (!root.contains(event.relatedTarget as Node | null)) close(); });
  doc.addEventListener('pointerdown', outside);
  select.addEventListener('change', sync);
  const observer = new MutationObserver(() => { sync(); if (!panel.hidden) filter(); });
  observer.observe(select, { childList: true, subtree: true, characterData: true, attributes: true });
  function setEnabled(value: boolean) { enabled = value; select.hidden = value; root.hidden = !value; close(); sync(); }
  setEnabled(false);
  return { setEnabled, destroy() { observer.disconnect(); doc.removeEventListener('pointerdown', outside); select.removeEventListener('change', sync); root.remove(); select.hidden = false; } };
}
