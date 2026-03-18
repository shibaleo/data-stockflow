/**
 * Permission matrices — role-based access control for entity operations.
 *
 * Two layers:
 * 1. ENTITY_PERMISSIONS (bus matrix): entity type × operation × allowed roles
 * 2. AUTHORITY_MATRIX: which authority levels a role can modify (instance-level)
 */
import type { UserRole } from "@/middleware/context";

type Op = "read" | "create" | "update" | "delete" | "restore" | "purge";

const ALL: UserRole[] = ["platform", "tenant", "auditor", "admin", "user"];
const PF: UserRole[] = ["platform"];
const PF_TA: UserRole[] = ["platform", "tenant"];
const PF_TA_AD: UserRole[] = ["platform", "tenant", "admin"];
const TA: UserRole[] = ["tenant"];
const TA_AD: UserRole[] = ["tenant", "admin"];
const AD: UserRole[] = ["admin"];
const AD_US: UserRole[] = ["admin", "user"];

export const ENTITY_PERMISSIONS: Record<string, Record<Op, UserRole[]>> = {
  role:            { read: ALL, create: PF,    update: PF_TA,    delete: PF,    restore: PF,    purge: PF },
  tenant:          { read: ALL, create: PF,    update: PF_TA,    delete: PF,    restore: PF,    purge: PF },
  user:            { read: ALL, create: PF_TA, update: PF_TA,    delete: PF_TA, restore: PF_TA, purge: PF_TA },
  book:            { read: ALL, create: TA_AD, update: TA_AD,    delete: TA_AD, restore: TA_AD, purge: TA },
  account:         { read: ALL, create: TA_AD, update: TA_AD,    delete: TA_AD, restore: TA_AD, purge: TA },
  display_account: { read: ALL, create: TA_AD, update: TA_AD,    delete: TA_AD, restore: TA_AD, purge: TA },
  category:        { read: ALL, create: AD_US, update: AD_US,    delete: AD,    restore: AD,    purge: TA },
  department:      { read: ALL, create: TA_AD, update: TA_AD,    delete: TA_AD, restore: TA_AD, purge: TA },
  counterparty:    { read: ALL, create: AD_US, update: AD_US,    delete: AD,    restore: AD,    purge: TA },
  project:         { read: ALL, create: AD_US, update: AD_US,    delete: AD,    restore: AD,    purge: TA },
  voucher:         { read: ALL, create: AD_US, update: AD_US,    delete: AD_US, restore: AD,    purge: TA },
  journal:         { read: ALL, create: AD_US, update: AD_US,    delete: AD_US, restore: AD,    purge: TA },
};

/**
 * Authority matrix — maps a user's role to the set of authority levels
 * they are allowed to modify. Used for instance-level protection via
 * authority_role_key stored on each entity.
 */
export const AUTHORITY_MATRIX: Record<UserRole, readonly UserRole[]> = {
  platform: ["platform", "tenant", "admin", "user"],
  tenant:   ["tenant", "admin", "user"],
  admin:    ["admin", "user"],
  user:     ["user"],
  auditor:  [],
};

export function canModifyByRole(
  userRole: UserRole,
  entityAuthorityRole: UserRole,
): boolean {
  return AUTHORITY_MATRIX[userRole]?.includes(entityAuthorityRole) ?? false;
}
