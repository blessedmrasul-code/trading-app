import { App } from '@capacitor/app';
import { Browser } from '@capacitor/browser';
import { LocalNotifications } from '@capacitor/local-notifications';
import { Capacitor } from '@capacitor/core';

// Native plugins used by ARVEX email-confirmation and password-recovery callbacks.
window.ARVEX_CAP_APP = App;
window.ARVEX_CAP_BROWSER = Browser;
window.ARVEX_CAP_LOCAL_NOTIFICATIONS = LocalNotifications;
window.ARVEX_CAP_IS_NATIVE = () => Capacitor.isNativePlatform();
