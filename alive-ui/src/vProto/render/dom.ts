import type { Node, Patch } from '../protocol/types';
import type { Store } from '../state/store';

const TAGS: Record<string, string> = {
  screen: 'section', group: 'div', obj: 'button', txt: 'p', input: 'input',
};

function sync(el: HTMLElement, n: Node) {
  for (const a of Array.from(el.attributes)) {
    if (a.name.startsWith('data-p-') && !(a.name.slice(7) in n.props)) el.removeAttribute(a.name);
  }
  for (const [k, v] of Object.entries(n.props)) el.setAttribute(`data-p-${k}`, v);

  // leaf content only for now; containers keep their children
  if (n.kind === 'txt') el.textContent = n.props.content ?? '';
  else if (n.kind === 'obj') el.textContent = n.props.label ?? '';
  else if (n.kind === 'input') (el as HTMLInputElement).placeholder = n.props.placeholder ?? '';
}

export class DomRenderer {
  private els = new Map<string, HTMLElement>();

constructor(private root: HTMLElement, private store: Store, onEvent: (line: string) => void) {
  store.subscribe((p) => this.patch(p));

  root.addEventListener('click', (e) => {
    const el = (e.target as HTMLElement).closest<HTMLElement>('[data-nid]');
    if (el && el.dataset.kind === 'obj') onEvent(`@click ${el.dataset.nid}`);
  });

  root.addEventListener('input', (e) => {
    const t = e.target as HTMLInputElement;
    const el = t.closest<HTMLElement>('[data-nid]');
    if (el) this.store.apply({ t: 'set', id: el.dataset.nid!, props: { value: t.value } });
  });
}

  private patch(p: Patch) {
    if (p.t === 'create') {
      const el = document.createElement(TAGS[p.node.kind] ?? 'div');
      el.dataset.nid = p.node.id;
      el.dataset.kind = p.node.kind;
      sync(el, p.node);
      this.els.set(p.node.id, el);
      (p.node.parent ? this.els.get(p.node.parent)! : this.root).append(el);
    } else if (p.t === 'update') {
      const el = this.els.get(p.node.id);
      if (el) sync(el, p.node);
    } else {
      this.els.get(p.id)?.remove();
      for (const id of p.removed) this.els.delete(id);
    }
  }
}
