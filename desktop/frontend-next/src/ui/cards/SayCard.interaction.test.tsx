// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SayCard } from "./SayCard";
import { FOLD_DEFAULTS, setFoldModes } from "../../state/prefs";

afterEach(() => {
  cleanup();
  setFoldModes(FOLD_DEFAULTS);
  vi.restoreAllMocks();
});

describe("reply menus", () => {
  const item = { t: "say" as const, id: "reply", text: "answer", done: true };

  it("keeps both menus visible as the reply moves past the top of the scroller", async () => {
    let triggerTop = 125;
    vi.spyOn(HTMLElement.prototype, "offsetHeight", "get").mockImplementation(function (this: HTMLElement) {
      if (!this.classList.contains("acts-pop")) return 0;
      return this.style.maxHeight ? Math.min(120, parseFloat(this.style.maxHeight)) : 120;
    });
    vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(function (this: Element) {
      if (this.hasAttribute("data-pane")) return new DOMRect(0, 100, 600, 400);
      if (this.matches('[data-action="reply.retry"], [data-action="reply.more"]')) return new DOMRect(40, triggerTop, 30, 30);
      if (this.classList.contains("acts-pop")) return new DOMRect(0, 0, 200, (this as HTMLElement).offsetHeight);
      return new DOMRect();
    });
    const reply = { onQuote: vi.fn(), onRegenerate: vi.fn() };
    const { container } = render(<div data-pane="flow"><SayCard item={item} reply={reply} /></div>);
    await userEvent.click(container.querySelector('[data-action="reply.retry"]') as HTMLElement);
    const pop = screen.getByRole("menu");
    expect(pop.parentElement).toBe(document.body);
    expect(pop.getAttribute("style")).toContain("top: 160px");

    triggerTop = 360;
    fireEvent.scroll(container.firstElementChild as HTMLElement);
    expect(pop.getAttribute("style")).toContain("top: 235px");

    triggerTop = 460;
    await userEvent.click(container.querySelector('[data-action="reply.more"]') as HTMLElement);
    expect(screen.getByRole("menu").getAttribute("style")).toContain("top: 335px");
    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByRole("menu")).toBeNull();

    triggerTop = 125;
    await userEvent.click(container.querySelector('[data-action="reply.retry"]') as HTMLElement);
    await userEvent.click(screen.getByRole("menuitem", { name: /按当前配置重试/ }));
    expect(reply.onRegenerate).toHaveBeenCalledOnce();
    expect(screen.queryByRole("menu")).toBeNull();
  });
});

describe("completed reasoning", () => {
  it("starts folded and opens on click", async () => {
    const { container } = render(<SayCard item={{ t: "say", id: "s", text: "answer", reasoning: "reason", done: true }} />);
    const details = container.querySelector("details") as HTMLDetailsElement;
    expect(details.open).toBe(false);
    await userEvent.click(screen.getByText(/思考/));
    expect(details.open).toBe(true);
  });
});

describe("the folding preference", () => {
  const item = { t: "say" as const, id: "s", text: "answer", reasoning: "reason", done: true };
  const details = (el: HTMLElement) => el.querySelector("details") as HTMLDetailsElement;

  it("opens thinking by default once it is set to open", () => {
    setFoldModes({ thinking: "open" });
    expect(details(render(<SayCard item={item} />).container).open).toBe(true);
  });

  it("moves an untouched block and leaves a clicked one alone", async () => {
    const a = details(render(<SayCard item={item} />).container);
    const b = details(render(<SayCard item={{ ...item, id: "t" }} />).container);
    await userEvent.click(b.querySelector("summary") as HTMLElement);
    await userEvent.click(b.querySelector("summary") as HTMLElement);
    expect(b.open).toBe(false);
    act(() => setFoldModes({ thinking: "open" }));
    expect(a.open).toBe(true);
    expect(b.open).toBe(false);
  });

  it("under live, opens while thinking streams and folds once the answer starts", () => {
    window.matchMedia ??= (() => ({ matches: true, addEventListener() {}, removeEventListener() {} })) as unknown as typeof window.matchMedia;
    setFoldModes({ thinking: "live" });
    const streaming = { t: "say" as const, id: "l", text: "", reasoning: "reason", done: false };
    const { container, rerender } = render(<SayCard item={streaming} />);
    expect(details(container).open).toBe(true);
    rerender(<SayCard item={{ ...streaming, text: "answer" }} />);
    expect(details(container).open).toBe(false);
  });
});
