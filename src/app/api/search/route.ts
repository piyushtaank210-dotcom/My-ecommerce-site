import { NextResponse } from "next/server";
import { getProducts } from "@/lib/queries";
import { sellingPrice } from "@/lib/pricing";
import { notConfigured } from "@/lib/api";
import { databaseConfigured } from "@/lib/database-url";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const q = (searchParams.get("q") ?? "").trim();

  // A shop with no database has nothing to search, and saying so is
  // worth more than failing with a bare 500.
  if (!databaseConfigured().ok) return notConfigured();

  if (q.length < 2) return NextResponse.json({ products: [] });

  const products = (await getProducts({ q, limit: 6 })).map((p) => ({
    slug: p.slug,
    name: p.name,
    brand: p.brand,
    price: sellingPrice(p),
    image: p.image,
  }));

  return NextResponse.json({ products });
}
