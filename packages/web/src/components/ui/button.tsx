import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

/**
 * Pill is the only CTA shape. Hierarchy is carried by surface color, not by
 * elevation. The five-variant system:
 *
 *   default     — the navy pill, primary action everywhere.
 *   outline     — white pill + navy hairline, secondary action paired with default.
 *   secondary   — warm muted pill, tertiary action when neither popping nor disappearing.
 *   ghost       — transparent until hover, used inside dense surfaces.
 *   promo       — magenta accent, single-shot per page (FAB, sidebar CTA).
 *   destructive — red pill, irreversible actions only.
 *   link        — text-only with underline, rare.
 */
const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-full font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-40 active:scale-[0.98] [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:bg-primary/90",
        destructive:
          "bg-destructive text-destructive-foreground hover:bg-destructive/90",
        outline:
          "border border-foreground/15 bg-card text-foreground hover:bg-accent",
        secondary: "bg-secondary text-secondary-foreground hover:bg-accent",
        ghost: "text-foreground hover:bg-accent",
        promo: "bg-magenta text-white hover:bg-magenta/90",
        link: "rounded-none text-foreground underline-offset-4 hover:underline",
      },
      size: {
        default: "h-10 px-5 text-[15px]",
        sm: "h-9 px-4 text-sm",
        lg: "h-12 px-7 text-base",
        icon: "size-10",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button"
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    )
  }
)
Button.displayName = "Button"

export { Button, buttonVariants }
