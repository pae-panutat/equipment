import type { FilterOptions } from "@shared/index";

/**
 * Units as an indented list for a <select>. A single top-level unit that contains all the others (the university) is left out:
 * it would only repeat "all units" in filters, and equipment belongs to a faculty or office, not to the whole university.
 */
export function unitOptions(units: FilterOptions["units"]) {
  const out: { id: number; label: string }[] = [];
  const walk = (parent: number | null, depth: number) => {
    for (const u of units.filter((x) => x.parentId === parent)) {
      out.push({ id: u.id, label: `${"— ".repeat(depth)}${u.name}` });
      walk(u.id, depth + 1);
    }
  };
  const roots = units.filter((u) => u.parentId === null);
  const skipRoot = roots.length === 1 && units.some((u) => u.parentId === roots[0].id);
  walk(skipRoot ? roots[0].id : null, 0);
  return out;
}
