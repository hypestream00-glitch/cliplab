"use client";

import { useMemo, useState } from "react";
import { formatBrlFromCents, rankingRulesTotal, validatePrizeBudget } from "@/lib/competitions/prizes";

type Row = { position: number; amount: string };

export function PrizeRulesEditor({
  prizePoolDefault = "10000",
}: {
  prizePoolDefault?: string;
}) {
  const [prizePool, setPrizePool] = useState(prizePoolDefault);
  const [mode, setMode] = useState<"RANKING" | "VIEWS" | "HYBRID">("RANKING");
  const [rankingBudget, setRankingBudget] = useState("7000");
  const [viewsBudget, setViewsBudget] = useState("3000");
  const [rows, setRows] = useState<Row[]>([
    { position: 1, amount: "3000" },
    { position: 2, amount: "2000" },
    { position: 3, amount: "1500" },
  ]);
  const rankingValue = rows.map((row) => `${row.position}:${row.amount}`).join(",");
  const rankingCents = rankingRulesTotal(
    rows.map((row, index) => ({
      kind: "RANKING_POSITION",
      position: row.position,
      amountCents: Math.round(Number(String(row.amount).replace(",", ".")) * 100) || 0,
      sortOrder: index,
    })),
  );
  const prizePoolCents = Math.round(Number(String(prizePool).replace(",", ".")) * 100) || 0;
  const rankingBudgetCents = Math.round(Number(String(rankingBudget).replace(",", ".")) * 100) || 0;
  const viewsBudgetCents = Math.round(Number(String(viewsBudget).replace(",", ".")) * 100) || 0;
  const budget = useMemo(
    () =>
      validatePrizeBudget(
        {
          prizePoolCents,
          prizeMode: mode,
          rankingBudgetCents,
          viewsBudgetCents,
        },
        rows.map((row, index) => ({
          kind: "RANKING_POSITION",
          position: row.position,
          amountCents: Math.round(Number(String(row.amount).replace(",", ".")) * 100) || 0,
          sortOrder: index,
        })),
      ),
    [mode, prizePoolCents, rankingBudgetCents, viewsBudgetCents, rows],
  );

  return (
    <div className="space-y-3">
      <label className="block text-[13px]">
        Premiação total (R$)
        <input
          required
          name="prizePool"
          value={prizePool}
          onChange={(event) => setPrizePool(event.target.value)}
          className="mt-1 h-10 w-full rounded-md border bg-transparent px-2"
        />
      </label>
      <label className="block text-[13px]">
        Modo
        <select
          name="prizeMode"
          value={mode}
          onChange={(event) => setMode(event.target.value as "RANKING" | "VIEWS" | "HYBRID")}
          className="mt-1 h-10 w-full rounded-md border bg-transparent px-2"
        >
          <option value="RANKING">Ranking</option>
          <option value="VIEWS">Visualizações</option>
          <option value="HYBRID">Híbrido</option>
        </select>
      </label>
      {mode !== "VIEWS" ? (
        <label className="block text-[13px]">
          Orçamento ranking (R$)
          <input name="rankingBudget" value={rankingBudget} onChange={(event) => setRankingBudget(event.target.value)} className="mt-1 h-10 w-full rounded-md border bg-transparent px-2" />
        </label>
      ) : (
        <input type="hidden" name="rankingBudget" value="0" />
      )}
      {mode !== "RANKING" ? (
        <label className="block text-[13px]">
          Orçamento views (R$)
          <input name="viewsBudget" value={viewsBudget} onChange={(event) => setViewsBudget(event.target.value)} className="mt-1 h-10 w-full rounded-md border bg-transparent px-2" />
        </label>
      ) : (
        <input type="hidden" name="viewsBudget" value="0" />
      )}
      {mode !== "VIEWS" ? (
        <div className="rounded-xl border p-3">
          <p className="mb-2 text-[13px] font-medium">Premiação por ranking</p>
          {rows.map((row, index) => (
            <div key={index} className="mb-2 grid grid-cols-[80px_1fr] gap-2">
              <input
                aria-label={`Posição ${index + 1}`}
                value={row.position}
                onChange={(event) => {
                  const next = [...rows];
                  next[index] = { ...row, position: Number(event.target.value) };
                  setRows(next);
                }}
                className="h-9 rounded-md border bg-transparent px-2 text-[13px]"
              />
              <input
                aria-label={`Valor posição ${row.position}`}
                value={row.amount}
                onChange={(event) => {
                  const next = [...rows];
                  next[index] = { ...row, amount: event.target.value };
                  setRows(next);
                }}
                className="h-9 rounded-md border bg-transparent px-2 text-[13px]"
              />
            </div>
          ))}
          <button
            type="button"
            className="h-8 rounded-md border px-2 text-[12px]"
            onClick={() => setRows([...rows, { position: rows.length + 1, amount: "0" }])}
          >
            + Adicionar posição
          </button>
          <input type="hidden" name="rankingRules" value={rankingValue} />
          <p className="mt-2 text-[12px] text-muted-foreground">Ranking distribuído: {formatBrlFromCents(rankingCents)}</p>
        </div>
      ) : (
        <input type="hidden" name="rankingRules" value="" />
      )}
      <p className={`text-[13px] ${budget.ok ? "text-muted-foreground" : "text-destructive"}`}>
        {budget.ok
          ? `Distribuído: ${formatBrlFromCents(budget.distributedCents)} · Disponível: ${formatBrlFromCents(budget.availableCents)}`
          : budget.error}
      </p>
    </div>
  );
}
