package app.domora.mobile;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "LaunchScreen")
public class LaunchScreenPlugin extends Plugin {

    @PluginMethod
    public void hide(PluginCall call) {
        MainActivity.releaseLaunchScreen();
        call.resolve(new JSObject());
    }
}
