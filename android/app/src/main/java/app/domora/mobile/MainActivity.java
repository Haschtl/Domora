package app.domora.mobile;

import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import androidx.core.splashscreen.SplashScreen;
import com.getcapacitor.BridgeActivity;
import java.util.concurrent.atomic.AtomicBoolean;

public class MainActivity extends BridgeActivity {

    private static final long MAX_LAUNCH_SCREEN_MS = 6000L;
    private static final AtomicBoolean keepLaunchScreenVisible = new AtomicBoolean(true);

    static void releaseLaunchScreen() {
        keepLaunchScreenVisible.set(false);
    }

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        SplashScreen splashScreen = SplashScreen.installSplashScreen(this);
        splashScreen.setKeepOnScreenCondition(keepLaunchScreenVisible::get);
        new Handler(Looper.getMainLooper()).postDelayed(MainActivity::releaseLaunchScreen, MAX_LAUNCH_SCREEN_MS);
        registerPlugin(LaunchScreenPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
