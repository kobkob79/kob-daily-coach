export const ACCOUNT_DELETION_CHALLENGE = "מחק";
export const ACCOUNT_DELETION_PAGE_STATUS = "BLOCKED_UNTIL_BACKEND_VERIFIED" as const;

export const USER_OWNED_STORAGE_BUCKETS = [
  "profile-photos",
  "body-photos",
  "meal-photos",
  "vision-captures",
  "media-inbox",
  "exercise-images",
] as const;

export type AccountDeletionErrorCode =
  | "INVALID_REQUEST"
  | "INVALID_CHALLENGE"
  | "DELETION_IN_PROGRESS"
  | "STORAGE_CLEANUP_FAILED"
  | "ACCOUNT_DELETE_FAILED";

export type DeleteMyAccountResult =
  | { status: "success" }
  | { status: "error"; error: { code: AccountDeletionErrorCode; retryable: boolean } };

export function accountDeletionErrorMessage(code: AccountDeletionErrorCode): string {
  switch (code) {
    case "INVALID_CHALLENGE":
      return "יש להקליד „מחק” כדי לאשר את הפעולה.";
    case "DELETION_IN_PROGRESS":
      return "מחיקת החשבון כבר מתבצעת. אפשר להמתין רגע ולנסות שוב.";
    case "STORAGE_CLEANUP_FAILED":
      return "לא הצלחנו למחוק את כל הקבצים. החשבון נשאר פעיל ואפשר לנסות שוב.";
    default:
      return "לא הצלחנו למחוק את החשבון. החשבון נשאר פעיל ואפשר לנסות שוב.";
  }
}
