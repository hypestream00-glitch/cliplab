import type { ReactNode } from "react";

export type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export type PageSearchProps = {
  searchParams: SearchParams;
};

export type PageParamsProps<T extends Record<string, string>> = {
  params: Promise<T>;
};

export type LayoutChildrenProps = {
  children: ReactNode;
};
