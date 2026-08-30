import { supabaseJson, supabaseRequest } from "../lib/supabase.js";

/**
 * One-time seed: creates (or updates) the "house" seller that owns
 * DumbBrew's own catalog, then copies the existing brews/menu_items rows
 * into `products` (owned by that seller) and backfills their product_id FK,
 * so brews.html/menu.html can grow "Add to Cart" buttons without
 * duplicating catalog data.
 *
 * Sellers are a standalone identity now (not a customer account) — the
 * house seller doesn't need real login credentials since nobody signs into
 * it via seller-dashboard.html, so this just creates the row directly by
 * email, matched on re-run.
 *
 * Usage: [HOUSE_STORE_NAME="DumbBrew"] [HOUSE_EMAIL=house@dumbbrew.example] npm run seed:house-seller
 */
async function main() {
  const storeName = process.env.HOUSE_STORE_NAME ?? "DumbBrew";
  const email = (process.env.HOUSE_EMAIL ?? "house@dumbbrew.example").toLowerCase();

  const existing = await supabaseJson<Array<{ id: string }>>(
    `sellers?email=eq.${encodeURIComponent(email)}&select=id&limit=1`
  );
  let sellerId: string;
  if (existing[0]) {
    sellerId = existing[0].id;
    await supabaseRequest(`sellers?id=eq.${sellerId}`, {
      method: "PATCH",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify({ store_name: storeName, status: "approved", is_house: true })
    });
    console.log(`Updated existing seller row to house/approved: ${storeName} (${sellerId})`);
  } else {
    const created = await supabaseJson<Array<{ id: string }>>("sellers", {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({
        store_name: storeName,
        email,
        owner_full_name: storeName,
        status: "approved",
        is_house: true,
        decided_at: new Date().toISOString(),
        decided_by: "seed-script"
      })
    });
    sellerId = created[0].id;
    console.log(`Created house seller: ${storeName} (${sellerId})`);
  }

  const brews = await supabaseJson<
    Array<{ id: number; name: string; description: string; price: string; image_key: string; sort: number }>
  >("brews?product_id=is.null&select=id,name,description,price,image_key,sort");
  for (const brew of brews) {
    const created = await supabaseJson<Array<{ id: number }>>("products", {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({
        seller_id: sellerId,
        name: brew.name,
        description: brew.description,
        price: brew.price,
        image_key: brew.image_key,
        category: "Coffee",
        sort: brew.sort
      })
    });
    await supabaseRequest(`brews?id=eq.${brew.id}`, {
      method: "PATCH",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify({ product_id: created[0].id })
    });
  }
  console.log(`Migrated ${brews.length} brews into products`);

  const menuItems = await supabaseJson<
    Array<{
      id: number;
      name: string;
      description: string;
      price: string;
      sort: number;
      menu_categories: { title: string } | null;
    }>
  >("menu_items?product_id=is.null&select=id,name,description,price,sort,menu_categories(title)");
  for (const item of menuItems) {
    const created = await supabaseJson<Array<{ id: number }>>("products", {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({
        seller_id: sellerId,
        name: item.name,
        description: item.description,
        price: item.price,
        category: item.menu_categories?.title ?? null,
        sort: item.sort
      })
    });
    await supabaseRequest(`menu_items?id=eq.${item.id}`, {
      method: "PATCH",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify({ product_id: created[0].id })
    });
  }
  console.log(`Migrated ${menuItems.length} menu items into products`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
