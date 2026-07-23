"use client";

import { AnnuaireSearch } from "@/components/AnnuaireSearch";
import { PortfolioForm } from "@/components/PortfolioForm";

export default function LocataireAnnuairePage() {
  return (
    <div className="space-y-8">
      <AnnuaireSearch />
      <PortfolioForm />
    </div>
  );
}
