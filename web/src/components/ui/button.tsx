import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';

import { cn } from '@/lib/utils';

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-[16px] text-sm font-bold transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      variant: {
        primary: 'bg-[hsl(var(--primary))] text-white shadow-[0_8px_30px_rgba(102,204,255,0.4)] hover:-translate-y-0.5 hover:bg-[#4DB8FF]',
        secondary: 'border border-white/60 bg-white/70 text-foreground shadow-[0_4px_20px_rgba(102,204,255,0.15)] backdrop-blur-md hover:-translate-y-0.5 hover:border-[#66CCFF]/30 hover:bg-white/85',
        ghost: 'text-[hsl(var(--muted-foreground))] hover:bg-white/60 hover:text-foreground'
      },
      size: {
        default: 'h-11 px-5 py-2.5',
        lg: 'h-14 px-8 text-base',
        sm: 'h-9 rounded-[12px] px-3 text-xs'
      }
    },
    defaultVariants: {
      variant: 'primary',
      size: 'default'
    }
  }
);

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(({ className, variant, size, ...props }, ref) => (
  <button ref={ref} className={cn(buttonVariants({ variant, size, className }))} {...props} />
));
Button.displayName = 'Button';

export { Button, buttonVariants };
