import { supabaseJson, supabaseRequest } from "../lib/supabase.js";

/**
 * One-time seed: makes an already-registered customer account (register it
 * normally via register.html first — there's no separate identity system
 * for sellers) the "house" seller that owns DumbBrew's own catalog, then
 * copies the existing brews/menu_items rows into `products` (owned by that
 * seller) and backfills their product_id FK, so brews.html/menu.html can
 * grow "Add to Cart" buttons without duplicating catalog data.
 *
 * Usage: HOUSE_CUSTOMER_ID=<uuid> [HOUSE_STORE_NAME="DumbBrew"] npm run seed:house-seller
 */
async function main() {
  const customerId = process.env.HOUSE_CUSTOMER_ID;
  const storeName = process.env.HOUSE_STORE_NAME ?? "DumbBrew";
  if (!customerId) {
    console.error("HOUSE_CUSTOMER_ID env var is required (register that account via register.html first)");
    process.exit(1);
  }

  const existing = await supabaseJson<Array<{ id: string }>>(`sellers?id=eq.${customerId}&select=id&limit=1`);
  if (existing[0]) {
    await supabaseRequest(`sellers?id=eq.${customerId}`, {
      method: "PATCH",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify({ store_name: storeName, status: "approved", is_house: true })
    });
    console.log(`Updated existing seller row to house/approved: ${storeName} (${customerId})`);
  } else {
    await supabaseRequest("sellers", {
      method: "POST",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify({
        id: customerId,
        store_name: storeName,
        status: "approved",
        is_house: true,
        decided_at: new Date().toISOString(),
        decided_by: "seed-script"
      })
    });
    console.log(`Created house seller: ${storeName} (${customerId})`);
  }

  const brews = await supabaseJson<
    Array<{ id: number; name: string; description: string; price: string; image_key: string; sort: number }>
  >("brews?product_id=is.null&select=id,name,description,price,image_key,sort");
  for (const brew of brews) {
    const created = await supabaseJson<Array<{ id: number }>>("products", {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({
        seller_id: customerId,
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
        seller_id: customerId,
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
