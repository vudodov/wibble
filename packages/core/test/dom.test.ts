import { describe, expect, it } from "vitest";
import {
  conditional,
  createContext,
  createRef,
  createScope,
  createText,
  keyedEach,
  mount,
  onMount,
  provide,
  renderComponent,
  signal,
  useContext,
  bindRef,
  type Component
} from "../src";

class TestNode {
  parentNode: TestNode | null = null;
  childNodes: TestNode[] = [];

  append(...nodes: Array<TestNode | string>): void {
    for (const node of nodes) {
      const next = typeof node === "string" ? new TestText(node) : node;
      next.parentNode?.removeChild(next);
      next.parentNode = this;
      this.childNodes.push(next);
    }
  }

  insertBefore(node: TestNode, before: TestNode | null): void {
    node.parentNode?.removeChild(node);
    node.parentNode = this;
    const index = before ? this.childNodes.indexOf(before) : -1;
    if (index < 0) {
      this.childNodes.push(node);
    } else {
      this.childNodes.splice(index, 0, node);
    }
  }

  removeChild(node: TestNode): TestNode {
    const index = this.childNodes.indexOf(node);
    if (index >= 0) {
      this.childNodes.splice(index, 1);
      node.parentNode = null;
    }
    return node;
  }

  replaceChildren(...nodes: Array<TestNode | string>): void {
    for (const child of this.childNodes) {
      child.parentNode = null;
    }
    this.childNodes = [];
    this.append(...nodes);
  }

  get textContent(): string {
    return this.childNodes.map((child) => child.textContent).join("");
  }

  set textContent(value: string) {
    this.replaceChildren(new TestText(value));
  }

  get isConnected(): boolean {
    return Boolean(this.parentNode?.isConnected);
  }
}

class TestText extends TestNode {
  constructor(private value = "") {
    super();
  }

  override get textContent(): string {
    return this.value;
  }

  override set textContent(value: string) {
    this.value = value;
  }
}

class TestElement extends TestNode {
  readonly attributes = new Map<string, string>();

  setAttribute(name: string, value: string): void {
    this.attributes.set(name, value);
  }

  removeAttribute(name: string): void {
    this.attributes.delete(name);
  }

  override get isConnected(): boolean {
    return this.parentNode == null || super.isConnected;
  }
}

function installDocument(): void {
  globalThis.document = {
    createComment: (value: string) => new TestText(value),
    createDocumentFragment: () => new TestNode(),
    createElement: () => new TestElement(),
    createTextNode: (value: string) => new TestText(value)
  } as unknown as Document;
}

async function tick(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

describe("dom helpers", () => {
  installDocument();

  it("clears refs when their owning scope is disposed", () => {
    const scope = createScope();
    const ref = createRef<Element>();
    const element = {} as Element;

    scope.run(() => bindRef(ref, element));

    expect(ref.current).toBe(element);
    scope.dispose();
    expect(ref.current).toBeUndefined();
  });

  it("runs mount work after the current microtask and cleans it up with scope disposal", async () => {
    const scope = createScope();
    const events: string[] = [];

    scope.run(() => {
      onMount(() => {
        events.push("mounted");
        return () => events.push("disposed");
      });
    });

    expect(events).toEqual([]);
    await Promise.resolve();
    expect(events).toEqual(["mounted"]);
    scope.dispose();
    expect(events).toEqual(["mounted", "disposed"]);
  });

  it("updates keyed rows when a stable key receives a new item value", async () => {
    const parent = document.createElement("div");
    const scope = createScope();
    const rows = signal([{ id: "a", label: "Alpha" }]);

    scope.run(() => {
      keyedEach(
        parent,
        () => rows.get(),
        (row) => row.id,
        (row) => createText(() => row.label)
      );
    });

    expect(parent.textContent).toContain("Alpha");
    rows.set([{ id: "a", label: "Beta" }]);
    await tick();

    expect(parent.textContent).toContain("Beta");
    expect(parent.textContent).not.toContain("Alpha");
    scope.dispose();
  });

  it("keeps context providers scoped to their rendered component subtree", () => {
    const token = createContext<string>("test");
    const Child: Component = () => createText(() => useContext(token));
    const ProviderChild: Component = () => {
      provide(token, "inside");
      return renderComponent(Child, {});
    };
    const OutsideChild: Component = () => {
      try {
        useContext(token);
        return createText("leaked");
      } catch {
        return createText("outside");
      }
    };
    const App: Component = () => [
      ...renderComponent(ProviderChild, {}),
      document.createTextNode("|"),
      ...renderComponent(OutsideChild, {})
    ];
    const root = document.createElement("main");

    const handle = mount(App, root, {});

    expect(root.textContent).toBe("inside|outside");
    handle.dispose();
  });

  it("preserves context for delayed conditional renders", async () => {
    const token = createContext<string>("delayed");
    const ready = signal(false);
    const Child: Component = () => createText(() => useContext(token));
    const App: Component = () => {
      provide(token, "ready");
      const parent = document.createElement("section");
      conditional(parent, () => ready.get() ? renderComponent(Child, {}) : createText("waiting"));
      return parent;
    };
    const root = document.createElement("main");

    const handle = mount(App, root, {});
    expect(root.textContent).toContain("waiting");
    ready.set(true);
    await tick();

    expect(root.textContent).toContain("ready");
    handle.dispose();
  });
});
