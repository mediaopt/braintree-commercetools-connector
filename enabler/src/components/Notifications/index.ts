export type NotificationType = "Info" | "Error" | "Warning" | "Success";

const notificationTypeTitles: Record<NotificationType, string> = {
  Info: "Information",
  Error: "Error",
  Warning: "Warning",
  Success: "Success",
};

export const notificationTypeStyle: Record<NotificationType, string> = {
  Info: "bg-blue-500 flex rounded-lg p-2",
  Error: "bg-red-500 flex rounded-lg p-2",
  Warning: "bg-amber-500 flex rounded-lg p-2",
  Success: "bg-green-500 flex rounded-lg p-2",
};

export const getNotificationTypeTitle = (
  notificationType: NotificationType
): string => notificationTypeTitles[notificationType];
