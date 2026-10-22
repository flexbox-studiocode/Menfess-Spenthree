import { flushSync } from "react-dom";

let activeTransition;

export function navigateMessage(navigate, to) {
  const direction = to === "/review" ? "forward" : "backward";
  const native = Boolean(document.startViewTransition && window.matchMedia?.("(prefers-reduced-motion: no-preference)").matches);
  let updated = false;
  const update = () => {
    if (updated) return;
    updated = true;
    flushSync(() => navigate(to, { state: { messageDirection: direction, messageTransition: native } }));
  };
  if (!native) {
    update();
    return;
  }
  activeTransition?.skipTransition();
  const root = document.documentElement;
  root.dataset.messageDirection = direction;
  try {
    const transition = document.startViewTransition(update);
    activeTransition = transition;
    transition.ready.catch(() => {});
    transition.finished.catch(() => {}).finally(() => {
      if (activeTransition === transition) {
        activeTransition = undefined;
        delete root.dataset.messageDirection;
      }
    });
  } catch {
    delete root.dataset.messageDirection;
    update();
  }
}
