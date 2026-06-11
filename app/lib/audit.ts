import { prisma } from "@/app/lib/prisma"

export async function createAuditLog({
  action,
  entity,
  entityId,
  details,
  userId,
}: {
  action: string
  entity: string
  entityId: string
  details?: string
  userId: string
}) {
  try {
    await prisma.auditLog.create({
      data: {
        action,
        entity,
        entityId,
        details,
        userId,
      },
    })
  } catch (error) {
    console.error("Failed to create audit log:", error)
  }
}