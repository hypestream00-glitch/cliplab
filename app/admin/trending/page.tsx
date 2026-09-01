import { prisma } from "@/lib/db/prisma";
import { adminCreateTrendingItemAction } from "@/app/admin/competitions/actions";
import { Button } from "@/components/ui/button";
import { TRENDING_CATEGORIES, TRENDING_PLATFORMS } from "@/lib/competitions/platforms";

export const metadata = { title: "Admin em alta" };

export default async function AdminTrendingPage() {
  const items = await prisma.trendingItem.findMany({ orderBy: { createdAt: "desc" }, take: 50 });
  return (
    <div className="space-y-6">
      <h1 className="text-[18px] font-semibold">Em alta</h1>
      <form action={adminCreateTrendingItemAction} className="max-w-xl space-y-2 rounded-2xl border bg-card p-4">
        <label className="block text-[13px]">Título<input required name="title" className="mt-1 h-10 w-full rounded-md border bg-transparent px-2" /></label>
        <label className="block text-[13px]">
          Plataforma
          <select name="platform" className="mt-1 h-10 w-full rounded-md border bg-transparent px-2">
            {TRENDING_PLATFORMS.map((item) => (
              <option key={item}>{item}</option>
            ))}
          </select>
        </label>
        <label className="block text-[13px]">
          Categoria
          <select name="category" className="mt-1 h-10 w-full rounded-md border bg-transparent px-2">
            {TRENDING_CATEGORIES.map((item) => (
              <option key={item}>{item}</option>
            ))}
          </select>
        </label>
        <label className="block text-[13px]">Criador<input name="creatorName" className="mt-1 h-10 w-full rounded-md border bg-transparent px-2" /></label>
        <label className="block text-[13px]">URL<input name="canonicalUrl" className="mt-1 h-10 w-full rounded-md border bg-transparent px-2" /></label>
        <label className="block text-[13px]">Thumbnail<input name="thumbnailUrl" className="mt-1 h-10 w-full rounded-md border bg-transparent px-2" /></label>
        <label className="block text-[13px]">Views oficiais (somente se reais)<input name="viewCount" className="mt-1 h-10 w-full rounded-md border bg-transparent px-2" /></label>
        <label className="block text-[13px]">Project ID CortaClip<input name="projectId" className="mt-1 h-10 w-full rounded-md border bg-transparent px-2" /></label>
        <Button type="submit">Adicionar item</Button>
      </form>
      <div className="space-y-2">
        {items.map((item) => (
          <article key={item.id} className="rounded-xl border bg-card p-3 text-[13px]">
            <p className="font-medium">{item.title}</p>
            <p className="text-muted-foreground">{item.platform} · {item.category} · {item.viewCount ?? "views N/A"} · {item.source}</p>
          </article>
        ))}
      </div>
    </div>
  );
}
