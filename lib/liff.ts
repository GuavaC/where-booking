import liff from '@line/liff';

export interface LiffUser {
  userId: string;
  displayName: string;
  pictureUrl?: string;
  isDemo?: boolean;
}

export async function initLiff(): Promise<LiffUser> {
  const liffId = process.env.NEXT_PUBLIC_LIFF_ID;

  // 若尚未設定 LIFF ID（本機開發階段），自動降級為測試帳號
  if (!liffId) {
    console.info('ℹ️ 未設定 NEXT_PUBLIC_LIFF_ID，啟用本機測試模式 (demo-user)');
    return {
      userId: 'demo-user-001',
      displayName: '測試客人 (王小明)',
      isDemo: true,
    };
  }

  try {
    await liff.init({ liffId });

    // 若在外部瀏覽器開啟且未登入，導向 LINE Login
    if (!liff.isLoggedIn()) {
      // 原本可能長這樣：
	  // liff.login();

	  // 改成這樣（登入完成後自動跳回原本所在的頁面，例如 /register 或 /store/xxx）：
	  liff.login({ redirectUri: window.location.href });
      return {
        userId: 'loading',
        displayName: '登入跳轉中...',
      };
    }

    const profile = await liff.getProfile();
    return {
      userId: profile.userId,
      displayName: profile.displayName,
      pictureUrl: profile.pictureUrl,
      isDemo: false,
    };
  } catch (error) {
    console.error('❌ LIFF 初始化失敗，降級為測試帳號:', error);
    return {
      userId: 'demo-user-001',
      displayName: '測試客人 (王小明)',
      isDemo: true,
    };
  }
}