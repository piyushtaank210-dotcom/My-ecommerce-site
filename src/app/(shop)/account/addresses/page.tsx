import { requireUser } from "@/lib/guard";
import { listAddresses } from "@/lib/addresses";
import { AddressManager } from "@/components/account/AddressManager";

export const metadata = { title: "Saved addresses" };

export default async function AccountAddressesPage() {
  const user = await requireUser("/account/addresses");
  const addresses = listAddresses(user.id);

  return (
    <div>
      <header className="mb-5">
        <h2 className="text-[18px] font-bold text-ink">Saved addresses</h2>
        <p className="mt-1 text-[13.5px] text-gray-500">
          Where your orders go. One of them is the default.
        </p>
      </header>

      <AddressManager addresses={addresses} />
    </div>
  );
}
