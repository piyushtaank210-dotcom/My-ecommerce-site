import { NextResponse } from "next/server";
import { getProducts } from "@/lib/queries";
import { sellingPrice } from "@/lib/pricing";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const q = (searchParams.get("q") ?? "").trim();

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
