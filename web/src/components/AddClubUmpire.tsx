"use client";

import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { addClubUmpire, searchUmpireAccounts } from "@/app/actions/umpiring";
import { SearchPicker } from "@/components/SearchPicker";
import { Label } from "@/components/ui/label";

/** Finds a registered umpire by name and adds them to the club's list. */
export function AddClubUmpire({ clubId }: { clubId: string }) {
  const router = useRouter();
  return (
    <div className="grid max-w-md gap-2">
      <Label htmlFor="add-umpire">Add an umpire</Label>
      <SearchPicker<{ id: string; displayName: string }>
        id="add-umpire"
        placeholder="Search by name"
        search={searchUmpireAccounts}
        label={(u) => u.displayName}
        onPick={async (u) => {
          const state = await addClubUmpire(clubId, u.id);
          if (state?.error) toast.error(state.error);
          else toast.success(`${u.displayName} is on the list.`);
          router.refresh();
        }}
      />
      <p className="text-sm text-muted-foreground">They need an account on this site. Anyone can register, and every account can umpire.</p>
    </div>
  );
}
