"use client";

import { ProfileForm } from "@/components/ProfileForm";
import { TwoFactorPanel } from "@/components/TwoFactorPanel";

export default function AdminProfilPage() {
  return (
    <div className="space-y-6">
      <ProfileForm />
      <TwoFactorPanel />
    </div>
  );
}
