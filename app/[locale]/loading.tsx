export default function Loading() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] px-4 text-center">
      <div className="w-12 h-12 border-2 border-ink/10 border-t-ink rounded-full animate-spin mb-4" />
      <p className="text-ink/60 font-medium animate-pulse tracking-widest uppercase text-xs">
        Setting the board...
      </p>
    </div>
  );
}
