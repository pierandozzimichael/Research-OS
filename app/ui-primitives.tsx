import * as React from "react";

function cx(...classes: Array<string | undefined | false>) {
  return classes.filter(Boolean).join(" ");
}

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  function Button({ className, variant = "primary", type = "button", ...props }, ref) {
    return (
      <button
        ref={ref}
        type={type}
        className={cx("ui-button", `ui-button--${variant}`, className)}
        {...props}
      />
    );
  },
);

export interface IconButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  /** A concise name for the action; it is required for accessible naming. */
  label: string;
}

export const IconButton = React.forwardRef<HTMLButtonElement, IconButtonProps>(
  function IconButton({ className, label, type = "button", ...props }, ref) {
    return (
      <button
        ref={ref}
        type={type}
        className={cx("ui-icon-button", className)}
        {...props}
        aria-label={label}
      />
    );
  },
);

export type StatusKind = "neutral" | "info" | "success" | "warning" | "danger";

export interface StatusBadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  text: string;
  status?: StatusKind;
}

export function StatusBadge({
  className,
  status = "neutral",
  text,
  ...props
}: StatusBadgeProps) {
  const marker = status === "success" ? "✓" : status === "warning" ? "!" : status === "danger" ? "×" : status === "info" ? "i" : "•";
  return (
    <span
      className={cx("ui-status-badge", `ui-status-badge--${status}`, className)}
      data-status={status}
      {...props}
    >
      <span className="ui-status-badge__marker" aria-hidden="true">{marker}</span>
      <span className="ui-status-badge__text">{text}</span>
    </span>
  );
}

export interface SectionHeaderProps extends Omit<React.HTMLAttributes<HTMLElement>, "title"> {
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
}

export function SectionHeader({
  actions,
  children,
  className,
  description,
  title,
  ...props
}: SectionHeaderProps) {
  return (
    <header className={cx("ui-section-header", className)} {...props}>
      <div className="ui-section-header__copy">
        <h2 className="ui-section-header__title">{title}</h2>
        {description ? <p className="ui-section-header__description">{description}</p> : null}
        {children}
      </div>
      {actions ? <div className="ui-section-header__actions">{actions}</div> : null}
    </header>
  );
}

export interface EmptyStateProps extends Omit<React.HTMLAttributes<HTMLElement>, "title"> {
  title: React.ReactNode;
  description?: React.ReactNode;
  action?: React.ReactNode;
}

export function EmptyState({
  action,
  className,
  description,
  title,
  ...props
}: EmptyStateProps) {
  return (
    <section className={cx("ui-empty-state", className)} {...props}>
      <h2 className="ui-empty-state__title">{title}</h2>
      {description ? <p className="ui-empty-state__description">{description}</p> : null}
      {action ? <div className="ui-empty-state__action">{action}</div> : null}
    </section>
  );
}

export type NoticeKind = "info" | "success" | "warning" | "danger";

export interface InlineNoticeProps extends Omit<React.HTMLAttributes<HTMLDivElement>, "title"> {
  children: React.ReactNode;
  kind?: NoticeKind;
  title?: React.ReactNode;
}

export function InlineNotice({
  children,
  className,
  kind = "info",
  title,
  ...props
}: InlineNoticeProps) {
  return (
    <div
      className={cx("ui-inline-notice", `ui-inline-notice--${kind}`, className)}
      role={kind === "danger" ? "alert" : "status"}
      {...props}
    >
      {title ? <strong className="ui-inline-notice__title">{title}</strong> : null}
      <span className="ui-inline-notice__content">{children}</span>
    </div>
  );
}

export interface ProgressStatusProps extends React.HTMLAttributes<HTMLDivElement> {
  label: string;
  detail?: React.ReactNode;
  value?: number;
  max?: number;
  onCancel?: () => void;
}

export function ProgressStatus({
  className,
  detail,
  label,
  max = 100,
  onCancel,
  value,
  ...props
}: ProgressStatusProps) {
  return (
    <div className={cx("ui-progress-status", className)} role="status" aria-live="polite" {...props}>
      <div className="ui-progress-status__header">
        <span className="ui-progress-status__label">{label}</span>
        {onCancel ? <Button variant="ghost" className="ui-progress-status__cancel" onClick={onCancel}>Stop</Button> : null}
      </div>
      <progress className="ui-progress-status__bar" value={value} max={max} aria-label={label} />
      {detail ? <span className="ui-progress-status__detail">{detail}</span> : null}
    </div>
  );
}

Button.displayName = "Button";
IconButton.displayName = "IconButton";
