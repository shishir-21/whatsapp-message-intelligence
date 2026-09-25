import type { Group } from "@prisma/client";
import { prisma } from "./prisma";

export function getSelectedGroup(): Promise<Group | null> {
  return prisma.group.findUnique({ where: { isSelected: true } });
}

// Creates or renames the group, then makes it the only selected group.
// isSelected is true-or-NULL with a unique index, so the database itself
// rejects a second selected group; the transaction keeps the switch atomic.
export function selectGroup(whatsappGroupId: string, name: string): Promise<Group> {
  return prisma.$transaction(async (tx) => {
    await tx.group.updateMany({
      where: { isSelected: true, NOT: { whatsappGroupId } },
      data: { isSelected: null, selectedAt: null },
    });

    return tx.group.upsert({
      where: { whatsappGroupId },
      create: { whatsappGroupId, name, isSelected: true, selectedAt: new Date() },
      update: { name, isSelected: true, selectedAt: new Date() },
    });
  });
}

// Deselects the current group. The group row and its messages are kept, so
// history stays intact and re-selecting the group later reuses the same row.
export async function clearSelectedGroup(): Promise<void> {
  await prisma.group.updateMany({
    where: { isSelected: true },
    data: { isSelected: null, selectedAt: null },
  });
}
