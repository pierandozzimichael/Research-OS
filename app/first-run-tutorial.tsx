"use client";

import * as React from "react";
import styles from "./first-run-tutorial.module.css";

export type FirstRunTutorialStep = {
  id: string;
  title: string;
  description: string;
  actionLabel?: string;
};

export const defaultFirstRunTutorialSteps: FirstRunTutorialStep[] = [
  {
    id: "map",
    title: "Start with the map",
    description: "See how papers, claims, ideas, hypotheses, experiments, and results fit together in one evidence workspace.",
    actionLabel: "Select a record",
  },
  {
    id: "path",
    title: "Follow an evidence path",
    description: "Open the nearby connections around the selected record. The current view reveals relationships without changing the canonical files.",
    actionLabel: "Open nearby connections",
  },
  {
    id: "agent",
    title: "Ask your AI where you are",
    description: "Your configured agent can open the relevant record or connection in the workspace while the canonical files remain the source of truth.",
    actionLabel: "Open assistant",
  },
  {
    id: "share",
    title: "Share a focused selection",
    description: "Open the sharing tools to export a focused neighborhood or project overview as Markdown, HTML, or JSON.",
    actionLabel: "See sharing tools",
  },
  {
    id: "portable",
    title: "Keep the science portable",
    description: "Markdown records stay canonical, private material stays protected, and the UI remains a view and editor rather than a locked database.",
  },
];

export type FirstRunTutorialProps = {
  steps?: FirstRunTutorialStep[];
  storageKey?: string;
  onAction?: (step: FirstRunTutorialStep) => void;
  onDismiss?: () => void;
};

const defaultStorageKey = "research-os:first-run-tutorial:dismissed";
const noStoreSubscribe = () => () => {};
const clientReady = () => true;
const serverNotReady = () => false;

function readDismissed(storageKey: string): boolean {
  try {
    return window.localStorage.getItem(storageKey) === "1";
  } catch {
    return false;
  }
}

export function FirstRunTutorial({
  onAction,
  onDismiss,
  steps = defaultFirstRunTutorialSteps,
  storageKey = defaultStorageKey,
}: FirstRunTutorialProps) {
  const closeRef = React.useRef<HTMLButtonElement>(null);
  // Keep the server and first client render identical; localStorage is read
  // through the external-store contract so hydration never flashes a modal.
  const hydrated = React.useSyncExternalStore(noStoreSubscribe, clientReady, serverNotReady);
  const getDismissed = React.useCallback(() => readDismissed(storageKey), [storageKey]);
  const storedDismissed = React.useSyncExternalStore(noStoreSubscribe, getDismissed, () => true);
  const [dismissedOverride, setDismissedOverride] = React.useState<boolean | null>(null);
  const dismissed = dismissedOverride ?? storedDismissed;
  const [stepIndex, setStepIndex] = React.useState(0);

  const dismiss = React.useCallback(() => {
    try {
      window.localStorage.setItem(storageKey, "1");
    } catch {
      // Dismissal is best-effort; the control still closes for this session.
    }
    setDismissedOverride(true);
    onDismiss?.();
  }, [onDismiss, storageKey]);

  React.useEffect(() => {
    if (dismissed) return;
    closeRef.current?.focus();
  }, [dismissed]);

  React.useEffect(() => {
    if (dismissed) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const typing = target && ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName);
      if (event.key === "Escape" && !typing) dismiss();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [dismiss, dismissed]);

  if (!hydrated || dismissed || !steps.length) return null;

  const step = steps[Math.min(stepIndex, steps.length - 1)];
  const isLast = stepIndex === steps.length - 1;

  function handleAction() {
    onAction?.(step);
    if (!isLast) setStepIndex((current) => current + 1);
    else dismiss();
  }

  return (
    <section className={styles.root} aria-labelledby="first-run-tutorial-title">
      <header className={styles.header}>
        <div>
          <p className={styles.eyebrow}>A quick orientation</p>
          <h2 className={styles.title} id="first-run-tutorial-title">Research OS in {steps.length} steps</h2>
        </div>
        <button ref={closeRef} className={styles.close} type="button" onClick={dismiss} aria-label="Close tutorial">
          <span aria-hidden="true">×</span>
        </button>
      </header>

      <nav className={styles.progress} aria-label="Tutorial steps">
        {steps.map((item, index) => (
          <button
            className={styles.progressDot}
            data-active={index === stepIndex}
            key={item.id}
            type="button"
            onClick={() => setStepIndex(index)}
            aria-label={`Go to step ${index + 1}: ${item.title}`}
            aria-current={index === stepIndex ? "step" : undefined}
          />
        ))}
      </nav>

      <div className={styles.body}>
        <p className={styles.stepLabel}>Step {stepIndex + 1} of {steps.length}</p>
        <h3 className={styles.stepTitle}>{step.title}</h3>
        <p className={styles.description}>{step.description}</p>
        <div className={styles.actions}>
          <button className={styles.button} type="button" onClick={dismiss}>Skip for now</button>
          <div className={styles.actionGroup}>
            {stepIndex > 0 ? (
              <button className={styles.button} type="button" onClick={() => setStepIndex((current) => current - 1)}>Back</button>
            ) : null}
            <button className={`${styles.button} ${styles.primary}`} type="button" onClick={handleAction}>
              {step.actionLabel ?? (isLast ? "Done" : "Next")}
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
