"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useTranslation } from "react-i18next";
import { ArrowLeft, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import { getPartyLedger } from "../../actions";
import { PartyBalance } from "../../parties-view";
import { PartyLedgerView } from "../../party-ledger-view";

/**
 * Party Groups -> parties in that group (left) -> selected party's ledger
 * (right) — Firebase-console-style split, mirrors the pattern established
 * in account/organizations/organizations-split-view.jsx. Ledger content
 * itself is the same PartyLedgerView used by the standalone
 * parties/[party] route, so both stay in sync for free.
 */
export default function GroupDetailView({ companySlug, group, initialParties, organization, labels }) {
  const { t } = useTranslation();
  const [activeId, setActiveId] = useState(null);
  const [ledger, setLedger] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!activeId) {
      return;
    }
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    getPartyLedger(companySlug, activeId).then((result) => {
      if (cancelled) return;
      setLedger(result);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [activeId, companySlug]);

  return (
    <div className="space-y-5">
      <Link
        href={`/${companySlug}/parties/groups`}
        className="inline-flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground print:hidden"
      >
        <ArrowLeft className="h-4 w-4" />
        {labels.back}
      </Link>

      <div className="print:hidden">
        <h1 className="text-2xl font-semibold tracking-tight">{group.name}</h1>
        {group.description && <p className="mt-1 text-sm text-muted-foreground">{group.description}</p>}
      </div>

      <div className="grid gap-4 lg:grid-cols-[320px_1fr] print:block">
        <div className="space-y-1 rounded-xl border bg-background p-2 print:hidden">
          {initialParties.length === 0 ? (
            <p className="p-4 text-center text-sm text-muted-foreground">{t("noPartiesYet")}</p>
          ) : (
            initialParties.map((party) => (
              <button
                key={party.id}
                type="button"
                onClick={() => setActiveId(party.id)}
                className={cn(
                  "flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2.5 text-left transition-colors",
                  activeId === party.id ? "bg-primary/10 shadow-[inset_3px_0_0_var(--primary)]" : "hover:bg-muted"
                )}
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{party.name}</p>
                  <p className="truncate text-xs text-muted-foreground">{party.phoneNumber || t(party.type)}</p>
                </div>
                <PartyBalance value={party.balance} />
              </button>
            ))
          )}
        </div>

        <div className="min-h-64 rounded-xl border bg-muted/20 p-4">
          {!activeId ? (
            <div className="flex h-full flex-col items-center justify-center gap-2 py-16 text-center text-muted-foreground">
              <Users className="h-8 w-8 opacity-40" />
              <p className="text-sm">{t("selectPartyToViewLedger")}</p>
            </div>
          ) : loading || !ledger ? (
            <div className="flex h-full items-center justify-center py-16 text-sm text-muted-foreground">{t("loading")}</div>
          ) : (
            <PartyLedgerView party={ledger.party} entries={ledger.entries} organization={organization} compact />
          )}
        </div>
      </div>
    </div>
  );
}
