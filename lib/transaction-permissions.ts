import type { AppUser, TransactionStatus } from "@/lib/rbac";
import { isAdmin } from "@/lib/rbac";

type TxPermissionFields = {
  status: TransactionStatus;
  created_by: number | null;
};

export function canViewTransaction(_user: AppUser, _tx: TxPermissionFields): boolean {
  return true;
}

export function canEditTransaction(user: AppUser, tx: TxPermissionFields): boolean {
  if (isAdmin(user)) return true;
  if (tx.status === "approved") return false;
  if (tx.status === "pending" || tx.status === "rejected") {
    return tx.created_by === user.id;
  }
  return false;
}

export function canDeleteTransaction(user: AppUser, tx: TxPermissionFields): boolean {
  if (isAdmin(user)) return true;
  return tx.status === "pending" && tx.created_by === user.id;
}

export function canApproveTransaction(user: AppUser, tx: TxPermissionFields): boolean {
  return isAdmin(user) && tx.status === "pending";
}

export function canRejectTransaction(user: AppUser, tx: TxPermissionFields): boolean {
  return isAdmin(user) && tx.status === "pending";
}

export function canResubmitTransaction(user: AppUser, tx: TxPermissionFields): boolean {
  return !isAdmin(user) && tx.status === "rejected" && tx.created_by === user.id;
}

export function initialStatusForRole(role: AppUser["role"]): TransactionStatus {
  return role === "admin" ? "approved" : "pending";
}
