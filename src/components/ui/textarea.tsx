import { cn } from "@/lib/utils";

function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      className={cn(
        "min-h-24 w-full rounded-2xl border border-line bg-white px-4 py-3 text-base text-forest outline-none placeholder:text-ink/40 focus-visible:ring-2 focus-visible:ring-leaf",
        className,
      )}
      {...props}
    />
  );
}

export { Textarea };
