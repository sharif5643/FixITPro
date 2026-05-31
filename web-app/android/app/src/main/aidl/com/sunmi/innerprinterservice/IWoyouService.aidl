package com.sunmi.innerprinterservice;

import com.sunmi.innerprinterservice.ICallback;

interface IWoyouService {
    void printerInit(in ICallback callback);
    void printerSelfChecking(in ICallback callback);
    String getPrinterSerialNo();
    String getPrinterVersion();
    String getServiceVersion();
    void printText(String text, in ICallback callback);
    void printTextWithFont(String text, String typeface, float fontsize, in ICallback callback);
    void printColumnsText(in String[] colsTextArr, in int[] colsWidthArr, in int[] colsAlign, in ICallback callback);
    void printBitmap(in byte[] bitmap, in ICallback callback);
    void printBarCode(String data, int symbology, int height, int width, int textposition, in ICallback callback);
    void printQRCode(String data, int modulesize, int errorlevel, in ICallback callback);
    void printRawData(in byte[] rawPrintData, in ICallback callback);
    void sendRAWData(in byte[] rawdata, in ICallback callback);
    void setAlignment(int alignment, in ICallback callback);
    void setFontName(String typeface, in ICallback callback);
    void setFontSize(float fontsize, in ICallback callback);
    void printBitmapCustom(in byte[] bitmap, int type, in ICallback callback);
    void lineWrap(int n, in ICallback callback);
    void feedPaper(in ICallback callback);
    void cutPaper(in ICallback callback);
    int updatePaper(int paperState);
    void hasPrinter(in ICallback callback);
    void printerPaper(in ICallback callback);
}
