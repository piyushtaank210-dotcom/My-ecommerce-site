import { requireUser } from "@/lib/guard";
import { ProfileForm } from "@/components/account/ProfileForm";
import { PasswordForm } from "@/components/account/PasswordForm";

export const metadata = { title: "Profile" };

export default async function AccountProfilePage() {
  const user = await requireUser("/account/profile");

  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <section className="rounded-xl border border-gray-200 bg-white p-5">
        <h2 className="mb-1 text-[15px] font-bold text-ink">Your details</h2>
        <p className="mb-4 text-[13px] text-gray-500">
          The name and email on your orders come from here.
        </p>
        <ProfileForm
          name={user.name}
          email={user.email}
          phone={user.phone}
        />
      </section>

      <section className="rounded-xl border border-gray-200 bg-white p-5">
        <h2 className="mb-1 text-[15px] font-bold text-ink">Password</h2>
        <p className="mb-4 text-[13px] text-gray-500">
          Pick something you have not used here before.
        </p>
        <PasswordForm />
      </section>
    </div>
  );
}
