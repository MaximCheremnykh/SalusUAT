import { ENV } from './env';

export const urls = {
  home: () => `${ENV.HOME}/lightning/page/home`,

  vfSessionBridge: () => {
    const target = `${ENV.SETUP}/lightning/setup/CustomMetadata/page?address=%2Fm0Scp000002nh4J`;
    const encTarget = encodeURIComponent(target);
    return `${ENV.LOGIN}/?ec=301&startURL=%2Fvisualforce%2Fsession%3Furl=${encodeURIComponent(encTarget)}`;
  },

  manageUser: () => {
    const address = encodeURIComponent(`/${ENV.QAIS_ID}?noredirect=1&isUserEntityOverride=1&retURL=%2Fsetup%2Fhome`);
    return `${ENV.SETUP}/lightning/setup/ManageUsers/page?address=${address}`;
  },
};
