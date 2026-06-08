import { cn } from '@/lib/utils';

interface BoxProps extends React.HTMLAttributes<HTMLDivElement> {}

export function Box({ className, ...props }: BoxProps) {
  return (
    <div className={cn('flex items-center justify-center', className)} {...props} />
  );
}

// @author Kiritohuxing
