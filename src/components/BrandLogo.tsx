/** Malba Ree brand logo. `wordmark` is the "Malba Ree" lettering only; `full` includes "POS & INVENTORY". */
export function BrandLogo({
  variant = "wordmark",
  className = "h-10",
}: {
  variant?: "wordmark" | "full";
  className?: string;
}) {
  return (
    <img
      src={variant === "full" ? "/logo.png" : "/logo-wordmark.png"}
      alt="Malba Ree — POS & Inventory"
      className={"w-auto select-none object-contain " + className}
      draggable={false}
    />
  );
}
