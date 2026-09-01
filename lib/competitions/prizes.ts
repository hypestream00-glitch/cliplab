export type PrizeRuleInput = {
  kind: string;
  position?: number | null;
  amountCents?: number;
  viewsRequired?: number | null;
  viewsPerUnit?: number | null;
  amountPerUnitCents?: number | null;
  sortOrder?: number;
};

export type PrizeBudget = {
  prizePoolCents: number;
  prizeMode: "RANKING" | "VIEWS" | "HYBRID";
  rankingBudgetCents: number;
  viewsBudgetCents: number;
};

export function rankingRulesTotal(rules: PrizeRuleInput[]) {
  return rules.filter((rule) => rule.kind === "RANKING_POSITION").reduce((sum, rule) => sum + (rule.amountCents ?? 0), 0);
}

export function validatePrizeBudget(budget: PrizeBudget, rules: PrizeRuleInput[]) {
  if (budget.prizePoolCents < 0) return { ok: false as const, error: "A premiação total não pode ser negativa." };
  const rankingTotal = rankingRulesTotal(rules);
  if (budget.prizeMode === "RANKING") {
    if (rankingTotal > budget.prizePoolCents) {
      return { ok: false as const, error: "As posições do ranking ultrapassam a premiação total." };
    }
    return { ok: true as const, distributedCents: rankingTotal, availableCents: budget.prizePoolCents - rankingTotal };
  }
  if (budget.prizeMode === "VIEWS") {
    if (budget.viewsBudgetCents > budget.prizePoolCents) {
      return { ok: false as const, error: "O orçamento de visualizações ultrapassa a premiação total." };
    }
    return { ok: true as const, distributedCents: budget.viewsBudgetCents, availableCents: budget.prizePoolCents - budget.viewsBudgetCents };
  }
  const rankingBudget = budget.rankingBudgetCents;
  const viewsBudget = budget.viewsBudgetCents;
  if (rankingBudget + viewsBudget > budget.prizePoolCents) {
    return { ok: false as const, error: "A soma ranking + views ultrapassa a premiação total." };
  }
  if (rankingTotal > rankingBudget) {
    return { ok: false as const, error: "As posições do ranking ultrapassam o orçamento de ranking." };
  }
  return {
    ok: true as const,
    distributedCents: rankingBudget + viewsBudget,
    availableCents: budget.prizePoolCents - rankingBudget - viewsBudget,
  };
}

export function estimateRankingPrize(rules: PrizeRuleInput[], position: number) {
  const rule = rules.find((item) => item.kind === "RANKING_POSITION" && item.position === position);
  return rule?.amountCents ?? 0;
}

export function estimateViewsPrize(params: {
  rules: PrizeRuleInput[];
  views: number;
  viewsBudgetCents: number;
}) {
  const per = params.rules.find((rule) => rule.kind === "VIEWS_PER" && (rule.viewsPerUnit ?? 0) > 0);
  let amount = 0;
  if (per) {
    const units = Math.floor(params.views / (per.viewsPerUnit ?? 1));
    amount = units * (per.amountPerUnitCents ?? 0);
  }
  const tiers = params.rules
    .filter((rule) => rule.kind === "VIEWS_TIER")
    .sort((a, b) => (a.viewsRequired ?? 0) - (b.viewsRequired ?? 0));
  let tierAmount = 0;
  for (const tier of tiers) {
    if (params.views >= (tier.viewsRequired ?? 0)) tierAmount = tier.amountCents ?? 0;
  }
  const raw = Math.max(amount, tierAmount);
  return Math.min(raw, Math.max(0, params.viewsBudgetCents));
}

export function allocateViewsPrizes(params: {
  views: number[];
  rules: PrizeRuleInput[];
  viewsBudgetCents: number;
}) {
  const budget = Math.max(0, params.viewsBudgetCents);
  const raw = params.views.map((views) => estimateViewsPrize({ rules: params.rules, views, viewsBudgetCents: budget }));
  const total = raw.reduce((sum, amount) => sum + amount, 0);
  if (total <= budget || total === 0) return raw;
  return raw.map((amount) => Math.floor((amount * budget) / total));
}

export function formatBrlFromCents(cents: number) {
  return (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
