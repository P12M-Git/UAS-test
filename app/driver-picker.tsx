"use client";
import { useEffect, useId, useRef, useState } from "react";
import { compareDriversBySurname, normaliseDriverName } from "../src/models/driver-identity";

export default function DriverPicker({ drivers, driver, setDriver }: { drivers: string[]; driver: string; setDriver: (name: string) => void }) {
  const [query, setQuery] = useState("");
  const details = useRef<HTMLDetailsElement>(null);
  const label = useId();
  const visible = [...new Set(drivers)].sort(compareDriversBySurname).filter(name => normaliseDriverName(name).includes(normaliseDriverName(query)));
  const close = () => {
    if (details.current) details.current.open = false;
    setQuery("");
  };
  useEffect(() => {
    const outside = (event: PointerEvent) => {
      if (event.target instanceof Node && !details.current?.contains(event.target)) {
        if (details.current) details.current.open = false;
        setQuery("");
      }
    };
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, []);
  return <div className="analysed-driver-picker">
    <span id={label}>ANALYSED DRIVER</span>
    <details ref={details} onToggle={() => {
      if (details.current?.open) details.current.querySelector("input")?.focus();
      else setQuery("");
    }} onKeyDown={event => {
      if (event.key === "Escape") { event.preventDefault(); close(); details.current?.querySelector("summary")?.focus(); }
    }}>
      <summary aria-labelledby={`${label} ${label}-value`}><span id={`${label}-value`}>{driver || "Choose driver"}</span></summary>
      <div className="driver-picker-panel">
        <input type="search" aria-label="Search analysed driver" placeholder="Search name or surname…" value={query} onChange={event => setQuery(event.target.value)} onKeyDown={event => {
          if (event.key === "ArrowDown") { event.preventDefault(); details.current?.querySelector<HTMLButtonElement>('[role="option"]')?.focus(); }
        }} />
        <div className="driver-picker-options" role="listbox" aria-label="Drivers ordered by surname">
          {visible.map(name => <button type="button" role="option" aria-selected={name === driver} key={name} onClick={() => {
            setDriver(name); close(); details.current?.querySelector("summary")?.focus();
          }} onKeyDown={event => {
            const item = event.currentTarget;
            const target = event.key === "ArrowDown" ? item.nextElementSibling : event.key === "ArrowUp" ? item.previousElementSibling : event.key === "Home" ? item.parentElement?.firstElementChild : event.key === "End" ? item.parentElement?.lastElementChild : null;
            if (target instanceof HTMLButtonElement) { event.preventDefault(); target.focus(); }
          }}>{name}</button>)}
          {!visible.length && <p>No matching drivers.</p>}
        </div>
      </div>
    </details>
  </div>;
}
