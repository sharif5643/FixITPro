/**
 * The shift a person's sales and payments go into: their own open shift, or the open shift they
 * joined (one cash drawer used by several people, see ShiftMember).
 */
export function activeShiftWhere(userId: string) {
  return {
    isActive: true,
    OR: [
      { userId },
      { members: { some: { userId, leftAt: null } } },
    ],
  };
}
