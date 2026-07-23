"use client";

import { AnnuaireSearch } from "@/components/AnnuaireSearch";
import { PortfolioForm } from "@/components/PortfolioForm";

export default function BailleurAnnuairePage() {
  return (
    <div className="space-y-8">
      <AnnuaireSearch />
      <PortfolioForm />
    </div>
  );
}
