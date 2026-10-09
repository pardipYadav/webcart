"use client";

import * as CheckboxPrimitive from "@radix-ui/react-checkbox";
import { Check, Minus } from "lucide-react";
import { cn } from "@/lib/utils";

function Checkbox({ className, ...props }: React.ComponentProps<typeof CheckboxPrimitive.Root>) {
  return (
    <CheckboxPrimitive.Root
      className={cn(
        "group flex size-6 shrink-0 items-center justify-center rounded-md border-2 border-forest/25 bg-white text-cream focus-visible:ring-2 focus-visible:ring-leaf focus-visible:outline-none data-[state=checked]:border-leaf data-[state=checked]:bg-leaf data-[state=indeterminate]:border-leaf data-[state=indeterminate]:bg-leaf",
        className,
      )}
      {...props}
    >
      <CheckboxPrimitive.Indicator>
        <Check className="size-4 group-data-[state=indeterminate]:hidden" strokeWidth={3} />
        <Minus className="hidden size-4 group-data-[state=indeterminate]:block" strokeWidth={3} />
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  );
}

export { Checkbox };
