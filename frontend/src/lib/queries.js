import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";

export const useMeta = () => useQuery({ queryKey: ["meta"], queryFn: () => api.get("/catalog/meta").then((r) => r.data), staleTime: 60000 });

export const useProducts = (params) =>
  useQuery({ queryKey: ["products", params], queryFn: () => api.get("/products", { params }).then((r) => r.data), placeholderData: keepPreviousData });

export const useProductsByIds = (ids) =>
  useQuery({ queryKey: ["by-ids", ids], queryFn: () => api.get("/products/by-ids", { params: { ids: ids.join(",") } }).then((r) => r.data), enabled: ids.length > 0 });
