package com.fixitpro.pos;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;
import com.fixitpro.pos.plugins.SunmiPrinterPlugin;
import com.fixitpro.pos.plugins.BarcodeScannerPlugin;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Register native plugins before bridge initialises
        registerPlugin(SunmiPrinterPlugin.class);
        registerPlugin(BarcodeScannerPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
