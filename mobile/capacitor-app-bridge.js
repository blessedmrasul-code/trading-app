import { App } from '@capacitor/app';
import { Browser } from '@capacitor/browser';
import { Capacitor } from '@capacitor/core';

// Native plugins used by the ARVEX cloud-account OAuth flow.
window.ARVEX_CAP_APP = App;
window.ARVEX_CAP_BROWSER = Browser;
window.ARVEX_CAP_IS_NATIVE = () => Capacitor.isNativePlatform();
