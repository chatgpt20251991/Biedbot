function New-BiedBotShortcut([string]$Path, [string]$Target, [string]$Arguments, [string]$WorkingDirectory, [string]$Icon) {
    # WScript.Shell.Save uses the ANSI shell-link path on some Windows hosts.
    # IShellLinkW and IPersistFile keep the complete user path in Unicode.
    if (-not ('BiedBotWindowsShortcut' -as [type])) {
        Add-Type -TypeDefinition @'
using System;
using System.Text;
using System.Runtime.InteropServices;
using System.Runtime.InteropServices.ComTypes;
public static class BiedBotWindowsShortcut {
  [ComImport, Guid("00021401-0000-0000-C000-000000000046")] private class ShellLink {}
  [ComImport, InterfaceType(ComInterfaceType.InterfaceIsIUnknown), Guid("000214F9-0000-0000-C000-000000000046")]
  private interface IShellLinkW {
    void GetPath([Out, MarshalAs(UnmanagedType.LPWStr)] StringBuilder path, int max, IntPtr data, uint flags);
    void GetIDList(out IntPtr id); void SetIDList(IntPtr id);
    void GetDescription([Out, MarshalAs(UnmanagedType.LPWStr)] StringBuilder value, int max);
    void SetDescription([MarshalAs(UnmanagedType.LPWStr)] string value);
    void GetWorkingDirectory([Out, MarshalAs(UnmanagedType.LPWStr)] StringBuilder value, int max);
    void SetWorkingDirectory([MarshalAs(UnmanagedType.LPWStr)] string value);
    void GetArguments([Out, MarshalAs(UnmanagedType.LPWStr)] StringBuilder value, int max);
    void SetArguments([MarshalAs(UnmanagedType.LPWStr)] string value);
    void GetHotkey(out short value); void SetHotkey(short value);
    void GetShowCmd(out int value); void SetShowCmd(int value);
    void GetIconLocation([Out, MarshalAs(UnmanagedType.LPWStr)] StringBuilder value, int max, out int index);
    void SetIconLocation([MarshalAs(UnmanagedType.LPWStr)] string value, int index);
    void SetRelativePath([MarshalAs(UnmanagedType.LPWStr)] string value, uint reserved);
    void Resolve(IntPtr window, uint flags);
    void SetPath([MarshalAs(UnmanagedType.LPWStr)] string value);
  }
  public static void Create(string path, string target, string arguments, string directory, string icon) {
    var link=(IShellLinkW)new ShellLink();
    try {
      link.SetPath(target); link.SetArguments(arguments); link.SetWorkingDirectory(directory);
      link.SetDescription("BiedBot Edge - lokale demo, geen live Marktplaats-verzending");
      link.SetShowCmd(7);
      if(!String.IsNullOrEmpty(icon)) link.SetIconLocation(icon,0);
      ((IPersistFile)link).Save(path,true);
    } finally { Marshal.FinalReleaseComObject(link); }
  }
}
'@
    }
    [BiedBotWindowsShortcut]::Create($Path, $Target, $Arguments, $WorkingDirectory, $Icon)
}
