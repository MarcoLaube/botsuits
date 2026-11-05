import { useId, useLayoutEffect, useRef, useState } from "react";

/** Presentation only: never truncate the value passed to the view's data helpers. */
export function CellValue({ value, amount, layout }: { value: string | undefined; amount: boolean; layout: boolean }) {
  const id = useId();
  const text = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const popover = useRef<HTMLDivElement>(null);
  const close = useRef<HTMLButtonElement>(null);
  const [overflow, setOverflow] = useState(false);
  useLayoutEffect(() => {
    const element = text.current;
    if (!element) return;
    const measure = () => setOverflow(element.scrollHeight > element.clientHeight + 1 || element.scrollWidth > element.clientWidth + 1);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [value, layout]);

  if (!value?.trim()) return <span className="missing" aria-label="Not provided">—</span>;
  return <div className="cell-value">
    <div ref={text} className="cell-preview-text"><span className={amount ? "amount" : undefined}>{value}</span></div>
    {overflow && <>
      <button ref={trigger} type="button" className="value-trigger" popoverTarget={id}>View full value</button>
      <div ref={popover} id={id} popover="auto" className="value-popover" role="dialog" aria-label="Full value"
        onToggle={(event) => { if (event.newState === "open") close.current?.focus(); }}
        onKeyDown={(event) => { if (event.key === "Escape") { event.preventDefault(); popover.current?.hidePopover(); trigger.current?.focus(); } }}>
        <button ref={close} type="button" className="comparison-control" onClick={() => { popover.current?.hidePopover(); trigger.current?.focus(); }}>Close</button>
        <p className="full-value"><span className={amount ? "amount" : undefined}>{value}</span></p>
      </div>
    </>}
  </div>;
}
