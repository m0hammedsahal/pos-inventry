import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { DEFAULT_EXPENSE_CATEGORIES } from "@/lib/cafe";

export interface CategoryOption {
  /** null when the list is the built-in fallback (database table unavailable) */
  id: string | null;
  name: string;
  isDefault: boolean;
}

const builtIn = (): CategoryOption[] =>
  DEFAULT_EXPENSE_CATEGORIES.map((name) => ({ id: null, name, isDefault: true }));

/**
 * Built-in categories plus any custom ones the cafe created.
 * Falls back to the built-in list if the categories table can't be read.
 */
export function useExpenseCategories() {
  const query = useQuery({
    queryKey: ["expense-categories"],
    retry: false,
    queryFn: async () => {
      const { data, error } = await supabase.from("expense_categories").select("*").order("name");
      if (error) throw error;
      return data;
    },
  });

  let options: CategoryOption[] = builtIn();
  if (query.data?.length) {
    const rows = query.data.map((c) => ({ id: c.id, name: c.name, isDefault: c.is_default }));
    const order = (n: string) => (DEFAULT_EXPENSE_CATEGORIES as readonly string[]).indexOf(n);
    options = [
      ...rows.filter((r) => r.isDefault).sort((a, b) => order(a.name) - order(b.name)),
      ...rows.filter((r) => !r.isDefault).sort((a, b) => a.name.localeCompare(b.name)),
    ];
  }
  return { options, isLoading: query.isLoading, canManage: !!query.data?.length };
}
