"use client";

import { useState } from "react";

export function CharacterCountField({
  name,
  label,
  defaultValue,
  max,
  rows = 3,
}: {
  name: string;
  label: string;
  defaultValue: string;
  max: number;
  rows?: number;
}) {
  const [value, setValue] = useState(defaultValue);
  return (
    <label className="block text-[12px] text-muted-foreground">
      {label} ({value.length}/{max})
      <textarea
        name={name}
        rows={rows}
        maxLength={max}
        value={value}
        onChange={(event) => setValue(event.target.value)}
        className="mt-1 w-full rounded-md border bg-transparent px-2 py-1.5 text-[13px] text-foreground"
      />
    </label>
  );
}
