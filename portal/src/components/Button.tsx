import Link from "next/link";
import type { ButtonHTMLAttributes, ReactNode } from "react";
import styles from "./Button.module.css";
import { Icon, type IconName } from "./Icon";

export type ButtonVariant = "default" | "primary" | "danger" | "dangerFilled" | "quiet";

type Common = {
  variant?: ButtonVariant;
  size?: "small";
  full?: boolean;
  icon?: IconName;
  /** Only the icon shows; `children` becomes its name for screen readers. */
  iconOnly?: boolean;
  children: ReactNode;
  className?: string;
};

/** Class names for a button, for the rare element that must look like one (a <summary>, a label). */
export function buttonClass({ variant = "default", size, full, iconOnly, className }: Omit<Common, "children" | "icon">): string {
  return [styles.btn, variant !== "default" && styles[variant], size && styles[size], full && styles.full, iconOnly && styles.iconOnly, className].filter(Boolean).join(" ");
}

/**
 * A button, or a link that looks like one when `href` is given. Neutral by
 * default; use variant="primary" for the one main action on a screen.
 */
export function Button(props: Common & { href: string } & { target?: string }): React.JSX.Element;
export function Button(props: Common & { href?: undefined } & ButtonHTMLAttributes<HTMLButtonElement>): React.JSX.Element;
export function Button({ variant, size, full, icon, iconOnly, children, className, href, ...rest }: Common & { href?: string } & ButtonHTMLAttributes<HTMLButtonElement> & { target?: string }) {
  const cls = buttonClass({ variant, size, full, iconOnly, className });
  const inner = (
    <>
      {icon && <Icon name={icon} />}
      {iconOnly ? <span className="sr-only">{children}</span> : children}
    </>
  );
  if (href !== undefined) {
    return (
      <Link href={href} className={cls} target={rest.target}>
        {inner}
      </Link>
    );
  }
  return (
    <button type="button" {...rest} className={cls}>
      {inner}
    </button>
  );
}
