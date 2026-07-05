export interface KbdProps {
  keys: string | string[];
}

export function Kbd({ keys }: KbdProps) {
  const arr = Array.isArray(keys) ? keys : keys.split(/\s+/).filter(Boolean);
  return (
    <span className="inline-flex items-center gap-1">
      {arr.map((k, i) => (
        <kbd key={i} className="zw-kbd">
          {k}
        </kbd>
      ))}
    </span>
  );
}
