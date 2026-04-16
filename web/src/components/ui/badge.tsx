import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';

import { cn } from '@/lib/utils';

const badgeVariants = cva('inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-bold transition-colors', {
  variants: {
    variant: {
      primary: 'bg-[#F0F8FF] text-[#66CCFF]',
      accent: 'bg-[#FFF0F3] text-[#FF8FA8]',
      neutral: 'bg-white/75 text-[#5D6D7E] border border-white/60'
    }
  },
  defaultVariants: {
    variant: 'primary'
  }
});

export interface BadgeProps extends React.HTMLAttributes<HTMLDivElement>, VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
