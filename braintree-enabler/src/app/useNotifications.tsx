import { v4 as uuidv4 } from "uuid";
import {
  FC,
  createContext,
  useMemo,
  useContext,
  useState,
  useCallback,
  useEffect,
} from "react";
import { NotificationType } from "../components/Notifications";
import { NotificationTypeBanner } from "../components/Notifications/NotificationTypeBanner";

type NotificationWithId = { id: string; text: string; type: NotificationType };

type NotificationContextT = {
  notify: (type: NotificationType, text: string) => void;
};

const NotificationContext = createContext<NotificationContextT>({
  notify: () => {},
});

const NOTIFICATION_DURATION_MS = 5000;
const NOTIFICATION_DELAY_MS = 500;

export const NotificationsProvider: FC<React.PropsWithChildren> = ({
  children,
}) => {
  const [notifications, setNotifications] = useState<NotificationWithId[]>([]);

  const removeNotification = useCallback(
    (id: string) => {
      const clearedNotifications = notifications.filter((n) => n.id !== id);
      setNotifications(clearedNotifications);
    },
    [notifications]
  );

  useEffect(() => {
    const lastNotificationElement = notifications[notifications.length - 1];

    const timeout = setTimeout(() => {
      if (lastNotificationElement) {
        removeNotification(lastNotificationElement.id);
      }
    }, NOTIFICATION_DURATION_MS);

    return () => {
      clearTimeout(timeout);
    };
  }, [notifications]);

  const value = useMemo(() => {
    const notify = (type: NotificationType, text: string) => {
      const id = uuidv4();
      const notification = { id, type, text };
      setTimeout(() => {
        setNotifications([notification, ...notifications]);
      }, NOTIFICATION_DELAY_MS);
    };

    return {
      notify,
      notifications,
    };
  }, [notifications, removeNotification]);

  return (
    <NotificationContext.Provider value={value}>
      <div className="fixed bottom-0 left-0 right-0 z-150 w-full">
        {notifications.map((n) => (
          <NotificationTypeBanner
            key={n.id}
            type={n.type}
            text={n.text}
            onClose={() => removeNotification(n.id)}
          />
        ))}
      </div>
      {children}
    </NotificationContext.Provider>
  );
};

export const useNotifications = () => useContext(NotificationContext);
