import { afterEach, expect, it, vi } from "vitest";
import { navigateMessage } from "./messageTransition.js";

afterEach(() => {
  delete document.startViewTransition;
  delete document.documentElement.dataset.messageDirection;
  vi.unstubAllGlobals();
});

it.each(["unsupported", "reduced"])("navigates immediately when transitions are %s", mode => {
  const navigate = vi.fn();
  const start = vi.fn();
  if (mode === "reduced") document.startViewTransition = start;
  vi.stubGlobal("matchMedia", () => ({ matches: mode !== "reduced" }));
  navigateMessage(navigate, "/review");
  expect(navigate).toHaveBeenCalledExactlyOnceWith("/review", { state: { messageDirection: "forward", messageTransition: false } });
  expect(start).not.toHaveBeenCalled();
});

it.each([false, true])("keeps navigation single when the browser throws after update = %s", afterUpdate => {
  const navigate = vi.fn();
  vi.stubGlobal("matchMedia", () => ({ matches: true }));
  document.startViewTransition = update => {
    if (afterUpdate) update();
    throw new Error("Transition unavailable");
  };
  navigateMessage(navigate, "/write");
  expect(navigate).toHaveBeenCalledTimes(1);
  expect(navigate.mock.calls[0][0]).toBe("/write");
  expect(document.documentElement).not.toHaveAttribute("data-message-direction");
});

it("keeps the latest transition active when an interrupted transition finishes", async () => {
  const navigate = vi.fn();
  vi.stubGlobal("matchMedia", () => ({ matches: true }));
  const transitions = [];
  document.startViewTransition = update => {
    update();
    let finish;
    const transition = { ready: Promise.resolve(), finished: new Promise(resolve => { finish = resolve; }), skipTransition: vi.fn(), finish: () => finish() };
    transitions.push(transition);
    return transition;
  };
  navigateMessage(navigate, "/review");
  navigateMessage(navigate, "/write");
  expect(transitions[0].skipTransition).toHaveBeenCalledTimes(1);
  transitions[0].finish();
  await new Promise(resolve => queueMicrotask(resolve));
  expect(document.documentElement.dataset.messageDirection).toBe("backward");
  transitions[1].finish();
  await new Promise(resolve => queueMicrotask(resolve));
  expect(document.documentElement).not.toHaveAttribute("data-message-direction");
  expect(navigate).toHaveBeenCalledTimes(2);
});

it("keeps the route update when the browser skips snapshot animation", async () => {
  const navigate = vi.fn();
  vi.stubGlobal("matchMedia", () => ({ matches: true }));
  document.startViewTransition = update => {
    update();
    return { ready: Promise.reject(new Error("Snapshot skipped")), finished: Promise.resolve() };
  };
  navigateMessage(navigate, "/review");
  await new Promise(resolve => queueMicrotask(resolve));
  expect(navigate).toHaveBeenCalledTimes(1);
  expect(document.documentElement).not.toHaveAttribute("data-message-direction");
});
