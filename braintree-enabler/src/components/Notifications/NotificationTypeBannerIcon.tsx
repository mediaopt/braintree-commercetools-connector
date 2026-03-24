import { FC, ReactElement } from "react";
import {
  CheckIcon,
  InformationCircleIcon,
  ExclamationIcon,
  BanIcon,
} from "@heroicons/react/outline";
import { NotificationType } from ".";

type NotificationTypeIconProps = {
  type: NotificationType;
};

const generalIconStyle = "h-6 w-6 text-white";

const notificationTypeIcons: Record<NotificationType, ReactElement> = {
  Info: <InformationCircleIcon className={generalIconStyle} />,
  Error: <BanIcon className={generalIconStyle} />,
  Warning: <ExclamationIcon className={generalIconStyle} />,
  Success: <CheckIcon className={generalIconStyle} />,
};

export const NotificationTypeIcon: FC<
  React.PropsWithChildren<NotificationTypeIconProps>
> = ({ type }: NotificationTypeIconProps) => notificationTypeIcons[type];
