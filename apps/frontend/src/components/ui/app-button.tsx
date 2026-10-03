import { forwardRef } from "react";
import type { ButtonProps } from "antd";
import { Button } from "./button";
import { Spinner } from "./spinner";
import { cn } from "cn";

/** Presentation adapter: preserves existing htmlType, loading and event handlers. */
export const AppButton = forwardRef<HTMLButtonElement, ButtonProps>(
  function AppButton(
    {
      type = "default",
      htmlType = "button",
      danger,
      ghost,
      block,
      loading,
      size,
      icon,
      iconPosition,
      shape,
      className,
      rootClassName,
      children,
      disabled,
      href,
      target,
      ...props
    },
    ref,
  ) {
    const variant =
      type === "primary"
        ? danger
          ? "destructive"
          : "default"
        : type === "link"
          ? "link"
          : type === "text" || ghost
            ? "ghost"
            : "outline";
    const content = (
      <>
        {loading ? (
          <Spinner aria-hidden="true" />
        ) : (
          iconPosition !== "end" && icon
        )}
        {children}
        {!loading && iconPosition === "end" && icon}
      </>
    );
    const classes = cn(
      "ds-compat-button",
      block && "w-full",
      shape === "circle" && "rounded-full",
      danger && type !== "primary" && "ds-danger-outline",
      className,
      rootClassName,
    );
    if (href)
      return (
        <Button
          asChild
          variant={variant}
          size={size === "small" ? "sm" : size === "large" ? "lg" : "default"}
          className={classes}
        >
          <a
            href={disabled || loading ? undefined : href}
            target={target}
            aria-disabled={disabled || Boolean(loading)}
          >
            {content}
          </a>
        </Button>
      );
    return (
      <Button
        {...props}
        ref={ref}
        type={htmlType}
        variant={variant}
        size={size === "small" ? "sm" : size === "large" ? "lg" : "default"}
        className={classes}
        disabled={disabled || Boolean(loading)}
        aria-busy={Boolean(loading)}
      >
        {content}
      </Button>
    );
  },
);
