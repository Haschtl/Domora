export const OWNER_MUST_REMAIN_ERROR = "Mindestens ein Hauptmieter muss in der WG bleiben.";
export const LAST_OWNER_CANNOT_BE_REMOVED_ERROR = "Der letzte Hauptmieter kann nicht entfernt werden.";
export const LAST_OWNER_CANNOT_LEAVE_ERROR = "Du bist der letzte Hauptmieter. Lege zuerst einen weiteren Hauptmieter fest.";
export const DISSOLVE_OWNER_ONLY_ERROR = "Nur Hauptmieter koennen die WG aufloesen.";
export const DISSOLVE_LAST_MEMBER_ONLY_ERROR = "Die WG kann nur aufgeloest werden, wenn du der letzte Mieter bist.";
export const LEAVE_BALANCE_NOT_ZERO_ERROR = "WG verlassen nur moeglich, wenn dein Finanz-Ausgleich bei 0 liegt.";

export const assertCanDemoteOwner = (ownerCount: number) => {
  if (ownerCount <= 1) {
    throw new Error(OWNER_MUST_REMAIN_ERROR);
  }
};

export const assertCanRemoveOwner = (ownerCount: number) => {
  if (ownerCount <= 1) {
    throw new Error(LAST_OWNER_CANNOT_BE_REMOVED_ERROR);
  }
};

export const assertCanLeaveAsOwner = (ownerCount: number) => {
  if (ownerCount <= 1) {
    throw new Error(LAST_OWNER_CANNOT_LEAVE_ERROR);
  }
};

export const assertCanDissolveHousehold = (role: string, memberCount: number) => {
  if (role !== "owner") {
    throw new Error(DISSOLVE_OWNER_ONLY_ERROR);
  }
  if (memberCount !== 1) {
    throw new Error(DISSOLVE_LAST_MEMBER_ONLY_ERROR);
  }
};

export const assertCanLeaveWithBalance = (balance: number, tolerance = 0.004) => {
  if (Math.abs(balance) > tolerance) {
    throw new Error(LEAVE_BALANCE_NOT_ZERO_ERROR);
  }
};
