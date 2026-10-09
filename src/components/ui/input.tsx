import { cn } from "@/lib/utils";

function Input({ className, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      className={cn(
        "h-12 w-full rounded-2xl border border-line bg-white px-4 text-base text-forest outline-none placeholder:text-ink/40 focus-visible:ring-2 focus-visible:ring-leaf",
        className,
      )}
      {...props}
    />
  );
}

export { Input };
