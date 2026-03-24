import { FC } from "react";
import { XIcon } from "@heroicons/react/outline";
import {
  NotificationType,
  getNotificationTypeTitle,
  notificationTypeStyle,
} from ".";
import { NotificationTypeIcon } from "./NotificationTypeBannerIcon";

export type NotificationTypeBannerProps = {
  type: NotificationType;
  text: string;
  onClose: () => void;
};

export const NotificationTypeBanner: FC<
  React.PropsWithChildren<NotificationTypeBannerProps>
> = ({ type, text, onClose }: NotificationTypeBannerProps) => {
  const generalStyle =
    "rounded-lg bg-neutral-700 text-neutral-100 dark:text-neutral-900 p-2 shadow-lg dark:bg-neutral-100 sm:p-3";
  const iconsStyle = notificationTypeStyle[type];

  return (
    <>
      <div className="inset-x-0 bottom-0 pb-2 sm:pb-5 ">
        <div className="mx-auto max-w-3xl px-2 sm:px-6 lg:px-8 ">
          <div className={`${generalStyle}`} key={type}>
            <div className="flex flex-wrap items-center justify-between">
              <div className="flex w-0 flex-1 items-center">
                <span className={iconsStyle}>
                  <NotificationTypeIcon type={type} />
                </span>
                <div className="ml-3">
                  <h3 className="text-sm font-medium text-left">
                    {getNotificationTypeTitle(type)}
                  </h3>
                  <div className="mt-0.5 text-sm">
                    <p>{text}</p>
                  </div>
                </div>
              </div>
              <div className="flex-shrink-0 sm:order-3 sm:ml-2">
                <button
                  onClick={onClose}
                  type="button"
                  className="-mr-1 flex rounded-md p-2 hover:bg-neutral-800 focus:outline-none focus:ring-2 focus:ring-white dark:hover:bg-neutral-200 dark:focus:ring-neutral-600"
                >
                  <span className="sr-only">Dismiss</span>
                  <XIcon
                    className="h-6 w-6 text-white dark:text-neutral-700"
                    aria-hidden="true"
                    aria-label="Close Notification"
                  />
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
};
