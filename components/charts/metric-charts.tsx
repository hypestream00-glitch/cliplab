"use client";

import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, BarChart, Bar, AreaChart, Area, PieChart, Pie, Cell } from "recharts";

type Point = { label: string; value: number };

export function LineMetricChart({ data }: { data: Point[] }) {
  if (data.length === 0) return <EmptyChart />;
  return (
    <div className="h-48">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke="oklch(1 0 0 / 8%)" />
          <XAxis dataKey="label" tick={{ fontSize: 11 }} />
          <YAxis tick={{ fontSize: 11 }} />
          <Tooltip />
          <Line type="monotone" dataKey="value" stroke="oklch(0.72 0.12 250)" strokeWidth={2} dot={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

export function BarMetricChart({ data }: { data: Point[] }) {
  if (data.length === 0) return <EmptyChart />;
  return (
    <div className="h-48">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke="oklch(1 0 0 / 8%)" />
          <XAxis dataKey="label" tick={{ fontSize: 11 }} />
          <YAxis tick={{ fontSize: 11 }} />
          <Tooltip />
          <Bar dataKey="value" fill="oklch(0.72 0.12 250)" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function AreaMetricChart({ data }: { data: Point[] }) {
  if (data.length === 0) return <EmptyChart />;
  return (
    <div className="h-48">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke="oklch(1 0 0 / 8%)" />
          <XAxis dataKey="label" tick={{ fontSize: 11 }} />
          <YAxis tick={{ fontSize: 11 }} />
          <Tooltip />
          <Area type="monotone" dataKey="value" stroke="oklch(0.72 0.12 250)" fill="oklch(0.72 0.12 250 / 20%)" />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

export function DonutChart({ data }: { data: Array<Point & { color?: string }> }) {
  if (data.length === 0) return <EmptyChart />;
  return (
    <div className="h-48">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie data={data} dataKey="value" nameKey="label" innerRadius={40} outerRadius={70}>
            {data.map((entry, index) => (
              <Cell key={entry.label} fill={entry.color ?? ["#7dd3fc", "#86efac", "#fde68a", "#c4b5fd"][index % 4]} />
            ))}
          </Pie>
          <Tooltip />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}

function EmptyChart() {
  return <div className="flex h-48 items-center justify-center text-[13px] text-muted-foreground">Sem dados no período.</div>;
}
